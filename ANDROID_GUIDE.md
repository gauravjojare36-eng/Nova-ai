# Nova AI - Android Implementation Guide

This guide provides the complete architecture, folder structure, permissions, and setup instructions for building the native Android version of **Nova AI**.

## 1. Folder Structure (Kotlin + MVVM)

```text
com.nova.ai
â”œâ”€â”€ NovaApplication.kt          # Application class (Hilt initialization)
â”œâ”€â”€ di/                         # Dependency Injection (Dagger Hilt)
â”‚   â”œâ”€â”€ AppModule.kt
â”‚   â””â”€â”€ NetworkModule.kt
â”œâ”€â”€ data/                       # Data Layer
â”‚   â”œâ”€â”€ local/                  # Room Database (Context memory)
â”‚   â”œâ”€â”€ remote/                 # API Interfaces (LLM/ChatGPT)
â”‚   â””â”€â”€ repository/             # Repository implementations
â”œâ”€â”€ domain/                     # Domain Layer (Use Cases)
â”‚   â”œâ”€â”€ model/                  # Data classes
â”‚   â””â”€â”€ usecase/                # Business logic (e.g., ParseCommandUseCase)
â”œâ”€â”€ service/                    # Background & System Services
â”‚   â”œâ”€â”€ NovaAccessibilityService.kt # UI Automation & Navigation
â”‚   â”œâ”€â”€ VoiceRecognitionService.kt  # Continuous listening (SpeechRecognizer)
â”‚   â””â”€â”€ FloatingWidgetService.kt    # Mini floating assistant bubble
â”œâ”€â”€ ui/                         # Presentation Layer (Jetpack Compose)
â”‚   â”œâ”€â”€ theme/                  # Colors, Typography, Shapes
â”‚   â”œâ”€â”€ screens/                # Chat, Settings, Automation screens
â”‚   â””â”€â”€ viewmodel/              # MainViewModel, SettingsViewModel
â””â”€â”€ utils/                      # Extensions, Constants, PermissionsHelper
```

## 2. Required Permissions (`AndroidManifest.xml`)

To achieve system-level control, you need the following permissions:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.nova.ai">

    <!-- Core Voice & Internet -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.INTERNET" />
    
    <!-- Device Control -->
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    
    <!-- System Level & Automation -->
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" /> <!-- Floating Bubble -->
    <uses-permission android:name="android.permission.BIND_ACCESSIBILITY_SERVICE" /> <!-- Auto-clicking -->
    <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" /> <!-- Read Notifications -->

    <application
        android:name=".NovaApplication"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.NovaAI">
        
        <!-- Accessibility Service Declaration -->
        <service
            android:name=".service.NovaAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>

    </application>
</manifest>
```

## 3. Step-by-Step Setup Guide

1. **Create Project**: Open Android Studio -> New Project -> Empty Compose Activity.
2. **Add Dependencies**: Add the following to your `build.gradle` (app level):
   - `androidx.core:core-ktx`
   - `androidx.lifecycle:lifecycle-runtime-ktx`
   - Jetpack Compose (UI)
   - Dagger Hilt (Dependency Injection)
   - Retrofit & OkHttp (Network/LLM API)
   - Room (Local Database)
3. **Initialize Hilt**: Annotate your `Application` class with `@HiltAndroidApp`.
4. **Setup SpeechRecognizer**: Use Android's native `SpeechRecognizer` class in a foreground service for continuous listening.
5. **Integrate LLM**: Create a Retrofit interface to call the OpenAI/Gemini API.
6. **Implement Accessibility**: Override `onAccessibilityEvent` in your `NovaAccessibilityService` to perform clicks and scrolls based on voice commands.

## 4. API Integration Guide (LLM)

Use a Retrofit interface to connect to your chosen LLM (e.g., Gemini or OpenAI):

```kotlin
interface LlmApiService {
    @POST("v1/chat/completions")
    suspend fun getAssistantResponse(
        @Header("Authorization") token: String,
        @Body request: ChatRequest
    ): Response<ChatResponse>
}
```

**Prompt Engineering for the AI Brain:**
Inject a system prompt before sending the user's command:
*"You are Nova, a smart Android assistant. The user wants to execute a command. If it's a system command (like 'turn on wifi'), reply with JSON: `{"action": "WIFI_ON"}`. If it's conversational, reply with JSON: `{"action": "SPEAK", "text": "..."}`."*

## 5. APK Build Instructions

1. In Android Studio, go to **Build > Generate Signed Bundle / APK**.
2. Select **APK**.
3. Create a new Key Store path (or use an existing one).
4. Select the **release** build variant.
5. Click **Finish**. The APK will be generated in the `app/release/` folder.

## 6. Native Implementation: Apps & WiFi

To implement the specific logic of checking if an app is installed before opening it, and toggling WiFi natively on Android, use the following approaches:

### Checking if an App is Installed
Use the `PackageManager` to verify if the target package exists on the user's device.

```kotlin
fun isAppInstalled(context: Context, appName: String): Boolean {
    val pm = context.packageManager
    val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
    
    for (packageInfo in packages) {
        val name = pm.getApplicationLabel(packageInfo).toString()
        if (name.equals(appName, ignoreCase = true)) {
            return true
        }
    }
    return false
}

fun openAppByName(context: Context, appName: String) {
    if (isAppInstalled(context, appName)) {
        // Find package name and launch
        val pm = context.packageManager
        val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val targetPackage = packages.firstOrNull { 
            pm.getApplicationLabel(it).toString().equals(appName, ignoreCase = true) 
        }?.packageName
        
        targetPackage?.let {
            val intent = pm.getLaunchIntentForPackage(it)
            context.startActivity(intent)
        }
    } else {
        // Trigger TTS: "App not installed"
    }
}
```

### Toggling WiFi
*Note: On Android 10 (API 29) and above, apps cannot directly toggle WiFi without user interaction unless they are system apps. You must use `Settings.Panel` to prompt the user.*

```kotlin
fun toggleWifi(context: Context, turnOn: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // Android 10+: Open the WiFi settings panel
        val panelIntent = Intent(Settings.Panel.ACTION_WIFI)
        panelIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(panelIntent)
    } else {
        // Android 9 and below: Direct toggle
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.isWifiEnabled = turnOn
    }
}
```
