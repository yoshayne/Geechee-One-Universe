import { useEffect, useState } from "react";
import { PublicFilm, PublicPerson, PublicPlatform, SiteSettings } from "./types";

export type SiteData = {
  loading: boolean;
  failed: boolean;
  films: PublicFilm[];
  platforms: PublicPlatform[];
  people: PublicPerson[];
  settings: SiteSettings;
};

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(path);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useSiteData(): SiteData {
  const [data, setData] = useState<SiteData>({ loading: true, failed: false, films: [], platforms: [], people: [], settings: {} });

  useEffect(() => {
    let alive = true;
    Promise.all([
      get<PublicFilm[] | null>("/api/films", null),
      get<PublicPlatform[]>("/api/platforms", []),
      get<PublicPerson[]>("/api/people", []),
      get<SiteSettings>("/api/settings", {}),
    ]).then(([films, platforms, people, settings]) => {
      if (alive) setData({ loading: false, failed: films === null, films: films ?? [], platforms, people, settings });
    });
    return () => {
      alive = false;
    };
  }, []);

  return data;
}
