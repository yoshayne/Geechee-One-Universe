import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Film } from "./api";

export default function AdminFilms() {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<Film[]>("/api/admin/films")
      .then(setFilms)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function drop(to: number) {
    if (dragFrom === null || !films || dragFrom === to) return;
    const next = [...films];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(to, 0, moved);
    setFilms(next);
    setDragFrom(null);
    try {
      await api("/api/admin/films/reorder", { method: "PUT", body: { ids: next.map((f) => f.id) } });
    } catch (e: any) {
      setError(e.message);
      load();
    }
  }

  async function remove(f: Film) {
    if (!window.confirm(`Delete "${f.title}"? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/films/${f.id}`, { method: "DELETE" });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(f.id);
        return next;
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function setLive(ids: number[], live: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ changed: number }>("/api/admin/films/bulk-status", { method: "PUT", body: { ids, live } });
      setNotice(r.changed === 0 ? "Nothing needed changing." : `${r.changed} film(s) ${live ? "are now live" : "moved back to draft"}.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const allSelected = Boolean(films && films.length > 0 && films.every((f) => selected.has(f.id)));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((films || []).map((f) => f.id)));
  const ids = [...selected];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Our <span className="gold-text">Films</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/films/import-url" className="btn-outline">
            Import from a page
          </Link>
          <Link to="/admin/films/import" className="btn-outline">
            Import all from TMDB
          </Link>
          <Link to="/admin/films/new" className="btn">
            Add Film
          </Link>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {notice && <p className="text-green-400 text-sm mb-4">{notice}</p>}
      {!films ? (
        <p>Loading…</p>
      ) : films.length === 0 ? (
        <p className="text-[#999]">No films yet. Click "Add Film" to create the first one.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3 bg-panel border border-white/10 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Select all
            </label>
            <span className="text-xs text-[#888]">{selected.size} selected</span>
            <button className="btn" disabled={busy || selected.size === 0} onClick={() => setLive(ids, true)}>
              Make live
            </button>
            <button className="btn-outline" disabled={busy || selected.size === 0} onClick={() => setLive(ids, false)}>
              Back to draft
            </button>
          </div>
          <p className="text-xs text-[#777] mb-2">Drag a row up or down to change the order on the site. Live films show on the public site; drafts stay hidden.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-[#888] border-b border-white/10">
                  <th className="py-2 w-6"></th>
                  <th className="w-8"></th>
                  <th className="w-16">Poster</th>
                  <th>Title</th>
                  <th>Live</th>
                  <th>Featured</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {films.map((f, i) => {
                  const isLive = f.status !== "draft";
                  return (
                    <tr
                      key={f.id}
                      draggable
                      onDragStart={() => setDragFrom(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => drop(i)}
                      className="border-b border-white/10 hover:bg-white/5"
                    >
                      <td className="cursor-grab text-[#666] select-none">⋮⋮</td>
                      <td>
                        <input type="checkbox" aria-label={`Select ${f.title}`} checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} />
                      </td>
                      <td className="py-2">
                        {f.poster_url ? <img src={f.poster_url} alt="" className="h-16 w-11 object-cover" /> : <div className="h-16 w-11 bg-panel" />}
                      </td>
                      <td className="text-white">{f.title}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            role="switch"
                            aria-checked={isLive}
                            aria-label={`${f.title} is ${isLive ? "live" : "a draft"}`}
                            disabled={busy}
                            onClick={() => setLive([f.id], !isLive)}
                            className={`relative h-6 w-11 rounded-full transition-colors ${isLive ? "bg-gold" : "bg-white/20"}`}
                          >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${isLive ? "left-[22px]" : "left-0.5"}`} />
                          </button>
                          <span className={`text-xs uppercase tracking-widest ${isLive ? "text-gold" : "text-[#777]"}`}>
                            {f.status === "coming_soon" ? "Coming soon" : isLive ? "Live" : "Draft"}
                          </span>
                        </div>
                      </td>
                      <td className="text-gold text-lg">{f.is_featured ? "★" : ""}</td>
                      <td className="text-right space-x-2 whitespace-nowrap">
                        <Link to={`/admin/films/${f.id}`} className="btn-outline">
                          Edit
                        </Link>
                        <button onClick={() => remove(f)} className="btn-danger">
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
