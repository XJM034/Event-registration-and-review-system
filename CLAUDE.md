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
├── auth/                 # 认证相关页面（登录、注册、忘记密码）
├── events/               # 管理端
│   ├── create/          # 创建赛事页面
│   └── [id]/            # 赛事管理（标签页：基本信息、报名设置、提交审核）
├── portal/              # 用户门户
│   ├── events/[id]/     # 赛事详情与报名
│   └── my/              # 用户仪表板、报名记录、通知
├── player-share/[token] # 队员信息分享页面
└── api/
    ├── events/          # 赛事 CRUD API
    ├── portal/          # 门户专用 API
    └── upload/          # 文件上传处理

components/
├── event-manage/        # 管理端组件（basic-info-tab、registration-settings-tab）
├── portal/              # 门户组件
└── ui/                  # shadcn/ui 组件

lib/
├── auth.ts              # 认证辅助函数
├── supabase/            # Supabase 客户端工具
└── types/               # TypeScript 类型定义
```

### 数据库架构

核心表：
- `events` - 赛事基本信息（名称、日期、类型、海报、详情）
- `registration_settings` - 动态表单配置（JSONB 存储）
  - `team_requirements`: 队伍报名字段 + 时间约束
  - `player_requirements`: 队员信息字段 + 年龄/性别/人数约束
- `registrations` - 用户提交记录，带状态跟踪
- `players` - 队员信息，关联到报名记录

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

- 管理员：`13800138000` / `admin123`
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

## 门户开发说明

用户门户 (`/portal`) 允许教练：
1. 浏览可见的赛事
2. 使用动态表单提交队伍报名
3. 跟踪提交状态
4. 状态变更时接收通知
5. 通过唯一令牌分享队员信息

门户 API 与管理端 API 分离（`/api/portal/*` vs `/api/events/*`）。
