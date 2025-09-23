-- 为 coaches 表添加 organization 字段（或使用已有的 school 字段）
-- 方案1：如果你想使用 organization 作为字段名
ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS organization VARCHAR(255);

-- 添加字段注释
COMMENT ON COLUMN coaches.organization IS '教练所属单位/学校';

-- 方案2：如果已有 school 字段，可以重命名它为 organization（可选）
-- ALTER TABLE coaches RENAME COLUMN school TO organization;

-- 方案3：如果要同时保留两个字段，可以将 school 的值复制到 organization
-- UPDATE coaches SET organization = school WHERE organization IS NULL AND school IS NOT NULL;