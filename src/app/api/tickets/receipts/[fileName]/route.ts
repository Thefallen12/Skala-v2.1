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
  if (!fileName || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    return new Response("Bad Request", { status: 400 });
  }
  const requestUrl = new URL(request.url);
  const cloudinaryPdfUrl = requestUrl.searchParams.get("url");
  if (cloudinaryPdfUrl && !isCloudinaryPrivateTicketReceiptPdf(cloudinaryPdfUrl)) {
    return new Response("Not found", { status: 404 });
  }
  const receiptUrl =
    cloudinaryPdfUrl ?? `/api/tickets/receipts/${fileName}`;
  const [
    ticket,
    deliveryOrder,
    vehicleFuelRequest,
    payment,
    cashflow,
    officeExpense,
    materialDelivery,
    subkonTermyn,
    subkonContract,
    vendorInvoicePayment,
    equipmentRental,
    purchaseOrder,
    directStockPurchase,
    invoice,
    orderConfirmation,
  ] = await Promise.all([
    prisma.ticket.findFirst({
      where: {
        OR: [
          { attachmentUrl: receiptUrl },
          { receiptUrls: { has: receiptUrl } },
          { paymentProofUrl: receiptUrl },
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
        attachmentUrl: true,
        receiptUrls: true,
        paymentProofUrl: true,
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
          { arrivalPhotoUrl: receiptUrl },
          { receiptPhotos: { some: { url: receiptUrl } } },
        ],
      },
      select: {
        status: true,
        driverName: true,
        receivedById: true,
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
      },
      select: {
        status: true,
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
    prisma.cashflow.findFirst({
      where: { proofUrl: receiptUrl },
      select: { id: true, recordedBy: true },
    }),
    prisma.officeExpense.findFirst({
      where: { proofUrls: { has: receiptUrl } },
      select: { id: true, recipientId: true, recordedBy: true },
    }),
    prisma.materialDelivery.findFirst({
      where: { proofUrl: receiptUrl },
      select: { id: true, receivedById: true, project: { select: { fieldPicId: true } } },
    }),
    prisma.subkonTermyn.findFirst({
      where: { paymentProofUrl: receiptUrl },
      select: { id: true, createdById: true },
    }),
    prisma.subkonContract.findFirst({
      where: { retentionReleaseProofUrl: receiptUrl },
      select: {
        id: true,
        createdById: true,
        project: { select: { fieldPicId: true } },
      },
    }),
    prisma.vendorInvoicePayment.findFirst({
      where: { proofOfTransferUrl: receiptUrl },
      select: { id: true, processedById: true },
    }),
    prisma.equipmentRental.findFirst({
      where: { proofOfPaymentUrl: receiptUrl },
      select: {
        id: true,
        createdById: true,
        billingSubmittedById: true,
        paidById: true,
      },
    }),
    prisma.purchaseOrder.findFirst({
      where: {
        OR: [{ paymentReceiptUrl: receiptUrl }, { vendorInvoiceUrl: receiptUrl }],
      },
      select: {
        id: true,
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
    }),
    prisma.directStockPurchase.findFirst({
      where: {
        OR: [
          { vendorInvoiceUrl: receiptUrl },
          { arrivalPhotoUrl: receiptUrl },
          { receivedPhotos: { has: receiptUrl } },
        ],
      },
      select: {
        id: true,
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
    }),
    prisma.invoice.findFirst({
      where: { documentUrl: receiptUrl },
      select: { id: true },
    }),
    prisma.orderConfirmation.findFirst({
      where: { proofOfTransferUrl: receiptUrl },
      select: { id: true, signedById: true, acknowledgedById: true },
    }),
  ]);
  if (
    !ticket &&
    !deliveryOrder &&
    !vehicleFuelRequest &&
    !payment &&
    !cashflow &&
    !officeExpense &&
    !materialDelivery &&
    !subkonTermyn &&
    !subkonContract &&
    !vendorInvoicePayment &&
    !equipmentRental &&
    !purchaseOrder &&
    !directStockPurchase &&
    !invoice &&
    !orderConfirmation
  ) {
    return new Response("Not found", { status: 404 });
  }

  const role = session.user.role;
  const canReadFinanceAsset =
    role === UserRole.FINANCE ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.ADMINISTRATIONS;
  const canReadLogisticsAsset =
    role === UserRole.LOGISTICS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.ADMINISTRATIONS;
  const paymentTicket =
    payment?.ticket ??
    payment?.po?.ticket ??
    payment?.directStockPurchase?.ticket ??
    null;
  const deliveryOrderIsVisibleToLogistics =
    role === UserRole.LOGISTICS &&
    deliveryOrder?.ticket?.type === TicketType.MATERIAL &&
    (deliveryOrder.ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      deliveryOrder.ticket.status === TicketStatus.PROCESSED_FINANCE ||
      deliveryOrder.ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      deliveryOrder.ticket.status === TicketStatus.IN_TRANSIT ||
      deliveryOrder.ticket.status === TicketStatus.COMPLETED);
  const moverIsAssignedToDeliveryOrder =
    deliveryOrder?.ticket?.moverAssigneeId === session.user.id ||
    deliveryOrder?.receivedById === session.user.id ||
    (!deliveryOrder?.ticket?.moverAssigneeId &&
      Boolean(session.user.name) &&
      deliveryOrder?.driverName === session.user.name);
  const moverCanReadDeliveryOrder =
    role === UserRole.MOVER &&
    (deliveryOrder?.status === DOStatus.IN_TRANSIT ||
      deliveryOrder?.status === DOStatus.DELIVERED) &&
    moverIsAssignedToDeliveryOrder;
  const hasAccess =
    (ticket?.requesterId === session.user.id &&
      ticket.deliveryOrderReceiptUrl !== receiptUrl) ||
    deliveryOrder?.ticket?.requesterId === session.user.id ||
    purchaseOrder?.ticket?.requesterId === session.user.id ||
    directStockPurchase?.ticket?.requesterId === session.user.id ||
    (payment?.status === PaymentStatus.PAID &&
      paymentTicket?.requesterId === session.user.id) ||
    (payment?.status === PaymentStatus.PAID &&
      payment?.directStockPurchase?.createdById === session.user.id) ||
    ((role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR ||
      role === UserRole.ADMINISTRATIONS) &&
      Boolean(deliveryOrder)) ||
    (canReadFinanceAsset &&
      Boolean(
        ticket ||
          vehicleFuelRequest ||
          payment ||
          purchaseOrder ||
          directStockPurchase ||
          invoice ||
          orderConfirmation,
      )) ||
    (canReadLogisticsAsset &&
      Boolean(
        purchaseOrder ||
          directStockPurchase ||
          invoice ||
          orderConfirmation ||
          payment?.directStockPurchase,
      )) ||
    (role === UserRole.LOGISTICS &&
      ((ticket &&
        ticket.type === TicketType.MATERIAL &&
        (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
          ticket.status === TicketStatus.PROCESSED_FINANCE ||
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
            deliveryOrder.ticket.status === TicketStatus.PROCESSED_FINANCE ||
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
    deliveryOrderIsVisibleToLogistics ||
    (Boolean(cashflow) &&
      (canReadFinanceAsset || cashflow?.recordedBy === session.user.id)) ||
    (Boolean(officeExpense) &&
      (canReadFinanceAsset ||
        officeExpense?.recipientId === session.user.id ||
        officeExpense?.recordedBy === session.user.id)) ||
    (Boolean(materialDelivery) &&
      (canReadFinanceAsset ||
        canReadLogisticsAsset ||
        materialDelivery?.receivedById === session.user.id ||
        materialDelivery?.project.fieldPicId === session.user.id)) ||
    (Boolean(subkonTermyn) &&
      (canReadFinanceAsset || subkonTermyn?.createdById === session.user.id)) ||
    (Boolean(subkonContract) &&
      (canReadFinanceAsset ||
        subkonContract?.createdById === session.user.id ||
        subkonContract?.project.fieldPicId === session.user.id)) ||
    (Boolean(vendorInvoicePayment) &&
      (canReadFinanceAsset ||
        canReadLogisticsAsset ||
        vendorInvoicePayment?.processedById === session.user.id)) ||
    (Boolean(equipmentRental) &&
      (canReadFinanceAsset ||
        canReadLogisticsAsset ||
        equipmentRental?.createdById === session.user.id ||
        equipmentRental?.billingSubmittedById === session.user.id ||
        equipmentRental?.paidById === session.user.id)) ||
    (Boolean(orderConfirmation) &&
      (orderConfirmation?.signedById === session.user.id ||
        orderConfirmation?.acknowledgedById === session.user.id));
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
