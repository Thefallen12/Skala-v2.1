"use client";

import useSWR from "swr";
import type {
  BellTaskReminder,
  NotificationFeed,
  NotificationFeedItem,
  SidebarCounts,
} from "@/lib/notification-types";

export type {
  BellTaskReminder,
  NotificationFeed,
  NotificationFeedItem,
  SidebarCounts,
};

const fetcher = async (url: string): Promise<NotificationFeed> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Notification polling failed with status ${response.status}.`);
  }
  return response.json() as Promise<NotificationFeed>;
};

export function useNotificationFeed() {
  return useSWR<NotificationFeed>(
    "/api/notifications/unread-count",
    fetcher,
    {
      refreshInterval: 10_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
}
