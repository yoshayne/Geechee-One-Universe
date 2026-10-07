import { Hono } from "hono";
import { storeImage, StorageError, MAX_IMAGE_BYTES } from "./storage";
import { importFromUrl, ImportError } from "./import";
import { z } from "zod";

export const upload = new Hono();

// kind "logo" is the only one allowed to be an SVG
upload.post("/upload", async (c) => {
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!(file instanceof File)) return c.json({ error: "No file was sent." }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: "Image is too big. The limit is 10 MB." }, 400);
  try {
    const url = await storeImage(Buffer.from(await file.arrayBuffer()), { allowSvg: form?.kind === "logo" });
    return c.json({ url });
  } catch (e) {
    if (e instanceof StorageError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

upload.post("/import", async (c) => {
  const parsed = z.object({ url: z.string().trim().min(1, "Paste a link first.") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  try {
    return c.json(await importFromUrl(parsed.data.url));
  } catch (e) {
    if (e instanceof ImportError) return c.json({ error: e.message }, 422);
    console.error("Import failed:", e);
    return c.json({ error: "Could not read that page. You can enter the details by hand." }, 422);
  }
});
