import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Person } from "./api";
import ImageUpload from "./ImageUpload";

export default function AdminPersonForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", role: "", bio: "", photo_url: "", is_visible: true, tmdb_person_id: null as number | null, imdb_id: "" });
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api<Person>(`/api/admin/team/${id}`)
      .then((p) => {
        setF({ name: p.name, role: p.role ?? "", bio: p.bio ?? "", photo_url: p.photo_url ?? "", is_visible: p.is_visible, tmdb_person_id: p.tmdb_person_id, imdb_id: (p as any).imdb_id ?? "" });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [id]);

  async function runImport() {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await api<any>("/api/admin/tmdb/person-lookup", { body: { url: importUrl } });
      setF((prev) => ({
        ...prev,
        name: r.name || prev.name,
        role: r.role || prev.role,
        bio: r.bio || prev.bio,
        photo_url: r.photo_url || prev.photo_url,
        tmdb_person_id: r.tmdb_person_id,
        imdb_id: r.imdb_id || prev.imdb_id,
      }));
      const warn = r.warnings?.length ? ` Note: ${r.warnings.join(" ")}` : "";
      const missing = [!r.bio && "bio", !r.photo_url && "photo"].filter(Boolean).join(" and ");
      setImportMsg({ ok: true, text: `Imported.${missing ? ` TMDB has no ${missing} for this person.` : ""} Check each field, then click Save.${warn}` });
    } catch (e: any) {
      setImportMsg({ ok: false, text: e.message });
    } finally {
      setImporting(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(id ? `/api/admin/team/${id}` : "/api/admin/team", { method: id ? "PUT" : "POST", body: f });
      navigate("/admin/team");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          {id ? "Edit" : "Add"} <span className="gold-text">Person</span>
        </h1>
        <Link to="/admin/team" className="text-xs uppercase tracking-widest text-[#aaa]">
          ← Back to team
        </Link>
      </div>
      {error && <p className="text-red-400 text-sm border border-red-400/40 p-3">{error}</p>}
      <section className="bg-panel border border-gold/30 p-4 space-y-2">
        <label className="label" htmlFor="pimport">
          Import from TMDB
        </label>
        <p className="text-xs text-[#777]">Paste a TMDB person page link to fill in the name, photo and bio. Nothing is saved until you click Save.</p>
        <div className="flex gap-2">
          <input id="pimport" className="field" placeholder="https://www.themoviedb.org/person/3150184-felicia-rivers" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} />
          <button type="button" className="btn" disabled={importing || !importUrl.trim()} onClick={runImport}>
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {importMsg && <p className={`text-sm ${importMsg.ok ? "text-green-400" : "text-red-400"}`}>{importMsg.text}</p>}
      </section>
      <div>
        <label className="label">Name</label>
        <input required className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Title at the company</label>
        <input className="field" placeholder="Founder & Director" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
      </div>
      <div>
        <label className="label">Bio</label>
        <textarea rows={6} className="field" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </div>
      <ImageUpload label="Photo" kind="about" hint="Recommended 800×800 square" value={f.photo_url} onChange={(v) => setF({ ...f, photo_url: v })} />
      <label className="flex items-center gap-2 text-white">
        <input type="checkbox" checked={f.is_visible} onChange={(e) => setF({ ...f, is_visible: e.target.checked })} />
        Show on site (in the About section)
      </label>
      <div className="flex gap-3">
        <button className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <Link to="/admin/team" className="btn-outline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
