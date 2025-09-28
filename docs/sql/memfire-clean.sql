-- MemFire Cloud 数据库架构
-- 体育比赛报名管理系统数据库结构

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 创建存储相关的 Schema 和类型
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS'
);

-- 创建核心表
CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(20) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_users_pkey PRIMARY KEY (id),
    CONSTRAINT admin_users_phone_key UNIQUE (phone)
);

CREATE TABLE IF NOT EXISTS public.coaches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    email character varying(255) NOT NULL,
    name character varying(100),
    phone character varying(20),
    school character varying(100),
    role character varying(20) DEFAULT 'coach'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    organization character varying(255),
    CONSTRAINT coaches_pkey PRIMARY KEY (id),
    CONSTRAINT coaches_auth_id_key UNIQUE (auth_id),
    CONSTRAINT coaches_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    CONSTRAINT events_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    coach_id uuid,
    team_data jsonb,
    players_data jsonb,
    status character varying(20) DEFAULT 'draft'::character varying,
    share_token character varying(100),
    rejection_reason text,
    cancelled_at timestamp with time zone,
    cancelled_reason text,
    submitted_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    reviewer_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_status_read_at timestamp with time zone,
    last_status_change timestamp with time zone,
    CONSTRAINT registrations_pkey PRIMARY KEY (id),
    CONSTRAINT registrations_share_token_key UNIQUE (share_token),
    CONSTRAINT registrations_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.registration_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    team_requirements jsonb,
    player_requirements jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT registration_settings_pkey PRIMARY KEY (id),
    CONSTRAINT registration_settings_event_id_key UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid,
    registration_id uuid,
    event_id uuid,
    type character varying(20),
    title character varying(255) NOT NULL,
    message text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['approval'::character varying, 'rejection'::character varying, 'reminder'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.player_share_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid,
    event_id uuid,
    token character varying(255) NOT NULL,
    player_index integer,
    player_data jsonb,
    is_filled boolean DEFAULT false,
    filled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    player_id character varying(255),
    is_active boolean DEFAULT true,
    used_at timestamp with time zone,
    CONSTRAINT player_share_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT player_share_tokens_token_key UNIQUE (token)
);

CREATE TABLE IF NOT EXISTS public.player_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid,
    share_token character varying(100) NOT NULL,
    player_data jsonb NOT NULL,
    submitted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT player_submissions_pkey PRIMARY KEY (id)
);

-- Storage 表
CREATE TABLE IF NOT EXISTS storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL,
    CONSTRAINT buckets_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer,
    CONSTRAINT objects_pkey PRIMARY KEY (id)
);

-- 外键约束
ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.admin_users(id);

ALTER TABLE ONLY public.registration_settings
    ADD CONSTRAINT registration_settings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.player_share_tokens
    ADD CONSTRAINT player_share_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.player_share_tokens
    ADD CONSTRAINT player_share_tokens_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.player_submissions
    ADD CONSTRAINT player_submissions_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

-- 索引
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_coach_id ON public.registrations(coach_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_notifications_coach_id ON public.notifications(coach_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_events_visible ON public.events(is_visible);

-- 函数
CREATE OR REPLACE FUNCTION public.generate_share_token() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_share_token() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.share_token IS NULL THEN
        NEW.share_token := generate_share_token();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 触发器
CREATE OR REPLACE TRIGGER registration_share_token_trigger
    BEFORE INSERT ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.set_share_token();

CREATE OR REPLACE TRIGGER update_registrations_updated_at
    BEFORE UPDATE ON public.registrations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_coaches_updated_at
    BEFORE UPDATE ON public.coaches
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON public.admin_users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 视图
CREATE OR REPLACE VIEW public.registration_details AS
 SELECT r.id,
    r.event_id,
    r.coach_id,
    r.team_data,
    r.players_data,
    r.status,
    r.share_token,
    r.rejection_reason,
    r.cancelled_at,
    r.cancelled_reason,
    r.submitted_at,
    r.reviewed_at,
    r.reviewer_id,
    r.created_at,
    r.updated_at,
    r.last_status_read_at,
    r.last_status_change,
    e.name AS event_name,
    e.short_name AS event_short_name,
    e.poster_url AS event_poster_url,
    e.type AS event_type,
    e.start_date AS event_start_date,
    e.end_date AS event_end_date,
    e.address AS event_address,
    e.details AS event_details,
    e.phone AS event_phone,
    e.registration_start_date,
    e.registration_end_date,
    e.requirements AS event_requirements,
    c.name AS coach_name,
    c.email AS coach_email,
    c.phone AS coach_phone,
    c.school AS coach_school
   FROM ((public.registrations r
     LEFT JOIN public.events e ON ((r.event_id = e.id)))
     LEFT JOIN public.coaches c ON ((r.coach_id = c.id)));

-- 插入管理员账户
INSERT INTO public.admin_users (phone, password_hash)
VALUES ('13800138000', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (phone) DO NOTHING;

-- 完成
SELECT 'MemFire Cloud 数据库架构导入完成！' as message;