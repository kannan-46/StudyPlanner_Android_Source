package com.surgicalstudyplanner.app.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class OneShotPlanTest {
    private val now = 1_700_000_000_000L

    @Test fun requestCodeIsStablePerIdAndClearOfReminderCodes() {
        val code = OneShotPlan.requestCode("focus_timer")
        assertEquals(code, OneShotPlan.requestCode("focus_timer"))
        assertTrue(code >= 10_000)
        assertNotEquals(ReminderScheduler.REQUEST_CODE, code)
        assertNotEquals(ReminderNotifications.NOTIFICATION_ID, code)
    }

    @Test fun actionIsDistinctPerId() {
        assertNotEquals(OneShotPlan.action("a"), OneShotPlan.action("b"))
    }

    @Test fun planKeepsAFutureTime() {
        val alarm = OneShotPlan.plan("focus_timer", now + 60_000, " Done ", " Nice work ", now)
        assertEquals(OneShotPlan.Alarm("focus_timer", now + 60_000, "Done", "Nice work"), alarm)
    }

    @Test fun planFiresAPastTimeNow() {
        assertEquals(now, OneShotPlan.plan("focus_timer", now - 5_000, "Done", "", now).atMillis)
    }

    @Test fun planTrimsLongText() {
        val alarm = OneShotPlan.plan("x", now, "t".repeat(500), "b".repeat(500), now)
        assertEquals(100, alarm.title.length)
        assertEquals(300, alarm.body.length)
    }

    @Test fun planRejectsBadInput() {
        assertThrows(IllegalArgumentException::class.java) { OneShotPlan.plan("", now, "t", "b", now) }
        assertThrows(IllegalArgumentException::class.java) { OneShotPlan.plan("a b", now, "t", "b", now) }
        assertThrows(IllegalArgumentException::class.java) { OneShotPlan.plan("x", 0, "t", "b", now) }
        assertThrows(IllegalArgumentException::class.java) { OneShotPlan.plan("x", now, "  ", "b", now) }
    }
}
