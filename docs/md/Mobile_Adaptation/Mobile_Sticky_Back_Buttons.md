# 移动端返回按钮 Sticky 优化

**创建日期**: 2026-03-15
**状态**: 已完成
**关联**: `Mobile_Adaptation_v2.md`、`Mobile_Bottom_Tabs_Plan.md`

## 问题描述

移动端页面中，"返回"按钮跟随内容滚动，用户向下滑动后无法快速找到返回入口。
需要将返回按钮固定在页面顶部（`sticky top-0`），保持始终可见。

## 排查结果

### 已修复（sticky）

| 文件 | 按钮文案 | 状态 |
|------|---------|------|
| `app/events/[id]/registrations/[registrationId]/detail/page.tsx` | 返回报名列表 | ✅ 已 sticky |
| `app/events/[id]/registrations/[registrationId]/review/page.tsx` | 返回审核列表 | ✅ 已 sticky |

### 需要修复

| 文件 | 行号 | 按钮文案 | 优先级 | 说明 |
|------|------|---------|--------|------|
| `app/portal/events/[id]/register/page.tsx` | ~2136 | 返回 + 保存草稿 + 提交报名 | P0 | ✅ 已修复 |
| `app/portal/events/[id]/page.tsx` | ~759 | 返回赛事列表 | P0 | ✅ 已修复 |
| `app/events/create/page.tsx` | ~470 | 返回赛事列表 | P1 | ✅ 已修复 |

### 不需要修复

| 文件 | 原因 |
|------|------|
| `app/events/[id]/page.tsx` | 返回按钮在侧边栏/导航区内，非独立页面流 |

## 统一修复规则

```tsx
{/* sticky 顶部栏 */}
<div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur px-3 py-2 sm:px-6 sm:py-3">
  <div className="max-w-Xxl mx-auto flex items-center justify-between">
    <Button variant="outline" className="h-10" onClick={...}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      返回XXX
    </Button>
    {/* 右侧操作按钮（如有） */}
  </div>
</div>
```

规则要点：
- `sticky top-0 z-30`：固定在顶部
- `bg-background/95 backdrop-blur`：毛玻璃效果，与项目其他 sticky header 一致
- `border-b border-border`：底部分隔线
- 按钮高度 `h-10`：符合移动端触控规范
- 内容区与 sticky 栏分离，各自独立 padding
