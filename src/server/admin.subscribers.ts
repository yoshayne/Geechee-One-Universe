import { Hono } from "hono";
import { pool } from "./db";

export const subscribers = new Hono();

subscribers.get("/", async (c) => {
  const { rows } = await pool.query("SELECT id, email, created_at FROM subscribers ORDER BY created_at DESC, id DESC");
  return c.json({ total: rows.length, items: rows });
});

// Must be registered before "/:id"
subscribers.get("/export.csv", async (c) => {
  const { rows } = await pool.query("SELECT email, created_at FROM subscribers ORDER BY created_at DESC, id DESC");
  // A leading = + - @ can run as a formula in Excel, so neutralize it.
  const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const lines = ["email,signed_up"];
  for (const r of rows) lines.push(`"${safe(r.email).replace(/"/g, '""')}",${new Date(r.created_at).toISOString()}`);
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscribers.csv"',
    },
  });
});

subscribers.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Not found" }, 404);
  await pool.query("DELETE FROM subscribers WHERE id = $1", [id]);
  return c.json({ ok: true });
});
