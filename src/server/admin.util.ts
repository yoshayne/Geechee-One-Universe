import { z } from "zod";

export function firstError(err: z.ZodError): string {
  const issue = err.issues[0];
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}

export const isUniqueViolation = (e: any) => e && e.code === "23505";

// Best guess at the visitor's address (Railway puts it in x-forwarded-for).
export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const fwd = c.req.header("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || "unknown";
}
