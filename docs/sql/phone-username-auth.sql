-- 统一认证系统：使用手机号作为用户名登录
-- 执行前请确保已经运行了 project-management-schema.sql

-- ============================================
-- 1. 修改 admin_users 表结构
-- ============================================

-- 添加 auth_id 字段关联 Supabase Auth
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 添加 email 字段
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS email character varying(255);

-- 添加唯一约束
ALTER TABLE public.admin_users
ADD CONSTRAINT admin_users_auth_id_key UNIQUE (auth_id);

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
-- 3. 在 MemFire Dashboard 中创建账号
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

-- 教练 1：
-- Email: 13800000001@system.local
-- Password: user123
-- User Metadata: {"role": "coach", "name": "教练1", "school": "学校1"}
-- Email Confirm: true

-- 教练 2：
-- Email: 13800000002@system.local
-- Password: user123
-- User Metadata: {"role": "coach", "name": "教练2", "school": "学校2"}
-- Email Confirm: true

-- 教练 3：
-- Email: 13800000003@system.local
-- Password: user123
-- User Metadata: {"role": "coach", "name": "教练3", "school": "学校3"}
-- Email Confirm: true

-- 教练 4：
-- Email: 13800000004@system.local
-- Password: user123
-- User Metadata: {"role": "coach", "name": "教练4", "school": "学校4"}
-- Email Confirm: true

-- 教练 5：
-- Email: 13800000005@system.local
-- Password: user123
-- User Metadata: {"role": "coach", "name": "教练5", "school": "学校5"}
-- Email Confirm: true

-- ============================================
-- 4. 验证
-- ============================================

-- 查看所有管理员
SELECT a.phone, a.email, a.is_super, a.created_at
FROM public.admin_users a
ORDER BY a.is_super DESC, a.created_at;

-- 查看所有教练
SELECT c.phone, c.name, c.school, c.created_at
FROM public.coaches c
ORDER BY c.created_at;

-- ============================================
-- 5. 批量创建账号的 SQL（可选）
-- ============================================

-- 如果你想通过 SQL 批量创建账号，可以使用以下脚本
-- 注意：需要在 MemFire 的 SQL Editor 中执行

-- 创建超级管理员 1
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  '18140044662@system.local',
  crypt('admin123', gen_salt('bf')),
  now(),
  '{"role": "admin", "is_super": true}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- 创建超级管理员 2
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  '13164550100@system.local',
  crypt('admin123', gen_salt('bf')),
  now(),
  '{"role": "admin", "is_super": true}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- 创建教练账号 1-5
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '13800000001@system.local', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "name": "教练1", "school": "学校1"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '13800000002@system.local', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "name": "教练2", "school": "学校2"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '13800000003@system.local', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "name": "教练3", "school": "学校3"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '13800000004@system.local', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "name": "教练4", "school": "学校4"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '13800000005@system.local', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "name": "教练5", "school": "学校5"}'::jsonb, now(), now(), '', '', '', '');

-- ============================================
-- 重要提示
-- ============================================

-- 1. 用户登录流程：
--    - 用户输入手机号：18140044662
--    - 系统自动转换为：18140044662@system.local
--    - 使用邮箱密码方式登录

-- 2. 密码修改：
--    - 用户登录后可以通过 Supabase 的 updateUser 方法修改密码
--    - 不需要配置短信服务，完全免费

-- 3. 不需要启用邮箱验证：
--    - Settings -> Authentication -> Email Auth -> Confirm Email: 关闭
--    建用户时设置 email_confirmed_at = now()

-- 4. 后续添加教练账号：
--    - 管理员在后台创建账号（手机号@system.local）
--    - 设置默认密码（user123）
--    - 教练首次登录后自行修改密码
