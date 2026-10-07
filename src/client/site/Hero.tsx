import { PlayIcon } from "./icons";
import { PlatformLogoRow, TitleText } from "./shared";
import { PublicFilm } from "./types";

export default function Hero({ film, onWatch }: { film: PublicFilm; onWatch: (f: PublicFilm) => void }) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-gold/30 min-h-[460px] md:min-h-[580px] flex items-center">
      {film.hero_url ? (
        <img src={film.hero_url} alt="" className="absolute inset-0 h-full w-full object-cover object-[70%_center]" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(212,165,55,0.25),transparent_60%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/10 md:via-ink/70" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink to-transparent" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-16">
        <div className="md:max-w-[62%] space-y-5">
          <p className="text-[11px] md:text-xs uppercase tracking-[0.3em] text-white/90">A Geechee One Films Production</p>
          {film.title_image_url ? (
            <img src={film.title_image_url} alt={film.title} className="max-h-40 md:max-h-52 w-auto object-contain" />
          ) : (
            <h1>
              <TitleText title={film.title} className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl" />
            </h1>
          )}
          {film.director && (
            <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-[#c8c8c8]">
              Directed by <strong className="text-white font-semibold">{film.director}</strong>
            </p>
          )}
          {film.synopsis && <p className="max-w-md text-[15px] md:text-base leading-relaxed text-white/90 line-clamp-4">{film.synopsis}</p>}
          <div>
            <button onClick={() => onWatch(film)} className="btn-gold">
              <PlayIcon /> Watch Now
            </button>
          </div>
          <PlatformLogoRow links={film.links} />
        </div>
      </div>
    </section>
  );
}
