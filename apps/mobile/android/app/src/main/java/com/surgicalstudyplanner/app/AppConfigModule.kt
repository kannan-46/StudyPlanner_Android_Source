package com.surgicalstudyplanner.app

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import android.text.format.DateFormat
import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppConfigModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "AppConfig"

    override fun getConstants(): Map<String, Any> = mapOf(
        "API_BASE_URL" to BuildConfig.API_BASE_URL,
        "GOOGLE_WEB_CLIENT_ID" to BuildConfig.GOOGLE_WEB_CLIENT_ID,
        // The phone's 12/24-hour clock setting, so times show the same way.
        "IS_24_HOUR_CLOCK" to DateFormat.is24HourFormat(reactApplicationContext),
    )

    /**
     * Keeps a native copy of the in-app theme ("system", "light" or "dark") so
     * the next launch opens in it from the first frame, before JS has loaded.
     */
    @ReactMethod
    fun setThemeMode(mode: String) {
        if (mode != "system" && mode != "light" && mode != "dark") return
        val context = reactApplicationContext
        ThemePrefs.save(context, mode)
        // Android 12+ draws its launch splash before the app runs; this tells
        // the system which theme to use for it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val uiModeManager =
                    context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
                uiModeManager.setApplicationNightMode(
                    when (mode) {
                        "dark" -> UiModeManager.MODE_NIGHT_YES
                        "light" -> UiModeManager.MODE_NIGHT_NO
                        else -> UiModeManager.MODE_NIGHT_AUTO
                    },
                )
            } catch (_: Exception) {
                // Best effort: the app window still uses the saved theme.
            }
        }
    }
}

/** The theme choice kept in SharedPreferences, read by MainActivity at launch. */
object ThemePrefs {
    private const val FILE = "app_prefs"
    private const val KEY = "theme_mode"

    fun save(context: Context, mode: String) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit().putString(KEY, mode).apply()
    }

    /** AppCompat night mode for the saved choice; follows the phone if unset. */
    fun nightMode(context: Context): Int =
        when (context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
}
