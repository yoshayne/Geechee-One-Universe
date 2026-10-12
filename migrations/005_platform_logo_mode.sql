-- How a platform's logo is shown on the dark site:
--   original = as uploaded, white = turned solid white, light = on a light tile (for dark logos)
ALTER TABLE platforms ADD COLUMN logo_mode TEXT NOT NULL DEFAULT 'original'
  CHECK (logo_mode IN ('original', 'white', 'light'));
