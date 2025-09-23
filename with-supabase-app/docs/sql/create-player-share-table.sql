-- 创建队员分享填写表
CREATE TABLE IF NOT EXISTS player_share_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    player_index INTEGER, -- 对应队员在数组中的索引，null表示新增队员
    player_data JSONB, -- 队员填写的数据
    is_filled BOOLEAN DEFAULT false, -- 是否已填写
    filled_at TIMESTAMP WITH TIME ZONE, -- 填写时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days') -- 7天后过期
);

-- 创建索引
CREATE INDEX idx_player_share_tokens_token ON player_share_tokens(token);
CREATE INDEX idx_player_share_tokens_registration_id ON player_share_tokens(registration_id);
CREATE INDEX idx_player_share_tokens_expires_at ON player_share_tokens(expires_at);

-- 创建RLS策略
ALTER TABLE player_share_tokens ENABLE ROW LEVEL SECURITY;

-- 允许任何人通过token读取（用于队员填写）
CREATE POLICY "Anyone can read share token by token" ON player_share_tokens
    FOR SELECT USING (true);

-- 允许任何人更新已存在的token记录（用于队员提交信息）
CREATE POLICY "Anyone can update share token" ON player_share_tokens
    FOR UPDATE USING (true);

-- 允许认证用户创建分享token
CREATE POLICY "Authenticated users can create share tokens" ON player_share_tokens
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 允许认证用户删除自己创建的分享token
CREATE POLICY "Users can delete their own share tokens" ON player_share_tokens
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM registrations r
            JOIN coaches c ON r.coach_id = c.id
            WHERE r.id = player_share_tokens.registration_id
            AND c.auth_id = auth.uid()
        )
    );

-- 创建清理过期token的函数
CREATE OR REPLACE FUNCTION clean_expired_share_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM player_share_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 可以定期调用这个函数来清理过期的token
-- 或者使用pg_cron扩展来定时执行