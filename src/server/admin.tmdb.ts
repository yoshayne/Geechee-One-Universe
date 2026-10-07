import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { tmdb, importFromTmdbId, tmdbArtwork, copyImage, ImportError } from "./import";
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

async function companyMovies(id: number): Promise<any[]> {
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
  return movies;
}

tmdbRoutes.get("/companies/:id/movies", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  try {
    const movies = await companyMovies(id);

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

// ---- Team: people credited on the company's films ----

const KEY_JOBS: Record<string, string> = {
  Director: "Director",
  Writer: "Writer",
  Screenplay: "Writer",
  Story: "Writer",
  Producer: "Producer",
  "Executive Producer": "Executive Producer",
  "Director of Photography": "Director of Photography",
  Editor: "Editor",
};

tmdbRoutes.get("/companies/:id/people", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  try {
    const movies = (await companyMovies(id)).slice(0, 60);
    const found = new Map<number, { name: string; roles: Set<string>; films: Set<number>; photo: string | null }>();
    const add = (p: any, role: string, movieId: number) => {
      if (!p.id || !p.name) return;
      const e = found.get(p.id) || { name: p.name, roles: new Set<string>(), films: new Set<number>(), photo: null };
      e.roles.add(role);
      e.films.add(movieId);
      if (!e.photo && p.profile_path) e.photo = `https://image.tmdb.org/t/p/w185${p.profile_path}`;
      found.set(p.id, e);
    };
    for (let i = 0; i < movies.length; i += 5) {
      await Promise.all(
        movies.slice(i, i + 5).map(async (m) => {
          const cr = await tmdb(`/movie/${m.id}/credits`);
          for (const p of cr.crew || []) if (KEY_JOBS[p.job]) add(p, KEY_JOBS[p.job], m.id);
          for (const p of (cr.cast || []).filter((x: any) => x.order < 8)) add(p, "Actor", m.id);
        })
      );
    }
    const { rows } = await pool.query("SELECT tmdb_person_id FROM people WHERE tmdb_person_id IS NOT NULL");
    const have = new Set(rows.map((r) => r.tmdb_person_id));
    const list = [...found.entries()]
      .map(([tmdb_id, e]) => ({
        tmdb_id,
        name: e.name,
        roles: [...e.roles],
        films: e.films.size,
        photo: e.photo,
        already_added: have.has(tmdb_id),
      }))
      .sort((a, b) => b.films - a.films || a.name.localeCompare(b.name))
      .slice(0, 150);
    return c.json(list);
  } catch (e) {
    return fail(c, e);
  }
});

tmdbRoutes.post("/people/import", async (c) => {
  const parsed = z
    .object({
      people: z
        .array(z.object({ tmdb_id: z.number().int(), role: z.string().trim().max(200).optional() }))
        .min(1, "Pick at least one person.")
        .max(60),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);

  const added: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  for (const item of parsed.data.people) {
    try {
      const p = await tmdb(`/person/${item.tmdb_id}`);
      if (!p.name) continue;
      const exists = await pool.query("SELECT 1 FROM people WHERE tmdb_person_id = $1", [item.tmdb_id]);
      if (exists.rowCount) {
        skipped.push(p.name);
        continue;
      }
      let photoUrl: string | undefined;
      if (p.profile_path) {
        photoUrl = await copyImage(
          `https://image.tmdb.org/t/p/original${p.profile_path}`,
          warnings,
          `${p.name} photo`,
          `https://image.tmdb.org/t/p/w500${p.profile_path}`
        );
      }
      await pool.query(
        `INSERT INTO people (name, role, bio, photo_url, tmdb_person_id, imdb_id, is_visible, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,false,(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM people))`,
        [p.name, item.role || null, p.biography?.trim() || null, photoUrl ?? null, item.tmdb_id, p.imdb_id || null]
      );
      added.push(p.name);
    } catch (e) {
      if (e instanceof ImportError) return c.json({ error: e.message }, 422);
      console.error("People import failed for", item.tmdb_id, e);
      warnings.push(`One person (TMDB ${item.tmdb_id}) could not be loaded.`);
    }
  }
  return c.json({ added, skipped, warnings: [...new Set(warnings)] });
});

// Look up one person from a TMDB person page link (or just their ID) to prefill the team form.
const DEPARTMENT_TITLES: Record<string, string> = {
  Directing: "Director",
  Acting: "Actor",
  Production: "Producer",
  Writing: "Writer",
  Editing: "Editor",
  Camera: "Cinematographer",
};

tmdbRoutes.post("/person-lookup", async (c) => {
  const parsed = z.object({ url: z.string().trim().min(1, "Paste a TMDB person link first.") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const raw = parsed.data.url;
  let id: number | null = null;
  if (/^\d+$/.test(raw)) id = Number(raw);
  else {
    try {
      const u = new URL(raw);
      if (u.hostname === "themoviedb.org" || u.hostname.endsWith(".themoviedb.org")) {
        const m = u.pathname.match(/\/person\/(\d+)/);
        if (m) id = Number(m[1]);
      }
    } catch {
      /* not a link */
    }
  }
  if (!id) return c.json({ error: "Paste a TMDB person link, like https://www.themoviedb.org/person/123-name" }, 422);
  try {
    const p = await tmdb(`/person/${id}`);
    if (!p.name) return c.json({ error: "That person was not found on TMDB. You can enter the details by hand." }, 422);
    const warnings: string[] = [];
    const photo = p.profile_path
      ? await copyImage(
          `https://image.tmdb.org/t/p/original${p.profile_path}`,
          warnings,
          "photo",
          `https://image.tmdb.org/t/p/w500${p.profile_path}`
        )
      : undefined;
    return c.json({
      tmdb_person_id: id,
      name: p.name,
      role: DEPARTMENT_TITLES[p.known_for_department] || "",
      bio: p.biography?.trim() || "",
      photo_url: photo || "",
      imdb_id: p.imdb_id || "",
      warnings,
    });
  } catch (e) {
    if (e instanceof ImportError && /not accept/.test(e.message)) {
      return c.json({ error: "That person was not found on TMDB. You can enter the details by hand." }, 422);
    }
    return fail(c, e);
  }
});
