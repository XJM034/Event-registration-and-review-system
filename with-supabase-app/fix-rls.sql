-- 修复 RLS 策略问题

-- 1. 暂时禁用 RLS 来测试连接
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE registration_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE registrations DISABLE ROW LEVEL SECURITY;

-- 2. 删除可能冲突的旧策略
DROP POLICY IF EXISTS "Admin users can access all admin_users" ON admin_users;
DROP POLICY IF EXISTS "Admin users can access all events" ON events;
DROP POLICY IF EXISTS "Admin users can access all registration_settings" ON registration_settings;
DROP POLICY IF EXISTS "Admin users can access all registrations" ON registrations;

-- 3. 创建服务角色可以访问的策略
CREATE POLICY "Enable all access for service role" ON admin_users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for service role" ON events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for service role" ON registration_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for service role" ON registrations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. 重新启用 RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 5. 确保有测试管理员账户（如果不存在的话）
INSERT INTO admin_users (phone, password_hash) 
VALUES ('13800138000', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (phone) DO NOTHING;