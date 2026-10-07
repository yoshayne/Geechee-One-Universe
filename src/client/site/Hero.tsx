import { PlayIcon } from "./icons";
import { PlatformLogoRow, TitleText } from "./shared";
import { PublicFilm } from "./types";

export default function Hero({ film, onWatch }: { film: PublicFilm; onWatch: (f: PublicFilm) => void }) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-gold/30 md:flex md:min-h-[580px] md:items-center">
      {/* Phone: the whole picture sits across the top of the screen. Desktop: it fills the section behind the text. */}
      {film.hero_url ? (
        <div className="relative md:absolute md:inset-0">
          <img
            src={film.hero_url}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="block h-auto max-h-[65svh] w-full object-contain md:h-full md:max-h-none md:object-cover md:object-[70%_center]"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink to-transparent md:hidden" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-ink via-ink/70 to-ink/10 md:block" />
          <div className="absolute inset-x-0 bottom-0 hidden h-24 bg-gradient-to-t from-ink to-transparent md:block" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(212,165,55,0.25),transparent_60%)]" />
      )}

      <div className={`relative z-10 w-full max-w-7xl mx-auto px-5 md:px-8 pb-10 md:py-16 ${film.hero_url ? "-mt-6 pt-0" : "pt-12"} md:mt-0`}>
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
