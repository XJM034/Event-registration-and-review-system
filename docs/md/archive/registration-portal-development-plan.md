# 报名端开发计划 (Registration Portal Development Plan)

## 项目概述
基于 Next.js + Supabase 开发体育比赛报名系统的报名端，供教练和家长使用。系统与现有管理端共享认证系统，但有独立的用户界面和功能。

## 技术栈
- **前端框架**: Next.js 15 (App Router)
- **UI组件**: shadcn/ui + Tailwind CSS
- **后端服务**: Supabase (Auth, Database, Storage)
- **认证方案**: Supabase Auth (邮箱登录)
- **状态管理**: React Hooks + Context API
- **表单处理**: React Hook Form + Zod

## 数据库更新需求
需要执行 `registration-portal-db-update.sql` 来添加报名端所需的表和字段：
- coaches 表：存储教练信息
- notifications 表：通知系统
- player_submissions 表：队员信息提交
- 更新 registrations 表：添加coach_id、registration_type、share_token等字段
- 更新 events 表：添加报名时间字段

## 功能模块

### 1. 认证系统 (Authentication)
- [x] 与管理端共享登录页面
- [ ] 新增注册页面（邮箱注册）
- [ ] 角色自动分流（管理员→管理端，教练→报名端）
- [ ] 使用 Supabase Auth + Custom SMTP

### 2. 主页布局 (Main Layout)
- [ ] 左侧可折叠导航栏
  - 赛事活动（默认显示）
  - 我的（包含子菜单：我的报名、我的通知）
- [ ] 响应式设计适配

### 3. 赛事活动模块 (Events Module)
#### 3.1 赛事列表页
- [ ] 显示管理端发布的可见赛事
- [ ] 赛事搜索功能
- [ ] 根据报名时间显示"去报名"或"已完结"状态
- [ ] 列表展示：海报、名称、类型、状态、时间

#### 3.2 赛事详情页
- [ ] 展示赛事完整信息（海报、时间、地址、电话、详情）
- [ ] 显示当前用户的报名状态
- [ ] 报名入口按钮

#### 3.3 报名页面
- [ ] 队伍信息填写（根据管理端设置的字段）
- [ ] 队员信息管理
  - 添加队员
  - 编辑队员
  - 删除队员
  - 生成分享链接
- [ ] 草稿保存功能
- [ ] 报名提交功能

#### 3.4 队员信息填写页
- [ ] 支持通过分享链接访问（无需登录）
- [ ] 根据管理端设置动态生成表单
- [ ] 图片上传功能（证件照等）
- [ ] 表单验证

### 4. 我的模块 (My Module)
#### 4.1 我的报名
- [ ] 报名列表展示
- [ ] 状态筛选（全部、草稿、待审核、已报名、已驳回、已取消）
- [ ] 搜索功能
- [ ] 报名详情查看
- [ ] 草稿编辑/删除
- [ ] 已报名取消功能

#### 4.2 我的通知
- [ ] 通知列表展示
- [ ] 未读消息标记
- [ ] 通知详情页
- [ ] 审核通过/驳回通知
- [ ] 支持再次提交（驳回情况）

### 5. 公共组件 (Common Components)
- [ ] 布局组件（Layout）
- [ ] 导航栏组件（Sidebar）
- [ ] 搜索组件（Search）
- [ ] 状态标签（StatusBadge）
- [ ] 加载状态（Loading）
- [ ] 空状态（Empty）
- [ ] 错误处理（Error）

## 路由规划
```
/                           # 重定向到登录或主页
/login                      # 登录页（与管理端共享）
/register                   # 注册页（新增）
/portal                     # 报名端主页（赛事活动）
/portal/events              # 赛事列表
/portal/events/[id]         # 赛事详情
/portal/events/[id]/register # 报名页面
/portal/player/[token]      # 队员信息填写（通过分享链接）
/portal/my/registrations    # 我的报名
/portal/my/notifications    # 我的通知
/portal/my/notifications/[id] # 通知详情
```

## API 路由
```
/api/auth/register          # 用户注册
/api/portal/events          # 获取赛事列表
/api/portal/events/[id]     # 获取赛事详情
/api/portal/registrations   # 报名相关操作
/api/portal/registrations/[id] # 单个报名操作
/api/portal/player-submit   # 队员信息提交
/api/portal/notifications   # 通知相关
```

## 开发步骤

### Phase 1: 基础架构 (Foundation)
1. 数据库更新
2. 认证系统改造
3. 路由配置
4. 布局组件

### Phase 2: 核心功能 (Core Features)
1. 赛事列表和详情
2. 报名表单系统
3. 动态字段渲染
4. 文件上传

### Phase 3: 用户功能 (User Features)
1. 我的报名管理
2. 通知系统
3. 分享链接功能
4. 草稿保存

### Phase 4: 优化完善 (Optimization)
1. 表单验证
2. 错误处理
3. 加载状态
4. 响应式优化

## 注意事项
1. 与管理端共享 Supabase 配置和认证系统
2. 保持 UI 风格与管理端一致
3. 确保分享链接的安全性
4. 处理好各种报名状态的转换
5. 优化移动端体验

## 测试要点
1. 注册和登录流程
2. 报名完整流程
3. 分享链接功能
4. 通知系统
5. 状态转换逻辑
6. 表单验证
7. 文件上传
8. 响应式布局