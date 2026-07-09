# AI Agent 工作指南

本文件是本仓库给 Claude Code / Codex 等 AI agent 的常驻工作指南。它只保留高频规则；实现细节请按下面的读取顺序进入支持文档，并以代码、schema、增量 SQL 和实测结果互相校验。

最后刷新：2026-07-08

## 项目契约

- 项目是体育赛事报名与审核系统：管理端、教练门户端、公开队员分享填写页三类入口。
- 技术栈：Next.js 15 App Router、React 19、TypeScript、Supabase、Tailwind CSS、shadcn/ui、Vitest；旧 MemFire 配置仅保留在本地备份 `.env.memfire.local`。
- 数据库事实不能只看单个文件：`docs/sql/actual-supabase-schema.sql` 是 2026-07-08 迁移后的 Supabase app-schema 快照；涉及 DB 时仍要同时查代码、相关增量 SQL、`docs/MEMFIRE_TO_SUPABASE_MIGRATION.md` 和目标环境实测。
- 当前根文档要求 `CLAUDE.md` 与 `AGENTS.md` 镜像；修改其中一个时必须同步另一个，并用 `cmp -s CLAUDE.md AGENTS.md` 验证。

## 首次读取

1. `README.md`：启动、环境变量、常用命令。
2. `docs/README.md`：文档索引和维护规则。
3. `docs/DOC_FRESHNESS_AUDIT.md`：当前文档/schema/代码已知漂移和活跃维护队列。
4. `docs/AI_REFERENCE.md`：认证、路由、数据、上传、导出、安全边界和测试地图。
5. `SECURITY.md`：安全模型和上线检查；如果与代码不一致，先修正文档或标出差异。
6. `docs/sql/actual-supabase-schema.sql` 与相关 `docs/sql/*.sql` 增量脚本：表结构、函数、触发器、RLS/GRANT 的当前证据。
7. 若是在延续前一轮工作，读取最新的 `./handoff/*-handoff.md`（如存在）。handoff 只作补充上下文，关键结论仍要回查代码。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm start
pnpm env:sync
pnpm security:check
pnpm test:template-e2e
```

- `predev` / `prebuild` / `prelint` / `pretest` 会运行 `scripts/ensure-env.mjs`。
- 本机环境变量可同步到 `~/.config/event-registration-and-review-system/las-vegas.env`。
- Vercel build 场景下 `ensure-env` 不硬性要求 `SUPABASE_SERVICE_ROLE_KEY`；运行时敏感 API 仍需要 service role。
- 构建当前仍在 `next.config.ts` 中忽略 lint 与 TypeScript 错误；不要把 `pnpm build` 通过误读为类型质量已通过。

## Context7 规则

- 当用户询问库、框架、SDK、API、CLI 或云服务的用法、配置、迁移、调试、setup 时，先用 `ctx7` 查当前文档。
- 调用顺序：`npx --yes ctx7@latest library <name> "<用户完整问题>"`，选出 `/org/project` 后再运行 `npx --yes ctx7@latest docs <libraryId> "<用户完整问题>"`。
- 不用于业务逻辑调试、普通重构、代码审查、从零写脚本或通用编程概念。
- 最多 3 条 ctx7 命令；遇到 quota 错误时提示用户登录或设置 `CONTEXT7_API_KEY`，不要静默改用记忆。
- 如果 Codex 沙盒内 ctx7 出现 DNS、host resolution、`fetch failed` 或无输出网络卡住，按权限规则用同一命令请求外部沙盒重试。

## 代码地图

- `middleware.ts`：全局路由保护、CSRF 同源 mutation 检查、生产调试接口屏蔽。
- `lib/auth.ts`、`lib/admin-session.ts`：Supabase 会话、管理员旁路 session、角色判断。
- `app/auth/login/page.tsx`、`app/api/auth/admin-session/route.ts`：统一手机号登录与管理员会话创建。
- `app/events/**`、`components/event-manage/**`：管理端赛事、报名设置、审核、报名列表。
- `app/portal/**`：教练门户、报名、通知、我的报名。
- `app/player-share/**`、`app/api/player-share/**`：公开队员填写与匿名上传。
- `app/api/**`：Route Handlers；管理端敏感写入多依赖 service role。
- `lib/__tests__/**`：Vitest 单元与路由行为测试。

## 稳定边界

- 管理员和教练共用 Supabase Auth 登录；管理员额外创建 `admin-session` / `admin-session-tab` / `sessionStorage.tab_admin_session_token`。
- `/portal/*` 需要教练 Supabase session；`/events/*` 和 `/admin/*` 需要管理员身份。
- 当前代码中 `/admin/project-management` 与 `/api/project-management/*` 允许所有管理员访问；账号管理 API 仍要求超级管理员。
- 公开队员页使用 `/api/player-share/[token]` 和 `/api/player-share/[token]/upload`，不要误写为只能复用 `/api/portal/upload`。
- `registration-files`、`player-photos`、`team-documents` 在应用层按私有对象处理，经 `/api/storage/object` 受控读取；Storage SQL 脚本与实际 bucket 状态若冲突，先看 `docs/STORAGE_SETUP.md` 与 `docs/DOC_FRESHNESS_AUDIT.md`。
- 生产环境下 `/api/debug/*` 与 `/api/test-*` 由 middleware 返回 404。

## 验证要求

- 改认证、路由、权限、上传、导出、状态机、schema 或安全边界时，至少跑相关 Vitest；能跑全量时跑 `pnpm test`。
- 改 UI 流程时，除测试外要用浏览器核验关键路径：登录、创建/编辑赛事、报名提交、审核、导出或分享填写。
- 改安全边界时优先跑 `pnpm security:check` 或直接跑 `node scripts/verify-security-posture.mjs`；该命令依赖真实 Supabase 环境变量。
- 改模板导出能力时跑 `pnpm test:template-e2e`。
- 纯文档改动至少验证本地 Markdown 链接、`CLAUDE.md` / `AGENTS.md` 镜像，以及所引用文件是否存在。
- 如果验证因环境变量或外部服务失败，记录失败原因，不要写成已通过。

## 文档更新

- 业务实现细节进入 `docs/AI_REFERENCE.md` 或相应专题文档，不再堆进根文档。
- 文档与代码/schema/脚本冲突时，更新对应文档；若不能立刻修复，把证据和下一步写入 `docs/DOC_FRESHNESS_AUDIT.md`。
- 数据库变更应同步 `docs/sql/actual-supabase-schema.sql`；如果快照无法立即刷新，必须在 `docs/DOC_FRESHNESS_AUDIT.md` 标出缺口和需要验证的增量 SQL。
- 安全边界变化同步 `SECURITY.md` 和 `docs/md/security/*`。
- 上传、导出、认证、路由、权限、命令、验证流程或文档结构变化后，重跑 `$claude-agents-bootstrap` 刷新根文档。
- 大功能完成、准备 handoff、准备 PR / merge 前，如果文档可能漂移，也要重跑 `$claude-agents-bootstrap`。

## 活跃队列

- `docs/DOC_FRESHNESS_AUDIT.md` 是文档/schema 漂移队列：新增项必须有代码、脚本、schema 或目标环境证据。
- 完成队列项时写明修复文件和验证命令；缺少验证就标“待验证”。
- 已完成且不再影响日常入口的长记录归档到 `docs/md/archive/`。
- 涉及真实生产/联调环境状态、账号口令、Storage public/private 决策时，repo 证据不足就问一个具体问题。

## 禁止事项

- 不要提交真实密钥、真实联调/生产账号口令、service role key、JWT secret 或完整分享 token。
- 不要绕过 `middleware.ts`、`lib/auth.ts`、`lib/player-share-token.ts` 中的权限判断。
- 不要把旧文档里的结论直接当事实；先查代码、schema、迁移记录、增量 SQL、测试和文档时效性队列。
- 不要在根文档保留长 API 表、长目录树、历史审计全文或大段日志；下沉到支持文档或归档。

## 压缩交接

上下文压缩或交接时必须保留：目标、已改文件、关键业务规则、认证/权限/schema 影响、验证命令与结果、未验证风险、下一步。不要只留下聊天结论。
