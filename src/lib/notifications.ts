import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { NotificationType, UserRole } from "@prisma/client";
import { sendNotificationEmails } from "@/lib/email-notifications";
import { prisma } from "@/lib/prisma";

type NotificationDatabase = Pick<Prisma.TransactionClient, "user" | "notification">;

function scheduleBackgroundTask(task: () => Promise<void>) {
  try {
    after(task);
    return;
  } catch {
    // Fallback when invoked outside a Next.js request context (e.g., CLI scripts/tests).
  }

  queueMicrotask(() => {
    void task().catch((error) => {
      console.error("[Notification] Background email dispatch failed:", error);
    });
  });
}

export async function sendNotification({
  roleTarget,
  userId,
  title,
  message,
  actionUrl,
  type = NotificationType.INFO,
  database = prisma,
}: {
  roleTarget?: UserRole | UserRole[];
  userId?: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  type?: NotificationType;
  database?: NotificationDatabase;
}): Promise<number> {
  if ((!roleTarget && !userId) || (roleTarget && userId)) {
    throw new Error("Provide exactly one notification recipient selector.");
  }
  const normalizedTitle = title.trim();
  const normalizedMessage = message.trim();
  if (!normalizedTitle || normalizedTitle.length > 180 || !normalizedMessage || normalizedMessage.length > 2000) {
    throw new Error("Notification title or message is invalid.");
  }
  if (
    actionUrl !== undefined &&
    actionUrl !== null &&
    (!actionUrl.startsWith("/") || actionUrl.startsWith("//"))
  ) {
    throw new Error("Notification action URL must be an internal path.");
  }

  const recipients = userId
    ? await database.user.findMany({
        where: { id: userId, isActive: true },
        select: { id: true, name: true, email: true, role: true },
      })
    : await database.user.findMany({
        where: {
          isActive: true,
          role: { in: Array.isArray(roleTarget) ? roleTarget : [roleTarget!] },
        },
        select: { id: true, name: true, email: true, role: true },
      });
  if (recipients.length === 0) return 0;

  const notificationIds: string[] = [];
  const rows = recipients.map(({ id: recipientId }) => {
    const notificationId = randomUUID();
    notificationIds.push(notificationId);
    return {
      id: notificationId,
      userId: recipientId,
      title: normalizedTitle,
      message: normalizedMessage,
      type,
      actionUrl: actionUrl ?? null,
    };
  });

  const result = await database.notification.createMany({ data: rows });
  const createdCount = result?.count ?? recipients.length;
  if (createdCount === 0) return 0;

  const isTransactional = database !== prisma;
  scheduleBackgroundTask(async () => {
    try {
      // Skip sending if an enclosing Prisma transaction rolled back after creating rows.
      if (isTransactional) {
        const persistedCount = await prisma.notification.count({
          where: { id: { in: notificationIds } },
        });
        if (persistedCount === 0) return;
      }

      await sendNotificationEmails({
        recipients,
        title: normalizedTitle,
        message: normalizedMessage,
        actionUrl: actionUrl ?? null,
        type,
      });
    } catch (error) {
      console.error("[Notification] Email background dispatch failed:", error);
    }
  });

  return createdCount;
}
