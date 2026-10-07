import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { pool } from "./db";
import { rateLimit, clearRateLimit } from "./redis";
import {
  COOKIE_NAME,
  SESSION_SECONDS,
  checkPassword,
  hashPassword,
  signSession,
  verifySession,
} from "./auth.helpers";
import { requireAdmin } from "./auth.middleware";

export const auth = new Hono();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const changePwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, "Use at least 10 characters"),
});

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};

function clientIp(c: any) {
  const fwd = c.req.header("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "unknown") || "unknown";
}

auth.post("/login", async (c) => {
  const ip = clientIp(c);
  const limitKey = `login:${ip}`;
  if (!(await rateLimit(limitKey, 5, 15 * 60))) {
    return c.json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter your email and password." }, 400);

  const email = parsed.data.email.trim().toLowerCase();
  const { rows } = await pool.query("SELECT id, email, password_hash FROM admin_users WHERE email = $1", [email]);
  const user = rows[0];
  const ok = user ? await checkPassword(parsed.data.password, user.password_hash) : false;
  if (!user || !ok) return c.json({ error: "Wrong email or password." }, 401);

  await clearRateLimit(limitKey);
  setCookie(c, COOKIE_NAME, await signSession(user.id, user.email), cookieOpts);
  return c.json({ email: user.email });
});

auth.post("/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  const admin = token ? await verifySession(token) : null;
  if (!admin) return c.json({ error: "Not logged in" }, 401);
  return c.json({ email: admin.email });
});

auth.post("/change-password", requireAdmin, async (c) => {
  const parsed = changePwSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const admin = c.get("admin");
  const { rows } = await pool.query("SELECT password_hash FROM admin_users WHERE id = $1", [admin.id]);
  if (!rows[0] || !(await checkPassword(parsed.data.currentPassword, rows[0].password_hash))) {
    return c.json({ error: "Current password is wrong." }, 400);
  }
  await pool.query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [
    await hashPassword(parsed.data.newPassword),
    admin.id,
  ]);
  return c.json({ ok: true });
});
