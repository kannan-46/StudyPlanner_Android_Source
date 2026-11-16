package com.surgicalstudyplanner.app.reminders

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderSchedulerTest {
    private val utc = ZoneId.of("UTC")
    private fun at(h: Int, m: Int, zone: ZoneId = utc) = ZonedDateTime.of(2026, 11, 13, h, m, 0, 0, zone)

    @Test fun beforeFireTimeGivesToday() {
        assertEquals(at(8, 0), ReminderScheduler.nextFireTime(at(7, 0), 8, 0))
    }

    @Test fun exactlyAtFireTimeGivesTomorrow() {
        assertEquals(at(8, 0).plusDays(1), ReminderScheduler.nextFireTime(at(8, 0), 8, 0))
    }

    @Test fun lateEveningGivesTomorrow() {
        assertEquals(at(8, 0).plusDays(1), ReminderScheduler.nextFireTime(at(23, 30), 8, 0))
    }

    @Test fun dstGapResolvesToValidInstantAfterNow() {
        val ny = ZoneId.of("America/New_York")
        val now = ZonedDateTime.of(2026, 3, 8, 0, 30, 0, 0, ny)
        val next = ReminderScheduler.nextFireTime(now, 2, 30)
        assertTrue(next.isAfter(now))
        // 02:30 does not exist; ZonedDateTime.of shifts forward by the 1h gap -> 03:30 EDT.
        assertEquals(ZonedDateTime.of(2026, 3, 8, 3, 30, 0, 0, ny), next)
        assertEquals(3, next.hour)
        assertEquals(30, next.minute)
        assertEquals(8, next.dayOfMonth)
        assertTrue(ny.rules.isValidOffset(next.toLocalDateTime(), next.offset))
    }

    @Test fun timezoneChangeUsesNewLocalWallClock() {
        val kolkata = ZoneId.of("Asia/Kolkata")
        val now = at(7, 0, kolkata)
        val next = ReminderScheduler.nextFireTime(now, 8, 0)
        assertEquals(at(8, 0, kolkata), next)
        assertEquals(kolkata, next.zone)
    }

    // planFire: keeps an alarm that is due but has not fired yet.

    private val today: LocalDate = LocalDate.of(2026, 11, 13)

    @Test fun planFireKeepsAPendingLateAlarm() {
        val armed = at(8, 0)
        assertEquals(armed, ReminderScheduler.planFire(at(8, 5), 8, 0, today.minusDays(1), armed))
    }

    @Test fun planFireMovesOnOnceTodayShowed() {
        assertEquals(at(8, 0).plusDays(1), ReminderScheduler.planFire(at(8, 5), 8, 0, today, at(8, 0)))
    }

    @Test fun planFireMovesOnWhenTheTimeChanged() {
        assertEquals(at(9, 0), ReminderScheduler.planFire(at(8, 5), 9, 0, null, at(8, 0)))
    }

    @Test fun planFireGivesUpAfterTheGrace() {
        assertEquals(at(8, 0).plusDays(1), ReminderScheduler.planFire(at(9, 15), 8, 0, null, at(8, 0)))
    }

    @Test fun planFireIgnoresAFutureArmedTime() {
        assertEquals(at(8, 0), ReminderScheduler.planFire(at(7, 0), 8, 0, null, at(8, 0)))
        assertEquals(at(8, 0), ReminderScheduler.planFire(at(7, 0), 8, 0, null, null))
    }

    // nextShowTime: the first alarm that will really post a summary.

    private fun item(dueOn: LocalDate) = ReminderContent.Item("T", dueOn)

    @Test fun nextShowIsNullWhenNothingIsInTheSnapshot() {
        assertNull(ReminderScheduler.nextShowTime(at(7, 0), 8, 0, null, emptyList()))
    }

    @Test fun nextShowIsTodayWhenSomethingIsDue() {
        assertEquals(at(8, 0), ReminderScheduler.nextShowTime(at(7, 0), 8, 0, null, listOf(item(today))))
    }

    @Test fun nextShowWaitsForTheFirstDueDay() {
        // Topics studied today: first revision in 4 days.
        val due = today.plusDays(4)
        assertEquals(at(8, 0).plusDays(4), ReminderScheduler.nextShowTime(at(7, 0), 8, 0, null, listOf(item(due))))
    }

    @Test fun nextShowCountsOverdueItemsAsDue() {
        val items = listOf(item(today.minusDays(3)))
        assertEquals(at(8, 0), ReminderScheduler.nextShowTime(at(7, 0), 8, 0, null, items))
    }

    @Test fun nextShowSkipsADayThatAlreadyShowed() {
        // Shown at 08:00 today; the time is then moved to 20:00.
        val next = ReminderScheduler.nextShowTime(at(9, 0), 20, 0, today, listOf(item(today)))
        assertEquals(at(20, 0).plusDays(1), next)
    }

    @Test fun nextShowAfterTodaysTimeIsTomorrow() {
        val next = ReminderScheduler.nextShowTime(at(9, 0), 8, 0, today, listOf(item(today)))
        assertEquals(at(8, 0).plusDays(1), next)
    }

    @Test fun nextShowUsesAPendingLateAlarm() {
        val next = ReminderScheduler.nextShowTime(at(8, 5), 8, 0, null, listOf(item(today)), at(8, 0))
        assertEquals(at(8, 0), next)
    }

    // blockedReason: why the next reminder will not show.

    @Test fun blockedReasonOrder() {
        assertEquals("off", ReminderScheduler.blockedReason(false, false, false))
        assertEquals("notificationsOff", ReminderScheduler.blockedReason(true, false, true))
        assertEquals("nothingDue", ReminderScheduler.blockedReason(true, true, false))
        assertNull(ReminderScheduler.blockedReason(true, true, true))
    }

    @Test fun requestCodesAreDistinct() {
        assertTrue(ReminderScheduler.BACKUP_REQUEST_CODE != ReminderScheduler.REQUEST_CODE)
    }
}
