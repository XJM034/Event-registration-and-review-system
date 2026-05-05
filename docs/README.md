# 项目文档索引

本目录保存体育赛事报名与审核系统的详细文档。根目录 `CLAUDE.md` / `AGENTS.md` 只作为 AI agent 的短入口，详细实现事实从这里按需读取。

最后更新：2026-05-05

## 首选阅读顺序

1. `../README.md`：项目启动、环境变量、常用命令。
2. `../CLAUDE.md` / `../AGENTS.md`：AI agent 常驻规则，二者应保持镜像。
3. `AI_REFERENCE.md`：认证、路由、数据、上传、导出、安全边界、测试地图和已知差异。
4. `../SECURITY.md`：安全模型、风险和上线检查。
5. `sql/actual-supabase-schema.sql`：数据库结构主参考。

若上述文档与代码冲突，以代码和 `sql/actual-supabase-schema.sql` 为准，并同步修正文档。

## 核心文档

- `AI_REFERENCE.md`：AI agent 按需读取的详细项目参考。
- `STORAGE_SETUP.md`：Supabase/MemFire Storage bucket 配置。
- `USER_MANUAL.md`：管理员、教练、队员的用户操作手册。
- `../SECURITY.md`：安全配置、已落地控制、风险与应急流程。
- `../README.md`：快速开始和项目概览。

## SQL 与数据库

- `sql/actual-supabase-schema.sql`：当前数据库结构快照，优先级最高。
- `sql/create-buckets-simple.sql`：创建 `event-posters`、`registration-files`、`player-photos`、`team-documents`。
- `sql/storage-policies.sql`：Storage/RLS 策略参考。
- 其他 `sql/*.sql`：账号、项目管理、统一认证、安全加固等历史或增量脚本。执行前先确认当前环境是否需要全量还是增量。

## 专题文档

- `md/security/`：安全审计、隐私安全、审计日志方案。
- `md/troubleshooting/`：故障排查记录。
- `md/performance/`：性能与资源使用审计。
- `md/Mobile_Adaptation/`：移动端适配方案和回归记录。
- `md/archive/`：历史文档、旧版根文档和已完成计划。

## 文档维护规则

- 根 `CLAUDE.md` / `AGENTS.md` 保持短、硬、可执行；不要放长 API 表、长目录树或历史全文。
- 认证、权限、路由、schema、Storage、上传、导出、安全策略、命令或验证流程变化时，同步检查 `AI_REFERENCE.md`、`SECURITY.md`、`README.md`。
- 数据库结构变化必须同步 `sql/actual-supabase-schema.sql`，必要时补增量脚本。
- 大段从根文档移除的内容必须先归档到 `md/archive/`，不要静默删除。
- 大功能完成、准备 handoff、准备 PR / merge，或发现 AI 指南与代码不一致时，重跑 `$claude-agents-bootstrap`。

## 历史归档

- `md/archive/claude-md-full-reference-2026-05-05.md`
- `md/archive/agents-md-full-reference-2026-05-05.md`

这些归档只用于历史追溯，不优先于当前代码、schema 和活跃文档。
