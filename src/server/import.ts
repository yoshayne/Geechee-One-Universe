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
  cast_names?: string[];
  content_rating?: string;
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
export async function copyImage(url: string, warnings: string[], label: string, fallbackUrl: string = url): Promise<string | undefined> {
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

// Maps TMDB / JustWatch provider names to the platforms in our own list.
const PROVIDER_MAP: [RegExp, string][] = [
  [/^tubi/i, "Tubi"],
  [/prime video|^amazon video/i, "Prime Video"],
  [/^apple (tv|itunes)/i, "Apple TV"],
  [/^(vudu|fandango at home)/i, "Vudu/Fandango"],
];

// Reads TMDB's "where to watch" data. TMDB only gives one JustWatch page for the film,
// so each matching platform gets that page as its link until the admin swaps in a direct link.
async function watchLinks(d: any, warnings: string[]): Promise<{ platform_id: number; url: string }[]> {
  const region = (process.env.TMDB_WATCH_REGION || "US").toUpperCase();
  const info = d["watch/providers"]?.results?.[region];
  if (!info?.link || !/^https?:\/\//.test(info.link)) return [];
  const names = new Set<string>();
  for (const kind of ["flatrate", "free", "ads", "rent", "buy"]) {
    for (const p of info[kind] || []) if (p.provider_name) names.add(String(p.provider_name));
  }
  const ours = new Set<string>();
  const others: string[] = [];
  for (const n of names) {
    const hit = PROVIDER_MAP.find(([re]) => re.test(n));
    if (hit) ours.add(hit[1]);
    else others.push(n);
  }
  if (others.length) warnings.push(`${d.title}: TMDB also lists it on ${others.join(", ")} (not in your platform list).`);
  if (!ours.size) return [];
  const { rows } = await pool.query("SELECT id FROM platforms WHERE name = ANY($1)", [[...ours]]);
  return rows.map((r) => ({ platform_id: r.id, url: info.link as string }));
}
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
  const d = await tmdb(`/movie/${tmdbId}`, { append_to_response: "videos,credits,watch/providers" });

  const director = d.credits?.crew?.find((c: any) => c.job === "Director")?.name;
  const trailer = d.videos?.results?.find((v: any) => v.site === "YouTube" && v.type === "Trailer");
  const out: ImportResult = {
    title: d.title,
    year: d.release_date ? Number(String(d.release_date).slice(0, 4)) || undefined : undefined,
    runtime_minutes: d.runtime || undefined,
    genres: (d.genres || []).map((g: any) => g.name),
    director,
    cast_names: (d.credits?.cast || []).slice(0, 8).map((c: any) => c.name).filter(Boolean),
    synopsis: d.overview || undefined,
    trailer_url: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : undefined,
    imdb_id: imdbIdKnown || d.imdb_id || undefined,
    links: [],
    warnings,
  };
  try {
    out.links = await watchLinks(d, warnings);
  } catch {
    /* watch data is a bonus; ignore failures */
  }
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

// Many sites (Tubi included) describe the film in a standard machine-readable block
// (schema.org "Movie" data). It has far more than the basic sharing tags.
type StructuredMovie = {
  title?: string;
  synopsis?: string;
  year?: number;
  runtime_minutes?: number;
  genres: string[];
  director?: string;
  cast_names: string[];
  content_rating?: string;
  image?: string;
};

function ldNames(v: any): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(ldNames);
  if (typeof v === "object" && typeof v.name === "string") return [v.name.trim()].filter(Boolean);
  return [];
}

function ldImage(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return ldImage(v[0]);
  if (typeof v === "object" && typeof v.url === "string") return v.url;
  return undefined;
}

function ldHasType(n: any, type: string) {
  const t = n && n["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

function readStructuredMovie(html: string): StructuredMovie | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: any;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nodes: any[] = [];
    for (const top of Array.isArray(data) ? data : [data]) {
      nodes.push(top);
      if (top && Array.isArray(top["@graph"])) nodes.push(...top["@graph"]);
    }
    const n = nodes.find((x) => ldHasType(x, "Movie")) || nodes.find((x) => ldHasType(x, "VideoObject"));
    if (!n) continue;

    const when = n.releasedEvent?.startDate || n.dateCreated || n.datePublished;
    const year = when ? Number(String(when).slice(0, 4)) : NaN;
    const dur = typeof n.duration === "string" ? n.duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/) : null;
    const minutes = dur ? Number(dur[1] || 0) * 60 + Number(dur[2] || 0) + Math.round(Number(dur[3] || 0) / 60) : 0;
    const rating = ldNames(Array.isArray(n.contentRating) ? n.contentRating[0] : n.contentRating)[0];
    return {
      title: typeof n.name === "string" ? n.name.trim() : undefined,
      synopsis: typeof n.description === "string" ? n.description.trim() : undefined,
      year: year >= 1888 && year <= 2200 ? year : undefined,
      runtime_minutes: minutes > 0 ? minutes : undefined,
      genres: ldNames(n.genre),
      director: ldNames(n.director).join(", ") || undefined,
      cast_names: ldNames(n.actor).slice(0, 12),
      content_rating: rating,
      image: ldImage(n.image),
    };
  }
  return null;
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
  const ld = readStructuredMovie(html);

  let title = ld?.title || meta["og:title"] || meta["twitter:title"] || "";
  if (!title) {
    const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = t ? decodeEntities(t[1]).trim() : "";
  }
  title = title.replace(/\s*[|\-–—]\s*(Tubi|Prime Video|Amazon\.com|Apple TV|Vudu|Fandango.*)$/i, "").trim();
  // Page titles often end with the year, like "As We Lay (2026)".
  const yearInTitle = title.match(/\s*\(((?:19|20)\d{2})\)\s*$/);
  if (yearInTitle) title = title.slice(0, yearInTitle.index).trim();

  const synopsis = ld?.synopsis || meta["og:description"] || meta["description"] || meta["twitter:description"] || "";
  if (!title && !synopsis && !ld && !(meta["og:image"] || meta["twitter:image"])) throw new ImportError(CANT_READ);

  // A tall image is the poster, a wide one is the hero image.
  const og = meta["og:image"] || meta["twitter:image"] || "";
  const ogLandscape = Number(meta["og:image:width"]) > Number(meta["og:image:height"]);
  let posterSrc = ld?.image;
  let heroSrc: string | undefined;
  if (og) {
    if (ogLandscape) heroSrc = og;
    else if (!posterSrc) posterSrc = og;
  }

  const out: ImportResult = {
    title: title || undefined,
    synopsis: synopsis || undefined,
    year: ld?.year ?? (yearInTitle ? Number(yearInTitle[1]) : undefined),
    runtime_minutes: ld?.runtime_minutes,
    genres: ld?.genres.length ? ld.genres : undefined,
    director: ld?.director,
    cast_names: ld?.cast_names.length ? ld.cast_names : undefined,
    content_rating: ld?.content_rating,
    links: [],
    warnings,
  };
  for (const [src, label, key] of [
    [posterSrc, "poster", "poster_url"],
    [heroSrc, "hero", "hero_url"],
  ] as const) {
    if (!src) continue;
    try {
      out[key] = await copyImage(new URL(src, page.finalUrl).toString(), warnings, label);
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
