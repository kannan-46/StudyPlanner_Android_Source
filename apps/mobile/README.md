# Study Planner mobile app

Bare React Native 0.88 (React 19.3) Android app. It lives outside the root npm
workspace on purpose: hoisting its dependencies breaks the React Native Gradle
`../node_modules` paths. `@planner/shared` is linked via
`file:../../packages/shared`.

## Prerequisites

- JDK 17
- Android SDK 37 (platform + build tools), `ANDROID_HOME` set
- Node >= 22.13

## Setup and run

```sh
npm install --prefix apps/mobile
npm run android --prefix apps/mobile    # needs a device/emulator and Metro
```

### Build configuration

Two values are baked into `BuildConfig`, set either in
`android/gradle.properties` or with `-P` on the Gradle command line:

- `API_BASE_URL` - defaults to the Vercel deployment
  `https://studyplannerandroidsource-server.vercel.app/api/server`.
- `GOOGLE_WEB_CLIENT_ID` - the Google OAuth **Web** client ID (empty by
  default; Google sign-in does not work until it is set).

```sh
./gradlew assembleDebug -PGOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
```

### Debug SHA-1 (for the Google Android OAuth client)

```sh
keytool -list -v -keystore android/app/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android
```

Register the SHA-1 and package `com.surgicalstudyplanner.app` as an Android
OAuth client in Google Cloud. A release keystore (and its SHA-1) comes in
Plan 3.

## Tests

```sh
npm test --prefix apps/mobile            # Jest (React Native Testing Library v14)
npm run typecheck --prefix apps/mobile
npm run lint --prefix apps/mobile
cd apps/mobile/android && ./gradlew testDebugUnitTest   # Kotlin unit tests
```

RNTL v14: `render` and `fireEvent` are async, always `await` them. Shared test
helpers are in `src/test/testUtils.tsx`.

## Debug APK

```sh
cd apps/mobile/android
export JAVA_HOME=<jdk17> ANDROID_HOME=<sdk>
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (about 158 MB: a
debug build with all ABIs and no minification). Install with
`adb install -r app-debug.apk`, then run
`docs/superpowers/plans/2026-11-13-plan-2-device-checklist.md`.

## Architecture

JS in `src/`:

- `app/` - `AppProviders`, `RootNavigator`, `MainTabs`, deep `linking`.
- `features/` - one folder per area: `agenda`, `auth`, `backup`, `exams`,
  `home` (Pomodoro), `me`, `onboarding` (first-run steps), `progress` (mock
  tests), `revisions`, `schedule`, `settings` (Settings, Reminder health,
  Manage exams/subjects, Backup section), `subjects`, `topics`. Most have
  `api.ts` (HTTP calls) and `hooks.ts` (TanStack Query) plus screens.
- `native/` - typed wrappers over the native modules.
- `shared/api` - http client, token store (Keychain), query client, errors.
- `shared/lib` - formatting, `useOnline`, `useAppForeground`,
  `useRefetchOnFocus`.
- `shared/ui` - theme, `responsive.tsx`, Screen, Button, Dialog, Snackbar etc.
- `test/testUtils.tsx` - test helpers.

Kotlin in `android/app/src/main/java/com/surgicalstudyplanner/app/`,
registered by `PlannerPackage`:

- `GoogleAuth` (`auth/`) - Google sign-in.
- `Reminders` (`reminders/`) - AlarmManager scheduling, notifications, boot,
  timezone and time-change receivers, snapshot store.
- `BackupFiles` (`backup/`) - save/open backup files via the system picker.
- `AppConfig` - exposes `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`.
