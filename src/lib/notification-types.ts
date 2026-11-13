import type { NotificationType } from "@prisma/client";

export type BellTaskReminder = {
  id: string;
  title: string;
  description: string;
  time: string;
  href: string;
  category: "habit" | "task" | "ticket";
};

export type NotificationFeedItem = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
};

export type SidebarCounts = {
  executive: number;
  logistics: number;
  finance: number;
};

export type NotificationFeed = {
  unreadCount: number;
  notifications: NotificationFeedItem[];
  taskReminders: BellTaskReminder[];
  sidebarCounts: SidebarCounts;
};

