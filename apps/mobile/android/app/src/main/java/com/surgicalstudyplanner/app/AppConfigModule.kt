package com.surgicalstudyplanner.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppConfigModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "AppConfig"

    override fun getConstants(): Map<String, Any> = mapOf(
        "API_BASE_URL" to BuildConfig.API_BASE_URL,
    )
}
