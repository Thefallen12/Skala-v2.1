import {
  POStatus,
  Prisma,
  StockMovementType,
  TicketFieldCategory,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  VendorInvoiceStatus,
} from "@prisma/client";
import { connectToMongoDBOptional } from "@/lib/mongoose";
import DirectStockPurchase from "@/models/direct-stock-purchase";
import {
  DeliveryOrder,
  EquipmentRental,
  MaterialContract,
  MaterialDelivery,
  POItem,
  ProjectMaterialPlan,
  StockItem,
  StockMovement,
  TicketItem,
  VendorInvoice,
} from "@/models/finance-records";
import PaymentTransaction from "@/models/payment-transaction";
import PurchaseOrder from "@/models/purchase-order";
import Ticket from "@/models/ticket";
import TicketAuditLog from "@/models/ticket-audit-log";
import User from "@/models/user";
import { decimalFromScaledInteger } from "@/lib/scaled-decimal";

export type ProjectFundCategory =
  | "TUKANG"
  | "BAHAN"
  | "SEWA"
  | "INVENTARIS"
  | "OPERASIONAL";

export type ProjectTicketSummaryItem = {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  amount: string | null;
  paid: boolean;
  paidAt: string | null;
  requesterName: string;
  type: TicketType;
  ticketType?: string | null;
  requestCategory: TicketRequestCategory | null;
  fieldCategory: TicketFieldCategory | null;
  fundCategory: ProjectFundCategory;
  createdAt: string;
  items: Array<{
    itemName: string;
    quantity: number;
    unit: string;
    estimatedCost: string | null;
  }>;
};

export type PaidProjectTicketRealization = {
  total: Prisma.Decimal;
  material: Prisma.Decimal;
  labor: Prisma.Decimal;
  transport: Prisma.Decimal;
  operational: Prisma.Decimal;
  rental: Prisma.Decimal;
  requestedTotal: Prisma.Decimal;
  requestedMaterial: Prisma.Decimal;
  requestedLabor: Prisma.Decimal;
  requestedOperational: Prisma.Decimal;
  requestedRental: Prisma.Decimal;
  tickets: ProjectTicketSummaryItem[];
};

const zero = new Prisma.Decimal(0);

function toBigIntOrNull(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

function toDateOrNow(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function cleanCatalogName(value: string): string {
  return value
    .toLowerCase()
    .replace(/½/g, "1/2")
    .replace(/1[,.]5/g, "1/2")
    .replace(/[\/,\-_x×]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEWA_RENTAL_TEXT_PATTERN =
  /rumah\s*sewa|mess\s*(tukang|pekerja|proyek)?|kontrakan|basecamp|kendaraan\s*sewa|sewa\s*(rumah|mess|kos|kendaraan|armada|alat|truk|truck|mobil|pickup|excavator|molen|genset|stamper)|\bsewa\b/i;

export function classifyServerTicketCategory(input: {
  title: string;
  itemNames: string[];
  type: TicketType | string;
  ticketType?: string | null;
  requestCategory: TicketRequestCategory | string | null;
  fieldCategory: TicketFieldCategory | string | null;
  fundCategory?: ProjectFundCategory | null;
}): ProjectFundCategory {
  const text = `${input.title} ${input.itemNames.join(" ")}`.toLowerCase();
  const reqCat = (input.requestCategory || "").toUpperCase();
  const fieldCat = (input.fieldCategory || "").toUpperCase();
  const type = (input.type || "").toUpperCase();
  const ticketType = (input.ticketType || "").toUpperCase();

  // 1. Aturan SEWA wajib dievaluasi SEBELUM regex TUKANG & INVENTARIS
  //    agar "Rumah Sewa Tukang" / "Mess Tukang" / "Sewa Kendaraan" tidak salah masuk TUKANG/INVENTARIS
  if (
    input.fundCategory === "SEWA" ||
    reqCat === "HOUSE_RENTAL" ||
    reqCat === "VEHICLE_RENTAL" ||
    reqCat === "EQUIPMENT_REQUEST" ||
    fieldCat === "HOUSE_RENTAL" ||
    fieldCat === "VEHICLE_RENTAL" ||
    fieldCat === "RENTAL" ||
    ticketType === "EQUIPMENT_REQUEST" ||
    ticketType === "HOUSE_RENTAL" ||
    ticketType === "VEHICLE_RENTAL" ||
    SEWA_RENTAL_TEXT_PATTERN.test(text)
  ) {
    return "SEWA";
  }

  // Upah Langsir (HAULING) dipisahkan ke Operasional/Transportasi Lapangan
  if (fieldCat === "HAULING" || /langsir/.test(text)) {
    return "OPERASIONAL";
  }

  if (
    fieldCat === "LABOR" ||
    reqCat === "KASBON" ||
    /tukang|mandor|upah|kasbon|gaji|ambilan|tenaga|pekerja|borongan|ongkos/.test(
      text,
    )
  ) {
    return "TUKANG";
  }

  if (
    /inventaris|alat|mesin|genset|molen|peralatan|perkakas|gerobak|scaffolding|helm|rompi|cangkul|meteran|equipment|aset/.test(
      text,
    )
  ) {
    return "INVENTARIS";
  }

  if (
    type === "MATERIAL" ||
    reqCat === "MATERIAL" ||
    reqCat === "WAREHOUSE" ||
    reqCat === "STOCK" ||
    reqCat === "NEW_PURCHASE" ||
    reqCat === "MATERIAL_CONTRACT" ||
    fieldCat === "MATERIAL" ||
    fieldCat === "DIRECT_STORE" ||
    /bahan|material|semen|pasir|batu|besi|cat|keramik|kayu|paku|pipa|bata|toko|triplek|baut|seng/.test(
      text,
    )
  ) {
    return "BAHAN";
  }

  return "OPERASIONAL";
}

export async function getPaidProjectTicketRealization(
  projectIds: string[],
): Promise<Map<string, PaidProjectTicketRealization>> {
  const ids = [...new Set(projectIds.filter(Boolean))];
  const result = new Map<string, PaidProjectTicketRealization>(
    ids.map((id) => [
      id,
      {
        total: zero,
        material: zero,
        labor: zero,
        transport: zero,
        operational: zero,
        rental: zero,
        requestedTotal: zero,
        requestedMaterial: zero,
        requestedLabor: zero,
        requestedOperational: zero,
        requestedRental: zero,
        tickets: [],
      },
    ]),
  );
  if (ids.length === 0) return result;

  const mongo = await connectToMongoDBOptional();
  if (!mongo) return result;

  const [
    ticketRows,
    projectRentals,
    projectStockMovements,
    catalogStockItems,
    materialContracts,
    projectMaterialPlans,
  ] = await Promise.all([
    Ticket.find({
      projectId: { $in: ids },
      status: { $ne: TicketStatus.REJECTED },
    })
      .sort({ createdAt: -1 })
      .lean(),
    EquipmentRental.find({
      projectId: { $in: ids },
      status: { $ne: "CANCELLED" },
      $or: [{ type: "HOUSE" }, { usageScope: { $ne: "OPERATIONAL" } }],
    })
      .sort({ startDate: -1, createdAt: -1 })
      .lean(),
    StockMovement.find({
      projectId: { $in: ids },
      type: StockMovementType.OUT,
    }).lean(),
    StockItem.find().select({ _id: 1, name: 1, unitPrice: 1 }).lean(),
    MaterialContract.find()
      .select({
        _id: 1,
        contractNumber: 1,
        materialType: 1,
        vendorName: 1,
        unit: 1,
        unitPrice: 1,
      })
      .lean(),
    ProjectMaterialPlan.find({ projectId: { $in: ids } })
      .select({ projectId: 1, materialName: 1, unitPrice: 1 })
      .lean(),
  ]);

  const ticketIds = ticketRows.map((t) => String(t._id));
  const requesterIds = [
    ...new Set(
      ticketRows
        .map((t) => t.requesterId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [
    users,
    ticketItems,
    purchaseOrders,
    deliveryOrders,
    directPurchases,
    paymentTxs,
    allMaterialDeliveries,
    auditLogs,
  ] = await Promise.all([
    requesterIds.length
      ? User.find({ _id: { $in: requesterIds } })
          .select({ _id: 1, name: 1 })
          .lean()
      : Promise.resolve([]),
    ticketIds.length
      ? TicketItem.find({ ticketId: { $in: ticketIds } }).lean()
      : Promise.resolve([]),
    ticketIds.length
      ? PurchaseOrder.find({
          ticketId: { $in: ticketIds },
          status: { $ne: POStatus.CANCELLED },
        }).lean()
      : Promise.resolve([]),
    ticketIds.length
      ? DeliveryOrder.find({ ticketId: { $in: ticketIds } })
          .select({ ticketId: 1, doNumber: 1 })
          .lean()
      : Promise.resolve([]),
    ticketIds.length
      ? DirectStockPurchase.find({ ticketId: { $in: ticketIds } }).lean()
      : Promise.resolve([]),
    ticketIds.length
      ? PaymentTransaction.find({ ticketId: { $in: ticketIds } })
          .sort({ paidAt: -1 })
          .lean()
      : Promise.resolve([]),
    MaterialDelivery.find({
      $or: [
        { projectId: { $in: ids } },
        ...(ticketIds.length ? [{ ticketId: { $in: ticketIds } }] : []),
      ],
    }).lean(),
    ticketIds.length
      ? TicketAuditLog.find({
          ticketId: { $in: ticketIds },
          action: "FINANCE_PAYMENT_COMPLETED",
        })
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const poIds = purchaseOrders.map((po) => String(po._id));
  const invoiceIds = [
    ...new Set(
      allMaterialDeliveries
        .map((md) => md.vendorInvoiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [poItems, vendorInvoices] = await Promise.all([
    poIds.length
      ? POItem.find({ poId: { $in: poIds } }).lean()
      : Promise.resolve([]),
    invoiceIds.length
      ? VendorInvoice.find({ _id: { $in: invoiceIds } })
          .select({ _id: 1, status: 1, paidAt: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const userById = new Map(users.map((u) => [String(u._id), u]));
  const stockItemById = new Map(
    catalogStockItems.map((s) => [String(s._id), s]),
  );
  const contractById = new Map(
    materialContracts.map((c) => [String(c._id), c]),
  );
  const poItemById = new Map(poItems.map((pi) => [String(pi._id), pi]));
  const invoiceById = new Map(vendorInvoices.map((vi) => [String(vi._id), vi]));

  const itemsByTicketId = new Map<string, typeof ticketItems>();
  for (const item of ticketItems) {
    if (!item.ticketId) continue;
    const list = itemsByTicketId.get(item.ticketId) ?? [];
    list.push(item);
    itemsByTicketId.set(item.ticketId, list);
  }

  const poItemsByPoId = new Map<string, typeof poItems>();
  for (const item of poItems) {
    if (!item.poId) continue;
    const list = poItemsByPoId.get(item.poId) ?? [];
    list.push(item);
    poItemsByPoId.set(item.poId, list);
  }

  const posByTicketId = new Map<string, typeof purchaseOrders>();
  for (const po of purchaseOrders) {
    if (!po.ticketId) continue;
    const list = posByTicketId.get(po.ticketId) ?? [];
    list.push(po);
    posByTicketId.set(po.ticketId, list);
  }

  const dosByTicketId = new Map<string, typeof deliveryOrders>();
  for (const doDoc of deliveryOrders) {
    if (!doDoc.ticketId) continue;
    const list = dosByTicketId.get(doDoc.ticketId) ?? [];
    list.push(doDoc);
    dosByTicketId.set(doDoc.ticketId, list);
  }

  const directPurchasesByTicketId = new Map<string, typeof directPurchases>();
  for (const dp of directPurchases) {
    if (!dp.ticketId) continue;
    const list = directPurchasesByTicketId.get(dp.ticketId) ?? [];
    list.push(dp);
    directPurchasesByTicketId.set(dp.ticketId, list);
  }

  const paymentTxsByTicketId = new Map<string, typeof paymentTxs>();
  for (const tx of paymentTxs) {
    if (!tx.ticketId) continue;
    const list = paymentTxsByTicketId.get(tx.ticketId) ?? [];
    list.push(tx);
    paymentTxsByTicketId.set(tx.ticketId, list);
  }

  const deliveriesByTicketId = new Map<string, typeof allMaterialDeliveries>();
  const standaloneMaterialDeliveries: typeof allMaterialDeliveries = [];
  for (const md of allMaterialDeliveries) {
    if (md.ticketId) {
      const list = deliveriesByTicketId.get(md.ticketId) ?? [];
      list.push(md);
      deliveriesByTicketId.set(md.ticketId, list);
    } else if (md.projectId && ids.includes(md.projectId)) {
      standaloneMaterialDeliveries.push(md);
    }
  }

  const latestAuditByTicketId = new Map<string, (typeof auditLogs)[number]>();
  for (const log of auditLogs) {
    if (!log.ticketId || latestAuditByTicketId.has(log.ticketId)) continue;
    latestAuditByTicketId.set(log.ticketId, log);
  }

  const normalizedCatalog = catalogStockItems
    .map((s) => {
      const rawPrice = toBigIntOrNull(s.unitPrice);
      return {
        rawName: (s.name ?? "").trim().toLowerCase(),
        cleanName: cleanCatalogName(s.name ?? ""),
        unitPrice:
          rawPrice !== null && rawPrice > BigInt(0)
            ? decimalFromScaledInteger(rawPrice)
            : zero,
      };
    })
    .filter((s) => s.cleanName.length > 0 && s.unitPrice.greaterThan(0));

  const normalizedContracts = materialContracts
    .map((mc) => ({
      cleanType: cleanCatalogName(mc.materialType ?? ""),
      cleanFull: cleanCatalogName(
        `${mc.materialType ?? ""} ${mc.vendorName ?? ""}`,
      ),
      unitPrice:
        mc.unitPrice && mc.unitPrice > 0
          ? new Prisma.Decimal(mc.unitPrice)
          : zero,
    }))
    .filter((mc) => mc.unitPrice.greaterThan(0));

  const normalizedMaterialPlans = projectMaterialPlans
    .map((mp) => {
      const rawPrice = toBigIntOrNull(mp.unitPrice);
      return {
        projectId: mp.projectId ?? "",
        cleanName: cleanCatalogName(mp.materialName ?? ""),
        unitPrice:
          rawPrice !== null && rawPrice > BigInt(0)
            ? decimalFromScaledInteger(rawPrice)
            : zero,
      };
    })
    .filter((mp) => mp.cleanName.length > 0 && mp.unitPrice.greaterThan(0));

  const findCatalogUnitPrice = (
    itemName: string,
    projectId?: string | null,
  ): Prisma.Decimal => {
    const rawTarget = itemName.trim().toLowerCase();
    const cleanTarget = cleanCatalogName(itemName);
    const baseSegment = itemName.split("/")[0]?.trim() ?? itemName;
    const baseTarget = cleanCatalogName(baseSegment);
    if (!cleanTarget) return zero;

    const contractExact = normalizedContracts.find(
      (mc) =>
        mc.cleanFull === cleanTarget ||
        cleanTarget.includes(mc.cleanFull) ||
        mc.cleanType === cleanTarget ||
        (baseTarget.length >= 3 && mc.cleanType === baseTarget),
    );
    if (contractExact && itemName.includes("/")) {
      return contractExact.unitPrice;
    }

    const matchedStock = normalizedCatalog.find((s) => {
      if (s.rawName === rawTarget || s.cleanName === cleanTarget) return true;
      return (
        s.cleanName.includes(cleanTarget) || cleanTarget.includes(s.cleanName)
      );
    });
    if (matchedStock) return matchedStock.unitPrice;

    if (projectId) {
      const matchedPlan = normalizedMaterialPlans.find(
        (mp) =>
          mp.projectId === projectId &&
          (mp.cleanName === cleanTarget ||
            mp.cleanName.includes(cleanTarget) ||
            cleanTarget.includes(mp.cleanName) ||
            (baseTarget.length >= 3 &&
              (mp.cleanName === baseTarget ||
                mp.cleanName.includes(baseTarget)))),
      );
      if (matchedPlan) return matchedPlan.unitPrice;
    }

    if (contractExact) return contractExact.unitPrice;

    if (baseTarget && baseTarget.length >= 3 && baseTarget !== cleanTarget) {
      const matchedBaseStock = normalizedCatalog.find(
        (s) =>
          s.cleanName === baseTarget ||
          s.cleanName.includes(baseTarget) ||
          baseTarget.includes(s.cleanName),
      );
      if (matchedBaseStock) return matchedBaseStock.unitPrice;
    }

    return zero;
  };

  for (const ticket of ticketRows) {
    const ticketId = String(ticket._id);
    if (!ticket.projectId) continue;
    const current = result.get(ticket.projectId);
    if (!current) continue;

    const tItems = itemsByTicketId.get(ticketId) ?? [];
    const tPos = posByTicketId.get(ticketId) ?? [];
    const tDirectPurchases = directPurchasesByTicketId.get(ticketId) ?? [];
    const tPaymentTxs = paymentTxsByTicketId.get(ticketId) ?? [];
    const tDeliveries = deliveriesByTicketId.get(ticketId) ?? [];
    const latestAudit = latestAuditByTicketId.get(ticketId);
    const requester = userById.get(ticket.requesterId);

    const paymentTxTotal = tPaymentTxs.reduce(
      (sum, tx) => sum.plus(new Prisma.Decimal(tx.amount || 0)),
      zero,
    );

    const poTotal = tPos.reduce((orderSum, order) => {
      const orderItems = poItemsByPoId.get(String(order._id)) ?? [];
      const itemsSum = orderItems.reduce((itemSum, item) => {
        const totalP = item.totalPrice ?? 0;
        const unitP = item.unitPrice ?? 0;
        const qty = item.quantity ?? 0;
        const lineAmount =
          totalP > 0
            ? new Prisma.Decimal(totalP)
            : new Prisma.Decimal(unitP).times(qty);
        return itemSum.plus(lineAmount);
      }, zero);
      return orderSum.plus(itemsSum);
    }, zero);

    const paidPoTotal = tPos
      .filter((order) => order.paidAt !== null && order.paidAt !== undefined)
      .reduce((orderSum, order) => {
        const orderItems = poItemsByPoId.get(String(order._id)) ?? [];
        const itemsSum = orderItems.reduce((itemSum, item) => {
          const totalP = item.totalPrice ?? 0;
          const unitP = item.unitPrice ?? 0;
          const qty = item.quantity ?? 0;
          const lineAmount =
            totalP > 0
              ? new Prisma.Decimal(totalP)
              : new Prisma.Decimal(unitP).times(qty);
          return itemSum.plus(lineAmount);
        }, zero);
        return orderSum.plus(itemsSum);
      }, zero);

    const directPurchaseTotal = tDirectPurchases.reduce((sum, dp) => {
      const rawTotal = toBigIntOrNull(dp.totalAmount);
      return rawTotal !== null && rawTotal > BigInt(0)
        ? sum.plus(decimalFromScaledInteger(rawTotal))
        : sum;
    }, zero);

    const materialDeliveryTotal = tDeliveries.reduce((sum, md) => {
      const contract = md.contractId ? contractById.get(md.contractId) : null;
      return sum.plus(
        new Prisma.Decimal(md.quantityReceived || 0).times(
          contract?.unitPrice || 0,
        ),
      );
    }, zero);

    let itemsFallbackSum = zero;
    for (const item of tItems) {
      const itemName = item.itemName ?? "";
      const catalogUnitPrice = findCatalogUnitPrice(itemName, ticket.projectId);
      const poItem = item.poItemId ? poItemById.get(item.poItemId) : null;
      const matContract = item.materialContractId
        ? contractById.get(item.materialContractId)
        : null;
      const stockItem = item.stockItemId
        ? stockItemById.get(item.stockItemId)
        : null;
      const rawEstCost = toBigIntOrNull(item.estimatedCost);
      const rawStockPrice = toBigIntOrNull(stockItem?.unitPrice);

      const unitCost =
        poItem?.unitPrice && poItem.unitPrice > 0
          ? new Prisma.Decimal(poItem.unitPrice)
          : matContract?.unitPrice && matContract.unitPrice > 0
            ? new Prisma.Decimal(matContract.unitPrice)
            : rawEstCost !== null && rawEstCost > BigInt(0)
              ? decimalFromScaledInteger(rawEstCost)
              : rawStockPrice !== null && rawStockPrice > BigInt(0)
                ? decimalFromScaledInteger(rawStockPrice)
                : catalogUnitPrice;
      if (unitCost.lte(0)) continue;
      itemsFallbackSum = itemsFallbackSum.plus(
        unitCost.times(item.quantity ?? 0),
      );
    }

    const rawTotalAmount = toBigIntOrNull(ticket.totalAmount);
    const explicitTicketAmount =
      rawTotalAmount !== null && rawTotalAmount > BigInt(0)
        ? decimalFromScaledInteger(rawTotalAmount)
        : ticket.requestedAmount !== null &&
            ticket.requestedAmount !== undefined &&
            ticket.requestedAmount > 0
          ? new Prisma.Decimal(ticket.requestedAmount)
          : zero;

    const quotedEquipmentCost =
      ticket.equipmentDetails &&
      typeof ticket.equipmentDetails.quotedCost === "number" &&
      ticket.equipmentDetails.quotedCost > 0
        ? new Prisma.Decimal(ticket.equipmentDetails.quotedCost)
        : zero;

    const procurementTotal = poTotal
      .plus(directPurchaseTotal)
      .plus(materialDeliveryTotal);

    const effectiveAmount = paymentTxTotal.greaterThan(0)
      ? paymentTxTotal
      : procurementTotal.greaterThan(0)
        ? procurementTotal
        : explicitTicketAmount.greaterThan(0)
          ? explicitTicketAmount
          : quotedEquipmentCost.greaterThan(0)
            ? quotedEquipmentCost
            : itemsFallbackSum;

    const linkedRental = projectRentals.find(
      (rental) =>
        typeof rental.sourceTicketId === "string" &&
        rental.sourceTicketId === ticketId,
    );

    const isPaid =
      Boolean(
        ticket.transferReceiptUrl ||
          ticket.paymentProofUrl ||
          ticket.purchaseReceiptUrl,
      ) ||
      tPaymentTxs.length > 0 ||
      tPos.some((po) => po.paidAt !== null && po.paidAt !== undefined) ||
      tDirectPurchases.some(
        (dp) =>
          (dp as { paidAt?: Date | null }).paidAt !== null &&
          (dp as { paidAt?: Date | null }).paidAt !== undefined,
      ) ||
      tDeliveries.some((md) => {
        const inv = md.vendorInvoiceId
          ? invoiceById.get(md.vendorInvoiceId)
          : null;
        return inv?.status === VendorInvoiceStatus.PAID;
      }) ||
      Boolean(latestAudit) ||
      linkedRental?.paymentStatus === "PAID" ||
      ticket.status === TicketStatus.COMPLETED;

    const createdAtDate = toDateOrNow(
      (ticket as { createdAt?: unknown }).createdAt,
    );
    const paidDeliveryInvoice = tDeliveries
      .map((md) =>
        md.vendorInvoiceId ? invoiceById.get(md.vendorInvoiceId) : null,
      )
      .find((inv) => inv?.paidAt !== null && inv?.paidAt !== undefined);

    const paidAtDate =
      tPaymentTxs[0]?.paidAt ??
      latestAudit?.createdAt ??
      tPos.find((po) => po.paidAt !== null && po.paidAt !== undefined)
        ?.paidAt ??
      (
        tDirectPurchases.find(
          (dp) =>
            (dp as { paidAt?: Date | null }).paidAt !== null &&
            (dp as { paidAt?: Date | null }).paidAt !== undefined,
        ) as { paidAt?: Date | null } | undefined
      )?.paidAt ??
      paidDeliveryInvoice?.paidAt ??
      linkedRental?.paidAt ??
      (isPaid ? createdAtDate : null);

    const fundCategory = classifyServerTicketCategory({
      title: ticket.title,
      itemNames: tItems.map((it) => it.itemName ?? ""),
      type: ticket.type,
      ticketType: (ticket as { ticketType?: string | null }).ticketType ?? null,
      requestCategory: ticket.requestCategory,
      fieldCategory: ticket.fieldCategory,
    });

    const paidEffectiveAmount =
      paidPoTotal.greaterThan(0) &&
      paymentTxTotal.lte(0) &&
      explicitTicketAmount.lte(0)
        ? paidPoTotal.plus(directPurchaseTotal).plus(materialDeliveryTotal)
        : effectiveAmount;

    const canonicalTicketAmount = isPaid
      ? paidEffectiveAmount
      : effectiveAmount;

    if (canonicalTicketAmount.greaterThan(0)) {
      current.requestedTotal = current.requestedTotal.plus(
        canonicalTicketAmount,
      );
      if (fundCategory === "TUKANG") {
        current.requestedLabor = current.requestedLabor.plus(
          canonicalTicketAmount,
        );
      } else if (fundCategory === "BAHAN" || fundCategory === "INVENTARIS") {
        current.requestedMaterial = current.requestedMaterial.plus(
          canonicalTicketAmount,
        );
      } else if (fundCategory === "SEWA") {
        current.requestedRental = current.requestedRental.plus(
          canonicalTicketAmount,
        );
        current.requestedOperational = current.requestedOperational.plus(
          canonicalTicketAmount,
        );
      } else {
        current.requestedOperational = current.requestedOperational.plus(
          canonicalTicketAmount,
        );
      }
    }

    if (isPaid && canonicalTicketAmount.greaterThan(0)) {
      current.total = current.total.plus(canonicalTicketAmount);
      if (fundCategory === "TUKANG") {
        current.labor = current.labor.plus(canonicalTicketAmount);
      } else if (fundCategory === "BAHAN" || fundCategory === "INVENTARIS") {
        current.material = current.material.plus(canonicalTicketAmount);
      } else if (fundCategory === "SEWA") {
        current.rental = current.rental.plus(canonicalTicketAmount);
        current.operational = current.operational.plus(canonicalTicketAmount);
      } else if (
        ticket.fieldCategory === TicketFieldCategory.HAULING ||
        /langsir|transport|mobilisasi|angkut/i.test(ticket.title)
      ) {
        current.transport = current.transport.plus(canonicalTicketAmount);
      } else {
        current.operational = current.operational.plus(canonicalTicketAmount);
      }
    }

    current.tickets.push({
      id: ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status as TicketStatus,
      amount: canonicalTicketAmount.greaterThan(0)
        ? canonicalTicketAmount.toString()
        : null,
      paid: isPaid,
      paidAt: paidAtDate ? toDateOrNow(paidAtDate).toISOString() : null,
      requesterName: requester?.name ?? "Staf Proyek",
      type: ticket.type as TicketType,
      ticketType: (ticket as { ticketType?: string | null }).ticketType ?? null,
      requestCategory:
        (ticket.requestCategory as TicketRequestCategory | null) ?? null,
      fieldCategory:
        (ticket.fieldCategory as TicketFieldCategory | null) ?? null,
      fundCategory,
      createdAt: createdAtDate.toISOString(),
      items: tItems.map((it) => {
        const itemName = it.itemName ?? "";
        const catalogUnitPrice = findCatalogUnitPrice(
          itemName,
          ticket.projectId,
        );
        const poItem = it.poItemId ? poItemById.get(it.poItemId) : null;
        const matContract = it.materialContractId
          ? contractById.get(it.materialContractId)
          : null;
        const stockItem = it.stockItemId
          ? stockItemById.get(it.stockItemId)
          : null;
        const rawEstCost = toBigIntOrNull(it.estimatedCost);
        const rawStockPrice = toBigIntOrNull(stockItem?.unitPrice);

        const unitCost =
          poItem?.unitPrice && poItem.unitPrice > 0
            ? new Prisma.Decimal(poItem.unitPrice)
            : matContract?.unitPrice && matContract.unitPrice > 0
              ? new Prisma.Decimal(matContract.unitPrice)
              : rawEstCost !== null && rawEstCost > BigInt(0)
                ? decimalFromScaledInteger(rawEstCost)
                : rawStockPrice !== null && rawStockPrice > BigInt(0)
                  ? decimalFromScaledInteger(rawStockPrice)
                  : catalogUnitPrice.greaterThan(0)
                    ? catalogUnitPrice
                    : null;
        return {
          itemName,
          quantity: it.quantity ?? 0,
          unit: it.unit ?? "",
          estimatedCost: unitCost ? unitCost.toString() : null,
        };
      }),
    });
  }

  // Tambahkan pengiriman Kontrak Material Alam langsung ke proyek (tanpa ticketId)
  for (const delivery of standaloneMaterialDeliveries) {
    if (!delivery.projectId) continue;
    const current = result.get(delivery.projectId);
    if (!current) continue;
    const contract = delivery.contractId
      ? contractById.get(delivery.contractId)
      : null;
    if (!contract) continue;

    const cost = new Prisma.Decimal(delivery.quantityReceived || 0).times(
      contract.unitPrice || 0,
    );
    if (cost.lte(0)) continue;

    current.requestedTotal = current.requestedTotal.plus(cost);
    current.requestedMaterial = current.requestedMaterial.plus(cost);

    const invoice = delivery.vendorInvoiceId
      ? invoiceById.get(delivery.vendorInvoiceId)
      : null;
    const isDeliveryPaid = invoice?.status === VendorInvoiceStatus.PAID;
    if (isDeliveryPaid) {
      current.total = current.total.plus(cost);
      current.material = current.material.plus(cost);
    }

    const delivDate = toDateOrNow(delivery.deliveryDate);
    current.tickets.push({
      id: `md-${String(delivery._id)}`,
      ticketNumber:
        delivery.doNumber || contract.contractNumber || "DO-KONTRAK",
      title: `Pengiriman Kontrak Material: ${contract.materialType ?? "Material"} (${contract.vendorName ?? "Vendor"})`,
      status: isDeliveryPaid
        ? TicketStatus.COMPLETED
        : TicketStatus.PROCESSED_FINANCE,
      amount: cost.toString(),
      paid: isDeliveryPaid,
      paidAt: invoice?.paidAt
        ? toDateOrNow(invoice.paidAt).toISOString()
        : isDeliveryPaid
          ? delivDate.toISOString()
          : null,
      requesterName: contract.vendorName ?? "Vendor Material",
      type: TicketType.MATERIAL,
      requestCategory: TicketRequestCategory.MATERIAL,
      fieldCategory: null,
      fundCategory: "BAHAN",
      createdAt: delivDate.toISOString(),
      items: [
        {
          itemName: `${contract.materialType ?? "Material"} (${contract.vendorName ?? "Vendor"})`,
          quantity: delivery.quantityReceived ?? 0,
          unit: contract.unit ?? "m3",
          estimatedCost: String(contract.unitPrice || 0),
        },
      ],
    });
  }

  // Kumpulkan seluruh referensi nomor tiket & nomor DO per proyek agar StockMovement OUT dari pemenuhan DO/tiket tidak terhitung ganda
  const knownRefsByProject = new Map<string, Set<string>>();
  for (const ticket of ticketRows) {
    if (!ticket.projectId) continue;
    const ticketId = String(ticket._id);
    let refs = knownRefsByProject.get(ticket.projectId);
    if (!refs) {
      refs = new Set<string>();
      knownRefsByProject.set(ticket.projectId, refs);
    }
    if (ticket.ticketNumber) refs.add(ticket.ticketNumber);
    for (const doDoc of dosByTicketId.get(ticketId) ?? []) {
      if (doDoc.doNumber) refs.add(doDoc.doNumber);
    }
  }

  for (const movement of projectStockMovements) {
    if (!movement.projectId) continue;
    const current = result.get(movement.projectId);
    if (!current) continue;
    const refText = `${movement.reference ?? ""} ${movement.notes ?? ""}`;
    const knownRefs = knownRefsByProject.get(movement.projectId);
    if (
      knownRefs &&
      [...knownRefs].some((refCode) => refCode && refText.includes(refCode))
    ) {
      continue;
    }
    // Jika catatan menyebutkan nomor tiket TKT- atau DO- apa pun, jangan hitung ganda sebagai pengeluaran tanpa tiket
    if (/TKT-\d+|DO-\d+/i.test(refText)) {
      continue;
    }

    const rawQty = toBigIntOrNull(movement.quantity) ?? BigInt(0);
    const qtyDecimal = new Prisma.Decimal(rawQty.toString()).dividedBy(1000);
    const stockItem = movement.stockItemId
      ? stockItemById.get(movement.stockItemId)
      : null;
    const rawStockUnitPrice = toBigIntOrNull(stockItem?.unitPrice);
    const unitCostDecimal =
      rawStockUnitPrice !== null && rawStockUnitPrice > BigInt(0)
        ? decimalFromScaledInteger(rawStockUnitPrice)
        : findCatalogUnitPrice(movement.materialName ?? "", movement.projectId);

    const rawMoveTotalCost = toBigIntOrNull(movement.totalCost);
    const moveCost =
      rawMoveTotalCost !== null && rawMoveTotalCost > BigInt(0)
        ? decimalFromScaledInteger(rawMoveTotalCost)
        : unitCostDecimal.greaterThan(0)
          ? unitCostDecimal.times(qtyDecimal)
          : zero;
    if (moveCost.lte(0)) continue;

    current.total = current.total.plus(moveCost);
    current.material = current.material.plus(moveCost);
    current.requestedTotal = current.requestedTotal.plus(moveCost);
    current.requestedMaterial = current.requestedMaterial.plus(moveCost);

    const occurredDate = toDateOrNow(movement.occurredAt ?? movement.createdAt);
    current.tickets.push({
      id: `sm-${String(movement._id)}`,
      ticketNumber: movement.reference || "GUDANG-OUT",
      title: `Pengeluaran Gudang: ${movement.materialName ?? "Material"}`,
      status: TicketStatus.COMPLETED,
      amount: moveCost.toString(),
      paid: true,
      paidAt: occurredDate.toISOString(),
      requesterName: "Logistik Gudang",
      type: TicketType.MATERIAL,
      requestCategory: TicketRequestCategory.WAREHOUSE,
      fieldCategory: null,
      fundCategory: "BAHAN",
      createdAt: occurredDate.toISOString(),
      items: [
        {
          itemName: movement.materialName ?? "Material",
          quantity: qtyDecimal.toNumber(),
          unit: movement.unit ?? "",
          estimatedCost: unitCostDecimal.greaterThan(0)
            ? unitCostDecimal.toString()
            : null,
        },
      ],
    });
  }

  // Tambahkan Biaya Sewa (Rumah Sewa Tukang, Kendaraan Sewa, Alat Sewa) dari EquipmentRental
  // Anti-double-counting: jika sourceTicketId sudah ada di ticketRows proyek, jangan dihitung dua kali!
  const processedTicketIdSet = new Set(ticketIds);
  for (const rental of projectRentals) {
    if (!rental.projectId) continue;
    if (
      rental.type !== "HOUSE" &&
      String(rental.usageScope || "").toUpperCase() === "OPERATIONAL"
    ) {
      continue;
    }

    const sourceTicketId =
      typeof rental.sourceTicketId === "string"
        ? rental.sourceTicketId.trim()
        : "";
    if (sourceTicketId && processedTicketIdSet.has(sourceTicketId)) {
      continue;
    }

    const current = result.get(rental.projectId);
    if (!current) continue;

    const rawTotal = toBigIntOrNull(rental.totalCost);
    const rentalCost =
      rawTotal !== null && rawTotal > BigInt(0)
        ? decimalFromScaledInteger(rawTotal)
        : zero;
    if (rentalCost.lte(0)) continue;

    const isRentalPaid = rental.paymentStatus === "PAID";

    current.requestedTotal = current.requestedTotal.plus(rentalCost);
    current.requestedRental = current.requestedRental.plus(rentalCost);
    current.requestedOperational = current.requestedOperational.plus(rentalCost);

    if (isRentalPaid) {
      current.total = current.total.plus(rentalCost);
      current.rental = current.rental.plus(rentalCost);
      current.operational = current.operational.plus(rentalCost);
    }

    const rentalType =
      rental.type === "HOUSE"
        ? "HOUSE"
        : rental.type === "VEHICLE"
          ? "VEHICLE"
          : "EQUIPMENT";
    const rentalTypeLabel =
      rentalType === "HOUSE"
        ? "Rumah Sewa"
        : rentalType === "VEHICLE"
          ? "Kendaraan Sewa"
          : "Alat Sewa";
    const ownerName =
      (rental.landlordName as string | null | undefined) ||
      (rental.vendorName as string | null | undefined) ||
      "Logistik";
    const startDate = toDateOrNow(rental.startDate ?? rental.createdAt);
    const paidAtDate = rental.paidAt ? toDateOrNow(rental.paidAt) : null;
    const durationNum =
      typeof rental.duration === "number" && Number.isFinite(rental.duration)
        ? rental.duration
        : 1;
    const periodUnit =
      rental.rentalPeriodType === "WEEKLY"
        ? rentalType === "HOUSE"
          ? "Periode"
          : "Minggu"
        : rental.rentalPeriodType === "MONTHLY"
          ? "Bulan"
          : "Hari";

    current.tickets.push({
      id: `rental-${String(rental._id)}`,
      ticketNumber:
        rentalType === "HOUSE"
          ? "SEWA-RUMAH"
          : rentalType === "VEHICLE"
            ? "SEWA-ARMADA"
            : "SEWA-ALAT",
      title: `${rentalTypeLabel}: ${rental.name ?? "-"}${rental.propertyAddress ? ` · ${rental.propertyAddress}` : ""}`,
      status: isRentalPaid
        ? TicketStatus.COMPLETED
        : rental.paymentStatus === "PENDING_PAYMENT"
          ? TicketStatus.WAITING_FINANCE_PAYMENT
          : TicketStatus.PROCESSED_LOGISTIC,
      amount: rentalCost.toString(),
      paid: isRentalPaid,
      paidAt: paidAtDate ? paidAtDate.toISOString() : null,
      requesterName: `${ownerName}${rental.createdByName ? ` (${rental.createdByName})` : ""}`,
      type: TicketType.OPERATIONAL,
      ticketType:
        rentalType === "HOUSE"
          ? "HOUSE_RENTAL"
          : rentalType === "VEHICLE"
            ? "VEHICLE_RENTAL"
            : "EQUIPMENT_RENTAL",
      requestCategory: null,
      fieldCategory: null,
      fundCategory: "SEWA",
      createdAt: startDate.toISOString(),
      items: [
        {
          itemName: `${rentalTypeLabel}: ${rental.name ?? "-"}`,
          quantity: durationNum,
          unit: periodUnit,
          estimatedCost: null,
        },
      ],
    });
  }

  return result;
}
