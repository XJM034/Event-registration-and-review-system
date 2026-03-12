# 赛事报名系统 — 隐私与安全排查清单

**创建日期**: 2026-03-11
**状态**: 已评测，需分层整改

## 评测结论

本清单**大体方向正确**，但与当前仓库/Schema 对照后，需要做三类修正：

1. **有些项不是“待确认”，而是当前实现里已经明确存在**
   - `player_share_tokens` 宽松 RLS：`docs/sql/actual-supabase-schema.sql` 中确实存在 `FOR SELECT USING (true)` 和 `FOR UPDATE USING (true)`。
   - `registration_settings` public read：Schema 快照里确实存在 `Registration settings public read`。
   - `player-photos` bucket public：`docs/sql/actual-storage-buckets-data.sql` 已确认是 `public=true`。

2. **有些项表述需要修正**
   - 原第 2 项“只保留 `Allow anonymous access by token`”**并不充分**。因为这条策略只校验 `is_active/expires_at`，**并没有把可读记录绑定到 URL token**，匿名用户仍可直接枚举全部活跃 token。更稳妥的做法是：匿名端**不要直连 `player_share_tokens` 表**，统一走服务端 API 按 token 精确读取。
   - 原第 6 项“导出接口无赛事级权限校验”在**当前项目权限模型下不算实现偏差**。当前仓库没有“管理员仅能管理部分赛事”的数据模型，现状更准确的定性是：**缺少导出审计**，而不是“绕过既有赛事级权限”。
   - 原第 9 项“移除空 MIME 放行”在当前代码里应和**文件内容签名校验**一起看。单纯依赖 MIME 本身不可靠；这次已改为优先做扩展名 + magic bytes 校验。

3. **原清单漏掉了几个更严重的当前问题**
   - `registrations` 存在 `Registrations coach access` 策略，条件里含 `OR EXISTS (SELECT 1 FROM public.admin_users)`；只要库里有管理员记录，这部分条件就恒真，风险高于原第 4 项的“需确认”。
   - `admin_users` 当前有 `Admin users full access` + 对 `anon/authenticated` 授权，属于独立高危项。
   - `/api/player-share/[token]` 在本次修复前会把整份 `registration` 返回给匿名页，超出了“仅当前分享对象”所需的最小数据范围。
   - `/api/init-admin` 当前可匿名访问并返回管理员手机号列表，属于额外信息泄露面。
   - **补充实测差异**：目标 MemFire 环境与 `docs/sql/actual-supabase-schema.sql` 不一致。2026-03-11 实测时，`admin_users`、`player_share_tokens`、`registrations`、`registration_settings` 四张表的 **RLS 实际处于关闭状态**，主要依赖表级 GRANT 直接放开。

## 本次已落地的无破坏优化

- 分享 token、队员临时 ID、上传对象名改为基于安全随机值生成，不再使用 `Date.now() + Math.random()`
- 匿名 `/api/player-share/[token]` 改为服务端受控读取/更新，并将响应收缩为“队伍摘要 + 当前分享对象 + 必要配置”
- 教练端生成/轮询分享链接改为走受控 API（`/api/portal/registrations/[id]/share-links`），报名页不再浏览器直连 `player_share_tokens`
- 分享 API 增加 `Cache-Control: no-store`
- 生产环境下拦截 `/api/debug/*` 与 `/api/test-*`
- 门户上传接口接入与管理端一致的扩展名/MIME/文件签名校验
- 上传/删除接口不再把底层存储错误明文回传给前端
- 已补充可执行 SQL 草案：
  - `docs/sql/security-tighten-admin-users-and-share-tokens.sql`
  - `docs/sql/security-tighten-registrations-and-settings.sql`
  - `docs/sql/security-privatize-sensitive-storage-buckets.sql`
  - `docs/sql/security-create-audit-log-table.sql`
- 已在目标 MemFire 环境执行下一阶段收口：
  - `admin_users`：已开启 RLS，匿名读取已阻断
  - `player_share_tokens`：已开启 RLS，匿名读取已阻断
  - `registrations`：已开启 RLS，匿名读取已阻断；管理员全量可管，教练仅可管自己的报名
  - `registration_settings`：已开启 RLS，匿名读取已阻断；管理员可管，认证用户仅可读可见赛事
- 已在目标 MemFire 环境执行 Storage 收口：
  - `registration-files`：已改为私有 bucket
  - `player-photos`：已改为私有 bucket
  - `team-documents`：已改为私有 bucket
- 管理端依赖 `registrations` / `registration_settings` 的核心 API 已切换到 service role，避免 `admin-session + anon client` 在新 RLS 下失效
- 新增受控文件访问：
  - `/api/storage/object`：统一代理敏感文件读取
  - `/api/player-share/[token]/upload`：公开分享页受控上传队员照片
- 已为部分高敏响应补充 `Cache-Control: no-store`：
  - `/api/admin/me` `GET/PUT`
  - `/api/registrations/[id]` `GET`
- 已为高风险接口补充应用层窗口限流（内存型）：
  - `/api/player-share/[token]` `GET/PUT`
  - `/api/player-share/[token]/upload`
  - `/api/storage/object`（带 `share_token` 的公开访问）
  - `/api/auth/admin-session` `POST`
  - `/api/events/[id]/registrations/export` `POST`
- 已补充审计日志基础能力（best-effort，不影响现有功能）：
  - 新增 `lib/security-audit-log.ts`
  - 已在导出、单条报名详情查看、显式私有文件下载、审核、管理员/教练密码重置等入口接入审计写入
  - 目标环境已执行 `docs/sql/security-create-audit-log-table.sql`
  - 若其他环境尚未执行该 SQL，当前会安全降级为“跳过写日志”，不会阻断主流程

## 本次未直接变更的项

以下项**确实需要处理**，但直接修改会触及现有功能边界或线上数据库策略，需在单独变更中推进：

- 为导出、审核、账号管理补齐真正可追溯的审计日志表
  - 设计建议见 `docs/md/security/audit-log-guidance.md`
- 为 Supabase Auth 直连登录补平台级限流，并评估网关/分布式限流
- 评估身份证号等高敏字段的脱敏/加密要求

## 背景

该系统处理队员身份证号、照片、联系方式等敏感个人信息。以下清单基于代码审计结果，按严重程度排列，供逐项排查。

---

## 🔴 严重（数据可被公开访问）

### 1. Storage Bucket 敏感文件公开可读
- **位置**: `docs/sql/storage-policies.sql` + Supabase Dashboard
- **问题**: 目标环境在整改前曾将 `registration-files`、`player-photos`、`team-documents` 设为 `public: true`，任何人知道文件 URL 即可直接下载队员照片和队伍文档
- **目标环境状态（2026-03-11）**: 三个敏感 bucket 已改为私有；直接访问旧式 `/storage/v1/object/public/...` URL 现返回 `400`
- **当前代码状态**: 新上传文件已改为返回 `/api/storage/object` 受控访问 URL；公开分享页上传改为走 `/api/player-share/[token]/upload`
- **兼容性修复（2026-03-12）**: 管理端报名详情页、审核页现已在渲染时把历史 public storage URL、旧相对路径统一转换为 `/api/storage/object`，兼容私有 bucket 收口后的旧数据；已实测恢复 `team_logo`/队员证件照预览与图片详情弹窗
- **排查**: 保留 `event-posters` 为公开桶；继续确认是否还存在硬编码 public storage URL 的历史数据
- **建议**: 保持 `registration-files`、`player-photos`、`team-documents` 私有，不要回退到 public bucket

### 2. player_share_tokens 表 RLS 过于宽松
- **位置**: `docs/sql/actual-supabase-schema.sql:1955-1962`
- **问题**: 存在两条策略允许任何人读取和更新所有 share token：
  ```sql
  "Anyone can read share token by token" → FOR SELECT USING (true)
  "Anyone can update share token" → FOR UPDATE USING (true)
  ```
  这意味着未认证用户可以枚举所有 token 并修改队员数据
- **排查**: 在 Supabase Dashboard → Authentication → Policies 检查 `player_share_tokens` 表的策略
- **当前代码状态**:
  - `/api/player-share/[token]` 已改为服务端使用 service role 按 token 精确读取/更新，匿名页不再需要直连该表
  - 教练端生成/轮询分享链接也已改为通过 `/api/portal/registrations/[id]/share-links` 走服务端受控访问
- **目标环境状态（2026-03-11）**: 已开启 RLS，并移除匿名访问；匿名 Supabase 客户端再次探测已返回 `42501 permission denied`
- **建议**: 保持当前策略，不要重新向 anon 暴露该表

### 3. registration_settings 表公开可读
- **位置**: 检查 Supabase Dashboard 中 `registration_settings` 的 RLS 策略
- **问题**: 如果存在 `FOR SELECT USING (true)` 策略，任何人可读取所有赛事的报名配置（含字段结构、时间设置）
- **目标环境状态（2026-03-11）**: 已开启 RLS；匿名客户端再次探测已返回 `42501 permission denied`
- **当前代码状态**: 管理端设置相关核心 API 已切到 service role；教练端继续通过认证态 Supabase session 读取可见赛事配置
- **建议**: 保持“管理员可管、认证用户仅可读可见赛事”的当前策略，避免重新对 anon 放开

### 4. registrations 表 RLS 策略
- **位置**: `docs/sql/actual-supabase-schema.sql` 中 registrations 相关策略
- **问题**: Schema 快照中存在 `Registrations coach access` 策略，条件为 `coach_id IN (...) OR EXISTS (SELECT 1 FROM public.admin_users)`；只要 `admin_users` 表中有任意记录，这个条件就可能恒真，风险高于“待确认”
- **目标环境状态（2026-03-11）**: 已开启 RLS；匿名客户端再次探测已返回 `42501 permission denied`
- **当前代码状态**: 管理端报名列表/详情/导出等核心 API 已切到 service role；教练端仍通过认证态 Supabase session 按 `coach_id` 隔离访问
- **建议**: 保持“管理员全量可管、教练仅可管自己报名”的当前策略，后续如继续收紧需先补更细粒度的业务授权模型

---

## 🟠 高危（认证/授权缺陷）

### 5. 分享链接 Token 生成不安全
- **位置**: `app/portal/events/[id]/register/page.tsx` 中 token 生成逻辑
- **问题**: 使用 `Date.now() + Math.random()` 生成 token，可预测、可枚举
- **当前代码状态**: 已改为 `lib/security-random.ts#generateSecureId('share')`
- **建议**: 保持服务端受控生成，不要回退到浏览器侧可预测方案

### 5A. admin_users 表匿名/广泛开放
- **位置**: 目标环境 + `docs/sql/security-tighten-admin-users-and-share-tokens.sql`
- **问题**: 该表在目标环境原本 RLS 关闭，`anon/authenticated` 具有表级权限
- **目标环境状态（2026-03-11）**: 已开启 RLS；匿名读取已阻断；管理员认证态仅允许读取自己的行
- **建议**: 后续如要修改管理员相关逻辑，优先继续走 service role，不要再依赖匿名 server client 读 `admin_users`

### 6. 导出接口无赛事级权限校验
- **位置**: `app/api/events/[id]/registrations/export/route.ts`
- **问题**: 只检查了 `getCurrentAdminSession()`，任何管理员可导出任意赛事的全部报名数据（含身份证、照片等）
- **排查**: 确认是否需要赛事级别的权限隔离
- **建议**: 如果业务上所有管理员确实可以管理所有赛事，至少添加导出操作的审计日志

### 7. 调试接口在生产环境可能暴露
- **位置**: `app/api/debug/*`、`app/api/test-*/*`
- **问题**: 部分接口通过 `NODE_ENV` 判断是否返回数据，但 `NODE_ENV` 可能配置不当
- **当前代码状态**: 已在 `middleware.ts` 中新增生产环境 404 拦截 `/api/debug/*` 与 `/api/test-*`
- **排查**: 确认生产部署时 middleware 已生效，并检查是否还有其他未纳入拦截的调试路由
- **建议**: 长期仍建议删除不再需要的调试端点

### 8. Service Role Key 使用范围
- **位置**: `app/api/upload/route.ts`、`app/api/portal/upload/route.ts`、`app/api/registrations/[id]/review/route.ts`
- **问题**: 多个 API 路由使用 Service Role Key 创建 Supabase 客户端（绕过 RLS），如果这些接口的认证检查有漏洞，攻击者可获得完整数据库访问权限
- **排查**: 逐一确认每个使用 Service Role Key 的接口是否有严格的认证检查

---

## 🟡 中等（需要关注）

### 9. 文件上传校验不严格
- **位置**: `app/api/portal/upload/route.ts:69`
- **问题**: 原实现仅校验扩展名和 MIME type，且 MIME 为空时允许上传
- **当前代码状态**: 管理端与门户上传都已改为扩展名 + MIME + magic bytes 校验；上传对象名也已改为安全随机值
- **建议**: 后续继续评估是否要进一步收紧“空 MIME + 正确签名”的兼容策略

### 10. 敏感数据明文存储
- **涉及字段**: `registrations.players_data` 中的身份证号、`coaches.phone`、`notifications.message` 中的驳回理由
- **问题**: 身份证号等 PII 以明文 JSON 存储在数据库中
- **当前代码状态**:
  - 管理端报名详情页、审核页当前直接显示完整 `id_number/idcard`，不再做页面级脱敏切换；这是出于减少管理员理解成本的产品取舍，不改变数据库/导出仍为明文的风险结论
  - 导出链路与数据库落盘形态未改；当前改动不影响原有审核/导出功能
- **排查**: 评估是否需要字段级加密（取决于合规要求）
- **建议**: 至少确保数据库连接使用 SSL，考虑对身份证号做脱敏存储

### 11. 无操作审计日志
- **问题**: 以下敏感操作没有日志记录：
  - 管理员导出报名数据
  - 管理员查看队员详细信息
  - 账号创建/删除/密码重置
  - 审核通过/驳回操作
- **当前代码状态**:
  - 已为以下入口接入 best-effort 审计日志写入：
    - `POST /api/events/[id]/registrations/export`
    - `GET /api/registrations/[id]`
    - `GET /api/storage/object`（仅 `download=1` 的显式私有文件下载）
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
  - 代码侧已新增 `docs/sql/security-create-audit-log-table.sql`；目标环境已完成建表与一次真实写入烟测
- **建议**: 下一步继续由安全工程师接手查询页、告警和留存策略，并视需要补齐登出/刷新会话等次级入口；详细范围、字段和告警建议见 `docs/md/security/audit-log-guidance.md`

### 12. 无接口限流
- **位置**: 所有 API 端点
- **问题**: 登录接口、token 访问接口、导出接口原本均无 rate limiting
- **当前代码状态**:
  - 已为 `/api/player-share/[token]` `GET/PUT`、`/api/player-share/[token]/upload`、`/api/storage/object?share_token=...`、`/api/auth/admin-session` `POST`、`/api/events/[id]/registrations/export` `POST` 增加应用层窗口限流，并返回标准限流响应头
  - `/auth/login` 当前仍由浏览器直接调用 Supabase Auth，应用侧无法完整拦截；现阶段还不等同于“登录链路已完全限流”
- **建议**: 后续在网关或平台层补齐真正分布式限流，尤其是 Supabase Auth 登录入口

### 13. 错误信息泄露内部细节
- **位置**: 多个 API 路由的 catch 块
- **问题**: 错误响应中包含 `uploadError.message` 等内部信息，可能暴露 bucket 名称、文件路径
- **当前代码状态**:
  - `/api/upload`、`/api/portal/upload` 已改为返回通用错误信息，详细错误仅保留在服务端日志
  - `/api/admin/me` 修改当前管理员密码失败时已改为返回通用错误信息，不再把底层 Auth 错误明文返回前端
  - `/api/portal/registrations/[id]/template-export`、`/api/events/[id]/registration-settings/template-preview` 失败时也已改为返回通用错误信息
- **建议**: 继续排查其他 API 路由是否仍会把内部错误对象直接下发给前端

### 14. CSRF 防护
- **问题**: 表单提交和 API 调用未使用 CSRF token，依赖 SameSite cookie
- **排查**: 确认 cookie 的 SameSite 属性设置；Next.js App Router 的 Server Actions 自带 CSRF 保护，但自定义 API routes 没有
- **建议**: 对关键写操作（审核、导出、账号管理）考虑添加 CSRF token

### 15. 密码策略过弱
- **位置**: `app/admin/account-management/page.tsx`、`app/api/admin/coaches/route.ts`
- **问题**: 最低 6 位密码，无复杂度要求，无密码历史记录
- **排查**: 确认 Supabase Auth 的密码策略配置

---

## 排查优先级建议

| 优先级 | 项目 | 预计影响 |
|--------|------|----------|
| P0 已处理 | #1 敏感 Storage bucket 公开访问 | 目标环境敏感 bucket 已私有化 |
| P0 已处理 | #2 share_tokens RLS 过松 | 目标环境匿名访问已阻断 |
| P0 已处理 | admin_users 匿名开放 | 目标环境匿名访问已阻断 |
| P0 已处理 | #3 registration_settings 公开可读 | 目标环境匿名访问已阻断 |
| P0 已处理 | #4 registrations 行级隔离缺失 | 目标环境匿名访问已阻断 |
| P1 尽快 | #7 调试接口 | 信息泄露 |
| P2 计划 | #5 #6 #8 认证加固 | 权限提升风险 |
| P3 改进 | #9-#15（除已部分处理的 #11 #12） | 纵深防御 |
