package com.surgicalstudyplanner.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class OneShotReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(OneShotScheduler.EXTRA_ID) ?: return
        val title = intent.getStringExtra(OneShotScheduler.EXTRA_TITLE) ?: return
        val body = intent.getStringExtra(OneShotScheduler.EXTRA_BODY) ?: ""
        val firedAt = if (intent.hasExtra(OneShotScheduler.EXTRA_AT)) {
            intent.getLongExtra(OneShotScheduler.EXTRA_AT, 0L)
        } else null
        // A cancelled alarm already on its way, or the twin of one that fired: stay quiet.
        if (!OneShotScheduler.claim(context, id, firedAt)) return
        // Both alarms of a pair: the one that did not fire is no longer needed.
        OneShotScheduler.cancelAlarmOnly(context, id)
        // With the app open, the app itself tells the user (message and vibration).
        if (AppVisibility.isInFront(context)) return
        ReminderNotifications.showOneShot(context, id, ReminderContent.Content(title, body))
    }
}
