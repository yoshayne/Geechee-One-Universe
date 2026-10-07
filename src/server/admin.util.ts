import { z } from "zod";

export function firstError(err: z.ZodError): string {
  const issue = err.issues[0];
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}

export const isUniqueViolation = (e: any) => e && e.code === "23505";
