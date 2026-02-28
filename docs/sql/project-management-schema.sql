-- 项目管理功能数据库迁移脚本
-- 创建三级层级结构：项目类型 → 具体项目 → 组别

-- ============================================
-- 1. 创建核心表
-- ============================================

-- 项目类型表（一级：体育、科创、艺术）
CREATE TABLE IF NOT EXISTS public.project_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    display_order integer DEFAULT 0,
    is_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT project_types_pkey PRIMARY KEY (id),
    CONSTRAINT project_types_name_key UNIQUE (name)
);

-- 具体项目表（二级：棍网球、篮球等）
CREATE TABLE IF NOT EXISTS public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_type_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    display_order integer DEFAULT 0,
    is_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT projects_project_type_id_fkey FOREIGN KEY (project_type_id)
        REFERENCES public.project_types(id) ON DELETE CASCADE,
    CONSTRAINT projects_name_project_type_unique UNIQUE (name, project_type_id)
);

-- 组别表（三级：U12组、U15组等）
CREATE TABLE IF NOT EXISTS public.divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    is_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT divisions_pkey PRIMARY KEY (id),
    CONSTRAINT divisions_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES public.projects(id) ON DELETE CASCADE,
    CONSTRAINT divisions_name_project_unique UNIQUE (name, project_id)
);

-- 赛事组别关联表（多对多）
CREATE TABLE IF NOT EXISTS public.event_divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    division_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_divisions_pkey PRIMARY KEY (id),
    CONSTRAINT event_divisions_event_id_fkey FOREIGN KEY (event_id)
        REFERENCES public.events(id) ON DELETE CASCADE,
    CONSTRAINT event_divisions_division_id_fkey FOREIGN KEY (division_id)
        REFERENCES public.divisions(id) ON DELETE RESTRICT,
    CONSTRAINT event_divisions_unique UNIQUE (event_id, division_id)
);

-- ============================================
-- 2. 创建索引优化查询性能
-- ============================================

CREATE INDEX IF NOT EXISTS idx_projects_type_id ON public.projects(project_type_id);
CREATE INDEX IF NOT EXISTS idx_projects_enabled ON public.projects(is_enabled);
CREATE INDEX IF NOT EXISTS idx_divisions_project_id ON public.divisions(project_id);
CREATE INDEX IF NOT EXISTS idx_divisions_enabled ON public.divisions(is_enabled);
CREATE INDEX IF NOT EXISTS idx_event_divisions_event_id ON public.event_divisions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_divisions_division_id ON public.event_divisions(division_id);

-- ============================================
-- 3. 修改现有表支持新功能
-- ============================================

-- 添加超级管理员标识
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false;

-- 修改 registration_settings 表支持组别
ALTER TABLE public.registration_settings
ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.divisions(id) ON DELETE CASCADE;

-- 修改唯一约束：从 event_id 改为 (event_id, division_id)
ALTER TABLE public.registration_settings
DROP CONSTRAINT IF EXISTS registration_settings_event_id_key;

ALTER TABLE public.registration_settings
ADD CONSTRAINT registration_settings_event_division_unique
UNIQUE (event_id, division_id);

CREATE INDEX IF NOT EXISTS idx_registration_settings_division_id
ON public.registration_settings(division_id);

-- ============================================
-- 4. 初始化数据
-- ============================================

-- 插入项目类型
INSERT INTO public.project_types (name, display_order, is_enabled) VALUES
('体育', 1, true),
('科创', 2, true),
('艺术', 3, true)
ON CONFLICT (name) DO NOTHING;

-- 插入体育项目
INSERT INTO public.projects (project_type_id, name, display_order, is_enabled)
SELECT pt.id, '棍网球', 1, true FROM project_types pt WHERE pt.name = '体育'
UNION ALL
SELECT pt.id, '篮球', 2, true FROM project_types pt WHERE pt.name = '体育'
UNION ALL
SELECT pt.id, '足球', 3, true FROM project_types pt WHERE pt.name = '体育'
UNION ALL
SELECT pt.id, '排球', 4, true FROM project_types pt WHERE pt.name = '体育'
ON CONFLICT (name, project_type_id) DO NOTHING;

-- ============================================
-- 5. 设置第一个超级管理员（可选）
-- ============================================

-- 取消注释以下行来设置第一个超级管理员
-- UPDATE public.admin_users SET is_super = true WHERE phone = '13800138000';

-- ============================================
-- 完成
-- ============================================

-- 验证表创建
SELECT 'project_types' as table_name, COUNT(*) as count FROM public.project_types
UNION ALL
SELECT 'projects', COUNT(*) FROM public.projects
UNION ALL
SELECT 'divisions', COUNT(*) FROM public.divisions
UNION ALL
SELECT 'event_divisions', COUNT(*) FROM public.event_divisions;
