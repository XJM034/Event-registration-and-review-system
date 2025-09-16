-- 安全地修复registrations表的status字段，支持所有状态

-- 1. 首先查看现有的status值分布
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status;

-- 2. 更新所有非标准状态值
-- 将'pending'改为'submitted'
UPDATE registrations
SET status = 'submitted'
WHERE status = 'pending';

-- 将任何其他非标准值改为'draft'（安全起见）
UPDATE registrations
SET status = 'draft'
WHERE status NOT IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'pending');

-- 3. 现在删除现有的CHECK约束
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_status_check;

-- 4. 添加支持所有状态的新约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

-- 5. 确保默认值是'draft'而不是'pending'
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 6. 添加草稿创建时间字段（如果还没有）
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 7. 显示更新后的状态分布
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status;

-- 验证更改
SELECT 'Status field updated successfully. Now supports: draft, submitted, approved, rejected, cancelled' as message;