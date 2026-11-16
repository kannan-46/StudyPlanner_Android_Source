# Study Planner

A spaced-revision study planner. Add what you studied, and the app schedules
when to revise each topic (by default after 4, 7, 15, 30, 60 and 90 days),
tracks what is due today, and keeps mock-test scores. It consists of an
Android app and an Express + MongoDB API.

## Running the API locally

```sh
cp apps/api/.env.example apps/api/.env   # then fill in the values
npm install
npm run build:shared
npm run dev -w @planner/api
```

Set `DEV_GOOGLE_STUB=true` in `.env` to sign in locally with
`dev:<sub>:<email>` tokens. With the server running, `npm run smoke -w
@planner/api` exercises the main flow end to end.

## Mobile app

React Native Android app in `apps/mobile` (outside the npm workspace). See
`apps/mobile/README.md` for setup, build configuration (`API_BASE_URL`,
`GOOGLE_WEB_CLIENT_ID`), the debug SHA-1 and the architecture map. Debug APK:
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (about 158 MB),
built with `./gradlew assembleDebug`. On-device verification:
`docs/superpowers/plans/2026-11-13-plan-2-device-checklist.md`.

## Releasing an app update

The app is shared as an APK on GitHub Releases. On start (and when it comes
back to the foreground, at most every 6 hours) it calls the public
`GET /v1/app/version`. When the server's `latestVersionCode` is higher than the
installed `versionCode`, the app shows an "Update available" dialog with
**Download** and **Later** buttons, and Settings shows the update.
**Download** opens `APK_DOWNLOAD_URL`, which by default downloads the asset
named `StudyPlanner.apk` from the latest GitHub Release:
`https://github.com/kannan-46/StudyPlanner_Android_Source/releases/latest/download/StudyPlanner.apk`.

1. Raise `versionCode` and `versionName` in
   `apps/mobile/android/app/build.gradle` (for example `6` and `"4.2.0"`).
2. Build a release APK signed with the same key as before (see
   [Release build](apps/mobile/README.md#release)): from `apps/mobile/android`,
   run `./gradlew assembleRelease`.
3. On GitHub, create a new release with the tag `vX.Y.Z` (for example
   `v4.2.0`) and upload
   `apps/mobile/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk`
   renamed to exactly `StudyPlanner.apk`. Publish it as a normal release (not a
   draft or pre-release) so it becomes the "latest" one.
4. In Vercel, set `LATEST_VERSION_CODE` and `LATEST_VERSION_NAME` (and
   optionally `UPDATE_NOTES`) to the new release, then redeploy (no code change
   needed).

| Variable              | Default                                    | Meaning                                 |
| --------------------- | ------------------------------------------ | --------------------------------------- |
| `LATEST_VERSION_CODE` | `5`                                        | Newest `versionCode` (integer)          |
| `LATEST_VERSION_NAME` | `4.1.0`                                    | Shown to users, e.g. "Version 4.1.0"    |
| `APK_DOWNLOAD_URL`    | `StudyPlanner.apk` from the latest release | http(s) link opened by **Download**     |
| `UPDATE_NOTES`        | none                                       | Optional short text shown in the dialog |

All four are optional; a blank value uses the default.

## Tests

```sh
npm test              # all workspaces
npm run typecheck
npm run lint
```

See `CLAUDE.md` for the repository layout and working rules.
