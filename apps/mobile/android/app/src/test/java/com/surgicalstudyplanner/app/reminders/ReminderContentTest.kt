package com.surgicalstudyplanner.app.reminders

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderContentTest {
    private val today = LocalDate.of(2026, 11, 13)
    private fun now(h: Int, m: Int) = ZonedDateTime.of(2026, 11, 13, h, m, 0, 0, ZoneId.of("UTC"))

    @Test fun emptyIsNull() {
        assertNull(ReminderContent.compose(emptyList(), today))
    }

    @Test fun onlyFutureIsNull() {
        assertNull(ReminderContent.compose(listOf(ReminderContent.Item("X", today.plusDays(1))), today))
    }

    @Test fun mixedItems() {
        val c = ReminderContent.compose(
            listOf(
                ReminderContent.Item("A", today),
                ReminderContent.Item("B", today),
                ReminderContent.Item("C", today.minusDays(2)),
                ReminderContent.Item("D", today.plusDays(1)),
            ),
            today,
        )!!
        assertEquals("3 revisions due today · 1 overdue", c.title)
        assertEquals("A, B, C", c.body)
    }

    @Test fun singleRevision() {
        val c = ReminderContent.compose(listOf(ReminderContent.Item("A", today)), today)!!
        assertEquals("1 revision due today", c.title)
        assertEquals("A", c.body)
    }

    @Test fun fiveDueEndsWithEllipsis() {
        val c = ReminderContent.compose((1..5).map { ReminderContent.Item("T$it", today) }, today)!!
        assertEquals("5 revisions due today", c.title)
        assertTrue(c.body.endsWith("…"))
        assertEquals("T1, T2, T3…", c.body)
    }

    @Test fun missedTrueAfterFireWhenShownYesterday() {
        assertTrue(ReminderContent.shouldShowMissed(now(9, 0), 8, 0, today.minusDays(1)))
    }

    @Test fun missedTrueWhenNeverShown() {
        assertTrue(ReminderContent.shouldShowMissed(now(9, 0), 8, 0, null))
    }

    @Test fun missedFalseWhenShownToday() {
        assertFalse(ReminderContent.shouldShowMissed(now(9, 0), 8, 0, today))
    }

    @Test fun fireShowsWhenNotShownToday() {
        assertTrue(ReminderContent.shouldShowOnFire(today, today.minusDays(1)))
        assertTrue(ReminderContent.shouldShowOnFire(today, null))
    }

    @Test fun fireSkipsWhenAlreadyShownToday() {
        assertFalse(ReminderContent.shouldShowOnFire(today, today))
    }

    @Test fun missedFalseBeforeFire() {
        assertFalse(ReminderContent.shouldShowMissed(now(7, 0), 8, 0, today.minusDays(1)))
    }
}
