import { NextResponse } from "next/server";
import {
  POStatus,
  TicketStatus,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }
  const { id } = await params;
  if (!id || id.length > 64) {
    return NextResponse.json({ message: "ID notifikasi tidak valid." }, { status: 400 });
  }

  const notification = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
    select: { actionUrl: true },
  });
  if (!notification) {
    return NextResponse.json({ message: "Notifikasi tidak ditemukan." }, { status: 404 });
  }

  const updated = await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { isRead: true },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ message: "Notifikasi tidak ditemukan." }, { status: 404 });
  }

  let actionUrl = notification.actionUrl;
  const parsedActionUrl = actionUrl
    ? new URL(actionUrl, "http://internal.local")
    : null;
  const purchaseOrderCode =
    parsedActionUrl?.pathname.match(/^\/d\/([^/]+)$/)?.[1] ??
    parsedActionUrl?.searchParams.get("openSheet");
  if (purchaseOrderCode) {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        publicCode: purchaseOrderCode,
        status: POStatus.APPROVED,
        ticketId: { not: null },
      },
      select: {
        ticketId: true,
        ticket: {
          select: {
            status: true,
            purchaseReceiptUrl: true,
          },
        },
      },
    });
    if (purchaseOrder?.ticketId) {
      if (session.user.role === UserRole.LOGISTICS) {
        actionUrl = `/apps/logistics?tab=tickets&openSheet=${encodeURIComponent(purchaseOrder.ticketId)}`;
      } else if (session.user.role === UserRole.FINANCE) {
        const canPay =
          purchaseOrder.ticket?.status === TicketStatus.WAITING_FINANCE_PAYMENT &&
          Boolean(purchaseOrder.ticket.purchaseReceiptUrl);
        actionUrl = canPay
          ? `/apps/finance?tab=payments&openSheet=${encodeURIComponent(purchaseOrder.ticketId)}`
          : "/apps/finance?tab=payments";
      }
    }
  }

  return NextResponse.json({ success: true, actionUrl });
}
