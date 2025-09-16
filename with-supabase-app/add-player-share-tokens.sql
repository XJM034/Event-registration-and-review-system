-- ===================================================
-- 添加队员专属分享链接功能
-- ===================================================

-- 1. 检查是否已存在 player_share_tokens 表
SELECT to_regclass('public.player_share_tokens');

-- 2. 如果不存在则创建表
CREATE TABLE IF NOT EXISTS player_share_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    player_id VARCHAR(255), -- 队员的唯一ID（前端生成）
    player_index INTEGER, -- 队员的位置索引（0,1,2...）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- 3. 添加索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_token ON player_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_registration ON player_share_tokens(registration_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_event ON player_share_tokens(event_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_player ON player_share_tokens(player_id);

-- 4. 添加 RLS 策略
ALTER TABLE player_share_tokens ENABLE ROW LEVEL SECURITY;

-- 创建策略：教练可以查看和管理自己报名的分享链接
CREATE POLICY "Coaches can manage own registration share tokens"
ON player_share_tokens
FOR ALL
TO authenticated
USING (
    registration_id IN (
        SELECT id FROM registrations
        WHERE coach_id IN (
            SELECT id FROM coaches WHERE auth_id = auth.uid()
        )
    )
)
WITH CHECK (
    registration_id IN (
        SELECT id FROM registrations
        WHERE coach_id IN (
            SELECT id FROM coaches WHERE auth_id = auth.uid()
        )
    )
);

-- 允许匿名用户通过token访问分享链接
CREATE POLICY "Allow anonymous access by token"
ON player_share_tokens
FOR SELECT
TO anon
USING (
    is_active = true
    AND expires_at > NOW()
);

-- 5. 添加清理过期token的函数
CREATE OR REPLACE FUNCTION cleanup_expired_share_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM player_share_tokens
    WHERE expires_at < NOW() AND used_at IS NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 6. 添加获取分享链接信息的函数
CREATE OR REPLACE FUNCTION get_share_token_info(p_token VARCHAR)
RETURNS TABLE(
    token_id UUID,
    registration_id UUID,
    event_id UUID,
    player_id VARCHAR,
    player_index INTEGER,
    event_name TEXT,
    team_name TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pst.id as token_id,
        pst.registration_id,
        pst.event_id,
        pst.player_id,
        pst.player_index,
        e.name as event_name,
        COALESCE(r.team_data->>'team_name', '未命名队伍') as team_name,
        pst.expires_at,
        (pst.is_active AND pst.expires_at > NOW()) as is_valid
    FROM player_share_tokens pst
    LEFT JOIN events e ON pst.event_id = e.id
    LEFT JOIN registrations r ON pst.registration_id = r.id
    WHERE pst.token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION cleanup_expired_share_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION get_share_token_info(VARCHAR) TO anon, authenticated;

-- 7. 验证表创建
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'player_share_tokens'
ORDER BY ordinal_position;

SELECT '=== 队员专属分享链接功能创建完成 ===' as message;
SELECT '现在每个队员都可以有专属的填写链接了' as info;