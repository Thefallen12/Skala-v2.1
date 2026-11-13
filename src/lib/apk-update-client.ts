"use client";

export interface NativeAppInfo {
  platform: "android";
  packageName: string;
  versionName: string;
  versionCode: number;
  canRequestPackageInstalls: boolean;
}

export interface SkalaNativeUpdaterBridge {
  getAppInfo: () => string;
  clearWebCache: () => void;
  startApkUpdate: (apkUrl: string) => void;
  openInstallUnknownAppsSettings?: () => void;
  retryPendingInstall?: () => void;
}

declare global {
  interface Window {
    SkalaNativeUpdater?: SkalaNativeUpdaterBridge;
    __SKALA_NATIVE_APP__?: NativeAppInfo;
  }
}

export function isAndroidWrapperUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SkalaApp\//i.test(navigator.userAgent);
}

/**
 * Resolves an alternate trusted domain URL when an older APK without SkalaNativeUpdater
 * needs Capacitor's launchIntent to break out into Android's external browser/downloader.
 */
export function resolveExternalApkDownloadUrl(downloadUrl: string): string {
  if (typeof window === "undefined") return downloadUrl;
  try {
    const resolved = new URL(downloadUrl, window.location.origin);
    if (resolved.hostname === "www.skala-prioritas.com") {
      resolved.hostname = "skala-prioritas.com";
      return resolved.toString();
    }
    if (resolved.hostname === "skala-prioritas.com") {
      resolved.hostname = "www.skala-prioritas.com";
      return resolved.toString();
    }
    return resolved.toString();
  } catch {
    return "https://skala-prioritas.com/Skala-Prioritas.apk";
  }
}

export function triggerBrowserApkDownload(downloadUrl: string, fileName: string): void {
  if (typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function handleApkLinkClick(
  event: { preventDefault: () => void },
  downloadUrl: string,
): boolean {
  if (typeof window === "undefined") return false;
  if (window.SkalaNativeUpdater?.startApkUpdate) {
    event.preventDefault();
    window.dispatchEvent(
      new CustomEvent("skala:start-apk-update", {
        detail: { downloadUrl },
      }),
    );
    return true;
  }
  if (isAndroidWrapperUserAgent()) {
    event.preventDefault();
    window.location.assign(resolveExternalApkDownloadUrl(downloadUrl));
    return true;
  }
  return false;
}

