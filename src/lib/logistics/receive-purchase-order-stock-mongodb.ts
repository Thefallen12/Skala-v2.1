import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ClientSession } from "mongoose";
import DocumentNumberSequence from "@/models/document-number-sequence";
import {
  StockItem,
  StockMovement,
  StockPurchase,
} from "@/models/finance-records";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";

type PurchaseOrderStockLine = {
  stockItemId?: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function nextStockPurchaseNumber(session: ClientSession): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sequence = await DocumentNumberSequence.findOneAndUpdate(
      { kind: "STOCK", year },
      {
        $inc: { value: 1 },
        $setOnInsert: { _id: randomUUID() },
      },
      { upsert: true, new: true, session },
    );
    if (!sequence) throw new Error("Nomor penerimaan stok gagal dibuat.");
    const number = `SPE-${new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(sequence.value)}/STOCK/${year}`;
    if (!(await StockPurchase.exists({ purchaseNumber: number }).session(session))) {
      return number;
    }
  }
  throw new Error("Nomor penerimaan stok unik tidak dapat dibuat.");
}

export async function receivePurchaseOrderStockMongo(
  session: ClientSession,
  input: {
    purchaseOrderId: string;
    poNumber: string;
    vendorName: string;
    projectId?: string | null;
    receivedById: string;
    notes: string;
    items: PurchaseOrderStockLine[];
  },
): Promise<void> {
  if (input.items.length === 0) {
    throw new Error("PO tidak memiliki rincian material untuk diterima ke stok.");
  }
  if (
    await StockPurchase.exists({ purchaseOrderId: input.purchaseOrderId }).session(
      session,
    )
  ) {
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
      let existing;
      if (orderItem.stockItemId) {
        existing = await StockItem.findById(orderItem.stockItemId)
          .select({
            _id: 1,
            name: 1,
            unit: 1,
            stockQuantity: 1,
            unitPrice: 1,
          })
          .session(session)
          .lean();
        if (!existing) {
          throw new Error(
            `Barang katalog "${normalizedName}" tidak ditemukan saat menerima PO.`,
          );
        }
      } else {
        const matches = await StockItem.find({
          name: new RegExp(`^${escapeRegex(normalizedName)}$`, "i"),
          unit: new RegExp(`^${escapeRegex(normalizedUnit)}$`, "i"),
        })
          .select({
            _id: 1,
            name: 1,
            unit: 1,
            stockQuantity: 1,
            unitPrice: 1,
          })
          .limit(2)
          .session(session)
          .lean();
        if (matches.length > 1) {
          throw new Error(
            `Barang "${normalizedName}" (${normalizedUnit}) memiliki data stok ganda; rapikan katalog terlebih dahulu.`,
          );
        }
        existing = matches[0];
        if (!existing) {
          const createdId = randomUUID();
          const created = await StockItem.create(
            [
              {
                _id: createdId,
                sku: `MAT-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
                name: normalizedName,
                category: "MATERIAL",
                unit: normalizedUnit,
                stockQuantity: BigInt(0),
                minimumStock: BigInt(0),
                unitPrice: BigInt(0),
              },
            ],
            { session },
          );
          existing = created[0].toObject();
        }
      }

      stockItem = {
        id: String(existing._id),
        name: existing.name,
        unit: existing.unit,
        stockQuantity: decimalFromScaledInteger(
          existing.stockQuantity ?? BigInt(0),
        ),
        unitPrice: decimalFromScaledInteger(existing.unitPrice ?? BigInt(0)),
      };
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
    const now = new Date();
    const stockUpdate = await StockItem.updateOne(
      { _id: stockItem.id },
      {
        $set: {
          stockQuantity: scaledIntegerFromDecimal(newQuantity),
          unitPrice: scaledIntegerFromDecimal(averageUnitPrice),
          updatedAt: now,
        },
      },
      { session },
    );
    if (stockUpdate.matchedCount !== 1) {
      throw new Error(`Barang katalog "${normalizedName}" tidak tersedia.`);
    }

    await StockPurchase.create(
      [
        {
          _id: randomUUID(),
          purchaseNumber: await nextStockPurchaseNumber(session),
          purchaseOrderId: input.purchaseOrderId,
          stockItemId: stockItem.id,
          quantity: scaledIntegerFromDecimal(quantity),
          unitPrice: scaledIntegerFromDecimal(unitPrice),
          supplierName: input.vendorName,
          reference: input.poNumber,
          notes: input.notes,
          createdById: input.receivedById,
          createdAt: now,
        },
      ],
      { session },
    );
    await StockMovement.create(
      [
        {
          _id: randomUUID(),
          projectId: input.projectId ?? null,
          stockItemId: stockItem.id,
          type: "IN",
          materialName: stockItem.name,
          quantity: scaledIntegerFromDecimal(quantity),
          unit: stockItem.unit,
          reference: input.poNumber,
          notes: input.notes,
          createdById: input.receivedById,
          occurredAt: now,
          createdAt: now,
        },
      ],
      { session },
    );
    stockItemsByKey.set(stockKey, {
      ...stockItem,
      stockQuantity: newQuantity,
      unitPrice: averageUnitPrice,
    });
  }
}
