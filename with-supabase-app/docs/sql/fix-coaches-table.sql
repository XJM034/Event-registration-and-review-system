-- 修复coaches表结构

-- 先检查并删除现有的coaches表（如果存在）
DROP TABLE IF EXISTS coaches CASCADE;

-- 重新创建coaches表，使用auth_id字段名
CREATE TABLE coaches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(20),
    organization VARCHAR(100), -- 改为organization而不是school
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_coaches_auth_id ON coaches(auth_id);

-- 启用RLS
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
-- 教练只能看到和修改自己的信息
CREATE POLICY "Coaches can view own profile" ON coaches
    FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "Coaches can update own profile" ON coaches
    FOR UPDATE USING (auth.uid() = auth_id);

CREATE POLICY "Coaches can insert own profile" ON coaches
    FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- 验证
SELECT 'Coaches table structure fixed!' as status;