-- Sensitive user-upload buckets should stay private.
-- event-posters remains public by design.

BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id IN ('registration-files', 'player-photos', 'team-documents');

COMMIT;
