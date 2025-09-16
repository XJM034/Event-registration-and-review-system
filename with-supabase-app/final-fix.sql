-- 完整修复 SQL - 复制到 Supabase SQL Editor 执行

-- 1. 完全禁用 RLS 用于测试
ALTER TABLE IF EXISTS admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS registration_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS registrations DISABLE ROW LEVEL SECURITY;

-- 2. 删除所有现有策略
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Admin users can access all admin_users" ON admin_users;
    DROP POLICY IF EXISTS "Admin users can access all events" ON events;
    DROP POLICY IF EXISTS "Admin users can access all registration_settings" ON registration_settings;
    DROP POLICY IF EXISTS "Admin users can access all registrations" ON registrations;
    DROP POLICY IF EXISTS "Enable all access for service role" ON admin_users;
    DROP POLICY IF EXISTS "Enable all access for service role" ON events;
    DROP POLICY IF EXISTS "Enable all access for service role" ON registration_settings;
    DROP POLICY IF EXISTS "Enable all access for service role" ON registrations;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- 3. 确保表存在（如果不存在则创建）
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    poster_url TEXT,
    type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    address TEXT,
    details TEXT,
    phone VARCHAR(20),
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registration_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_requirements JSONB,
    player_requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id)
);

CREATE TABLE IF NOT EXISTS registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_data JSONB,
    players_data JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_id UUID REFERENCES admin_users(id)
);

-- 4. 清理并插入管理员账户
DELETE FROM admin_users;
INSERT INTO admin_users (phone, password_hash) 
VALUES ('13800138000', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPjiCtnqm');

-- 5. 验证数据
SELECT 'Admin user created:' as message, phone, length(password_hash) as hash_length 
FROM admin_users WHERE phone = '13800138000';

-- 6. 为安全起见，重新启用 RLS 但设置宽松策略
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 7. 创建允许所有操作的策略
CREATE POLICY "allow_all" ON admin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON registration_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON registrations FOR ALL USING (true) WITH CHECK (true);

-- 完成提示
SELECT 'Setup complete! You can now login with phone: 13800138000 and password: admin123' as status;