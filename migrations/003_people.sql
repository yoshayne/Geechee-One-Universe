CREATE TABLE people (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  role           TEXT,
  bio            TEXT,
  photo_url      TEXT,
  tmdb_person_id INTEGER UNIQUE,
  imdb_id        TEXT,
  is_visible     BOOLEAN NOT NULL DEFAULT false,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
