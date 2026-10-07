INSERT INTO platforms (name, label, sort_order) VALUES
  ('Tubi', 'Free Streaming', 1),
  ('Prime Video', 'Rent or Buy', 2),
  ('Apple TV', 'Rent or Buy', 3),
  ('Vudu/Fandango', 'Rent or Buy', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO site_settings (key, value) VALUES
  ('about_text', ''),
  ('tagline', 'Stories from the Lowcountry. Stories from us.'),
  ('facebook_url', ''),
  ('instagram_url', ''),
  ('youtube_url', ''),
  ('tiktok_url', ''),
  ('logo_url', ''),
  ('about_image_url', ''),
  ('footer_text', '')
ON CONFLICT (key) DO NOTHING;
