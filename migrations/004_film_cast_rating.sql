ALTER TABLE films ADD COLUMN cast_names TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE films ADD COLUMN content_rating TEXT;
