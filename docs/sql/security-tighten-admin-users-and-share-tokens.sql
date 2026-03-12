-- Deploy the application changes first, then apply this script.
-- MemFire target env on 2026-03-11 had RLS disabled on these tables, so
-- enabling RLS is part of the migration, not just policy cleanup.

BEGIN;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_share_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_users FROM anon;
REVOKE ALL ON TABLE public.admin_users FROM authenticated;
GRANT SELECT ON TABLE public.admin_users TO authenticated;

DROP POLICY IF EXISTS "Admin users full access" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can read own profile" ON public.admin_users;

CREATE POLICY "Admins can read own profile"
ON public.admin_users
FOR SELECT
TO authenticated
USING (auth_id = auth.uid());

REVOKE ALL ON TABLE public.player_share_tokens FROM anon;
REVOKE ALL ON TABLE public.player_share_tokens FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_share_tokens TO authenticated;

DROP POLICY IF EXISTS "Allow anonymous access by token" ON public.player_share_tokens;
DROP POLICY IF EXISTS "Anyone can read share token by token" ON public.player_share_tokens;
DROP POLICY IF EXISTS "Anyone can update share token" ON public.player_share_tokens;
DROP POLICY IF EXISTS "Authenticated users can create share tokens" ON public.player_share_tokens;
DROP POLICY IF EXISTS "Coaches can manage own registration share tokens" ON public.player_share_tokens;
DROP POLICY IF EXISTS "Users can delete their own share tokens" ON public.player_share_tokens;

CREATE POLICY "Coaches can manage own registration share tokens"
ON public.player_share_tokens
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.coaches c ON c.id = r.coach_id
    WHERE r.id = player_share_tokens.registration_id
      AND c.auth_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.coaches c ON c.id = r.coach_id
    WHERE r.id = player_share_tokens.registration_id
      AND c.auth_id = auth.uid()
  )
);

COMMIT;
