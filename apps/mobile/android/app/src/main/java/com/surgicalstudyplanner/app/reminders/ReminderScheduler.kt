package com.surgicalstudyplanner.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.LocalTime
import java.time.ZonedDateTime

object ReminderScheduler {
    const val REQUEST_CODE = 7001
    private const val WINDOW_MILLIS = 10 * 60 * 1000L

    /** Pure: next local occurrence of hour:minute strictly after [now]. DST gaps resolve forward. */
    fun nextFireTime(now: ZonedDateTime, hour: Int, minute: Int): ZonedDateTime {
        val time = LocalTime.of(hour, minute)
        val today = ZonedDateTime.of(now.toLocalDate(), time, now.zone)
        return if (today.isAfter(now)) today
        else ZonedDateTime.of(now.toLocalDate().plusDays(1), time, now.zone)
    }

    private fun pendingIntent(context: Context, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, ReminderReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or flags,
        )

    fun canScheduleExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    /** Idempotent: replaces any existing alarm. Returns the scheduled epoch millis, or null if disabled. */
    fun arm(context: Context): Long? {
        val state = ReminderStore.read(context)
        if (!state.enabled) {
            cancel(context)
            return null
        }
        val at = nextFireTime(ZonedDateTime.now(), state.hour, state.minute).toInstant().toEpochMilli()
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val pi = pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT)!!
        try {
            if (canScheduleExact(context)) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                alarmManager.setWindow(AlarmManager.RTC_WAKEUP, at, WINDOW_MILLIS, pi)
            }
        } catch (_: SecurityException) {
            // Exact-alarm access revoked between the check and the call.
            alarmManager.setWindow(AlarmManager.RTC_WAKEUP, at, WINDOW_MILLIS, pi)
        }
        return at
    }

    fun nextFireAtMillis(context: Context): Long? {
        val state = ReminderStore.read(context)
        if (!state.enabled) return null
        return nextFireTime(ZonedDateTime.now(), state.hour, state.minute).toInstant().toEpochMilli()
    }

    fun cancel(context: Context) {
        val pi = pendingIntent(context, PendingIntent.FLAG_NO_CREATE) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pi)
        pi.cancel()
    }
}
