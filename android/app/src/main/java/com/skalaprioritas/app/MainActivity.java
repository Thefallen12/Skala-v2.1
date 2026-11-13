package com.skalaprioritas.app;

import android.Manifest;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final String PRODUCTION_BASE_URL = "https://www.skala-prioritas.com";
    private static final int REQUEST_CODE_NOTIFICATIONS = 101;
    private static final int REQUEST_CODE_INSTALL_PACKAGES = 102;
    private static final int REQUEST_CODE_LOCATION = 103;
    private static final int REQUEST_CODE_ALL_PERMISSIONS = 104;
    private static final int JOB_ID_NOTIFICATION_SYNC = 4101;
    private static final long BACKGROUND_SYNC_INTERVAL_MS = 15L * 60L * 1000L;

    private static final String PREF_PERMISSIONS = "skala_permission_prompts";
    private static final String KEY_ASKED_NOTIFICATIONS = "asked_notifications";
    private static final String KEY_ASKED_LOCATION = "asked_location";

    private static final String PREF_UPDATES = "skala_updater_prefs";
    private static final String KEY_PENDING_APK_PATH = "pending_apk_path";
    private static final String KEY_PENDING_APK_TIME = "pending_apk_time";
    private static final String KEY_LAST_APK_URL = "last_apk_url";
    private static final long PENDING_APK_MAX_AGE_MS = 30L * 60L * 1000L;
    private static final int MAX_REDIRECTS = 5;

    private static volatile boolean activityInForeground = false;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean isDownloadingUpdate = new AtomicBoolean(false);
    private volatile int lastDownloadPercent = 0;
    private volatile long lastDownloadedBytes = 0L;
    private volatile long lastTotalBytes = 0L;
    private volatile String pendingNotificationActionId = null;
    private volatile String pendingNotificationActionUrl = null;

    private static final String APP_INJECTED_CSS =
        ":root {" +
        "  --app-safe-top: env(safe-area-inset-top, 24px);" +
        "  --app-safe-bottom: env(safe-area-inset-bottom, 16px);" +
        "}" +
        "html, body {" +
        "  width: 100% !important;" +
        "  max-width: 100vw !important;" +
        "  overflow-x: hidden !important;" +
        "  -webkit-text-size-adjust: 100% !important;" +
        "}" +
        ".page-wrapper {" +
        "  margin-left: 0 !important;" +
        "  width: 100% !important;" +
        "  max-width: 100vw !important;" +
        "  min-width: 0 !important;" +
        "}" +
        ".body-wrapper {" +
        "  margin-left: 0 !important;" +
        "  width: 100% !important;" +
        "  max-width: 100vw !important;" +
        "  min-width: 0 !important;" +
        "}" +
        ".body-wrapper > header {" +
        "  padding-top: max(env(safe-area-inset-top, 0px), 12px) !important;" +
        "}" +
        ".container {" +
        "  width: 100% !important;" +
        "  max-width: 100vw !important;" +
        "  padding-left: 12px !important;" +
        "  padding-right: 12px !important;" +
        "  padding-bottom: max(env(safe-area-inset-bottom, 0px), 24px) !important;" +
        "}" +
        "/* Mobile User: optimalkan seluruh button & kontrol sentuh di Android */" +
        "button, [role=\"button\"], input[type=\"button\"], input[type=\"submit\"], .btn {" +
        "  min-height: 44px !important;" +
        "  touch-action: manipulation !important;" +
        "  -webkit-tap-highlight-color: transparent !important;" +
        "  user-select: none !important;" +
        "}" +
        "button:active, [role=\"button\"]:active {" +
        "  transform: scale(0.97) !important;" +
        "  transition: transform 0.08s ease !important;" +
        "}" +
        "@media (max-width: 1280px) {" +
        "  .page-wrapper { margin-left: 0 !important; }" +
        "  .body-wrapper { margin-left: 0 !important; }" +
        "}";

    public static boolean isActivityInForeground() {
        return activityInForeground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (window.getInsetsController() != null) {
                window.getInsetsController().setSystemBarsAppearance(
                    0,
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        } else {
            View decorView = window.getDecorView();
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams layoutParams = window.getAttributes();
            layoutParams.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(layoutParams);
        }

        NotificationHelper.ensureNotificationChannel(this);
        scheduleBackgroundNotificationSync();
        extractPendingNotificationFromIntent(getIntent());
        configureWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        activityInForeground = true;
        emitPermissionsChanged();
        if (bridge != null && bridge.getWebView() != null) {
            injectNativeAppInfo(bridge.getWebView());
        }
        resumePendingApkInstallIfReady(false);
    }

    @Override
    public void onPause() {
        activityInForeground = false;
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (extractPendingNotificationFromIntent(intent)) {
            dispatchPendingNotificationToWebView();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (permissions != null && grantResults != null) {
            SharedPreferences prefs = getSharedPreferences(PREF_PERMISSIONS, MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            for (int i = 0; i < permissions.length && i < grantResults.length; i++) {
                String perm = permissions[i];
                boolean granted = grantResults[i] == PackageManager.PERMISSION_GRANTED;
                if (Manifest.permission.POST_NOTIFICATIONS.equals(perm) && !granted) {
                    editor.putBoolean(KEY_ASKED_NOTIFICATIONS, true);
                }
                if (
                    (Manifest.permission.ACCESS_FINE_LOCATION.equals(perm) ||
                        Manifest.permission.ACCESS_COARSE_LOCATION.equals(perm)) &&
                    !granted
                ) {
                    editor.putBoolean(KEY_ASKED_LOCATION, true);
                }
            }
            editor.apply();
        }
        emitPermissionsChanged();
    }

    private void scheduleBackgroundNotificationSync() {
        try {
            JobScheduler scheduler = (JobScheduler) getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            ComponentName component = new ComponentName(this, SkalaNotificationJobService.class);
            JobInfo info = new JobInfo.Builder(JOB_ID_NOTIFICATION_SYNC, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(BACKGROUND_SYNC_INTERVAL_MS)
                .setPersisted(true)
                .build();
            scheduler.schedule(info);
        } catch (Exception ignored) {
        }
    }

    private boolean extractPendingNotificationFromIntent(Intent intent) {
        if (intent == null) return false;
        String actionUrl = intent.getStringExtra(NotificationHelper.EXTRA_ACTION_URL);
        if (actionUrl == null || actionUrl.trim().isEmpty()) {
            return false;
        }
        pendingNotificationActionUrl = NotificationHelper.sanitizeActionUrl(actionUrl);
        pendingNotificationActionId = intent.getStringExtra(NotificationHelper.EXTRA_NOTIFICATION_ID);
        return true;
    }

    private void dispatchPendingNotificationToWebView() {
        if (pendingNotificationActionUrl == null || bridge == null || bridge.getWebView() == null) {
            return;
        }
        JSONObject detail = new JSONObject();
        try {
            detail.put("id", pendingNotificationActionId != null ? pendingNotificationActionId : "");
            detail.put("actionUrl", pendingNotificationActionUrl);
        } catch (Exception ignored) {
            return;
        }
        final String script =
            "window.dispatchEvent(new CustomEvent('skala:open-notification', { detail: " +
            detail.toString() +
            " }));";
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(script, null);
            }
        });
    }

    private void configureWebView() {
        if (bridge == null || bridge.getWebView() == null) return;

        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();

        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Bridge native updater & permissions/notifications untuk komunikasi dua arah dengan web app
        webView.addJavascriptInterface(new SkalaUpdaterBridge(), "SkalaNativeUpdater");
        webView.addJavascriptInterface(new SkalaNativeBridge(), "SkalaNativeBridge");

        // Tangani unduhan APK maupun berkas dari tombol <a download> di dalam WebView
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                String url,
                String userAgent,
                String contentDisposition,
                String mimetype,
                long contentLength
            ) {
                Uri parsed = url != null ? Uri.parse(url) : null;
                boolean isApkMime = "application/vnd.android.package-archive".equalsIgnoreCase(mimetype);
                if (isTrustedApkUri(parsed) || (isApkMime && parsed != null && isTrustedHost(parsed.getHost()))) {
                    startApkUpdateInternal(url);
                    return;
                }
                if (parsed != null) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, parsed));
                    } catch (Exception ignored) {
                    }
                }
            }
        });

        // Pertahankan perilaku Capacitor BridgeWebViewClient sambil menginjeksi CSS & state native
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri requestUri = request != null ? request.getUrl() : null;
                if (isTrustedApkUri(requestUri)) {
                    startApkUpdateInternal(requestUri.toString());
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectMobileCss(view);
                injectNativeAppInfo(view);
                injectPermissionsSnapshot(view);
                dispatchPendingNotificationToWebView();
            }
        });

        // Pastikan pemuatan awal dimulai sesudah addJavascriptInterface & client terpasang
        String initialAppUrl = bridge.getAppUrl();
        if (initialAppUrl != null && !initialAppUrl.isEmpty()) {
            webView.stopLoading();
            webView.loadUrl(initialAppUrl);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_INSTALL_PACKAGES) {
            resumePendingApkInstallIfReady(true);
        }
    }

    @Override
    public void onDestroy() {
        activityInForeground = false;
        updateExecutor.shutdownNow();
        super.onDestroy();
    }

    private PackageInfo getCurrentPackageInfo() throws PackageManager.NameNotFoundException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPackageManager().getPackageInfo(getPackageName(), PackageManager.PackageInfoFlags.of(0));
        }
        return getPackageManager().getPackageInfo(getPackageName(), 0);
    }

    @SuppressWarnings("deprecation")
    private PackageInfo getArchivePackageInfo(String archivePath) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getPackageManager().getPackageArchiveInfo(archivePath, PackageManager.PackageInfoFlags.of(0));
        }
        return getPackageManager().getPackageArchiveInfo(archivePath, 0);
    }

    private long extractVersionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.getLongVersionCode();
        }
        return info.versionCode;
    }

    private boolean isLocationServicesEnabled() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return lm.isLocationEnabled();
        }
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
            || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSONObject buildPermissionsJson() {
        JSONObject obj = new JSONObject();
        SharedPreferences prefs = getSharedPreferences(PREF_PERMISSIONS, MODE_PRIVATE);
        try {
            boolean notifEnabledOs = NotificationManagerCompat.from(this).areNotificationsEnabled();
            String notifStatus;
            boolean notifPermanentlyDenied = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
                    notifStatus = notifEnabledOs ? "granted" : "denied";
                } else {
                    boolean askedBefore = prefs.getBoolean(KEY_ASKED_NOTIFICATIONS, false);
                    boolean showRationale = ActivityCompat.shouldShowRequestPermissionRationale(
                        this,
                        Manifest.permission.POST_NOTIFICATIONS
                    );
                    notifPermanentlyDenied = askedBefore && !showRationale;
                    notifStatus = notifPermanentlyDenied ? "denied" : "prompt";
                }
            } else {
                notifStatus = notifEnabledOs ? "granted" : "denied";
                notifPermanentlyDenied = !notifEnabledOs;
            }

            boolean fineLoc = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION);
            boolean coarseLoc = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
            String locationStatus;
            String locationPrecision = "none";
            boolean locationPermanentlyDenied = false;
            if (fineLoc || coarseLoc) {
                locationStatus = "granted";
                locationPrecision = fineLoc ? "fine" : "coarse";
            } else {
                boolean askedBefore = prefs.getBoolean(KEY_ASKED_LOCATION, false);
                boolean showRationale =
                    ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.ACCESS_FINE_LOCATION) ||
                    ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.ACCESS_COARSE_LOCATION);
                locationPermanentlyDenied = askedBefore && !showRationale;
                locationStatus = locationPermanentlyDenied ? "denied" : "prompt";
            }

            boolean hasCam = hasPermission(Manifest.permission.CAMERA);

            JSONObject permanent = new JSONObject();
            permanent.put("notifications", notifPermanentlyDenied);
            permanent.put("location", locationPermanentlyDenied);

            obj.put("platform", "android");
            obj.put("sdkInt", Build.VERSION.SDK_INT);
            obj.put("notifications", notifStatus);
            obj.put("notificationsEnabled", notifEnabledOs);
            obj.put("location", locationStatus);
            obj.put("locationPrecision", locationPrecision);
            obj.put("locationServicesEnabled", isLocationServicesEnabled());
            obj.put("camera", hasCam ? "granted" : "prompt");
            obj.put("permanentlyDenied", permanent);
        } catch (Exception ignored) {
        }
        return obj;
    }

    private void injectPermissionsSnapshot(WebView view) {
        String payload = buildPermissionsJson().toString();
        view.evaluateJavascript(
            "window.__SKALA_NATIVE_PERMISSIONS__ = " + payload + ";",
            null
        );
    }

    private void emitPermissionsChanged() {
        if (bridge == null || bridge.getWebView() == null) return;
        String payload = buildPermissionsJson().toString();
        final String script =
            "window.__SKALA_NATIVE_PERMISSIONS__ = " + payload + ";" +
            "window.dispatchEvent(new CustomEvent('skala:permissions-changed', { detail: " + payload + " }));";
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(script, null);
            }
        });
    }

    private void openNotificationSettingsInternal() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + getPackageName()));
            }
            startActivity(intent);
        } catch (Exception e) {
            openAppSettingsInternal();
        }
    }

    private void openLocationSettingsInternal() {
        try {
            startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
        } catch (Exception e) {
            openAppSettingsInternal();
        }
    }

    private void openAppSettingsInternal() {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private JSONObject buildAppInfoJson() {
        JSONObject obj = new JSONObject();
        try {
            PackageInfo info = getCurrentPackageInfo();
            obj.put("platform", "android");
            obj.put("packageName", getPackageName());
            obj.put("versionName", info.versionName != null ? info.versionName : "2.1.4");
            obj.put("versionCode", extractVersionCode(info));
            boolean canInstall = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls();
            obj.put("canRequestPackageInstalls", canInstall);
        } catch (Exception e) {
            try {
                obj.put("platform", "android");
                obj.put("packageName", getPackageName());
                obj.put("versionName", "2.1.4");
                obj.put("versionCode", 7);
                obj.put("canRequestPackageInstalls", false);
            } catch (Exception ignored) {
            }
        }
        return obj;
    }

    private void injectNativeAppInfo(WebView view) {
        String payload = buildAppInfoJson().toString();
        view.evaluateJavascript(
            "window.__SKALA_NATIVE_APP__ = " + payload + ";" +
            "window.dispatchEvent(new CustomEvent('skala:native-ready', { detail: window.__SKALA_NATIVE_APP__ }));",
            null
        );
    }

    private boolean isTrustedHost(String host) {
        return "www.skala-prioritas.com".equalsIgnoreCase(host) || "skala-prioritas.com".equalsIgnoreCase(host);
    }

    private boolean isTrustedApkUri(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        if (!isTrustedHost(uri.getHost())) {
            return false;
        }
        String path = uri.getPath();
        return path != null && path.toLowerCase().endsWith(".apk");
    }

    private String resolveTrustedApkUrl(String rawUrl, Uri currentUri) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return null;
        }
        String trimmed = rawUrl.trim();
        if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
            if (currentUri != null && "https".equalsIgnoreCase(currentUri.getScheme()) && isTrustedHost(currentUri.getHost())) {
                return currentUri.getScheme() + "://" + currentUri.getEncodedAuthority() + trimmed;
            }
            return PRODUCTION_BASE_URL + trimmed;
        }
        Uri parsed = Uri.parse(trimmed);
        if ("https".equalsIgnoreCase(parsed.getScheme()) && isTrustedHost(parsed.getHost())) {
            return trimmed;
        }
        return null;
    }

    private void emitUpdateEvent(String status, int percent, long downloadedBytes, long totalBytes, String message) {
        if (bridge == null || bridge.getWebView() == null) return;
        JSONObject detail = new JSONObject();
        try {
            detail.put("status", status);
            detail.put("percent", percent);
            detail.put("downloadedBytes", downloadedBytes);
            detail.put("totalBytes", totalBytes);
            detail.put("message", message != null ? message : "");
        } catch (Exception ignored) {
        }
        final String script =
            "window.dispatchEvent(new CustomEvent('skala:apk-update-progress', { detail: " +
            detail.toString() +
            " }));";
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(script, null);
            }
        });
    }

    private void savePendingApkState(File apkFile, String sourceUrl) {
        SharedPreferences.Editor editor = getSharedPreferences(PREF_UPDATES, MODE_PRIVATE).edit();
        if (apkFile != null) {
            editor.putString(KEY_PENDING_APK_PATH, apkFile.getAbsolutePath());
            editor.putLong(KEY_PENDING_APK_TIME, System.currentTimeMillis());
        }
        if (sourceUrl != null && !sourceUrl.trim().isEmpty()) {
            editor.putString(KEY_LAST_APK_URL, sourceUrl.trim());
        }
        editor.apply();
    }

    private void clearPendingApkPath() {
        getSharedPreferences(PREF_UPDATES, MODE_PRIVATE)
            .edit()
            .remove(KEY_PENDING_APK_PATH)
            .remove(KEY_PENDING_APK_TIME)
            .apply();
    }

    private File loadValidPendingApkFile() {
        SharedPreferences prefs = getSharedPreferences(PREF_UPDATES, MODE_PRIVATE);
        String savedPath = prefs.getString(KEY_PENDING_APK_PATH, null);
        long savedTime = prefs.getLong(KEY_PENDING_APK_TIME, 0L);
        if (savedPath == null || savedPath.trim().isEmpty()) {
            File defaultCachedApk = new File(new File(getCacheDir(), "updates"), "Skala-Prioritas-update.apk");
            if (!defaultCachedApk.exists() || defaultCachedApk.length() <= 0) {
                return null;
            }
            if (System.currentTimeMillis() - defaultCachedApk.lastModified() > PENDING_APK_MAX_AGE_MS) {
                return null;
            }
            PackageInfo archiveInfo = getArchivePackageInfo(defaultCachedApk.getAbsolutePath());
            if (archiveInfo == null || !getPackageName().equals(archiveInfo.packageName)) {
                return null;
            }
            return defaultCachedApk;
        }
        if (System.currentTimeMillis() - savedTime > PENDING_APK_MAX_AGE_MS) {
            clearPendingApkPath();
            return null;
        }
        File candidate = new File(savedPath);
        if (!candidate.exists() || candidate.length() <= 0) {
            clearPendingApkPath();
            return null;
        }
        PackageInfo archiveInfo = getArchivePackageInfo(candidate.getAbsolutePath());
        if (archiveInfo == null || !getPackageName().equals(archiveInfo.packageName)) {
            clearPendingApkPath();
            return null;
        }
        return candidate;
    }

    private void openUnknownSourcesSettingsInternal() {
        runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + getPackageName()));
                    startActivityForResult(settingsIntent, REQUEST_CODE_INSTALL_PACKAGES);
                    return;
                }
            } catch (Exception ignored) {
            }
            openAppSettingsInternal();
        });
    }

    private void resumePendingApkInstallIfReady(boolean triggeredFromSettingsResult) {
        SharedPreferences prefs = getSharedPreferences(PREF_UPDATES, MODE_PRIVATE);
        String savedPath = prefs.getString(KEY_PENDING_APK_PATH, null);
        if (savedPath == null || savedPath.trim().isEmpty()) {
            return;
        }
        File pendingApk = loadValidPendingApkFile();
        if (pendingApk == null) {
            if (triggeredFromSettingsResult) {
                emitUpdateEvent("error", 0, 0, 0, "Berkas pembaruan sudah kedaluwarsa. Silakan ulangi pembaruan.");
            }
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
            clearPendingApkPath();
            emitUpdateEvent(
                "installing",
                100,
                pendingApk.length(),
                pendingApk.length(),
                "Membuka pemasang pembaruan Android..."
            );
            installApkFile(pendingApk);
        } else if (triggeredFromSettingsResult) {
            emitUpdateEvent(
                "permission_required",
                100,
                pendingApk.length(),
                pendingApk.length(),
                "Aktifkan izin instalasi aplikasi dari sumber ini lalu kembali ke aplikasi."
            );
        }
    }

    private HttpURLConnection openTrustedConnectionWithRedirects(String initialUrl) throws Exception {
        String current = initialUrl;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            URL url = new URL(current);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("User-Agent", "SkalaApp/2.1 (Android)");
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream, */*");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.connect();

            int code = connection.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                || code == HttpURLConnection.HTTP_MOVED_TEMP
                || code == HttpURLConnection.HTTP_SEE_OTHER
                || code == 307
                || code == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IllegalStateException("Redirect pembaruan tidak memiliki lokasi tujuan (HTTP " + code + ").");
                }
                URL nextUrl = new URL(url, location.trim());
                Uri nextUri = Uri.parse(nextUrl.toString());
                if (!"https".equalsIgnoreCase(nextUri.getScheme()) || !isTrustedHost(nextUri.getHost())) {
                    throw new SecurityException("Redirect unduhan menuju domain di luar Skala Prioritas ditolak.");
                }
                current = nextUrl.toString();
                continue;
            }
            return connection;
        }
        throw new IllegalStateException("Terlalu banyak pengalihan URL saat mengunduh APK.");
    }

    private void installApkFile(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            startActivity(installIntent);
        } catch (Exception e) {
            emitUpdateEvent("error", 0, 0, 0, "Gagal membuka installer APK: " + e.getMessage());
        }
    }

    private class SkalaNativeBridge {
        @JavascriptInterface
        public String getPermissionsStatus() {
            return buildPermissionsJson().toString();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
                        if (!NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled()) {
                            openNotificationSettingsInternal();
                        } else {
                            emitPermissionsChanged();
                        }
                        return;
                    }
                    SharedPreferences prefs = getSharedPreferences(PREF_PERMISSIONS, MODE_PRIVATE);
                    boolean askedBefore = prefs.getBoolean(KEY_ASKED_NOTIFICATIONS, false);
                    boolean showRationale = ActivityCompat.shouldShowRequestPermissionRationale(
                        MainActivity.this,
                        Manifest.permission.POST_NOTIFICATIONS
                    );
                    if (askedBefore && !showRationale) {
                        openNotificationSettingsInternal();
                        return;
                    }
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        REQUEST_CODE_NOTIFICATIONS
                    );
                    return;
                }

                if (!NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled()) {
                    openNotificationSettingsInternal();
                } else {
                    emitPermissionsChanged();
                }
            });
        }

        @JavascriptInterface
        public void requestLocationPermission() {
            runOnUiThread(() -> {
                boolean hasFine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION);
                boolean hasCoarse = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
                if (hasFine || hasCoarse) {
                    if (!isLocationServicesEnabled()) {
                        openLocationSettingsInternal();
                    } else {
                        emitPermissionsChanged();
                    }
                    return;
                }
                SharedPreferences prefs = getSharedPreferences(PREF_PERMISSIONS, MODE_PRIVATE);
                boolean askedBefore = prefs.getBoolean(KEY_ASKED_LOCATION, false);
                boolean showRationale =
                    ActivityCompat.shouldShowRequestPermissionRationale(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) ||
                    ActivityCompat.shouldShowRequestPermissionRationale(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION);
                if (askedBefore && !showRationale) {
                    openAppSettingsInternal();
                    return;
                }
                ActivityCompat.requestPermissions(
                    MainActivity.this,
                    new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    },
                    REQUEST_CODE_LOCATION
                );
            });
        }

        @JavascriptInterface
        public void requestAllPermissions() {
            runOnUiThread(() -> {
                List<String> toRequest = new ArrayList<>();
                SharedPreferences prefs = getSharedPreferences(PREF_PERMISSIONS, MODE_PRIVATE);

                boolean needNotificationPerm =
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    !hasPermission(Manifest.permission.POST_NOTIFICATIONS);
                if (needNotificationPerm) {
                    boolean askedNotif = prefs.getBoolean(KEY_ASKED_NOTIFICATIONS, false);
                    boolean rationaleNotif = ActivityCompat.shouldShowRequestPermissionRationale(
                        MainActivity.this,
                        Manifest.permission.POST_NOTIFICATIONS
                    );
                    if (!askedNotif || rationaleNotif) {
                        toRequest.add(Manifest.permission.POST_NOTIFICATIONS);
                    }
                }

                boolean hasLocation =
                    hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
                if (!hasLocation) {
                    boolean askedLoc = prefs.getBoolean(KEY_ASKED_LOCATION, false);
                    boolean rationaleLoc =
                        ActivityCompat.shouldShowRequestPermissionRationale(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) ||
                        ActivityCompat.shouldShowRequestPermissionRationale(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION);
                    if (!askedLoc || rationaleLoc) {
                        toRequest.add(Manifest.permission.ACCESS_FINE_LOCATION);
                        toRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                    }
                }

                if (!toRequest.isEmpty()) {
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        toRequest.toArray(new String[0]),
                        REQUEST_CODE_ALL_PERMISSIONS
                    );
                    return;
                }

                if (
                    !NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled() ||
                    needNotificationPerm
                ) {
                    openNotificationSettingsInternal();
                    return;
                }
                if (!hasLocation) {
                    openAppSettingsInternal();
                    return;
                }
                if (!isLocationServicesEnabled()) {
                    openLocationSettingsInternal();
                    return;
                }
                emitPermissionsChanged();
            });
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(MainActivity.this::openAppSettingsInternal);
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(MainActivity.this::openNotificationSettingsInternal);
        }

        @JavascriptInterface
        public void openLocationSettings() {
            runOnUiThread(MainActivity.this::openLocationSettingsInternal);
        }

        @JavascriptInterface
        public void showWhatsAppNotification(
            String id,
            String title,
            String message,
            String categoryLabel,
            String actionUrl,
            long timestampMs,
            boolean forceHeadsUp
        ) {
            if (id != null && !id.trim().isEmpty()) {
                List<String> seen = new ArrayList<>();
                seen.add(id.trim());
                NotificationHelper.addSeenIds(MainActivity.this, seen);
            }
            if (forceHeadsUp || !activityInForeground) {
                NotificationHelper.showWhatsAppHeadsUpNotification(
                    MainActivity.this,
                    id,
                    title,
                    message,
                    categoryLabel,
                    actionUrl,
                    timestampMs
                );
            }
        }

        @JavascriptInterface
        public void syncSeenNotificationIds(String jsonIdsArray) {
            if (jsonIdsArray == null || jsonIdsArray.trim().isEmpty()) return;
            try {
                JSONArray array = new JSONArray(jsonIdsArray);
                List<String> ids = new ArrayList<>();
                for (int i = 0; i < array.length(); i++) {
                    String val = array.optString(i, "").trim();
                    if (!val.isEmpty()) ids.add(val);
                }
                NotificationHelper.addSeenIds(MainActivity.this, ids);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void cancelNotification(String notificationId) {
            NotificationHelper.cancelNotification(MainActivity.this, notificationId);
        }

        @JavascriptInterface
        public void playNotificationFeedback(boolean playSound, boolean vibrate) {
            NotificationHelper.playInAppFeedback(MainActivity.this, playSound, vibrate);
        }

        @JavascriptInterface
        public String consumePendingNotificationAction() {
            String url = pendingNotificationActionUrl;
            String id = pendingNotificationActionId;
            if (url == null) return "";
            pendingNotificationActionUrl = null;
            pendingNotificationActionId = null;
            JSONObject obj = new JSONObject();
            try {
                obj.put("id", id != null ? id : "");
                obj.put("actionUrl", url);
            } catch (Exception ignored) {
                return "";
            }
            return obj.toString();
        }
    }

    private void startApkUpdateInternal(String apkUrl) {
        runOnUiThread(() -> {
            String currentUrl = bridge != null && bridge.getWebView() != null ? bridge.getWebView().getUrl() : null;
            if ((currentUrl == null || currentUrl.isEmpty() || "about:blank".equals(currentUrl)) && bridge != null) {
                currentUrl = bridge.getAppUrl();
            }
            Uri currentUri = currentUrl != null ? Uri.parse(currentUrl) : null;
            if (currentUri == null || !isTrustedHost(currentUri.getHost())) {
                emitUpdateEvent("error", 0, 0, 0, "Pembaruan hanya diizinkan dari domain resmi Skala Prioritas.");
                return;
            }

            final String resolvedUrl = resolveTrustedApkUrl(apkUrl, currentUri);
            if (resolvedUrl == null) {
                emitUpdateEvent("error", 0, 0, 0, "URL pembaruan APK tidak valid atau tidak terpercaya.");
                return;
            }

            if (!isDownloadingUpdate.compareAndSet(false, true)) {
                emitUpdateEvent(
                    "downloading",
                    lastDownloadPercent,
                    lastDownloadedBytes,
                    lastTotalBytes,
                    "Unduhan pembaruan sedang berjalan (" + lastDownloadPercent + "%)..."
                );
                return;
            }

            lastDownloadPercent = 0;
            lastDownloadedBytes = 0L;
            lastTotalBytes = 0L;
            savePendingApkState(null, resolvedUrl);
            emitUpdateEvent("downloading", 0, 0, 0, "Menyiapkan unduhan pembaruan APK...");

            updateExecutor.execute(() -> {
                HttpURLConnection connection = null;
                try {
                    connection = openTrustedConnectionWithRedirects(resolvedUrl);

                    int responseCode = connection.getResponseCode();
                    if (responseCode < 200 || responseCode >= 300) {
                        emitUpdateEvent("error", 0, 0, 0, "Server mengembalikan status HTTP " + responseCode);
                        return;
                    }

                    String contentType = connection.getContentType();
                    if (contentType != null && contentType.toLowerCase().contains("text/html")) {
                        emitUpdateEvent("error", 0, 0, 0, "Server mengembalikan halaman HTML, bukan berkas APK.");
                        return;
                    }

                    long totalBytes = connection.getContentLengthLong();
                    lastTotalBytes = totalBytes;
                    File updatesDir = new File(getCacheDir(), "updates");
                    if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                        emitUpdateEvent("error", 0, 0, 0, "Gagal menyiapkan direktori sementara pembaruan.");
                        return;
                    }

                    File tempApk = new File(updatesDir, "Skala-Prioritas-update.apk.part");
                    File finalApk = new File(updatesDir, "Skala-Prioritas-update.apk");
                    if (tempApk.exists()) tempApk.delete();

                    try (InputStream in = new BufferedInputStream(connection.getInputStream());
                         FileOutputStream out = new FileOutputStream(tempApk)) {
                        byte[] buffer = new byte[16384];
                        long downloaded = 0;
                        int lastPercent = -1;
                        int count;
                        while ((count = in.read(buffer)) != -1) {
                            if (downloaded == 0 && count >= 2 && (buffer[0] != 0x50 || buffer[1] != 0x4B)) {
                                throw new IllegalStateException("Berkas yang diunduh bukan paket APK yang valid.");
                            }
                            out.write(buffer, 0, count);
                            downloaded += count;
                            lastDownloadedBytes = downloaded;
                            int percent = totalBytes > 0
                                ? (int) Math.min(99, (downloaded * 100L) / totalBytes)
                                : 0;
                            lastDownloadPercent = percent;
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                emitUpdateEvent(
                                    "downloading",
                                    percent,
                                    downloaded,
                                    totalBytes,
                                    "Mengunduh paket pembaruan (" + percent + "%)..."
                                );
                            }
                        }
                        out.flush();
                    }

                    if (finalApk.exists()) finalApk.delete();
                    if (!tempApk.renameTo(finalApk) || finalApk.length() <= 0) {
                        emitUpdateEvent("error", 0, 0, 0, "File APK hasil unduhan tidak lengkap.");
                        return;
                    }

                    PackageInfo archiveInfo = getArchivePackageInfo(finalApk.getAbsolutePath());
                    if (archiveInfo == null || !getPackageName().equals(archiveInfo.packageName)) {
                        finalApk.delete();
                        emitUpdateEvent("error", 0, 0, 0, "Verifikasi paket APK gagal (package tidak cocok).");
                        return;
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                        savePendingApkState(finalApk, resolvedUrl);
                        emitUpdateEvent(
                            "permission_required",
                            100,
                            finalApk.length(),
                            finalApk.length(),
                            "Aktifkan izin instalasi aplikasi dari sumber ini lalu kembali ke aplikasi."
                        );
                        openUnknownSourcesSettingsInternal();
                        return;
                    }

                    clearPendingApkPath();
                    emitUpdateEvent(
                        "installing",
                        100,
                        finalApk.length(),
                        finalApk.length(),
                        "Membuka pemasang pembaruan Android..."
                    );
                    runOnUiThread(() -> installApkFile(finalApk));
                } catch (Exception e) {
                    emitUpdateEvent("error", 0, 0, 0, "Gagal mengunduh pembaruan: " + e.getMessage());
                } finally {
                    isDownloadingUpdate.set(false);
                    if (connection != null) {
                        connection.disconnect();
                    }
                }
            });
        });
    }

    private class SkalaUpdaterBridge {
        @JavascriptInterface
        public String getAppInfo() {
            return buildAppInfoJson().toString();
        }

        @JavascriptInterface
        public void clearWebCache() {
            runOnUiThread(() -> {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().clearCache(true);
                }
            });
        }

        @JavascriptInterface
        public void startApkUpdate(String apkUrl) {
            startApkUpdateInternal(apkUrl);
        }

        @JavascriptInterface
        public void openInstallUnknownAppsSettings() {
            openUnknownSourcesSettingsInternal();
        }

        @JavascriptInterface
        public void retryPendingInstall() {
            runOnUiThread(() -> {
                File pendingApk = loadValidPendingApkFile();
                if (pendingApk != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                        savePendingApkState(pendingApk, null);
                        emitUpdateEvent(
                            "permission_required",
                            100,
                            pendingApk.length(),
                            pendingApk.length(),
                            "Aktifkan izin instalasi aplikasi dari sumber ini terlebih dahulu."
                        );
                        openUnknownSourcesSettingsInternal();
                        return;
                    }
                    clearPendingApkPath();
                    emitUpdateEvent(
                        "installing",
                        100,
                        pendingApk.length(),
                        pendingApk.length(),
                        "Membuka pemasang pembaruan Android..."
                    );
                    installApkFile(pendingApk);
                    return;
                }

                String lastUrl = getSharedPreferences(PREF_UPDATES, MODE_PRIVATE)
                    .getString(KEY_LAST_APK_URL, PRODUCTION_BASE_URL + "/Skala-Prioritas.apk");
                startApkUpdateInternal(lastUrl);
            });
        }
    }

    private void injectMobileCss(WebView view) {
        String js = "(function() {" +
            "  var existing = document.getElementById('skala-mobile-injected-css');" +
            "  if (!existing) {" +
            "    var style = document.createElement('style');" +
            "    style.id = 'skala-mobile-injected-css';" +
            "    style.innerHTML = `" + APP_INJECTED_CSS + "`;" +
            "    document.head.appendChild(style);" +
            "  }" +
            "  var meta = document.querySelector('meta[name=\"viewport\"]');" +
            "  if (!meta) {" +
            "    meta = document.createElement('meta');" +
            "    meta.name = 'viewport';" +
            "    document.head.appendChild(meta);" +
            "  }" +
            "  meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';" +
            "})();";
        view.evaluateJavascript(js, null);
    }
}
