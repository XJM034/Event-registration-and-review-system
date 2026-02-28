-- 修复账号创建冲突
-- 在 MemFire SQL Editor 中执行

-- ============================================
-- 第一步：清理残留数据
-- ============================================

-- 删除 coaches 表中 auth_id 为空或对应 auth.users 不存在的记录
DELETE FROM public.coaches
WHERE auth_id IS NULL
   OR auth_id NOT IN (SELECT id FROM auth.users);

-- 删除 admin_users 表中 auth_id 为空或对应 auth.users 不存在的记录
DELETE FROM public.admin_users
WHERE auth_id IS NULL
   OR auth_id NOT IN (SELECT id FROM auth.users);

-- 删除 auth.identities 中 @system.local 的记录
DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@system.local'
);

-- 删除 auth.users 中 @system.local 的记录
DELETE FROM auth.users WHERE email LIKE '%@system.local';

-- ============================================
-- 第二步：修复触发器（同时处理 email 冲突）
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
