# MemFire to Supabase Migration

Last updated: 2026-08-11

This document tracks the active migration from the MemFire Cloud project used by this repo to the Supabase project owned by the same account. It intentionally excludes secret values.

## Current State

### Local MemFire Backup

- Current machine profile: `/Users/minxian/.config/event-registration-and-review-system/las-vegas.env`
- Current local runtime env: `.env.local`
- Dedicated MemFire backup created before switching targets: `.env.memfire.local`
- `.env.local` and `.env.memfire.local` are ignored by Git via `.env*.local`.
- `.env.local` and the machine profile now point to the new Supabase project.
- `.env.memfire.local` still points to MemFire and is the local rollback/reference copy.
- `SUPABASE_EXPECTED_PROJECT_REF=ernfouwkblxwzshmbsda` is required so builds and runtime clients reject a stale or mismatched backend URL.

### MemFire Source Project

- Project name in MemFire dashboard: `Eventregistration`
- Resource ID: `d4ntvs8g91htqli3urg0`
- API host: `d4ntvs8g91htqli3urg0.baseapi.memfiredb.com`
- The other open MemFire project, `toothbrushgame` / `d555hb0g91htqli40010`, is not the source for this repo.

### Supabase Target Projects

Retired/unusable project:

- Supabase project name: `XJM034's Project`
- Project ref: `hcsullmeeyiuomrsbcpv`
- Region: `ap-southeast-1`
- Restore attempt result: Supabase reports this project has been paused for more than 90 days and cannot be restored.

Current active project:

- Supabase project name: `Eventregistration`
- Project ref: `ernfouwkblxwzshmbsda`
- API URL: `https://ernfouwkblxwzshmbsda.supabase.co`
- Database host: `db.ernfouwkblxwzshmbsda.supabase.co`
- Region: `ap-southeast-1`
- Database engine reported by Supabase: Postgres 17.6
- Organization: `XJM034's Org` (`qxqudblgzasjjrxpfudk`), plan `free`
- Supabase cost check before creation: `$0/month`
- Created at: `2026-07-08T08:50:36.586806Z`
- Auth setting changed after creation: public self-signup disabled.

## MemFire Settings Snapshot

### Database

MemFire dashboard shows the `public` schema has these tables. The dashboard estimate showed `0` rows, but a service-role count check from `.env.memfire.local` confirmed live rows exist:

| Table | Service-role count |
| --- | ---: |
| `admin_users` | 6 |
| `coaches` | 13 |
| `events` | 7 |
| `registrations` | 6 |
| `registration_settings` | 8 |
| `notifications` | 17 |
| `player_share_tokens` | 18 |
| `player_submissions` | 0 |
| `project_types` | 3 |
| `projects` | 5 |
| `divisions` | 7 |
| `event_divisions` | 5 |
| `security_audit_logs` | 245 |

The user said data already written into the database is not required to be preserved, so these rows are noted for awareness but are not part of the current migration scope unless explicitly requested later.

Functions shown in the dashboard:

- `generate_share_token` - invoker
- `handle_new_user` - definer
- `mark_all_notifications_as_read` - invoker
- `set_share_token` - invoker
- `simple_mark_all_read` - invoker
- `update_updated_at` - invoker

Triggers shown in the dashboard:

- `registration_share_token_trigger` on `registrations` before insert
- `update_admin_users_updated_at` on `admin_users` before update
- `update_coaches_updated_at` on `coaches` before update
- `update_events_updated_at` on `events` before update
- `update_registrations_updated_at` on `registrations` before update

Enabled extensions shown in the dashboard:

- `pg_graphql`
- `pg_net`
- `pg_stat_statements`
- `pgcrypto`
- `pgjwt`
- `pgsodium`
- `plpgsql`
- `uuid-ossp`

Other database settings:

- No enum types in `public`.
- Replication page reports no results.
- Database direct connection is currently off in MemFire.

### Storage

Buckets in the source project, verified through the Storage API:

| Bucket | Visibility | Size limit | MIME allowlist |
| --- | --- | ---: | --- |
| `event-posters` | public | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| `registration-files` | private | 10 MB | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| `player-photos` | private | 5 MB | `image/jpeg`, `image/png`, `image/jpg`, `image/webp` |
| `team-documents` | private | 10 MB | `image/jpeg`, `image/png`, `image/jpg`, `image/webp`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/octet-stream` |

Storage policy page shows no explicit policies under the four buckets, `storage.objects`, or `storage.buckets`.

This matches the app-level privacy model in `lib/storage-object.ts`: only `event-posters` is public; the other buckets are read through `/api/storage/object` with app-side authorization.

### Auth

- Auth users page shows `0` users.
- Email provider is enabled.
- Phone provider is disabled.
- WeChat, Apple, Azure, Bitbucket, Discord, Facebook, GitHub, GitLab, KeyCloak, Slack, Spotify, WorkOS, Zoom, and other OAuth providers are disabled.
- Redirect URL list is empty.
- Built-in email service/templates are present; no custom SMTP evidence was found from the visible dashboard text.

### Other Services

- Cloud Functions page did not show a function list.
- Static Hosting page shows no uploaded files.
- Realtime inspector is available, but no replication setup was shown.

## Repo SQL Assets

Relevant SQL files for this migration:

- `docs/sql/supabase-memfire-settings-migration.sql` - consolidated Supabase-target migration generated for this move; prefer this once the target project is active.
- `docs/sql/memfire-clean.sql`
- `docs/sql/project-management-schema.sql`
- `docs/sql/add-admin-users-columns.sql`
- `docs/sql/add-coaches-columns.sql`
- `docs/sql/account-management-schema.sql`
- `docs/sql/add-event-reference-templates.sql`
- `docs/sql/add-division-rules.sql`
- `docs/sql/security-create-audit-log-table.sql`
- `docs/sql/create-buckets-simple.sql`
- `docs/sql/security-privatize-sensitive-storage-buckets.sql`
- `docs/sql/security-tighten-admin-users-and-share-tokens.sql`
- `docs/sql/security-tighten-registrations-and-settings.sql`

Do not apply `docs/sql/memfire-clean.sql` blindly to a hosted Supabase project. It includes MemFire/Supabase storage schema bootstrap statements and a default admin account insert. On Supabase, the storage schema already exists, and the migration should avoid importing seed account data unless explicitly requested.

`docs/sql/actual-supabase-schema.sql` remains useful evidence, but it is not a safe single-file migration target because it is a database dump that includes platform-managed storage internals and is known to miss later repo migrations. See `docs/DOC_FRESHNESS_AUDIT.md`.

## Applied Supabase Migration

The Supabase target was initialized through MCP migrations instead of importing business rows. Applied migrations:

| Version | Name |
| --- | --- |
| `20260708103410` | `memfire_core_schema` |
| `20260708103440` | `memfire_registration_schema` |
| `20260708103514` | `memfire_functions_storage` |
| `20260708103601` | `memfire_rls_policies` |
| `20260708103746` | `memfire_advisor_fixes` |
| `20260709010128` | `add_notification_mark_all_read_rpcs` |

Final verified state:

- `public` has 13 app tables; all have RLS enabled.
- `project_types` has 3 reusable seed rows and `projects` has 4 reusable seed rows.
- Business rows from MemFire were intentionally not copied.
- Storage has four buckets matching the MemFire source limits and MIME allowlists.
- Functions present: `generate_share_token`, `set_share_token`, `update_updated_at`, `handle_new_user`, `simple_mark_all_read`, `mark_all_notifications_as_read`.
- Triggers present: `registration_share_token_trigger`, `update_*_updated_at`, and `on_auth_user_created`.
- Supabase security advisors report no lints after `memfire_advisor_fixes`.
- Supabase performance advisors only report unused indexes, which is expected on a newly created empty database with no traffic.

## 2026-08-11 Production Cutover Correction

The Supabase project was automatically paused after a second low-activity cycle. Investigation confirmed that the Vercel Cron was deployed, enabled, and scheduled, but the Production Supabase environment variables still contained the pre-migration MemFire values created before the 2026-07-08 cutover. The keepalive route therefore ran against MemFire instead of project `ernfouwkblxwzshmbsda`.

Recovery and prevention:

- Restored Supabase project `ernfouwkblxwzshmbsda` and confirmed status `ACTIVE_HEALTHY`.
- Verified all six migration versions above, 13 public app tables with RLS enabled, Storage tables, and a service-role read from `events`.
- Replaced the four Vercel Production Supabase variables with values validated against the restored target.
- Added required `SUPABASE_EXPECTED_PROJECT_REF` validation to `scripts/ensure-env.mjs` and `lib/env.ts` so a future stale URL fails the build/runtime instead of silently targeting another backend.
- Expanded the daily keepalive to three read-only database requests and added project-ref/query-count observability.
- Added route and environment regression tests. Production Cron registration, manual execution, runtime log, and deployed-host verification are release acceptance requirements for this flow.

`docs/sql/supabase-memfire-settings-migration.sql` has been updated to reflect this final state. If applied through Supabase MCP `apply_migration`, split it similarly or remove explicit transaction wrapping.

## Rebuild Order

If this migration needs to be replayed into another empty Supabase project, prefer applying `docs/sql/supabase-memfire-settings-migration.sql` first. It consolidates the steps below into a Supabase-safe, no-business-data migration.

Manual equivalent:

1. Create or apply a clean public-schema migration based on `docs/sql/memfire-clean.sql`, excluding:
   - `CREATE SCHEMA storage`
   - `CREATE TYPE storage.buckettype`
   - `CREATE TABLE storage.*`
   - default `INSERT INTO public.admin_users (...)`
2. Apply project-management structures from `docs/sql/project-management-schema.sql`.
3. Apply account/auth column migrations:
   - `docs/sql/add-admin-users-columns.sql`
   - `docs/sql/add-coaches-columns.sql`
   - `docs/sql/account-management-schema.sql`
4. Apply feature increments:
   - `docs/sql/add-event-reference-templates.sql`
   - `docs/sql/add-division-rules.sql`
   - `docs/sql/security-create-audit-log-table.sql`
5. Create Storage buckets with `docs/sql/create-buckets-simple.sql`.
6. Immediately apply `docs/sql/security-privatize-sensitive-storage-buckets.sql` so only `event-posters` remains public.
7. Apply security tightening:
   - `docs/sql/security-tighten-admin-users-and-share-tokens.sql`
   - `docs/sql/security-tighten-registrations-and-settings.sql`
8. Configure Supabase Auth to match MemFire:
   - Email enabled.
   - Phone disabled.
   - OAuth providers disabled unless deliberately added later.
   - Redirect URLs left empty until the deployed app URL is known.
9. Update runtime env:
   - Keep `.env.memfire.local` unchanged.
   - Replace `.env.local` values with Supabase URL, publishable key, legacy anon key, service role key, and JWT secret.
   - Sync the machine profile only after the Supabase env is verified.
10. Update application config that still names the MemFire host, especially `next.config.ts` image `remotePatterns`.

Current repo state already updates `next.config.ts` so the Storage image host follows `NEXT_PUBLIC_SUPABASE_URL` while retaining the backed-up MemFire host for compatibility.

## Verification Checklist

Current verification result:

- Supabase MCP `_list_tables` for `public`: shows the 13 app tables listed above.
- Supabase MCP `_list_tables` for `storage`: shows 4 buckets.
- Supabase MCP `_get_advisors security`: `0` lints.
- Supabase MCP `_get_advisors performance`: only new-database unused-index INFO lints remain.
- `node scripts/ensure-env.mjs`: passed.
- `./node_modules/.bin/vitest run`: 36 files / 141 tests passed.
- `node scripts/verify-security-posture.mjs`: passed with 0 failures after disabling public self-signup.

Remaining manual follow-up:

- Password length/complexity still requires Supabase control-panel verification.
- MFA remains out of current release scope; the security script reports it as a warning.
- Anonymous row-isolation checks were skipped because the new database intentionally has no sample business rows yet.
