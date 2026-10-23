package com.myterminal.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;

import com.termux.terminal.TerminalSession;
import com.termux.terminal.TerminalSessionClient;

/**
 * Holds the running terminal session independently of the Activity, so the shell keeps
 * running (kept alive by TerminalService) when the Activity is closed or in the background.
 */
final class SessionStore {

    static TerminalSession session;
    static Distro distro;
    static TerminalActivity target;          // current UI, may be null while in background
    static Context appContext;

    private SessionStore() { }

    static boolean hasRunningSession() {
        return session != null && session.isRunning();
    }

    /** Ends the shell, stops the background service and closes the UI. */
    static void stopEverything() {
        TerminalSession s = session;
        session = null;
        if (s != null) s.finishIfRunning();
        if (appContext != null) appContext.stopService(new Intent(appContext, TerminalService.class));
        if (target != null) target.finish();
    }

    /** Session callbacks. They keep working even when no Activity is attached. */
    static final TerminalSessionClient CLIENT = new TerminalSessionClient() {

        @Override public void onTextChanged(TerminalSession s) {
            if (target != null) target.sessionTextChanged();
        }

        @Override public void onTitleChanged(TerminalSession s) { }

        @Override public void onSessionFinished(TerminalSession s) {
            if (s != session) return;                 // an old session we replaced on purpose
            stopEverything();
        }

        @Override public void onCopyTextToClipboard(TerminalSession s, String text) {
            if (appContext == null) return;
            ClipboardManager cm = (ClipboardManager) appContext.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("terminal", text));
        }

        @Override public void onPasteTextFromClipboard(TerminalSession s) {
            if (appContext == null || s == null || s.getEmulator() == null) return;
            ClipboardManager cm = (ClipboardManager) appContext.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = cm.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(appContext);
                if (t != null) s.getEmulator().paste(t.toString());
            }
        }

        @Override public void onBell(TerminalSession s) { }
        @Override public void onColorsChanged(TerminalSession s) { }
        @Override public void onTerminalCursorStateChange(boolean state) { }
        public void setTerminalShellPid(TerminalSession s, int pid) { }
        @Override public Integer getTerminalCursorStyle() { return null; }

        @Override public void logError(String tag, String message) { android.util.Log.e(tag, message); }
        @Override public void logWarn(String tag, String message) { android.util.Log.w(tag, message); }
        @Override public void logInfo(String tag, String message) { android.util.Log.i(tag, message); }
        @Override public void logDebug(String tag, String message) { android.util.Log.d(tag, message); }
        @Override public void logVerbose(String tag, String message) { android.util.Log.v(tag, message); }
        @Override public void logStackTraceWithMessage(String tag, String message, Exception e) { android.util.Log.e(tag, message, e); }
        @Override public void logStackTrace(String tag, Exception e) { android.util.Log.e(tag, "error", e); }
    };
}
