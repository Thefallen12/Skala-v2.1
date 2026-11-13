package com.skalaprioritas.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class SkalaNotificationJobService extends JobService {

    private static final String PRODUCTION_BASE_URL = "https://www.skala-prioritas.com";
    private static final String UNREAD_ENDPOINT = PRODUCTION_BASE_URL + "/api/notifications/unread-count";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;

    @Override
    public boolean onStartJob(JobParameters params) {
        cancelled = false;
        executor.execute(() -> {
            try {
                if (!MainActivity.isActivityInForeground() && NotificationHelper.canPostNotifications(this)) {
                    pollAndNotify();
                }
            } catch (Exception ignored) {
            } finally {
                jobFinished(params, false);
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        cancelled = true;
        return true;
    }

    @Override
    public void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void pollAndNotify() {
        if (cancelled) return;

        CookieManager cookieManager = CookieManager.getInstance();
        String cookies = cookieManager != null ? cookieManager.getCookie(PRODUCTION_BASE_URL) : null;
        if (cookies == null || cookies.trim().isEmpty()) {
            return;
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL(UNREAD_ENDPOINT);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(12000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cookie", cookies);
            connection.setRequestProperty("Cache-Control", "no-cache");

            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                return;
            }

            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
            )) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (cancelled) return;
                    body.append(line);
                }
            }

            JSONObject json = new JSONObject(body.toString());
            JSONArray items = json.optJSONArray("notifications");
            if (items == null || items.length() == 0) {
                return;
            }

            boolean baselineSet = NotificationHelper.isBaselineSet(this);
            Set<String> seenIds = NotificationHelper.getSeenIds(this);
            List<String> newSeenIds = new ArrayList<>();

            if (!baselineSet) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item != null) {
                        String id = item.optString("id", "").trim();
                        if (!id.isEmpty()) newSeenIds.add(id);
                    }
                }
                NotificationHelper.addSeenIds(this, newSeenIds);
                NotificationHelper.markBaselineSet(this);
                return;
            }

            int popped = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id", "").trim();
                boolean isRead = item.optBoolean("isRead", false);
                if (id.isEmpty() || seenIds.contains(id)) continue;

                newSeenIds.add(id);
                if (!isRead && popped < 3) {
                    String title = item.optString("title", "Notifikasi Baru");
                    String message = item.optString("message", "");
                    String type = item.optString("type", "INFO");
                    String actionUrl = item.optString("actionUrl", "/apps/tickets");
                    long ts = parseIsoTimestamp(item.optString("createdAt", ""));
                    NotificationHelper.showWhatsAppHeadsUpNotification(
                        this,
                        id,
                        title,
                        message,
                        labelForType(type),
                        actionUrl,
                        ts
                    );
                    popped++;
                }
            }

            if (!newSeenIds.isEmpty()) {
                NotificationHelper.addSeenIds(this, newSeenIds);
            }
        } catch (Exception ignored) {
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private long parseIsoTimestamp(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return System.currentTimeMillis();
        }
        String clean = raw.trim().replaceAll("\\.[0-9]+Z$", "Z");
        String[] patterns = new String[] {
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date parsed = format.parse(clean);
                if (parsed != null) {
                    return parsed.getTime();
                }
            } catch (Exception ignored) {
            }
        }
        return System.currentTimeMillis();
    }

    private String labelForType(String type) {
        if ("APPROVAL".equalsIgnoreCase(type)) return "Otorisasi & Persetujuan";
        if ("WARNING".equalsIgnoreCase(type)) return "Perhatian Operasional";
        if ("SUCCESS".equalsIgnoreCase(type)) return "Konfirmasi Selesai";
        return "Skala Prioritas";
    }
}
