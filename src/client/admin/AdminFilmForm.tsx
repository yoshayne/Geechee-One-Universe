import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Film, FilmLink, Platform, STATUS_LABELS } from "./api";
import ImageUpload from "./ImageUpload";

type FormState = {
  title: string;
  slug: string;
  year: string;
  runtime_minutes: string;
  genres: string;
  director: string;
  cast: string;
  content_rating: string;
  synopsis: string;
  status: Film["status"];
  is_featured: boolean;
  poster_url: string;
  hero_url: string;
  title_image_url: string;
  trailer_url: string;
  imdb_id: string;
  links: FilmLink[];
};

const empty: FormState = {
  title: "", slug: "", year: "", runtime_minutes: "", genres: "", director: "", cast: "", content_rating: "", synopsis: "",
  status: "draft", is_featured: false, poster_url: "", hero_url: "", title_image_url: "",
  trailer_url: "", imdb_id: "", links: [],
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function AdminFilmForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState<FormState>(empty);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    api<Platform[]>("/api/admin/platforms").then(setPlatforms).catch((e) => setError(e.message));
    if (id) {
      api<Film>(`/api/admin/films/${id}`)
        .then((film) => {
          setF({
            title: film.title,
            slug: film.slug,
            year: film.year?.toString() ?? "",
            runtime_minutes: film.runtime_minutes?.toString() ?? "",
            genres: film.genres.join(", "),
            director: film.director ?? "",
            cast: (film.cast_names ?? []).join(", "),
            content_rating: film.content_rating ?? "",
            synopsis: film.synopsis ?? "",
            status: film.status,
            is_featured: film.is_featured,
            poster_url: film.poster_url ?? "",
            hero_url: film.hero_url ?? "",
            title_image_url: film.title_image_url ?? "",
            trailer_url: film.trailer_url ?? "",
            imdb_id: film.imdb_id ?? "",
            links: film.links.map((l) => ({ platform_id: l.platform_id, url: l.url })),
          });
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    }
  }, [id]);

  function onTitle(title: string) {
    setF((prev) => ({ ...prev, title, slug: slugTouched ? prev.slug : slugify(title) }));
  }

  async function runImport() {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await api<any>("/api/admin/import", { body: { url: importUrl } });
      setF((prev) => {
        const links = [...prev.links];
        for (const l of r.links || []) {
          const i = links.findIndex((x) => x.platform_id === l.platform_id);
          if (i >= 0) links[i] = l;
          else links.push(l);
        }
        const title = r.title ?? prev.title;
        return {
          ...prev,
          title,
          slug: slugTouched || !r.title ? prev.slug : slugify(title),
          year: r.year?.toString() ?? prev.year,
          runtime_minutes: r.runtime_minutes?.toString() ?? prev.runtime_minutes,
          genres: r.genres?.length ? r.genres.join(", ") : prev.genres,
          director: r.director ?? prev.director,
          cast: r.cast_names?.length ? r.cast_names.join(", ") : prev.cast,
          content_rating: r.content_rating ?? prev.content_rating,
          synopsis: r.synopsis ?? prev.synopsis,
          poster_url: r.poster_url ?? prev.poster_url,
          hero_url: r.hero_url ?? prev.hero_url,
          trailer_url: r.trailer_url ?? prev.trailer_url,
          imdb_id: r.imdb_id ?? prev.imdb_id,
          links,
        };
      });
      const warn = r.warnings?.length ? ` Note: ${r.warnings.join(" ")}` : "";
      setImportMsg({ ok: true, text: `Imported. Check each field, then click Save.${warn}` });
    } catch (e: any) {
      setImportMsg({ ok: false, text: e.message });
    } finally {
      setImporting(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      title: f.title,
      slug: f.slug,
      year: f.year === "" ? null : Number(f.year),
      runtime_minutes: f.runtime_minutes === "" ? null : Number(f.runtime_minutes),
      genres: f.genres.split(",").map((g) => g.trim()).filter(Boolean),
      director: f.director,
      cast_names: f.cast.split(",").map((n) => n.trim()).filter(Boolean),
      content_rating: f.content_rating,
      synopsis: f.synopsis,
      poster_url: f.poster_url,
      hero_url: f.hero_url,
      title_image_url: f.title_image_url,
      trailer_url: f.trailer_url,
      imdb_id: f.imdb_id,
      status: f.status,
      is_featured: f.is_featured,
      links: f.links.filter((l) => l.platform_id && l.url.trim()),
    };
    try {
      await api(id ? `/api/admin/films/${id}` : "/api/admin/films", { method: id ? "PUT" : "POST", body });
      navigate("/admin");
    } catch (err: any) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  function setLink(i: number, patch: Partial<FilmLink>) {
    set("links", f.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  if (loading) return <p>Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          {id ? "Edit" : "Add"} <span className="gold-text">Film</span>
        </h1>
        <Link to="/admin" className="text-xs uppercase tracking-widest text-[#aaa]">
          ← Back to films
        </Link>
      </div>

      {error && <p className="text-red-400 text-sm border border-red-400/40 p-3">{error}</p>}

      <section className="bg-panel border border-gold/30 p-4 space-y-2">
        <label className="label" htmlFor="import">
          Import from URL
        </label>
        <p className="text-xs text-[#777]">Paste an IMDb, Tubi, Prime Video, Apple TV or Vudu link. Nothing is saved until you click Save.</p>
        <div className="flex gap-2">
          <input id="import" className="field" placeholder="https://www.imdb.com/title/tt1234567/" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
          <button type="button" className="btn" disabled={importing || !importUrl.trim()} onClick={runImport}>
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {importMsg && <p className={`text-sm ${importMsg.ok ? "text-green-400" : "text-red-400"}`}>{importMsg.text}</p>}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Title</label>
          <input required className="field" value={f.title} onChange={(e) => onTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Address (slug)</label>
          <input
            required
            className="field"
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
          />
          <p className="text-xs text-[#777] mt-1">The film's web address: /films/{f.slug || "…"}</p>
        </div>
        <div>
          <label className="label">Year</label>
          <input type="number" className="field" value={f.year} onChange={(e) => set("year", e.target.value)} />
        </div>
        <div>
          <label className="label">Runtime (minutes)</label>
          <input type="number" className="field" value={f.runtime_minutes} onChange={(e) => set("runtime_minutes", e.target.value)} />
        </div>
        <div>
          <label className="label">Genres (separate with commas)</label>
          <input className="field" placeholder="Drama, Crime, Romance" value={f.genres} onChange={(e) => set("genres", e.target.value)} />
        </div>
        <div>
          <label className="label">Director</label>
          <input className="field" value={f.director} onChange={(e) => set("director", e.target.value)} />
        </div>
        <div>
          <label className="label">Rating</label>
          <input className="field" placeholder="TV-MA" value={f.content_rating} onChange={(e) => set("content_rating", e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Cast (separate with commas)</label>
        <input className="field" placeholder="Benzino, Renaissance Jones, Shika Simmons" value={f.cast} onChange={(e) => set("cast", e.target.value)} />
      </div>

      <div>
        <label className="label">Synopsis</label>
        <textarea rows={4} className="field" value={f.synopsis} onChange={(e) => set("synopsis", e.target.value)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Status</label>
          <select className="field" value={f.status} onChange={(e) => set("status", e.target.value as Film["status"])}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 mt-6 text-white">
          <input type="checkbox" checked={f.is_featured} onChange={(e) => set("is_featured", e.target.checked)} />
          Featured film (shown in the big banner at the top)
        </label>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <ImageUpload label="Poster" kind="poster" hint="Recommended 1000×1500 (tall)" value={f.poster_url} onChange={(v) => set("poster_url", v)} />
        <ImageUpload label="Hero image" kind="hero" hint="Recommended 2400×1200 (wide)" value={f.hero_url} onChange={(v) => set("hero_url", v)} />
        <ImageUpload label="Title image (optional)" kind="title" hint="Transparent PNG of the film title" value={f.title_image_url} onChange={(v) => set("title_image_url", v)} />
      </div>

      <div>
        <label className="label">Trailer (YouTube link)</label>
        <input className="field" placeholder="https://www.youtube.com/watch?v=..." value={f.trailer_url} onChange={(e) => set("trailer_url", e.target.value)} />
      </div>

      <section>
        <span className="label">Watch links</span>
        <div className="space-y-2">
          {f.links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select className="field !w-48" value={l.platform_id || ""} onChange={(e) => setLink(i, { platform_id: Number(e.target.value) })}>
                <option value="">Choose platform…</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input className="field" placeholder="https://…" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
              <button type="button" className="btn-danger" onClick={() => set("links", f.links.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline mt-3" onClick={() => set("links", [...f.links, { platform_id: 0, url: "" }])}>
          + Add watch link
        </button>
      </section>

      <div className="flex gap-3 pt-2">
        <button className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <Link to="/admin" className="btn-outline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
