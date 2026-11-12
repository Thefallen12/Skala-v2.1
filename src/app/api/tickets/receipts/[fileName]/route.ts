import {
  DOStatus,
  PaymentStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import {
  createCloudinaryPrivatePdfDownloadUrl,
  isCloudinaryPrivateTicketReceiptPdf,
} from "@/lib/cloudinary-private-pdfs";
import { readTicketReceipt } from "@/lib/ticket-receipts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { fileName } = await params;
  const requestUrl = new URL(request.url);
  const cloudinaryPdfUrl = requestUrl.searchParams.get("url");
  if (cloudinaryPdfUrl && !isCloudinaryPrivateTicketReceiptPdf(cloudinaryPdfUrl)) {
    return new Response("Not found", { status: 404 });
  }
  const receiptUrl =
    cloudinaryPdfUrl ?? `/api/tickets/receipts/${fileName}`;
  const [ticket, deliveryOrder, vehicleFuelRequest, payment] = await Promise.all([
    prisma.ticket.findFirst({
      where: {
        OR: [
          { purchaseReceiptUrl: receiptUrl },
          { transferReceiptUrl: receiptUrl },
          { deliveryReceiptUrl: receiptUrl },
          { deliveryOrderReceiptUrl: receiptUrl },
        ],
      },
      select: {
        requesterId: true,
        moverAssigneeId: true,
        type: true,
        status: true,
        purchaseReceiptUrl: true,
        transferReceiptUrl: true,
        deliveryReceiptUrl: true,
        deliveryOrderReceiptUrl: true,
      },
    }),
    prisma.deliveryOrder.findFirst({
      where: {
        OR: [
          { deliveryReceiptUrl: receiptUrl },
          { receiptPhotos: { some: { url: receiptUrl } } },
        ],
      },
      select: {
        status: true,
        driverName: true,
        ticket: {
          select: {
            requesterId: true,
            moverAssigneeId: true,
            type: true,
            status: true,
          },
        },
      },
    }),
    prisma.vehicleFuelRequest.findFirst({
      where: {
        OR: [
          { beforeFillingPhotoUrl: receiptUrl },
          { afterFillingPhotoUrl: receiptUrl },
          { receiptPhotoUrl: receiptUrl },
          { transferProofUrl: receiptUrl },
        ],
      },
      select: { requestedById: true },
    }),
    prisma.paymentTransaction.findFirst({
      where: {
        OR: [
          { proofOfTransferUrl: receiptUrl },
          { additionalProofUrls: { has: receiptUrl } },
        ],
        status: PaymentStatus.PAID,
      },
      select: {
        ticket: {
          select: {
            requesterId: true,
            moverAssigneeId: true,
            type: true,
            status: true,
          },
        },
        po: {
          select: {
            ticket: {
              select: {
                requesterId: true,
                moverAssigneeId: true,
                type: true,
                status: true,
              },
            },
          },
        },
        directStockPurchase: {
          select: {
            createdById: true,
            ticket: {
              select: {
                requesterId: true,
                moverAssigneeId: true,
                type: true,
                status: true,
              },
            },
          },
        },
      },
    }),
  ]);
  if (!ticket && !deliveryOrder && !vehicleFuelRequest && !payment) {
    return new Response("Not found", { status: 404 });
  }

  const role = session.user.role;
  const paymentTicket =
    payment?.ticket ??
    payment?.po?.ticket ??
    payment?.directStockPurchase?.ticket ??
    null;
  const deliveryOrderIsVisibleToLogistics =
    role === UserRole.LOGISTICS &&
    deliveryOrder?.ticket?.type === TicketType.MATERIAL &&
    (deliveryOrder.ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      deliveryOrder.ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      deliveryOrder.ticket.status === TicketStatus.IN_TRANSIT ||
      deliveryOrder.ticket.status === TicketStatus.COMPLETED);
  const moverIsAssignedToDeliveryOrder =
    deliveryOrder?.ticket?.moverAssigneeId === session.user.id ||
    (Boolean(session.user.name) &&
      deliveryOrder?.driverName === session.user.name);
  const moverCanReadDeliveryOrder =
    role === UserRole.MOVER &&
    (deliveryOrder?.status === DOStatus.IN_TRANSIT ||
      deliveryOrder?.status === DOStatus.DELIVERED) &&
    moverIsAssignedToDeliveryOrder;
  const hasAccess =
    (ticket?.requesterId === session.user.id &&
      ticket.deliveryOrderReceiptUrl !== receiptUrl) ||
    (deliveryOrder?.ticket?.requesterId === session.user.id) ||
    paymentTicket?.requesterId === session.user.id ||
    payment?.directStockPurchase?.createdById === session.user.id ||
    ((role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR ||
      role === UserRole.ADMINISTRATIONS) &&
      Boolean(ticket || deliveryOrder || vehicleFuelRequest || payment)) ||
    (role === UserRole.FINANCE && Boolean(payment)) ||
    (role === UserRole.LOGISTICS && Boolean(payment?.directStockPurchase)) ||
    (role === UserRole.LOGISTICS &&
      ((ticket &&
        ticket.type === TicketType.MATERIAL &&
        (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
          ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
          ticket.status === TicketStatus.IN_TRANSIT ||
          ticket.status === TicketStatus.COMPLETED) &&
        (deliveryOrder !== null ||
          ticket.purchaseReceiptUrl === receiptUrl ||
          ticket.deliveryReceiptUrl === receiptUrl ||
          ticket.deliveryOrderReceiptUrl === receiptUrl)) ||
        (deliveryOrder &&
          deliveryOrder.ticket?.type === TicketType.MATERIAL &&
          (deliveryOrder.ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
            deliveryOrder.ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
            deliveryOrder.ticket.status === TicketStatus.IN_TRANSIT ||
            deliveryOrder.ticket.status === TicketStatus.COMPLETED)))) ||
    (role === UserRole.MOVER &&
      ((ticket &&
        ticket.type === TicketType.MATERIAL &&
        ticket.moverAssigneeId === session.user.id &&
        ticket.status === TicketStatus.COMPLETED &&
        (ticket.deliveryReceiptUrl === receiptUrl ||
          ticket.deliveryOrderReceiptUrl === receiptUrl)) ||
        moverCanReadDeliveryOrder)) ||
    (vehicleFuelRequest?.requestedById === session.user.id &&
      role === UserRole.MOVER) ||
    ((role === UserRole.FINANCE || role === UserRole.LOGISTICS) &&
      vehicleFuelRequest !== null) ||
    deliveryOrderIsVisibleToLogistics;
  if (!hasAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  if (cloudinaryPdfUrl) {
    try {
      const preview = requestUrl.searchParams.get("preview") === "1";
      return new Response(null, {
        status: 302,
        headers: {
          Location: createCloudinaryPrivatePdfDownloadUrl(
            cloudinaryPdfUrl,
            !preview,
          ),
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("Creating authorized Cloudinary PDF link failed:", error);
      return new Response("Unable to open receipt", { status: 502 });
    }
  }

  const receipt = await readTicketReceipt(fileName);
  if (!receipt) {
    return new Response("Not found", { status: 404 });
  }
  const preview =
    requestUrl.searchParams.get("preview") === "1" &&
    (receipt.contentType.startsWith("image/") ||
      receipt.contentType === "application/pdf");

  return new Response(Uint8Array.from(receipt.bytes), {
    headers: {
      "Content-Type": receipt.contentType,
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
