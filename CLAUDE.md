# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

基于 Next.js 15 和 Supabase 构建的体育赛事报名与审核系统。系统包含两个主要界面：
- **管理端** (`/events`, `/events/[id]`)：赛事管理、报名设置、审核提交
- **用户门户** (`/portal`)：赛事浏览、队伍报名、提交跟踪

## 开发命令

```bash
# 开发
npm run dev          # 启动开发服务器（使用 Turbopack）
pnpm dev            # 使用 pnpm 的替代方式

# 构建与生产
npm run build       # 生产环境构建
npm start           # 启动生产服务器

# 代码检查
npm run lint        # 运行 ESLint
```

## 架构说明

### 技术栈
- **框架**: Next.js 15 (App Router)
- **数据库**: Supabase PostgreSQL，带行级安全策略 (RLS)
- **认证**: Supabase Auth，配置自定义 SMTP
- **存储**: Supabase Storage 图片存储
- **UI**: shadcn/ui 组件 + Tailwind CSS
- **表单**: React Hook Form + Zod 验证
- **状态管理**: React Hooks + Context API
- **拖拽**: @dnd-kit 用于字段排序

### 核心目录结构

```
app/
├── auth/                    # 认证相关页面
│   ├── login/              # 登录页面
│   ├── register/           # 注册页面
│   ├── forgot-password/    # 忘记密码
│   └── update-password/    # 更新密码
│
├── events/                  # 管理端
│   ├── create/             # 创建赛事页面
│   └── [id]/               # 赛事管理（标签页：基本信息、报名设置、提交审核）
│
├── portal/                  # 用户门户（报名端）
│   ├── page.tsx            # 门户首页（赛事列表）
│   ├── layout.tsx          # 门户布局
│   ├── events/[id]/        # 赛事详情
│   │   ├── page.tsx        # 赛事详情页
│   │   └── register/       # 报名页面
│   │       └── page.tsx    # 动态表单报名
│   └── my/                 # 个人中心
│       ├── page.tsx        # 个人仪表板
│       ├── registrations/  # 我的报名
│       │   └── page.tsx    # 报名列表与状态跟踪
│       ├── notifications/  # 消息通知
│       │   └── page.tsx    # 审核通知、状态变更
│       └── settings/       # 个人设置
│           └── page.tsx    # 账户设置
│
├── player-share/[token]/    # 队员信息分享页面
│   └── page.tsx            # 基于分享令牌的公开页面
│
└── api/
    ├── events/             # 管理端赛事 API
    │   ├── route.ts        # 赛事列表与创建
    │   └── [id]/           # 单个赛事操作
    │       ├── route.ts    # 获取、更新、删除
    │       ├── registration-settings/  # 报名设置
    │       └── registrations/          # 提交记录
    │
    ├── portal/             # 用户门户 API
    │   ├── events/         # 门户赛事查询
    │   │   ├── route.ts    # 可见赛事列表
    │   │   └── [id]/       # 赛事详情与报名
    │   └── upload/         # 门户文件上传
    │
    └── upload/             # 通用文件上传处理

components/
├── event-manage/           # 管理端组件
│   ├── basic-info-tab.tsx          # 基本信息编辑
│   ├── registration-settings-tab.tsx # 报名设置（动态表单配置）
│   └── submissions-tab.tsx         # 提交审核
│
├── portal/                 # 门户组件（待开发）
│   ├── event-card.tsx      # 赛事卡片
│   ├── registration-form.tsx # 动态报名表单
│   └── status-badge.tsx    # 状态徽章
│
└── ui/                     # shadcn/ui 组件库
    ├── button.tsx
    ├── input.tsx
    ├── card.tsx
    └── ...

lib/
├── auth.ts                 # 认证辅助函数
├── supabase/               # Supabase 客户端工具
│   ├── client.ts           # 客户端
│   ├── server.ts           # 服务端
│   └── middleware.ts       # 中间件
└── types/                  # TypeScript 类型定义

docs/
└── sql/                    # 数据库脚本
    ├── actual-supabase-schema.sql  # 完整数据库架构（核心参考）
    ├── storage-policies.sql        # 存储桶策略
    └── create-buckets-simple.sql   # 存储桶创建
```

### 数据库架构

**数据库架构文件**：`docs/sql/actual-supabase-schema.sql`
（完整的数据库结构定义，包含所有表、索引、RLS 策略等）

**核心表**：
- `events` - 赛事基本信息
  - 字段：name, short_name, type, start_date, end_date, poster_url, address, details, phone, requirements, is_visible
  - 用途：存储赛事的基础数据

- `registration_settings` - 动态表单配置
  - 字段：event_id, team_requirements (JSONB), player_requirements (JSONB)
  - 用途：存储管理员配置的报名表单结构
  - `team_requirements`: 队伍报名字段 + 时间约束（报名开始/结束、审核结束）
  - `player_requirements`: 队员信息字段 + 年龄/性别/人数约束

- `registrations` - 报名提交记录
  - 字段：event_id, user_id, team_name, team_data (JSONB), status, share_token, rejection_reason
  - 状态：draft（草稿）, submitted（已提交）, approved（已通过）, rejected（已驳回）, cancelled（已取消）
  - 用途：存储用户提交的报名信息及审核状态

- `players` - 队员信息
  - 字段：registration_id, player_data (JSONB), role
  - 用途：存储报名关联的队员详细信息

**存储桶**（Supabase Storage）：
- `event-posters` - 赛事海报图片
- `registration-files` - 报名相关文件（证件照、资质文件等）

**相关 SQL 脚本**：
- `docs/sql/storage-policies.sql` - 存储桶访问策略
- `docs/sql/create-buckets-simple.sql` - 存储桶创建脚本

## 关键实现模式

### 1. 时间验证逻辑

系统通过**实时验证**强制执行严格的时间约束：

```
时间线：报名开始 → 报名结束 → 审核结束 → 赛事开始 → 赛事结束
```

**五条验证规则**（用户输入时实时验证）：
1. 赛事开始时间 ≤ 赛事结束时间
2. 报名开始时间 < 报名结束时间
3. 报名结束时间 < 审核结束时间
4. 报名结束时间 < 赛事开始时间
5. 审核结束时间 < 赛事开始时间

**实现位置：**
- `app/events/create/page.tsx:81-102` - 创建赛事验证
- `components/event-manage/basic-info-tab.tsx:95-116` - 编辑赛事验证
- `components/event-manage/registration-settings-tab.tsx:213-276` - 报名设置验证

错误提示会**显示具体时间值**，帮助用户理解违反的规则：
```
⚠️ 报名结束时间必须早于比赛开始时间（当前比赛开始时间为：2025-03-15）
```

### 2. 动态表单生成

报名表单基于管理员配置动态生成：

```typescript
// 支持的字段类型
type FieldType = 'text' | 'image' | 'select' | 'multiselect' | 'date'

// 字段存储在 registration_settings.team_requirements.allFields
// 根据字段类型和 `required` 标记进行渲染
```

使用 @dnd-kit 实现**拖拽排序**，允许管理员重新排列表单字段。

### 3. 认证流程

登录后基于角色的路由：
```typescript
const user = await supabase.auth.getUser()
if (user?.user_metadata?.role === 'admin') {
  router.push('/')  // 管理端
} else {
  router.push('/portal')  // 用户门户
}
```

API 路由中通过 `getCurrentAdminSession()` 验证管理员会话。

### 4. 文件上传模式

```typescript
// 1. 通过 /api/upload 上传到 Supabase Storage
const formData = new FormData()
formData.append('file', file)
formData.append('bucket', 'event-posters')  // 或 'registration-files'

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
})

// 2. 将返回的 URL 存储到数据库
const { data: { url } } = await response.json()
```

### 5. 报名状态流转

```
草稿(draft) → 已提交(submitted) → 已通过(approved)/已驳回(rejected)
                                  ↓
                            （驳回后可重新提交）
```

状态在 `registrations.status` 列中跟踪。

## 重要约定

### 日期/时间处理
- 赛事日期：`date` 类型 (YYYY-MM-DD)
- 报名/审核时间：`datetime-local` 类型 (YYYY-MM-DD HH:mm)
- 使用自定义的 `formatDate()` 和 `formatDateTime()` 辅助函数格式化显示

### 错误处理
- API 响应：`{ success: boolean, data?: any, error?: string }`
- 表单错误：React Hook Form + Zod，带内联字段验证
- 实时警告：琥珀色文字 (`text-amber-600`)，非阻塞式警告
- 阻塞错误：红色文字 (`text-red-600`)，阻止表单提交

### 组件模式
- 交互组件使用 `'use client'`
- 尽可能使用服务端组件进行数据获取
- Supabase 查询使用 async/await 并正确处理错误

## 环境变量

`.env.local` 中需要配置：
```
NEXT_PUBLIC_SUPABASE_URL=你的_supabase_地址
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_匿名密钥
```

## 测试账号

- 管理员：`13800138000` / `password`
- 教练：通过 `/auth/register` 注册

## 常见任务

### 添加新字段类型
1. 更新 registration-settings-tab.tsx 中的 `FieldConfig` 类型
2. 在表单组件中添加渲染逻辑
3. 如需要，更新验证模式
4. 测试拖拽功能是否正常

### 修改时间验证
- 在所有三个位置更新验证逻辑（创建、编辑基本信息、报名设置）
- 确保错误消息包含具体时间值
- 测试实时验证是否正确触发

### 添加新的赛事类型
修改以下文件中的 `eventTypes` 数组：
- `app/events/create/page.tsx`
- `components/event-manage/basic-info-tab.tsx`

## 数据库操作最佳实践

### 应用代码中的数据库查询

```typescript
// ✅ 正确 - 使用 Supabase 客户端
const supabase = await createSupabaseServer()
const { data, error } = await supabase
  .from('events')
  .select('*')
  .eq('id', eventId)
  .single()

// ❌ 错误 - 直接 SQL（绕过 RLS）
// 不要在应用代码中编写原始 SQL 查询
```

### 数据库架构修改指南

**查看当前架构**：
- 完整架构：`docs/sql/actual-supabase-schema.sql`
  - 包含所有表定义、索引、RLS 策略、触发器等
  - 这是从生产环境 Supabase 导出的完整结构

**修改数据库架构的步骤**：

1. **在 Supabase Dashboard 中修改**
   - 登录你的 Supabase 项目 Dashboard
   - 方式一：使用 Table Editor（可视化界面）
   - 方式二：使用 SQL Editor 执行 SQL 语句
   - 测试修改是否正常工作

2. **更新本地文档**（重要！）
   - 修改完成后，从 Supabase 导出新的 schema
   - 更新 `docs/sql/actual-supabase-schema.sql` 文件
   - 如果是新功能，可创建单独的迁移脚本存放在 `docs/sql/`

3. **同步 TypeScript 类型**
   - 更新 `lib/types/` 中的类型定义
   - 确保接口与数据库结构保持一致
   - 更新相关的 API 响应类型

**常见修改场景**：

- **添加新表**
  ```sql
  -- 在 Supabase SQL Editor 中执行
  CREATE TABLE new_table (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- 其他字段
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 添加 RLS 策略
  ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
  ```
  然后导出更新 `actual-supabase-schema.sql`

- **修改字段**
  ```sql
  -- 添加新字段
  ALTER TABLE events ADD COLUMN new_field VARCHAR(100);

  -- 修改字段类型（注意数据迁移）
  ALTER TABLE events ALTER COLUMN field_name TYPE new_type;
  ```
  注意：可能需要编写数据转换脚本

- **添加 RLS 策略**
  ```sql
  -- 确保新表有正确的行级安全策略
  CREATE POLICY "管理员可以查看所有记录"
    ON new_table FOR SELECT
    USING (auth.jwt() ->> 'role' = 'admin');
  ```

- **修改存储桶策略**
  - 参考 `docs/sql/storage-policies.sql`
  - 在 Storage 设置中修改访问策略

## 门户开发说明

用户门户 (`/portal`) 允许教练：
1. 浏览可见的赛事
2. 使用动态表单提交队伍报名
3. 跟踪提交状态
4. 状态变更时接收通知
5. 通过唯一令牌分享队员信息

门户 API 与管理端 API 分离（`/api/portal/*` vs `/api/events/*`）。
