"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";

const EXIT_PROMPT_WINDOW_MS = 2000;
const CLOSE_TOP_MODAL_EVENT = "skala:close-top-modal";

const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[data-vaul-drawer][data-state="open"]',
  '[data-radix-popper-content-wrapper] [data-state="open"]',
  "dialog[open]",
  '[data-modal-open="true"]',
  '[aria-modal="true"]:not([data-state="closed"])',
].join(", ");

const ROOT_EXIT_PATHS = new Set(["/", "/login", "/auth/login"]);

function isCapacitorNativeRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  const capWindow = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(capWindow.Capacitor?.isNativePlatform?.());
}

function getVisibleOpenOverlays(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(OPEN_OVERLAY_SELECTOR),
  ).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function tryDismissTopOverlay(): boolean {
  const overlays = getVisibleOpenOverlays();
  if (overlays.length === 0) return false;

  const target =
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : document;

  const escapeEvent = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  });

  // Radix Dialog/AlertDialog/Popover/Select & Vaul Drawer menutup layer teratas saat menerima Escape
  const notCancelledByEscape = target.dispatchEvent(escapeEvent);
  if (!notCancelledByEscape) {
    return true;
  }

  // Fallback ke custom event GlobalModal bila Escape tidak ditangani oleh Radix
  const modalCloseEvent = new CustomEvent(CLOSE_TOP_MODAL_EVENT, {
    cancelable: true,
  });
  const notCancelledByModalEvent = window.dispatchEvent(modalCloseEvent);
  if (!notCancelledByModalEvent) {
    return true;
  }

  const topOverlay = overlays[overlays.length - 1];
  const closeButton = topOverlay.querySelector<HTMLElement>(
    '[data-slot="drawer-close"], [data-modal-close], button[aria-label*="Tutup" i], button[aria-label*="Close" i]',
  );
  if (closeButton) {
    closeButton.click();
  }

  return true;
}

export default function ApkBackButtonHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const [showExitHint, setShowExitHint] = useState(false);

  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  const lastRootBackAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;
  }, [pathname, router]);

  useEffect(() => {
    if (!isCapacitorNativeRuntime()) return;

    let cancelled = false;
    let listenerHandle: PluginListenerHandle | undefined;

    const clearExitPrompt = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      lastRootBackAtRef.current = 0;
      setShowExitHint(false);
    };

    const registerListener = async () => {
      try {
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          // 1. Tutup overlay/modal/drawer/popover yang terbuka terlebih dahulu
          if (tryDismissTopOverlay()) {
            clearExitPrompt();
            return;
          }

          const currentPath = pathnameRef.current || window.location.pathname;
          const isRootEntry = ROOT_EXIT_PATHS.has(currentPath);

          // 2. Mundur ke halaman/tampilan sebelumnya bila history WebView masih tersedia
          if (canGoBack && window.history.length > 1) {
            clearExitPrompt();
            window.history.back();
            return;
          }

          // Fallback ke halaman utama bila berada di sub-route tanpa riwayat aman
          if (!isRootEntry) {
            clearExitPrompt();
            routerRef.current.replace("/");
            return;
          }

          // 3. Di root tanpa modal/riwayat: minta konfirmasi tekan dua kali dalam 2 detik
          const now = Date.now();
          if (now - lastRootBackAtRef.current < EXIT_PROMPT_WINDOW_MS) {
            clearExitPrompt();
            void App.exitApp();
            return;
          }

          lastRootBackAtRef.current = now;
          setShowExitHint(true);
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
          }
          hideTimerRef.current = setTimeout(() => {
            lastRootBackAtRef.current = 0;
            setShowExitHint(false);
            hideTimerRef.current = null;
          }, EXIT_PROMPT_WINDOW_MS);
        });

        if (cancelled) {
          void handle.remove();
        } else {
          listenerHandle = handle;
        }
      } catch (error) {
        console.error("Failed to register Capacitor backButton listener:", error);
      }
    };

    void registerListener();

    return () => {
      cancelled = true;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);

  if (!showExitHint) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[9998] flex justify-center px-4 md:bottom-6"
    >
      <div className="rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm dark:bg-slate-100/95 dark:text-slate-900">
        Tekan sekali lagi untuk keluar
      </div>
    </div>
  );
}
