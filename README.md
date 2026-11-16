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
installed `versionCode`, the app shows an "update available" banner with a
**Download** button, and Settings shows the update.

1. Raise `versionCode` and `versionName` in `apps/mobile/android/app/build.gradle`
   and build a release APK signed with the same key as before.
2. Attach the APK to a new GitHub Release.
3. In Vercel, set the env vars below and redeploy (no code change needed).

| Variable              | Default                                        | Meaning                                    |
| --------------------- | ---------------------------------------------- | ------------------------------------------ |
| `LATEST_VERSION_CODE` | `5`                                            | Newest `versionCode` (integer)             |
| `LATEST_VERSION_NAME` | `4.1.0`                                        | Shown to users, e.g. "Version 4.1.0"       |
| `APK_DOWNLOAD_URL`    | the repository's GitHub Releases `latest` page | http(s) link opened by **Download**        |
| `UPDATE_NOTES`        | none                                           | Optional short text shown under the banner |

All four are optional; a blank value uses the default.

## Tests

```sh
npm test              # all workspaces
npm run typecheck
npm run lint
```

See `CLAUDE.md` for the repository layout and working rules.
