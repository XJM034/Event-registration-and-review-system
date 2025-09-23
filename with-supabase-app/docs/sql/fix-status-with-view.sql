-- 修复registrations表的状态字段，处理视图依赖

-- 1. 首先删除依赖的视图
DROP VIEW IF EXISTS registration_details CASCADE;

-- 2. 查看现有数据的status和registration_type字段值
SELECT status, registration_type, COUNT(*) as count
FROM registrations
GROUP BY status, registration_type;

-- 3. 删除所有相关约束
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_registration_type_check;

ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

-- 4. 统一使用status字段
-- 如果registration_type是draft，确保status也是draft
UPDATE registrations
SET status = CASE
    WHEN registration_type = 'draft' AND status != 'draft' THEN 'draft'
    WHEN registration_type = 'submitted' AND status = 'pending' THEN 'submitted'
    WHEN registration_type = 'cancelled' THEN 'cancelled'
    WHEN status = 'pending' THEN 'submitted'
    WHEN status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN status
    ELSE COALESCE(registration_type, 'draft')
END;

-- 5. 删除registration_type字段
ALTER TABLE registrations
DROP COLUMN IF EXISTS registration_type CASCADE;

-- 6. 添加新的status约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

-- 7. 设置默认值
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 8. 添加必要的时间字段（如果不存在）
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 9. 重新创建视图（不包含registration_type字段）
CREATE OR REPLACE VIEW registration_details AS
SELECT
    r.id,
    r.event_id,
    r.coach_id,
    r.team_data,
    r.players_data,
    r.status,
    r.rejection_reason,
    r.submitted_at,
    r.reviewed_at,
    r.reviewer_id,
    r.share_token,
    r.cancelled_at,
    r.cancelled_reason,
    r.created_at,
    r.last_status_change_at,
    r.last_status_read_at,
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
    c.name as coach_name,
    c.email as coach_email,
    c.phone as coach_phone,
    c.organization as coach_organization
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- 10. 查看修复后的数据分布
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY status;

-- 11. 验证表结构
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
AND column_name IN ('status', 'created_at', 'cancelled_at')
ORDER BY ordinal_position;

SELECT 'Status field fixed and view recreated successfully!' as message;