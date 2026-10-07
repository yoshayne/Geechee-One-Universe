import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Film, STATUS_LABELS } from "./api";

export default function AdminFilms() {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [error, setError] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);

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
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Our <span className="gold-text">Films</span>
        </h1>
        <Link to="/admin/films/new" className="btn">
          Add Film
        </Link>
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {!films ? (
        <p>Loading…</p>
      ) : films.length === 0 ? (
        <p className="text-[#999]">No films yet. Click "Add Film" to create the first one.</p>
      ) : (
        <>
          <p className="text-xs text-[#777] mb-2">Drag a row up or down to change the order on the site.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-[#888] border-b border-white/10">
                  <th className="py-2 w-6"></th>
                  <th className="py-2 w-16">Poster</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Featured</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {films.map((f, i) => (
                  <tr
                    key={f.id}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => drop(i)}
                    className="border-b border-white/10 hover:bg-white/5"
                  >
                    <td className="cursor-grab text-[#666] select-none">⋮⋮</td>
                    <td className="py-2">
                      {f.poster_url ? <img src={f.poster_url} alt="" className="h-16 w-11 object-cover" /> : <div className="h-16 w-11 bg-panel" />}
                    </td>
                    <td className="text-white">{f.title}</td>
                    <td>{STATUS_LABELS[f.status]}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
