package com.surgicalstudyplanner.app.reminders

/** Pure rules for one-shot alarms (e.g. the focus timer). No Android imports: unit-tested on the JVM. */
object OneShotPlan {
    /** Request codes 10000-42767; clear of the daily reminder (7001) and permission (7002) codes. */
    private const val REQUEST_CODE_BASE = 10_000
    private const val MAX_TITLE = 100
    private const val MAX_BODY = 300
    private val ID_PATTERN = Regex("^[A-Za-z0-9_-]{1,64}$")

    data class Alarm(val id: String, val atMillis: Long, val title: String, val body: String)

    /** Stable per id, so scheduling the same id again replaces the earlier alarm. */
    fun requestCode(id: String): Int = REQUEST_CODE_BASE + (id.hashCode() and 0x7FFF)

    /** Intent action that keeps each id's PendingIntent distinct. */
    fun action(id: String): String = "com.surgicalstudyplanner.app.ONE_SHOT.$id"

    fun validateId(id: String): String {
        require(ID_PATTERN.matches(id)) { "Alarm id is invalid." }
        return id
    }

    /** Validates and normalises a request. A time already past fires straight away. */
    fun plan(id: String, atMillis: Long, title: String, body: String, nowMillis: Long): Alarm {
        validateId(id)
        require(atMillis > 0) { "Alarm time is invalid." }
        val t = title.trim()
        require(t.isNotEmpty()) { "Alarm title is empty." }
        return Alarm(id, maxOf(atMillis, nowMillis), t.take(MAX_TITLE), body.trim().take(MAX_BODY))
    }
}
