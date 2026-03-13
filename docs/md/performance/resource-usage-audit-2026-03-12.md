# 赛事报名系统 — 资源占用与性能审查记录

**创建日期**: 2026-03-12  
**状态**: 已完成首轮审查，已落地第一批优化，待继续收敛  
**范围**: 前端首屏包体、客户端重复请求、遗留/模板路由、全局中间件开销

## 结论摘要

本次审查的结论很明确：

1. 当前项目里确实存在模板/遗留路由，但它们**不是活跃页面卡顿的主因**
2. 真正拖慢体感的主要是两类问题：
   - **大而全的客户端首包**：管理端详情页和账号管理页一次性加载过多模块
   - **重复的客户端会话/教练查询和轮询**：门户端存在多条并行刷新链路
3. 已经先处理了最直接的高 ROI 项：
   - `/events/[id]` 改为按 Tab 动态加载
   - `/admin/account-management` 改为按 Tab 动态加载
   - 教练批量导入 Excel 弹窗改为真正打开时再加载

## 优化前提（硬约束）

后续所有性能与资源占用优化，都必须满足以下前提：

1. **不能破坏现有任何功能**
2. **不能改变现有权限逻辑、状态流转和页面可见结果**
3. **不能为了降资源占用而牺牲核心业务稳定性**

执行原则：

- 优先做**等价重构**，不做业务规则改写
- 优先做**按需加载、请求去重、轮询收敛、可见性节流**
- 每一项优化都要单独验证，确认功能、权限、交互和文案不变
- 高风险优化必须分步推进，必要时保留旧路径或兜底逻辑

## 审查方式

- 代码结构检查：重点查看 `app/`、`components/`、`contexts/`、`middleware.ts`
- 构建检查：执行过一次 `pnpm build`，记录基线路由体积
- 运行时模式检查：重点排查 `use client` 页面、`setInterval`、重复鉴权/资料查询、调试/遗留页面

## 构建基线（优化前）

本轮首次 `pnpm build` 观察到的重点路由体积如下：

- `/events/[id]`: **410 kB** First Load JS
- `/admin/account-management`: **263 kB** First Load JS
- `/portal/events/[id]/register`: **241 kB** First Load JS
- `/portal`: **196 kB** First Load JS
- `Middleware`: **71.2 kB**

说明：

- 上述数据是**首轮审查时的基线**，用于判断热点
- 本轮已做首批动态加载优化，但**暂未重新跑 build 复测**，避免再次干扰正在使用的 `.next` 开发产物

## 主要问题清单

### P0. `/events/[id]` 一次性打包全部管理 Tab

问题：

- `app/events/[id]/page.tsx` 是客户端页面
- 页面顶部静态引入：
  - `BasicInfoTab`
  - `RegistrationSettingsTab`
  - `ReviewListTab`
  - `RegistrationListTab`
- 用户即使只查看“基本信息”，仍然要下载“报名设置 / 审核 / 报名列表”的代码

进一步放大包体的原因：

- `components/event-manage/registration-settings-tab.tsx` 是大组件
- 该组件在客户端直接引入了 `pdf-lib`
- 这类库会显著抬高管理页首包体积

影响：

- 管理端赛事详情页首开更慢
- 标签切换之前就先付出全部模块的下载成本
- 弱网环境下更容易出现明显空白等待

### P0. `/admin/account-management` 把 Excel/账号管理整套逻辑打进首包

问题：

- `app/admin/account-management/page.tsx` 顶部静态引入 `CoachesTab`、`AdminsTab`、`MyAccountTab`
- 超级管理员打开页面时，哪怕只看默认 Tab，也会连带下载账号管理全套逻辑

进一步放大包体的原因：

- `components/account-management/coaches-tab.tsx` 静态引入 `ImportCoachesDialog`
- `components/account-management/import-coaches-dialog.tsx` 客户端直接引入 `xlsx`
- 结果是“批量导入 Excel”这条低频路径也进入了首屏资源

影响：

- 账号管理页首次进入更慢
- “我的账号”这类轻页面也被大模块拖重

### P1. 门户端存在重复的会话/教练查询与轮询

问题：

- `contexts/notification-context.tsx`
  - 初始加载查一次会话
  - 再查一次 `coaches`
  - 再查未读通知
  - 每 30 秒重复一次
- `app/portal/layout.tsx`
  - 页面布局初始化时再次查会话
  - 再次查 `coaches`
- `app/portal/events/[id]/page.tsx`
  - 页面获得焦点时检查报名状态
  - 每 30 秒再检查一次
  - 检查时又会查会话、查 `coaches`、查 `registrations`
- `app/portal/events/[id]/register/page.tsx`
  - 每 5 秒同步分享链接状态
  - 首次载入时还会再次查会话、查 `coaches`

影响：

- 打开一个门户页可能同时存在多条刷新链路
- 弱网下容易出现重复加载、重试、状态抖动
- 会持续消耗数据库与 API 请求额度

### P1. 首页与门户首页都采用客户端取数

问题：

- `app/page.tsx` 使用客户端 `useEffect` 获取赛事列表
- `app/portal/page.tsx` 同样在客户端完成首轮取数

影响：

- 页面首屏先出空壳/加载态，再二次请求补数据
- 本可由 App Router 服务端输出的内容，被推迟到 hydration 后
- 体感上容易出现“先白一下，再出来”

### P1. `middleware` 开销偏重，且有热路径日志

问题：

- `middleware.ts` 对绝大多数非静态请求生效
- 每次请求都会执行鉴权逻辑
- 中间件里保留了 `console.log` / `console.warn`

影响：

- 给所有页面和 API 都增加了额外处理成本
- 日志噪音高，定位真正异常更困难

### P2. 模板/遗留/测试路由仍在构建产物中

典型例子：

- `app/protected/page.tsx`
- `app/test-login/page.tsx`
- `app/init/page.tsx`
- `app/auth/register/page.tsx`
- `app/auth/sign-up/page.tsx`
- `app/auth/update-password/page.tsx`

结论：

- 这类页面**不是主运行时卡顿的根因**
- 但它们会增加：
  - 构建时间
  - 路由表体积
  - 维护成本
  - 误用风险

## 本轮已落地优化

### 1. 赛事管理页按 Tab 动态加载

已调整文件：

- `app/events/[id]/page.tsx`

处理方式：

- 将 `BasicInfoTab`
- `RegistrationSettingsTab`
- `ReviewListTab`
- `RegistrationListTab`

从静态引入改为 `next/dynamic` 按需加载

收益：

- 用户首次进入赛事详情页时，不再预先下载全部管理模块
- 有助于降低 `/events/[id]` 首屏资源占用

### 2. 账号管理页按 Tab 动态加载

已调整文件：

- `app/admin/account-management/page.tsx`

处理方式：

- 将 `CoachesTab`
- `AdminsTab`
- `MyAccountTab`

从静态引入改为 `next/dynamic` 按需加载

收益：

- 轻量场景不再强制加载整套账号管理模块
- 有助于降低 `/admin/account-management` 首屏资源占用

### 3. Excel 导入弹窗延迟到真正打开时才加载

已调整文件：

- `components/account-management/coaches-tab.tsx`

处理方式：

- 将 `ImportCoachesDialog` 改为动态引入
- 仅在 `showImportDialog === true` 时渲染

收益：

- `xlsx` 不再跟随教练账号页首屏一起进入
- 低频功能不再拖慢高频页面

### 4. 门户端轮询改为“仅页面可见时持续轮询，切回前台立即补一次”

已调整文件：

- `contexts/notification-context.tsx`
- `app/portal/events/[id]/page.tsx`
- `app/portal/events/[id]/register/page.tsx`

处理方式：

- 通知未读数轮询仅在页面可见时继续运行
- 赛事详情页报名状态轮询仅在页面可见时继续运行
- 报名页分享链接同步仅在页面可见时继续运行
- 标签页重新变为可见或窗口重新获得焦点时，立即补一次刷新

收益：

- 不改变前台用户可见行为
- 减少后台标签页的空耗请求
- 降低门户端重复轮询带来的数据库和网络压力

### 5. 账号管理页低频弹窗继续按需加载

已调整文件：

- `components/account-management/coaches-tab.tsx`
- `components/account-management/admins-tab.tsx`

处理方式：

- 新建教练弹窗改为打开时再加载
- 编辑教练弹窗改为打开时再加载
- 教练重置密码弹窗改为打开时再加载
- 新建管理员弹窗改为打开时再加载
- 编辑管理员弹窗改为打开时再加载

收益：

- 账号管理页默认列表场景不再预先加载这些低频弹窗模块
- 继续压缩教练/管理员管理 Tab 的实际使用资源

### 6. 通知未读数链路复用教练 ID 缓存

已调整文件：

- `lib/portal/coach-session-cache.ts`
- `contexts/notification-context.tsx`
- `app/portal/layout.tsx`

处理方式：

- 新增教练 ID 的会话级缓存
- 门户布局在成功获取教练资料后写入缓存
- 通知未读数刷新优先读取缓存，命中时跳过 `coaches` 查询
- 退出登录或确认无教练身份时清理缓存

收益：

- 通知 30 秒轮询不再稳定重复打 `session -> coaches -> notifications` 全链路
- 保留现有未读数刷新行为，但减少一段重复数据库查询

### 7. 门户端更多页面复用教练 ID 缓存

已调整文件：

- `app/portal/layout.tsx`
- `app/portal/page.tsx`
- `app/portal/events/[id]/page.tsx`
- `app/portal/events/[id]/register/page.tsx`
- `app/portal/my/registrations/page.tsx`
- `app/portal/my/notifications/page.tsx`
- `app/portal/my/settings/page.tsx`

处理方式：

- 门户首页获取“我已报名赛事”时，优先读取会话级教练 ID 缓存
- 赛事详情页检查报名状态时，优先读取会话级教练 ID 缓存
- 报名页加载现有报名时，优先读取会话级教练 ID 缓存，缺失时再最小化查询或补建教练记录
- “我的报名”和“我的通知”页面查询业务数据时，优先读取会话级教练 ID 缓存
- “账号设置”页面加载完整教练资料时，优先按缓存的教练 ID 取数，缓存失效时再回退到 `auth_id` 查询

收益：

- 将多个页面稳定重复的 `session -> coaches -> registrations/notifications` 链路进一步收短
- 不改变现有页面功能和数据来源，只减少重复的身份映射查询
- 为后续继续收敛门户端重复查询提供统一基础

### 8. 收掉 `middleware` 热路径调试日志

已调整文件：

- `middleware.ts`

处理方式：

- 移除正常请求路径上的 `console.log`
- 保留异常场景的 `console.warn`，不影响后续排查

收益：

- 减少每次请求经过 `middleware` 时的额外日志输出
- 降低开发与运行日志噪音，保留关键异常信号

### 9. 管理首页服务端首屏取数暂缓

说明：

- 本轮尝试过将管理首页首次赛事列表查询挪到服务端
- 由于当前页面内含较多 Radix 交互组件，实际刷新后出现 hydration mismatch
- 为满足“不能破坏现有功能”的硬约束，已将这一步完整回退，当前线上代码仍保持原有客户端首取数方式

结论：

- 这条优化方向保留，但需要先单独解决 SSR 与现有客户端交互树之间的稳定性问题
- 在问题彻底收敛前，不会再次直接落到主页面

### 10. 收掉门户赛事列表 API 热路径调试日志

已调整文件：

- `app/api/portal/events/route.ts`

处理方式：

- 移除接口正常执行路径上的时长、数量、阶段性 `console.log`
- 保留数据库连接失败和接口异常时的 `console.error`

收益：

- 门户首页和相关依赖页面每次拉取赛事列表时，减少服务端日志开销
- 日志更聚焦于真正的异常，而不是常态请求过程

### 11. 收掉门户详情/报名/通知链路的调试日志

已调整文件：

- `app/portal/events/[id]/page.tsx`
- `app/portal/events/[id]/register/page.tsx`
- `app/portal/my/notifications/page.tsx`
- `app/api/portal/events/[id]/route.ts`

处理方式：

- 移除页面渲染、状态刷新、表单回填、通知批量已读等正常路径上的 `console.log`
- 保留 `console.error` 与 `console.warn`，不改变错误处理和用户提示

收益：

- 门户高频页面和详情接口在日常使用时不再持续输出大段调试日志
- 降低控制台噪音和开发期运行开销，同时保留异常诊断信息

### 12. 收掉门户上传接口成功日志

已调整文件：

- `app/api/portal/upload/route.ts`

处理方式：

- 移除上传成功后的正常路径 `console.log`
- 保留上传失败和接口异常时的 `console.error`

收益：

- 教练端上传图片/材料时不再在服务端持续输出成功日志
- 保留失败排查能力，但减少无效日志噪音

### 13. 门户详情页和报名页的报名查询收紧到必要字段

已调整文件：

- `app/portal/events/[id]/page.tsx`
- `app/portal/events/[id]/register/page.tsx`

处理方式：

- 将报名记录查询从 `select('*')` 改为只读取页面实际使用的列
- 赛事详情页保留状态、队伍数据、时间戳、驳回原因等展示所需字段
- 报名页保留回填表单和重新提交所需字段

收益：

- 门户详情页轮询报名状态时，单次响应体更轻
- 报名页读取草稿/驳回报名时，不再把无关列一起拉回客户端
- 不改变现有交互和状态判断，只减少数据传输负担

### 14. 门户布局、设置页和详情接口继续收紧查询列

已调整文件：

- `app/portal/layout.tsx`
- `app/portal/my/settings/page.tsx`
- `app/api/portal/events/[id]/route.ts`

处理方式：

- 门户布局获取教练资料时，只读取顶部展示和缓存所需字段
- 账号设置页获取教练资料时，只读取表单回填所需字段
- 赛事详情接口获取 `events` 和 `registration_settings` 时，改为明确列选择

收益：

- 门户端全局布局初始化时，教练资料查询更轻
- 账号设置页加载资料时，不再拉回无关字段
- 赛事详情和报名页共用的详情接口响应体继续收缩

### 15. 门户个人中心列表与模板导出继续收紧查询列

已调整文件：

- `app/portal/my/registrations/page.tsx`
- `app/portal/my/notifications/page.tsx`
- `app/api/portal/registrations/[id]/template-export/route.ts`
- `app/auth/login/page.tsx`

处理方式：

- “我的报名”列表改为只读取卡片渲染、状态展示、时间信息和跳转所需字段，并保留内联赛事摘要
- “我的通知”列表改为只读取通知展示、未读状态、跳转目标以及关联的队伍摘要和赛事名称
- 模板导出路由读取报名记录时，仅保留 `event_id`、`team_data`、`players_data`
- 登录页判断教练档案是否已存在时，仅读取 `coaches.id`

收益：

- 门户个人中心两条高频列表不再拉取整行报名/通知数据
- 模板导出路由减少了不必要的报名字段读取
- 登录页首次进入门户分支时，减少了一次无关教练资料读取
- 都属于等价重构，不改变现有排序、筛选、状态流转和跳转行为

### 16. 管理端赛事详情接口改为按需读取字段

已调整文件：

- `app/api/events/[id]/route.ts`

处理方式：

- 管理端赛事详情 GET 从 `events.select(*)` 改为只读取管理页头部、基本信息 Tab 和导出配置弹窗实际需要的赛事字段

收益：

- 管理端进入赛事详情时，不再把整行赛事数据全部返回给前端
- 导出配置弹窗复用同一路由时，也只会拿到当前页面需要的字段
- 不改变赛事编辑、显示开关、删除等现有接口行为

### 17. 管理端报名设置接口改为按需读取字段

已调整文件：

- `app/api/events/[id]/registration-settings/route.ts`

处理方式：

- 管理端报名设置 GET 从 `registration_settings.select(*)` 改为只读取组别标识、队伍字段配置和队员字段配置等实际消费字段

收益：

- 报名设置页、审核页、报名详情页和导出配置弹窗复用这条接口时，不再读取整行设置数据
- 不改变配置读取结果的数据结构，只减少无关列返回

### 18. 管理端报名列表接口改为按需读取字段

已调整文件：

- `app/api/events/[id]/registrations/route.ts`

处理方式：

- 管理端赛事报名列表 GET 从 `registrations.select(*)` 改为只读取待审核列表和已通过列表实际渲染所需的报名字段

收益：

- 审核列表和报名列表加载时，不再把整行报名数据全部返回
- 保留现有列表展示、导出入口和审核跳转行为，只减少无关列传输

### 19. 管理端单条报名详情接口改为按需读取字段

已调整文件：

- `app/api/registrations/[id]/route.ts`

处理方式：

- 管理端单条报名详情 GET 从 `registrations.select(*)` 改为只读取审核页、详情页和审计日志实际使用的报名字段

收益：

- 审核页和报名详情页进入时，不再读取整行报名数据
- 审计日志仍保留需要的 `event_id` 和 `coach_id`，不改变现有记录行为

### 20. 管理端教练列表接口改为按需读取字段

已调整文件：

- `app/api/admin/coaches/route.ts`

处理方式：

- 管理端教练列表 GET 不再读取整行 `coaches` 记录，改为只返回列表页、编辑弹窗和关联创建人信息实际会用到的字段
- 管理端创建教练成功后的回查也改为只读取响应体可能会用到的基础字段

收益：

- 账号管理中的教练列表分页、搜索和筛选时，不再传输无关列
- 创建教练成功后的补充查询也更轻
- 保留当前列表展示和编辑弹窗所需字段，不改变现有交互行为

### 21. 管理端导出路由继续收紧查询列并裁剪热路径日志

已调整文件：

- `app/api/events/[id]/registrations/export/route.ts`

处理方式：

- 导出路由查询报名记录时，只保留导出实际需要的 `team_data`、`players_data`、`submitted_at` 等字段
- 读取报名设置时，只保留字段配置合并所需的组别和 JSON 配置字段
- 去掉成功路径上的调试日志，保留失败日志

收益：

- 导出准备阶段不再读取整行报名和整行设置数据
- 正常导出时减少服务端日志噪音，不影响失败排查
- 不改变导出内容、分组规则和附件下载逻辑

### 22. 公开队员分享入口继续收紧设置查询列

已调整文件：

- `app/api/player-share/[token]/route.ts`

处理方式：

- 公开分享 GET 在读取 `registration_settings` 时，不再读取整行设置记录，改为只返回组别标识和表单配置 JSON

收益：

- 公开分享页首屏准备阶段减少了无关设置字段传输
- 不改变 token 校验、分享对象定位、写入时限判断和公开返回结构

### 23. 鉴权热路径会话查询改为按需读取字段

已调整文件：

- `lib/auth.ts`

处理方式：

- 在逐个核对调用面后，将管理员会话回查从整行 `admin_users` 收紧为 `id`、`auth_id`、`is_super`
- 将教练会话回查从整行 `coaches` 收紧为当前调用方实际使用的 `id`

收益：

- 所有依赖 `getCurrentAdminSession()` / `getCurrentCoachSession()` 的热路径请求都会减少无关字段读取
- 不改变双会话逻辑和现有权限判断，只收缩会话查询负担

### 24. 裁剪正常路径日志并补充零数据短路

已调整文件：

- `app/portal/my/registrations/page.tsx`
- `app/api/registrations/[id]/review/route.ts`
- `app/player-share/[token]/page.tsx`
- `app/api/events/[id]/registrations/export/route.ts`
- `components/event-manage/registration-settings-tab.tsx`

处理方式：

- 去掉公开分享提交、审核后通知创建、导出准备和报名设置保存过程中的正常路径调试日志
- “我的报名”在没有任何报名时，直接短路，不再继续查询 `registration_settings`

收益：

- 减少浏览器控制台和服务端日志噪音
- 零数据场景下少发一次无意义的设置查询
- 不改变审核、导出、分享填写和报名列表的现有业务行为

## 接下来准备优化的内容

### P0. 继续做包体收缩复测

目标：

- 在不干扰当前开发服务的前提下，重新做一次干净的构建对比

关注指标：

- `/events/[id]` 首屏 JS 是否明显下降
- `/admin/account-management` 首屏 JS 是否明显下降

### P1. 合并门户端重复的“会话 -> coach -> 业务查询”链路

方向：

- 统一缓存当前教练基础资料
- 降低多个页面/上下文重复查 `coaches` 的频率
- 将通知、赛事详情、报名状态刷新从“各自查一次”改成更少的共享来源

重点文件：

- `contexts/notification-context.tsx`
- `app/portal/layout.tsx`
- `app/portal/page.tsx`
- `app/portal/events/[id]/page.tsx`
- `app/portal/events/[id]/register/page.tsx`
- `app/portal/my/registrations/page.tsx`
- `app/portal/my/notifications/page.tsx`

### P1. 收敛轮询策略

方向：

- 重新评估 30 秒通知轮询是否需要全局常驻
- 重新评估赛事详情页 30 秒报名状态轮询是否可仅在可见/激活时启用
- 重新评估报名页 5 秒分享状态同步是否能改为：
  - 更长间隔
  - 仅页面激活时轮询
  - 提交后或切换窗口后再主动刷新

目标：

- 降低空耗请求
- 减少页面状态抖动

### P1. 将高频首页尽量改回服务端首屏取数

目标页面：

- `app/page.tsx`
- `app/portal/page.tsx`

方向：

- 优先让首屏列表数据走服务端输出
- 客户端只保留筛选、交互、局部刷新

预期收益：

- 降低首屏空白等待
- 改善弱网下首次可见内容时间

### P2. 清理遗留/模板/测试路由

方向：

- 删除不再使用的模板页面
- 或改为明确的开发专用入口
- 避免继续进入正式构建产物

优先清理候选：

- `app/protected/*`
- `app/test-login/page.tsx`
- `app/init/page.tsx`
- 非主流程认证模板页

### P2. 收窄中间件热路径负担

方向：

- 去除 `middleware.ts` 中的常驻调试日志
- 重新审视 matcher 范围
- 评估可否减少部分路径上的重复鉴权成本

## 不建议误判的点

以下内容需要明确：

- 模板/遗留路由**会影响项目整洁度与构建成本**
- 但它们**不是当前用户感知卡顿的最大来源**
- 当前最该优先处理的，仍然是：
  - 管理端大路由首包过重
  - 门户端重复轮询和重复查询

## 本文档的使用建议

如果后续继续做性能治理，建议按下面顺序推进：

1. 先复测本轮动态加载改动后的构建体积
2. 再处理门户端重复查询与轮询
3. 再处理首页服务端首屏取数
4. 最后清理遗留路由与中间件细化

这样做的原因是：

- 前两项对用户体感收益最大
- 后两项更偏结构治理与维护性提升
