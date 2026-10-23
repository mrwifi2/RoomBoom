package com.myterminal.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.termux.terminal.TerminalSession;
import com.termux.terminal.TextStyle;
import com.termux.view.TerminalView;
import com.termux.view.TerminalViewClient;

import java.util.Arrays;

public class TerminalActivity extends Activity implements TerminalViewClient {

    private static final int ACTIVE_KEY_COLOR = 0xFF80DEEA;   // classic highlight
    private static final int REQ_NOTIFICATIONS = 100;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;

    private LinearLayout rootLayout;
    private FrameLayout termHolder;
    private TextView statusView;
    private View extraKeys;
    private Button ctrlBtn, altBtn;

    private TerminalView terminalView;
    private TerminalSession session;
    private Distro current;

    private int fontSize, minFont, maxFont;
    private int schemeIndex;

    private boolean ctrlSticky, altSticky, volDown, volUp;

    // ------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("settings", MODE_PRIVATE);
        SessionStore.appContext = getApplicationContext();
        SessionStore.target = this;

        float density = getResources().getDisplayMetrics().density;
        int def = Math.round(12 * density);
        if (def % 2 == 1) def--;
        minFont = Math.round(6 * density);
        maxFont = Math.round(40 * density);
        fontSize = Math.max(minFont, Math.min(maxFont, prefs.getInt("font", def)));
        schemeIndex = Math.max(0, Math.min(ColorSchemes.ALL.length - 1, prefs.getInt("scheme", 0)));

        rootLayout = new LinearLayout(this);
        rootLayout.setOrientation(LinearLayout.VERTICAL);

        termHolder = new FrameLayout(this);
        rootLayout.addView(termHolder, new LinearLayout.LayoutParams(-1, 0, 1f));

        extraKeys = buildExtraKeys();
        rootLayout.addView(extraKeys, new LinearLayout.LayoutParams(-1, -2));

        statusView = new TextView(this);
        statusView.setTextColor(Color.WHITE);
        statusView.setTypeface(Typeface.MONOSPACE);
        statusView.setPadding(dp(16), dp(24), dp(16), dp(16));

        setContentView(rootLayout);
        applyColors();

        if (SessionStore.hasRunningSession()) {
            // The shell kept running in the background: just re-attach to it.
            session = SessionStore.session;
            current = SessionStore.distro;
            buildTerminalView();
            return;
        }

        String last = prefs.getString("distro", null);
        if (last == null) pickDistro(false);
        else launch(Distro.fromId(last));
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // The shell keeps running (TerminalService). Only detach the UI.
        if (SessionStore.target == this) SessionStore.target = null;
    }

    @Override
    protected void onResume() {
        super.onResume();
        showKeyboard();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) showKeyboard();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (k == KeyEvent.KEYCODE_VOLUME_DOWN) {           // Volume Down = Ctrl
            volDown = e.getAction() != KeyEvent.ACTION_UP;
            return true;
        }
        if (k == KeyEvent.KEYCODE_VOLUME_UP) {             // Volume Up = Fn
            volUp = e.getAction() != KeyEvent.ACTION_UP;
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // called by SessionStore
    void sessionTextChanged() {
        if (terminalView != null) terminalView.onScreenUpdated();
    }

    // ------------------------------------------------------------ distro / session

    private void showStatus(String msg) {
        termHolder.removeAllViews();
        terminalView = null;
        statusView.setText(msg);
        termHolder.addView(statusView);
    }

    private void pickDistro(boolean cancelable) {
        final java.util.List<Distro> list = Distro.available(this);
        if (list.size() == 1) {
            if (cancelable) android.widget.Toast.makeText(this, list.get(0).id + " is the only Linux installed", android.widget.Toast.LENGTH_SHORT).show();
            else launch(list.get(0));
            return;
        }
        Distro[] all = list.toArray(new Distro[0]);
        String[] items = new String[all.length];
        for (int i = 0; i < all.length; i++) {
            items[i] = all[i].title + (RootfsInstaller.isInstalled(this, all[i]) ? "   [installed]" : "");
        }
        new AlertDialog.Builder(this)
                .setTitle("Choose Linux")
                .setItems(items, (d, which) -> launch(all[which]))
                .setCancelable(cancelable)
                .show();
    }

    private void launch(Distro d) {
        TerminalSession old = SessionStore.session;
        SessionStore.session = null;        // so its finish callback is ignored
        session = null;
        if (old != null) old.finishIfRunning();

        showStatus("Preparing " + d.id + "...");
        new Thread(() -> {
            try {
                RootfsInstaller.ensureInstalled(this, d, msg -> ui.post(() -> statusView.setText(msg)));
                RootfsInstaller.applyConfig(this, d);
                ui.post(() -> startTerminal(d));
            } catch (Exception e) {
                ui.post(() -> {
                    statusView.setText("Setup failed:\n" + e);
                    pickDistro(current != null);
                });
            }
        }).start();
    }

    private void startTerminal(Distro d) {
        current = d;
        prefs.edit().putString("distro", d.id).apply();

        String[] cmd = RootfsInstaller.shellCommand(this, d);
        String[] args = Arrays.copyOfRange(cmd, 1, cmd.length);
        session = new TerminalSession(cmd[0], getFilesDir().getAbsolutePath(), args,
                RootfsInstaller.environment(this), 2000, SessionStore.CLIENT);
        SessionStore.session = session;
        SessionStore.distro = d;

        buildTerminalView();
        startBackgroundService();

        if (!prefs.getBoolean("bg_asked", false)) {
            ui.postDelayed(this::askBackgroundPermissions, 1200);
        }
    }

    private void buildTerminalView() {
        termHolder.removeAllViews();
        terminalView = new TerminalView(this, null);
        terminalView.setFocusable(true);
        terminalView.setFocusableInTouchMode(true);
        terminalView.setTerminalViewClient(this);
        terminalView.setTextSize(fontSize);
        terminalView.setTypeface(Typeface.MONOSPACE);
        termHolder.addView(terminalView, new FrameLayout.LayoutParams(-1, -1));

        terminalView.attachSession(session);
        terminalView.requestFocus();
        showKeyboard();
    }

    /** Shows the soft keyboard. Retried a few times because the view may not be focused/laid out yet. */
    private void showKeyboard() {
        for (int delay : new int[]{0, 150, 400, 900}) {
            ui.postDelayed(() -> {
                if (terminalView == null) return;
                terminalView.requestFocus();
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(terminalView, InputMethodManager.SHOW_IMPLICIT);
            }, delay);
        }
    }

    // ------------------------------------------------------------ background running

    private void startBackgroundService() {
        try {
            Intent i = new Intent(this, TerminalService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
            else startService(i);
        } catch (Exception e) {
            android.util.Log.w("MyTerminal", "could not start background service", e);
        }
    }

    private void askBackgroundPermissions() {
        if (isFinishing()) return;
        prefs.edit().putBoolean("bg_asked", true).apply();
        new AlertDialog.Builder(this)
                .setTitle("Run in background?")
                .setMessage("To keep the terminal running when you leave the app, allow notifications "
                        + "and turn off battery optimization for this app.")
                .setPositiveButton("Allow", (d, w) -> requestBackground())
                .setNegativeButton("Later", null)
                .show();
    }

    private void requestBackground() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } else {
            requestBatteryExemption();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_NOTIFICATIONS) requestBatteryExemption();
    }

    @SuppressLint("BatteryLife")
    private void requestBatteryExemption() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception ignored) { }
        }
    }

    // ------------------------------------------------------------ colors / font

    private void applyColors() {
        ColorSchemes.Scheme s = ColorSchemes.ALL[schemeIndex];
        if (session != null && session.getEmulator() != null) {
            int[] cur = session.getEmulator().mColors.mCurrentColors;
            System.arraycopy(s.palette, 0, cur, 0, 16);
            cur[TextStyle.COLOR_INDEX_FOREGROUND] = s.fg;
            cur[TextStyle.COLOR_INDEX_BACKGROUND] = s.bg;
            cur[TextStyle.COLOR_INDEX_CURSOR] = s.cursor;
        }
        rootLayout.setBackgroundColor(s.bg);
        extraKeys.setBackgroundColor(s.bg);
        getWindow().setStatusBarColor(s.bg);
        getWindow().setNavigationBarColor(s.bg);
        if (terminalView != null) terminalView.onScreenUpdated();
    }

    private void changeFont(int step) {
        fontSize = Math.max(minFont, Math.min(maxFont, fontSize + step * 2));
        prefs.edit().putInt("font", fontSize).apply();
        if (terminalView != null) terminalView.setTextSize(fontSize);
    }

    // ------------------------------------------------------------ extra keys row

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics()));
    }

    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(44)));
        return r;
    }

    private View buildExtraKeys() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);

        LinearLayout r1 = row();
        r1.addView(key("ESC", () -> sendKey(KeyEvent.KEYCODE_ESCAPE), false));
        r1.addView(key("/", () -> sendText("/"), false));
        r1.addView(key("-", () -> sendText("-"), false));
        r1.addView(key("|", () -> sendText("|"), false));
        r1.addView(key("HOME", () -> sendKey(KeyEvent.KEYCODE_MOVE_HOME), false));
        r1.addView(key("↑", () -> sendKey(KeyEvent.KEYCODE_DPAD_UP), true));
        r1.addView(key("END", () -> sendKey(KeyEvent.KEYCODE_MOVE_END), false));
        r1.addView(key("PGUP", () -> sendKey(KeyEvent.KEYCODE_PAGE_UP), true));

        LinearLayout r2 = row();
        r2.addView(key("TAB", () -> sendKey(KeyEvent.KEYCODE_TAB), false));
        ctrlBtn = key("CTRL", () -> { ctrlSticky = !ctrlSticky; updateModifierButtons(); }, false);
        altBtn = key("ALT", () -> { altSticky = !altSticky; updateModifierButtons(); }, false);
        r2.addView(ctrlBtn);
        r2.addView(altBtn);
        r2.addView(key("←", () -> sendKey(KeyEvent.KEYCODE_DPAD_LEFT), true));
        r2.addView(key("↓", () -> sendKey(KeyEvent.KEYCODE_DPAD_DOWN), true));
        r2.addView(key("→", () -> sendKey(KeyEvent.KEYCODE_DPAD_RIGHT), true));
        r2.addView(key("PGDN", () -> sendKey(KeyEvent.KEYCODE_PAGE_DOWN), true));
        r2.addView(key("☰", this::showMenu, false));

        col.addView(r1);
        col.addView(r2);
        return col;
    }

    private Button key(String label, Runnable action, boolean repeat) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(0, 0, 0, 0);
        b.setMinWidth(0);
        b.setMinHeight(0);
        b.setMinimumWidth(0);
        b.setMinimumHeight(0);
        b.setFocusable(false);                 // keep focus (and the keyboard) on the terminal
        b.setFocusableInTouchMode(false);

        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_pressed}, new ColorDrawable(0xFF3A3A3A));
        bg.addState(new int[]{}, new ColorDrawable(0x00000000));
        b.setBackground(bg);

        b.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1f));
        b.setOnTouchListener(new View.OnTouchListener() {
            Runnable repeater;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        v.setPressed(true);
                        action.run();
                        if (repeat) {
                            repeater = new Runnable() {
                                @Override public void run() {
                                    action.run();
                                    ui.postDelayed(this, 80);
                                }
                            };
                            ui.postDelayed(repeater, 400);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        v.setPressed(false);
                        if (repeater != null) ui.removeCallbacks(repeater);
                        repeater = null;
                        return true;
                }
                return true;
            }
        });
        return b;
    }

    private void updateModifierButtons() {
        ctrlBtn.setTextColor(ctrlSticky ? ACTIVE_KEY_COLOR : Color.WHITE);
        altBtn.setTextColor(altSticky ? ACTIVE_KEY_COLOR : Color.WHITE);
    }

    private void sendKey(int keyCode) {
        if (terminalView == null) return;
        terminalView.onKeyDown(keyCode, new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
        terminalView.onKeyUp(keyCode, new KeyEvent(KeyEvent.ACTION_UP, keyCode));
    }

    private void sendText(String s) {
        if (session != null) session.write(s);
    }

    // ------------------------------------------------------------ menu

    private void showMenu() {
        String[] items = {
                "Switch Linux (" + (current == null ? "-" : current.id) + ")",
                "Paste",
                "Text size  +",
                "Text size  -",
                "Color scheme",
                extraKeys.getVisibility() == View.VISIBLE ? "Hide extra keys" : "Show extra keys",
                "Background permission",
                "Reset this Linux (delete & reinstall)",
                "Exit terminal (stop everything)",
                "Licenses"
        };
        new AlertDialog.Builder(this)
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0: pickDistro(true); break;
                        case 1: pasteFromClipboard(); break;
                        case 2: changeFont(+1); break;
                        case 3: changeFont(-1); break;
                        case 4: pickScheme(); break;
                        case 5: toggleExtraKeys(); break;
                        case 6: requestBackground(); break;
                        case 7: confirmReset(); break;
                        case 8: SessionStore.stopEverything(); break;
                        case 9: showLicenses(); break;
                    }
                })
                .show();
    }

    private void confirmReset() {
        final Distro d = current;
        if (d == null) return;
        new AlertDialog.Builder(this)
                .setTitle("Reset " + d.id + "?")
                .setMessage("This deletes everything installed inside " + d.id
                        + " (packages, files in /root) and installs a fresh copy.")
                .setPositiveButton("Reset", (dlg, w) -> {
                    TerminalSession old = SessionStore.session;
                    SessionStore.session = null;          // ignore its finish callback
                    session = null;
                    if (old != null) old.finishIfRunning();
                    showStatus("Resetting " + d.id + "...");
                    new Thread(() -> {
                        RootfsInstaller.reset(this, d);
                        ui.post(() -> launch(d));
                    }).start();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void pickScheme() {
        new AlertDialog.Builder(this)
                .setTitle("Color scheme")
                .setSingleChoiceItems(ColorSchemes.names(), schemeIndex, (d, which) -> {
                    schemeIndex = which;
                    prefs.edit().putInt("scheme", which).apply();
                    applyColors();
                    d.dismiss();
                })
                .show();
    }

    private void toggleExtraKeys() {
        extraKeys.setVisibility(extraKeys.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
    }

    private void showLicenses() {
        new AlertDialog.Builder(this)
                .setTitle("Licenses")
                .setMessage("Terminal view/emulator libraries: Termux project (GPLv3).\n"
                        + "proot: GPLv2+.\n"
                        + "Alpine, Debian and Ubuntu root filesystems: their respective package licenses.\n\n"
                        + "This app's source is available under GPLv3.")
                .setPositiveButton("OK", null)
                .show();
    }

    private void pasteFromClipboard() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = cm.getPrimaryClip();
        if (clip != null && clip.getItemCount() > 0 && session != null && session.getEmulator() != null) {
            CharSequence t = clip.getItemAt(0).coerceToText(this);
            if (t != null) session.getEmulator().paste(t.toString());
        }
    }

    // ------------------------------------------------------------ TerminalViewClient

    @Override public float onScale(float scale) {
        if (scale < 0.9f || scale > 1.1f) {
            changeFont(scale > 1f ? +1 : -1);
            return 1.0f;
        }
        return scale;
    }

    @Override public void onSingleTapUp(MotionEvent e) { showKeyboard(); }
    @Override public boolean shouldBackButtonBeMappedToEscape() { return false; }
    // true = keyboard uses a normal text input type; works on every phone (TYPE_NULL hides the keyboard on some)
    @Override public boolean shouldEnforceCharBasedInput() { return true; }
    @Override public boolean shouldUseCtrlSpaceWorkaround() { return false; }
    @Override public boolean isTerminalViewSelected() { return true; }
    @Override public void copyModeChanged(boolean copyMode) { }
    @Override public boolean onKeyDown(int keyCode, KeyEvent e, TerminalSession s) { return false; }
    @Override public boolean onKeyUp(int keyCode, KeyEvent e) { return false; }
    @Override public boolean onLongPress(MotionEvent event) { return false; }

    @Override public boolean readControlKey() {
        boolean v = ctrlSticky || volDown;
        if (ctrlSticky) { ctrlSticky = false; ui.post(this::updateModifierButtons); }
        return v;
    }

    @Override public boolean readAltKey() {
        boolean v = altSticky;
        if (altSticky) { altSticky = false; ui.post(this::updateModifierButtons); }
        return v;
    }

    @Override public boolean readShiftKey() { return false; }
    @Override public boolean readFnKey() { return false; }

    /** Volume Up + key shortcuts, classic shortcuts. */
    @Override public boolean onCodePoint(int codePoint, boolean ctrl, TerminalSession s) {
        if (!volUp) return false;
        switch (Character.toLowerCase((char) codePoint)) {
            case 'e': sendKey(KeyEvent.KEYCODE_ESCAPE); return true;
            case 't': sendKey(KeyEvent.KEYCODE_TAB); return true;
            case 'w': sendKey(KeyEvent.KEYCODE_DPAD_UP); return true;
            case 'a': sendKey(KeyEvent.KEYCODE_DPAD_LEFT); return true;
            case 's': sendKey(KeyEvent.KEYCODE_DPAD_DOWN); return true;
            case 'd': sendKey(KeyEvent.KEYCODE_DPAD_RIGHT); return true;
            case 'p': sendKey(KeyEvent.KEYCODE_PAGE_UP); return true;
            case 'n': sendKey(KeyEvent.KEYCODE_PAGE_DOWN); return true;
            case 'h': sendText("~"); return true;
            case 'u': sendText("_"); return true;
            case 'l': sendText("|"); return true;
            case 'q': toggleExtraKeys(); return true;
            case '1': sendKey(KeyEvent.KEYCODE_F1); return true;
            case '2': sendKey(KeyEvent.KEYCODE_F2); return true;
            case '3': sendKey(KeyEvent.KEYCODE_F3); return true;
            case '4': sendKey(KeyEvent.KEYCODE_F4); return true;
            case '5': sendKey(KeyEvent.KEYCODE_F5); return true;
            case '6': sendKey(KeyEvent.KEYCODE_F6); return true;
            case '7': sendKey(KeyEvent.KEYCODE_F7); return true;
            case '8': sendKey(KeyEvent.KEYCODE_F8); return true;
            case '9': sendKey(KeyEvent.KEYCODE_F9); return true;
            case '0': sendKey(KeyEvent.KEYCODE_F10); return true;
            default: return false;
        }
    }

    @Override public void onEmulatorSet() { applyColors(); }

    // ------------------------------------------------------------ logging

    @Override public void logError(String tag, String message) { android.util.Log.e(tag, message); }
    @Override public void logWarn(String tag, String message) { android.util.Log.w(tag, message); }
    @Override public void logInfo(String tag, String message) { android.util.Log.i(tag, message); }
    @Override public void logDebug(String tag, String message) { android.util.Log.d(tag, message); }
    @Override public void logVerbose(String tag, String message) { android.util.Log.v(tag, message); }
    @Override public void logStackTraceWithMessage(String tag, String message, Exception e) { android.util.Log.e(tag, message, e); }
    @Override public void logStackTrace(String tag, Exception e) { android.util.Log.e(tag, "error", e); }
}
