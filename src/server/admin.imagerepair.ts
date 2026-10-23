import { Hono } from "hono";
import { z } from "zod";
import { createHash, randomUUID } from "crypto";
import { pool } from "./db";
import { firstError } from "./admin.util";
import { bucketHost, bucketNameFromEnv, checkStorage, objectExists, storageConfigured } from "./storage";
import { isStoredBucketUrl, recoverKey, redactUrl } from "./imageKeys";

// Admin tool: finds image links saved as full bucket or signed URLs and rewrites them to the stable
// /media/<key> form the site serves. Preview changes nothing. Apply backs up every row first. Undo restores.
export const imageRepair = new Hono();

type Source = { name: string; table: string; pk: string; column: string; where?: string };

// Every place the database stores an image link. Names here are fixed in code, never taken from a request.
const SOURCES: Source[] = [
  { name: "films.poster_url", table: "films", pk: "id", column: "poster_url" },
  { name: "films.hero_url", table: "films", pk: "id", column: "hero_url" },
  { name: "films.title_image_url", table: "films", pk: "id", column: "title_image_url" },
  { name: "platforms.logo_url", table: "platforms", pk: "id", column: "logo_url" },
  { name: "people.photo_url", table: "people", pk: "id", column: "photo_url" },
  { name: "site_settings.logo_url", table: "site_settings", pk: "key", column: "value", where: "key = 'logo_url'" },
  { name: "site_settings.about_image_url", table: "site_settings", pk: "key", column: "value", where: "key = 'about_image_url'" },
];

type Candidate = { source: string; id: string; before: string; key: string; after: string };
type Unparseable = { source: string; id: string; shown: string };

type Scan = {
  checked: number;
  externalLeftAlone: number;
  repairable: Candidate[];
  unparseable: Unparseable[];
  perSource: { source: string; checked: number; repairable: number; unparseable: number }[];
};

async function scan(): Promise<Scan> {
  const host = bucketHost();
  const bucket = bucketNameFromEnv();
  const out: Scan = { checked: 0, externalLeftAlone: 0, repairable: [], unparseable: [], perSource: [] };
  for (const s of SOURCES) {
    const { rows } = await pool.query(
      `SELECT ${s.pk}::text AS id, ${s.column} AS value FROM ${s.table}
       WHERE ${s.column} IS NOT NULL AND ${s.column} <> ''${s.where ? ` AND ${s.where}` : ""} ORDER BY ${s.pk}`
    );
    const line = { source: s.name, checked: rows.length, repairable: 0, unparseable: 0 };
    for (const r of rows as { id: string; value: string }[]) {
      if (!isStoredBucketUrl(r.value, host)) {
        if (/^https?:\/\//.test(r.value)) out.externalLeftAlone++;
        continue;
      }
      const key = recoverKey(r.value, bucket);
      if (key) {
        out.repairable.push({ source: s.name, id: r.id, before: r.value, key, after: `/media/${key}` });
        line.repairable++;
      } else {
        out.unparseable.push({ source: s.name, id: r.id, shown: redactUrl(r.value) });
        line.unparseable++;
      }
    }
    out.checked += rows.length;
    out.perSource.push(line);
  }
  return out;
}

// Identifies exactly what a preview showed. Apply refuses to run if the data changed since.
const fingerprintOf = (list: Candidate[]) =>
  createHash("sha256").update(JSON.stringify(list.map((c) => [c.source, c.id, c.before]))).digest("hex").slice(0, 16);

const who = (c: any) => c.get("admin")?.email ?? "admin";

imageRepair.get("/status", async (c) => {
  const { rows } = await pool.query(
    `SELECT run_id, count(*)::int AS rows, max(created_at) AS at
     FROM image_link_repairs WHERE undone_at IS NULL GROUP BY run_id ORDER BY max(created_at) DESC LIMIT 1`
  );
  return c.json({ lastRepair: rows[0] ? { rows: rows[0].rows, at: rows[0].at } : null });
});

imageRepair.post("/preview", async (c) => {
  const s = await scan();

  // Check which recovered files really are in the bucket, but only if the bucket itself is working.
  const toCheck = s.repairable.slice(0, 200);
  const exists = new Map<string, "yes" | "no" | "unknown">();
  let storageNote = "";
  if (!storageConfigured) storageNote = "Image storage is not set up, so the files could not be looked up.";
  else if (toCheck.length) {
    const health = await checkStorage();
    if (!health.ok) storageNote = `The bucket is not working right now, so the files could not be looked up. ${health.summary}`;
    else {
      for (let i = 0; i < toCheck.length; i += 5) {
        await Promise.all(toCheck.slice(i, i + 5).map(async (r) => exists.set(r.key, await objectExists(r.key))));
      }
    }
  }
  const count = (v: string) => toCheck.filter((r) => (exists.get(r.key) ?? "unknown") === v).length;

  console.log(`Image repair preview by ${who(c)}: ${s.repairable.length} repairable, ${s.unparseable.length} unparseable.`);
  return c.json({
    checked: s.checked,
    externalLeftAlone: s.externalLeftAlone,
    repairable: s.repairable.length,
    perSource: s.perSource,
    // Links are shown without their query string, which holds the signature and access key ID.
    samples: s.repairable.slice(0, 10).map((r) => ({
      source: r.source,
      id: r.id,
      before: redactUrl(r.before),
      after: r.after,
      inBucket: exists.get(r.key) ?? "unknown",
    })),
    unparseable: s.unparseable,
    inBucket: { found: count("yes"), missing: count("no"), unknown: s.repairable.length - count("yes") - count("no"), checkedCount: toCheck.length },
    storageNote,
    fingerprint: fingerprintOf(s.repairable),
  });
});

imageRepair.post("/apply", async (c) => {
  const parsed = z.object({ fingerprint: z.string().min(8) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);

  const s = await scan();
  if (fingerprintOf(s.repairable) !== parsed.data.fingerprint) {
    return c.json({ error: "The saved links changed since the preview. Run the preview again, then apply." }, 409);
  }
  if (!s.repairable.length) return c.json({ repaired: 0, skippedChanged: 0, runId: null });

  const runId = randomUUID();
  let repaired = 0;
  let skippedChanged = 0;
  // Small batches, each in its own transaction. A row is only changed if it still holds the value that
  // was previewed, so running twice, or editing a row meanwhile, can never overwrite anything else.
  for (let i = 0; i < s.repairable.length; i += 50) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of s.repairable.slice(i, i + 50)) {
        const src = SOURCES.find((x) => x.name === r.source)!;
        const upd = await client.query(`UPDATE ${src.table} SET ${src.column} = $1 WHERE ${src.pk}::text = $2 AND ${src.column} = $3`, [r.after, r.id, r.before]);
        if (upd.rowCount) {
          await client.query(
            "INSERT INTO image_link_repairs (run_id, source, row_id, original_value, new_value) VALUES ($1,$2,$3,$4,$5)",
            [runId, r.source, r.id, r.before, r.after]
          );
          repaired++;
        } else skippedChanged++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(`Image repair applied by ${who(c)}: ${repaired} link(s) repaired, run ${runId}.`);
  return c.json({ repaired, skippedChanged, runId });
});

imageRepair.post("/undo", async (c) => {
  const last = await pool.query(
    "SELECT run_id FROM image_link_repairs WHERE undone_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1"
  );
  if (!last.rows[0]) return c.json({ error: "There is no repair to undo." }, 404);
  const runId = last.rows[0].run_id;
  const { rows } = await pool.query("SELECT id, source, row_id, original_value, new_value FROM image_link_repairs WHERE run_id = $1 AND undone_at IS NULL ORDER BY id", [runId]);

  let restored = 0;
  let skippedChanged = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of rows.slice(i, i + 50)) {
        const src = SOURCES.find((x) => x.name === r.source);
        if (!src) {
          skippedChanged++;
          continue;
        }
        // Only put the original back if the row still holds what the repair wrote, so later edits are kept.
        const upd = await client.query(`UPDATE ${src.table} SET ${src.column} = $1 WHERE ${src.pk}::text = $2 AND ${src.column} = $3`, [r.original_value, r.row_id, r.new_value]);
        if (upd.rowCount) restored++;
        else skippedChanged++;
        await client.query("UPDATE image_link_repairs SET undone_at = now() WHERE id = $1", [r.id]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(`Image repair undone by ${who(c)}: ${restored} link(s) restored, run ${runId}.`);
  return c.json({ restored, skippedChanged });
});
