import { useEffect, useState } from "react";
import { api } from "./api";

type Sub = { id: number; email: string; created_at: string };

export default function AdminSubscribers() {
  const [data, setData] = useState<{ total: number; items: Sub[] } | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    api<{ total: number; items: Sub[] }>("/api/admin/subscribers")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function remove(s: Sub) {
    if (!window.confirm(`Delete ${s.email}?`)) return;
    try {
      await api(`/api/admin/subscribers/${s.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          News<span className="gold-text">letter</span>
        </h1>
        <a href="/api/admin/subscribers/export.csv" className="btn">
          Export CSV
        </a>
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {!data ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className="mb-4 text-white">
            Total subscribers: <strong className="text-gold">{data.total}</strong>
          </p>
          {data.items.length === 0 ? (
            <p className="text-[#999]">No signups yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-[#888] border-b border-white/10">
                  <th className="py-2">Email</th>
                  <th>Signed up</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-white/10">
                    <td className="py-2 text-white break-all">{s.email}</td>
                    <td>{new Date(s.created_at).toLocaleString()}</td>
                    <td className="text-right">
                      <button onClick={() => remove(s)} className="btn-danger">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
