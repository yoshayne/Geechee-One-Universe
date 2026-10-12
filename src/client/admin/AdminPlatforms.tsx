import { useEffect, useState } from "react";
import { api, LogoMode, Platform } from "./api";
import ImageUpload from "./ImageUpload";
import { detectLogoMode } from "./detectLogoMode";
import { PlatformMark } from "../site/shared";

type Draft = { name: string; label: string; logo_url: string; logo_mode: LogoMode };
const blank: Draft = { name: "", label: "", logo_url: "", logo_mode: "original" };

const MODE_LABELS: Record<LogoMode, string> = {
  original: "As uploaded",
  white: "Turn solid white",
  light: "On a light tile (for dark logos)",
};

// Shows the logo the way visitors will see it, on the site's black background.
function LogoPreview({ draft }: { draft: Draft }) {
  if (!draft.logo_url) return null;
  return (
    <div>
      <span className="label">How it looks on the site</span>
      <div className="inline-flex items-center bg-ink border border-white/20 px-4 py-3">
        <PlatformMark name={draft.name || "Logo"} logoUrl={draft.logo_url} mode={draft.logo_mode} className="h-10" />
      </div>
    </div>
  );
}

export default function AdminPlatforms() {
  const [items, setItems] = useState<Platform[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [adding, setAdding] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const toDraft = (p: Platform): Draft => ({ name: p.name, label: p.label ?? "", logo_url: p.logo_url ?? "", logo_mode: p.logo_mode ?? "original" });
  const isDirty = (p: Platform, d: Draft) => d.name !== p.name || d.label !== (p.label ?? "") || d.logo_url !== (p.logo_url ?? "") || d.logo_mode !== p.logo_mode;

  // Reloads the list from the server. Edits you have not saved yet on other rows are kept,
  // except for the row named in savedId, which is refreshed to what was just saved.
  async function load(savedId?: number) {
    try {
      const rows = await api<Platform[]>("/api/admin/platforms");
      setItems(rows);
      setDrafts((prev) => Object.fromEntries(rows.map((p) => [p.id, prev[p.id] && p.id !== savedId ? prev[p.id] : toDraft(p)])));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function run(fn: () => Promise<unknown>, okMsg = "", savedId?: number) {
    setError("");
    setNotice("");
    try {
      await fn();
      await load(savedId);
      setNotice(okMsg);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function autoMode(url: string, apply: (m: LogoMode) => void) {
    const mode = await detectLogoMode(url);
    apply(mode);
    setNotice(
      mode === "light"
        ? "This logo has dark parts that would disappear on the black site, so it will be shown on a light tile. You can change it under Logo display."
        : ""
    );
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
                <div>
                  <label className="label">Logo display</label>
                  <select className="field" value={d.logo_mode} onChange={(e) => patch(p.id, { logo_mode: e.target.value as LogoMode })}>
                    {(Object.keys(MODE_LABELS) as LogoMode[]).map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <ImageUpload
                  label="Logo"
                  kind="platform"
                  hint="Transparent PNG or SVG"
                  value={d.logo_url}
                  onChange={(v) => patch(p.id, { logo_url: v })}
                  onUploaded={(url) => autoMode(url, (m) => patch(p.id, { logo_mode: m }))}
                />
                <LogoPreview draft={d} />
              </div>
              <div className="flex flex-col gap-2">
                {isDirty(p, d) && <span className="text-xs text-gold">Unsaved changes</span>}
                <button className="btn" onClick={() => run(() => api(`/api/admin/platforms/${p.id}`, { method: "PUT", body: d }), `Saved ${d.name}.`, p.id)}>
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
        <ImageUpload
          label="Logo"
          kind="platform"
          hint="Transparent PNG or SVG"
          value={adding.logo_url}
          onChange={(v) => setAdding((a) => ({ ...a, logo_url: v }))}
          onUploaded={(url) => autoMode(url, (m) => setAdding((a) => ({ ...a, logo_mode: m })))}
        />
        <div className="max-w-xs">
          <label className="label">Logo display</label>
          <select className="field" value={adding.logo_mode} onChange={(e) => setAdding({ ...adding, logo_mode: e.target.value as LogoMode })}>
            {(Object.keys(MODE_LABELS) as LogoMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <LogoPreview draft={adding} />
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
