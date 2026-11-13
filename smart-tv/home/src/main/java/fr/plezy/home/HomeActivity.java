package fr.plezy.home;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class HomeActivity extends Activity {
    private static final String[] FAVORITES = {
        "fr.plezy.smarttv", "com.netflix.ninja", "com.canal.android.canal",
        "com.google.android.youtube.tv", "com.spotify.tv.android"
    };
    private static final int[] COLORS = {0xff242831, 0xff431019, 0xff24292d, 0xff622120, 0xff145d3a};
    private final List<List<View>> rows = new ArrayList<>();
    private LinearLayout content;
    private List<String> displayedPackages;

    @Override protected void onResume() {
        super.onResume();
        Map<String, ResolveInfo> installed = apps();
        List<ResolveInfo> pinned = new ArrayList<>();
        List<String> packages = new ArrayList<>();
        for (String name : FAVORITES) {
            ResolveInfo app = installed.get(name);
            if (app != null) {
                pinned.add(app);
                packages.add(name);
            }
        }
        if (!packages.equals(displayedPackages)) {
            displayedPackages = packages;
            build(pinned);
        }
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable surface(int top, int bottom, int radius, boolean selected) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{top, bottom});
        shape.setCornerRadius(dp(radius));
        if (selected) shape.setStroke(dp(2), Color.WHITE);
        return shape;
    }

    private TextView label(CharSequence text, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(Color.WHITE);
        view.setMaxLines(1);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private Map<String, ResolveInfo> apps() {
        Map<String, ResolveInfo> result = new LinkedHashMap<>();
        Intent query = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        List<ResolveInfo> found = getPackageManager().queryIntentActivities(query, 0);
        for (ResolveInfo app : found) {
            String name = app.activityInfo.packageName;
            if (!getPackageName().equals(name)) result.putIfAbsent(name, app);
        }
        return result;
    }

    private void build(List<ResolveInfo> pinned) {
        rows.clear();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0xff07152c, 0xff275572, 0xff101e34, 0xff071220}));
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(34), dp(18), dp(34), dp(24));
        content.setClipChildren(false);
        content.setClipToPadding(false);
        scroll.addView(content);
        setContentView(scroll);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = label("Accueil", 24, true);
        header.addView(title, new LinearLayout.LayoutParams(0, dp(40), 1));
        List<View> actions = new ArrayList<>();
        rows.add(actions);
        shortcut(header, actions, "Réglages  ⚙", new Intent(Settings.ACTION_SETTINGS));
        content.addView(header);

        if (!pinned.isEmpty()) {
            View space = new View(this);
            content.addView(space, new LinearLayout.LayoutParams(1, dp(128)));
            section("Mes applications");
            appRow(pinned);
        }
        wireRemote();
        rows.get(rows.size() > 1 ? 1 : 0).get(0).requestFocus();
    }

    private void section(String title) {
        TextView heading = label(title, 17, true);
        heading.setPadding(dp(4), dp(5), 0, dp(4));
        content.addView(heading);
    }

    private void shortcut(LinearLayout header, List<View> actions, String title, Intent intent) {
        TextView button = label(title, 16, true);
        button.setGravity(Gravity.CENTER);
        header.addView(button, new LinearLayout.LayoutParams(dp(120), dp(36)));
        setup(button, actions, 0xff395a77, () -> open(intent));
    }

    private void appRow(List<ResolveInfo> apps) {
        LinearLayout row = new LinearLayout(this);
        row.setClipChildren(false);
        row.setClipToPadding(false);
        GradientDrawable dock = surface(0x668fc4e9, 0x35344968, 22, false);
        dock.setStroke(dp(1), 0x789ec6e2);
        row.setBackground(dock);
        content.addView(row);
        List<View> views = new ArrayList<>();
        rows.add(views);
        int imageWidth = (getResources().getDisplayMetrics().widthPixels - dp(68 + 12 * apps.size())) / apps.size();
        int height = Math.round(imageWidth * 9f / 16f);
        for (int i = 0; i < apps.size(); i++) {
            ResolveInfo app = apps.get(i);
            CharSequence name = app.loadLabel(getPackageManager());
            FrameLayout card = new FrameLayout(this);
            LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(0, height, 1);
            size.setMargins(dp(6), dp(6), dp(6), dp(6));
            row.addView(card, size);
            ImageView icon = new ImageView(this);
            Drawable banner = "fr.plezy.smarttv".equals(app.activityInfo.packageName)
                ? getDrawable(R.drawable.plezy_glass) : app.activityInfo.loadBanner(getPackageManager());
            icon.setImageDrawable(banner == null ? app.loadIcon(getPackageManager()) : banner);
            icon.setScaleType(banner == null ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.CENTER_CROP);
            int imageEdge = banner != null ? -1 : dp(86);
            FrameLayout.LayoutParams imageSize = new FrameLayout.LayoutParams(imageEdge, imageEdge, Gravity.CENTER);
            card.addView(icon, imageSize);
            card.setClipToOutline(true);
            View sheen = new View(this);
            GradientDrawable glass = surface(0x32ffffff, 0x05000000, 15, false);
            glass.setStroke(dp(1), 0x60ffffff);
            sheen.setBackground(glass);
            card.addView(sheen, new FrameLayout.LayoutParams(-1, -1));
            View border = new View(this);
            border.setDuplicateParentStateEnabled(true);
            card.addView(border, new FrameLayout.LayoutParams(-1, -1));
            card.setContentDescription(name);
            setup(card, views, COLORS[i % COLORS.length], () -> open(new Intent(Intent.ACTION_MAIN)
                .setClassName(app.activityInfo.packageName, app.activityInfo.name)));
            GradientDrawable selected = surface(Color.TRANSPARENT, Color.TRANSPARENT, 15, true);
            StateListDrawable outline = new StateListDrawable();
            outline.addState(new int[]{android.R.attr.state_focused}, selected);
            border.setBackground(outline);
        }
    }

    private void setup(View view, List<View> row, int color, Runnable action) {
        view.setId(View.generateViewId());
        view.setFocusable(true);
        view.setOnClickListener(v -> action.run());
        view.setBackground(surface(color, 0xff111b2d, 15, false));
        view.setOnFocusChangeListener((v, focused) -> {
            v.setBackground(surface(color, 0xff111b2d, 15, focused));
            float scale = focused ? 1.055f : 1f;
            v.animate().scaleX(scale).scaleY(scale).translationZ(focused ? dp(6) : 0).setDuration(155).start();
        });
        row.add(view);
    }

    private void wireRemote() {
        for (int r = 0; r < rows.size(); r++) {
            List<View> row = rows.get(r);
            for (int c = 0; c < row.size(); c++) {
                View view = row.get(c);
                view.setNextFocusLeftId(row.get(Math.max(0, c - 1)).getId());
                view.setNextFocusRightId(row.get(Math.min(row.size() - 1, c + 1)).getId());
                if (r > 0) view.setNextFocusUpId(nearest(rows.get(r - 1), c, row.size()));
                if (r + 1 < rows.size()) view.setNextFocusDownId(nearest(rows.get(r + 1), c, row.size()));
            }
        }
    }

    private int nearest(List<View> row, int column, int count) {
        int index = Math.min(row.size() - 1, (int) ((column + .5f) * row.size() / count));
        return row.get(index).getId();
    }

    private void open(Intent intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException | SecurityException error) {
            Toast.makeText(this, "Application indisponible", Toast.LENGTH_SHORT).show();
        }
    }

    @Override public void onBackPressed() {
        if (rows.size() > 1) rows.get(1).get(0).requestFocus();
    }
}
