import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { pool, dbConfigured, runMigrations, ensureAdmin } from "./db";
import { auth } from "./auth.routes";
import { requireAdmin } from "./auth.middleware";

const app = new Hono();

// ---- API routes (must be registered BEFORE the static handler) ----
app.get("/api/health", async (c) => {
  let db = "not configured";
  if (dbConfigured) {
    try {
      await pool.query("SELECT 1");
      db = "ok";
    } catch {
      db = "error";
    }
  }
  return c.json({ status: "ok", db });
});

app.route("/api/auth", auth);

// Everything under /api/admin requires login.
const admin = new Hono();
admin.use("*", requireAdmin);
admin.get("/ping", (c) => c.json({ ok: true }));
app.route("/api/admin", admin);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// ---- Front end ----
const clientDir = path.join(process.cwd(), "dist", "client");
app.use("/*", serveStatic({ root: "./dist/client" }));

// Catch-all that serves index.html MUST stay last.
app.get("*", (c) => {
  const file = path.join(clientDir, "index.html");
  if (!fs.existsSync(file)) return c.text("Front end not built yet. Run: npm run build", 503);
  return c.html(fs.readFileSync(file, "utf8"));
});

async function start() {
  if (dbConfigured) {
    try {
      await runMigrations();
      await ensureAdmin();
    } catch (err) {
      console.error("Database setup failed:", err);
    }
  } else {
    console.warn("DATABASE_URL not set; database features are off.");
  }
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port }, () => console.log(`Server listening on ${port}`));
}

start();
