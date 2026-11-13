package com.surgicalstudyplanner.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.ZonedDateTime

/** Restores the daily alarm after reboot, app update, clock/timezone change or exact-alarm grant. */
class SystemEventsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in HANDLED) return
        ReminderNotifications.createChannel(context)
        ReminderScheduler.arm(context)
        val now = ZonedDateTime.now()
        val state = ReminderStore.read(context)
        val missedEligible = intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        // Clock/timezone/permission changes only re-arm; missed catch-up is for reboot and update.
        if (missedEligible && state.enabled && ReminderContent.shouldShowMissed(now, state.hour, state.minute, state.lastShownDate)) {
            val content = ReminderContent.compose(state.items, now.toLocalDate())
            if (content != null && ReminderNotifications.areEnabled(context)) {
                ReminderNotifications.show(context, content)
            }
            ReminderStore.update(context) { it.copy(lastShownDate = now.toLocalDate()) }
        }
    }

    companion object {
        // AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED (API 31); only delivered on 31+.
        const val ACTION_EXACT_ALARM_STATE = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
        private val HANDLED = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            ACTION_EXACT_ALARM_STATE,
        )
    }
}
