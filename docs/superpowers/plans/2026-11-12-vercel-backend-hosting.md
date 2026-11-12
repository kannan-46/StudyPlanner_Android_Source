# Vercel Backend Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prepare the existing Express/MongoDB/Socket.IO backend to run on Vercel Hobby with Atlas Free, preserving the current mobile API and local alarm behavior without adding paid services.

**Architecture:** Extract an importable API and HTTP server factory while keeping the existing local Node server. Export that HTTP server from a Vercel Function entry point; use `/api/server` as the public API base, and include that prefix in the mobile Socket.IO path. Keep MongoDB connections reused per function instance and create beginner-friendly setup instructions; defer live deployment until the owner creates and configures the free accounts.

**Tech Stack:** Node.js 22.13+, TypeScript (ESM), Express 5, MongoDB Node.js driver, Socket.IO 4.8.4, React Native 0.88.1, Node's built-in test runner, Vercel Hobby, MongoDB Atlas Free.

**Spec:** `docs/superpowers/specs/2026-11-12-vercel-backend-hosting-design.md`

## Global Constraints

- Use Vercel Hobby, MongoDB Atlas Free (512 MB), and Vercel's provided HTTPS address; do not buy a custom domain.
- No paid plan, add-on, backup, static egress, keep-alive service, or shared realtime service may be enabled.
- Vercel Hobby is for personal, non-commercial use; no provider guarantees lifetime-free terms.
- The Atlas Free cluster can pause after 30 days with no database connections; signed-in app launch must fetch planner data.
- Atlas network access uses the owner's approved `0.0.0.0/0` choice; keep a strong, unique, least-privilege database user and the URI only in server environment variables.
- Keep `ALLOW_REGISTRATION=false`; one owner account is the first-release scope.
- Preserve REST routes `/health`, `/v1/config`, `/v1/auth/*`, `/v1/planner` and the authenticated Socket.IO `planner:changed` event.
- Keep planner data online-only and Android local alarms on-device; do not add FCM or server alarm scheduling.
- Keep secrets out of source control, logs, and the APK. The API URL is public and may be compiled into the APK.
- Vercel WebSocket connections can end at the Hobby function duration limit; reconnect and refresh state. Cross-instance broadcasts are outside this release.
- Do not claim the live API or final APK is ready until an actual Vercel URL and Atlas credentials are configured.

## Review Focus

- **Missing or malformed server secrets:** startup should fail clearly without returning secret values; cover with a config validation check and confirm the app only receives generic API errors.
- **Atlas unavailable or paused:** the app should get a safe server error and recover after the cluster is resumed; cover through a documented live smoke check once the owner has an Atlas Free cluster.
- **Concurrent cold requests:** Mongo connection/index initialization should be shared within a function instance and retried after an initialization failure; cover with a unit test using concurrent initializers and a failed-first-attempt case.
- **Function route prefix mismatch:** REST and Socket.IO requests must reach the same Vercel function; cover `/api/server/health`, `/api/server/v1/config`, and an authenticated WebSocket handshake using `vercel dev` after the project is linked.
- **Function-duration reconnect:** reconnect should reload current planner state; cover the existing app reconnect handler in code review and a local forced-disconnect smoke check.

---

### Task 1: Extract a Reusable API Server and Safe Database Initialization

**Files:**
- Create: `SurgicalStudyPlannerReactNative/server/src/api.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/api.test.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/db.test.ts`
- Create: `SurgicalStudyPlannerReactNative/server/src/test-env.ts`
- Modify: `SurgicalStudyPlannerReactNative/server/src/index.ts`
- Modify: `SurgicalStudyPlannerReactNative/server/src/db.ts`
- Modify: `SurgicalStudyPlannerReactNative/server/src/auth.ts`
- Modify: `SurgicalStudyPlannerReactNative/server/src/planner.ts`
- Modify: `SurgicalStudyPlannerReactNative/server/package.json`
- Modify: `SurgicalStudyPlannerReactNative/server/package-lock.json`

**Interfaces:**
- Produce `createApiServer(): { app: Express, httpServer: HttpServer, io: Server }` from `src/api.ts`.
- Produce `createMemoizedInitializer(initialize: () => Promise<void>): () => Promise<void>` in `src/db.ts`; it shares concurrent initialization and clears its cached promise if connection/index creation fails.
- Keep `src/index.ts` as the local `PORT` listener; Vercel will import the server factory in Task 2.

- [ ] **Step 1: Add failing API and database initializer tests**

Test `GET /health` returns `{status: "ok"}` without connecting to Atlas, `GET /v1/config` returns `{registrationEnabled: false}`, and valid `POST /v1/auth/register` returns 404 while registration is disabled. Test the initializer shares one in-flight operation across concurrent calls and retries after a rejected first operation.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run from `SurgicalStudyPlannerReactNative/server/`: `npm test`.

Expected: the test command or new behavior tests fail because there is no test script, importable API factory, or memoized initializer yet.

- [ ] **Step 3: Extract `createApiServer()` and make database initialization reusable**

Move Express middleware and route registration into `src/api.ts`. Attach Socket.IO to the returned Node HTTP server. Keep database-dependent auth/planner paths behind database initialization, keep health/config routes independent of Atlas, and keep the disabled registration response independent of Atlas. In `db.ts`, memoize `client.connect()` plus index initialization per warm process and reset the promise if initialization fails. Keep the MongoClient module-scoped and close it only during local process shutdown.

- [ ] **Step 4: Keep local start behavior and add a repeatable test command**

Update `src/index.ts` to call `createApiServer()`, listen on `config.port`, and retain SIGINT/SIGTERM cleanup. Add `npm test` using the existing `tsx` dev dependency and Node's built-in test runner; set test-only valid `MONGODB_URI` and `JWT_SECRET` values before importing config. Do not add production dependencies for tests.

- [ ] **Step 5: Run tests and TypeScript build**

Run: `npm test` and `npm run build`.

Expected: all new tests pass and `tsc -p tsconfig.json` exits successfully without requiring Atlas credentials.

- [ ] **Step 6: Commit Task 1**

```bash
git add SurgicalStudyPlannerReactNative/server/src SurgicalStudyPlannerReactNative/server/package.json SurgicalStudyPlannerReactNative/server/package-lock.json
git commit -m "refactor: export reusable planner API server"
```

### Task 2: Add the Vercel Function Route and Mobile Socket Path

**Files:**
- Create: `SurgicalStudyPlannerReactNative/server/api/server.ts`
- Create: `SurgicalStudyPlannerReactNative/server/vercel.json`
- Create: `SurgicalStudyPlannerReactNative/server/scripts/verify-vercel.mjs`
- Modify: `SurgicalStudyPlannerReactNative/server/package.json`
- Modify: `SurgicalStudyPlannerReactNative/server/package-lock.json`
- Modify: `SurgicalStudyPlannerReactNative/mobile/App.tsx`

**Interfaces:**
- Vercel project root: `SurgicalStudyPlannerReactNative/server/`.
- Public API base: `https://<vercel-project>.vercel.app/api/server`.
- REST calls append the existing `/v1/...` paths. Socket.IO uses the same function prefix plus `/socket.io`.
- `api/server.ts` default-exports the `HttpServer` returned by `createApiServer()`.

- [ ] **Step 1: Add a failing Vercel route smoke check**

Create a script that calls `/api/server/health` and `/api/server/v1/config` on the configured local Vercel dev URL and opens a Socket.IO WebSocket handshake at `/api/server/socket.io`. The script should check the expected JSON and verify the handshake reaches the API; use a test-only signed JWT from the built server token helper. Add `socket.io-client` 4.8.4 as a development dependency and add an `npm run verify:vercel` script.

- [ ] **Step 2: Run the smoke check and confirm the Vercel route is not ready**

Run `npx vercel dev` and `npm run verify:vercel` from `server/` before adding the Function entry point and confirm the health route returns 404. This smoke check requires a locally linked Vercel project; if the owner has not linked one, record the check as pending and do not enable billing.

- [ ] **Step 3: Export the HTTP server as a Vercel Function**

Create `api/server.ts` that imports `createApiServer()` and default-exports its `httpServer`. Configure the function's Hobby maximum duration as 300 seconds in `vercel.json`; do not enable a paid runtime feature. Keep Socket.IO's server path `/socket.io` and configure the mobile client path from the API base URL pathname so the Vercel `/api/server` prefix is included.

- [ ] **Step 4: Update the mobile Socket.IO path**

Update the Socket.IO connection in `mobile/App.tsx` to derive its `path` from `new URL(API_BASE_URL).pathname` and append `/socket.io`, retaining WebSocket-only transport, token authentication, automatic reconnect, and planner refresh on connect. REST request paths remain unchanged.

- [ ] **Step 5: Verify Vercel routing and server build**

Run from `server/`: `npm run build`, `npm test`, and `npm run verify:vercel` while `npx vercel dev` is running from the linked server project with test-only environment values. Confirm Fluid Compute is enabled; Vercel requires it for WebSockets, and it is available on the free plan.

Expected: `/api/server/health` and `/api/server/v1/config` return 200, Socket.IO authenticates over WebSocket at `/api/server/socket.io`, and the verifier exits 0. If the function route does not preserve the expected suffix, adjust only Vercel routing while keeping the public API base stable, then rerun the verifier.

- [ ] **Step 6: Compile the mobile app and run its existing checks**

Run from `mobile/`: `npm test`, `npm run lint`, then from `mobile/android/` run `..\gradlew.bat assembleDebug -PAPI_BASE_URL=https://example.vercel.app/api/server` in PowerShell. This build is only a preview because the URL is a placeholder; do not label it as a working production APK.

- [ ] **Step 7: Commit Task 2**

```bash
git add SurgicalStudyPlannerReactNative/server SurgicalStudyPlannerReactNative/mobile/App.tsx
git commit -m "feat: add Vercel backend function entrypoint"
```

### Task 3: Document the No-Cost Setup and Deployment Boundary

**Files:**
- Create: `SurgicalStudyPlannerReactNative/HOSTING.md`
- Modify: `SurgicalStudyPlannerReactNative/README.md`
- Modify: `SurgicalStudyPlannerReactNative/server/.env.example` only if the documented variables need correction.

**Interfaces:**
- The guide uses the Vercel project root, API base path, environment variable names, and route paths defined in Task 2.
- The guide distinguishes code readiness from a live deployment; actual secrets and account setup remain owner-controlled.

- [ ] **Step 1: Write the Atlas Free and Vercel Hobby setup steps**

Document creating an Atlas Free cluster, adding a least-privilege database user, accepting the owner-approved `0.0.0.0/0` access choice, and creating a Vercel Hobby project rooted at `server/`. Explain how to set `MONGODB_URI`, a strong random `JWT_SECRET`, and `ALLOW_REGISTRATION=false` in Vercel environment variables without putting credentials in the APK or repository.

- [ ] **Step 2: Document owner account setup, verification, and costs**

Explain creating the initial owner locally with `npm run create-owner` using an untracked local `.env`, deploying to the Vercel-provided HTTPS address, checking `/health` and `/v1/config`, and building an APK with the real `/api/server` URL. State the 512 MB Atlas limit, 30-day zero-connection pause behavior, 5-minute Socket.IO reconnect, Vercel personal/non-commercial restriction, and that free terms can change. Do not recommend a paid add-on or paid keep-alive.

- [ ] **Step 3: Fix the README hosting reference and review docs**

Link `README.md` to the new `HOSTING.md`, remove or correct any reference to a missing hosting document, and explain that no working APK can be produced until the owner has deployed the API and supplied its public URL.

- [ ] **Step 4: Run final local checks**

Run `npm test` and `npm run build` from `server/`, `npm test` and `npm run lint` from `mobile/`, and `git diff --check` from the repository root. Run the Vercel smoke verifier if the owner has linked a Vercel project; do not enable billing to complete that check. When real free accounts and secrets are available, also verify owner login and planner reads/writes against Atlas Free.

Expected: all available local checks pass. If Vercel/Atlas accounts are not yet configured, report live deployment and Atlas end-to-end checks as pending; do not claim them as passed.

- [ ] **Step 5: Commit Task 3**

```bash
git add SurgicalStudyPlannerReactNative/HOSTING.md SurgicalStudyPlannerReactNative/README.md SurgicalStudyPlannerReactNative/server/.env.example
git commit -m "docs: explain free Vercel and Atlas setup"
```

## Execution Boundary

The code and setup guide can be completed locally without account credentials. Do not create or link accounts, enter payment information, enable paid features, deploy a live service, or claim the final APK works online without the owner's actual Vercel/Atlas configuration and public API URL.
