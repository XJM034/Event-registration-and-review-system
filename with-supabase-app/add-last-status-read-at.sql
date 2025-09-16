-- 添加最后状态读取时间字段
ALTER TABLE registrations 
ADD COLUMN last_status_read_at TIMESTAMP WITH TIME ZONE;

-- 给现有的已审核记录初始化last_status_read_at为审核时间，表示已读
UPDATE registrations 
SET last_status_read_at = reviewed_at 
WHERE reviewed_at IS NOT NULL 
  AND (status = 'approved' OR status = 'rejected')
  AND last_status_read_at IS NULL;