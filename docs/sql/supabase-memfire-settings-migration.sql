-- Supabase migration for the Eventregistration MemFire project.
-- Generated from repo SQL assets, code usage, and MemFire dashboard/API checks on 2026-07-09.
--
-- Scope:
-- - Recreates application schema, functions, triggers, RLS/GRANTs, and Storage bucket settings.
-- - Does not migrate business rows from MemFire.
-- - Does not create Supabase platform-managed storage tables.
-- - Does not seed admin/coach auth users or default passwords.
--
-- Apply only after the target Supabase project is active.
-- When using Supabase MCP apply_migration, apply this file without wrapping it
-- in an explicit BEGIN/COMMIT transaction.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Core account tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone character varying(20) NOT NULL,
  password_hash character varying(255),
  email character varying(255),
  auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name character varying(100),
  is_super boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email character varying(255) NOT NULL,
  name character varying(100),
  phone character varying(20),
  school character varying(100),
  role character varying(20) DEFAULT 'coach'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization character varying(255),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  last_login_at timestamp with time zone,
  created_by uuid REFERENCES public.admin_users(id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_phone_key') THEN
    ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_phone_key UNIQUE (phone);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_auth_id_key') THEN
    ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_auth_id_key UNIQUE (auth_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_email_key') THEN
    ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_email_key UNIQUE (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coaches_auth_id_key') THEN
    ALTER TABLE public.coaches ADD CONSTRAINT coaches_auth_id_key UNIQUE (auth_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coaches_email_key') THEN
    ALTER TABLE public.coaches ADD CONSTRAINT coaches_email_key UNIQUE (email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_users_auth_id ON public.admin_users(auth_id);
CREATE INDEX IF NOT EXISTS idx_coaches_created_by ON public.coaches(created_by);
CREATE INDEX IF NOT EXISTS idx_coaches_is_active ON public.coaches(is_active);
CREATE INDEX IF NOT EXISTS idx_coaches_phone ON public.coaches(phone);

COMMENT ON COLUMN public.admin_users.auth_id IS 'Linked auth.users user id';
COMMENT ON COLUMN public.admin_users.name IS 'Admin display name';
COMMENT ON COLUMN public.admin_users.is_super IS 'Whether this admin is a super administrator';
COMMENT ON COLUMN public.coaches.is_active IS 'Whether this coach account is enabled';
COMMENT ON COLUMN public.coaches.notes IS 'Admin notes for this coach account';
COMMENT ON COLUMN public.coaches.last_login_at IS 'Last login timestamp';
COMMENT ON COLUMN public.coaches.created_by IS 'Admin user that created this coach account';

-- ---------------------------------------------------------------------------
-- Events and registrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name character varying(255) NOT NULL,
  short_name character varying(100),
  poster_url text,
  type character varying(50) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  address text,
  details text,
  phone character varying(20),
  is_visible boolean DEFAULT true,
  registration_start_date timestamp with time zone,
  registration_end_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  requirements text,
  reference_templates jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.coaches(id),
  team_data jsonb,
  players_data jsonb,
  status character varying(20) DEFAULT 'draft'::character varying,
  share_token character varying(100),
  rejection_reason text,
  cancelled_at timestamp with time zone,
  cancelled_reason text,
  submitted_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewer_id uuid REFERENCES public.admin_users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_status_read_at timestamp with time zone,
  last_status_change timestamp with time zone,
  CONSTRAINT registrations_status_check CHECK (
    (status)::text = ANY (
      ARRAY[
        'draft'::character varying,
        'submitted'::character varying,
        'pending'::character varying,
        'approved'::character varying,
        'rejected'::character varying,
        'cancelled'::character varying
      ]::text[]
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_share_token_key') THEN
    ALTER TABLE public.registrations ADD CONSTRAINT registrations_share_token_key UNIQUE (share_token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_visible ON public.events(is_visible);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_coach_id ON public.registrations(coach_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_share_token ON public.registrations(share_token);
CREATE INDEX IF NOT EXISTS idx_registrations_reviewer_id ON public.registrations(reviewer_id);

COMMENT ON COLUMN public.events.reference_templates IS 'Event reference template attachments for registration downloads';

-- ---------------------------------------------------------------------------
-- Project management hierarchy
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name character varying(50) NOT NULL,
  display_order integer DEFAULT 0,
  is_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type_id uuid NOT NULL REFERENCES public.project_types(id) ON DELETE CASCADE,
  name character varying(100) NOT NULL,
  display_order integer DEFAULT 0,
  is_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name character varying(100) NOT NULL,
  description text,
  rules jsonb DEFAULT '{}'::jsonb,
  display_order integer DEFAULT 0,
  is_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id uuid NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
  created_at timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_types_name_key') THEN
    ALTER TABLE public.project_types ADD CONSTRAINT project_types_name_key UNIQUE (name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_name_project_type_unique') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_name_project_type_unique UNIQUE (name, project_type_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'divisions_name_project_unique') THEN
    ALTER TABLE public.divisions ADD CONSTRAINT divisions_name_project_unique UNIQUE (name, project_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_divisions_unique') THEN
    ALTER TABLE public.event_divisions ADD CONSTRAINT event_divisions_unique UNIQUE (event_id, division_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_type_id ON public.projects(project_type_id);
CREATE INDEX IF NOT EXISTS idx_projects_enabled ON public.projects(is_enabled);
CREATE INDEX IF NOT EXISTS idx_divisions_project_id ON public.divisions(project_id);
CREATE INDEX IF NOT EXISTS idx_divisions_enabled ON public.divisions(is_enabled);
CREATE INDEX IF NOT EXISTS idx_event_divisions_event_id ON public.event_divisions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_divisions_division_id ON public.event_divisions(division_id);

COMMENT ON COLUMN public.divisions.rules IS 'Division rule configuration: gender, age, birth date, and player-count limits';

-- Seed only reusable settings, not business registrations.
INSERT INTO public.project_types (name, display_order, is_enabled) VALUES
  ('体育', 1, true),
  ('科创', 2, true),
  ('艺术', 3, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.projects (project_type_id, name, display_order, is_enabled)
SELECT pt.id, '棍网球', 1, true FROM public.project_types pt WHERE pt.name = '体育'
UNION ALL
SELECT pt.id, '篮球', 2, true FROM public.project_types pt WHERE pt.name = '体育'
UNION ALL
SELECT pt.id, '足球', 3, true FROM public.project_types pt WHERE pt.name = '体育'
UNION ALL
SELECT pt.id, '排球', 4, true FROM public.project_types pt WHERE pt.name = '体育'
ON CONFLICT (name, project_type_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Registration settings, notifications, public share
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.registration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  division_id uuid REFERENCES public.divisions(id) ON DELETE CASCADE,
  team_requirements jsonb,
  player_requirements jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.registration_settings
    DROP CONSTRAINT IF EXISTS registration_settings_event_id_key;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_settings_event_division_unique') THEN
    ALTER TABLE public.registration_settings
      ADD CONSTRAINT registration_settings_event_division_unique UNIQUE (event_id, division_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_registration_settings_division_id
  ON public.registration_settings(division_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  type character varying(20),
  title character varying(255) NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (
    (type)::text = ANY (
      ARRAY[
        'approval'::character varying,
        'rejection'::character varying,
        'reminder'::character varying
      ]::text[]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_coach_id ON public.notifications(coach_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON public.notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_notifications_registration_id ON public.notifications(registration_id);

CREATE TABLE IF NOT EXISTS public.player_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES public.registrations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  token character varying(255) NOT NULL,
  player_index integer,
  player_data jsonb,
  is_filled boolean DEFAULT false,
  filled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  player_id character varying(255),
  is_active boolean DEFAULT true,
  used_at timestamp with time zone
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_share_tokens_token_key') THEN
    ALTER TABLE public.player_share_tokens ADD CONSTRAINT player_share_tokens_token_key UNIQUE (token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_player_share_tokens_event ON public.player_share_tokens(event_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_expires_at ON public.player_share_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_player ON public.player_share_tokens(player_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_registration ON public.player_share_tokens(registration_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_token ON public.player_share_tokens(token);

CREATE TABLE IF NOT EXISTS public.player_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES public.registrations(id) ON DELETE CASCADE,
  share_token character varying(100) NOT NULL,
  player_data jsonb NOT NULL,
  submitted_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_submissions_share_token ON public.player_submissions(share_token);
CREATE INDEX IF NOT EXISTS idx_player_submissions_registration_id ON public.player_submissions(registration_id);

-- ---------------------------------------------------------------------------
-- Security audit logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actor_type text NOT NULL,
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  event_id uuid,
  registration_id uuid,
  target_user_id uuid,
  ip_address text,
  user_agent text,
  request_id text,
  result text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS security_audit_logs_created_at_idx
  ON public.security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_logs_action_created_at_idx
  ON public.security_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_logs_actor_idx
  ON public.security_audit_logs(actor_type, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_logs_event_idx
  ON public.security_audit_logs(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_logs_registration_idx
  ON public.security_audit_logs(registration_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Functions and triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS character varying
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_share_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_token IS NULL THEN
    NEW.share_token := public.generate_share_token();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.simple_mark_all_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.notifications n
  SET is_read = true
  WHERE n.is_read IS DISTINCT FROM true
    AND n.coach_id IN (
      SELECT c.id
      FROM public.coaches c
      WHERE c.auth_id = auth.uid()
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', updated_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN public.simple_mark_all_read();
END;
$$;

REVOKE ALL ON FUNCTION public.simple_mark_all_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.simple_mark_all_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.simple_mark_all_read() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_phone text;
BEGIN
  user_phone := split_part(NEW.email, '@', 1);

  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.admin_users (auth_id, phone, email, name, is_super)
    VALUES (
      NEW.id,
      user_phone,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', ''),
      COALESCE((NEW.raw_user_meta_data->>'is_super')::boolean, false)
    )
    ON CONFLICT (auth_id) DO UPDATE SET
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      name = COALESCE(NULLIF(EXCLUDED.name, ''), public.admin_users.name),
      is_super = EXCLUDED.is_super,
      updated_at = now();
  ELSE
    INSERT INTO public.coaches (auth_id, phone, email, name, school, organization, role, is_active)
    VALUES (
      NEW.id,
      user_phone,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', ''),
      COALESCE(NEW.raw_user_meta_data->>'school', ''),
      COALESCE(NEW.raw_user_meta_data->>'organization', ''),
      'coach',
      true
    )
    ON CONFLICT (auth_id) DO UPDATE SET
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      name = COALESCE(NULLIF(EXCLUDED.name, ''), public.coaches.name),
      school = COALESCE(NULLIF(EXCLUDED.school, ''), public.coaches.school),
      organization = COALESCE(NULLIF(EXCLUDED.organization, ''), public.coaches.organization),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER registration_share_token_trigger
  BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_share_token();

CREATE OR REPLACE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_registration_settings_updated_at
  BEFORE UPDATE ON public.registration_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- The current app writes notifications in app/api/registrations/[id]/review/route.ts.
-- Do not add the older registration_notification_trigger, or review notifications may duplicate.

-- ---------------------------------------------------------------------------
-- Storage bucket settings from MemFire source
-- ---------------------------------------------------------------------------

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
    'registration-files',
    'registration-files',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  ),
  (
    'player-photos',
    'player-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']::text[]
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

-- ---------------------------------------------------------------------------
-- RLS and Data API grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;
GRANT SELECT ON TABLE public.admin_users TO authenticated;

DROP POLICY IF EXISTS "Admins can read own profile" ON public.admin_users;
CREATE POLICY "Admins can read own profile"
ON public.admin_users
FOR SELECT
TO authenticated
USING (auth_id = (select auth.uid()));

REVOKE ALL ON TABLE public.coaches FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.coaches TO authenticated;

DROP POLICY IF EXISTS "Coaches can view own profile" ON public.coaches;
DROP POLICY IF EXISTS "Coaches can insert own profile" ON public.coaches;
DROP POLICY IF EXISTS "Coaches can update own profile" ON public.coaches;

CREATE POLICY "Coaches can view own profile"
ON public.coaches
FOR SELECT
TO authenticated
USING (auth_id = (select auth.uid()));

CREATE POLICY "Coaches can insert own profile"
ON public.coaches
FOR INSERT
TO authenticated
WITH CHECK (auth_id = (select auth.uid()));

CREATE POLICY "Coaches can update own profile"
ON public.coaches
FOR UPDATE
TO authenticated
USING (auth_id = (select auth.uid()))
WITH CHECK (auth_id = (select auth.uid()));

REVOKE ALL ON TABLE public.events FROM anon, authenticated;
GRANT SELECT ON TABLE public.events TO anon, authenticated;

DROP POLICY IF EXISTS "Visible events are readable" ON public.events;
CREATE POLICY "Visible events are readable"
ON public.events
FOR SELECT
TO anon, authenticated
USING (COALESCE(is_visible, false) = true);

REVOKE ALL ON TABLE public.project_types FROM anon, authenticated;
REVOKE ALL ON TABLE public.projects FROM anon, authenticated;
REVOKE ALL ON TABLE public.divisions FROM anon, authenticated;
REVOKE ALL ON TABLE public.event_divisions FROM anon, authenticated;
GRANT SELECT ON TABLE public.project_types TO anon, authenticated;
GRANT SELECT ON TABLE public.projects TO anon, authenticated;
GRANT SELECT ON TABLE public.divisions TO anon, authenticated;
GRANT SELECT ON TABLE public.event_divisions TO anon, authenticated;

DROP POLICY IF EXISTS "Enabled project types are readable" ON public.project_types;
DROP POLICY IF EXISTS "Enabled projects are readable" ON public.projects;
DROP POLICY IF EXISTS "Enabled divisions are readable" ON public.divisions;
DROP POLICY IF EXISTS "Visible event divisions are readable" ON public.event_divisions;

CREATE POLICY "Enabled project types are readable"
ON public.project_types
FOR SELECT
TO anon, authenticated
USING (COALESCE(is_enabled, false) = true);

CREATE POLICY "Enabled projects are readable"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (COALESCE(is_enabled, false) = true);

CREATE POLICY "Enabled divisions are readable"
ON public.divisions
FOR SELECT
TO anon, authenticated
USING (COALESCE(is_enabled, false) = true);

CREATE POLICY "Visible event divisions are readable"
ON public.event_divisions
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_divisions.event_id
      AND COALESCE(e.is_visible, false) = true
  )
);

REVOKE ALL ON TABLE public.registration_settings FROM anon, authenticated;
GRANT SELECT ON TABLE public.registration_settings TO anon, authenticated;

DROP POLICY IF EXISTS "Visible registration settings are readable" ON public.registration_settings;
CREATE POLICY "Visible registration settings are readable"
ON public.registration_settings
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = registration_settings.event_id
      AND COALESCE(e.is_visible, false) = true
  )
);

REVOKE ALL ON TABLE public.registrations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registrations TO authenticated;

DROP POLICY IF EXISTS "Admins can manage registrations" ON public.registrations;
DROP POLICY IF EXISTS "Coaches can manage own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Authenticated users can manage permitted registrations" ON public.registrations;

CREATE POLICY "Authenticated users can manage permitted registrations"
ON public.registrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_id = (select auth.uid())
  )
  OR coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.auth_id = (select auth.uid())
  )
  OR coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = (select auth.uid())
  )
);

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;

DROP POLICY IF EXISTS "Coaches can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Coaches can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Coaches can delete own notifications" ON public.notifications;

CREATE POLICY "Coaches can read own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = (select auth.uid())
  )
);

CREATE POLICY "Coaches can update own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = (select auth.uid())
  )
)
WITH CHECK (
  coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = (select auth.uid())
  )
);

CREATE POLICY "Coaches can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (
  coach_id IN (
    SELECT c.id
    FROM public.coaches c
    WHERE c.auth_id = (select auth.uid())
  )
);

REVOKE ALL ON TABLE public.player_share_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_share_tokens TO authenticated;

DROP POLICY IF EXISTS "Coaches can manage own registration share tokens" ON public.player_share_tokens;
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
      AND c.auth_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.coaches c ON c.id = r.coach_id
    WHERE r.id = player_share_tokens.registration_id
      AND c.auth_id = (select auth.uid())
  )
);

REVOKE ALL ON TABLE public.player_submissions FROM anon, authenticated;
GRANT SELECT ON TABLE public.player_submissions TO authenticated;

DROP POLICY IF EXISTS "Coaches can read own player submissions" ON public.player_submissions;
CREATE POLICY "Coaches can read own player submissions"
ON public.player_submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.registrations r
    JOIN public.coaches c ON c.id = r.coach_id
    WHERE r.id = player_submissions.registration_id
      AND c.auth_id = (select auth.uid())
  )
);

REVOKE ALL ON TABLE public.security_audit_logs FROM anon, authenticated;

DROP POLICY IF EXISTS "No client access to security audit logs" ON public.security_audit_logs;
CREATE POLICY "No client access to security audit logs"
ON public.security_audit_logs
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Storage object policies: app uploads use service role. The public
-- event-posters bucket does not need an object SELECT policy for public URLs;
-- avoiding one prevents anonymous clients from listing bucket contents.
DROP POLICY IF EXISTS "Public can read event posters" ON storage.objects;
