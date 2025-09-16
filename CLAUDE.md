# CLAUDE Development Guide

## 项目信息

- **项目名称**: 体育比赛报名系统-管理端
- **项目路径**: D:\cursor\system\with-supabase-app
- **技术栈**: Next.js 15 + Supabase + TypeScript + Tailwind CSS + shadcn/ui

## 开发命令

### 基础命令
```bash
cd D:\cursor\system\with-supabase-app

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 构建项目
pnpm run build

# 启动生产服务器
pnpm run start

# 代码检查
pnpm run lint
```

### Supabase配置
- **项目URL**: https://hcsullmeeyiuomrsbcpv.supabase.co
- **配置文件**: .env.local (已配置)
- **数据库**: PostgreSQL
- **认证**: Supabase Auth
- **文件存储**: Supabase Storage

### 开发工作流

1. **启动开发环境**
   ```bash
   cd D:\cursor\system\with-supabase-app
   pnpm run dev
   ```

2. **运行类型检查**
   ```bash
   pnpm run lint
   ```

3. **构建测试**
   ```bash
   pnpm run build
   ```

## 项目结构

```
with-supabase-app/
├── app/                    # Next.js App Router
│   ├── auth/              # 认证相关页面
│   ├── protected/         # 需要认证的页面
│   ├── globals.css        # 全局样式
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # 主页
├── components/            # React组件
│   ├── ui/               # shadcn/ui组件
│   └── ...               # 其他组件
├── lib/                   # 工具库
│   ├── supabase/         # Supabase客户端配置
│   └── utils.ts          # 工具函数
└── middleware.ts          # Next.js中间件
```

## 开发规范

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 使用 Tailwind CSS 进行样式设计
- 组件使用 shadcn/ui 设计系统

### 文件命名
- 组件文件: `kebab-case.tsx`
- 页面文件: `page.tsx`
- API路由: `route.ts`
- 类型定义: `types.ts`

### Git提交规范
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式修改
- refactor: 代码重构
- test: 测试相关
- chore: 构建过程或辅助工具的变动

## Supabase数据库结构

### 核心表
1. **admin_users** - 管理员用户表
2. **events** - 赛事活动表
3. **registration_settings** - 报名设置表
4. **registrations** - 报名申请表

### 创建表的SQL (需要在Supabase SQL编辑器中执行)
```sql
-- 管理员用户表
CREATE TABLE admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 赛事活动表
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    poster_url TEXT,
    type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    address TEXT,
    details TEXT,
    phone VARCHAR(20),
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 报名设置表
CREATE TABLE registration_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_requirements JSONB,
    player_requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 报名申请表
CREATE TABLE registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_data JSONB,
    players_data JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_id UUID REFERENCES admin_users(id)
);
```

## 常用开发任务

### 添加新页面
1. 在 `app/` 目录下创建新的页面文件
2. 使用 App Router 约定命名
3. 添加必要的类型定义

### 创建新组件
1. 在 `components/` 目录下创建组件文件
2. 使用 TypeScript 和严格类型检查
3. 遵循 shadcn/ui 设计系统

### 数据库操作
1. 使用 Supabase 客户端进行 CRUD 操作
2. 实现适当的错误处理
3. 添加加载状态

### 文件上传
1. 使用 Supabase Storage API
2. 配置适当的存储桶权限
3. 处理上传进度和错误

## 调试和测试

### 开发者工具
- Chrome DevTools
- React Developer Tools
- Supabase Dashboard

### 日志查看
- 浏览器控制台
- Supabase 日志面板
- Next.js 开发服务器日志

### 常见问题排查
1. **认证问题**: 检查 .env.local 配置
2. **数据库连接**: 验证 Supabase 项目状态
3. **样式问题**: 检查 Tailwind CSS 配置
4. **类型错误**: 运行 TypeScript 检查

## 部署相关

### 本地测试
```bash
pnpm run build
pnpm run start
```

### 环境变量
- 开发环境: .env.local
- 生产环境: 根据部署平台配置

### 性能优化
- 使用 Next.js Image 组件
- 实现代码分割
- 优化 Supabase 查询

## 联系方式

如需配置 Supabase 相关设置或其他环境配置，请及时联系项目负责人。