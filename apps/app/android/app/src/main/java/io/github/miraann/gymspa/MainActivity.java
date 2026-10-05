package io.github.miraann.gymspa;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Draw behind the status and navigation bars on every Android version, as Android 15+
        // already does. The web app keeps its content in the safe area with env(safe-area-inset-*).
        // Only after super.onCreate: it switches from the splash theme to the app theme, and
        // touching the window earlier would build it with the splash theme's action bar.
        EdgeToEdge.enable(this);
    }
}
