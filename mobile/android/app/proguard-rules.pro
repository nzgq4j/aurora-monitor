# R8 keep rules for the release build (minifyEnabled in build.gradle).
#
# Already covered by rules shipped with the libraries:
# - Capacitor (consumer rules): every class extending com.getcapacitor.Plugin, so this app's own plugins
#   (PlayBillingPlugin, PhotoLibraryPlugin, GoogleSignInPlugin, LongExposurePlugin) and their @PluginMethod,
#   @PermissionCallback and @ActivityCallback methods, which Capacitor calls by name.
# - proguard-android-optimize.txt: @JavascriptInterface methods (the WebView bridge).
# - Play Billing, Firebase Messaging and AndroidX: their own consumer rules.

# Credential Manager (Sign in with Google) finds its Play services provider by reflection.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }

# The app's own plugins, kept explicitly as well (they are registered by class in MainActivity).
-keep class io.polarlights.app.** extends com.getcapacitor.Plugin { *; }

# Readable stack traces in Play's crash reports (with the mapping file R8 adds to the bundle).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
