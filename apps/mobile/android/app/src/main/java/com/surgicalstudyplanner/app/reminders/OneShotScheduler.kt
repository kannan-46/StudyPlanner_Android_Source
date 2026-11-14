package com.surgicalstudyplanner.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** One-off alarms that post a notification at a set time (the focus timer's end). */
object OneShotScheduler {
    const val EXTRA_ID = "id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private fun intent(context: Context, id: String) =
        Intent(context, OneShotReceiver::class.java).setAction(OneShotPlan.action(id))

    /** Idempotent per id: replaces any earlier alarm with the same id. */
    fun schedule(context: Context, alarm: OneShotPlan.Alarm) {
        val pi = PendingIntent.getBroadcast(
            context,
            OneShotPlan.requestCode(alarm.id),
            intent(context, alarm.id)
                .putExtra(EXTRA_ID, alarm.id)
                .putExtra(EXTRA_TITLE, alarm.title)
                .putExtra(EXTRA_BODY, alarm.body),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        try {
            if (ReminderScheduler.canScheduleExact(context)) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.atMillis, pi)
            } else {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.atMillis, pi)
            }
        } catch (_: SecurityException) {
            // Exact-alarm access revoked between the check and the call.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.atMillis, pi)
        }
    }

    /** Cancels the alarm and removes its notification if it already showed. */
    fun cancel(context: Context, id: String) {
        val pi = PendingIntent.getBroadcast(
            context,
            OneShotPlan.requestCode(id),
            intent(context, id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE,
        )
        if (pi != null) {
            context.getSystemService(AlarmManager::class.java).cancel(pi)
            pi.cancel()
        }
        ReminderNotifications.dismissOneShot(context, id)
    }
}
