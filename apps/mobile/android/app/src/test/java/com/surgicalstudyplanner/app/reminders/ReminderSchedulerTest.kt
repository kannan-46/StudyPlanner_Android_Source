package com.surgicalstudyplanner.app.reminders

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
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
        assertEquals(3, next.hour)
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
}
