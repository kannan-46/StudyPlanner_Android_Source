package com.surgicalstudyplanner.app.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.surgicalstudyplanner.app.MainActivity

object ReminderNotifications {
    const val CHANNEL_ID = "revision_reminders"
    const val NOTIFICATION_ID = 7001
    const val FOCUS_CHANNEL_ID = "focus_timer"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Revision reminders", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Daily reminder of revisions due today"
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    fun areEnabled(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL_ID)
            if (ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    fun show(context: Context, content: ReminderContent.Content) {
        createChannel(context)
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("studyplanner://schedule"), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val contentIntent = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied or revoked.
        }
    }

    private fun createFocusChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // High importance: default sound and vibration, shown even with the screen off.
            val channel = NotificationChannel(FOCUS_CHANNEL_ID, "Focus timer", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Tells you when a focus session ends"
            channel.enableVibration(true)
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    /** A one-off alert (focus session ended) on its own channel, with sound and vibration. */
    fun showOneShot(context: Context, id: String, content: ReminderContent.Content) {
        createFocusChannel(context)
        val code = OneShotPlan.requestCode(id)
        val open = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val contentIntent = PendingIntent.getActivity(
            context,
            code,
            open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, FOCUS_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(code, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied or revoked.
        }
    }

    fun dismissOneShot(context: Context, id: String) {
        NotificationManagerCompat.from(context).cancel(OneShotPlan.requestCode(id))
    }

    fun dismiss(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
}
