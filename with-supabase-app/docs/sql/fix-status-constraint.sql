-- ===================================================
-- 修复 registrations 表的状态约束
-- ===================================================

-- 1. 先查看当前的约束定义
SELECT
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'registrations'::regclass
AND conname LIKE '%status%';

-- 2. 删除旧的状态约束
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

-- 3. 添加新的状态约束，包含所有需要的状态
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'pending', 'approved', 'rejected', 'cancelled'));

-- 4. 查看当前所有的状态值
SELECT DISTINCT status, COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY status;

-- 5. 统一状态值：将 'submitted' 改为 'pending'
UPDATE registrations
SET status = 'pending'
WHERE status = 'submitted';

-- 6. 验证更新后的状态分布
SELECT
    status,
    COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY count DESC;

-- 7. 查看最近的报名记录
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
WHERE r.status = 'pending'
ORDER BY r.submitted_at DESC
LIMIT 5;

SELECT '=== 约束修复完成 ===' as message;
SELECT '现在支持的状态值: draft, submitted, pending, approved, rejected, cancelled' as info;