package com.skalaprioritas.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;

public final class NotificationHelper {

    public static final String CHANNEL_ID = "skala_incoming_messages_v2";
    public static final String CHANNEL_NAME = "Notifikasi Masuk (Popup WA)";
    public static final String CHANNEL_DESC =
        "Pemberitahuan tiket, persetujuan, PO, dan pengiriman dalam tampilan popup prioritas tinggi.";
    public static final String EXTRA_ACTION_URL = "skala_action_url";
    public static final String EXTRA_NOTIFICATION_ID = "skala_notification_id";

    private static final String PREFS_NAME = "skala_native_notifications";
    private static final String KEY_SEEN_IDS = "seen_ids_ordered";
    private static final String KEY_BASELINE_SET = "baseline_set";
    private static final int MAX_TRACKED_IDS = 200;
    private static final long MIN_FEEDBACK_INTERVAL_MS = 1400L;
    private static final long[] VIBRATE_PATTERN = new long[] { 0L, 140L, 70L, 140L };

    private static volatile long lastFeedbackTimestampMs = 0L;

    private NotificationHelper() {}

    public static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(CHANNEL_DESC);
        channel.enableLights(true);
        channel.setLightColor(0xFFE67E22);
        channel.enableVibration(true);
        channel.setVibrationPattern(VIBRATE_PATTERN);
        channel.setShowBadge(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        channel.setSound(soundUri, attrs);

        manager.createNotificationChannel(channel);
    }

    public static boolean canPostNotifications(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED
            ) {
                return false;
            }
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static String sanitizeActionUrl(String rawUrl) {
        if (rawUrl == null) {
            return "/apps/tickets";
        }
        String trimmed = rawUrl.trim();
        if (
            trimmed.isEmpty() ||
            !trimmed.startsWith("/") ||
            trimmed.startsWith("//") ||
            trimmed.contains("..")
        ) {
            return "/apps/tickets";
        }
        return trimmed;
    }

    public static void showWhatsAppHeadsUpNotification(
        Context context,
        String notificationId,
        String title,
        String message,
        String categoryLabel,
        String actionUrl,
        long timestampMs
    ) {
        ensureNotificationChannel(context);
        if (!canPostNotifications(context)) {
            return;
        }

        String safeId = (notificationId == null || notificationId.trim().isEmpty())
            ? String.valueOf(System.currentTimeMillis())
            : notificationId.trim();
        String safeTitle = (title == null || title.trim().isEmpty())
            ? "Skala Prioritas"
            : title.trim();
        String safeMessage = (message == null || message.trim().isEmpty())
            ? "Ada pembaruan baru di sistem operasional."
            : message.trim();
        String safeCategory = (categoryLabel == null || categoryLabel.trim().isEmpty())
            ? "Skala Prioritas"
            : categoryLabel.trim();
        String safeUrl = sanitizeActionUrl(actionUrl);
        long safeTimestamp = timestampMs > 0 ? timestampMs : System.currentTimeMillis();

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setAction(Intent.ACTION_VIEW);
        launchIntent.setData(Uri.parse("skala://notification/" + Uri.encode(safeId)));
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra(EXTRA_ACTION_URL, safeUrl);
        launchIntent.putExtra(EXTRA_NOTIFICATION_ID, safeId);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        int notifyId = stableNotificationIntId(safeId);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notifyId,
            launchIntent,
            pendingFlags
        );

        Person me = new Person.Builder().setName("Anda").build();
        Person sender = new Person.Builder()
            .setName(safeTitle)
            .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher_round))
            .build();

        NotificationCompat.MessagingStyle messagingStyle =
            new NotificationCompat.MessagingStyle(me)
                .setConversationTitle(safeTitle)
                .addMessage(safeMessage, safeTimestamp, sender);

        Bitmap largeIcon = BitmapFactory.decodeResource(
            context.getResources(),
            R.mipmap.ic_launcher_round
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_skala)
            .setColor(0xFF102A4D)
            .setContentTitle(safeTitle)
            .setContentText(safeMessage)
            .setSubText(safeCategory)
            .setStyle(messagingStyle)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(VIBRATE_PATTERN)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setWhen(safeTimestamp)
            .setShowWhen(true)
            .setContentIntent(contentIntent);

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon);
        }

        try {
            NotificationManagerCompat.from(context).notify(notifyId, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS might be revoked concurrently
        }
    }

    public static void cancelNotification(Context context, String notificationId) {
        if (notificationId == null || notificationId.trim().isEmpty()) {
            return;
        }
        try {
            NotificationManagerCompat.from(context).cancel(stableNotificationIntId(notificationId.trim()));
        } catch (Exception ignored) {
        }
    }

    public static void playInAppFeedback(Context context, boolean playSound, boolean vibrate) {
        long now = System.currentTimeMillis();
        if (now - lastFeedbackTimestampMs < MIN_FEEDBACK_INTERVAL_MS) {
            return;
        }
        lastFeedbackTimestampMs = now;

        AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        int ringerMode = audioManager != null
            ? audioManager.getRingerMode()
            : AudioManager.RINGER_MODE_NORMAL;

        if (vibrate && ringerMode != AudioManager.RINGER_MODE_SILENT) {
            triggerVibration(context);
        }

        if (playSound && ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            try {
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                Ringtone ringtone = soundUri != null
                    ? RingtoneManager.getRingtone(context.getApplicationContext(), soundUri)
                    : null;
                if (ringtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        ringtone.setVolume(0.75f);
                    }
                    ringtone.play();
                }
            } catch (Exception ignored) {
            }
        }
    }

    private static void triggerVibration(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager =
                    (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (manager != null) {
                    Vibrator vibrator = manager.getDefaultVibrator();
                    vibrator.vibrate(VibrationEffect.createWaveform(VIBRATE_PATTERN, -1));
                }
                return;
            }
            @SuppressWarnings("deprecation")
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(VIBRATE_PATTERN, -1));
                } else {
                    vibrator.vibrate(VIBRATE_PATTERN, -1);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private static int stableNotificationIntId(String rawId) {
        int hash = rawId.hashCode();
        return hash == Integer.MIN_VALUE ? 1001 : Math.abs(hash) + 2000;
    }

    public static synchronized boolean isBaselineSet(Context context) {
        return getPrefs(context).getBoolean(KEY_BASELINE_SET, false);
    }

    public static synchronized void markBaselineSet(Context context) {
        getPrefs(context).edit().putBoolean(KEY_BASELINE_SET, true).apply();
    }

    public static synchronized Set<String> getSeenIds(Context context) {
        SharedPreferences prefs = getPrefs(context);
        String raw = prefs.getString(KEY_SEEN_IDS, "[]");
        Set<String> result = new LinkedHashSet<>();
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                String val = array.optString(i, "").trim();
                if (!val.isEmpty()) {
                    result.add(val);
                }
            }
        } catch (Exception ignored) {
        }
        return result;
    }

    public static synchronized void addSeenIds(Context context, Collection<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        Set<String> merged = getSeenIds(context);
        for (String id : ids) {
            if (id != null && !id.trim().isEmpty()) {
                merged.add(id.trim());
            }
        }
        List<String> list = new ArrayList<>(merged);
        if (list.size() > MAX_TRACKED_IDS) {
            list = list.subList(list.size() - MAX_TRACKED_IDS, list.size());
        }
        JSONArray array = new JSONArray();
        for (String item : list) {
            array.put(item);
        }
        getPrefs(context).edit()
            .putString(KEY_SEEN_IDS, array.toString())
            .putBoolean(KEY_BASELINE_SET, true)
            .apply();
    }

    private static SharedPreferences getPrefs(Context context) {
        return context.getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}

