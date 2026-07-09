-- Current Supabase Storage bucket settings for Eventregistration.
-- Refreshed from project ernfouwkblxwzshmbsda on 2026-07-08.
-- This file intentionally records bucket metadata only, not stored objects.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'event-posters',
    'event-posters',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'player-photos',
    'player-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']::text[]
  ),
  (
    'registration-files',
    'registration-files',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  ),
  (
    'team-documents',
    'team-documents',
    false,
    10485760,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ]::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
