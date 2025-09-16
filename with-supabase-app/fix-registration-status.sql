-- 修复registrations表的status字段，支持所有状态

-- 首先删除现有的CHECK约束
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

-- 添加支持所有状态的新约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

-- 更新现有的'pending'状态为'submitted'（如果有的话）
UPDATE registrations
SET status = 'submitted'
WHERE status = 'pending';

-- 确保默认值是'draft'而不是'pending'
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 添加草稿创建时间字段（如果还没有）
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 验证更改
SELECT 'Status field updated successfully. Now supports: draft, submitted, approved, rejected, cancelled' as message;