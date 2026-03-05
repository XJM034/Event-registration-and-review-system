-- 为 coaches 表添加缺失的列
-- 执行时间：2026-03-05

-- 添加 is_active 列（账号是否启用）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- 添加 notes 列（备注信息）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS notes text;

-- 添加 last_login_at 列（最后登录时间）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

-- 添加 created_by 列（创建者，关联管理员）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);

-- 为 created_by 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_coaches_created_by ON public.coaches(created_by);

-- 为 is_active 创建索引（常用于筛选）
CREATE INDEX IF NOT EXISTS idx_coaches_is_active ON public.coaches(is_active);

-- 添加注释
COMMENT ON COLUMN public.coaches.is_active IS '账号是否启用';
COMMENT ON COLUMN public.coaches.notes IS '备注信息';
COMMENT ON COLUMN public.coaches.last_login_at IS '最后登录时间';
COMMENT ON COLUMN public.coaches.created_by IS '创建者（管理员ID）';

-- 将现有教练账号设置为启用状态
UPDATE public.coaches
SET is_active = true
WHERE is_active IS NULL;
