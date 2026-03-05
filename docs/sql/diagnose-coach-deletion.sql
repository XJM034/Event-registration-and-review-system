-- 诊断教练账号删除问题
-- 检查教练 13800000006 的所有报名记录

-- 1. 查看该教练的所有报名记录（包括所有状态）
SELECT
  r.id,
  r.status,
  r.created_at,
  r.submitted_at,
  r.cancelled_at,
  e.name as event_name,
  e.short_name
FROM registrations r
LEFT JOIN events e ON r.event_id = e.id
LEFT JOIN coaches c ON r.coach_id = c.id
WHERE c.phone = '13800000006'
ORDER BY r.created_at DESC;

-- 2. 按状态统计该教练的报名数量
SELECT
  r.status,
  COUNT(*) as count
FROM registrations r
LEFT JOIN coaches c ON r.coach_id = c.id
WHERE c.phone = '13800000006'
GROUP BY r.status;

-- 3. 查看该教练的基本信息
SELECT
  id,
  phone,
  name,
  auth_id,
  created_at
FROM coaches
WHERE phone = '13800000006';

-- 4. 如果需要强制删除所有报名记录（包括非草稿状态），执行以下语句：
-- 注意：这会永久删除数据，请确认后再执行

-- DELETE FROM registrations
-- WHERE coach_id IN (
--   SELECT id FROM coaches WHERE phone = '13800000006'
-- );

-- 5. 删除教练账号（在清理报名后执行）
-- DELETE FROM coaches WHERE phone = '13800000006';
