# 账号管理系统 - 数据库迁移总览

## 🚨 当前问题

### 管理员账号管理
- ❌ 取消超管权限失败
- ❌ 姓名列显示为空
- ❌ 无法编辑管理员信息

### 教练账号管理
- ❌ 点击教练账号报错："Unexpected token 'I', 'Internal S'..."
- ❌ 无法查看教练列表
- ❌ 启用/禁用功能不可用

## 📋 解决方案

需要执行两个数据库迁移脚本，按顺序执行：

### 第一步：管理员表迁移

**文件**：`docs/sql/add-admin-users-columns.sql`

**添加的列**：
- `auth_id` - 关联 auth.users
- `name` - 管理员姓名
- `is_super` - 超级管理员标识

**快速执行**：
```sql
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS name character varying(100),
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_auth_id ON public.admin_users(auth_id);

UPDATE public.admin_users SET is_super = true WHERE is_super = false;
```

### 第二步：教练表迁移

**文件**：`docs/sql/add-coaches-columns.sql`

**添加的列**：
- `is_active` - 账号是否启用
- `notes` - 备注信息
- `last_login_at` - 最后登录时间
- `created_by` - 创建者（管理员 ID）

**快速执行**：
```sql
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);

CREATE INDEX IF NOT EXISTS idx_coaches_created_by ON public.coaches(created_by);
CREATE INDEX IF NOT EXISTS idx_coaches_is_active ON public.coaches(is_active);

UPDATE public.coaches SET is_active = true WHERE is_active IS NULL;
```

## ⚡ 一键执行（推荐）

在 MemFire Dashboard SQL Editor 中，按顺序执行以下完整脚本：

```sql
-- ============================================
-- 第一步：管理员表迁移
-- ============================================

-- 添加 auth_id 列（关联 auth.users）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 添加 name 列（管理员姓名）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS name character varying(100);

-- 添加 is_super 列（是否为超级管理员）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false NOT NULL;

-- 为 auth_id 创建索引
CREATE INDEX IF NOT EXISTS idx_admin_users_auth_id ON public.admin_users(auth_id);

-- 将现有管理员设置为超级管理员
UPDATE public.admin_users SET is_super = true WHERE is_super = false;

-- ============================================
-- 第二步：教练表迁移
-- ============================================

-- 添加 is_active 列（账号是否启用）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- 添加 notes 列（备注信息）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS notes text;

-- 添加 last_login_at 列（最后登录时间）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

-- 添加 created_by 列（创建者，关联管理员）
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);

-- 为 created_by 创建索引
CREATE INDEX IF NOT EXISTS idx_coaches_created_by ON public.coaches(created_by);

-- 为 is_active 创建索引
CREATE INDEX IF NOT EXISTS idx_coaches_is_active ON public.coaches(is_active);

-- 将现有教练账号设置为启用状态
UPDATE public.coaches SET is_active = true WHERE is_active IS NULL;

-- ============================================
-- 验证迁移结果
-- ============================================

-- 查看 admin_users 表结构
SELECT 'admin_users 表结构:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_users'
ORDER BY ordinal_position;

-- 查看 coaches 表结构
SELECT 'coaches 表结构:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'coaches'
ORDER BY ordinal_position;
```

## ✅ 验证清单

执行完成后，验证以下内容：

### admin_users 表
- [ ] 有 `auth_id` 列
- [ ] 有 `name` 列
- [ ] 有 `is_super` 列
- [ ] 所有现有管理员的 `is_super` 为 `true`

### coaches 表
- [ ] 有 `is_active` 列
- [ ] 有 `notes` 列
- [ ] 有 `last_login_at` 列
- [ ] 有 `created_by` 列
- [ ] 所有现有教练的 `is_active` 为 `true`

## 🎯 迁移后可用功能

### 管理员账号管理
- ✅ 创建管理员（带姓名）
- ✅ 编辑管理员姓名
- ✅ 设置/取消超级管理员权限
- ✅ 重置管理员密码
- ✅ 删除管理员账号
- ✅ 当前账号标识和保护

### 教练账号管理
- ✅ 查看教练列表
- ✅ 创建教练账号
- ✅ 编辑教练信息
- ✅ 启用/禁用教练账号
- ✅ 重置教练密码
- ✅ 删除教练账号
- ✅ 查看创建者信息
- ✅ 添加备注

## 📚 详细文档

- **管理员迁移详细指南**：`docs/ADMIN_MIGRATION_GUIDE.md`
- **教练迁移详细指南**：`docs/COACHES_MIGRATION_GUIDE.md`
- **快速修复指南**：`docs/ADMIN_QUICK_FIX.md`

## 🔧 故障排查

### 问题：外键约束错误
**原因**：执行顺序错误
**解决**：必须先执行管理员表迁移，再执行教练表迁移

### 问题：列已存在错误
**原因**：重复执行迁移
**解决**：脚本使用 `IF NOT EXISTS`，可以安全忽略此错误

### 问题：执行后仍报错
**原因**：浏览器缓存
**解决**：刷新浏览器（Ctrl+Shift+R 或 Cmd+Shift+R）

## ⚠️ 重要提示

1. **执行顺序**：必须先执行管理员表迁移，再执行教练表迁移
2. **备份数据**：执行前建议备份数据库
3. **安全执行**：脚本使用 `IF NOT EXISTS`，可以安全地重复执行
4. **刷新页面**：执行完成后刷新浏览器页面

## 🚀 执行步骤

1. 打开 MemFire Dashboard
2. 进入 SQL Editor
3. 复制上面的"一键执行"脚本
4. 点击"Run"执行
5. 查看执行结果，确认无错误
6. 刷新浏览器页面
7. 测试账号管理功能

执行完成后，所有账号管理功能将正常工作！
