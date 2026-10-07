import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import { pool, dbConfigured, runMigrations, ensureAdmin } from "./db";
import { auth } from "./auth.routes";
import { requireAdmin } from "./auth.middleware";
import { films } from "./admin.films";
import { platforms } from "./admin.platforms";
import { settings } from "./admin.settings";
import { subscribers } from "./admin.subscribers";
import { upload } from "./admin.upload";
import { tmdbRoutes } from "./admin.tmdb";
import { people } from "./admin.people";
import { publicApi } from "./public.routes";
import { readObject, storageConfigured } from "./storage";
import { metaFor, originFor, readTemplate, renderPage, robotsTxt, sitemapXml } from "./seo";

const app = new Hono();

// Smaller downloads for text (pages, scripts, styles, data).
app.use(compress());

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Something went wrong on the server." }, 500);
});

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
  return c.json({ status: "ok", db, storage: storageConfigured ? "configured" : "not configured" });
});

app.route("/api/auth", auth);
app.route("/api", publicApi);

// Everything under /api/admin requires login.
const admin = new Hono();
admin.use("*", requireAdmin);
admin.get("/ping", (c) => c.json({ ok: true }));
admin.route("/films", films);
admin.route("/platforms", platforms);
admin.route("/settings", settings);
admin.route("/subscribers", subscribers);
admin.route("/team", people);
admin.route("/tmdb", tmdbRoutes);
admin.route("/", upload);
app.route("/api/admin", admin);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// ---- Uploaded images, served from the bucket ----
app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!storageConfigured || !/^uploads\/[a-f0-9-]+\.(jpg|png|webp|svg)$/.test(key)) return c.notFound();
  try {
    const { stream, contentType } = await readObject(key);
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        // Stops any script hidden inside an SVG from running.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return c.notFound();
  }
});

// ---- Search engine files ----
app.get("/robots.txt", (c) => c.text(robotsTxt(originFor(c))));
app.get("/sitemap.xml", async (c) => {
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(await sitemapXml(originFor(c)));
});

// ---- Front end ----
// The server writes the page title and link-preview tags in, so shared links show the film poster.
async function servePage(c: Context) {
  const html = readTemplate();
  if (!html) return c.text("Front end not built yet. Run: npm run build", 503);
  const meta = await metaFor(new URL(c.req.url).pathname, originFor(c));
  c.header("Cache-Control", "no-cache");
  return c.html(renderPage(html, meta));
}
// "/" must be handled here, before the static handler, which would send the bare index.html.
app.get("/", servePage);

// Built files have a fingerprint in their name, so browsers may keep them for a year.
app.use(
  "/*",
  serveStatic({
    root: "./dist/client",
    onFound: (filePath, c) => {
      if (filePath.includes("/assets/")) c.header("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

// Catch-all that serves index.html MUST stay last.
app.get("*", servePage);

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
  if (!storageConfigured) console.warn("Bucket variables not set; image uploads are off.");
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port }, () => console.log(`Server listening on ${port}`));
}

start();
