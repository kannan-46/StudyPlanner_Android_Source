package com.surgicalstudyplanner.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

object ReminderScheduler {
    const val REQUEST_CODE = 7001

    /** Second alarm used only without exact-alarm access: it may fire while the phone is idle. */
    const val BACKUP_REQUEST_CODE = 7004
    private const val WINDOW_MILLIS = 10 * 60 * 1000L

    /**
     * How long an inexact alarm may still be on its way. Android can hold an
     * allow-while-idle alarm up to about an hour, plus the 10-minute window.
     */
    val LATE_GRACE: Duration = Duration.ofMinutes(70)

    /** Why the next daily reminder will not show, as reported to JS by getStatus. */
    const val BLOCKED_OFF = "off"
    const val BLOCKED_NOTIFICATIONS = "notificationsOff"
    const val BLOCKED_NOTHING_DUE = "nothingDue"

    /** Pure: next local occurrence of hour:minute strictly after [now]. DST gaps resolve forward. */
    fun nextFireTime(now: ZonedDateTime, hour: Int, minute: Int): ZonedDateTime {
        val time = LocalTime.of(hour, minute)
        val today = ZonedDateTime.of(now.toLocalDate(), time, now.zone)
        return if (today.isAfter(now)) today
        else ZonedDateTime.of(now.toLocalDate().plusDays(1), time, now.zone)
    }

    /**
     * Pure: when the daily alarm should be set for. Normally [nextFireTime],
     * but an alarm that is already due and has not fired yet (Android holds
     * inexact alarms back) is kept, so re-arming (every snapshot sync) never
     * pushes today's reminder to tomorrow. A time in the past fires at once.
     */
    fun planFire(
        now: ZonedDateTime,
        hour: Int,
        minute: Int,
        lastShownDate: LocalDate?,
        armedAt: ZonedDateTime?,
    ): ZonedDateTime {
        if (armedAt != null &&
            !armedAt.isAfter(now) &&
            armedAt.hour == hour &&
            armedAt.minute == minute &&
            lastShownDate != armedAt.toLocalDate() &&
            Duration.between(armedAt, now) <= LATE_GRACE
        ) {
            return armedAt
        }
        return nextFireTime(now, hour, minute)
    }

    /**
     * Pure: the first daily alarm that will actually post a summary, or null
     * when nothing in [items] (the synced 60-day snapshot) is due. Skips a day
     * whose summary already showed. Overdue items stay due every day.
     */
    fun nextShowTime(
        now: ZonedDateTime,
        hour: Int,
        minute: Int,
        lastShownDate: LocalDate?,
        items: List<ReminderContent.Item>,
        armedAt: ZonedDateTime? = null,
    ): ZonedDateTime? {
        val firstDue = items.minOfOrNull { it.dueOn } ?: return null
        val fire = planFire(now, hour, minute, lastShownDate, armedAt)
        var fireDate = fire.toLocalDate()
        if (fireDate == lastShownDate) fireDate = fireDate.plusDays(1)
        val showDate = maxOf(fireDate, firstDue)
        return if (showDate == fire.toLocalDate()) fire
        else ZonedDateTime.of(showDate, LocalTime.of(hour, minute), now.zone)
    }

    /** Pure: why the next reminder will not show, or null when it will. Checked in this order. */
    fun blockedReason(dailyReminderEnabled: Boolean, notificationsEnabled: Boolean, hasNextShow: Boolean): String? =
        when {
            !dailyReminderEnabled -> BLOCKED_OFF
            !notificationsEnabled -> BLOCKED_NOTIFICATIONS
            !hasNextShow -> BLOCKED_NOTHING_DUE
            else -> null
        }

    private fun pendingIntent(context: Context, requestCode: Int, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, ReminderReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or flags,
        )

    fun canScheduleExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    private fun armedAt(state: ReminderStore.State, zone: ZoneId): ZonedDateTime? =
        state.armedAtMillis?.let { Instant.ofEpochMilli(it).atZone(zone) }

    /** The local day the current alarm was set for, if any. */
    fun armedFor(state: ReminderStore.State): LocalDate? = armedAt(state, ZoneId.systemDefault())?.toLocalDate()

    /**
     * Idempotent: replaces any existing alarm. Returns the scheduled epoch millis, or null if disabled.
     *
     * With exact-alarm access: one exact allow-while-idle alarm. Without it,
     * two alarms for the same time: a 10-minute window (on time while the phone
     * is awake) and an allow-while-idle one (still fires while the phone is
     * idle, which a window alarm does not). The receiver shows at most one
     * summary per day, and re-arming after the first replaces the other.
     */
    fun arm(context: Context): Long? {
        val state = ReminderStore.read(context)
        if (!state.enabled) {
            cancel(context)
            if (state.armedAtMillis != null || state.armedExact != null) {
                ReminderStore.update(context) { it.copy(armedAtMillis = null, armedExact = null) }
            }
            return null
        }
        val now = ZonedDateTime.now()
        val at = planFire(now, state.hour, state.minute, state.lastShownDate, armedAt(state, now.zone))
            .toInstant().toEpochMilli()
        val exact = setAlarms(context, at)
        ReminderStore.update(context) { it.copy(armedAtMillis = at, armedExact = exact) }
        return at
    }

    /** Returns true when the alarm is exact. */
    private fun setAlarms(context: Context, at: Long): Boolean {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val main = pendingIntent(context, REQUEST_CODE, PendingIntent.FLAG_UPDATE_CURRENT)!!
        if (canScheduleExact(context)) {
            try {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, main)
                cancelOne(context, BACKUP_REQUEST_CODE)
                return true
            } catch (_: SecurityException) {
                // Exact-alarm access revoked between the check and the call.
            }
        }
        alarmManager.setWindow(AlarmManager.RTC_WAKEUP, at, WINDOW_MILLIS, main)
        val backup = pendingIntent(context, BACKUP_REQUEST_CODE, PendingIntent.FLAG_UPDATE_CURRENT)!!
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, backup)
        return false
    }

    fun nextFireAtMillis(context: Context): Long? {
        val state = ReminderStore.read(context)
        if (!state.enabled) return null
        val now = ZonedDateTime.now()
        return planFire(now, state.hour, state.minute, state.lastShownDate, armedAt(state, now.zone))
            .toInstant().toEpochMilli()
    }

    /** The first alarm that will post a summary (epoch millis), or null (off or nothing due). */
    fun nextShowAtMillis(context: Context): Long? {
        val state = ReminderStore.read(context)
        if (!state.enabled) return null
        val now = ZonedDateTime.now()
        return nextShowTime(now, state.hour, state.minute, state.lastShownDate, state.items, armedAt(state, now.zone))
            ?.toInstant()?.toEpochMilli()
    }

    /** Whether the daily alarm keeps exact time (false: it may arrive a few minutes late). */
    fun isTimingExact(context: Context): Boolean =
        canScheduleExact(context) && ReminderStore.read(context).armedExact != false

    private fun cancelOne(context: Context, requestCode: Int) {
        val pi = pendingIntent(context, requestCode, PendingIntent.FLAG_NO_CREATE) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pi)
        pi.cancel()
    }

    fun cancel(context: Context) {
        cancelOne(context, REQUEST_CODE)
        cancelOne(context, BACKUP_REQUEST_CODE)
    }
}
