package fr.plezy.smarttv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** The deployed Plezy app remains the single source for catalog, playback and accounts. */
public class MainActivity extends Activity {
    private static final String DEFAULT_SERVER = "http://192.168.0.89:8081/";
    private WebView web;
    private LinearLayout root;
    private SharedPreferences prefs;
    private volatile String server;
    private volatile boolean ready;
    private boolean failed;
    private int loadSerial;
    private String adapter;
    private View customVideo;
    private WebChromeClient.CustomViewCallback customCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        prefs = getSharedPreferences("plezy.tv", MODE_PRIVATE);
        server = prefs.getString("server", DEFAULT_SERVER);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(16,16,16));
        setContentView(root);
        try {
            adapter = "(()=>{if(!window.PlezyUI || !/\\/tv\\/index\\.html$/.test(location.pathname))return false;"
                + "if(window.__plezyAndroidReady)return true;"
                + "var s=document.getElementById('plezy-tv-style');if(!s){s=document.createElement('style');s.id='plezy-tv-style';document.head.appendChild(s);}s.textContent="
                + JSONObject.quote(asset("tv.css") + "\n" + asset("android-tv.css"))
                + ";document.documentElement.classList.add('plezy-android-tv');\n" + asset("tv.js")
                + "\n;if(typeof window.qrcode!=='function'){\n" + asset("qrcode.js") + "\n;window.qrcode=qrcode;}\n"
                + asset("seerr-session.js") + "\n;\n" + asset("refresh.js") + "\n;\n" + asset("seerr-pairing.js")
                + "\n;\nvar video=document.getElementById('video');if(video)video.disableRemotePlayback=true;"
                + "window.__plezyAndroidReady=!!window.PlezyTV;return window.__plezyAndroidReady;})();";
        } catch (Exception e) { error("Les ressources TV n’ont pas pu être chargées."); return; }
        createWeb();
        load();
    }

    private String asset(String path) throws Exception {
        try (InputStream input = getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) out.write(buffer,0,count);
            return out.toString("UTF-8");
        }
    }
    private void createWeb() {
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(16,16,16));
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setUserAgentString(settings.getUserAgentString() + " PlezyTV/1.0 AndroidTV");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) { ready = false; failed = false; }
            @Override public void onPageFinished(WebView view, String url) {
                if (failed || !sameOrigin(url) || !isTelevisionPage(url)) return;
                injectAdapter(view, loadSerial, 40);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && route(request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return route(url); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError e) {
                if (request.isForMainFrame()) error("Serveur Plezy inaccessible. Vérifiez que la TV et votre serveur sont connectés au même réseau, et que le conteneur Plezy fonctionne.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) error("Le serveur Plezy répond avec une erreur HTTP " + response.getStatusCode() + ". Vérifiez l’adresse et le conteneur Node.");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public Bitmap getDefaultVideoPoster() {
                Bitmap poster = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                poster.eraseColor(Color.BLACK);
                return poster;
            }

            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customVideo != null) { callback.onCustomViewHidden(); return; }
                customVideo = view; customCallback = callback;
                web.setVisibility(View.GONE); root.addView(view, new LinearLayout.LayoutParams(-1,-1)); immersive();
            }
            @Override public void onHideCustomView() { hideCustom(); }
        });
    }
    /** Only the configured Plezy origin may be handed to the native player. */
    private boolean trustedMediaUrl(String value) {
        if (value == null || value.isEmpty()) return false;
        Uri uri = Uri.parse(value);
        return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
            && uri.getHost() != null && uri.getUserInfo() == null && sameOrigin(value);
    }

    public final class AndroidBridge {
        @JavascriptInterface public boolean playVideo(String url, String title) {
            return launchNative(url, title, "");
        }

        @JavascriptInterface public boolean playVideoWithSubtitle(String url, String title, String subtitleUrl) {
            return launchNative(url, title, subtitleUrl);
        }

        private boolean launchNative(String url, String title, String subtitleUrl) {
            if (!ready || !trustedMediaUrl(url) ||
                (subtitleUrl != null && !subtitleUrl.isEmpty() && !trustedMediaUrl(subtitleUrl))) return false;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || !ready || web == null || !isTelevisionPage(web.getUrl())) return;
                Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                intent.putExtra(PlayerActivity.EXTRA_URL, url);
                intent.putExtra(PlayerActivity.EXTRA_TITLE, title == null ? "" : title);
                intent.putExtra(PlayerActivity.EXTRA_SUBTITLE_URL, subtitleUrl == null ? "" : subtitleUrl);
                // Activity.onPause pauses the WebView while the native player is visible.
                startActivity(intent);
            });
            return true;
        }
    }

    private void injectAdapter(WebView view, int serial, int attempts) {
        if (isDestroyed() || failed || serial != loadSerial || !isTelevisionPage(view.getUrl())) return;
        view.evaluateJavascript(adapter, value -> {
            if (isDestroyed() || failed || serial != loadSerial || !isTelevisionPage(view.getUrl())) return;
            if ("true".equals(value)) {
                ready = true;
                view.requestFocus();
            } else if (attempts > 0) {
                view.postDelayed(() -> injectAdapter(view, serial, attempts - 1), 250);
            } else {
                error("Cette adresse ne fournit pas Plezy TV. Vérifiez l’adresse de Plezy (port 8081).");
            }
        });
    }
    private boolean isTelevisionPage(String value) {
        return sameOrigin(value) && Uri.parse(televisionUrl(server)).getPath().equals(Uri.parse(value).getPath());
    }
    private boolean sameOrigin(String value) {
        if (value == null) return false;
        Uri a = Uri.parse(value), b = Uri.parse(server);
        return java.util.Objects.equals(a.getScheme(), b.getScheme()) && java.util.Objects.equals(a.getHost(), b.getHost()) && effectivePort(a) == effectivePort(b);
    }
    private int effectivePort(Uri url) { return url.getPort() >= 0 ? url.getPort() : "https".equals(url.getScheme()) ? 443 : 80; }
    private boolean route(String url) {
        if ("plezytv://settings".equals(url)) { configure(); return true; }
        if (sameOrigin(url)) return false;
        Uri link = Uri.parse(url);
        if ("http".equals(link.getScheme()) || "https".equals(link.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, link)); }
            catch (Exception e) { Toast.makeText(this,"Aucune application ne peut ouvrir ce lien sur la TV.",Toast.LENGTH_LONG).show(); }
        }
        return true;
    }
    private void load() {
        ready = false; failed = false;
        root.removeAllViews();
        if (web.getParent() != null) ((ViewGroup) web.getParent()).removeView(web);
        root.addView(web, new LinearLayout.LayoutParams(-1,-1));
        web.setVisibility(View.VISIBLE); web.requestFocus();
        ++loadSerial;
        Uri target = Uri.parse(televisionUrl(server)).buildUpon()
            .appendQueryParameter("tvLoad", Long.toString(System.currentTimeMillis())).build();
        web.loadUrl(target.toString());
    }
    private String televisionUrl(String value) {
        Uri uri = Uri.parse(value);
        String path = uri.getPath() == null ? "/" : uri.getPath();
        path = path.replaceFirst("/(?:tv/)?index\\.html/?$", "/").replaceFirst("/tv/?$", "/");
        if (!path.endsWith("/")) path += "/";
        return uri.buildUpon().path(path + "tv/index.html").fragment(null).build().toString();
    }
    private void error(String message) {
        if (isFinishing()) return;
        ready = false; failed = true;
        root.removeAllViews();
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(getResources().getDisplayMetrics().density * 40); box.setPadding(pad,pad,pad,pad);
        TextView title = new TextView(this); title.setText("PLEZY TV"); title.setTextColor(Color.rgb(229,9,20)); title.setTextSize(32); box.addView(title);
        TextView text = new TextView(this); text.setText(message + "\n\n" + server); text.setTextColor(Color.WHITE); text.setTextSize(20); text.setPadding(0,20,0,20); box.addView(text);
        Button retry = new Button(this); retry.setText("Réessayer"); retry.setOnClickListener(v -> load()); box.addView(retry);
        Button address = new Button(this); address.setText("Changer l’adresse de Plezy"); address.setOnClickListener(v -> configure()); box.addView(address);
        root.addView(box); retry.requestFocus();
    }
    private void configure() {
        final EditText input = new EditText(this); input.setSingleLine(true);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(server);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Adresse de Plezy Web")
            .setMessage("Adresse de votre web app, par exemple http://192.168.0.89:8081. Les identifiants Jellyfin se saisissent ensuite dans Plezy.")
            .setView(input).setNegativeButton("Annuler",null).setPositiveButton("Enregistrer",null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = input.getText().toString().trim();
            if (!value.matches("(?i)^https?://.*")) value = "http://" + value;
            Uri uri = Uri.parse(value);
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
                input.setError("Adresse HTTP ou HTTPS invalide."); return;
            }
            if (!value.endsWith("/")) value += "/";
            server = value; prefs.edit().putString("server",server).apply();
            dialog.dismiss(); load();
        }));
        dialog.show();
    }
    private void hideCustom() {
        if (customVideo == null) return;
        root.removeView(customVideo); customVideo = null;
        web.setVisibility(View.VISIBLE);
        if (customCallback != null) { customCallback.onCustomViewHidden(); customCallback = null; }
        immersive();
    }
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if(focus) immersive(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_MENU || key == KeyEvent.KEYCODE_SETTINGS) {
            if (event.getAction() == KeyEvent.ACTION_UP) configure(); return true;
        }
        if (ready && web != null && customVideo == null && web.hasFocus() && hasWindowFocus()) {
            String dpad = null;
            switch (key) {
                case KeyEvent.KEYCODE_DPAD_UP: dpad = "ArrowUp"; break;
                case KeyEvent.KEYCODE_DPAD_DOWN: dpad = "ArrowDown"; break;
                case KeyEvent.KEYCODE_DPAD_LEFT: dpad = "ArrowLeft"; break;
                case KeyEvent.KEYCODE_DPAD_RIGHT: dpad = "ArrowRight"; break;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER: dpad = "Enter"; break;
            }
            if (dpad != null && (event.getAction() == KeyEvent.ACTION_DOWN || event.getAction() == KeyEvent.ACTION_UP)) {
                KeyEvent original = KeyEvent.obtain(event);
                String type = event.getAction() == KeyEvent.ACTION_DOWN ? "keydown" : "keyup";
                String script = "(function(){var e=document.activeElement||document.body;"
                    + "if(e.matches('input,textarea,select,[contenteditable=true]'))return false;"
                    + "var k=" + JSONObject.quote(dpad) + ",t=" + JSONObject.quote(type) + ";"
                    + "var ev=new KeyboardEvent(t,{key:k,code:k,bubbles:true,cancelable:true,repeat:" + (event.getRepeatCount() > 0) + "});"
                    + "e.dispatchEvent(ev);"
                    + "if(t==='keydown'&&k==='Enter'&&!ev.defaultPrevented&&e.matches('button,a'))e.click();"
                    + "return true;})()";
                web.evaluateJavascript(script, handled -> {
                    try {
                        if ("false".equals(handled) && !isFinishing() && !isDestroyed() && web != null) web.dispatchKeyEvent(original);
                    } finally { original.recycle(); }
                });
                return true;
            }
        }
        if (ready && event.getAction() == KeyEvent.ACTION_DOWN) {
            String media = null;
            switch (key) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: media = "toggle"; break;
                case KeyEvent.KEYCODE_MEDIA_PLAY: media = "play"; break;
                case KeyEvent.KEYCODE_MEDIA_PAUSE: media = "pause"; break;
                case KeyEvent.KEYCODE_MEDIA_REWIND: media = "rewind"; break;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: media = "forward"; break;
                case KeyEvent.KEYCODE_MEDIA_NEXT: media = "next"; break;
                case KeyEvent.KEYCODE_MEDIA_STOP: media = "stop"; break;
            }
            if (media != null) { web.evaluateJavascript("window.PlezyTV&&PlezyTV.media(" + JSONObject.quote(media) + ")",null); return true; }
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed() {
        if (customVideo != null) { hideCustom(); return; }
        if (!ready) { confirmExit(); return; }
        web.evaluateJavascript("!!(window.PlezyTV&&PlezyTV.back())", value -> { if (!"true".equals(value)) confirmExit(); });
    }
    private void confirmExit() {
        new AlertDialog.Builder(this).setTitle("Quitter Plezy TV ?").setNegativeButton("Rester",null)
            .setPositiveButton("Quitter",(dialog,which) -> finish()).show();
    }
    @Override protected void onPause() {
        if (web != null) { web.evaluateJavascript("if(window.PlezyTV)PlezyTV.media('pause');",null); web.onPause(); }
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (web != null) { web.stopLoading(); if(web.getParent()!=null)((ViewGroup)web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
