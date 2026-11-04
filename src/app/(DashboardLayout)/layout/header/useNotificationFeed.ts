"use client";

import useSWR from "swr";
import type { NotificationType } from "@prisma/client";

export type NotificationFeedItem = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
};

export type NotificationFeed = {
  unreadCount: number;
  notifications: NotificationFeedItem[];
  sidebarCounts: SidebarCounts;
};

export type SidebarCounts = {
  executive: number;
  logistics: number;
  finance: number;
};

const fetcher = async (url: string): Promise<NotificationFeed> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Notification polling failed with status ${response.status}.`);
  }
  return response.json() as Promise<NotificationFeed>;
};

export function useNotificationFeed() {
  return useSWR<NotificationFeed>(
    "/api/notifications/unread-count",
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );
}
