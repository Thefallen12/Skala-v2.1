"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, ExternalLink, RefreshCw, ShieldAlert, Smartphone, Sparkles, X } from "lucide-react";
import { ANDROID_APK } from "@/lib/apk-config";
import {
  type NativeAppInfo,
  isAndroidWrapperUserAgent,
  resolveExternalApkDownloadUrl,
  triggerBrowserApkDownload,
} from "@/lib/apk-update-client";

interface AppVersionPayload {
  webBuildId: string;
  apk: {
    version: string;
    versionCode: number;
    downloadUrl: string;
    fileName: string;
    label: string;
    releaseNotes: string;
  };
  checkedAt: string;
}

interface NativeProgressDetail {
  status: "downloading" | "permission_required" | "installing" | "error";
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
}

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_APP_BUILD_ID?.trim() || "";
const LEGACY_APK_DISMISS_KEY = "skala_dismissed_legacy_apk_version";
const AUTO_CHECK_INTERVAL_MS = 180_000;
const MIN_CHECK_COOLDOWN_MS = 25_000;
const NATIVE_UPDATER_RESPONSE_TIMEOUT_MS = 6_000;

function readNativeAppInfo(): NativeAppInfo | null {
  if (typeof window === "undefined") return null;
  if (window.SkalaNativeUpdater) {
    try {
      const parsed = JSON.parse(window.SkalaNativeUpdater.getAppInfo()) as NativeAppInfo;
      window.__SKALA_NATIVE_APP__ = parsed;
      return parsed;
    } catch {
      // Fallback ke snapshot __SKALA_NATIVE_APP__ bila getAppInfo gagal
    }
  }
  if (window.__SKALA_NATIVE_APP__) {
    return window.__SKALA_NATIVE_APP__;
  }
  return null;
}

function formatMegabytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InAppUpdateManager() {
  const [nativeInfo, setNativeInfo] = useState<NativeAppInfo | null>(null);
  const [serverVersion, setServerVersion] = useState<AppVersionPayload | null>(null);
  const [webUpdateAvailable, setWebUpdateAvailable] = useState(false);
  const [apkUpdateAvailable, setApkUpdateAvailable] = useState(false);
  const [isLegacyApkWrapper, setIsLegacyApkWrapper] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const [applyingWebPatch, setApplyingWebPatch] = useState(false);
  const [webPatchStatus, setWebPatchStatus] = useState("");
  const [nativeProgress, setNativeProgress] = useState<NativeProgressDetail | null>(null);
  const [upToDateMessage, setUpToDateMessage] = useState<string | null>(null);

  const lastCheckedAtRef = useRef(0);
  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updaterWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUpdaterWatchdog = useCallback(() => {
    if (updaterWatchdogRef.current) {
      clearTimeout(updaterWatchdogRef.current);
      updaterWatchdogRef.current = null;
    }
  }, []);

  const refreshNativeMetadata = useCallback(() => {
    const info = readNativeAppInfo();
    if (info) {
      setNativeInfo(info);
      setIsLegacyApkWrapper(false);
      return info;
    }
    setIsLegacyApkWrapper(isAndroidWrapperUserAgent());
    return null;
  }, []);

  const checkForUpdates = useCallback(
    async (manual = false) => {
      const now = Date.now();
      if (!manual && now - lastCheckedAtRef.current < MIN_CHECK_COOLDOWN_MS) {
        return;
      }
      lastCheckedAtRef.current = now;

      try {
        const response = await fetch(`/api/app-version?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;

        const data = (await response.json()) as AppVersionPayload;
        setServerVersion(data);

        const hasWebPatch =
          Boolean(CLIENT_BUILD_ID) &&
          Boolean(data.webBuildId) &&
          data.webBuildId !== CLIENT_BUILD_ID;

        const currentNative = refreshNativeMetadata();
        const isLegacyWrapper = !currentNative && isAndroidWrapperUserAgent();
        const dismissedLegacyVersion =
          typeof window !== "undefined" ? window.localStorage.getItem(LEGACY_APK_DISMISS_KEY) : null;

        const hasNativeApkUpdate = currentNative
          ? Number(data.apk.versionCode) > Number(currentNative.versionCode)
          : isLegacyWrapper && (manual || dismissedLegacyVersion !== data.apk.version);

        setWebUpdateAvailable(hasWebPatch);
        setApkUpdateAvailable(hasNativeApkUpdate);

        if (hasWebPatch || hasNativeApkUpdate) {
          setDismissed(false);
        } else if (manual) {
          if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
          const installedVer = currentNative ? `v${currentNative.versionName}` : data.apk.label;
          setUpToDateMessage(`Aplikasi sudah versi terbaru (${installedVer}).`);
          upToDateTimerRef.current = setTimeout(() => {
            setUpToDateMessage(null);
          }, 3500);
        }
      } catch {
        if (manual) {
          if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
          setUpToDateMessage("Gagal memeriksa pembaruan. Periksa koneksi internet.");
          upToDateTimerRef.current = setTimeout(() => {
            setUpToDateMessage(null);
          }, 3500);
        }
      }
    },
    [refreshNativeMetadata],
  );

  const startApkDownloadWithUrl = useCallback(
    (downloadUrl: string, fileName: string) => {
      if (window.SkalaNativeUpdater?.startApkUpdate) {
        clearUpdaterWatchdog();
        setDismissed(false);
        setNativeProgress({
          status: "downloading",
          percent: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          message: "Menghubungkan ke server pembaruan...",
        });
        updaterWatchdogRef.current = setTimeout(() => {
          setNativeProgress((prev) =>
            prev?.status === "downloading" && prev.percent === 0
              ? {
                  status: "error",
                  percent: 0,
                  downloadedBytes: 0,
                  totalBytes: 0,
                  message:
                    "Pembaruan dalam aplikasi tidak merespons. Silakan unduh melalui browser perangkat.",
                }
              : prev,
          );
        }, NATIVE_UPDATER_RESPONSE_TIMEOUT_MS);

        try {
          window.SkalaNativeUpdater.startApkUpdate(downloadUrl);
        } catch {
          clearUpdaterWatchdog();
          setNativeProgress({
            status: "error",
            percent: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            message:
              "Gagal memanggil modul pembaruan APK. Silakan unduh melalui browser.",
          });
        }
        return;
      }

      if (isAndroidWrapperUserAgent()) {
        // Pada APK versi lama tanpa bridge native updater, arahkan ke domain alternatif agar Capacitor membuka browser/downloader sistem.
        window.location.assign(resolveExternalApkDownloadUrl(downloadUrl));
        return;
      }

      triggerBrowserApkDownload(downloadUrl, fileName);
    },
    [clearUpdaterWatchdog],
  );

  useEffect(() => {
    const handleNativeReady = () => {
      refreshNativeMetadata();
      void checkForUpdates(false);
    };

    const handleProgressEvent = (event: Event) => {
      const custom = event as CustomEvent<NativeProgressDetail>;
      if (custom.detail) {
        clearUpdaterWatchdog();
        setDismissed(false);
        setNativeProgress(custom.detail);
        if (custom.detail.status === "permission_required" || custom.detail.status === "installing") {
          refreshNativeMetadata();
        }
      }
    };

    const handleManualCheck = () => {
      setDismissed(false);
      void checkForUpdates(true);
    };

    const handleStartApkEvent = (event: Event) => {
      const custom = event as CustomEvent<{ downloadUrl?: string }>;
      const targetUrl =
        custom.detail?.downloadUrl ||
        serverVersion?.apk.downloadUrl ||
        ANDROID_APK.href;
      const targetFileName =
        serverVersion?.apk.fileName || ANDROID_APK.fileName;
      startApkDownloadWithUrl(targetUrl, targetFileName);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshNativeMetadata();
        void checkForUpdates(false);
      }
    };

    window.addEventListener("skala:native-ready", handleNativeReady);
    window.addEventListener("skala:apk-update-progress", handleProgressEvent);
    window.addEventListener("skala:check-update", handleManualCheck);
    window.addEventListener("skala:start-apk-update", handleStartApkEvent);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const startupTimer = setTimeout(() => {
      void checkForUpdates(false);
    }, 1500);

    const interval = setInterval(() => {
      void checkForUpdates(false);
    }, AUTO_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(interval);
      clearUpdaterWatchdog();
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
      window.removeEventListener("skala:native-ready", handleNativeReady);
      window.removeEventListener("skala:apk-update-progress", handleProgressEvent);
      window.removeEventListener("skala:check-update", handleManualCheck);
      window.removeEventListener("skala:start-apk-update", handleStartApkEvent);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    checkForUpdates,
    clearUpdaterWatchdog,
    refreshNativeMetadata,
    serverVersion,
    startApkDownloadWithUrl,
  ]);

  const applyWebPatch = async () => {
    if (applyingWebPatch) return;
    setApplyingWebPatch(true);
    setWebPatchStatus("Membersihkan cache patch lama...");

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      window.SkalaNativeUpdater?.clearWebCache();

      if ("serviceWorker" in navigator) {
        setWebPatchStatus("Mengunduh modul terbaru...");
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      }
    } catch {
      // Tetap lanjut reload agar browser/WebView menarik aset terbaru
    } finally {
      setWebPatchStatus("Memuat ulang aplikasi ke versi terbaru...");
      window.location.reload();
    }
  };

  const triggerNativeApkUpdate = () => {
    const targetUrl = serverVersion?.apk.downloadUrl || ANDROID_APK.href;
    const targetFileName = serverVersion?.apk.fileName || ANDROID_APK.fileName;
    startApkDownloadWithUrl(targetUrl, targetFileName);
  };

  const openExternalApkFallback = () => {
    const targetUrl = serverVersion?.apk.downloadUrl || ANDROID_APK.href;
    const targetFileName = serverVersion?.apk.fileName || ANDROID_APK.fileName;
    if (isAndroidWrapperUserAgent()) {
      window.location.assign(resolveExternalApkDownloadUrl(targetUrl));
      return;
    }
    triggerBrowserApkDownload(targetUrl, targetFileName);
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (isLegacyApkWrapper && serverVersion) {
      try {
        window.localStorage.setItem(LEGACY_APK_DISMISS_KEY, serverVersion.apk.version);
      } catch {
        // Ignore storage errors
      }
    }
  };

  if (upToDateMessage && !webUpdateAvailable && !apkUpdateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] flex max-w-sm items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-card/95 px-4 py-3 text-xs font-medium text-foreground shadow-xl backdrop-blur-md">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        <span>{upToDateMessage}</span>
      </div>
    );
  }

  if (dismissed || (!webUpdateAvailable && !apkUpdateAvailable && !nativeProgress)) {
    return null;
  }

  const isNativeDownloading = nativeProgress?.status === "downloading";
  const isPermissionRequired = nativeProgress?.status === "permission_required";
  const isNativeInstalling = nativeProgress?.status === "installing";
  const isNativeError = nativeProgress?.status === "error";

  return (
    <div className="fixed inset-x-3 bottom-4 z-[9999] mx-auto max-w-md rounded-2xl border border-primary/30 bg-card/95 p-4 text-foreground shadow-2xl backdrop-blur-xl sm:left-auto sm:right-5 sm:inset-x-auto sm:w-[390px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            {apkUpdateAvailable ? (
              <Smartphone className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                {apkUpdateAvailable
                  ? `Pembaruan Aplikasi (${serverVersion?.apk.label ?? "APK Baru"})`
                  : "Patch Sistem Terbaru Tersedia"}
              </h3>
              {nativeInfo && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Saat ini v{nativeInfo.versionName}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {apkUpdateAvailable
                ? serverVersion?.apk.releaseNotes ||
                  "Versi aplikasi Android terbaru siap diunduh dan dipasang langsung tanpa menghapus data login."
                : "Fitur dan perbaikan terbaru sudah tersedia. Terapkan patch langsung di aplikasi tanpa instal ulang."}
            </p>
          </div>
        </div>

        {!applyingWebPatch && !isNativeDownloading && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Tutup notifikasi pembaruan"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress / Status Bar untuk Web Patch atau Native APK */}
      {(applyingWebPatch || nativeProgress) && (
        <div className="mt-3 rounded-xl border border-border/80 bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 text-foreground">
              {isPermissionRequired ? (
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <RefreshCw
                  className={`h-3.5 w-3.5 text-primary ${
                    applyingWebPatch || isNativeDownloading ? "animate-spin" : ""
                  }`}
                />
              )}
              <span>
                {applyingWebPatch
                  ? webPatchStatus
                  : nativeProgress?.message || "Memproses pembaruan..."}
              </span>
            </span>
            {nativeProgress && nativeProgress.totalBytes > 0 && (
              <span className="tabular-nums text-primary">
                {nativeProgress.percent}%
              </span>
            )}
          </div>

          {nativeProgress && (
            <>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all duration-200 ${
                    isNativeError
                      ? "bg-destructive"
                      : isPermissionRequired
                        ? "bg-amber-500"
                        : "bg-primary"
                  }`}
                  style={{ width: `${Math.max(4, nativeProgress.percent || 0)}%` }}
                />
              </div>
              {nativeProgress.totalBytes > 0 && (
                <p className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground">
                  {formatMegabytes(nativeProgress.downloadedBytes)} /{" "}
                  {formatMegabytes(nativeProgress.totalBytes)}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
        {webUpdateAvailable && (
          <button
            type="button"
            disabled={applyingWebPatch || isNativeDownloading}
            onClick={() => void applyWebPatch()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${applyingWebPatch ? "animate-spin" : ""}`} />
            <span>{applyingWebPatch ? "Memperbarui..." : "Terapkan Patch Sekarang"}</span>
          </button>
        )}

        {isPermissionRequired && (
          <button
            type="button"
            onClick={() => {
              if (window.SkalaNativeUpdater?.openInstallUnknownAppsSettings) {
                window.SkalaNativeUpdater.openInstallUnknownAppsSettings();
              } else {
                openExternalApkFallback();
              }
            }}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Aktifkan Izin Instalasi</span>
          </button>
        )}

        {isNativeInstalling && window.SkalaNativeUpdater?.retryPendingInstall && (
          <button
            type="button"
            onClick={() => window.SkalaNativeUpdater?.retryPendingInstall?.()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Buka Pemasang APK</span>
          </button>
        )}

        {(isNativeError || isPermissionRequired) && (
          <button
            type="button"
            onClick={openExternalApkFallback}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Unduh via Browser</span>
          </button>
        )}

        {(apkUpdateAvailable || isNativeError) && (
          <button
            type="button"
            disabled={isNativeDownloading}
            onClick={triggerNativeApkUpdate}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              {isNativeDownloading
                ? `Mengunduh ${nativeProgress?.percent ?? 0}%`
                : isNativeError
                  ? "Coba Update Lagi"
                  : nativeInfo
                    ? `Update In-App (${serverVersion?.apk.label ?? ANDROID_APK.label})`
                    : `Unduh ${serverVersion?.apk.label ?? ANDROID_APK.label}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

