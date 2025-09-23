-- 完整的数据库结构 - 包含管理端和报名端
-- 请在 Supabase SQL Editor 中执行此文件

-- ==========================================
-- 1. 清理现有结构（如果存在）
-- ==========================================

-- 禁用 RLS 以便删除
ALTER TABLE IF EXISTS admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS registration_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coaches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS player_submissions DISABLE ROW LEVEL SECURITY;

-- 删除现有表（按依赖顺序）
DROP TABLE IF EXISTS player_submissions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS registrations CASCADE;
DROP TABLE IF EXISTS registration_settings CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS coaches CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- ==========================================
-- 2. 创建管理端表结构
-- ==========================================

-- 管理员用户表
CREATE TABLE admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 赛事表
CREATE TABLE events (
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
    registration_start_date TIMESTAMP WITH TIME ZONE,
    registration_end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 报名设置表
CREATE TABLE registration_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_requirements JSONB,
    player_requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id)
);

-- ==========================================
-- 3. 创建报名端表结构
-- ==========================================

-- 教练用户表
CREATE TABLE coaches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id UUID UNIQUE, -- 关联 Supabase Auth
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(20),
    school VARCHAR(100),
    role VARCHAR(20) DEFAULT 'coach',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 报名表（支持管理端和报名端）
CREATE TABLE registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES coaches(id),
    team_data JSONB,
    players_data JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    registration_type VARCHAR(20) DEFAULT 'submitted' 
        CHECK (registration_type IN ('draft', 'submitted', 'cancelled')),
    share_token VARCHAR(100) UNIQUE,
    rejection_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_reason TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_id UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 通知表
CREATE TABLE notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('approval', 'rejection', 'reminder')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 队员信息提交表（通过分享链接）
CREATE TABLE player_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    share_token VARCHAR(100) NOT NULL,
    player_data JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 4. 创建索引以提高性能
-- ==========================================

CREATE INDEX idx_events_visible ON events(is_visible);
CREATE INDEX idx_events_dates ON events(start_date, end_date);
CREATE INDEX idx_registrations_coach_id ON registrations(coach_id);
CREATE INDEX idx_registrations_event_id ON registrations(event_id);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_type ON registrations(registration_type);
CREATE INDEX idx_registrations_share_token ON registrations(share_token);
CREATE INDEX idx_notifications_coach_id ON notifications(coach_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_player_submissions_share_token ON player_submissions(share_token);

-- ==========================================
-- 5. 创建函数
-- ==========================================

-- 生成分享令牌函数
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS VARCHAR(100) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- 自动设置分享令牌
CREATE OR REPLACE FUNCTION set_share_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.share_token IS NULL THEN
        NEW.share_token := generate_share_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 自动更新时间戳
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 6. 创建触发器
-- ==========================================

-- 自动生成分享令牌
CREATE TRIGGER registration_share_token_trigger
BEFORE INSERT ON registrations
FOR EACH ROW
EXECUTE FUNCTION set_share_token();

-- 自动更新时间戳触发器
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_registration_settings_updated_at BEFORE UPDATE ON registration_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON registrations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_coaches_updated_at BEFORE UPDATE ON coaches
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================
-- 7. 创建视图
-- ==========================================

-- 报名详情视图
CREATE OR REPLACE VIEW registration_details AS
SELECT 
    r.*,
    e.name as event_name,
    e.short_name as event_short_name,
    e.poster_url as event_poster_url,
    e.type as event_type,
    e.start_date as event_start_date,
    e.end_date as event_end_date,
    e.address as event_address,
    e.details as event_details,
    e.phone as event_phone,
    e.registration_start_date,
    e.registration_end_date,
    c.name as coach_name,
    c.email as coach_email,
    c.phone as coach_phone,
    c.school as coach_school
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- ==========================================
-- 8. 设置 Row Level Security (RLS)
-- ==========================================

-- 启用 RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_submissions ENABLE ROW LEVEL SECURITY;

-- 管理员表策略
CREATE POLICY "Admin users full access" ON admin_users
    FOR ALL USING (true) WITH CHECK (true);

-- 赛事表策略
CREATE POLICY "Events public read" ON events
    FOR SELECT USING (is_visible = true);

CREATE POLICY "Events admin full access" ON events
    FOR ALL USING (true) WITH CHECK (true);

-- 报名设置表策略
CREATE POLICY "Registration settings public read" ON registration_settings
    FOR SELECT USING (true);

CREATE POLICY "Registration settings admin write" ON registration_settings
    FOR ALL USING (true) WITH CHECK (true);

-- 教练表策略
CREATE POLICY "Coaches can view own profile" ON coaches
    FOR SELECT USING (auth_id = auth.uid() OR auth_id IS NULL);

CREATE POLICY "Coaches can update own profile" ON coaches
    FOR UPDATE USING (auth_id = auth.uid());

CREATE POLICY "Coaches can insert profile" ON coaches
    FOR INSERT WITH CHECK (true);

-- 报名表策略
CREATE POLICY "Registrations coach access" ON registrations
    FOR ALL USING (
        coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
        OR 
        EXISTS (SELECT 1 FROM admin_users)
    );

-- 通知表策略
CREATE POLICY "Notifications coach read" ON notifications
    FOR SELECT USING (
        coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
    );

CREATE POLICY "Notifications admin write" ON notifications
    FOR INSERT WITH CHECK (true);

-- 队员提交表策略
CREATE POLICY "Player submissions public insert" ON player_submissions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Player submissions coach read" ON player_submissions
    FOR SELECT USING (
        registration_id IN (
            SELECT id FROM registrations 
            WHERE coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
        )
    );

-- ==========================================
-- 9. 插入初始数据
-- ==========================================

-- 插入默认管理员账户（密码: admin123）
INSERT INTO admin_users (phone, password_hash) 
VALUES ('13800138000', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPjiCtnqm')
ON CONFLICT (phone) DO NOTHING;

-- ==========================================
-- 10. 完成提示
-- ==========================================

SELECT 'Database setup complete!' as status,
       'Admin login: 13800138000 / admin123' as admin_credentials,
       'Coaches need to register via the registration page' as coach_info;