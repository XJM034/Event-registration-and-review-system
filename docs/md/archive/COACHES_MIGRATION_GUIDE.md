# 教练账号管理 - 数据库迁移指南

## 问题描述

点击教练账号时出现错误：
- 控制台错误：`Unexpected token 'I', "Internal S"... is not valid JSON`
- 原因：API 返回 HTML 错误页而非 JSON

**根本原因**：`coaches` 表缺少必要的列。

## 当前表结构

```sql
CREATE TABLE public.coaches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    email character varying(255) NOT NULL,
    name character varying(100),
    phone character varying(20),
    school character varying(100),
    role character varying(20) DEFAULT 'coach'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    organization character varying(255)
);
```

## 需要添加的列

1. **is_active** - 账号是否启用（boolean）
2. **notes** - 备注信息（text）
3. **last_login_at** - 最后登录时间（timestamp）
4. **created_by** - 创建者/管理员 ID（uuid，外键）

## 迁移步骤

### 步骤 1：检查当前表结构（可选）

在 MemFire Dashboard 的 SQL Editor 中执行：

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'coaches'
ORDER BY ordinal_position;
```

如果结果中没有 `is_active`、`notes`、`last_login_at`、`created_by` 列，则需要执行迁移。

### 步骤 2：执行迁移脚本

在 MemFire Dashboard 的 SQL Editor 中执行以下脚本：

```sql
-- 为 coaches 表添加缺失的列
-- 执行时间：2026-03-05

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

-- 为 created_by 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_coaches_created_by ON public.coaches(created_by);

-- 为 is_active 创建索引（常用于筛选）
CREATE INDEX IF NOT EXISTS idx_coaches_is_active ON public.coaches(is_active);

-- 添加注释
COMMENT ON COLUMN public.coaches.is_active IS '账号是否启用';
COMMENT ON COLUMN public.coaches.notes IS '备注信息';
COMMENT ON COLUMN public.coaches.last_login_at IS '最后登录时间';
COMMENT ON COLUMN public.coaches.created_by IS '创建者（管理员ID）';

-- 将现有教练账号设置为启用状态
UPDATE public.coaches
SET is_active = true
WHERE is_active IS NULL;
```

### 步骤 3：验证迁移结果

执行以下查询验证列已成功添加：

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'coaches'
ORDER BY ordinal_position;
```

预期结果应包含以下列：
- id
- auth_id
- email
- name
- phone
- school
- role
- created_at
- updated_at
- organization
- **is_active** ✓ 新增
- **notes** ✓ 新增
- **last_login_at** ✓ 新增
- **created_by** ✓ 新增

### 步骤 4：验证数据

检查现有教练是否已设置为启用状态：

```sql
SELECT id, phone, name, is_active, created_at
FROM public.coaches;
```

所有现有教练的 `is_active` 应该为 `true`。

## 迁移后的功能

执行迁移后，以下功能将正常工作：

1. ✅ 查看教练列表
2. ✅ 搜索教练（手机号、姓名、参赛单位）
3. ✅ 创建教练账号
4. ✅ 编辑教练信息
5. ✅ 启用/禁用教练账号
6. ✅ 重置教练密码
7. ✅ 删除教练账号
8. ✅ 查看创建者信息
9. ✅ 添加备注

## 数据库关系

### 外键关系

```
coaches.created_by → admin_users.id
```

这个关系允许：
- 追踪哪个管理员创建了教练账号
- 在教练列表中显示创建者信息
- 统计管理员创建的教练数量

### 索引优化

创建了两个索引：
1. `idx_coaches_created_by` - 优化创建者查询
2. `idx_coaches_is_active` - 优化启用/禁用状态筛选

## API 更新

### GET /api/admin/coaches

**查询语句：**
```typescript
supabaseAdmin
  .from('coaches')
  .select('*, created_by_admin:admin_users!created_by(phone)', { count: 'exact' })
```

**返回数据结构：**
```typescript
{
  success: true,
  data: {
    coaches: [
      {
        id: string,
        phone: string,
        name: string,
        school: string,
        is_active: boolean,
        notes: string | null,
        last_login_at: string | null,
        created_by: string | null,
        created_by_admin: {
          phone: string
        } | null,
        created_at: string,
        updated_at: string
      }
    ],
    total: number,
    page: number,
    pageSize: number
  }
}
```

## 故障排查

### 问题 1：点击教练账号报错
**原因**：数据库缺少 `is_active`、`notes`、`last_login_at`、`created_by` 列
**解决**：执行迁移脚本

### 问题 2：创建者信息显示为空
**原因**：`created_by` 列为 NULL（历史数据）
**解决**：这是正常的，新创建的教练会自动记录创建者

### 问题 3：启用/禁用按钮不工作
**原因**：数据库缺少 `is_active` 列
**解决**：执行迁移脚本

### 问题 4：外键约束错误
**原因**：`admin_users` 表不存在或缺少必要列
**解决**：先执行 `docs/sql/add-admin-users-columns.sql`

## 执行顺序

如果两个迁移都需要执行，请按以下顺序：

1. **第一步**：执行 `add-admin-users-columns.sql`
   - 添加 `admin_users` 表的 `is_super`、`name`、`auth_id` 列

2. **第二步**：执行 `add-coaches-columns.sql`
   - 添加 `coaches` 表的 `is_active`、`notes`、`last_login_at`、`created_by` 列

这个顺序很重要，因为 `coaches.created_by` 外键依赖于 `admin_users` 表。

## 相关文件

- 迁移脚本：`docs/sql/add-coaches-columns.sql`
- 管理员迁移：`docs/sql/add-admin-users-columns.sql`
- API 路由：`app/api/admin/coaches/route.ts`
- 管理界面：`components/account-management/coaches-tab.tsx`

## 注意事项

⚠️ **重要**：
- 执行迁移前建议备份数据库
- 迁移脚本使用 `IF NOT EXISTS`，可以安全地重复执行
- 现有教练会自动设置为启用状态
- `created_by` 对历史数据为 NULL，这是正常的
- 新创建的教练会自动记录创建者

## 测试清单

执行迁移后，请测试以下功能：

- [ ] 教练列表正常显示
- [ ] 搜索功能正常工作
- [ ] 创建教练账号成功
- [ ] 编辑教练信息成功
- [ ] 启用/禁用功能正常
- [ ] 重置密码功能正常
- [ ] 删除教练账号成功
- [ ] 创建者信息正确显示（新创建的教练）
- [ ] 备注功能正常工作
