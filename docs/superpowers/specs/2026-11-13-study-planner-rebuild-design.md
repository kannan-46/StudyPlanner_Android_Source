# Study Planner rebuild: design


## 1. Context and why

The repo `d:\StudyPlanner_Android_Source` holds two half-overlapping apps:
- `SurgicalStudyPlannerAndroid/`: the old Kotlin WebView wrapper around a minified `index.html`.
- `SurgicalStudyPlannerReactNative/{mobile,server}`: a bare React Native 0.88.1 app plus an Express 5 / MongoDB API, deployed on Vercel at `https://studyplannerandroidsource-server.vercel.app/` (base path `/api/server`).

The apps share copied Kotlin and have no clear structure. Users hit three problems:

- **Topics are hard to add.**
  - Any background-refresh error swaps the whole UI for "Can't reach your planner" (`mobile/App.tsx:287`). That unmounts the Add Topic modal and loses the draft.
  - Saves wait for every native alarm to be rescheduled.
  - The JWT expires after 1 hour, with no refresh.
  - Every change PUTs the whole planner document, which causes 409 conflicts.
- **Revising is broken.**
  - Revisions can be marked done only from Home, and only the first 6 due.
  - There is no undo.
  - Snooze adds a day to the *old* due date, so an overdue revision stays overdue (`App.tsx:249`).
  - Revision dates are fixed from the study date, so a late revision makes the next one overdue at once.
  - Revisions are identified by array index.
- **Alarms are unreliable** (14 causes found). The main ones:
  - Alarms are re-synced only after a successful server fetch.
  - Every sync re-fires all overdue revisions at now + 45 s (`nativeAlarms.ts:35`).
  - The exact-alarm permission is never requested proactively.
  - A denied notification permission fails silently.
  - Nothing reacts to timezone or clock changes.
  - Alarms that came due while the phone was off are dropped after reboot.
  - `hashCode()` request-code collisions.
  - Unsynchronised SharedPreferences writes.
  - The daily count is wrong, and the daily summary duplicates the revision alarms.

**Intended outcome:** one clean monorepo laid out like Classory (`D:\incrix-classory-monorepo`, analysed read-only and left unchanged). It becomes a **public, free Android app**: anyone signs in with Google, gets a guided setup, adds topics, revises them on a schedule that moves with them, and gets reminders that reliably arrive.

## 2. Goals, non-goals, anti-goals

**Goals**
- Public multi-user app with Google sign-in, with every user's data isolated in MongoDB.
- A first-run setup that leaves the user ready to revise, with working reminders.
- Topics and revisions can be added and acted on from every relevant screen, with undo.
- A daily reminder that arrives on time, works offline once scheduled, and survives reboots and timezone changes.
- Keep all existing features: topics, revisions, snooze, mock test tracker, Pomodoro timer, progress stats, dark mode, JSON backup export/import.
- Clean, tested code laid out like Classory.

**Non-goals**
- iOS. The `ios/` folder is removed.
- Offline editing. The app is online-only by user decision.
- Real-time multi-device push (Socket.IO is removed).
- Anki-style difficulty ratings.
- Web app.

**Anti-goals** (failure even if it "works")
- Anything that costs money: Vercel Hobby, Atlas M0, Google OAuth free tier, no paid libraries or services.
- A network error that throws away what the user typed.
- Duplicate or spammy notifications.
- A user ever seeing another user's data.

## 3. Constraints
- **$0 total.**
  - Vercel Hobby (non-commercial use only).
  - MongoDB Atlas M0 (512 MB, about 500 connections, pauses after 30 days idle).
  - No push service: reminders are local AlarmManager notifications.
  - Distribution is a free APK first; the Play Store's one-time $25 fee is the user's later choice.
  - The Google sign-in library must be free. Use `@react-native-google-signin/google-signin`'s free "original" API, or a thin Kotlin module on AndroidX Credential Manager. Do not use the paid "Universal" tier.
- **Online only:** every write goes to the API, and nothing is stored offline except the native reminder snapshot.
- **Platform versions:**
  - Android minSdk 24 and targetSdk 36 (as now). applicationId stays `com.surgicalstudyplanner.app`.
  - Node ≥ 22.13. React Native 0.88.1 (keep), New Architecture on.
- **Vercel deployment:**
  - The project URL stays the same. The user must change the Vercel project's **Root Directory** to `apps/api`.
  - Env vars live in Vercel only: `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_WEB_CLIENT_ID`.
- **Classory is reference only.** Never modify `D:\incrix-classory-monorepo`.

## 4. Approaches considered (decided)
| Decision | Options | Picked | Why |
|---|---|---|---|
| Audience | one owner / small group / public | **Public, Google sign-in** | user |
| Connectivity | offline-first / online + cache / online only | **Online only** | user. Mitigations in §8 |
| Revision schedule | fixed dates / move forward / difficulty rating | **Move forward** | user. No pile-ups |
| Backend | Express in Classory module layout / NestJS | **Express** | user + me. Light cold starts on free Vercel |
| Mobile | bare RN + rewritten Kotlin alarms / Expo + expo-notifications | **Bare RN** | me, user agreed. Full control of alarm reliability |
| Real-time | keep Socket.IO / drop | **Drop** (my call) | Unreliable on serverless. Refetch on focus/foreground instead |

## 5. Repository layout (Classory pattern, scaled down)
```
StudyPlanner_Android_Source/
├─ package.json            npm workspaces: apps/*, packages/*; root scripts dev/test/lint/typecheck
├─ tsconfig.base.json      strict; paths @planner/shared → packages/shared/src
├─ .prettierrc / eslint    copied from Classory (single quotes, trailing commas, width 80, arrowParens avoid, LF)
├─ CLAUDE.md               conventions, commit workflow, deploy notes
├─ apps/
│  ├─ api/                 Express → Vercel
│  └─ mobile/              React Native (Android)
├─ packages/
│  └─ shared/              zod schemas, inferred types, error codes, pure schedule domain
└─ docs/superpowers/{specs,plans}
```
- **Removed:** `SurgicalStudyPlannerAndroid/`, `reports/`, `research_notes/`, the `SurgicalStudyPlannerReactNative/` wrapper folder (its contents move), `mobile/ios/`, the committed `.kotlin/errors/*.log`, and Socket.IO.
- Old specs and plans move into `docs/superpowers/` so their history is kept.
- **Kept:** `mobile/android/app/debug.keystore`, because Google OAuth's debug Android client is registered against its SHA-1.
- **Skipped from Classory:** turbo, custom tools scripts, building libs to `dist`, tenancy, roles, guards, and cookie sessions.
- `packages/shared` is consumed **from source**. Metro uses `watchFolders`; the API is bundled by Vercel's builder or `tsx`.

## 6. Backend: `apps/api`
```
apps/api/
├─ api/index.ts            Vercel entry: export default createApp()
├─ vercel.json             keep /api/server/(.*) → strip prefix (same public base URL); framework null
└─ src/
   ├─ load-env.ts          imported first (Classory pattern)
   ├─ config/env.ts        zod-parsed env; fails fast with a clear message
   ├─ app.ts               createApp(): helmet, json(1mb), requestId, routes, 404, error middleware
   ├─ server.ts            local dev: app.listen
   ├─ core/
   │  ├─ db/mongo.ts       one cached MongoClient (reuse createMemoizedInitializer from current server/src/db.ts),
   │  │                    maxPoolSize 5, ensureIndexes() once per cold start
   │  ├─ errors/           AppError({code,status,message,details}); codes from @planner/shared
   │  ├─ middleware/       requireAuth (Bearer access JWT → req.userId), validate(zodSchema), error → {error:{code,message,details},requestId}
   │  └─ http/             asyncHandler, rate limiters (trust proxy = 1 on Vercel)
   └─ modules/<feature>/
      ├─ <feature>.routes.ts      wiring only
      ├─ <feature>.controller.ts  parse req → call service → shape response
      ├─ <feature>.service.ts     business rules (calls shared domain)
      ├─ <feature>.repository.ts  Mongo queries, ALWAYS filtered by userId
      └─ __tests__/
```
**Modules:** health, auth, me, exams, subjects, topics (including revision actions), agenda, mockTests, stats, backup.

**Reused from the current server:**
- `createMemoizedInitializer` (`server/src/db.ts`).
- scrypt is no longer needed.
- jose JWT signing (`server/src/tokens.ts`), adapted.
- The helmet and rate-limit setup in `server/src/api.ts`.
- `scripts/verify-vercel.mjs`, adapted to the new endpoints.

**Auth flow**
1. The app uses native Google sign-in and gets an ID token. The token's audience is the Web client ID.
2. `POST /v1/auth/google {idToken}`. The server verifies the token with `google-auth-library` (free) and upserts the user by `googleSub`.
3. The server returns `{accessToken (15 min JWT), refreshToken (opaque, 60 days), user}`.
4. `POST /v1/auth/refresh` rotates the refresh token. The server stores only its SHA-256 hash. If a revoked token is reused, all of that user's sessions are revoked.
5. `POST /v1/auth/logout` revokes the refresh token.
6. On the device, tokens live in `react-native-keychain` (already a dependency).

**Endpoints** (all under `/v1`, all except auth and health need auth)
- `GET /health`: DB ping with a 3 s timeout, plus `VERCEL_GIT_COMMIT_SHA`.
- `GET /privacy`, `GET /`: static HTML pages for Google OAuth publishing (§14a).
- `GET /me`, `PATCH /me` (profile, settings, `onboardingCompletedAt`), `DELETE /me` (deletes the account and all data; required by Play policy).
- `GET/POST/PATCH/DELETE /exams`.
- `GET/POST/PATCH/DELETE /subjects`. Deleting a subject that topics still use returns `SUBJECT_IN_USE`.
- `GET /topics?examId&subjectId&q&status`, `POST /topics`, `GET/PATCH/DELETE /topics/:id`.
- Revision actions:
  - `POST /topics/:id/revisions/:revId/complete {doneOn}`
  - `POST …/undo`
  - `POST …/snooze {days=1}`
- `GET /agenda?today=YYYY-MM-DD&days=N` returns overdue, today and upcoming next-due revisions. It feeds Home, Schedule and the reminder snapshot.
- `GET/POST/PATCH/DELETE /mock-tests`.
- `GET /stats`.
- `GET /backup` (export), `POST /backup/import {mode: 'merge'|'replace', data}`. Import accepts the new format, the current RN backup, and the old WebView backup (its `tests` maps to `mockTests`; exam strings become exam docs; subject strings become subject docs).

## 7. MongoDB schema (new database `studyplanner` on the same Atlas cluster)
Old `users`/`planners` collections are left untouched. The owner moves their data via backup import, and the old collections are dropped manually later.

| Collection | Shape | Indexes |
|---|---|---|
| `users` | `_id, googleSub, email, name, avatarUrl, createdAt, lastLoginAt, onboardingCompletedAt?, settings{ intervals:number[] (default [4,7,15,30,60,90]), reminderTime:'HH:MM' (default '08:00'), timezone: IANA, theme:'system'\|'light'\|'dark', dailyReminder: boolean }` | unique `googleSub`; `email` |
| `sessions` | `_id, userId, tokenHash, deviceLabel, createdAt, expiresAt, revokedAt?, replacedBy?` | unique `tokenHash`; `userId`; TTL on `expiresAt` |
| `exams` | `_id, userId, name, examDate?:'YYYY-MM-DD', createdAt` | `{userId, name}` unique |
| `subjects` | `_id, userId, name, nameKey (lowercased/trimmed), createdAt` | `{userId, nameKey}` unique |
| `topics` | `_id, userId, name, subjectId, examIds:ObjectId[], studiedOn:'YYYY-MM-DD', intervals:number[] (snapshot), notes, revisions:[{ _id, step, dueOn, doneOn?, dueOverride? }], nextDueOn?:'YYYY-MM-DD' (null when all done), status:'active'\|'completed', createdAt, updatedAt` | `{userId, nextDueOn}`, `{userId, subjectId}`, `{userId, updatedAt}` |
| `mockTests` | `_id, userId, examId?, title, takenOn, score, maxScore, notes, createdAt` | `{userId, takenOn:-1}` |

- Revisions are **embedded**, since there are at most 20 per topic. They have stable `_id`s.
- Dates are **calendar strings in the user's local day**, never instants, so there are no timezone bugs.
- Every repository query includes `userId`. A test asserts that user B cannot read or modify user A's data.
- Limits:
  - 5,000 topics per user.
  - Intervals: 1–20 entries, each 1–999, strictly increasing.

## 8. Revision schedule ("move forward"): `packages/shared/src/domain/schedule.ts`
One pure function, `rebuildSchedule(topic)`. It is used by the API for every write and by the app for previews.
```
for each revision i (in step order):
  base = i == 0 ? studiedOn : (rev[i-1].doneOn ?? rev[i-1].dueOn)
  gap  = i == 0 ? intervals[0] : intervals[i] - intervals[i-1]
  dueOn = rev[i].dueOverride ?? addDays(base, gap)
nextDueOn = first revision without doneOn → its dueOn (null if none)
```
**Examples:**
- Studied 1 Nov with intervals 4, 7, 15, 30. R1 is due 5 Nov but done 12 Nov. Then R2 is due 15 Nov, R3 on 23 Nov, and R4 on 8 Dec.
- Doing a revision early pulls the chain earlier in the same way.

**Actions:**
- **Complete:** sets `doneOn` to the client's local today. The app sends it because the server doesn't know the user's day.
- **Undo:** clears `doneOn`, and the chain recomputes.
- **Snooze:** sets `dueOverride` to today + days, measured from *today*.
- **Editing a topic:** a new studiedOn or new intervals recompute the schedule. Completed revisions keep `doneOn` and are matched by `step`.

Unit tests cover these examples, undo, snooze, interval edits, month and year boundaries, and leap days.

## 9. Mobile: `apps/mobile`
```
apps/mobile/src/
├─ app/                 App.tsx, providers (QueryClient, Auth, Theme), navigation/
│                       RootNavigator: Splash → AuthStack | OnboardingStack | MainTabs
├─ features/
│  ├─ auth/             GoogleSignInButton, useAuth, token storage (keychain), refresh logic
│  ├─ onboarding/       5 steps (below)
│  ├─ topics/           TopicsScreen, TopicDetailScreen (revision timeline), TopicForm, hooks (react-query)
│  ├─ revisions/        RevisionRow (Done / Snooze / Undo), useCompleteRevision (optimistic + undo snackbar)
│  ├─ schedule/         ScheduleScreen: Overdue / Today / Upcoming sections, all actionable
│  ├─ home/             Today queue (all due, not just 6), exam countdown, quick add, Pomodoro timer
│  ├─ progress/         stats + mock tests
│  ├─ settings/         intervals, reminder time, theme, exams/subjects management, Reminder health, backup, sign out, delete account
│  └─ backup/
├─ shared/
│  ├─ api/http.ts       one fetch/axios client: base URL, Bearer token, single-flight refresh on 401,
│  │                    parses {error:{code}} into ApiError (Classory api-client pattern); per-feature makeXApi(http)
│  ├─ ui/               theme tokens (light/dark), Button, Card, TextField, Snackbar, Banner, EmptyState, PickerField (reuse current src/ui/*)
│  └─ lib/dates.ts      localToday(), formatters
└─ native/reminders.ts  typed wrapper over the native module
```
**Libraries (all free):**
- `@react-navigation/native`, native-stack and bottom-tabs.
- `@tanstack/react-query`.
- `react-native-keychain`.
- `@react-native-community/datetimepicker`.
- A Google sign-in library (see §3).
- Remove `socket.io-client`.

**UX rules** (these fix the reported problems)
- A network error never unmounts a screen or closes a form. The form stays open with an inline error and **Retry**.
- Offline: a top banner shows "No connection — changes can't be saved right now", and the last data loaded stays visible. It is kept in memory only.
- Revisions can be acted on from Home, Schedule and Topic detail:
  - **Done** is optimistic, followed by a 5 s "Undo" snackbar.
  - **Snooze 1 day** is measured from today.
  - **Undo** is also available on completed rows in Topic detail.
- After adding a topic, a snackbar says "Thyroid added — first revision 5 Nov".
- Every list has empty states, and every action shows loading and disabled states.
- Data refetches on screen focus and when the app returns to the foreground. This replaces Socket.IO.

**First-run setup** (approved). It is shown while `onboardingCompletedAt` is unset; progress is saved per step via `PATCH /me` and the exam and subject endpoints.
1. Google sign-in.
2. Exam(s): quick picks "NEET SS" and "MS General Surgery", plus "add your own". Exam date is optional.
3. Revision intervals, explained in plain words, with a preview built from `rebuildSchedule`.
4. Reminder time and permissions: notifications, exact alarms, and battery "unrestricted" (via the settings link). Each is re-checked after the user returns, with its status shown.
5. Add topics: subject from the user's growing list or a new one, name, studied date. Add several in a row, then **Finish**, which needs at least 1 topic. "Skip for now" is also available.
6. Home.

## 10. Reminders: native rewrite (`android/.../reminders/`)
**Model (my call: replaces per-revision alarms).** There is **one daily notification** at the user's reminder time, for example "4 revisions due today · 2 overdue: Thyroid, Breast, Hernia…". Tapping it opens Schedule. There is no notification on days with nothing due. One notification removes the duplicates, the overdue spam, the ID collisions and the per-alarm write storms.

**Kotlin files:**
- `ReminderModule.kt` (TurboModule-compatible): `syncSnapshot(json)`, `setReminderTime(h, m, enabled)`, `getStatus()` (notifications enabled, exact-alarm allowed, ignoring battery optimisations, next fire time), `openSettings(kind)`, `sendTestNotification()`, `clearAll()`.
- `ReminderStore.kt`: a single synchronized JSON blob in SharedPreferences, `{reminderTime, enabled, lastShownDate, items:[{topicName, dueOn}]}`. Every write uses `commit()` under one lock.
- `ReminderScheduler.kt`: computes the next local wall-clock fire time (today if it's still ahead, else tomorrow).
  - Uses `setExactAndAllowWhileIdle` when `canScheduleExactAlarms()`, otherwise `setWindow` with a 10-minute window.
  - One fixed request code and an explicit-component PendingIntent with `FLAG_IMMUTABLE`.
- `ReminderReceiver.kt`: on fire, reads the snapshot and counts due and overdue items against *today's local date*. It posts the notification if any are due, stores `lastShownDate`, and re-arms for tomorrow.
- `SystemEventsReceiver.kt`: listens for `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `TIMEZONE_CHANGED`, `TIME_SET`, and `ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`. It re-arms the alarm. If today's reminder time has already passed and `lastShownDate != today`, it shows today's reminder now, once.
- A notification channel `revision_reminders` (high importance), created at app start.

**JS side:**
- After every successful agenda fetch or revision/topic mutation, the app calls `syncSnapshot(next due per active topic)`. This is cheap: one native call, no alarm churn.
- Settings changes call `setReminderTime`.
- Sign-out calls `clearAll`.
- The old `AlarmStore.kt` and `PlannerNativeModule.kt` are deleted. `AppConfigModule.kt` is kept or replaced by a build-config constant.

**Settings → Reminder health** lists:
- each permission's status, with a "Fix" button
- the next reminder time
- a "Send test notification" button

## 11. Shared package: `packages/shared`
- `schemas/`: zod DTOs (topic create/update, revision actions, exam, subject, mock test, settings, backup formats v-old, v-rn and v-new).
- `types` inferred from the schemas.
- `errors/codes.ts` (Classory pattern): `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `GOOGLE_TOKEN_INVALID`, `VALIDATION_FAILED`, `NOT_FOUND`, `SUBJECT_IN_USE`, `LIMIT_EXCEEDED`, `BACKUP_INVALID`, `RATE_LIMITED`, `INTERNAL`. Each has a default status and message.
- `domain/schedule.ts` (§8), `domain/dates.ts` (addDays, compare, isValid on `YYYY-MM-DD`).

## 12. Testing
- **Classory convention:** colocated `__tests__/*.test.ts`, using Jest across the workspace. The API compiles as CommonJS for Jest simplicity.
- **shared:** schedule and date domain, and schema edge cases.
- **api:**
  - supertest against `createApp()` with `mongodb-memory-server` (free).
  - Covers auth (Google verifier mocked), refresh rotation and reuse detection, per-user isolation, topic CRUD, revision complete, undo and snooze, agenda, backup import of all 3 formats, and account deletion.
- **mobile:** Jest + React Native Testing Library for the TopicForm (draft survives an API error), RevisionRow optimistic + undo, and onboarding gating.
- **Kotlin:** JVM unit tests for `ReminderScheduler.nextFireTime` (DST, timezone change, past and future times) and the due/overdue counting.

## 13. Phases (detail goes into the writing-plans plan)
1. Restructure the repo, set up workspaces, shared package and tooling, and remove old code.
2. API core: env, db, errors, health, auth (Google + refresh), me.
3. API domain: exams, subjects, topics + revisions, agenda, mock tests, stats, backup.
4. Mobile foundation: navigation, HTTP client with refresh, auth, theme, shared UI.
5. Onboarding, topics, revisions, schedule and home UX.
6. Native reminders rewrite and Reminder health.
7. Progress, mock tests, timer, settings and backup.
8. Deploy: Vercel root dir and env, Google Cloud OAuth clients, release keystore, APK; then the end-to-end check.

## 14. What the user must do (cannot be done from code)
1. In Google Cloud Console (free), create an OAuth consent screen (External) and two OAuth clients:
   - **Web** (its ID goes to `GOOGLE_WEB_CLIENT_ID` in Vercel and in the app config).
   - **Android** (package `com.surgicalstudyplanner.app` + SHA-1 of the debug keystore, and later the release keystore).
2. In Vercel, set Root Directory to `apps/api` and set the env vars `MONGODB_URI`, `JWT_SECRET` (≥ 32 bytes) and `GOOGLE_WEB_CLIENT_ID`.
3. Generate a release keystore and keep it safe. Losing it means users can't update the app.
4. Export a backup from the current app before switching, then import it into the new one.

## 14a. Going public (user decision)
- In scope: `apps/api` serves static `GET /privacy` and `GET /` (home page) as plain HTML, outside `/v1` and free.
  - The privacy policy states: data collected is name, email and study data; it's used only for the app; it's stored on MongoDB Atlas; deletion is in-app via Delete account or by email request.
- Phase 8 adds a walkthrough for the user to set those URLs on the OAuth consent screen and **publish it to "In production"**. Only the non-sensitive scopes `openid`, `email` and `profile` are requested, so no sensitive-scope review is expected.
- Until it's published, testing uses up to 100 test users added in Google Cloud Console.

## 14b. Calls made after the builder check (marked as mine, for the user to review)
- **Revisions go strictly in order.** Only the next pending revision shows **Done** or **Snooze**. **Undo** is offered only on the most recently completed one.
  - The server rejects anything else with a new code, `REVISION_OUT_OF_ORDER` (409).
  - This keeps the move-forward chain unambiguous.
- **Fresh install, not an in-place upgrade.**
  - The current app's data already lives on the server, so uninstalling loses nothing once a backup is exported.
  - The new app is signed with a new release keystore and never with the committed debug key. The Android OAuth client gets both SHA-1s (debug for development, release for the APK).
- **Backup import keeps history and recalculates what's pending.**
  - Done revisions become `doneOn = completedAt ?? date`.
  - Pending ones are recalculated by `rebuildSchedule` from the last `doneOn`. That is the chosen rule, and it ends old overdue pile-ups.
  - Imported topics store `legacyId`, so a `merge` import of the same file twice doesn't duplicate them.
- **All work happens directly on `main` (user decision, no separate branches).**
  - Vercel deploys `main` on every push, and the current app still uses the live API.
  - Commits therefore stay local, and nothing is pushed until Phase 8. At that point the push is done together with the Vercel Root Directory switch, after the user has exported a backup.

## 15. Left to the builder
- Exact component styling within the theme tokens.
- Choosing between the free google-signin "original" API and a Credential Manager Kotlin module (must stay $0).
- Pagination thresholds.
- Rate-limit numbers.
- Snackbar timing.
- Exact wording of copy.

## 16. Verification (end to end)
1. `npm test` at the root passes for shared, api and mobile; `npm run typecheck` and `npm run lint` are clean; the Kotlin unit tests pass via `./gradlew testDebugUnitTest`.
2. Run the API locally (`npm run dev -w apps/api`) against Atlas and hit `/health`. A scripted smoke test, `verify-vercel.mjs`, signs in with a test token (mocked verifier in dev only), creates a topic, completes and undoes a revision, and reads the agenda.
3. Deploy to Vercel. `/api/server/health` returns 200 with the deployed commit SHA.
4. On a real Android 14+ phone using the debug APK:
   1. Fresh Google sign-in and the full first-run setup.
   2. Add 3 topics, one studied 10 days ago.
   3. Mark the overdue revision done: check the next date moved forward, then Undo.
   4. Snooze a revision.
   5. Turn on airplane mode while the Add Topic form is open, tap Save: the form stays with Retry.
   6. Set the reminder 2 min ahead: exactly one notification arrives.
   7. Reboot after the reminder time: it shows once.
   8. Change timezone: the next reminder is at the new local time.
   9. Deny notifications: the Home banner and Reminder health show it.
   10. Import an old WebView backup and check topics and mock tests appear.
   11. Sign in as a second Google account: no data from the first.
   12. Delete the account: all data is gone.
