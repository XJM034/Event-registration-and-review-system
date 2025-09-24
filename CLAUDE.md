# CLAUDE.md - 报名端开发指南

## Context7 配置
使用 Context7 MCP 获取最新的库文档和代码示例。当需要查询框架或库的最新文档时，请使用以下工具：
- `mcp__context7__resolve-library-id`: 解析库名称到Context7 ID
- `mcp__context7__get-library-docs`: 获取库的最新文档

常用库的Context7 ID：
- Next.js: `/vercel/next.js`
- Supabase: `/supabase/supabase`
- React: `/facebook/react`
- TypeScript: `/microsoft/TypeScript`
- Tailwind CSS: `/tailwindlabs/tailwindcss`
- shadcn/ui: `/shadcn-ui/ui`

## 项目背景
这是一个体育比赛报名管理系统，包含管理端（已完成）和报名端（待开发）。
- **管理端**：供管理员使用，用于创建赛事、设置报名要求、审核报名
- **报名端**：供教练使用，用于查看赛事、提交报名、管理队员信息

## 当前状态
- ✅ 管理端已基本完成开发
- ✅ 数据库结构已建立（final-fix.sql）
- ✅ Supabase 环境已配置（.env.local）
- ⏳ 报名端待开发

## 技术要求

### 必须遵循的规范
1. **框架版本**：Next.js 15 with App Router
2. **UI 库**：使用 shadcn/ui 组件，保持与管理端一致的视觉风格
3. **样式**：Tailwind CSS，遵循管理端的样式规范
4. **认证**：Supabase Auth with Email（已配置 Custom SMTP）
5. **数据库**：Supabase PostgreSQL
6. **文件存储**：Supabase Storage

### 代码规范
1. **TypeScript**：所有代码必须使用 TypeScript
2. **组件**：使用函数组件 + Hooks
3. **状态管理**：优先使用 React Hooks，复杂状态用 Context API
4. **表单**：React Hook Form + Zod 验证
5. **API 路由**：使用 Next.js Route Handlers
6. **错误处理**：统一的错误处理和用户提示

### 文件结构
```
with-supabase-app/
├── app/
│   ├── (auth)/           # 认证相关页面
│   │   ├── login/        # 登录（与管理端共享）
│   │   └── register/     # 注册（新增）
│   ├── portal/           # 报名端页面
│   │   ├── layout.tsx    # 报名端布局
│   │   ├── page.tsx      # 赛事列表
│   │   ├── events/       # 赛事相关
│   │   └── my/           # 个人中心
│   └── api/
│       └── portal/       # 报名端 API
├── components/
│   ├── portal/           # 报名端专用组件
│   └── ui/               # 共享 UI 组件
└── lib/
    ├── portal/           # 报名端工具函数
    └── types/            # TypeScript 类型定义
```

## 开发指导

### 1. 数据库操作
- 使用 Supabase Client 进行数据库操作
- 遵循 RLS 策略，确保数据安全
- 示例代码已在管理端实现，可参考

### 2. 认证流程
```typescript
// 使用 Supabase Auth
import { createClient } from '@/utils/supabase/client'

// 注册
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    data: {
      role: 'coach'  // 标记为教练角色
    }
  }
})

// 登录后角色判断
const { data: { user } } = await supabase.auth.getUser()
if (user?.user_metadata?.role === 'admin') {
  // 跳转到管理端
} else {
  // 跳转到报名端
}
```

### 3. 动态表单生成
根据管理端设置的字段要求动态生成表单：
```typescript
// 从 registration_settings 获取字段配置
// 根据 field.type 渲染不同的输入组件
// text -> Input
// date -> DatePicker
// select -> Select
// multiselect -> MultiSelect
// image -> ImageUpload
```

### 4. 分享链接实现
```typescript
// 生成分享链接
const shareUrl = `${window.location.origin}/portal/player/${registration.share_token}`

// 验证分享令牌
const { data } = await supabase
  .from('registrations')
  .select('*')
  .eq('share_token', token)
  .single()
```

### 5. 状态管理
报名状态流转：
- `draft` (草稿) → `submitted` (已提交/待审核)
- `submitted` → `approved` (已通过) / `rejected` (已驳回)
- `approved` → `cancelled` (已取消)
- `rejected` → `submitted` (重新提交)

## 重要提醒

### DO's ✅
1. 复用管理端的 UI 组件和样式
2. 保持代码风格一致性
3. 实现完整的错误处理
4. 添加适当的加载状态
5. 确保移动端响应式
6. 使用 TypeScript 类型定义

### DON'Ts ❌
1. 不要修改管理端的功能
2. 不要直接操作数据库，使用 Supabase Client
3. 不要硬编码配置，使用环境变量
4. 不要忽略表单验证
5. 不要创建重复的组件

## 测试账号
- 管理员：13800138000 / admin123
- 教练账号：需通过注册页面创建

## 环境变量
已配置在 `.env.local`：
```
NEXT_PUBLIC_SUPABASE_URL=你的URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的KEY
```

## 开发流程
1. 先执行 `registration-portal-db-update.sql` 更新数据库
2. 按照 `plan.md` 的步骤顺序开发
3. 每完成一个模块进行测试
4. 确保与管理端的数据互通

## 需要帮助时
- 查看管理端代码作为参考
- 使用 Context7 MCP 获取最新文档
- 保持代码注释清晰
- 遇到 Supabase 配置问题及时沟通