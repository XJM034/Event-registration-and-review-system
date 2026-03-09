# 体育赛事报名与审核系统

基于 Next.js 15 + Supabase/MemFire 的赛事报名、审核与导出系统，当前包含 3 个主要入口：

- 管理端：赛事管理、动态表单配置、报名审核、导出、账号管理
- 门户端：赛事浏览、在线报名、我的报名、通知、模板导出
- 队员分享页：无需登录的队员信息填写页面

## 主要能力

- 赛事管理：创建/编辑赛事、设置可见性、绑定组别
- 动态表单：队伍字段、队员角色字段、报名/审核时间配置
- 审核流程：待审核列表、队伍/队员级审核、驳回原因生成
- 数据导出：管理员导出报名压缩包，教练可导出模板 PDF
- 账号管理：管理员个人账号维护；超级管理员可管理教练/管理员账号
- 项目管理：超级管理员维护项目类型、项目、组别三级结构

## 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript
- Supabase / MemFire（Postgres、Auth、Storage）
- Tailwind CSS + shadcn/ui + Radix UI
- react-hook-form + zod
- @dnd-kit（拖拽排序）
- xlsx + jszip + pdf-lib（导出与模板处理）

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd las-vegas
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

仓库已提供 `.env.example`：

```bash
cp .env.example .env.local
```

至少需要配置以下变量：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.baseapi.memfiredb.com

# 两个 public key 名称是历史兼容别名，填其中一个即可；
# `pnpm env:sync` / `pnpm dev` 会自动补齐另一个
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your_anon_key_here

SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
JWT_SECRET=your_jwt_secret_here
```

可选变量：

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
VERCEL_URL=your-domain.example.com
```

填好一次后，建议执行：

```bash
pnpm env:sync
```

这会把当前正确的环境变量同步到当前机器的 `~/.config/event-registration-and-review-system/las-vegas.env`，后续在同一台机器上重新 clone 或新建 workspace 时，`pnpm dev` / `pnpm build` / `pnpm test` 会自动补齐 `.env.local`。

### 4. 初始化数据库

首次搭建环境，至少需要执行这些脚本：

1. `docs/sql/actual-supabase-schema.sql`
   作用：导入当前项目使用的完整数据库结构快照
2. `docs/sql/create-buckets-simple.sql`
   作用：创建 `event-posters`、`registration-files`、`player-photos`、`team-documents` 4 个 Storage bucket
3. `docs/sql/create-auth-accounts.sql`（如果你需要初始化默认测试账号）
   作用：创建仓库 SQL 脚本内置的管理员/教练默认账号

如果你是从旧库迁移，而不是全新初始化，请优先查看 `docs/sql/` 目录里的增量脚本，而不是直接重复执行全量脚本。

### 5. 启动开发服务器

```bash
pnpm dev
```

打开 `http://localhost:3000/auth/login`。

## 当前登录说明

- 当前受支持的登录入口是 `/auth/login`
- 管理员登录后会创建独立的 `admin-session`
- 教练登录后会持久化 Supabase session
- `/auth/register`、`/auth/update-password`、`/auth/confirm` 等页面虽然仍在仓库中，但当前不属于主流程，且大多会被 `middleware.ts` 拦截

## 测试账号说明

### 当前联调稳定账号

以下 3 个账号由当前测试环境维护，后续手工联调可优先使用：

- 超级管理员：`18140044662` / `000000`
- 普通管理员：`15196653658` / `000000`
- 教练：`13800000001` / `000000`

### 仓库初始化默认账号

`docs/sql/create-auth-accounts.sql` 初始化出来的默认账号仍然是：

- 超级管理员：`18140044662` / `admin123`
- 超级管理员：`13164550100` / `admin123`
- 教练：`13800000001` ~ `13800000005` / `user123`

通过 `/admin/account-management` 创建账号、重置密码后，实际测试环境中的账号口令可能与 SQL 默认值不同。

## 常用命令

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm start
pnpm env:sync
pnpm test:template-e2e
```

## 项目结构

```text
app/
├── auth/                         # 登录与遗留认证页面
├── events/                       # 管理端赛事管理
├── portal/                       # 教练门户端
├── player-share/                 # 公开队员分享页
└── api/                          # API 路由

components/
├── event-manage/                 # 赛事管理组件
├── account-management/           # 账号管理组件
├── project-management/           # 项目/组别管理组件
└── ui/                           # shadcn/ui 组件

lib/
├── auth.ts                       # 服务端认证与会话工具
├── export/                       # 导出相关工具
├── supabase/                     # Supabase 客户端封装
└── template-document-export.ts   # 模板导出能力

docs/
├── README.md                     # 文档索引
├── STORAGE_SETUP.md              # Storage 配置说明
└── sql/                          # SQL 脚本与 schema 快照
```

## 关键文档

- `CLAUDE.md`：最完整的项目工作说明、API 清单、已知不一致
- `docs/README.md`：文档索引
- `docs/STORAGE_SETUP.md`：Storage bucket 配置说明
- `SECURITY.md`：安全配置与检查清单

## 常见问题

### 1. Bucket not found

通常是还没创建 Storage bucket。执行 `docs/sql/create-buckets-simple.sql`，或参考 `docs/STORAGE_SETUP.md`。

### 2. 上传失败 / 500

优先检查 `SUPABASE_SERVICE_ROLE_KEY` 是否已正确配置。管理端上传、门户上传、审核通知写入都依赖它。

### 3. 页面一直跳到登录页

优先检查：

- 是否访问了不在 `middleware.ts` `publicPaths` 中的页面
- 是否缺少教练 Supabase session 或管理员 `admin-session`
- 是否误用了遗留认证页面（如 `/auth/register`）

### 4. 登录后管理员/教练跳错端

检查 `auth.users.raw_user_meta_data.role` 是否正确，以及 `admin_users` / `coaches` 是否已通过触发器同步成功。

## 环境变量说明

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase/MemFire 项目 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | 主 public key 变量名 | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 历史兼容别名；填任一 public key 后脚本会自动补齐 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key（上传、审核、账号管理等服务端操作） | ✅ |
| `JWT_SECRET` | 管理员旁路会话加密密钥 | ✅ |
| `NEXT_PUBLIC_API_URL` | 可选兼容变量，当前主代码未直接依赖 | ❌ |
| `VERCEL_URL` | Next.js `metadataBase` 可选配置 | ❌ |

## 补充说明

- 管理员导出接口当前始终返回 `zip`，不是按是否有附件切换 `xlsx` / `zip`
- 队员分享页当前前端会尝试复用 `/api/portal/upload`，但该接口受教练登录态保护；这一点已记录在 `CLAUDE.md` 的“已知不一致”中
- 如需最准确的实现说明，请以 `CLAUDE.md` 和 `docs/sql/actual-supabase-schema.sql` 为准
