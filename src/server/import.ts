import { pool } from "./db";
import { safeGet } from "./safeFetch";
import { storeImage, storageConfigured, MAX_IMAGE_BYTES } from "./storage";

export class ImportError extends Error {}

export type ImportResult = {
  title?: string;
  year?: number;
  runtime_minutes?: number;
  genres?: string[];
  director?: string;
  synopsis?: string;
  poster_url?: string;
  hero_url?: string;
  trailer_url?: string;
  imdb_id?: string;
  links: { platform_id: number; url: string }[];
  warnings: string[];
};

const NOT_IN_TMDB = "This film was not found in the TMDB database. You can enter the details by hand.";
const CANT_READ = "Could not read that page. You can enter the details by hand.";

// Downloads an image and keeps our own copy in the bucket. If that is not possible,
// falls back to the original web address so the artwork still shows.
async function copyImage(url: string, warnings: string[], label: string, fallbackUrl: string = url): Promise<string | undefined> {
  const fallback = /^https?:\/\//.test(fallbackUrl) ? fallbackUrl : undefined;
  if (!storageConfigured) {
    const msg = "Image storage is not set up, so artwork links to the original image address instead. Set up the Railway bucket to keep your own copies.";
    if (!warnings.includes(msg)) warnings.push(msg);
    return fallback;
  }
  try {
    const res = await safeGet(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15000, accept: "image/*" });
    if (res.status !== 200) throw new Error("bad status");
    return await storeImage(res.body);
  } catch {
    warnings.push(`The ${label} image could not be copied, so it links to the original address instead.`);
    return fallback;
  }
}

export async function tmdb(path: string, params: Record<string, string> = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new ImportError("TMDB_API_KEY is not set on the server, so TMDB import is not available yet.");
  const url = new URL(`${process.env.TMDB_API_BASE || "https://api.themoviedb.org/3"}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new ImportError("TMDB did not accept the request. Check the TMDB_API_KEY.");
  return (await res.json()) as any;
}

async function importFromImdb(imdbId: string): Promise<ImportResult> {
  const found = await tmdb(`/find/${imdbId}`, { external_source: "imdb_id" });
  const match = found.movie_results?.[0];
  if (!match) throw new ImportError(NOT_IN_TMDB);
  return importFromTmdbId(match.id, imdbId);
}

const IMG = "https://image.tmdb.org/t/p";
async function addTmdbArtwork(out: { poster_url?: string; hero_url?: string }, d: any, warnings: string[]) {
  if (d.poster_path) out.poster_url = await copyImage(`${IMG}/original${d.poster_path}`, warnings, "poster", `${IMG}/w780${d.poster_path}`);
  if (d.backdrop_path) out.hero_url = await copyImage(`${IMG}/original${d.backdrop_path}`, warnings, "hero", `${IMG}/w1280${d.backdrop_path}`);
}

// Fetches only the artwork for a film (used to fill in films that were added without it).
export async function tmdbArtwork(tmdbId: number): Promise<{ poster_url?: string; hero_url?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const d = await tmdb(`/movie/${tmdbId}`);
  const out: { poster_url?: string; hero_url?: string } = {};
  await addTmdbArtwork(out, d, warnings);
  return { ...out, warnings };
}

// Loads one film's full details from TMDB and keeps our own copies of its images.
export async function importFromTmdbId(tmdbId: number, imdbIdKnown?: string, opts: { images?: boolean } = {}): Promise<ImportResult> {
  const warnings: string[] = [];
  const d = await tmdb(`/movie/${tmdbId}`, { append_to_response: "videos,credits" });

  const director = d.credits?.crew?.find((c: any) => c.job === "Director")?.name;
  const trailer = d.videos?.results?.find((v: any) => v.site === "YouTube" && v.type === "Trailer");
  const out: ImportResult = {
    title: d.title,
    year: d.release_date ? Number(String(d.release_date).slice(0, 4)) || undefined : undefined,
    runtime_minutes: d.runtime || undefined,
    genres: (d.genres || []).map((g: any) => g.name),
    director,
    synopsis: d.overview || undefined,
    trailer_url: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : undefined,
    imdb_id: imdbIdKnown || d.imdb_id || undefined,
    links: [],
    warnings,
  };
  if (opts.images !== false) await addTmdbArtwork(out, d, warnings);
  return out;
}

const PLATFORM_DOMAINS: [RegExp, string][] = [
  [/(^|\.)tubitv\.com$/, "Tubi"],
  [/(^|\.)primevideo\.com$/, "Prime Video"],
  [/(^|\.)amazon\.com$/, "Prime Video"],
  [/(^|\.)tv\.apple\.com$/, "Apple TV"],
  [/(^|\.)vudu\.com$/, "Vudu/Fandango"],
  [/(^|\.)fandangoathome\.com$/, "Vudu/Fandango"],
];

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readMeta(html: string) {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3];
    }
    const name = (attrs.property || attrs.name || "").toLowerCase();
    if (name && attrs.content !== undefined && !(name in meta)) meta[name] = decodeEntities(attrs.content).trim();
  }
  return meta;
}

async function importFromPage(rawUrl: string): Promise<ImportResult> {
  const warnings: string[] = [];
  let page;
  try {
    page = await safeGet(rawUrl, { maxBytes: 2 * 1024 * 1024, timeoutMs: 5000, accept: "text/html,application/xhtml+xml" });
  } catch {
    throw new ImportError(CANT_READ);
  }
  if (page.status < 200 || page.status >= 300) throw new ImportError(CANT_READ);

  const html = page.body.toString("utf8");
  const meta = readMeta(html);
  let title = meta["og:title"] || meta["twitter:title"] || "";
  if (!title) {
    const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = t ? decodeEntities(t[1]).trim() : "";
  }
  title = title.replace(/\s*[|\-–—]\s*(Tubi|Prime Video|Amazon\.com|Apple TV|Vudu|Fandango.*)$/i, "").trim();
  const synopsis = meta["og:description"] || meta["description"] || meta["twitter:description"] || "";
  const image = meta["og:image"] || meta["twitter:image"] || "";
  if (!title && !synopsis && !image) throw new ImportError(CANT_READ);

  const out: ImportResult = { title: title || undefined, synopsis: synopsis || undefined, links: [], warnings };
  if (image) {
    try {
      out.poster_url = await copyImage(new URL(image, page.finalUrl).toString(), warnings, "poster");
    } catch {
      /* bad image address, ignore */
    }
  }

  const host = new URL(rawUrl).hostname.toLowerCase();
  const match = PLATFORM_DOMAINS.find(([re]) => re.test(host));
  if (match) {
    const { rows } = await pool.query("SELECT id FROM platforms WHERE name = $1", [match[1]]);
    if (rows[0]) out.links.push({ platform_id: rows[0].id, url: rawUrl });
  }
  return out;
}

export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new ImportError("That does not look like a web link.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ImportError("Only http and https links can be imported.");

  const host = u.hostname.toLowerCase();
  if (host === "imdb.com" || host.endsWith(".imdb.com")) {
    const id = u.pathname.match(/tt\d+/)?.[0];
    if (!id) throw new ImportError("Could not find an IMDb ID (like tt1234567) in that link.");
    return importFromImdb(id);
  }
  return importFromPage(u.toString());
}
