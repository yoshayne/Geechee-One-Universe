import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { firstError, isUniqueViolation } from "./admin.util";

export const people = new Hono();

const optText = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().nullable());
const photo = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .trim()
    .refine((s) => s.startsWith("/media/") || /^https?:\/\//.test(s), "Must be an uploaded image or a web link")
    .nullable()
);

const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  role: optText,
  bio: optText,
  photo_url: photo,
  is_visible: z.boolean().default(false),
  tmdb_person_id: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.number().int().nullable()),
  imdb_id: optText,
});

people.get("/", async (c) => {
  const { rows } = await pool.query("SELECT * FROM people ORDER BY sort_order, id");
  return c.json(rows);
});

// Must be registered before "/:id"
people.put("/reorder", async (c) => {
  const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  for (let i = 0; i < parsed.data.ids.length; i++) {
    await pool.query("UPDATE people SET sort_order = $1 WHERE id = $2", [i, parsed.data.ids[i]]);
  }
  return c.json({ ok: true });
});

people.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  const { rows } = await pool.query("SELECT * FROM people WHERE id = $1", [id]);
  if (!rows[0]) return c.json({ error: "Person not found" }, 404);
  return c.json(rows[0]);
});

people.post("/", async (c) => {
  const parsed = personSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const d = parsed.data;
  try {
  const { rows } = await pool.query(
    `INSERT INTO people (name, role, bio, photo_url, is_visible, tmdb_person_id, imdb_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM people)) RETURNING *`,
    [d.name, d.role, d.bio, d.photo_url, d.is_visible, d.tmdb_person_id, d.imdb_id]
  );
  return c.json(rows[0], 201);
  } catch (e) {
    if (isUniqueViolation(e)) return c.json({ error: "That person is already on the team." }, 409);
    throw e;
  }
});

people.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  const parsed = personSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const d = parsed.data;
  const { rows } = await pool.query(
    `UPDATE people SET name=$1, role=$2, bio=$3, photo_url=$4, is_visible=$5, tmdb_person_id=$6, imdb_id=$7, updated_at=now()
     WHERE id=$8 RETURNING *`,
    [d.name, d.role, d.bio, d.photo_url, d.is_visible, d.tmdb_person_id, d.imdb_id, id]
  );
  if (!rows[0]) return c.json({ error: "Person not found" }, 404);
  return c.json(rows[0]);
});

people.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  await pool.query("DELETE FROM people WHERE id = $1", [id]);
  return c.json({ ok: true });
});
