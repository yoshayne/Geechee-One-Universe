import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { COOKIE_NAME, verifySession } from "./auth.helpers";

type Env = { Variables: { admin: { id: number; email: string } } };

export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  const admin = token ? await verifySession(token) : null;
  if (!admin) return c.json({ error: "Not logged in" }, 401);
  c.set("admin", admin);
  await next();
});
