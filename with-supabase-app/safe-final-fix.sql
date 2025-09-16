-- ===================================================
-- 安全修复：先查看当前状态，再修复
-- ===================================================

-- 1. 查看当前表结构
SELECT '=== 当前registrations表结构 ===' as info;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
AND (column_name LIKE '%status%' OR column_name LIKE '%type%')
ORDER BY ordinal_position;

-- 2. 查看当前数据状态
SELECT '=== 当前数据状态分布 ===' as info;
SELECT status, registration_type, COUNT(*) as count
FROM registrations
GROUP BY status, registration_type
ORDER BY status, registration_type;

-- 3. 查看当前约束
SELECT '=== 当前约束 ===' as info;
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'registrations'::regclass
AND contype = 'c';

-- 4. 删除视图（如果存在）
DROP VIEW IF EXISTS registration_details CASCADE;

-- 5. 删除所有状态相关的约束
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_status_check;
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_registration_type_check;

-- 6. 合并status和registration_type字段的值
-- 优先使用registration_type的值（如果是'draft'）
UPDATE registrations
SET status = CASE
    -- 如果registration_type是draft，使用draft
    WHEN registration_type = 'draft' THEN 'draft'
    -- 如果registration_type是submitted
    WHEN registration_type = 'submitted' THEN
        CASE
            WHEN status = 'pending' THEN 'submitted'
            WHEN status IN ('approved', 'rejected') THEN status
            ELSE 'submitted'
        END
    -- 如果registration_type是cancelled
    WHEN registration_type = 'cancelled' THEN 'cancelled'
    -- 如果registration_type为空，处理status
    WHEN registration_type IS NULL THEN
        CASE
            WHEN status = 'pending' THEN 'submitted'
            WHEN status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN status
            ELSE 'draft'
        END
    -- 默认情况
    ELSE COALESCE(status, 'draft')
END;

-- 7. 删除registration_type字段
ALTER TABLE registrations DROP COLUMN IF EXISTS registration_type CASCADE;

-- 8. 添加新的status约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

-- 9. 设置默认值
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 10. 重新创建视图
CREATE OR REPLACE VIEW registration_details AS
SELECT
    r.id,
    r.event_id,
    r.coach_id,
    r.team_data,
    r.players_data,
    r.status,
    r.share_token,
    r.rejection_reason,
    r.cancelled_at,
    r.cancelled_reason,
    r.submitted_at,
    r.reviewed_at,
    r.reviewer_id,
    r.created_at,
    r.updated_at,
    r.last_status_read_at,
    r.last_status_change,
    e.name as event_name,
    e.short_name as event_short_name,
    e.poster_url as event_poster_url,
    e.type as event_type,
    e.start_date as event_start_date,
    e.end_date as event_end_date,
    e.address as event_address,
    e.details as event_details,
    e.phone as event_phone,
    e.registration_start_date,
    e.registration_end_date,
    e.requirements as event_requirements,
    c.name as coach_name,
    c.email as coach_email,
    c.phone as coach_phone,
    c.school as coach_school
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- 11. 查看修复后的结果
SELECT '=== 修复后的状态分布 ===' as info;
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY status;

-- 12. 验证表结构
SELECT '=== 修复后的表结构 ===' as info;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
AND (column_name LIKE '%status%' OR column_name LIKE '%type%')
ORDER BY ordinal_position;

SELECT '=== 修复完成！===' as message;