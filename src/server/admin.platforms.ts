import { Hono } from "hono";
import { z } from "zod";
import { pool } from "./db";
import { firstError, isUniqueViolation } from "./admin.util";

export const platforms = new Hono();

const nullText = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().nullable());
const platformSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  label: nullText,
  logo_url: nullText,
});

platforms.get("/", async (c) => {
  const { rows } = await pool.query("SELECT * FROM platforms ORDER BY sort_order, id");
  return c.json(rows);
});

platforms.put("/reorder", async (c) => {
  const parsed = z.object({ ids: z.array(z.number().int()) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  for (let i = 0; i < parsed.data.ids.length; i++) {
    await pool.query("UPDATE platforms SET sort_order = $1 WHERE id = $2", [i, parsed.data.ids[i]]);
  }
  return c.json({ ok: true });
});

platforms.post("/", async (c) => {
  const parsed = platformSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const d = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO platforms (name, label, logo_url, sort_order)
       VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order), 0) + 1 FROM platforms)) RETURNING *`,
      [d.name, d.label, d.logo_url]
    );
    return c.json(rows[0], 201);
  } catch (e) {
    if (isUniqueViolation(e)) return c.json({ error: "A platform with that name already exists." }, 409);
    throw e;
  }
});

platforms.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  const parsed = platformSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: firstError(parsed.error) }, 400);
  const d = parsed.data;
  try {
    const { rows } = await pool.query(
      "UPDATE platforms SET name=$1, label=$2, logo_url=$3 WHERE id=$4 RETURNING *",
      [d.name, d.label, d.logo_url, id]
    );
    if (!rows[0]) return c.json({ error: "Platform not found" }, 404);
    return c.json(rows[0]);
  } catch (e) {
    if (isUniqueViolation(e)) return c.json({ error: "A platform with that name already exists." }, 409);
    throw e;
  }
});

platforms.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  await pool.query("DELETE FROM platforms WHERE id = $1", [id]);
  return c.json({ ok: true });
});
