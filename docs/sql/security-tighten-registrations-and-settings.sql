-- Apply after the admin/share-token hardening and after deploying the
-- service-role-backed admin API changes in this repo.
-- MemFire target env on 2026-03-11 had RLS disabled on these tables.

BEGIN;

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.registrations FROM anon;
REVOKE ALL ON TABLE public.registrations FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registrations TO authenticated;

DROP POLICY IF EXISTS "Admins can manage registrations" ON public.registrations;
DROP POLICY IF EXISTS "Coaches can manage own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Coach can create registrations" ON public.registrations;
DROP POLICY IF EXISTS "Coach can view own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Coach can update own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Coach can delete own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Registrations coach access" ON public.registrations;

CREATE POLICY "Admins can manage registrations"
ON public.registrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_id = auth.uid()
  )
);

CREATE POLICY "Coaches can manage own registrations"
ON public.registrations
FOR ALL
TO authenticated
USING (
  coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = auth.uid()
  )
)
WITH CHECK (
  coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = auth.uid()
  )
);

REVOKE ALL ON TABLE public.registration_settings FROM anon;
REVOKE ALL ON TABLE public.registration_settings FROM authenticated;
GRANT SELECT ON TABLE public.registration_settings TO authenticated;

DROP POLICY IF EXISTS "Admins can manage registration settings" ON public.registration_settings;
DROP POLICY IF EXISTS "Authenticated users can read visible registration settings" ON public.registration_settings;
DROP POLICY IF EXISTS "Registration settings public read" ON public.registration_settings;

CREATE POLICY "Admins can manage registration settings"
ON public.registration_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can read visible registration settings"
ON public.registration_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = registration_settings.event_id
      AND COALESCE(e.is_visible, false) = true
  )
);

COMMIT;
