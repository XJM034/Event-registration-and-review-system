-- ===================================================
-- 完整修复报名端数据库结构 - 一次性解决所有问题
-- 请在Supabase SQL编辑器中执行这个文件
-- ===================================================

-- 第一步：删除可能存在的依赖视图
DROP VIEW IF EXISTS registration_details CASCADE;

-- 第二步：修复coaches表（如果需要）
-- 检查coaches表是否存在正确的结构
DO $$
BEGIN
    -- 如果coaches表不存在auth_id字段，添加它
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coaches' AND column_name = 'auth_id'
    ) THEN
        -- 如果表使用id引用auth.users，需要重建
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'coaches' AND column_name = 'id'
        ) THEN
            -- 备份现有数据
            CREATE TEMP TABLE coaches_backup AS SELECT * FROM coaches;

            -- 删除旧表
            DROP TABLE IF EXISTS coaches CASCADE;

            -- 创建新表结构
            CREATE TABLE coaches (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(100),
                phone VARCHAR(20),
                organization VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- 恢复数据（如果有的话）
            -- 注意：这里假设原来的id字段实际上存储的是auth.users的id
            INSERT INTO coaches (auth_id, email, name, phone, organization, created_at, updated_at)
            SELECT id, email, name, phone,
                   COALESCE(organization, school), -- 兼容可能的school字段
                   created_at, updated_at
            FROM coaches_backup
            ON CONFLICT (auth_id) DO NOTHING;

            DROP TABLE coaches_backup;
        END IF;
    END IF;
END $$;

-- 第三步：修复registrations表的状态字段
-- 3.1 删除所有状态相关的约束
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_status_check;
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_registration_type_check;

-- 3.2 统一状态值
-- 先处理registration_type字段（如果存在）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'registrations' AND column_name = 'registration_type'
    ) THEN
        -- 合并registration_type到status
        UPDATE registrations
        SET status = CASE
            WHEN registration_type = 'draft' THEN 'draft'
            WHEN registration_type = 'submitted' THEN 'submitted'
            WHEN registration_type = 'cancelled' THEN 'cancelled'
            WHEN status = 'pending' THEN 'submitted'
            WHEN status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN status
            ELSE 'draft'
        END;

        -- 删除registration_type字段
        ALTER TABLE registrations DROP COLUMN registration_type CASCADE;
    ELSE
        -- 如果没有registration_type，只需要标准化status
        UPDATE registrations
        SET status = CASE
            WHEN status = 'pending' THEN 'submitted'
            WHEN status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN status
            ELSE 'draft'
        END;
    END IF;
END $$;

-- 3.3 添加新的状态约束
ALTER TABLE registrations
ADD CONSTRAINT registrations_status_check
CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

-- 3.4 设置默认值
ALTER TABLE registrations
ALTER COLUMN status SET DEFAULT 'draft';

-- 第四步：修复coach_id引用
DO $$
BEGIN
    -- 检查coach_id字段的外键引用
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'registrations'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.column_name = 'coach_id'
        AND ccu.table_name = 'users'  -- 如果引用的是auth.users
    ) THEN
        -- 需要修改为引用coaches表
        ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_coach_id_fkey;

        -- 更新coach_id值为coaches表的id
        UPDATE registrations r
        SET coach_id = c.id
        FROM coaches c
        WHERE r.coach_id = c.auth_id;

        -- 添加新的外键约束
        ALTER TABLE registrations
        ADD CONSTRAINT registrations_coach_id_fkey
        FOREIGN KEY (coach_id) REFERENCES coaches(id);
    END IF;
END $$;

-- 第五步：添加缺失的字段
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS share_token VARCHAR(100) UNIQUE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS last_status_read_at TIMESTAMP WITH TIME ZONE;

-- 第六步：创建索引
CREATE INDEX IF NOT EXISTS idx_registrations_coach_id ON registrations(coach_id);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_coaches_auth_id ON coaches(auth_id);

-- 第七步：重新创建RLS策略
-- 7.1 启用RLS
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 7.2 删除旧策略
DROP POLICY IF EXISTS "Coaches can view own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can update own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can insert own profile" ON coaches;
DROP POLICY IF EXISTS "Coaches can create registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can view own registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can update own draft registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can delete own draft registrations" ON registrations;

-- 7.3 创建新策略
-- coaches表策略
CREATE POLICY "Coaches can view own profile" ON coaches
    FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "Coaches can update own profile" ON coaches
    FOR UPDATE USING (auth.uid() = auth_id);

CREATE POLICY "Coaches can insert own profile" ON coaches
    FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- registrations表策略
CREATE POLICY "Coaches can create registrations" ON registrations
    FOR INSERT WITH CHECK (
        coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
    );

CREATE POLICY "Coaches can view own registrations" ON registrations
    FOR SELECT USING (
        coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
    );

CREATE POLICY "Coaches can update own draft registrations" ON registrations
    FOR UPDATE USING (
        coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
        AND status = 'draft'
    );

CREATE POLICY "Coaches can delete own draft registrations" ON registrations
    FOR DELETE USING (
        coach_id IN (SELECT id FROM coaches WHERE auth_id = auth.uid())
        AND status = 'draft'
    );

-- 第八步：重新创建视图
CREATE OR REPLACE VIEW registration_details AS
SELECT
    r.*,
    e.name as event_name,
    e.short_name as event_short_name,
    e.poster_url as event_poster_url,
    e.type as event_type,
    e.start_date as event_start_date,
    e.end_date as event_end_date,
    e.address as event_address,
    e.details as event_details,
    e.phone as event_phone,
    c.name as coach_name,
    c.email as coach_email,
    c.phone as coach_phone,
    c.organization as coach_organization
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id;

-- 第九步：验证修复结果
-- 显示最终的状态分布
SELECT '=== 修复完成，当前状态分布 ===' as info;
SELECT status, COUNT(*) as count
FROM registrations
GROUP BY status
ORDER BY status;

-- 显示表结构
SELECT '=== registrations表关键字段 ===' as info;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'registrations'
AND column_name IN ('status', 'coach_id', 'created_at', 'cancelled_at')
ORDER BY ordinal_position;

SELECT '=== 数据库修复完成！===' as message;
SELECT '现在"草稿"筛选功能应该可以正常工作了' as result;