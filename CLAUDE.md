# Study Planner

Spaced-revision study planner: a React Native Android app (Plan 2) and an
Express + MongoDB API deployed on Vercel.

## Layout

- `apps/api` - Express API (`@planner/api`), serverless entry `api/index.ts`.
- `packages/shared` - shared types, zod schemas and date/schedule logic
  (`@planner/shared`).
- `apps/mobile` - React Native app. Deliberately OUTSIDE the npm workspace:
  hoisting its dependencies to the root breaks the React Native Gradle
  `../node_modules` paths.
- Specs in `docs/superpowers/specs`, plans in `docs/superpowers/plans`.

## Global Constraints

- Work directly on `main`. No branches, no worktrees. Never `git push` until
  the Plan 3 deploy (Vercel deploys `main` on push and the current app depends
  on the live API). Never `git stash`. Never kill processes.
- Never modify `D:\incrix-classory-monorepo` (Classory).
- $0 total: only free and open-source dependencies.
- Prettier: semi, single quotes, printWidth 80, tabWidth 2, trailing commas
  `all`, arrowParens `avoid`, LF.
- Dates are `LocalDate` strings (`YYYY-MM-DD`), never `Date` instants. The
  client sends its local "today" / "doneOn". Default intervals
  `[4, 7, 15, 30, 60, 90]`, default reminder time `'08:00'`. Intervals: 1-20
  entries, integers 1-999, strictly increasing.
- Limits: 5,000 topics per user; topic names 1-200 chars, notes <= 2,000;
  exam/subject names 1-80; mock test titles 1-120, notes <= 1,000; snooze 1-30
  days; agenda range 1-90 days (default 30).
- Tokens: access = HS256 JWT, 7 days, issuer `studyplanner-api`, audience
  `studyplanner-mobile`, `sub` = userId. Refresh = 32 random bytes base64url,
  60 days, only the SHA-256 hex digest is stored.
- Database name `studyplanner` (env `MONGODB_DB`). Never touch the old `users`
  and `planners` collections in other databases.
- Error body: `{ error: { code, message, details? }, requestId }` plus an
  `X-Request-Id` header. Never leak stack traces or driver errors.
- Public base path on Vercel is `/api/server/*`, rewritten to `/*`.
- `@planner/shared` resolves at runtime through `packages/shared/dist` (CJS
  build); Jest, `tsx` and typecheck map it to `packages/shared/src`; Metro uses
  the `react-native` field (`src/index.ts`).

## Commands

- `npm install`, `npm run build:shared`
- `npm test` (root, all workspaces), `npm run typecheck`, `npm run lint`,
  `npm run format`
- API only: `npm test -w @planner/api -- <pattern>`. Run API tests only through
  npm (the script passes `--experimental-vm-modules`, which mongodb needs under
  Jest).
- `npm run dev -w @planner/api`, `npm run smoke -w @planner/api`
- Before deploying the API run `npm run check:cjs -w @planner/api`: it compiles
  to CommonJS and loads the entry with require(esm) disabled (as Vercel does).
  Dependencies must ship CJS (jose is pinned to 5.x for this reason; v6 is
  ESM-only). Vercel runs Node 22.x.

## Mobile (apps/mobile)

- Commands: `npm test --prefix apps/mobile [-- <pattern>]`,
  `npm run typecheck --prefix apps/mobile`, `npm run lint --prefix apps/mobile`.
  Gradle (from `apps/mobile/android`, JDK 17 + `ANDROID_HOME` exported):
  `./gradlew testDebugUnitTest assembleDebug`, then `./gradlew --stop`.
- Native modules (Kotlin, `PlannerPackage`): GoogleAuth, Reminders,
  BackupFiles, AppConfig. Mocked in `jest.setup.ts`.
- Build config: `API_BASE_URL` (defaults to the Vercel URL) and
  `GOOGLE_WEB_CLIENT_ID` via `-P` or `android/gradle.properties`.
- Never use `toISOString()` for dates (it converts to UTC and can shift the
  day); build `LocalDate` strings from local date parts or shared helpers.
- Responsive rule: layouts use the helpers in `src/shared/ui/responsive.tsx`,
  no fixed widths; they must hold on small phones and large font scales.
- RNTL v14: `render` and `fireEvent` are async, always `await` them.
- Test helpers live in `src/test/testUtils.tsx`.
