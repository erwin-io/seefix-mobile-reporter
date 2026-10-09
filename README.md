# SEEFIX Reporter (mobile)

Reporter-only mobile app for SEEFIX: submit facility issues with photos, follow their progress, and read updates.
Built with **Ionic Angular (standalone) + Capacitor**. It talks **only** to `seefix-api` (Node). It never calls the
Agent, Ollama, PostgreSQL or Cloudinary directly.

Implementation contract: `SEEFIX-MOBILE-REPORTER-DESIGN-001` (Reporter Mobile App Implementation Guide, 2026-10-09).

## Stack (pinned)

| Layer | Version |
|---|---|
| Angular (standalone, zoneless, signals) | 21.2.25 |
| Ionic Angular | 9.0.x |
| Capacitor (core / android) | 8.5.3 |
| `@capacitor/camera` / `geolocation` / `network` / `app` | 8.2.5 / 8.2.3 / 8.0.1 / 8.1.2 |
| Secure token storage (Keychain / Keystore) | `@aparajita/capacitor-secure-storage` 8.0.1 |
| Unit tests | Vitest 4 via `@angular/build:unit-test` |

> Angular 22 needs Node ≥ 22.22.3. Angular 21 is pinned so the project builds on Node 22.17. After upgrading Node you can
> run `npx ng update @angular/core@22 @angular/cli@22`.

## Getting started

```bash
npm install
npm start            # http://localhost:4200 (or --port 8100); /api is proxied to http://127.0.0.1:3000
npm run test:ci      # unit tests (run once)
npm run lint
npm run typecheck
```

In the browser, `/api` goes through `proxy.conf.json`, so `seefix-api` needs no CORS change. On the web the JWT is kept
in memory only, so reloading the page signs you out (this is intentional).

### Android

```bash
npm run cap:sync:local   # dev build + sync with cleartext HTTP allowed (local testing only)
npm run cap:open         # opens Android Studio
```

- **JDK 21 is required** (Capacitor 8). Android Studio uses its bundled JBR. For command-line builds, run
  `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; cd android; .\gradlew.bat assembleDebug` in PowerShell.
- **Emulator:** `nativeApiBaseUrl` in `src/environments/environment.ts` defaults to `http://10.0.2.2:3000` (the host PC).
- **Physical phone:** set `nativeApiBaseUrl` to your PC's LAN IP (e.g. `http://192.168.1.20:3000`). Then start
  seefix-api with `API_HOST=0.0.0.0` and allow port 3000 through the Windows firewall on the private network only.
- `npm run cap:sync` (no `:local`) syncs **without** cleartext/mixed content. Use it for anything that is not local testing.
- iOS builds need macOS/Xcode (`npx cap add ios` there).

## Structure

```
src/app/
  core/       auth (session store, auth/account API services, auth-flow store, secure token storage, guards),
              http (ApiClient, auth + auth-error interceptors, error mapper), forms (account validators),
              config (environment token, icons), lifecycle (foreground/network), models (raw DTOs + view models)
  shared/     components (notification bell, status chip, report list item, empty/loading states),
              formatters, utils (resend-code cooldown timer)
  features/   launch, auth (login, register, verify-email, forgot-password, reset-password),
              account (edit-profile, change-email, confirm-email, change-password),
              tabs (home/reports/profile), reports (new, detail, mapper, store),
              notifications (inbox, store, navigation), reference (buildings/locations)
  testing/    sanitized fixtures (#3 rework→resolved, #4 NO_ACTION, pending) and helpers
```

Data flow: **Page → Store/Service → ApiClient → seefix-api → mapper → signals → Ionic template**.

## Navigation

- Public (`guestGuard`): `/auth/login`, `/auth/register`, `/auth/verify-email`, `/auth/forgot-password`,
  `/auth/reset-password`. Emails travel between these screens in memory (`AuthFlowStore`), never in the URL.
- Account pages (protected, pushed from Profile): `/account/edit-profile`, `/account/change-email`,
  `/account/confirm-email`, `/account/change-password`.
- Exactly three tabs: `/tabs/home`, `/tabs/reports`, `/tabs/profile`.
- Global pushed pages (outside the tabs, so there is no second tab bar): `/reports/new` (with an unsent-changes guard),
  `/reports/:id`, `/notifications` (opened from the header bell).
- `/` is a short-lived launch screen. It checks the stored session before showing private data. If the token can't be
  verified because the device is offline, it shows **Retry** and keeps the token.

## Backend constraints respected (no API changes)

- Reporters can't edit or resubmit reports or retry the Agent. None of these controls are shown.

### Accounts (seefix-api account enhancement)

- Reporters sign in with email and password; the app sends the email in the API's `identifier` field. SEEFIX
  Reporter has no username: no username field, label or page appears anywhere in the app.
- Registration returns **no token**. The user verifies the six-digit email code, then signs in.
- If the code email fails to send (`503 EMAIL_DELIVERY_FAILED`), the account already exists. The app opens
  Verify Email with a "resend in a minute" hint instead of registering again.
- Password reset is by email only. Reset and resend messages are generic, and `RESET_INVALID` is shown like a wrong code,
  so the app never reveals whether an account exists.
- Email change sends the code to the **new** address. The old email stays active until it is confirmed. To get a new code,
  start the change again, because it needs the current password.
- A password change or a confirmed email change revokes every JWT. The app clears the session first, then shows Login.
  Profile edits keep the session.
- `401 SESSION_REVOKED` from any request (e.g. a password change on another device) signs out once with a security
  message. `401 CURRENT_PASSWORD_INCORRECT` never signs out.
- Legacy Reporters with `emailVerified=false` and `emailVerificationRequired=false` can sign in. Profile shows them as
  "Not verified" and suggests verifying a real email through Change email.
- Codes and passwords are never stored, logged or put in URLs. Resend countdowns are UX hints only; the server enforces
  its own limits.
- The app has no push notifications. Notifications are an in-app inbox, refreshed when a screen opens, when the app
  returns to the foreground, and on pull-to-refresh.
- `/reports/my` has no pagination. The list loads 30 reports, with an explicit "show up to 100" option.
- Tokens are not refreshed. When a token expires or is revoked, the app clears the session once and returns to Login.
- If an upload times out with no response, the app does **not** retry automatically, because the report may already
  exist. It asks the user to check My Reports first.
- AI screening is always labelled as preliminary. The business `Status` and the human Maintenance Review decide what the
  app shows.

## Open items for the product owner

- App ID (`com.seefix.reporter`), display name, icon and brand colors.
- Production HTTPS API host (`environment.prod.ts` contains a placeholder).
- Support contact destination ("contact support" copy only; no email or URL has been invented).
