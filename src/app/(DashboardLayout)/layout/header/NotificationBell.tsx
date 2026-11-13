"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardNotification } from "./Notifications";
import type { NotificationFeed } from "./useNotificationFeed";
import {
  cancelNativeNotification,
  openDevicePermissionsDialog,
} from "@/lib/native-bridge";

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

export default function NotificationBell({
  fallbackNotifications,
  feed,
  loadFailed,
  refreshNotifications,
}: {
  fallbackNotifications: DashboardNotification[];
  feed: NotificationFeed | null;
  loadFailed: boolean;
  refreshNotifications: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const items = feed?.notifications ?? [];
  const taskReminders = feed ? feed.taskReminders : fallbackNotifications;
  const unreadCount = feed?.unreadCount ?? 0;

  const openNotification = async (id: string, actionUrl: string | null) => {
    setMessage("");
    setOpen(false);
    cancelNativeNotification(id);
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
      });
      if (!response.ok) {
        throw new Error(`Marking notification read failed with status ${response.status}.`);
      }
      const result: { actionUrl?: string | null } = await response.json();
      void refreshNotifications().catch((error: unknown) => {
        console.error("Refreshing notification feed failed:", error);
      });
      if (result.actionUrl) {
        router.push(result.actionUrl);
        return;
      }
    } catch (error) {
      console.error("Mark notification as read failed:", error);
      setMessage("Notifikasi gagal ditandai telah dibaca. Coba kembali.");
      return;
    }
    if (actionUrl) router.push(actionUrl);
  };

  return (
    <div className="relative px-1 sm:px-3">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ""}`}
            className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Bell className="size-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0 rounded-xl shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3 bg-muted/40">
            <h2 className="font-semibold text-sm">Notifikasi</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openDevicePermissionsDialog();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-accent"
              >
                <ShieldCheck className="size-3 text-emerald-600" aria-hidden="true" />
                <span>Izin &amp; Suara</span>
              </button>
              <Badge variant="secondary" className="text-xs">{unreadCount} baru</Badge>
            </div>
          </div>
          {loadFailed && (
            <p className="px-4 py-2 text-xs text-destructive" role="alert">
              Gagal memuat notifikasi.
            </p>
          )}
          {message && (
            <p className="px-4 py-2 text-xs text-destructive" role="alert">
              {message}
            </p>
          )}
          <SimpleBar className="max-h-[min(26rem,65vh)]">
            {items.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    void openNotification(item.id, item.actionUrl);
                  }}
                  className="items-start gap-2 whitespace-normal border-b px-4 py-3 cursor-pointer transition hover:bg-muted/60 active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${item.isRead ? "font-normal text-muted-foreground" : "font-semibold text-foreground"}`}>
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.message}</p>
                    <time className="mt-1 block text-[10px] text-muted-foreground/80">
                      {formatTime(item.createdAt)}
                    </time>
                  </div>
                  {!item.isRead && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
            ))}
            {taskReminders.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  onSelect={() => setOpen(false)}
                  className="items-start px-4 py-3"
                >
                  <Link href={item.href} className="flex w-full gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      <time className="mt-1 block text-[10px] text-muted-foreground">
                        {item.time}
                      </time>
                    </div>
                  </Link>
                </DropdownMenuItem>
            ))}
            {!items.length && !taskReminders.length && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Belum ada notifikasi.
              </p>
            )}
          </SimpleBar>
          <div className="border-t p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                router.push("/apps/tickets");
              }}
            >
              <CheckCheck aria-hidden="true" />
              Lihat aktivitas
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
