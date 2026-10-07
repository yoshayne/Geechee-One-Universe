import { useEffect, useRef, useState } from "react";
import { MenuIcon, CloseIcon } from "./icons";
import { Logo, SocialIcons } from "./shared";
import { SiteSettings } from "./types";

const NAV = [
  { href: "#films", label: "Films" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

type Props = { settings: SiteSettings; onWatchNow?: () => void };

export default function Header({ settings, onWatchNow }: Props) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-ink/95 backdrop-blur border-b border-gold/20">
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-[72px] flex items-center gap-6">
        <a href="#top" aria-label="Geechee One Universe home" className="shrink-0">
          <Logo settings={settings} />
        </a>
        <nav className="hidden md:flex items-center gap-6 lg:gap-8 ml-auto" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="nav-link">
              {n.label}
            </a>
          ))}
        </nav>
        <SocialIcons settings={settings} only={["facebook_url", "instagram_url", "youtube_url"]} className="hidden lg:flex" />
        {onWatchNow && (
          <button onClick={onWatchNow} className="btn-line hidden md:inline-flex whitespace-nowrap">
            Watch Now
          </button>
        )}
        <button
          ref={menuButton}
          className="md:hidden ml-auto text-white"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-gold/20 bg-ink px-5 py-5 space-y-5">
          <nav className="flex flex-col gap-4" aria-label="Mobile">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="nav-link text-sm" onClick={() => setOpen(false)}>
                {n.label}
              </a>
            ))}
          </nav>
          <SocialIcons settings={settings} only={["facebook_url", "instagram_url", "youtube_url"]} />
          {onWatchNow && (
            <button
              onClick={() => {
                setOpen(false);
                onWatchNow();
              }}
              className="btn-line"
            >
              Watch Now
            </button>
          )}
        </div>
      )}
    </header>
  );
}
