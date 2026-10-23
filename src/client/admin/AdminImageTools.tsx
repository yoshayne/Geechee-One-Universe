import { useEffect, useState } from "react";
import { api } from "./api";
import StorageCheck from "./StorageCheck";

type Preview = {
  checked: number;
  externalLeftAlone: number;
  repairable: number;
  perSource: { source: string; checked: number; repairable: number; unparseable: number }[];
  samples: { source: string; id: string; before: string; after: string; inBucket: "yes" | "no" | "unknown" }[];
  unparseable: { source: string; id: string; shown: string }[];
  inBucket: { found: number; missing: number; unknown: number; checkedCount: number };
  storageNote: string;
  fingerprint: string;
};

const BUCKET_LABEL = { yes: "file found", no: "file NOT in bucket", unknown: "not checked" } as const;

export default function AdminImageTools() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [last, setLast] = useState<{ rows: number; at: string } | null>(null);

  const loadStatus = () =>
    api<{ lastRepair: { rows: number; at: string } | null }>("/api/admin/image-repair/status")
      .then((r) => setLast(r.lastRepair))
      .catch(() => setLast(null));
  useEffect(() => {
    loadStatus();
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const runPreview = () =>
    run("Looking through every saved image link…", async () => {
      setConfirming(false);
      setPreview(await api<Preview>("/api/admin/image-repair/preview", { method: "POST" }));
    });

  const apply = () =>
    run("Repairing…", async () => {
      const r = await api<{ repaired: number; skippedChanged: number }>("/api/admin/image-repair/apply", { body: { fingerprint: preview!.fingerprint } });
      setNotice(`Repaired ${r.repaired} link(s). A backup was saved first, so you can undo it below.${r.skippedChanged ? ` ${r.skippedChanged} were edited meanwhile and left alone.` : ""}`);
      setPreview(null);
      setConfirming(false);
      await loadStatus();
    });

  const undo = () => {
    if (!window.confirm("Put the links from the last repair back the way they were?")) return;
    return run("Undoing…", async () => {
      const r = await api<{ restored: number; skippedChanged: number }>("/api/admin/image-repair/undo", { method: "POST" });
      setNotice(`Restored ${r.restored} link(s).${r.skippedChanged ? ` ${r.skippedChanged} were changed after the repair, so they were left as they are now.` : ""}`);
      setPreview(null);
      await loadStatus();
    });
  };

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Image <span className="gold-text">tools</span>
        </h1>
        <p className="mt-2 text-sm text-[#999]">For when uploaded images look broken, for example after the bucket keys were rotated.</p>
      </div>
      {error && <p className="text-red-400 text-sm border border-red-400/40 p-3">{error}</p>}
      {notice && <p className="text-green-400 text-sm border border-green-400/40 p-3">{notice}</p>}
      {busy && (
        <p className="text-gold text-sm" role="status">
          {busy}
        </p>
      )}

      <StorageCheck />

      <section className="space-y-4 border-t border-white/10 pt-8">
        <h2 className="font-serif font-bold text-xl uppercase text-white">
          Repair <span className="gold-text">saved links</span>
        </h2>
        <p className="text-sm text-[#999]">
          Finds image links saved as full bucket addresses or signed links, which stop working when the keys change, and rewrites them to the permanent <code>/media/…</code> form. Step 1 only looks. Nothing changes until you confirm in step 2.
        </p>
        <p className="text-xs text-[#777]">Photo links on this site are made fresh every time a page loads and are never saved in a cache, so there is nothing to "refresh".</p>

        <button className="btn" disabled={Boolean(busy)} onClick={runPreview}>
          Step 1: Preview (changes nothing)
        </button>

        {preview && (
          <div className="space-y-4">
            <p className="text-white">
              Looked at <strong>{preview.checked}</strong> saved image links. <strong className="text-gold">{preview.repairable}</strong> can be repaired.{" "}
              <strong className={preview.unparseable.length ? "text-yellow-400" : ""}>{preview.unparseable.length}</strong> could not be read and will be left alone.{" "}
              {preview.externalLeftAlone} link(s) to other sites (like TMDB or Tubi) are fine and untouched.
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-[#888] border-b border-white/10">
                  <th className="py-2">Where</th>
                  <th>Checked</th>
                  <th>Repairable</th>
                  <th>Unreadable</th>
                </tr>
              </thead>
              <tbody>
                {preview.perSource.map((p) => (
                  <tr key={p.source} className="border-b border-white/10">
                    <td className="py-1 text-white">{p.source}</td>
                    <td>{p.checked}</td>
                    <td className={p.repairable ? "text-gold" : ""}>{p.repairable}</td>
                    <td className={p.unparseable ? "text-yellow-400" : ""}>{p.unparseable}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {preview.storageNote ? (
              <p className="text-yellow-400 text-sm">{preview.storageNote}</p>
            ) : (
              preview.repairable > 0 && (
                <p className="text-sm text-[#bbb]">
                  Files found in the bucket: {preview.inBucket.found} · not in the bucket: <span className={preview.inBucket.missing ? "text-red-400" : ""}>{preview.inBucket.missing}</span>
                  {preview.inBucket.checkedCount < preview.repairable && ` (checked the first ${preview.inBucket.checkedCount})`}. A link to a file that is not in the bucket will still look broken after repair. The file itself needs uploading again.
                </p>
              )
            )}

            {preview.samples.length > 0 && (
              <div className="space-y-2">
                <p className="label">Sample of what would change (first {preview.samples.length})</p>
                {preview.samples.map((s) => (
                  <div key={s.source + s.id} className="bg-panel border border-white/10 p-3 text-xs space-y-1 break-all">
                    <p className="text-[#888]">
                      {s.source} · row {s.id} · {BUCKET_LABEL[s.inBucket]}
                    </p>
                    <p className="text-red-300">Before: {s.before}</p>
                    <p className="text-green-300">After: {s.after}</p>
                  </div>
                ))}
                <p className="text-xs text-[#777]">Signatures and access key IDs in the old links are hidden on screen.</p>
              </div>
            )}

            {preview.unparseable.length > 0 && (
              <div className="space-y-2">
                <p className="label text-yellow-400">Could not read these (left exactly as they are)</p>
                {preview.unparseable.map((u) => (
                  <p key={u.source + u.id} className="text-xs text-[#bbb] break-all">
                    {u.source} · row {u.id} · {u.shown}
                  </p>
                ))}
              </div>
            )}

            {preview.repairable > 0 && !confirming && (
              <button className="btn-outline" disabled={Boolean(busy)} onClick={() => setConfirming(true)}>
                Step 2: Continue to repair…
              </button>
            )}
            {confirming && (
              <div className="border border-gold p-4 space-y-3">
                <p className="text-white text-sm">
                  This will change <strong>{preview.repairable}</strong> saved link(s). The original of every one is saved in a backup first, and you can undo it afterwards.
                </p>
                <div className="flex gap-3">
                  <button className="btn" disabled={Boolean(busy)} onClick={apply}>
                    Yes, repair {preview.repairable} link(s)
                  </button>
                  <button className="btn-outline" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {preview.repairable === 0 && <p className="text-green-400 text-sm">Nothing needs repairing.</p>}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-white/10 pt-8">
        <h2 className="font-serif font-bold text-xl uppercase text-white">
          Undo <span className="gold-text">last repair</span>
        </h2>
        {last ? (
          <>
            <p className="text-sm text-[#bbb]">
              Last repair: {last.rows} link(s), {new Date(last.at).toLocaleString()}. Links you edited since are kept as you left them.
            </p>
            <button className="btn-danger" disabled={Boolean(busy)} onClick={undo}>
              Undo last repair
            </button>
          </>
        ) : (
          <p className="text-sm text-[#777]">No repair to undo.</p>
        )}
      </section>
    </div>
  );
}
