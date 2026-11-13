# React Native Migration Design

**Status:** Proposed for review

## Intent

Replace the current WebView-based Android interface with a React Native app while preserving the Surgical Study Planner's day-to-day workflow, native reminders, and downloadable APK delivery. Store planner data in MongoDB Atlas and show cloud changes live across a user's signed-in devices. The data screens require an internet connection.

## Goals

- Rebuild the Home, Topics, Schedule, Progress, and Settings screens in React Native.
- Preserve topic management, exam filters, revision intervals, revision completion and snoozing, progress summaries, subject counts, mock-test tracking, dark mode, and the 25-minute study timer.
- Store topics, revisions, settings, and mock-test results in MongoDB Atlas, scoped to an authenticated user.
- Start with one owner account in use while keeping user records and planner data separated by account from the first release.
- Allow additional private accounts to be enabled later without changing the planner data model.
- Show updates to the same user's data on other connected devices without requiring a manual refresh.
- Require an internet connection for planner data and edits.
- Keep only the local alarm schedule and authentication session on the device as needed for Android alarm delivery and signed-in sessions.
- Preserve native Android revision alarms, daily reminders, notification permissions, exact-alarm access, and alarm restoration after reboot or app update.
- Keep JSON backup export and import.
- Produce an installable Android debug APK.

## Non-goals

- No analytics or shared/team workspaces in this version.
- No sharing of one planner between multiple accounts in this version; each account owns a private planner.
- No iOS app in this migration.
- No visual redesign beyond what is needed to implement the existing screens in React Native.
- No offline viewing or editing of planner data.

## Architecture

- Use a bare React Native Android project with TypeScript for screens and planner logic. Bare React Native is the call here because the app needs Android-specific alarm and receiver integration.
- Use Android minSdk 24, the minimum in the generated React Native 0.88.1 template. The existing WebView app supports API 23, so the migrated app will no longer install on Android 6 devices.
- Use MongoDB Atlas as the source of truth for topics, revision records, mock-test results, and settings.
- Add a Node.js and Express HTTPS API connected to Atlas with MongoDB's server-side driver. The React Native app talks to the API; database credentials stay on the server and are never shipped in the APK.
- Require a personal user account for cloud access. Each API request is authenticated, and the API scopes records to the user ID in that account's token. Initially, one owner account is created and public registration is disabled; registration can be enabled later without changing the per-user data model. The initial owner can use the same account across devices.
- Add an authenticated WebSocket channel for live updates while app sessions are connected. Publish updates after successful API writes; use MongoDB change streams if updates may also originate outside the API process. Refresh the data when the app returns to the foreground or reconnects. Live updates apply to active connections; a closed app refreshes from the cloud when opened again.
- On the phone, keep the last downloaded alarm schedule in Android `SharedPreferences` so native `AlarmManager` reminders can still fire when the app is closed. This schedule cache does not enable offline data screens or edits.
- Keep the alarm implementation native in Kotlin. Expose a React Native native module for scheduling and cancelling revision alarms, scheduling the daily reminder, requesting exact-alarm access, and invoking backup file operations.
- Keep Android `AlarmManager`, notification channels, `BroadcastReceiver`s, and reboot/update rescheduling. Store the native alarm snapshot in `SharedPreferences` so Android can restore alarms without starting the React Native UI.
- Do not connect the mobile app directly to Atlas with a database username/password. An APK is distributed to users and its bundled credentials can be extracted; database access should be controlled by the authenticated server API. Atlas also requires database authentication and network access configuration. See [Atlas network security](https://www.mongodb.com/docs/atlas/architecture/current/network-security/).
- Treat MongoDB Atlas Device Sync and the Atlas Data API as unavailable for this design: MongoDB documents their end-of-life/deprecation and recommends building an API with a MongoDB driver and server framework. See [Device SDK deprecation](https://www.mongodb.com/docs/device-sdks-deprecation/) and [Data API migration guidance](https://www.mongodb.com/docs/data-api-deprecation/).

## Existing-data migration

The current app stores planner data in WebView `localStorage`; the React Native app cannot read that storage directly. The supported migration path is to export a JSON backup from the current app and import it into the React Native app. The importer will validate the backup and upload its topics, revisions, settings, and mock tests through the authenticated API. Once import succeeds, the app synchronizes the local Android alarm schedule.

## Alarm behavior

- Each incomplete revision receives a native Android alarm at the selected daily reminder time on its scheduled date.
- Overdue revisions are scheduled for a near-future alert, matching the current app behavior.
- A daily check-in notification repeats on the next day after it fires.
- Use exact alarms when Android grants access; otherwise retain the inexact fallback.
- Because data screens require internet, the app must show a clear connection error and retry path when Atlas API calls fail. Previously scheduled local alarms continue from the saved alarm snapshot.
- Ask for notification permission where Android requires it and provide the existing exact-alarm settings flow.
- Restore future alarms after reboot and app update.

## APK and project handling

- Keep the existing WebView project intact as a rollback and data-export source. Put the React Native project in a sibling folder named `SurgicalStudyPlannerReactNative`.
- Build a debug APK for direct download and installation. A release APK intended for public distribution requires a release signing key.
- Preserve the existing application ID if possible. Installing over an existing copy also requires a compatible signing certificate; if that is unavailable, the new APK may need a distinct application ID and the old app can remain installed for data export.

## Hosting prerequisite

The React Native and API source can be built before a hosting provider is chosen. To use online sign-in, MongoDB data, and live updates from a phone, the API must eventually run at a public HTTPS address and be configured with the Atlas connection secret. MongoDB Atlas supplies the database; it does not supply the API host for this design. Keep the provider choice open until deployment is planned.

## Open decision

This design assumes one owner account at first, with private per-user records ready for additional accounts later. Login, a hosted API, Atlas configuration, and network access are required for planner data. Locally scheduled alarms continue from Android's saved schedule if the app is closed or temporarily disconnected. The hosting provider and live-update transport details remain implementation decisions to settle before deployment. MongoDB change streams can notify server applications about database changes; see [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changestreams/).
