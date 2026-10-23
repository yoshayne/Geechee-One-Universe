-- Backup of every image link changed by the admin "Repair saved links" tool, so it can be undone.
CREATE TABLE IF NOT EXISTS image_link_repairs (
  id             BIGSERIAL PRIMARY KEY,
  run_id         UUID NOT NULL,
  source         TEXT NOT NULL,   -- e.g. films.poster_url
  row_id         TEXT NOT NULL,   -- the row's id (or key, for site_settings)
  original_value TEXT NOT NULL,
  new_value      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS image_link_repairs_run_idx ON image_link_repairs (run_id);
