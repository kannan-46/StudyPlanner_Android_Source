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

    fun dismiss(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
}
