import { NextResponse } from "next/server";
import { TicketStatus, UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const userId = session.user.id;
  const role = session.user.role;
  const [unreadNotifications, notifications] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, isRead: false },
      select: { id: true, actionUrl: true },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);
  const notificationRows = [...unreadNotifications, ...notifications];
  const ticketReferences = new Map<string, Set<string>>();
  for (const notification of notificationRows) {
    if (!notification.actionUrl) continue;
    const parsedUrl = new URL(notification.actionUrl, "http://internal.local");
    const openSheet = parsedUrl.searchParams.get("openSheet");
    const documentCode =
      parsedUrl.pathname.match(/^\/d\/([^/]+)$/)?.[1] ?? null;
    const reference = openSheet ?? documentCode;
    if (!reference) continue;
    const notificationIds = ticketReferences.get(reference) ?? new Set<string>();
    notificationIds.add(notification.id);
    ticketReferences.set(reference, notificationIds);
  }

  const references = [...ticketReferences.keys()];
  const [referencedTickets, referencedOrders] = references.length
    ? await Promise.all([
        prisma.ticket.findMany({
          where: {
            OR: [
              { id: { in: references } },
              { ticketNumber: { in: references } },
            ],
          },
          select: { id: true, ticketNumber: true, status: true },
        }),
        prisma.purchaseOrder.findMany({
          where: { publicCode: { in: references }, ticketId: { not: null } },
          select: {
            publicCode: true,
            ticket: { select: { status: true } },
          },
        }),
      ])
    : [[], []];

  const inactiveReferences = new Set<string>();
  const inactiveStatuses: TicketStatus[] = [
    TicketStatus.COMPLETED,
    TicketStatus.REJECTED,
  ];
  for (const ticket of referencedTickets) {
    if (inactiveStatuses.includes(ticket.status)) {
      inactiveReferences.add(ticket.id);
      inactiveReferences.add(ticket.ticketNumber);
    }
  }
  for (const order of referencedOrders) {
    if (order.ticket && inactiveStatuses.includes(order.ticket.status)) {
      inactiveReferences.add(order.publicCode);
    }
  }
  const hiddenNotificationIds = new Set<string>();
  for (const reference of inactiveReferences) {
    for (const notificationId of ticketReferences.get(reference) ?? []) {
      hiddenNotificationIds.add(notificationId);
    }
  }

  const activeUnreadNotifications = unreadNotifications.filter(
    (notification) => !hiddenNotificationIds.has(notification.id),
  );
  const visibleNotifications = notifications.filter(
    (notification) => !hiddenNotificationIds.has(notification.id),
  );
  const startsWith = (url: string | null, prefix: string) =>
    Boolean(url?.startsWith(prefix));
  const executiveCount = activeUnreadNotifications.filter((notification) =>
    startsWith(notification.actionUrl, "/apps/approvals"),
  ).length;
  const logisticsCount = activeUnreadNotifications.filter(
    (notification) =>
      startsWith(notification.actionUrl, "/apps/logistics") ||
      (role === UserRole.LOGISTICS &&
        startsWith(notification.actionUrl, "/d/")),
  ).length;
  const financeCount = activeUnreadNotifications.filter(
    (notification) =>
      startsWith(notification.actionUrl, "/apps/finance") ||
      (role === UserRole.FINANCE &&
        startsWith(notification.actionUrl, "/d/")),
  ).length;

  return NextResponse.json({
    unreadCount: activeUnreadNotifications.length,
    notifications: visibleNotifications,
    sidebarCounts: {
      executive: executiveCount,
      logistics: logisticsCount,
      finance: financeCount,
    },
  });
}
