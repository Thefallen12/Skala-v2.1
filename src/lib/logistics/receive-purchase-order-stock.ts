import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { nextDocumentNumber } from "@/lib/documents/numbering";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";

type PurchaseOrderStockLine = {
  stockItemId?: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: Prisma.Decimal | number;
};

export async function receivePurchaseOrderStock(
  transaction: PrismaTypes.TransactionClient,
  input: {
    purchaseOrderId: string;
    poNumber: string;
    vendorName: string;
    projectId?: string | null;
    receivedById: string;
    notes: string;
    items: PurchaseOrderStockLine[];
  },
) {
  if (input.items.length === 0) {
    throw new Error("PO tidak memiliki rincian material untuk diterima ke stok.");
  }
  await acquireMongoTransactionLock(
    transaction,
    `po-receipt:${input.purchaseOrderId}`,
  );
  const existingReceipt = await transaction.stockPurchase.findFirst({
    where: { purchaseOrderId: input.purchaseOrderId },
    select: { id: true },
  });
  if (existingReceipt) {
    return;
  }

  const stockItemsByKey = new Map<
    string,
    {
      id: string;
      name: string;
      unit: string;
      stockQuantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
    }
  >();

  for (const orderItem of input.items) {
    const normalizedName = orderItem.itemName.trim();
    const normalizedUnit = orderItem.unit.trim();
    const stockKey = orderItem.stockItemId
      ? `id:${orderItem.stockItemId}`
      : `name:${normalizedName.toLocaleLowerCase("id-ID")}\u0000${normalizedUnit.toLocaleLowerCase("id-ID")}`;
    let stockItem = stockItemsByKey.get(stockKey);
    if (!stockItem) {
      if (orderItem.stockItemId) {
        const foundStockItem = await transaction.stockItem.findUnique({
          where: { id: orderItem.stockItemId },
          select: {
            id: true,
            name: true,
            unit: true,
            stockQuantity: true,
            unitPrice: true,
          },
        });
        if (!foundStockItem) {
          throw new Error(
            `Barang katalog "${normalizedName}" tidak ditemukan saat menerima PO.`,
          );
        }
        stockItem = {
          ...foundStockItem,
          stockQuantity: decimalFromScaledInteger(foundStockItem.stockQuantity),
          unitPrice: decimalFromScaledInteger(foundStockItem.unitPrice),
        };
      } else {
        const advisoryLockKey = JSON.stringify([
          normalizedName.toLocaleLowerCase("id-ID"),
          normalizedUnit.toLocaleLowerCase("id-ID"),
        ]);
        await acquireMongoTransactionLock(
          transaction,
          `stock-item:${advisoryLockKey}`,
        );
        const matches = await transaction.stockItem.findMany({
          where: {
            name: { equals: normalizedName, mode: "insensitive" },
            unit: { equals: normalizedUnit, mode: "insensitive" },
          },
          select: {
            id: true,
            name: true,
            unit: true,
            stockQuantity: true,
            unitPrice: true,
          },
          take: 2,
        });
        if (matches.length > 1) {
          throw new Error(
            `Barang "${normalizedName}" (${normalizedUnit}) memiliki data stok ganda; rapikan katalog terlebih dahulu.`,
          );
        }
        if (matches[0]) {
          stockItem = {
            ...matches[0],
            stockQuantity: decimalFromScaledInteger(matches[0].stockQuantity),
            unitPrice: decimalFromScaledInteger(matches[0].unitPrice),
          };
        } else {
          const created = await transaction.stockItem.create({
            data: {
              sku: `MAT-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
              name: normalizedName,
              unit: normalizedUnit,
              stockQuantity: BigInt(0),
              unitPrice: BigInt(0),
            },
            select: {
              id: true,
              name: true,
              unit: true,
              stockQuantity: true,
              unitPrice: true,
            },
          });
          stockItem = {
            ...created,
            stockQuantity: decimalFromScaledInteger(created.stockQuantity),
            unitPrice: decimalFromScaledInteger(created.unitPrice),
          };
        }
      }
    }
    if (!stockItem) {
      throw new Error(`Barang katalog "${normalizedName}" tidak tersedia.`);
    }

    const quantity = new Prisma.Decimal(orderItem.quantity);
    const unitPrice = new Prisma.Decimal(orderItem.unitPrice);
    const newQuantity = stockItem.stockQuantity.plus(quantity);
    const averageUnitPrice = stockItem.stockQuantity
      .mul(stockItem.unitPrice)
      .plus(quantity.mul(unitPrice))
      .div(newQuantity)
      .toDecimalPlaces(2);
    await transaction.stockItem.update({
      where: { id: stockItem.id },
      data: {
        stockQuantity: scaledIntegerFromDecimal(newQuantity),
        unitPrice: scaledIntegerFromDecimal(averageUnitPrice),
      },
    });
    await transaction.stockPurchase.create({
      data: {
        purchaseNumber: await nextDocumentNumber(transaction, "STOCK"),
        purchaseOrderId: input.purchaseOrderId,
        stockItemId: stockItem.id,
        quantity: scaledIntegerFromDecimal(quantity),
        unitPrice: scaledIntegerFromDecimal(unitPrice),
        supplierName: input.vendorName,
        reference: input.poNumber,
        notes: input.notes,
        createdById: input.receivedById,
      },
    });
    await transaction.stockMovement.create({
      data: {
        projectId: input.projectId ?? null,
        stockItemId: stockItem.id,
        type: "IN",
        materialName: stockItem.name,
        quantity: scaledIntegerFromDecimal(quantity),
        unit: stockItem.unit,
        reference: input.poNumber,
        notes: input.notes,
        createdById: input.receivedById,
      },
    });
    stockItemsByKey.set(stockKey, {
      ...stockItem,
      stockQuantity: newQuantity,
      unitPrice: averageUnitPrice,
    });
  }
}
