# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。目标是**如实反映当前仓库代码与数据库结构**，便于快速定位与修改。

> 约定：当本文档与实现不一致时，优先以 **代码** + `docs/sql/actual-supabase-schema.sql` 为准，并在”已知不一致”章节补充记录。

## 目录

- [项目概述](#项目概述)
- [开发命令](#开发命令)
- [技术栈](#技术栈)
- [核心目录结构](#核心目录结构)
- [数据库架构](#数据库架构与代码一致的关键点)
- [认证与路由保护](#认证与路由保护)
- [时间与报名阶段](#时间与报名阶段)
- [管理端 UI 增强功能](#管理端-ui-增强功能) ⭐ 新增
- [门户端 UI 增强功能](#门户端-ui-增强功能) ⭐ 新增
- [动态表单](#动态表单报名设置--门户渲染)
- [报名状态机](#报名状态机存储型)
- [审核功能增强](#审核功能增强) ⭐ 新增
- [取消报名提醒逻辑](#取消报名提醒逻辑门户)
- [队员分享链接](#队员分享链接公开填写)
- [文件上传与 Storage Bucket](#文件上传与-storage-bucket)
- [通知系统](#通知系统门户我的通知)
- [导出功能](#导出功能管理员) ⭐ 重大更新
- [API 端点列表](#api-端点列表以实际路由为准)
- [环境变量](#环境变量)
- [测试账号](#测试账号开发调试)
- [常见任务](#常见任务修改指引)
- [故障排查](#故障排查)
- [数据库变更流程](#数据库变更流程推荐)
- [已知不一致](#已知不一致建议后续修复)

## 快速参考

### 关键文件速查

| 功能 | 文件路径 | 说明 |
|---|---|---|
| 管理员认证 | `lib/auth.ts` | JWT 生成/验证，**含硬编码密码绕过** |
| 路由保护 | `middleware.ts` | 白名单 + 分区鉴权 |
| 类型定义 | `lib/types.ts` | **部分类型过时，需参考实际代码** |
| 导出功能 | `app/api/events/[id]/registrations/export/route.ts` | 477行复杂实现 |
| 动态表单配置 | `components/event-manage/registration-settings-tab.tsx` | 拖拽排序 + 字段管理 |
| 门户报名页 | `app/portal/events/[id]/register/page.tsx` | 动态表单渲染 + 分享链接 |
| 审核列表 | `components/event-manage/review-list-tab.tsx` | 逐项审核 + 状态更新 |
| 通知系统 | `contexts/notification-context.tsx` | 30s 轮询 + 未读计数 |

### 常见问题速查

| 问题 | 原因 | 解决方案 | 章节链接 |
|---|---|---|---|
| Bucket not found | Storage bucket 未创建 | 执行 `docs/sql/create-buckets-simple.sql` | [故障排查](#故障排查) |
| 页面重定向到登录 | 路径不在白名单 | 检查 `middleware.ts` publicPaths | [认证与路由保护](#认证与路由保护) |
| 类型错误 | `lib/types.ts` 过时 | 参考实际代码结构 | [已知不一致](#已知不一致建议后续修复) |
| Badge 样式错误 | 缺少 success variant | 添加 success 样式或使用其他 variant | [已知不一致](#已知不一致建议后续修复) |
| 重复通知 | 触发器 + API 双写 | 禁用其中一种方式 | [通知系统](#通知系统门户我的通知) |

## 项目概述

基于 **Next.js 15 (App Router)** + **Supabase/MemFire（Postgres + Storage + Auth）** 的体育赛事报名与审核系统，包含三类入口：

1. **管理端（管理员）**：赛事管理、报名设置（动态表单）、报名审核、导出报名数据  
2. **报名端 / 门户（教练）**：赛事浏览、报名（草稿/提交/重提/取消）、通知、队员分享填写  
3. **公开队员填写页**：`/player-share/[token]`，无需登录（通过 token 控制访问）

## 开发命令

仓库使用 `pnpm`（`package.json#packageManager` 已固定版本）。

```bash
pnpm install

# 开发（Turbopack）
pnpm dev

# 代码检查
pnpm lint

# 构建与运行
pnpm build
pnpm start
```

## 技术栈

- **框架**：Next.js 15（App Router），React 19，TypeScript
- **数据库/认证/存储**：Supabase / MemFire（兼容 Supabase API）
  - `@supabase/ssr`：服务端/中间件会话
  - `@supabase/supabase-js`：service role、Storage 上传等
- **UI**：Tailwind CSS + shadcn/ui（Radix UI）+ lucide-react
- **表单**：react-hook-form + zod
- **拖拽排序**：@dnd-kit
- **导出**：xlsx + jszip（前端通过 Blob 下载）

## 核心目录结构

> 说明：仓库内仍保留部分 Next.js Supabase Starter 的示例页面/组件（见 `app/protected/*`、`components/tutorial/*`、`app/auth/sign-up/*`），不属于业务主流程，但仍在代码中。

```
app/
├── layout.tsx                     # 全局布局（ThemeProvider）
├── page.tsx                       # 管理端首页：赛事列表（需要 admin-session）
├── events/
│   ├── page.tsx                   # 重定向到 /
│   ├── create/page.tsx            # 创建赛事
│   └── [id]/page.tsx              # 管理端赛事管理（基本信息/报名设置/审核/报名列表）
├── portal/
│   ├── layout.tsx                 # 门户布局（侧边栏 + NotificationProvider）
│   ├── page.tsx                   # 门户赛事列表
│   ├── events/[id]/page.tsx       # 门户赛事详情（状态、报名入口、取消等）
│   ├── events/[id]/register/page.tsx # 门户报名页（动态表单）
│   └── my/
│       ├── page.tsx               # 个人中心
│       ├── registrations/page.tsx # 我的报名
│       ├── notifications/page.tsx # 我的通知
│       └── settings/page.tsx      # 账号设置
├── player-share/[token]/page.tsx  # 公开队员填写页（无需登录）
├── auth/
│   ├── login/page.tsx             # 统一登录（教练/管理员 Tab）
│   ├── register/page.tsx          # 教练注册（Supabase Auth）
│   ├── forgot-password/page.tsx
│   ├── update-password/page.tsx
│   ├── confirm/route.ts           # 邮箱 OTP 回调（模板）
│   ├── error/page.tsx             # 认证错误页（模板）
│   └── sign-up*/                  # 模板遗留（可选/未统一入口）
├── api/
│   ├── auth/login/route.ts
│   ├── auth/logout/route.ts
│   ├── init-admin/route.ts
│   ├── events/route.ts
│   ├── events/[id]/route.ts
│   ├── events/[id]/registration-settings/route.ts
│   ├── events/[id]/registrations/route.ts
│   ├── events/[id]/registrations/export/route.ts
│   ├── registrations/[id]/review/route.ts
│   ├── upload/route.ts
│   ├── portal/events/route.ts
│   ├── portal/events/[id]/route.ts
│   ├── portal/upload/route.ts
│   ├── player-share/[token]/route.ts
│   └── test-*/route.ts            # 连接/性能诊断接口（调试用）
├── init/page.tsx                  # 调试页（当前与 /api/init-admin 方法不一致，见“已知不一致”）
├── test-login/page.tsx            # 调试页（middleware 当前会重定向，见“已知不一致”）
└── protected/*                    # 模板示例（Supabase Starter）

components/
├── admin-header.tsx
├── event-list.tsx                 # 管理端赛事列表（含报名阶段计算）
├── event-manage/
│   ├── basic-info-tab.tsx
│   ├── registration-settings-tab.tsx
│   ├── review-list-tab.tsx
│   └── registration-list-tab.tsx
├── ui/*                           # shadcn/ui 组件
└── tutorial/*                     # 模板示例

contexts/
└── notification-context.tsx       # 门户未读通知数量轮询

lib/
├── auth.ts                        # 管理员 JWT + createSupabaseServer
├── supabase/
│   ├── client.ts                  # createBrowserClient
│   ├── server.ts                  # createServerClient（cookies）
│   └── middleware.ts              # 模板的 updateSession（当前未在 middleware.ts 使用）
├── types.ts                       # TypeScript 类型（部分与 DB 不一致，见“已知不一致”）
└── utils.ts

docs/
├── STORAGE_SETUP.md
└── sql/
   ├── actual-supabase-schema.sql  # 生产/目标数据库结构快照（主参考）
   ├── create-buckets-simple.sql   # 推荐：创建 4 个 Storage bucket
   ├── storage-policies.sql        # Storage/RLS 策略参考
   └── ...

middleware.ts                      # 全局路由保护（管理员/教练/公开路径）
next.config.ts                     # 图片域白名单、安全头、构建忽略 lint/ts
```

## 数据库架构（与代码一致的关键点）

数据库结构以 `docs/sql/actual-supabase-schema.sql` 为基准（MemFire/Supabase 兼容）。

### 核心表

- `admin_users`：管理员账号（独立于 Supabase Auth）
  - 关键字段：`phone`, `password_hash`

- `coaches`：教练档案（与 Supabase Auth 用户关联）
  - 关键字段：`auth_id`, `email`, `name`, `phone`, `school`, `organization`

- `events`：赛事基本信息（管理端创建/编辑）
  - 关键字段：`name`, `short_name`, `type`, `start_date`, `end_date`, `poster_url`, `address`, `details`, `phone`, `requirements`, `is_visible`
  - 时间字段（列）：`registration_start_date`, `registration_end_date`（代码主要使用 registration_settings 中的时间，必要时会 fallback）

- `registration_settings`：报名设置（动态表单配置）
  - `team_requirements`（JSONB）：队伍字段配置 + 报名/审核时间
  - `player_requirements`（JSONB）：队员字段配置 + 人数/性别/年龄约束等

- `registrations`：报名记录
  - 关键字段：`event_id`, `coach_id`, `team_data`（JSONB）, `players_data`（JSONB）, `status`
  - 其他字段：`rejection_reason`, `cancelled_at`, `cancelled_reason`, `submitted_at`, `reviewed_at`, `reviewer_id`
  - 状态字段：`status`（见下文“报名状态机”）

- `notifications`：通知（报名端“我的通知”）
  - 字段：`coach_id`, `type`（`approval|rejection|reminder`）, `title`, `message`, `is_read`, `event_id`, `registration_id`

- `player_share_tokens`：队员分享链接
  - 字段：`token`（唯一）, `registration_id`, `event_id`, `player_index`, `player_id`, `expires_at`, `is_active`, `used_at`
  - 结构中还包含：`player_data`, `is_filled`, `filled_at`（代码当前主要通过 registrations.players_data 更新队员信息）

- `player_submissions`：队员信息提交记录（当前业务代码未重点使用）

### 关键数据库函数/触发器（会影响代码行为）

- `registration_notification_trigger`（触发器）：`registrations` 更新状态时自动写入 `notifications`
- `mark_all_notifications_as_read()`（RPC）：批量标记通知为已读（门户页会尝试调用）
- `clean_expired_share_tokens()`：清理过期分享 token（是否被调度取决于部署）

## 认证与路由保护

系统已统一迁移到 **Supabase Auth**，管理员和教练共用同一套认证体系。

### 统一认证方案

- 登录入口：`/auth/login`（统一登录页，无 Tab 切换，无注册入口）
- 认证方式：`supabase.auth.signInWithPassword`（客户端直接调用）
- 账号格式：手机号作为用户名，内部转换为 `手机号@system.local` 邮箱格式
- 角色区分：`auth.users.raw_user_meta_data.role`（`admin` 或 `coach`）
- 超级管理员：`auth.users.raw_user_meta_data.is_super` + `admin_users.is_super`
- 账号创建：通过 SQL 脚本直接写入 `auth.users` 表（见 `docs/sql/create-auth-accounts.sql`）
- 自动同步：`handle_new_user()` 触发器在 `auth.users` 插入时自动创建 `admin_users` 或 `coaches` 记录

### 关键实现文件

- `lib/auth.ts`：`createSupabaseServer()`、`getCurrentAdminSession()`、`isSuperAdmin()`、`getCurrentCoachSession()`
- `app/auth/login/page.tsx`：统一登录页，根据 `user_metadata.role` 路由到管理端或门户端
- `app/api/auth/login/route.ts`：已废弃（返回 410），登录由客户端直接完成
- `app/api/auth/logout/route.ts`：调用 `supabase.auth.signOut()`

### `middleware.ts` 路由保护规则

基于 Supabase Auth Session + 角色的分区鉴权：

- publicPaths（放行）：`/auth/login`、`/auth/forgot-password`、`/api/player-share`、`/init`、`/_next`、`/favicon.ico`、`/player-share`
- `/`：需要 Supabase Session 且 `role === 'admin'`
- `/portal/*`：需要 Supabase Session 且非 admin（教练）
- `/events/*`、`/admin/*`：需要 `role === 'admin'`
- `/admin/project-management`：需要超级管理员（查询 `admin_users.is_super`）
- `/api/portal/*`：需要教练 Session
- `/api/project-management/*`：需要超级管理员
- 其他未匹配路由：重定向到 `/auth/login`

### 测试账号

- 超级管理员：`18140044662` / `admin123`、`13164550100` / `admin123`
- 教练：`13800000001` ~ `13800000005` / `user123`

## 时间与报名阶段

### 数据来源

- 赛事日期：`events.start_date` / `events.end_date`（date）
- 报名/审核时间：优先来自 `registration_settings.team_requirements`：
  - `registrationStartDate`（datetime-local 字符串）
  - `registrationEndDate`（datetime-local 字符串）
  - `reviewEndDate`（datetime-local 字符串）
- 代码中部分位置会 fallback 到 `events.registration_start_date` / `events.registration_end_date`

### 校验规则

1) 赛事时间（创建/编辑赛事）
- 规则：`start_date <= end_date`
- 实现：`app/events/create/page.tsx`、`components/event-manage/basic-info-tab.tsx`

2) 报名/审核时间（报名设置）
- 规则（都满足才算合理）：
  - 报名开始 < 报名结束
  - 报名结束 < 审核结束
  - 报名结束 < 比赛开始
  - 审核结束 < 比赛开始
- 实现：`components/event-manage/registration-settings-tab.tsx`（实时提示 + 保存时阻断）

### 报名阶段计算（用于列表/按钮状态）

- 管理端赛事列表：`components/event-list.tsx#getRegistrationStatus`
- 门户赛事列表：`app/portal/page.tsx#getRegistrationStatus`
- 门户赛事详情：`app/portal/events/[id]/page.tsx`（含审核期提示逻辑）

## 管理端 UI 增强功能

### YouTube Studio 风格赛事列表

管理端首页（`app/page.tsx` + `components/event-list.tsx`）采用 YouTube Studio 风格设计：

- **卡片式布局**：每个赛事显示为独立卡片
- **视觉层次**：
  - 海报图片（左侧，固定尺寸 160x120px）
  - 赛事信息（中间，多行布局）
  - 操作按钮（右侧，垂直排列）
- **状态指示器**：
  - 报名阶段 Badge（未开始/报名中/审核中/已结束）
  - 可见性开关（眼睛图标，实时切换）
- **快速操作**：
  - 管理赛事（跳转到详情页）
  - 删除赛事（带二次确认，需输入赛事名称）
- **三级筛选**：
  - 动态 Tab（根据赛事类型自动生成）
  - 搜索框（赛事名称/简称）
  - 报名状态筛选（全部/未开始/报名中/审核中/已结束）
- **分页控制**：支持 10/20/50 条/页

**实现位置**：
- 布局：`components/event-list.tsx`
- 数据获取：`app/page.tsx`
- 报名阶段计算：`components/event-list.tsx#getRegistrationStatus`

### 赛事类型细分选择

创建/编辑赛事时支持体育类型细分（`app/events/create/page.tsx`、`components/event-manage/basic-info-tab.tsx`）：

- **一级分类**：棍网球、足球、篮球、排球等
- **二级分类**：
  - 棍网球：男子棍网球、女子棍网球、混合棍网球
  - 其他运动：类似细分结构
- **UI 交互**：
  - 选择一级分类后显示二级选项
  - 支持"其他"选项并允许自定义输入

**数据结构**：
```ts
const eventTypes = {
  '棍网球': ['男子棍网球', '女子棍网球', '混合棍网球'],
  '足球': ['男子足球', '女子足球', '五人制足球'],
  // ...
}
```

## 门户端 UI 增强功能

### 可折叠侧边栏

门户布局（`app/portal/layout.tsx`）支持侧边栏折叠：

- **展开状态**（默认，宽度 208px）：
  - 显示完整菜单文本
  - 显示未读通知数量 Badge
  - Logo 显示 "棍网球报名系统"
- **折叠状态**（宽度 64px）：
  - 仅显示图标
  - Tooltip 提示菜单名称
  - Logo 显示 "报名"
- **切换按钮**：
  - 展开时：左箭头（ChevronLeft）
  - 折叠时：右箭头（ChevronRight）+ Tooltip

**状态管理**：
```ts
const [isCollapsed, setIsCollapsed] = useState(false)
```

**样式实现**：使用 Tailwind `transition-all duration-300` 实现平滑动画

### 通知系统增强

通知列表（`app/portal/my/notifications/page.tsx`）显示增强：

- **赛事名称显示**：通过 join `events` 表获取赛事名称
- **团队信息预览**：
  - 从 `registrations.team_data` 提取队伍名称
  - 显示前 3 个字段值作为预览
- **批量操作**：
  - 全部标记为已读（优先使用 RPC `mark_all_notifications_as_read`，失败则 fallback）
  - 单条标记已读
  - 删除通知

**数据查询**：
```sql
SELECT notifications.*,
       events.name as event_name,
       registrations.team_data
FROM notifications
LEFT JOIN registrations ON notifications.registration_id = registrations.id
LEFT JOIN events ON notifications.event_id = events.id
WHERE coach_id = $1
ORDER BY created_at DESC
```

### 身份证号验证

队员填写页面（`app/player-share/[token]/page.tsx`）支持身份证号字段验证：

- **格式校验**：
  - 必须 18 位
  - 前 17 位为数字
  - 第 18 位为数字或 X/x
- **实时提示**：输入时显示格式错误
- **实现位置**：`app/player-share/[token]/page.tsx` 第 166-186 行

### 链接自动识别

详情页面（`app/portal/events/[id]/page.tsx`）自动识别并转换文本中的链接：

- **识别模式**：`http://` 或 `https://` 开头的 URL
- **渲染方式**：转换为可点击的 `<a>` 标签
- **样式**：蓝色文字 + 下划线
- **行为**：新标签页打开（`target="_blank" rel="noopener noreferrer"`）

**实现位置**：
- 赛事详情字段
- 报名要求说明字段
- 使用 `LinkifyText` 组件

### 报名高亮显示

报名列表（`app/portal/my/registrations/page.tsx`）支持从通知跳转时高亮显示：

- **触发方式**：URL 参数 `?highlight=[registration_id]`
- **高亮效果**：黄色背景 + 边框
- **自动清除**：3 秒后自动移除高亮
- **用户体验**：从通知页面点击报名链接时，自动定位并高亮对应报名

## 动态表单（报名设置 → 门户渲染）

### 1) JSON 结构（当前代码使用的形态）

`registration_settings.team_requirements`：

```ts
type FieldConfig = {
  id: string
  label: string
  type: 'text' | 'image' | 'select' | 'multiselect' | 'date'
  required: boolean
  options?: string[]
  isCommon?: boolean
}

type TeamRequirements = {
  commonFields: FieldConfig[]
  customFields: FieldConfig[]
  allFields?: FieldConfig[]          // 字段顺序的“唯一来源”（含 isCommon）
  registrationStartDate?: string
  registrationEndDate?: string
  reviewEndDate?: string
}
```

`registration_settings.player_requirements`（精简示意）：

```ts
type RoleConfig = {
  id: string
  name: string
  commonFields?: FieldConfig[]
  customFields: FieldConfig[]
  allFields?: FieldConfig[]
  minPlayers?: number
  maxPlayers?: number
}

type PlayerRequirements = {
  roles: RoleConfig[]
  genderRequirement: 'none' | 'male' | 'female'
  ageRequirementEnabled: boolean
  minAgeDate?: string
  maxAgeDate?: string
  countRequirementEnabled: boolean
  minCount?: number
  maxCount?: number
}
```

> 兼容性：历史数据里 `team_requirements`/`player_requirements` 可能是 JSON 字符串，门户端/管理端均有 `JSON.parse` 兜底。

### 2) 管理端配置入口

- `components/event-manage/registration-settings-tab.tsx`
  - 支持拖拽排序（@dnd-kit）并维护 `allFields`
  - 支持常用字段与自定义字段
  - 报名时间必填：保存时要求 `registrationStartDate/registrationEndDate/reviewEndDate` 三者齐全

### 3) 门户渲染入口

- 报名页：`app/portal/events/[id]/register/page.tsx`
  - `react-hook-form` 动态生成队伍字段
  - 队员字段按角色渲染，并支持分享链接填写
- 队员分享页：`app/player-share/[token]/page.tsx`
  - 从 `/api/player-share/[token]` 拉取 event + settings，然后按字段校验必填项

### 4) 导出依赖字段配置

- `app/api/events/[id]/registrations/export/route.ts` 会读取 `registration_settings`，按 `allFields` 顺序导出列，并下载 image 字段打包到 zip。

## 报名状态机（存储型）

状态字段：`registrations.status`（DB CHECK 允许以下值）：

- `draft`：草稿（可编辑/可生成分享链接）
- `pending`：待审核（门户提交时主要写入此状态）
- `submitted`：待审核（历史/兼容状态，门户 UI 视同 pending）
- `approved`：已通过
- `rejected`：已驳回（可在报名期或审核期内重新提交）
- `cancelled`：已取消（门户支持取消；取消后在不同阶段是否可重提由前端逻辑决定）

实现集中在：

- 门户报名页保存/提交：`app/portal/events/[id]/register/page.tsx`
- 门户”我的报名”状态展示：`app/portal/my/registrations/page.tsx`
- 管理端审核：`app/api/registrations/[id]/review/route.ts`

## 审核功能增强

### 逐项审核模式

审核列表（`components/event-manage/review-list-tab.tsx`）支持逐项审核：

- **展开/折叠**：点击报名卡片展开详细信息
- **字段级审核**：
  - 显示所有队伍字段和队员字段
  - 每个字段旁边有”无误”/”需修改”按钮
  - 图片字段支持预览（点击放大）
  - 必填字段标记红色星号
- **审核状态保存**：
  - 切换报名时保留当前审核进度
  - 使用 `reviewStates` 状态管理
- **自动生成驳回理由**：
  - 基于标记为”需修改”的字段
  - 格式：`请修改以下信息：队伍名称、队员1-姓名、队员2-身份证号`
- **强制完整审核**：
  - 通过按钮要求所有字段都标记为”无误”
  - 驳回按钮允许部分字段标记为”需修改”
- **快速操作**：
  - 通过按钮（带确认对话框）
  - 驳回按钮（弹出原因输入框，可编辑自动生成的理由）

**实现位置**：`components/event-manage/review-list-tab.tsx`

### 报名状态高亮显示

报名列表（`components/event-manage/registration-list-tab.tsx`）支持状态高亮：

- **颜色编码**：
  - `draft`：灰色（草稿）
  - `pending/submitted`：黄色（待审核）
  - `approved`：绿色（已通过）
  - `rejected`：红色（已驳回）
  - `cancelled`：灰色删除线（已取消）
- **视觉提示**：
  - 左侧彩色边框（4px）
  - 状态 Badge
  - 悬停效果

**实现方式**：
```tsx
const statusColors = {
  draft: 'border-l-gray-400 bg-gray-50',
  pending: 'border-l-yellow-400 bg-yellow-50',
  approved: 'border-l-green-400 bg-green-50',
  rejected: 'border-l-red-400 bg-red-50',
  cancelled: 'border-l-gray-400 bg-gray-100 line-through'
}
```

## 取消报名提醒逻辑（门户）

取消报名按钮会根据**报名状态**与**是否仍处于报名期（<= registrationEndDate）**展示不同确认文案。

实现位置：
- `app/portal/events/[id]/page.tsx#handleCancelRegistration`
- `app/portal/my/registrations/page.tsx#handleCancelRegistration`

提示矩阵（与代码一致）：

| 状态 | 报名中期间 | 审核中期间 |
|---|---|---|
| `draft` | 可以重新提交 | 可以重新提交 |
| `pending/submitted` | 可以重新提交 | 无法重新提交 |
| `approved` | 可以重新提交 | 无法重新提交 |

> 需要保持两个页面的提示文案与判断一致；如果修改规则，务必同步改两处。

## 队员分享链接（公开填写）

### 表：`player_share_tokens`

代码实际使用的关键字段：

- `token`：唯一 token（用于 URL）
- `registration_id`：关联报名
- `event_id`：关联赛事
- `player_id`：队员唯一 ID（前端生成）
- `player_index`：队员在 `registrations.players_data` 中的索引（兼容）
- `expires_at`：过期时间（DB 默认 now + 7 days）
- `is_active`：是否有效
- `used_at`：使用时间（PUT 成功后写入）

### 生成与访问控制

- 生成链接：`app/portal/events/[id]/register/page.tsx`（会 insert 到 `player_share_tokens`）
  - 当前 token 格式：`Date.now() + Math.random()`（如要改为更安全的生成方式，建议迁移到服务端）
- 访问链接：`/player-share/[token]`（无需登录）
  - 访问前置条件（前端与 API 都会检查）：
    - 报名状态必须为 `draft` 或 `rejected`
    - 未超过 `reviewEndDate`（若未配置 reviewEndDate，则使用 registrationEndDate）

### API

- `GET /api/player-share/[token]`：获取 token + registration + event + settings（会把 `registration_settings` 合并到 event）
- `PUT /api/player-share/[token]`：更新队员信息到 `registrations.players_data`，并写入 `player_share_tokens.used_at`

## 文件上传与 Storage Bucket

本项目上传统一走服务端 API，并使用 **Service Role Key** 上传到 Storage（绕过 RLS）。

- 管理端上传（海报）：`POST /api/upload`（需要管理员会话）
  - 默认 bucket：`event-posters`
- 门户/分享页上传（队伍 logo、队员证件照、附件）：`POST /api/portal/upload`（需要教练会话）
  - 默认 bucket：`player-photos`

bucket 清单（部署时必须创建，否则会出现 Bucket not found）：
- `event-posters`
- `registration-files`
- `player-photos`
- `team-documents`

推荐脚本：`docs/sql/create-buckets-simple.sql`  
详细说明：`docs/STORAGE_SETUP.md`

## 通知系统（门户“我的通知”）

- 表：`notifications`
- 未读数量：`contexts/notification-context.tsx` 每 30s 轮询 count
- 通知列表：`app/portal/my/notifications/page.tsx`
  - 会 join `registrations`/`events` 补充展示信息
  - 标记已读：逐条 update；批量已读会尝试 RPC（`mark_all_notifications_as_read`），失败则 fallback to `update ... in (...)`

通知写入来源（两处可能同时存在，**需注意重复**）：
1. 数据库触发器：`registration_notification_trigger`（见 schema）
2. 管理端审核 API：`app/api/registrations/[id]/review/route.ts`（手动 insert notifications）

> **⚠️ 警告**：如果触发器和 API 都启用，同一审核操作可能产生重复通知。建议：
> - 方案A：仅使用触发器（删除 API 中的 insert 代码）
> - 方案B：仅使用 API 手动插入（禁用触发器）
> - 当前状态：两者都存在，可能导致重复（需要修复）

## 导出功能（管理员）

管理员可在”报名列表”勾选报名并导出（477行复杂实现）：

- 前端触发：`components/event-manage/registration-list-tab.tsx`
- 后端导出：`POST /api/events/[id]/registrations/export`（477行代码）
  - **多角色 Sheet 生成**：为每个角色（运动员/教练/裁判等）创建独立 sheet
  - **智能文件组织**：
    - 单队伍：扁平结构（字段文件夹/文件名）
    - 多队伍：分层结构（字段文件夹/队伍文件夹/文件名）
  - **Sheet 名称处理**：
    - 自动清理非法字符（`[:\\/?*\[\]]`）
    - 31字符长度限制（Excel 规范）
    - 重名自动追加后缀（-2, -3...）
  - **图片下载与打包**：
    - 并发下载所有 image 字段（使用 `Promise.allSettled`）
    - 按角色-字段名组织文件夹
    - 支持多种图片格式（jpg/png/gif/webp）
    - Content-Type fallback 机制
  - **输出格式**：
    - 无附件：`.xlsx`（多 sheet）
    - 有附件：`.zip`（xlsx + 图片文件夹）
  - 依赖：`xlsx`, `jszip`

**关键实现细节**：
- 队伍信息与各角色信息分别生成独立 sheet
- 序号格式：队伍序号-角色内序号（如 “1-3” 表示第1队第3个该角色成员）
- 文件名生成：优先使用队伍前三个非图片字段值组合
- 错误处理：使用 `Promise.allSettled` 确保部分图片失败不影响整体导出

## API 端点列表（以实际路由为准）

### 管理员相关（需要 `admin-session`）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth/login` | POST | 管理员登录（设置 admin-session） |
| `/api/auth/logout` | POST | 管理员退出（清除 admin-session） |
| `/api/events` | GET | 管理端赛事列表（含 registration_settings join） |
| `/api/events` | POST | 创建赛事 |
| `/api/events/[id]` | GET | 获取单个赛事 |
| `/api/events/[id]` | PUT | 更新赛事（body 直通 update） |
| `/api/events/[id]` | PATCH | 局部更新（例如 is_visible） |
| `/api/events/[id]` | DELETE | 删除赛事 |
| `/api/events/[id]/registration-settings` | GET | 获取报名设置 |
| `/api/events/[id]/registration-settings` | POST | 创建/更新报名设置 |
| `/api/events/[id]/registrations` | GET | 获取报名列表（默认排除 draft） |
| `/api/events/[id]/registrations` | POST | 管理员手动添加报名（直接 approved） |
| `/api/events/[id]/registrations/export` | POST | 导出报名（xlsx/zip） |
| `/api/registrations/[id]/review` | POST | 审核报名（approved/rejected）并写通知（需 service role） |
| `/api/upload` | POST | 上传图片到 Storage（需 service role） |

### 门户/教练相关（需要 Supabase Session）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/portal/events` | GET | 获取可见赛事列表（join settings） |
| `/api/portal/events/[id]` | GET | 获取赛事详情 + settings |
| `/api/portal/upload` | POST | 门户上传（需 service role） |

> 报名写入（registrations insert/update）当前主要发生在前端页面通过 Supabase 客户端直接操作数据库：`app/portal/events/[id]/register/page.tsx`。

### 公开（无需登录）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/init-admin` | GET | 初始化默认管理员（开发/调试用途；middleware 放行） |
| `/api/player-share/[token]` | GET | 获取分享 token 信息 |
| `/api/player-share/[token]` | PUT | 更新队员信息（带时间/状态检查） |

### 诊断（调试用途）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/test-connection` | GET | 测试 DB 连接/并发查询 |
| `/api/test-memfire` | GET | MemFire 连接诊断（详细日志） |
| `/api/test-optimized-portal` | GET | portal events join 查询诊断 |
| `/api/test-portal-simulation` | GET | portal N+1 查询模拟（对比性能） |
| `/api/test-env` | GET | 环境变量诊断（检查必需变量是否配置） |

## 环境变量

### 必需（本地 `.env.local` / 生产环境）

```bash
# Supabase / MemFire
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=...  # 代码主要使用这个

# 管理员 JWT
JWT_SECRET=...  # 建议 >= 32 字节随机字符串

# 仅服务端使用：service role（上传、审核写通知等）
SUPABASE_SERVICE_ROLE_KEY=...
```

### 可选/兼容

```bash
# 兼容：部分测试脚本/接口会读取 ANON_KEY，但主代码使用 PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Next.js metadataBase 使用（可选）
VERCEL_URL=...

# 文档中提到，但当前代码未引用
NEXT_PUBLIC_API_URL=...
```

## 测试账号（开发/调试）

- 管理员：`13800138000` / `admin123`（`GET /api/init-admin` 会创建或提示已存在）
- 教练：通过 `/auth/register` 注册（Supabase Auth 邮箱账号）

> 注意：`/auth/login` 与 `/test-login` 页面上仍显示“测试密码：password”，但实际默认密码为 `admin123`（见“已知不一致”）。

## 常见任务（修改指引）

### 1) 新增/调整报名字段类型

通常至少影响四处：
1. 管理端配置：`components/event-manage/registration-settings-tab.tsx`
2. 门户报名渲染：`app/portal/events/[id]/register/page.tsx`
3. 队员分享页渲染与校验：`app/player-share/[token]/page.tsx`
4. 导出：`app/api/events/[id]/registrations/export/route.ts`（列与附件下载）

### 2) 修改报名时间与阶段规则

影响点：
- 校验与保存拦截：`components/event-manage/registration-settings-tab.tsx`
- 门户列表/详情按钮文案与可操作性：`app/portal/page.tsx`、`app/portal/events/[id]/page.tsx`
- 管理端赛事列表报名阶段：`components/event-list.tsx`

### 3) 修改赛事类型

更新 `eventTypes`：
- `app/events/create/page.tsx`
- `components/event-manage/basic-info-tab.tsx`

### 4) 修改“取消报名”策略/文案

务必同步两处：
- `app/portal/events/[id]/page.tsx`
- `app/portal/my/registrations/page.tsx`

## 故障排查

### Bucket not found

原因：Storage bucket 未创建。  
解决：按 `docs/STORAGE_SETUP.md` 或执行 `docs/sql/create-buckets-simple.sql` 创建 4 个 bucket。

### 上传失败 / 500

常见原因：缺少 `SUPABASE_SERVICE_ROLE_KEY`（`/api/upload`、`/api/portal/upload`、`/api/registrations/[id]/review` 都需要）。

### 页面总是被重定向到 /auth/login

优先检查：
- `middleware.ts` 的 `publicPaths` 是否包含该页面前缀
- 路径是否落入 `/portal` 或 `/events` 等分区规则
- 教练 Supabase Session / 管理员 admin-session 是否存在

## 数据库变更流程（推荐）

1. 在 Supabase/MemFire Dashboard（SQL Editor）修改结构
2. 同步更新仓库中的 `docs/sql/actual-supabase-schema.sql`（导出最新 schema）
3. 视需要更新 `docs/sql/*.sql` 中的迁移脚本
4. 同步更新前端/后端类型：
   - `lib/types.ts`（以及页面内自定义 interface）

## 已知不一致（建议后续修复）

这些点会影响”文档/类型/运行表现”，但当前仓库代码确实如此：

1. `lib/types.ts` 与数据库不完全一致
   - **CRITICAL**: `Registration.status` 仅声明了 `pending|approved|rejected`，但实际 DB/业务包含 `draft/submitted/cancelled` 等
     - 修复方案：更新为 `'draft' | 'pending' | 'submitted' | 'approved' | 'rejected' | 'cancelled'`
     - 影响范围：所有报名状态判断逻辑
   - `Event.review_end_date` 在类型里存在，但 schema 中没有该列（代码有少量 fallback 逻辑）
   - **CRITICAL**: `TeamRequirements` 和 `PlayerRequirements` 类型定义完全过时
     - 当前类型使用旧的固定字段结构（logo/name/contact_person 等）
     - 实际代码使用动态字段结构（commonFields/customFields/allFields）
     - 修复方案：参考 “动态表单” 章节的 FieldConfig/TeamRequirements/PlayerRequirements 类型
     - 导致类型检查无法发现字段访问错误

2. `components/ui/badge.tsx` 缺少 `success` variant
   - 问题：多处业务代码使用 `variant: 'success'`（会 fallback 到 default 样式）
   - 影响位置：
     - `components/event-list.tsx`（报名阶段状态显示）
     - `app/portal/my/registrations/page.tsx`（报名状态显示）
     - 其他状态展示组件
   - 修复方案：在 badgeVariants 中添加 success variant：
     ```ts
     success: “border-transparent bg-green-100 text-green-800 hover:bg-green-100/80”
     ```

3. `/api/init-admin` 实际是 `GET`，但 `app/init/page.tsx` 使用 `POST` 调用（会失败）

4. `/test-login` 页面存在，但 `middleware.ts` 的兜底重定向会让它不可用（不在 publicPaths，也不属于 /portal 或 /events 分区）

5. `app/api/events/route.ts` 创建赛事时未写入 `requirements`（创建页表单有该字段，但 API 未持久化；后续可在编辑赛事时通过 PUT 更新）

6. `next.config.ts` 配置了 `eslint.ignoreDuringBuilds=true` 与 `typescript.ignoreBuildErrors=true`（生产构建不会因 lint/类型错误失败）

7. 通知系统可能存在重复写入
   - 数据库触发器（`registration_notification_trigger`）和审核 API（`/api/registrations/[id]/review`）都会写入通知
   - 可能导致同一审核操作产生两条通知
   - 建议选择一种方式并禁用另一种

8. 导出功能文档严重不足
   - 实际实现 477 行，包含复杂的多角色 sheet 生成、文件组织、错误处理
   - 文档仅描述为简单的 xlsx/zip 导出
   - 已在本文档中补充详细说明

9. 测试密码提示错误
   - `/auth/login` 和 `/test-login` 页面显示”测试密码：password”
   - 实际默认密码为 `admin123`（硬编码绕过）
   - 需要更新页面提示文案或删除硬编码绕过

