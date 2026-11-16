package com.surgicalstudyplanner.app.reminders

import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager

/** Tracks whether the app's screen is open in front of the user (set by MainActivity). */
object AppVisibility {
    @Volatile
    var activityResumed: Boolean = false

    fun isInFront(context: Context): Boolean {
        val power = context.getSystemService(PowerManager::class.java)
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        return OneShotPlan.appIsInFront(
            activityResumed,
            power?.isInteractive == true,
            keyguard?.isKeyguardLocked == true,
        )
    }
}
