import fs from "fs";
import path from "path";
import { pool, dbConfigured } from "./db";

// Link previews and search engine files. Facebook, text messages and Google do not run our
// JavaScript, so the server writes the right tags into the page before sending it.

const SITE_NAME = "Geechee One Universe";
const DEFAULT_TAGLINE = "Stories from the Lowcountry. Stories from us.";

type Ctx = { req: { url: string; header: (name: string) => string | undefined } };

export function originFor(c: Ctx): string {
  const fixed = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fixed) return /^https?:\/\//.test(fixed) ? fixed : `https://${fixed}`;
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host")?.split(",")[0].trim() || c.req.header("host") || url.host;
  return `${proto}://${host}`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const absolute = (origin: string, url: string | null | undefined) =>
  !url ? undefined : /^https?:\/\//.test(url) ? url : url.startsWith("/") ? origin + url : undefined;

const clip = (s: string, n: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1).trimEnd() + "…" : flat;
};

type PageMeta = {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  url: string;
  type: "website" | "video.movie";
  noindex?: boolean;
  jsonLd?: object;
};

async function settingsMap(): Promise<Record<string, string>> {
  const { rows } = await pool.query("SELECT key, value FROM site_settings WHERE key IN ('tagline', 'logo_url')");
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function metaFor(pathname: string, origin: string): Promise<PageMeta> {
  const canonical = origin + (pathname === "/" ? "/" : pathname.replace(/\/+$/, ""));
  const base: PageMeta = { title: SITE_NAME, description: DEFAULT_TAGLINE, url: canonical, type: "website" };

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return { ...base, title: `Admin | ${SITE_NAME}`, noindex: true };
  }
  if (!dbConfigured) return base;

  try {
    const film = pathname.match(/^\/films\/([a-z0-9-]+)\/?$/);
    if (film) {
      const { rows } = await pool.query(
        `SELECT title, synopsis, poster_url, hero_url, director, genres FROM films
         WHERE slug = $1 AND status IN ('released', 'coming_soon')`,
        [film[1]]
      );
      const f = rows[0];
      if (f) {
        const image = absolute(origin, f.poster_url || f.hero_url);
        return {
          title: `${f.title} | ${SITE_NAME}`,
          description: clip(f.synopsis || `Watch ${f.title} from Geechee One Films.`, 200),
          image,
          imageAlt: `${f.title} poster`,
          url: canonical,
          type: "video.movie",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Movie",
            name: f.title,
            description: f.synopsis || undefined,
            image,
            genre: f.genres?.length ? f.genres : undefined,
            director: f.director ? { "@type": "Person", name: f.director } : undefined,
            url: canonical,
          },
        };
      }
    }
    const s = await settingsMap();
    return {
      ...base,
      description: s.tagline || DEFAULT_TAGLINE,
      image: absolute(origin, s.logo_url),
      imageAlt: SITE_NAME,
    };
  } catch (err) {
    console.error("Could not build page tags:", err);
    return base;
  }
}

let template: string | null = null;
export function readTemplate(): string | null {
  if (template) return template;
  const file = path.join(process.cwd(), "dist", "client", "index.html");
  if (!fs.existsSync(file)) return null;
  template = fs.readFileSync(file, "utf8");
  return template;
}

export function renderPage(html: string, m: PageMeta): string {
  const tag = (attr: string, key: string, value: string) => `    <meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  const lines = [
    tag("name", "description", m.description),
    `    <link rel="canonical" href="${escapeHtml(m.url)}" />`,
    tag("property", "og:site_name", SITE_NAME),
    tag("property", "og:type", m.type),
    tag("property", "og:title", m.title),
    tag("property", "og:description", m.description),
    tag("property", "og:url", m.url),
    tag("name", "twitter:card", "summary"),
    tag("name", "twitter:title", m.title),
    tag("name", "twitter:description", m.description),
  ];
  if (m.image) {
    lines.push(tag("property", "og:image", m.image), tag("name", "twitter:image", m.image));
    if (m.imageAlt) lines.push(tag("property", "og:image:alt", m.imageAlt), tag("name", "twitter:image:alt", m.imageAlt));
  }
  if (m.noindex) lines.push(tag("name", "robots", "noindex, nofollow"));
  if (m.jsonLd) {
    // "<" is escaped so film text can never close the script tag early.
    const json = JSON.stringify(m.jsonLd).replace(/</g, "\\u003c");
    lines.push(`    <script type="application/ld+json">${json}</script>`);
  }
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(m.title)}</title>`)
    .replace("</head>", `${lines.join("\n")}\n  </head>`);
}

export const robotsTxt = (origin: string) =>
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;

export async function sitemapXml(origin: string): Promise<string> {
  const urls: { loc: string; lastmod?: string }[] = [{ loc: `${origin}/` }];
  if (dbConfigured) {
    try {
      const { rows } = await pool.query(
        "SELECT slug, updated_at FROM films WHERE status IN ('released', 'coming_soon') ORDER BY sort_order, id"
      );
      for (const r of rows) urls.push({ loc: `${origin}/films/${r.slug}`, lastmod: new Date(r.updated_at).toISOString().slice(0, 10) });
    } catch (err) {
      console.error("Could not build sitemap:", err);
    }
  }
  const items = urls
    .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}
