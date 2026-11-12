package com.skalaprioritas.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final String PRODUCTION_BASE_URL = "https://www.skala-prioritas.com";
    private static final int REQUEST_CODE_INSTALL_PACKAGES = 102;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean isDownloadingUpdate = false;
    private File pendingInstallApk = null;

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
        "/* Floating Toast Notification di mobile / Android */" +
        "div[role=\"status\"][aria-live=\"polite\"].fixed {" +
        "  top: max(env(safe-area-inset-top, 0px), 16px) !important;" +
        "  left: 12px !important;" +
        "  right: 12px !important;" +
        "  width: calc(100vw - 24px) !important;" +
        "  max-width: none !important;" +
        "  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3) !important;" +
        "  border-radius: 12px !important;" +
        "  z-index: 99999 !important;" +
        "}" +
        "@media (max-width: 1280px) {" +
        "  .page-wrapper { margin-left: 0 !important; }" +
        "  .body-wrapper { margin-left: 0 !important; }" +
        "}";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.getInsetsController().setSystemBarsAppearance(
                0,
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            );
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

        requestNotificationPermission();
        configureWebView();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
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

        // Bridge native updater agar halaman web bisa mengecek versi & mengunduh update APK di dalam aplikasi
        webView.addJavascriptInterface(new SkalaUpdaterBridge(), "SkalaNativeUpdater");

        // Inject script untuk memastikan lebar 100% dan menghilangkan area kosong / sidebar di mobile
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectMobileCss(view);
                injectNativeAppInfo(view);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_INSTALL_PACKAGES && pendingInstallApk != null) {
            File apkToInstall = pendingInstallApk;
            pendingInstallApk = null;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                emitUpdateEvent("installing", 100, apkToInstall.length(), apkToInstall.length(), "Membuka pemasang pembaruan Android...");
                installApkFile(apkToInstall);
            } else {
                emitUpdateEvent("error", 0, 0, 0, "Izin instalasi aplikasi dari sumber ini belum diaktifkan.");
            }
        }
    }

    @Override
    public void onDestroy() {
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

    private JSONObject buildAppInfoJson() {
        JSONObject obj = new JSONObject();
        try {
            PackageInfo info = getCurrentPackageInfo();
            obj.put("platform", "android");
            obj.put("packageName", getPackageName());
            obj.put("versionName", info.versionName != null ? info.versionName : "2.1.2");
            obj.put("versionCode", extractVersionCode(info));
            boolean canInstall = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls();
            obj.put("canRequestPackageInstalls", canInstall);
        } catch (Exception e) {
            try {
                obj.put("platform", "android");
                obj.put("packageName", getPackageName());
                obj.put("versionName", "2.1.2");
                obj.put("versionCode", 5);
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

    private String resolveTrustedApkUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            return null;
        }
        String trimmed = rawUrl.trim();
        if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
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

    private void installApkFile(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(installIntent);
        } catch (Exception e) {
            emitUpdateEvent("error", 0, 0, 0, "Gagal membuka installer APK: " + e.getMessage());
        }
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
            final String resolvedUrl = resolveTrustedApkUrl(apkUrl);
            if (resolvedUrl == null) {
                emitUpdateEvent("error", 0, 0, 0, "URL pembaruan APK tidak valid atau tidak terpercaya.");
                return;
            }
            if (isDownloadingUpdate) {
                return;
            }

            runOnUiThread(() -> {
                String currentUrl = bridge != null && bridge.getWebView() != null ? bridge.getWebView().getUrl() : null;
                Uri currentUri = currentUrl != null ? Uri.parse(currentUrl) : null;
                if (currentUri == null || !isTrustedHost(currentUri.getHost())) {
                    emitUpdateEvent("error", 0, 0, 0, "Pembaruan hanya diizinkan dari domain resmi Skala Prioritas.");
                    return;
                }

                isDownloadingUpdate = true;
                emitUpdateEvent("downloading", 0, 0, 0, "Menyiapkan unduhan pembaruan APK...");

                updateExecutor.execute(() -> {
                    HttpURLConnection connection = null;
                    try {
                        URL url = new URL(resolvedUrl);
                        connection = (HttpURLConnection) url.openConnection();
                        connection.setInstanceFollowRedirects(true);
                        connection.setConnectTimeout(15000);
                        connection.setReadTimeout(60000);
                        connection.connect();

                        int responseCode = connection.getResponseCode();
                        if (responseCode < 200 || responseCode >= 300) {
                            emitUpdateEvent("error", 0, 0, 0, "Server mengembalikan status HTTP " + responseCode);
                            return;
                        }

                        long totalBytes = connection.getContentLengthLong();
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
                                out.write(buffer, 0, count);
                                downloaded += count;
                                int percent = totalBytes > 0
                                    ? (int) Math.min(99, (downloaded * 100L) / totalBytes)
                                    : 0;
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
                            pendingInstallApk = finalApk;
                            emitUpdateEvent(
                                "permission_required",
                                100,
                                finalApk.length(),
                                finalApk.length(),
                                "Aktifkan izin instalasi aplikasi untuk menyelesaikan pembaruan."
                            );
                            runOnUiThread(() -> {
                                Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                                settingsIntent.setData(Uri.parse("package:" + getPackageName()));
                                startActivityForResult(settingsIntent, REQUEST_CODE_INSTALL_PACKAGES);
                            });
                            return;
                        }

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
                        isDownloadingUpdate = false;
                        if (connection != null) {
                            connection.disconnect();
                        }
                    }
                });
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
