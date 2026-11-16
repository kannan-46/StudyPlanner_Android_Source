package com.surgicalstudyplanner.app.reminders

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime

/** Pure notification-content logic. No Android imports: unit-tested on the JVM. */
object ReminderContent {
    data class Item(val topicName: String, val dueOn: LocalDate)
    data class Content(val title: String, val body: String)

    private const val MAX_NAMES = 3
    private const val MAX_NAME_CHARS = 40

    /**
     * The daily summary, or null when nothing is due or overdue on [today].
     * Counts match the app: "due today" means due exactly on [today]; anything
     * earlier is "overdue" and counted separately.
     */
    fun compose(items: List<Item>, today: LocalDate): Content? {
        val due = items.filter { !it.dueOn.isAfter(today) }
        if (due.isEmpty()) return null
        val todayCount = due.count { it.dueOn == today }
        val overdue = due.size - todayCount
        val title = when {
            todayCount > 0 && overdue > 0 -> "${revisions(todayCount)} due today · $overdue overdue"
            todayCount > 0 -> "${revisions(todayCount)} due today"
            else -> "$overdue overdue ${if (overdue == 1) "revision" else "revisions"}"
        }
        // Today's items first (they lead the title), then overdue (oldest first).
        val ordered = due.filter { it.dueOn == today } +
            due.filter { it.dueOn.isBefore(today) }.sortedBy { it.dueOn }
        val names = ordered.take(MAX_NAMES).joinToString(", ") { shorten(it.topicName) }
        val more = due.size - MAX_NAMES
        val body = if (more > 0) "$names +$more more" else names
        return Content(title, body)
    }

    private fun revisions(n: Int) = if (n == 1) "1 revision" else "$n revisions"

    private fun shorten(name: String): String {
        val trimmed = name.trim()
        return if (trimmed.length <= MAX_NAME_CHARS) trimmed
        else trimmed.take(MAX_NAME_CHARS - 1).trimEnd() + "…"
    }

    enum class RefreshAction { NONE, DISMISS, UPDATE }

    /**
     * What to do with the summary in the notification shade ([posted], null
     * when none is showing) after a new snapshot gives [fresh] (null when
     * nothing is due now). Never brings back a summary that is not showing.
     */
    fun refreshAction(posted: Content?, fresh: Content?): RefreshAction = when {
        posted == null -> RefreshAction.NONE
        fresh == null -> RefreshAction.DISMISS
        fresh != posted -> RefreshAction.UPDATE
        else -> RefreshAction.NONE
    }

    /**
     * The test notification from Reminder health. It only proves that
     * notifications show; it never claims the daily reminder is on when it is off.
     */
    fun testContent(dailyReminderEnabled: Boolean): Content = Content(
        "Test notification",
        if (dailyReminderEnabled) {
            "Notifications are showing. Your daily reminder comes on days with revisions due."
        } else {
            "Notifications are showing. Your daily reminder is off. You can turn it on in Settings."
        },
    )

    /**
     * The day a firing alarm belongs to. An alarm the phone held back past
     * midnight still counts for the day it was set for, so it never uses up
     * the next day's reminder. Falls back to [today] when the armed day is
     * unknown or in the future (clock or time zone changed).
     */
    fun fireDate(armedFor: LocalDate?, today: LocalDate): LocalDate =
        if (armedFor != null && !armedFor.isAfter(today)) armedFor else today

    /** At most one summary per local date. */
    fun shouldShowOnFire(today: LocalDate, lastShownDate: LocalDate?): Boolean = lastShownDate != today

    fun shouldShowMissed(now: ZonedDateTime, hour: Int, minute: Int, lastShownDate: LocalDate?): Boolean {
        val today = now.toLocalDate()
        val fire = ZonedDateTime.of(today, LocalTime.of(hour, minute), now.zone)
        return now.isAfter(fire) && lastShownDate != today
    }
}
