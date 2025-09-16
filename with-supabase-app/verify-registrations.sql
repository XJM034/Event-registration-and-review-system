-- ===================================================
-- 验证报名数据和状态
-- ===================================================

-- 1. 查看所有报名记录及其状态
SELECT
    r.id,
    r.event_id,
    r.coach_id,
    r.status,
    r.submitted_at,
    r.reviewed_at,
    e.name as event_name,
    c.name as coach_name
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id
ORDER BY r.submitted_at DESC
LIMIT 10;

-- 2. 统计各状态的报名数量
SELECT
    status,
    COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY count DESC;

-- 3. 查看最新提交的报名（pending状态）
SELECT
    r.id,
    r.status,
    r.submitted_at,
    r.team_data->>'team_name' as team_name,
    c.name as coach_name,
    e.name as event_name
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id
WHERE r.status IN ('pending', 'submitted')
ORDER BY r.submitted_at DESC
LIMIT 10;

-- 4. 修复可能的状态问题
-- 如果有报名的status是NULL，设置为pending
UPDATE registrations
SET status = 'pending'
WHERE status IS NULL
AND submitted_at IS NOT NULL;

-- 5. 确保submitted状态被正确处理
-- 将所有submitted状态统一改为pending（因为submitted和pending表示同一个意思）
UPDATE registrations
SET status = 'pending'
WHERE status = 'submitted';

-- 6. 验证更新后的状态
SELECT
    status,
    COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY count DESC;

SELECT '=== 验证完成 ===' as message;
SELECT '请刷新管理端页面查看审核列表' as instruction;