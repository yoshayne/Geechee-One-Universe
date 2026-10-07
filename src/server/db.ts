import { Pool } from "pg";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

export const dbConfigured = Boolean(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's internal Postgres does not need SSL; external URLs usually do.
  ssl:
    process.env.DATABASE_URL && /sslmode=require/.test(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
});

pool.on("error", (err) => console.error("Postgres pool error:", err.message));

// Runs every .sql file in /migrations once, in filename order.
export async function runMigrations() {
  const dir = path.join(process.cwd(), "migrations");
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (done.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

// Creates the single admin from ADMIN_EMAIL / ADMIN_PASSWORD if none exists.
export async function ensureAdmin() {
  const existing = await pool.query("SELECT 1 FROM admin_users LIMIT 1");
  if (existing.rowCount) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("No admin exists and ADMIN_EMAIL / ADMIN_PASSWORD are not set.");
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query("INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)", [email, hash]);
  console.log(`Created admin user ${email}`);
}
