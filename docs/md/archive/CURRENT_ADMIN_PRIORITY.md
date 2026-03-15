# 当前登录账号优先显示功能

## 📋 更新内容

### 功能说明
将当前登录的管理员账号自动排在管理员列表的第一位，并添加明显的视觉标识。

## 🎯 实现效果

### 1. 排序优先
- 当前登录的管理员账号始终显示在列表第一行
- 其他管理员按原有顺序排列
- 跨页面保持一致（即使搜索或分页）

### 2. 视觉标识

**表格行高亮：**
- 浅蓝色背景（`bg-blue-50`）
- 左侧蓝色边框（4px，`border-l-blue-500`）
- 与其他行明显区分

**当前账号 Badge：**
- 显示在手机号旁边
- 蓝色 Badge 带 Shield 图标
- 文字："当前账号"

### 3. 编辑对话框标识
- 编辑当前账号时，对话框标题下方显示"当前账号" Badge
- 超管复选框自动禁用
- 显示警告："⚠️ 不能修改当前账号的权限"

## 🔧 技术实现

### 1. 获取当前管理员 ID

**新增状态：**
```typescript
const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)
```

**获取逻辑：**
```typescript
useEffect(() => {
  const fetchCurrentAdmin = async () => {
    try {
      const res = await fetch('/api/admin/current')
      const data = await res.json()
      if (data.success) {
        setCurrentAdminId(data.data.id)
      }
    } catch (error) {
      console.error('Error fetching current admin:', error)
    }
  }
  fetchCurrentAdmin()
}, [])
```

### 2. 排序逻辑

**在 loadAdmins 函数中：**
```typescript
const adminsList = data.data.admins
const sortedAdmins = adminsList.sort((a: Admin, b: Admin) => {
  if (a.id === currentAdminId) return -1  // 当前账号排第一
  if (b.id === currentAdminId) return 1
  return 0  // 其他账号保持原顺序
})
setAdmins(sortedAdmins)
```

### 3. 视觉标识

**表格行样式：**
```typescript
const isCurrentAdmin = admin.id === currentAdminId
return (
  <TableRow
    key={admin.id}
    className={isCurrentAdmin ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
  >
    <TableCell className="font-medium">
      {admin.phone}
      {isCurrentAdmin && (
        <Badge variant="default" className="ml-2">
          <Shield className="h-3 w-3 mr-1" />
          当前账号
        </Badge>
      )}
    </TableCell>
    {/* ... */}
  </TableRow>
)
```

## 📊 用户体验改进

### 之前
- 管理员列表按创建时间或其他顺序排列
- 无法快速识别当前登录的账号
- 可能误操作修改自己的账号

### 之后
- ✅ 当前账号始终在第一位，一目了然
- ✅ 蓝色高亮 + Badge 双重标识
- ✅ 编辑时自动禁用权限修改
- ✅ 防止误操作

## 🎨 视觉设计

### 颜色方案
- **背景色**：`bg-blue-50` - 浅蓝色，柔和不刺眼
- **边框色**：`border-l-blue-500` - 蓝色，与 Badge 呼应
- **Badge**：`variant="default"` - 蓝色主题色

### 布局
```
┌─────────────────────────────────────────────────────────┐
│ 🔵 18140044662 [🛡️ 当前账号]  │ 张三 │ 🛡️ 超级管理员 │ ... │
├─────────────────────────────────────────────────────────┤
│   13800000001                  │ 李四 │ 👤 普通管理员 │ ... │
├─────────────────────────────────────────────────────────┤
│   13800000002                  │ 王五 │ 🛡️ 超级管理员 │ ... │
└─────────────────────────────────────────────────────────┘
```

## 🔒 安全特性

### 前端保护
1. **视觉提示**：当前账号明显标识
2. **操作限制**：编辑时禁用权限复选框
3. **警告提示**：显示不能修改权限的警告

### 后端保护
1. **API 验证**：不能修改自己的权限
2. **最后超管保护**：不能取消最后一个超管
3. **详细日志**：记录所有权限变更操作

## 📝 相关文件

### 修改文件
- `components/account-management/admins-tab.tsx`
  - 新增 `currentAdminId` 状态
  - 新增获取当前管理员逻辑
  - 修改排序逻辑
  - 添加视觉标识

### 依赖 API
- `GET /api/admin/current` - 获取当前管理员信息

## 🧪 测试要点

### 功能测试
1. ✅ 当前账号显示在列表第一位
2. ✅ 当前账号有蓝色背景和边框
3. ✅ 当前账号显示 Badge
4. ✅ 搜索时当前账号仍在第一位（如果匹配）
5. ✅ 分页时当前账号在第一页第一位

### 视觉测试
1. ✅ 蓝色高亮清晰可见
2. ✅ Badge 位置合适
3. ✅ 与其他行区分明显
4. ✅ 响应式布局正常

### 交互测试
1. ✅ 点击编辑当前账号，显示"当前账号" Badge
2. ✅ 超管复选框禁用
3. ✅ 显示警告提示
4. ✅ 可以修改姓名，不能修改权限

## 💡 使用说明

### 识别当前账号
- 查看列表第一行
- 寻找蓝色背景的行
- 查看手机号旁的"当前账号" Badge

### 编辑当前账号
1. 点击第一行的"编辑"按钮
2. 可以修改姓名
3. 超管复选框为灰色（禁用状态）
4. 看到警告："⚠️ 不能修改当前账号的权限"

### 编辑其他账号
1. 点击其他行的"编辑"按钮
2. 可以修改姓名和权限
3. 超管复选框可正常勾选/取消

## 🎉 总结

本次更新通过以下方式提升了用户体验：

1. **自动排序**：当前账号始终在第一位，无需查找
2. **视觉标识**：蓝色高亮 + Badge，一目了然
3. **防误操作**：编辑时自动禁用权限修改
4. **一致性**：列表和编辑对话框都有标识

这些改进让管理员能够快速识别自己的账号，避免误操作，提升了系统的易用性和安全性。
