# 管理员账号管理功能 - 数据库迁移指南

## 问题描述

在尝试使用管理员账号管理功能时，出现以下错误：
- 取消超管权限失败
- 控制台错误：`Unexpected token 'I', "Internal S"... is not valid JSON`

**根本原因**：`admin_users` 表缺少必要的列。

## 当前表结构

```sql
CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(20) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
```

## 需要添加的列

1. **auth_id** - 关联 auth.users 表的外键
2. **name** - 管理员姓名
3. **is_super** - 超级管理员标识

## 迁移步骤

### 步骤 1：检查当前表结构（可选）

在 MemFire Dashboard 的 SQL Editor 中执行：

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_users'
ORDER BY ordinal_position;
```

如果结果中没有 `auth_id`、`name`、`is_super` 列，则需要执行迁移。

### 步骤 2：执行迁移脚本

在 MemFire Dashboard 的 SQL Editor 中执行以下脚本：

```sql
-- 为 admin_users 表添加缺失的列
-- 执行时间：2026-03-05

-- 添加 auth_id 列（关联 auth.users）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 添加 name 列（管理员姓名）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS name character varying(100);

-- 添加 is_super 列（是否为超级管理员）
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false NOT NULL;

-- 为 auth_id 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_admin_users_auth_id ON public.admin_users(auth_id);

-- 添加注释
COMMENT ON COLUMN public.admin_users.auth_id IS '关联的 auth.users 用户ID';
COMMENT ON COLUMN public.admin_users.name IS '管理员姓名';
COMMENT ON COLUMN public.admin_users.is_super IS '是否为超级管理员';

-- 将现有管理员设置为超级管理员（如果表中已有数据）
-- 这样可以确保至少有一个超级管理员
UPDATE public.admin_users
SET is_super = true
WHERE is_super = false;
```

### 步骤 3：验证迁移结果

执行以下查询验证列已成功添加：

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_users'
ORDER BY ordinal_position;
```

预期结果应包含以下列：
- id
- phone
- password_hash
- created_at
- updated_at
- **auth_id** ✓ 新增
- **name** ✓ 新增
- **is_super** ✓ 新增

### 步骤 4：验证数据

检查现有管理员是否已设置为超级管理员：

```sql
SELECT id, phone, name, is_super, created_at
FROM public.admin_users;
```

所有现有管理员的 `is_super` 应该为 `true`。

## 迁移后的功能

执行迁移后，以下功能将正常工作：

1. ✅ 编辑管理员姓名
2. ✅ 设置/取消超级管理员权限
3. ✅ 防止取消最后一个超级管理员
4. ✅ 防止修改自己的权限
5. ✅ 重置管理员密码
6. ✅ 删除管理员账号

## 代码改进

在此次修复中，还对 API 进行了以下改进：

1. **防止取消最后一个超管**：
   ```typescript
   if (is_super === false) {
     const { data: superAdmins } = await supabaseAdmin
       .from('admin_users')
       .select('id')
       .eq('is_super', true)

     if (superAdmins && superAdmins.length <= 1) {
       return NextResponse.json(
         { success: false, error: '不能取消最后一个超级管理员的权限' },
         { status: 400 }
       )
     }
   }
   ```

2. **更详细的错误日志**：
   ```typescript
   if (updateError) {
     console.error('Error updating admin:', updateError)
     console.error('Update data:', updateData)
     console.error('Admin ID:', id)
     return NextResponse.json(
       { success: false, error: `更新管理员信息失败: ${updateError.message}` },
       { status: 500 }
     )
   }
   ```

## 故障排查

如果迁移后仍有问题：

1. **检查浏览器控制台**：查看具体的错误信息
2. **检查服务器日志**：查看 Next.js 开发服务器的输出
3. **验证环境变量**：确保 `SUPABASE_SERVICE_ROLE_KEY` 已正确配置
4. **清除缓存**：刷新浏览器页面（Ctrl+Shift+R 或 Cmd+Shift+R）

## 相关文件

- 迁移脚本：`docs/sql/add-admin-users-columns.sql`
- 验证脚本：`docs/sql/check-admin-users-columns.sql`
- API 路由：`app/api/admin/admins/[id]/route.ts`
- 管理界面：`components/account-management/admins-tab.tsx`
- 编辑对话框：`components/account-management/edit-admin-dialog.tsx`

## 注意事项

⚠️ **重要**：
- 执行迁移前建议备份数据库
- 迁移脚本使用 `IF NOT EXISTS`，可以安全地重复执行
- 现有管理员会自动设置为超级管理员，确保系统可用性
