# 退出登录功能总览

## 📍 退出按钮位置

### 1. 管理端主页（`/`）
**位置**：右上角设置下拉菜单中
**组件**：`components/admin-header.tsx`
**确认对话框**：✅ 有
**实现**：
```typescript
<DropdownMenuItem onClick={(e) => {
  e.preventDefault();
  setShowLogoutDialog(true)
}}>
  退出登录
</DropdownMenuItem>

<AlertDialog open={showLogoutDialog}>
  <AlertDialogTitle>确认退出</AlertDialogTitle>
  <AlertDialogDescription>
    您确定要退出登录吗？退出后需要重新登录才能继续使用系统。
  </AlertDialogDescription>
  <AlertDialogFooter>
    <AlertDialogCancel>取消</AlertDialogCancel>
    <AlertDialogAction onClick={handleLogout}>确认退出</AlertDialogAction>
  </AlertDialogFooter>
</AlertDialog>
```

### 2. 账号管理页面（`/admin/account-management`）
**位置**：右上角（标题栏右侧）
**组件**：`app/admin/account-management/page.tsx`
**确认对话框**：✅ 有
**实现**：
```typescript
<Button onClick={() => setShowLogoutDialog(true)}>
  <LogOut className="h-4 w-4 mr-2" />
  退出登录
</Button>

<AlertDialog open={showLogoutDialog}>
  <AlertDialogTitle>确认退出</AlertDialogTitle>
  <AlertDialogDescription>
    您确定要退出登录吗？退出后需要重新登录才能继续使用系统。
  </AlertDialogDescription>
  <AlertDialogFooter>
    <AlertDialogCancel>取消</AlertDialogCancel>
    <AlertDialogAction onClick={handleLogout}>确认退出</AlertDialogAction>
  </AlertDialogFooter>
</AlertDialog>
```

### 3. 门户端（`/portal/*`）
**位置**：左侧边栏底部
**组件**：`app/portal/layout.tsx`
**确认对话框**：✅ 有
**实现**：侧边栏中有退出按钮，点击后显示确认对话框

### 4. 门户端个人设置（`/portal/my/settings`）
**位置**：页面底部
**组件**：`app/portal/my/settings/page.tsx`
**确认对话框**：需要检查

## 🔍 可能的问题

### 问题 1：快速点击
**现象**：用户快速连续点击退出按钮
**原因**：对话框还没完全渲染就被关闭
**解决**：添加防抖或禁用按钮

### 问题 2：下拉菜单自动关闭
**现象**：点击下拉菜单项后，菜单关闭但对话框没显示
**原因**：DropdownMenuItem 的默认行为
**解决**：已使用 `e.preventDefault()`

### 问题 3：多个对话框冲突
**现象**：同时打开多个确认对话框
**原因**：状态管理不当
**解决**：确保每个对话框有独立的状态

## 🧪 测试清单

- [ ] 管理端主页 - 设置菜单 - 退出登录
- [ ] 账号管理页面 - 右上角退出按钮
- [ ] 门户端 - 侧边栏退出按钮
- [ ] 门户端设置页 - 退出按钮
- [ ] 快速连续点击测试
- [ ] 不同浏览器测试

## 💡 建议

### 统一退出逻辑
创建一个共享的退出组件或 Hook：

```typescript
// hooks/useLogout.ts
export function useLogout() {
  const [showDialog, setShowDialog] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    await fetch('/api/auth/admin-session', { method: 'DELETE' })
    router.push('/auth/login')
    router.refresh()
  }

  return {
    showDialog,
    setShowDialog,
    handleLogout
  }
}
```

### 添加加载状态
```typescript
const [isLoggingOut, setIsLoggingOut] = useState(false)

const handleLogout = async () => {
  setIsLoggingOut(true)
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
    await fetch('/api/auth/admin-session', { method: 'DELETE' })
    router.push('/auth/login')
  } finally {
    setIsLoggingOut(false)
  }
}
```

## 🔧 调试步骤

如果用户报告退出按钮没有确认对话框：

1. **确认位置**：询问用户具体在哪个页面、哪个位置点击的退出
2. **检查控制台**：查看是否有 JavaScript 错误
3. **检查网络**：查看退出 API 是否被调用
4. **检查状态**：使用 React DevTools 查看对话框状态
5. **重现问题**：尝试重现用户的操作步骤

## 📝 当前状态

所有已知的退出按钮都已添加确认对话框：
- ✅ 管理端主页
- ✅ 账号管理页面
- ✅ 门户端侧边栏
- ⚠️ 门户端设置页（需要验证）

如果用户仍然遇到直接退出的问题，需要：
1. 确认具体的操作步骤
2. 检查浏览器控制台错误
3. 验证对话框组件是否正确渲染
