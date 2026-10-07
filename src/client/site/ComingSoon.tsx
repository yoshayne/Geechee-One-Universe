import { TwoToneHeading } from "./shared";
import { PublicFilm } from "./types";

export default function ComingSoon({ films, onOpen }: { films: PublicFilm[]; onOpen: (f: PublicFilm) => void }) {
  const list = films.slice(0, 3);
  if (!list.length) return null;
  return (
    <section id="coming-soon" className="scroll-mt-20 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-14">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-8">
        <TwoToneHeading text="Coming Soon" />
        <div className="gold-rule flex-1 min-w-[3rem] hidden sm:block" />
        <p className="font-serif text-sm md:text-base uppercase tracking-[0.1em] text-white">New stories. Bigger vision.</p>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {list.map((f) => {
          const img = f.hero_url || f.poster_url;
          return (
            <li key={f.id}>
              <button onClick={() => onOpen(f)} aria-label={`${f.title}, coming soon`} className="group relative block aspect-[4/3] w-full overflow-hidden border border-gold/30 hover:border-gold transition-colors bg-panel text-center">
                {img && <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/50" />
                <span className="absolute inset-x-0 top-5 text-[10px] uppercase tracking-[0.3em] text-white/70">A Geechee One Films Production</span>
                <span className="absolute inset-x-4 bottom-8 font-serif text-2xl md:text-3xl font-bold uppercase tracking-wide text-white">{f.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
