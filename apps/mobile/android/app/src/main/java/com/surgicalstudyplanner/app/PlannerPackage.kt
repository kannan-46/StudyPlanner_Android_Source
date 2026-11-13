package com.surgicalstudyplanner.app

import com.surgicalstudyplanner.app.auth.GoogleAuthModule
import com.surgicalstudyplanner.app.backup.BackupFilesModule
import com.surgicalstudyplanner.app.reminders.ReminderModule
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PlannerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(
        ReminderModule(reactContext),
        BackupFilesModule(reactContext),
        AppConfigModule(reactContext),
        GoogleAuthModule(reactContext),
    )

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
