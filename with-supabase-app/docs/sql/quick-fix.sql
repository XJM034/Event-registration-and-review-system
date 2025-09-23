-- 快速修复登录问题 - 直接在 Supabase SQL Editor 中执行

-- 1. 临时关闭所有表的 RLS
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE registration_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE registrations DISABLE ROW LEVEL SECURITY;

-- 2. 清理现有数据并插入测试管理员
DELETE FROM admin_users WHERE phone = '13800138000';
INSERT INTO admin_users (phone, password_hash) 
VALUES ('13800138000', 'temp_hash');

-- 3. 验证插入结果
SELECT * FROM admin_users;