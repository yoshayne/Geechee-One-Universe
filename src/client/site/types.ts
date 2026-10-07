export type FilmLink = { platform_id: number; platform_name: string; logo_url: string | null; label: string | null; url: string };

export type PublicFilm = {
  id: number;
  slug: string;
  title: string;
  year: number | null;
  runtime_minutes: number | null;
  genres: string[];
  director: string | null;
  cast_names: string[];
  content_rating: string | null;
  synopsis: string | null;
  poster_url: string | null;
  hero_url: string | null;
  title_image_url: string | null;
  trailer_url: string | null;
  status: "released" | "coming_soon";
  is_featured: boolean;
  links: FilmLink[];
};

export type PublicPlatform = { id: number; name: string; logo_url: string | null; label: string | null };
export type PublicPerson = { id: number; name: string; role: string | null; bio: string | null; photo_url: string | null };
export type SiteSettings = Record<string, string>;

export const DEFAULT_TAGLINE = "Stories from the Lowcountry. Stories from us.";
