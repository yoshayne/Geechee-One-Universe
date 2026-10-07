import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

export default function AdminHome() {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "out" | { email: string }>("loading");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? setState(await r.json()) : setState("out")))
      .catch(() => setState("out"));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/admin/login");
  }

  if (state === "loading") return <main className="p-8">Loading…</main>;
  if (state === "out") return <Navigate to="/admin/login" replace />;

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif font-bold text-3xl uppercase text-white">
          Admin <span className="gold-text">Dashboard</span>
        </h1>
        <p className="mt-4">Logged in as {state.email}.</p>
        <p className="mt-2 text-sm text-[#888]">Film, platform, settings and subscriber tools arrive in Milestone 2.</p>
        <button onClick={logout} className="mt-6 border border-gold text-gold px-4 py-2 text-sm uppercase tracking-widest">
          Log out
        </button>
      </div>
    </main>
  );
}
