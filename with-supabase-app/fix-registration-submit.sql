-- ===================================================
-- 修复报名提交权限问题
-- ===================================================

-- 1. 检查registrations表的RLS状态
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'registrations';

-- 2. 确保RLS已启用
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 3. 删除可能有冲突的旧策略
DROP POLICY IF EXISTS "Coaches can create their own registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can view their own registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can update their own registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can delete their own registrations" ON registrations;

-- 4. 创建新的RLS策略

-- 教练可以查看自己的报名
CREATE POLICY "Coach can view own registrations"
ON registrations FOR SELECT
TO authenticated
USING (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
);

-- 教练可以创建新报名
CREATE POLICY "Coach can create registrations"
ON registrations FOR INSERT
TO authenticated
WITH CHECK (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
);

-- 教练可以更新自己的报名（仅限草稿、待审核和被驳回的）
CREATE POLICY "Coach can update own registrations"
ON registrations FOR UPDATE
TO authenticated
USING (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
    AND status IN ('draft', 'rejected', 'pending', 'submitted')
)
WITH CHECK (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
);

-- 教练可以删除自己的草稿报名
CREATE POLICY "Coach can delete draft registrations"
ON registrations FOR DELETE
TO authenticated
USING (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
    AND status = 'draft'
);

-- 5. 检查coaches表是否有正确的数据
SELECT
    id,
    auth_id,
    name,
    phone,
    created_at
FROM coaches
LIMIT 5;

-- 6. 为registrations表添加必要的索引
CREATE INDEX IF NOT EXISTS idx_registrations_coach_id ON registrations(coach_id);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

-- 7. 确保所有必要的字段都存在
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'registrations'
ORDER BY ordinal_position;

-- 8. 创建一个测试函数来验证插入权限
CREATE OR REPLACE FUNCTION test_registration_insert(
    p_event_id UUID,
    p_team_data JSONB,
    p_players_data JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_coach_id UUID;
    v_registration_id UUID;
BEGIN
    -- 获取当前用户的教练ID
    SELECT id INTO v_coach_id
    FROM coaches
    WHERE auth_id = auth.uid()
    LIMIT 1;

    IF v_coach_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Coach not found for current user'
        );
    END IF;

    -- 尝试插入报名
    INSERT INTO registrations (
        event_id,
        coach_id,
        team_data,
        players_data,
        status,
        submitted_at
    )
    VALUES (
        p_event_id,
        v_coach_id,
        p_team_data,
        p_players_data,
        'submitted',
        NOW()
    )
    RETURNING id INTO v_registration_id;

    RETURN json_build_object(
        'success', true,
        'registration_id', v_registration_id,
        'coach_id', v_coach_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$;

GRANT EXECUTE ON FUNCTION test_registration_insert TO authenticated;

SELECT '=== 修复完成 ===' as message;
SELECT '如果报名提交仍然失败，请检查浏览器控制台的详细错误信息' as instruction;