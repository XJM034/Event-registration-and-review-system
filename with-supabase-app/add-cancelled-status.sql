-- 添加取消时间字段
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 添加已取消状态到status枚举（如果使用枚举类型）
-- 注意：如果status是TEXT类型，则不需要这一步
-- 如果是枚举类型，可能需要重建约束：
-- ALTER TABLE registrations
-- DROP CONSTRAINT IF EXISTS registrations_status_check;
--
-- ALTER TABLE registrations
-- ADD CONSTRAINT registrations_status_check
-- CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));