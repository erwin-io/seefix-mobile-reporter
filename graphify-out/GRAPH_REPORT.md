# Graph Report - seefix-mobile-reporter  (2026-10-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 758 nodes · 1764 edges · 56 communities (32 shown, 24 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4942f2f8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- auth.service.ts
- @angular/core
- report-detail.page.ts
- auth.api.service.ts
- NewReportPage
- app-environment.ts
- app
- package.json
- dependencies
- confirm-email.page.ts
- report.model.ts
- mapHttpError
- api-client.service.ts
- AppError
- reports.api.service.ts
- ReportDetailPage
- new-report.page.ts
- normalizeOtp
- devDependencies
- scripts
- account-validators.ts
- ExampleInstrumentedTest.java
- app.component.ts
- options
- api-error.mapper.ts
- ReportsStore
- ApiClient
- MyReportsPage
- reset-password.page.ts
- NotificationsPage
- HomePage
- architect
- serve
- ci
- development
- LaunchPage
- ProfilePage
- production
- options
- eslint.config.js
- RegisterPage
- build
- ChangePasswordPage
- MainActivity.java
- capacitor.config.ts
- cap-sync-local.mjs
- engines
- environment.prod.ts

## God Nodes (most connected - your core abstractions)
1. `@angular/core` - 65 edges
2. `mapHttpError()` - 42 edges
3. `@ionic/angular` - 37 edges
4. `SessionStore` - 35 edges
5. `NewReportPage` - 28 edges
6. `rxjs` - 26 edges
7. `AuthService` - 25 edges
8. `AppError` - 17 edges
9. `ReportDetailPage` - 17 edges
10. `ReportsStore` - 17 edges

## Surprising Connections (you probably didn't know these)
- `UserMessageResponse` --references--> `AuthUser`  [EXTRACTED]
  src/app/core/models/account.model.ts → src/app/core/models/auth.model.ts
- `ReportRecordDto` --references--> `Screening`  [EXTRACTED]
  src/app/core/models/report.model.ts → src/app/core/models/screening.model.ts
- `AgentStatusResponse` --references--> `Screening`  [EXTRACTED]
  src/app/core/models/report.model.ts → src/app/core/models/screening.model.ts
- `ReportDetail` --references--> `Screening`  [EXTRACTED]
  src/app/core/models/report.model.ts → src/app/core/models/screening.model.ts
- `roleDenied()` --calls--> `AppError`  [EXTRACTED]
  src/app/core/auth/auth.service.ts → src/app/core/http/api-error.mapper.ts

## Import Cycles
- None detected.

## Communities (56 total, 24 thin omitted)

### Community 0 - "auth.service.ts"
Cohesion: 0.07
Nodes (34): @angular/common, @angular/router, vitest, reporterOnly, routes, OTP_COOLDOWN_MS, authGuard(), safeReturnUrl() (+26 more)

### Community 1 - "@angular/core"
Cohesion: 0.06
Nodes (22): @angular/core, @ionic/angular, NotificationDto, NotificationListResponse, NotificationReadAllResponse, NotificationReadResponse, NotificationNavigator, NotificationsApiService (+14 more)

### Community 2 - "report-detail.page.ts"
Cohesion: 0.08
Nodes (38): ReportDetailResponse, TimelineEvent, cancelledScreening, PRE_REVIEW_STATUSES, sameTimeRank(), toCancellation(), toReportDetail(), toReportSummary() (+30 more)

### Community 3 - "auth.api.service.ts"
Cohesion: 0.08
Nodes (25): AccountApiService, publicContext(), SKIP_AUTH, SKIP_UNAUTHORIZED_HANDLER, ChangeEmailRequest, ChangeEmailResponse, ChangePasswordRequest, ConfirmEmailChangeRequest (+17 more)

### Community 4 - "NewReportPage"
Cohesion: 0.13
Nodes (3): NewReportPage, round6(), toActiveReport()

### Community 5 - "app-environment.ts"
Cohesion: 0.11
Nodes (15): @capacitor/camera, @capacitor/core, APP_ENVIRONMENT, AppEnvironment, resolveApiBaseUrl(), ACCEPTED_IMAGE_TYPES, encodeJpeg(), GalleryOutcome (+7 more)

### Community 6 - "app"
Cohesion: 0.09
Nodes (23): setParserOptionsProject, setParserOptionsProject, prefix, projectType, root, schematics, sourceRoot, cli (+15 more)

### Community 7 - "package.json"
Cohesion: 0.08
Nodes (23): author, description, name, private, version, @angular/build, @angular/cli, @angular/compiler (+15 more)

### Community 8 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, @aparajita/capacitor-secure-storage (+13 more)

### Community 9 - "confirm-email.page.ts"
Cohesion: 0.21
Nodes (7): @angular/forms, AuthFlowStore, otpValidator(), OtpPurpose, SuccessScreenOptions, SuccessScreenService, createCooldownTimer()

### Community 10 - "report.model.ts"
Cohesion: 0.12
Nodes (17): AgentStatus, HumanReview, MaintenanceReviewDto, ReportAssessment, ReportImageDto, ReportRecordDto, ReportStatus, ReportSummary (+9 more)

### Community 11 - "mapHttpError"
Cohesion: 0.14
Nodes (6): normalizeEmail(), mapHttpError(), ChangeEmailPage, ForgotPasswordPage, LoginPage, ResetPasswordPage

### Community 12 - "api-client.service.ts"
Cohesion: 0.20
Nodes (6): ApiRequestOptions, BuildingDto, FacilityLocationDto, ItemsResponse, ReferenceApiService, ReferenceStore

### Community 13 - "AppError"
Cohesion: 0.14
Nodes (6): AppError, CANCEL_REASON_MAX, CANCEL_REASON_MIN, CancelReportSheetComponent, CancelSheetRole, isCancelSheetError()

### Community 14 - "reports.api.service.ts"
Cohesion: 0.17
Nodes (9): ActiveReportResponse, AgentStatusResponse, CancelReportResponse, CreateReportResponse, ReportDetail, ReportListResponse, appendIfPresent(), NewReportPayload (+1 more)

### Community 16 - "new-report.page.ts"
Cohesion: 0.20
Nodes (8): rxjs, AppResumeService, ActiveReportDto, GpsFix, OTHER_LOCATION, REPORT_LIST_MAX, DEFAULT_REPORT_LIMIT, SubmitEligibility

### Community 17 - "normalizeOtp"
Cohesion: 0.15
Nodes (3): normalizeOtp(), ConfirmEmailPage, VerifyEmailPage

### Community 18 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, angular-eslint, @angular/language-service, @capacitor/cli, eslint (+5 more)

### Community 19 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, cap:open, cap:sync, cap:sync:local, ionic_serve, lint, ng (+5 more)

### Community 20 - "account-validators.ts"
Cohesion: 0.28
Nodes (8): EMAIL_PATTERN, matchingFields(), OTP_PATTERN, PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARS, passwordErrorText(), passwordValidator(), utf8ByteLength()

### Community 22 - "app.component.ts"
Cohesion: 0.23
Nodes (5): @angular/platform-browser, ionicons, AppComponent, appConfig, registerAppIcons()

### Community 23 - "options"
Cohesion: 0.18
Nodes (11): options, assets, browser, index, inlineStyleLanguage, outputPath, polyfills, scripts (+3 more)

### Community 24 - "api-error.mapper.ts"
Cohesion: 0.24
Nodes (6): ApiErrorBody, AppErrorKind, CODE_COPY, ERROR_COPY, LOGIN_NOTICES, NoticeCopy

### Community 28 - "reset-password.page.ts"
Cohesion: 0.39
Nodes (4): AuthApiService, emailValidator(), authRoutes, RESET_REQUESTED_COPY

### Community 31 - "architect"
Cohesion: 0.29
Nodes (7): architect, extract-i18n, lint, builder, builder, options, lintFilePatterns

### Community 32 - "serve"
Cohesion: 0.33
Nodes (6): serve, proxyConfig, builder, configurations, defaultConfiguration, options

### Community 33 - "ci"
Cohesion: 0.33
Nodes (6): test, progress, watch, ci, builder, configurations

### Community 34 - "development"
Cohesion: 0.33
Nodes (6): development, buildTarget, extractLicenses, namedChunks, optimization, sourceMap

### Community 37 - "production"
Cohesion: 0.40
Nodes (5): production, budgets, buildTarget, fileReplacements, outputHashing

### Community 38 - "options"
Cohesion: 0.40
Nodes (5): options, buildTarget, setupFiles, tsConfig, options

### Community 39 - "eslint.config.js"
Cohesion: 0.40
Nodes (4): angular, tseslint, angular-eslint, typescript-eslint

### Community 42 - "build"
Cohesion: 0.50
Nodes (4): build, builder, configurations, defaultConfiguration

## Knowledge Gaps
- **14 isolated node(s):** `@angular/build`, `@angular/cli`, `@angular/compiler`, `@angular/compiler-cli`, `@angular/language-service` (+9 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 287 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@angular/core` connect `@angular/core` to `auth.service.ts`, `report-detail.page.ts`, `auth.api.service.ts`, `app-environment.ts`, `package.json`, `confirm-email.page.ts`, `api-client.service.ts`, `AppError`, `reports.api.service.ts`, `new-report.page.ts`, `account-validators.ts`, `app.component.ts`, `api-error.mapper.ts`, `reset-password.page.ts`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **What connects `@angular/build`, `@angular/cli`, `@angular/compiler` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `auth.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07059607059607059 - nodes in this community are weakly interconnected._
- **Why does `mapHttpError()` connect `mapHttpError` to `auth.service.ts`, `@angular/core`, `report-detail.page.ts`, `auth.api.service.ts`, `NewReportPage`, `confirm-email.page.ts`, `api-client.service.ts`, `AppError`, `ReportDetailPage`, `new-report.page.ts`, `normalizeOtp`, `account-validators.ts`, `api-error.mapper.ts`, `ReportsStore`, `ApiClient`, `reset-password.page.ts`, `NotificationsPage`, `RegisterPage`, `ChangePasswordPage`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Should `@angular/core` be split into smaller, more focused modules?**
  _Cohesion score 0.06430745814307458 - nodes in this community are weakly interconnected._
- **Why does `@ionic/angular` connect `@angular/core` to `auth.service.ts`, `report-detail.page.ts`, `auth.api.service.ts`, `package.json`, `confirm-email.page.ts`, `AppError`, `new-report.page.ts`, `account-validators.ts`, `app.component.ts`, `api-error.mapper.ts`, `reset-password.page.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `report-detail.page.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07982583454281568 - nodes in this community are weakly interconnected._