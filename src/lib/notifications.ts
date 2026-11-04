import { Prisma } from "@prisma/client";
import { NotificationType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type NotificationDatabase = Pick<Prisma.TransactionClient, "user" | "notification">;

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
  if (!title.trim() || title.length > 180 || !message.trim() || message.length > 2000) {
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
        select: { id: true },
      })
    : await database.user.findMany({
        where: {
          isActive: true,
          role: { in: Array.isArray(roleTarget) ? roleTarget : [roleTarget!] },
        },
        select: { id: true },
      });
  if (recipients.length === 0) return 0;

  const result = await database.notification.createMany({
    data: recipients.map(({ id }) => ({
      userId: id,
      title: title.trim(),
      message: message.trim(),
      type,
      actionUrl: actionUrl ?? null,
    })),
  });
  return result.count;
}
