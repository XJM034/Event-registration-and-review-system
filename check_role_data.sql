-- 检查报名数据中的角色 ID
SELECT 
  r.id as registration_id,
  r.event_id,
  jsonb_array_elements(r.players_data) ->> 'role' as player_role_id,
  rs.player_requirements -> 'roles' as configured_roles
FROM registrations r
LEFT JOIN registration_settings rs ON r.event_id = rs.event_id
WHERE r.players_data IS NOT NULL
LIMIT 5;
