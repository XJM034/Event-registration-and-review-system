-- 创建初始管理员账号
-- 密码: admin123

-- 首先删除可能存在的测试账号
DELETE FROM admin_users WHERE phone = '13800138000';

-- 插入新的管理员账号
-- 密码 admin123 的 bcrypt hash
INSERT INTO admin_users (phone, password_hash, created_at, updated_at)
VALUES (
    '13800138000',
    '$2a$10$5E7KjF2X0l2qN6rH3PBqXOZ8Yk2F8n0m2Qw1L3kJ5N7M9vR4xT6uW',
    NOW(),
    NOW()
);

-- 验证插入成功
SELECT id, phone, created_at FROM admin_users WHERE phone = '13800138000';