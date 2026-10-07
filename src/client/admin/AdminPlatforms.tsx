import { useEffect, useState } from "react";
import { api, Platform } from "./api";
import ImageUpload from "./ImageUpload";

type Draft = { name: string; label: string; logo_url: string };
const blank: Draft = { name: "", label: "", logo_url: "" };

export default function AdminPlatforms() {
  const [items, setItems] = useState<Platform[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [adding, setAdding] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const rows = await api<Platform[]>("/api/admin/platforms");
      setItems(rows);
      setDrafts(Object.fromEntries(rows.map((p) => [p.id, { name: p.name, label: p.label ?? "", logo_url: p.logo_url ?? "" }])));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function run(fn: () => Promise<unknown>, okMsg = "") {
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(okMsg);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const patch = (id: number, d: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...d } }));

  function move(i: number, dir: -1 | 1) {
    if (!items) return;
    const ids = items.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api("/api/admin/platforms/reorder", { method: "PUT", body: { ids } }));
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif font-bold text-3xl uppercase text-white">
        Stream<span className="gold-text">ing Platforms</span>
      </h1>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {notice && <p className="text-green-400 text-sm">{notice}</p>}

      {!items ? (
        <p>Loading…</p>
      ) : (
        items.map((p, i) => {
          const d = drafts[p.id];
          if (!d) return null;
          return (
            <div key={p.id} className="bg-panel border border-white/10 p-4 grid md:grid-cols-[auto,1fr,1fr,auto] gap-4 items-start">
              <div className="flex md:flex-col gap-1">
                <button className="btn-outline !px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button className="btn-outline !px-2" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Name</label>
                  <input className="field" value={d.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Label under the logo</label>
                  <input className="field" placeholder="Free Streaming" value={d.label} onChange={(e) => patch(p.id, { label: e.target.value })} />
                </div>
              </div>
              <ImageUpload label="Logo" kind="platform" hint="Transparent PNG or SVG" value={d.logo_url} onChange={(v) => patch(p.id, { logo_url: v })} />
              <div className="flex flex-col gap-2">
                <button className="btn" onClick={() => run(() => api(`/api/admin/platforms/${p.id}`, { method: "PUT", body: d }), `Saved ${d.name}.`)}>
                  Save
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (window.confirm(`Delete ${p.name}? Any watch links using it will be removed too.`)) {
                      run(() => api(`/api/admin/platforms/${p.id}`, { method: "DELETE" }), `Deleted ${p.name}.`);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })
      )}

      <div className="bg-panel border border-gold/30 p-4 space-y-3">
        <h2 className="font-serif font-bold text-xl uppercase text-white">
          Add a <span className="gold-text">platform</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <input className="field" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Label under the logo</label>
            <input className="field" placeholder="Rent or Buy" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
          </div>
        </div>
        <ImageUpload label="Logo" kind="platform" hint="Transparent PNG or SVG" value={adding.logo_url} onChange={(v) => setAdding({ ...adding, logo_url: v })} />
        <button
          className="btn"
          disabled={!adding.name.trim()}
          onClick={() =>
            run(async () => {
              await api("/api/admin/platforms", { body: adding });
              setAdding(blank);
            }, "Platform added.")
          }
        >
          Add platform
        </button>
      </div>
    </div>
  );
}
