package com.surgicalstudyplanner.app.reminders

import android.content.Context
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

/** Single SharedPreferences JSON blob; every read-modify-write is synchronized and committed. */
object ReminderStore {
    private const val PREF = "ssp_reminders"
    private const val KEY = "state"
    private val LOCK = Any()

    data class State(
        val enabled: Boolean = true,
        val hour: Int = 8,
        val minute: Int = 0,
        val lastShownDate: LocalDate? = null,
        val items: List<ReminderContent.Item> = emptyList(),
    )

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun read(context: Context): State = synchronized(LOCK) { decode(prefs(context).getString(KEY, null)) }

    fun update(context: Context, transform: (State) -> State): State = synchronized(LOCK) {
        val next = transform(decode(prefs(context).getString(KEY, null)))
        prefs(context).edit().putString(KEY, encode(next)).commit()
        next
    }

    fun clear(context: Context) {
        synchronized(LOCK) { prefs(context).edit().remove(KEY).commit() }
    }

    /** Parses the JS snapshot `[{topicName,dueOn}]`; invalid entries are skipped. */
    fun parseItems(json: String): List<ReminderContent.Item> = parseItems(JSONArray(json))

    private fun parseItems(arr: JSONArray): List<ReminderContent.Item> {
        val out = ArrayList<ReminderContent.Item>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val name = o.optString("topicName", "")
            val due = runCatching { LocalDate.parse(o.optString("dueOn", "")) }.getOrNull() ?: continue
            out.add(ReminderContent.Item(name, due))
        }
        return out
    }

    private fun decode(raw: String?): State {
        if (raw == null) return State()
        return try {
            val o = JSONObject(raw)
            State(
                enabled = o.optBoolean("enabled", true),
                hour = o.optInt("hour", 8).coerceIn(0, 23),
                minute = o.optInt("minute", 0).coerceIn(0, 59),
                lastShownDate = if (o.isNull("lastShownDate")) null
                else runCatching { LocalDate.parse(o.getString("lastShownDate")) }.getOrNull(),
                items = parseItems(o.optJSONArray("items") ?: JSONArray()),
            )
        } catch (_: Exception) {
            State()
        }
    }

    private fun encode(s: State): String {
        val items = JSONArray()
        s.items.forEach { items.put(JSONObject().put("topicName", it.topicName).put("dueOn", it.dueOn.toString())) }
        return JSONObject()
            .put("enabled", s.enabled)
            .put("hour", s.hour)
            .put("minute", s.minute)
            .put("lastShownDate", s.lastShownDate?.toString() ?: JSONObject.NULL)
            .put("items", items)
            .toString()
    }
}
