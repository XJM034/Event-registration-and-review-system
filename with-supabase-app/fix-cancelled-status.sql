-- 修复status字段约束，允许'cancelled'状态

-- 首先删除现有的CHECK约束（如果存在）
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

-- 重新添加包含'cancelled'的CHECK约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- 添加取消时间字段（如果还没有添加）
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 验证更改
-- 可以运行以下查询来确认约束已更新：
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'registrations'::regclass
-- AND contype = 'c';