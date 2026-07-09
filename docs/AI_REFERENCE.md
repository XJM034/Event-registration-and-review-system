# AI_REFERENCE.md

本文件承接从根 `CLAUDE.md` / `AGENTS.md` 下沉的实现细节，供 AI agent 按需读取。它描述当前仓库事实，不是目标蓝图；若与代码冲突，以代码、schema 快照、增量 SQL、实测结果和 `docs/DOC_FRESHNESS_AUDIT.md` 互相校验。

最后更新：2026-07-08

## 项目概览

- 管理端：赛事管理、报名设置、审核、报名列表、导出、账号管理、项目管理。
- 教练门户端：赛事浏览、报名草稿/提交/重提/取消、我的报名、通知、模板导出。
- 公开队员填写页：`/player-share/[token]`，无需登录，通过分享 token 控制访问。
- 仓库仍包含部分 Supabase Starter 遗留页面，如 `app/protected/*`、`components/tutorial/*`、部分旧认证页面；不属于主业务流程。
- 文档/schema/脚本与代码的已知漂移记录在 `docs/DOC_FRESHNESS_AUDIT.md`；MemFire 到 Supabase 的目标环境迁移记录在 `docs/MEMFIRE_TO_SUPABASE_MIGRATION.md`。

## 命令与工具面

- 包管理器固定为 `pnpm@10.15.1`。
- `scripts/ensure-env.mjs` 会在 dev/build/lint/test 前检查或恢复 `.env.local`。
- Vercel build 场景下 `scripts/ensure-env.mjs` 不要求 `SUPABASE_SERVICE_ROLE_KEY` 作为构建期硬依赖；运行时 API 调用仍需要该变量。
- `scripts/verify-security-posture.mjs` 连接真实 Supabase 检查 Auth 设置、审计表和匿名隔离。
- `scripts/verify-template-export-e2e.ts` 验证模板导出关键路径。
- 当前没有 `.github` CI 工作流；本地命令是主要验证面。

## 认证与会话

- 登录入口是 `/auth/login`，手机号会转换为 `手机号@system.local` 使用 Supabase Auth 登录。
- 管理员和教练共用 Supabase Auth；角色主要来自 `auth.users.raw_user_meta_data.role`，但管理员权限最终回查 `admin_users`。
- 管理员登录后调用 `POST /api/auth/admin-session` 创建旁路会话：
  - `admin-session`：HttpOnly cookie。
  - `admin-session-tab`：前端可读 cookie。
  - `sessionStorage.tab_admin_session_token`：标签页级 token。
- `components/admin-api-session-bridge.tsx` 会给同源 `/api/*` 请求补 `x-admin-session-token`。
- `lib/auth.ts#getCurrentAdminSession()` 优先验证旁路管理员 token，并回查 `admin_users.is_super`，避免 token 中旧权限长期生效。
- 教练会话使用 Supabase session，`getCurrentCoachSession()` 会拒绝 `role=admin` 的用户。

## 路由与权限

当前 `middleware.ts` 规则：

- 公开路径：`/auth/login`、`/auth/forgot-password`、`/api/player-share/*`、`/init`、`/_next`、`/favicon.ico`、`/player-share/*`。
- 禁用旧认证路径：`/auth/register`、`/auth/sign-up`、`/auth/sign-up-success` 返回 404。
- 生产环境：`/api/debug/*` 和 `/api/test-*` 返回 404。
- API mutation 会经过 `isSameOriginMutationRequest()` 同源检查。
- `/` 根据登录态跳转到 `/events`、`/portal` 或 `/auth/login`。
- `/portal/*` 需要非管理员 Supabase session。
- `/events/*`、`/admin/*` 需要管理员身份。
- `/admin/project-management` 当前允许所有管理员访问；旧文档里的“仅超管”说法已过时。
- `/api/portal/*` 需要教练 session，管理员访问返回 403。
- `/api/project-management/*` 当前允许所有管理员访问。
- `/api/admin/coaches*`、`/api/admin/admins*` 需要超级管理员。

## 数据与 schema

数据库证据需要同时看代码、`docs/sql/actual-supabase-schema.sql`、相关增量 SQL、`docs/MEMFIRE_TO_SUPABASE_MIGRATION.md` 和目标环境实测。`actual-supabase-schema.sql` 已在 2026-07-08 刷新为当前 Supabase app-schema 快照；它排除 Supabase 平台托管的 Storage 内部表和业务数据。

代码当前依赖的核心结构：

- `admin_users`：管理员资料；代码会读取或写入 `auth_id`、`phone`、`email`、`name`、`is_super` 等字段。
- `coaches`：教练资料；代码会读取或写入 `auth_id`、手机号、学校/组织信息、`is_active`、`notes`、`last_login_at`、`created_by`。
- `events`：赛事基本信息、可见性和 `reference_templates`。
- `project_types`、`projects`、`divisions`、`event_divisions`：项目管理三级结构与赛事-组别绑定。
- `registration_settings`：动态报名配置，`team_requirements` / `player_requirements` 为 JSONB，按组别配置时依赖 `division_id`。
- `registrations`：报名记录，含 `team_data`、`players_data`、`status`、审核字段和取消字段。
- `notifications`：教练通知。
- `player_share_tokens`：公开队员填写 token、填写状态和最小同步数据。
- `security_audit_logs`：best-effort 安全审计日志，当前已包含在 schema 快照中；客户端有显式 deny-all RLS policy，服务端通过 service role 写入/读取。

关键数据库行为：

- 审核通知由 `app/api/registrations/[id]/review/route.ts` 显式写入；当前 Supabase 目标库不再添加旧的 `registration_notification_trigger`，避免重复通知。
- 通知页会尝试 RPC 批量已读，并有逐条 update fallback。
- 历史数据中 JSON 字段可能是字符串，代码多处有 `JSON.parse` 兼容。
- 如果 schema 快照、增量 SQL 和目标环境实测冲突，优先以目标环境和当前代码为准，并同步刷新文档。

## 动态表单与报名状态

- 管理端配置入口：`components/event-manage/registration-settings-tab.tsx`。
- 门户报名入口：`app/portal/events/[id]/register/page.tsx`。
- 公开队员填写入口：`app/player-share/[token]/page.tsx`。
- 字段顺序优先看 `allFields`；历史数据可能只有 `commonFields` / `customFields`。
- 报名时间优先来自 `registration_settings.team_requirements` 中的 `registrationStartDate`、`registrationEndDate`、`reviewEndDate`。
- 报名状态包含：`draft`、`pending`、`submitted`、`approved`、`rejected`、`cancelled`。
- UI 中 `pending` 与历史 `submitted` 都按待审核处理。
- `rejected` 可在允许时间内重提；取消后的重提规则在门户赛事详情和我的报名页都有实现，修改时必须同步。

## 上传、Storage 与导出

- 管理端上传：`POST /api/upload`，需要管理员会话，使用 service role，默认 bucket 为 `event-posters`，当前允许 4 个上传 bucket，并含扩展名、MIME、文件签名和大小校验。
- 门户上传：`POST /api/portal/upload`，需要教练会话，使用 service role，允许 `registration-files`、`player-photos`、`team-documents`。
- 公开队员上传：`POST /api/player-share/[token]/upload`，无需登录，允许 `player-photos` 和 `team-documents`，会校验分享 token、报名状态、截止时间、文件签名、大小限制和 rate limit。
- 应用层隐私模型在 `lib/storage-object.ts`：`registration-files`、`player-photos`、`team-documents` 按私有对象处理，统一经 `/api/storage/object` 受控读取；`event-posters` 可公开读取。
- `docs/sql/create-buckets-simple.sql` 是快速创建脚本，当前会把 4 个 bucket 都设为 public；若要符合当前安全目标，需要继续执行 `docs/sql/security-privatize-sensitive-storage-buckets.sql` 或用界面确认敏感 bucket 为 private。
- 文件读取统一关注 `app/api/storage/object/route.ts` 与 `lib/storage-object.ts`，敏感对象应通过受控 API 返回。
- 管理端报名导出入口：`app/api/events/[id]/registrations/export/route.ts`，当前按动态字段配置导出并打包 zip。
- 教练模板导出能力涉及 `lib/template-document-export.ts` 和 `app/api/portal/registrations/[id]/template-export/route.ts`。

## 安全边界

已落地：

- 管理员旁路 session 使用 HMAC 签名并回查数据库权限。
- `middleware.ts` 屏蔽生产调试接口、旧注册入口，并做 API mutation 同源检查。
- `next.config.ts` 设置基础安全响应头，包括 CSP、HSTS、COOP、CORP、Permissions-Policy。
- 公开分享、导出、admin-session 等敏感入口有应用层 rate limit。
- 多个公开/敏感入口写 best-effort 审计日志，分享 token 只记录摘要。
- 目标安全状态应以 `SECURITY.md`、`docs/MEMFIRE_TO_SUPABASE_MIGRATION.md`、Supabase advisors 和 `pnpm security:check` / `node scripts/verify-security-posture.mjs` 的实测结果为准。

仍需注意：

- `next.config.ts` 仍配置 `eslint.ignoreDuringBuilds = true` 和 `typescript.ignoreBuildErrors = true`。
- 管理端存在前端可读的 `admin-session-tab` 与 `sessionStorage.tab_admin_session_token`，XSS 风险较敏感。
- `pnpm security:check` 需要真实 Supabase 环境，不能在缺少 env 或外部网络失败时视为已验证。

## 测试地图

- `lib/__tests__/middleware-auth-guard.test.ts`：路由保护、生产调试接口、管理员/教练边界。
- `lib/__tests__/admin-session-*.test.ts`：管理员会话和审计。
- `lib/__tests__/portal-upload-route.test.ts`、`upload-file-validation.test.ts`：上传与文件校验。
- `lib/__tests__/player-share-token.test.ts`、`public-share-audit.test.ts`：分享 token 和公开审计。
- `lib/__tests__/export-*.test.ts`、`excel-workbook.test.ts`：导出工具。
- `lib/__tests__/next-config-security-headers.test.ts`：安全响应头。
- `lib/__tests__/ensure-env.test.ts`：环境变量恢复逻辑。

## 文档归档

- 2026-05-05 前的长版根文档已归档到：
  - `docs/md/archive/claude-md-full-reference-2026-05-05.md`
  - `docs/md/archive/agents-md-full-reference-2026-05-05.md`
- 归档内容只用于历史追溯，不应优先于当前代码和本文件。
- 2026-07-08 起，活跃文档/schema 漂移统一记录在 `docs/DOC_FRESHNESS_AUDIT.md`。

## 已知文档维护规则

- 根文档只保留常驻规则和 load map。
- API 长表、目录长树、历史审计、详细业务说明进入本文件或专题文档。
- 修改权限、认证、schema、Storage、导出、安全策略、命令或验证要求时，同时检查 `README.md`、`SECURITY.md`、`docs/README.md` 和本文件。
- 发现旧文档与代码冲突时，不要只在聊天里说明；应更新对应文档或补到 `docs/DOC_FRESHNESS_AUDIT.md`。
