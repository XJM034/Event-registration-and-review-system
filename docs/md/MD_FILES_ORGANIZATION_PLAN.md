# 根目录 Markdown 文件整理计划

**审查日期**: 2026-03-09
**审查范围**: 项目根目录所有 .md 文件

---

## 当前根目录 .md 文件清单

共 6 个文件：
1. `CLAUDE.md` - Claude Code 工作指南（主文档）
2. `README.md` - 项目说明文档
3. `SECURITY.md` - 安全配置说明
4. `notification-system-verification.md` - 通知系统验证指南
5. `plan.md` - 报名端开发计划
6. `repair.md` - 上线前核查与待优化清单

---

## 文件分析与建议

### 1. `README.md` ✅ **保留在根目录**

**作用**: 项目说明文档，GitHub/GitLab 默认展示

**内容**:
- 项目概述与功能特性
- 技术栈说明
- 快速开始指南（克隆、安装、配置、运行）
- 环境变量配置说明
- 开发命令

**使用频率**: 高频（新成员入职、项目介绍、快速启动）

**建议**: **保留在根目录**
- 这是标准的项目入口文档
- GitHub/GitLab 会自动在仓库首页展示
- 新成员第一个查看的文档

**需要更新**:
- 第 25 行：`cd dubai` 应改为 `cd las-vegas`（目录名不匹配）
- 环境变量部分可能需要与 CLAUDE.md 同步

---

### 2. `CLAUDE.md` ✅ **保留在根目录**

**作用**: Claude Code (claude.ai/code) 工作指南，AI 辅助开发的核心文档

**内容**:
- 完整的代码库结构说明
- 数据库架构与 API 端点文档
- 认证机制、路由保护、动态表单等核心功能说明
- 常见任务修改指引
- 故障排查与已知不一致

**使用频率**: 极高频（AI 辅助开发时每次都会读取）

**建议**: **保留在根目录**
- Claude Code 默认读取根目录的 CLAUDE.md
- 这是 AI 辅助开发的"系统提示词"
- 移动到子目录会导致 Claude Code 无法自动读取

**状态**: 已在 2026-03-09 更新（补充双会话机制、API 端点等）

---

### 3. `SECURITY.md` ✅ **保留在根目录**

**作用**: 安全配置说明与部署检查清单

**内容**:
- 环境变量安全配置
- Next.js 安全功能配置
- 安全头配置
- 部署前安全检查清单
- 代码审查要点
- 应急响应流程

**使用频率**: 中频（部署前、安全审计时）

**建议**: **保留在根目录**
- GitHub 会识别 SECURITY.md 并在仓库安全标签中展示
- 安全相关文档应该显眼易找
- 部署前必读文档

**需要更新**:
- 与 `repair.md` 中的安全问题有重叠，建议合并或交叉引用
- 补充 `repair.md` 中发现的 P0 安全问题

---

### 4. `notification-system-verification.md` 📁 **移动到 docs/**

**作用**: 通知系统功能验证指南（单次功能修复的验证文档）

**内容**:
- 问题描述：管理端审核后通知不显示
- 已实施的修复代码
- 验证步骤（测试审核通过/驳回）
- 故障排查方法
- 相关文件列表

**使用频率**: 低频（功能已修复，仅作历史参考）

**建议**: **移动到 `docs/archive/` 或 `docs/troubleshooting/`**

**理由**:
- 这是针对特定 bug 的修复验证文档
- 功能已实施完成，不需要高频查看
- 属于历史记录/故障排查参考
- 根目录应保持简洁，只放核心文档

**建议路径**: `docs/troubleshooting/notification-system-verification.md`

---

### 5. `plan.md` 📁 **移动到 docs/**

**作用**: 报名端开发计划（历史开发计划文档）

**内容**:
- 项目概述与技术栈
- 数据库更新需求
- 功能模块清单（认证、主页布局、赛事活动、我的模块等）
- 路由规划
- API 路由规划
- 开发步骤（Phase 1-4）
- 注意事项与测试要点

**使用频率**: 极低频（开发已完成，仅作历史参考）

**建议**: **移动到 `docs/archive/` 或 `docs/planning/`**

**理由**:
- 这是报名端开发初期的规划文档
- 功能已全部实施完成（从 CLAUDE.md 可以看出）
- 多处标记为 `[ ]` 未完成，但实际已完成（文档未更新）
- 属于历史文档，不需要在根目录
- 可作为项目演进历史的参考

**建议路径**: `docs/archive/registration-portal-development-plan.md`

**可选操作**: 如果想保留，建议：
1. 更新所有 `[ ]` 为 `[x]`（已完成的功能）
2. 添加"已完成"标记和完成日期
3. 移动到 docs/archive/

---

### 6. `repair.md` 📁 **移动到 docs/**

**作用**: 上线前核查与待优化清单（安全审计与修复建议）

**内容**:
- P0-P3 优先级分级的问题清单
- 安全问题详细说明（硬编码密码、RLS 策略、SSRF 风险等）
- 具体文件定位与修复建议
- 部署前核查 Checklist
- 回归测试建议
- 基于实际 Supabase 导出的风险核实

**使用频率**: 中频（安全审计、上线前检查时）

**建议**: **移动到 `docs/security/` 或 `docs/audit/`**

**理由**:
- 这是一份详细的安全审计报告
- 内容与 SECURITY.md 有重叠但更详细
- 包含大量具体的代码位置和修复建议
- 应该作为安全文档的一部分，但不需要在根目录
- 根目录的 SECURITY.md 应该是简洁的指南，详细的审计报告放在 docs/

**建议路径**: `docs/security/pre-launch-security-audit.md`

**建议操作**:
1. 移动到 docs/security/
2. 在 SECURITY.md 中添加引用：
   ```markdown
   ## 详细安全审计报告
   完整的安全审计与修复建议见 [docs/security/pre-launch-security-audit.md](docs/security/pre-launch-security-audit.md)
   ```
3. 添加审计日期和状态跟踪（哪些已修复，哪些待修复）

---

## 建议的目录结构

### 根目录（保留 3 个核心文档）
```
/
├── README.md              # 项目说明（必须）
├── CLAUDE.md              # Claude Code 工作指南（必须）
├── SECURITY.md            # 安全配置说明（推荐）
├── package.json
├── next.config.ts
└── ...
```

### docs/ 目录（新建，存放详细文档）
```
docs/
├── md/                                    # 新建文件夹，存放移动的 .md 文件
│   ├── archive/                           # 历史文档
│   │   └── registration-portal-development-plan.md  # 原 plan.md
│   ├── troubleshooting/                   # 故障排查
│   │   └── notification-system-verification.md      # 原 notification-system-verification.md
│   └── security/                          # 安全文档
│       └── pre-launch-security-audit.md   # 原 repair.md
├── sql/                                   # 已存在
│   ├── actual-supabase-schema.sql
│   ├── create-buckets-simple.sql
│   └── ...
├── STORAGE_SETUP.md                       # 已存在
└── CLAUDE_MD_AUDIT_2026-03-09.md          # 已存在
```

---

## 实施步骤

### 步骤 1: 创建目录结构
```bash
mkdir -p docs/md/archive
mkdir -p docs/md/troubleshooting
mkdir -p docs/md/security
```

### 步骤 2: 移动文件
```bash
# 移动历史开发计划
mv plan.md docs/md/archive/registration-portal-development-plan.md

# 移动通知系统验证文档
mv notification-system-verification.md docs/md/troubleshooting/notification-system-verification.md

# 移动安全审计报告
mv repair.md docs/md/security/pre-launch-security-audit.md
```

### 步骤 3: 更新引用
1. 在 `SECURITY.md` 中添加对 `pre-launch-security-audit.md` 的引用
2. 在 `README.md` 中添加文档索引章节（可选）
3. 检查是否有其他文件引用了这些 .md 文件

### 步骤 4: 更新 README.md
修复第 25 行的目录名错误：
```bash
# 修改前
cd dubai

# 修改后
cd las-vegas
```

---

## 文件重要性评级

| 文件 | 重要性 | 使用频率 | 建议位置 | 理由 |
|------|--------|----------|----------|------|
| `README.md` | ⭐⭐⭐⭐⭐ | 极高 | 根目录 | 项目入口文档，GitHub 默认展示 |
| `CLAUDE.md` | ⭐⭐⭐⭐⭐ | 极高 | 根目录 | AI 辅助开发核心文档 |
| `SECURITY.md` | ⭐⭐⭐⭐ | 中高 | 根目录 | 安全配置指南，GitHub 识别 |
| `repair.md` | ⭐⭐⭐ | 中 | docs/md/security/ | 详细安全审计，不需要在根目录 |
| `notification-system-verification.md` | ⭐⭐ | 低 | docs/md/troubleshooting/ | 单次功能验证，历史参考 |
| `plan.md` | ⭐ | 极低 | docs/md/archive/ | 历史开发计划，已完成 |

---

## 额外建议

### 1. 创建文档索引（可选）
在 `docs/` 目录下创建 `README.md` 作为文档索引：

```markdown
# 项目文档索引

## 核心文档（根目录）
- [README.md](../README.md) - 项目说明与快速开始
- [CLAUDE.md](../CLAUDE.md) - Claude Code 工作指南
- [SECURITY.md](../SECURITY.md) - 安全配置说明

## 安全文档
- [pre-launch-security-audit.md](md/security/pre-launch-security-audit.md) - 上线前安全审计报告

## 故障排查
- [notification-system-verification.md](md/troubleshooting/notification-system-verification.md) - 通知系统验证指南

## 历史文档
- [registration-portal-development-plan.md](md/archive/registration-portal-development-plan.md) - 报名端开发计划

## 数据库文档
- [STORAGE_SETUP.md](STORAGE_SETUP.md) - Storage 配置指南
- [actual-supabase-schema.sql](sql/actual-supabase-schema.sql) - 数据库结构快照
```

### 2. 添加 .gitignore 规则（如果需要）
如果有临时的 .md 文件不想提交，可以在 `.gitignore` 中添加：
```
# 临时文档
*.draft.md
*.temp.md
```

### 3. 更新 CLAUDE.md 引用
在 CLAUDE.md 的"参考文件"章节中更新文档路径：
```markdown
### 参考文件
- `repair.md` - 历史修复记录 → `docs/md/security/pre-launch-security-audit.md`
- `docs/sql/actual-supabase-schema.sql` - 数据库结构参考
- `middleware.ts` - 路由保护规则
- `lib/auth.ts` - 认证机制实现
```

---

## 总结

### 保留在根目录（3个）
1. ✅ `README.md` - 项目说明（必须）
2. ✅ `CLAUDE.md` - AI 工作指南（必须）
3. ✅ `SECURITY.md` - 安全配置（推荐）

### 移动到 docs/md/（3个）
1. 📁 `plan.md` → `docs/md/archive/registration-portal-development-plan.md`
2. 📁 `notification-system-verification.md` → `docs/md/troubleshooting/notification-system-verification.md`
3. 📁 `repair.md` → `docs/md/security/pre-launch-security-audit.md`

### 核心原则
- **根目录**: 只放高频使用、必须显眼的核心文档
- **docs/**: 详细文档、历史文档、专项文档
- **保持简洁**: 根目录文件越少越好，便于快速定位

---

**审查人**: Claude Opus 4.6
**审查日期**: 2026-03-09
**状态**: 待用户确认后执行
