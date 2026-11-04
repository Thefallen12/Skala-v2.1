import { Prisma } from "@prisma/client";
import {
  TicketFieldCategory,
  TicketType,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalFromScaledInteger } from "@/lib/scaled-decimal";

export type ProjectPaidRealization = {
  total: Prisma.Decimal;
  material: Prisma.Decimal;
  labor: Prisma.Decimal;
  transport: Prisma.Decimal;
  operational: Prisma.Decimal;
};

export async function getPaidProjectTicketRealization(
  projectIds: string[],
): Promise<Map<string, ProjectPaidRealization>> {
  if (projectIds.length === 0) return new Map();

  const tickets = await prisma.ticket.findMany({
    where: {
      projectId: { in: projectIds },
      requester: {
        is: {
          role: { in: [UserRole.FIELD_TEAM, UserRole.KOORDINATOR] },
        },
      },
      OR: [
        { transferReceiptUrl: { not: null } },
        { purchaseOrders: { some: { paidAt: { not: null } } } },
      ],
    },
    select: {
      projectId: true,
      type: true,
      fieldCategory: true,
      totalAmount: true,
      transferReceiptUrl: true,
      purchaseOrders: {
        where: { paidAt: { not: null } },
        select: {
          items: { select: { totalPrice: true } },
        },
      },
      deliveryOrders: {
        select: {
          doNumber: true,
          po: { select: { paidAt: true } },
        },
      },
    },
  });
  const paidPurchaseOrderDeliveryNumbers = new Set(
    tickets.flatMap((ticket) =>
      ticket.deliveryOrders
        .filter((deliveryOrder) => Boolean(deliveryOrder.po?.paidAt))
        .map((deliveryOrder) => deliveryOrder.doNumber),
    ),
  );
  const stockMovements = await prisma.stockMovement.findMany({
    where: {
      projectId: { in: projectIds },
      type: "OUT",
    },
    select: {
      projectId: true,
      reference: true,
      quantity: true,
      totalCost: true,
      stockItem: { select: { unitPrice: true } },
    },
  });

  const totals = new Map<string, ProjectPaidRealization>();
  for (const ticket of tickets) {
    if (!ticket.projectId) continue;

    const paidOrders = ticket.purchaseOrders;
    const amount = paidOrders.length > 0
      ? paidOrders.reduce(
          (orderTotal, order) =>
            orderTotal.plus(
              order.items.reduce(
                (itemTotal, item) =>
                  itemTotal.plus(item.totalPrice),
                new Prisma.Decimal(0),
              ),
            ),
          new Prisma.Decimal(0),
        )
      : ticket.transferReceiptUrl && ticket.totalAmount
        ? decimalFromScaledInteger(ticket.totalAmount)
        : new Prisma.Decimal(0);

    const projectTotal = totals.get(ticket.projectId) ?? {
      total: new Prisma.Decimal(0),
      material: new Prisma.Decimal(0),
      labor: new Prisma.Decimal(0),
      transport: new Prisma.Decimal(0),
      operational: new Prisma.Decimal(0),
    };
    projectTotal.total = projectTotal.total.plus(amount);
    if (ticket.type === TicketType.MATERIAL) {
      projectTotal.material = projectTotal.material.plus(amount);
    } else if (ticket.fieldCategory === TicketFieldCategory.LABOR) {
      projectTotal.labor = projectTotal.labor.plus(amount);
    } else if (ticket.fieldCategory === TicketFieldCategory.HAULING) {
      projectTotal.transport = projectTotal.transport.plus(amount);
    } else {
      projectTotal.operational = projectTotal.operational.plus(amount);
    }
    totals.set(ticket.projectId, projectTotal);
  }

  for (const movement of stockMovements) {
    if (
      !movement.projectId ||
      (movement.reference &&
        paidPurchaseOrderDeliveryNumbers.has(movement.reference))
    ) {
      continue;
    }
    const unitPrice = movement.stockItem?.unitPrice
      ? decimalFromScaledInteger(movement.stockItem.unitPrice)
      : new Prisma.Decimal(0);
    const amount =
      (movement.totalCost
        ? decimalFromScaledInteger(movement.totalCost)
        : null) ??
      decimalFromScaledInteger(movement.quantity).mul(unitPrice).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
    const projectTotal = totals.get(movement.projectId) ?? {
      total: new Prisma.Decimal(0),
      material: new Prisma.Decimal(0),
      labor: new Prisma.Decimal(0),
      transport: new Prisma.Decimal(0),
      operational: new Prisma.Decimal(0),
    };
    projectTotal.total = projectTotal.total.plus(amount);
    projectTotal.material = projectTotal.material.plus(amount);
    totals.set(movement.projectId, projectTotal);
  }

  return totals;
}
