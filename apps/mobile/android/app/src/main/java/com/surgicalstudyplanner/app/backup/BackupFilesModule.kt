package com.surgicalstudyplanner.app.backup

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream

class BackupFilesModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var exportPromise: Promise? = null
    private var importPromise: Promise? = null
    private var spreadsheetPromise: Promise? = null

    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            when (requestCode) {
                REQUEST_EXPORT -> finishExport(activity, resultCode, data)
                REQUEST_IMPORT -> finishImport(activity, resultCode, data)
                REQUEST_SPREADSHEET -> finishSpreadsheet(activity, resultCode, data)
            }
        }
    }

    init {
        context.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "BackupFiles"

    override fun invalidate() {
        reactApplicationContext.removeActivityEventListener(activityEventListener)
        exportPromise?.reject("E_CANCELLED", "The app closed before the backup was saved.")
        importPromise?.reject("E_CANCELLED", "The app closed before the backup was imported.")
        spreadsheetPromise?.reject("E_CANCELLED", "The app closed before the spreadsheet was read.")
        spreadsheetPromise = null
        exportPromise = null
        importPromise = null
        currentExportJson = null
        super.invalidate()
    }

    /**
     * Opens the system save dialog suggesting [fileName] (blank: the default
     * name) and writes [json]. The app shows its own "Backup saved" message.
     */
    @ReactMethod
    fun exportBackup(json: String, fileName: String, promise: Promise) {
        if (busy()) {
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
                putExtra(Intent.EXTRA_TITLE, BackupFileRules.fileName(fileName))
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
        if (busy()) {
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
                var total = 0L
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    if (BackupFileRules.isTooLarge(total)) throw BackupTooLargeException()
                    output.write(buffer, 0, count)
                }
                output.toByteArray().toString(Charsets.UTF_8)
            } ?: throw IllegalStateException("Could not read the selected backup file.")
            promise.resolve(json)
        } catch (_: BackupTooLargeException) {
            promise.reject(BackupFileRules.E_TOO_LARGE, "Backup file is too large.")
        } catch (error: Exception) {
            promise.reject("E_FILE_READ", error.message ?: "Could not read the backup file.", error)
        }
    }

    private fun busy(): Boolean =
        exportPromise != null || importPromise != null || spreadsheetPromise != null

    /**
     * Opens the system picker for an .xlsx or .csv file and resolves with its
     * sheets as JSON (see SpreadsheetData.toJson). Rejects with E_CANCELLED,
     * E_TOO_LARGE (over 8 MiB), E_OLD_XLS, E_NOT_SPREADSHEET or E_FILE_READ.
     */
    @ReactMethod
    fun pickSpreadsheet(promise: Promise) {
        if (busy()) {
            promise.reject("E_IN_PROGRESS", "Another file operation is already open.")
            return
        }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "The app is not in the foreground.")
            return
        }

        spreadsheetPromise = promise
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, SPREADSHEET_TYPES)
            }
            activity.startActivityForResult(intent, REQUEST_SPREADSHEET)
        } catch (error: Exception) {
            spreadsheetPromise = null
            promise.reject("E_FILE_PICKER", "Could not open the file picker.", error)
        }
    }

    private fun displayName(activity: Activity, uri: Uri): String {
        try {
            activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val name = cursor.getString(0)
                        if (!name.isNullOrBlank()) return name
                    }
                }
        } catch (_: Exception) {
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "spreadsheet"
    }

    private fun finishSpreadsheet(activity: Activity, resultCode: Int, data: Intent?) {
        val promise = spreadsheetPromise ?: return
        spreadsheetPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            promise.reject("E_CANCELLED", "Spreadsheet import was cancelled.")
            return
        }
        val resolver = activity.contentResolver
        val fileName = displayName(activity, uri)
        // Reading and unzipping can take a moment: keep it off the UI thread.
        Thread {
            try {
                val bytes = resolver.openInputStream(uri)?.use { readCapped(it) }
                    ?: throw IllegalStateException("Could not read the selected file.")
                promise.resolve(SpreadsheetReader.read(bytes, fileName).toJson())
            } catch (_: BackupTooLargeException) {
                promise.reject(BackupFileRules.E_TOO_LARGE, "The spreadsheet is too large.")
            } catch (error: SpreadsheetException) {
                promise.reject(error.code, error.message)
            } catch (error: OutOfMemoryError) {
                promise.reject(BackupFileRules.E_TOO_LARGE, "The spreadsheet is too large.")
            } catch (error: Exception) {
                promise.reject("E_FILE_READ", error.message ?: "Could not read the file.", error)
            }
        }.start()
    }

    private fun readCapped(input: java.io.InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8_192)
        var total = 0L
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (BackupFileRules.isTooLarge(total)) throw BackupTooLargeException()
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    private var currentExportJson: String? = null

    private class BackupTooLargeException : Exception("Backup file is too large.")

    private companion object {
        const val REQUEST_EXPORT = 4101
        const val REQUEST_IMPORT = 4102
        const val REQUEST_SPREADSHEET = 4103

        // .xlsx and .csv; .xls too, so the app can explain how to convert it.
        val SPREADSHEET_TYPES = arrayOf(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "text/comma-separated-values",
            "application/csv",
            "text/plain",
            "application/octet-stream",
        )
    }
}
