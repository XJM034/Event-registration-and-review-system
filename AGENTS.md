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
- [账号管理](#账号管理管理员入口) ⭐ 新增
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
| 管理员认证 | `lib/auth.ts` | Supabase 客户端创建、管理员会话管理、JWT 验证 |
| 路由保护 | `middleware.ts` | 白名单 + 分区鉴权 |
| 类型定义 | `lib/types.ts` | **部分类型过时，需参考实际代码** |
| 导出功能 | `app/api/events/[id]/registrations/export/route.ts` | 报名压缩包导出（当前始终返回 zip） |
| 动态表单配置 | `components/event-manage/registration-settings-tab.tsx` | 拖拽排序 + 字段管理 |
| 门户报名页 | `app/portal/events/[id]/register/page.tsx` | 动态表单渲染 + 分享链接 |
| 安全排查 | `docs/md/security/privacy-security-checklist-2026-03-11.md` | 2026-03-11 隐私安全评测 + 无破坏优化记录 |
| 审计日志方案 | `docs/md/security/audit-log-guidance.md` | 审计日志要解决什么问题、记录哪些操作、哪些字段不能写 |
| 审计日志实现 | `lib/security-audit-log.ts` | best-effort 审计日志写入 + 元数据脱敏 |
| 审核列表 | `components/event-manage/review-list-tab.tsx` | 待审核报名列表，提供导航到审核详情页 |
| 审核详情 | `app/events/[id]/registrations/[registrationId]/review/page.tsx` | 按队伍/队员级审核 + 自动生成驳回理由 |
| 通知系统 | `contexts/notification-context.tsx` | 30s 轮询 + 未读计数 |
| 账号管理 | `app/admin/account-management/page.tsx` | 所有管理员可进入；超管可管理教练/管理员账号，普通管理员仅维护本人账号 |

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
│   ├── login/page.tsx             # 统一手机号登录页（管理员/教练共用）
│   ├── register/page.tsx          # 旧的邮箱注册页（存在，但当前不在主流程且被 middleware 拦截）
│   ├── forgot-password/page.tsx
│   ├── update-password/page.tsx   # 密码重置页（当前未加入 publicPaths）
│   ├── confirm/route.ts           # 邮箱 OTP 回调（模板；当前未加入 publicPaths）
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
│   ├── portal/registrations/[id]/share-links/route.ts
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
├── player-share-token.ts          # 分享 token 校验 + 公开响应最小化
├── rate-limit.ts                  # 应用层窗口限流（公开分享/导出/admin-session）
├── security-audit-log.ts          # 审计日志写入 + 元数据脱敏（best-effort）
├── security-random.ts             # 安全随机 ID/token 生成
├── supabase/
│   ├── client.ts                  # createBrowserClient
│   ├── service-role.ts            # createServiceRoleClient
│   ├── server.ts                  # createServerClient（cookies）
│   └── middleware.ts              # 模板的 updateSession（当前未在 middleware.ts 使用）
├── upload-file-validation.ts      # 上传扩展名/MIME/文件签名校验
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

- 登录入口：`/auth/login`（统一手机号登录页，无 Tab 切换）
- 初始认证：`app/auth/login/page.tsx` 先使用**非持久化** Supabase 客户端执行 `supabase.auth.signInWithPassword`
- 账号格式：手机号作为用户名，内部转换为 `手机号@system.local` 邮箱格式
- 角色区分：`auth.users.raw_user_meta_data.role`（`admin` 或 `coach`）
- 超级管理员：`auth.users.raw_user_meta_data.is_super` + `admin_users.is_super`
- 初始账号创建：主要通过 SQL 脚本写入 `auth.users`（见 `docs/sql/create-auth-accounts.sql`）
- 运营期账号创建：超级管理员可在 `/admin/account-management` 中继续创建教练/管理员账号
- 自动同步：`handle_new_user()` 触发器在 `auth.users` 插入时自动创建 `admin_users` 或 `coaches` 记录
- 遗留认证页面：`/auth/register`、`/auth/update-password`、`/auth/confirm` 仍在仓库中，但当前不在 `middleware.ts` 的 `publicPaths` 内，不属于主流程

### 关键实现文件

- `lib/auth.ts`：`createSupabaseServer()`、`getCurrentAdminSession()`、`isSuperAdmin()`、`getCurrentCoachSession()`
- `app/auth/login/page.tsx`：统一登录页；管理员创建旁路 admin-session，教练持久化 Supabase session
- `app/api/auth/login/route.ts`：已废弃（返回 410），登录由客户端直接完成
- `app/api/auth/logout/route.ts`：调用 `supabase.auth.signOut()` 并清理管理员相关 cookie

### 双会话机制（Supabase Auth + Admin JWT）

系统采用**双会话架构**来支持管理员和教练的统一认证：

#### 工作流程

1. **用户登录** (`/auth/login`)
   - 客户端调用 `supabase.auth.signInWithPassword(手机号@system.local, 密码)`
   - 这里使用的是**非持久化**登录客户端，返回的 session 不会直接写入浏览器共享 cookie

2. **管理员会话创建** (仅管理员)
   - 登录成功后，如果 `user_metadata.role === 'admin'`
   - 客户端把本次登录得到的 `access_token` 作为 Bearer token 调用 `POST /api/auth/admin-session`
   - 服务端解析 Bearer token，生成管理员 JWT
   - 浏览器保存三份管理员会话状态：
     - `admin-session`：HttpOnly cookie
     - `admin-session-tab`：会话级可读 cookie
     - `sessionStorage.tab_admin_session_token`：标签页级 token

3. **教练会话持久化** (仅教练)
   - 登录成功后，客户端调用 `browserClient.auth.setSession(...)`
   - 由浏览器 Supabase 客户端持久化教练的 session/cookie

4. **后续请求验证**
   - **教练请求**：通过 `lib/auth.ts#getCurrentCoachSession()` 读取 Supabase session
   - **管理员请求**：优先通过 `lib/auth.ts#getCurrentAdminSession()` 验证管理员 JWT；必要时才 fallback 到 Supabase session

#### 相关 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/admin-session` | POST | 创建管理员会话（验证 Supabase session → 生成 JWT，带应用层限流 + 审计日志） |
| `/api/auth/admin-session` | DELETE | 删除管理员会话（清除 admin-session cookie） |
| `/api/auth/admin-session` | GET | 获取当前管理员会话信息 |
| `/api/auth/admin-session` | PUT | 刷新管理员会话（延长 JWT 有效期） |

#### 为什么需要双会话？

- **Supabase Auth Session**：提供统一的用户认证和数据库 RLS 支持
- **Admin JWT Token**：提供额外的管理员权限控制和会话管理灵活性
- **安全隔离**：管理员和教练使用不同的会话验证机制，降低权限提升风险

### `middleware.ts` 路由保护规则

基于 Supabase Auth Session + 角色的分区鉴权：

- publicPaths（放行）：`/auth/login`、`/auth/forgot-password`、`/api/player-share`、`/init`、`/_next`、`/favicon.ico`、`/player-share`
- `/`：根据当前登录态重定向到 `/events`、`/portal` 或 `/auth/login`
- `/portal/*`：需要 Supabase Session 且非 admin（教练）
- `/events/*`、`/admin/*`：需要 `role === 'admin'`
- `/admin/project-management`：需要超级管理员（查询 `admin_users.is_super`）
- `/admin/account-management`：任意管理员都可进入；普通管理员只会看到“我的账号”Tab
- `/api/portal/*`：需要教练 Session
- `/api/project-management/*`：需要超级管理员
- `/api/admin/coaches*`、`/api/admin/admins*`：需要超级管理员
- 生产环境：`/api/debug/*`、`/api/test-*` 由 `middleware.ts` 直接返回 404
- 其他未匹配路由：重定向到 `/auth/login`

### 测试账号

**当前联调稳定账号**（用户确认不会变动）：
- 超级管理员：`18140044662` / `000000`
- 普通管理员：`15196653658` / `000000`
- 教练：`13800000001` / `000000`

**仓库 SQL 默认账号**（仅适用于执行初始化脚本后的全新环境）：
- 超级管理员：`18140044662` / `admin123`
- 超级管理员：`13164550100` / `admin123`
- 教练：`13800000001` ~ `13800000005` / `user123`

> 详细说明见 [测试账号（开发/调试）](#测试账号开发调试) 章节

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

- **桌面端**：
  - 宽度在 `200px` 和 `64px` 间切换
  - 折叠状态写入 `localStorage`（`portal_sidebar_collapsed`）
- **平板端**：
  - 使用独立的 `tabletPinnedExpanded` 状态
  - 可临时展开，不和桌面端折叠偏好共享
- **移动端**：
  - 使用覆盖式侧边菜单（`mobileMenuOpen`）
- **交互细节**：
  - 折叠态菜单项显示 Tooltip
  - 切换按钮使用 `PanelLeftOpen` / `PanelLeftClose`
  - 未读通知数量直接显示在“我的通知”菜单项上

### 通知系统增强

通知列表（`app/portal/my/notifications/page.tsx`）显示增强：

- **赛事名称显示**：通过 join `events` 表获取赛事名称
- **团队信息预览**：
  - 从 `registrations.team_data` 提取队伍名称
  - 显示前 3 个字段值作为预览
- **批量操作**：
  - 全部标记为已读（依次尝试 `simple_mark_all_read`、`mark_all_notifications_as_read`、批量 update、逐条 update）
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
- **校验位校验**：会继续校验身份证最后一位校验码
- **赛事组别约束**：同时复用 `lib/id-card-validator.ts` 做年龄/性别/组别规则校验
- **实时提示**：输入时显示格式错误或校验通过提示

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

### 审核列表（`components/event-manage/review-list-tab.tsx`）

审核列表页当前只展示 **`status=pending` 的待审核报名**，并提供导航与导出功能：

- **列表展示**：根据 `registration_settings.team_requirements` 的动态字段显示队伍摘要和提交时间
- **快速操作**：提供“审核”按钮跳转到审核详情页
- **批量选择**：支持勾选多条待审核报名
- **导出入口**：可直接弹出导出配置对话框，导出当前列表或选中报名
- **当前未实现**：没有内建的“待审核/已通过/已驳回”状态筛选器

**实现位置**：`components/event-manage/review-list-tab.tsx`

### 队伍/队员审核页（`app/events/[id]/registrations/[registrationId]/review/page.tsx`）

审核详情页支持按**队伍整体**和**单个队员**进行审核：

- **渲染内容**：
  - 显示所有队伍字段和按角色分组的队员字段
  - 图片字段支持放大预览，附件支持预览/下载；为兼容敏感 bucket 私有化后的历史数据，页面会把旧 public storage URL 和相对路径在渲染时统一转换为 `/api/storage/object`
  - 证件号码字段在管理端详情/审核页当前直接显示完整值，不再提供页面级脱敏切换，优先减少审核端理解成本
- **审核粒度**：
  - 队伍信息对应一个 `team` 审核状态
  - 每个队员对应一个 `player_${index}` 审核状态
  - 不是“每个字段一个审核状态”
- **审核操作**：
  - 每个审核单元都可标记“无误”或“需修改”
  - 标记“需修改”后可填写备注
- **自动生成驳回理由**：
  - 基于队伍备注 + 各队员备注拼接
  - 若手动填写了驳回理由，则以手填内容为准
- **当前实现限制**：
  - “通过”按钮**不会**强制要求所有审核单元都先标记为“无误”
  - 页面内审核状态只保存在当前页面 state，不会单独持久化
- **快速操作**：
  - 通过按钮直接提交审核
  - 驳回按钮要求存在手填或自动生成的理由

**实现位置**：`app/events/[id]/registrations/[registrationId]/review/page.tsx`

### 报名列表（已通过）

报名列表（`components/event-manage/registration-list-tab.tsx`）当前对应 **已通过审核** 的报名：

- **数据范围**：请求 `/api/events/[id]/registrations?status=approved`
- **列表能力**：
  - 动态队伍字段列展示
  - 勾选导出
  - 查看详情
  - 从“已通过”列表直接驳回
  - 管理员手动新增一条已通过报名
- **当前未实现**：没有状态颜色映射或多状态高亮逻辑

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

- 生成链接：`app/portal/events/[id]/register/page.tsx`
  - 当前改为调用 `POST /api/portal/registrations/[id]/share-links`
  - 由服务端使用 **Service Role** 更新 `registrations.players_data`、失效旧 token、写入新 token
  - 当前使用 `lib/security-random.ts#generateSecureId('share')` 生成不可预测 token
- 教练端同步分享填写结果：
  - 报名页每 5 秒调用 `GET /api/portal/registrations/[id]/share-links`
  - 服务端仅返回最小化的已填写 token 摘要，前端按 `player_id/player_index` 合并回 `players_data`
- 访问链接：`/player-share/[token]`（无需登录）
  - 访问前置条件（前端与 API 都会检查）：
    - 报名状态必须为 `draft` 或 `rejected`
    - 未超过 `reviewEndDate`（若未配置 reviewEndDate，则使用 registrationEndDate）
  - API 当前使用 **Service Role** 在服务端按 token 精确读取/更新，不再依赖匿名端直接访问 `player_share_tokens`
  - `PUT` 成功后会同时写入 `player_share_tokens.player_data / is_filled / filled_at / used_at`，供教练端同步状态
  - `GET / PUT /upload` 公开分享入口现已接入 best-effort 审计日志，且日志中只记录截断后的 token 摘要，不落完整 token

### API

- `GET /api/portal/registrations/[id]/share-links`：获取当前教练名下报名的已填写分享链接最小摘要（`no-store`）
- `POST /api/portal/registrations/[id]/share-links`：生成单个队员分享链接（服务端受控）
- `GET /api/player-share/[token]`：获取最小公开数据集（token 摘要 + registration 摘要 + event/settings + 当前分享对象），并返回 `Cache-Control: no-store`，带审计日志
- `PUT /api/player-share/[token]`：更新队员信息到 `registrations.players_data`，并写入 `player_share_tokens.player_data / is_filled / filled_at / used_at`，带审计日志
- 公开分享相关接口已加入应用层窗口限流（单实例内存型）：`GET/PUT /api/player-share/[token]`、`POST /api/player-share/[token]/upload`、带 `share_token` 的 `GET /api/storage/object`

## 文件上传与 Storage Bucket

本项目上传统一走服务端 API，并使用 **Service Role Key** 上传到 Storage（绕过 RLS）。

- 管理端上传：`POST /api/upload`（需要管理员会话）
  - 默认 bucket：`event-posters`
  - 上传前会做扩展名 + MIME + magic bytes 校验
  - 同一路由还支持 `DELETE /api/upload` 删除已上传文件
- 门户上传：`POST /api/portal/upload`（需要教练会话）
  - 默认 bucket：`player-photos`
  - 也允许显式上传到 `registration-files`、`team-documents`
  - 当前已与管理端对齐为扩展名 + MIME + magic bytes 校验
- 队员分享页上传：`POST /api/player-share/[token]/upload`
  - 使用 share token + Service Role 受控上传，当前仅允许 `player-photos`
- 当前上传/删除失败响应已改为通用错误，不再把底层 Storage 错误明文返回前端
- 上传成功后：
  - `event-posters` 仍返回 public URL
  - `registration-files`、`player-photos`、`team-documents` 返回 `/api/storage/object` 受控访问 URL
- 管理端报名详情页、审核页对历史图片/附件值做了兼容：
  - 若数据库里仍是旧的 `/storage/v1/object/public/...` URL，会在前端渲染时自动改写为 `/api/storage/object`
  - 若历史值仅保存了相对路径，会按字段上下文回填 bucket（如 `team_logo -> registration-files`、队员证件照 -> `player-photos`）
- 带 `share_token` 的 `/api/storage/object` 公开读取已增加应用层窗口限流，避免公开分享页图片/附件被高频刷取
- 目标 MemFire 环境当前 bucket 状态：
  - `event-posters`：public
  - `registration-files` / `player-photos` / `team-documents`：private

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
  - 标记已读：逐条 update
  - 批量已读：先尝试 `simple_mark_all_read`，再尝试 `mark_all_notifications_as_read`，最后 fallback 到批量/逐条 update

通知写入来源（两处可能同时存在，**需注意重复**）：
1. 数据库触发器：`registration_notification_trigger`（见 schema）
2. 管理端审核 API：`app/api/registrations/[id]/review/route.ts`（手动 insert notifications）

> **⚠️ 警告**：如果触发器和 API 都启用，同一审核操作可能产生重复通知。建议：
> - 方案A：仅使用触发器（删除 API 中的 insert 代码）
> - 方案B：仅使用 API 手动插入（禁用触发器）
> - 当前状态：两者都存在，可能导致重复（需要修复）

## 导出功能（管理员）

管理员当前可在“审核列表”和“报名列表（已通过）”中勾选报名并导出：

- 前端触发：
  - `components/event-manage/review-list-tab.tsx`
  - `components/event-manage/registration-list-tab.tsx`
- 后端导出：`POST /api/events/[id]/registrations/export`
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
    - **当前始终返回 `.zip`**
    - zip 内部包含每支队伍的 `.xlsx` 和附件目录
  - 依赖：`xlsx`, `jszip`

**关键实现细节**：
- 每支队伍会生成 1 个工作簿；队伍信息与各角色信息分别生成独立 sheet
- 序号格式：队伍序号-角色内序号（如 “1-3” 表示第1队第3个该角色成员）
- 文件名生成：优先使用队伍前三个非图片字段值组合
- 错误处理：使用 `Promise.allSettled` 确保部分图片失败不影响整体导出

## 账号管理（管理员入口）

账号管理页面对**所有管理员**开放，但只有超级管理员拥有完整的账号运维能力。

### 访问控制

- **路由保护**：`/admin/account-management` 任意管理员可访问
- **API 保护**：所有 `/api/admin/coaches` 和 `/api/admin/admins` 端点需要超级管理员权限
- **菜单显示**：账号管理菜单项对所有管理员显示
- **Tab 能力**：
  - 超级管理员：`教练账号`、`管理员账号`、`我的账号`
  - 普通管理员：仅 `我的账号`

### 我的账号

**功能位置**：`/admin/account-management` → 我的账号 Tab

**核心功能**：
- 查看当前管理员基础信息
- 修改当前管理员密码

**实现文件**：
- 页面：`app/admin/account-management/page.tsx`
- API：`app/api/admin/me/route.ts`
- **当前安全状态**：`PUT /api/admin/me` 已接入 best-effort 审计日志；修改密码失败时返回通用错误，不再把底层 Auth 错误明文返回前端

### 教练账号管理

**功能位置**：`/admin/account-management` → 教练账号 Tab

**核心功能**：
- **列表展示**：显示所有教练账号，支持搜索（手机号/姓名/学校）和分页
- **创建账号**：使用 Supabase Admin API 创建教练账号
  - 手机号（11位，自动转换为 `phone@system.local` 邮箱格式）
  - 默认密码（最少6位）
  - 姓名、学校、机构（可选）
- **编辑信息**：更新教练的姓名、学校、机构、备注
- **重置密码**：使用 Admin API 重置教练密码
- **启用/禁用**：通过 `ban_duration` 控制账号状态
- **删除账号**：智能删除保护
  - 阻止删除有活跃报名的教练（pending/submitted/approved）
  - 阻止删除有未结束赛事的被驳回报名的教练
  - 自动清理草稿和已取消的报名

**实现文件**：
- 页面：`app/admin/account-management/page.tsx`
- 组件：`components/account-management/coaches-tab.tsx`
- API：`app/api/admin/coaches/route.ts`、`app/api/admin/coaches/[id]/route.ts`
- **当前安全状态**：服务端二次校验超级管理员权限；创建/编辑/启停/删除/重置密码/批量导入/批量启停均已接入 best-effort 审计日志；认证失败不再把底层 Auth 错误明文返回前端

### 管理员账号管理

**功能位置**：`/admin/account-management` → 管理员账号 Tab（仅超级管理员可见）

**核心功能**：
- **列表展示**：显示所有管理员账号，支持搜索（手机号/邮箱）和分页
- **创建账号**：使用 Supabase Admin API 创建管理员账号
  - 手机号（11位）
  - 默认密码（最少6位）
  - 是否超级管理员（Checkbox）
- **权限管理**：切换超级管理员/普通管理员权限
- **重置密码**：使用 Admin API 重置管理员密码
- **删除账号**：安全删除保护
  - 不能删除自己
  - 不能删除最后一个超级管理员
  - 检查是否有审核记录

**实现文件**：
- 组件：`components/account-management/admins-tab.tsx`
- API：`app/api/admin/admins/route.ts`、`app/api/admin/admins/[id]/route.ts`
- **当前安全状态**：服务端二次校验超级管理员权限；创建/更新/删除/重置密码均已接入 best-effort 审计日志；认证失败不再把底层 Auth 错误明文返回前端

### 技术实现

**Supabase Admin API**：
```typescript
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// 创建用户
await supabaseAdmin.auth.admin.createUser({
  email: `${phone}@system.local`,
  password: password,
  email_confirm: true,
  user_metadata: {
    role: 'coach', // 或 'admin'
    phone: phone,
    // ... 其他字段
  }
})

// 重置密码
await supabaseAdmin.auth.admin.updateUserById(authId, { password })

// 启用/禁用账号
await supabaseAdmin.auth.admin.updateUserById(authId, {
  ban_duration: '876000h' // 禁用
  // 或 ban_duration: 'none' // 启用
})

// 删除用户
await supabaseAdmin.auth.admin.deleteUser(authId)
```

**账号同步**：
- 数据库触发器 `handle_new_user()` 自动同步 `auth.users` 到 `admin_users` 或 `coaches` 表
- 创建账号后触发器自动创建对应的业务表记录

**数据库字段**（`coaches` 表）：
- `is_active`：账号是否启用
- `created_by`：创建者（管理员 ID）
- `last_login_at`：最后登录时间
- `notes`：备注信息

## API 端点列表（以实际路由为准）

### 管理员相关（需要 `admin-session`）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/auth/admin-session` | POST | 创建管理员会话（验证 Supabase session → 生成 JWT，带应用层限流 + 审计日志） |
| `/api/auth/admin-session` | DELETE | 删除管理员会话（清除 admin-session cookie） |
| `/api/auth/admin-session` | GET | 获取当前管理员会话信息 |
| `/api/auth/admin-session` | PUT | 刷新管理员会话（延长 JWT 有效期） |
| `/api/auth/login` | POST | ~~管理员登录~~ **已废弃（返回 410）**，请使用客户端 Supabase Auth + `/api/auth/admin-session` |
| `/api/auth/logout` | POST | 退出 Supabase 登录态并清理管理员相关 cookie |
| `/api/admin/me` | GET | 获取当前管理员用户信息（`no-store`） |
| `/api/admin/me` | PUT | 更新当前管理员密码（`no-store`，带审计日志，错误脱敏） |
| `/api/admin/current` | GET | 获取当前管理员会话信息 |
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
| `/api/events/[id]/registrations/export` | POST | 导出报名压缩包（当前始终返回 zip，带应用层限流 + 审计日志） |
| `/api/events/[id]/divisions` | GET | 获取赛事分组 |
| `/api/events/[id]/divisions` | PUT | 更新赛事分组 |
| `/api/registrations/[id]` | GET | 获取单个报名记录（管理员，`no-store`，带审计日志） |
| `/api/registrations/[id]/review` | POST | 审核报名（approved/rejected）并写通知（需 service role，带审计日志） |
| `/api/upload` | POST | 上传图片/附件到 Storage（需 service role） |
| `/api/upload` | DELETE | 删除已上传文件（需管理员会话） |
| `/api/admin/coaches` | GET | 列出所有教练（支持搜索、分页）（需超级管理员） |
| `/api/admin/coaches` | POST | 创建教练账号（需超级管理员，带审计日志） |
| `/api/admin/coaches/[id]` | PUT | 更新教练信息（需超级管理员，带审计日志） |
| `/api/admin/coaches/[id]` | PATCH | 启用/禁用教练账号（需超级管理员，带审计日志） |
| `/api/admin/coaches/[id]` | DELETE | 删除教练账号（需超级管理员，带审计日志） |
| `/api/admin/coaches/[id]/reset-password` | POST | 重置教练密码（需超级管理员，带审计日志） |
| `/api/admin/coaches/batch-status` | PATCH | 按筛选条件批量启用/禁用教练账号（需超级管理员，带审计日志） |
| `/api/admin/coaches/import` | POST | 从 Excel 批量导入教练账号（需超级管理员，带审计日志） |
| `/api/admin/admins` | GET | 列出所有管理员（需超级管理员） |
| `/api/admin/admins` | POST | 创建管理员账号（需超级管理员，带审计日志） |
| `/api/admin/admins/[id]` | PUT | 更新管理员权限（需超级管理员，带审计日志） |
| `/api/admin/admins/[id]` | DELETE | 删除管理员账号（需超级管理员，带审计日志） |
| `/api/admin/admins/[id]/reset-password` | POST | 重置管理员密码（需超级管理员，带审计日志） |

### 项目管理相关（需要超级管理员）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/project-management/types` | GET | 列出所有项目类型 |
| `/api/project-management/types` | POST | 创建项目类型 |
| `/api/project-management/types/[id]` | PUT | 更新项目类型 |
| `/api/project-management/types/[id]` | DELETE | 删除项目类型 |
| `/api/project-management/types/[id]` | PATCH | 局部更新项目类型（启用/禁用、排序等） |
| `/api/project-management/projects` | GET | 列出所有项目 |
| `/api/project-management/projects` | POST | 创建项目 |
| `/api/project-management/projects/[id]` | PUT | 更新项目 |
| `/api/project-management/projects/[id]` | DELETE | 删除项目 |
| `/api/project-management/projects/[id]` | PATCH | 局部更新项目（启用/禁用、排序等） |
| `/api/project-management/divisions` | GET | 列出所有分组 |
| `/api/project-management/divisions` | POST | 创建分组 |
| `/api/project-management/divisions/[id]` | PUT | 更新分组 |
| `/api/project-management/divisions/[id]` | DELETE | 删除分组 |
| `/api/project-management/divisions/[id]` | PATCH | 局部更新分组（启用/禁用、排序等） |

### 文档模板相关

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/document-templates/base` | GET | 下载基础模板文件 |
| `/api/events/[id]/registration-settings/template-preview` | POST | 预览报名模板（失败错误脱敏） |

### 门户/教练相关（需要 Supabase Session）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/portal/events` | GET | 获取可见赛事列表（join settings） |
| `/api/portal/events/[id]` | GET | 获取赛事详情 + settings |
| `/api/portal/upload` | POST | 门户上传（需 service role） |
| `/api/storage/object` | GET | 受控读取私有 Storage 文件（管理员/教练/share token；share token 访问带应用层限流；显式下载带审计日志） |
| `/api/portal/registrations/[id]/share-links` | GET | 获取当前教练报名下已填写的分享链接摘要（`no-store`） |
| `/api/portal/registrations/[id]/share-links` | POST | 生成队员分享链接（服务端受控） |
| `/api/portal/registrations/[id]/template-export` | GET | 导出报名为 PDF（教练端，失败错误脱敏） |

> 报名写入（registrations insert/update）当前主要发生在前端页面通过 Supabase 客户端直接操作数据库：`app/portal/events/[id]/register/page.tsx`。

### 公开（无需登录）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/init-admin` | GET | 仅开发/非生产可用；返回脱敏管理员列表并提示改用 SQL 脚本，不会真正初始化账号 |
| `/api/player-share/[token]` | GET | 获取分享 token 最小公开数据集（`no-store`，带应用层限流 + 审计日志） |
| `/api/player-share/[token]/upload` | POST | 公开分享页上传队员照片（受控上传到 `player-photos`，带应用层限流 + 审计日志） |
| `/api/player-share/[token]` | PUT | 更新队员信息（带时间/状态检查，带应用层限流 + 审计日志） |

### 诊断（调试用途，生产环境由 middleware 返回 404）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/test-connection` | GET | 测试 DB 连接/并发查询 |
| `/api/test-memfire` | GET | MemFire 连接诊断（详细日志） |
| `/api/test-optimized-portal` | GET | portal events join 查询诊断 |
| `/api/test-portal-simulation` | GET | portal N+1 查询模拟（对比性能） |
| `/api/test-env` | GET | 环境变量诊断（检查必需变量是否配置） |
| `/api/debug/check-role-mismatch` | GET | 检查角色配置不匹配 |
| `/api/debug/event-settings/[id]` | GET | 调试赛事设置 |
| `/api/debug/registration/[id]` | GET | 调试报名数据 |
| `/api/debug/registrations/[id]` | GET | 调试报名列表数据 |

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

### 当前联调稳定账号（不会变动）

以下账号密码由当前测试环境维护，可优先用于手工测试：

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| **超级管理员** | `18140044662` | `000000` | 完整权限，包括账号管理 |
| **普通管理员** | `15196653658` | `000000` | 管理端常规权限 |
| **教练** | `13800000001` | `000000` | 门户端权限 |

### 仓库初始化默认账号

以下账号来自 `docs/sql/create-auth-accounts.sql`，仅适用于执行初始化脚本后的全新环境：

| 角色 | 账号 | 密码 | 说明 |
|------|------|------|------|
| **超级管理员** | `18140044662` | `admin123` | SQL 初始化默认账号 |
| **超级管理员** | `13164550100` | `admin123` | SQL 初始化默认账号 |
| **教练** | `13800000001` | `user123` | SQL 初始化默认账号 |

### 其他测试账号

- 通过超级管理员在 `/admin/account-management` 创建账号或重置密码后，实际测试环境中的口令可能会变动
- `13800000002` ~ `13800000005` 仍是 SQL 初始化脚本中的默认教练账号，默认密码 `user123`
- `/auth/login` 页面底部当前仍展示“默认密码：admin123（管理员）/ user123（教练）”，这只是 SQL 初始化默认口令提示，不代表当前联调环境口令
- `/auth/register` 页面虽然存在，但当前未加入 `middleware.ts` 的 `publicPaths`，不应视为可用注册入口

### 重要提示

1. **账号管理功能**：超级管理员可在管理端创建/编辑/删除教练和管理员账号
2. **密码重置**：超级管理员可重置任何账号的密码
3. **测试环境**：以上账号仅用于开发和测试环境，生产环境必须更改
4. **账号格式**：手机号作为用户名，系统内部转换为 `手机号@system.local` 邮箱格式

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

## 文档管理指南

### 文档组织原则

项目文档按使用频率和重要性分为两个层级：

1. **根目录文档**（3个核心文档）
   - 只放高频使用、必须显眼的核心文档
   - 这些文档是项目的"门面"，新成员首先看到的内容
   - 保持简洁，便于快速定位

2. **docs/ 目录**（详细文档、专项文档）
   - 存放所有详细文档、历史文档、专项文档
   - 按功能分类组织，便于维护和查找

### 根目录文档（必须保留）

| 文件 | 作用 | 更新频率 |
|------|------|----------|
| `README.md` | 项目说明与快速开始指南 | 低（仅在项目结构变化时） |
| `CLAUDE.md` | Claude Code 工作指南（本文档） | 中（功能更新时同步） |
| `SECURITY.md` | 安全配置说明与检查清单 | 低（安全策略变化时） |

**重要**：不要在根目录添加其他 .md 文件，所有新文档都应放在 `docs/` 目录中。

### docs/ 目录结构

```
docs/
├── md/                          # Markdown 文档集合
│   ├── archive/                 # 历史文档（已完成的开发计划、过时的指南）
│   ├── troubleshooting/         # 故障排查指南
│   ├── security/                # 详细安全文档
│   └── [其他分类]/              # 根据需要创建新分类
├── sql/                         # SQL 脚本
├── README.md                    # 文档索引（必须维护）
├── STORAGE_SETUP.md             # Storage 配置指南
└── [其他专项文档].md            # 技术专项文档
```

### 新建文档的位置选择

根据文档类型选择合适的位置：

| 文档类型 | 存放位置 | 示例 |
|---------|---------|------|
| **功能开发计划** | `docs/md/archive/` | `feature-name-development-plan.md` |
| **功能验证指南** | `docs/md/troubleshooting/` | `feature-name-verification.md` |
| **安全审计报告** | `docs/md/security/` | `security-audit-YYYY-MM-DD.md` |
| **故障排查指南** | `docs/md/troubleshooting/` | `issue-name-troubleshooting.md` |
| **技术方案设计** | `docs/` | `FEATURE_NAME_DESIGN.md` |
| **数据库迁移说明** | `docs/` | `DATABASE_MIGRATION_*.md` |
| **API 文档** | `docs/` | `API_DOCUMENTATION.md` |
| **部署指南** | `docs/` | `DEPLOYMENT_GUIDE.md` |

### 文档命名规范

1. **根目录文档**：使用大写 + 下划线
   - `README.md`、`CLAUDE.md`、`SECURITY.md`

2. **docs/ 目录下的专项文档**：使用大写 + 下划线
   - `STORAGE_SETUP.md`、`API_DOCUMENTATION.md`

3. **docs/md/ 目录下的文档**：使用小写 + 连字符
   - `feature-name-plan.md`、`troubleshooting-guide.md`

4. **包含日期的文档**：使用 ISO 8601 格式
   - `security-audit-2026-03-09.md`、`migration-guide-2026-03.md`

### 何时创建新文档

#### 必须创建文档的情况

1. **新功能开发**
   - 创建开发计划文档（`docs/md/archive/`）
   - 功能完成后标记为"已完成"并归档

2. **重大架构变更**
   - 创建设计文档（`docs/`）
   - 说明变更原因、方案对比、实施步骤

3. **安全审计**
   - 创建审计报告（`docs/md/security/`）
   - 记录发现的问题和修复建议

4. **故障排查**
   - 创建排查指南（`docs/md/troubleshooting/`）
   - 记录问题现象、原因分析、解决方案

5. **数据库迁移**
   - 创建迁移说明（`docs/`）
   - 记录迁移步骤、回滚方案、注意事项

#### 不需要创建新文档的情况

1. **小型 bug 修复**：在 git commit 中说明即可
2. **代码重构**：在 git commit 中说明即可
3. **依赖更新**：在 git commit 中说明即可
4. **临时调试**：不要创建文档

### 文档更新流程

#### 更新 CLAUDE.md（本文档）

**何时更新**：
- 新增核心功能模块
- 修改数据库结构
- 新增/修改 API 端点
- 修改认证机制
- 修改路由保护规则
- 发现文档与代码不一致

**更新步骤**：
1. 定位到相关章节
2. 更新内容（保持与代码一致）
3. 更新"文档审计报告"章节的更新日期
4. 如有重大变更，在 git commit 中说明

#### 更新 docs/README.md（文档索引）

**何时更新**：
- 新增文档时
- 删除文档时
- 文档移动位置时

**更新步骤**：
1. 在相应分类下添加/删除/修改文档链接
2. 添加简短的文档说明
3. 保持索引的完整性和准确性

#### 归档历史文档

**何时归档**：
- 功能开发完成后
- 文档内容已过时
- 文档被新版本替代

**归档步骤**：
1. 移动到 `docs/md/archive/`
2. 在文件名或文档开头标注"已完成"或"已过时"
3. 更新 `docs/README.md` 索引
4. 不要删除历史文档（保留项目演进历史）

### 文档质量标准

#### 必须包含的内容

1. **标题**：清晰描述文档主题
2. **日期**：创建日期或最后更新日期
3. **目的**：说明为什么需要这个文档
4. **内容**：详细的说明、步骤、代码示例
5. **相关文件**：列出相关的代码文件路径

#### 推荐包含的内容

1. **目录**：长文档（>100行）应包含目录
2. **示例**：提供代码示例或命令示例
3. **注意事项**：列出常见陷阱和注意事项
4. **参考链接**：相关文档或外部资源链接

#### 文档编写建议

1. **使用 Markdown 格式**：便于版本控制和阅读
2. **代码块使用语法高亮**：指定语言（```typescript、```bash）
3. **使用相对路径**：引用其他文档时使用相对路径
4. **保持简洁**：避免冗长的描述，直接说明要点
5. **及时更新**：发现文档与代码不一致时立即更新

### 文档审计

**定期审计**（建议每季度一次）：
1. 检查 CLAUDE.md 与代码的一致性
2. 检查 API 端点文档的完整性
3. 检查已知不一致是否已修复
4. 归档已完成的开发计划文档
5. 更新文档索引

**审计报告存放位置**：`docs/CLAUDE_MD_AUDIT_YYYY-MM-DD.md`

### 示例：创建新功能文档

假设要开发"教练评分系统"功能：

1. **开发前**：创建 `docs/md/archive/coach-rating-system-plan.md`
   ```markdown
   # 教练评分系统开发计划

   **创建日期**: 2026-03-10
   **状态**: 进行中

   ## 功能概述
   ...

   ## 数据库设计
   ...

   ## API 端点
   ...
   ```

2. **开发中**：更新 CLAUDE.md
   - 在"数据库架构"章节添加新表说明
   - 在"API 端点列表"章节添加新端点
   - 在"核心目录结构"章节说明新增的文件

3. **开发完成**：
   - 更新开发计划文档，标记为"已完成"
   - 在文档开头添加完成日期
   - 如有故障排查经验，创建 `docs/md/troubleshooting/coach-rating-troubleshooting.md`

4. **功能上线后**：
   - 保留开发计划文档在 `docs/md/archive/`（不删除）
   - 更新 `docs/README.md` 索引

### 快速参考

**我应该在哪里创建文档？**

```
是核心文档（README/CLAUDE/SECURITY）？
├─ 是 → 根目录（但通常不需要新建）
└─ 否 → docs/ 目录
    ├─ 是历史/已完成的文档？ → docs/md/archive/
    ├─ 是故障排查指南？ → docs/md/troubleshooting/
    ├─ 是安全相关文档？ → docs/md/security/
    └─ 是技术专项文档？ → docs/
```

**我应该更新哪些文档？**

```
代码变更类型：
├─ 新增功能 → 更新 CLAUDE.md + 创建功能文档
├─ 修改 API → 更新 CLAUDE.md "API 端点列表"
├─ 修改数据库 → 更新 CLAUDE.md "数据库架构" + docs/sql/
├─ 修改认证 → 更新 CLAUDE.md "认证与路由保护"
├─ Bug 修复 → 仅 git commit（除非需要排查指南）
└─ 代码重构 → 仅 git commit
```

## 已知不一致（建议后续修复）

这些点会影响”文档/类型/运行表现”，但当前仓库代码确实如此：

1. **`lib/types.ts` 与数据库不完全一致** ⚠️ CRITICAL
   - **`Registration.status` 类型不完整**：仅声明了 `pending|approved|rejected`，但实际 DB/业务包含 `draft/submitted/cancelled` 等
     - 修复方案：更新为 `'draft' | 'pending' | 'submitted' | 'approved' | 'rejected' | 'cancelled'`
     - 影响范围：所有报名状态判断逻辑的类型检查失效
   - **`TeamRequirements` 和 `PlayerRequirements` 类型定义完全过时**：
     - 当前类型使用旧的固定字段结构（logo/name/contact_person 等）
     - 实际代码使用动态字段结构（commonFields/customFields/allFields）
     - 修复方案：参考“动态表单”章节的正确类型定义
     - 影响：类型检查无法发现字段访问错误
   - `Event.review_end_date` 在类型里存在，但 schema 中没有该列（代码有少量 fallback 逻辑）

2. **`components/ui/badge.tsx` 缺少 `success` variant**
   - 问题：多处业务代码使用 `variant: 'success'`（会 fallback 到 default 样式）
   - 影响位置：
     - `components/event-list.tsx`（报名阶段状态显示）
     - `app/portal/my/registrations/page.tsx`（报名状态显示）
     - `app/portal/events/[id]/page.tsx`（提示消息/状态 Badge）
   - 修复方案：在 badgeVariants 中添加 success variant：
     ```ts
     success: "border-transparent bg-green-100 text-green-800 hover:bg-green-100/80"
     ```

3. **认证遗留页面仍被 `middleware.ts` 拦截**
   - 现状：`/auth/register`、`/auth/update-password`、`/auth/confirm`、`/auth/error`、`/auth/sign-up*` 页面/路由仍在仓库内
   - 问题：它们当前都不在 `publicPaths` 中，直接访问通常会被重定向到 `/auth/login`
   - 影响：这些页面不能视作当前可用流程，只能算遗留实现
   - 修复方案：要么补齐 `publicPaths` 与新认证流程，要么明确下线这些页面

4. **公开队员分享页上传冲突已修复**
   - 当前实现：`app/player-share/[token]/page.tsx` 已改为调用 `/api/player-share/[token]/upload`
   - 结果：匿名分享页上传不再受 `/api/portal/*` 鉴权保护影响
   - 剩余注意点：当前公开上传仅允许 `player-photos`，如后续要开放附件上传，需要同步补齐字段级访问约束与限流策略

5. **测试登录页文案与实际逻辑不一致，且页面不可访问**
   - 问题：
     - `app/test-login/page.tsx` 默认 state 使用的是 `admin123`
     - 页面文案却写成了“测试密码：password”
     - 页面仍调用已废弃的 `/api/auth/login`
     - `middleware.ts` 会将 `/test-login` 重定向到 `/auth/login`
   - 修复方案：删除页面，或同时修正文案、登录方式和 publicPaths

6. **统一登录页帮助文案仍写死 SQL 默认密码**
   - 现状：`app/auth/login/page.tsx` 底部提示仍显示 `admin123（管理员）/ user123（教练）`
   - 问题：当前管理端已经支持新建账号和重置密码，实际联调环境口令可能已变化；该提示只能代表 SQL 初始化默认值
   - 影响：手工测试时容易误把旧默认口令当成当前环境的真实口令
   - 修复方案：改成“请联系管理员获取当前账号/密码”，或明确区分“SQL 初始化默认口令”和“当前联调稳定账号”

7. **`/api/init-admin` 方法不一致**
   - 问题：实际是 `GET`，但 `app/init/page.tsx` 使用 `POST` 调用（会失败）
   - 修复方案：统一为 `GET` 或更新页面调用方式

8. **`next.config.ts` 忽略构建错误**
   - 配置了 `eslint.ignoreDuringBuilds=true` 与 `typescript.ignoreBuildErrors=true`
   - 影响：生产构建不会因 lint/类型错误失败
   - 建议：修复类型错误后移除这些配置

9. **通知系统可能存在重复写入**
   - 数据库触发器（`registration_notification_trigger`）和审核 API（`/api/registrations/[id]/review`）都会写入通知
   - 可能导致同一审核操作产生两条通知
   - 建议选择一种方式并禁用另一种

10. **已确认但尚未迁移完成的隐私/安全风险**
   - 详细评测与优先级见：`docs/md/security/privacy-security-checklist-2026-03-11.md`
   - 已执行/可复用 SQL 见：
     - `docs/sql/security-tighten-admin-users-and-share-tokens.sql`
     - `docs/sql/security-tighten-registrations-and-settings.sql`
     - `docs/sql/security-privatize-sensitive-storage-buckets.sql`
   - 当前确认存在：
     - `event-posters` bucket 当前为 public（按业务设计保留）
   - 已处理：
      - `admin_users`：目标环境已开启 RLS，匿名读取已阻断
      - `player_share_tokens`：目标环境已开启 RLS，匿名读取已阻断
      - `registration_settings`：目标环境已开启 RLS，匿名读取已阻断；管理员可管，认证用户仅可读可见赛事
      - `registrations`：目标环境已开启 RLS，匿名读取已阻断；管理员可管，教练仅可管自己报名
      - 管理端涉及 `registrations/registration_settings` 的核心 API 已切换到 service role，以兼容 `admin-session` 模式
      - `registration-files` / `player-photos` / `team-documents`：目标环境已改为 private bucket，直接 public URL 访问已阻断
   - 注意：`docs/sql/actual-supabase-schema.sql` 与目标环境当前状态不完全一致；至少上述四张表在 2026-03-11 实测时并非“宽松 policy”，而是部分表直接 **未启用 RLS**
   - 平台级/分布式限流、敏感字段加密仍未完成
   - 审计日志规划与字段建议已整理到 `docs/md/security/audit-log-guidance.md`
   - 目标环境已执行 `docs/sql/security-create-audit-log-table.sql`；当前已覆盖导出、报名详情查看、显式私有文件下载、审核、管理员自助改密、账号创建/更新/删除/重置密码、教练批量导入/批量启停、公开分享访问/提交/上传、管理员会话创建等基础审计写入

---

## 文档审计报告

完整的文档审计报告见 `docs/CLAUDE_MD_AUDIT_2026-03-09.md`，包含：
- 已失效/过时的文档内容（4个问题）
- 缺失的功能文档（20+ API 端点）
- 文档不准确的内容（2个问题）
- 统计数据与优先级建议

**最近更新**: 2026-03-09
- ✅ 删除硬编码密码绕过的错误说明
- ✅ 补充双会话认证机制文档
- ✅ 更新 API 端点列表（新增 20+ 端点）
- ✅ 更正审核功能位置描述
- ✅ 更新”已知不一致”章节

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 “text”` - Interact using refs
4. Re-snapshot after page changes
