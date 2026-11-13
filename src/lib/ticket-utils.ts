import type { Prisma } from "@prisma/client";
import {
  DOStatus,
  FulfillmentStatus,
  TicketFulfillmentStatus,
  TicketRequestCategory,
  TicketStatus,
} from "@prisma/client";
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
      requestCategory: true,
      items: {
        select: {
          status: true,
          doItemId: true,
        },
      },
    },
  });
  const items = ticket.items;
  const isShippingCostTicket =
    items.length === 0 &&
    ticket.requestCategory === TicketRequestCategory.SHIPPING_COST;

  const needsDeliveryOrders =
    isShippingCostTicket || requestedStatus === TicketStatus.COMPLETED;
  const deliveryOrders = needsDeliveryOrders
    ? await transaction.deliveryOrder.findMany({
        where: { ticketId },
        select: { status: true },
      })
    : [];

  const allItemsHaveDeliveryOrders = isShippingCostTicket
    ? deliveryOrders.length > 0
    : items.length > 0 &&
      items.every(
        (item) =>
          item.status === FulfillmentStatus.PROCESSED_TO_DO &&
          item.doItemId !== null,
      );
  const allItemsProcessedToDo = isShippingCostTicket
    ? deliveryOrders.length > 0
    : items.length > 0 &&
      items.every((item) => item.status === FulfillmentStatus.PROCESSED_TO_DO);

  let nextStatus = ticket.status;

  if (
    (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.PROCESSED_FINANCE) &&
    allItemsHaveDeliveryOrders &&
    (requestedStatus === TicketStatus.ASSIGNED_TO_MOVER ||
      requestedStatus === TicketStatus.IN_TRANSIT)
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
      ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.PROCESSED_FINANCE) &&
    allItemsProcessedToDo
  ) {
    if (
      deliveryOrders.length > 0 &&
      deliveryOrders.every(
        (deliveryOrder) => deliveryOrder.status === DOStatus.DELIVERED,
      )
    ) {
      nextStatus = TicketStatus.COMPLETED;
    }
  }

  const fulfillmentStatus = isShippingCostTicket
    ? nextStatus === TicketStatus.COMPLETED
      ? TicketFulfillmentStatus.COMPLETED
      : deliveryOrders.length > 0
        ? TicketFulfillmentStatus.PARTIALLY_FULFILLED
        : TicketFulfillmentStatus.PENDING
    : allItemsProcessedToDo
      ? TicketFulfillmentStatus.COMPLETED
      : items.some((item) => item.status !== FulfillmentStatus.PENDING)
        ? TicketFulfillmentStatus.PARTIALLY_FULFILLED
        : TicketFulfillmentStatus.PENDING;

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

export const normalizeTicketStockValue = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

export const ticketStockItemKey = (itemName: string, unit: string) =>
  `${normalizeTicketStockValue(itemName)}\u0000${normalizeTicketStockValue(unit)}`;

export type ActiveDirectPurchaseLookup = {
  byStockItemId: Map<string, string>;
  byItemKey: Map<string, string>;
};

export function buildActiveDirectPurchaseLookup(
  purchases: Array<{
    purchaseNumber: string;
    items: Array<{
      stockItemId?: string | null;
      itemName: string;
      unit: string;
    }>;
  }>,
): ActiveDirectPurchaseLookup {
  const byStockItemId = new Map<string, string>();
  const byItemKey = new Map<string, string>();
  for (const purchase of purchases) {
    for (const item of purchase.items) {
      if (item.stockItemId && !byStockItemId.has(item.stockItemId)) {
        byStockItemId.set(item.stockItemId, purchase.purchaseNumber);
      }
      const key = ticketStockItemKey(item.itemName, item.unit);
      if (!byItemKey.has(key)) {
        byItemKey.set(key, purchase.purchaseNumber);
      }
    }
  }
  return { byStockItemId, byItemKey };
}

export function findActiveDirectPurchaseNumber(
  lookup: ActiveDirectPurchaseLookup,
  item: { stockItemId?: string | null; itemName: string; unit: string },
): string | undefined {
  return (
    (item.stockItemId ? lookup.byStockItemId.get(item.stockItemId) : undefined) ??
    lookup.byItemKey.get(ticketStockItemKey(item.itemName, item.unit))
  );
}
