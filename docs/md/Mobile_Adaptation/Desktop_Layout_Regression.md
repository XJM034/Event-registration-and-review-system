# 移动端修复对桌面端的影响排查与修复

**创建日期**: 2026-03-15
**状态**: 已完成

## 问题描述

在实施移动端 sticky 返回按钮时，发现桌面端布局被影响：
1. ~~负边距导致 sticky header 错位~~ （实际上负边距是正确的，用于抵消父容器 padding）
2. **按钮容器使用了 `grid w-full` + `sm:flex`，导致桌面端按钮换行**

## 排查结果

### 真正的问题

| 文件 | 行号 | 问题 | 修复 |
|------|------|------|------|
| `app/portal/events/[id]/page.tsx` | ~1027 | `grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap` | ✅ 改为 `flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end` |

### 负边距不是问题

负边距（`-mx-4 -mt-4` 和 `md:-mx-6 md:-mt-6`）是**正确的设计**：
- 门户布局主内容区有 `p-4 md:p-6` padding
- 负边距用于让 sticky header 突破这个 padding，实现全宽效果
- sticky header 内部仍有 `px-4 md:px-6`，所以内容对齐是正确的

## 修复内容

### 按钮容器布局修复

**错误写法**：
```tsx
<div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap">
```
问题：`w-full` 在桌面端仍然生效，导致 flex 容器占满宽度，按钮会换行

**正确写法**：
```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
```
- 移动端：`flex-col` 垂直堆叠
- 桌面端：`flex-row` 水平排列，`justify-end` 右对齐
- 移除 `w-full`，让容器宽度由内容决定
