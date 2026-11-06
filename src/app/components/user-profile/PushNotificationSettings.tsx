"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/app/actions/push-subscriptions";
import { Button } from "@/components/ui/button";

type PushState = "checking" | "unsupported" | "disabled" | "enabled";

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
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
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
      if (!publicKey) {
        setMessage("VAPID public key belum dikonfigurasi untuk aplikasi ini.");
        return;
      }
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
