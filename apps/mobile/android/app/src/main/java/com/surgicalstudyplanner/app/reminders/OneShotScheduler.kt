package com.surgicalstudyplanner.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** One-off alarms that post a notification at a set time (the focus timer's end). */
object OneShotScheduler {
    const val EXTRA_ID = "id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_AT = "at"

    /** Remembers each set alarm's time by id, so stale or duplicate firings are ignored. */
    private const val PREF = "ssp_one_shots"
    private val LOCK = Any()

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    private fun intent(context: Context, action: String) =
        Intent(context, OneShotReceiver::class.java).setAction(action)

    private fun pendingIntent(context: Context, alarm: OneShotPlan.Alarm, action: String) =
        PendingIntent.getBroadcast(
            context,
            OneShotPlan.requestCode(alarm.id),
            intent(context, action)
                .putExtra(EXTRA_ID, alarm.id)
                .putExtra(EXTRA_TITLE, alarm.title)
                .putExtra(EXTRA_BODY, alarm.body)
                .putExtra(EXTRA_AT, alarm.atMillis),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    /**
     * Idempotent per id: replaces any earlier alarm with the same id. Returns
     * true when the alarm is exact. Without exact-alarm access it sets two
     * alarms for the same time: a 10-minute window (on time while the phone is
     * awake) and an allow-while-idle one (still fires with the phone locked and
     * idle). Only the first to fire alerts.
     */
    fun schedule(context: Context, alarm: OneShotPlan.Alarm): Boolean {
        synchronized(LOCK) { prefs(context).edit().putLong(alarm.id, alarm.atMillis).commit() }
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val main = pendingIntent(context, alarm, OneShotPlan.action(alarm.id))
        if (ReminderScheduler.canScheduleExact(context)) {
            try {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.atMillis, main)
                cancelAlarm(context, alarm.id, OneShotPlan.idleAction(alarm.id))
                return true
            } catch (_: SecurityException) {
                // Exact-alarm access revoked between the check and the call.
            }
        }
        alarmManager.setWindow(AlarmManager.RTC_WAKEUP, alarm.atMillis, WINDOW_MILLIS, main)
        val idle = pendingIntent(context, alarm, OneShotPlan.idleAction(alarm.id))
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.atMillis, idle)
        return false
    }

    /**
     * Called when an alarm fires. Returns true when it should alert, and marks
     * the id as handled, so its twin (or a cancelled alarm already on its way)
     * stays quiet.
     */
    fun claim(context: Context, id: String, firedAt: Long?): Boolean = synchronized(LOCK) {
        val p = prefs(context)
        val stored = if (p.contains(id)) p.getLong(id, 0L) else null
        val current = OneShotPlan.isCurrent(stored, firedAt)
        if (current) p.edit().remove(id).commit()
        current
    }

    private fun cancelAlarm(context: Context, id: String, action: String) {
        val pi = PendingIntent.getBroadcast(
            context,
            OneShotPlan.requestCode(id),
            intent(context, action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE,
        )
        if (pi != null) {
            context.getSystemService(AlarmManager::class.java).cancel(pi)
            pi.cancel()
        }
    }

    /** Cancels the alarm(s) for [id] but leaves a notification that already showed. */
    fun cancelAlarmOnly(context: Context, id: String) {
        synchronized(LOCK) { prefs(context).edit().remove(id).commit() }
        cancelAlarm(context, id, OneShotPlan.action(id))
        cancelAlarm(context, id, OneShotPlan.idleAction(id))
    }

    /** Cancels the alarm and removes its notification if it already showed. */
    fun cancel(context: Context, id: String) {
        cancelAlarmOnly(context, id)
        ReminderNotifications.dismissOneShot(context, id)
    }

    /** Cancels every one-shot alarm that is set (sign-out). */
    fun cancelAll(context: Context) {
        val ids = synchronized(LOCK) { prefs(context).all.keys.toSet() } + KNOWN_IDS
        ids.filter { runCatching { OneShotPlan.validateId(it) }.isSuccess }.forEach { cancel(context, it) }
        synchronized(LOCK) { prefs(context).edit().clear().commit() }
    }

    /** Android 12+ makes a window at least 10 minutes for apps without exact-alarm access. */
    private const val WINDOW_MILLIS = 10 * 60 * 1000L

    /** Ids the app uses, cancelled on sign-out even if an older version set them. */
    private val KNOWN_IDS = setOf("focus_timer")
}
