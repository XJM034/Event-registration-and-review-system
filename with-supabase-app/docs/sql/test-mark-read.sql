-- ===================================================
-- 测试标记已读功能
-- ===================================================

-- 1. 首先查看所有通知的状态
SELECT
    n.id,
    n.coach_id,
    c.name as coach_name,
    n.title,
    n.is_read,
    n.created_at
FROM notifications n
LEFT JOIN coaches c ON n.coach_id = c.id
ORDER BY n.created_at DESC;

-- 2. 查看未读通知数量
SELECT
    coach_id,
    COUNT(*) as unread_count
FROM notifications
WHERE is_read = false
GROUP BY coach_id;

-- 3. 手动测试更新（请替换coach_id为实际的教练ID）
-- UPDATE notifications
-- SET is_read = true
-- WHERE coach_id = 'YOUR_COACH_ID_HERE'
-- AND is_read = false;

-- 4. 检查RLS策略
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'notifications';

-- 5. 检查当前用户权限
SELECT current_user, session_user;

-- 6. 验证表的更新权限
SELECT has_table_privilege('notifications', 'UPDATE');