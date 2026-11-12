# React Native Cloud Migration Implementation Plan

> **For agentic workers:** Required sub-skill: use `superpowers:executing-plans` to implement this plan task by task. Do not use parallel agents in this session.

**Goal:** Replace the WebView app with an online-only React Native Android app backed by a Node.js API and MongoDB Atlas, preserving planner features and local Android alarms, supporting one owner account initially and private multiple accounts later, and produce a downloadable debug APK.

**Architecture:** Keep the existing project intact and create `SurgicalStudyPlannerReactNative` beside it. The React Native app calls an authenticated HTTPS API; the API reads and writes per-user planner data in MongoDB Atlas and emits live updates to the user's other connected sessions. Kotlin continues to schedule local alarms from the latest server data so reminders can fire while the UI is closed.

**Tech Stack:** React Native with TypeScript; Android Kotlin module; Node.js with TypeScript and Express; MongoDB Atlas with the official Node.js driver; authenticated WebSocket updates; Gradle Android APK build.

**Spec:** [2026-11-12-react-native-migration-design.md](../specs/2026-11-12-react-native-migration-design.md)

## Global Constraints

- Preserve existing source under `SurgicalStudyPlannerAndroid`; create the new project under `SurgicalStudyPlannerReactNative`.
- Planner screens require an internet connection; no offline viewing or editing.
- Use the generated React Native 0.88.1 template's Android minimum API 24; API 23 devices from the current app are outside the new template's supported minimum.
- Use a Node runtime accepted by the generated React Native packages (`^22.13.0`, `^24.3.0`, or `>=26.0.0`); do not use Node 25.
- Design the data model for multiple private user accounts from the first release, even though only one owner account is initially active.
- Keep public registration disabled initially; future additional accounts must receive separate planner records scoped to their verified user IDs.
- Never include a MongoDB connection string, database password, or JWT signing secret in the APK.
- Keep the current Android `AlarmManager`, notification channel, exact-alarm permission flow, alarm receivers, reboot recovery, and JSON backup/import workflow.
- Retain the existing package ID `com.surgicalstudyplanner.app` where signing/install compatibility permits; set a new version code above the existing value of 2.
- Do not add or run automated tests unless the user requests them. Build the requested APK and perform only necessary build/artifact checks.
- Do not deploy services or create cloud resources without the user's Atlas account, API host choice, and explicit deployment authorization.
- After each task's planned verification, stage only that task's files and create its own Git commit.

## Review Focus

- Every planner API operation and socket room must be scoped to the authenticated user; the code review checks that no request can read or overwrite another user's data.
- A stale whole-planner update from a second device must not silently erase newer work; use document versions and return a conflict response for refresh/merge.
- A WebSocket reconnect or app foreground event must reload current server state and refresh the local alarm schedule.
- If the app is closed while another device changes a schedule, this phone retains the last downloaded alarm snapshot until it reconnects; communicate this behavior in the README.
- Invalid or older JSON backups must be rejected with a readable message and must not replace existing cloud data.

---

### Task 1: Scaffold the React Native Android project

**Files:**
- Create: `SurgicalStudyPlannerReactNative/mobile/` React Native project, Android wrapper, TypeScript entry points, app config, and ignore rules.
- Create: `SurgicalStudyPlannerReactNative/mobile/src/config/api.ts`
- Create: `SurgicalStudyPlannerReactNative/README.md`

**Interfaces:**
- `API_BASE_URL` is a build-time setting read by the app API client.
- `PlannerDocument` is defined in the app and server as `{ version: number; settings: Settings; topics: Topic[]; mockTests: MockTest[] }`.

- [ ] Create a bare React Native project in `SurgicalStudyPlannerReactNative/mobile` with TypeScript, Android support, the existing display name, package ID, minimum supported Android version, and a generated Windows Gradle wrapper.
- [ ] Add a build-time API base URL setting with a safe placeholder; ensure local secrets and generated artifacts are ignored.
- [ ] Document the mobile/backend folder layout and the need for a real HTTPS API URL before the APK can sign in.
- [ ] With the compatible Node 24 runtime, confirm `npm ls --depth=0` exits successfully and `node node_modules/typescript/bin/tsc --noEmit` exits with no diagnostics.
- [ ] Confirm the generated project name, application ID, version code, minSdk, and Windows Gradle wrapper match the plan; defer APK build to Task 6.
- [ ] Commit Task 1 changes with `git add .gitignore SurgicalStudyPlannerAndroid/docs/superpowers/specs/2026-11-12-react-native-migration-design.md SurgicalStudyPlannerAndroid/docs/superpowers/plans/2026-11-12-react-native-cloud-migration.md SurgicalStudyPlannerReactNative/README.md SurgicalStudyPlannerReactNative/mobile` and `git commit -m "feat: scaffold React Native Android app"`.

### Task 2: Implement authenticated MongoDB API

**Files:**
- Create: `SurgicalStudyPlannerReactNative/server/package.json`, TypeScript config, and `src/index.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/config.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/db.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/auth.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/planner.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/realtime.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/create-owner.ts`
- Create: `SurgicalStudyPlannerReactNative/server/.env.example`
- Create: `SurgicalStudyPlannerReactNative/server/src/planner-schema.ts`, `src/tokens.ts`, and `src/types.ts`

**Interfaces:**
- `POST /v1/auth/register` accepts `{ email, password }` but is disabled by default; `POST /v1/auth/login` accepts the same shape and returns `{ token, user: { id, email } }`.
- `GET /v1/config` returns `{ registrationEnabled: boolean }` so the app can hide or show registration.
- The initial owner is created with a server-side `npm run create-owner` command; no default password is committed.
- `GET /v1/planner` returns the caller's `PlannerDocument`.
- `PUT /v1/planner` accepts `{ expectedVersion, settings, topics, mockTests }` and returns the saved document; stale versions return HTTP `409` with the current version.
- Socket.IO authenticates with the same user token, joins a room derived from the verified user ID, and emits `planner:changed` with `{ version }` after a successful write.
- MongoDB stores a unique normalized email per user and one private planner record keyed by that user ID; no route accepts a client-supplied owner ID.
- Server settings are read from `MONGODB_URI`, `JWT_SECRET`, `PORT`, and `ALLOW_REGISTRATION` (false by default); none are returned to the mobile client except the registration-enabled boolean.

- [x] Implement login and gated registration with password hashing, signed expiring tokens, input validation, and generic authentication errors; add a server-side command to create the initial owner account.
- [x] Implement MongoDB connection, unique normalized user emails, and one versioned private planner document per user; enforce authenticated user scope in every planner route.
- [x] Implement version checks so concurrent updates return `409` instead of silently overwriting a newer planner document.
- [x] Implement authenticated Socket.IO rooms and publish `planner:changed` after successful API writes.
- [x] Add server setup, environment variable, HTTPS deployment, and Atlas network access instructions to the README.
- [x] Run the server TypeScript build; do not deploy it or provision Atlas resources in this task.
- [x] Commit Task 2 changes with `git add SurgicalStudyPlannerReactNative/server SurgicalStudyPlannerReactNative/README.md SurgicalStudyPlannerAndroid/docs/superpowers/plans/2026-11-12-react-native-cloud-migration.md` and `git commit -m "feat: add authenticated MongoDB API"`.

### Task 3: Preserve native Android alarm and backup functions

**Files:**
- Create or modify Kotlin files under `SurgicalStudyPlannerReactNative/mobile/android/app/src/main/java/com/surgicalstudyplanner/app/` for the React Native native module, package, build configuration module, alarms, and receivers.
- Modify: `mobile/android/app/src/main/java/com/surgicalstudyplanner/app/MainActivity.kt`
- Modify: `mobile/android/app/src/main/java/com/surgicalstudyplanner/app/MainApplication.kt`
- Create or modify: `mobile/android/app/src/main/AndroidManifest.xml`
- Create or modify: `mobile/src/config/api.ts` only if the native configuration interface needs adjustment.

**Interfaces:**
- Native module methods: `cancelAllRevisionAlarms(): Promise<void>`, `scheduleRevisionAlarm(id, atMillis, title, body): Promise<void>`, `scheduleDailyReminder(hour, minute, pendingCount): Promise<void>`, `requestExactAlarmAccess(): Promise<void>`, `exportBackup(json): Promise<void>`, and `importBackup(): Promise<string>`.
- The existing `RevisionAlarmReceiver` and `BootReceiver` behavior remains native and can restore future schedules from `SharedPreferences` without launching React Native.

- [x] Adapt the current `AlarmStore` to a React Native native module without changing notification content, exact/inexact fallback, daily reminder recurrence, or reboot recovery.
- [x] Implement promise-based Android document picker flows for JSON export and import.
- [x] Request Android notification permission on supported Android versions and retain the exact-alarm settings screen flow.
- [ ] Compile the Android module as part of the mobile debug build. The build was attempted, but this machine has no working JDK (`JAVA_HOME` is unset and `java.exe` fails); complete this when the Task 6 APK toolchain is available.
- [x] Commit Task 3 changes with `git add SurgicalStudyPlannerReactNative/mobile/android SurgicalStudyPlannerAndroid/docs/superpowers/plans/2026-11-12-react-native-cloud-migration.md` and `git commit -m "feat: bridge Android alarms and backup"`.

### Task 4: Build React Native sign-in and planner screens

**Files:**
- Create: `mobile/src/api/client.ts`
- Create: `mobile/src/auth/AuthContext.tsx`
- Create: `mobile/src/navigation/` app navigation and tab routes.
- Create: `mobile/src/screens/` sign-in, registration, Home, Topics, Schedule, Progress, and Settings screens.
- Create: `mobile/src/types/planner.ts`
- Create: `mobile/src/planner/` revision, validation, and alarm-sync helpers.

**Interfaces:**
- API client methods: `register(email, password)`, `login(email, password)`, `getPlanner(token)`, and `savePlanner(token, planner, expectedVersion)`.
- `syncNativeAlarms(planner: PlannerDocument): Promise<void>` cancels old revision alarms, schedules each incomplete revision at the selected reminder time, and schedules the daily reminder.
- The app stores the session token using platform secure storage; planner data remains server-backed and in React state, with no offline editing or database cache.

- [ ] Implement sign-in and conditionally show registration only when `/v1/config` enables it; show a connection error and retry action when the API is unavailable.
- [ ] Recreate topic add/edit/delete, exam filter/search, completion, snooze, interval settings, dashboard counts, schedule, subject progress, mock-test tracking, dark mode, and Pomodoro timer.
- [ ] Save edits through the authenticated API; refresh state after a `409` version conflict and show a clear message.
- [ ] On sign-in, app foreground, and successful planner writes, fetch the latest document and refresh the local alarm schedule.
- [ ] Connect authenticated Socket.IO sessions; on `planner:changed`, fetch the newest document and update both the UI and scheduled alarms.
- [ ] Commit Task 4 changes with `git add SurgicalStudyPlannerReactNative/mobile/src SurgicalStudyPlannerReactNative/mobile/App.tsx` and `git commit -m "feat: add React Native planner experience"`.

### Task 5: Add old-app backup migration and JSON backups

**Files:**
- Create: `mobile/src/backup/backup.ts`
- Modify: `mobile/src/screens/SettingsScreen.tsx`
- Modify: `server/src/planner.ts` only if a dedicated import validation path is needed.

**Interfaces:**
- `exportPlannerBackup(planner): Promise<void>` serializes the signed-in user's current planner to JSON and passes it to the native document picker.
- `importPlannerBackup(): Promise<PlannerDocument>` opens a JSON file, validates its shape, uploads it to the authenticated API with the current expected version, then refreshes alarms.

- [ ] Match the current backup shape `{ topics, settings, tests }`; accept missing `tests` as an empty list for older backups.
- [ ] Validate topics, revision dates, settings, and test scores before upload; reject malformed input without modifying cloud data.
- [ ] Ensure imported data is saved to the signed-in account and all pending local alarms are rebuilt after the API confirms success.
- [ ] Commit Task 5 changes with `git add SurgicalStudyPlannerReactNative/mobile/src SurgicalStudyPlannerReactNative/server/src/planner.ts` and `git commit -m "feat: migrate planner data with JSON backups"`.

### Task 6: Configure the API endpoint and produce the downloadable APK

**Files:**
- Modify: `mobile/android/app/build.gradle` or the generated React Native equivalent for a configurable API URL.
- Modify: project READMEs with Atlas, backend hosting, and APK install instructions.

**Interfaces:**
- Debug APK output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
- The APK uses the configured HTTPS API URL; no Atlas credentials are compiled into it.

- [ ] Document required Atlas and API environment variables, creation of the initial owner account, how to enable additional private accounts later, API hosting configuration, and the API URL value needed for a usable APK.
- [ ] Build the debug APK after configuring an API URL; check package ID, version code, and output file.
- [ ] Report whether the artifact is pointed at a real hosted API or a development placeholder; do not claim cloud login or sync is operational without a configured endpoint and credentials.
- [ ] Commit Task 6 documentation/config changes with `git add SurgicalStudyPlannerReactNative` and `git commit -m "build: document and package Android APK"`.
