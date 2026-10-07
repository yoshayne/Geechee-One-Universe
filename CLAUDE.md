# CLAUDE.md — Geechee One Films Website

Build brief for Claude Code. Read this whole file before writing any code. Work one milestone at a time, stop at the end of each milestone, and wait for the owner to confirm before starting the next.

The owner is not an experienced coder. Always provide complete files, never partial snippets or "rest stays the same" placeholders. Explain any manual step (Railway settings, environment variables) in plain language, one step at a time.

---

## 1. What this site is

A public catalog website for an independent film company, Geechee One Films.

- Visitors browse the company's films.
- Clicking a film card opens a popup showing the film's details and links to watch it on outside platforms (Tubi, Prime Video, Apple TV, Vudu/Fandango, and others).
- The site does NOT host or play the films. The only video is an optional embedded YouTube trailer.
- Visitors can sign up for a newsletter with their email address.
- One admin logs in to add and edit films, manage platforms, edit site text, and see newsletter signups.

There are no visitor accounts, no payments, and no multi-tenant features. Keep it simple.

## 2. Design source of truth

The mockup image lives at `/design/mockup.png`. The public site must match it as closely as possible. Build each section while looking at the mockup, then compare a screenshot of your result against it and fix differences before moving on.

### Look and feel

- Background: near black (`#0a0a0a`), with slightly lighter panels (`#141414`).
- Accent: gold. Use a gradient for headline words and primary buttons (roughly `#f5d06f` → `#d4a537` → `#a87a1c`). Thin gold lines (1px) divide sections and outline cards and buttons.
- Text: white for headings, soft gray (`#d0d0d0`) for body copy.
- Headings: high-contrast serif in capitals (Google Font "Playfair Display", weight 700–900). Two-tone treatment: first words white, last word(s) gold, e.g. "OUR **FILMS**", "COMING **SOON**".
- Body and navigation: clean sans-serif (Google Font "Inter"). Navigation and button labels are small, uppercase, and letter-spaced.
- Buttons: solid gold with dark text for the primary action ("WATCH NOW"); gold outline with gold text for secondary actions ("VIEW ▸", "LEARN MORE").
- Photos sit under a dark gradient so text stays readable.

### Sections, top to bottom

1. **Header** — logo left; nav links FILMS, ABOUT, CONTACT; social icons; outlined "WATCH NOW" button. Sticky on scroll.
2. **Hero** — the featured film. Wide hero image as the background with a dark gradient on the left. Small line "A GEECHEE ONE FILMS PRODUCTION", large film title (metallic white-to-gold gradient text, or the film's uploaded title image if one exists), "DIRECTED BY …", short synopsis, gold "WATCH NOW" button, and a row of the platform logos that film is on. "WATCH NOW" opens that film's popup.
3. **Our Films** — heading with a gold rule and the tagline "STORIES FROM THE LOWCOUNTRY. STORIES FROM US." A row of poster cards (2:3 ratio, 6 across on desktop) with a "VIEW ▸" button under each. Wraps to more rows when there are more films.
4. **Film popup (modal)** — gold-outlined dark panel with a close X. Poster on the left. On the right: title, a line of "YEAR | RUNTIME | GENRES", synopsis, the embedded YouTube trailer (only if the film has one), then "WHERE TO WATCH" with one tile per platform (logo + "WATCH NOW"). Each tile opens the platform link in a new tab.
5. **Watch Anytime, Anywhere** — band listing all platforms with their label under each ("Free Streaming", "Rent or Buy").
6. **About** — photo on the left, heading "ABOUT / GEECHEE ONE FILMS", paragraph text, "LEARN MORE" button.
7. **Coming Soon** — up to three wide cards for films with the "coming soon" status. If there are none, hide the section.
8. **Newsletter (Contact)** — the CONTACT nav link scrolls here. Short heading, one email field, one gold button, and a success message after signup. This section is not in the mockup; style it to match the "Watch Anytime" band.
9. **Footer** — logo, social icons, nav links, copyright line, and the TMDB credit line (see section 8).

### Responsive

The mockup is desktop only. On phones: header collapses to a menu button, hero text stacks over the image, film grid becomes 2 across, the popup becomes full screen with the poster on top, and the Coming Soon cards stack.

## 3. Tech stack

- **Hosting**: Railway, one service, auto-deploy from the `main` branch on GitHub.
- **Server**: Hono with `@hono/node-server`, TypeScript.
- **Front end**: React + Vite + TypeScript + Tailwind CSS. React Router for routes.
- **Database**: Railway Postgres, accessed with the `pg` package. Plain SQL migration files in `/migrations`, run automatically on server start.
- **Storage**: Railway bucket (S3-compatible) using `@aws-sdk/client-s3`.
- **Redis**: Railway Redis using `ioredis` (NOT `@upstash/redis`). Used only for rate limiting.
- **Auth**: custom module using `bcryptjs` + `jose` + `zod`, in the files `auth.helpers.ts`, `auth.middleware.ts`, `auth.routes.ts`.
- **Validation**: `zod` on every API input.

### Known Railway rules (learned from earlier projects — follow these)

- Railway runs the app from `/code`. Do not hard-code other absolute paths.
- `tsconfig.server.json` must compile to CommonJS.
- Register API routes BEFORE the static file handler, and put the catch-all that serves `index.html` last. Getting this order wrong breaks the API.
- The server must listen on `process.env.PORT`.
- If Redis is unreachable, the app must still start and work; rate limiting simply turns off and logs a warning.

## 4. Environment variables

List these in `.env.example` with a comment on each.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION` | Railway bucket |
| `JWT_SECRET` | Signs the admin session |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates the single admin on first start |
| `TMDB_API_KEY` | Film data import |
| `PUBLIC_SITE_URL` | Used in share-preview tags |

## 5. Database schema

```sql
CREATE TABLE admin_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE films (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  year            INTEGER,
  runtime_minutes INTEGER,
  genres          TEXT[] NOT NULL DEFAULT '{}',
  director        TEXT,
  synopsis        TEXT,
  poster_url      TEXT,
  hero_url        TEXT,
  title_image_url TEXT,
  trailer_url     TEXT,
  imdb_id         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','released','coming_soon')),
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platforms (
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  logo_url   TEXT,
  label      TEXT,              -- e.g. "Free Streaming", "Rent or Buy"
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE film_links (
  id          SERIAL PRIMARY KEY,
  film_id     INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  UNIQUE (film_id, platform_id)
);

CREATE TABLE subscribers (
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Rules:

- Only one film can be featured. Setting a film as featured clears the flag on all others. If none is featured, the hero uses the first released film.
- Draft films never appear on the public site.
- Store emails lowercase and trimmed.
- Seed `platforms` with Tubi (Free Streaming), Prime Video (Rent or Buy), Apple TV (Rent or Buy), Vudu/Fandango (Rent or Buy).
- Seed `site_settings` with keys: `about_text`, `tagline`, `facebook_url`, `instagram_url`, `youtube_url`, `tiktok_url`, `logo_url`, `about_image_url`, `footer_text`.
- On first start, create the admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if no admin exists.

## 6. API

### Public (no login)

- `GET /api/films` — released and coming-soon films, with their links and platforms.
- `GET /api/films/:slug` — one film.
- `GET /api/platforms`
- `GET /api/settings`
- `POST /api/subscribe` — body `{ email }`.

### Admin (login required)

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/admin/films`, `GET/PUT/DELETE /api/admin/films/:id`
- `PUT /api/admin/films/reorder`
- `GET/POST /api/admin/platforms`, `PUT/DELETE /api/admin/platforms/:id`
- `GET/PUT /api/admin/settings`
- `GET /api/admin/subscribers`, `DELETE /api/admin/subscribers/:id`, `GET /api/admin/subscribers/export.csv`
- `POST /api/admin/upload` — image upload to the bucket, returns the URL.
- `POST /api/admin/import` — body `{ url }`, returns prefilled film data (section 8).

### Auth details

- Session is a signed JWT (jose) in an httpOnly, secure, sameSite=lax cookie, valid 7 days.
- There is no public registration and no "forgot password" flow. The single admin is created from environment variables. Add a "Change password" form in admin settings.
- Rate limit login to 5 attempts per 15 minutes per IP (Redis).

## 7. Newsletter signup

- One email field and a button. Validate the email with zod.
- If the email already exists, still show the success message (do not reveal who is subscribed).
- Spam protection: a hidden "honeypot" field that real visitors never fill in; if it has a value, pretend success and save nothing. Rate limit to 5 signups per hour per IP (Redis).
- The site only collects emails. It does not send newsletters.
- Admin Subscribers page: total count, a table of email and signup date (newest first), a delete button per row, and an "Export CSV" button.

## 8. Import a film from a URL

The Add Film form has an "Import from URL" box at the top. The admin pastes a link and clicks Import. The form fills in with whatever was found. Nothing is saved until the admin clicks Save, and every field stays editable.

### If the URL is an IMDb link

1. Extract the IMDb ID (pattern `tt` followed by digits).
2. Call TMDB: `GET /3/find/{imdb_id}?external_source=imdb_id`.
3. With the TMDB movie ID, call `GET /3/movie/{id}?append_to_response=videos,credits`.
4. Map: title, release year, runtime, genres, overview → synopsis, director (from credits, job "Director"), poster, backdrop → hero image, and the first YouTube video of type "Trailer" → trailer URL.
5. Download the poster and backdrop and store copies in the bucket. Never hot-link TMDB images.
6. If TMDB has no match, show: "This film was not found in the TMDB database. You can enter the details by hand."

Do NOT scrape imdb.com pages.

### If the URL is anything else (Tubi, Amazon, etc.)

1. Fetch the page on the server with a 5-second timeout and a 2 MB size limit.
2. Read the Open Graph tags: `og:title`, `og:description`, `og:image`.
3. Prefill title, synopsis, and poster (copied into the bucket).
4. If the URL's domain matches a known platform (tubitv.com → Tubi, amazon.com or primevideo.com → Prime Video, tv.apple.com → Apple TV, vudu.com or fandangoathome.com → Vudu/Fandango), also add it as a watch link for that platform.
5. If the fetch is blocked or finds nothing, show: "Could not read that page. You can enter the details by hand."

### Safety

Only fetch `http`/`https` URLs. Refuse URLs that resolve to private, local, or internal network addresses.

### TMDB credit

TMDB requires attribution. Put this in the footer in small text: "This product uses the TMDB API but is not endorsed or certified by TMDB." Before launch, the owner should confirm TMDB's current terms for commercial sites.

## 9. Trailer embed

- `trailer_url` accepts any normal YouTube link (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`). Extract the video ID and store the original URL.
- In the popup, show the poster-style thumbnail with a play button first. Load the YouTube player only after the visitor clicks play (use the `youtube-nocookie.com` embed domain). This keeps the page fast.
- If a film has no trailer, hide the trailer block entirely.

## 10. Film pages and share previews

- Each film has its own address: `/films/:slug`. Opening it shows the home page with that film's popup already open. Closing the popup returns to `/`.
- Opening a film from a card updates the address bar to `/films/:slug` so it can be copied and shared.
- For `/films/:slug` requests, the Hono server injects Open Graph and Twitter tags into `index.html` before sending it: title, description (synopsis), image (poster), and URL. This makes links shared on Facebook, Instagram, and text messages show the film's poster.
- The home page gets default tags using the site name, tagline, and logo.
- Add `sitemap.xml` and `robots.txt`.

## 11. Admin area

Lives at `/admin`. Plain, clean, and easy to use; it does not need to match the gold public design, but should use the same dark background.

- **Login** — email and password.
- **Films** — table with poster thumbnail, title, status, featured star, and edit/delete. Drag to reorder. "Add Film" button.
- **Film form** — Import from URL box; title; slug (auto-made from the title, editable); year; runtime; genres (comma-separated); director; synopsis; status dropdown; featured checkbox; poster upload; hero image upload; optional title image upload; trailer URL; and a "Watch Links" list where each row is a platform dropdown plus a URL, with add and remove buttons.
- **Platforms** — add, edit, delete, reorder; each has a name, logo upload, and label.
- **Subscribers** — as described in section 7.
- **Settings** — about text, tagline, social links, logo upload, about image upload, footer text, change password.

Image uploads: accept JPG, PNG, WebP (and SVG for logos only); 10 MB limit; show a preview after upload. Show the recommended size next to each upload: poster 1000×1500, hero 2400×1200, logo transparent PNG or SVG.

Confirm before any delete.

## 12. Milestones

### Milestone 1 — Foundation
Project scaffold, Hono server serving the Vite build, Postgres connection and migrations, seed data, admin auth (login, logout, protected routes), health check at `/api/health`, and a successful Railway deploy.
**Done when**: the owner can open the live Railway URL, see a placeholder home page, and log in at `/admin`.

### Milestone 2 — Admin
Films, platforms, settings, image uploads to the bucket, subscribers page with CSV export, and the URL import.
**Done when**: the owner can add a film by hand and by IMDb URL, upload images, and see them saved.

### Milestone 3 — Public site
All public sections matched to the mockup, the film popup, film addresses, the trailer embed, and the newsletter form.
**Done when**: a side-by-side comparison with `/design/mockup.png` shows a close match on desktop, and a test signup appears in the admin.

### Milestone 4 — Polish
Phone and tablet layouts, share-preview tags, sitemap, image loading performance (lazy loading, sized images), keyboard and screen-reader support for the popup (Escape closes it, focus stays inside it), custom domain steps.
**Done when**: the site works well on a phone and a shared film link shows its poster.

At the end of each milestone, give the owner: a short summary of what was built, the exact steps to test it, and any Railway settings or environment variables to add.

## 13. Out of scope

Do not build any of these unless the owner asks later:

- Hosting or playing full films
- Visitor accounts or logins
- Payments
- Sending newsletters or email of any kind
- More than one admin
- A blog or news section
