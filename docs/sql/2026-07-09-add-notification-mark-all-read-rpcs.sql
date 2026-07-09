-- Adds the notification batch-read RPCs used by app/portal/my/notifications/page.tsx.
-- These functions run as the authenticated caller and rely on existing RLS
-- policies so coaches can only update their own notifications.

CREATE OR REPLACE FUNCTION public.simple_mark_all_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.notifications n
  SET is_read = true
  WHERE n.is_read IS DISTINCT FROM true
    AND n.coach_id IN (
      SELECT c.id
      FROM public.coaches c
      WHERE c.auth_id = auth.uid()
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', updated_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN public.simple_mark_all_read();
END;
$$;

REVOKE ALL ON FUNCTION public.simple_mark_all_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.simple_mark_all_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.simple_mark_all_read() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;
