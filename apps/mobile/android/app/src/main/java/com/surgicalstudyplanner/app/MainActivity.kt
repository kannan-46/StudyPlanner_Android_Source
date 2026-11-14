package com.surgicalstudyplanner.app

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.surgicalstudyplanner.app.reminders.ReminderNotifications
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Applies the theme saved by the app (AppConfig.setThemeMode) before the
   * window exists, so the window, system bars and first frame are already in
   * the user's theme instead of the phone's dark mode. AppCompat applies the
   * night mode while the base context is attached, so it is set just before.
   */
  override fun attachBaseContext(newBase: Context) {
    AppCompatDelegate.setDefaultNightMode(ThemePrefs.nightMode(newBase))
    super.attachBaseContext(newBase)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ReminderNotifications.createChannel(this)
  }

  /**
   * The in-app theme switch calls Appearance.setColorScheme, which changes the
   * night mode and lands here (uiMode is in configChanges). Edge-to-edge sets
   * the navigation bar icons only once at launch, so update them to match.
   */
  @Suppress("DEPRECATION") // navigationBarColor, only used before Android 10
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val isDark =
        (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      // Before Android 10 the bar has a scrim instead of being transparent.
      window.navigationBarColor =
          if (isDark) Color.argb(0x80, 0x1b, 0x1b, 0x1b)
          else Color.argb(0xe6, 0xFF, 0xFF, 0xFF)
    }
    WindowInsetsControllerCompat(window, window.decorView)
        .isAppearanceLightNavigationBars = !isDark
    // The activity is not recreated, so the window keeps the background of
    // the old theme wherever it shows through unless it is refreshed here.
    window.setBackgroundDrawable(
        ColorDrawable(
            ContextCompat.getColor(
                createConfigurationContext(newConfig), R.color.app_background)))
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SurgicalStudyPlanner"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
