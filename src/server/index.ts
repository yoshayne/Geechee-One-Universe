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
import { bulk } from "./admin.bulk";
import { imageRepair } from "./admin.imagerepair";
import { publicApi } from "./public.routes";
import { checkStorage, explainStorageError, isMissingFile, readObject, storageConfigured } from "./storage";
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
// Writes, reads back and deletes a tiny test file, and says in plain words what is wrong if it fails.
admin.get("/storage-check", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await checkStorage());
});
admin.route("/films", films);
admin.route("/platforms", platforms);
admin.route("/settings", settings);
admin.route("/subscribers", subscribers);
admin.route("/team", people);
admin.route("/bulk", bulk);
admin.route("/image-repair", imageRepair);
admin.route("/tmdb", tmdbRoutes);
admin.route("/", upload);
app.route("/api/admin", admin);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// ---- Uploaded images, served from the bucket ----
// Logs the reason at most once a minute, so a broken bucket is visible in the Railway logs
// without flooding them. Only the error name and status are logged, never keys.
let lastMediaWarning = 0;
function warnMediaProblem(err: unknown) {
  if (Date.now() - lastMediaWarning < 60_000) return;
  lastMediaWarning = Date.now();
  console.warn(`Image storage problem while serving /media: ${explainStorageError(err)}`);
}

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
  } catch (err) {
    // A file that is not in the bucket is a normal 404. Anything else means storage itself is broken
    // (for example rotated keys), which must not look like a missing image and must not be cached.
    if (isMissingFile(err)) return c.notFound();
    warnMediaProblem(err);
    c.header("Cache-Control", "no-store");
    return c.text("Image storage is unavailable.", 502);
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
  else {
    // Test the keys at every start, so rotated keys show up in the logs right after a deploy.
    checkStorage()
      .then((r) => (r.ok ? console.log(`Image storage check passed (keys code ${r.settings.keysFingerprint}).`) : console.warn(`Image storage check FAILED: ${r.summary}`)))
      .catch((err) => console.warn(`Image storage check could not run: ${explainStorageError(err)}`));
  }
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port }, () => console.log(`Server listening on ${port}`));
}

start();
