import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { firstError, isUniqueViolation } from "./admin.util";
import { youtubeId } from "./youtube";

export const films = new Hono();

// Empty text boxes arrive as "" and are saved as nothing (NULL).
const optText = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().nullable());
const optInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.number().int().min(min).max(max).nullable());
const imageUrl = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .trim()
    .refine((s) => s.startsWith("/media/") || /^https?:\/\//.test(s), "Must be an uploaded image or a web link")
    .nullable()
);

const filmSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Address (slug) is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Address can only use lowercase letters, numbers and dashes"),
  title: z.string().trim().min(1, "Title is required"),
  year: optInt(1888, 2200),
  runtime_minutes: optInt(1, 1000),
  genres: z.array(z.string().trim().min(1)).default([]),
  director: optText,
  synopsis: optText,
  poster_url: imageUrl,
  hero_url: imageUrl,
  title_image_url: imageUrl,
  trailer_url: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z
      .string()
      .trim()
      .refine((s) => youtubeId(s) !== null, "Trailer must be a YouTube link")
      .nullable()
  ),
  imdb_id: optText,
  status: z.enum(["draft", "released", "coming_soon"]),
  is_featured: z.boolean().default(false),
  links: z
    .array(
      z.object({
        platform_id: z.number().int(),
        url: z.string().trim().regex(/^https?:\/\/\S+$/, "Watch links must start with http:// or https://"),
      })
    )
    .default([])
    .refine((l) => new Set(l.map((x) => x.platform_id)).size === l.length, "Each platform can only be listed once"),
});

const SELECT = `
  SELECT f.*,
    COALESCE(json_agg(json_build_object('id', l.id, 'platform_id', l.platform_id, 'url', l.url, 'platform_name', p.name)
      ORDER BY p.sort_order) FILTER (WHERE l.id IS NOT NULL), '[]') AS links
  FROM films f
  LEFT JOIN film_links l ON l.film_id = f.id
  LEFT JOIN platforms p ON p.id = l.platform_id`;

films.get("/", async (c) => {
  const { rows } = await pool.query(`${SELECT} GROUP BY f.id ORDER BY f.sort_order, f.id`);
  return c.json(rows);
});

// Must be registered before "/:id"
films.put("/reorder", async (c) => {
  const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < parsed.data.ids.length; i++) {
      await client.query("UPDATE films SET sort_order = $1 WHERE id = $2", [i, parsed.data.ids[i]]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return c.json({ ok: true });
});

// Switch several films live (released) or back to draft. Must be registered before "/:id".
// "Live" only changes drafts, so films marked coming soon keep that status.
films.put("/bulk-status", async (c) => {
  const parsed = z
    .object({ ids: z.array(z.number().int()).min(1, "Pick at least one film."), live: z.boolean() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const { ids, live } = parsed.data;
  const r = live
    ? await pool.query("UPDATE films SET status = 'released', updated_at = now() WHERE id = ANY($1) AND status = 'draft'", [ids])
    : await pool.query("UPDATE films SET status = 'draft', updated_at = now() WHERE id = ANY($1) AND status <> 'draft'", [ids]);
  return c.json({ changed: r.rowCount });
});

films.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  const { rows } = await pool.query(`${SELECT} WHERE f.id = $1 GROUP BY f.id`, [id]);
  if (!rows[0]) return c.json({ error: "Film not found" }, 404);
  return c.json(rows[0]);
});

async function save(id: number | null, d: z.infer<typeof filmSchema>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const values = [
      d.slug, d.title, d.year, d.runtime_minutes, d.genres, d.director, d.synopsis,
      d.poster_url, d.hero_url, d.title_image_url, d.trailer_url, d.imdb_id, d.status, d.is_featured,
    ];
    let filmId: number;
    if (id === null) {
      const r = await client.query(
        `INSERT INTO films (slug, title, year, runtime_minutes, genres, director, synopsis, poster_url, hero_url,
           title_image_url, trailer_url, imdb_id, status, is_featured, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
           (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM films))
         RETURNING id`,
        values
      );
      filmId = r.rows[0].id;
    } else {
      const r = await client.query(
        `UPDATE films SET slug=$1, title=$2, year=$3, runtime_minutes=$4, genres=$5, director=$6, synopsis=$7,
           poster_url=$8, hero_url=$9, title_image_url=$10, trailer_url=$11, imdb_id=$12, status=$13,
           is_featured=$14, updated_at=now()
         WHERE id=$15 RETURNING id`,
        [...values, id]
      );
      if (!r.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      filmId = r.rows[0].id;
      await client.query("DELETE FROM film_links WHERE film_id = $1", [filmId]);
    }
    if (d.is_featured) await client.query("UPDATE films SET is_featured = false WHERE id <> $1", [filmId]);
    for (const l of d.links) {
      await client.query("INSERT INTO film_links (film_id, platform_id, url) VALUES ($1,$2,$3)", [filmId, l.platform_id, l.url]);
    }
    await client.query("COMMIT");
    return filmId;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function handleSave(c: any, id: number | null) {
  const parsed = filmSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  try {
    const filmId = await save(id, parsed.data);
    if (filmId === null) return c.json({ error: "Film not found" }, 404);
    const { rows } = await pool.query(`${SELECT} WHERE f.id = $1 GROUP BY f.id`, [filmId]);
    return c.json(rows[0], id === null ? 201 : 200);
  } catch (e) {
    if (isUniqueViolation(e)) return c.json({ error: "Another film already uses that address (slug)." }, 409);
    if ((e as any)?.code === "23503") return c.json({ error: "One of the platforms no longer exists." }, 400);
    throw e;
  }
}

films.post("/", (c) => handleSave(c, null));
films.put("/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  return handleSave(c, id);
});

films.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  await pool.query("DELETE FROM films WHERE id = $1", [id]);
  return c.json({ ok: true });
});
