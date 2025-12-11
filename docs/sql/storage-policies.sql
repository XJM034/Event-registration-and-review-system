-- Storage Buckets 和 RLS 策略配置
-- 在 MemFire SQL 编辑器中执行此脚本

-- ========================================
-- 第一部分：创建存储桶
-- ========================================

-- 创建 event-posters 存储桶（赛事海报，公开访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-posters',
  'event-posters',
  true,  -- 公开访问
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 创建 registration-files 存储桶（报名附件，私有访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'registration-files',
  'registration-files',
  false,  -- 私有访问
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 创建 player-photos 存储桶（队员照片，公开访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-photos',
  'player-photos',
  true,  -- 公开访问
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

-- 创建 team-documents 存储桶（队伍文档，公开访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-documents',
  'team-documents',
  true,  -- 公开访问
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];


-- ========================================
-- 第二部分：配置 RLS 策略
-- ========================================

-- 删除可能存在的旧策略
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to event-posters" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to registration-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload registration files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read own registration files" ON storage.objects;

-- ========================================
-- event-posters 存储桶策略（公开读取，认证用户可上传）
-- ========================================

-- 策略 1: 所有人可以读取 event-posters 中的文件
CREATE POLICY "Public can read event posters"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-posters');

-- 策略 2: 认证用户可以上传到 event-posters
CREATE POLICY "Authenticated can upload event posters"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-posters'
  AND auth.role() = 'authenticated'
);

-- 策略 3: 认证用户可以更新自己上传的 event-posters
CREATE POLICY "Authenticated can update event posters"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'event-posters'
  AND auth.role() = 'authenticated'
);

-- 策略 4: 认证用户可以删除自己上传的 event-posters
CREATE POLICY "Authenticated can delete event posters"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'event-posters'
  AND auth.role() = 'authenticated'
);


-- ========================================
-- registration-files 存储桶策略（私有访问）
-- ========================================

-- 策略 5: 认证用户可以上传到 registration-files
CREATE POLICY "Authenticated can upload registration files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'registration-files'
  AND auth.role() = 'authenticated'
);

-- 策略 6: 认证用户可以读取自己上传的 registration-files
CREATE POLICY "Authenticated can read own registration files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'registration-files'
  AND auth.role() = 'authenticated'
);

-- 策略 7: 认证用户可以更新自己上传的 registration-files
CREATE POLICY "Authenticated can update own registration files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'registration-files'
  AND auth.role() = 'authenticated'
);

-- 策略 8: 认证用户可以删除自己上传的 registration-files
CREATE POLICY "Authenticated can delete own registration files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'registration-files'
  AND auth.role() = 'authenticated'
);


-- ========================================
-- player-photos 存储桶策略（公开读取，认证用户可上传）
-- ========================================

-- 策略 9: 所有人可以读取 player-photos 中的文件
CREATE POLICY "Public can read player photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-photos');

-- 策略 10: 认证用户可以上传到 player-photos
CREATE POLICY "Authenticated can upload player photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'player-photos'
  AND auth.role() = 'authenticated'
);

-- 策略 11: 认证用户可以更新自己上传的 player-photos
CREATE POLICY "Authenticated can update player photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'player-photos'
  AND auth.role() = 'authenticated'
);

-- 策略 12: 认证用户可以删除自己上传的 player-photos
CREATE POLICY "Authenticated can delete player photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'player-photos'
  AND auth.role() = 'authenticated'
);


-- ========================================
-- team-documents 存储桶策略（公开读取，认证用户可上传）
-- ========================================

-- 策略 13: 所有人可以读取 team-documents 中的文件
CREATE POLICY "Public can read team documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-documents');

-- 策略 14: 认证用户可以上传到 team-documents
CREATE POLICY "Authenticated can upload team documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'team-documents'
  AND auth.role() = 'authenticated'
);

-- 策略 15: 认证用户可以更新自己上传的 team-documents
CREATE POLICY "Authenticated can update team documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'team-documents'
  AND auth.role() = 'authenticated'
);

-- 策略 16: 认证用户可以删除自己上传的 team-documents
CREATE POLICY "Authenticated can delete team documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'team-documents'
  AND auth.role() = 'authenticated'
);


-- ========================================
-- 验证配置
-- ========================================

-- 查看所有存储桶
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets;

-- 查看所有存储策略
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'objects';

-- 完成提示
SELECT '✅ Storage 存储桶和 RLS 策略配置完成！' as message;
