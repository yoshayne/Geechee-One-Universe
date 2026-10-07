import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const storageConfigured = Boolean(
  process.env.BUCKET_ENDPOINT &&
    process.env.BUCKET_NAME &&
    process.env.BUCKET_ACCESS_KEY_ID &&
    process.env.BUCKET_SECRET_ACCESS_KEY
);

let client: S3Client | null = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: process.env.BUCKET_REGION || "auto",
      endpoint: process.env.BUCKET_ENDPOINT,
      forcePathStyle: process.env.BUCKET_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

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
  await s3().send(
    new PutObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key, Body: buf, ContentType: type.mime })
  );
  return `/media/${key}`;
}

export async function readObject(key: string) {
  const out = await s3().send(new GetObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key }));
  return { stream: out.Body!.transformToWebStream(), contentType: out.ContentType || "application/octet-stream" };
}
