# 体育赛事报名与审核系统

基于 Next.js 15 + Supabase/MemFire 的体育赛事报名与审核管理系统。

## 功能特性

- **管理端**：赛事管理、动态表单配置、报名审核、数据导出
- **门户端**：赛事浏览、在线报名、通知系统、个人中心
- **队员分享**：无需登录的队员信息填写页面

## 技术栈

- **框架**：Next.js 15 (App Router) + React 19 + TypeScript
- **数据库**：Supabase/MemFire (PostgreSQL)
- **UI**：Tailwind CSS + shadcn/ui + Radix UI
- **表单**：react-hook-form + zod
- **其他**：@dnd-kit (拖拽排序)、xlsx (数据导出)

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd dubai
```

### 2. 安装依赖

项目使用 pnpm 作为包管理器：

```bash
pnpm install
```

### 3. 配置环境变量

复制环境变量模板并填入真实值：

```bash
cp .env.example .env.local
```

编辑 `.env.local` 文件，填入以下必需的环境变量：

```bash
# Supabase/MemFire 配置
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.baseapi.memfiredb.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your_anon_key_here

# Service Role Key（用于文件上传和审核操作）
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# JWT Secret（用于管理员会话加密）
JWT_SECRET=your_jwt_secret_here
```

**获取 Supabase/MemFire 配置：**

1. 登录 [MemFire 控制台](https://memfiredb.com)
2. 选择你的项目
3. 进入 Settings > API
4. 复制 URL、anon key 和 service_role key

**生成 JWT Secret：**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 测试账号

根据 `CLAUDE.md` 文档，系统已预置以下测试账号：

**超级管理员**：
- 手机号：`18140044662` 或 `13164550100`
- 密码：`admin123`

**教练账号**：
- 手机号：`13800000001` ~ `13800000005`
- 密码：`user123`

## 项目结构

```
app/
├── auth/              # 认证相关页面（登录、注册等）
├── events/            # 管理端赛事管理
├── portal/            # 门户端（教练）
├── player-share/      # 队员分享填写页
└── api/               # API 路由

components/
├── event-manage/      # 赛事管理组件
├── ui/                # shadcn/ui 组件
└── ...

lib/
├── auth.ts            # 认证工具函数
├── supabase/          # Supabase 客户端配置
└── types.ts           # TypeScript 类型定义

docs/
├── CLAUDE.md          # 详细的项目文档
├── STORAGE_SETUP.md   # Storage 配置说明
└── sql/               # 数据库脚本
```

## 常用命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 生产运行
pnpm start

# 代码检查
pnpm lint
```

## 数据库设置

首次部署需要执行以下 SQL 脚本：

1. **创建数据库结构**：`docs/sql/actual-supabase-schema.sql`
2. **创建 Storage Buckets**：`docs/sql/create-buckets-simple.sql`
3. **配置 Storage 策略**：`docs/sql/storage-policies.sql`（可选）

## 详细文档

完整的项目文档请参考：
- **CLAUDE.md**：项目架构、功能说明、开发指南
- **STORAGE_SETUP.md**：文件存储配置说明

## 故障排查

### Bucket not found

执行 `docs/sql/create-buckets-simple.sql` 创建必需的 Storage buckets。

### 上传失败 / 500 错误

检查 `.env.local` 中的 `SUPABASE_SERVICE_ROLE_KEY` 是否正确配置。

### 页面重定向到登录

检查 `middleware.ts` 中的路由保护规则，确认路径是否在白名单中。

## 环境变量说明

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase/MemFire 项目 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | Supabase anon key（代码主要使用此变量） | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key（服务端操作） | ✅ |
| `JWT_SECRET` | JWT 加密密钥 | ✅ |
| `NEXT_PUBLIC_API_URL` | API 基础 URL | ❌ |

## License

[MIT](LICENSE)
