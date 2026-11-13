# Plan 2 device checklist (run in Plan 3 after deploy)

Device: real Android 14+ phone. Install the debug APK
(`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`) built with
`GOOGLE_WEB_CLIENT_ID` set, against the deployed API. Prerequisite: the debug
SHA-1 is registered as an Android OAuth client.

- [ ] **1. Sign-in and first-run setup.** Fresh install, tap Sign in with
  Google, pick an account, complete every setup step (exam, intervals,
  reminders, topics). Expected: lands on Home; relaunching mid-setup resumes
  at the same step.
- [ ] **2. Add 3 topics, one studied 10 days ago.** Topics tab, Add topic
  three times; set one "studied on" date to 10 days ago. Expected: all three
  listed; the older one has an overdue revision on Home.
- [ ] **3. Complete and undo.** Mark the overdue revision done on Home.
  Expected: it leaves Today and its next date moves forward. Tap Undo in the
  snackbar. Expected: the revision returns and the next date reverts.
- [ ] **4. Snooze.** Snooze a due revision by 1 day. Expected: it leaves Today
  and appears on tomorrow's date in Schedule.
- [ ] **5. Offline save.** Open Add topic, fill it, turn on airplane mode, tap
  Save. Expected: the form stays open with the entered values and a Retry
  action; after turning airplane mode off, Retry saves the topic.
- [ ] **6. Reminder 2 min ahead.** Settings: set the reminder time 2 minutes
  from now with a due revision present. Expected: exactly one notification
  arrives at that time.
- [ ] **7. Reboot.** Set a reminder a few minutes ahead, reboot the phone, wait
  past the reminder time. Expected: the notification shows once after boot
  (not duplicated, not missed).
- [ ] **8. Timezone change.** With a reminder at 08:00, change the device
  timezone. Expected: the next reminder fires at 08:00 in the new local time.
- [ ] **9. Notifications denied.** Deny (or disable in system settings) the
  notification permission. Expected: Home shows the notifications banner and
  Settings > Reminder health shows the problem.
- [ ] **10. Import old backup.** Settings > Backup > Import; choose an old
  WebView backup file. Expected: its topics and mock tests appear in Topics
  and Progress.
- [ ] **11. Second account.** Sign out, sign in with a different Google
  account. Expected: none of the first account's data is visible.
- [ ] **12. Delete account.** Settings > Account > Delete account and confirm.
  Expected: returns to sign-in; signing in again shows empty data.
