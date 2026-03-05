-- 检查 admin_users 表的列结构
-- 在 MemFire SQL Editor 中执行此查询来验证列是否存在

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM
    information_schema.columns
WHERE
    table_schema = 'public'
    AND table_name = 'admin_users'
ORDER BY
    ordinal_position;

-- 预期结果应该包含以下列：
-- id, phone, password_hash, created_at, updated_at, auth_id, name, is_super
