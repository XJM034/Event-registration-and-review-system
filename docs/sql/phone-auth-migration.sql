-- 统一认证系统：使用 MemFire Auth 手机号登录
-- 执行前请确保已经运行了 project-management-schema.sql

-- ============================================
-- 1. 修改 admin_users 表结构
-- ============================================

-- 添加 auth_id 字段关联 Supabase Auth
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 添加 email 字段（可选）
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
BEGIN
  -- 检查 user_metadata 中的 role 字段
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    -- 创建管理员记录
    INSERT INTO public.admin_users (auth_id, phone, email, is_super)
    VALUES (
      NEW.id,
      NEW.phone,
      COALESCE(NEW.email, ''),
      COALESCE((NEW.raw_user_meta_data->>'is_super')::boolean, false)
    )
    ON CONFLICT (auth_id) DO NOTHING;
  ELSE
    -- 创建教练记录
    INSERT INTO public.coaches (auth_id, phone, email, name, school, organization, role)
    VALUES (
      NEW.id,
      NEW.phone,
      COALESCE(NEW.email, ''),
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

-- 超级管理员账号（2个）：
-- 1. Phone: 18140044662
--    Password: admin123
--    User Metadata: {"role": "admin", "is_super": true}

-- 2. Phone: 13164550100
--    Password: admin123
--    User Metadata: {"role": "admin", "is_super": true}

-- 教练账号（5个）：
-- 1. Phone: 13800000001
--    Password: user123
--    User Metadata: {"role": "coach", "name": "教练1", "school": "学校1"}

-- 2. Phone: 13800000002
--    Password: user123
--    User Metadata: {"role": "coach", "name": "教练2", "school": "学校2"}

-- 3. Phone: 13800000003
--    Password: user123
--    User Metadata: {"role": "coach", "name": "教练3", "school": "学校3"}

-- 4. Phone: 13800000004
--    Password: user123
--    User Metadata: {"role": "coach", "name": "教练4", "school": "学校4"}

-- 5. Phone: 13800000005
--    Password: user123
--    User Metadata: {"role": "coach", "name": "教练5", "school": "学校5"}

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
-- 重要提示
-- ============================================

-- 1. 在 MemFire Dashboard 中启用手机号认证：
--    Settings -> Authentication -> Phone Auth -> Enable

-- 2. 配置短信服务商（可选，用于密码重置）：
--    Settings -> Authentication -> Phone Auth -> SMS Provider

-- 3. 如果不配置短信服务，用户可以通过管理员重置密码

-- 4. 创建账号时的注意事项：
--    - Phone 字段必须填写（格式：+86 18140044662 或 18140044662）
--    - User Metadata 必须包含 role 字段
--    - 超级管理员的 User Metadata 必须包含 is_super: true
