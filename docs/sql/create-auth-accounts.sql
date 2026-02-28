-- 修复冲突 + 创建账号（一体化脚本）
-- 在 MemFire SQL Editor 中执行

-- ============================================
-- 第一步：清理所有残留数据
-- ============================================

-- 清理 coaches 表中孤立记录（auth_id 为空或对应用户已删除）
DELETE FROM public.coaches
WHERE email LIKE '%@system.local'
  AND (auth_id IS NULL OR auth_id NOT IN (SELECT id FROM auth.users));

-- 清理 admin_users 表中孤立记录
DELETE FROM public.admin_users
WHERE email LIKE '%@system.local'
  AND (auth_id IS NULL OR auth_id NOT IN (SELECT id FROM auth.users));

-- 清理 auth.identities
DELETE FROM auth.identities
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@system.local');

-- 清理 auth.users
DELETE FROM auth.users WHERE email LIKE '%@system.local';

-- ============================================
-- 第二步：修复触发器（处理 email 冲突）
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_phone text;
BEGIN
  user_phone := split_part(NEW.email, '@', 1);

  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.admin_users (auth_id, phone, email, is_super)
    VALUES (
      NEW.id,
      user_phone,
      NEW.email,
      COALESCE((NEW.raw_user_meta_data->>'is_super')::boolean, false)
    )
    ON CONFLICT (auth_id) DO NOTHING;
  ELSE
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
    ON CONFLICT (email) DO UPDATE SET
      auth_id = EXCLUDED.auth_id,
      phone = EXCLUDED.phone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 第三步：创建超级管理员账号
-- ============================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  '18140044662@system.local',
  crypt('admin123', gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "admin", "is_super": true}'::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  '13164550100@system.local',
  crypt('admin123', gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "admin", "is_super": true}'::jsonb,
  now(), now(), '', '', '', ''
);

-- ============================================
-- 第四步：创建教练账号
-- ============================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   'authenticated', 'authenticated',
   '13800000001@system.local', crypt('user123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "coach", "name": "教练1", "school": "学校1"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   'authenticated', 'authenticated',
   '13800000002@system.local', crypt('user123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "coach", "name": "教练2", "school": "学校2"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   'authenticated', 'authenticated',
   '13800000003@system.local', crypt('user123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "coach", "name": "教练3", "school": "学校3"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   'authenticated', 'authenticated',
   '13800000004@system.local', crypt('user123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "coach", "name": "教练4", "school": "学校4"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   'authenticated', 'authenticated',
   '13800000005@system.local', crypt('user123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "coach", "name": "教练5", "school": "学校5"}'::jsonb,
   now(), now(), '', '', '', '');

-- ============================================
-- 第五步：同步 identities 表
-- ============================================

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text,
  now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@system.local'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
  );

-- ============================================
-- 第六步：验证
-- ============================================

SELECT email,
       raw_user_meta_data->>'role' as role,
       raw_user_meta_data->>'is_super' as is_super
FROM auth.users
WHERE email LIKE '%@system.local'
ORDER BY created_at;

SELECT phone, email, is_super, auth_id IS NOT NULL as has_auth
FROM public.admin_users ORDER BY created_at;

SELECT phone, name, email, auth_id IS NOT NULL as has_auth
FROM public.coaches ORDER BY created_at;
