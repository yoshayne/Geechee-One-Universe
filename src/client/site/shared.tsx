import { ReactNode } from "react";
import { FacebookIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./icons";
import { FilmLink, SiteSettings } from "./types";

// Film titles: all words but the last in metallic white, the last word in gold.
export function TitleText({ title, className = "" }: { title: string; className?: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.pop() ?? "";
  return (
    <span className={`font-serif font-black uppercase tracking-tight leading-[0.95] ${className}`}>
      {words.length > 0 && <span className="metal-text">{words.join(" ")} </span>}
      <span className="gold-text-v">{last}</span>
    </span>
  );
}

// Section headings: "OUR FILMS" with the first words white and the last word gold.
export function TwoToneHeading({ text, className = "" }: { text: string; className?: string }) {
  const words = text.trim().split(/\s+/);
  const last = words.pop() ?? "";
  return (
    <h2 className={`section-heading ${className}`}>
      {words.join(" ")} <span className="text-gold">{last}</span>
    </h2>
  );
}

export function Logo({ settings, className = "" }: { settings: SiteSettings; className?: string }) {
  if (settings.logo_url) {
    return <img src={settings.logo_url} alt="Geechee One Universe" className={`h-12 md:h-14 w-auto object-contain ${className}`} />;
  }
  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span className="font-serif italic font-bold text-2xl md:text-3xl gold-text">Geechee One</span>
      <span className="text-[10px] tracking-[0.5em] text-gold mt-1 pl-1">UNIVERSE</span>
    </span>
  );
}

// Platform logo, or the platform's name as text if no logo has been uploaded.
export function PlatformMark({ name, logoUrl, className = "h-8" }: { name: string; logoUrl: string | null; className?: string }) {
  if (logoUrl) return <img src={logoUrl} alt={name} loading="lazy" className={`${className} w-auto max-w-[9rem] object-contain`} />;
  return <span className="font-serif font-bold text-lg text-white">{name}</span>;
}

export function PlatformLogoRow({ links }: { links: FilmLink[] }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      {links.map((l) => (
        <a key={l.platform_id} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch on ${l.platform_name}`} className="opacity-90 hover:opacity-100">
          <PlatformMark name={l.platform_name} logoUrl={l.logo_url} className="h-7 md:h-8" />
        </a>
      ))}
    </div>
  );
}

const SOCIALS: { key: string; label: string; Icon: (p: { className?: string }) => ReactNode }[] = [
  { key: "facebook_url", label: "Facebook", Icon: FacebookIcon },
  { key: "instagram_url", label: "Instagram", Icon: InstagramIcon },
  { key: "youtube_url", label: "YouTube", Icon: YouTubeIcon },
  { key: "tiktok_url", label: "TikTok", Icon: TikTokIcon },
];

export function SocialIcons({ settings, only, className = "" }: { settings: SiteSettings; only?: string[]; className?: string }) {
  const items = SOCIALS.filter((s) => settings[s.key] && /^https?:\/\//.test(settings[s.key]) && (!only || only.includes(s.key)));
  if (!items.length) return null;
  return (
    <div className={`flex items-center gap-5 ${className}`}>
      {items.map(({ key, label, Icon }) => (
        <a key={key} href={settings[key]} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-white hover:text-gold transition-colors">
          <Icon />
        </a>
      ))}
    </div>
  );
}
