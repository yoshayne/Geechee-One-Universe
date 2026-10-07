import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../site/Header";
import Hero from "../site/Hero";
import OurFilms from "../site/OurFilms";
import FilmModal from "../site/FilmModal";
import WatchBand from "../site/WatchBand";
import About from "../site/About";
import ComingSoon from "../site/ComingSoon";
import Newsletter from "../site/Newsletter";
import Footer from "../site/Footer";
import { useSiteData } from "../site/useSiteData";
import { DEFAULT_TAGLINE, PublicFilm } from "../site/types";

const SITE_NAME = "Geechee One Universe";

export default function Home() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { loading, failed, films, platforms, people, settings } = useSiteData();

  const released = films.filter((f) => f.status === "released");
  const comingSoon = films.filter((f) => f.status === "coming_soon");
  const heroFilm = films.find((f) => f.is_featured) ?? released[0] ?? null;
  const openFilm = slug ? films.find((f) => f.slug === slug) ?? null : null;

  const open = useCallback((f: PublicFilm) => navigate(`/films/${f.slug}`, { preventScrollReset: true }), [navigate]);
  const close = useCallback(() => navigate("/", { preventScrollReset: true }), [navigate]);

  // An address for a film that doesn't exist (or is a draft) just goes home.
  useEffect(() => {
    if (!loading && slug && !openFilm) navigate("/", { replace: true });
  }, [loading, slug, openFilm, navigate]);

  useEffect(() => {
    document.title = openFilm ? `${openFilm.title} | ${SITE_NAME}` : SITE_NAME;
  }, [openFilm]);

  return (
    <div className="min-h-screen bg-ink">
      {/* While the popup is open, the page behind it cannot be tabbed into or read by screen readers. */}
      <div inert={openFilm ? true : undefined}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-ink"
        >
          Skip to content
        </a>
        <Header settings={settings} onWatchNow={heroFilm ? () => open(heroFilm) : undefined} />
        <main id="main" tabIndex={-1} className="outline-none">
          {heroFilm ? (
            <Hero film={heroFilm} onWatch={open} />
          ) : (
            <section id="top" className="border-b border-gold/30 px-5 py-24 text-center">
              <h1 className="font-serif font-black uppercase text-5xl md:text-7xl text-white">
                Geechee One <span className="gold-text">Universe</span>
              </h1>
              <p className="mt-4 text-sm uppercase tracking-[0.2em]">{settings.tagline || DEFAULT_TAGLINE}</p>
              <p className="mt-8 text-sm text-[#888]">{loading ? "Loading…" : failed ? "We couldn't load the films. Please refresh the page." : "New films are coming soon."}</p>
            </section>
          )}
          <OurFilms films={released} tagline={settings.tagline} onOpen={open} />
          <WatchBand platforms={platforms} />
          <About settings={settings} people={people} />
          <ComingSoon films={comingSoon} onOpen={open} />
          <Newsletter />
        </main>
        <Footer settings={settings} />
      </div>
      {openFilm && <FilmModal film={openFilm} onClose={close} />}
    </div>
  );
}
