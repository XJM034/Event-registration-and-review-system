-- ===================================================
-- 修复通知表的RLS策略和权限
-- ===================================================

-- 1. 先检查现有的RLS策略
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'notifications';

-- 2. 确保RLS已启用
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 3. 删除可能有问题的旧策略
DROP POLICY IF EXISTS "Coaches can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Coaches can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Coaches can delete their own notifications" ON notifications;

-- 4. 创建新的RLS策略

-- 教练可以查看自己的通知
CREATE POLICY "Coaches can view own notifications"
ON notifications FOR SELECT
USING (
    coach_id IN (
        SELECT id FROM coaches
        WHERE auth_id = auth.uid()
    )
);

-- 教练可以更新自己的通知（主要是标记已读）
CREATE POLICY "Coaches can update own notifications"
ON notifications FOR UPDATE
USING (
    coach_id IN (
        SELECT id FROM coaches
        WHERE auth_id = auth.uid()
    )
)
WITH CHECK (
    coach_id IN (
        SELECT id FROM coaches
        WHERE auth_id = auth.uid()
    )
);

-- 教练可以删除自己的通知
CREATE POLICY "Coaches can delete own notifications"
ON notifications FOR DELETE
USING (
    coach_id IN (
        SELECT id FROM coaches
        WHERE auth_id = auth.uid()
    )
);

-- 系统（通过触发器）可以插入通知
CREATE POLICY "System can insert notifications"
ON notifications FOR INSERT
WITH CHECK (true);

-- 5. 为了调试，我们创建一个函数来批量标记已读
CREATE OR REPLACE FUNCTION mark_coach_notifications_read(p_coach_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- 更新该教练的所有未读通知
    UPDATE notifications
    SET is_read = true
    WHERE coach_id = p_coach_id
    AND is_read = false;

    -- 获取更新的行数
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN updated_count;
END;
$$;

-- 6. 授予函数执行权限
GRANT EXECUTE ON FUNCTION mark_coach_notifications_read TO authenticated;

-- 7. 验证设置
SELECT '=== RLS策略设置完成 ===' as message;

-- 8. 测试查询（手动执行检查）
-- 查看某个教练的未读通知数量
-- SELECT coach_id, COUNT(*) as unread_count
-- FROM notifications
-- WHERE is_read = false
-- GROUP BY coach_id;

-- 9. 创建一个简单的测试函数来验证更新
CREATE OR REPLACE FUNCTION test_mark_all_read(p_auth_id UUID)
RETURNS TABLE(
    coach_id UUID,
    updated_count INTEGER,
    remaining_unread INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_coach_id UUID;
    v_updated_count INTEGER;
    v_remaining_unread INTEGER;
BEGIN
    -- 获取教练ID
    SELECT id INTO v_coach_id
    FROM coaches
    WHERE auth_id = p_auth_id
    LIMIT 1;

    IF v_coach_id IS NULL THEN
        RAISE EXCEPTION 'No coach found for auth_id %', p_auth_id;
    END IF;

    -- 标记所有未读为已读
    UPDATE notifications
    SET is_read = true
    WHERE coach_id = v_coach_id
    AND is_read = false;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- 检查是否还有未读
    SELECT COUNT(*) INTO v_remaining_unread
    FROM notifications
    WHERE coach_id = v_coach_id
    AND is_read = false;

    RETURN QUERY SELECT v_coach_id, v_updated_count, v_remaining_unread;
END;
$$;

GRANT EXECUTE ON FUNCTION test_mark_all_read TO authenticated;

SELECT '=== 所有修复完成，请测试标记已读功能 ===' as message;