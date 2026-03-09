下面是我对仓库进行全面审查后整理的“上线前最终核查与待优化清单”。我按“必须修复(P0) / 高优先级(P1) / 中优先级(P2) / 低优先级(P3)”分级，尽量给出明确的文件定位、风险说明与修复建议，便于你逐项落地。

如果你希望，我可以按该清单逐条协助修复。

**必须修复（P0，安全/合规/高风险稳定性）**
- 管理后台会话与口令安全
  - 硬编码 JWT 秘钥后备值，生产风险极高
    - with-supabase-app/lib/auth.ts:7
    - 问题：`JWT_SECRET`使用默认'your-secret-key'，一旦未配置环境变量，任意人可伪造合法 token。
    - 建议：移除默认值，强制从环境读取；生产环境必须设置强随机的`JWT_SECRET`（>=32字节）。
  - 管理员登录“临时跳过密码验证”的后门逻辑
    - with-supabase-app/lib/auth.ts:61-65
    - 问题：密码为`admin123`时直接通过，后门风险；还打印了输入密码和hash（泄露敏感信息）。
    - 建议：删除绕过逻辑；删除敏感日志（下文统一处理）。强制使用 bcrypt 校验。
  - 中间件中对管理员 JWT 未校验签名，仅用 atob 检查 exp
    - with-supabase-app/middleware.ts:43-55, 127-139
    - 问题：未使用`jwt.verify`校验签名，任何人可自行构造JWT绕过鉴权。
    - 建议：中间件内用`jsonwebtoken.verify(token, JWT_SECRET)`校验签名与 exp，再决定放行。
  - 管理员初始化 API 暴露在生产环境且无保护
    - with-supabase-app/app/api/init-admin/route.ts:4-66
    - 问题：GET /api/init-admin 可创建默认管理员（密码：admin123），生产环境后门。
    - 建议：彻底移除该 API 和相关页面，或仅在开发环境启用并加强保护（例如要求服务端密钥或仅在 NODE_ENV=development 时暴露）。页面 with-supabase-app/app/init/page.tsx 也应删除。
  - 在登录页面和测试页面暴露测试账户与密码
    - with-supabase-app/app/auth/login/page.tsx:278-281
    - with-supabase-app/app/test-login/page.tsx:整页
    - 建议：去掉测试账号文案、删除 test-login 页面，防止泄露测试口令与路径。

- Supabase 权限策略（RLS）设计存在极高风险
  - 文档中多处为“FOR ALL USING (true)”，意味匿名/任意用户可读写
    - with-supabase-app/docs/sql/database-setup.sql:93-118（示例策略）
    - with-supabase-app/docs/sql/complete-database.sql:208-259（Events/Admin等 FOR ALL USING true）
    - with-supabase-app/docs/sql/supabase-executed-sqls.sql:208-259（已执行版本）
    - 问题：这会导致未认证或普通用户也能访问和修改 admin_users、events、registration_settings、registrations 等敏感表。
    - 建议：
      - 明确区分“管理端”与“报名端”数据访问路径。管理端操作仅允许服务角色（service_role）或专用后端 API 执行。
      - 参照 with-supabase-app/docs/sql/fix-rls.sql 的方向，但要“配合服务端使用 Service Role Key”进行管理端读写；对前端（anon）严格限制为只读或与 auth.uid() 强绑定的写入。
      - 确认生产数据库最终有效的策略（不要仅参考 docs）。如已执行 supabase-executed-sqls.sql，则需再次修订策略，确保“FOR ALL USING (true)”不再出现在 admin 相关表上。
  - player_share_tokens 表对“任何人 SELECT/UPDATE”的策略极不安全
    - with-supabase-app/docs/sql/supabase-executed-sqls.sql:397-416
    - 问题：任意人可读取/修改所有分享 token 及填报数据，隐私泄露与破坏数据风险极高。
    - 建议：移除公共 SELECT/UPDATE 策略，改为服务端 API（使用 service_role 或受控 RPC）执行查询和更新；对前端匿名访问仅允许通过专用后端接口以白名单校验参数。

  - 服务端使用 anon key 执行管理敏感操作
  - with-supabase-app/lib/auth.ts:12-15
  - with-supabase-app/lib/supabase/server.ts:12-15
  - 问题：服务端使用`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`（公开 key）访问管理表，需要依赖宽松的 RLS，非常不安全。
  - 建议：
    - 新增“服务端专用 Supabase 客户端”读取`SUPABASE_SERVICE_ROLE_KEY`（服务端私密环境变量），仅在 Route Handlers/Server Actions 中使用；严禁暴露到客户端。
    - 管理端 API（/api/events、/api/registrations…）统一使用 service role 客户端，配合严格 RLS，实现“后端可信 + 前端严格受限”。

  - 分享链接 token 生成与校验机制不安全
  - 前端用`Date.now()+Math.random()`生成 token（可预测）
    - with-supabase-app/app/portal/events/[id]/register/page.tsx:462-474（两处）
    - 问题：token 可被撞库/预测。
    - 建议：由后端生成（使用`crypto.randomUUID()`或`crypto.randomBytes(32).toString('hex')`），并在数据库存储；客户端只拿到结果链接。
  - 分享 token 读写 API 直接使用客户端 Supabase（匿名权限）
    - with-supabase-app/app/api/player-share/[token]/route.ts:2, 19-28, 130 等
    - 问题：匿名客户端可操作隐私数据，且 RLS 过宽。
    - 建议：改为后端使用 service role 进行读取/更新；严格校验 token 的归属与有效期、仅处理必要字段。

  - 导出接口存在 SSRF 风险与资源压力风险
  - 远程抓取任意 http(s) 图片拼 zip
    - with-supabase-app/app/api/events/[id]/registrations/export/route.ts:153-201, 232-281
    - 问题：恶意提交的 URL 可触发 SSRF；并发抓取大量大图的内存/CPU/超时风险。
    - 建议：
      - 严格“域白名单”（仅允许 Supabase Storage 域名，或先解析 URL 再校验 host 与 path 前缀）。
      - 限制并发 + 限制总数量/总大小；为超时和单个请求大小设定上限；避免一次性 zip 压缩过多大文件（可分页导出或拆分 zip）。
      - 提供仅导出 Excel 的选项，图片以“链接列”替代。

  - 上传接口缺少存储桶白名单与权限隔离
  - 管理端上传：with-supabase-app/app/api/upload/route.ts:16, 53-75
  - 报名端上传：with-supabase-app/app/api/portal/upload/route.ts:8, 44-62（还使用了浏览器客户端）
  - 问题：表单传入 bucket 名称，没有白名单；报名端上传没在路由内显式校验登录与角色（仅靠中间件），且使用浏览器客户端在服务端执行。
  - 建议：
    - 显式校验 bucket 值（只允许`event-posters`、`player-photos`、`team-logos`等白名单）。
    - 报名端上传改用服务端 Supabase 客户端（绑定用户会话），或下发受限的上传策略。
    - 私有桶优先，返回签名 URL（而非永久公开 URL），个人信息（证件照）不应公开存储。

  - 生产构建忽略 ESLint/TS 错误
  - with-supabase-app/next.config.ts:13-18
  - 问题：可能将类型/逻辑错误默默带到生产。
  - 建议：上线前必须启用 TS/ESLint 校验并修复错误；构建失败即阻断发布。

  - 暴露诊断/测试 API，应在生产禁用
  - with-supabase-app/app/api/test-connection/route.ts:整页
  - with-supabase-app/app/api/test-portal-simulation/route.ts:整页
  - with-supabase-app/app/api/test-optimized-portal/route.ts:整页
  - 建议：删除或仅在开发环境开启（NODE_ENV=development 且仅本地/内网可访问）。

  - Cookie 安全属性和 CSRF 风险
  - with-supabase-app/app/api/auth/login/route.ts:37-45
  - 问题：`sameSite: 'lax'`在某些场景可能被携带；建议更为严格。
  - 建议：改为`sameSite: 'strict'`（如无跨站需要）；确保`secure: true`只在生产开启；并在写操作接口上考虑CSRF防护（如双提交 Cookie 或 CSRF Token）。

  - 公开日志包含敏感信息
  - 密码、Hash、会话、Token / 详细报错栈等
    - 例如 with-supabase-app/lib/auth.ts:52-59, 92-109；多处 API/页面使用大量 console.log/error
    - 建议：使用日志级别与脱敏（不打印密码/hash/token/个人信息）；生产环境仅输出必要结构化日志；非 2xx 错误统一返回笼统信息，详细报错仅记录服务端日志。

**高优先级（P1，稳定性/正确性/可维护性）**
- Supabase 环境变量命名不一致，文档与代码冲突
  - 代码使用 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`
    - with-supabase-app/lib/supabase/{client.ts,server.ts,middleware.ts}, with-supabase-app/lib/auth.ts
  - README 使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - with-supabase-app/README.md:80-83
  - 建议：统一用一个变量名（建议沿用官方`NEXT_PUBLIC_SUPABASE_ANON_KEY`），并更新所有引用与 .env.example。

- API 路由入参 types 错误写法
  - 多处将 `params` 声明为 Promise 并使用 await
    - with-supabase-app/app/api/events/[id]/route.ts:1-17
    - with-supabase-app/app/api/events/[id]/registration-settings/route.ts:1-17
    - with-supabase-app/app/api/events/[id]/registrations/route.ts:1-17
    - with-supabase-app/app/api/events/[id]/registrations/export/route.ts:6-13
    - with-supabase-app/app/api/player-share/[token]/route.ts:4-11
  - 问题：Next.js Route Handler 的 `context.params` 是同步对象（非 Promise），类型/用法不规范且未来可能出坑（目前靠忽略 TS 错误躲过）。
  - 建议：统一改为 `{ params }: { params: { id: string } }` 的同步解构。

- 依赖项使用 "latest"（不可控升级）
  - with-supabase-app/package.json
  - 问题：`next`, `@supabase/*` 等依赖使用 latest/无锁版本，生产不可控。
  - 建议：明确锁定具体版本并遵循“可预期升级”；保留 pnpm-lock.yaml 并在 CI 中启用“冻结锁文件”检查。

- 图片域名与远端白名单写死
  - with-supabase-app/next.config.ts:7-9
  - 问题：硬编码某个 Supabase 项目域名，一旦切换项目或环境即失效。
  - 建议：通过 `NEXT_PUBLIC_SUPABASE_URL` 动态解析 hostname，或使用 images.domains 配置，减少环境耦合。

- 存储桶命名/策略不统一
  - 代码引用：`event-posters`, `player-photos`, `team-logos`
    - with-supabase-app/app/api/portal/upload/route.ts:8
    - with-supabase-app/app/portal/events/[id]/register/page.tsx:417, 1977
    - with-supabase-app/app/events/create/page.tsx:109
  - SQL 文档创建：`event-posters`（public）与`registration-files`（private），未见`player-photos`/`team-logos`
    - with-supabase-app/docs/sql/database-setup.sql:104-118
  - 建议：统一存储桶清单与策略（强调私有存储+签名 URL），同步代码与 SQL，补充迁移脚本。

- 服务端路由使用浏览器 Supabase 客户端
  - with-supabase-app/app/api/portal/upload/route.ts:2, 33
  - 问题：服务端 route.ts 中应使用 server client（绑定 cookie 与会话），而非 browser client。
  - 建议：改用`@/lib/supabase/server`或新的服务端 service role 客户端；明确会话绑定与权限。

- API 输入缺乏严格校验
  - 多处 Route Handler 直接使用 `await request.json()` 并写 DB
    - 例如 with-supabase-app/app/api/events/route.ts:54-91、with-supabase-app/app/api/events/[id]/route.ts:PUT/PATCH/DELETE
  - 建议：为所有写操作添加 zod 校验，统一错误码和返回格式，避免无效/恶意数据入库。

- 登录接口缺少暴力破解保护
  - with-supabase-app/app/api/auth/login/route.ts:整页
  - 建议：加入限流（IP+账号维度）、失败次数阈值、必要时验证码；所有错误返回统一提示，避免枚举手机号存在与否。

**中优先级（P2，性能/可观测性/体验）**
- 导出大文件的内存/延时风险
  - with-supabase-app/app/api/events/[id]/registrations/export/route.ts:整体
  - 建议：限制导出条数或按批次导出；控制并发下载；必要时将导出任务后台化，完成后提供下载链接；考虑只导出 CSV（更轻量）。
- 过度控制台日志
  - 大量 console.log/console.error 出现在中间件、API、页面
    - 例如 with-supabase-app/middleware.ts:8 等、with-supabase-app/app/api/* 多处
  - 建议：引入日志库（pino/winston），按 LOG_LEVEL 控制；生产脱敏+结构化；默认关闭调试日志。
- 缺少 .env.example 与部署参数说明
  - 建议：新增环境变量模板与说明，统一变量名：
    - NEXT_PUBLIC_SUPABASE_URL
    - NEXT_PUBLIC_SUPABASE_ANON_KEY（或统一 PUBLISHABLE_OR_ANON_KEY）
    - SUPABASE_SERVICE_ROLE_KEY（仅服务端）
    - JWT_SECRET
    - 其他：允许的 BUCKET 名称、图片域白名单等
- 前端体验细节
  - 报名端频繁轮询未读通知（30s）
    - with-supabase-app/contexts/notification-context.tsx:49, 68-74
    - 建议：考虑 supabase realtime 订阅或更长间隔+手动刷新，降低压力。
  - 日期/时区一致性
    - 建议：统一使用 UTC 存储，渲染按时区/locale 格式化；避免 new Date(字符串) 解析差异。
- API 缓存/再验证
  - 可对不含私密信息的 GET（如 portal 赛事列表）加短缓存/再验证策略（但注意与会话相关性）

**低优先级（P3，代码整洁/一致性/部署便捷）**
- 调整 TypeScript 配置
  - 禁止构建忽略类型错误（已在 P0 提及）；严格模式已启用，继续保持。
- CI/CD
  - 建议在 CI 增加：
    - pnpm install --frozen-lockfile
    - lint、typecheck、build
    - 可选单元/端到端测试
- 统一错误响应格式
  - 已多处返回 { success, error, data }，但不完全一致；建议统一规范并在前端统一处理。
- Next.js 构建优化
  - 视部署目标考虑 `output: 'standalone'`（非 Vercel 场景），或保留默认；按需加入 headers() 设置 CSP、安全头。

**数据库与 RLS 建议目标状态（关键要点）**
- 管理端表（admin_users/events/registration_settings/registrations 等）
  - RLS：对 anon/auth 关闭写访问；只对 service_role 放行（或开发专用后端 RPC）。
  - 所有管理写操作走后端 API + service role，前端绝不直连。
- 报名端表（coaches/notifications/registrations 部分列）
  - RLS：强约束 auth.uid() 与行归属（coach_id、auth_id 等关联）。
  - player_share_tokens：禁止公共 SELECT/UPDATE。改为后端接口按 token 检索与更新，或设计安全的 RPC。
- 存储桶
  - 个人隐私与证件照等：private + 签名 URL；公开展示类（宣传海报）：public。
  - 仅白名单桶可用；控制对象路径，避免路径穿越。

**具体文件级修复建议（摘取代表性条目）**
- 秘钥与后门
  - with-supabase-app/lib/auth.ts:7 改为只从 env 读取；61-65 删除后门；52-59 删除敏感日志。
  - with-supabase-app/middleware.ts:43-55,127-139 使用 jwt.verify + JWT_SECRET 校验。
  - with-supabase-app/app/api/init-admin/route.ts:4-66 删除文件或加 dev-only 守卫。
  - with-supabase-app/app/auth/login/page.tsx:278-281 移除测试账号文案；with-supabase-app/app/test-login/page.tsx 删除。
- Supabase 客户端与权限
  - 新建 server-only Supabase 客户端（service role），用于管理端 API；将 with-supabase-app/lib/auth.ts 与相关 API 改用 service role 客户端。
  - with-supabase-app/app/api/player-share/[token]/route.ts:2 改为 server client + service role；精简日志；对 token 做白名单/有效期/归属强校验。
  - with-supabase-app/app/api/portal/upload/route.ts:2 改为 server client，校验 bucket 白名单。
- 导出功能
  - with-supabase-app/app/api/events/[id]/registrations/export/route.ts:153-201, 232-281
    - 限制图片下载域名（仅 supabase storage 域），限制并发与数量，增加超时/尝试上限，提供只导出表格模式。
- 依赖、构建与配置
  - with-supabase-app/package.json：去除 "latest"，锁定版本。
  - with-supabase-app/next.config.ts:13-18：取消忽略 TS/ESLint 错误；images 配置改为通过 env 解析域。
  - 新增 .env.example 文档并统一变量名；README 同步更新。
- API 类型与校验
  - 更正所有 route.ts 的 `params` 类型（示例：with-supabase-app/app/api/events/[id]/route.ts:1-17）。
  - 添加 zod 校验（如 with-supabase-app/app/api/events/route.ts:54-91、PUT/PATCH/DELETE 等）。
- RLS 与 SQL
  - 根据“目标状态”彻底梳理 RLS（重点移除所有 USING(true) 的 FOR ALL 策略），确保只对 service_role 或 auth.uid() 合法范围开放。
  - 统一创建/迁移脚本，明确 bucket 清单与权限。

**部署前核查 Checklist**
- 安全
  - [ ] 删除所有测试/诊断 API 与页面（或加 dev-only 保护）
  - [ ] 移除管理员登录后门与敏感日志
  - [ ] JWT_SECRET 已在生产安全配置且足够强
  - [ ] Cookies 设置同站严格与安全标志（SameSite=Strict/secure）
- 配置
  - [ ] 环境变量与 README、一致性、.env.example 完备
  - [ ] next.config.ts 已启用 TS/ESLint 校验
  - [ ] 图片域名与 Supabase URL 动态配置
- 数据库
  - [ ] 所有 RLS 策略已复核并按目标状态执行
  - [ ] service_role 已用于后端敏感写操作
  - [ ] 存储桶已按公开/私有分类并配置策略
- 质量
  - [ ] 依赖版本固定、锁文件冻结
  - [ ] CI 已运行 lint/typecheck/build 并通过
  - [ ] 关键路径手动验证（登录、报名、审核、导出、上传）

**回归测试建议**
- 管理员登录/登出：错误口令、防爆破逻辑重试、Cookie 属性
- 管理端事件增删改查、报名配置修改：RLS 验证（直接用 anon key 不应成功）
- 报名端：登录、列表、详情、报名创建/草稿/提交/取消、通知读取/标记已读
- 分享链接：生成（后端生成 token）、通过链接查看/更新指定队员、过期/失效处理
- 导出：无图片/有少量图片/大量图片场景、超时/失败回退逻辑
- 上传：bucket 白名单、大小/类型校验、私有桶签名 URL 有效性

需要我先从哪一项开始修？通常建议先清掉 P0（后门/签名校验/RLS/服务端使用 service_role/测试接口清理），再处理 P1（依赖固定/类型修正/输入校验/上传白名单），最后推进 P2/P3 优化。
**基于实际 Supabase 导出（P0 风险核实与定位）**
- 导出文件位置
  - with-supabase-app/docs/sql/actual-supabase-schema.sql
  - with-supabase-app/docs/sql/actual-storage-buckets-data.sql
- admin_users 对所有角色“完全访问”（必须收紧）
  - 证据：with-supabase-app/docs/sql/actual-supabase-schema.sql:1941
    - CREATE POLICY "Admin users full access" ON public.admin_users USING (true) WITH CHECK (true)
  - 风险：未限制角色，等于 anon/auth 均可对管理员表增删改查。
  - 建议：删除该策略，改为仅对 service_role 开放 FOR ALL；其余角色不允许写。
- events 与 registration_settings“完全访问/写”未限角色（必须收紧）
  - 证据：
    - events：with-supabase-app/docs/sql/actual-supabase-schema.sql:2079（"Events admin full access" USING (true) WITH CHECK (true)）
    - registration_settings：with-supabase-app/docs/sql/actual-supabase-schema.sql:2127（"Registration settings admin write" USING (true) WITH CHECK (true)）
  - 风险：任意角色可写入/修改赛事与报名设置。
  - 建议：删除上述策略，改为 service_role 专属写入；保留公开只读策略仅用于 events.select（is_visible=true）。
- registrations 存在“永真”访问策略（必须删除）
  - 证据：with-supabase-app/docs/sql/actual-supabase-schema.sql:2136
    - "Registrations coach access" 含 OR (EXISTS (SELECT 1 FROM public.admin_users))，使条件对所有用户恒为真。
  - 风险：导致所有用户可访问 registrations 全表。
  - 建议：删除该策略，仅保留/补充细粒度策略（教练 INSERT/SELECT/UPDATE/DELETE 仅限自身记录，status=草稿时可删等）。
- player_share_tokens 公开可读/可改（必须收紧）
  - 证据：with-supabase-app/docs/sql/actual-supabase-schema.sql:1948, 1955, 1962, 1969, 2158
    - "Anyone can read share token by token"（SELECT USING true）与 "Anyone can update share token"（UPDATE USING true）允许匿名读写。
  - 风险：分享 token 与队员数据被任意读取与篡改。
  - 建议：删除上述“anyone”策略；仅允许 anon 在 token 有效期内 SELECT（按 is_active 与 expires_at 条件）；UPDATE/标记使用等操作改为 service_role 专属。
- notifications 允许匿名插入（必须收紧）
  - 证据：with-supabase-app/docs/sql/actual-supabase-schema.sql:2151, 2093
    - "System insert notifications" 允许 anon/auth INSERT；"Notifications admin write" 未限角色。
  - 风险：任意人可写垃圾通知。
  - 建议：删除上述策略，改为仅 service_role 允许 INSERT；coach 仅能 SELECT/UPDATE/DELETE 自己的通知（你库中已存在这些细粒度策略）。
- storage.objects（player-photos 桶）匿名可读/可传/可删（必须收紧）
  - 证据：with-supabase-app/docs/sql/actual-supabase-schema.sql:2244, 2251, 2258
    - "Allow anyone to read/upload/delete l7f019_0" 针对 player-photos 开放 anon 的 SELECT/INSERT/DELETE。
  - 存储桶为公共（必须改为私有）
    - 证据：with-supabase-app/docs/sql/actual-storage-buckets-data.sql（player-photos 行 public=t）
  - 风险：个人隐私图片泄露、被任意覆盖/删除。
  - 建议：将 player-photos 设为 private（public=false）；删除 anon 相关策略；改为 authenticated 可上传/读取（必要时仅 owner 可删）；event-posters 仅保留公开只读，写操作改 service_role；registration-files 全操作仅 service_role。
- 结论
  - 上述条目与本文件“P0 必须修复”一致，但已通过实际导出 SQL 逐项坐实，修复时请以这两份实际导出文件为权威依据。

