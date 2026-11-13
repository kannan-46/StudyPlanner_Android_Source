package com.surgicalstudyplanner.app.auth

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class GoogleAuthModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun getName(): String = "GoogleAuth"

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    @ReactMethod
    fun signIn(webClientId: String, promise: Promise) {
        if (webClientId.isBlank()) {
            promise.reject("E_CONFIG", "Google sign-in is not configured")
            return
        }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_FAILED", "Sign-in is unavailable right now")
            return
        }
        // The credential UI needs the Activity; getCredential is a suspend
        // function that does its own off-main work, and each branch below
        // settles the promise exactly once.
        scope.launch {
            try {
                val option = GetSignInWithGoogleOption.Builder(webClientId).build()
                val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                val result = CredentialManager.create(activity).getCredential(activity, request)
                val credential = result.credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
                    val map = Arguments.createMap()
                    map.putString("idToken", idToken)
                    promise.resolve(map)
                } else {
                    promise.reject("E_FAILED", "Sign-in failed")
                }
            } catch (e: GetCredentialCancellationException) {
                promise.reject("E_CANCELLED", "Sign-in cancelled")
            } catch (e: NoCredentialException) {
                promise.reject("E_NO_ACCOUNT", "No Google account on this device")
            } catch (e: GetCredentialException) {
                promise.reject("E_FAILED", "Sign-in failed")
            } catch (e: Exception) {
                promise.reject("E_FAILED", "Sign-in failed")
            }
        }
    }

    @ReactMethod
    fun signOut(promise: Promise) {
        scope.launch {
            try {
                CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("E_FAILED", "Sign-out failed")
            }
        }
    }
}
