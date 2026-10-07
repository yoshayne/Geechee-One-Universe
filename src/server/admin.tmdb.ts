import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { tmdb, importFromTmdbId, tmdbArtwork, ImportError } from "./import";
import { firstError } from "./admin.util";

// Bulk import of every film a production company has on TMDB. Everything lands as a draft.
export const tmdbRoutes = new Hono();

function fail(c: any, e: unknown) {
  if (e instanceof ImportError) return c.json({ error: e.message }, 422);
  console.error("TMDB request failed:", e);
  return c.json({ error: "Could not reach TMDB. Try again in a moment." }, 502);
}

tmdbRoutes.get("/companies", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (!q) return c.json({ error: "Type a company name first." }, 400);
  try {
    const r = await tmdb("/search/company", { query: q });
    return c.json(
      (r.results || []).slice(0, 20).map((x: any) => ({ id: x.id, name: x.name, country: x.origin_country || "" }))
    );
  } catch (e) {
    return fail(c, e);
  }
});

tmdbRoutes.get("/companies/:id/movies", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  try {
    const movies: any[] = [];
    let page = 1;
    let total = 1;
    do {
      const r = await tmdb("/discover/movie", {
        with_companies: String(id),
        sort_by: "primary_release_date.desc",
        include_adult: "false",
        page: String(page),
      });
      total = Math.min(r.total_pages || 1, 10);
      movies.push(...(r.results || []));
      page++;
    } while (page <= total);

    const { rows } = await pool.query("SELECT imdb_id, title FROM films");
    const have = new Set(rows.map((r) => String(r.title).toLowerCase()));
    return c.json(
      movies.map((m) => ({
        tmdb_id: m.id,
        title: m.title,
        year: m.release_date ? Number(String(m.release_date).slice(0, 4)) || null : null,
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
        already_added: have.has(String(m.title).toLowerCase()),
      }))
    );
  } catch (e) {
    return fail(c, e);
  }
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "film";

async function freeSlug(base: string) {
  let slug = base;
  for (let n = 2; ; n++) {
    const { rowCount } = await pool.query("SELECT 1 FROM films WHERE slug = $1", [slug]);
    if (!rowCount) return slug;
    slug = `${base}-${n}`;
  }
}

tmdbRoutes.post("/import", async (c) => {
  const parsed = z
    .object({ ids: z.array(z.number().int()).min(1, "Pick at least one film.").max(50) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);

  const added: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const note = (list: string[]) => {
    for (const w of list) if (!warnings.includes(w)) warnings.push(w);
  };
  for (const tmdbId of parsed.data.ids) {
    try {
      // Details first, without images, so we know whether the film is already on the site.
      const f = await importFromTmdbId(tmdbId, undefined, { images: false });
      if (!f.title) continue;
      const existing = await pool.query(
        `SELECT id, poster_url, hero_url, trailer_url FROM films
         WHERE (imdb_id IS NOT NULL AND imdb_id = $1) OR lower(title) = lower($2) LIMIT 1`,
        [f.imdb_id ?? null, f.title]
      );
      const row = existing.rows[0];
      if (row) {
        // Already on the site: only fill in what is missing, never overwrite edits or direct links.
        const have = await pool.query("SELECT platform_id FROM film_links WHERE film_id = $1", [row.id]);
        const haveIds = new Set(have.rows.map((r) => r.platform_id));
        const newLinks = f.links.filter((l) => !haveIds.has(l.platform_id));
        const needsArt = !(row.poster_url && row.hero_url);
        if (!needsArt && !newLinks.length) {
          skipped.push(f.title);
          continue;
        }
        const art = needsArt ? await tmdbArtwork(tmdbId) : { poster_url: undefined, hero_url: undefined, warnings: [] as string[] };
        await pool.query(
          `UPDATE films SET poster_url = COALESCE(poster_url, $1), hero_url = COALESCE(hero_url, $2),
             trailer_url = COALESCE(trailer_url, $3), updated_at = now() WHERE id = $4`,
          [art.poster_url ?? null, art.hero_url ?? null, f.trailer_url ?? null, row.id]
        );
        for (const l of newLinks) {
          await pool.query("INSERT INTO film_links (film_id, platform_id, url) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [row.id, l.platform_id, l.url]);
        }
        updated.push(f.title);
        note(art.warnings);
        continue;
      }
      const art = await tmdbArtwork(tmdbId);
      const slug = await freeSlug(slugify(f.title));
      const ins = await pool.query(
        `INSERT INTO films (slug, title, year, runtime_minutes, genres, director, synopsis, poster_url, hero_url,
           trailer_url, imdb_id, status, is_featured, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',false,
           (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM films)) RETURNING id`,
        [slug, f.title, f.year ?? null, f.runtime_minutes ?? null, f.genres ?? [], f.director ?? null,
         f.synopsis ?? null, art.poster_url ?? null, art.hero_url ?? null, f.trailer_url ?? null, f.imdb_id ?? null]
      );
      for (const l of f.links) {
        await pool.query("INSERT INTO film_links (film_id, platform_id, url) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ins.rows[0].id, l.platform_id, l.url]);
      }
      added.push(f.title);
      note(art.warnings);
    } catch (e) {
      if (e instanceof ImportError) return c.json({ error: e.message }, 422);
      console.error("Bulk import failed for", tmdbId, e);
      warnings.push(`One film (TMDB ${tmdbId}) could not be loaded.`);
    }
  }
  return c.json({ added, updated, skipped, warnings });
});
