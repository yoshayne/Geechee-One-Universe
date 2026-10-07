import { FormEvent, useState } from "react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: hidden from real visitors
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setState("idle");
      } else {
        setState("done");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
      setState("idle");
    }
  }

  return (
    <section id="contact" className="scroll-mt-20 border-y border-gold/40 bg-[radial-gradient(ellipse_at_15%_50%,rgba(212,165,55,0.16),transparent_55%),linear-gradient(180deg,#0a0a0a,#111)]">
      <div className="max-w-2xl mx-auto px-5 md:px-8 py-12 md:py-14 text-center">
        <h2 className="section-heading tracking-[0.08em]">
          Stay in <span className="text-gold">the Loop</span>
        </h2>
        <p className="mt-3 text-sm text-white/90">Get news about new films and releases from Geechee One.</p>
        {state === "done" ? (
          <p role="status" className="mt-8 border border-gold/60 px-4 py-4 text-gold">
            Thank you! You're on the list.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3" noValidate>
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              autoComplete="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-ink border border-gold/50 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-gold"
            />
            {/* Honeypot field: off-screen, skipped by keyboards and screen readers */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
            <button disabled={state === "sending"} className="btn-gold disabled:opacity-60">
              {state === "sending" ? "Sending…" : "Sign Up"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
