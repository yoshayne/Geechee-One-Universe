import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Person } from "./api";

export default function AdminTeam() {
  const [items, setItems] = useState<Person[] | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    api<Person[]>("/api/admin/team")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function move(i: number, dir: -1 | 1) {
    if (!items) return;
    const ids = items.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api("/api/admin/team/reorder", { method: "PUT", body: { ids } });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(p: Person) {
    if (!window.confirm(`Delete ${p.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/team/${p.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Our <span className="gold-text">Team</span>
        </h1>
        <div className="flex gap-2">
          <Link to="/admin/team/import" className="btn-outline">
            Import from TMDB
          </Link>
          <Link to="/admin/team/new" className="btn">
            Add Person
          </Link>
        </div>
      </div>
      <p className="text-sm text-[#999] mb-6">People shown in the About section of the public site. Only people marked "Show on site" appear.</p>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {!items ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[#999]">No one yet. Use "Import from TMDB" or "Add Person".</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-[#888] border-b border-white/10">
              <th className="py-2 w-20">Order</th>
              <th className="w-16">Photo</th>
              <th>Name</th>
              <th>Title</th>
              <th>On site</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p, i) => (
              <tr key={p.id} className="border-b border-white/10">
                <td className="py-2 whitespace-nowrap">
                  <button className="btn-outline !px-2 mr-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button className="btn-outline !px-2" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    ↓
                  </button>
                </td>
                <td>{p.photo_url ? <img src={p.photo_url} alt="" className="h-14 w-14 object-cover rounded-full" /> : <div className="h-14 w-14 rounded-full bg-panel" />}</td>
                <td className="text-white">{p.name}</td>
                <td>{p.role}</td>
                <td className={p.is_visible ? "text-green-400" : "text-[#777]"}>{p.is_visible ? "Shown" : "Hidden"}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  <Link to={`/admin/team/${p.id}`} className="btn-outline">
                    Edit
                  </Link>
                  <button onClick={() => remove(p)} className="btn-danger">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
