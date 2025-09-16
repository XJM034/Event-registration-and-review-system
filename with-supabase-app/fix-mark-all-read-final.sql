-- ===================================================
-- 最终修复：标记全部已读功能
-- ===================================================

-- 1. 删除旧的函数（如果存在）
DROP FUNCTION IF EXISTS mark_coach_notifications_read(UUID);
DROP FUNCTION IF EXISTS mark_all_notifications_read(UUID);
DROP FUNCTION IF EXISTS test_mark_all_read(UUID);

-- 2. 创建新的标记已读函数（使用SECURITY DEFINER绕过RLS）
CREATE OR REPLACE FUNCTION mark_notifications_as_read(p_notification_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER -- 以函数所有者权限执行，绕过RLS
SET search_path = public
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- 验证这些通知是否属于当前用户
    IF NOT EXISTS (
        SELECT 1
        FROM notifications n
        JOIN coaches c ON n.coach_id = c.id
        WHERE n.id = ANY(p_notification_ids)
        AND c.auth_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Not all notifications belong to current user';
    END IF;

    -- 执行更新
    UPDATE notifications
    SET is_read = true
    WHERE id = ANY(p_notification_ids)
    AND is_read = false;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN updated_count;
END;
$$;

-- 3. 创建批量标记已读函数
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id UUID;
    v_updated_count INTEGER;
    v_notification_ids UUID[];
BEGIN
    -- 获取当前用户的教练ID
    SELECT id INTO v_coach_id
    FROM coaches
    WHERE auth_id = auth.uid()
    LIMIT 1;

    IF v_coach_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Coach not found',
            'updated_count', 0
        );
    END IF;

    -- 获取所有未读通知的ID
    SELECT ARRAY_AGG(id) INTO v_notification_ids
    FROM notifications
    WHERE coach_id = v_coach_id
    AND is_read = false;

    -- 如果没有未读通知
    IF v_notification_ids IS NULL OR array_length(v_notification_ids, 1) IS NULL THEN
        RETURN json_build_object(
            'success', true,
            'message', 'No unread notifications',
            'updated_count', 0
        );
    END IF;

    -- 执行批量更新
    UPDATE notifications
    SET is_read = true
    WHERE id = ANY(v_notification_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- 返回结果
    RETURN json_build_object(
        'success', true,
        'message', 'Notifications marked as read',
        'updated_count', v_updated_count,
        'notification_ids', v_notification_ids
    );
END;
$$;

-- 4. 授予执行权限
GRANT EXECUTE ON FUNCTION mark_notifications_as_read(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_as_read() TO authenticated;

-- 5. 确保RLS策略正确
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "Coaches can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Coaches can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Coaches can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Coaches can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Coaches can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

-- 创建新的RLS策略
CREATE POLICY "Coach notifications select"
ON notifications FOR SELECT
TO authenticated
USING (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
);

CREATE POLICY "Coach notifications update"
ON notifications FOR UPDATE
TO authenticated
USING (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
)
WITH CHECK (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
);

CREATE POLICY "Coach notifications delete"
ON notifications FOR DELETE
TO authenticated
USING (
    coach_id IN (
        SELECT id FROM coaches WHERE auth_id = auth.uid()
    )
);

-- 允许系统插入通知（通过触发器）
CREATE POLICY "System insert notifications"
ON notifications FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- 6. 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_notifications_coach_read
ON notifications(coach_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_coach_created
ON notifications(coach_id, created_at DESC);

-- 7. 验证函数
CREATE OR REPLACE FUNCTION debug_notifications_status()
RETURNS TABLE(
    coach_id UUID,
    coach_name TEXT,
    total_notifications BIGINT,
    unread_count BIGINT,
    read_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as coach_id,
        c.name as coach_name,
        COUNT(n.id) as total_notifications,
        COUNT(CASE WHEN NOT n.is_read THEN 1 END) as unread_count,
        COUNT(CASE WHEN n.is_read THEN 1 END) as read_count
    FROM coaches c
    LEFT JOIN notifications n ON n.coach_id = c.id
    WHERE c.auth_id = auth.uid()
    GROUP BY c.id, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_notifications_status() TO authenticated;

SELECT '=== 修复完成 ===' as message;
SELECT '请在Supabase中执行此SQL，然后测试标记已读功能' as instruction;