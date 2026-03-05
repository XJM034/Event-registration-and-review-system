-- 为 admin_users 表添加缺失的列
-- 执行时间：2026-03-05

-- 添加 auth_id 列（关联 auth.users）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 添加 name 列（管理员姓名）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS name character varying(100);

-- 添加 is_super 列（是否为超级管理员）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false NOT NULL;

-- 为 auth_id 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_admin_users_auth_id ON public.admin_users(auth_id);

-- 添加注释
COMMENT ON COLUMN public.admin_users.auth_id IS '关联的 auth.users 用户ID';
COMMENT ON COLUMN public.admin_users.name IS '管理员姓名';
COMMENT ON COLUMN public.admin_users.is_super IS '是否为超级管理员';

-- 将现有管理员设置为超级管理员（如果表中已有数据）
-- 这样可以确保至少有一个超级管理员
UPDATE public.admin_users
SET is_super = true
WHERE is_super = false;
