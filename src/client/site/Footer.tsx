import { Logo, SocialIcons } from "./shared";
import { SiteSettings } from "./types";

export default function Footer({ settings }: { settings: SiteSettings }) {
  const copyright = settings.footer_text || `© ${new Date().getFullYear()} Geechee One Universe. All Rights Reserved.`;
  return (
    <footer className="border-t border-gold/40">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 grid gap-8 md:grid-cols-[auto_1fr_auto] items-center">
        <Logo settings={settings} />
        <SocialIcons settings={settings} className="md:justify-center" />
        <div className="md:border-l md:border-gold/40 md:pl-10 space-y-3">
          <nav className="flex gap-8" aria-label="Footer">
            <a href="#films" className="nav-link text-gold">
              Films
            </a>
            <a href="#about" className="nav-link">
              About
            </a>
            <a href="#contact" className="nav-link">
              Contact
            </a>
          </nav>
          <p className="text-xs text-white/80">{copyright}</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-5 md:px-8 pb-8 text-[11px] leading-relaxed text-[#9a9a9a]">
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <p>Streaming availability data provided by JustWatch.</p>
      </div>
    </footer>
  );
}
