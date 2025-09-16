-- 全面修复registrations表的所有状态相关字段

-- 1. 首先查看表结构，了解所有字段
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
ORDER BY ordinal_position;

-- 2. 查看现有数据的status和registration_type字段值
SELECT status, registration_type, COUNT(*) as count
FROM registrations
GROUP BY status, registration_type;

-- 3. 删除registration_type字段的约束（如果存在）
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_registration_type_check;

-- 4. 删除status字段的约束
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

-- 5. 统一使用status字段，删除registration_type字段（如果存在）
-- 首先将registration_type的值合并到status字段
UPDATE registrations
SET status = CASE
    WHEN registration_type = 'draft' THEN 'draft'
    WHEN registration_type = 'submitted' THEN 'submitted'
    WHEN registration_type = 'cancelled' THEN 'cancelled'
    WHEN status IS NOT NULL THEN status
    ELSE 'draft'
END
WHERE registration_type IS NOT NULL;

-- 6. 确保所有status值都是合法的
UPDATE registrations
SET status = CASE
    WHEN status = 'pending' THEN 'submitted'
    WHEN status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN status
    ELSE 'draft'
END;

-- 7. 删除registration_type字段（如果存在）
ALTER TABLE registrations
DROP COLUMN IF EXISTS registration_type;

-- 8. 添加新的status约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

-- 9. 设置默认值
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 10. 添加必要的时间字段（如果不存在）
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 11. 查看修复后的数据分布
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status;

-- 12. 验证表结构
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
AND column_name IN ('status', 'registration_type', 'created_at', 'cancelled_at')
ORDER BY ordinal_position;

SELECT 'All status fields fixed successfully!' as message;