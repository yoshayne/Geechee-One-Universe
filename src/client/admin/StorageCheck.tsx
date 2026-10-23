import { useState } from "react";
import { api } from "./api";

type Result = {
  ok: boolean;
  summary: string;
  steps: { step: string; ok: boolean; message: string }[];
  settings: { endpoint: string; bucket: string; addressing: string; region: string; keysFingerprint: string };
};

// One-click test of the image bucket: writes a tiny file, reads it back, deletes it.
export default function StorageCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api<Result>("/api/admin/storage-check"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-white/10 pt-8 max-w-2xl">
      <h2 className="font-serif font-bold text-xl uppercase text-white">
        Image <span className="gold-text">storage</span>
      </h2>
      <p className="text-sm text-[#999]">If uploaded images show as broken, run this test. It says in plain words what is wrong, such as old bucket keys after a rotation.</p>
      <button type="button" className="btn" disabled={busy} onClick={run}>
        {busy ? "Testing…" : "Test image storage"}
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {result && (
        <div className="space-y-3" role="status">
          <p className={`text-sm font-semibold ${result.ok ? "text-green-400" : "text-red-400"}`}>{result.summary}</p>
          <ul className="text-sm space-y-1">
            {result.steps.map((s) => (
              <li key={s.step} className={s.ok ? "text-green-400" : "text-red-400"}>
                {s.ok ? "✓" : "✗"} {s.step}: {s.message}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#777]">
            Endpoint: {result.settings.endpoint} · Bucket: {result.settings.bucket} · Addressing: {result.settings.addressing} · Region: {result.settings.region} · Keys code: {result.settings.keysFingerprint}
          </p>
          <p className="text-xs text-[#777]">The keys code changes whenever the access key, bucket or endpoint changes. If it did not change after you updated the keys, the new keys are not in use yet. Redeploy.</p>
        </div>
      )}
    </section>
  );
}
