import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { rateLimit } from "./redis";
import { clientIp } from "./admin.util";

// Everything here is open to visitors. Drafts and private details never leave the server.
export const publicApi = new Hono();

// Public pages can be cached briefly. Set per handler so admin responses are never cached.
const cache = (c: { header: (n: string, v: string) => void }) => c.header("Cache-Control", "public, max-age=30");

const FILM_FIELDS = `f.id, f.slug, f.title, f.year, f.runtime_minutes, f.genres, f.director, f.synopsis,
  f.cast_names, f.content_rating, f.poster_url, f.hero_url, f.title_image_url, f.trailer_url, f.status, f.is_featured, f.sort_order`;

const SELECT_FILMS = `
  SELECT ${FILM_FIELDS},
    COALESCE(json_agg(json_build_object('platform_id', p.id, 'platform_name', p.name, 'logo_url', p.logo_url,
      'label', p.label, 'url', l.url) ORDER BY p.sort_order) FILTER (WHERE l.id IS NOT NULL), '[]') AS links
  FROM films f
  LEFT JOIN film_links l ON l.film_id = f.id
  LEFT JOIN platforms p ON p.id = l.platform_id
  WHERE f.status IN ('released', 'coming_soon')`;

publicApi.get("/films", async (c) => {
  const { rows } = await pool.query(`${SELECT_FILMS} GROUP BY f.id ORDER BY f.sort_order, f.id`);
  cache(c);
  return c.json(rows);
});

publicApi.get("/films/:slug", async (c) => {
  const { rows } = await pool.query(`${SELECT_FILMS} AND f.slug = $1 GROUP BY f.id`, [c.req.param("slug")]);
  if (!rows[0]) return c.json({ error: "Film not found" }, 404);
  cache(c);
  return c.json(rows[0]);
});

publicApi.get("/platforms", async (c) => {
  const { rows } = await pool.query("SELECT id, name, logo_url, label FROM platforms ORDER BY sort_order, id");
  cache(c);
  return c.json(rows);
});

publicApi.get("/settings", async (c) => {
  const { rows } = await pool.query("SELECT key, value FROM site_settings");
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? "";
  cache(c);
  return c.json(out);
});

publicApi.get("/people", async (c) => {
  const { rows } = await pool.query(
    "SELECT id, name, role, bio, photo_url FROM people WHERE is_visible = true ORDER BY sort_order, id"
  );
  cache(c);
  return c.json(rows);
});

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  website: z.string().optional(), // honeypot: real visitors never see or fill this
});

publicApi.post("/subscribe", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Please enter a valid email address." }, 400);
  // A filled-in honeypot means a bot: pretend it worked and save nothing.
  if (parsed.data.website) return c.json({ ok: true });
  if (!(await rateLimit(`subscribe:${clientIp(c)}`, 5, 60 * 60))) {
    return c.json({ error: "Too many signups from your connection. Please try again later." }, 429);
  }
  // Already subscribed looks exactly the same as a new signup, so nobody can check who is on the list.
  await pool.query("INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [parsed.data.email]);
  return c.json({ ok: true });
});
