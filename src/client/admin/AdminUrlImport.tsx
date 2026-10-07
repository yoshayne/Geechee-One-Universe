import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";

type Movie = { url: string; title: string; year: number | null; image: string | null; already_added: boolean };
type Outcome = { title: string; status: "added" | "updated" | "skipped" | "failed"; note?: string };

export default function AdminUrlImport() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [movies, setMovies] = useState<Movie[] | null>(null);
  const [others, setOthers] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Outcome[] | null>(null);

  async function find() {
    setBusy("Reading the page…");
    setError("");
    setMovies(null);
    try {
      const r = await api<{ movies: Movie[]; others: number }>("/api/admin/bulk/list", { body: { url } });
      setMovies(r.movies);
      setOthers(r.others);
      setPicked(new Set(r.movies.filter((m) => !m.already_added).map((m) => m.url)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  function toggle(u: string) {
    const next = new Set(picked);
    if (next.has(u)) next.delete(u);
    else next.add(u);
    setPicked(next);
  }

  // One film at a time, two in parallel, so you can watch progress and one slow page can't block the rest.
  async function runImport() {
    const queue = movies!.filter((m) => picked.has(m.url));
    const out: Outcome[] = [];
    let next = 0;
    setError("");
    setBusy("Importing…");
    setProgress({ done: 0, total: queue.length });
    async function worker() {
      while (next < queue.length) {
        const m = queue[next++];
        try {
          const r = await api<{ status: Outcome["status"]; title: string }>("/api/admin/bulk/film", { body: { url: m.url } });
          out.push({ title: r.title, status: r.status });
        } catch (e: any) {
          out.push({ title: m.title, status: "failed", note: e.message });
        }
        setProgress({ done: out.length, total: queue.length });
      }
    }
    await Promise.all([worker(), worker()]);
    setBusy("");
    setProgress(null);
    setResults(out);
  }

  if (results) {
    const by = (s: Outcome["status"]) => results.filter((r) => r.status === s);
    return (
      <div className="space-y-4">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Import <span className="gold-text">finished</span>
        </h1>
        <p className="text-green-400">Added {by("added").length} new film(s) as drafts{by("added").length ? `: ${by("added").map((r) => r.title).join(", ")}` : ""}.</p>
        {by("updated").length > 0 && <p className="text-green-400">Filled in missing details on {by("updated").length} existing film(s): {by("updated").map((r) => r.title).join(", ")}.</p>}
        {by("skipped").length > 0 && <p>Already complete, left alone: {by("skipped").map((r) => r.title).join(", ")}.</p>}
        {by("failed").map((r) => (
          <p key={r.title} className="text-red-400 text-sm">
            Could not import {r.title}: {r.note}
          </p>
        ))}
        <p className="text-sm text-[#999]">New films are hidden drafts. Open each one with Edit to check it, then switch it live.</p>
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
          Import from <span className="gold-text">a page</span>
        </h1>
        <Link to="/admin" className="text-xs uppercase tracking-widest text-[#aaa]">
          ← Back to films
        </Link>
      </div>
      <p className="text-sm text-[#999]">
        Paste a page that lists many films, like a Tubi person page (tubitv.com/person/…). Each film is read from its own page and saved as a hidden draft with its details, poster, cast and watch link. Use this for films TMDB doesn't have.
      </p>
      {error && <p className="text-red-400 text-sm border border-red-400/40 p-3">{error}</p>}
      {busy && (
        <p className="text-gold text-sm" role="status">
          {busy} {progress ? `${progress.done} of ${progress.total} done` : ""}
        </p>
      )}

      <div className="flex gap-2">
        <input className="field" placeholder="https://tubitv.com/person/935674/felicia-rivers" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={!url.trim() || Boolean(busy)} onClick={find}>
          Find films
        </button>
      </div>

      {movies && (
        <div className="space-y-4">
          <p className="label">
            Found {movies.length} film{movies.length === 1 ? "" : "s"} ({picked.size} selected)
          </p>
          {others > 0 && <p className="text-xs text-[#888]">{others} TV series or other item(s) on that page were left out.</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {movies.map((m) => (
              <label key={m.url} className={`block bg-panel border p-2 cursor-pointer ${picked.has(m.url) ? "border-gold" : "border-white/10"}`}>
                {m.image ? <img src={m.image} alt="" loading="lazy" className="w-full aspect-[2/3] object-cover" /> : <div className="w-full aspect-[2/3] bg-ink" />}
                <span className="flex items-start gap-2 mt-2 text-sm text-white">
                  <input type="checkbox" checked={picked.has(m.url)} onChange={() => toggle(m.url)} />
                  <span>
                    {m.title} {m.year ? `(${m.year})` : ""}
                    {m.already_added && <em className="block text-xs text-[#888] not-italic">already added (missing details will be filled in)</em>}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn" disabled={picked.size === 0 || Boolean(busy)} onClick={runImport}>
              Import {picked.size} selected
            </button>
            <button className="btn-outline" onClick={() => setPicked(new Set(movies.map((m) => m.url)))}>
              Select all
            </button>
            <button className="btn-outline" onClick={() => setPicked(new Set())}>
              Select none
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
