package com.surgicalstudyplanner.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class OneShotReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(OneShotScheduler.EXTRA_ID) ?: return
        val title = intent.getStringExtra(OneShotScheduler.EXTRA_TITLE) ?: return
        val body = intent.getStringExtra(OneShotScheduler.EXTRA_BODY) ?: ""
        ReminderNotifications.showOneShot(context, id, ReminderContent.Content(title, body))
    }
}
