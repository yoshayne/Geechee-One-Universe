import { pool } from "./db";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "film";

// A film address that no other film is using yet: as-we-lay, as-we-lay-2, ...
export async function freeSlug(base: string) {
  let slug = base;
  for (let n = 2; ; n++) {
    const { rowCount } = await pool.query("SELECT 1 FROM films WHERE slug = $1", [slug]);
    if (!rowCount) return slug;
    slug = `${base}-${n}`;
  }
}
