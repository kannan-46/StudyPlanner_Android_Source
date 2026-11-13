package com.surgicalstudyplanner.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream

class PlannerNativeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var exportPromise: Promise? = null
    private var importPromise: Promise? = null

    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            when (requestCode) {
                REQUEST_EXPORT -> finishExport(activity, resultCode, data)
                REQUEST_IMPORT -> finishImport(activity, resultCode, data)
            }
        }
    }

    init {
        context.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "PlannerNative"

    override fun invalidate() {
        reactApplicationContext.removeActivityEventListener(activityEventListener)
        exportPromise?.reject("E_CANCELLED", "The app closed before the backup was saved.")
        importPromise?.reject("E_CANCELLED", "The app closed before the backup was imported.")
        exportPromise = null
        importPromise = null
        currentExportJson = null
        super.invalidate()
    }

    @ReactMethod
    fun cancelAllRevisionAlarms(promise: Promise) = runWithPromise(promise) {
        AlarmStore.cancelAllRevisions(reactApplicationContext)
        null
    }

    @ReactMethod
    fun clearAllAlarms(promise: Promise) = runWithPromise(promise) {
        AlarmStore.clearAllAlarms(reactApplicationContext)
        null
    }

    @ReactMethod
    fun scheduleRevisionAlarm(id: String, atMillis: Double, title: String, body: String, promise: Promise) =
        runWithPromise(promise) {
            require(id.isNotBlank()) { "Alarm ID must not be empty." }
            AlarmStore.scheduleRevision(reactApplicationContext, id, atMillis.toLong(), title, body)
            null
        }

    @ReactMethod
    fun scheduleDailyReminder(hour: Int, minute: Int, pendingCount: Int, promise: Promise) = runWithPromise(promise) {
        require(hour in 0..23 && minute in 0..59 && pendingCount >= 0) { "Daily reminder settings are invalid." }
        AlarmStore.scheduleDaily(reactApplicationContext, hour, minute, pendingCount)
        null
    }

    @ReactMethod
    fun requestExactAlarmAccess(promise: Promise) = runWithPromise(promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !AlarmStore.canExact(reactApplicationContext)) {
            val activity = reactApplicationContext.currentActivity ?: throw IllegalStateException("The app is not in the foreground.")
            val intent = Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:${reactApplicationContext.packageName}"),
            )
            activity.startActivity(intent)
        } else {
            reactApplicationContext.currentActivity?.let {
                Toast.makeText(it, "Exact alarm access is already available", Toast.LENGTH_SHORT).show()
            }
        }
        null
    }

    @ReactMethod
    fun exportBackup(json: String, promise: Promise) {
        if (exportPromise != null || importPromise != null) {
            promise.reject("E_IN_PROGRESS", "Another backup file operation is already open.")
            return
        }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "The app is not in the foreground.")
            return
        }

        exportPromise = promise
        currentExportJson = json
        try {
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/json"
                putExtra(Intent.EXTRA_TITLE, "surgical-study-planner-backup.json")
            }
            activity.startActivityForResult(intent, REQUEST_EXPORT)
        } catch (error: Exception) {
            exportPromise = null
            currentExportJson = null
            promise.reject("E_FILE_PICKER", "Could not open the save-file picker.", error)
        }
    }

    @ReactMethod
    fun importBackup(promise: Promise) {
        if (exportPromise != null || importPromise != null) {
            promise.reject("E_IN_PROGRESS", "Another backup file operation is already open.")
            return
        }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "The app is not in the foreground.")
            return
        }

        importPromise = promise
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/json"
            }
            activity.startActivityForResult(intent, REQUEST_IMPORT)
        } catch (error: Exception) {
            importPromise = null
            promise.reject("E_FILE_PICKER", "Could not open the file picker.", error)
        }
    }

    private fun finishExport(activity: Activity, resultCode: Int, data: Intent?) {
        val promise = exportPromise ?: return
        exportPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            currentExportJson = null
            promise.reject("E_CANCELLED", "Backup export was cancelled.")
            return
        }

        try {
            val json = currentExportJson
            if (json == null) throw IllegalStateException("Backup contents are missing.")
            activity.contentResolver.openOutputStream(uri, "wt")?.use { output ->
                output.write(json.toByteArray(Charsets.UTF_8))
            } ?: throw IllegalStateException("Could not write the selected backup file.")
            currentExportJson = null
            Toast.makeText(activity, "Backup saved", Toast.LENGTH_SHORT).show()
            promise.resolve(null)
        } catch (error: Exception) {
            currentExportJson = null
            promise.reject("E_FILE_WRITE", "Could not save the backup file.", error)
        }
    }

    private fun finishImport(activity: Activity, resultCode: Int, data: Intent?) {
        val promise = importPromise ?: return
        importPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            promise.reject("E_CANCELLED", "Backup import was cancelled.")
            return
        }

        try {
            val json = activity.contentResolver.openInputStream(uri)?.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8_192)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    if (total > MAX_BACKUP_BYTES) throw IllegalArgumentException("Backup file is too large.")
                    output.write(buffer, 0, count)
                }
                output.toByteArray().toString(Charsets.UTF_8)
            } ?: throw IllegalStateException("Could not read the selected backup file.")
            promise.resolve(json)
        } catch (error: Exception) {
            promise.reject("E_FILE_READ", error.message ?: "Could not read the backup file.", error)
        }
    }

    private var currentExportJson: String? = null

    private fun runWithPromise(promise: Promise, action: () -> Any?) {
        try {
            promise.resolve(action())
        } catch (error: Exception) {
            promise.reject("E_NATIVE_OPERATION", error.message ?: "Native operation failed.", error)
        }
    }

    private companion object {
        const val REQUEST_EXPORT = 4101
        const val REQUEST_IMPORT = 4102
        const val MAX_BACKUP_BYTES = 1_000_000
    }
}
