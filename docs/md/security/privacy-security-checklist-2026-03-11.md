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
- 已将残留自助注册页面直接收口为 `404`
  - `/auth/register`
  - `/auth/sign-up`
  - `/auth/sign-up-success`
- 已补充浏览器侧基线安全响应头
  - `Strict-Transport-Security`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`
  - `X-Permitted-Cross-Domain-Policies`
- 门户上传接口接入与管理端一致的扩展名/MIME/文件签名校验
- 门户端左侧导航已新增“账号设置”直接入口，并移除头像菜单里的同名入口，减少重复导航路径
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
  - `/api/auth/login` `POST`
  - `/api/auth/admin-session` `POST`
  - `/api/events/[id]/registrations/export` `POST`
- `/auth/login` 已切到受控 `POST /api/auth/login`
  - 登录页不再直接从浏览器调用 `supabase.auth.signInWithPassword()`
  - 服务端登录响应已补 `Cache-Control: no-store`
  - 当前已具备应用侧基础限流与审计写入；仍需网关/平台层分布式限流
- Excel 导入/导出链路已移除 `xlsx`
  - 账号导入、报名导出、前端模板下载已统一切到 `exceljs`
  - 教练账号批量导入现仅接受 `.xlsx`，不再接受遗留 `.xls`
- 已新增可执行平台安全核对脚本
  - `pnpm security:check`
  - 当前会检查 `auth/v1/settings`（如 `disable_signup` / `mfa_enabled`）以及 `public.security_audit_logs` 是否可读；其中 `mfa_enabled` 仅作为环境信号，不等价于“控制台里有一个可切换总开关”
  - 当前也会用匿名 key 对 `admin_users`、`registrations`、`registration_settings`、`player_share_tokens` 做抽样读取探测
  - 最小密码长度与平台复杂度规则仍需结合控制台人工复核
- 运行时依赖已完成首轮安全更新
  - `next` 已升级到 `15.5.10`
  - `react` / `react-dom` 已升级到 `19.2.1`
  - `jsonwebtoken` 已升级到 `9.0.3`
  - 已通过 `pnpm.overrides` 将 `minimatch` 固定到 `3.1.4`
  - `2026-03-13` 本地复核时 `pnpm audit --prod` 已恢复为 `0` 个漏洞
- 已补充审计日志基础能力（best-effort，不影响现有功能）：
  - 新增 `lib/security-audit-log.ts`
  - 已在导出、单条报名详情查看、显式私有文件下载、审核、管理员/教练密码重置等入口接入审计写入
  - 已新增超级管理员只读查询入口 `GET /api/admin/security-audit-logs`
  - 目标环境已执行 `docs/sql/security-create-audit-log-table.sql`
  - 若其他环境尚未执行该 SQL，当前会安全降级为“跳过写日志”，不会阻断主流程

## 本次未直接变更的项

以下项**确实需要处理**，但直接修改会触及现有功能边界或线上数据库策略，需在单独变更中推进：

- 为导出、审核、账号管理补齐真正可追溯的审计日志表
  - 设计建议见 `docs/md/security/audit-log-guidance.md`
- 在应用侧登录路由已补基础限流后，继续评估网关/分布式限流
- 评估身份证号等高敏字段的脱敏/加密要求

## 2026-03-13 商用发布补充结论

基于 2026-03-13 的代码复核与 `pnpm audit --prod` 结果，补充以下发布判断与处理状态：

- `next@15.5.3`、`react@19.1.1`、`react-dom@19.1.1`、`xlsx@0.18.5` 曾是明确的商用发布阻断项
  - 当前代码状态：已升级 `next/react/react-dom`、`jsonwebtoken`，移除 `xlsx`，并通过 override 修复 `minimatch`
  - 本地验证结果：`pnpm audit --prod` 当前为 `0` 个漏洞
- 登录链路此前由浏览器直连 Supabase Auth，应用侧无法完整拦截爆破/撞库
  - 当前代码状态：已改为 `POST /api/auth/login` 受控登录，并接入 no-store + 应用层限流 + 审计
  - 当前代码状态：登录路由现已额外回看 `security_audit_logs` 中最近 15 分钟的失败记录，按 IP 和手机号掩码执行跨实例阈值拦截，不再只依赖单实例内存 `Map`
  - 当前代码状态：已修正应用层登录限流的计数时机，成功登录不再消耗爆破预算；只有失败凭证尝试才会累积 `auth:login` 失败次数，成功后会清空该手机号 + IP 的内存窗口
  - 剩余风险：仍不是网关/WAF 级边缘限流，不能等同于平台级完全收口，但比单实例限流明显更稳
  - **当前业务决策（2026-03-13）**：现阶段部署仍使用 Zeabur 预览域名，暂不在当前服务器条件下继续追这项；若后续迁移到新服务器或可控网关，需重新补做验证
- 目标环境 Auth Provider 已关闭公开注册
  - 目标环境复核（2026-03-13）：`/auth/v1/settings` 返回 `disable_signup=true`
  - 发布判断：当前状态与“仅由超级管理员开设账号”的实际业务流程一致
- 审计日志当前仍是 best-effort
  - 当前代码状态：敏感入口已有写入；若 `security_audit_logs` 缺表仍会降级跳过
  - 当前代码状态：已补充超级管理员只读页面 `/admin/security-audit-logs`，页面对外名称改为“日志查询”，可直接按时间、操作人、动作、结果筛查日志
  - 当前代码状态：日志查询入口已补“简化版”视图，默认展示中文动作、对象、结果和一句话说明，把 `id / request_id / metadata` 收到技术详情里，并新增“审批记录”“账号登录”等快捷筛选
  - 当前代码状态：列表已支持按 `actor_id / target_user_id` 回查并显示管理员/教练的姓名与手机号；登录相关动作统一按“账号登录”展示，审批记录会尽量补出报名对象名称与通过/驳回结果，降低无网安背景的使用门槛
  - 当前代码状态：已移除列表中的重复信息列，并让“一句话说明”只保留人物、对象和失败原因/审核结论，不再重复展示通用结果文案
  - 当前代码状态：日志查询现已按“关键操作轨迹”重构，默认只展示审批、导出、账号变更、资料访问等关键动作；账号登录记录已从该页主列表移除
  - 当前代码状态：列表主视角已从“技术日志”切换为“时间 / 操作人 / 关键操作 / 影响对象 / 操作轨迹”，详情弹窗也优先展示对象与轨迹，再下沉技术字段
  - 当前代码状态：日志查询页已移除“关键操作轨迹 / 这个页面适合追什么”等说明性文案，打开后直接进入“常用关键范围 + 筛选 + 列表”工作台视图
  - 当前代码状态：管理端首页、账号管理、日志查询、项目管理已统一切到与教练端相似的可折叠左侧导航；超级管理员可见“赛事管理 / 账号管理 / 日志查询 / 项目管理”，普通管理员只显示“赛事管理 / 账号管理”
  - 当前代码状态：管理端侧边栏现会复用当前标签页内最近一次确认过的管理员资料缓存，切换到“日志查询 / 项目管理”等页面时不再短暂闪掉超级管理员菜单
  - 当前代码状态：`/admin/security-audit-logs` 与 `/admin/project-management` 这类本就只允许超级管理员访问的页面，现已在首屏直接保留超级管理员导航，不再先按普通管理员菜单渲染
  - 当前代码状态：管理员头像菜单已移除与左侧导航重复的“前往账号管理”入口，菜单仅保留账号信息与退出登录，减少重复操作入口
  - 目标环境复核（2026-03-13）：已通过 service role 直接查询确认 `public.security_audit_logs` 表存在且可读
  - 发布判断：对正式商用发布，这仍低于“强可追溯”基线
- 身份证号等高敏 PII 仍为明文存储/导出链路
  - 当前代码状态：未在本轮改变落库形态，但管理员审核页、详情页、公开分享页读取高敏数据时已显式使用 `cache: 'no-store'`，管理员报名列表 / 报名设置 API 也已返回 `Cache-Control: no-store`，私有文件访问 `/api/storage/object` 对私有 bucket 已返回 `no-store`
  - 当前代码状态：管理员导出 ZIP、公开分享 API、公开分享上传响应、公开分享页和私有文件访问链路已统一补充 `X-Robots-Tag: noindex, nofollow, noarchive`；其中导出 ZIP 也已补 `Cache-Control: no-store`
  - 当前代码状态：管理员报名列表 API 和门户赛事详情页中的“我的报名摘要”已不再额外返回整包 `players_data`，仅保留列表/摘要渲染必需字段
  - 发布判断：需由业务/法务/安全共同明确脱敏或加密要求
- CSRF 与平台侧密码策略已完成本轮最低可用收口
  - 当前代码状态：关键密码入口已统一到应用层共享策略，要求至少 10 位且包含大小写字母与数字；教练改密也已切到受控 API；受保护 API 的危险方法已加同源校验
  - 当前代码状态：同源校验现已优先识别 `x-forwarded-host` / `x-forwarded-proto`，兼容 Zeabur / 反向代理场景下外部域名与内部服务主机名不一致导致的误判 `403 Forbidden`
  - 当前代码状态：浏览器安全头已补充基础 CSP（`base-uri/form-action/frame-ancestors/object-src`）与 `Origin-Agent-Cluster`
  - 当前代码状态：根据当前业务决策，已移除管理员端内置 TOTP MFA 绑定与登录验证码流程，管理员与教练均保持纯密码登录，以避免额外使用门槛影响现有用户习惯
  - 目标环境复核（2026-03-13）：`/auth/v1/settings` 已确认 email 登录开启、`disable_signup=true`、`mfa_enabled=false`；MemFire 控制台已人工确认最小密码长度已调为 `10`
  - 本地回归验证（2026-03-13）：已同步修正密码策略上线后失效的审计用例，并把教练批量导入审计测试切到真实 `.xlsx`/ExcelJS 解析路径；`pnpm exec vitest run` 当前为 `124 passed`
  - 剩余风险：当前同源校验仍以 `Origin` / `Sec-Fetch-Site` 为主，尚未引入独立 CSRF token；平台侧目前仅确认“最小长度 10”，复杂度规则仍主要依赖应用层；历史 6 位密码账号不会被平台自动强制失效
  - 发布判断：浏览器侧 CSRF 风险已明显下降，但若要达到更高等级要求，仍可继续补 token 方案

## 2026-03-13 正式商用前最终人工确认清单

以下 5 项不再是“低风险代码优化”，而是正式商用前应由产品/运维/安全共同确认的最终清单：

1. **Auth Provider 配置是否符合真实业务**
   - 当前已确认：email 登录开启、最小密码长度已设为 `10`、`disable_signup=true`
   - 当前状态：`/auth/v1/settings` 仍返回 `mfa_enabled=false`
   - 当前业务决策（2026-03-13）：当前版本不推广管理员 MFA，保持纯密码登录；这不是代码待办，而是已知接受风险
   - 若后续安全等级要求提高，可再评估仅对超级管理员或高权限管理员恢复 MFA

2. **历史弱密码账号是否需要强制升级**
   - MemFire 的最小长度配置只影响“新设密码/改密码/重置密码”
   - 历史 6 位密码账号当前仍可继续登录，这是平台正常行为
   - 若商用要求统一强度，需补“登录后强制改密”或统一密码轮换方案
   - **当前业务决策（2026-03-13）**：该项暂不纳入本轮低风险改造，由超级管理员后续逐个处理；这属于已知接受风险，不等于风险消失

3. **审计日志是否达到可运营、可告警、可留存**
  - 当前已确认 `public.security_audit_logs` 存在，代码也已接入关键入口写入
  - 已新增超级管理员只读 API 和页面，可直接分页查看最近日志
  - 但仍缺页面级查询、告警规则、留存周期和责任人

4. **登录链路是否有平台级或网关级限流**
   - 当前代码侧已具备应用内存限流 + 基于 `security_audit_logs` 的跨实例失败阈值拦截
   - 但正式商用前仍建议在 WAF / API Gateway / 边缘层确认真正的入口级限流策略
   - **当前业务决策（2026-03-13）**：该项在现阶段 Zeabur 预览域名环境中先记录为未关闭风险；后续若迁移服务器或前置 Cloudflare / WAF，再重新确认

5. **高敏 PII 的合规处理方案是否明确**
   - 当前身份证号等字段仍为明文存储/导出
   - 是否需要脱敏、加密、缩小导出范围，应由业务/法务/安全共同定版

## 2026-03-13 当前最短人工操作清单

若目标是尽快推进到“更接近正式商用”的状态，优先按下面 2 项执行：

1. **确认网关/边缘层分布式限流**
   - 当前应用代码已有基础限流，并已补充基于 `security_audit_logs` 的跨实例失败阈值拦截
   - 正式商用前仍应在 WAF / API Gateway / CDN 边缘层确认登录链路和高频导出链路的策略
   - **当前业务决策（2026-03-13）**：因现阶段仍使用 Zeabur 预览域名，先保留为待后续服务器迁移时复核的基础设施项

2. **确认高敏 PII 合规方案**
   - 当前身份证号等字段仍为明文落库与导出
   - 需明确是否接受现状，或要求后续做脱敏/加密/导出范围收缩

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
  - 2026-03-13 再次通过 service role 读取 `public.security_audit_logs` 验证表仍存在
- **建议**: 下一步继续由安全工程师接手查询页、告警和留存策略，并视需要补齐登出/刷新会话等次级入口；详细范围、字段和告警建议见 `docs/md/security/audit-log-guidance.md`

### 12. 无接口限流
- **位置**: 所有 API 端点
- **问题**: 登录接口、token 访问接口、导出接口原本均无 rate limiting
- **当前代码状态**:
  - 已为 `/api/player-share/[token]` `GET/PUT`、`/api/player-share/[token]/upload`、`/api/storage/object?share_token=...`、`/api/auth/login` `POST`、`/api/auth/admin-session` `POST`、`/api/events/[id]/registrations/export` `POST` 增加应用层窗口限流，并返回标准限流响应头
  - 登录页已切到受控 `/api/auth/login`；应用侧可以拦截大部分凭证尝试，但仍不等同于“登录链路已完全限流”
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
- **当前代码状态**:
  - `middleware.ts` 已对受保护 API 的 `POST/PUT/PATCH/DELETE` 增加同源校验，来源 `Origin` 与当前站点不一致时直接返回 `403`
  - 额外参考 `Sec-Fetch-Site`，默认阻断明显的跨站危险请求
- **剩余风险**:
  - 当前尚未引入独立 CSRF token
  - 对不带 `Origin` / `Sec-Fetch-Site` 的非浏览器请求仍保留兼容放行
- **建议**: 如果后续要进一步收紧到更高标准，可在关键表单和高价值管理操作上继续补 CSRF token

### 15. 密码策略过弱
- **位置**: `app/admin/account-management/page.tsx`、`app/api/admin/coaches/route.ts`
- **问题**: 最低 6 位密码，无复杂度要求，无密码历史记录
- **排查**: 确认 Supabase Auth 的密码策略配置
- **当前代码状态**:
  - 管理员创建、重置、自助改密，以及教练创建、重置、批量导入，均已统一使用 `lib/password-policy.ts`
  - 当前应用层策略为“至少 10 位，且需同时包含大写字母、小写字母和数字”
  - 批量导入教练临时密码已调整为“手机号后 6 位 + `Aa1!`”
  - 教练自助改密已改为 `PUT /api/portal/me/password` 服务端受控更新，不再仅依赖浏览器直连 `supabase.auth.updateUser`
  - 目标环境复核（2026-03-13）：MemFire 控制台已人工确认最小密码长度为 `10`
- **剩余风险**:
  - 平台侧目前仅确认“最小长度 10”，未证明存在等价复杂度规则
  - 历史 6 位密码账号不会自动被平台强制失效
  - 仍无密码历史记录/复用限制

### 16. 运行时依赖存在已知安全公告
- **位置**: `package.json` + `pnpm-lock.yaml`
- **问题**: 2026-03-13 复核时，运行时依赖里曾存在 `next@15.5.3`、`react@19.1.1`、`react-dom@19.1.1`、`xlsx@0.18.5` 等已知公告
- **当前代码状态**:
  - 已升级 `next` 至 `15.5.10`
  - 已升级 `react` / `react-dom` 至 `19.2.1`
  - 已升级 `jsonwebtoken` 至 `9.0.3`
  - 已移除 `xlsx`，Excel 导入/导出改走 `exceljs`
  - 已通过 `pnpm.overrides` 将 `minimatch` 固定到 `3.1.4`
- **建议**: 保留 `pnpm audit --prod` 作为发布前检查项，并优先关注 App Router、文件解析、鉴权相关依赖

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
