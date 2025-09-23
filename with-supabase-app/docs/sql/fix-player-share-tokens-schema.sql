-- ===================================================
-- 修复 player_share_tokens 表结构
-- ===================================================

-- 1. 检查表是否存在
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'player_share_tokens'
);

-- 2. 检查现有的列结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'player_share_tokens'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. 如果表不存在，创建表
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

-- 4. 如果表存在但缺少列，添加缺少的列
DO $$
BEGIN
    -- 添加 player_id 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'player_share_tokens'
        AND column_name = 'player_id'
    ) THEN
        ALTER TABLE player_share_tokens ADD COLUMN player_id VARCHAR(255);
    END IF;

    -- 添加 player_index 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'player_share_tokens'
        AND column_name = 'player_index'
    ) THEN
        ALTER TABLE player_share_tokens ADD COLUMN player_index INTEGER;
    END IF;

    -- 添加 is_active 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'player_share_tokens'
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE player_share_tokens ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;

    -- 添加 used_at 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'player_share_tokens'
        AND column_name = 'used_at'
    ) THEN
        ALTER TABLE player_share_tokens ADD COLUMN used_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- 添加 expires_at 列（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'player_share_tokens'
        AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE player_share_tokens ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days');
    END IF;
END $$;

-- 5. 添加索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_token ON player_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_registration ON player_share_tokens(registration_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_event ON player_share_tokens(event_id);
CREATE INDEX IF NOT EXISTS idx_player_share_tokens_player ON player_share_tokens(player_id);

-- 6. 设置 RLS 策略
ALTER TABLE player_share_tokens ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Coaches can manage own registration share tokens" ON player_share_tokens;
DROP POLICY IF EXISTS "Allow anonymous access by token" ON player_share_tokens;

-- 创建新策略：教练可以查看和管理自己报名的分享链接
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

-- 7. 验证最终的表结构
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'player_share_tokens'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 8. 创建获取分享链接信息的函数
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
GRANT EXECUTE ON FUNCTION get_share_token_info(VARCHAR) TO anon, authenticated;

SELECT '=== 表结构修复完成 ===' as message;
SELECT '现在应该可以正常生成队员专属分享链接了' as info;