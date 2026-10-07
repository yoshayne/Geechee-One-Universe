import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";

type Company = { id: number; name: string; country: string };
type Found = { tmdb_id: number; name: string; roles: string[]; films: number; photo: string | null; already_added: boolean };

export default function AdminTeamImport() {
  const navigate = useNavigate();
  const [q, setQ] = useState("Geechee One Films");
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ added: string[]; skipped: string[]; warnings: string[] } | null>(null);

  async function search() {
    setBusy("Searching…");
    setError("");
    setFound(null);
    try {
      setCompanies(await api<Company[]>(`/api/admin/tmdb/companies?q=${encodeURIComponent(q)}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function loadPeople(id: number) {
    setBusy("Reading the credits on every film… this can take up to a minute.");
    setError("");
    try {
      setFound(await api<Found[]>(`/api/admin/tmdb/companies/${id}/people`));
      setPicked({});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  function toggle(p: Found) {
    const next = { ...picked };
    if (p.tmdb_id in next) delete next[p.tmdb_id];
    else next[p.tmdb_id] = p.roles.join(", ");
    setPicked(next);
  }

  async function runImport() {
    setBusy("Importing…");
    setError("");
    try {
      const people = Object.entries(picked).map(([id, role]) => ({ tmdb_id: Number(id), role }));
      setResult(await api("/api/admin/tmdb/people/import", { body: { people } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Import <span className="gold-text">finished</span>
        </h1>
        <p className="text-green-400">Added {result.added.length}: {result.added.join(", ") || "none"}.</p>
        {result.skipped.length > 0 && <p>Already on the team: {result.skipped.join(", ")}.</p>}
        {result.warnings.map((w) => (
          <p key={w} className="text-yellow-400 text-sm">
            {w}
          </p>
        ))}
        <p className="text-sm text-[#999]">Everyone is hidden for now. Open each person with Edit, fix their title and bio, and tick "Show on site" when they are ready.</p>
        <button className="btn" onClick={() => navigate("/admin/team")}>
          Go to team
        </button>
      </div>
    );
  }

  const count = Object.keys(picked).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Import <span className="gold-text">team</span>
        </h1>
        <Link to="/admin/team" className="text-xs uppercase tracking-widest text-[#aaa]">
          ← Back to team
        </Link>
      </div>
      <p className="text-sm text-[#999]">
        TMDB lists people by their film credits, not by who works at the company. This shows the directors, writers, producers and main cast on the company's films. Tick only the people who belong on your team page.
      </p>
      {error && <p className="text-red-400 text-sm border border-red-400/40 p-3">{error}</p>}
      {busy && <p className="text-gold text-sm">{busy}</p>}

      <div className="flex gap-2">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Production company name" />
        <button className="btn" disabled={!q.trim() || Boolean(busy)} onClick={search}>
          Search
        </button>
      </div>

      {companies && companies.length === 0 && <p className="text-[#999]">No company found with that name.</p>}
      {companies && companies.length > 0 && !found && (
        <div className="space-y-2">
          <p className="label">Pick the company</p>
          {companies.map((c) => (
            <button key={c.id} disabled={Boolean(busy)} onClick={() => loadPeople(c.id)} className="block w-full text-left bg-panel border border-white/10 hover:border-gold px-4 py-3 text-white">
              {c.name} <span className="text-xs text-[#888]">{c.country}</span>
            </button>
          ))}
        </div>
      )}

      {found && (
        <div className="space-y-4">
          {found.length === 0 ? (
            <p className="text-[#999]">No credits found for that company.</p>
          ) : (
            <>
              <p className="label">Most-credited people first ({count} selected)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {found.map((p) => (
                  <div key={p.tmdb_id} className={`bg-panel border p-2 ${p.tmdb_id in picked ? "border-gold" : "border-white/10"} ${p.already_added ? "opacity-50" : ""}`}>
                    <label className="block cursor-pointer">
                      {p.photo ? <img src={p.photo} alt="" className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square bg-ink" />}
                      <span className="flex items-start gap-2 mt-2 text-sm text-white">
                        <input type="checkbox" disabled={p.already_added} checked={p.tmdb_id in picked} onChange={() => toggle(p)} />
                        <span>
                          {p.name}
                          <em className="block text-xs text-[#999] not-italic">
                            {p.roles.join(", ")} · {p.films} film{p.films === 1 ? "" : "s"}
                          </em>
                          {p.already_added && <em className="block text-xs text-[#888]">already added</em>}
                        </span>
                      </span>
                    </label>
                    {p.tmdb_id in picked && (
                      <input
                        className="field mt-2 !py-1 text-xs"
                        aria-label={`Title for ${p.name}`}
                        value={picked[p.tmdb_id]}
                        onChange={(e) => setPicked({ ...picked, [p.tmdb_id]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
              <button className="btn" disabled={count === 0 || Boolean(busy)} onClick={runImport}>
                Import {count} selected
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
