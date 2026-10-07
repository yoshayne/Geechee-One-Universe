import { useState } from "react";
import { PublicPerson, SiteSettings } from "./types";
import { TwoToneHeading } from "./shared";

const DEFAULT_ABOUT =
  "Geechee One Films, the brainchild of Felicia Rivers, is an independent film production company focused on authentic, powerful storytelling. From compelling dramas to thrilling urban narratives, our films reflect real life, real people, and the unique GeeChee culture.";

function TeamCard({ person }: { person: PublicPerson }) {
  const [open, setOpen] = useState(false);
  const long = (person.bio?.length ?? 0) > 220;
  return (
    <li className="flex flex-col border border-gold/25 bg-panel">
      <div className="aspect-square w-full bg-ink overflow-hidden">
        {person.photo_url ? (
          <img src={person.photo_url} alt={person.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center font-serif text-5xl text-gold/60">{person.name.charAt(0)}</span>
        )}
      </div>
      <div className="p-4 space-y-1">
        <h3 className="font-serif font-bold uppercase tracking-wide text-white">{person.name}</h3>
        {person.role && <p className="text-xs uppercase tracking-[0.15em] text-gold">{person.role}</p>}
        {person.bio && (
          <>
            <p className={`pt-2 text-sm leading-relaxed text-[#d0d0d0] ${open ? "" : "line-clamp-4"}`}>{person.bio}</p>
            {long && (
              <button onClick={() => setOpen(!open)} className="text-xs uppercase tracking-[0.15em] text-gold hover:underline" aria-expanded={open}>
                {open ? "Show less" : "Read more"}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export default function About({ settings, people }: { settings: SiteSettings; people: PublicPerson[] }) {
  const image = settings.about_image_url;
  const text = settings.about_text || DEFAULT_ABOUT;
  return (
    <section id="about" className="scroll-mt-20 border-b border-gold/30">
      <div className={`grid ${image ? "md:grid-cols-2" : ""}`}>
        {image && (
          <div className="relative min-h-[320px] md:min-h-[460px]">
            <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink hidden md:block" />
          </div>
        )}
        <div className={`flex flex-col justify-center gap-6 px-5 md:px-14 py-12 ${image ? "" : "max-w-3xl mx-auto"}`}>
          <h2 className="font-serif font-bold uppercase leading-tight tracking-wide text-4xl md:text-5xl">
            <span className="block text-white">About</span>
            <span className="block text-gold">Geechee One Films</span>
          </h2>
          <p className="max-w-xl whitespace-pre-line leading-relaxed text-[#d0d0d0]">{text}</p>
          <div>
            <a href={people.length ? "#team" : "#contact"} className="btn-line">
              Learn More
            </a>
          </div>
        </div>
      </div>

      {people.length > 0 && (
        <div id="team" className="scroll-mt-20 max-w-7xl mx-auto px-5 md:px-8 pb-14 pt-6">
          <div className="flex items-center gap-6 mb-8">
            <TwoToneHeading text="Meet the Team" />
            <div className="gold-rule flex-1 hidden sm:block" />
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {people.map((p) => (
              <TeamCard key={p.id} person={p} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
