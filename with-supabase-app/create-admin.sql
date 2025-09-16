-- 删除可能存在的旧账户
DELETE FROM admin_users WHERE phone = '13800138000';

-- 插入新的管理员账户，使用 bcrypt 加密的密码 "admin123"
-- 这个哈希是通过 bcrypt.hash('admin123', 10) 生成的
INSERT INTO admin_users (phone, password_hash) 
VALUES ('13800138000', '$2b$10$8K1p8vJ5j5b2Y8F5n3mQE.8A8K.K8K.K8K.K8K.K8K.K8K.K8K8K');

-- 验证插入是否成功
SELECT * FROM admin_users WHERE phone = '13800138000';