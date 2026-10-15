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

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Git | any | cloning |
| Node.js | 22.12 or newer (tested on 22.17.1), npm 10+ | everything (`node -v`) |
| `seefix-api` | running on `http://localhost:3000`, **or** use production | browser development ([setup](https://github.com/seefixmanagement/seefix-api#setup-step-by-step)) |
| Reporter account | — | sign in: register in the app, or use the seeded `reporter@seefix.local` |
| Android Studio | current stable, with Android SDK 36 | Android builds (minSdk 24 = Android 7.0) |
| JDK 21 | bundled with Android Studio (JBR) | Android builds |

The Ionic and Capacitor CLIs don't need a global install; the `npm` scripts and `npx` use the project's copies.

## Getting started (browser)

1. **Clone and install**
   ```powershell
   git clone https://github.com/seefixmanagement/seefix-mobile-reporter.git
   cd seefix-mobile-reporter
   npm ci
   ```
2. **Allow the browser origin in the API**: in `seefix-api`'s `.env`, add `http://localhost:4200` to `CORS_ORIGINS`,
   then restart the API.
3. **Start**
   ```powershell
   npm start            # http://localhost:4200, calls the API at http://localhost:3000
   ```
   Open `http://localhost:4200`. Use the browser's device toolbar (F12 → phone icon) for a phone-sized view.
4. **Checks**
   ```powershell
   npm run test:ci      # unit tests (run once)
   npm run lint
   npm run typecheck
   ```

The app calls `apiBaseUrl` from `src/environments/` directly (no proxy):

| Build | File | `apiBaseUrl` |
|---|---|---|
| `npm start` (development) | `environment.ts` | `http://localhost:3000` (local seefix-api) |
| `npm run build`, Android | `environment.prod.ts` | `https://seefix-api.vercel.app` |

Because the app and the API are on different origins, the API must allow the app's origin in `CORS_ORIGINS`:
`http://localhost:4200` for the local API, and `https://localhost` (the Android app's origin) for production.
On the web the JWT is kept in memory only, so reloading the page signs you out (this is intentional).

### Android (step by step)

1. **App icon and splash** (only when the logo changes): put the source images in `resources/`
   (`icon.png` / `icon-only.png` 1024×1024, `icon-foreground.png` + `icon-background.png` for the adaptive icon,
   `splash.png` / `splash-dark.png` 2732×2732), then generate every Android size:
   ```powershell
   npx @capacitor/assets generate --android --iconBackgroundColor "#0057E7" --splashBackgroundColor "#FFFFFF"
   ```
2. **Build the web app and copy it into the Android project** (uses `environment.prod.ts`, the production API):
   ```powershell
   npm run cap:sync
   ```
3. **Open Android Studio**
   ```powershell
   npm run cap:open
   ```
   Wait for the Gradle sync to finish.
4. **Run or build**
   - On a phone (USB debugging on) or an emulator: pick the device and press **Run ▶**.
   - Installable APK: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**. The file is
     `android/app/build/outputs/apk/debug/app-debug.apk`.
   - Store release: **Build → Generate Signed App Bundle / APK** with your keystore (keep the keystore and its
     passwords out of git).

Repeat steps 2–4 after every code change. Notes:

- **JDK 21 is required** (Capacitor 8). Android Studio uses its bundled JBR. For command-line builds, run
  `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; cd android; .\gradlew.bat assembleDebug` in PowerShell.
- The Android app (emulator or phone) talks to the production API over HTTPS; no LAN or cleartext setup is needed.
- iOS builds need macOS/Xcode (`npx cap add ios` there).

## Structure

```
src/app/
  core/       auth (session store, auth/account API services, auth-flow store, secure token storage, guards),
              http (ApiClient, auth + auth-error interceptors, error mapper), forms (account validators),
              config (environment token, icons), lifecycle (foreground/network), models (raw DTOs + view models),
              storage (IndexedDB local-db), connectivity (online/offline state + interceptor)
  shared/     components (notification bell, status chip, report list item, empty/loading states),
              formatters, utils (resend-code cooldown timer)
  features/   launch, auth (login, register, verify-email, forgot-password, reset-password),
              account (edit-profile, change-email, confirm-email, change-password),
              tabs (home/reports/profile), reports (new, detail, local-report, outbox, mapper, store),
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
  `/reports/local/:id` (a report saved on the device), `/reports/:id`, `/notifications` (opened from the header bell).
- `/` is a short-lived launch screen. It checks the stored session before showing private data. If the token can't be
  verified because the device is offline, it shows **Retry** and keeps the token.

## Offline reporting

A report submitted without a connection is saved on the device (IndexedDB outbox, `features/reports/outbox`) and sent
automatically when the app is open and online. Home shows it as **Saved on this device**, and `/reports/local/:id`
offers **Send now**, **Edit report** and **Discard report**.

- Each saved report carries a `clientReportId`. seefix-api creates at most one report per id, so a retry after a lost
  response never creates a duplicate. This needs the API migration `db/migrations/2026-10-14-report-client-id.sql`.
- Saved reports belong to the signed-in account. Signing out with an unsent report asks first ("Delete unsent reports?").
- The one-active-report rule still applies: while the server can't be checked, the app allows saving, and the server
  makes the final decision when the report is sent.

## Backend constraints respected

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
- Every submission goes through the outbox. If an upload times out with no response, the app retries with the same
  `clientReportId`, so the API returns the existing report instead of creating a second one.
- AI screening is always labelled as preliminary. The business `Status` and the human Maintenance Review decide what the
  app shows.

## Open items for the product owner

- App ID (`com.seefix.reporter`) and display name: confirm before store distribution.
- Release signing keystore and Play Store listing.
- Support contact destination ("contact support" copy only; no email or URL has been invented).
