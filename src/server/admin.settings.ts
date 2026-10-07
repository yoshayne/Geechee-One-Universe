import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { firstError } from "./admin.util";

export const settings = new Hono();

export const SETTING_KEYS = [
  "about_text", "tagline", "facebook_url", "instagram_url", "youtube_url",
  "tiktok_url", "logo_url", "about_image_url", "footer_text",
];

settings.get("/", async (c) => {
  const { rows } = await pool.query("SELECT key, value FROM site_settings");
  const out: Record<string, string> = {};
  for (const k of SETTING_KEYS) out[k] = "";
  for (const r of rows) out[r.key] = r.value ?? "";
  return c.json(out);
});

settings.put("/", async (c) => {
  const parsed = z.record(z.string(), z.string().max(10000)).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!SETTING_KEYS.includes(key)) continue;
    await pool.query(
      "INSERT INTO site_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [key, value.trim()]
    );
  }
  return c.json({ ok: true });
});
