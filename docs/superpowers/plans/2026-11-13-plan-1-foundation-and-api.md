# Plan 1: Foundation + API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into a Classory-style workspace. Build `packages/shared` (dates, the move-forward schedule, zod schemas, error codes) and a complete multi-user Express + MongoDB API with Google sign-in, ready for Vercel.

**Architecture:**
- An npm workspace containing `apps/api` and `packages/shared`.
- `apps/mobile` sits beside them but outside the workspace, because hoisting breaks React Native's Gradle paths. It links shared with `file:`, the way Classory does.
- The API is built with `createApp(deps)` and dependency injection (db getter, Google verifier, clock, config), so every module is tested with supertest against `mongodb-memory-server`.
- Modules follow Classory's layout: `routes → controller → service → repository`. Every repository query is scoped by `userId`.

**Tech Stack:**
- Node ≥ 22.13, TypeScript (strict), Express 5, the official `mongodb` driver 7, zod 4, jose 6.
- `google-auth-library`, helmet 8, express-rate-limit 8.
- Jest 30 + ts-jest, supertest, mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-11-13-study-planner-rebuild-design.md`. Read §5–§8, §11, §12, §14a and §14b before starting.

**Later plans:**
- Plan 2 covers the mobile app and native reminders.
- Plan 3 covers deploy, Google OAuth setup, publishing and the release APK.

## Global Constraints

- **Branch:** all work happens directly on `main`. Never create branches or worktrees. **Never `git push`**: Vercel deploys `main` on push and the current app depends on the live API. Plan 3 does the first push together with the Vercel Root Directory switch.
- **Git safety:** guard every git command that moves state with `set -eu` and `git -C /d/StudyPlanner_Android_Source`. Never run `git stash`. Never kill processes.
- **Never modify `D:\incrix-classory-monorepo`.**
- **$0 total.** Only free and open-source dependencies.
- **Formatting:** prettier `{ semi: true, singleQuote: true, printWidth: 80, tabWidth: 2, trailingComma: 'all', bracketSpacing: true, arrowParens: 'avoid', endOfLine: 'lf' }`.
- **Dates:**
  - Calendar dates are `LocalDate` strings in `YYYY-MM-DD` form, never `Date` instants. The client sends its local "today" or "doneOn".
  - Default intervals are `[4, 7, 15, 30, 60, 90]`. The default reminder time is `'08:00'`.
  - Intervals have 1–20 entries, each an integer 1–999, strictly increasing.
- **Limits:**
  - 5,000 topics per user. Topic names 1–200 chars, notes ≤ 2,000 chars, exam and subject names 1–80 chars.
  - Mock test titles 1–120 chars, notes ≤ 1,000 chars.
  - Snooze is 1–30 days. The agenda range is 1–90 days (default 30).
- **Tokens:**
  - Access tokens are HS256 JWTs valid for 7 days (changed from 15 minutes on 2026-11-13 by user decision), with issuer `studyplanner-api`, audience `studyplanner-mobile` and `sub` = userId.
  - Refresh tokens are 32 random bytes in base64url, valid for 60 days. Only their SHA-256 hex digest is stored.
- **Database name:** `studyplanner` by default (env `MONGODB_DB`). Never touch the old `users` and `planners` collections in other databases.
- **Error body:** always `{ error: { code, message, details? }, requestId }`, plus an `X-Request-Id` header. Never leak stack traces or driver errors.
- **Public base path on Vercel:** `/api/server/*`, rewritten to `/*` (keep the current `vercel.json` route).
- **Test commands:**
  - All: `npm test` (root).
  - Single: `npm test -w @planner/shared -- <pattern>` or `npm test -w @planner/api -- <pattern>`.
  - Also `npm run typecheck` and `npm run lint`.
- **Shared package resolution:**
  - The API's runtime resolves `@planner/shared` through `node_modules`, at `packages/shared/dist`, a CommonJS build.
  - Jest, `tsx` and typecheck map it to `packages/shared/src`.
  - Metro (Plan 2) uses the package's `"react-native": "src/index.ts"` field.
  - This is a small builder deviation from spec §5. Vercel's Node builder does not transpile TypeScript inside `node_modules`.

## Review Focus

These failure modes are likely to bite a real user, and each is pinned by a test in the task that owns it:
1. **Malformed IDs in the URL.** `/v1/topics/abc` or a wrong-length hex must return 404 `NOT_FOUND`, not a 500 from the BSON parser. Tested in Task 8.
2. **Double-tapped Done.** Two concurrent `complete` requests on the same revision must advance the chain once: one gets 200, the other gets 409 `REVISION_OUT_OF_ORDER`. Tested in Task 9 (topic `version` field with a conditional update).
3. **Atlas unreachable or paused.** `/health` returns 503 with `status: 'degraded'` within about 3 s. Other routes return 503 `SERVICE_UNAVAILABLE` and never hang. Tested in Task 4.
4. **Shrinking intervals below completed revisions.** Editing a topic with 3 done revisions to intervals `[4, 7]` must be rejected with 400 `VALIDATION_FAILED`, not silently drop history. Tested in Task 8.
5. **Near-duplicate names.** `"Surgery "`, `"surgery"` and `"Surgery  "` are the same subject or exam and return 409 `DUPLICATE_NAME`. Tested in Task 7.

---

## File map (end state of this plan)

```
package.json                     workspaces ["apps/api","packages/*"]; scripts test/typecheck/lint/build:shared
tsconfig.base.json  .prettierrc  .prettierignore  eslint.config.mjs  .gitignore  .editorconfig
CLAUDE.md  README.md
docs/superpowers/{specs,plans}/  (old specs/plans moved here)
packages/shared/
  package.json  tsconfig.json  tsconfig.build.json  jest.config.js
  src/index.ts
  src/domain/dates.ts            src/domain/__tests__/dates.test.ts
  src/domain/schedule.ts         src/domain/__tests__/schedule.test.ts
  src/errors/codes.ts
  src/schemas/common.ts  settings.ts  auth.ts  exams.ts  subjects.ts  topics.ts  mockTests.ts  agenda.ts  backup.ts
  src/schemas/__tests__/schemas.test.ts  backup.test.ts
  src/types/views.ts             (response shapes shared with mobile)
apps/api/
  package.json  tsconfig.json  jest.config.js  vercel.json  .env.example
  api/index.ts                   Vercel entry
  scripts/smoke.mjs              (replaces verify-vercel.mjs)
  src/load-env.ts  src/server.ts  src/app.ts
  src/config/env.ts
  src/core/db/mongo.ts  src/core/db/indexes.ts  src/core/db/ids.ts
  src/core/errors/app-error.ts
  src/core/middleware/{request-id,error-handler,require-auth,validate}.ts
  src/core/http/async-handler.ts
  src/core/deps.ts               AppDeps type
  src/test/harness.ts
  src/modules/health/…  auth/…  me/…  exams/…  subjects/…  topics/…  agenda/…  stats/…  mockTests/…  backup/…  pages/…
apps/mobile/                     (moved, untouched until Plan 2; ios/ removed)
```

Module file pattern: `src/modules/<m>/<m>.routes.ts`, `<m>.controller.ts`, `<m>.service.ts`, `<m>.repository.ts`, `__tests__/<m>.test.ts`. Small modules may merge controller into routes; the service and repository always stay separate.

---

### Task 1: Restructure the repo, set up workspace tooling, add the shared package and its dates domain

**Files:**
- Move:
  - `SurgicalStudyPlannerReactNative/server` → `apps/api`
  - `SurgicalStudyPlannerReactNative/mobile` → `apps/mobile`
  - `SurgicalStudyPlannerAndroid/docs/superpowers/specs/*` → `docs/superpowers/specs/`
  - `SurgicalStudyPlannerAndroid/docs/superpowers/plans/*` → `docs/superpowers/plans/`
- Delete:
  - `SurgicalStudyPlannerAndroid/` (rest), `reports/`, `research_notes/`, `apps/mobile/ios/`
  - `SurgicalStudyPlannerReactNative/{README.md,HOSTING.md}` and the now-empty `SurgicalStudyPlannerReactNative/`
- Create:
  - root `package.json`, `tsconfig.base.json`, `.prettierrc`, `.prettierignore`, `eslint.config.mjs`, `.editorconfig`
  - `packages/shared/{package.json,tsconfig.json,tsconfig.build.json,jest.config.js,src/index.ts,src/domain/dates.ts}`
- Modify: root `.gitignore` (add `node_modules/`, `dist/`, `.env`, `coverage/`, `*.log`, `.kotlin/`)
- Test: `packages/shared/src/domain/__tests__/dates.test.ts`

**Interfaces:**
- Produces, from `@planner/shared`:
  - `type LocalDate = string`
  - `isLocalDate(value: unknown): value is LocalDate`: true only for a real calendar date in `YYYY-MM-DD` form
  - `addDays(date: LocalDate, days: number): LocalDate`
  - `compareDates(a: LocalDate, b: LocalDate): -1 | 0 | 1`
  - `daysBetween(from: LocalDate, to: LocalDate): number`: to − from in days
  - `localToday(now?: Date): LocalDate`: uses the device's local date fields
  - `maxDate(a: LocalDate, b: LocalDate): LocalDate`

- [ ] **Step 1: Move and delete with git** (`git mv` and `git rm -r`), then confirm `git status` shows renames for `apps/api` and `apps/mobile`.

- [ ] **Step 2: Create the root `package.json`**

  `{"name":"studyplanner","private":true,"workspaces":["apps/api","packages/*"],"engines":{"node":">=22.13.0"}}` with these scripts:
  - `"test": "npm run test --workspaces --if-present"`
  - `"typecheck": "npm run typecheck --workspaces --if-present"`
  - `"lint": "eslint ."`
  - `"format": "prettier --write ."`
  - `"build:shared": "npm run build -w @planner/shared"`

  Root devDependencies: `typescript`, `prettier`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `jest`, `ts-jest`, `@types/jest`.

  Add `"_comment"` explaining that `apps/mobile` is deliberately outside the workspace, because hoisting breaks RN Gradle `../node_modules` paths.

- [ ] **Step 3: Create the base configs**
  - `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `target ES2022`, `module commonjs`, `moduleResolution node`.
  - `.prettierrc`: exactly the Global Constraints value.
  - `eslint.config.mjs`: flat config using `typescript-eslint` recommended + `eslint-config-prettier`. Ignore `**/dist`, `**/node_modules`, `apps/mobile/**` (mobile keeps its own config).

- [ ] **Step 4: Scaffold `packages/shared`**
  - `package.json`: `name "@planner/shared"`, `main "dist/index.js"`, `types "dist/index.d.ts"`, `"react-native": "src/index.ts"`, dependency `zod`, scripts `build: tsc -p tsconfig.build.json`, `test: jest`, `typecheck: tsc -p tsconfig.json --noEmit`.
  - `jest.config.js`: `preset: 'ts-jest'`, `testEnvironment: 'node'`, `testMatch: ['**/__tests__/**/*.test.ts']`.

- [ ] **Step 5: Write the failing test `dates.test.ts`**

```ts
describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2023-02-29')).toBe(false);
    expect(isLocalDate('2024-2-9')).toBe(false);
    expect(isLocalDate('2024-13-01')).toBe(false);
    expect(isLocalDate(20240101)).toBe(false);
  });
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-11-01', 4)).toBe('2026-11-05');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('compares and diffs', () => {
    expect(compareDates('2026-11-05', '2026-11-12')).toBe(-1);
    expect(compareDates('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysBetween('2026-11-05', '2026-11-12')).toBe(7);
    expect(maxDate('2026-11-05', '2026-11-12')).toBe('2026-11-12');
  });
  it('localToday uses local date fields', () => {
    expect(localToday(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13');
  });
});
```

- [ ] **Step 6: Run** `npm install` at the root, then `npm test -w @planner/shared -- dates`. Expected: FAIL (module not found).

- [ ] **Step 7: Implement `src/domain/dates.ts` and export it from `src/index.ts`.** Do the arithmetic on `Date.UTC(y, m-1, d)` so DST never shifts a day.

- [ ] **Step 8: Run** `npm test -w @planner/shared -- dates`, `npm run typecheck`, `npm run lint`. Expected: all PASS or clean. (Old `apps/api` sources may fail typecheck at this point. Give `apps/api/package.json` a temporary `typecheck` script that does nothing, `"echo skipped until Task 4"`. Task 4 replaces it.)

- [ ] **Step 9: Commit:** `chore: restructure into workspace with shared dates domain`.

---

### Task 2: Move-forward schedule domain (`packages/shared/src/domain/schedule.ts`)

**Files:**
- Create: `packages/shared/src/domain/schedule.ts`; export it from `src/index.ts`
- Test: `packages/shared/src/domain/__tests__/schedule.test.ts`

**Interfaces:**
- Consumes the Task 1 dates functions.
- Produces:

```ts
export interface RevisionState {
  id: string; step: number;            // step = 1-based index into intervals
  dueOn: LocalDate; doneOn: LocalDate | null; dueOverride: LocalDate | null;
}
export interface ScheduleInput {
  studiedOn: LocalDate; intervals: number[]; revisions: RevisionState[];
}
export interface ScheduleResult {
  revisions: RevisionState[]; nextDueOn: LocalDate | null;
  status: 'active' | 'completed';
}
export type ScheduleErrorCode =
  | 'REVISION_NOT_FOUND' | 'REVISION_OUT_OF_ORDER' | 'VALIDATION_FAILED';
export class ScheduleError extends Error { constructor(public code: ScheduleErrorCode, message: string) }
export function rebuildSchedule(input: ScheduleInput): ScheduleResult;
export function createSchedule(studiedOn: LocalDate, intervals: number[], makeId: () => string): ScheduleResult;
export function reconcileSchedule(current: ScheduleInput, next: { studiedOn: LocalDate; intervals: number[] }, makeId: () => string): ScheduleResult;
export function completeRevision(input: ScheduleInput, revisionId: string, doneOn: LocalDate): ScheduleResult;
export function undoRevision(input: ScheduleInput, revisionId: string): ScheduleResult;
export function snoozeRevision(input: ScheduleInput, revisionId: string, today: LocalDate, days: number): ScheduleResult;
```

**Rules** (algorithm from spec §8 plus §14b; decided here):
- `rebuildSchedule`: process revisions sorted by `step`.
  - `base` is `studiedOn` for step 1, otherwise the previous revision's `doneOn ?? dueOn`.
  - `gap` is `intervals[0]` for step 1, otherwise `intervals[i] - intervals[i-1]`.
  - `dueOn = dueOverride ?? addDays(base, gap)`.
  - `nextDueOn` is the `dueOn` of the first revision without `doneOn`, or null. `status` is `'completed'` when every revision is done.
- `completeRevision`:
  - The target must be the first pending revision; otherwise `REVISION_OUT_OF_ORDER`.
  - `doneOn` must be ≥ the previous step's `doneOn` (or ≥ `studiedOn` for step 1); otherwise `VALIDATION_FAILED`. Completing early, before `dueOn`, is allowed.
- `undoRevision`: the target must be the done revision with the highest step; otherwise `REVISION_OUT_OF_ORDER`. Clear its `doneOn`, and clear `dueOverride` on every later revision.
- `snoozeRevision`: the target must be the first pending revision. `days` must be an integer 1–30; otherwise `VALIDATION_FAILED`. Sets `dueOverride = addDays(today, days)`.
- `reconcileSchedule`:
  - New intervals with fewer entries than the number of done revisions → `VALIDATION_FAILED`.
  - Keep revisions with a matching `step` (their `id` and `doneOn`). Create new ones for added steps and drop extra pending steps.
  - Rebuild, keeping a pending revision's `dueOverride` only while it is still later than the recomputed date (steps are restored in order, rebuilding after each, so later steps count from a kept date); otherwise clear it.
- An unknown `revisionId` → `REVISION_NOT_FOUND`. All functions are pure and return new arrays.

- [ ] **Step 1: Write the failing tests** with a counter-based `makeId`:

```ts
const ids = () => { let n = 0; return () => `r${++n}`; };
it('creates the spec example schedule', () => {
  const s = createSchedule('2026-11-01', [4, 7, 15, 30], ids());
  expect(s.revisions.map(r => r.dueOn)).toEqual(['2026-11-05','2026-11-08','2026-11-16','2026-12-01']);
  expect(s.nextDueOn).toBe('2026-11-05'); expect(s.status).toBe('active');
});
it('moves the chain forward from a late completion (spec §8)', () => {
  const s = createSchedule('2026-11-01', [4, 7, 15, 30], ids());
  const r = completeRevision(s_input(s), 'r1', '2026-11-12');
  expect(r.revisions.map(x => x.dueOn)).toEqual(['2026-11-05','2026-11-15','2026-11-23','2026-12-08']);
  expect(r.nextDueOn).toBe('2026-11-15');
});
it('pulls the chain earlier on early completion', () => {
  const r = completeRevision(input0(), 'r1', '2026-11-03');
  expect(r.revisions[1]!.dueOn).toBe('2026-11-06');
});
it('rejects out-of-order complete and undo', () => {
  expect(() => completeRevision(input0(), 'r2', '2026-11-12')).toThrow(expect.objectContaining({ code: 'REVISION_OUT_OF_ORDER' }));
  // r1, r2 done → undo r1 rejected, undo r2 allowed
});
it('rejects doneOn before the previous completion or study date', () => {
  expect(() => completeRevision(input0(), 'r1', '2026-10-31')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});
it('undo restores the original chain and clears later overrides', () => { /* complete r1 late, snooze r2, undo r1 → dueOn back to 05/08/16/01-12, r2.dueOverride null */ });
it('snooze counts from today, not the old due date', () => {
  const r = snoozeRevision(input0(), 'r1', '2026-11-20', 1);   // r1 was due 11-05 (overdue)
  expect(r.revisions[0]!.dueOn).toBe('2026-11-21');
  expect(r.revisions[1]!.dueOn).toBe('2026-11-24');            // chain follows override (+3)
});
it('marks completed when all done and nextDueOn null', () => { /* complete all four in order */ });
it('reconcile keeps done history by step, rejects shrinking below done count', () => {
  // r1..r3 done; reconcile to [4,7] → VALIDATION_FAILED; reconcile to [4,7,15,30,60] → 5 revisions, r1..r3 doneOn kept, r5 new id
});
it('reconcile with a new studiedOn recomputes pending dates and clears overrides', () => { /* … */ });
```

  (`s_input` and `input0` are small helpers in the test file that build `ScheduleInput` from a result.)

- [ ] **Step 2: Run** `npm test -w @planner/shared -- schedule`. Expected: FAIL.
- [ ] **Step 3: Implement `schedule.ts`** following the Rules above.
- [ ] **Step 4: Run** `npm test -w @planner/shared`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(shared): move-forward revision schedule domain`.

---

### Task 3: Shared error codes, zod schemas and view types

**Files:**
- Create:
  - `packages/shared/src/errors/codes.ts`
  - `src/schemas/{common,settings,auth,exams,subjects,topics,mockTests,agenda}.ts`
  - `src/types/views.ts`
  - export everything from `src/index.ts`
- Test: `packages/shared/src/schemas/__tests__/schemas.test.ts`

**Interfaces (produces):**

```ts
// errors/codes.ts
export const ERROR_CODES = {
  UNAUTHENTICATED:      { status: 401, message: 'Please sign in again.' },
  TOKEN_EXPIRED:        { status: 401, message: 'Your session expired.' },
  GOOGLE_TOKEN_INVALID: { status: 401, message: 'Google sign-in could not be verified.' },
  VALIDATION_FAILED:    { status: 400, message: 'Some fields are invalid.' },
  NOT_FOUND:            { status: 404, message: 'Not found.' },
  DUPLICATE_NAME:       { status: 409, message: 'That name already exists.' },
  SUBJECT_IN_USE:       { status: 409, message: 'This subject still has topics.' },
  REVISION_OUT_OF_ORDER:{ status: 409, message: 'Revisions must be done in order.' },
  LIMIT_EXCEEDED:       { status: 422, message: 'You have reached the limit.' },
  BACKUP_INVALID:       { status: 400, message: 'This backup file is not valid.' },
  RATE_LIMITED:         { status: 429, message: 'Too many requests. Try again shortly.' },
  SERVICE_UNAVAILABLE:  { status: 503, message: 'The server is waking up. Try again.' },
  INTERNAL:             { status: 500, message: 'Something went wrong.' },
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;
export interface ApiErrorBody { error: { code: ErrorCode; message: string; details?: unknown }; requestId: string }
```

Schemas (zod 4). Each exports the schema plus `type X = z.infer<…>`:
- **common:** `localDateSchema` (refine `isLocalDate`), `objectIdSchema` (`/^[a-f\d]{24}$/i`), `nameSchema(max)` (trim, collapse inner whitespace, 1..max), `intervalsSchema` (int 1–999, 1–20 entries, strictly increasing, message "Intervals must increase, e.g. 4, 7, 15"), `timeSchema` (`/^([01]\d|2[0-3]):[0-5]\d$/`), and `nameKey(name: string): string` (trim, collapse whitespace, lowercase).
- **settings:** `settingsSchema = { intervals, reminderTime: timeSchema, timezone: string 1..64, theme: 'system'|'light'|'dark', dailyReminder: boolean }`. Also `DEFAULT_SETTINGS = { intervals:[4,7,15,30,60,90], reminderTime:'08:00', timezone:'UTC', theme:'system', dailyReminder:true }` and `updateMeSchema = { name?: nameSchema(80), settings?: settingsSchema.partial(), onboardingCompleted?: true }`.
- **auth:** `googleSignInSchema = { idToken: string min 1, deviceLabel?: string max 80 }` and `refreshSchema = logoutSchema = { refreshToken: string min 20 max 200 }`.
- **exams:** `examInputSchema = { name: nameSchema(80), examDate?: localDate | null }`, `examUpdateSchema = examInputSchema.partial()`.
- **subjects:** `subjectInputSchema = { name: nameSchema(80) }`.
- **topics:**
  - `topicCreateSchema = { name: nameSchema(200), subjectId: objectId, examIds: objectId[] max 10 default [], studiedOn: localDate, intervals?: intervalsSchema, notes: string max 2000 default '' }`
  - `topicUpdateSchema` = all fields optional, at least one key
  - `topicListQuerySchema = { examId?, subjectId?, q?: string max 100, status?: 'active'|'completed' }`
  - `completeRevisionSchema = { doneOn: localDate }`, `snoozeRevisionSchema = { today: localDate, days: int 1..30 default 1 }`
- **mockTests:** `mockTestInputSchema = { title: nameSchema(120), takenOn: localDate, score: number ≥0, maxScore: number >0, examId?: objectId | null, notes: string max 1000 default '' }`, with a refine that score ≤ maxScore (path `score`). `mockTestUpdateSchema` = partial with the same refine applied when both are present.
- **agenda:** `agendaQuerySchema = { today: localDate, days: coerce int 1..90 default 30 }`, `statsQuerySchema = { today: localDate }`.

`types/views.ts` (all ids are strings):
- `UserView { id, email, name, avatarUrl: string|null, onboardingCompletedAt: string|null, settings: Settings }`
- `AuthResponse { accessToken, refreshToken, user: UserView }`
- `ExamView { id, name, examDate: LocalDate|null }`
- `SubjectView { id, name, topicCount: number }`
- `RevisionView = RevisionState`
- `TopicView { id, name, subjectId, examIds: string[], studiedOn, intervals, notes, revisions: RevisionView[], nextDueOn: LocalDate|null, status, createdAt, updatedAt }`
- `AgendaItem { topicId, topicName, subjectId, subjectName, revisionId, step, totalSteps, dueOn, bucket: 'overdue'|'today'|'upcoming' }`
- `StatsView { topics: number, activeTopics, completedTopics, revisionsDone, revisionsPending, overdue, dueToday, bySubject: {subjectId,name,topicCount}[], byExam: {examId,name,topicCount}[] }`
- `MockTestView { id, title, takenOn, score, maxScore, percent: number /* 1 decimal */, examId: string|null, notes }`

- [ ] **Step 1: Write failing tests:**
  - `intervalsSchema` accepts `[4,7,15]` and rejects `[4,4]`, `[7,4]`, `[]`, 21 entries, `[0]` and `[1000]`.
  - `nameKey(' Gen  Surgery ') === 'gen surgery'`, and `nameSchema(80)` returns the collapsed `'Gen Surgery'`.
  - `localDateSchema` rejects `'2023-02-29'`.
  - The mock test refine rejects score 110 / max 100 at path `['score']`.
  - `topicUpdateSchema` rejects `{}`.
  - `snoozeRevisionSchema` defaults days to 1 and rejects 31.
  - Every `ERROR_CODES` entry has a status between 400 and 599.
- [ ] **Step 2: Run** `npm test -w @planner/shared -- schemas`. Expected: FAIL.
- [ ] **Step 3: Implement the files listed above.**
- [ ] **Step 4: Run** `npm test -w @planner/shared && npm run build:shared`. Expected: PASS, with `packages/shared/dist/index.js` present.
- [ ] **Step 5: Commit:** `feat(shared): error codes, zod schemas and view types`.

---

### Task 4: API skeleton (config, db, errors, middleware, health, Vercel entry, test harness)

**Files:**
- Delete all old `apps/api/src/*` and `apps/api/scripts/*`, and `apps/api/public/`. Reusable parts are copied first: `createMemoizedInitializer` from `db.ts`, the helmet and rate-limit options from `api.ts`, and jose usage from `tokens.ts`.
- Create:
  - `apps/api/{package.json (rewrite),tsconfig.json (rewrite),jest.config.js,.env.example}`
  - `src/{load-env.ts,server.ts,app.ts}`, `src/config/env.ts`, `src/core/deps.ts`
  - `src/core/db/{mongo.ts,indexes.ts,ids.ts}`, `src/core/errors/app-error.ts`
  - `src/core/middleware/{request-id,error-handler,validate}.ts`, `src/core/http/async-handler.ts`
  - `src/modules/health/health.routes.ts`, `src/test/harness.ts`
- Modify: `apps/api/api/server.ts` → rename to `apps/api/api/index.ts`, and update `vercel.json`.
- Test: `src/modules/health/__tests__/health.test.ts`, `src/core/__tests__/errors.test.ts`

**Interfaces:**
- **Package:** `apps/api/package.json` is named `@planner/api`, CommonJS (no `"type"`). Dependencies: `express`, `mongodb`, `zod`, `jose`, `helmet`, `express-rate-limit`, `google-auth-library`, `dotenv`, `@planner/shared: "*"`. devDependencies: `tsx`, `supertest`, `@types/supertest`, `@types/express`, `@types/node`, `mongodb-memory-server`. Scripts:
  - `dev: tsx watch src/server.ts`
  - `test: jest --runInBand`
  - `typecheck: tsc --noEmit`
  - `smoke: node scripts/smoke.mjs`
- **TypeScript and Jest:** `tsconfig.json` extends the base, with `paths: { "@planner/shared": ["../../packages/shared/src"] }` and `include ["src","api"]`. `jest.config.js` uses `moduleNameMapper { '^@planner/shared$': '<rootDir>/../../packages/shared/src' }` and `testTimeout 30000`.
- **Config:** `loadConfig(env: NodeJS.ProcessEnv): AppConfig` with fields `{ mongodbUri, mongodbDb (default 'studyplanner'), jwtSecret (≥32 bytes), googleWebClientId, port (default 3000), trustProxyHops (1 when env.VERCEL is set, else TRUST_PROXY_HOPS default 0), devGoogleStub: boolean, buildSha: string | null (env.VERCEL_GIT_COMMIT_SHA) }`.
  - Validate with zod. On failure, throw `Error('Invalid environment: <var names>')` without echoing values.
  - `DEV_GOOGLE_STUB=true` together with `VERCEL` set must throw.
- **Dependencies:** `interface AppDeps { config: AppConfig; getDb: () => Promise<Db>; googleVerifier: GoogleVerifier; now: () => Date }`, where `GoogleVerifier` is defined in Task 5. Define its type here as `(idToken: string) => Promise<GoogleIdentity>`.
- **App:** `createApp(deps: AppDeps): Express`:
  1. `trust proxy`, then `x-powered-by` off.
  2. helmet, then `requestId`, then `express.json({ limit: '1mb' })`.
  3. Routers.
  4. 404 handler → `NOT_FOUND`.
  5. `errorHandler`.
- **Errors:** `class AppError extends Error { constructor(code: ErrorCode, opts?: { message?: string; details?: unknown }) ; status: number }`.
  - `errorHandler` maps: `AppError` → its own status and code; `ZodError` → 400 `VALIDATION_FAILED` with `details: issues[{path,message}]`; `ScheduleError` → its code; body-parser `entity.too.large` → 413 `VALIDATION_FAILED`; `SyntaxError` from JSON → 400 `VALIDATION_FAILED`; anything else → 500 `INTERNAL`.
  - Unknown errors log only the name and requestId.
- **Validation:** `validate<T>(schema: ZodType<T>, source: 'body'|'query'|'params'): RequestHandler` stores the parsed value on `res.locals.input`.
- **Async:** `asyncHandler(fn)` forwards rejections to `next`.
- **Database:**
  - `createMongo(config): { getDb(): Promise<Db> }`. It caches one `MongoClient` (`maxPoolSize: 5`, `serverSelectionTimeoutMS: 5000`), uses `createMemoizedInitializer`, and runs `ensureIndexes(db)` once.
  - If the connection fails, it throws `AppError('SERVICE_UNAVAILABLE')`.
  - `ensureIndexes(db)` creates every index in spec §7. It is added to as modules land, but all are listed now so later tasks don't touch it: users `googleSub` unique and `email`; sessions `tokenHash` unique, `userId`, and TTL `expiresAt` with `expireAfterSeconds: 0`; exams `{userId,nameKey}` unique; subjects `{userId,nameKey}` unique; topics `{userId,nextDueOn}`, `{userId,subjectId}`, `{userId,updatedAt}`, and `{userId,legacyId}` unique and sparse; mockTests `{userId,takenOn:-1}`.
- **IDs:** `parseObjectId(id: string): ObjectId` throws `AppError('NOT_FOUND')` for invalid hex.
- **Health:** `GET /health` runs `db.command({ ping: 1 })` raced against a 3,000 ms timeout.
  - Healthy: 200 `{ status:'ok', db:'ok', build: { sha } , time }`.
  - Otherwise: 503 `{ status:'degraded', db:'unreachable', … }`.
- **Vercel entry:** `api/index.ts` imports `../src/load-env` first, then `export default createApp(productionDeps())`. `productionDeps()` lives in `src/core/deps.ts`: it uses `loadConfig(process.env)` and `createMongo`, plus `createGoogleVerifier` (stub until Task 5).
- **`vercel.json`:** keep `framework: null`, the `routes` rewrite and `outputDirectory: "public"`. Commit `public/.gitkeep` back, because Vercel needs the folder.
  - Change the function key to `"api/index.ts"` with `maxDuration: 10`.
  - Add `"buildCommand": "npm run build -w @planner/shared"` and `"installCommand": "npm install --prefix ../.. --workspaces --include-workspace-root"`. Plan 3 verifies these on a preview deploy.
- **Test harness** (`src/test/harness.ts`):
  - `startTestDb(): Promise<{ uri: string; stop(): Promise<void> }>`, using `MongoMemoryServer`.
  - `makeTestDeps(overrides?: Partial<AppDeps>): AppDeps`. It uses a fresh db name per test file, a fixed clock `new Date('2026-11-13T10:00:00Z')` and a fake verifier that accepts `'google:<sub>:<email>'`.
  - `signIn(app, sub?: string): Promise<AuthResponse>`. This throws until Task 5 implements it.

- [ ] **Step 1: Write failing tests.**
  - `health.test.ts` covers:
    - 200 ok against the memory DB.
    - 503 `degraded` within 4 s when `getDb` returns a db whose `command` never resolves.
    - An unknown route → 404 body `{error:{code:'NOT_FOUND'},requestId}` with an `X-Request-Id` header.
  - `errors.test.ts` mounts throwaway routes on `createApp` that throw `AppError('DUPLICATE_NAME')`, a `ZodError`, a plain `Error('db password=x')` and malformed JSON. Assert the statuses 409, 400, 500 and 400, that the 500 body does not contain `'password'`, and that a route whose `getDb` throws `AppError('SERVICE_UNAVAILABLE')` returns 503.
  - `env.test.ts` (in `src/config/__tests__/`) covers: a short `JWT_SECRET` throws a message naming `JWT_SECRET` without its value; `DEV_GOOGLE_STUB` with `VERCEL` throws; `VERCEL` set gives `trustProxyHops === 1`.
- [ ] **Step 2: Run** `npm test -w @planner/api`. Expected: FAIL.
- [ ] **Step 3: Implement** the files listed above. To let tests mount throwaway routes, `createApp` takes an optional second argument `extraRoutes?: (app: Express) => void`, mounted before the 404 handler.
- [ ] **Step 4: Run** `npm test -w @planner/api && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): express skeleton with config, errors, health and test harness`.

---

### Task 5: Auth (Google sign-in, access JWT, rotating refresh sessions, logout, requireAuth)

**Files:**
- Create: `src/modules/auth/{auth.routes.ts,auth.controller.ts,auth.service.ts,sessions.repository.ts,google-verifier.ts,tokens.ts}`, `src/modules/users/users.repository.ts`, `src/core/middleware/require-auth.ts`
- Modify: `src/core/deps.ts` (real verifier), `src/test/harness.ts` (`signIn`), `src/app.ts` (mount `/v1/auth` with a rate limit of 20 requests per 15 minutes)
- Test: `src/modules/auth/__tests__/auth.test.ts`

**Interfaces:**
- **Google identity:**
  - `interface GoogleIdentity { sub: string; email: string; name: string; picture: string | null; emailVerified: boolean }`
  - `createGoogleVerifier(webClientId: string): GoogleVerifier` wraps `OAuth2Client.verifyIdToken({ idToken, audience: webClientId })`. Any failure, or `email_verified !== true`, throws `AppError('GOOGLE_TOKEN_INVALID')`.
  - When `config.devGoogleStub` is set, `productionDeps` uses a stub that accepts `'dev:<sub>:<email>'`.
- **Tokens:** `signAccessToken(userId: string, now: Date, secret: string): Promise<string>` and `verifyAccessToken(token, secret): Promise<{ userId: string }>`. An expired token throws `AppError('TOKEN_EXPIRED')`; any other failure throws `AppError('UNAUTHENTICATED')`.
- **Users repository:** `createUsersRepository(db)` returns:
  - `upsertFromGoogle(identity, now): Promise<UserDoc>`. On insert it sets `createdAt`, `settings: DEFAULT_SETTINGS` and `onboardingCompletedAt: null`. Every time it updates `email`, `name`, `avatarUrl` and `lastLoginAt`.
  - `findById(id: ObjectId)`, `updateMe(id, patch)` and `deleteById(id)`.
  - `toUserView(doc): UserView`.
- **Sessions repository:** `createSessionsRepository(db)` returns:
  - `create(userId, deviceLabel, now): Promise<{ refreshToken: string }>`
  - `rotate(refreshToken, now): Promise<{ userId: ObjectId; refreshToken: string }>`
  - `revoke(refreshToken, now): Promise<void>`
  - `revokeAllForUser(userId, now): Promise<void>`
- **Rotation rules:**
  1. Find the session by `sha256(token)`.
  2. Missing or expired → `UNAUTHENTICATED`.
  3. If it already has `revokedAt` (reuse detected), call `revokeAllForUser` and then throw `UNAUTHENTICATED`.
  4. Otherwise mark it revoked with `replacedBy`, and insert a new session with a 60-day expiry.
  5. Use `findOneAndUpdate({ tokenHash, revokedAt: null }, …)` so two concurrent rotations can't both succeed.
- **Auth middleware:** `requireAuth(deps): RequestHandler` reads `Authorization: Bearer <jwt>` and sets `res.locals.userId: ObjectId`. A missing header → `UNAUTHENTICATED`.
- **Routes:**
  - `POST /v1/auth/google` → 200 `AuthResponse`
  - `POST /v1/auth/refresh` → 200 `{ accessToken, refreshToken }`
  - `POST /v1/auth/logout` → 204
- **Harness:** `signIn(app, sub = 'u1')` posts `{ idToken: 'google:<sub>:<sub>@test.dev' }` and returns the `AuthResponse`.

- [ ] **Step 1: Write failing tests:**
  - **First sign-in:** creates the user with default settings and `onboardingCompletedAt: null`, and returns tokens.
  - **Second sign-in with the same `sub`:** reuses the same user id and updates the name.
  - **Bad token:** the verifier throws → 401 `GOOGLE_TOKEN_INVALID`.
  - **Refresh:** returns a new pair. The old refresh token then fails with 401, and that reuse also revokes the new token: refreshing the new one also returns 401.
  - **Logout:** returns 204, then refreshing returns 401.
  - **Expired access token:** a protected probe route (mounted via `extraRoutes` + `requireAuth`) returns 401 `TOKEN_EXPIRED`. Sign the token with `now` 16 minutes before the harness clock. No header → 401 `UNAUTHENTICATED`.
  - **The database stores only the token hash:** `db.collection('sessions').findOne()` has no field equal to the raw token.
  - **Concurrent refresh:** `Promise.all` of two refreshes with the same token gives exactly one 200.
- [ ] **Step 2: Run** `npm test -w @planner/api -- auth`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): google sign-in with rotating refresh sessions`.

---

### Task 6: Me module (profile, settings, onboarding, account deletion)

**Files:**
- Create: `src/modules/me/{me.routes.ts,me.service.ts}`. It reuses `users.repository.ts`.
- Test: `src/modules/me/__tests__/me.test.ts`

**Interfaces:**
- `GET /v1/me` → `UserView`.
- `PATCH /v1/me` (`updateMeSchema`) → `UserView`.
  - Settings merge field by field.
  - `onboardingCompleted: true` sets `onboardingCompletedAt` to `now().toISOString()` once and never resets it.
- `DELETE /v1/me` → 204. It deletes the user's docs in `topics`, `exams`, `subjects`, `mockTests` and `sessions`, then the user.
- Exports `deleteUserData(db, userId): Promise<void>`. Task 12's `replace` import reuses its non-user part as `deleteStudyData(db, userId)`, which deletes everything except `users` and `sessions`.

- [ ] **Step 1: Write failing tests:**
  - `PATCH { settings: { reminderTime: '21:30' } }` keeps the other settings.
  - Invalid intervals `[7,4]` → 400 `VALIDATION_FAILED` with details naming `settings.intervals`.
  - `onboardingCompleted` sets a timestamp, and a second patch doesn't change it.
  - `DELETE` removes the user's own data but leaves user B's documents untouched. Seed by inserting directly into the collections. Afterwards the old access token → 401 `UNAUTHENTICATED` (`requireAuth` must 401 when the user no longer exists).
- [ ] **Step 2: Run** `npm test -w @planner/api -- me`. Expected: FAIL.
- [ ] **Step 3: Implement.** `requireAuth` also confirms the user exists, using an `_id` lookup.
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): me endpoints with settings, onboarding and account deletion`.

---

### Task 7: Exams and subjects modules

**Files:**
- Create: `src/modules/exams/{exams.routes.ts,exams.service.ts,exams.repository.ts}`, `src/modules/subjects/{subjects.routes.ts,subjects.service.ts,subjects.repository.ts}`
- Test: `src/modules/exams/__tests__/exams.test.ts`, `src/modules/subjects/__tests__/subjects.test.ts`

**Interfaces:**
- **Stored fields:** `exams` documents are `{ _id, userId, name, nameKey, examDate, createdAt }`. `subjects` documents are `{ _id, userId, name, nameKey, createdAt }`, with `nameKey` from shared `nameKey()`. (The exams `nameKey` field is a small addition to spec §7, made to support the duplicate-name check.)
- **Exam routes:**
  - `GET /v1/exams` → `ExamView[]`, sorted by name
  - `POST` → 201 `ExamView`
  - `PATCH /:id` → `ExamView`
  - `DELETE /:id` → 204, also `$pull` the exam id from that user's topics' `examIds`
- **Subject routes:**
  - `GET /v1/subjects` → `SubjectView[]` with `topicCount` (aggregation), sorted by name
  - `POST` → 201
  - `PATCH /:id` → rename
  - `DELETE /:id` → 409 `SUBJECT_IN_USE` while any topic references it, else 204
- **Errors:** a duplicate `nameKey` gives 409 `DUPLICATE_NAME` (catch Mongo error code 11000). Another user's id, or one that doesn't exist, gives 404.
- **Exported helpers:** `assertSubjectOwned(db, userId, subjectId): Promise<void>` and `assertExamsOwned(db, userId, examIds): Promise<void>`. Both throw `AppError('VALIDATION_FAILED', { details: [{ path: ['subjectId'] | ['examIds'] }] })`. Task 8 uses them.

- [ ] **Step 1: Write failing tests:**
  - **CRUD happy paths.**
  - **Review Focus 5:** `"Surgery"` then `" surgery "` → 409 `DUPLICATE_NAME`. Renaming to an existing name gives the same 409.
  - **Same name across users:** user B can create `"Surgery"` too.
  - **Cross-user access:** user B gets 404 for PATCH or DELETE on user A's exam.
  - **Exam delete:** removes that exam id from topics, using a seeded topic document.
  - **Subject delete:** 409 while in use, 204 after the topic is deleted.
- [ ] **Step 2: Run** `npm test -w @planner/api -- exams subjects`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): exams and subjects with per-user unique names`.

---

### Task 8: Topics CRUD

**Files:**
- Create: `src/modules/topics/{topics.routes.ts,topics.controller.ts,topics.service.ts,topics.repository.ts,topic.mapper.ts}`
- Test: `src/modules/topics/__tests__/topics.test.ts`

**Interfaces:**
- **Stored topic document:**

  ```
  { _id, userId, name, subjectId: ObjectId, examIds: ObjectId[], studiedOn, intervals, notes,
    revisions: RevisionState[], nextDueOn, status, version: number, legacyId?: string, createdAt, updatedAt }
  ```

  Revision ids are `new ObjectId().toHexString()`.
- **Mapper:** `toTopicView(doc): TopicView`.
- **Repository:** `createTopicsRepository(db)` returns:
  - `list(userId, query)`: sorted by `name` ascending with a case-insensitive collation; `q` is an escaped, case-insensitive regex on `name`.
  - `findOwned(userId, id)`: throws `NOT_FOUND`.
  - `insert(doc)`, `countForUser(userId)`, `deleteOwned(userId, id)`.
  - `replaceIfVersion(userId, id, version, next): Promise<boolean>`: updates with filter `{ _id, userId, version }`, sets `$set next`, and `$inc version`.
- **Service:** `createTopicsService(deps)` returns:
  - `create(userId, input)`: intervals default to the user's `settings.intervals`. It runs `assertSubjectOwned`, `assertExamsOwned` and `createSchedule`. If the user already has 5,000 topics → 422 `LIMIT_EXCEEDED`.
  - `update(userId, id, patch)`: ownership checks on any changed refs. A changed `studiedOn` or `intervals` triggers `reconcileSchedule`.
  - `remove(userId, id)`.
  - `mutateWithRetry(userId, id, fn: (doc) => Partial<TopicDoc>): Promise<TopicDoc>`. It loads the topic, applies `fn` and calls `replaceIfVersion`. On a version miss it reloads and retries once; a second miss → 409 `REVISION_OUT_OF_ORDER`. Task 9 relies on this.
- **Routes:**
  - `GET /v1/topics` (`topicListQuerySchema`) → `TopicView[]`
  - `POST` → 201 `TopicView`
  - `GET /:id`, `PATCH /:id` → `TopicView`
  - `DELETE /:id` → 204

- [ ] **Step 1: Write failing tests:**
  - **Create:** using the default settings intervals, the response has 6 revisions and `nextDueOn = studiedOn + 4`.
  - **Custom intervals:** `[4,7,15,30]` give the spec example dates.
  - **Foreign subject:** another user's subject id → 400 `VALIDATION_FAILED` with path `subjectId`.
  - **Filters:** `subjectId`, `examId`, `q` (case-insensitive, with regex characters like `"(a"` safely escaped) and `status`.
  - **Cross-user access:** user B gets 404 on GET, PATCH or DELETE of user A's topic.
  - **Review Focus 1:** `GET /v1/topics/abc` and `/v1/topics/123` both give 404 `NOT_FOUND` (not 500).
  - **Review Focus 4:** a topic with 3 done revisions (set up via the Task 9 endpoints, or by seeding through the repository), patched with `intervals: [4, 7]` → 400 `VALIDATION_FAILED`.
  - **Changing `studiedOn`:** recomputes pending dates.
  - **Topic limit:** the 5,001st create → 422 `LIMIT_EXCEEDED`. Seed 5,000 minimal documents with `insertMany`.
- [ ] **Step 2: Run** `npm test -w @planner/api -- topics`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): topics CRUD with move-forward schedule`.

---

### Task 9: Revision actions (complete, undo, snooze)

**Files:**
- Create: `src/modules/topics/revisions.routes.ts`. Add `completeRevision`, `undoRevision` and `snoozeRevision` methods to `topics.service.ts`.
- Test: `src/modules/topics/__tests__/revisions.test.ts`

**Interfaces:**
- **Routes:**
  - `POST /v1/topics/:id/revisions/:revisionId/complete` (`completeRevisionSchema`) → `TopicView`
  - `POST …/undo` (empty body) → `TopicView`
  - `POST …/snooze` (`snoozeRevisionSchema`) → `TopicView`
- **Service:** each service method calls `mutateWithRetry` with the matching shared domain function, and saves `revisions`, `nextDueOn` and `status` from the `ScheduleResult`. A `ScheduleError` is turned into an `AppError` with the same code.

- [ ] **Step 1: Write failing tests:**
  - **Late completion:** complete R1 on `'2026-11-12'` for a topic studied `'2026-11-01'` with `[4,7,15,30]`. The response's dates are `05/15/23/12-08` and `nextDueOn` is `'2026-11-15'`.
  - **Out of order:** completing R2 first → 409 `REVISION_OUT_OF_ORDER`.
  - **Undo:** undo R1 restores the original dates. Undoing R1 while R2 is done → 409.
  - **Snooze:** with `{ today: '2026-11-20' }` and an overdue R1, `dueOn` becomes `'2026-11-21'`. `days: 31` → 400.
  - **Completed topic:** completing every revision gives `status 'completed'` and `nextDueOn null`.
  - **Unknown revision id:** → 404 `REVISION_NOT_FOUND`. Map `REVISION_NOT_FOUND` to the shared `NOT_FOUND` code at the API boundary, so assert `NOT_FOUND`.
  - **Review Focus 2:** `Promise.all` of two identical complete requests → status set `[200, 409]`. Then GET shows R1 done exactly once and R2 pending.
  - **Cross-user access:** user B cannot complete user A's revision (404).
- [ ] **Step 2: Run** `npm test -w @planner/api -- revisions`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): ordered revision complete, undo and snooze`.

---

### Task 10: Agenda and stats

**Files:**
- Create: `src/modules/agenda/{agenda.routes.ts,agenda.service.ts}`, `src/modules/stats/{stats.routes.ts,stats.service.ts}`
- Test: `src/modules/agenda/__tests__/agenda.test.ts`, `src/modules/stats/__tests__/stats.test.ts`

**Interfaces:**
- **Agenda:** `GET /v1/agenda?today&days` → `{ items: AgendaItem[] }`.
  - Queries `{ userId, status: 'active', nextDueOn: { $lte: addDays(today, days) } }`, sorted by `nextDueOn` ascending, then name.
  - Each item is that topic's next pending revision, with `totalSteps = intervals.length` and `subjectName` taken from one subjects lookup.
  - `bucket`: `overdue` if dueOn < today, `today` if equal, otherwise `upcoming`.
  - It uses the `{userId, nextDueOn}` index.
- **Stats:** `GET /v1/stats?today` → `StatsView`.
  - Counts come from an aggregation over the user's topics: `revisionsDone` and `revisionsPending` from revision `doneOn`, and `overdue` and `dueToday` from `nextDueOn` against `today`.
  - `bySubject` and `byExam` include zero-count subjects and exams, sorted by name.

- [ ] **Step 1: Write failing tests.** Seed through the API: one overdue topic, one due today, one due in 10 days, one due in 40 days, one completed, and one belonging to user B.
  - **Agenda, default 30 days:** returns 3 items in date order with buckets `overdue/today/upcoming`. It excludes the 40-day topic, the completed one and user B's.
  - **Agenda, `days=60`:** includes the 40-day topic.
  - **Missing `today`:** → 400.
  - **Stats:** returns the exact counts for that seed, and a subject with 0 topics appears with `topicCount: 0`.
- [ ] **Step 2: Run** `npm test -w @planner/api -- agenda stats`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): agenda and stats`.

---

### Task 11: Mock tests

**Files:**
- Create: `src/modules/mockTests/{mockTests.routes.ts,mockTests.service.ts,mockTests.repository.ts}`
- Test: `src/modules/mockTests/__tests__/mockTests.test.ts`

**Interfaces:**
- `GET /v1/mock-tests` → `MockTestView[]`, sorted by `takenOn` descending.
- `POST` → 201, `PATCH /:id`, `DELETE /:id` → 204.
- `percent = Math.round(score / maxScore * 1000) / 10`.
- A non-null `examId` must be owned by the user (`assertExamsOwned`).
- 2,000 mock tests per user, with 422 `LIMIT_EXCEEDED` past that. This matches the old server limit.

- [ ] **Step 1: Write failing tests:**
  - CRUD.
  - `percent` 72.5 for 145/200.
  - A PATCH that changes `score` to 250 while `maxScore` stays 200 → 400 at path `score`. The service merges first, then re-validates with `mockTestInputSchema`.
  - Another user's exam id → 400.
  - Cross-user access → 404.
- [ ] **Step 2: Run** `npm test -w @planner/api -- mockTests`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w @planner/api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): mock test tracker`.

---

### Task 12: Backup export and import (new format and legacy format)

**Files:**
- Create: `packages/shared/src/schemas/backup.ts`, `src/modules/backup/{backup.routes.ts,backup.service.ts,legacy-mapper.ts}`
- Test: `packages/shared/src/schemas/__tests__/backup.test.ts`, `apps/api/src/modules/backup/__tests__/backup.test.ts`

**Interfaces:**
- **Shared schemas:**
  - `backupV1Schema`:

    ```
    { format: 'studyplanner.backup.v1', exportedAt: string,
      settings: Settings, exams: {id,name,examDate}[], subjects: {id,name}[],
      topics: {id,name,subjectId,examIds,studiedOn,intervals,notes,
               revisions:{step,doneOn,dueOverride}[], legacyId?}[],
      mockTests: {id,title,takenOn,score,maxScore,examId,notes}[] }
    ```

  - `legacyBackupSchema`: the old WebView and current RN apps share one shape:

    ```
    { topics: {id,name,exam:'MS General Surgery'|'NEET SS'|'Both',subject?,studyDate,intervals,notes?,
               revisions:{day,date,done,completedAt?}[]}[],
      settings: {intervals, time?, dark?},
      tests?: LegacyMock[], mockTests?: LegacyMock[] }
    ```

    `LegacyMock = {id, exam, date, score, max, note?}`. Both `tests` and `mockTests` present → invalid.
  - `parseBackup(value: unknown): { kind: 'v1'; data: BackupV1 } | { kind: 'legacy'; data: LegacyBackup }`. On failure it throws a `ZodError`, which the API maps to `BACKUP_INVALID` with details.
  - Body limit: 4 MB on this route only, because Vercel's request limit is 4.5 MB.
- **Export:** `GET /v1/backup` → `BackupV1` for the user. Ids are strings, and the `id` references are internal to the file.
- **Import:** `POST /v1/backup/import { mode: 'merge'|'replace', data: unknown }` → `{ imported: { exams, subjects, topics, mockTests }, skipped: { topics } }`.
- **Legacy mapping** (`legacy-mapper.ts`, spec §14b):
  - **Exams:** `'Both'` → exam ids for both `'MS General Surgery'` and `'NEET SS'`. Exam and subject names are find-or-created by `nameKey`. An empty subject becomes `'General'`.
  - **Topic fields:**
    - `studiedOn = studyDate` and `legacyId = topic.id`.
    - Intervals are sorted and de-duplicated, keeping only values from 1 to 999. If none remain, the user's settings intervals are used.
  - **Revisions:** sorted by `day`.
    - Old revision *k* becomes step *k*. Done ones get `doneOn = completedAt ?? date`, clamped to be ≥ the previous `doneOn` and ≥ `studiedOn`.
    - If the old revision count differs from the interval count, extra old revisions are dropped.
    - Pending dates are recomputed with `rebuildSchedule`.
  - **Mock tests:** `title = '<exam> mock'`, `takenOn = date`, `maxScore = max`, `notes = note`, and `examId` is the mapped exam.
  - **Settings:** apply `intervals`, `time` → `reminderTime`, and `dark` → `theme 'dark' | 'system'`.
- **Merge and replace:**
  - **Merge:** a topic whose `legacyId` already exists for the user is skipped and counted in `skipped.topics`. v1 topics carry their `legacyId` (or their v1 `id` as `legacyId`), so re-importing the same file is safe.
  - **Replace:** calls `deleteStudyData` (Task 6) first, then imports.
  - Imports respect the 5,000-topic limit → 422 `LIMIT_EXCEEDED`. That check happens before writing anything.

- [ ] **Step 1: Write the failing shared test.** `parseBackup` accepts a minimal v1 file, a legacy file with `tests` and one with `mockTests`. It rejects a file with both, and a legacy file whose `exam` is `'USMLE'`.
- [ ] **Step 2: Write the failing API tests:**
  - **Legacy import:** a topic `{ exam:'Both', studyDate:'2026-11-01', intervals:[4,7,15,30], revisions: [{day:4,date:'2026-11-05',done:true,completedAt:'2026-11-12'}, {day:7,date:'2026-11-08',done:false}, …] }`. It becomes a topic linked to both exams, R1 has `doneOn '2026-11-12'`, R2 is due `'2026-11-15'`, and the subject is `'General'`.
  - **Mock tests:** a legacy `tests` entry becomes a mock test with `percent`.
  - **Re-import:** importing the same file again with `merge` gives `skipped.topics = 1` and no duplicate.
  - **Round trip:** `replace` with an exported v1 backup leaves the topics, revisions `doneOn` and mock tests the same as before.
  - **Invalid file:** → 400 `BACKUP_INVALID`.
  - **Cross-user safety:** a v1 file whose `subjectId` refers to an id that isn't in the file → 400 `BACKUP_INVALID`.
  - **Isolation:** importing never touches user B's data.
- [ ] **Step 3: Run** `npm test -w @planner/shared -- backup && npm test -w @planner/api -- backup`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit:** `feat(api): backup export and legacy-aware import`.

---

### Task 13: Public pages, smoke script, docs

**Files:**
- Create: `src/modules/pages/{pages.routes.ts,privacy.html.ts,home.html.ts}`, `apps/api/scripts/smoke.mjs`, root `CLAUDE.md`, root `README.md`, `apps/api/.env.example` (finalize)
- Test: `src/modules/pages/__tests__/pages.test.ts`

**Interfaces:**
- **Pages:** `GET /` and `GET /privacy` return `text/html; charset=utf-8`, with no auth and no `/v1` prefix.
  - Each page has an inline-styled `<title>`: "Study Planner" and "Study Planner — Privacy Policy".
  - The privacy page covers the content in spec §14a, plus a contact line that reads `CONTACT_EMAIL` from env. If that is unset, it shows "Contact the developer through the app's listing". Add `CONTACT_EMAIL` as an optional value in `AppConfig`.
  - The home page shows a one-line description and links to `/privacy` relative to the base path. Use `./privacy` so it works behind `/api/server/`.
  - helmet's default content security policy allows inline styles only if set; set `styleSrc 'unsafe-inline'` on these routes.
- **`scripts/smoke.mjs`:**
  - Takes `BASE_URL` (default `http://localhost:3000`).
  - Sequence: `GET /health` → `POST /v1/auth/google` with `dev:smoke:smoke@test.dev` (needs `DEV_GOOGLE_STUB=true` locally) → create a subject → create a topic → complete R1 → undo → `GET /v1/agenda` → `DELETE /v1/me`.
  - Prints a ✓ for each step and exits non-zero on the first failure.
  - When `BASE_URL` points to Vercel it runs only the health check and `/privacy`, because the stub is refused there.
- **`CLAUDE.md`:**
  - Layout, the Global Constraints above, and the commands.
  - "Specs in `docs/superpowers/specs`, plans in `docs/superpowers/plans`."
  - The rules: work on `main`, no branches, no push until the Plan 3 deploy, and never modify Classory.
  - Why `apps/mobile` is outside the workspace.
- **`README.md`:** what the app is, running the API locally (`cp apps/api/.env.example apps/api/.env`, `npm install`, `npm run build:shared`, `npm run dev -w @planner/api`) and running the tests.

- [ ] **Step 1: Write failing tests.** `GET /privacy` → 200 HTML containing `"Delete account"` and `"MongoDB Atlas"`. `GET /` → 200 HTML containing `href="./privacy"`.
- [ ] **Step 2: Run** `npm test -w @planner/api -- pages`. Expected: FAIL.
- [ ] **Step 3: Implement the pages, the smoke script and the docs.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: all clean.
- [ ] **Step 5: Smoke test locally.** Use `apps/api/.env` with `MONGODB_URI` pointing to the user's Atlas cluster (database `studyplanner`) and `DEV_GOOGLE_STUB=true`. Start `npm run dev -w @planner/api` in the background, then run `npm run smoke -w @planner/api`. Expected: every step ✓. If no Atlas URI is available, run it against a local `mongodb-memory-server` started by `node -e` and note that in the hand-off.
- [ ] **Step 6: Commit:** `feat(api): public privacy and home pages, smoke script, docs`.

---

## Done when
- `npm test`, `npm run typecheck` and `npm run lint` are clean at the root.
- The smoke script passes against a local API.
- `git log` on `main` shows the 13 task commits plus the spec commit, all local. `git status -sb` shows `ahead of 'origin/main'`, and nothing has been pushed.
- Hand-off note lists:
  - any spec deviation (the shared `dist` build for Vercel; the `nameKey` field on exams)
  - the `installCommand` and `buildCommand` choices in `vercel.json` for Plan 3 to verify on a preview deploy
