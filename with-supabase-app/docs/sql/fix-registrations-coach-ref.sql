-- 修复registrations表的coach_id引用

-- 先删除现有的外键约束（如果存在）
ALTER TABLE registrations
DROP CONSTRAINT IF EXISTS registrations_coach_id_fkey;

-- 删除旧的coach_id字段（如果存在）
ALTER TABLE registrations
DROP COLUMN IF EXISTS coach_id;

-- 添加新的coach_id字段，引用coaches表的id
ALTER TABLE registrations
ADD COLUMN coach_id UUID REFERENCES coaches(id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_registrations_coach_id ON registrations(coach_id);

-- 更新RLS策略
DROP POLICY IF EXISTS "Coaches can create registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can view own registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can update own draft registrations" ON registrations;
DROP POLICY IF EXISTS "Coaches can delete own draft registrations" ON registrations;

-- 重新创建策略，使用coaches表关联
CREATE POLICY "Coaches can create registrations" ON registrations
    FOR INSERT WITH CHECK (
        coach_id IN (
            SELECT id FROM coaches WHERE auth_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can view own registrations" ON registrations
    FOR SELECT USING (
        coach_id IN (
            SELECT id FROM coaches WHERE auth_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can update own draft registrations" ON registrations
    FOR UPDATE USING (
        coach_id IN (
            SELECT id FROM coaches WHERE auth_id = auth.uid()
        ) AND status = 'draft'
    );

CREATE POLICY "Coaches can delete own draft registrations" ON registrations
    FOR DELETE USING (
        coach_id IN (
            SELECT id FROM coaches WHERE auth_id = auth.uid()
        ) AND status = 'draft'
    );

-- 验证
SELECT 'Registrations coach reference fixed!' as status;