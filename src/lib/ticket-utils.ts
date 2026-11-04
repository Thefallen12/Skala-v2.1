import type { Prisma } from "@/generated/prisma/client";
import {
  DOStatus,
  FulfillmentStatus,
  TicketFulfillmentStatus,
  TicketStatus,
} from "@/generated/prisma/enums";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";

export async function syncTicketStatus(
  transaction: Prisma.TransactionClient,
  ticketId: string,
  requestedStatus?: TicketStatus,
): Promise<{ statusChanged: boolean }> {
  const ticket = await transaction.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: {
      status: true,
      fulfillmentStatus: true,
      items: {
        select: {
          status: true,
          doItemId: true,
        },
      },
    },
  });
  const items = ticket.items;
  const fulfillmentStatus =
    items.length > 0 && items.every((item) => item.status !== FulfillmentStatus.PENDING)
      ? TicketFulfillmentStatus.COMPLETED
      : items.some((item) => item.status !== FulfillmentStatus.PENDING)
        ? TicketFulfillmentStatus.PARTIALLY_FULFILLED
        : TicketFulfillmentStatus.PENDING;
  const allItemsHaveDeliveryOrders =
    items.length > 0 &&
    items.every(
      (item) =>
        item.status === FulfillmentStatus.PROCESSED_TO_DO &&
        item.doItemId !== null,
    );
  let nextStatus = ticket.status;

  if (
    ticket.status === TicketStatus.PROCESSED_LOGISTIC &&
    allItemsHaveDeliveryOrders &&
    requestedStatus &&
    requestedStatus !== TicketStatus.COMPLETED
  ) {
    nextStatus = requestedStatus;
  } else if (
    ticket.status === TicketStatus.ASSIGNED_TO_MOVER &&
    allItemsHaveDeliveryOrders &&
    requestedStatus === TicketStatus.IN_TRANSIT
  ) {
    nextStatus = TicketStatus.IN_TRANSIT;
  } else if (
    requestedStatus === TicketStatus.COMPLETED &&
    (ticket.status === TicketStatus.IN_TRANSIT ||
      ticket.status === TicketStatus.ASSIGNED_TO_MOVER) &&
    items.length > 0 &&
    items.every((item) => item.status === FulfillmentStatus.PROCESSED_TO_DO)
  ) {
    const deliveryOrders = await transaction.deliveryOrder.findMany({
      where: { ticketId },
      select: { status: true },
    });
    if (
      deliveryOrders.length > 0 &&
      deliveryOrders.every((deliveryOrder) => deliveryOrder.status === DOStatus.DELIVERED)
    ) {
      nextStatus = TicketStatus.COMPLETED;
    }
  }

  const statusChanged = nextStatus !== ticket.status;
  if (
    statusChanged ||
    fulfillmentStatus !== ticket.fulfillmentStatus
  ) {
    await transaction.ticket.update({
      where: { id: ticketId },
      data: {
        fulfillmentStatus,
        ...(statusChanged ? { status: nextStatus, updatedAt: new Date() } : {}),
      },
    });
  }
  return { statusChanged };
}

export async function lockTicketFulfillment(
  transaction: Prisma.TransactionClient,
  ticketId: string,
): Promise<void> {
  await acquireMongoTransactionLock(transaction, `ticket-fulfillment:${ticketId}`);
}
