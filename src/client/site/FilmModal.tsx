import { useEffect, useRef, useState } from "react";
import { CloseIcon, PlayIcon } from "./icons";
import { PlatformMark, TitleText } from "./shared";
import { PublicFilm } from "./types";
import { youtubeId } from "./youtube";

// Shows a thumbnail first and only loads the YouTube player after the visitor clicks play.
function Trailer({ film }: { film: PublicFilm }) {
  const id = youtubeId(film.trailer_url);
  const [playing, setPlaying] = useState(false);
  if (!id) return null;
  const thumb = film.hero_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return (
    <div className="relative aspect-video w-full overflow-hidden border border-gold/50 bg-black">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`${film.title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button onClick={() => setPlaying(true)} aria-label={`Play ${film.title} trailer`} className="group absolute inset-0 w-full h-full">
          <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
          <span className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white text-white bg-black/30">
            <PlayIcon className="h-7 w-7 ml-1" />
          </span>
          <span className="absolute inset-x-0 bottom-3 text-center text-xs font-semibold uppercase tracking-[0.15em] text-white">Official Trailer</span>
        </button>
      )}
    </div>
  );
}

export default function FilmModal({ film, onClose }: { film: PublicFilm; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const meta = [film.year, film.runtime_minutes ? `${film.runtime_minutes} MIN` : null, film.genres.length ? film.genres.join(" / ") : null, film.content_rating]
    .filter(Boolean)
    .join("  |  ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center md:p-6 bg-black/80 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="film-modal-title"
        className="relative w-full h-full md:h-auto md:max-h-[92vh] md:max-w-5xl overflow-y-auto bg-ink border border-gold/60 shadow-[0_0_60px_rgba(212,165,55,0.15)]"
      >
        <button ref={closeRef} onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 p-2 text-white hover:text-gold bg-ink/60 rounded">
          <CloseIcon />
        </button>
        <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-6 md:gap-8 p-5 pt-14 md:p-10">
          <div className="mx-auto w-3/5 md:w-full">
            <div className="aspect-[2/3] w-full overflow-hidden border border-white/10 bg-panel">
              {film.poster_url ? (
                <img src={film.poster_url} alt={`${film.title} poster`} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-4 text-center font-serif font-bold uppercase text-white">{film.title}</span>
              )}
            </div>
          </div>
          <div className="space-y-5 min-w-0">
            <h2 id="film-modal-title">
              <TitleText title={film.title} className="text-4xl md:text-5xl" />
            </h2>
            {meta && <p className="text-xs md:text-sm uppercase tracking-[0.12em] text-white whitespace-pre-wrap">{meta}</p>}
            {film.status === "coming_soon" && <p className="inline-block border border-gold/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gold">Coming soon</p>}
            {film.synopsis && <p className="leading-relaxed text-[#d0d0d0]">{film.synopsis}</p>}
            {(film.director || film.cast_names.length > 0) && (
              <dl className="space-y-1 text-sm">
                {film.director && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-xs uppercase tracking-[0.15em] text-gold pt-0.5">Director</dt>
                    <dd className="text-white">{film.director}</dd>
                  </div>
                )}
                {film.cast_names.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-xs uppercase tracking-[0.15em] text-gold pt-0.5">Cast</dt>
                    <dd className="text-[#d0d0d0]">{film.cast_names.join(", ")}</dd>
                  </div>
                )}
              </dl>
            )}
            <Trailer film={film} />
            <div>
              <h3 className="font-serif font-bold uppercase tracking-wide text-gold text-lg mb-3">Where to watch</h3>
              {film.links.length ? (
                <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {film.links.map((l) => (
                    <li key={l.platform_id}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-full min-h-[96px] flex-col items-center justify-between gap-2 border border-white/25 hover:border-gold bg-panel px-2 py-3 text-center transition-colors"
                      >
                        <span className="flex flex-1 items-center">
                          <PlatformMark name={l.platform_name} logoUrl={l.logo_url} className="h-8" />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-gold">Watch Now</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#999]">{film.status === "coming_soon" ? "Streaming details will be announced soon." : "Streaming links are on the way."}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
