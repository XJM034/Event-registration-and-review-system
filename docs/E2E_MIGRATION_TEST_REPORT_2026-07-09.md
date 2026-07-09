# E2E Migration Regression Test Report - 2026-07-09

## Scope

- Target: Vercel Preview `https://event-registration-and-review-system-fyen5r90a.vercel.app`
- Database target: Supabase project `ernfouwkblxwzshmbsda`
- Purpose: Verify whether the MemFire-to-Supabase migration broke user-facing flows.
- Test accounts: newly created low-risk admin and coach accounts. Passwords are intentionally not stored in this report.
- Browser: Chrome, using the current deployed preview.
- Primary test event: `迁移E2E测试赛-2026-07-09T02-25-59` (`4f78540d-b4bb-468d-bd1b-0b867bd770c6`).

## Result Legend

- `PASS`: Verified in Chrome or by a directly related runtime/API check.
- `BROKEN`: Confirmed functional breakage with reproducible evidence.
- `SUSPECT`: Behavior is suspicious or partially blocked; needs follow-up before calling it broken.
- `BLOCKED`: Could not verify due to missing data, permissions, or tooling.

## Test Matrix

| ID | Area | Scenario | Status | Evidence |
|----|------|----------|--------|----------|
| AUTH-01 | Auth | Admin login reaches management side | PASS | Chrome login with admin test account reached `/events`; page showed `测试管理员` and event management content. |
| AUTH-02 | Auth | Coach login reaches portal side | PASS | Chrome login with coach test account reached `/portal`; page showed `测试教练，您好`. |
| ADMIN-01 | Admin events | Event list loads from Supabase | PASS | `/events` loaded the Supabase-backed event list. Before creation it showed `暂无赛事活动`; after creation it showed the E2E event. |
| ADMIN-02 | Admin events | Create event writes to Supabase | PASS | Created `迁移E2E测试赛-2026-07-09T02-25-59`; DB row exists with `start_date=2026-08-01`, `end_date=2026-08-03`, `is_visible=true`. |
| ADMIN-03 | Admin settings | Registration settings load/save | SUSPECT | Settings tab loaded and accepted date inputs. Initial invalid test dates correctly failed validation. With valid dates (`2026-07-01T00:00`, `2026-07-25T23:59`, `2026-07-31T20:00`), Playwright click, DOM click, keyboard trigger, and system mouse click did not create a `registration_settings` row. DB remained empty until a test fixture was inserted manually. |
| COACH-01 | Coach portal | Event list/detail load | PASS | Coach `/portal` showed the E2E event as `报名中`; event detail showed configured registration window `2026-07-01 00:00 ~ 2026-07-25 23:59`. |
| COACH-02 | Coach registration | Save draft and submit registration | PASS | Coach filled team fields and one player, saved draft `b2fa5d0b-1fa9-4045-b7c6-817f3193db73`, then submitted it. DB status moved from `draft` to `pending`, with `player_count=1`. |
| REVIEW-01 | Review | Admin can review coach registration | PASS | Admin review list showed 1 pending item; review detail loaded the team/player data; clicking `通过` changed DB status to `approved` with `reviewed_at` and `reviewer_id`. |
| NOTIF-01 | Notifications | Coach receives review notification and mark-all-read works | PASS | Approval created one `approval` notification. Coach notifications page showed unread `1`; clicking `全部标记已读` changed UI to `未读0 / 已读1`. |
| SHARE-01 | Public share | Player share page opens from generated token | PASS | Public share denied a `pending` registration token as expected. A separate draft fixture token prefix `e2e_a2717a18...` opened `/player-share/<token>`, displayed the event/player fields, and submitting changed `player_number` from `18` to `19`; token marked `is_filled=true`. |
| STORAGE-01 | Storage | Upload or controlled file read works after migration | PASS | Public share upload used `app/twitter-image.png`; DB wrote an `/api/storage/object?...bucket=player-photos...` URL to token and registration player data. `storage.objects` contains the uploaded object, size `289886` bytes. |
| EXPORT-01 | Export | Admin or coach export endpoint produces a file | PASS | After selecting `导出所有已通过的报名`, admin export produced `/Users/minxian/Downloads/迁移E2E测试赛-2026-07-09T02-25-59_报名信息_2026-07-09.zip` (`8681` bytes). `unzip -l` showed a non-empty workbook entry. |

## Broken Or Suspected Function Points

### 1. Registration Settings Save Does Not Persist From UI

- Status: `SUSPECT`
- Surface: admin event management -> `报名设置` -> `保存设置`
- Evidence:
  - The tab loads and date inputs are editable.
  - Invalid dates were correctly rejected by frontend validation, so validation code is active.
  - After switching to valid dates, repeated save attempts via several browser interaction paths did not create any row in `public.registration_settings`.
  - Confirming with SQL after each attempt returned `[]` for the event until a fixture was inserted manually.
- Impact:
  - Coach registration depends on `registration_settings`; if this reproduces for a human user, newly created events cannot be configured through the UI after migration.
- Follow-up:
  - Reproduce manually in Chrome DevTools Network.
  - Confirm whether the `保存设置` button fires the `POST /api/events/[id]/registration-settings` request.
  - If the request is sent, inspect the response body/status and admin session cookies.

### 2. Export Dialog Defaults To Pending Scope On Approved List

- Status: `BROKEN`
- Surface: admin event management -> `报名列表` -> `下载` -> `确认导出`
- Evidence:
  - On `报名列表`, the page showed `已通过审核的报名 (1)`.
  - Opening export config with zero selected rows defaulted to `导出所有待审核的报名`.
  - Confirming without changing scope produced a browser alert and console error `Export failed with status: 404`.
  - Code evidence: `getDefaultExportScope(0)` returns `pending`, regardless of whether the current tab is the approved registration list.
- Impact:
  - A normal user on the approved list can click download and confirm the default dialog, then receive a failed export despite visible approved data.
- Workaround verified:
  - Selecting `导出所有已通过的报名` manually produced a zip file successfully.

## Test Data Notes

- `registration_settings` was manually inserted after ADMIN-03 failed to persist through UI, so downstream coach/share/review tests could continue.
- Public share and storage upload used separate draft registration fixtures because share editing is intentionally blocked once a registration is `pending`.
- Full passwords and full share tokens are intentionally omitted from this report.

## Follow-up Fixes Applied

- `ADMIN-03`: `POST /api/events/[id]/registration-settings` now uses `maybeSingle()` for the optional existing-row lookup, so a missing row is treated as the create path instead of an error-like empty result. The settings UI save/add buttons also declare `type="button"` to avoid accidental form submission behavior if the surrounding DOM changes.
- `EXPORT-01`: the export dialog now accepts a caller-provided fallback scope. The approved registration list opens with `approved` when no rows are selected; the pending review list keeps `pending`.
- Verification after the fix:
  - `./node_modules/.bin/vitest run 'lib/__tests__/export-scope-utils.test.ts' 'lib/__tests__/registration-settings-route.test.ts'` passed.
  - `./node_modules/.bin/next lint` exited 0 with existing warnings.
  - `./node_modules/.bin/tsc --noEmit --pretty false` still fails on pre-existing errors outside these fixes: `app/api/admin/coaches/route.ts` and `app/portal/events/[id]/register/page.tsx`.
