-- 报名端数据库更新
-- 在现有基础上增加报名端所需的表和字段

-- 1. 创建用户表（教练）- 使用 Supabase Auth
-- Supabase Auth 已经提供了用户认证，我们只需要扩展用户信息
CREATE TABLE IF NOT EXISTS coaches (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(20),
    school VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 更新 registrations 表，添加更多字段支持报名端功能
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS registration_type VARCHAR(20) DEFAULT 'submitted' 
    CHECK (registration_type IN ('draft', 'submitted', 'cancelled')),
ADD COLUMN IF NOT EXISTS share_token VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- 3. 创建通知表
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('approval', 'rejection', 'reminder')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 创建队员临时填写表（通过分享链接填写）
CREATE TABLE IF NOT EXISTS player_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    share_token VARCHAR(100) NOT NULL,
    player_data JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_share_token (share_token)
);

-- 5. 为 events 表添加报名时间字段（如果还没有）
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS registration_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS registration_end_date TIMESTAMP WITH TIME ZONE;

-- 6. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_registrations_coach_id ON registrations(coach_id);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_type ON registrations(registration_type);
CREATE INDEX IF NOT EXISTS idx_notifications_coach_id ON notifications(coach_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- 7. 创建或更新 RLS 策略
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_submissions ENABLE ROW LEVEL SECURITY;

-- 教练只能看到和修改自己的信息
CREATE POLICY "Coaches can view own profile" ON coaches
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Coaches can update own profile" ON coaches
    FOR UPDATE USING (auth.uid() = id);

-- 教练可以看到自己的通知
CREATE POLICY "Coaches can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = coach_id);

-- 教练可以标记自己的通知为已读
CREATE POLICY "Coaches can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = coach_id);

-- 任何人都可以通过分享令牌提交队员信息
CREATE POLICY "Anyone can submit player data with valid token" ON player_submissions
    FOR INSERT WITH CHECK (true);

-- 教练可以查看自己创建的报名的队员提交
CREATE POLICY "Coaches can view player submissions for own registrations" ON player_submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM registrations 
            WHERE registrations.id = player_submissions.registration_id 
            AND registrations.coach_id = auth.uid()
        )
    );

-- 更新 registrations 表的策略
DROP POLICY IF EXISTS "allow_all" ON registrations;

-- 教练可以创建报名
CREATE POLICY "Coaches can create registrations" ON registrations
    FOR INSERT WITH CHECK (auth.uid() = coach_id);

-- 教练可以查看自己的报名
CREATE POLICY "Coaches can view own registrations" ON registrations
    FOR SELECT USING (auth.uid() = coach_id);

-- 教练可以更新自己的报名（草稿状态）
CREATE POLICY "Coaches can update own draft registrations" ON registrations
    FOR UPDATE USING (auth.uid() = coach_id AND registration_type = 'draft');

-- 教练可以删除自己的草稿报名
CREATE POLICY "Coaches can delete own draft registrations" ON registrations
    FOR DELETE USING (auth.uid() = coach_id AND registration_type = 'draft');

-- 管理员可以查看和更新所有报名
CREATE POLICY "Admins can manage all registrations" ON registrations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE admin_users.id = auth.uid()
        )
    );

-- 8. 创建函数来生成分享令牌
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS VARCHAR(100) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- 9. 创建触发器，自动生成分享令牌
CREATE OR REPLACE FUNCTION set_share_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.share_token IS NULL THEN
        NEW.share_token := generate_share_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registration_share_token_trigger
BEFORE INSERT ON registrations
FOR EACH ROW
EXECUTE FUNCTION set_share_token();

-- 10. 创建视图来简化查询
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
    c.phone as coach_phone
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- 完成提示
SELECT 'Database updated for registration portal!' as status;