-- ===================================================
-- 修复标记全部已读功能
-- ===================================================

-- 1. 创建一个函数来批量标记已读
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_coach_id UUID)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- 更新所有未读通知
    UPDATE notifications
    SET is_read = true
    WHERE coach_id = p_coach_id
    AND is_read = false;

    -- 获取更新的行数
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- 返回更新的行数
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 2. 验证函数创建成功
SELECT 'Function mark_all_notifications_read created successfully' as message;

-- 3. 创建一个视图来简化未读计数查询
CREATE OR REPLACE VIEW coach_unread_notifications AS
SELECT
    coach_id,
    COUNT(*) as unread_count
FROM notifications
WHERE is_read = false
GROUP BY coach_id;

-- 4. 添加索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_notifications_coach_read
ON notifications(coach_id, is_read)
WHERE is_read = false;

SELECT '=== 修复完成 ===' as message;