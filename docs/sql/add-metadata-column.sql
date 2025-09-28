-- 添加 metadata 字段到 notifications 表（如果不存在）
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 验证表结构
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;