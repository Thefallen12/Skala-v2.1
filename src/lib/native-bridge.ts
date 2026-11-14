"use client";

import {
  removePushSubscription,
  saveFcmToken,
  savePushSubscription,
} from "@/app/actions/push-subscriptions";

export type PermissionStatusValue =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

export interface NativePermissionsPayload {
  platform: "android";
  sdkInt: number;
  notifications: PermissionStatusValue;
  notificationsEnabled: boolean;
  location: PermissionStatusValue;
  locationPrecision: "fine" | "coarse" | "none";
  locationServicesEnabled: boolean;
  camera: PermissionStatusValue;
  permanentlyDenied: {
    notifications: boolean;
    location: boolean;
  };
}

export interface SkalaNativeBridgeInterface {
  getPermissionsStatus: () => string;
  requestNotificationPermission: () => void;
  requestLocationPermission: () => void;
  requestAllPermissions: () => void;
  openAppSettings: () => void;
  openNotificationSettings: () => void;
  openLocationSettings: () => void;
  showWhatsAppNotification: (
    id: string,
    title: string,
    message: string,
    categoryLabel: string,
    actionUrl: string,
    timestampMs: number,
    forceHeadsUp: boolean,
  ) => void;
  syncSeenNotificationIds: (jsonIdsArray: string) => void;
  cancelNotification: (notificationId: string) => void;
  playNotificationFeedback: (playSound: boolean, vibrate: boolean) => void;
  isFirebasePushConfigured?: () => boolean;
  consumePendingNotificationAction: () => string;
}

declare global {
  interface Window {
    SkalaNativeBridge?: SkalaNativeBridgeInterface;
    __SKALA_NATIVE_PERMISSIONS__?: NativePermissionsPayload;
  }
}

export interface DevicePermissionsSnapshot {
  isAndroidApk: boolean;
  isIosNonStandalone: boolean;
  notifications: PermissionStatusValue;
  notificationsEnabled: boolean;
  webPushSupported: boolean;
  webPushSubscribed: boolean;
  location: PermissionStatusValue;
  locationPrecision: "fine" | "coarse" | "none";
  locationServicesEnabled: boolean;
  permanentlyDenied: {
    notifications: boolean;
    location: boolean;
  };
}

const SOUND_PREF_KEY = "skala_notif_sound_enabled";
const PERMISSIONS_SNOOZE_KEY = "skala_permissions_prompt_snoozed_until";
const LOCATION_HINT_KEY = "skala_location_permission_hint";

let sharedAudioContext: AudioContext | null = null;
let audioUnlockAttached = false;

export function isAndroidApkEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.SkalaNativeBridge ||
      window.__SKALA_NATIVE_PERMISSIONS__ ||
      /SkalaApp\//i.test(navigator.userAgent),
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isInstalledWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(SOUND_PREF_KEY);
    return raw !== "false";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage restriction
  }
}

export function isPermissionsPromptSnoozed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(window.localStorage.getItem(PERMISSIONS_SNOOZE_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function snoozePermissionsPrompt(hours = 24): void {
  if (typeof window === "undefined") return;
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    window.localStorage.setItem(PERMISSIONS_SNOOZE_KEY, String(until));
  } catch {
    // Ignore storage restriction
  }
}

export function clearPermissionsPromptSnooze(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PERMISSIONS_SNOOZE_KEY);
  } catch {
    // Ignore storage restriction
  }
}

export function markLocationPermissionHint(
  value: "granted" | "denied",
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCATION_HINT_KEY, value);
  } catch {
    // Ignore storage restriction
  }
}

export function emitPermissionsChanged(detail?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("skala:permissions-changed", { detail }));
}

export function openDevicePermissionsDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("skala:open-permissions-dialog"));
}

function getWebAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

export function setupAudioUnlockListeners(): () => void {
  if (typeof window === "undefined" || audioUnlockAttached) {
    return () => {};
  }
  audioUnlockAttached = true;
  const unlock = () => {
    const ctx = getWebAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  return () => {
    audioUnlockAttached = false;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/**
 * Plays a gentle two-tone chime inspired by mobile messaging alerts.
 */
export function playWebWhatsAppChime(): void {
  try {
    const ctx = getWebAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, start: 0, duration: 0.11 }, // E5
      { freq: 880, start: 0.095, duration: 0.18 }, // A5
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.16, now + note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.duration,
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
  } catch {
    // Browser autoplay or audio hardware may block sound safely
  }
}

export function triggerIncomingNotificationFeedback(): void {
  const soundEnabled = getNotificationSoundEnabled();
  if (typeof window === "undefined") return;

  if (window.SkalaNativeBridge) {
    try {
      window.SkalaNativeBridge.playNotificationFeedback(soundEnabled, true);
      return;
    } catch {
      // Fallback to web feedback
    }
  }

  if (soundEnabled) {
    playWebWhatsAppChime();
  }
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([120, 60, 120]);
    } catch {
      // Ignore unsupported vibration context
    }
  }
}

function readNativePermissionsPayload(): NativePermissionsPayload | null {
  if (typeof window === "undefined") return null;
  if (window.SkalaNativeBridge) {
    try {
      const parsed = JSON.parse(
        window.SkalaNativeBridge.getPermissionsStatus(),
      ) as NativePermissionsPayload;
      window.__SKALA_NATIVE_PERMISSIONS__ = parsed;
      return parsed;
    } catch {
      return window.__SKALA_NATIVE_PERMISSIONS__ ?? null;
    }
  }
  return window.__SKALA_NATIVE_PERMISSIONS__ ?? null;
}

function applicationServerKeyToBytes(key: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function subscribeWebPushIfSupported(): Promise<{
  success: boolean;
  message: string;
}> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { success: false, message: "Browser tidak mendukung Web Push." };
  }
  if (!window.isSecureContext) {
    return { success: false, message: "Notifikasi browser memerlukan HTTPS." };
  }

  const keyResponse = await fetch("/api/push/vapid-public-key", {
    cache: "no-store",
  });
  const keyData: unknown = await keyResponse.json().catch(() => null);
  const publicKey =
    typeof keyData === "object" &&
    keyData !== null &&
    "publicKey" in keyData &&
    typeof keyData.publicKey === "string"
      ? keyData.publicKey
      : null;

  if (!keyResponse.ok || !publicKey) {
    return {
      success: false,
      message:
        "Konfigurasi VAPID server belum lengkap atau tidak valid. Hubungi administrator.",
    };
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKeyToBytes(publicKey),
    }));
  return savePushSubscription(subscription.toJSON());
}

export async function unsubscribeWebPush(): Promise<{
  success: boolean;
  message: string;
}> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { success: false, message: "Service Worker tidak tersedia." };
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return {
      success: true,
      message: "Notifikasi browser dinonaktifkan di perangkat ini.",
    };
  }
  const result = await removePushSubscription(subscription.endpoint);
  if (!result.success) return result;
  await subscription.unsubscribe();
  return {
    success: true,
    message: "Notifikasi browser dinonaktifkan di perangkat ini.",
  };
}

export async function getDevicePermissionsSnapshot(): Promise<DevicePermissionsSnapshot> {
  const nativePayload = readNativePermissionsPayload();
  const isApk = Boolean(nativePayload) || isAndroidApkEnvironment();

  const webPushSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  let webPushSubscribed = false;
  if (webPushSupported && !nativePayload) {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      webPushSubscribed = Boolean(sub);
    } catch {
      webPushSubscribed = false;
    }
  }

  if (nativePayload) {
    return {
      isAndroidApk: true,
      isIosNonStandalone: false,
      notifications: nativePayload.notifications,
      notificationsEnabled: nativePayload.notificationsEnabled,
      webPushSupported: false,
      webPushSubscribed: false,
      location: nativePayload.location,
      locationPrecision: nativePayload.locationPrecision,
      locationServicesEnabled: nativePayload.locationServicesEnabled,
      permanentlyDenied: nativePayload.permanentlyDenied ?? {
        notifications: false,
        location: false,
      },
    };
  }

  let notifications: PermissionStatusValue = "unsupported";
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") notifications = "granted";
    else if (Notification.permission === "denied") notifications = "denied";
    else notifications = "prompt";
  }

  let location: PermissionStatusValue =
    typeof navigator !== "undefined" && "geolocation" in navigator
      ? "prompt"
      : "unsupported";

  if (
    typeof navigator !== "undefined" &&
    "permissions" in navigator &&
    typeof navigator.permissions.query === "function"
  ) {
    try {
      const geoState = await navigator.permissions.query({
        name: "geolocation",
      });
      if (geoState.state === "granted") location = "granted";
      else if (geoState.state === "denied") location = "denied";
      else location = "prompt";
    } catch {
      try {
        const hint = window.localStorage.getItem(LOCATION_HINT_KEY);
        if (hint === "granted" || hint === "denied") location = hint;
      } catch {
        // Ignore storage restriction
      }
    }
  }

  return {
    isAndroidApk: isApk,
    isIosNonStandalone: isIosDevice() && !isInstalledWebApp(),
    notifications,
    notificationsEnabled: notifications === "granted",
    webPushSupported,
    webPushSubscribed,
    location,
    locationPrecision: location === "granted" ? "fine" : "none",
    locationServicesEnabled: true,
    permanentlyDenied: {
      notifications: notifications === "denied",
      location: location === "denied",
    },
  };
}

function waitForNativePermissionChange(timeoutMs = 1500): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("skala:permissions-changed", finish);
      resolve();
    };
    window.addEventListener("skala:permissions-changed", finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}

export async function requestDeviceNotificationPermission(): Promise<{
  ok: boolean;
  status: PermissionStatusValue;
  message: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, status: "unsupported", message: "Tidak tersedia di server." };
  }

  if (window.SkalaNativeBridge) {
    const waiter = waitForNativePermissionChange(2500);
    window.SkalaNativeBridge.requestNotificationPermission();
    await waiter;
    const snapshot = await getDevicePermissionsSnapshot();
    const ok = snapshot.notifications === "granted";
    return {
      ok,
      status: snapshot.notifications,
      message: ok
        ? "Izin notifikasi Android aktif."
        : snapshot.permanentlyDenied.notifications
          ? "Izin notifikasi diblokir. Aktifkan melalui Pengaturan Aplikasi Android."
          : "Izin notifikasi belum diberikan.",
    };
  }

  if (!("Notification" in window)) {
    return {
      ok: false,
      status: "unsupported",
      message: "Browser ini tidak mendukung API notifikasi.",
    };
  }

  if (!window.isSecureContext) {
    return {
      ok: false,
      status: "unsupported",
      message: "Notifikasi memerlukan koneksi HTTPS.",
    };
  }

  const permission = await Notification.requestPermission();
  emitPermissionsChanged();

  if (permission !== "granted") {
    return {
      ok: false,
      status: permission === "denied" ? "denied" : "prompt",
      message:
        permission === "denied"
          ? "Izin notifikasi diblokir di browser. Ubah izin situs di pengaturan browser."
          : "Izin notifikasi belum diberikan.",
    };
  }

  if ("serviceWorker" in navigator && "PushManager" in window) {
    try {
      const pushResult = await subscribeWebPushIfSupported();
      return {
        ok: true,
        status: "granted",
        message: pushResult.success
          ? "Notifikasi & Web Push aktif di perangkat ini."
          : "Izin notifikasi browser aktif (popup dalam aplikasi siap).",
      };
    } catch {
      return {
        ok: true,
        status: "granted",
        message: "Izin notifikasi browser aktif.",
      };
    }
  }

  return {
    ok: true,
    status: "granted",
    message: "Izin notifikasi browser aktif.",
  };
}

export async function requestDeviceLocationPermission(): Promise<{
  ok: boolean;
  status: PermissionStatusValue;
  message: string;
}> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return {
      ok: false,
      status: "unsupported",
      message: "Perangkat tidak mendukung akses lokasi GPS.",
    };
  }

  if (window.SkalaNativeBridge) {
    const waiter = waitForNativePermissionChange(3000);
    window.SkalaNativeBridge.requestLocationPermission();
    await waiter;
    const snapshot = await getDevicePermissionsSnapshot();
    const ok = snapshot.location === "granted";
    if (ok) {
      markLocationPermissionHint("granted");
    }
    return {
      ok,
      status: snapshot.location,
      message: !ok
        ? snapshot.permanentlyDenied.location
          ? "Izin lokasi diblokir. Aktifkan lewat Pengaturan Aplikasi Android."
          : "Izin lokasi belum diberikan."
        : snapshot.locationServicesEnabled
          ? "Izin lokasi GPS aktif."
          : "Izin lokasi aktif, tetapi GPS perangkat sedang mati.",
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        markLocationPermissionHint("granted");
        emitPermissionsChanged();
        resolve({
          ok: true,
          status: "granted",
          message: "Izin lokasi GPS berhasil diaktifkan.",
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        if (denied) markLocationPermissionHint("denied");
        emitPermissionsChanged();
        resolve({
          ok: !denied,
          status: denied ? "denied" : "prompt",
          message: denied
            ? "Izin lokasi ditolak di browser. Ubah izin lokasi situs di pengaturan browser."
            : error.code === error.TIMEOUT
              ? "Sinyal GPS belum merespons, silakan coba lagi di area terbuka."
              : "Gagal mengakses lokasi perangkat.",
        });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  });
}

export async function requestAllDevicePermissions(): Promise<{
  snapshot: DevicePermissionsSnapshot;
  message: string;
}> {
  if (typeof window !== "undefined" && window.SkalaNativeBridge) {
    const waiter = waitForNativePermissionChange(3500);
    window.SkalaNativeBridge.requestAllPermissions();
    await waiter;
    const snapshot = await getDevicePermissionsSnapshot();
    const bothGranted =
      snapshot.notifications === "granted" && snapshot.location === "granted";
    return {
      snapshot,
      message: bothGranted
        ? "Semua izin Notifikasi & Lokasi telah diaktifkan."
        : "Periksa dialog izin Android atau Pengaturan HP untuk menyelesaikan perizinan.",
    };
  }

  await requestDeviceNotificationPermission();
  await requestDeviceLocationPermission();
  const snapshot = await getDevicePermissionsSnapshot();
  const bothGranted =
    snapshot.notifications === "granted" && snapshot.location === "granted";
  return {
    snapshot,
    message: bothGranted
      ? "Izin Notifikasi & Lokasi telah aktif."
      : "Sebagian izin belum aktif. Silakan izinkan pada prompt browser.",
  };
}

export function openDeviceAppSettings(): void {
  window.SkalaNativeBridge?.openAppSettings();
}

export function openDeviceNotificationSettings(): void {
  window.SkalaNativeBridge?.openNotificationSettings();
}

export function openDeviceLocationSettings(): void {
  window.SkalaNativeBridge?.openLocationSettings();
}

export function showNativeWhatsAppNotification(params: {
  id: string;
  title: string;
  message: string;
  categoryLabel?: string;
  actionUrl?: string | null;
  timestampMs?: number;
  forceHeadsUp?: boolean;
}): void {
  if (typeof window === "undefined" || !window.SkalaNativeBridge) return;
  try {
    window.SkalaNativeBridge.showWhatsAppNotification(
      params.id,
      params.title,
      params.message,
      params.categoryLabel ?? "Skala Prioritas",
      params.actionUrl ?? "/apps/tickets",
      params.timestampMs ?? Date.now(),
      params.forceHeadsUp === true,
    );
  } catch {
    // Ignore native bridge error on legacy wrappers
  }
}

export function syncNativeSeenNotificationIds(ids: string[]): void {
  if (typeof window === "undefined" || !window.SkalaNativeBridge || !ids.length) {
    return;
  }
  try {
    window.SkalaNativeBridge.syncSeenNotificationIds(JSON.stringify(ids));
  } catch {
    // Ignore native bridge error
  }
}

export function cancelNativeNotification(id: string): void {
  if (typeof window === "undefined" || !window.SkalaNativeBridge || !id) {
    return;
  }
  try {
    window.SkalaNativeBridge.cancelNotification(id);
  } catch {
    // Ignore native bridge error
  }
}

export function requestNotificationFeedRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("skala:refresh-notifications"));
}

export function consumePendingNativeNotificationAction(): {
  id: string;
  actionUrl: string;
} | null {
  if (typeof window === "undefined" || !window.SkalaNativeBridge) {
    return null;
  }
  try {
    const raw = window.SkalaNativeBridge.consumePendingNotificationAction();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; actionUrl?: string };
    if (parsed.actionUrl && parsed.actionUrl.startsWith("/") && !parsed.actionUrl.startsWith("//")) {
      return {
        id: parsed.id ?? "",
        actionUrl: parsed.actionUrl,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function isNativeFirebasePushConfigured(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.SkalaNativeBridge?.isFirebasePushConfigured?.() === true;
  } catch {
    return false;
  }
}

/**
 * Registers Firebase Cloud Messaging (FCM) on Capacitor Android when google-services.json
 * was bundled into the APK and runtime notification permissions are granted.
 */
export async function setupNativeFcmPush(
  onNavigate?: (actionUrl: string) => void,
): Promise<() => void> {
  if (
    typeof window === "undefined" ||
    !isAndroidApkEnvironment() ||
    !isNativeFirebasePushConfigured()
  ) {
    return () => {};
  }

  let disposed = false;
  const handles: Array<{ remove: () => Promise<void> }> = [];

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      return () => {};
    }

    const { PushNotifications } = await import("@capacitor/push-notifications");
    const permission = await PushNotifications.checkPermissions();
    if (disposed || permission.receive !== "granted") {
      return () => {};
    }

    handles.push(
      await PushNotifications.addListener("registration", (token) => {
        if (!token?.value) return;
        void saveFcmToken(token.value, "android").catch(() => {});
      }),
    );

    handles.push(
      await PushNotifications.addListener("pushNotificationReceived", () => {
        requestNotificationFeedRefresh();
      }),
    );

    handles.push(
      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const rawUrl = action.notification?.data?.actionUrl;
          if (
            typeof rawUrl === "string" &&
            rawUrl.startsWith("/") &&
            !rawUrl.startsWith("//")
          ) {
            onNavigate?.(rawUrl);
          }
        },
      ),
    );

    await PushNotifications.register();
  } catch {
    // Graceful fallback to SkalaNotificationJobService + WebView polling
  }

  return () => {
    disposed = true;
    for (const handle of handles) {
      void handle.remove().catch(() => {});
    }
  };
}

