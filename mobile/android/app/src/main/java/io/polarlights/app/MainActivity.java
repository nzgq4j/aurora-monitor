package io.polarlights.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (installed ones are registered by Capacitor).
        registerPlugin(PhotoLibraryPlugin.class);
        registerPlugin(GoogleSignInPlugin.class);
        registerPlugin(PlayBillingPlugin.class);
        // LongExposurePlugin (Sky view's long-exposure camera) is not registered while Sky view is paused;
        // registering it again also needs the CAMERA permission back in AndroidManifest.xml.
        super.onCreate(savedInstanceState);
    }
}
