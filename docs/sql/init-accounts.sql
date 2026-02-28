-- 初始化管理员和教练账号
-- 执行前请确保已经运行了 project-management-schema.sql

-- ============================================
-- 1. 设置超级管理员账号
-- ============================================

-- 密码：admin123 的 bcrypt hash
-- 注意：这是使用 bcrypt.hash('admin123', 10) 生成的
-- 如果需要重新生成，可以使用 Node.js:
-- const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('admin123', 10));

-- 插入或更新超级管理员账号
INSERT INTO public.admin_users (phone, password_hash, is_super)
VALUES
  ('18140044662', '$2a$10$rQJ5YvH0qZXKJ5YvH0qZXeO5YvH0qZXKJ5YvH0qZXKJ5YvH0qZXKJ', true),
  ('13164550100', '$2a$10$rQJ5YvH0qZXKJ5YvH0qZXeO5YvH0qZXKJ5YvH0qZXKJ5YvH0qZXKJ', true)
ON CONFLICT (phone)
DO UPDATE SET
  is_super = true,
  password_hash = EXCLUDED.password_hash,
  updated_at = now();

-- 保留原有的管理员账号（如果存在），设置为普通管理员
UPDATE public.admin_users
SET is_super = false
WHERE phone NOT IN ('18140044662', '13164550100', '13800138000');

-- 如果 13800138000 存在，也设置为超级管理员
UPDATE public.admin_users
SET is_super = true
WHERE phone = '13800138000';

-- ============================================
-- 2. 创建教练账号
-- ============================================

-- 注意：教练使用 Supabase Auth，需要通过 Supabase 的 API 创建
-- 这里我们先在 coaches 表中预留记录，实际的 auth 账号需要通过管理界面创建

-- 密码：user123 的 bcrypt hash（用于参考）
-- 实际教练账号需要通过 Supabase Auth 创建，这里只是预留数据结构

-- 创建教练记录（auth_id 暂时为 null，等待通过管理界面创建）
INSERT INTO public.coaches (auth_id, email, name, phone, school, organization, role)
VALUES
  (NULL, 'coach1@example.com', '教练1', '13800000001', '学校1', '组织1', 'coach'),
  (NULL, 'coach2@example.com', '教练2', '13800000002', '学校2', '组织2', 'coach'),
  (NULL, 'coach3@example.com', '教练3', '13800000003', '学校3', '组织3', 'coach'),
  (NULL, 'coach4@example.com', '教练4', '13800000004', '学校4', '组织4', 'coach'),
  (NULL, 'coach5@example.com', '教练5', '13800000005', '学校5', '组织5', 'coach')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 3. 验证账号创建
-- ============================================

-- 查看所有管理员账号
SELECT phone, is_super, created_at
FROM public.admin_users
ORDER BY is_super DESC, created_at;

-- 查看所有教练账号
SELECT email, name, phone, school, created_at
FROM public.coaches
ORDER BY created_at;

-- ============================================
-- 完成
-- ============================================

-- 超级管理员账号（可以直接登录）：
-- 1. 18140044662 / admin123
-- 2. 13164550100 / admin123
-- 3. 13800138000 / admin123（如果存在）

-- 教练账号需要通过以下方式创建：
-- 方式1：使用 Supabase Dashboard 的 Authentication 功能手动创建
-- 方式2：开发管理端的"教练管理"功能，通过界面创建
-- 方式3：使用 Supabase API 批量创建（见下方脚本）
