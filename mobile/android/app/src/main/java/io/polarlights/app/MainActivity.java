package io.polarlights.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (installed ones are registered by Capacitor).
        registerPlugin(PhotoLibraryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
