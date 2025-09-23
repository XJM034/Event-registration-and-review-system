-- ===================================================
-- 检查通知数据问题
-- ===================================================

-- 1. 查看所有通知的当前状态
SELECT
    n.id,
    n.coach_id,
    c.name as coach_name,
    n.type,
    n.title,
    n.message,
    n.is_read,
    n.event_id,
    n.registration_id,
    n.created_at
FROM notifications n
LEFT JOIN coaches c ON n.coach_id = c.id
ORDER BY n.created_at DESC
LIMIT 20;

-- 2. 统计各教练的通知数量
SELECT
    c.name as coach_name,
    n.coach_id,
    COUNT(*) as total_notifications,
    COUNT(CASE WHEN n.is_read = false THEN 1 END) as unread_count,
    COUNT(CASE WHEN n.is_read = true THEN 1 END) as read_count
FROM notifications n
LEFT JOIN coaches c ON n.coach_id = c.id
GROUP BY n.coach_id, c.name
ORDER BY total_notifications DESC;

-- 3. 检查是否有通知被意外删除或更新
SELECT
    'Total notifications' as description,
    COUNT(*) as count
FROM notifications
UNION ALL
SELECT
    'Unread notifications' as description,
    COUNT(*) as count
FROM notifications
WHERE is_read = false
UNION ALL
SELECT
    'Read notifications' as description,
    COUNT(*) as count
FROM notifications
WHERE is_read = true;

-- 4. 查看最近的删除或更新操作（如果有审计日志）
-- 注意：这需要你的数据库有审计功能或触发器记录

-- 5. 检查是否有级联删除的外键关系
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'notifications';

-- 6. 检查RLS策略是否正确
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'notifications';

SELECT '=== 检查完成 ===' as message;
SELECT '如果通知消失，可能是：1.被删除 2.RLS策略过滤 3.数据查询条件变化' as possible_reasons;