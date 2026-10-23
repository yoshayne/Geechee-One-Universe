// Recovers a storage key from a stored image link. Pure functions, no database or network.

// The only key shape this site's /media route serves (keep in step with the route in index.ts).
export const MEDIA_KEY_RE = /^uploads\/[a-f0-9-]+\.(?:jpg|png|webp|svg)$/;

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

// Path-style:    https://<host>/<bucket>/<key>?X-Amz-...  (strip the bucket name, decode the rest)
// Virtual-host:  https://<bucket>.<host>/<key>?X-Amz-...  (the path is the key)
// Returns null when the link cannot be parsed or the key is not one this site serves.
export function recoverKey(raw: string, bucketName?: string): string | null {
  const u = parseHttpUrl(raw);
  if (!u) return null;
  const path = safeDecode(u.pathname.replace(/^\/+/, ""));
  if (!path) return null;
  const segments = path.split("/");
  const bucket = bucketName?.toLowerCase();

  const candidates: string[] = [];
  if (bucket && u.hostname.toLowerCase().startsWith(`${bucket}.`)) candidates.push(path); // virtual-host style
  if (bucketName && segments[0] === bucketName) candidates.push(segments.slice(1).join("/")); // path style
  candidates.push(path); // no bucket in the path
  candidates.push(segments.slice(1).join("/")); // path style where the old bucket had a different name
  return candidates.find((c) => MEDIA_KEY_RE.test(c)) ?? null;
}

// A stored value is "broken" when it is a full link into the bucket: signed (X-Amz-... parameters)
// or on the bucket's own host. Links to other sites (TMDB, Tubi...) and /media/... paths are fine.
export function isStoredBucketUrl(raw: string, endpointHost?: string): boolean {
  const u = parseHttpUrl(raw);
  if (!u) return false;
  const signed = [...u.searchParams.keys()].some((k) => /^x-amz-/i.test(k) || /^awsaccesskeyid$/i.test(k));
  const host = u.hostname.toLowerCase();
  const eh = endpointHost?.toLowerCase();
  const onBucketHost = Boolean(eh) && (host === eh || host.endsWith(`.${eh}`));
  return signed || onBucketHost;
}

// For showing a link on screen: drops the query string, which holds the signature and access key ID.
export function redactUrl(raw: string): string {
  const u = parseHttpUrl(raw);
  if (!u) return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  return `${u.origin}${u.pathname}${u.search ? "?…" : ""}`;
}
