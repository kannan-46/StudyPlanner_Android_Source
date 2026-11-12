# Hosting setup for the planner

This guide describes a first live deployment for one owner, with a path to private multi-user accounts later. It does not create cloud accounts or deploy services. Prices below were checked on 12 November 2026; check the provider dashboards before choosing a plan.

## Recommended first setup

Use one Node.js API service on Railway Pro and MongoDB Atlas Flex. Railway's $20/month subscription is credited toward resource usage and provides a stable outbound IPv4 address that Atlas can allowlist. Atlas Flex currently costs $8–$30 per 30 days and keeps one daily snapshot for eight days. This puts the starting spend at roughly $28–$50 per month before tax and any use above included Railway credit. The alternatives and tradeoffs are in [the hosting research report](../reports/Study%20Planner%20Cloud%20Hosting.md).

Use Atlas Free while learning or validating deployment, but keep regular JSON exports and expect pauses after prolonged inactivity. Move to Flex when the owner relies on the planner and wants automatic daily snapshots. Flex does not include point-in-time restore or the uptime SLA documented for Atlas M10 and larger dedicated clusters.

The data flow is:

```text
Android app -- HTTPS / Socket.IO --> Railway API -- TLS + allowlisted IP --> MongoDB Atlas
```

The Android app contains the API's public HTTPS address only. Keep the MongoDB connection string and JWT signing secret on the API host. The API uses one least-privilege Atlas database user and scopes every planner operation to the signed-in app account.

## Create and restrict the Atlas database

1. Create a MongoDB Atlas project and a cluster. Choose Flex for the first live planner if daily backups matter; choose Free only for a trial. Select the nearest region that Atlas offers for that tier. Confirm region and price in the cluster creation screen because Free and Flex are not available in every listed region.
2. Create an Atlas **database user** for this app. Give it read/write access only to the `surgical_study_planner` database. This is different from the Atlas website login.
3. In Atlas **Network Access**, add the static outbound IPv4 address shown for the Railway service after its region is selected. Use the narrowest address rule available. Do not add `0.0.0.0/0`.
4. Copy the Atlas connection string and replace its username/password placeholders. Keep special characters in the password URL-encoded. The database name belongs in the URI path, for example `/surgical_study_planner`.

Atlas Free and Flex use public TLS connections and do not provide private endpoints. Railway's static outbound address gives Atlas a narrow allowlist entry; the address is shared with other Railway customers, so the database password, TLS, least privilege, and API authentication still matter.

## Deploy the API on Railway

1. Put this repository in a private GitHub repository and connect that repository to a new Railway project. Select the repository folder `SurgicalStudyPlannerReactNative/server` as the service root directory.
2. Choose the Singapore region as the starting API location, then enable the service's static outbound IPv4 address. Add that address to the Atlas project IP access list as described above. Confirm whether Atlas offers a nearby cluster region for the chosen tier; use the same cloud region when practical.
3. Configure the service to use Node.js 22.13 or newer. Set the build command to `npm ci --include=dev && npm run build` and the start command to `npm start`.
4. Add these service variables in Railway's dashboard. Never commit real values or copy them into the mobile folder.

   | Variable | Value |
   | --- | --- |
   | `MONGODB_URI` | Atlas connection string for `surgical_study_planner` |
   | `JWT_SECRET` | A private random secret, at least 32 bytes |
   | `ALLOW_REGISTRATION` | `false` |
   | `TRUST_PROXY_HOPS` | Leave at `0` unless Railway's current proxy guidance confirms the trusted hop count for this service |
   | `PORT` | Let Railway provide the port, unless its current service setup requires an explicit value |

5. Deploy the service and generate a Railway public domain with HTTPS. Open `https://<your-domain>/health`; it should return `{"status":"ok"}`. This domain is the API base URL. Do not add `/v1` to the build-time base URL.
6. Check Railway and Atlas logs for a successful database connection. Keep public registration disabled.

## Create the owner account

The API does not ship with a default account or password. Create the first owner once, after Atlas and the service variables are ready:

1. In Atlas Network Access, temporarily add your current public IP as a `/32` rule.
2. From `SurgicalStudyPlannerReactNative/server`, copy `.env.example` to `.env` and set `MONGODB_URI` to the same Atlas URI and `JWT_SECRET` to a private random secret of at least 32 bytes. The local `.env` is ignored by Git. Do not share it or commit it.
3. In an interactive PowerShell terminal, run `npm ci` and then `npm run create-owner`. Enter the owner's email and a unique password of at least 12 characters when prompted. The password is hidden in an interactive terminal.
4. Remove the temporary `/32` rule from Atlas Network Access. Leave only the API service's outbound address.
5. Open the app and sign in with this owner account.

If owner creation fails, check the Atlas IP access list, database username/password, URL-encoding, and database name. Do not enable public registration as a workaround.

## Build an APK that can connect

A final cloud-connected APK cannot be built until the API has a real HTTPS domain. From the repository root, install the Android SDK components required by this project and JDK 17, then run in PowerShell:

```powershell
cd SurgicalStudyPlannerReactNative\mobile\android
.\gradlew.bat assembleDebug -PAPI_BASE_URL=https://your-service.up.railway.app
```

Replace `your-service.up.railway.app` with the actual Railway domain before building.

The APK is written to `SurgicalStudyPlannerReactNative/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. It uses package ID `com.surgicalstudyplanner.app`, version code `3`, and version name `3.0.0`. Copy the APK to the Android phone and install it; Android may ask permission to install apps from that file source. This debug APK is suitable for sideloading and sharing for evaluation. A Play Store release needs a separately managed release signing key and a release build.

Do not ship an APK built with the placeholder `https://api.example.invalid` as if it were connected; login, cloud planner data, and live updates need the real API URL. The deployed API URL is public configuration, while Atlas credentials and the JWT secret remain server-only.

## Add users and grow safely

The database already stores a separate planner per account, and the API derives ownership from the verified sign-in token. When additional people are ready, implement invitations or verified registration and password recovery before changing `ALLOW_REGISTRATION`. Do not create one Atlas database user per app user.

Keep a single API process while Socket.IO uses in-memory rooms. If the API later runs multiple processes, add a shared Socket.IO adapter such as Redis so live change notices reach sessions connected to other processes. The app fetches planner data from the API on reconnect and foreground; Socket.IO carries update notices, not the durable planner itself.

Export planner JSON regularly and test a restore procedure. Atlas Flex retains daily snapshots for eight days, so changes made after the previous daily snapshot can still be lost. Revisit dedicated Atlas tiers if point-in-time restore, private networking, predictable dedicated capacity, or a documented uptime commitment becomes necessary.
