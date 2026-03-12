begin;

create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_type text not null,
  actor_id uuid null,
  actor_role text null,
  action text not null,
  resource_type text not null,
  resource_id text null,
  event_id uuid null,
  registration_id uuid null,
  target_user_id uuid null,
  ip_address text null,
  user_agent text null,
  request_id text null,
  result text not null,
  reason text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists security_audit_logs_created_at_idx
  on public.security_audit_logs (created_at desc);

create index if not exists security_audit_logs_action_created_at_idx
  on public.security_audit_logs (action, created_at desc);

create index if not exists security_audit_logs_actor_idx
  on public.security_audit_logs (actor_type, actor_id, created_at desc);

create index if not exists security_audit_logs_event_idx
  on public.security_audit_logs (event_id, created_at desc);

create index if not exists security_audit_logs_registration_idx
  on public.security_audit_logs (registration_id, created_at desc);

alter table public.security_audit_logs enable row level security;

revoke all on public.security_audit_logs from anon, authenticated;

commit;
