import { PlatformMark } from "./shared";
import { PublicPlatform } from "./types";

export default function WatchBand({ platforms }: { platforms: PublicPlatform[] }) {
  if (!platforms.length) return null;
  return (
    <section className="relative border-y border-gold/40 bg-[radial-gradient(ellipse_at_85%_50%,rgba(212,165,55,0.18),transparent_55%),linear-gradient(180deg,#0a0a0a,#111)]">
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-12 text-center">
        <h2 className="section-heading tracking-[0.08em]">
          Watch <span className="text-gold">Anytime, Anywhere</span>
        </h2>
        <p className="mt-3 text-sm text-white/90">Find Geechee One Films on your favorite streaming platforms.</p>
        <ul className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-y-8">
          {platforms.map((p, i) => (
            <li key={p.id} className={`flex flex-col items-center gap-3 px-4 ${i > 0 ? "md:border-l md:border-gold/30" : ""}`}>
              <PlatformMark name={p.name} logoUrl={p.logo_url} className="h-10 md:h-12" />
              {p.label && <span className="text-sm text-white">{p.label}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
