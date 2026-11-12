# Surgical Study Planner React Native

This folder contains the React Native Android app and its planned Node.js API. The existing WebView project remains in `../SurgicalStudyPlannerAndroid` for reference and JSON export.

## Cloud setup

The app is online-only for planner data. The API source will live in `server/`; deploy it to a Node.js host and configure its MongoDB Atlas connection string and signing secret on the server. The app talks to that API over HTTPS. Do not put Atlas credentials in the Android app.

Only one owner account is intended for the first release. User records are separated by account from the start; public registration can be enabled later. Live updates are delivered to active app sessions. A closed app refreshes from the API when it opens again.

Before switching from the existing app, export its JSON backup if its topics, settings, and mock-test scores need to move to the new app.

## Mobile project

The React Native app is in `mobile/`. Set the public API URL at build time with `-PAPI_BASE_URL=https://your-api-host/...`; the placeholder URL does not connect to a real service.

The generated React Native 0.88.1 Android template uses minSdk 24, compileSdk 37, build tools 37, and targetSdk 36. React Native recommends JDK 17. Its installed package engines accept Node `^22.13.0`, `^24.3.0`, or `>=26.0.0`; Node 25 is outside that range. The bundled Node 24.22.1 runtime was used to install dependencies.

Build a debug APK from PowerShell after installing the Android SDK and JDK required by the React Native template:

```powershell
cd mobile\android
.\gradlew.bat assembleDebug -PAPI_BASE_URL=https://your-api-host
```

The APK output will be `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. A real API URL and deployed backend are required for sign-in and cloud data to work.
