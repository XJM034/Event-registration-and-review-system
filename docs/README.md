# 项目文档索引

本目录包含项目的所有详细文档，按类别组织。

---

## 📂 目录结构

```
docs/
├── md/                                    # Markdown 文档集合
│   ├── archive/                           # 历史文档
│   ├── troubleshooting/                   # 故障排查
│   ├── security/                          # 安全文档
│   └── MD_FILES_ORGANIZATION_PLAN.md      # 文档整理计划
├── sql/                                   # SQL 脚本
├── STORAGE_SETUP.md                       # Storage 配置指南
└── CLAUDE_MD_AUDIT_2026-03-09.md          # 文档审计报告
```

---

## 📖 核心文档（根目录）

这些文档位于项目根目录，是最重要和最常用的文档：

- **[README.md](../README.md)** - 项目说明与快速开始指南
  - 项目概述、功能特性
  - 技术栈说明
  - 安装与配置步骤
  - 开发命令

- **[CLAUDE.md](../CLAUDE.md)** - Claude Code 工作指南
  - 完整的代码库结构说明
  - 数据库架构与 API 端点文档
  - 认证机制、路由保护、动态表单等核心功能
  - 常见任务修改指引
  - 故障排查与已知不一致

- **[SECURITY.md](../SECURITY.md)** - 安全配置说明
  - 环境变量安全配置
  - Next.js 安全功能配置
  - 部署前安全检查清单
  - 应急响应流程

---

## 🔒 安全文档

### [pre-launch-security-audit.md](md/security/pre-launch-security-audit.md)
**上线前安全审计报告**

详细的安全审计与修复建议，包含：
- P0-P3 优先级分级的问题清单
- 安全问题详细说明（硬编码密码、RLS 策略、SSRF 风险等）
- 具体文件定位与修复建议
- 部署前核查 Checklist
- 回归测试建议
- 基于实际 Supabase 导出的风险核实

**使用场景**：
- 上线前安全检查
- 安全审计
- 修复安全问题时参考

---

## 🔧 故障排查

### [notification-system-verification.md](md/troubleshooting/notification-system-verification.md)
**通知系统验证指南**

针对通知系统功能的验证文档，包含：
- 问题描述：管理端审核后通知不显示
- 已实施的修复代码
- 验证步骤（测试审核通过/驳回）
- 故障排查方法
- 相关文件列表

**使用场景**：
- 通知系统出现问题时参考
- 了解通知系统的实现细节
- 历史问题追溯

---

## 📚 历史文档

### [registration-portal-development-plan.md](md/archive/registration-portal-development-plan.md)
**报名端开发计划**（已完成）

报名端开发初期的规划文档，包含：
- 项目概述与技术栈
- 数据库更新需求
- 功能模块清单（认证、主页布局、赛事活动、我的模块等）
- 路由规划与 API 路由规划
- 开发步骤（Phase 1-4）
- 注意事项与测试要点

**状态**：功能已全部实施完成，仅作历史参考

**使用场景**：
- 了解项目演进历史
- 参考初期的架构设计思路

---

## 📊 审计与规划

### [CLAUDE_MD_AUDIT_2026-03-09.md](CLAUDE_MD_AUDIT_2026-03-09.md)
**CLAUDE.md 文档审计报告**

对 CLAUDE.md 文档进行全面审计的结果，包含：
- 已失效/过时的文档内容（4个问题）
- 缺失的功能文档（20+ API 端点）
- 文档不准确的内容（2个问题）
- 统计数据与优先级建议
- 实施计划

**审计日期**：2026-03-09

### [MD_FILES_ORGANIZATION_PLAN.md](md/MD_FILES_ORGANIZATION_PLAN.md)
**Markdown 文件整理计划**

根目录 .md 文件的整理方案，包含：
- 每个文件的详细分析
- 移动理由与建议路径
- 具体的实施步骤
- 文件重要性评级表

---

## 🗄️ 数据库文档

### [STORAGE_SETUP.md](STORAGE_SETUP.md)
**Storage 配置指南**

Supabase Storage 的配置说明。

### SQL 脚本目录

`sql/` 目录包含所有数据库相关的 SQL 脚本：

- **[actual-supabase-schema.sql](sql/actual-supabase-schema.sql)** - 生产数据库结构快照（主参考）
- **[create-buckets-simple.sql](sql/create-buckets-simple.sql)** - 创建 Storage bucket 的脚本
- **[storage-policies.sql](sql/storage-policies.sql)** - Storage/RLS 策略参考
- 其他迁移和配置脚本

---

## 📝 文档维护指南

### 文档更新原则

1. **根目录文档**：只放高频使用、必须显眼的核心文档
   - README.md（项目说明）
   - CLAUDE.md（AI 工作指南）
   - SECURITY.md（安全配置）

2. **docs/md/ 文档**：详细文档、历史文档、专项文档
   - `archive/` - 已完成的历史文档
   - `troubleshooting/` - 故障排查指南
   - `security/` - 详细安全文档

3. **保持简洁**：根目录文件越少越好，便于快速定位

### 添加新文档

根据文档类型选择合适的位置：

- **核心文档**：放在根目录（需充分理由）
- **安全相关**：放在 `docs/md/security/`
- **故障排查**：放在 `docs/md/troubleshooting/`
- **历史记录**：放在 `docs/md/archive/`
- **数据库相关**：放在 `docs/sql/`

### 文档命名规范

- 使用小写字母和连字符：`my-document.md`
- 包含日期的文档：`document-name-2026-03-09.md`
- 描述性名称，避免缩写

---

## 🔗 快速链接

### 开发相关
- [项目说明](../README.md)
- [Claude 工作指南](../CLAUDE.md)
- [数据库结构](sql/actual-supabase-schema.sql)

### 安全相关
- [安全配置](../SECURITY.md)
- [安全审计报告](md/security/pre-launch-security-audit.md)

### 故障排查
- [通知系统验证](md/troubleshooting/notification-system-verification.md)

### 审计与规划
- [文档审计报告](CLAUDE_MD_AUDIT_2026-03-09.md)
- [文档整理计划](md/MD_FILES_ORGANIZATION_PLAN.md)

---

**最后更新**: 2026-03-09
**维护者**: 开发团队
