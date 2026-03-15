# 账号管理功能 - 快速参考

## 🚨 当前状态

**问题**：数据库缺少必要的列，导致功能无法正常使用

**影响功能**：
- ❌ 编辑管理员姓名
- ❌ 设置/取消超级管理员权限
- ❌ 部分管理员信息显示

## ✅ 立即执行（必需）

在 MemFire Dashboard SQL Editor 中执行：

```sql
-- 添加缺失的列
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS name character varying(100),
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false NOT NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admin_users_auth_id ON public.admin_users(auth_id);

-- 设置现有管理员为超级管理员
UPDATE public.admin_users SET is_super = true WHERE is_super = false;
```

## 📝 验证步骤

执行后运行此查询验证：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_users'
ORDER BY ordinal_position;
```

应该看到 8 个列：id, phone, password_hash, created_at, updated_at, auth_id, name, is_super

## 🎯 完成后的功能

- ✅ 创建管理员账号（带姓名）
- ✅ 编辑管理员姓名
- ✅ 设置/取消超级管理员权限
- ✅ 重置管理员密码
- ✅ 删除管理员账号
- ✅ 防止删除最后一个超级管理员
- ✅ 防止修改自己的权限

## 📚 相关文档

- 完整指南：`docs/ADMIN_MIGRATION_GUIDE.md`
- 迁移脚本：`docs/sql/add-admin-users-columns.sql`
- 验证脚本：`docs/sql/check-admin-users-columns.sql`

## 🔧 故障排查

如果执行 SQL 后仍有问题：

1. 刷新浏览器（Ctrl+Shift+R 或 Cmd+Shift+R）
2. 检查浏览器控制台的错误信息
3. 查看 Next.js 开发服务器日志
4. 验证 `SUPABASE_SERVICE_ROLE_KEY` 环境变量

## 💡 开发服务器问题

如遇到 "Cannot find module" 错误：

```bash
rm -rf .next
pnpm dev
```

这会清除构建缓存并重新启动。
