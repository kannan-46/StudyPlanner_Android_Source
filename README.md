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

## Tests

```sh
npm test              # all workspaces
npm run typecheck
npm run lint
```

See `CLAUDE.md` for the repository layout and working rules.
