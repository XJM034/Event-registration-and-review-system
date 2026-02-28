-- 添加新管理员账号（增量脚本，不影响已有账号）
-- 在 MemFire SQL Editor 中执行
-- 普通管理员：18990112228 / 13330809316 / 17390525338
-- 超级管理员：18280029172 / 13164550100
-- 默认密码：admin123

-- ============================================
-- 第一步：创建超级管理员
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
  '18280029172@system.local',
  crypt('admin123', gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "admin", "is_super": true}'::jsonb,
  now(), now(), '', '', '', ''
);

-- 13164550100 可能已在 create-auth-accounts.sql 中创建，确保 is_super = true
UPDATE public.admin_users SET is_super = true WHERE phone = '13164550100';

-- 如果 13164550100 尚未创建，则插入
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  '13164550100@system.local',
  crypt('admin123', gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "admin", "is_super": true}'::jsonb,
  now(), now(), '', '', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = '13164550100@system.local'
);

-- ============================================
-- 第二步：创建普通管理员
-- ============================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000',
   gen_random_uuid(), 'authenticated', 'authenticated',
   '18990112228@system.local',
   crypt('admin123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "admin", "is_super": false}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   gen_random_uuid(), 'authenticated', 'authenticated',
   '13330809316@system.local',
   crypt('admin123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "admin", "is_super": false}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   gen_random_uuid(), 'authenticated', 'authenticated',
   '17390525338@system.local',
   crypt('admin123', gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{"role": "admin", "is_super": false}'::jsonb,
   now(), now(), '', '', '', '');

-- ============================================
-- 第三步：同步 identities 表（登录必需）
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
WHERE u.email IN (
  '18280029172@system.local',
  '13164550100@system.local',
  '18990112228@system.local',
  '13330809316@system.local',
  '17390525338@system.local'
)
AND NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
);

-- ============================================
-- 第四步：验证
-- ============================================

SELECT email,
       raw_user_meta_data->>'role' as role,
       raw_user_meta_data->>'is_super' as is_super
FROM auth.users
WHERE email IN (
  '18280029172@system.local',
  '18990112228@system.local',
  '13330809316@system.local',
  '17390525338@system.local'
)
ORDER BY created_at;

SELECT phone, email, is_super, auth_id IS NOT NULL as has_auth
FROM public.admin_users
WHERE phone IN ('18280029172', '18990112228', '13330809316', '17390525338')
ORDER BY created_at;
