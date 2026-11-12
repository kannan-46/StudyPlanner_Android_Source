# Surgical Study Planner — Android native project (v2.0.0)

This is a native Android Studio project wrapping the study planner in an Android WebView, with Kotlin `AlarmManager` integration for native notifications. It is **Android source code, not a precompiled APK**.

## Included in this version

- MS General Surgery and NEET SS topic tracking, including separate dashboard counts and exam filtering
- Default spaced-revision intervals: **4, 7, 15, 30, 60 and 90 days** (customisable)
- Per-revision native Android alarms scheduled at the selected daily reminder time
- Daily study check-in notification
- Alarm persistence in native SharedPreferences and rescheduling after reboot / app update
- Android notification channel and Android 13+ notification permission request
- Android 12+ exact-alarm access flow; inexact idle-safe fallback if exact-alarm access is not granted
- Calendar/upcoming revision view, topic progress, subject distribution
- Local backup export through Android's document picker and JSON restore through the file picker
- Dark mode, 25-minute Pomodoro study timer, mock-test score tracker
- Offline-first topic data stored locally on the device

## Build a debug APK with Android Studio

1. Install the current Android Studio release and Android SDK Platform 35.
2. Open this `SurgicalStudyPlannerAndroid` folder as an existing project.
3. Allow Gradle sync to download the Android Gradle Plugin, Kotlin plugin and AndroidX Core dependency.
4. Select **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. The debug APK will be at `app/build/outputs/apk/debug/app-debug.apk`.

Command-line equivalent after Gradle is installed and Android SDK is configured:

```bash
gradle assembleDebug
```

## Optional GitHub Actions build

Push this folder to a GitHub repository. The included workflow `.github/workflows/android-apk.yml` builds a debug APK on Ubuntu and publishes it as an Actions artifact named `surgical-study-planner-debug-apk`.

## First launch on Android

1. Install the APK.
2. Allow notifications when Android asks.
3. In the app, open **Settings & backup → Enable reliable Android alarms**.
4. On Android 12+, enable **Alarms & reminders / Allow setting alarms and reminders** in the system screen, then return to the app.
5. Set the daily reminder time and save. Add topics; the app schedules every pending revision with the configured interval.

### Reliability notes

The app uses `AlarmManager.setExactAndAllowWhileIdle` when Android grants exact-alarm access. Without that access, it falls back to `setAndAllowWhileIdle`, which is not exact. Android OEM battery managers can still impose additional restrictions; users should allow background activity / auto-start if their device offers those controls. Notifications also require the app's notification permission and an enabled notification channel. A daily check-in is scheduled independently from individual topic revision alarms.

## Data and privacy

Study topics, revision history, preferences and mock-test scores are stored locally on the device. There is no account, cloud sync or analytics service in this project. Use Export backup before uninstalling or clearing app data.
