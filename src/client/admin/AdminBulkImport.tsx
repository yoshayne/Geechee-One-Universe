import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";

type Company = { id: number; name: string; country: string };
type Movie = { tmdb_id: number; title: string; year: number | null; poster: string | null; already_added: boolean };

export default function AdminBulkImport() {
  const navigate = useNavigate();
  const [q, setQ] = useState("Geechee One Films");
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [movies, setMovies] = useState<Movie[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ added: string[]; updated: string[]; skipped: string[]; warnings: string[] } | null>(null);

  async function search() {
    setBusy("Searching…");
    setError("");
    setMovies(null);
    try {
      setCompanies(await api<Company[]>(`/api/admin/tmdb/companies?q=${encodeURIComponent(q)}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function loadMovies(id: number) {
    setBusy("Loading films…");
    setError("");
    try {
      const list = await api<Movie[]>(`/api/admin/tmdb/companies/${id}/movies`);
      setMovies(list);
      setPicked(new Set(list.filter((m) => !m.already_added).map((m) => m.tmdb_id)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    setBusy("Importing… this can take a minute.");
    setError("");
    try {
      setResult(await api("/api/admin/tmdb/import", { body: { ids: [...picked] } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  function toggle(id: number) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  if (result) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Import <span className="gold-text">finished</span>
        </h1>
        <p className="text-green-400">Added {result.added.length} film(s) as drafts: {result.added.join(", ") || "none"}.</p>
        {result.updated.length > 0 && <p className="text-green-400">Filled in missing artwork or watch links for {result.updated.length} existing film(s): {result.updated.join(", ")}.</p>}
        {result.skipped.length > 0 && <p>Skipped (already on the site with artwork): {result.skipped.join(", ")}.</p>}
        {result.warnings.map((w) => (
          <p key={w} className="text-yellow-400 text-sm">
            {w}
          </p>
        ))}
        <p className="text-sm text-[#999]">Watch links come from TMDB (JustWatch) and point to a JustWatch page for the film, not straight to the streaming service. Open each film to swap in the direct Tubi, Prime Video, Apple TV or Vudu link. Drafts are hidden from the public site. Open each one with Edit, fix anything you need, then change its status to Released or Coming soon.</p>
        <button className="btn" onClick={() => navigate("/admin")}>
          Go to films
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Import <span className="gold-text">all films</span>
        </h1>
        <Link to="/admin" className="text-xs uppercase tracking-widest text-[#aaa]">
          ← Back to films
        </Link>
      </div>
      <p className="text-sm text-[#999]">
        Finds every film listed under a production company on TMDB and adds it as a hidden draft. You can edit each one afterward.
      </p>
      {error && <p className="text-red-400 text-sm border border-red-400/40 p-3">{error}</p>}
      {busy && <p className="text-gold text-sm">{busy}</p>}

      <div className="flex gap-2">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Production company name" />
        <button className="btn" disabled={!q.trim() || Boolean(busy)} onClick={search}>
          Search
        </button>
      </div>

      {companies && companies.length === 0 && <p className="text-[#999]">No company found with that name. Try a shorter name.</p>}
      {companies && companies.length > 0 && !movies && (
        <div className="space-y-2">
          <p className="label">Pick the company</p>
          {companies.map((c) => (
            <button key={c.id} onClick={() => loadMovies(c.id)} className="block w-full text-left bg-panel border border-white/10 hover:border-gold px-4 py-3 text-white">
              {c.name} <span className="text-xs text-[#888]">{c.country}</span>
            </button>
          ))}
        </div>
      )}

      {movies && (
        <div className="space-y-4">
          {movies.length === 0 ? (
            <p className="text-[#999]">TMDB lists no films for that company. Pick another company, or add films by hand.</p>
          ) : (
            <>
              <p className="label">Choose the films to import ({picked.size} selected)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {movies.map((m) => (
                  <label key={m.tmdb_id} className={`block bg-panel border p-2 cursor-pointer ${picked.has(m.tmdb_id) ? "border-gold" : "border-white/10"}`}>
                    {m.poster ? <img src={m.poster} alt="" className="w-full aspect-[2/3] object-cover" /> : <div className="w-full aspect-[2/3] bg-ink" />}
                    <span className="flex items-start gap-2 mt-2 text-sm text-white">
                      <input type="checkbox" checked={picked.has(m.tmdb_id)} onChange={() => toggle(m.tmdb_id)} />
                      <span>
                        {m.title} {m.year ? `(${m.year})` : ""}
                        {m.already_added && <em className="block text-xs text-[#888]">already added</em>}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn" disabled={picked.size === 0 || Boolean(busy)} onClick={runImport}>
                  Import {picked.size} selected
                </button>
                {movies.some((m) => m.already_added) && (
                  <button className="btn-outline" onClick={() => setPicked(new Set(movies.map((m) => m.tmdb_id)))}>
                    Select all (also fills in missing artwork and watch links on films already added)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
