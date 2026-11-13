"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellOff,
  BellRing,
  Mail,
  MapPin,
  Navigation,
  Send,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDevicePermissionsSnapshot,
  getNotificationSoundEnabled,
  openDeviceAppSettings,
  openDeviceLocationSettings,
  openDeviceNotificationSettings,
  requestDeviceLocationPermission,
  requestDeviceNotificationPermission,
  setNotificationSoundEnabled,
  unsubscribeWebPush,
  type DevicePermissionsSnapshot,
} from "@/lib/native-bridge";

type SmtpStatusSnapshot = {
  configured: boolean;
  port: number;
  secure: boolean;
  encryptionLabel: string;
  fromAddress: string;
  userEmail: string;
};

export default function PushNotificationSettings() {
  const [snapshot, setSnapshot] = useState<DevicePermissionsSnapshot | null>(
    null,
  );
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatusSnapshot | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const next = await getDevicePermissionsSnapshot();
      setSnapshot(next);
    } catch (error) {
      console.error("Checking device permissions failed:", error);
      setMessage("Status notifikasi perangkat gagal diperiksa.");
    }
  }, []);

  const refreshSmtpStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/email-test", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as SmtpStatusSnapshot;
      setSmtpStatus(data);
    } catch {
      // Ignore transient network errors during background status fetch
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setSoundEnabledState(getNotificationSoundEnabled());
      void refreshState();
      void refreshSmtpStatus();
    });

    const handlePermissionsChanged = () => {
      void refreshState();
    };
    const handleSoundChanged = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      if (typeof custom.detail === "boolean") {
        setSoundEnabledState(custom.detail);
      }
    };

    window.addEventListener("skala:permissions-changed", handlePermissionsChanged);
    window.addEventListener("skala:native-ready", handlePermissionsChanged);
    window.addEventListener("skala:sound-pref-changed", handleSoundChanged);

    return () => {
      active = false;
      window.removeEventListener(
        "skala:permissions-changed",
        handlePermissionsChanged,
      );
      window.removeEventListener("skala:native-ready", handlePermissionsChanged);
      window.removeEventListener("skala:sound-pref-changed", handleSoundChanged);
    };
  }, [refreshState, refreshSmtpStatus]);

  const sendTestEmail = async () => {
    setEmailBusy(true);
    setEmailFeedback(null);
    try {
      const response = await fetch("/api/notifications/email-test", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
      };
      setEmailFeedback({
        ok: Boolean(response.ok && payload.success),
        text:
          payload.message ||
          (response.ok
            ? "Email uji coba berhasil dikirim."
            : "Email uji coba gagal dikirim."),
      });
    } catch (error) {
      console.error("Sending test notification email failed:", error);
      setEmailFeedback({
        ok: false,
        text: "Gagal menghubungi server untuk mengirim email uji coba.",
      });
    } finally {
      setEmailBusy(false);
    }
  };

  const enableNotifications = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (snapshot?.isAndroidApk && snapshot.permanentlyDenied.notifications) {
        openDeviceNotificationSettings();
        return;
      }
      const result = await requestDeviceNotificationPermission();
      setMessage(result.message);
      await refreshState();
    } catch (error) {
      console.error("Enabling notifications failed:", error);
      setMessage("Notifikasi gagal diaktifkan. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await unsubscribeWebPush();
      setMessage(result.message);
      await refreshState();
    } catch (error) {
      console.error("Disabling browser push notifications failed:", error);
      setMessage("Notifikasi browser gagal dinonaktifkan. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  };

  const enableLocation = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (snapshot?.isAndroidApk && snapshot.permanentlyDenied.location) {
        openDeviceAppSettings();
        return;
      }
      const result = await requestDeviceLocationPermission();
      setMessage(result.message);
      await refreshState();
    } finally {
      setBusy(false);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setNotificationSoundEnabled(next);
    window.dispatchEvent(
      new CustomEvent("skala:sound-pref-changed", { detail: next }),
    );
  };

  const triggerTestPopup = () => {
    window.dispatchEvent(new CustomEvent("skala:test-whatsapp-popup"));
  };

  const isChecking = snapshot === null;
  const notifGranted = snapshot?.notifications === "granted";
  const locationGranted = snapshot?.location === "granted";

  return (
    <div className="mt-5 space-y-3">
      {/* Perizinan Notifikasi */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <BellRing className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">
              {snapshot?.isAndroidApk
                ? "Notifikasi Masuk Android (Popup WA)"
                : "Notifikasi tiket di browser"}
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              {snapshot?.isAndroidApk
                ? "Terima popup notifikasi gaya WhatsApp dengan suara, getar, dan navigasi langsung ke dokumen terkait."
                : "Dapatkan pemberitahuan ketika tiket baru ditugaskan kepada Anda. Langganan disimpan per perangkat."}
            </p>
            {message && (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={toggleSound}
          >
            {soundEnabled ? (
              <Volume2 className="mr-1.5 size-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <VolumeX className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {soundEnabled ? "Suara Aktif" : "Suara Mati"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={triggerTestPopup}
          >
            <Sparkles className="mr-1.5 size-4 text-emerald-600" aria-hidden="true" />
            Tes Popup
          </Button>

          {isChecking ? (
            <Button type="button" size="sm" disabled>
              Memeriksa...
            </Button>
          ) : snapshot.isIosNonStandalone ? (
            <p className="max-w-sm text-xs text-muted-foreground" role="status">
              Notifikasi iPhone memerlukan iOS 16.4+. Pilih Bagikan &gt; Tambah
              ke Layar Utama lalu buka aplikasi dari ikon tersebut.
            </p>
          ) : snapshot.notifications === "unsupported" ? (
            <span className="text-xs text-muted-foreground">
              Perangkat tidak mendukung API Notifikasi.
            </span>
          ) : snapshot.isAndroidApk ? (
            notifGranted ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openDeviceNotificationSettings}
              >
                <Settings className="mr-1.5 size-4" aria-hidden="true" />
                Aktif (Pengaturan)
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void enableNotifications()}
              >
                <BellRing className="mr-1.5 size-4" aria-hidden="true" />
                {snapshot.permanentlyDenied.notifications
                  ? "Buka Pengaturan HP"
                  : busy
                    ? "Mengaktifkan..."
                    : "Izinkan Notifikasi"}
              </Button>
            )
          ) : snapshot.notifications === "denied" ? (
            <p className="max-w-xs text-xs text-muted-foreground" role="status">
              Izin notifikasi diblokir. Ubah izin situs menjadi Izinkan melalui
              pengaturan browser, lalu muat ulang halaman ini.
            </p>
          ) : notifGranted && snapshot.webPushSubscribed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void disableNotifications()}
            >
              <BellOff className="mr-1.5 size-4" aria-hidden="true" />
              {busy ? "Memproses..." : "Nonaktifkan"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void enableNotifications()}
            >
              <BellRing className="mr-1.5 size-4" aria-hidden="true" />
              {busy ? "Mengaktifkan..." : "Aktifkan Notifikasi"}
            </Button>
          )}
        </div>
      </div>

      {/* Perizinan Lokasi GPS */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-sky-500/10 p-2 text-sky-600 dark:text-sky-400">
            <MapPin className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Izin Lokasi (GPS)</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Digunakan untuk deteksi desa/kecamatan dashboard, bukti lokasi
              pengiriman Mover, dan geotag foto survei lapangan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot?.isAndroidApk &&
            locationGranted &&
            !snapshot.locationServicesEnabled && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openDeviceLocationSettings}
              >
                <Navigation className="mr-1.5 size-4 text-amber-600" aria-hidden="true" />
                Nyalakan GPS HP
              </Button>
            )}
          {locationGranted ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Lokasi Diizinkan
              {snapshot?.isAndroidApk
                ? ` (${snapshot.locationPrecision === "fine" ? "Akurat" : "Perkiraan"})`
                : ""}
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy || isChecking}
              onClick={() => void enableLocation()}
            >
              <MapPin className="mr-1.5 size-4" aria-hidden="true" />
              {snapshot?.isAndroidApk && snapshot.permanentlyDenied.location
                ? "Buka Pengaturan HP"
                : busy
                  ? "Meminta..."
                  : "Izinkan Lokasi"}
            </Button>
          )}
        </div>
      </div>

      {/* Notifikasi Email Otomatis (SMTP) */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-orange-500/10 p-2 text-orange-600 dark:text-orange-400">
            <Mail className="size-4" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">
                Notifikasi Email Otomatis (SMTP)
              </h3>
              {smtpStatus && (
                <span
                  className={
                    smtpStatus.configured
                      ? "inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                      : "inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                  }
                >
                  {smtpStatus.configured
                    ? `SMTP Aktif · Port ${smtpStatus.port} (${smtpStatus.encryptionLabel})`
                    : "SMTP Belum Lengkap"}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Setiap tiket baru, persetujuan Direksi, PO, dan antrean pembayaran
              Keuangan otomatis dikirim dari{" "}
              <span className="font-medium text-foreground">
                notifikasi@skala-prioritas.com
              </span>{" "}
              ke email akun Anda
              {smtpStatus?.userEmail ? (
                <>
                  {" "}
                  (<span className="font-medium text-foreground">{smtpStatus.userEmail}</span>)
                </>
              ) : null}
              .
            </p>
            {emailFeedback && (
              <p
                className={
                  emailFeedback.ok
                    ? "mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                    : "mt-2 text-xs font-medium text-rose-600 dark:text-rose-400"
                }
                role="status"
              >
                {emailFeedback.text}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={emailBusy || (smtpStatus !== null && !smtpStatus.configured)}
            onClick={() => void sendTestEmail()}
          >
            <Send className="mr-1.5 size-4 text-orange-600" aria-hidden="true" />
            {emailBusy ? "Mengirim..." : "Kirim Email Uji Coba"}
          </Button>
        </div>
      </div>
    </div>
  );
}
