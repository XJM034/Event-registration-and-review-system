-- 添加状态变更时间字段
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMP WITH TIME ZONE;

-- 为现有记录初始化这个字段（使用reviewed_at的值）
UPDATE registrations
SET last_status_change = reviewed_at
WHERE reviewed_at IS NOT NULL
  AND last_status_change IS NULL;

-- 验证字段已添加
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'registrations'
--   AND column_name = 'last_status_change';