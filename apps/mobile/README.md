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
- `GOOGLE_WEB_CLIENT_ID` - the Google OAuth **Web** client ID (public; defaults
  to the project's client ID, override with `-P`).

```sh
./gradlew assembleDebug -PGOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
```

### Debug SHA-1 (for the Google Android OAuth client)

```sh
keytool -list -v -keystore android/app/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android
```
Note: `android/app/debug.keystore` is the standard, public React Native debug
key (well-known passwords), not a release key. It must never be used to sign a
release build; see [Release build](#release).


Register the SHA-1 and package `com.surgicalstudyplanner.app` as an Android
OAuth client in Google Cloud. The release key is covered in [Release build](#release).

## Release build

<a id="release"></a>

Release APKs are signed with an upload key that lives **outside the repo**.
Release builds never fall back to the debug keystore: without the signing
properties, `assembleRelease` fails with "Release signing not configured: see
apps/mobile/README.md#release".

1. Generate the key once (PowerShell or cmd), and keep it outside the repo
   with at least one backup (losing it means you cannot update the app):

   ```
   keytool -genkeypair -v -storetype PKCS12 -keystore D:keysstudyplanner-upload.jks -alias studyplanner -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Put these four properties in the USER-level Gradle file
   `C:/Users/<user>/.gradle/gradle.properties` (never in the repo):

   ```
   STUDYPLANNER_UPLOAD_STORE_FILE=D:/keys/studyplanner-upload.jks
   STUDYPLANNER_UPLOAD_STORE_PASSWORD=<store password>
   STUDYPLANNER_UPLOAD_KEY_ALIAS=studyplanner
   STUDYPLANNER_UPLOAD_KEY_PASSWORD=<key password>
   ```

3. Get the SHA-1 and add it as an **Android** OAuth client in Google Cloud
   (package `com.surgicalstudyplanner.app`), alongside the debug one:

   ```
   keytool -list -v -keystore D:keysstudyplanner-upload.jks -alias studyplanner
   ```

4. Build (JDK 17 and `ANDROID_HOME` exported):

   ```sh
   cd apps/mobile/android
   ./gradlew assembleRelease
   ```

   Output (one APK per ABI, no universal APK):
   - `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`
   - `android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk`

   Install arm64-v8a on almost all modern phones (armeabi-v7a is for old
   32-bit devices). Debug builds keep all ABIs.

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

- `app/` - `AppProviders`, `RootNavigator`, `MainTabs`, deep `linking`,
  `AppTheme` + `themeSync` (theme mode: kept on the device with AsyncStorage,
  read before the first render, synced to `PATCH /v1/me` in the background;
  the server value wins only when it changed elsewhere).
- `features/` - one folder per area: `agenda`, `auth`, `backup`, `exams`,
  `home` (Pomodoro), `me`, `onboarding` (first-run steps), `progress` (mock
  tests), `revisions`, `schedule`, `settings` (Settings, Reminder health,
  Manage exams/subjects, Backup section), `subjects`, `topics`. Most have
  `api.ts` (HTTP calls) and `hooks.ts` (TanStack Query) plus screens.
- `native/` - typed wrappers over the native modules.
- `shared/api` - http client, token store (Keychain), query client, errors.
  The query client runs queries and mutations even when the phone is offline
  (`networkMode: 'always'`), so they fail fast with a NETWORK error and the
  screen shows its error and Retry instead of a paused spinner.
- `shared/lib` - formatting, `useOnline`, `useAppForeground`,
  `useRefetchOnFocus`, `localPrefs` (AsyncStorage wrapper, mocked in
  `jest.setup.ts`).
- `shared/ui` - theme, `responsive.tsx`, Screen, Button, Dialog, Snackbar etc.
  Pushed stack screens get `StackHeader` (title + 48 dp back arrow, set via
  `options.title` in `RootNavigator`); forms call `useLeaveGuard(dirty)` to
  ask "Discard changes?" before unsaved input is lost.
- `test/testUtils.tsx` - test helpers (`mockHardwareBack()` stands in for the
  Android back button, which Jest's iOS BackHandler ignores).

Kotlin in `android/app/src/main/java/com/surgicalstudyplanner/app/`,
registered by `PlannerPackage`:

- `GoogleAuth` (`auth/`) - Google sign-in.
- `Reminders` (`reminders/`) - AlarmManager scheduling, notifications, boot,
  timezone and time-change receivers, snapshot store.
- `BackupFiles` (`backup/`) - save/open backup files via the system picker.
- `AppConfig` - exposes `API_BASE_URL` and `GOOGLE_WEB_CLIENT_ID`.
