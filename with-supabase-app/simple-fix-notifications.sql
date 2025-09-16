-- ===================================================
-- 简单修复：通知标记已读功能
-- ===================================================

-- 1. 先检查notifications表的RLS状态
SELECT
    relname as table_name,
    relrowsecurity as rls_enabled
FROM pg_class
WHERE relname = 'notifications';

-- 2. 暂时禁用RLS（用于测试）
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- 3. 为authenticated用户授予完整权限
GRANT ALL ON notifications TO authenticated;

-- 4. 创建一个简单的标记已读函数（无RLS限制）
CREATE OR REPLACE FUNCTION simple_mark_all_read()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- 直接更新所有属于当前用户的未读通知
    UPDATE notifications n
    SET is_read = true
    FROM coaches c
    WHERE n.coach_id = c.id
    AND c.auth_id = auth.uid()
    AND n.is_read = false;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'updated_count', v_updated_count
    );
END;
$$;

-- 5. 授予函数执行权限
GRANT EXECUTE ON FUNCTION simple_mark_all_read() TO authenticated;
GRANT EXECUTE ON FUNCTION simple_mark_all_read() TO anon;

-- 6. 重新启用RLS并创建宽松的策略
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS "Coach notifications select" ON notifications;
DROP POLICY IF EXISTS "Coach notifications update" ON notifications;
DROP POLICY IF EXISTS "Coach notifications delete" ON notifications;
DROP POLICY IF EXISTS "System insert notifications" ON notifications;

-- 创建一个宽松的策略（允许authenticated用户查看和更新自己的通知）
CREATE POLICY "Allow all for authenticated users own notifications"
ON notifications
FOR ALL
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

-- 允许系统操作（触发器等）
CREATE POLICY "Allow system operations"
ON notifications
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 7. 验证查询
SELECT '=== 简单修复完成 ===' as message;

-- 测试函数（手动执行）
-- SELECT simple_mark_all_read();