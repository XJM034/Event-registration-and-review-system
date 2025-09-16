-- ===================================================
-- 完全移除 registration_type 字段，统一使用 status
-- ===================================================

-- 1. 首先检查 registrations 表的当前结构
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'registrations'
AND column_name IN ('status', 'registration_type');

-- 2. 如果 registration_type 字段还存在，需要迁移数据
DO $$
BEGIN
    -- 检查 registration_type 字段是否存在
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'registrations'
        AND column_name = 'registration_type'
    ) THEN
        -- 更新 status 字段，基于 registration_type
        UPDATE registrations
        SET status = CASE
            WHEN registration_type = 'draft' THEN 'draft'
            WHEN registration_type = 'submitted' AND status IS NULL THEN 'submitted'
            WHEN registration_type = 'cancelled' THEN 'cancelled'
            ELSE COALESCE(status, 'pending')
        END
        WHERE registration_type IS NOT NULL;

        -- 删除依赖于 registration_type 的视图
        DROP VIEW IF EXISTS registration_details CASCADE;
        DROP VIEW IF EXISTS registration_with_status CASCADE;

        -- 删除 registration_type 字段
        ALTER TABLE registrations DROP COLUMN IF EXISTS registration_type;
    END IF;
END $$;

-- 3. 确保 status 字段有正确的约束
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'pending', 'approved', 'rejected', 'cancelled'));

-- 4. 设置默认值
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 5. 更新现有的空值
UPDATE registrations
SET status = 'draft'
WHERE status IS NULL;

-- 6. 重新创建必要的视图（如果需要）
CREATE OR REPLACE VIEW registration_summary AS
SELECT
    r.id,
    r.event_id,
    r.coach_id,
    r.status,
    r.submitted_at,
    r.reviewed_at,
    r.rejection_reason,
    e.name as event_name,
    c.name as coach_name,
    c.phone as coach_phone,
    c.school as coach_school
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

SELECT '=== 字段迁移完成 ===' as message;
SELECT '请更新前端代码，移除所有 registration_type 的引用，统一使用 status 字段' as instruction;