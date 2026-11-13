package com.surgicalstudyplanner.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

object AlarmStore {
    private const val PREF = "ssp_native_alarms"
    private const val KEY_REVISIONS = "revisions"
    private const val KEY_DAILY = "daily"
    private const val DAILY_ID = "ssp_daily_revision_summary"
    const val CHANNEL_ID = "study_revisions"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = android.app.NotificationChannel(
                CHANNEL_ID,
                "Study revision reminders",
                android.app.NotificationManager.IMPORTANCE_HIGH,
            )
            channel.description = "Scheduled MS General Surgery and NEET SS revision reminders"
            context.getSystemService(android.app.NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    fun canExact(context: Context): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.getSystemService(android.app.AlarmManager::class.java).canScheduleExactAlarms()

    private fun prefs(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun scheduleRevision(context: Context, id: String, at: Long, title: String, body: String) {
        val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
        val kept = JSONArray()
        for (i in 0 until list.length()) {
            val existing = list.getJSONObject(i)
            if (existing.optString("id") != id) kept.put(existing)
        }
        val item = JSONObject().put("id", id).put("at", at).put("title", title).put("body", body)
        kept.put(item)
        prefs(context).edit().putString(KEY_REVISIONS, kept.toString()).apply()
        scheduleItem(context, item, false)
    }

    fun cancelAllRevisions(context: Context) {
        val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
        val alarmManager = context.getSystemService(android.app.AlarmManager::class.java)
        for (i in 0 until list.length()) {
            val id = list.getJSONObject(i).optString("id")
            val alarmIntent = pending(context, id, false)
            alarmManager.cancel(alarmIntent)
            alarmIntent.cancel()
        }
        prefs(context).edit().putString(KEY_REVISIONS, "[]").apply()
    }

    fun clearAllAlarms(context: Context) {
        cancelAllRevisions(context)
        val dailyIntent = pending(context, DAILY_ID, true)
        context.getSystemService(android.app.AlarmManager::class.java).cancel(dailyIntent)
        dailyIntent.cancel()
        prefs(context).edit().remove(KEY_DAILY).apply()
        androidx.core.app.NotificationManagerCompat.from(context).cancelAll()
    }

    private fun pending(context: Context, id: String, daily: Boolean): android.app.PendingIntent {
        val intent = Intent(context, RevisionAlarmReceiver::class.java).apply {
            action = if (daily) "com.surgicalstudyplanner.DAILY" else "com.surgicalstudyplanner.REVISION"
            putExtra("alarm_id", id)
            putExtra("daily", daily)
        }
        return android.app.PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun scheduleItem(context: Context, item: JSONObject, daily: Boolean) {
        val alarmManager = context.getSystemService(android.app.AlarmManager::class.java)
        val id = item.optString("id")
        val alarmIntent = pending(context, id, daily)
        val at = item.optLong("at", System.currentTimeMillis() + 5_000)
            .coerceAtLeast(System.currentTimeMillis() + 3_000)
        try {
            if (canExact(context)) {
                alarmManager.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, alarmIntent)
            } else {
                alarmManager.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, alarmIntent)
            }
        } catch (_: SecurityException) {
            alarmManager.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, alarmIntent)
        }
    }

    fun scheduleDaily(context: Context, hour: Int, minute: Int, count: Int) {
        val config = JSONObject().put("hour", hour).put("minute", minute).put("count", count)
        prefs(context).edit().putString(KEY_DAILY, config.toString()).apply()
        scheduleNextDaily(context)
    }

    fun scheduleNextDaily(context: Context) {
        val raw = prefs(context).getString(KEY_DAILY, null) ?: return
        val config = JSONObject(raw)
        val calendar = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, config.optInt("hour", 8))
            set(java.util.Calendar.MINUTE, config.optInt("minute", 0))
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(java.util.Calendar.DAY_OF_YEAR, 1)
        }
        val item = JSONObject()
            .put("id", DAILY_ID)
            .put("at", calendar.timeInMillis)
            .put("title", "Surgical Study Planner")
            .put("body", "Your daily study check-in is ready. Open the app to review your schedule.")
        scheduleItem(context, item, true)
    }

    fun restore(context: Context) {
        createChannel(context)
        val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
        for (i in 0 until list.length()) {
            val item = list.getJSONObject(i)
            if (item.optLong("at") > System.currentTimeMillis()) scheduleItem(context, item, false)
        }
        scheduleNextDaily(context)
    }

    fun onFired(context: Context, intent: Intent) {
        val id = intent.getStringExtra("alarm_id") ?: return
        val daily = intent.getBooleanExtra("daily", false)
        if (daily) {
            val config = JSONObject(prefs(context).getString(KEY_DAILY, "{}"))
            val count = config.optInt("count", 0)
            val body = if (count > 0) {
                "You have $count scheduled revision(s). Open the app to review your study queue."
            } else {
                "Your daily study check-in is ready. Open the app to plan your next study session."
            }
            showNotification(context, 9001, "Surgical Study Planner", body)
            scheduleNextDaily(context)
        } else {
            val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
            val kept = JSONArray()
            var title = "Revision reminder"
            var body = "A scheduled topic revision is due."
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                if (item.optString("id") == id) {
                    title = item.optString("title", title)
                    body = item.optString("body", body)
                } else {
                    kept.put(item)
                }
            }
            prefs(context).edit().putString(KEY_REVISIONS, kept.toString()).apply()
            showNotification(context, id.hashCode(), title, body)
        }
    }

    private fun showNotification(context: Context, id: Int, title: String, body: String) {
        val openApp = Intent(context, MainActivity::class.java)
        val contentIntent = android.app.PendingIntent.getActivity(
            context,
            7001,
            openApp,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = androidx.core.app.NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try {
            androidx.core.app.NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // Notification permission may have been denied or revoked by Android.
        }
    }
}

class RevisionAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AlarmStore.onFired(context, intent)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AlarmStore.restore(context)
    }
}
