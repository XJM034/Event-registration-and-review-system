-- ===================================================
-- 创建通知系统的触发器
-- 当管理员审核报名时自动生成通知
-- ===================================================

-- 1. 创建生成通知的函数
CREATE OR REPLACE FUNCTION create_registration_notification()
RETURNS TRIGGER AS $$
DECLARE
    event_name TEXT;
    notification_title TEXT;
    notification_message TEXT;
    notification_type TEXT;
BEGIN
    -- 只在状态真正改变时创建通知
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- 获取赛事名称
        SELECT name INTO event_name FROM events WHERE id = NEW.event_id;

        -- 根据新状态设置通知内容
        CASE NEW.status
            WHEN 'approved' THEN
                notification_title := '报名审核通过';
                notification_message := '您提交的"' || event_name || '"报名申请已通过审核';
                notification_type := 'approval';
            WHEN 'rejected' THEN
                notification_title := '报名被驳回';
                notification_message := '您提交的"' || event_name || '"报名申请被驳回';
                IF NEW.rejection_reason IS NOT NULL THEN
                    notification_message := notification_message || '，原因：' || NEW.rejection_reason;
                END IF;
                notification_type := 'rejection';
            WHEN 'cancelled' THEN
                notification_title := '报名已取消';
                notification_message := '您的"' || event_name || '"报名已被取消';
                IF NEW.cancelled_reason IS NOT NULL THEN
                    notification_message := notification_message || '，原因：' || NEW.cancelled_reason;
                END IF;
                notification_type := 'rejection';
            ELSE
                -- 其他状态不生成通知
                RETURN NEW;
        END CASE;

        -- 插入通知记录
        INSERT INTO notifications (
            coach_id,
            registration_id,
            event_id,
            type,
            title,
            message,
            is_read,
            created_at
        ) VALUES (
            NEW.coach_id,
            NEW.id,
            NEW.event_id,
            notification_type,
            notification_title,
            notification_message,
            false,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 删除旧的触发器（如果存在）
DROP TRIGGER IF EXISTS registration_notification_trigger ON registrations;

-- 3. 创建新的触发器
CREATE TRIGGER registration_notification_trigger
AFTER UPDATE ON registrations
FOR EACH ROW
EXECUTE FUNCTION create_registration_notification();

-- 4. 为现有的已审核记录补充通知（可选）
-- 为最近7天内审核的记录创建通知
INSERT INTO notifications (coach_id, registration_id, event_id, type, title, message, is_read, created_at)
SELECT
    r.coach_id,
    r.id,
    r.event_id,
    CASE
        WHEN r.status = 'approved' THEN 'approval'
        WHEN r.status = 'rejected' THEN 'rejection'
        ELSE 'reminder'
    END,
    CASE
        WHEN r.status = 'approved' THEN '报名审核通过'
        WHEN r.status = 'rejected' THEN '报名被驳回'
        ELSE '报名状态更新'
    END,
    CASE
        WHEN r.status = 'approved' THEN '您提交的"' || e.name || '"报名申请已通过审核'
        WHEN r.status = 'rejected' THEN
            '您提交的"' || e.name || '"报名申请被驳回' ||
            CASE
                WHEN r.rejection_reason IS NOT NULL THEN '，原因：' || r.rejection_reason
                ELSE ''
            END
        ELSE '您的"' || e.name || '"报名状态已更新'
    END,
    false,  -- 标记为未读
    COALESCE(r.reviewed_at, r.last_status_change, NOW())
FROM registrations r
JOIN events e ON r.event_id = e.id
WHERE r.status IN ('approved', 'rejected')
  AND r.reviewed_at >= NOW() - INTERVAL '7 days'
  AND r.coach_id IS NOT NULL
  AND NOT EXISTS (
      -- 避免重复创建
      SELECT 1 FROM notifications n
      WHERE n.registration_id = r.id
  );

-- 5. 验证通知表数据
SELECT '=== 通知记录统计 ===' as info;
SELECT type, is_read, COUNT(*) as count
FROM notifications
GROUP BY type, is_read
ORDER BY type, is_read;

SELECT '=== 触发器创建完成！===' as message;
SELECT '现在管理员审核报名时会自动生成通知' as result;