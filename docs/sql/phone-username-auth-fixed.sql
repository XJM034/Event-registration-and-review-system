-- 统一认证系统：使用手机号作为用户名登录（修复版）
-- 执行前请确保已经运行了 project-management-schema.sql

-- ============================================
-- 1. 修改 admin_users 表结构
-- ============================================

-- 添加 auth_id 字段关联 Supabase Auth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'auth_id'
  ) THEN
    ALTER TABLE public.admin_users
    ADD COLUMN auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 添加 email 字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.admin_users
    ADD COLUMN email character varying(255);
  END IF;
END $$;

-- 添加唯一约束（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_users_auth_id_key'
  ) THEN
    ALTER TABLE public.admin_users
    ADD CONSTRAINT admin_users_auth_id_key UNIQUE (auth_id);
  END IF;
END $$;

-- phone 字段保持必填
-- password_hash 字段改为可选（因为密码由 Supabase Auth 管理）
ALTER TABLE public.admin_users
ALTER COLUMN password_hash DROP NOT NULL;

-- ============================================
-- 2. 创建触发器自动同步账号
-- ============================================

-- 当 Supabase Auth 创建用户时，自动在对应表中创建记录
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_phone text;
BEGIN
  -- 从邮箱中提取手机号（格式：18140044662@system.local）
  user_phone := split_part(NEW.email, '@', 1);

  -- 检查 user_metadata 中的 role 字段
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    -- 创建管理员记录
    INSERT INTO public.admin_users (auth_id, phone, email, is_super)
    VALUES (
      NEW.id,
      user_phone,
      NEW.email,
      COALESCE((NEW.raw_user_meta_data->>'is_super')::boolean, false)
    )
    ON CONFLICT (auth_id) DO NOTHING;
  ELSE
    -- 创建教练记录
    INSERT INTO public.coaches (auth_id, phone, email, name, school, organization, role)
    VALUES (
      NEW.id,
      user_phone,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', ''),
      COALESCE(NEW.raw_user_meta_data->>'school', ''),
      COALESCE(NEW.raw_user_meta_data->>'organization', ''),
      'coach'
    )
    ON CONFLICT (auth_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. 清理旧数据（可选）
-- ============================================

-- 如果你想清理旧的管理员数据（没有 auth_id 的记录），取消注释以下行
-- DELETE FROM public.admin_users WHERE auth_id IS NULL;

-- ============================================
-- 4. 验证
-- ============================================

-- 查看所有管理员
SELECT a.phone, a.email, a.is_super, a.auth_id, a.created_at
FROM public.admin_users a
ORDER BY a.is_super DESC, a.created_at;

-- 查看所有教练
SELECT c.phone, c.name, c.school, c.auth_id, c.created_at
FROM public.coaches c
ORDER BY c.created_at;

-- ============================================
-- 5. 在 MemFire Dashboard 中创建账号
-- ============================================

-- 需要在 MemFire Dashboard 中手动创建以下账号
-- 路径：Authentication -> Users -> Add User

-- 重要说明：
-- 1. Email 格式：手机号@system.local（例如：18140044662@system.local）
-- 2. 用户登录时只需输入手机号，系统会自动转换为邮箱格式
-- 3. 不需要启用邮箱验证（Email Confirmation）

-- ============================================
-- 超级管理员账号（2个）
-- ============================================

-- 账号 1：
-- Email: 18140044662@system.local
-- Password: admin123
-- User Metadata: {"role": "admin", "is_super": true}
-- Email Confirm: true（跳过邮箱验证）

-- 账号 2：
-- Email: 13164550100@system.local
-- Password: admin123
-- User Metadata: {"role": "admin", "is_super": true}
-- Email Confirm: true

-- ============================================
-- 教练账号（5个）
-- ============================================

-- 教练 1-5：
-- Email: 13800000001@system.local ~ 13800000005@system.local
-- Password: user123
-- User Metadata: {"role": "coach", "name": "教练X", "school": "学校X"}
-- Email Confirm: true

-- ============================================
-- 完成提示
-- ============================================

-- 执行完成后：
-- 1. 在 MemFire Dashboard 创建上述账号
-- 2. 访问 http://localhost:3000/auth/login
-- 3. 使用手机号登录（如：18140044662）
-- 4. 系统会自动转换为邮箱格式进行认证
