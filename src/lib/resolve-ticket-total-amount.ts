import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

type ResolvablePurchaseOrder = {
  status: string;
  items: { totalPrice: number }[];
};

type ResolvableDirectStockPurchase = {
  totalAmount: bigint;
};

type ResolvableTicketItem = {
  stockItemId: string | null;
  itemName: string;
  quantity: number;
  estimatedCost: bigint | null;
};

export type ResolvableTicketAmountInput = {
  totalAmount: bigint | null;
  requestedAmount: number | null;
  purchaseOrders: ResolvablePurchaseOrder[];
  directStockPurchases: ResolvableDirectStockPurchase[];
  items: ResolvableTicketItem[];
};

export type StockPriceLookup = {
  byId: Map<string, number>;
  byNormalizedName: Map<string, number>;
};

export function createStockPriceLookup(
  stockItems: {
    id: string;
    name: string;
    unitPrice: bigint;
  }[],
): StockPriceLookup {
  const byId = new Map<string, number>();
  const byNormalizedName = new Map<string, number>();

  for (const item of stockItems) {
    const unitPrice = Number(decimalStringFromScaledInteger(item.unitPrice));
    byId.set(item.id, unitPrice);
    const normalizedName = item.name.trim().toLocaleLowerCase("id-ID");
    if (normalizedName && !byNormalizedName.has(normalizedName)) {
      byNormalizedName.set(normalizedName, unitPrice);
    }
  }

  return { byId, byNormalizedName };
}

/**
 * Resolves the estimated/actual IDR total of a ticket from active POs,
 * direct stock purchases, explicit ticket amounts, or item-level / stock catalog prices.
 */
export function resolveTicketTotalAmount(
  ticket: ResolvableTicketAmountInput,
  stockPriceLookup: StockPriceLookup,
): string | null {
  const activePoTotal = ticket.purchaseOrders
    .filter((po) => po.status !== "REJECTED")
    .reduce(
      (poSum, po) =>
        poSum + po.items.reduce((itemSum, item) => itemSum + item.totalPrice, 0),
      0,
    );
  if (activePoTotal > 0) return activePoTotal.toString();

  const directPurchaseTotal = ticket.directStockPurchases.reduce(
    (sum, purchase) =>
      sum + Number(decimalStringFromScaledInteger(purchase.totalAmount)),
    0,
  );
  if (directPurchaseTotal > 0) return directPurchaseTotal.toString();

  if (ticket.totalAmount !== null) {
    const scaled = decimalStringFromScaledInteger(ticket.totalAmount);
    if (Number(scaled) > 0) return scaled;
  }

  if (ticket.requestedAmount !== null && ticket.requestedAmount > 0) {
    return ticket.requestedAmount.toString();
  }

  const itemsEstimatedTotal = ticket.items.reduce((sum, item) => {
    let unitCost = 0;
    if (item.estimatedCost !== null) {
      unitCost = Number(decimalStringFromScaledInteger(item.estimatedCost));
    } else if (item.stockItemId) {
      unitCost = stockPriceLookup.byId.get(item.stockItemId) ?? 0;
    } else {
      unitCost =
        stockPriceLookup.byNormalizedName.get(
          item.itemName.trim().toLocaleLowerCase("id-ID"),
        ) ?? 0;
    }
    return sum + item.quantity * unitCost;
  }, 0);

  return itemsEstimatedTotal > 0
    ? Math.round(itemsEstimatedTotal).toString()
    : null;
}
