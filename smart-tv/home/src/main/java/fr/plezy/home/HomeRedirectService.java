package fr.plezy.home;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;

/** Switch only when Google TV's own home activity appears. */
public final class HomeRedirectService extends AccessibilityService {
    private static final String GOOGLE_HOME = "com.google.android.apps.tv.launcherx.home.HomeActivity";
    private long lastRedirect = -500;

    @Override protected void onServiceConnected() {
        // The stock launcher may already be visible when Android binds us at boot.
        if (SystemClock.elapsedRealtime() < 90_000) openHome();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            || !GOOGLE_HOME.contentEquals(event.getClassName() == null ? "" : event.getClassName())) return;

        openHome();
    }

    private void openHome() {
        long now = SystemClock.uptimeMillis();
        if (now - lastRedirect < 500) return;
        lastRedirect = now;
        startActivity(new Intent(this, HomeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    @Override public void onInterrupt() {}
}
