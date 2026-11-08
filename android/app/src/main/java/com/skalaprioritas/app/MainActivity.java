package com.skalaprioritas.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.view.WindowCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);

        // Inject script untuk memastikan lebar 100% dan menghilangkan area kosong / sidebar di mobile
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectMobileCss(view);
            }
        });
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
            "  meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';" +
            "})();";
        view.evaluateJavascript(js, null);
    }
}
