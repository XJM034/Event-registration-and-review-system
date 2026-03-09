# 通知系统验证指南

## 问题描述
用户报告在管理端审核（通过/驳回）报名后，报名端的"我的通知"页面没有显示相应的通知消息。

## 已实施的修复

### 1. 添加通知创建逻辑
在 `/app/api/registrations/[id]/review/route.ts` 中添加了通知创建代码：

```typescript
// 创建通知
if (data && data.coach_id) {
  const eventName = data.events?.short_name || data.events?.name || '赛事'

  let notificationData = {
    coach_id: data.coach_id,
    type: status === 'approved' ? 'approval' : 'rejection',
    title: status === 'approved' ? '报名审核通过' : '报名已驳回',
    message: status === 'approved'
      ? `您的${eventName}报名已通过审核，请及时查看。`
      : `您的${eventName}报名被驳回。${rejection_reason ? `原因：${rejection_reason}` : ''}`,
    is_read: false,
    event_id: data.event_id,
    registration_id: data.id,
    metadata: {
      team_name: data.team_data?.team_name,
      status: status,
      rejection_reason: rejection_reason
    }
  }

  await supabase.from('notifications').insert(notificationData)
}
```

### 2. 数据库表结构更新
创建了 SQL 脚本 `add-metadata-column.sql` 来确保 notifications 表有 metadata 字段：

```sql
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS metadata jsonb;
```

## 验证步骤

### 1. 检查数据库表结构
在 Supabase/MemFire Cloud 控制台中运行以下 SQL 确认表结构：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;
```

确保包含以下字段：
- id (uuid)
- coach_id (uuid)
- type (text)
- title (text)
- message (text)
- is_read (boolean)
- event_id (uuid)
- registration_id (uuid)
- metadata (jsonb)
- created_at (timestamp)

### 2. 测试通知创建流程

#### A. 测试审核通过
1. 管理员登录管理端
2. 进入赛事管理 > 审核列表
3. 选择一条待审核的报名，点击"通过"
4. 切换到报名端，使用对应教练账号登录
5. 进入"我的通知"页面
6. 应该看到标题为"[赛事名]报名审核通过"的通知

#### B. 测试驳回
1. 管理员在审核列表中选择另一条报名
2. 点击"驳回"并填写驳回原因
3. 报名端教练账号查看"我的通知"
4. 应该看到标题为"[赛事名]报名已驳回"的通知，包含驳回原因

### 3. 验证通知显示
通知页面 (`/app/portal/my/notifications/page.tsx`) 会：
- 显示所有通知，未读在前
- 显示通知标题、消息内容、时间
- 提供"标记已读"、"查看赛事"、"查看报名"按钮
- 显示未读通知数量徽章

## 故障排查

如果通知仍未显示，检查：

1. **浏览器控制台**：查看是否有 JavaScript 错误
2. **网络请求**：检查 API 调用是否成功
3. **数据库日志**：查看 notifications 表是否有新记录插入
4. **coach_id 匹配**：确认报名记录的 coach_id 与登录用户的教练 ID 一致

## 相关文件
- `/app/api/registrations/[id]/review/route.ts` - 审核 API，负责创建通知
- `/app/portal/my/notifications/page.tsx` - 通知显示页面
- `/add-metadata-column.sql` - 数据库迁移脚本