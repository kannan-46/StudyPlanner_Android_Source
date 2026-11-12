# Vercel Backend Hosting Design

**Status:** Proposed; awaiting owner approval before implementation.

## Intent

Prepare the existing Node.js API for deployment on Vercel Hobby so the React Native app can use an HTTPS API and keep its MongoDB Atlas data when the app is removed or its cache is cleared. The app remains online-only for planner data. This choice follows the owner's preference for a $0 personal project and Vercel hosting.

The owner requires that this app incur no hosting or service charges. Use Vercel Hobby, MongoDB Atlas Free (formerly M0, currently 512 MB), and Vercel's provided HTTPS address; do not buy a custom domain. Do not enable paid backup or other add-ons. These services currently advertise free options, but no provider promises lifetime-free terms. Vercel Hobby is for personal, non-commercial use. A future commercial release, changed quotas, or product changes may make this exact setup unavailable. Vercel's published Hobby plan currently includes a 300-second maximum function duration and pauses some usage after quotas are exceeded. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)

## Existing system to preserve

- React Native Android app in `SurgicalStudyPlannerReactNative/mobile/`.
- TypeScript, Node.js, Express, MongoDB Node driver, and Socket.IO API in `SurgicalStudyPlannerReactNative/server/`.
- REST routes: `GET /health`, `GET /v1/config`, auth routes under `/v1/auth`, and planner routes under `/v1/planner`.
- Authenticated Socket.IO event `planner:changed`, using the WebSocket transport.
- One owner account for the first release; registration remains disabled. Planner documents are already scoped by account ID for later multi-user support.
- Android local alarms remain scheduled on the device and continue to work independently of API availability. Do not add server alarm scheduling or FCM in this task.
- API and database secrets stay on the server. The APK contains only the public HTTPS API URL.

## Proposed Vercel shape

1. Configure the Vercel project with `server/` as its root directory and the Node.js runtime.
2. Refactor the server startup into reusable app/server construction. Keep a local `npm run dev` / `npm start` path, and add a Vercel entry point that exports the Node HTTP server so Express and Socket.IO can run together as a Vercel Function. Vercel's current WebSocket guide explicitly shows this Node HTTP server pattern and Socket.IO with WebSocket-only transport. [WebSocket guide](https://vercel.com/docs/functions/websockets), [Express guide](https://vercel.com/docs/frameworks/backend/express)
3. Route the existing REST paths and `/socket.io` through the Vercel function. If Vercel's required function prefix makes it necessary, set one stable API base path and update both the mobile REST client and Socket.IO path together. Keep the public route contract easy to document and use in the APK.
4. Reuse the module-scoped MongoDB client within warm function instances, protect initialization against concurrent requests, and create indexes idempotently. Do not close the database client after each request.
5. Read `MONGODB_URI`, `JWT_SECRET`, and `ALLOW_REGISTRATION` only from Vercel environment variables. Keep registration disabled. Never commit a real `.env`, MongoDB URI, or JWT secret.
6. Keep local HTTP startup for development. Do not require an always-running process, background worker, scheduled task, or database credential in the mobile app.
7. Configure the Vercel function in one region close to MongoDB Atlas where available, so database round trips do not cross regions unnecessarily. The owner supplies the actual Atlas URI and chooses the Atlas region/account; the implementation does not provision accounts or deploy without those credentials.
8. Use the Atlas Free cluster only. Atlas currently pauses it after 30 days with no database connections. A normal app launch must fetch planner data from the API, causing a real database operation; do not rely on a health-only request or a paid keep-alive service. If the app is unused long enough for Atlas to pause, the owner can resume the cluster in the Atlas dashboard. [Atlas inactivity behavior](https://www.mongodb.com/docs/atlas/pause-terminate-cluster/)

## Realtime behavior and limits

Vercel supports WebSockets on all plans, including Socket.IO with WebSocket-only transport. A WebSocket closes when its Vercel Function reaches its maximum duration; on Hobby the current maximum is five minutes. The mobile app already has automatic Socket.IO reconnect and refreshes planner data when it reconnects or returns to the foreground. Keep that behavior and ensure reconnects reload the latest REST state. WebSocket usage counts toward Function limits and pricing while connected. [Vercel WebSocket guide](https://vercel.com/docs/functions/websockets), [Hobby plan limits](https://vercel.com/docs/plans/hobby)

Vercel does not guarantee that reconnects reach the same function instance. The current Socket.IO in-memory adapter only broadcasts to connections on its own instance. Therefore, version one is scoped to one owner and one active device/session for live events. Planner data itself remains correct in MongoDB; the app must refresh it on foreground and after reconnect. Before relying on live events across multiple devices or instances, add a shared Socket.IO adapter/pub-sub service (such as Redis) or switch those clients to REST polling. This shared realtime service is a future task because it may add cost and is not required for the one-device first release. [Vercel WebSocket state guidance](https://vercel.com/docs/functions/websockets)

## MongoDB Atlas network access decision

Atlas restricts cluster connections through an IP access list. Vercel's published static outbound IP feature is available to Pro and Enterprise teams, not Hobby. Keeping Vercel Hobby at $0 therefore means Atlas cannot safely use a narrow, stable Vercel egress-IP allowlist. The free setup would require an Atlas `0.0.0.0/0` entry, which permits connection attempts from any IP; MongoDB explicitly warns about this exposure. Reduce the impact with a unique, long database-user password, a least-privilege database role limited to this app's database, TLS, and a secret URI stored only in Vercel. If broad Atlas network access is unacceptable, choose paid static egress or a different host with a usable narrow allowlist before implementation. [Vercel static IP announcement](https://vercel.com/changelog/static-ips-are-now-available-for-more-secure-connectivity), [MongoDB Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)

**Owner choice (November 12, 2026):** keep the setup at $0, including Atlas access from `0.0.0.0/0`; do not select a paid plan, paid add-on, paid static egress, or paid realtime service. This accepts connection attempts from any IP as the cost of retaining Vercel Hobby with Atlas. The app must still require the database's strong, unique password over TLS, use a database user scoped only to this app's database, and keep its connection string in the Vercel server environment. This is a weaker network boundary than an IP allowlist and must not be described as equally secure.

Do not attach or enable a paid resource to implement this design. If a provider requires a billing method, proposes a paid upgrade, or a required feature cannot be completed on the free plans, stop and report that blocker before enabling it.

## Goals

- Make the existing API deployable as a Vercel Node.js Function.
- Preserve planner data, auth, and the current local reminder workflow.
- Provide a documented public HTTPS URL that can later be baked into a release APK.
- Keep the initial deployment within the currently available personal, non-commercial free tiers, with no paid features, while making the quota and security limitations visible.
- Leave account data separation ready for a future multi-user version.

## Non-goals

- Provisioning Vercel, Atlas, domains, billing settings, or credentials.
- Deploying a production backend or producing a new APK before a real API URL and secrets are available.
- Enabling public registration, adding password recovery, adding FCM, or changing local alarm behavior.
- Guaranteeing that the service remains free forever.
- Supporting cross-instance Socket.IO broadcasts or multi-device live synchronization in the first deployment; a future free version may use REST refresh/polling rather than a paid shared realtime service.
- Rewriting the API in another framework or replacing MongoDB.

## Implementation checks

- Local server still builds and starts using its existing workflows.
- Vercel build recognizes the TypeScript entry point and all routes resolve through the chosen function mapping.
- `/health`, `/v1/config`, login, and planner read/write work against a test Atlas database.
- Socket.IO authenticates with the existing token, accepts WebSocket transport, emits `planner:changed`, reconnects after a simulated close, and reloads current planner state.
- A device preview confirms API URL configuration and does not affect local Android reminder scheduling.
- No real secret appears in source control, app resources, logs, or the APK.

## Builder choices

The implementer may choose the concrete Vercel route mapping, function file layout, and MongoDB connection initialization implementation, provided the route contract and constraints above are preserved. If a platform limitation prevents this design from working on Vercel Hobby, stop and report the evidence rather than silently changing hosts or dropping real-time support.
