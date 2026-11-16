package com.surgicalstudyplanner.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.LocalDate

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val today = LocalDate.now()
        val state = ReminderStore.read(context)
        // An alarm held back past midnight still belongs to the day it was set for.
        val day = ReminderContent.fireDate(ReminderScheduler.armedFor(state), today)
        if (state.enabled && ReminderContent.shouldShowOnFire(day, state.lastShownDate)) {
            val content = ReminderContent.compose(state.items, today)
            if (content == null) {
                // Nothing due: take down any earlier summary that is still showing.
                ReminderNotifications.dismiss(context)
            } else if (ReminderNotifications.areEnabled(context)) {
                ReminderNotifications.show(context, content)
            }
            ReminderStore.update(context) { it.copy(lastShownDate = day) }
        }
        ReminderScheduler.arm(context)
    }
}
