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
  label      TEXT,
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
