# 体育比赛报名系统-管理端开发计划

## 项目概述

基于 Next.js + Supabase 开发体育比赛报名系统的Web管理端，供管理员使用。系统包含登录认证、赛事管理、报名管理等核心功能。

## 技术栈

- **前端框架**: Next.js 15 (App Router)
- **UI组件**: shadcn/ui + Radix UI
- **样式**: Tailwind CSS
- **后端服务**: Supabase
- **认证**: Supabase Auth
- **数据库**: Supabase PostgreSQL
- **文件存储**: Supabase Storage
- **开发环境**: 本地开发

## 数据库设计

### 核心表结构

1. **管理员表 (admin_users)**
   - id (UUID, Primary Key)
   - phone (VARCHAR, 手机号)
   - password (VARCHAR, 密码哈希)
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)

2. **赛事表 (events)**
   - id (UUID, Primary Key)
   - name (VARCHAR, 赛事名称)
   - short_name (VARCHAR, 赛事简称)
   - poster_url (TEXT, 海报图片URL)
   - type (VARCHAR, 赛事类型)
   - start_date (DATE, 开始时间)
   - end_date (DATE, 结束时间)
   - address (TEXT, 赛事地址)
   - details (TEXT, 赛事详情-富文本)
   - phone (VARCHAR, 咨询电话)
   - is_visible (BOOLEAN, 是否显示)
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)

3. **报名设置表 (registration_settings)**
   - id (UUID, Primary Key)
   - event_id (UUID, Foreign Key -> events.id)
   - team_requirements (JSONB, 队伍报名要求)
   - player_requirements (JSONB, 人员报名要求)
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)

4. **报名申请表 (registrations)**
   - id (UUID, Primary Key)
   - event_id (UUID, Foreign Key -> events.id)
   - team_data (JSONB, 队伍信息)
   - players_data (JSONB, 队员信息数组)
   - status (ENUM: 'pending', 'approved', 'rejected')
   - rejection_reason (TEXT, 驳回理由)
   - submitted_at (TIMESTAMP)
   - reviewed_at (TIMESTAMP)
   - reviewer_id (UUID, 审核员ID)

## 功能模块开发计划

### 第一阶段：基础架构和认证系统

1. **项目初始化**
   - 基于现有Supabase模板进行定制
   - 配置项目结构和路由
   - 设置开发环境

2. **管理员认证系统**
   - 手机号+密码登录页面
   - 登录状态管理
   - 路由保护中间件
   - 退出登录功能

3. **数据库初始化**
   - 创建数据库表结构
   - 设置RLS (Row Level Security)
   - 创建必要的数据库函数

### 第二阶段：主页面和赛事管理

1. **主页面 - 赛事活动列表**
   - 赛事列表展示组件
   - 搜索功能
   - 显示/隐藏状态切换
   - 删除确认对话框
   - 顶部导航和设置菜单

2. **创建赛事页面**
   - 表单设计和验证
   - 图片上传功能 (Supabase Storage)
   - 富文本编辑器 (赛事详情)
   - 数据提交和处理

### 第三阶段：信息管理系统

1. **基本信息管理**
   - 赛事信息编辑页面
   - 数据更新功能
   - 表单验证和错误处理

2. **报名设置功能**
   - 队伍报名要求配置界面
   - 人员报名要求配置界面
   - 自定义字段管理
   - 必填项设置

### 第四阶段：报名审核系统

1. **审核列表**
   - 待审核报名展示
   - 报名详情查看
   - 审核通过/驳回功能
   - 驳回理由填写

2. **报名列表**
   - 已通过报名展示
   - 报名信息查看
   - 手动添加报名
   - 报名数据导出功能

### 第五阶段：优化和完善

1. **用户体验优化**
   - 加载状态和错误处理
   - 响应式设计优化
   - 性能优化

2. **数据导出功能**
   - 报名数据Excel导出
   - 批量操作功能

## 开发里程碑

### Week 1: 基础架构
- [ ] 项目环境搭建
- [ ] 数据库设计和创建
- [ ] 认证系统开发
- [ ] 登录页面完成

### Week 2: 核心功能
- [ ] 主页面赛事列表
- [ ] 创建赛事功能
- [ ] 基本信息管理
- [ ] 报名设置功能

### Week 3: 审核系统
- [ ] 报名审核列表
- [ ] 审核功能实现
- [ ] 报名列表管理
- [ ] 数据导出功能

### Week 4: 测试和优化
- [ ] 功能测试
- [ ] 性能优化
- [ ] 用户体验改进
- [ ] 部署准备

## 技术要点

1. **状态管理**: 使用 React Server Components + Client Components 混合架构
2. **数据获取**: Supabase客户端进行实时数据同步
3. **文件上传**: Supabase Storage处理图片上传
4. **表单处理**: React Hook Form + Zod验证
5. **UI组件**: shadcn/ui组件库确保一致性
6. **路由保护**: Next.js中间件实现认证检查

## 部署计划

1. **开发环境**: 本地开发使用已配置的Supabase项目
2. **生产环境**: 后续可部署至阿里云服务器
3. **CI/CD**: 可配置GitHub Actions自动化部署

## 风险控制

1. **数据安全**: 实施Row Level Security确保数据隔离
2. **文件安全**: 配置Storage权限策略
3. **认证安全**: 使用Supabase Auth确保会话安全
4. **备份策略**: 定期数据备份机制