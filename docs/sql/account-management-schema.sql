-- 账号管理功能数据库变更
-- 执行时间：2026-03-05
-- 说明：为 coaches 表添加账号管理所需字段

-- ============================================
-- 1. 扩展 coaches 表
-- ============================================

-- 添加账号状态字段（用于启用/禁用账号）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 添加创建者追踪（记录是哪个管理员创建的）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);

-- 添加最后登录时间（用于统计和监控）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

-- 添加备注字段（管理员可以添加备注）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS notes text;

-- ============================================
-- 2. 创建索引优化查询性能
-- ============================================

-- 为常用查询字段创建索引
CREATE INDEX IF NOT EXISTS idx_coaches_phone ON public.coaches(phone);
CREATE INDEX IF NOT EXISTS idx_coaches_is_active ON public.coaches(is_active);
CREATE INDEX IF NOT EXISTS idx_coaches_created_by ON public.coaches(created_by);

-- ============================================
-- 3. 验证
-- ============================================

-- 查看 coaches 表结构
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'coaches'
ORDER BY ordinal_position;

-- 查看所有教练账号及其状态
SELECT
  c.id,
  c.phone,
  c.name,
  c.school,
  c.is_active,
  c.created_at,
  c.last_login_at,
  a.phone as created_by_admin
FROM public.coaches c
LEFT JOIN public.admin_users a ON c.created_by = a.id
ORDER BY c.created_at DESC;
