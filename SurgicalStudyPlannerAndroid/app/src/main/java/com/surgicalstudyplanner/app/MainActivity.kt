package com.surgicalstudyplanner.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.webkit.ValueCallback
import android.webkit.WebChromeClient.FileChooserParams
import androidx.core.app.ActivityCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AlarmStore.createChannel(this)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "application/json" }
                startActivityForResult(intent, 4102)
                return true
            }
        }
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 3001)
        }
    }

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingBackup: String? = null

    fun exportBackup(json: String) {
        pendingBackup = json
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE); type = "application/json"
            putExtra(Intent.EXTRA_TITLE, "surgical-study-planner-backup.json")
        }
        startActivityForResult(intent, 4101)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, intent: Intent?) {
        super.onActivityResult(requestCode, resultCode, intent)
        if (requestCode == 4101 && resultCode == RESULT_OK && intent?.data != null) {
            contentResolver.openOutputStream(intent.data!!)?.use { it.write((pendingBackup ?: "{}").toByteArray(Charsets.UTF_8)) }
            Toast.makeText(this, "Backup saved", Toast.LENGTH_SHORT).show()
            pendingBackup = null
        }
        if (requestCode == 4102) {
            val uri = if (resultCode == RESULT_OK) intent?.data else null
            fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
            fileCallback = null
        }
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.postDelayed({ web.evaluateJavascript("if(window.syncNativeAlarms)syncNativeAlarms();", null) }, 500)
    }

    @Deprecated("Deprecated in Android API")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

class AndroidBridge(private val context: Context) {
    @JavascriptInterface fun exportBackup(json: String) { (context as? MainActivity)?.runOnUiThread { (context as MainActivity).exportBackup(json) } }
    @JavascriptInterface fun cancelAllRevisionAlarms() = AlarmStore.cancelAllRevisions(context)
    @JavascriptInterface fun scheduleRevisionAlarm(id: String, atMillis: Long, title: String, body: String) {
        AlarmStore.scheduleRevision(context, id, atMillis, title, body)
    }
    @JavascriptInterface fun scheduleDailyReminder(hour: Int, minute: Int, count: Int) {
        AlarmStore.scheduleDaily(context, hour, minute, count)
    }
    @JavascriptInterface fun requestExactAlarmAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !AlarmStore.canExact(context)) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } else {
            Toast.makeText(context, "Exact alarm access is already available", Toast.LENGTH_SHORT).show()
        }
    }
}

object AlarmStore {
    private const val PREF = "ssp_native_alarms"
    private const val KEY_REVISIONS = "revisions"
    private const val KEY_DAILY = "daily"
    private const val DAILY_ID = "ssp_daily_revision_summary"
    const val CHANNEL_ID = "study_revisions"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = android.app.NotificationChannel(CHANNEL_ID, "Study revision reminders", android.app.NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Scheduled MS General Surgery and NEET SS revision reminders"
            context.getSystemService(android.app.NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    fun canExact(context: Context): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.getSystemService(android.app.AlarmManager::class.java).canScheduleExactAlarms()

    private fun prefs(context: Context) = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun scheduleRevision(context: Context, id: String, at: Long, title: String, body: String) {
        val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
        val kept = JSONArray()
        for (i in 0 until list.length()) if (list.getJSONObject(i).optString("id") != id) kept.put(list.getJSONObject(i))
        val item = JSONObject().put("id", id).put("at", at).put("title", title).put("body", body)
        kept.put(item)
        prefs(context).edit().putString(KEY_REVISIONS, kept.toString()).apply()
        scheduleItem(context, item, false)
    }

    fun cancelAllRevisions(context: Context) {
        val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
        val am = context.getSystemService(android.app.AlarmManager::class.java)
        for (i in 0 until list.length()) {
            val id = list.getJSONObject(i).optString("id")
            val pi = pending(context, id, false)
            am.cancel(pi)
            pi.cancel()
        }
        prefs(context).edit().putString(KEY_REVISIONS, "[]").apply()
    }

    private fun pending(context: Context, id: String, daily: Boolean): android.app.PendingIntent {
        val intent = Intent(context, RevisionAlarmReceiver::class.java).apply {
            action = if (daily) "com.surgicalstudyplanner.DAILY" else "com.surgicalstudyplanner.REVISION"
            putExtra("alarm_id", id)
            putExtra("daily", daily)
        }
        return android.app.PendingIntent.getBroadcast(context, id.hashCode(), intent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
    }

    private fun scheduleItem(context: Context, item: JSONObject, daily: Boolean) {
        val am = context.getSystemService(android.app.AlarmManager::class.java)
        val id = item.optString("id")
        val pi = pending(context, id, daily)
        val at = item.optLong("at", System.currentTimeMillis() + 5000).coerceAtLeast(System.currentTimeMillis() + 3000)
        try {
            if (canExact(context)) am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, pi)
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    fun scheduleDaily(context: Context, hour: Int, minute: Int, count: Int) {
        val cfg = JSONObject().put("hour", hour).put("minute", minute).put("count", count)
        prefs(context).edit().putString(KEY_DAILY, cfg.toString()).apply()
        scheduleNextDaily(context)
    }

    fun scheduleNextDaily(context: Context) {
        val raw = prefs(context).getString(KEY_DAILY, null) ?: return
        val cfg = JSONObject(raw)
        val cal = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, cfg.optInt("hour", 8))
            set(java.util.Calendar.MINUTE, cfg.optInt("minute", 0))
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(java.util.Calendar.DAY_OF_YEAR, 1)
        }
        val item = JSONObject().put("id", DAILY_ID).put("at", cal.timeInMillis)
            .put("title", "Surgical Study Planner")
            .put("body", "Your daily study check-in is ready. Open the app to review your schedule.")
        scheduleItem(context, item, true)
    }

    fun restore(context: Context) {
        createChannel(context)
        val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
        for (i in 0 until list.length()) {
            val item = list.getJSONObject(i)
            if (item.optLong("at") > System.currentTimeMillis()) scheduleItem(context, item, false)
        }
        scheduleNextDaily(context)
    }

    fun onFired(context: Context, intent: Intent) {
        val id = intent.getStringExtra("alarm_id") ?: return
        val daily = intent.getBooleanExtra("daily", false)
        if (daily) {
            val cfg = JSONObject(prefs(context).getString(KEY_DAILY, "{}"))
            val n = cfg.optInt("count", 0)
            val body = if (n > 0) "You have $n scheduled revision(s). Open the app to review your study queue." else "Your daily study check-in is ready. Open the app to plan your next study session."
            showNotification(context, 9001, "Surgical Study Planner", body)
            scheduleNextDaily(context)
        } else {
            val list = JSONArray(prefs(context).getString(KEY_REVISIONS, "[]"))
            val kept = JSONArray()
            var title = "Revision reminder"
            var body = "A scheduled topic revision is due."
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                if (item.optString("id") == id) { title = item.optString("title", title); body = item.optString("body", body) }
                else kept.put(item)
            }
            prefs(context).edit().putString(KEY_REVISIONS, kept.toString()).apply()
            showNotification(context, id.hashCode(), title, body)
        }
    }

    private fun showNotification(context: Context, id: Int, title: String, body: String) {
        val open = Intent(context, MainActivity::class.java)
        val content = android.app.PendingIntent.getActivity(context, 7001, open,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
        val notification = androidx.core.app.NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title).setContentText(body).setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(content).build()
        try { androidx.core.app.NotificationManagerCompat.from(context).notify(id, notification) } catch (_: SecurityException) { }
    }
}

class RevisionAlarmReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { AlarmStore.onFired(context, intent) }
}

class BootReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { AlarmStore.restore(context) }
}
