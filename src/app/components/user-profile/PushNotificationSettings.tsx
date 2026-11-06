"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/app/actions/push-subscriptions";
import { Button } from "@/components/ui/button";

type PushState =
  | "checking"
  | "unsupported"
  | "install-required"
  | "blocked"
  | "disabled"
  | "enabled";

function isIosDevice() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isInstalledWebApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
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

export default function PushNotificationSettings() {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (isIosDevice() && !isInstalledWebApp()) {
      Promise.resolve().then(() => {
        if (active) setState("install-required");
      });
      return () => {
        active = false;
      };
    }

    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      Promise.resolve().then(() => {
        if (active) setState("unsupported");
      });
      return () => {
        active = false;
      };
    }

    if (Notification.permission === "denied") {
      Promise.resolve().then(() => {
        if (active) setState("blocked");
      });
      return () => {
        active = false;
      };
    }

    navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setState(subscription ? "enabled" : "disabled");
      })
      .catch((error: unknown) => {
        console.error("Checking browser push subscription failed:", error);
        if (active) {
          setState("disabled");
          setMessage("Status notifikasi browser gagal diperiksa.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const enableNotifications = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!window.isSecureContext) {
        setMessage("Notifikasi browser memerlukan HTTPS.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "Izin notifikasi diblokir di browser. Ubah izin situs lalu coba lagi."
            : "Izin notifikasi belum diberikan.",
        );
        return;
      }

      const keyResponse = await fetch("/api/push/vapid-public-key", {
        cache: "no-store",
      });
      const keyData: unknown = await keyResponse.json();
      const publicKey =
        typeof keyData === "object" &&
        keyData !== null &&
        "publicKey" in keyData &&
        typeof keyData.publicKey === "string"
          ? keyData.publicKey
          : null;
      if (!keyResponse.ok || !publicKey) {
        setMessage(
          "Konfigurasi VAPID server belum lengkap atau tidak valid. Hubungi administrator hosting.",
        );
        return;
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
      const result = await savePushSubscription(subscription.toJSON());
      setMessage(result.message);
      if (result.success) setState("enabled");
    } catch (error) {
      console.error("Enabling browser push notifications failed:", error);
      setMessage("Notifikasi browser gagal diaktifkan. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const result = await removePushSubscription(subscription.endpoint);
        if (!result.success) {
          setMessage(result.message);
          return;
        }
        await subscription.unsubscribe();
      }
      setState("disabled");
      setMessage("Notifikasi browser dinonaktifkan di perangkat ini.");
    } catch (error) {
      console.error("Disabling browser push notifications failed:", error);
      setMessage("Notifikasi browser gagal dinonaktifkan. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <BellRing className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Notifikasi tiket di browser</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Dapatkan pemberitahuan ketika tiket baru ditugaskan kepada Anda.
            Langganan disimpan per perangkat.
          </p>
          {message && (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </div>
      </div>
      {state === "unsupported" ? (
        <span className="text-xs text-muted-foreground">
          Browser ini tidak mendukung Web Push.
        </span>
      ) : state === "install-required" ? (
        <p className="max-w-sm text-xs text-muted-foreground" role="status">
          Notifikasi iPhone memerlukan iOS 16.4 atau lebih baru. Buka situs ini
          di Safari, pilih Bagikan &gt; Tambah ke Layar Utama, lalu buka aplikasi
          dari ikon tersebut untuk mengaktifkan notifikasi.
        </p>
      ) : state === "blocked" ? (
        <p className="max-w-xs text-xs text-muted-foreground" role="status">
          Izin notifikasi diblokir. Ubah izin situs menjadi Izinkan melalui
          pengaturan browser, lalu muat ulang halaman ini.
        </p>
      ) : state === "enabled" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={disableNotifications}
        >
          <BellOff className="mr-2 size-4" aria-hidden="true" />
          {busy ? "Memproses..." : "Nonaktifkan"}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={busy || state === "checking"}
          onClick={enableNotifications}
        >
          <BellRing className="mr-2 size-4" aria-hidden="true" />
          {busy ? "Mengaktifkan..." : "Aktifkan Notifikasi"}
        </Button>
      )}
    </div>
  );
}
