# Plan 2: Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/mobile` as a clean React Native Android app on top of the Plan 1 API. It covers Google sign-in, the first-run setup, topics and revisions you can act on from every screen, a native Kotlin daily reminder that reliably fires, progress and mock tests, the timer, settings and backup.

**Architecture:**
- Bare React Native 0.88.1 (New Architecture), keeping the existing `android/` project, applicationId and debug keystore.
- **JS layout:**
  - `src/app` holds providers and navigation.
  - `src/features/<feature>` holds screens, components, api and hooks.
  - `src/shared` holds the HTTP client, UI kit and lib code.
  - `src/native` holds typed wrappers for the Kotlin modules.
- **Data:** React Query over a single HTTP client, with Bearer auth and single-flight refresh.
- **Native modules:** two new Kotlin modules, `GoogleAuth` (AndroidX Credential Manager) and `Reminders` (AlarmManager daily summary). The file-picker backup functions of the current `PlannerNativeModule` are kept, renamed to `BackupFiles`.
- **Shared code:** `@planner/shared` is linked with `file:../../packages/shared` and consumed from source through Metro `watchFolders`.

**Tech Stack:**
- React Native 0.88.1, React 19.3, TypeScript.
- `@react-navigation/native` + `native-stack` + `bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`.
- `@tanstack/react-query`, `@react-native-community/netinfo`, `react-native-keychain`, `@react-native-community/datetimepicker`.
- Jest + `@testing-library/react-native`.
- Kotlin with `androidx.credentials` + `com.google.android.libraries.identity.googleid`, and JUnit for JVM tests.

**Spec:** `docs/superpowers/specs/2026-11-13-study-planner-rebuild-design.md`. Read §8, §9, §10 and §14b.

**API contract:** the Plan 1 code in `apps/api/src/modules/*` and `packages/shared/src` (schemas, `views.ts`, `errors/codes.ts`) is the source of truth for endpoints, bodies and error codes. Read the relevant module before calling it.

## Global Constraints

- **Git:**
  - Work directly on `main`. Never create branches or worktrees.
  - **Never `git push`.** Never `git stash`. Never kill processes.
  - Guard every git command with `set -eu` and `git -C /d/StudyPlanner_Android_Source`.
- **$0 only.**
  - Free, open-source libraries.
  - **No** paid "Universal" Google sign-in package. Sign-in uses our own Credential Manager module.
- **Android:**
  - applicationId and namespace stay `com.surgicalstudyplanner.app`.
  - `minSdkVersion 24`, `targetSdkVersion 36`, `compileSdkVersion 37`.
  - Keep `android/app/debug.keystore`.
  - Android only: no iOS code.
- **Build config fields** (`android/app/build.gradle`, from Gradle properties):
  - `API_BASE_URL` defaults to `https://studyplannerandroidsource-server.vercel.app/api/server`.
  - `GOOGLE_WEB_CLIENT_ID` defaults to `""`. An empty value makes sign-in show "Google sign-in is not configured".
  - Both are exposed through `AppConfig` native constants (the existing `AppConfigModule.kt`).
- **Dates and times:**
  - Calendar dates are `LocalDate` strings (`YYYY-MM-DD`) from `localToday()` in `@planner/shared`. Never `toISOString().slice(0,10)`.
  - The client sends `today` and `doneOn` to the API.
- **Errors:**
  - The API error body is `{ error: { code, message, details? }, requestId }`. The client maps `code` to UI text.
  - `VERSION_CONFLICT` shows "This changed on another device — refreshed" and then refetches.
  - `REVISION_OUT_OF_ORDER` shows "Do the earlier revision first".
  - `SERVICE_UNAVAILABLE` and network errors show "Can't reach the server — try again".
- **UX rules** (spec §9):
  - A network or API error never unmounts a screen or closes a form. Forms keep their draft and show an inline error and a **Retry** button.
  - Offline shows a banner with the text "No connection — changes can't be saved right now". The last loaded data stays visible.
  - **Done** is optimistic and shows a 5-second "Undo" snackbar.
  - Only the next pending revision of a topic shows **Done** and **Snooze**. Only the most recently completed one shows **Undo**.
  - Data refetches on screen focus and when the app returns to the foreground.
- **Auth** (Plan 1 rulings):
  - Refresh is **single-flight**: concurrent 401s share one refresh call.
  - After a failed refresh, the user is signed out locally.
  - Tokens live in `react-native-keychain`.
- **Backup:** a **replace** import must first offer "Export a backup first", with Export, Continue and Cancel. Import isn't transactional (Plan 1 ruling).
- **Reminders** (spec §10):
  - One daily summary notification at the user's reminder time. No notification on days with nothing due.
  - Channel id `revision_reminders`. One fixed request code (`7001`). Notification id `7001`.
  - Tapping the notification opens the Schedule tab.
- **Commands:**
  - Mobile JS tests: `npm test --prefix apps/mobile` (Jest).
  - Typecheck: `npx --prefix apps/mobile tsc --noEmit -p apps/mobile`.
  - Lint: `npm run lint --prefix apps/mobile`.
  - Kotlin unit tests: `cd apps/mobile/android && ./gradlew testDebugUnitTest`.
  - Debug build: `cd apps/mobile/android && ./gradlew assembleDebug`.
  - If the Android SDK isn't installed on the machine, report the Gradle steps as not run. Don't fake them.
- **Build environment on this machine** (already installed, not on PATH): before any Gradle command, run `export JAVA_HOME="/d/StudyPlannerApkBuild/jdk/jdk-17.0.21+9" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"; export PATH="$JAVA_HOME/bin:$PATH"`. The SDK has platform `android-37.0` and build-tools 36.0.0 / 37.0.0. If `android/local.properties` is missing, create it with `sdk.dir=` pointing at that SDK; the file is git-ignored.
- **Formatting:** the repo prettier config (single quotes, trailing commas, width 80, `arrowParens: avoid`).

## Review Focus

These failure modes are likely to bite real users, and each is pinned by a test in the task that owns it:
1. **Concurrent 401s:** Home loads agenda, stats and me at once with an expired access token. Exactly one `/v1/auth/refresh` call should happen, and all three requests are retried. (Task 2)
2. **Network error while saving a topic:** the form stays open with every typed value intact, shows an inline error and Retry, and Retry succeeds. (Task 9)
3. **Undo after Done:** tapping Undo within 5 s calls `/undo` and the list goes back to its previous state. If Done itself fails, the optimistic change rolls back and an error appears. (Task 10)
4. **Reminder after a timezone change or reboot:** the next fire time is recalculated from local wall-clock time. A reminder missed during a reboot shows once and never twice. (Task 7, JVM tests)
5. **Notification permission denied:** Home shows a banner, and Reminder health shows "Notifications off — Fix". Nothing fails silently. (Tasks 7 and 12)

---

## File map (end state)

```
apps/mobile/
  package.json  metro.config.js  tsconfig.json  jest.config.js  jest.setup.ts  babel.config.js  index.js  App.tsx
  src/app/{AppProviders.tsx, RootNavigator.tsx, MainTabs.tsx, linking.ts}
  src/shared/api/{http.ts, tokenStore.ts, errors.ts, queryClient.ts}
  src/shared/ui/{theme.ts, ThemeProvider.tsx, Button.tsx, Card.tsx, TextField.tsx, DateField.tsx, ChipSelect.tsx,
                 Snackbar.tsx, Banner.tsx, EmptyState.tsx, Screen.tsx, ErrorRetry.tsx}
  src/shared/lib/{format.ts, useAppForeground.ts, useOnline.ts}
  src/native/{config.ts, googleAuth.ts, reminders.ts, backupFiles.ts}
  src/features/auth/{api.ts, AuthProvider.tsx, SignInScreen.tsx}
  src/features/me/{api.ts, hooks.ts}
  src/features/exams/{api.ts, hooks.ts}   src/features/subjects/{api.ts, hooks.ts}
  src/features/topics/{api.ts, hooks.ts, TopicsScreen.tsx, TopicFormScreen.tsx, TopicDetailScreen.tsx, TopicForm.tsx}
  src/features/revisions/{api.ts, hooks.ts, RevisionRow.tsx}
  src/features/agenda/{api.ts, hooks.ts, useReminderSnapshotSync.ts}
  src/features/schedule/ScheduleScreen.tsx
  src/features/home/{HomeScreen.tsx, PomodoroTimer.tsx, timerReducer.ts}
  src/features/progress/{api.ts, hooks.ts, ProgressScreen.tsx, MockTestForm.tsx}
  src/features/onboarding/{OnboardingNavigator.tsx, ExamStep.tsx, IntervalsStep.tsx, RemindersStep.tsx, TopicsStep.tsx}
  src/features/settings/{SettingsScreen.tsx, ReminderHealthScreen.tsx, ManageExamsSubjectsScreen.tsx, BackupSection.tsx}
  src/features/backup/{api.ts, hooks.ts}
  (tests colocated: src/**/__tests__/*.test.ts(x))
  android/app/src/main/java/com/surgicalstudyplanner/app/
    MainActivity.kt  MainApplication.kt  AppConfigModule.kt  PlannerPackage.kt (renamed from PlannerNativePackage)
    auth/GoogleAuthModule.kt
    backup/BackupFilesModule.kt          (file pickers moved from PlannerNativeModule)
    reminders/{ReminderModule.kt, ReminderStore.kt, ReminderScheduler.kt, ReminderContent.kt,
               ReminderReceiver.kt, SystemEventsReceiver.kt, ReminderNotifications.kt}
  android/app/src/test/java/com/surgicalstudyplanner/app/reminders/{ReminderSchedulerTest.kt, ReminderContentTest.kt}
  deleted: src/{api,auth,backup,components,config,navigation,planner,screens,types,ui}/*, __tests__/nativeAlarms.test.cjs,
           AlarmStore.kt, PlannerNativeModule.kt, PlannerNativePackage.kt
```

---

### Task 1: Mobile project wiring (deps, Metro + shared, Jest, build config, clean slate)

**Files:**
- Modify: `apps/mobile/{package.json,metro.config.js,tsconfig.json,babel.config.js,App.tsx}`, `android/app/build.gradle` (build config fields)
- Create: `apps/mobile/{jest.config.js,jest.setup.ts}`, `src/app/AppProviders.tsx` (placeholder)
- Move: keep `src/ui/theme.ts` as `src/shared/ui/theme.ts` and `src/ui/PickerField.tsx` as reference for `DateField`, then delete the rest of the old `src/**` and `__tests__/nativeAlarms.test.cjs`.
- Test: `src/app/__tests__/App.test.tsx`, `src/shared/__tests__/sharedImport.test.ts`

**Interfaces:**
- Produces:
  - `@planner/shared` importable in app code and in Jest.
  - `App` renders `<AppProviders>` (Task 6 fills it in).
  - Build config `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`.

- [ ] **Step 1: Update `package.json` dependencies.**
  - Add `"@planner/shared": "file:../../packages/shared"`, `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `react-native-screens`, `@tanstack/react-query`, `@react-native-community/netinfo`.
  - Keep `react-native-keychain`, `@react-native-community/datetimepicker` and `react-native-safe-area-context`.
  - Remove `socket.io-client` and `@react-native/new-app-screen`.
  - Dev dependencies: `@testing-library/react-native`, `jest`, `@types/jest`, `react-test-renderer` (matching the React version).
  - Scripts: `"test": "jest"` and `"typecheck": "tsc --noEmit"`.
  - Use versions compatible with RN 0.88. Check each package's peer dependencies after install and record the resolved versions in the report.
- [ ] **Step 2: Metro config.** Set `watchFolders: [path.resolve(__dirname, '../../packages/shared')]`, `resolver.nodeModulesPaths: [path.resolve(__dirname, 'node_modules')]`, and `resolver.unstable_enableSymlinks = true` so `zod` resolves from the mobile `node_modules`.
- [ ] **Step 3: TypeScript and Jest config.**
  - `tsconfig.json`: add `paths: { "@planner/shared": ["../../packages/shared/src"] }`.
  - `jest.config.js`: `preset: 'react-native'`, `moduleNameMapper` that maps `@planner/shared` to `<rootDir>/../../packages/shared/src`, `transformIgnorePatterns` allowing `@react-navigation`, `react-native-*` and `@react-native*`, and `setupFiles` `jest.setup.ts`.
  - `jest.setup.ts`: mock `react-native-keychain`, `@react-native-community/netinfo` (its jest mock) and `NativeModules.{AppConfig,GoogleAuth,Reminders,BackupFiles}`.
- [ ] **Step 4: Android build config.**
  - Default `API_BASE_URL` to the Vercel URL above, and add `buildConfigField "String", "GOOGLE_WEB_CLIENT_ID"` from the `GOOGLE_WEB_CLIENT_ID` property (default `""`).
  - `AppConfigModule.kt`: expose both values in `getConstants()`.
- [ ] **Step 5: Write failing tests.**
  - `App.test.tsx`: render `<App />` and expect no crash.
  - `sharedImport.test.ts`: `createSchedule('2026-11-01',[4,7,15,30],...)` from `@planner/shared` returns first `dueOn` `'2026-11-05'`.
- [ ] **Step 6: Run** `npm install --prefix apps/mobile` then `npm test --prefix apps/mobile`. Expected: FAIL first, then implement the placeholder App/AppProviders so both pass. Typecheck and lint must be clean.
- [ ] **Step 7: Check the Metro bundle.** Run `npx --prefix apps/mobile react-native bundle --platform android --dev false --entry-file index.js --bundle-output %TEMP%/sp.bundle`. Expected: the bundle builds, which proves Metro resolves the shared code. Run `./gradlew assembleDebug` if the SDK is available.
- [ ] **Step 8: Commit:** `chore(mobile): wire shared package, navigation and query deps, jest; clean slate`.

---

### Task 2: HTTP client with single-flight refresh, and the token store

**Files:**
- Create: `src/shared/api/{http.ts,tokenStore.ts,errors.ts}`, `src/native/config.ts`
- Test: `src/shared/api/__tests__/http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // native/config.ts
  export const API_BASE_URL: string; export const GOOGLE_WEB_CLIENT_ID: string;
  // errors.ts
  export class ApiError extends Error { code: ErrorCode | 'NETWORK'; status: number; details?: unknown; requestId?: string }
  export function userMessage(e: unknown): string   // maps codes per Global Constraints; falls back to ERROR_CODES[code].message
  // tokenStore.ts
  export interface Tokens { accessToken: string; refreshToken: string }
  export const tokenStore: { get(): Promise<Tokens|null>; set(t: Tokens): Promise<void>; clear(): Promise<void> }  // keychain service 'studyplanner.tokens'
  // http.ts
  export interface Http { get<T>(path: string, query?: Record<string,string|number|undefined>): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>; patch<T>(path: string, body: unknown): Promise<T>; del(path: string): Promise<void> }
  export function createHttp(opts: { baseUrl: string; tokens: typeof tokenStore; onSessionEnded: () => void; fetchImpl?: typeof fetch }): Http
  ```
- **Behaviour:**
  1. Attach `Authorization: Bearer <access>` when tokens exist.
  2. On a 401 with code `TOKEN_EXPIRED` or `UNAUTHENTICATED` on a non-auth path, run **one shared** refresh promise (`POST /v1/auth/refresh`). Store the new tokens, then retry the original request once.
  3. If the refresh fails, clear the tokens, call `onSessionEnded()` and throw `ApiError('UNAUTHENTICATED')`.
  4. Network failures throw `ApiError` with code `'NETWORK'` and status 0.
  5. Non-JSON error bodies map to `INTERNAL`.
  6. A 204 returns `undefined`.

- [ ] **Step 1: Write failing tests** (fake `fetchImpl`):
  - **Review Focus 1:** three parallel GETs that each get a 401 `TOKEN_EXPIRED` → exactly 1 refresh call, and all three resolve with retried data.
  - **Refresh fails:** `onSessionEnded` is called once, the tokens are cleared, and every request rejects with `UNAUTHENTICATED`.
  - **Network error:** `fetch` throws → `ApiError` code `'NETWORK'`.
  - **Error parsing:** body `{error:{code:'DUPLICATE_NAME',message:'x'},requestId:'r'}` → code, status 409 and requestId are parsed.
  - **`userMessage`:** maps `VERSION_CONFLICT` and `NETWORK` to the exact Global Constraints text.
  - **Auth paths:** a 401 from `/v1/auth/*` is never refreshed.
- [ ] **Step 2: Run** `npm test --prefix apps/mobile -- http`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): http client with single-flight token refresh`.

---

### Task 3: Feature APIs and React Query hooks

**Files:**
- Create: `src/shared/api/queryClient.ts`, and `src/features/{auth,me,exams,subjects,topics,revisions,agenda,progress,backup}/api.ts` plus `hooks.ts` (no `hooks.ts` for auth)
- Test: `src/features/topics/__tests__/api.test.ts`, `src/features/revisions/__tests__/hooks.test.tsx`

**Interfaces:**
- **Query client:** `queryClient.ts`: `createQueryClient()` with `staleTime 30_000`, `retry` off for `ApiError` statuses 400–499, at most 2 retries for `NETWORK`, and `refetchOnWindowFocus` wired to AppState through React Query's `focusManager`. `queryKeys = { me: ['me'], exams: ['exams'], subjects: ['subjects'], topics: (q?) => ['topics', q ?? {}], topic: id => ['topic', id], agenda: (today) => ['agenda', today], stats: today => ['stats', today], mockTests: ['mockTests'] }`.
- **APIs:** each `makeXApi(http: Http)` returns typed functions mirroring the Plan 1 endpoints. Return types come from `@planner/shared` view types, and bodies from the shared input types. Names:
  - `authApi.googleSignIn(idToken, deviceLabel)`, `authApi.logout(refreshToken)`
  - `meApi.get()`, `meApi.update(patch)`, `meApi.remove()`
  - `examsApi.list/create/update/remove`, `subjectsApi.list/create/update/remove`
  - `topicsApi.list(query)`, `topicsApi.get(id)`, `topicsApi.create(input)`, `topicsApi.update(id, patch)`, `topicsApi.remove(id)`
  - `revisionsApi.complete(topicId, revisionId, doneOn)`, `revisionsApi.undo(topicId, revisionId)`, `revisionsApi.snooze(topicId, revisionId, today, days)`
  - `agendaApi.get(today, days)`, `statsApi.get(today)`
  - `mockTestsApi.list/create/update/remove`
  - `backupApi.export()`, `backupApi.import(mode, data)`
- **Hooks:** `useMe`, `useUpdateMe`, `useExams`, …, `useTopics(query)`, `useTopic(id)`, `useAgenda(days=30)` (uses `localToday()`), `useStats()`, `useMockTests()`.
  - Mutations invalidate per this map:
    - topic or revision changes → `topics`, `topic(id)`, `agenda`, `stats`
    - exam or subject changes → `exams`, `subjects`, `topics`
    - mock test changes → `mockTests`, `stats`
    - me changes → `me`
- **Optimistic Done:** `useCompleteRevision()` applies `completeRevision` from `@planner/shared` to cached `topic(id)` and drops the item from cached `agenda`. On error it rolls back and rethrows. On settle it invalidates.
- **Undo and Snooze:** `useUndoRevision()` and `useSnoozeRevision()` are plain mutations with invalidation.
- **Provider:** an `ApiProvider` (`src/shared/api/ApiProvider.tsx`) supplies `http` and all `makeXApi` instances via context `useApi()`.

- [ ] **Step 1: Write failing tests.**
  - `topicsApi.list({subjectId:'s'})` calls `GET /v1/topics?subjectId=s`.
  - `revisionsApi.snooze('t','r','2026-11-20',1)` posts `{today:'2026-11-20',days:1}` to `/v1/topics/t/revisions/r/snooze`.
  - `useCompleteRevision` optimistic path: the cache shows R1 done immediately. When the API rejects, the cache rolls back to the original and the error surfaces.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): typed feature APIs and react-query hooks`.

---

### Task 4: Theme and shared UI kit

**Files:**
- Create: `src/shared/ui/{ThemeProvider.tsx,Button.tsx,Card.tsx,TextField.tsx,DateField.tsx,ChipSelect.tsx,Snackbar.tsx,Banner.tsx,EmptyState.tsx,Screen.tsx,ErrorRetry.tsx}`, `src/shared/lib/format.ts`. Modify `src/shared/ui/theme.ts`.
- Test: `src/shared/ui/__tests__/{Snackbar.test.tsx,TextField.test.tsx}`, `src/shared/lib/__tests__/format.test.ts`

**Interfaces:**
- **Theme:** `theme.ts` exports `lightColors` and `darkColors` with the same keys, plus `spacing` and `radius`. `ThemeProvider({mode: 'system'|'light'|'dark'})` resolves via `useColorScheme()`. `useTheme(): { colors, spacing, radius, isDark }`.
- **Snackbar:** `SnackbarProvider` and `useSnackbar().show({ message, actionLabel?, onAction?, durationMs = 5000 })`. Only one snackbar shows at a time; a new one replaces the old.
- **Primitives:**
  - `Button({title, onPress, variant: 'primary'|'secondary'|'danger'|'text', loading?, disabled?})`. While `loading`, it shows a spinner and is disabled.
  - `TextField({label, value, onChangeText, error?, multiline?, ...})` shows the error text under the field.
  - `DateField({label, value: LocalDate, onChange, maximumDate?})` wraps the datetimepicker. It converts with local date fields, never `toISOString`.
  - `ChipSelect<T>({options:{value,label}[], value: T[] | T, onChange, multiple?})`.
  - `Banner({tone:'info'|'warning'|'error', text, actionLabel?, onAction?})`.
  - `EmptyState({title, body?, actionLabel?, onAction?})`.
  - `ErrorRetry({error, onRetry})` uses `userMessage`.
  - `Screen({children, scroll?})` handles safe area and the background colour.
- **Formatting:** `format.ts`:
  - `formatDate(d: LocalDate): string` gives `'5 Nov'`; it adds the year when it isn't the current year.
  - `relativeDay(d, today)` gives `'Today'`, `'Tomorrow'`, `'3 days overdue'` or `'in 4 days'`.

- [ ] **Step 1: Write failing tests:**
  - The snackbar action calls `onAction` and hides; it auto-hides after `durationMs` (fake timers).
  - `TextField` renders its error text.
  - `relativeDay('2026-11-10','2026-11-13') === '3 days overdue'`.
  - `formatDate('2026-11-05')` with today in 2026 gives `'5 Nov'`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): theme and shared UI kit`.

---

### Task 5: Native Google sign-in and AuthProvider

**Files:**
- Create: `android/.../auth/GoogleAuthModule.kt`, `src/native/googleAuth.ts`, `src/features/auth/{AuthProvider.tsx,SignInScreen.tsx}`
- Modify: `android/app/build.gradle` (deps `androidx.credentials:credentials`, `androidx.credentials:credentials-play-services-auth`, `com.google.android.libraries.identity.googleid:googleid`, latest stable), `PlannerPackage.kt` (register modules; rename from `PlannerNativePackage`), `MainApplication.kt`
- Test: `src/features/auth/__tests__/AuthProvider.test.tsx`

**Interfaces:**
- **Kotlin module:** `GoogleAuthModule` has `getName() = "GoogleAuth"`.
  - `signIn(webClientId: String, promise)` uses `CredentialManager.getCredential` with `GetSignInWithGoogleOption.Builder(webClientId).build()`. It resolves `{ idToken: String }`.
  - It rejects with codes `E_CANCELLED` (user cancelled), `E_NO_ACCOUNT` (no Google account on device) and `E_CONFIG` (empty web client id), plus `E_FAILED` for everything else with a generic message.
  - `signOut(promise)` calls `clearCredentialState`.
  - It needs the current Activity; without one it rejects `E_FAILED`.
- **JS wrapper:** `googleAuth.ts`: `signInWithGoogle(): Promise<string /* idToken */>` and `signOutGoogle(): Promise<void>`. It throws `GoogleAuthError {code}`.
- **AuthProvider:**
  - `type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: UserView }`.
  - `useAuth(): { state, signIn(): Promise<void>, signOut(): Promise<void>, refreshUser(): Promise<void> }`.
  - On mount it reads `tokenStore`. If tokens exist it calls `meApi.get()`: success → signedIn; `UNAUTHENTICATED` → clear tokens → signedOut; `NETWORK` → stays signedIn using a cached user if one exists in memory, otherwise shows "Can't reach the server" with Retry.
  - `signIn` runs `signInWithGoogle`, then `authApi.googleSignIn(idToken, deviceLabel = 'Android')`, then `tokenStore.set`, then signedIn.
  - `signOut` runs `authApi.logout` (best effort), then `tokenStore.clear`, then `Reminders.clearAll()` (Task 7, call through `src/native/reminders.ts` and no-op if missing), then `signOutGoogle`, then `queryClient.clear()`, then signedOut.
  - `http`'s `onSessionEnded` triggers the same local sign-out.
- **SignInScreen:** an app title, a one-line value statement, and a **Continue with Google** button with a loading state. Errors appear inline: cancelled shows nothing; `E_NO_ACCOUNT` shows "Add a Google account to this phone first"; `E_CONFIG` shows "Google sign-in is not configured".

- [ ] **Step 1: Write failing tests** (mocked native and API):
  - Stored tokens + me OK → signedIn.
  - Stored tokens + `UNAUTHENTICATED` → tokens cleared → signedOut.
  - `signIn` success stores tokens and sets the user.
  - `signIn` cancelled → stays signedOut with no error text.
  - `signOut` calls logout, clear, `Reminders.clearAll` and `queryClient.clear`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the Kotlin and TS.** If `./gradlew assembleDebug` is available, run it to compile the Kotlin.
- [ ] **Step 4: Run** the tests. Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): native Google sign-in via Credential Manager and auth provider`.

---

### Task 6: Providers, navigation gating, offline banner, foreground refetch

**Files:**
- Create: `src/app/{AppProviders.tsx,RootNavigator.tsx,MainTabs.tsx,linking.ts}`, `src/shared/lib/{useOnline.ts,useAppForeground.ts}`
- Modify: `App.tsx`
- Test: `src/app/__tests__/RootNavigator.test.tsx`

**Interfaces:**
- **Provider order:** `AppProviders` nests `SafeAreaProvider`, then `QueryClientProvider`, then `ApiProvider`, then `AuthProvider`, then `ThemeProvider` (mode from `me.settings.theme`, default `'system'`), then `SnackbarProvider`, then `NavigationContainer(linking)`.
- **Root navigator:**
  - `loading` → splash (app name and a spinner).
  - `signedOut` → `SignInScreen`.
  - signedIn with `user.onboardingCompletedAt === null` → `OnboardingNavigator` (Task 8; until then a placeholder screen with a "Finish setup" button that PATCHes `onboardingCompleted: true`).
  - Otherwise → `MainTabs`, plus stack screens `TopicForm`, `TopicDetail`, `ReminderHealth`, `ManageExamsSubjects`, `MockTestForm`.
- **Tabs:** `MainTabs` has, in this order, `Home`, `Schedule`, `Topics`, `Progress`, `Settings`. Use text labels with simple vector-free glyphs ('●' or similar) so no icon library is needed.
- **Online banner:** `useOnline()` (NetInfo) wires React Query's `onlineManager`. When offline, show the global offline banner text from the Global Constraints, above the tabs.
- **Foreground refetch:** `useAppForeground(cb)` calls `queryClient.invalidateQueries()` when the AppState goes from background to active.
- **Linking:** `linking.ts` handles the deep link `studyplanner://schedule`, which opens the Schedule tab. The notification tap in Task 7 opens it. Add an intent filter for scheme `studyplanner` to `MainActivity` in the manifest.

- [ ] **Step 1: Write failing tests:**
  - `loading` shows the splash.
  - `signedOut` shows the "Continue with Google" button.
  - A signed-in user with `onboardingCompletedAt: null` shows the onboarding placeholder.
  - A completed user shows the tab labels.
  - When offline (mock NetInfo), the offline banner text is visible.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): providers, gated navigation, offline banner, foreground refetch`.

---

### Task 7: Native reminders rewrite (Kotlin) and JS wrapper

**Files:**
- Create: `android/.../reminders/{ReminderModule.kt,ReminderStore.kt,ReminderScheduler.kt,ReminderContent.kt,ReminderReceiver.kt,SystemEventsReceiver.kt,ReminderNotifications.kt}`, `android/.../backup/BackupFilesModule.kt` (moving `exportBackup` and `importBackup` out of `PlannerNativeModule` unchanged), `src/native/{reminders.ts,backupFiles.ts}`, `src/features/agenda/useReminderSnapshotSync.ts`
- Delete: `AlarmStore.kt`, `PlannerNativeModule.kt`, `RevisionAlarmReceiver`/`BootReceiver` (inside `AlarmStore.kt`)
- Modify: `AndroidManifest.xml`, `PlannerPackage.kt`, `MainActivity.kt` (create the channel in `onCreate`; drop the old POST_NOTIFICATIONS auto-request, since onboarding asks for it)
- Test: `android/app/src/test/.../reminders/{ReminderSchedulerTest.kt,ReminderContentTest.kt}`, `src/features/agenda/__tests__/useReminderSnapshotSync.test.tsx`

**Interfaces:**
- **Pure Kotlin, unit-tested (no Android types):**
  - `ReminderScheduler.nextFireTime(now: ZonedDateTime, hour: Int, minute: Int): ZonedDateTime` returns today at `hour:minute` local if it's still after `now`, else tomorrow. DST: if the local time doesn't exist (spring-forward gap), use the next valid instant (`ZonedDateTime.of(...)` resolves forward).
  - `ReminderContent.compose(items: List<Item(topicName, dueOn: LocalDate)>, today: LocalDate): Content?`. It returns null when nothing has `dueOn <= today`. Otherwise:
    - title `"N revisions due today"`, or `"1 revision due today"` for one
    - when overdue > 0, add `" · M overdue"`
    - body: the first 3 topic names joined with `", "`, plus `"…"` if there are more
  - `ReminderContent.shouldShowMissed(now: ZonedDateTime, hour, minute, lastShownDate: LocalDate?): Boolean` is true when `now` is after today's fire time and `lastShownDate != today`.
- **Store:** `ReminderStore` keeps one SharedPreferences JSON blob `{ enabled, hour, minute, lastShownDate, items:[{topicName,dueOn}] }`. Every read-modify-write goes inside `synchronized(LOCK)` with `commit()`.
- **Notifications:** `ReminderNotifications` covers channel `revision_reminders` (IMPORTANCE_HIGH), `show(content)` with notification id `7001` and a content intent for `studyplanner://schedule` (`FLAG_IMMUTABLE`), and `areEnabled()`.
- **Arming:** `ReminderScheduler.arm(context)` reads the store. Disabled → cancel. Otherwise it computes `nextFireTime(ZonedDateTime.now(), ...)` and sets a `PendingIntent.getBroadcast(context, 7001, Intent(context, ReminderReceiver::class.java), FLAG_IMMUTABLE or FLAG_UPDATE_CURRENT)`:
  - `setExactAndAllowWhileIdle(RTC_WAKEUP, ...)` if `canScheduleExactAlarms()` (or API < 31)
  - otherwise `setWindow(RTC_WAKEUP, t, 10 min, ...)`
- **Receivers:**
  - `ReminderReceiver.onReceive` composes from the store with `LocalDate.now()`. If there's content and notifications are enabled, it shows it. It always sets `lastShownDate = today`, then re-arms.
  - `SystemEventsReceiver` (exported=false, but with BOOT_COMPLETED it must be `exported=true` with the system permission; follow Android docs) handles `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `TIMEZONE_CHANGED`, `TIME_SET` and `android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`. It re-arms, and if `shouldShowMissed(...)` it shows today's content once and sets `lastShownDate`.
- **RN module:** `ReminderModule` has `getName() = "Reminders"`:
  - `syncSnapshot(itemsJson: String)` stores items and re-arms. Re-arming is cheap and idempotent.
  - `configure(enabled: Boolean, hour: Int, minute: Int)`.
  - `getStatus()` → `{ notificationsEnabled, exactAlarmsAllowed, ignoringBatteryOptimizations, nextFireAtMillis: Double | null }`.
  - `requestNotificationPermission()`: on API 33+, request via the Activity and resolve with the granted boolean. Below 33, resolve `areEnabled()`.
  - `openSettings(kind: 'notifications'|'exactAlarm'|'battery')`. Battery opens `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, the settings list, which is Play-policy safe.
  - `sendTestNotification()`, `clearAll()` (clears the store, cancels the alarm and dismisses the notification).
- **Manifest:**
  - Permissions: `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`.
  - Receivers: `.reminders.ReminderReceiver` (exported false) and `.reminders.SystemEventsReceiver` with the intent filters.
  - Remove the old receivers.
- **JS wrapper:** `src/native/reminders.ts` gives typed wrappers: `syncReminderSnapshot(items: {topicName:string; dueOn:LocalDate}[])`, `configureReminders(enabled, 'HH:MM')`, `getReminderStatus()`, `requestNotificationPermission()`, `openReminderSettings(kind)`, `sendTestNotification()`, `clearReminders()`. Each is a safe no-op when the module is missing (Jest).
- **Snapshot sync:** `useReminderSnapshotSync()` is mounted once in `MainTabs`. It subscribes to `useAgenda(60)`. After each successful fetch it maps items to `{topicName, dueOn}` and calls `syncReminderSnapshot`. When `me.settings` changes it calls `configureReminders(settings.dailyReminder, settings.reminderTime)`.

- [ ] **Step 1: Write failing JVM tests:**
  - `nextFireTime`: now 07:00 with an 08:00 setting gives today 08:00; now 08:00 exactly gives tomorrow; now 23:30 gives tomorrow.
  - `nextFireTime` DST gap: zone `America/New_York` on 2026-03-08 with setting 02:30 resolves to a valid instant after now.
  - `nextFireTime` after a timezone change: the same wall clock in `Asia/Kolkata` gives that local 08:00.
  - `compose`: empty → null; only future items → null; 2 due today + 1 overdue + 1 future gives title `"3 revisions due today · 1 overdue"` with 3 names; 5 due gives a body ending with `"…"`.
  - `shouldShowMissed`: true after the fire time when `lastShownDate` was yesterday; false when `lastShownDate` is today; false before the fire time.
- [ ] **Step 2: Write the failing JS test.** `useReminderSnapshotSync` calls `syncReminderSnapshot` with the mapped agenda items after the fetch resolves, and calls `configureReminders(true,'08:00')` from me settings.
- [ ] **Step 3: Run** `./gradlew testDebugUnitTest` (if the SDK is available) and `npm test --prefix apps/mobile -- useReminderSnapshotSync`. Expected: FAIL.
- [ ] **Step 4: Implement.** Keep `ReminderScheduler` and `ReminderContent` free of Android imports in their pure functions, so the JVM tests run without Robolectric.
- [ ] **Step 5: Run** the tests. Expected: PASS. Run `./gradlew assembleDebug` if available. Typecheck and lint clean.
- [ ] **Step 6: Commit:** `feat(mobile): native daily reminder rewrite with reboot/timezone restore`.

---

### Task 8: First-run setup (onboarding)

**Files:**
- Create: `src/features/onboarding/{OnboardingNavigator.tsx,ExamStep.tsx,IntervalsStep.tsx,RemindersStep.tsx,TopicsStep.tsx}`
- Modify: `RootNavigator.tsx` (replace the placeholder)
- Test: `src/features/onboarding/__tests__/onboarding.test.tsx`

**Interfaces:**
- A stack of 4 steps (Google sign-in is step 1, already done) with a progress indicator: "Step N of 4".
- **ExamStep:**
  - Quick-pick chips "NEET SS" and "MS General Surgery", plus "Add your own" (a `TextField`) and an optional exam date (`DateField`).
  - **Next** creates the selected exams via `examsApi.create` (ignore `DUPLICATE_NAME`, since it already exists) and needs at least 1 exam.
  - Errors are inline and the selection is kept.
- **IntervalsStep:**
  - Explanatory copy: "After you study a topic, we remind you to revise it after these many days. Each gap grows so it sticks."
  - An editable interval list (pre-filled from `me.settings.intervals`) validated with shared `intervalsSchema`.
  - A live preview from shared `createSchedule(localToday(), intervals, …)` showing the dates.
  - **Next** runs `useUpdateMe({settings:{intervals}})`.
- **RemindersStep:**
  - A time picker (default `08:00`) and a "Daily reminder" switch (default on).
  - Three permission rows using `getReminderStatus()`:
    - Notifications: **Allow** calls `requestNotificationPermission`.
    - Exact alarms: **Allow** opens `openReminderSettings('exactAlarm')`.
    - Battery: **Unrestrict** opens `openReminderSettings('battery')`.
  - Each row shows ✓ or "Not allowed". Statuses re-check when the app returns to the foreground.
  - **Next** saves `settings.{reminderTime, dailyReminder, timezone}`, where timezone is `Intl.DateTimeFormat().resolvedOptions().timeZone` with fallback `'UTC'`. It's allowed even when permissions are missing, with a warning line.
- **TopicsStep:**
  - An embedded `TopicForm` in compact mode (subject: choose an existing one or type a new one, which is created on save; name; studied date defaulting to today; exam chips from the created exams).
  - **Add another** saves and clears the name only.
  - An "Added: N topics" counter.
  - **Finish** needs N ≥ 1 and PATCHes `onboardingCompleted: true`, then calls `refreshUser()` so the navigator moves to MainTabs.
  - **Skip for now** also PATCHes `onboardingCompleted: true`.
- Progress is persisted per step by the API calls themselves. Relaunching mid-setup restarts at ExamStep with existing exams pre-selected.

- [ ] **Step 1: Write failing tests** (mock `useApi`):
  - ExamStep **Next** with nothing selected is disabled; selecting "NEET SS" then Next calls `examsApi.create({name:'NEET SS'})`.
  - IntervalsStep `[4,4]` shows the validation error and disables Next; `[4,7,15]` shows a preview starting with today + 4.
  - TopicsStep **Finish** is disabled until one topic is added; Finish calls `meApi.update({onboardingCompleted:true})`.
  - RemindersStep renders "Not allowed" for denied notifications and calls `requestNotificationPermission` on Allow.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): first-run setup flow`.

---

### Task 9: Topics (list, form, detail)

**Files:**
- Create: `src/features/topics/{TopicsScreen.tsx,TopicForm.tsx,TopicFormScreen.tsx,TopicDetailScreen.tsx}`
- Test: `src/features/topics/__tests__/{TopicForm.test.tsx,TopicsScreen.test.tsx}`

**Interfaces:**
- **TopicsScreen:**
  - Search field (debounced 300 ms, which sets `q`), subject filter chips, exam filter chips, and a status toggle (Active/Completed).
  - A list of rows showing name, subject, next due `relativeDay`, and "R{n}/{total}".
  - FAB "+ Add topic" opens `TopicForm`.
  - Empty state: "No topics yet" with Add.
  - Pull-to-refresh.
- **TopicForm:**
  - Props: `{ mode: 'create'|'edit'; initial?: TopicView; compact?: boolean; onSaved(topic: TopicView): void }`.
  - Fields: name, subject (`ChipSelect` of existing subjects plus "+ New subject", which reveals a text field; the subject is created via `subjectsApi.create` on save, and a `DUPLICATE_NAME` response looks up the existing one by name), exams (multi `ChipSelect`), studied date (`DateField`, max today), custom intervals (collapsed "Advanced"; empty means use settings), notes.
  - Validate with shared `topicCreateSchema` before submitting, and show field errors under each field.
  - On API error, the form **keeps all values**, shows `ErrorRetry` and stays mounted.
  - Edit mode sends only the changed fields (`topicUpdateSchema`).
- **TopicFormScreen:** `TopicForm` in a stack screen.
  - After create it shows the snackbar `"{name} added — first revision {formatDate(nextDueOn)}"` and goes back.
  - After edit it shows "Saved" and goes back.
- **TopicDetailScreen:**
  - Header with name, subject and exams.
  - Notes.
  - A revision timeline listing every revision via `RevisionRow` (Task 10), with done ones ✓ showing `doneOn` and pending ones showing `dueOn`.
  - Actions: Edit and Delete. Delete asks for confirmation ("Delete topic? This removes its revision history."), then removes it, goes back, and shows a snackbar.

- [ ] **Step 1: Write failing tests:**
  - **Review Focus 2:** fill name, subject and date; the API rejects with `NETWORK`; the form is still rendered with the same values and shows "Can't reach the server — try again". Tapping Retry calls create again and `onSaved` fires.
  - Empty name → "Required"-style error from the schema and no API call.
  - Picking "+ New subject 'Surgery'" creates the subject and then the topic, with the new `subjectId`.
  - Edit mode with only notes changed sends a PATCH with `{notes}` only.
  - TopicsScreen with an empty list shows the "No topics yet" empty state.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): topics list, form and detail`.

---

### Task 10: Revisions UX (RevisionRow, Schedule, Home)

**Files:**
- Create: `src/features/revisions/RevisionRow.tsx`, `src/features/schedule/ScheduleScreen.tsx`, `src/features/home/HomeScreen.tsx`
- Test: `src/features/revisions/__tests__/RevisionRow.test.tsx`, `src/features/schedule/__tests__/ScheduleScreen.test.tsx`

**Interfaces:**
- **RevisionRow:**
  - Props: `{ topicId; topicName?; revision: RevisionView; isNextPending: boolean; isLastDone: boolean; total: number }`.
  - When `isNextPending` it shows **Done** and **Snooze 1 day**. When `isLastDone` it shows **Undo**. Otherwise it's display only.
  - **Done** sends `useCompleteRevision` with `doneOn = localToday()`, then shows the snackbar `"Revision {step} done"` with action **Undo**, which calls `useUndoRevision`.
  - **Snooze** sends `useSnoozeRevision(today, 1)` and then the snackbar "Snoozed to {formatDate}".
  - Errors show a snackbar with `userMessage(e)`. `VERSION_CONFLICT` and `REVISION_OUT_OF_ORDER` also refetch.
  - Buttons are disabled while their mutation is pending.
- **ScheduleScreen:**
  - `useAgenda(30)`, grouped into sections **Overdue**, **Today** and **Upcoming** (by `bucket`). Each item is a `RevisionRow` with `isNextPending: true` and a topic link to TopicDetail.
  - Filter chips by exam.
  - Empty state: "Nothing due — add topics or enjoy the break".
- **HomeScreen:**
  - Greeting with the user's first name.
  - Exam countdown for the nearest future `examDate` ("NEET SS in 42 days").
  - The **Today** card lists **all** overdue and today agenda items as `RevisionRow`s (no 6-item cap).
  - The **Coming up** card shows the next 5 upcoming.
  - A quick "+ Add topic" button.
  - The reminder banner when `getReminderStatus().notificationsEnabled === false`: "Reminders are off — Fix", which opens ReminderHealth.
  - The Pomodoro timer card (Task 11).

- [ ] **Step 1: Write failing tests:**
  - **Review Focus 3:** tap Done; `complete` is called with today; the snackbar appears; tapping Undo calls `undo(topicId, revisionId)`.
  - When `complete` rejects, an error snackbar shows `userMessage` and the row shows Done again (rollback through the Task 3 hook).
  - A non-next pending row has no Done button; a `isLastDone` row shows Undo.
  - ScheduleScreen renders the section headers Overdue, Today and Upcoming with the right items from a mocked agenda.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): actionable revisions on home, schedule and topic detail`.

---

### Task 11: Progress, mock tests and Pomodoro timer

**Files:**
- Create: `src/features/progress/{ProgressScreen.tsx,MockTestForm.tsx}`, `src/features/home/{PomodoroTimer.tsx,timerReducer.ts}`
- Test: `src/features/home/__tests__/timerReducer.test.ts`, `src/features/progress/__tests__/MockTestForm.test.tsx`

**Interfaces:**
- **ProgressScreen:**
  - Stat tiles from `useStats()`: topics, revisions done, pending, overdue, completed topics.
  - A by-subject list with counts as simple bars (plain Views).
  - The mock tests list (title, date, score/max, percent), with an "Add mock test" button that opens `MockTestForm`.
  - Swipe or long-press to delete, with confirmation.
- **MockTestForm:** title, date, score, max score and exam (optional chips), validated with shared `mockTestInputSchema`. Errors keep the draft, as in TopicForm.
- **Timer reducer:**
  - `timerReducer(state, action)` with state `{ status: 'idle'|'running'|'paused'; remainingMs; endsAt: number|null }`.
  - Actions: `start(now)`, `pause(now)`, `resume(now)`, `reset()` and `tick(now)`. `tick` makes `remainingMs = max(0, endsAt - now)` and becomes `idle` with `remainingMs = 25*60_000` when it reaches 0. It also reports `finished: true` once, through a returned flag on the state.
  - The default duration is 25 minutes.
  - Time is computed from timestamps, so it stays correct after the app is backgrounded.
- **PomodoroTimer:** shows `mm:ss` with Start, Pause, Resume and Reset. Finishing shows the snackbar "Focus session done — take a 5-minute break".

- [ ] **Step 1: Write failing tests:**
  - Reducer: start at t0 then tick at t0 + 60 s gives 24:00 remaining; pause at +60 s then tick at +120 s keeps 24:00; resume then tick past the end gives finished and reset.
  - MockTestForm: score 110 with max 100 shows the error under score and makes no API call.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): progress, mock tests and pomodoro timer`.

---

### Task 12: Settings, Reminder health, exam/subject management, backup, account

**Files:**
- Create: `src/features/settings/{SettingsScreen.tsx,ReminderHealthScreen.tsx,ManageExamsSubjectsScreen.tsx,BackupSection.tsx}`, `src/features/backup/{api.ts,hooks.ts}` (if not done in Task 3), `src/native/backupFiles.ts`
- Test: `src/features/settings/__tests__/{BackupSection.test.tsx,ReminderHealthScreen.test.tsx,SettingsScreen.test.tsx}`

**Interfaces:**
- **SettingsScreen sections:**
  - **Study:** revision intervals (editable, validated, with a preview), and "Manage exams & subjects".
  - **Reminders:** daily reminder switch, reminder time, and "Reminder health".
  - **Appearance:** theme System/Light/Dark.
  - **Backup.**
  - **Account:** email, Sign out, and Delete account.
  - Each setting saves on change via `useUpdateMe`. On failure it reverts the control and shows a snackbar.
- **ReminderHealthScreen:**
  - Rows from `getReminderStatus()`, refreshed on focus and foreground: Notifications, Exact alarms, Battery. Each shows ✓ or "Off — Fix", where Fix opens settings.
  - "Next reminder: {weekday, time}", or "Off" or "Nothing due".
  - A **Send test notification** button.
- **ManageExamsSubjectsScreen:**
  - Exams list with rename, date edit and delete (confirmation: "Topics keep existing; the exam is removed from them").
  - Subjects list with rename and delete. A `SUBJECT_IN_USE` response shows "Move or delete its topics first".
- **Backup files:** `backupFiles.ts`: `saveBackupFile(json: string): Promise<void>` and `pickBackupFile(): Promise<string>`, wrapping `BackupFiles.exportBackup/importBackup`. Cancel rejects with code `E_CANCELLED`, which the UI ignores silently.
- **BackupSection:**
  - **Export** runs `backupApi.export()`, then `saveBackupFile(JSON.stringify(data, null, 2))`, then the snackbar "Backup saved".
  - **Import** runs `pickBackupFile()`, then `JSON.parse` (invalid shows "This file is not a Study Planner backup"), then a mode choice with **Merge** (recommended) and **Replace everything**.
  - Replace shows the dialog "Export a backup first?" with **Export first**, **Continue without export** and **Cancel**. Export first runs the export flow, then continues.
  - Then it calls `backupApi.import(mode, data)` and shows the result: "Imported N topics (M skipped)".
- **Account:**
  - **Delete account** opens a confirmation dialog that requires typing `DELETE`. It then runs `meApi.remove()` and the local sign-out (AuthProvider).
  - **Sign out** runs `useAuth().signOut()`.

- [ ] **Step 1: Write failing tests:**
  - Import with Replace shows the export prompt; choosing Cancel does not call `backupApi.import`; choosing Continue calls `import('replace', data)`.
  - Invalid JSON shows the not-a-backup message.
  - Merge shows the "Imported 3 topics (1 skipped)" result text from a mocked response.
  - **Review Focus 5:** ReminderHealthScreen with `notificationsEnabled:false` shows "Off — Fix", and tapping Fix calls `openReminderSettings('notifications')`.
  - Delete account stays disabled until `DELETE` is typed, then calls `meApi.remove` and signOut.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Typecheck and lint clean.
- [ ] **Step 5: Commit:** `feat(mobile): settings, reminder health, exams/subjects management, backup and account`.

---

### Task 13: Docs, debug APK and device checklist

**Files:**
- Create: `apps/mobile/README.md`, `docs/superpowers/plans/2026-11-13-plan-2-device-checklist.md`
- Modify: root `README.md` (mobile section), `CLAUDE.md` (mobile commands, the native module list, the "never toISOString for dates" rule)

**Interfaces:**
- **`apps/mobile/README.md`:**
  - Prerequisites: JDK 17, Android SDK 37, Node ≥ 22.13.
  - Set `GOOGLE_WEB_CLIENT_ID` in `android/gradle.properties` or `-P`.
  - `npm install --prefix apps/mobile`, then `npm run android --prefix apps/mobile`.
  - Tests: Jest and Gradle unit tests.
  - Build a debug APK: `./gradlew assembleDebug`, output at `android/app/build/outputs/apk/debug/app-debug.apk`.
  - The architecture map from the file map above.
- **Device checklist:** spec §16 step 4, items 1–12, each as a checkbox with the exact steps and the expected result. The user runs it in Plan 3 after deploy.

- [ ] **Step 1: Run checks.** `npm test --prefix apps/mobile`, typecheck, lint, the root `npm test` (API and shared unaffected), and, if the SDK is available, `./gradlew testDebugUnitTest assembleDebug`. Record the APK path and size.
- [ ] **Step 2: Write the docs.**
- [ ] **Step 3: Commit:** `docs(mobile): README, device checklist and build instructions`.

---

## Done when
- The mobile Jest suite, typecheck and lint are clean, and the root `npm test` is still green.
- The Kotlin unit tests pass and the debug APK builds (or the report states the Android SDK wasn't available, with the commands to run).
- All 13 commits are on local `main`, and nothing is pushed.
- Hand-off lists:
  - the resolved library versions
  - any Gradle steps not run
  - what the user must provide for Plan 3: the Google Web and Android OAuth client IDs, and the SHA-1 of the debug and release keystores
