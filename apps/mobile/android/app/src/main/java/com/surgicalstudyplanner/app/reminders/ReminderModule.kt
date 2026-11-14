package com.surgicalstudyplanner.app.reminders

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.util.concurrent.atomic.AtomicBoolean

class ReminderModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "Reminders"

    private val ctx: ReactApplicationContext get() = reactApplicationContext

    @ReactMethod
    fun syncSnapshot(itemsJson: String, promise: Promise) = run(promise) {
        val items = ReminderStore.parseItems(itemsJson)
        ReminderStore.update(ctx) { it.copy(items = items) }
        ReminderScheduler.arm(ctx)
        null
    }

    @ReactMethod
    fun configure(enabled: Boolean, hour: Int, minute: Int, promise: Promise) = run(promise) {
        require(hour in 0..23 && minute in 0..59) { "Reminder time is invalid." }
        ReminderStore.update(ctx) { it.copy(enabled = enabled, hour = hour, minute = minute) }
        ReminderScheduler.arm(ctx)
        null
    }

    @ReactMethod
    fun getStatus(promise: Promise) = run(promise) {
        val power = ctx.getSystemService(PowerManager::class.java)
        Arguments.createMap().apply {
            putBoolean("notificationsEnabled", ReminderNotifications.areEnabled(ctx))
            putBoolean("exactAlarmsAllowed", ReminderScheduler.canScheduleExact(ctx))
            putBoolean("ignoringBatteryOptimizations", power?.isIgnoringBatteryOptimizations(ctx.packageName) == true)
            val next = ReminderScheduler.nextFireAtMillis(ctx)
            if (next == null) putNull("nextFireAtMillis") else putDouble("nextFireAtMillis", next.toDouble())
        }
    }

    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT < 33) {
            promise.resolve(ReminderNotifications.areEnabled(ctx))
            return
        }
        if (ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            promise.resolve(true)
            return
        }
        val activity = ctx.currentActivity as? PermissionAwareActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "The app is not in the foreground.")
            return
        }
        val settled = AtomicBoolean(false)
        val listener = PermissionListener { requestCode, _, grantResults ->
            if (requestCode != REQUEST_NOTIFICATIONS) return@PermissionListener false
            if (settled.compareAndSet(false, true)) {
                promise.resolve(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
            }
            true
        }
        try {
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS, listener)
        } catch (error: Exception) {
            if (settled.compareAndSet(false, true)) {
                promise.reject("E_PERMISSION", "Could not request notification permission.", error)
            }
        }
    }

    @ReactMethod
    fun openSettings(kind: String, promise: Promise) = run(promise) {
        val pkg = ctx.packageName
        val intent = when (kind) {
            "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            } else appDetails(pkg)
            "exactAlarm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg"))
            } else appDetails(pkg)
            // The settings list (not the direct-request dialog) is Play-policy safe.
            "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            else -> throw IllegalArgumentException("Unknown settings kind: $kind")
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            ctx.startActivity(intent)
        } catch (_: Exception) {
            ctx.startActivity(appDetails(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        null
    }

    @ReactMethod
    fun sendTestNotification(promise: Promise) {
        if (!ReminderNotifications.areEnabled(ctx)) {
            promise.reject("E_NOTIFICATIONS_OFF", "Notifications are turned off for this app.")
            return
        }
        run(promise) {
            ReminderNotifications.show(ctx, ReminderContent.Content("Test reminder", "Daily revision reminders are working."))
            null
        }
    }

    @ReactMethod
    fun clearAll(promise: Promise) = run(promise) {
        ReminderStore.clear(ctx)
        ReminderScheduler.cancel(ctx)
        ReminderNotifications.dismiss(ctx)
        null
    }

    @ReactMethod
    fun scheduleOneShot(id: String, atMillis: Double, title: String, body: String, promise: Promise) = run(promise) {
        OneShotScheduler.schedule(ctx, OneShotPlan.plan(id, atMillis.toLong(), title, body, System.currentTimeMillis()))
        null
    }

    @ReactMethod
    fun cancelOneShot(id: String, promise: Promise) = run(promise) {
        OneShotScheduler.cancel(ctx, OneShotPlan.validateId(id))
        null
    }

    private fun appDetails(pkg: String) =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))

    private fun run(promise: Promise, action: () -> Any?) {
        try {
            promise.resolve(action())
        } catch (error: Exception) {
            promise.reject("E_REMINDERS", error.message ?: "Reminder operation failed.", error)
        }
    }

    private companion object {
        const val REQUEST_NOTIFICATIONS = 7002
    }
}
