import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";

const links = [
  { to: "/admin", label: "Films", end: true },
  { to: "/admin/team", label: "Team" },
  { to: "/admin/platforms", label: "Platforms" },
  { to: "/admin/subscribers", label: "Subscribers" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminLayout() {
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
    <div className="min-h-screen">
      <header className="border-b border-gold/30 bg-panel">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-serif font-bold text-lg text-white">
            Geechee One <span className="gold-text">Universe</span> <span className="text-xs text-[#888] font-sans font-normal">admin</span>
          </span>
          <nav className="flex gap-4 text-xs uppercase tracking-widest">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => (isActive ? "text-gold border-b border-gold" : "text-[#bbb] hover:text-white")}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-[#888]">
            <span className="hidden sm:inline">{state.email}</span>
            <button onClick={logout} className="btn-outline">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
