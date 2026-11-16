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
        assertEquals("2 revisions due today · 1 overdue", c.title)
        assertEquals("A, B, C", c.body)
    }

    @Test fun oneTodayTwoOverdueCountsEachBucket() {
        val c = ReminderContent.compose(
            listOf(
                ReminderContent.Item("A", today),
                ReminderContent.Item("B", today.minusDays(1)),
                ReminderContent.Item("C", today.minusDays(3)),
            ),
            today,
        )!!
        assertEquals("1 revision due today · 2 overdue", c.title)
        assertEquals("A, C, B", c.body)
    }

    @Test fun allOverdueSaysOverdueOnly() {
        val c = ReminderContent.compose(
            (1..3).map { ReminderContent.Item("T$it", today.minusDays(it.toLong())) },
            today,
        )!!
        assertEquals("3 overdue revisions", c.title)
    }

    @Test fun singleOverdue() {
        val c = ReminderContent.compose(listOf(ReminderContent.Item("A", today.minusDays(1))), today)!!
        assertEquals("1 overdue revision", c.title)
        assertEquals("A", c.body)
    }

    @Test fun singleRevision() {
        val c = ReminderContent.compose(listOf(ReminderContent.Item("A", today)), today)!!
        assertEquals("1 revision due today", c.title)
        assertEquals("A", c.body)
    }

    @Test fun fiveDueSaysHowManyMore() {
        val c = ReminderContent.compose((1..5).map { ReminderContent.Item("T$it", today) }, today)!!
        assertEquals("5 revisions due today", c.title)
        assertEquals("T1, T2, T3 +2 more", c.body)
    }

    @Test fun moreCountIncludesOverdue() {
        val items = (1..10).map { ReminderContent.Item("T$it", today) } +
            (1..2).map { ReminderContent.Item("O$it", today.minusDays(it.toLong())) }
        val c = ReminderContent.compose(items, today)!!
        assertEquals("10 revisions due today · 2 overdue", c.title)
        assertEquals("T1, T2, T3 +9 more", c.body)
    }

    @Test fun longNamesAreShortenedOneByOne() {
        val long = "Brachial plexus injuries and their surgical management in adults"
        val c = ReminderContent.compose(
            listOf(ReminderContent.Item(long, today), ReminderContent.Item("Thyroid", today)),
            today,
        )!!
        val first = c.body.substringBefore(", ")
        assertEquals(40, first.length)
        assertTrue(first.endsWith("…"))
        assertTrue(c.body.endsWith(", Thyroid"))
    }

    @Test fun nameOfExactlyFortyCharsIsKept() {
        val name = "x".repeat(40)
        assertEquals(name, ReminderContent.compose(listOf(ReminderContent.Item(name, today)), today)!!.body)
    }

    @Test fun refreshLeavesNothingWhenNoSummaryIsShowing() {
        val fresh = ReminderContent.Content("1 revision due today", "A")
        assertEquals(ReminderContent.RefreshAction.NONE, ReminderContent.refreshAction(null, fresh))
        assertEquals(ReminderContent.RefreshAction.NONE, ReminderContent.refreshAction(null, null))
    }

    @Test fun refreshDismissesWhenNothingIsDue() {
        val posted = ReminderContent.Content("2 revisions due today", "A, B")
        assertEquals(ReminderContent.RefreshAction.DISMISS, ReminderContent.refreshAction(posted, null))
    }

    @Test fun refreshUpdatesOnlyWhenTheTextChanged() {
        val posted = ReminderContent.Content("2 revisions due today", "A, B")
        val same = ReminderContent.Content("2 revisions due today", "A, B")
        val fewer = ReminderContent.Content("1 revision due today", "B")
        assertEquals(ReminderContent.RefreshAction.NONE, ReminderContent.refreshAction(posted, same))
        assertEquals(ReminderContent.RefreshAction.UPDATE, ReminderContent.refreshAction(posted, fewer))
    }

    @Test fun testNotificationNeverClaimsTheDailyReminderIsOnWhenOff() {
        val on = ReminderContent.testContent(true)
        val off = ReminderContent.testContent(false)
        assertEquals("Test notification", on.title)
        assertTrue(on.body.startsWith("Notifications are showing."))
        assertFalse(on.body.contains("working"))
        assertTrue(off.body.contains("daily reminder is off"))
    }

    @Test fun fireDateKeepsTheArmedDayForALateAlarm() {
        assertEquals(today.minusDays(1), ReminderContent.fireDate(today.minusDays(1), today))
        assertEquals(today, ReminderContent.fireDate(today, today))
    }

    @Test fun fireDateFallsBackToToday() {
        assertEquals(today, ReminderContent.fireDate(null, today))
        assertEquals(today, ReminderContent.fireDate(today.plusDays(1), today))
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
