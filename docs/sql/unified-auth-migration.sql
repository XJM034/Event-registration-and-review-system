-- 重构认证系统：统一使用 MemFire Auth
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

ALTER TABLE public.admin_users
ADD CONSTRAINT admin_users_email_key UNIQUE (email);

-- phone 字段改为可选（因为现在主要用 email）
ALTER TABLE public.admin_users
ALTER COLUMN phone DROP NOT NULL;

-- password_hash 字段改为可选（因为密码由 Supabase Auth 管理）
ALTER TABLE public.admin_users
ALTER COLUMN password_hash DROP NOT NULL;

-- ============================================
-- 2. 创建账号说明
-- ============================================

-- 注意：实际账号需要在 MemFire Dashboard 中创建
-- 路径：Authentication -> Users -> Add User

-- 需要创建的账号：

-- 超级管理员账号（2个）：
-- 1. Email: admin1@example.com, Password: admin123, Phone: 18140044662
-- 2. Email: admin2@example.com, Password: admin123, Phone: 13164550100

-- 教练账号（5个）：
-- 1. Email: coach1@example.com, Password: user123, Phone: 13800000001
-- 2. Email: coach2@example.com, Password: user123, Phone: 13800000002
-- 3. Email: coach3@example.com, Password: user123, Phone: 13800000003
-- 4. Email: coach4@example.com, Password: user123, Phone: 13800000004
-- 5. Email: coach5@example.com, Password: user123, Phone: 13800000005

-- ============================================
-- 3. 创建触发器自动同步账号
-- ============================================

-- 当 Supabase Auth 创建用户时，自动在对应表中创建记录
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- 检查 user_metadata 中的 role 字段
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    -- 创建管理员记录
    INSERT INTO public.admin_users (auth_id, email, phone, is_super)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      COALESCE((NEW.raw_user_meta_data->>'is_super')::boolean, false)
    )
    ON CONFLICT (auth_id) DO NOTHING;
  ELSE
    -- 创建教练记录
    INSERT INTO public.coaches (auth_id, email, phone, name, school, organization, role)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
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
-- 4. 批量创建账号的 SQL（可选）
-- ============================================

-- 如果你有 service_role key，可以使用以下 SQL 批量创建
-- 否则请在 MemFire Dashboard 中手动创建

-- 注意：以下 SQL 需要在 Supabase 的 SQL Editor 中以 service_role 权限执行
-- 或者使用 Supabase Management API

/*
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
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin1@example.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  '{"role": "admin", "phone": "18140044662", "is_super": true}'::jsonb,
  now(),
  now()
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
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin2@example.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  '{"role": "admin", "phone": "13164550100", "is_super": true}'::jsonb,
  now(),
  now()
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
  updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'coach1@example.com', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "phone": "13800000001", "name": "教练1", "school": "学校1"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'coach2@example.com', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "phone": "13800000002", "name": "教练2", "school": "学校2"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'coach3@example.com', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "phone": "13800000003", "name": "教练3", "school": "学校3"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'coach4@example.com', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "phone": "13800000004", "name": "教练4", "school": "学校4"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'coach5@example.com', crypt('user123', gen_salt('bf')), now(), '{"role": "coach", "phone": "13800000005", "name": "教练5", "school": "学校5"}'::jsonb, now(), now());
*/

-- ============================================
-- 5. 验证
-- ============================================

-- 查看所有管理员
SELECT a.email, a.phone, a.is_super, a.created_at
FROM public.admin_users a
ORDER BY a.is_super DESC, a.created_at;

-- 查看所有教练
SELECT c.email, c.name, c.phone, c.school, c.created_at
FROM public.coaches c
ORDER BY c.created_at;

-- ============================================
-- 完成
-- ============================================

-- 手动创建账号步骤（推荐）：
-- 1. 登录 MemFire Dashboard
-- 2. 进入 Authentication -> Users
-- 3. 点击 "Add User"
-- 4. 填写信息：
--    - Email: admin1@example.com
--    - Password: admin123
--    - User Metadata: {"role": "admin", "phone": "18140044662", "is_super": true}
-- 5. 重复步骤 3-4 创建其他账号
