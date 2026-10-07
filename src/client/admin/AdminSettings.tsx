import { FormEvent, useEffect, useState } from "react";
import { api } from "./api";
import ImageUpload from "./ImageUpload";

type Settings = Record<string, string>;

const TEXT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "tagline", label: "Tagline", placeholder: "Stories from the Lowcountry. Stories from us." },
  { key: "facebook_url", label: "Facebook link", placeholder: "https://facebook.com/…" },
  { key: "instagram_url", label: "Instagram link", placeholder: "https://instagram.com/…" },
  { key: "youtube_url", label: "YouTube link", placeholder: "https://youtube.com/…" },
  { key: "tiktok_url", label: "TikTok link", placeholder: "https://tiktok.com/@…" },
  { key: "footer_text", label: "Footer text", placeholder: "© 2026 Geechee One Universe. All Rights Reserved." },
];

export default function AdminSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Settings>("/api/admin/settings").then(setS).catch((e) => setError(e.message));
  }, []);

  if (!s) return <p>{error || "Loading…"}</p>;
  const set = (key: string, value: string) => setS({ ...s, [key]: value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/settings", { method: "PUT", body: s });
      setNotice("Settings saved.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    try {
      await api("/api/auth/change-password", { body: pw });
      setPw({ currentPassword: "", newPassword: "" });
      setPwMsg({ ok: true, text: "Password changed." });
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.message });
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={save} className="space-y-6">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Site <span className="gold-text">Settings</span>
        </h1>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {notice && <p className="text-green-400 text-sm">{notice}</p>}

        <div className="grid md:grid-cols-2 gap-6">
          <ImageUpload label="Logo" kind="logo" hint="Transparent PNG or SVG" value={s.logo_url} onChange={(v) => set("logo_url", v)} />
          <ImageUpload label="About section photo" kind="about" hint="Recommended 1200×1200 or wider" value={s.about_image_url} onChange={(v) => set("about_image_url", v)} />
        </div>

        <div>
          <label className="label">About text</label>
          <textarea rows={6} className="field" value={s.about_text} onChange={(e) => set("about_text", e.target.value)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input className="field" placeholder={f.placeholder} value={s[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
        </div>

        <button className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>

      <form onSubmit={changePassword} className="space-y-4 border-t border-white/10 pt-8 max-w-md">
        <h2 className="font-serif font-bold text-xl uppercase text-white">
          Change <span className="gold-text">password</span>
        </h2>
        <div>
          <label className="label">Current password</label>
          <input type="password" required className="field" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        </div>
        <div>
          <label className="label">New password (at least 10 characters)</label>
          <input type="password" required minLength={10} className="field" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        </div>
        {pwMsg && <p className={`text-sm ${pwMsg.ok ? "text-green-400" : "text-red-400"}`}>{pwMsg.text}</p>}
        <button className="btn">Change password</button>
      </form>
    </div>
  );
}
