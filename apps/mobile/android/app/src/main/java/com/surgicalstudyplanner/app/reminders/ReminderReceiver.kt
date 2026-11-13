package com.surgicalstudyplanner.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.LocalDate

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val today = LocalDate.now()
        val state = ReminderStore.read(context)
        if (state.enabled && ReminderContent.shouldShowOnFire(today, state.lastShownDate)) {
            val content = ReminderContent.compose(state.items, today)
            if (content != null && ReminderNotifications.areEnabled(context)) {
                ReminderNotifications.show(context, content)
            }
        }
        ReminderStore.update(context) { it.copy(lastShownDate = today) }
        ReminderScheduler.arm(context)
    }
}
