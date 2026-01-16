# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。目标是**如实反映当前仓库代码与数据库结构**，便于快速定位与修改。

> 约定：当本文档与实现不一致时，优先以 **代码** + `docs/sql/actual-supabase-schema.sql` 为准，并在“已知不一致”章节补充记录。

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

系统为“双认证”：

### 1) 管理员（JWT + Cookie）

- 登录入口：`/auth/login` 管理员 Tab
- 登录 API：`POST /api/auth/login`
  - 校验：`lib/auth.ts#verifyAdminLogin`（bcrypt 校验 + **临时 bypass：password === 'admin123'**）
  - 写入：`admin-session` cookie（JWT，默认 24 小时）
- API 保护：多数管理端 API 在 Route Handler 中调用 `getCurrentAdminSession()`

### 2) 教练（Supabase Auth + Cookie Session）

- 登录入口：`/auth/login` 教练 Tab（`supabase.auth.signInWithPassword`）
- 注册入口：`/auth/register`（`supabase.auth.signUp`，并写入 `coaches` 表）
- 门户与 `/api/portal/*` 依赖 Supabase Session（由 `middleware.ts` 检查）

### 3) `middleware.ts` 路由保护规则（非常重要）

`middleware.ts` 采用 **publicPaths 白名单 + 分区鉴权 + 兜底重定向**：

- publicPaths（放行）：`/auth/login`、`/auth/register`、`/auth/forgot-password`、`/api/auth/*`、`/api/init-admin`、`/api/player-share`、`/init`、`/_next`、`/favicon.ico`、`/player-share` 等
- `/`：必须有管理员 `admin-session`
- `/portal/*`：必须有教练 Supabase Session
- `/events/*`、`/admin/*`：必须有管理员 `admin-session`
- `/api/portal/*`：必须有教练 Supabase Session，否则返回 401 JSON
- 其他未匹配路由：重定向到 `/auth/login`

新增页面/接口时，若出现“页面被强制重定向到登录页”，优先检查 `publicPaths` 与这套匹配逻辑。

> 注意：middleware 内对管理员 token 的校验当前仅做 **JWT 结构 + exp** 检查，未验证签名；真正的签名验证发生在 `lib/auth.ts#verifyAdminSession`（API 路由中）。

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
- 门户“我的报名”状态展示：`app/portal/my/registrations/page.tsx`
- 管理端审核：`app/api/registrations/[id]/review/route.ts`

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

通知写入来源（两处可能同时存在，需注意重复）：
1. 数据库触发器：`registration_notification_trigger`（见 schema）
2. 管理端审核 API：`app/api/registrations/[id]/review/route.ts`（手动 insert notifications）

## 导出功能（管理员）

管理员可在“报名列表”勾选报名并导出：

- 前端触发：`components/event-manage/registration-list-tab.tsx`
- 后端导出：`POST /api/events/[id]/registrations/export`
  - 无附件：返回 `.xlsx`
  - 有附件（image 字段）：返回 `.zip`（xlsx + 按字段/队伍组织的图片文件夹）
  - 依赖：`xlsx`, `jszip`（`file-saver` 目前未在代码中使用）

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

这些点会影响“文档/类型/运行表现”，但当前仓库代码确实如此：

1. `lib/types.ts` 与数据库不完全一致  
   - `Registration.status` 仅声明了 `pending|approved|rejected`，但实际 DB/业务包含 `draft/submitted/cancelled` 等  
   - `Event.review_end_date` 在类型里存在，但 schema 中没有该列（代码有少量 fallback 逻辑）

2. `components/ui/badge.tsx` 不包含 `success` variant，但多处业务代码使用 `variant: 'success'`（实际 UI 可能显示不符合预期）

3. `/api/init-admin` 实际是 `GET`，但 `app/init/page.tsx` 使用 `POST` 调用（会失败）

4. `/test-login` 页面存在，但 `middleware.ts` 的兜底重定向会让它不可用（不在 publicPaths，也不属于 /portal 或 /events 分区）

5. `app/api/events/route.ts` 创建赛事时未写入 `requirements`（创建页表单有该字段，但 API 未持久化；后续可在编辑赛事时通过 PUT 更新）

6. `next.config.ts` 配置了 `eslint.ignoreDuringBuilds=true` 与 `typescript.ignoreBuildErrors=true`（生产构建不会因 lint/类型错误失败）

