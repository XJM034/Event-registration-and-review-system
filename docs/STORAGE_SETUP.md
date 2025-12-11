# Supabase Storage 存储桶配置指南

## 问题说明

如果用户在报名端上传图片时遇到 **"文件上传失败: Bucket not found"** 错误，说明 Supabase Storage 中缺少必需的存储桶。

## 系统使用的存储桶

本系统需要以下 4 个 Supabase Storage 存储桶：

| 存储桶名称 | 用途 | 访问权限 | 大小限制 | 支持格式 |
|-----------|------|---------|---------|---------|
| `event-posters` | 赛事海报图片 | 公开读取 | 5MB | JPG, PNG, WEBP, GIF |
| `registration-files` | 队伍 Logo、报名附件 | 认证用户读写 | 10MB | JPG, PNG, WEBP, PDF |
| `player-photos` | 队员照片、证件照 | 公开读取 | 5MB | JPG, PNG, WEBP |
| `team-documents` | 队伍文档、自定义字段附件 | 公开读取 | 10MB | JPG, PNG, WEBP, PDF |

## 配置方法

### 方法一：使用 SQL 脚本（推荐）

1. **登录 Supabase Dashboard**
   - 访问 https://supabase.com/dashboard
   - 选择你的项目

2. **打开 SQL Editor**
   - 在左侧菜单中找到 "SQL Editor"
   - 点击 "+ New query" 创建新查询

3. **执行 SQL 脚本**

   选择以下任一脚本执行：

   **选项 A：简单版本（无 RLS 策略）**
   ```bash
   # 复制并执行文件内容
   docs/sql/create-buckets-simple.sql
   ```

   这个脚本会创建所有必需的存储桶，使用服务密钥认证，无需配置 RLS 策略。

   **选项 B：完整版本（包含 RLS 策略）**
   ```bash
   # 复制并执行文件内容
   docs/sql/storage-policies.sql
   ```

   这个脚本会创建存储桶并配置完整的行级安全策略。

4. **执行脚本**
   - 将脚本内容复制到 SQL Editor
   - 点击 "Run" 执行
   - 等待执行完成，应该会看到成功提示

5. **验证存储桶已创建**
   - 在左侧菜单中找到 "Storage"
   - 确认所有 4 个存储桶都已创建：
     - ✅ event-posters
     - ✅ registration-files
     - ✅ player-photos
     - ✅ team-documents

### 方法二：手动创建（适用于可视化界面）

如果你更喜欢使用可视化界面，可以按照以下步骤手动创建：

1. **进入 Storage 页面**
   - 在 Supabase Dashboard 左侧菜单中点击 "Storage"

2. **创建第一个存储桶：event-posters**
   - 点击 "New bucket"
   - Bucket name: `event-posters`
   - Public bucket: ✅ 勾选（公开访问）
   - File size limit: 5242880 (5MB)
   - Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`
   - 点击 "Create bucket"

3. **创建第二个存储桶：registration-files**
   - 点击 "New bucket"
   - Bucket name: `registration-files`
   - Public bucket: ✅ 勾选（公开访问）
   - File size limit: 10485760 (10MB)
   - Allowed MIME types: `image/jpeg, image/png, image/webp, application/pdf`
   - 点击 "Create bucket"

4. **创建第三个存储桶：player-photos**
   - 点击 "New bucket"
   - Bucket name: `player-photos`
   - Public bucket: ✅ 勾选（公开访问）
   - File size limit: 5242880 (5MB)
   - Allowed MIME types: `image/jpeg, image/png, image/jpg, image/webp`
   - 点击 "Create bucket"

5. **创建第四个存储桶：team-documents**
   - 点击 "New bucket"
   - Bucket name: `team-documents`
   - Public bucket: ✅ 勾选（公开访问）
   - File size limit: 10485760 (10MB)
   - Allowed MIME types: `image/jpeg, image/png, image/jpg, image/webp, application/pdf`
   - 点击 "Create bucket"

## 配置后验证

配置完成后，可以通过以下方式验证：

1. **检查存储桶列表**
   ```sql
   SELECT id, name, public, file_size_limit, allowed_mime_types
   FROM storage.buckets
   WHERE id IN ('event-posters', 'registration-files', 'player-photos', 'team-documents');
   ```

2. **测试文件上传**
   - 在管理端创建赛事并上传海报（测试 event-posters）
   - 在报名端提交报名并上传队伍 Logo（测试 registration-files）
   - 在自定义字段中上传图片（测试 team-documents）
   - 通过分享链接上传队员照片（测试 player-photos）

## 常见问题

### Q: 为什么有些存储桶设置为公开访问？

A:
- `event-posters`、`player-photos`、`team-documents` 需要公开访问，因为这些图片需要在报名端展示给所有用户
- `registration-files` 虽然在简化版本中设置为公开，但在完整版本的 RLS 策略中可以设置为私有访问，仅认证用户可读写

### Q: 执行 SQL 脚本时遇到权限错误怎么办？

A:
- 确保你以项目所有者身份登录
- 检查是否在正确的项目中执行脚本
- 如果仍有问题，尝试使用可视化界面手动创建

### Q: 已经创建了存储桶，但仍然报错？

A:
1. 检查存储桶名称是否完全匹配（区分大小写）
2. 检查存储桶的访问权限设置
3. 清除浏览器缓存并重新登录
4. 检查网络连接和 Supabase 服务状态

### Q: 可以修改文件大小限制吗？

A: 可以。在 Storage 设置中修改相应存储桶的 `file_size_limit` 值，或者重新执行 SQL 脚本并修改大小参数。

## 安全注意事项

1. **RLS 策略**: 建议使用 `storage-policies.sql` 配置完整的 RLS 策略，确保文件访问安全
2. **文件类型限制**: 只允许上传指定的 MIME 类型，防止恶意文件上传
3. **文件大小限制**: 设置合理的文件大小限制，防止存储空间滥用
4. **定期清理**: 建议定期清理未使用的文件，节省存储空间

## 相关文件

- SQL 脚本（简化版本）: `docs/sql/create-buckets-simple.sql`
- SQL 脚本（完整版本）: `docs/sql/storage-policies.sql`
- 数据库架构文档: `docs/sql/actual-supabase-schema.sql`
- 项目文档: `CLAUDE.md`

## 技术支持

如果遇到问题，请检查：
1. Supabase 项目状态是否正常
2. 环境变量配置是否正确（`.env.local`）
3. 网络连接是否正常
4. Supabase 服务是否在维护中
