import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "crypto";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Railway's bucket variables are sometimes named BUCKET_URL instead of BUCKET_ENDPOINT, so accept both.
// A bare host name (no https://) gets https:// added.
function bucketEndpoint(): string | undefined {
  const raw = (process.env.BUCKET_ENDPOINT || process.env.BUCKET_URL || "").trim();
  if (!raw) return undefined;
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

// Variable names that must be set for image storage to work (names only, never values).
export function missingStorageVariables(): string[] {
  const missing: string[] = [];
  if (!bucketEndpoint()) missing.push("BUCKET_ENDPOINT (or BUCKET_URL)");
  if (!process.env.BUCKET_NAME) missing.push("BUCKET_NAME");
  if (!process.env.BUCKET_ACCESS_KEY_ID) missing.push("BUCKET_ACCESS_KEY_ID");
  if (!process.env.BUCKET_SECRET_ACCESS_KEY) missing.push("BUCKET_SECRET_ACCESS_KEY");
  return missing;
}

export const storageConfigured = missingStorageVariables().length === 0;

// S3-compatible buckets are addressed as https://<endpoint>/<bucket>/<key> ("path style").
// Set BUCKET_FORCE_PATH_STYLE=false only if your provider needs https://<bucket>.<endpoint>/<key>.
const usePathStyle = () => process.env.BUCKET_FORCE_PATH_STYLE !== "false";

function makeClient(forcePathStyle: boolean) {
  return new S3Client({
    region: process.env.BUCKET_REGION || "auto",
    endpoint: bucketEndpoint(),
    forcePathStyle,
    credentials: {
      accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
    },
  });
}

let client: S3Client | null = null;
function s3() {
  if (!client) client = makeClient(usePathStyle());
  return client;
}

// A short code that changes whenever the endpoint, bucket or access key changes. It is a one-way
// hash, so it reveals nothing, but lets you confirm after a deploy that the new keys are in use.
export function credentialsFingerprint(): string {
  return createHash("sha256")
    .update([bucketEndpoint() ?? "", process.env.BUCKET_NAME ?? "", process.env.BUCKET_ACCESS_KEY_ID ?? ""].join("|"))
    .digest("hex")
    .slice(0, 8);
}

type ErrorKind = "keys" | "bucket" | "missing" | "redirect" | "network" | "other";

// Sorts a storage error into a plain category. Only the error name and status code are used,
// never the error text, so nothing sensitive can leak.
function errorInfo(err: unknown): { kind: ErrorKind; name: string; status?: number } {
  const e = err as any;
  const name = String(e?.name || e?.Code || e?.code || "Error");
  const status: number | undefined = e?.$metadata?.httpStatusCode;
  const code = String(e?.code || e?.cause?.code || "");
  let kind: ErrorKind = "other";
  if (["InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied", "InvalidToken", "ExpiredToken", "Forbidden"].includes(name) || status === 401 || status === 403) kind = "keys";
  else if (name === "NoSuchKey") kind = "missing";
  else if (name === "NoSuchBucket" || status === 404) kind = "bucket";
  else if (["PermanentRedirect", "AuthorizationHeaderMalformed"].includes(name) || (status !== undefined && [301, 307, 308].includes(status))) kind = "redirect";
  else if (/^(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|EHOSTUNREACH|CERT_|ERR_TLS|UNABLE_TO)/.test(code) || /^(TimeoutError|ENOTFOUND|ECONNREFUSED)/.test(name)) kind = "network";
  return { kind, name, status };
}

// Says in plain words what a storage error means.
export function explainStorageError(err: unknown): string {
  const { kind, name, status } = errorInfo(err);
  const tag = `(${name}${status ? `, HTTP ${status}` : ""})`;
  switch (kind) {
    case "keys":
      return `The bucket rejected the access keys ${tag}. The keys are wrong or were rotated. Update BUCKET_ACCESS_KEY_ID and BUCKET_SECRET_ACCESS_KEY in Railway with the current bucket keys, then redeploy.`;
    case "bucket":
      return `The bucket was not found ${tag}. BUCKET_NAME or the endpoint address (BUCKET_ENDPOINT or BUCKET_URL) is wrong. If both look right, try BUCKET_FORCE_PATH_STYLE=false.`;
    case "missing":
      return `That file is not in the bucket ${tag}.`;
    case "redirect":
      return `The bucket is at a different address or region ${tag}. Check BUCKET_ENDPOINT (or BUCKET_URL) and BUCKET_REGION.`;
    case "network":
      return `Could not reach the bucket address ${tag}. Check BUCKET_ENDPOINT (or BUCKET_URL) for typos.`;
    default:
      return `The bucket returned an unexpected error ${tag}.`;
  }
}

// True when the error means "the file is not there" rather than "storage is broken".
export const isMissingFile = (err: unknown) => errorInfo(err).kind === "missing";

export class StorageError extends Error {}

// Checks the real file contents (not the file name) to decide the image type.
export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: "png", mime: "image/png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return { ext: "webp", mime: "image/webp" };
  const head = buf.subarray(0, 2048).toString("utf8").toLowerCase();
  if (head.includes("<svg")) return { ext: "svg", mime: "image/svg+xml" };
  return null;
}

// Validates an image and saves it in the bucket. Returns the public path, e.g. /media/uploads/abc.png
export async function storeImage(buf: Buffer, opts: { allowSvg?: boolean } = {}): Promise<string> {
  if (!storageConfigured) {
    throw new StorageError("Image storage is not set up yet. Add the BUCKET_* variables in Railway.");
  }
  if (buf.length > MAX_IMAGE_BYTES) throw new StorageError("Image is too big. The limit is 10 MB.");
  const type = sniffImage(buf);
  if (!type) throw new StorageError("That file is not a JPG, PNG, WebP or SVG image.");
  if (type.ext === "svg" && !opts.allowSvg) throw new StorageError("SVG files are only allowed for logos.");
  const key = `uploads/${randomUUID()}.${type.ext}`;
  try {
    await s3().send(new PutObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key, Body: buf, ContentType: type.mime }));
  } catch (err) {
    throw new StorageError(explainStorageError(err));
  }
  return `/media/${key}`;
}

export async function readObject(key: string, useClient: S3Client = s3()) {
  const out = await useClient.send(new GetObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key }));
  return { stream: out.Body!.transformToWebStream(), contentType: out.ContentType || "application/octet-stream" };
}

// ---- Storage health check ----

export type CheckStep = { step: string; ok: boolean; message: string };
export type StorageCheckResult = {
  ok: boolean;
  summary: string;
  steps: CheckStep[];
  settings: { endpoint: string; bucket: string; addressing: string; region: string; keysFingerprint: string };
};

// A 1x1 transparent PNG.
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// Writes a tiny image, reads it back the same way the /media route does, then deletes it.
async function tryOnce(c: S3Client): Promise<{ steps: CheckStep[]; err?: unknown }> {
  const steps: CheckStep[] = [];
  const key = `uploads/healthcheck-${randomUUID()}.png`;
  let wrote = false;
  let failure: unknown;
  try {
    await c.send(new PutObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key, Body: TINY_PNG, ContentType: "image/png" }));
    wrote = true;
    steps.push({ step: "Write a test file", ok: true, message: "Worked." });
  } catch (err) {
    failure = err;
    steps.push({ step: "Write a test file", ok: false, message: explainStorageError(err) });
  }
  if (wrote) {
    try {
      const { stream } = await readObject(key, c);
      const bytes = Buffer.from(await new Response(stream).arrayBuffer());
      const same = bytes.equals(TINY_PNG);
      steps.push({ step: "Read it back", ok: same, message: same ? "Worked." : "The file that came back was different from the one written." });
    } catch (err) {
      failure = err;
      steps.push({ step: "Read it back", ok: false, message: explainStorageError(err) });
    }
    try {
      await c.send(new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key }));
      steps.push({ step: "Delete the test file", ok: true, message: "Worked." });
    } catch (err) {
      failure = failure ?? err;
      steps.push({ step: "Delete the test file", ok: false, message: explainStorageError(err) });
    }
  }
  return { steps, err: steps.every((x) => x.ok) ? undefined : failure ?? new Error("check failed") };
}

export async function checkStorage(): Promise<StorageCheckResult> {
  const settings = {
    endpoint: (() => {
      try {
        return new URL(bucketEndpoint() || "").host;
      } catch {
        return "(not set)";
      }
    })(),
    bucket: process.env.BUCKET_NAME || "(not set)",
    addressing: usePathStyle() ? "path style" : "bucket-in-hostname style",
    region: process.env.BUCKET_REGION || "auto",
    keysFingerprint: credentialsFingerprint(),
  };

  const missing = missingStorageVariables();
  if (missing.length) {
    return {
      ok: false,
      summary: `Image storage is not set up. These variables are missing in Railway: ${missing.join(", ")}.`,
      steps: [{ step: "Check the variables", ok: false, message: `Missing: ${missing.join(", ")}.` }],
      settings,
    };
  }

  const first = await tryOnce(s3());
  if (!first.err) {
    return { ok: true, summary: "Image storage works. Files can be written, read back and deleted.", steps: first.steps, settings };
  }

  // If the bucket looked wrong or at another address, the address style may be the problem. Try the other one.
  const kind = errorInfo(first.err).kind;
  if (kind === "bucket" || kind === "redirect" || kind === "network") {
    const flipped = !usePathStyle();
    const second = await tryOnce(makeClient(flipped));
    if (!second.err) {
      return {
        ok: false,
        summary: `Image storage works only with ${flipped ? "path style" : "bucket-in-hostname style"} addressing. Set BUCKET_FORCE_PATH_STYLE=${flipped ? "true" : "false"} in Railway, then redeploy.`,
        steps: first.steps,
        settings,
      };
    }
  }

  const bad = first.steps.find((x) => !x.ok)!;
  return { ok: false, summary: `Image storage is not working. ${bad.step} failed: ${bad.message}`, steps: first.steps, settings };
}
