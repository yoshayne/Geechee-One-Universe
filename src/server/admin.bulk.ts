import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { safeGet } from "./safeFetch";
import { importFromUrl, ImportError } from "./import";
import { freeSlug, slugify } from "./film.util";
import { firstError } from "./admin.util";

// Import many films from one page, such as a Tubi person page that lists everything they worked on.
export const bulk = new Hono();

const CANT_READ = "Could not read that page. You can add films one at a time with the Import box on the Add Film form.";

type ListItem = { url: string; title: string; year: number | null; image: string | null };

// Pages like these describe their list of films in a standard machine-readable block (schema.org "ItemList").
function readItemList(html: string, base: string): { movies: ListItem[]; others: number } {
  const movies: ListItem[] = [];
  let others = 0;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: any;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes: any[] = [];
    for (const top of Array.isArray(data) ? data : [data]) {
      nodes.push(top);
      if (top && Array.isArray(top["@graph"])) nodes.push(...top["@graph"]);
    }
    for (const list of nodes.filter((n) => n && n["@type"] === "ItemList")) {
      for (const el of list.itemListElement || []) {
        const item = el?.item ?? el;
        if (!item || typeof item.url !== "string" || typeof item.name !== "string") continue;
        if (item["@type"] !== "Movie") {
          others++;
          continue;
        }
        let url: string;
        try {
          url = new URL(item.url, base).toString();
        } catch {
          continue;
        }
        if (!/^https?:\/\//.test(url) || movies.some((x) => x.url === url)) continue;
        const when = item.dateCreated || item.startDate || item.datePublished;
        const year = when ? Number(String(when).slice(0, 4)) : NaN;
        const img = typeof item.image === "string" ? item.image : item.image?.url;
        movies.push({
          url,
          title: item.name.trim(),
          year: year >= 1888 && year <= 2200 ? year : null,
          image: typeof img === "string" && /^https?:\/\//.test(img) ? img : null,
        });
      }
    }
  }
  return { movies, others };
}

bulk.post("/list", async (c) => {
  const parsed = z.object({ url: z.string().trim().min(1, "Paste a link first.") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);

  let page;
  try {
    // These list pages are big (the Tubi one is about 2 MB), so allow more than a single film page.
    page = await safeGet(parsed.data.url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 15000, accept: "text/html,application/xhtml+xml" });
  } catch {
    return c.json({ error: CANT_READ }, 422);
  }
  if (page.status < 200 || page.status >= 300) return c.json({ error: CANT_READ }, 422);

  const { movies, others } = readItemList(page.body.toString("utf8"), page.finalUrl);
  if (!movies.length) {
    return c.json({ error: "No films were found on that page. Try a person or collection page, or add films one at a time." }, 422);
  }
  const { rows } = await pool.query(
    `SELECT lower(f.title) AS title, l.url FROM films f LEFT JOIN film_links l ON l.film_id = f.id`
  );
  const titles = new Set(rows.map((r) => r.title));
  const urls = new Set(rows.map((r) => r.url).filter(Boolean));
  return c.json({
    movies: movies.map((m) => ({ ...m, already_added: titles.has(m.title.toLowerCase()) || urls.has(m.url) })),
    others,
  });
});

const missing = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

// Imports one film page. New films are saved as hidden drafts. Films already on the site only get
// their empty fields filled in, so nothing you edited is overwritten.
bulk.post("/film", async (c) => {
  const parsed = z.object({ url: z.string().trim().url().max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "That does not look like a web link." }, 400);
  const url = parsed.data.url;

  let f;
  try {
    f = await importFromUrl(url);
  } catch (e) {
    if (e instanceof ImportError) return c.json({ error: e.message }, 422);
    console.error("Bulk page import failed:", e);
    return c.json({ error: "Could not read that page." }, 422);
  }
  if (!f.title) return c.json({ error: "No title was found on that page." }, 422);

  const existing = await pool.query(
    `SELECT * FROM films WHERE lower(title) = lower($1) OR id IN (SELECT film_id FROM film_links WHERE url = $2) LIMIT 1`,
    [f.title, url]
  );
  const row = existing.rows[0];

  if (row) {
    const want: Record<string, unknown> = {
      year: f.year, runtime_minutes: f.runtime_minutes, director: f.director, synopsis: f.synopsis,
      poster_url: f.poster_url, hero_url: f.hero_url, content_rating: f.content_rating,
      genres: f.genres, cast_names: f.cast_names,
    };
    // Column names come from the fixed list above, never from the visitor.
    const patch = Object.entries(want).filter(([k, v]) => !missing(v) && missing(row[k]));
    let changed = false;
    if (patch.length) {
      await pool.query(
        `UPDATE films SET ${patch.map(([k], i) => `${k} = $${i + 1}`).join(", ")}, updated_at = now() WHERE id = $${patch.length + 1}`,
        [...patch.map(([, v]) => v), row.id]
      );
      changed = true;
    }
    for (const l of f.links) {
      const r = await pool.query("INSERT INTO film_links (film_id, platform_id, url) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [row.id, l.platform_id, l.url]);
      if (r.rowCount) changed = true;
    }
    return c.json({ status: changed ? "updated" : "skipped", title: row.title, warnings: f.warnings });
  }

  const ins = await pool.query(
    `INSERT INTO films (slug, title, year, runtime_minutes, genres, director, cast_names, content_rating, synopsis,
       poster_url, hero_url, status, is_featured, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',false,(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM films))
     RETURNING id`,
    [await freeSlug(slugify(f.title)), f.title, f.year ?? null, f.runtime_minutes ?? null, f.genres ?? [], f.director ?? null,
     f.cast_names ?? [], f.content_rating ?? null, f.synopsis ?? null, f.poster_url ?? null, f.hero_url ?? null]
  );
  for (const l of f.links) {
    await pool.query("INSERT INTO film_links (film_id, platform_id, url) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ins.rows[0].id, l.platform_id, l.url]);
  }
  return c.json({ status: "added", title: f.title, warnings: f.warnings });
});
