-- 体育比赛报名系统数据库表结构

-- 1. 管理员用户表
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 赛事活动表
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

-- 3. 报名设置表
CREATE TABLE IF NOT EXISTS registration_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_requirements JSONB,
    player_requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id)
);

-- 4. 报名申请表
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

-- 5. 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_events_is_visible ON events(is_visible);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_registrations_event_status ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_submitted_at ON registrations(submitted_at DESC);

-- 6. 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. 为需要的表创建更新时间触发器
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_registration_settings_updated_at BEFORE UPDATE ON registration_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 插入默认管理员账户 (密码: admin123)
-- 注意：这里使用简单哈希，生产环境需要更安全的哈希方法
INSERT INTO admin_users (phone, password_hash) 
VALUES ('13800138000', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (phone) DO NOTHING;

-- 9. 设置Row Level Security (RLS)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 10. 创建 RLS 策略（管理员可以访问所有数据）
CREATE POLICY "Admin users can access all admin_users" ON admin_users
    FOR ALL USING (true);

CREATE POLICY "Admin users can access all events" ON events
    FOR ALL USING (true);

CREATE POLICY "Admin users can access all registration_settings" ON registration_settings
    FOR ALL USING (true);

CREATE POLICY "Admin users can access all registrations" ON registrations
    FOR ALL USING (true);

-- 11. 创建存储桶用于文件上传
INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-posters', 'event-posters', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('registration-files', 'registration-files', false)
ON CONFLICT (id) DO NOTHING;

-- 12. 设置存储桶权限策略
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'event-posters');
CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'event-posters');
CREATE POLICY "Admin Update" ON storage.objects FOR UPDATE USING (bucket_id = 'event-posters');
CREATE POLICY "Admin Delete" ON storage.objects FOR DELETE USING (bucket_id = 'event-posters');

CREATE POLICY "Admin Access Registration Files" ON storage.objects FOR ALL USING (bucket_id = 'registration-files');