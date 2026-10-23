package com.myterminal.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Foreground service: keeps the app process (and the shell inside it) alive in the background. */
public class TerminalService extends Service {

    static final String CHANNEL = "terminal_session";
    static final String ACTION_EXIT = "com.myterminal.app.EXIT";
    private static final int NOTIF_ID = 1;

    private PowerManager.WakeLock wakeLock;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_EXIT.equals(intent.getAction())) {
            SessionStore.appContext = getApplicationContext();
            SessionStore.stopEverything();
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIF_ID, n);
        }

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MyTerminal:session");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Terminal session",
                    NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }

        Intent open = new Intent(this, TerminalActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent exit = new Intent(this, TerminalService.class).setAction(ACTION_EXIT);
        PendingIntent exitPi = PendingIntent.getService(this, 1, exit,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);

        return b.setContentTitle("MyTerminal")
                .setContentText("Terminal is running")
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setContentIntent(openPi)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Exit", exitPi)
                .build();
    }
}
