# 审计日志安全保障说明

**创建日期**: 2026-03-12  
**状态**: 规划 + 实施参考；当前仓库已部分落地，目标环境已创建 `security_audit_logs` 表

## 这份文档是干什么的

这份文档不是在说“系统已经有完善审计日志”，而是在说明：

1. 审计日志要解决什么安全问题
2. 后续安全工程师应该优先记录哪些操作
3. 审计日志表至少要有哪些字段
4. 哪些内容**不能**写进日志，避免二次泄露

当前项目已经把“匿名用户直接读学生附件/报名数据”的主要口子大幅收紧，但对**高权限用户误操作、越权导出、批量下载、账号滥用**这类问题，仍需要可追溯能力。审计日志就是补这一层。

## 当前已落地范围

截至 2026-03-12，仓库和目标环境已完成下面这些基础动作：

1. 已新增 `docs/sql/security-create-audit-log-table.sql`
2. 目标环境已创建 `public.security_audit_logs`，并开启 RLS、移除 `anon/authenticated` 直接权限
3. 仓库已新增 `lib/security-audit-log.ts`
4. 下面这些入口已接入 best-effort 审计日志写入：
   - `POST /api/events/[id]/registrations/export`
   - `GET /api/registrations/[id]`
   - `GET /api/storage/object`（仅显式下载）
   - `POST /api/registrations/[id]/review`
   - `PUT /api/admin/me`
   - `POST /api/admin/admins`
   - `PUT /api/admin/admins/[id]`
   - `DELETE /api/admin/admins/[id]`
   - `POST /api/admin/admins/[id]/reset-password`
   - `POST /api/admin/coaches`
   - `PUT /api/admin/coaches/[id]`
   - `PATCH /api/admin/coaches/[id]`
   - `DELETE /api/admin/coaches/[id]`
   - `POST /api/admin/coaches/[id]/reset-password`
   - `POST /api/admin/coaches/import`
   - `PATCH /api/admin/coaches/batch-status`
   - `GET /api/player-share/[token]`
   - `PUT /api/player-share/[token]`
   - `POST /api/player-share/[token]/upload`
   - `POST /api/auth/admin-session`

当前还不是“全量覆盖”，后续仍应继续补审计查询/告警。

## 审计日志提供的安全保障

审计日志**不是加密**，也**不是权限控制本身**。它提供的是下面四类保障：

1. **可追溯**
   - 发生数据泄露后，可以回查“是谁、在什么时候、从哪里、对哪条数据做了什么”

2. **可检测**
   - 可以针对异常行为做规则或告警，例如短时间连续导出多个赛事、批量下载学生附件、频繁重置账号密码

3. **可追责**
   - 高权限操作不再是“做了也没人知道”，能显著降低内部滥用的侥幸心理

4. **可审计**
   - 公司后续如果做内部审计、等保、隐私合规或客户尽调，可以证明系统对敏感数据访问是有记录的

## 审计日志不能替代什么

即使后续把审计日志补齐，也**不能替代**下面这些安全措施：

- 不能替代 RLS / 权限控制
- 不能替代私有 bucket 和受控下载
- 不能替代字段脱敏或加密
- 不能替代平台级限流

换句话说：

- **权限控制**负责“能不能做”
- **审计日志**负责“谁做了、做了多少、什么时候做的”

## 当前项目最应该优先记录的操作

下面这些操作和学生身份证号、照片、附件、联系方式最相关，建议优先做。

### P0 必记

1. **管理员导出报名数据**
   - 位置：`POST /api/events/[id]/registrations/export`
   - 原因：这是当前最容易一次性拿走大量敏感数据的入口

2. **管理员查看单条报名详情**
   - 位置：`GET /api/registrations/[id]`
   - 原因：单条报名里可能包含学生身份证号、照片、附件、联系方式

3. **私有文件下载**
   - 位置：`GET /api/storage/object`
   - 原因：学生照片、队伍文档、报名附件都通过这个接口下发

4. **审核通过 / 驳回**
   - 位置：`POST /api/registrations/[id]/review`
   - 原因：这属于关键业务操作，后续需要知道是谁改了报名结果

5. **管理员账号 / 教练账号管理**
   - 位置：
     - `app/api/admin/admins/route.ts`
     - `app/api/admin/admins/[id]/route.ts`
     - `app/api/admin/admins/[id]/reset-password/route.ts`
     - `app/api/admin/coaches/route.ts`
     - `app/api/admin/coaches/[id]/route.ts`
     - `app/api/admin/coaches/[id]/reset-password/route.ts`
   - 原因：账号创建、禁用、删除、重置密码都属于高风险管理动作

### P1 建议补记

1. **管理员会话创建**
   - 位置：`POST /api/auth/admin-session`
   - 原因：可辅助追查可疑后台登录和并发会话问题

2. **管理员自助改密**
   - 位置：`PUT /api/admin/me`
   - 原因：虽然不是批量高风险入口，但属于敏感认证操作，后续排查账号异常时需要知道是谁发起了自助改密

3. **公开分享链接访问与提交**
   - 位置：
     - `GET /api/player-share/[token]`
     - `PUT /api/player-share/[token]`
     - `POST /api/player-share/[token]/upload`
   - 原因：可以辅助判断分享链接是否被异常高频访问、恶意尝试或被非预期对象使用

4. **教练端模板导出 / 批量导出**
   - 位置：`GET /api/portal/registrations/[id]/template-export`
   - 原因：虽然影响面比管理员总导出小，但仍属于敏感数据输出

## 审计日志表最少应该记录哪些字段

建议后续安全工程师设计一张单独的审计日志表，例如 `security_audit_logs`，最少包含：

| 字段 | 说明 |
|---|---|
| `id` | 日志主键 |
| `created_at` | 发生时间 |
| `actor_type` | 操作者类型：`admin` / `coach` / `public_share` / `system` |
| `actor_id` | 操作者主键；匿名分享页可为空 |
| `actor_role` | 更细的角色，例如 `super_admin` / `admin` / `coach` |
| `action` | 动作，例如 `export_registrations`、`download_private_file`、`reset_admin_password` |
| `resource_type` | 资源类型，例如 `registration`、`storage_object`、`admin_user` |
| `resource_id` | 资源主键 |
| `event_id` | 关联赛事，能带上就带上 |
| `registration_id` | 关联报名，能带上就带上 |
| `target_user_id` | 被操作对象，例如被重置密码的管理员/教练 |
| `ip_address` | 来源 IP |
| `user_agent` | 终端信息 |
| `request_id` | 请求链路 ID，便于和应用日志对齐 |
| `result` | `success` / `denied` / `failed` |
| `reason` | 简短原因，例如 `rate_limited`、`permission_denied` |
| `metadata` | 补充字段，放非敏感上下文，如导出条数、下载 bucket/path、筛选条件摘要 |

## 哪些内容不要写进审计日志

这是最容易踩坑的地方。审计日志是为了安全，不应该自己变成新的泄露面。

不要直接写入以下内容：

- 学生身份证号原文
- 学生照片二进制内容
- 附件文件内容
- 完整 `players_data` / `team_data` JSON
- 原始密码、密码 hash、重置 token
- 完整分享 token

建议做法：

- 身份证号只记录是否涉及“敏感字段访问”，不要记值本身
- 文件只记录 `bucket` + `path`，不要把文件内容落日志
- 分享 token 只记录前几位或 token 的 hash
- 导出操作只记录“导出了多少条、哪个赛事、谁导的”，不要把导出内容再写一遍

## 最低可用的告警规则

后续安全工程师接手后，建议至少做下面几条告警：

1. 同一管理员 10 分钟内连续导出多次
2. 同一管理员短时间内下载大量私有附件
3. 同一账号短时间内连续重置多个账号密码
4. 同一分享 token 短时间内被多个 IP 高频访问
5. 出现大量 `permission_denied` 或 `rate_limited` 失败记录

## 推荐落地顺序

为了不破坏当前功能，建议按下面顺序做：

1. **先建审计日志表**
   - 先只做 append-only 写入，不做复杂联动

2. **先埋 P0 入口**
   - 导出
   - 单条报名查看
   - 私有文件下载
   - 审核
   - 账号管理 / 重置密码

3. **再做查询页或报表**
   - 先保证“有记录”，再考虑运营/安全如何查看

4. **最后做告警**
   - 告警依赖稳定的日志字段；不要在没有统一字段前就急着写规则

## 对当前项目最实际的建议

如果现在只能优先做一件事，我建议：

1. 先给 **管理员导出** 和 **私有文件下载** 补审计日志
2. 然后给 **账号重置密码** 和 **审核操作** 补审计日志

这是当前最贴近学生身份证号、照片、附件泄露风险的几类入口。

## 和当前仓库的关系

当前仓库里：

- 私有文件读取主入口：`app/api/storage/object/route.ts`
- 报名总导出入口：`app/api/events/[id]/registrations/export/route.ts`
- 报名审核入口：`app/api/registrations/[id]/review/route.ts`
- 管理员会话入口：`app/api/auth/admin-session/route.ts`
- 管理员/教练账号管理入口：`app/api/admin/*`

后续安全工程师做审计日志时，优先从这些入口下手即可。
