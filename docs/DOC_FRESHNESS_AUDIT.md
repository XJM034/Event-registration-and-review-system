# 文档时效性审计

最后审计：2026-08-11

本文件是当前仓库的活跃文档维护队列，用来记录“文档、代码、schema、脚本、目标环境”之间已确认的差异。它不是业务需求文档；处理代码、数据库、安全、Storage、导出或认证问题前，先按本文件回到真实证据。

## 结论摘要

- 根 `CLAUDE.md` / `AGENTS.md` 已保持镜像，适合作为短入口，不再承载长 API 表或历史审计。
- `README.md`、`docs/AI_REFERENCE.md`、`SECURITY.md`、`docs/STORAGE_SETUP.md` 已在本轮按代码证据修正部分过时描述。
- `docs/sql/actual-supabase-schema.sql` 已在 2026-07-08 MemFire-to-Supabase 迁移后刷新为当前 Supabase app-schema 快照；它排除 Supabase 平台托管的 Storage 内部表和业务数据。
- 2026-08-11 已确认 Vercel Production 的 Supabase 变量仍指向迁移前 MemFire，导致已启用的 keepalive Cron 命中旧后端；目标变量已纠正，并新增 project ref 强校验和生产 Cron 实跑验收。
- 涉及数据库结构或 RLS/GRANT 时，仍必须同时查代码、`actual-supabase-schema.sql`、`docs/MEMFIRE_TO_SUPABASE_MIGRATION.md`、相关增量 SQL，并在可能时用目标数据库实测确认。
- `app/api/events/[id]/registrations/export/route.ts.backup` 是被 Git 跟踪的旧备份文件，仍引用已移除依赖 `xlsx`，应作为归档或删除候选处理。

## 已核对范围

- 根文档：`CLAUDE.md`、`AGENTS.md`
- 项目入口：`README.md`、`docs/README.md`
- AI 参考与安全：`docs/AI_REFERENCE.md`、`SECURITY.md`
- Storage：`docs/STORAGE_SETUP.md`、`docs/sql/create-buckets-simple.sql`、`docs/sql/security-privatize-sensitive-storage-buckets.sql`、`docs/sql/actual-storage-buckets-data.sql`
- 数据库：`docs/sql/actual-supabase-schema.sql` 与关键增量 SQL
- 关键代码：`middleware.ts`、`next.config.ts`、`lib/auth.ts`、`lib/admin-session.ts`、`lib/env.ts`、上传/分享/导出/API route、账号管理与项目管理 route
- 验证面：`package.json` scripts、`lib/__tests__/**`、`scripts/ensure-env.mjs`、`scripts/verify-security-posture.mjs`

## 当前可靠事实

### 技术与命令

- 包管理器由 `package.json#packageManager` 固定为 `pnpm@10.15.1`。
- 当前没有 `.github` CI 工作流；主要验证面是本地脚本和外部部署检查。
- `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm test` 前都会跑 `scripts/ensure-env.mjs`。
- Vercel build 场景下，`scripts/ensure-env.mjs` 不再把 `SUPABASE_SERVICE_ROLE_KEY` 作为构建期硬依赖；运行时 API 仍需要 service role。
- `next.config.ts` 仍配置 `eslint.ignoreDuringBuilds = true` 和 `typescript.ignoreBuildErrors = true`，所以 `pnpm build` 通过不代表类型或 lint 质量通过。
- 导出实现使用 `exceljs` + `jszip` + `pdf-lib`；旧 `xlsx` 依赖已不在 `package.json`。
- 当前本地 `.env.local` 和机器 profile 指向 Supabase project `ernfouwkblxwzshmbsda`；旧 MemFire 配置保留在 `.env.memfire.local`。
- `SUPABASE_EXPECTED_PROJECT_REF` 是必需环境变量；`scripts/ensure-env.mjs` 在构建前、`lib/env.ts` 在运行时拒绝 URL project ref 不一致的配置。
- Vercel Cron 的存在不能单独证明保活有效；生产发布必须检查 deployed Cron、手动触发，并从运行日志核对 `projectRef` 和查询次数。

### 认证、路由与权限

- 主登录入口是 `/auth/login`，手机号会映射到 `手机号@system.local` 走 Supabase Auth。
- 管理员和教练共用 Supabase Auth；管理员额外创建 `admin-session`、`admin-session-tab` 和 `sessionStorage.tab_admin_session_token`。
- `/portal/*` 需要教练 Supabase session；`/events/*` 与 `/admin/*` 需要管理员身份。
- `/admin/project-management` 和 `/api/project-management/*` 当前允许所有管理员访问。
- `/api/admin/coaches*` 与 `/api/admin/admins*` 需要超级管理员。
- 生产环境下 `/api/debug/*` 与 `/api/test-*` 由 `middleware.ts` 返回 404。
- `/auth/register`、`/auth/sign-up`、`/auth/sign-up-success` 被 `middleware.ts` 返回 404。

### Storage 与上传

- 代码里的应用层隐私模型由 `lib/storage-object.ts` 定义：`registration-files`、`player-photos`、`team-documents` 被当作私有 bucket，经 `/api/storage/object` 受控读取；`event-posters` 可公开读取。
- 管理端上传 `POST /api/upload` 当前允许 4 个 bucket：`event-posters`、`registration-files`、`player-photos`、`team-documents`。
- 教练上传 `POST /api/portal/upload` 允许 `registration-files`、`player-photos`、`team-documents`。
- 公开分享上传 `POST /api/player-share/[token]/upload` 允许 `player-photos` 和 `team-documents`；照片限制 5MB，文档限制 20MB。
- `docs/sql/create-buckets-simple.sql` 当前会把 4 个 bucket 都设为 `public=true`，这只是快速创建脚本，不代表当前安全目标。
- `docs/sql/security-privatize-sensitive-storage-buckets.sql` 会把 `registration-files`、`player-photos`、`team-documents` 改为 `public=false`，与代码隐私模型一致。
- `docs/sql/actual-storage-buckets-data.sql` 已刷新为新 Supabase 4 个 bucket 的实测状态。

## 已知漂移

| 优先级 | 位置 | 已确认问题 | 证据 | 当前处理 |
| --- | --- | --- | --- | --- |
| P0 | `SECURITY.md` 旧描述 | 曾写“登录页仍展示旧默认密码提示”，但当前登录页只显示“账号请联系管理员开通” | `app/auth/login/page.tsx` | 已从安全风险中移除 |
| P1 | Storage SQL | 快速创建脚本与当前安全目标相反：敏感 bucket 被设为 public | `create-buckets-simple.sql` 与 `security-privatize-sensitive-storage-buckets.sql` | 已在 Storage 文档中标明先创建后收口 |
| P1 | `SECURITY.md` 上传范围 | 旧文档说管理端只允许部分 bucket，代码实际允许 4 个 | `app/api/upload/route.ts`、`lib/upload-file-validation.ts` | 已修正 |
| P1 | `README.md` 技术栈 | 旧文档写 `xlsx`，当前依赖和代码使用 `exceljs` | `package.json`、`lib/excel-workbook.ts` | 已修正 |
| P2 | 跟踪的备份代码 | `app/api/events/[id]/registrations/export/route.ts.backup` 被 Git 跟踪并引用旧 `xlsx` | `git ls-files`、文件内容搜索 | 暂不删除；列为归档/删除候选 |
| P2 | `lib/types.ts` | 仍有旧窄类型，例如 `Registration.status` 不含 `draft/submitted/cancelled` | `lib/types.ts` 与 schema/代码状态分支 | 未在本轮修代码；涉及类型工作时优先处理 |
| P2 | `app/init/page.tsx` | 页面用 `POST /api/init-admin`，后端只有 `GET`，且该入口不是主流程 | `app/init/page.tsx`、`app/api/init-admin/route.ts` | 保留为已知非主流程风险 |
| P0 | Vercel Production Supabase 配置 | 迁移后仍保留旧 MemFire URL，Cron 虽启用但命中旧后端 | Vercel env 创建时间、生产 bundle 域名、Cron 列表、Supabase pause 邮件 | 已恢复项目并纠正变量；由 project ref 校验、Cron 手动执行和运行日志验收防复发 |

## Schema 使用规则

涉及数据库时不要只看一个文件。按以下顺序查证：

1. 先看当前代码实际读取/写入的表、列、RPC、trigger、storage bucket。
2. 再看 `docs/sql/actual-supabase-schema.sql`，理解当前 Supabase app-schema 快照。
3. 对照 `docs/MEMFIRE_TO_SUPABASE_MIGRATION.md` 和增量 SQL：
   - `docs/sql/project-management-schema.sql`
   - `docs/sql/add-event-reference-templates.sql`
   - `docs/sql/add-admin-users-columns.sql`
   - `docs/sql/add-coaches-columns.sql`
   - `docs/sql/account-management-schema.sql`
   - `docs/sql/security-create-audit-log-table.sql`
   - `docs/sql/security-tighten-admin-users-and-share-tokens.sql`
   - `docs/sql/security-tighten-registrations-and-settings.sql`
   - `docs/sql/security-privatize-sensitive-storage-buckets.sql`
4. 如果要改 schema、RLS、权限或上线检查，优先用目标 Supabase 环境实测，并刷新 `actual-supabase-schema.sql` 或在本文件记录无法刷新原因。

## 活跃队列生命周期

- 新增：只有当文档与代码、schema、脚本或目标环境存在可复现冲突时，才往本文件新增条目。
- 完成：必须写明修复文件和验证命令；没有验证就标“待验证”，不要写成已完成。
- 归档：当一组差异全部修完且不再影响日常入口时，移动到 `docs/md/archive/doc-freshness-audit-YYYY-MM-DD.md`，并保留本文件的短结论。
- 需要问人：如果冲突来自目标环境状态、账号口令、生产配置、Storage public/private 决策，且 repo 证据无法判断真实意图，先问一个具体问题。

## 后续建议

1. 决定 `create-buckets-simple.sql` 是否要改为安全默认，或更名为“快速 public 初始化脚本”。
2. 删除或归档被 Git 跟踪的 `.backup` route 文件。
3. 单独修正 `lib/types.ts`，并把状态、动态字段、账号管理字段与代码/schema 对齐。
4. 定期重跑 `pnpm security:check` 或 `node scripts/verify-security-posture.mjs`，把目标环境 RLS、审计表、匿名隔离结果写回 `SECURITY.md` 或本文件。
