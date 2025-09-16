-- ===================================================
-- 简单修复：只修复视图问题
-- ===================================================

-- 1. 查看当前状态分布
SELECT '=== 当前数据状态分布 ===' as info;
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY status;

-- 2. 删除旧视图
DROP VIEW IF EXISTS registration_details CASCADE;

-- 3. 重新创建视图（使用正确的字段名）
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
    c.school as coach_school  -- 使用school字段
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- 4. 验证视图创建成功
SELECT '=== 视图字段列表 ===' as info;
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'registration_details'
AND column_name LIKE 'coach_%'
ORDER BY ordinal_position;

SELECT '=== 视图修复完成！===' as message;