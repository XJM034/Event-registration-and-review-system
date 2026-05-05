# 安全说明

本文档描述的是**当前仓库实际实现**下的安全边界、已落地控制、已知风险和上线前检查项，不是通用模板。

最后更新：2026-05-05

## 当前安全模型

### 认证与会话

- 教练端使用 **Supabase Auth Session**
- 管理端使用 **双会话模型**
  - 先通过 Supabase Auth 完成登录
  - 再由 `/api/auth/admin-session` 生成独立的 `admin-session`
- 管理员会话当前包含三份状态
  - HttpOnly Cookie：`admin-session`
  - 可读 Cookie：`admin-session-tab`
  - `sessionStorage.tab_admin_session_token`
- 管理端 API 请求会由 `components/admin-api-session-bridge.tsx` 自动补 `x-admin-session-token`

### 路由保护

当前 `middleware.ts` 的核心保护规则：

- 公开路径：`/auth/login`、`/auth/forgot-password`、`/api/player-share/*`、`/player-share/*`、`/init`
- `/portal/*`：要求教练 Supabase Session
- `/events/*`、`/admin/*`：要求管理员身份
- `/admin/project-management`、`/api/project-management/*`：当前允许所有管理员访问
- `/api/admin/coaches*`、`/api/admin/admins*`：要求超级管理员

注意：

- 管理员鉴权并不只依赖 `admin-session`，`lib/auth.ts#getCurrentAdminSession()` 仍保留了对 Supabase 管理员会话的 fallback
- `admin-session-tab` 和 `sessionStorage` 中的令牌可被前端 JS 读取，因此 **XSS 风险会直接影响管理端身份安全**

## 当前环境变量要求

### 必需

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` 或 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

### 可选

- `ADMIN_SESSION_SECRET`
  - 如配置，则优先用于签发/校验管理员旁路会话
  - 如未配置，当前代码会回退使用 `JWT_SECRET`
- `VERCEL_URL`
  - 用于 `metadataBase`

### 说明

- `JWT_SECRET` **不是只在开发环境使用**
  - 当前它会参与管理员旁路会话签名
- `SUPABASE_SERVICE_ROLE_KEY` 用于服务端敏感操作
  - 账号管理
  - 审核写通知
  - 管理端上传
  - 门户上传
- `NEXT_PUBLIC_API_URL` 当前主代码未直接依赖，不是生产必填项

## 已落地的安全控制

### 1. 管理端会话签名

- `lib/admin-session.ts` 使用 HMAC-SHA256 对管理员会话令牌签名
- `middleware.ts` 与 `lib/auth.ts` 都会校验令牌有效期
- 权限判断以数据库中的 `admin_users.is_super` 为准，避免 token 中旧权限长期生效

### 2. 安全响应头

当前 `next.config.ts` 已设置：

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `Content-Security-Policy`（当前为基础策略）
- `productionBrowserSourceMaps: false`
- `poweredByHeader: false`

当前 CSP 还不是完整的脚本级策略。前端一旦出现 XSS，管理端可读令牌仍然敏感。

### 3. 上传接口保护

#### 管理端上传：`/api/upload`

- 要求管理员会话
- 使用 `SUPABASE_SERVICE_ROLE_KEY` 上传
- 当前只允许 bucket：
  - `event-posters`
  - `team-documents`
- 包含：
  - 扩展名校验
  - MIME 校验
  - 文件签名校验
  - 20MB 限制
  - 删除接口路径合法性检查

#### 门户上传：`/api/portal/upload`

- 要求教练 Supabase Session
- 使用 `SUPABASE_SERVICE_ROLE_KEY` 上传
- 允许 bucket：
  - `player-photos`
  - `registration-files`
  - `team-documents`
- 当前包含：
  - 扩展名校验
  - MIME 校验
  - 文件签名校验
  - 20MB 限制

注意：

- 上传接口会根据 bucket 是否私有，返回受控对象 URL 或 public URL
- `docs/sql/create-buckets-simple.sql` 中的 4 个 bucket 当前都被设置为 `public=true`

### 4. 账号管理保护

- 超级管理员才能访问账号管理 API
- 删除管理员时有“不能删自己 / 不能删最后一个超级管理员 / 不能删有审核记录的管理员”保护
- 删除教练时会检查报名状态，避免误删仍在进行中的业务账号
- 教练启停通过 Supabase `ban_duration` 控制

### 5. 调试接口的现状

- `/api/debug/*` 当前有 `NODE_ENV === 'production'` 的 404 保护
- `/api/test-*` 系列接口当前也有 `NODE_ENV === 'production'` 的 404 保护
- `/api/init-admin` 当前不会真的初始化账号，但仍会返回管理员列表和提示信息

### 6. 公开分享上传

- 当前存在 `POST /api/player-share/[token]/upload`
- 该入口会校验分享 token、报名状态、截止时间、bucket、文件签名、大小限制和 rate limit
- 后续改动不要回退到匿名页复用 `/api/portal/upload`

## 当前已知风险与不一致

以下内容并非“理论建议”，而是**当前代码中确实存在**、文档需要明确告知的点。

### 高优先级

1. **生产构建仍忽略 lint / TypeScript 错误**
   - `next.config.ts` 仍配置了：
     - `eslint.ignoreDuringBuilds = true`
     - `typescript.ignoreBuildErrors = true`
   - 风险：类型错误和明显问题可能直接进入生产

2. **管理端存在可读管理员令牌**
   - `admin-session-tab` Cookie 和 `sessionStorage.tab_admin_session_token` 都可被前端脚本读取
   - 风险：一旦发生 XSS，管理端身份更容易被利用
   - 建议：继续加强脚本级 CSP，并持续避免内联脚本和不可信 HTML 注入

3. **不要在仓库文档中保存真实联调账号口令**
   - SQL 初始化脚本里的默认账号可用于全新本地环境
   - 当前测试环境的真实口令应通过受控交接渠道获取，不应写入 `README.md`、`CLAUDE.md` 或 `AGENTS.md`

4. **测试/初始化入口仍留在仓库**
   - `app/test-login/page.tsx` 仍存在，但已被 `middleware.ts` 重定向到 `/auth/login`
   - `app/init/page.tsx` 仍存在，且调用 `/api/init-admin` 的方法与后端不一致
   - 风险：容易误导测试和运维；生产环境应明确清理或限制

5. **登录页底部仍展示旧默认密码提示**
   - `app/auth/login/page.tsx` 仍提示 SQL 默认口令
   - 但当前管理端已支持新建账号和重置密码，真实测试环境口令可能已变化

### 中优先级

1. **`/api/test-*` 诊断接口已由 middleware 在生产禁用，仍建议定期复核**
   - 如：
     - `/api/test-connection`
     - `/api/test-env`
     - `/api/test-memfire`
     - `/api/test-optimized-portal`
     - `/api/test-portal-simulation`
   - 当前 `middleware.ts` 中 `NODE_ENV === 'production'` 时会返回 404

2. **门户上传与管理端上传都已做文件签名校验，仍需关注 bucket 隐私策略**
   - `docs/sql/create-buckets-simple.sql` 会创建 public bucket
   - 如需更严格隐私保护，应改为 private bucket + 受控对象读取

3. **隐私文件可能依赖公开 bucket / 公开 URL**
   - `player-photos`、`team-documents`、`registration-files` 当前简单脚本都设为 public
   - 如需更严格隐私保护，应改为 private bucket + 签名 URL

4. **日志仍较多**
   - 中间件、导出、分享页 API、诊断接口里仍有大量 `console.log`
   - 当前未发现把 `SUPABASE_SERVICE_ROLE_KEY`、`JWT_SECRET` 直接写进日志
   - 但仍建议上线前做脱敏和降噪

## 生产环境建议

### Secret 管理

- 不要把真实 `.env.local` / `.env.production.local` 提交进 Git
- 优先使用部署平台 Secret 管理，而不是把生产 env 文件放进仓库
- 如任何密钥曾在聊天、截图、Issue、PR 评论中完整暴露，应立即轮换：
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_*`
  - `JWT_SECRET`
  - `ADMIN_SESSION_SECRET`（若存在）

### 上线前至少应完成

1. 删除或限制以下入口：
   - `app/test-login/page.tsx`
   - `app/init/page.tsx`
   - `/api/init-admin`
2. 去掉登录页中写死的测试口令提示
3. 评估 `admin-session-tab` / `sessionStorage` 方案，并继续加强脚本级 CSP
4. 审核 bucket 是否继续公开
5. 修掉当前 TypeScript / ESLint 问题后，取消忽略构建错误

## 部署前检查清单

### Secret 与配置

- [ ] `NEXT_PUBLIC_SUPABASE_URL` 已正确配置
- [ ] Public key 已正确配置（两个别名至少一个有效）
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 已正确配置且仅服务端可用
- [ ] `JWT_SECRET` 已配置为强随机值
- [ ] 如有需要，已单独配置 `ADMIN_SESSION_SECRET`
- [ ] `.env.local`、`.env.production.local`、机器级 env 文件未提交到仓库

### 认证与路由

- [ ] 管理员登录、刷新、登出流程验证通过
- [ ] 教练登录流程验证通过
- [ ] `/portal/*`、`/events/*`、`/admin/*` 权限边界符合预期
- [ ] 超级管理员限制路径与 API 已验证

### 上传与存储

- [ ] 所有 bucket 已创建
- [ ] bucket 公开/私有策略已按业务确认
- [ ] 管理端上传、门户上传、删除上传都已验证
- [ ] 如涉及隐私文件，已确认是否需要改为私有 bucket + 签名 URL

### 代码与部署

- [ ] 生产环境已禁用测试/诊断入口
- [ ] 已评估并处理控制台调试日志
- [ ] `next.config.ts` 的忽略构建错误策略已复核
- [ ] 已完成 `pnpm build`

## 应急处理

如怀疑泄露或被滥用，优先按以下顺序处理：

1. 轮换 `SUPABASE_SERVICE_ROLE_KEY`
2. 轮换 `JWT_SECRET` / `ADMIN_SESSION_SECRET`
3. 让所有管理员重新登录，使旧 `admin-session` 失效
4. 检查 `admin_users`、`coaches`、`notifications`、`player_share_tokens` 相关日志与最近操作
5. 暂时下线 `/api/test-*`、`/api/init-admin`、测试页面

## 参考文档

- 详细审计报告：[docs/md/security/pre-launch-security-audit.md](docs/md/security/pre-launch-security-audit.md)
- 项目实现说明：[CLAUDE.md](CLAUDE.md)
