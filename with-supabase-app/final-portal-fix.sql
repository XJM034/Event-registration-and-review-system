-- ===================================================
-- 最终修复：解决报名端筛选和视图问题
-- ===================================================

-- 1. 先删除旧视图（因为字段名称有问题）
DROP VIEW IF EXISTS registration_details CASCADE;

-- 2. 统一status字段（处理同时存在status和registration_type的问题）
-- 合并registration_type到status字段
UPDATE registrations
SET status = CASE
    WHEN registration_type = 'draft' THEN 'draft'
    WHEN registration_type = 'submitted' AND status = 'pending' THEN 'submitted'
    WHEN registration_type = 'submitted' AND status != 'pending' THEN status
    WHEN registration_type = 'cancelled' THEN 'cancelled'
    WHEN status = 'pending' THEN 'submitted'
    ELSE status
END
WHERE registration_type IS NOT NULL;

-- 3. 删除registration_type字段（不再需要）
ALTER TABLE registrations DROP COLUMN IF EXISTS registration_type CASCADE;

-- 4. 重新创建视图（使用正确的字段名：school而不是organization）
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
    c.school as coach_school  -- 使用school而不是organization
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- 5. 查看最终的数据分布
SELECT '=== 修复完成，当前状态分布 ===' as info;
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY status;

-- 6. 验证表结构
SELECT '=== registrations表结构（只显示状态相关字段）===' as info;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
AND column_name LIKE '%status%' OR column_name LIKE '%type%'
ORDER BY ordinal_position;

SELECT '=== 修复完成！草稿筛选功能现在应该可以正常工作了 ===' as message;