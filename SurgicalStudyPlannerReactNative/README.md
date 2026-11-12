# Surgical Study Planner React Native

This folder contains the React Native Android app and Node.js API. The existing WebView project remains in `../SurgicalStudyPlannerAndroid` for reference and JSON export.

## Backend API

The API source is in `server/`. It uses TypeScript, Express, the official MongoDB Node.js driver, and Socket.IO. The API owns authentication and is the only component that connects to Atlas. Never put `MONGODB_URI` or `JWT_SECRET` in the mobile project or APK.

For local development, install Node.js 24 LTS (or a supported Node.js release at least 22.13.0), create a MongoDB Atlas cluster and database user, then copy `server/.env.example` to `server/.env`. Set `MONGODB_URI` to the connection string, replace `JWT_SECRET` with a private random secret of at least 32 bytes, and keep `ALLOW_REGISTRATION=false`. The server selects the database from the connection string's path. Add only the API host's outbound IP addresses to the Atlas network access list; do not open the database to every IP address.

Run the API locally from `server/`:

```powershell
npm install
npm run build
npm run create-owner
npm run dev
```

`create-owner` prompts for the initial email and password; the password input is hidden in an interactive terminal. The password must be at least 12 characters. Public registration returns unavailable unless `ALLOW_REGISTRATION=true` is set on the server. Keep it disabled until the product has an account invitation or email verification and password recovery flow. Create additional accounts only when the product is ready to support them. Every account has a separate planner record, and all planner reads, writes, and live update rooms use the authenticated account ID.

The API endpoints are `POST /v1/auth/login`, `POST /v1/auth/register`, `GET /v1/config`, `GET /v1/planner`, and `PUT /v1/planner`. Planner saves require the version last fetched by the client. If another device saves first, the API returns `409 Conflict` so the app can reload before retrying. Signed-in sessions receive `planner:changed` Socket.IO events with the new version; planner contents are fetched over the authenticated API.

For deployment, run the API on a host that provides a stable public HTTPS URL, set its secrets as host environment variables, and keep Atlas network access limited to that host. The API expects TLS to be provided by the host or its HTTPS reverse proxy. Set `TRUST_PROXY_HOPS` to the number of trusted proxies only when required by that host. The default Socket.IO adapter supports live updates among sessions connected to one API process; if the API is later scaled to multiple processes, configure a Socket.IO-compatible shared adapter such as Redis. Changes made directly in Atlas bypass API events and should be avoided.

No database or hosting account is provisioned by this project. The API can be built and run locally, but phone sign-in requires a deployed API and a real HTTPS address.

## Cloud setup

The app is online-only for planner data. The app talks to the API over HTTPS. Do not put Atlas credentials in the Android app.

The sign-in token is kept in Android's secure credential storage. Planner records are fetched from the API and kept in app memory only while the app is open; planner screens require a working API connection. Android keeps only the alarm schedule needed for reminders while the app is closed, and clears scheduled alarms when the user signs out.

Only one owner account is intended for the first release. User records are separated by account from the start; public registration stays disabled until invitation or verified registration and password recovery are ready. Live updates are delivered to active app sessions. A closed app refreshes from the API when it opens again.

Before switching from the existing app, export its JSON backup from the old app's Settings screen and keep the file. After the new app has a hosted API and you sign in, open Settings → Import JSON backup. The importer validates the file before asking to replace that account's current planner. Missing `tests` in an older backup is treated as an empty mock-test list. JSON exports from the new app keep the old `{ topics, settings, tests }` format.

See [HOSTING.md](HOSTING.md) for the recommended Atlas and API setup, cost ranges, owner account creation, and the API URL needed for an online APK. See also [the hosting research report](../reports/Study%20Planner%20Cloud%20Hosting.md) for the provider comparison and source links.

## Mobile project

The React Native app is in `mobile/`. Set the public API URL at build time with `-PAPI_BASE_URL=https://your-api-host`; the placeholder URL does not connect to a real service.

The generated React Native 0.88.1 Android template uses minSdk 24, compileSdk 37, build tools 37, and targetSdk 36. React Native recommends JDK 17. Its installed package engines accept Node `^22.13.0`, `^24.3.0`, or `>=26.0.0`; Node 25 is outside that range. The bundled Node 24.22.1 runtime was used to install dependencies.

Build a debug APK from PowerShell after installing the Android SDK and JDK required by the React Native template:

```powershell
cd mobile\android
.\gradlew.bat assembleDebug -PAPI_BASE_URL=https://your-api-host
```

The APK output will be `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. A real API URL and deployed backend are required for sign-in and cloud data to work.
