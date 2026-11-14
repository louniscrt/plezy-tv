package fr.plezy.smarttv;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import java.util.Collections;

/** Full-screen Media3 playback for the trusted Plezy WebView. */
public final class PlayerActivity extends Activity {
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE_URL = "subtitleUrl";

    private ExoPlayer player;
    private PlayerView playerView;
    private long position;
    private boolean playWhenReady = true;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        String url = getIntent().getStringExtra(EXTRA_URL);
        if (!isWebUrl(url)) { finish(); return; }
        if (state != null) {
            position = state.getLong("position", 0);
            playWhenReady = state.getBoolean("playing", true);
        }
        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setKeepScreenOn(true);
        setContentView(playerView);
        playerView.requestFocus();
    }

    private static boolean isWebUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        Uri uri = Uri.parse(url);
        return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
            && uri.getHost() != null && uri.getUserInfo() == null;
    }

    private void startPlayer() {
        if (player != null || playerView == null) return;
        MediaItem.Builder item = new MediaItem.Builder().setUri(getIntent().getStringExtra(EXTRA_URL))
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(getIntent().getStringExtra(EXTRA_TITLE)).build());
        String subtitle = getIntent().getStringExtra(EXTRA_SUBTITLE_URL);
        if (isWebUrl(subtitle)) {
            item.setSubtitleConfigurations(Collections.singletonList(
                new MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle))
                    .setMimeType(MimeTypes.TEXT_VTT).setLanguage("fr").build()));
        }
        player = new ExoPlayer.Builder(this).build();
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
            .setPreferredAudioLanguage("fr").build());
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) {
                if (isFinishing() || isDestroyed()) return;
                new AlertDialog.Builder(PlayerActivity.this)
                    .setTitle("Lecture interrompue")
                    .setMessage("Impossible de lire ce flux. Vérifiez sa disponibilité puis réessayez.")
                    .setPositiveButton("Réessayer", (dialog, which) -> {
                        if (player != null) { player.prepare(); player.play(); }
                    })
                    .setNegativeButton("Retour", (dialog, which) -> finish())
                    .show();
            }
        });
        player.setMediaItem(item.build());
        if (position > 0) player.seekTo(position);
        player.setPlayWhenReady(playWhenReady);
        player.prepare();
        playerView.showController();
    }

    private void releasePlayer() {
        if (player == null) return;
        position = Math.max(0, player.getCurrentPosition());
        playWhenReady = player.getPlayWhenReady();
        playerView.setPlayer(null);
        player.release();
        player = null;
    }

    @Override protected void onStart() { super.onStart(); startPlayer(); }
    @Override protected void onStop() { releasePlayer(); super.onStop(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (player != null) {
            position = Math.max(0, player.getCurrentPosition());
            playWhenReady = player.getPlayWhenReady();
        }
        state.putLong("position", position);
        state.putBoolean("playing", playWhenReady);
        super.onSaveInstanceState(state);
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) immersive(); }
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
}
