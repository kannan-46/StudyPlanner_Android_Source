package com.surgicalstudyplanner.app.reminders

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.surgicalstudyplanner.app.MainActivity
import com.surgicalstudyplanner.app.R

object ReminderNotifications {
    const val CHANNEL_ID = "revision_reminders"

    /** The daily summary. */
    const val NOTIFICATION_ID = 7001

    /** The Reminder health test, kept apart so it never replaces the real summary. */
    const val TEST_NOTIFICATION_ID = 7003
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

    /** Whether the focus-timer alert can show (app notifications and its own channel are on). */
    fun focusAlertsEnabled(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = context.getSystemService(NotificationManager::class.java).getNotificationChannel(FOCUS_CHANNEL_ID)
            if (ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    private fun NotificationCompat.Builder.branded(context: Context): NotificationCompat.Builder =
        setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))

    /**
     * Posts the daily summary (or, with [id], another notification on the same
     * channel). [silent] updates a summary that is already showing without a
     * new sound or vibration.
     */
    fun show(
        context: Context,
        content: ReminderContent.Content,
        id: Int = NOTIFICATION_ID,
        silent: Boolean = false,
    ) {
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
            .branded(context)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(silent)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied or revoked.
        }
    }

    /** The daily summary as it is showing now, or null when it is not in the notification shade. */
    fun postedSummary(context: Context): ReminderContent.Content? {
        val active = try {
            context.getSystemService(NotificationManager::class.java).activeNotifications
        } catch (_: Exception) {
            return null
        }
        val posted = active.firstOrNull { it.id == NOTIFICATION_ID && it.tag == null } ?: return null
        val extras = posted.notification.extras
        return ReminderContent.Content(
            extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "",
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: "",
        )
    }

    /**
     * Brings a summary that is still showing in line with [fresh] (the newly
     * synced snapshot): removed when nothing is due, quietly updated when the
     * counts changed. A summary the user already swiped away never comes back.
     */
    fun refreshPosted(context: Context, fresh: ReminderContent.Content?) {
        when (ReminderContent.refreshAction(postedSummary(context), fresh)) {
            ReminderContent.RefreshAction.DISMISS -> dismiss(context)
            ReminderContent.RefreshAction.UPDATE -> if (fresh != null && areEnabled(context)) {
                show(context, fresh, silent = true)
            }
            ReminderContent.RefreshAction.NONE -> Unit
        }
    }

    private fun createFocusChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // High importance: default sound and vibration, heads-up, shown even with the screen off.
            val channel = NotificationChannel(FOCUS_CHANNEL_ID, "Focus timer", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Tells you when a focus session ends"
            channel.enableVibration(true)
            channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
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
            .branded(context)
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            // Nothing private in "Focus session done": show it in full on the lock screen.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
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

    /** Removes the daily summary. */
    fun dismiss(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    /** Removes every notification this app posted (summary, test and focus alerts). Used on sign-out. */
    fun dismissAll(context: Context) {
        NotificationManagerCompat.from(context).cancelAll()
    }
}
