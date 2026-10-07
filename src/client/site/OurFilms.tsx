import { TwoToneHeading } from "./shared";
import { DEFAULT_TAGLINE, PublicFilm } from "./types";

export default function OurFilms({ films, tagline, onOpen }: { films: PublicFilm[]; tagline: string; onOpen: (f: PublicFilm) => void }) {
  if (!films.length) return null;
  return (
    <section id="films" className="scroll-mt-20 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-14">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-8">
        <TwoToneHeading text="Our Films" />
        <div className="gold-rule flex-1 min-w-[3rem] hidden sm:block" />
        <p className="text-[11px] md:text-xs uppercase tracking-[0.15em] text-white/90 sm:max-w-[16rem] sm:text-right">{tagline || DEFAULT_TAGLINE}</p>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-5">
        {films.map((f) => (
          <li key={f.id} className="flex flex-col gap-3">
            <button onClick={() => onOpen(f)} aria-label={`View ${f.title}`} className="block aspect-[2/3] w-full overflow-hidden border border-gold/30 hover:border-gold transition-colors bg-panel">
              {f.poster_url ? (
                <img src={f.poster_url} alt={`${f.title} poster`} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-3 text-center font-serif font-bold uppercase text-white">{f.title}</span>
              )}
            </button>
            <button onClick={() => onOpen(f)} className="btn-line self-center" aria-hidden="true" tabIndex={-1}>
              View ▸
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
