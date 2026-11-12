# Free hosting setup: Vercel + MongoDB Atlas

This guide sets up the API on Vercel Hobby and the database on an Atlas Free cluster. It is intended for one personal, non-commercial app owner. Both providers can change their free limits or terms, so this is a $0 setup while it stays within the providers' current free allowances, not a lifetime price guarantee. Vercel Hobby is limited to personal, non-commercial projects; see [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel's terms](https://vercel.com/legal/terms).

The backend and APK are not deployed or ready for online use by this repository alone. You must create the accounts, add the server secrets, deploy the API, and build with your project's real URL. Never put the Atlas URI or JWT secret in the Android app.

## 1. Create the Atlas database

1. Create a MongoDB Atlas account and a project, then create an **Atlas Free** cluster. Pick a region near the expected users if one is available on the Free tier. Free clusters currently have a hard **512 MB** total storage limit for data and indexes and limited throughput. See [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) and [cluster tiers](https://www.mongodb.com/docs/atlas/manage-clusters/).
2. Create a database user with a unique, strong password and read/write access only to the `surgical_study_planner` database. Do not reuse your Atlas account password.
3. In **Network Access**, add `0.0.0.0/0`. Vercel Hobby does not give this project a fixed outbound IP to put on a narrow Atlas list. This permits connections from any IP, so the database remains protected by TLS, the long unique database password, and the database user's restricted role. The URI must stay in Vercel's server environment variables; never put it in this repository or APK.
4. Copy Atlas's `mongodb+srv://` connection string. Replace its placeholders, set the database path to `surgical_study_planner`, and URL-encode special characters in the database password. Keep a private copy for the next steps.

Atlas Free clusters are automatically paused after 30 days without activity. A successful app launch fetches planner data through the API and accesses Atlas, which counts as activity. If Atlas has already paused the cluster, requests cannot connect until you resume it in Atlas. See [Atlas pause and resume behavior](https://www.mongodb.com/docs/atlas/pause-terminate-cluster/).

## 2. Create a Vercel Hobby project

1. Create a Vercel account and choose the **Hobby** plan. Keep the project on Hobby and do not enable paid add-ons. Hobby is for personal, non-commercial use. Included usage is limited; exceeding limits can make a service unavailable until usage resets or the plan changes. See [Hobby limits](https://vercel.com/docs/plans/hobby) and [pricing](https://vercel.com/pricing).
2. Import the Git repository containing this app. In project setup, set **Root Directory** to `SurgicalStudyPlannerReactNative/server` (select the directory within the repository). `vercel.json` selects the **Other** framework preset to prevent Express auto-detection from picking the local development entrypoint; the `/api` function still runs on Vercel's Node.js runtime, currently Node.js 24.x by default. The server package requires Node.js 22.13 or newer.
3. In the project's **Settings → Environment Variables**, add these variables for Production and Preview only when needed:

   | Name | Value |
   | --- | --- |
   | `MONGODB_URI` | The Atlas connection string from step 1 |
   | `JWT_SECRET` | A private, random value of at least 32 bytes; use a different value from the Atlas password |
   | `ALLOW_REGISTRATION` | `false` |

   Do not add `PORT`. Leave `TRUST_PROXY_HOPS` unset unless deployment logs show the host requires a specific trusted proxy hop count. Never paste secrets into source files, Git, build commands, or the APK.
4. Deploy the project. Vercel provides an HTTPS address such as `https://your-project.vercel.app`. This API is configured with the base path `https://your-project.vercel.app/api/server`.

Vercel currently supports WebSocket connections on Functions. This app uses Socket.IO for live updates. Each connection is limited by the function duration; this Function is configured for the Hobby maximum of five minutes, and the mobile client reconnects and reloads planner data. Without a shared Socket.IO adapter, a change may not reach sessions attached to another function instance. Reopening the app always fetches the latest planner from the API. See [Vercel WebSocket support](https://vercel.com/changelog/websocket-support-is-now-generally-available) and [Function duration limits](https://vercel.com/docs/functions/limitations).

## 3. Verify the deployment

Check these URLs in a browser, replacing `your-project` with the Vercel project name:

- `https://your-project.vercel.app/api/server/health` should return `{"status":"ok"}`.
- `https://your-project.vercel.app/api/server/v1/config` should return `{"registrationEnabled":false}`.

To check the authenticated Socket.IO handshake, link the Vercel project locally with the Vercel CLI from `SurgicalStudyPlannerReactNative/server/`, then run `npx vercel dev`. Set test-only `MONGODB_URI` and `JWT_SECRET` values in that shell before starting Vercel Dev; the verifier does not perform database operations. In a second terminal at `server/`, run:

```powershell
npm ci
npm run build
npm run verify:vercel
```

The Vercel routing rules send `/api/server/*` to the shared function and strip the prefix before Express or Socket.IO handles the request. The verifier checks both HTTP routes and the authenticated WebSocket connection. Do not proceed to a real APK build if the verifier reports a route or handshake failure. The project root must be linked because Vercel Dev uses the linked project configuration. No billing or paid feature is required for this local check.

## 4. Create the first owner account

The first account is created locally; public registration stays disabled. On a trusted computer, in `SurgicalStudyPlannerReactNative/server/`:

1. Copy `.env.example` to `.env` and fill in the real Atlas URI and a strong random `JWT_SECRET`. Keep `.env` untracked and private.
2. Run `npm ci` and then `npm run create-owner`. Follow the prompt to enter the owner's email and a unique password of at least 12 characters. The API stores a password hash, not the plain password.
3. Remove the local `.env` when finished, or keep it only in a trusted, encrypted development environment. Do not upload it to Vercel or commit it; the deployed API receives its own values through Vercel Environment Variables.

If you later rotate `JWT_SECRET`, existing login sessions are invalidated and users must sign in again.

## 5. Build an APK for the deployed API

The URL is public and safe to compile into the APK; secrets are not. First copy the deployed API base URL exactly, including `/api/server`. From PowerShell:

```powershell
cd SurgicalStudyPlannerReactNative\mobile
npm ci
cd android
.\gradlew.bat assembleDebug "-PAPI_BASE_URL=https://your-project.vercel.app/api/server"
```

The APK is written to `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Install that APK on an Android phone and sign in with the owner account. Planner data needs an internet connection. Local reminder alarms remain on-device; they do not require FCM. Reinstalling the app removes its locally scheduled alarms, while the planner record remains in Atlas.

## Free-plan limits and service behavior

- Atlas Free currently includes 512 MB for data plus indexes. It can pause after 30 days with no activity. Atlas may change the free tier or its limits.
- Vercel Hobby is free for personal, non-commercial use with monthly usage limits. Do not add payment details, paid features, custom paid domains, static egress, paid keep-alive services, or paid realtime adapters for this setup.
- Providers may change free terms, suspend inactive services, or discontinue free plans. No provider promises that this combination will remain free forever.
- If the app becomes commercial, exceeds free limits, or requires reliable cross-instance realtime delivery, revisit the hosting plan before expanding usage.
