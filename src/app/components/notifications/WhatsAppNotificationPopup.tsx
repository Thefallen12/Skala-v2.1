"use client";

import { useRef } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  ShieldCheck,
  Truck,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import { NotificationType } from "@prisma/client";
import type { NotificationFeedItem } from "@/app/(DashboardLayout)/layout/header/useNotificationFeed";

interface WhatsAppNotificationPopupProps {
  notification: NotificationFeedItem | null;
  queuedCount: number;
  soundEnabled: boolean;
  busy?: boolean;
  onToggleSound: () => void;
  onDismiss: () => void;
  onMarkAsRead: (item: NotificationFeedItem) => void;
  onOpen: (item: NotificationFeedItem) => void;
  onPauseTimer?: (paused: boolean) => void;
}

function getCategoryMeta(item: NotificationFeedItem) {
  const url = item.actionUrl ?? "";
  if (item.type === NotificationType.APPROVAL || url.startsWith("/apps/approvals")) {
    return {
      label: "Otorisasi Direksi",
      accentClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      Icon: ShieldCheck,
    };
  }
  if (url.startsWith("/apps/finance")) {
    return {
      label: "Keuangan",
      accentClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
      badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
      Icon: Wallet,
    };
  }
  if (url.startsWith("/apps/logistics") || url.startsWith("/apps/orders")) {
    return {
      label: "Logistik & Armada",
      accentClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      Icon: Truck,
    };
  }
  if (item.type === NotificationType.WARNING) {
    return {
      label: "Perhatian",
      accentClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
      badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      Icon: AlertTriangle,
    };
  }
  if (item.type === NotificationType.SUCCESS) {
    return {
      label: "Selesai",
      accentClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      Icon: CheckCircle2,
    };
  }
  return {
    label: "Notifikasi Sistem",
    accentClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    Icon: BellRing,
  };
}

function formatBannerTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Baru saja";
  const ageSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (ageSeconds < 90) return "Baru saja";
  return (
    new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(date) + " WIB"
  );
}

export default function WhatsAppNotificationPopup({
  notification,
  queuedCount,
  soundEnabled,
  busy = false,
  onToggleSound,
  onDismiss,
  onMarkAsRead,
  onOpen,
  onPauseTimer,
}: WhatsAppNotificationPopupProps) {
  const touchStartYRef = useRef<number | null>(null);

  if (!notification) return null;

  const meta = getCategoryMeta(notification);
  const CategoryIcon = meta.Icon;

  return (
    <div
      role="status"
      aria-live="assertive"
      onMouseEnter={() => onPauseTimer?.(true)}
      onMouseLeave={() => onPauseTimer?.(false)}
      onTouchStart={(event) => {
        touchStartYRef.current = event.touches[0]?.clientY ?? null;
        onPauseTimer?.(true);
      }}
      onTouchEnd={(event) => {
        const startY = touchStartYRef.current;
        const endY = event.changedTouches[0]?.clientY ?? null;
        touchStartYRef.current = null;
        onPauseTimer?.(false);
        if (startY !== null && endY !== null && endY - startY < -36) {
          onDismiss();
        }
      }}
      className="fixed left-2.5 right-2.5 top-[max(env(safe-area-inset-top,0px),12px)] z-[10000] mx-auto max-w-[440px] animate-in fade-in-0 slide-in-from-top-4 duration-300 sm:left-auto sm:right-5 sm:top-5 sm:w-[400px]"
    >
      <div className="overflow-hidden rounded-2xl border border-emerald-500/40 bg-card/95 text-card-foreground shadow-[0_18px_45px_-12px_rgba(16,42,77,0.42)] backdrop-blur-xl dark:border-emerald-500/35">
        {/* Emerald indicator bar di sisi atas seperti pesan WhatsApp masuk */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-emerald-500/10 px-3.5 py-2 dark:bg-emerald-950/40">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
              <MessageCircle className="size-3" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-card bg-emerald-400"
              />
            </span>
            <span className="truncate text-[11px] font-bold tracking-wide text-emerald-700 dark:text-emerald-300">
              SKALA PRIORITAS
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {formatBannerTime(notification.createdAt)}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {queuedCount > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                +{queuedCount} pesan
              </span>
            )}
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={
                soundEnabled ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"
              }
              title={
                soundEnabled ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"
              }
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/70 hover:text-foreground"
            >
              {soundEnabled ? (
                <Volume2 className="size-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="size-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Tutup popup notifikasi"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/70 hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Konten pesan utama - dapat ditekan untuk langsung membuka dokumen */}
        <button
          type="button"
          disabled={busy}
          onClick={() => onOpen(notification)}
          className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-muted/40 active:bg-muted/60 disabled:opacity-70"
        >
          <span
            className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${meta.accentClass}`}
          >
            <CategoryIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
              >
                {meta.label}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm font-bold leading-snug text-foreground">
              {notification.title}
            </p>
            <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {notification.message}
            </p>
          </div>
        </button>

        {/* Tombol aksi cepat */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-3.5 py-2">
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            Geser ke atas untuk menutup
          </span>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
            <button
              type="button"
              disabled={busy}
              onClick={() => onMarkAsRead(notification)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
            >
              <CheckCheck className="size-3.5" aria-hidden="true" />
              <span>Tandai Dibaca</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpen(notification)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <span>Buka</span>
              <ExternalLink className="size-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

