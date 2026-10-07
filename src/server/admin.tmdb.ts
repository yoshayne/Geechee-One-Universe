import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { tmdb, importFromTmdbId, ImportError } from "./import";
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
  const skipped: string[] = [];
  const warnings: string[] = [];
  for (const tmdbId of parsed.data.ids) {
    try {
      const f = await importFromTmdbId(tmdbId);
      if (!f.title) continue;
      if (f.imdb_id) {
        const dup = await pool.query("SELECT 1 FROM films WHERE imdb_id = $1", [f.imdb_id]);
        if (dup.rowCount) {
          skipped.push(f.title);
          continue;
        }
      }
      const slug = await freeSlug(slugify(f.title));
      await pool.query(
        `INSERT INTO films (slug, title, year, runtime_minutes, genres, director, synopsis, poster_url, hero_url,
           trailer_url, imdb_id, status, is_featured, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',false,
           (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM films))`,
        [slug, f.title, f.year ?? null, f.runtime_minutes ?? null, f.genres ?? [], f.director ?? null,
         f.synopsis ?? null, f.poster_url ?? null, f.hero_url ?? null, f.trailer_url ?? null, f.imdb_id ?? null]
      );
      added.push(f.title);
      for (const w of f.warnings) if (!warnings.includes(w)) warnings.push(w);
    } catch (e) {
      if (e instanceof ImportError) return c.json({ error: e.message }, 422);
      console.error("Bulk import failed for", tmdbId, e);
      warnings.push(`One film (TMDB ${tmdbId}) could not be loaded.`);
    }
  }
  return c.json({ added, skipped, warnings });
});
