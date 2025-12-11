-- 简单创建存储桶（不需要 RLS 策略，因为使用服务密钥）
-- 在 MemFire SQL 编辑器中执行此脚本

-- ============================================
-- 1. 创建 event-posters 存储桶（赛事海报）
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-posters',
  'event-posters',
  true,  -- 公开访问
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

-- ============================================
-- 2. 创建 registration-files 存储桶（报名附件、队伍logo）
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'registration-files',
  'registration-files',
  true,  -- 公开访问（队伍logo等需要在页面显示）
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

-- ============================================
-- 3. 创建 player-photos 存储桶（队员照片、证件照）
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-photos',
  'player-photos',
  true,  -- 公开访问（证件照需要在页面显示）
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']::text[];

-- ============================================
-- 4. 创建 team-documents 存储桶（队伍文档、自定义字段附件）
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-documents',
  'team-documents',
  true,  -- 公开访问（需要在页面显示）
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf']::text[];

-- ============================================
-- 查看所有创建的存储桶
-- ============================================
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('event-posters', 'registration-files', 'player-photos', 'team-documents');

-- 完成提示
SELECT '✅ 存储桶创建完成！使用服务密钥可以直接上传，无需配置 RLS 策略。' as message;
