export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: options.method || (options.body || options.form ? "POST" : "GET") };
  if (options.form) init.body = options.form;
  else if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }
  if (res.status === 401 && !path.startsWith("/api/auth/login")) {
    window.location.href = "/admin/login";
    throw new ApiError("Please log in again.", 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Something went wrong.", res.status);
  return data as T;
}

export type Platform = { id: number; name: string; logo_url: string | null; label: string | null; sort_order: number };
export type FilmLink = { id?: number; platform_id: number; url: string; platform_name?: string };
export type Film = {
  id: number;
  slug: string;
  title: string;
  year: number | null;
  runtime_minutes: number | null;
  genres: string[];
  director: string | null;
  synopsis: string | null;
  poster_url: string | null;
  hero_url: string | null;
  title_image_url: string | null;
  trailer_url: string | null;
  imdb_id: string | null;
  status: "draft" | "released" | "coming_soon";
  is_featured: boolean;
  sort_order: number;
  links: FilmLink[];
};

export const STATUS_LABELS: Record<Film["status"], string> = {
  draft: "Draft (hidden)",
  released: "Released",
  coming_soon: "Coming soon",
};
