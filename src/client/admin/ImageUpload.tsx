import { useState } from "react";
import { api } from "./api";

type Props = {
  label: string;
  hint: string;
  kind: "poster" | "hero" | "title" | "logo" | "about" | "platform";
  value: string;
  onChange: (url: string) => void;
};

export default function ImageUpload({ label, hint, kind, value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind === "logo" || kind === "platform" ? "logo" : kind);
      const res = await api<{ url: string }>("/api/admin/upload", { form });
      onChange(res.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const accept = kind === "logo" || kind === "platform" ? "image/jpeg,image/png,image/webp,image/svg+xml" : "image/jpeg,image/png,image/webp";

  return (
    <div>
      <span className="label">{label}</span>
      <p className="text-xs text-[#777] mb-2">{hint}</p>
      <div className="flex items-start gap-3">
        {value ? (
          <img src={value} alt="" className="h-24 w-auto max-w-[8rem] object-contain bg-black border border-white/20" />
        ) : (
          <div className="h-24 w-16 border border-dashed border-white/20 text-[10px] text-[#666] flex items-center justify-center">None</div>
        )}
        <div className="space-y-2">
          <input type="file" accept={accept} disabled={busy} onChange={(e) => pick(e.target.files?.[0])} className="text-xs text-[#aaa]" />
          {busy && <p className="text-xs text-gold">Uploading…</p>}
          {value && !busy && (
            <button type="button" onClick={() => onChange("")} className="btn-danger">
              Remove
            </button>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
