# SEEFIX Reporter Mobile — Status, Documentation & Implementation Guide (As-Built)

**Document:** SEEFIX-MOBILE-REPORTER-HANDOFF-003 (supersedes HANDOFF-002)  
**Date:** 2026-10-09  
**Audience:** the next development agent / orchestrator continuing this **existing** app. Do **not** scaffold a new project.  
**Repository:** `C:\Development\seefixmanagement\seefix-mobile-reporter` · GitHub `erwin-io/seefix-mobile-reporter` · branch `main`  
**Git state:** only the initial commit exists; **all work is uncommitted** (product-owner instruction: never commit, stage, reset, stash or discard without explicit permission).  
**Contracts implemented:** `SEEFIX-MOBILE-REPORTER-DESIGN-001` v1 (reporting), v2 (account enhancement), v3.1 as-built (`SEEFIX_Reporter_Mobile_Complete_Implementation_Guide_v3_1_AsBuilt_Cancellation_20261009.md`: cancellation + one active report), plus the product-owner decisions in §5.  
**Backend:** `seefix-api` (Node/Express, port 3000) — **never modified by mobile work**.

---

## 1. Status at a glance

| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold, versions, routing | ✅ Done | Official Ionic Angular standalone tabs starter + Capacitor 8; Android platform added; debug APK built (before M7) |
| M1 Login / Register / Verify email / session / guards / logout | ✅ Done | **Email-only** login (no username UI) |
| M2 Edit profile, change email, change password, forgot/reset | ✅ Done | Change-username removed by owner decision |
| M3 Three tabs, Home, header bell | ✅ Done | Report shortcut is a bottom-right FAB |
| M4 New Report (Camera/Gallery, location, GPS, multipart) | ✅ Done | Camera v8 `takePhoto`/`chooseFromGallery`; **confirmation dialog before submit** |
| M5 My Reports, Report Detail, screening, timeline | ✅ Done | Hero + detail cards; newest-first icon timeline with inferred actor |
| M6 Notifications + hardening | ⚠️ Mostly done | Real-mailbox OTP E2E and device tests outstanding; owner chose **web simulation instead of device testing** |
| M7 Reporter cancellation + one active report | ✅ Done | Live E2E 22/22 + live web UI checks |

**Quality gates (last run, 2026-10-09, after the submit-confirmation change):** `ng build` (production) ✅ · `ng lint` ✅ · `npm run typecheck` ✅ · `ng test` **80/80 passing, 14 spec files** ✅. Android `assembleDebug` last built before M7 (not rebuilt since).

---

## 2. Stack (pinned — do not upgrade without approval)

| Package | Version |
|---|---|
| Angular (standalone, **zoneless**, signals) | 21.2.25 (CLI / build 21.2.26) |
| Ionic Angular | 9.0.7 — `provideIonicAngular({ useSetInputAPI: true })` (required: modal `componentProps` are set via `setInput`, so signal inputs work) |
| Capacitor core / android / cli | 8.5.3 |
| @capacitor/camera · geolocation · network · app | 8.2.5 · 8.2.3 · 8.0.1 · 8.1.2 |
| Secure token storage | `@aparajita/capacitor-secure-storage` 8.0.1 (Keychain/Keystore on native; **memory-only on web**) |
| TypeScript · Vitest | 5.9.3 · 4.0.18 (via `@angular/build:unit-test`, jsdom) |
| Font | Poppins (OFL) in `src/assets/fonts/poppins` |

- **Why Angular 21:** Angular CLI 22 needs Node ≥ 22.22.3; the dev machine has Node 22.17.1. Don't change the global Node. Upgrade path later: `npx ng update @angular/core@22 @angular/cli@22`.
- **Android JDK:** Capacitor 8 needs JDK 21; `JAVA_HOME` points to JDK 17. For CLI builds use Android Studio's JBR for the session only: `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`.
- Component style budget: warn 4 kB / error 8 kB (`angular.json`).

---

## 3. Run, test, build

```powershell
cd C:\Development\seefixmanagement\seefix-mobile-reporter
npm install
npm start                 # ng serve; /api proxied to http://127.0.0.1:3000 via proxy.conf.json (no CORS change needed)
npm run test:ci           # 80 tests
npm run lint
npm run typecheck
npm run cap:sync:local    # dev build + Android sync WITH cleartext HTTP (local only)
npm run cap:open          # Android Studio
```

- The web session is **memory-only by design**: a page reload (including dev-server live reload) signs out.
- Emulator API: `http://10.0.2.2:3000` (`environment.ts` → `nativeApiBaseUrl`). Physical phone: set the PC's LAN IP there and run seefix-api with `API_HOST=0.0.0.0`.
- `npm run cap:sync` (without `:local`) syncs **without** cleartext/mixed content.
- `environment.prod.ts` has a placeholder host `https://REPLACE-WITH-APPROVED-API-HOST`.
- Owner added script `ionic_serve` (`ionic serve --host 127.0.0.1`).
- Preview launch configs live outside the repo: `C:\Development\seefixmanagement\.claude\launch.json` (`reporter-web` :8100, `reporter-web-verify` :8101).

### Accounts for testing (existing users only — never seed users or change configuration)
- **Local test Reporter:** `mobile.reporter.test@seefix.test` — password in the **git-ignored** `seefix-mobile-reporter/.env.test.local` (never print, log or commit it). Legacy-style (`emailVerified=false`, `emailVerificationRequired=false`). `@seefix.test` mailboxes cannot receive email.
- **Staff / other roles:** the existing seeded users from the Postman v4 collection (`SEEFIX_Full_API_Agent_Account_Cancellation_ActiveGuard_20261009_v4.postman_collection (1).json` in Downloads), e.g. `maintenance.staff@seefix.local`, with the collection variable `testPassword` (read it from the file; never print it).

---

## 4. Architecture

**Data flow:** Ionic page → feature store / API service → `ApiClient` → seefix-api → mapper → signals → Ionic template. The client only calls Node `seefix-api` (never FastAPI/Ollama, PostgreSQL, or Cloudinary secrets).

```
src/app/
  app.config.ts / app.routes.ts        providers, interceptors (auth, auth-error), route table
  core/
    auth/     session.store            INITIALIZING | AUTHENTICATED | UNAUTHENTICATED | OFFLINE_UNVERIFIED, notices, reset hooks
              auth.service             bootstrap, login, register, logout, handleSessionEnded, endSessionAfterSecurityChange
              auth.api.service         public /api/auth/*        account.api.service   /api/auth/me/**
              auth-flow.store          in-memory pending emails + resend cooldowns (never codes/passwords)
              secure-token-storage.service · auth.guard · guest.guard · reporter-role.guard
    http/     api-client.service       base URL, timeouts, error normalisation (get/post/patch/postForm)
              auth.interceptor         Bearer only to own API origin
              auth-error.interceptor   ends session only on session-ending 401s / 403 EMAIL_VERIFICATION_REQUIRED
              api-error.mapper         AppError {kind, userMessage, code, status, details} + owned copy for every known code
    forms/    account-validators       email, password (8 chars–72 UTF-8 bytes), 6-digit OTP, matching fields
    models/   auth, account, report (raw camelCase/PascalCase DTOs + view models + M7 types), screening, notification, reference
    config/   app-environment (APP_ENVIRONMENT token), icons (register EVERY Ionicon here)
    lifecycle/ app-resume.service      foreground + network signals, resumed$
  shared/
    components/ active-report-banner, detail-card, empty-state (fill=true centres), loading-state,
                notification-bell, notification-item, report-fab, report-list-item, report-status-chip, success-screen
    services/   confirm.service (standard ion-alert), success-screen.service (full-screen modal)
    formatters/ report-status-label (labels/icons/colours, isAssessmentInProgress), timeline-step (icon + inferred actor)
    utils/      cooldown-timer
  features/
    launch/ (session resolution)
    auth/     login, register, verify-email, forgot-password, reset-password
    account/  edit-profile, change-email, confirm-email, change-password
    tabs/     home, reports (My Reports), profile — exactly three tabs
    reports/  new-report (+ photo-picker.service, pending-changes.guard), report-detail (+ cancel-report-sheet),
              report.mapper, reports.api.service, reports.store (list + submit eligibility)
    notifications/ notifications page, store, api, notification-navigation
    reference/ buildings/locations store + api
  testing/   fixtures (RPT #3 rework→resolved, #4 NO_ACTION, pending) + helpers
```

### 4.1 Routes

| Route | Guards | Notes |
|---|---|---|
| `/` | — | Launch / session resolution; offline → Retry, keeps token |
| `/auth/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | `guestGuard` | Emails passed via `AuthFlowStore`, **never in URLs** |
| `/tabs/home`, `/tabs/reports`, `/tabs/profile` | `authGuard` + `reporterRoleGuard` | Exactly three tabs |
| `/reports/new` | auth + role, `pendingChangesGuard` | One-active-report gate inside the page (also for deep links) |
| `/reports/:id` | auth + role | Deep-link safe; Cancel action lives here |
| `/notifications` | auth + role | Opened from the header bell |
| `/account/edit-profile` (pendingChanges), `/change-email`, `/confirm-email`, `/change-password` | auth + role | Pushed pages, no extra tab |

### 4.2 Backend endpoints used (Reporter subset)

| Area | Endpoints |
|---|---|
| Auth (public) | `POST /api/auth/register · verify-email · resend-verification · login · forgot-password · reset-password` |
| Account (Bearer) | `GET/PATCH /api/auth/me`, `POST /api/auth/me/change-email`, `/me/change-email/confirm`, `/me/change-password` (`PATCH /me/username` exists but is **not used**) |
| Reference | `GET /api/reference/buildings`, `GET /api/reference/locations?buildingId=` |
| Reports | `POST /api/reports` (multipart `images`), `GET /api/reports/my?limit=`, `GET /api/reports/my/active`, `GET /api/reports/:id`, `GET /api/reports/:id/agent-status`, `POST /api/reports/:id/cancel` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` |

Login sends `{identifier: <email>, password}`. List DTOs are camelCase; detail `report` is PascalCase with camelCase additions (`screening`, `canCancel`).

---

## 5. Product-owner decisions (authoritative — override the guide where different)

1. **No username anywhere.** Email + password only; no username on Register/Profile; no Change Username page/route/API call. Institutional ID is not collected.
2. **Report shortcut = bottom-right `ion-fab` (+)** on Home and My Reports, implemented as shared `<app-report-fab slot="fixed">`. No large inline CTA.
3. **Visual style** follows `C:\Development\ocrdoctracker\mobile` (style reference only): primary-colour toolbars, filled white bell with round badge, outline fields placed directly on the page (2px border, 10px radius, bold 16px values, regular-weight placeholders), 56px `ion-button.regular`, Poppins, **light-only palette**.
4. **Settings forms:** `ConfirmService` alert before saving → full-screen `SuccessScreenService`. Password change / confirmed email change clear the session **first**, then show success, then root to Login.
5. **Notifications:** "Mark all as read" is a `checkmark-done-outline` header icon only when unread > 0; shared `NotificationItemComponent` keeps read/unread alignment; unread = dot + bold title.
6. **Report Detail:** fixed-aspect hero photo + `detail-card` sections; timeline is **newest first** with per-status icon badges and an **inferred-role** actor caption (You / SEEFIX AI / SEEFIX / Maintenance Team / Procurement / Maintenance crew / Supervisor). History only stores a user UUID — never claim a verified person. Same-timestamp events ordered Submitted → AI queued → AI processing → AI result (then reversed for display).
7. **Empty pages** use `EmptyStateComponent` with `fill=true` (vertically centred).
8. **Registration `503 EMAIL_DELIVERY_FAILED`:** account exists → open Verify Email with "resend in a minute", never re-register.
9. **`RESET_INVALID`** is shown with the same copy as a wrong code (no account-existence leak in UI).
10. **Blocked FAB (M7):** stays visible but looks disabled (grey) with an **animated rotating SVG** (arc ring + flipping hourglass, honours `prefers-reduced-motion`). Tapping it does not open the form; it shows "Report already in progress … Please wait for the result of your current report" with **View report** (or **Retry** if the eligibility check failed).
11. **Cancel UI (M7):** bottom sheet with a 5–500-char reason (acts as the irreversible-action confirmation) → full-screen success screen.
12. **New Report submit confirmation:** "Submit report?" `ConfirmService` dialog (shows photo count, one-active rule and cancel window) before any upload; Cancel keeps the draft; a second tap during the dialog is ignored.
13. Device testing skipped by owner; validate via the web build.

---

## 6. Feature behaviour reference

### 6.1 Authentication & session
- Startup state `INITIALIZING` → `/auth/me` with stored token → `AUTHENTICATED` (Reporter only) / `UNAUTHENTICATED` / `OFFLINE_UNVERIFIED` (network trouble keeps the token; launch screen offers Retry).
- Session ends **only** on `401 AUTH_REQUIRED | INVALID_TOKEN | SESSION_REVOKED | INACTIVE_ACCOUNT` or `403 EMAIL_VERIFICATION_REQUIRED` (`auth-error.interceptor.ts`). **`401 CURRENT_PASSWORD_INCORRECT` never signs out.** Ordinary 403 (e.g. ownership) never signs out.
- Login notices: SESSION_EXPIRED, SESSION_REVOKED, ROLE_DENIED, VERIFICATION_REQUIRED, EMAIL_VERIFIED, PASSWORD_RESET, PASSWORD_CHANGED, EMAIL_CHANGED.
- Logout clears secure token, user, report/notification/eligibility caches, auth-flow state, and roots to Login.

### 6.2 Reporting & one-active-report rule (M7)
- **Rule:** one active report per Reporter. Only `RESOLVED`, `CANCELLED`, `NO_ACTION`, `DUPLICATE` free the slot; `AgentStatus=FAILED` does not.
- **Shared state** `ReportsStore.eligibility`: `unknown | loading | allowed | blocked | error`, plus `activeReport`. **Fails closed** (only `allowed` lets the user start a report). Refreshed on Home/My Reports entry, pull-to-refresh, app resume, after submit and after cancel; one in-flight request is shared; last known state stays visible while re-checking; cleared on logout.
- **Home / My Reports:** gated FAB (§5.10) + `ActiveReportBanner` (blocked: report number, status chip, "View active report"; error: Retry).
- **New Report:** pre-flight gate before the form (deep links included) → blocked / error / checking states instead of the form. Once unlocked the form stays (draft kept). Submit = validate → offline check → **confirm dialog** → re-check `/my/active` → multipart POST. `201` → `markBlocked`, success toast, navigate to detail (replacing New Report). `409 ACTIVE_REPORT_EXISTS` → use `error.details.activeReport` (validated) or fall back to `/my/active` (the DB-unique-index race returns no details) → explain + "View report" (leaves without the discard prompt; draft stays in the stack). Uncertain upload (timeout/offline) → **never auto-retry**; check `/my/active` for a just-created report first.
- **Report Detail cancellation:** "Cancel report" button inside the Current status card **only** when the server says `canCancel=true` and status is SUBMITTED/PENDING_REVIEW. Bottom sheet → `POST /cancel` → success screen → reload detail, invalidate list, refresh eligibility and bell. `409` (`CANCELLATION_WINDOW_CLOSED` / `MAINTENANCE_ALREADY_STARTED`) or `404` → explain + reload, **never show Cancelled optimistically**. Transient errors stay inline on the sheet. Repeat cancel is idempotent (`alreadyCancelled`).
- **Cancelled reports:** no AI spinner and no agent-status polling even if the Agent still reads PROCESSING (`isAssessmentInProgress`); screening card hidden; status card shows cancelled time and the Reporter's own reason (from the CANCELLED history row); timeline shows "Cancelled — You".

### 6.3 Report Detail content
Hero (photo, number, status chip, submitted date, location, thumbnails) → Current status (+ cancel / cancellation info) → Maintenance review (human outcome, reason quote) → AI screening (preliminary; hidden when human-reviewed or cancelled) → Assessment (Facility Issue only; null priority = "Not assessed") → Your report → Work order (read-only) → Report progress timeline (+ "Show AI processing events" toggle). Agent-status polling every ~12 s only while visible, foregrounded and assessment in progress.

### 6.4 Account screens
Edit profile (full name, phone; changed fields only; unsaved-changes guard), Change email (current password → code to **new** address → Confirm new email; resend = repeat the change), Change password (signs out everywhere). Forgot/Reset password by email only, anti-enumeration copy.

---

## 7. Verification record (actual results)

**Automated:** 80/80 unit tests (auth/session, interceptors, error mapping, validators, auth-flow cooldowns, guards, report mapping/timeline, filters, notifications store, eligibility store, M7 cancellation mapping, cancel sheet).

**Live API (local stack) — account (22 checks):** login with identifier; profile PATCH + `FIELD_NOT_EDITABLE`; `CURRENT_PASSWORD_INCORRECT` keeps session; change-password → old JWT `SESSION_REVOKED`; `EMAIL_UNCHANGED`, `PASSWORD_UNCHANGED`, `EMAIL_IN_USE`, `USERNAME_IN_USE`, `INVALID_CODE_FORMAT`, `OTP_EXPIRED`, `RESET_INVALID`; forgot-password generic 200. SMTP `transporter.verify()` OK (no mail sent).

**Live API — M7 (22/22):** allowed → submit (Cloudinary 201) → blocked → second POST `409` with details → `canCancel` true → short reason `400` → cancel while Agent PROCESSING → idempotent repeat → slot released → agent-status `businessStatus=CANCELLED` → `REPORTER_CANCELLED` + reason in history → exactly one `REPORT_CANCELLED` notification → concurrent POSTs `201,409` → Agent completes → staff `NO_ACTION` → late cancel `409 CANCELLATION_WINDOW_CLOSED` → slot released → resubmit → staff `DUPLICATE` → slot released → existing reporter with only RESOLVED/NO_ACTION can submit.

**Web UI (live data):** sign-in, Profile, settings confirm + success screens, change password → Login, Back can't reopen protected pages, notifications page/empty state, report detail redesign, blocked FAB + rotating SVG + explanation alert, blocked banner, `/reports/new` deep-link gate, full Cancel flow (short reason rejected inline → success screen → Cancelled card + reason + timeline "You", no spinner/Cancel button), FAB re-enabled afterwards, New Report "Submit report?" dialog (Cancel → no POST, draft kept).

**NOT yet verified:**
1. Real-mailbox OTP flows (register → verify → sign in; change email → confirm; forgot → reset). Needs a readable mailbox.
2. Agent technical FAILED still blocking (server rule is status-based and unit-tested; not induced live to avoid config changes).
3. Real camera/gallery, geolocation, secure storage, hardware Back on Android emulator/physical device (owner deferred; web simulation only — on web, photos were injected for the submit-confirmation check).
4. Second-device `SESSION_REVOKED` in the UI.
5. Report Detail with the owner's real RPT-2026-000001..4 (visuals checked with sample data modelled on them).

### Test data created in the local DB (owner-approved)
Test Reporter `mobile.reporter.test@seefix.test`: RPT-2026-000005 (CANCELLED), RPT-2026-000006 (NO_ACTION by maintenance.staff), RPT-2026-000007 (DUPLICATE of 000006), RPT-2026-000008 (CANCELLED via UI). Photos uploaded to the configured Cloudinary folder. The account currently has **no active report** and a username `mobile.reporter.test` from an earlier test (unused by the app).

---

## 8. Backend findings (reported, not changed)

- **seefix-api work is uncommitted** (≈40 modified/untracked files incl. account and cancellation services). Account migration and cancellation/one-active migration are **applied** to `seefixdb` (`UX_Reports_OneActivePerReporter`, `CANCELLED` status, `GuardCancelledReportMutation`), but the `.sql` files are only in Downloads packages — recommend committing them to `seefix-api`/`seefix-db`.
- Registration / email-change start send mail **after** committing the user/challenge; SMTP failure returns `503` although the record exists (client handles it).
- `POST /reset-password` returns `RESET_INVALID` for unknown emails before checking the code (account-enumeration signal; client masks it).
- `v_ReportTimeline.ChangedBy` is a UUID without role (actor captions are inferred).
- The DB-race path of `409 ACTIVE_REPORT_EXISTS` carries no `details` (client falls back to `/my/active`).
- Cancelled reports use screening `source: "REPORTER"` (not in the guide). Cancel time/reason exist only on the status-history row (no `CancelledAt` column).
- Extra error codes mapped by the client: `VERIFICATION_INVALID`, `RESET_INVALID`, `ACCOUNT_NOT_FOUND`, `INACTIVE_ACCOUNT`, `EMAIL_SERVICE_UNAVAILABLE`, `EMAIL_DELIVERY_FAILED`, `USERNAME_IN_USE`, `CANCELLATION_AUDIT_FAILED`.

---

## 9. Rules for the next agent

- Continue the existing app; **never** re-scaffold, upgrade versions, commit, stage, reset or discard without explicit owner permission. Preserve uncommitted work.
- Do not change the backend; report gaps instead. Do not seed users or change configuration; use existing users/data for tests.
- Do not add screens/APIs the backend lacks (report edit/resubmit, Agent retry/cancel, token refresh, OS push, username UI) or a fourth tab.
- Never put emails, codes, passwords or tokens in URLs, logs or persistent storage.
- Keep `401 CURRENT_PASSWORD_INCORRECT` non-session-ending; keep fail-closed eligibility; never show optimistic Cancelled; never auto-retry an uncertain upload.
- AI screening is always preliminary; business status and human review take precedence.
- Register every new Ionicon in `core/config/icons.ts`. Use ≥90% standard Ionic components; reuse `ConfirmService`, `SuccessScreenService`, `detail-card`, `EmptyStateComponent`.
- PowerShell 5 `Get-Content`/`Set-Content` without explicit UTF-8 corrupts non-ASCII (—, ✓, …); use UTF-8-aware reads/writes.
- Before claiming results, re-run `npm run test:ci`, `npm run lint`, `npm run typecheck`, `npx ng build`.

---

## 10. Open items / next steps

1. Run the §7 "not yet verified" checks (readable mailbox OTP flows; device/emulator if the owner re-enables device testing).
2. Owner to supply: app ID (currently `com.seefix.reporter`), display name, icon, brand colours, production HTTPS API host, support contact.
3. Decide on backend follow-ups in §8 (commit backend + migrations; SMTP-after-commit 503; reset enumeration; actor role in timeline).
4. Rebuild the Android debug APK after M7 when device work resumes.
5. Optional: Angular 22 after a Node upgrade.

---

## 11. Change log (this session)

| Change | Where |
|---|---|
| v1 reporting app (M0–M6), Android platform | whole app |
| ocrdoctracker-style UI, FAB, filled bell, report-detail image fix | global.scss, auth pages, tabs, report-detail |
| v2 account features (verify email, forgot/reset, edit profile, change email/password), session/interceptor hardening | core/auth, core/http, features/auth, features/account |
| Username removed everywhere | auth pages, profile, models, validators |
| Centered empty states, detail-card redesign, aligned notification rows, settings confirm + success screens, icon mark-all | shared/components, shared/services, notifications, account |
| Timeline icons + inferred actor, same-timestamp ordering, newest-first | shared/formatters/timeline-step, report.mapper, report-detail |
| M7 one-active gate (store, FAB, banner, New Report gate/409/uncertain), cancellation (sheet, detail, polling stop) | features/reports, shared/components/report-fab, active-report-banner |
| New Report submit confirmation dialog | features/reports/new-report |
