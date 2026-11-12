# React Native Migration Design

**Status:** Proposed for review

## Intent

Replace the current WebView-based Android interface with a React Native app while preserving the Surgical Study Planner's day-to-day workflow, offline use, native reminders, and downloadable APK delivery.

## Goals

- Rebuild the Home, Topics, Schedule, Progress, and Settings screens in React Native.
- Preserve topic management, exam filters, revision intervals, revision completion and snoozing, progress summaries, subject counts, mock-test tracking, dark mode, and the 25-minute study timer.
- Keep topics and user data on the device in a local SQLite database.
- Preserve native Android revision alarms, daily reminders, notification permissions, exact-alarm access, and alarm restoration after reboot or app update.
- Keep JSON backup export and import.
- Produce an installable Android debug APK.

## Non-goals

- No user accounts, cloud sync, analytics, or hosted backend in this version.
- No iOS app in this migration.
- No visual redesign beyond what is needed to implement the existing screens in React Native.

## Architecture

- Use a bare React Native Android project with TypeScript for screens and planner logic. Bare React Native is the call here because the app needs Android-specific alarm and receiver integration.
- Use SQLite for structured app data. Store topics, revision records, mock-test results, and settings locally. The app remains usable offline.
- Keep the alarm implementation native in Kotlin. Expose a React Native native module for scheduling and cancelling revision alarms, scheduling the daily reminder, requesting exact-alarm access, and invoking backup file operations.
- Keep Android `AlarmManager`, notification channels, `BroadcastReceiver`s, and reboot/update rescheduling. Store the native alarm snapshot in `SharedPreferences` so Android can restore alarms without starting the React Native UI.
- Do not add a backend unless cross-device sync, accounts, or remote administration becomes a requirement.

## Existing-data migration

The current app stores planner data in WebView `localStorage`; the React Native app cannot read that storage through its normal SQLite connection. The supported migration path is to export a JSON backup from the current app and import it into the React Native app. The importer will validate the backup, load its topics, revisions, settings, and mock tests into SQLite, then synchronize pending alarms.

## Alarm behavior

- Each incomplete revision receives a native Android alarm at the selected daily reminder time on its scheduled date.
- Overdue revisions are scheduled for a near-future alert, matching the current app behavior.
- A daily check-in notification repeats on the next day after it fires.
- Use exact alarms when Android grants access; otherwise retain the inexact fallback.
- Ask for notification permission where Android requires it and provide the existing exact-alarm settings flow.
- Restore future alarms after reboot and app update.

## APK and project handling

- Keep the existing WebView project intact as a rollback and data-export source. Put the React Native project in a sibling folder named `SurgicalStudyPlannerReactNative`.
- Build a debug APK for direct download and installation. A release APK intended for public distribution requires a release signing key.
- Preserve the existing application ID if possible. Installing over an existing copy also requires a compatible signing certificate; if that is unavailable, the new APK may need a distinct application ID and the old app can remain installed for data export.

## Open decision

This design assumes one-device, offline use with no login or cloud synchronization. If the user needs the same data to appear on multiple devices, add a backend and account-based sync as a separate scope.
