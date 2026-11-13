"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  MapPin,
  Navigation,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { GlobalModal } from "@/components/ui/global-modal";
import { Button } from "@/components/ui/button";
import {
  clearPermissionsPromptSnooze,
  getDevicePermissionsSnapshot,
  getNotificationSoundEnabled,
  isPermissionsPromptSnoozed,
  openDeviceAppSettings,
  openDeviceLocationSettings,
  openDeviceNotificationSettings,
  requestAllDevicePermissions,
  requestDeviceLocationPermission,
  requestDeviceNotificationPermission,
  setNotificationSoundEnabled,
  snoozePermissionsPrompt,
  type DevicePermissionsSnapshot,
  type PermissionStatusValue,
} from "@/lib/native-bridge";

function statusLabel(
  status: PermissionStatusValue,
  extraWarning?: string,
): { text: string; className: string } {
  if (extraWarning && status === "granted") {
    return {
      text: extraWarning,
      className:
        "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    };
  }
  switch (status) {
    case "granted":
      return {
        text: "Diizinkan",
        className:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      };
    case "denied":
      return {
        text: "Diblokir",
        className:
          "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
      };
    case "unsupported":
      return {
        text: "Tidak Didukung",
        className: "bg-muted text-muted-foreground border-border",
      };
    default:
      return {
        text: "Perlu Izin",
        className:
          "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      };
  }
}

export default function DevicePermissionsDialog({
  onTestPopup,
}: {
  onTestPopup?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DevicePermissionsSnapshot | null>(
    null,
  );
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [busyAction, setBusyAction] = useState<
    "all" | "notifications" | "location" | null
  >(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const refreshSnapshot = useCallback(async () => {
    const next = await getDevicePermissionsSnapshot();
    setSnapshot(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setSoundEnabledState(getNotificationSoundEnabled());
      }
    });

    const autoCheckTimer = window.setTimeout(() => {
      void getDevicePermissionsSnapshot().then((next) => {
        if (cancelled) return;
        setSnapshot(next);

        if (isPermissionsPromptSnoozed()) return;

        const needsNotification =
          next.notifications !== "granted" &&
          next.notifications !== "unsupported";
        const needsLocation =
          next.location !== "granted" && next.location !== "unsupported";

        if (needsNotification || needsLocation) {
          setOpen(true);
        }
      });
    }, 1600);

    const handleOpenDialog = () => {
      clearPermissionsPromptSnooze();
      setFeedbackMessage("");
      void refreshSnapshot();
      setOpen(true);
    };

    const handlePermissionsChanged = () => {
      void refreshSnapshot();
    };

    window.addEventListener("skala:open-permissions-dialog", handleOpenDialog);
    window.addEventListener(
      "skala:permissions-changed",
      handlePermissionsChanged,
    );
    window.addEventListener("skala:native-ready", handlePermissionsChanged);

    return () => {
      cancelled = true;
      window.clearTimeout(autoCheckTimer);
      window.removeEventListener(
        "skala:open-permissions-dialog",
        handleOpenDialog,
      );
      window.removeEventListener(
        "skala:permissions-changed",
        handlePermissionsChanged,
      );
      window.removeEventListener("skala:native-ready", handlePermissionsChanged);
    };
  }, [refreshSnapshot]);

  const handleRequestNotifications = async () => {
    setBusyAction("notifications");
    setFeedbackMessage("");
    try {
      const result = await requestDeviceNotificationPermission();
      setFeedbackMessage(result.message);
      await refreshSnapshot();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRequestLocation = async () => {
    setBusyAction("location");
    setFeedbackMessage("");
    try {
      const result = await requestDeviceLocationPermission();
      setFeedbackMessage(result.message);
      await refreshSnapshot();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRequestAll = async () => {
    setBusyAction("all");
    setFeedbackMessage("");
    try {
      const result = await requestAllDevicePermissions();
      setSnapshot(result.snapshot);
      setFeedbackMessage(result.message);
      if (
        result.snapshot.notifications === "granted" &&
        result.snapshot.location === "granted" &&
        result.snapshot.locationServicesEnabled
      ) {
        clearPermissionsPromptSnooze();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSnoozeClose = () => {
    if (
      snapshot &&
      (snapshot.notifications !== "granted" || snapshot.location !== "granted")
    ) {
      snoozePermissionsPrompt(24);
    }
    setOpen(false);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setNotificationSoundEnabled(next);
    window.dispatchEvent(
      new CustomEvent("skala:sound-pref-changed", { detail: next }),
    );
  };

  const notifGranted = snapshot?.notifications === "granted";
  const locationGranted = snapshot?.location === "granted";
  const allGranted =
    notifGranted &&
    locationGranted &&
    (snapshot?.locationServicesEnabled ?? true);

  const notifBadge = statusLabel(snapshot?.notifications ?? "prompt");
  const locationBadge = statusLabel(
    snapshot?.location ?? "prompt",
    snapshot && locationGranted && !snapshot.locationServicesEnabled
      ? "GPS Mati"
      : undefined,
  );

  return (
    <GlobalModal
      isOpen={open}
      onClose={handleSnoozeClose}
      title="Perizinan Aplikasi & Notifikasi"
      description="Aktifkan akses notifikasi popup dan lokasi GPS agar seluruh fitur operasional di APK & browser berjalan optimal."
      icon={<ShieldCheck className="size-5" aria-hidden="true" />}
      className="sm:max-w-lg"
      footerNote="Izin dapat diubah kapan saja lewat Profil atau Pengaturan Perangkat."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleSnoozeClose}
            disabled={busyAction !== null}
          >
            {allGranted ? "Tutup" : "Nanti Saja"}
          </Button>
          {!allGranted && (
            <Button
              type="button"
              onClick={() => void handleRequestAll()}
              disabled={busyAction !== null}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" />
              {busyAction === "all" ? "Meminta Izin..." : "Izinkan Semua"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {/* Card 1: Notifikasi */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <BellRing className="size-4.5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Notifikasi Masuk (Popup WA)
                  </h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${notifBadge.className}`}
                  >
                    {notifBadge.text}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Menampilkan popup pesan masuk di bagian atas layar dengan suara
                  dan getar saat ada tiket, otorisasi, PO, atau pengiriman baru.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
            <button
              type="button"
              onClick={toggleSound}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              {soundEnabled ? (
                <Volume2 className="size-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <VolumeX className="size-3.5 text-muted-foreground" aria-hidden="true" />
              )}
              <span>{soundEnabled ? "Suara & Getar Aktif" : "Suara Dimatikan"}</span>
            </button>

            <div className="flex items-center gap-2">
              {onTestPopup && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onTestPopup}
                  className="h-8 text-xs"
                >
                  <Sparkles className="mr-1.5 size-3.5 text-emerald-600" aria-hidden="true" />
                  Tes Popup
                </Button>
              )}
              {!notifGranted && (
                <Button
                  type="button"
                  size="sm"
                  disabled={busyAction !== null}
                  onClick={() => {
                    if (
                      snapshot?.isAndroidApk &&
                      snapshot.permanentlyDenied.notifications
                    ) {
                      openDeviceNotificationSettings();
                      return;
                    }
                    void handleRequestNotifications();
                  }}
                  className="h-8 text-xs"
                >
                  {busyAction === "notifications" ? (
                    "Memproses..."
                  ) : snapshot?.isAndroidApk &&
                    snapshot.permanentlyDenied.notifications ? (
                    <>
                      <Settings className="mr-1.5 size-3.5" aria-hidden="true" />
                      Buka Pengaturan
                    </>
                  ) : (
                    "Izinkan Notifikasi"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Lokasi GPS */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <MapPin className="size-4.5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Akses Lokasi (GPS)
                  </h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${locationBadge.className}`}
                  >
                    {locationBadge.text}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Digunakan untuk menampilkan nama lokasi dashboard, validasi
                  pengiriman Mover, serta geotag otomatis foto survei lapangan.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2.5">
            {snapshot?.isAndroidApk &&
              locationGranted &&
              !snapshot.locationServicesEnabled && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={openDeviceLocationSettings}
                  className="h-8 border-amber-500/40 text-xs text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                >
                  <Navigation className="mr-1.5 size-3.5" aria-hidden="true" />
                  Nyalakan GPS HP
                </Button>
              )}
            {!locationGranted && (
              <Button
                type="button"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => {
                  if (
                    snapshot?.isAndroidApk &&
                    snapshot.permanentlyDenied.location
                  ) {
                    openDeviceAppSettings();
                    return;
                  }
                  void handleRequestLocation();
                }}
                className="h-8 text-xs"
              >
                {busyAction === "location" ? (
                  "Memproses..."
                ) : snapshot?.isAndroidApk &&
                  snapshot.permanentlyDenied.location ? (
                  <>
                    <Settings className="mr-1.5 size-3.5" aria-hidden="true" />
                    Buka Pengaturan
                  </>
                ) : (
                  "Izinkan Lokasi"
                )}
              </Button>
            )}
          </div>
        </div>

        {snapshot?.isIosNonStandalone && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Di iPhone/iPad, pilih Bagikan &gt; Tambah ke Layar Utama lalu buka
              aplikasi dari ikon tersebut agar notifikasi iOS dapat aktif.
            </p>
          </div>
        )}

        {feedbackMessage && (
          <p
            role="status"
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground"
          >
            {feedbackMessage}
          </p>
        )}
      </div>
    </GlobalModal>
  );
}
