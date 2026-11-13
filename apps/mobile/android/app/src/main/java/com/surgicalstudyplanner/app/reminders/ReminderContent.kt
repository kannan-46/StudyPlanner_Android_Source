package com.surgicalstudyplanner.app.reminders

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime

/** Pure notification-content logic. No Android imports: unit-tested on the JVM. */
object ReminderContent {
    data class Item(val topicName: String, val dueOn: LocalDate)
    data class Content(val title: String, val body: String)

    private const val MAX_NAMES = 3

    fun compose(items: List<Item>, today: LocalDate): Content? {
        val due = items.filter { !it.dueOn.isAfter(today) }
        if (due.isEmpty()) return null
        val overdue = due.count { it.dueOn.isBefore(today) }
        val n = due.size
        val title = buildString {
            append(if (n == 1) "1 revision due today" else "$n revisions due today")
            if (overdue > 0) append(" · $overdue overdue")
        }
        // Today's items first, then overdue (oldest first).
        val ordered = due.filter { it.dueOn == today } +
            due.filter { it.dueOn.isBefore(today) }.sortedBy { it.dueOn }
        val names = ordered.take(MAX_NAMES).joinToString(", ") { it.topicName }
        val body = if (n > MAX_NAMES) "$names…" else names
        return Content(title, body)
    }

    /** At most one summary per local date. */
    fun shouldShowOnFire(today: LocalDate, lastShownDate: LocalDate?): Boolean = lastShownDate != today

    fun shouldShowMissed(now: ZonedDateTime, hour: Int, minute: Int, lastShownDate: LocalDate?): Boolean {
        val today = now.toLocalDate()
        val fire = ZonedDateTime.of(today, LocalTime.of(hour, minute), now.zone)
        return now.isAfter(fire) && lastShownDate != today
    }
}
