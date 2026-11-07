"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  FulfillmentStatus,
  POPaymentMethod,
  DODeliveryMethod,
  DOStatus,
  NotificationType,
  PaymentStatus,
  PaymentType,
  POStatus,
  TicketPriority,
  TicketCategoryHint,
  TicketFieldCategory,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
  DirectStockPurchaseStatus,
} from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import { resolveVendorBankAccount } from "@/lib/vendor-bank-accounts";
import { nextDocumentNumber } from "@/lib/documents/numbering";
import {
  generateAvailablePublicCode,
  isValidPublicCode,
} from "@/lib/documents/random-code";
import { lockTicketDeliveryOrderCreation } from "@/lib/documents/lock-ticket-delivery-order";
import {
  lockTicketFulfillment,
  syncTicketStatus,
} from "@/lib/ticket-utils";
import { sendNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { receivePurchaseOrderStock } from "@/lib/logistics/receive-purchase-order-stock";
import {
  DirectStockPurchasePhotoValidationError,
  removeDirectStockPurchasePhoto,
  saveDirectStockPurchasePhoto,
} from "@/lib/direct-stock-purchase-photos";
import { MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS } from "@/lib/direct-stock-purchase-photo-config";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";
import {
  CloudinaryPhotoValidationError,
  CloudinaryConfigurationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  CloudinaryRawFileValidationError,
  removeCloudinaryRawFile,
  uploadCloudinaryRawFile,
} from "@/lib/cloudinary-raw-files";
import { CloudinaryPrivatePdfValidationError } from "@/lib/cloudinary-private-pdfs";
import {
  removeTicketReceipt,
  saveTicketReceipt,
} from "@/lib/ticket-receipts";
import { isFinancePaymentProofUrl } from "@/lib/finance-payment-proofs";
import { FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER } from "@/lib/finance-payment-proof-config";
import {
  vendorInvoiceInputSchema,
  type VendorInvoiceInput,
} from "@/lib/invoice-input";
import { formatVendorBankAccount } from "@/lib/vendor-bank-accounts";
import { isPurchaseOrderInvoiceUrl } from "@/lib/purchase-order-invoices";
import { PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER } from "@/lib/purchase-order-invoice-config";
import { recordFinanceCashflowOutflow } from "@/lib/finance-cashflow-ledger";
import { isTicketRequestReceiptUrl } from "@/lib/ticket-request-receipts";
import { REQUEST_DOCUMENT_CLOUDINARY_FOLDER } from "@/lib/request-document-config";

const MAX_FINANCE_PAYMENT_PROOFS = 5;
const MAX_FINANCE_PAYMENT_PROOF_SIZE = 5 * 1024 * 1024;
const FINANCE_PAYMENT_PROOF_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type FinancePaymentProofInput = File | File[] | string;

function isValidFinancePaymentProofInput(
  proof: FinancePaymentProofInput,
): boolean {
  if (typeof proof === "string") {
    return isFinancePaymentProofUrl(proof);
  }
  const files = Array.isArray(proof) ? proof : [proof];
  return (
    files.length > 0 &&
    files.length <= MAX_FINANCE_PAYMENT_PROOFS &&
    files.every(
      (file) =>
        file instanceof File &&
        file.size > 0 &&
        file.size <= MAX_FINANCE_PAYMENT_PROOF_SIZE &&
        FINANCE_PAYMENT_PROOF_TYPES.has(file.type),
    )
  );
}

async function storeFinancePaymentProof(proof: File | string): Promise<string> {
  if (typeof proof === "string") {
    if (!isFinancePaymentProofUrl(proof)) {
      throw new Error("URL bukti transfer Cloudinary tidak valid.");
    }
    return proof;
  }
  if (proof.type === "application/pdf") {
    return saveTicketReceipt(proof);
  }
  const uploaded = await uploadCloudinaryPhoto(
    proof,
    FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER,
  );
  if (!isFinancePaymentProofUrl(uploaded.secureUrl)) {
    throw new Error("Cloudinary mengembalikan URL foto bukti yang tidak valid.");
  }
  return uploaded.secureUrl;
}

async function storeFinancePaymentProofs(
  proof: FinancePaymentProofInput,
): Promise<string[]> {
  if (!isValidFinancePaymentProofInput(proof)) {
    throw new Error(
      "Pilih 1-5 bukti pembayaran PDF/JPG/PNG/WEBP, maksimal 5 MB per file.",
    );
  }
  const proofs = Array.isArray(proof) ? proof : [proof];
  const storedUrls: string[] = [];
  try {
    for (const file of proofs) {
      storedUrls.push(await storeFinancePaymentProof(file));
    }
    return storedUrls;
  } catch (error) {
    await removeFinancePaymentProofs(storedUrls);
    throw error;
  }
}

async function removeFinancePaymentProofs(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      try {
        await removeTicketReceipt(url);
      } catch (error) {
        console.error("Failed to remove an unreferenced payment proof:", error);
      }
    }),
  );
}

type TicketItemInput = {
  stockItemId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCost?: number | null;
  categoryHint?: TicketCategoryHint;
  expectedDeliveryDate?: string | null;
};

export type CreateTicketInput = {
  title: string;
  description?: string;
  type: TicketType;
  requestCategory?: TicketRequestCategory;
  fieldCategory?: TicketFieldCategory;
  priority: TicketPriority;
  projectId?: string;
  moverAssigneeId?: string;
  attachmentUrl?: string;
  recipientName?: string;
  bankName?: string;
  accountNumber?: string;
  requestPaymentMethod?: POPaymentMethod;
  transferDestination?: string;
  requestPaymentDescription?: string;
  originCity?: string;
  destinationCity?: string;
  relatedDocumentNumbers?: string;
  requestedAmount?: number;
  receiptFiles?: File[];
  items: TicketItemInput[];
};

export type TicketActionResult = {
  success: boolean;
  message: string;
  fallbackRequired?: boolean;
  ticketNumber?: string;
  purchaseNumber?: string;
  documentNumber?: string;
  invoiceId?: string;
  publicCode?: string;
  movers?: { id: string; name: string }[];
  vehicles?: {
    id: string;
    plateNumber: string;
    vehicleType: string;
    brand: string | null;
    modelName: string | null;
  }[];
  stockAvailability?: {
    ticketItemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    availableQuantity: string;
    ready: boolean;
    pendingPurchaseNumber?: string;
    message?: string;
  }[];
  readyItemIds?: string[];
  needsOrderItemIds?: string[];
  moverAssigneeId?: string | null;
  stockItem?: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    unitPrice: string;
  };
};

export type ShippingDocumentOptions = {
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    vendorName: string;
    status: POStatus;
  }>;
  tickets: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    status: TicketStatus;
  }>;
};

const actionFailure = (message: string): TicketActionResult => ({
  success: false,
  message,
});

const warehouseInsufficientMessage =
  "Stok gudang tidak mencukupi untuk memenuhi permintaan ini.";

const normalizeTicketStockValue = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

const ticketStockItemKey = (itemName: string, unit: string) =>
  `${normalizeTicketStockValue(itemName)}\u0000${normalizeTicketStockValue(unit)}`;

type WarehouseReservation = {
  stockItemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
};

function evaluateWarehouseStock(
  ticketItems: { id: string; itemName: string; quantity: number; unit: string }[],
  stockItems: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    stockQuantity: bigint;
    unitPrice: bigint;
  }[],
): {
  available: true;
  reservations: Map<string, WarehouseReservation>;
  itemCodesByTicketItemId: Map<string, string>;
} | {
  available: false;
  fallbackRequired: boolean;
  message: string;
} {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  const reservations = new Map<string, WarehouseReservation>();
  const itemCodesByTicketItemId = new Map<string, string>();

  for (const ticketItem of ticketItems) {
    const matches = stockItems.filter(
      (stockItem) =>
        normalize(stockItem.name) === normalize(ticketItem.itemName) &&
        normalize(stockItem.unit) === normalize(ticketItem.unit),
    );
    if (matches.length === 0) {
      return {
        available: false,
        fallbackRequired: true,
        message: `Barang "${ticketItem.itemName}" (${ticketItem.unit}) belum terdaftar di katalog stok gudang.`,
      };
    }
    if (matches.length > 1) {
      return {
        available: false,
        fallbackRequired: false,
        message: `Barang "${ticketItem.itemName}" (${ticketItem.unit}) memiliki SKU ganda; perbaiki katalog sebelum menerbitkan DO.`,
      };
    }

    const stockItem = matches[0];
    itemCodesByTicketItemId.set(ticketItem.id, stockItem.sku);
    const current = reservations.get(stockItem.id);
    reservations.set(stockItem.id, {
      stockItemId: stockItem.id,
      name: stockItem.name,
      unit: stockItem.unit,
      quantity: (current?.quantity ?? 0) + ticketItem.quantity,
      unitPrice: decimalFromScaledInteger(stockItem.unitPrice),
    });
  }

  for (const reservation of reservations.values()) {
    const stockItem = stockItems.find(
      (item) => item.id === reservation.stockItemId,
    );
    const availableQuantity = stockItem
      ? decimalFromScaledInteger(stockItem.stockQuantity)
      : new Prisma.Decimal(0);
    if (!stockItem || availableQuantity.lessThan(reservation.quantity)) {
      return {
        available: false,
        fallbackRequired: true,
        message: `Stok "${reservation.name}" tidak mencukupi: tersedia ${availableQuantity.toString()} ${reservation.unit}, dibutuhkan ${reservation.quantity} ${reservation.unit}.`,
      };
    }
  }

  return { available: true, reservations, itemCodesByTicketItemId };
}

function evaluateWarehouseItemAvailability(
  ticketItems: { id: string; itemName: string; quantity: number; unit: string }[],
  stockItems: {
    id: string;
    name: string;
    unit: string;
    stockQuantity: bigint;
  }[],
) {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  const requiredByStockId = new Map<string, number>();
  const matchesByTicketItem = new Map<
    string,
    { stockItem: (typeof stockItems)[number] | null; message?: string }
  >();

  for (const ticketItem of ticketItems) {
    const matches = stockItems.filter(
      (stockItem) =>
        normalize(stockItem.name) === normalize(ticketItem.itemName) &&
        normalize(stockItem.unit) === normalize(ticketItem.unit),
    );
    if (matches.length > 1) {
      return {
        success: false as const,
        message: `Barang "${ticketItem.itemName}" (${ticketItem.unit}) memiliki SKU ganda; perbaiki katalog sebelum melanjutkan.`,
      };
    }
    const stockItem = matches[0] ?? null;
    matchesByTicketItem.set(ticketItem.id, {
      stockItem,
      message: stockItem
        ? undefined
        : `Barang "${ticketItem.itemName}" (${ticketItem.unit}) belum terdaftar di katalog stok.`,
    });
    if (stockItem) {
      requiredByStockId.set(
        stockItem.id,
        (requiredByStockId.get(stockItem.id) ?? 0) + ticketItem.quantity,
      );
    }
  }

  return {
    success: true as const,
    items: ticketItems.map((ticketItem) => {
      const match = matchesByTicketItem.get(ticketItem.id)!;
      const availableQuantity = match.stockItem
        ? decimalFromScaledInteger(match.stockItem.stockQuantity)
        : new Prisma.Decimal(0);
      const requiredQuantity = match.stockItem
        ? requiredByStockId.get(match.stockItem.id) ?? ticketItem.quantity
        : ticketItem.quantity;
      const ready =
        match.stockItem !== null &&
        availableQuantity.greaterThanOrEqualTo(requiredQuantity);
      return {
        ticketItemId: ticketItem.id,
        itemName: ticketItem.itemName,
        quantity: ticketItem.quantity,
        unit: ticketItem.unit,
        availableQuantity: availableQuantity.toString(),
        ready,
        message:
          match.message ??
          (ready
            ? undefined
            : `Stok tersedia ${availableQuantity.toString()} ${ticketItem.unit}; dibutuhkan ${requiredQuantity} ${ticketItem.unit}.`),
      };
    }),
  };
}

function allocatePaymentAmount(
  total: number,
  paid: number,
  paymentType: PaymentType,
  requestedAmount?: number,
) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(paid) || paid < 0) {
    throw new Error("Total tagihan tidak valid.");
  }

  const totalCents = Math.round(total * 100);
  const paidCents = Math.round(paid * 100);
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(paidCents)) {
    throw new Error("Total tagihan tidak valid.");
  }
  const remainingCents = totalCents - paidCents;
  if (remainingCents <= 0) {
    throw new Error("Tagihan sudah lunas.");
  }

  const requestedAmountCents =
    typeof requestedAmount === "number" && Number.isFinite(requestedAmount)
      ? Math.round(requestedAmount * 100)
      : null;
  const amountCents =
    paymentType === PaymentType.FULL_PAYMENT
      ? remainingCents
      : requestedAmountCents ?? 0;
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    (paymentType !== PaymentType.FULL_PAYMENT &&
      (requestedAmountCents === null ||
        Math.abs((requestedAmount ?? 0) * 100 - requestedAmountCents) >
          0.000001))
  ) {
    throw new Error(
      "Nominal pembayaran harus lebih besar dari nol dan maksimal dua angka desimal.",
    );
  }
  if (
    amountCents > remainingCents ||
    (paymentType !== PaymentType.FULL_PAYMENT &&
      amountCents >= remainingCents)
  ) {
    throw new Error(
      paymentType === PaymentType.FULL_PAYMENT
        ? "Nominal pelunasan tidak valid."
        : "Nominal DP/termin harus lebih kecil dari sisa tagihan.",
    );
  }

  return {
    amount: amountCents / 100,
    remainingAfter: (remainingCents - amountCents) / 100,
    isFullyPaid: amountCents === remainingCents,
  };
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isTicketType(value: unknown): value is TicketType {
  return Object.values(TicketType).some((entry) => entry === value);
}

function isTicketPriority(value: unknown): value is TicketPriority {
  return Object.values(TicketPriority).some((entry) => entry === value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isTicketNumberConflict(error: unknown): boolean {
  return (
    isUniqueConstraintError(error) ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034")
  );
}

async function retryTicketNumberTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTicketNumberConflict(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = Math.min(750, 50 * 2 ** Math.min(attempt - 1, 4));
      await new Promise((resolve) =>
        setTimeout(resolve, delay + Math.floor(Math.random() * 100)),
      );
    }
  }
  throw new Error("Ticket number transaction did not complete.");
}

async function nextTicketNumber(
  database: Pick<Prisma.TransactionClient, "documentNumberSequence">,
): Promise<string> {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `TKT-${month}-`;

  const sequence = await database.documentNumberSequence.upsert({
    where: { kind_year: { kind: prefix, year: 0 } },
    update: { value: { increment: 1 } },
    create: { kind: prefix, year: 0, value: 1 },
    select: { value: true },
  });

  return `${prefix}${String(sequence.value).padStart(3, "0")}`;
}

export async function createLogisticsPurchaseOrder(input: {
  title: string;
  description?: string;
  projectId?: string;
  items: { stockItemId: string; quantity: number }[];
}): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk sebelum membuat PO.");
  }
  if (
    session.user.role !== UserRole.LOGISTICS &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return actionFailure("Hanya Logistik yang dapat mengajukan PO material.");
  }
  if (
    !input ||
    typeof input.title !== "string" ||
    input.title.trim().length < 3 ||
    input.title.trim().length > 160 ||
    (input.projectId !== undefined &&
      (typeof input.projectId !== "string" ||
        input.projectId.length === 0 ||
        input.projectId.length > 64)) ||
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 100 ||
    (input.description !== undefined &&
      (typeof input.description !== "string" ||
        input.description.length > 10000))
  ) {
    return actionFailure("Data PO tidak valid. Periksa judul dan item.");
  }

  const quantities = new Map<string, number>();
  for (const item of input.items) {
    if (
      !item ||
      typeof item.stockItemId !== "string" ||
      !item.stockItemId ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 1_000_000_000
    ) {
      return actionFailure("Jumlah dan barang pada PO tidak valid.");
    }
    const combinedQuantity =
      (quantities.get(item.stockItemId) ?? 0) + item.quantity;
    if (!Number.isFinite(combinedQuantity) || combinedQuantity > 1_000_000_000) {
      return actionFailure("Jumlah gabungan barang pada PO terlalu besar.");
    }
    quantities.set(item.stockItemId, combinedQuantity);
  }

  const [project, stockItems] = await Promise.all([
    input.projectId
      ? prisma.project.findUnique({
          where: { id: input.projectId },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.stockItem.findMany({
      where: { id: { in: [...quantities.keys()] } },
      select: { id: true, name: true, unit: true, unitPrice: true },
    }),
  ]);
  if (input.projectId && !project) {
    return actionFailure("Proyek yang dipilih tidak ditemukan.");
  }
  if (stockItems.length !== quantities.size) {
    return actionFailure("Salah satu barang stok tidak ditemukan.");
  }

  const ticketItems = stockItems.map((item) => ({
    itemName: item.name,
    quantity: quantities.get(item.id)!,
    unit: item.unit,
    estimatedCost: decimalFromScaledInteger(item.unitPrice),
  }));
  const totalAmount = ticketItems.reduce(
    (total, item) =>
      total.plus(
        item.estimatedCost.times(item.quantity.toString()),
      ),
    new Prisma.Decimal(0),
  ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (totalAmount.greaterThan("9999999999999999.99")) {
    return actionFailure("Total PO melebihi batas nilai yang dapat disimpan.");
  }

  let ticketNumber: string;
  try {
    ticketNumber = await retryTicketNumberTransaction(() =>
      nextTicketNumber(prisma).then((generatedNumber) =>
        prisma.$transaction(async (transaction) => {
      const ticketId = randomUUID();
      await transaction.ticket.create({
        data: {
          id: ticketId,
          ticketNumber: generatedNumber,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          type: TicketType.MATERIAL,
          requestCategory: TicketRequestCategory.MATERIAL,
          priority: TicketPriority.MEDIUM,
          status: TicketStatus.PENDING_DIRECTOR,
          totalAmount: scaledIntegerFromDecimal(totalAmount),
          requesterId: session.user.id,
          projectId: project?.id,
          updatedAt: new Date(),
          items: {
            create: ticketItems.map((item) => ({
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              estimatedCost: scaledIntegerFromDecimal(item.estimatedCost),
            })),
          },
          auditLogs: {
            create: {
              id: randomUUID(),
              userId: session.user.id,
              action: "PURCHASE_ORDER_SUBMITTED",
              notes: project
                ? "PO material proyek diajukan kepada Direktur; setelah disetujui, Logistik memproses pembelian dan meneruskan bukti ke Keuangan."
                : "PO material untuk persediaan gudang diajukan kepada Direktur; tidak terikat pada proyek tertentu.",
            },
          },
        },
      });
      return generatedNumber;
        }, { maxWait: 30000, timeout: 60000 }),
      ),
    );
  } catch (error) {
    if (isTicketNumberConflict(error)) {
      return actionFailure("Nomor tiket bentrok. Silakan coba kembali.");
    }
    console.error("Logistics purchase order creation failed:", error);
    return actionFailure("PO gagal dibuat. Silakan coba kembali.");
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/tickets");
  return {
    success: true,
    message: `PO ${ticketNumber} berhasil diajukan kepada Direktur.`,
    ticketNumber,
  };
}

export async function saveLogisticsStockItem(input: {
  id?: string;
  sku?: string;
  name: string;
  unit: string;
  stockQuantity: string;
  minimumStock: string;
  unitPrice: string;
}): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk sebelum mengelola persediaan.");
  }
  if (
    session.user.role !== UserRole.LOGISTICS &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return actionFailure("Hanya Logistik yang dapat mengelola persediaan.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    (input.sku !== undefined && typeof input.sku !== "string") ||
    typeof input.name !== "string" ||
    typeof input.unit !== "string" ||
    typeof input.stockQuantity !== "string" ||
    typeof input.minimumStock !== "string" ||
    typeof input.unitPrice !== "string" ||
    (input.id !== undefined &&
      (typeof input.id !== "string" || input.id.length === 0))
  ) {
    return actionFailure("Data barang persediaan tidak valid.");
  }

  const sku = input.sku?.trim().toUpperCase() ?? "";
  const name = input.name?.trim();
  const unit = input.unit?.trim();
  const decimalFields = [
    { value: input.stockQuantity, scale: 3, precision: 14 },
    { value: input.minimumStock, scale: 3, precision: 14 },
    { value: input.unitPrice, scale: 2, precision: 18 },
  ];
  if (
    (input.id &&
      (!sku || !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(sku))) ||
    !name ||
    name.length > 120 ||
    !unit ||
    unit.length > 32 ||
    decimalFields.some(({ value, scale, precision }) => {
      const pattern = new RegExp(
        `^\\d{1,${precision - scale}}(?:\\.\\d{1,${scale}})?$`,
      );
      return typeof value !== "string" || !pattern.test(value);
    })
  ) {
    return actionFailure(
      "Periksa SKU, nama, satuan, stok, batas minimum, dan harga barang.",
    );
  }

  try {
    const stockQuantity = new Prisma.Decimal(input.stockQuantity);
    const minimumStock = new Prisma.Decimal(input.minimumStock);
    const unitPrice = new Prisma.Decimal(input.unitPrice);
    let reusedCatalogItem = false;
    let savedStockItem: {
      id: string;
      sku: string;
      name: string;
      unit: string;
      unitPrice: Prisma.Decimal;
    };

    if (input.id) {
      const existingItem = await prisma.stockItem.findUnique({
        where: { id: input.id },
        select: { id: true, sku: true, name: true, unit: true, unitPrice: true },
      });
      if (!existingItem) {
        return actionFailure("Barang persediaan tidak ditemukan.");
      }
      savedStockItem = await prisma.stockItem.update({
        where: { id: input.id },
        data: {
          sku,
          name,
          unit,
          stockQuantity: scaledIntegerFromDecimal(stockQuantity),
          minimumStock: scaledIntegerFromDecimal(minimumStock),
          unitPrice: scaledIntegerFromDecimal(unitPrice),
        },
        select: { id: true, sku: true, name: true, unit: true, unitPrice: true },
      }).then((item) => ({
        ...item,
        unitPrice: decimalFromScaledInteger(item.unitPrice),
      }));
    } else {
      savedStockItem = await prisma.$transaction(async (transaction) => {
        const lockKey = JSON.stringify([
          name.replace(/\s+/g, " ").toLocaleLowerCase("id-ID"),
          unit.replace(/\s+/g, " ").toLocaleLowerCase("id-ID"),
        ]);
        await acquireMongoTransactionLock(transaction, `stock-catalog:${lockKey}`);
        const matches = await transaction.stockItem.findMany({
          where: {
            name: { equals: name, mode: "insensitive" },
            unit: { equals: unit, mode: "insensitive" },
          },
          select: { id: true, sku: true, name: true, unit: true, unitPrice: true },
          take: 2,
        });
        if (matches.length > 1) {
          throw new Error(
            "Terdapat lebih dari satu barang dengan nama dan satuan ini. Pilih barang dari katalog.",
          );
        }
        if (matches[0]) {
          reusedCatalogItem = true;
          return {
            ...matches[0],
            unitPrice: decimalFromScaledInteger(matches[0].unitPrice),
          };
        }

        const generatedSku = `MAT-${randomUUID()
          .replaceAll("-", "")
          .slice(0, 8)
          .toUpperCase()}`;
        return transaction.stockItem.create({
          data: {
            sku: generatedSku,
            name,
            unit,
            stockQuantity: scaledIntegerFromDecimal(stockQuantity),
            minimumStock: scaledIntegerFromDecimal(minimumStock),
            unitPrice: scaledIntegerFromDecimal(unitPrice),
          },
          select: { id: true, sku: true, name: true, unit: true, unitPrice: true },
        }).then((item) => ({
          ...item,
          unitPrice: decimalFromScaledInteger(item.unitPrice),
        }));
      });
    }
    revalidatePath("/apps/logistics/stock");
    revalidatePath("/apps/logistics");
    return {
      success: true,
      message: input.id
        ? `Barang ${name} berhasil diperbarui.`
        : reusedCatalogItem
          ? `Barang sudah terdaftar sebagai ${savedStockItem.name} (${savedStockItem.sku}); gunakan data katalog tersebut.`
          : `Barang ${name} berhasil ditambahkan ke katalog.`,
      stockItem: {
        ...savedStockItem,
        unitPrice: savedStockItem.unitPrice.toString(),
      },
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return actionFailure("SKU tersebut sudah digunakan barang lain.");
    }
    if (
      error instanceof Error &&
      error.message.startsWith("Terdapat lebih dari satu barang")
    ) {
      return actionFailure(error.message);
    }
    console.error("Logistics stock item save failed:", error);
    return actionFailure("Barang gagal disimpan. Silakan coba kembali.");
  }
}

export type DirectStockPurchaseActionResult = {
  success: boolean;
  message: string;
  purchaseNumber?: string;
};

const directPurchaseFailure = (
  message: string,
): DirectStockPurchaseActionResult => ({ success: false, message });

export async function createDirectStockPurchase(input: {
  vendorId: string;
  vendorBankAccountId?: string;
  ticketId?: string;
  items: {
    stockItemId: string;
    quantity: string;
    unitPrice: string;
    ticketItemId?: string;
  }[];
  reference?: string;
  notes?: string;
  includeTax?: boolean;
}): Promise<DirectStockPurchaseActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.ADMINISTRATIONS)
  ) {
    return directPurchaseFailure(
      "Hanya Logistik atau Administrasi yang dapat mencatat pembelian stok.",
    );
  }
  if (
    !input ||
    typeof input.vendorId !== "string" ||
    !input.vendorId.trim() ||
    (input.vendorBankAccountId !== undefined &&
      (typeof input.vendorBankAccountId !== "string" ||
        !input.vendorBankAccountId.trim() ||
        input.vendorBankAccountId.length > 64)) ||
    (input.ticketId !== undefined &&
      (typeof input.ticketId !== "string" ||
        !input.ticketId.trim() ||
        input.ticketId.length > 64)) ||
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > 50 ||
    (input.reference !== undefined &&
      (typeof input.reference !== "string" || input.reference.length > 120)) ||
    (input.notes !== undefined &&
      (typeof input.notes !== "string" || input.notes.length > 2000)) ||
    (input.includeTax !== undefined && typeof input.includeTax !== "boolean") ||
    input.items.some(
      (item) =>
        !item ||
        typeof item.stockItemId !== "string" ||
        !item.stockItemId.trim() ||
        typeof item.quantity !== "string" ||
        typeof item.unitPrice !== "string" ||
        (item.ticketItemId !== undefined &&
          !isBoundedText(item.ticketItemId, 64)),
    )
  ) {
    return directPurchaseFailure("Data pembelian stok langsung tidak valid.");
  }

  const quantityPattern = /^\d{1,11}(?:\.\d{1,3})?$/;
  const pricePattern = /^\d{1,16}(?:\.\d{1,2})?$/;
  if (input.items.some((item) =>
    !quantityPattern.test(item.quantity) ||
    new Prisma.Decimal(item.quantity).lte(0) ||
    !pricePattern.test(item.unitPrice) ||
    new Prisma.Decimal(item.unitPrice).lte(0),
  )) {
    return directPurchaseFailure(
      "Jumlah dan harga satuan harus lebih dari nol dengan angka yang valid.",
    );
  }

  try {
    const purchaseNumber = await prisma.$transaction(async (transaction) => {
      if (input.ticketId) {
        await lockTicketFulfillment(transaction, input.ticketId);
      }
      const vendor = await transaction.vendor.findFirst({
        where: { id: input.vendorId, isApproved: true },
        select: {
          id: true,
          name: true,
          bankName: true,
          bankAccount: true,
          bankHolder: true,
          bankAccounts: {
            select: {
              id: true,
              bankName: true,
              bankAccount: true,
              bankHolder: true,
              isPrimary: true,
            },
          },
        },
      });
      if (!vendor) {
        throw new Error("Vendor tidak ditemukan atau belum disetujui.");
      }
      const vendorBankAccount = resolveVendorBankAccount(
        vendor.bankAccounts,
        vendor,
        input.vendorBankAccountId,
      );
      if (input.vendorBankAccountId && !vendorBankAccount) {
        throw new Error("Rekening yang dipilih tidak terdaftar pada vendor ini.");
      }

      const ticket = input.ticketId
        ? await transaction.ticket.findFirst({
            where: {
              id: input.ticketId,
              type: TicketType.MATERIAL,
              status: { not: TicketStatus.REJECTED },
            },
            select: {
              id: true,
              ticketNumber: true,
              items: {
                select: {
                  id: true,
                  itemName: true,
                  quantity: true,
                  unit: true,
                  status: true,
                },
              },
            },
          })
        : null;
      if (input.ticketId && !ticket) {
        throw new Error("Tiket material tidak ditemukan atau sudah ditolak.");
      }

      const stockItems = await transaction.stockItem.findMany({
        where: { id: { in: input.items.map((item) => item.stockItemId) } },
        select: { id: true, name: true, unit: true },
      });
      if (stockItems.length !== new Set(input.items.map((item) => item.stockItemId)).size) {
        throw new Error("Satu atau lebih barang katalog tidak ditemukan.");
      }
      const stockItemById = new Map(stockItems.map((item) => [item.id, item]));
      const items = input.items.map((item) => {
        const stockItem = stockItemById.get(item.stockItemId);
        if (!stockItem) throw new Error("Barang persediaan tidak ditemukan.");
        const quantity = new Prisma.Decimal(item.quantity);
        const unitPrice = new Prisma.Decimal(item.unitPrice);
        return {
          stockItem,
          itemName: stockItem.name,
          unit: stockItem.unit,
          quantity,
          unitPrice,
          totalPrice: quantity.mul(unitPrice).toDecimalPlaces(2),
        };
      });
      if (ticket) {
        const selectedTicketItemIds = input.items
          .map((item) => item.ticketItemId)
          .filter((id): id is string => Boolean(id));
        if (new Set(selectedTicketItemIds).size !== selectedTicketItemIds.length) {
          throw new Error("Item tiket yang sama tidak boleh dimasukkan lebih dari sekali.");
        }
        const ticketItemsById = new Map(
          ticket.items.map((item) => [item.id, item]),
        );
        const activePurchases = await transaction.directStockPurchase.findMany({
          where: {
            ticketId: ticket.id,
            status: DirectStockPurchaseStatus.PENDING_RECEIPT,
          },
          select: {
            purchaseNumber: true,
            items: { select: { itemName: true, unit: true } },
          },
        });
        const activePurchaseByItem = new Map<string, string>();
        for (const purchase of activePurchases) {
          for (const item of purchase.items) {
            activePurchaseByItem.set(
              ticketStockItemKey(item.itemName, item.unit),
              purchase.purchaseNumber,
            );
          }
        }
        for (const [index, item] of items.entries()) {
          const inputItem = input.items[index];
          const key = ticketStockItemKey(item.itemName, item.unit);
          const activePurchaseNumber = activePurchaseByItem.get(key);
          if (activePurchaseNumber) {
            throw new Error(
              `Item tiket ${item.itemName} (${item.unit}) masih ada dalam pesanan ${activePurchaseNumber}. Selesaikan penerimaan pesanan tersebut sebelum memesan ulang.`,
            );
          }
          const matchingTicketItems = ticket.items.filter(
            (ticketItem) =>
              ticketStockItemKey(ticketItem.itemName, ticketItem.unit) === key,
          );
          const linkedTicketItem = inputItem.ticketItemId
            ? ticketItemsById.get(inputItem.ticketItemId)
            : matchingTicketItems.filter(
                (ticketItem) =>
                  ticketItem.status === FulfillmentStatus.PENDING &&
                  new Prisma.Decimal(inputItem.quantity).eq(
                    ticketItem.quantity,
                  ),
              )[0];
          if (
            !linkedTicketItem ||
            linkedTicketItem.status !== FulfillmentStatus.PENDING ||
            ticketStockItemKey(linkedTicketItem.itemName, linkedTicketItem.unit) !==
              key ||
            (inputItem.ticketItemId &&
              !new Prisma.Decimal(inputItem.quantity).eq(
                linkedTicketItem.quantity,
              ))
          ) {
            throw new Error(
              `Item tiket ${item.itemName} (${item.unit}) tidak sesuai dengan item tiket yang masih menunggu pemenuhan.`,
            );
          }
          if (
            matchingTicketItems.some(
              (ticketItem) =>
                ticketItem.status === FulfillmentStatus.PROCESSED_TO_PO,
            )
          ) {
            throw new Error(
              `Item tiket ${item.itemName} (${item.unit}) sudah tercakup dalam PO aktif untuk tiket ini.`,
            );
          }
        }
      } else if (input.items.some((item) => item.ticketItemId)) {
        throw new Error("Item tiket hanya dapat digunakan jika tiket dipilih.");
      }
      const subtotal = items.reduce(
        (total, item) => total.plus(item.totalPrice),
        new Prisma.Decimal(0),
      );
      const totalAmount = input.includeTax
        ? subtotal.mul(1.11).toDecimalPlaces(2)
        : subtotal;
      const number = await nextDocumentNumber(transaction, "STOCK");
      const hasBankDetails = Boolean(vendorBankAccount);

      await transaction.directStockPurchase.create({
        data: {
          purchaseNumber: number,
          vendorId: vendor.id,
          ticketId: ticket?.id ?? null,
          vendorName: vendor.name,
          paymentMethod: hasBankDetails
            ? POPaymentMethod.TRANSFER
            : POPaymentMethod.CASH,
          paymentBankName: hasBankDetails ? vendorBankAccount?.bankName : null,
          paymentAccountNumber: hasBankDetails
            ? vendorBankAccount?.bankAccount
            : null,
          paymentAccountName: hasBankDetails
            ? vendorBankAccount?.bankHolder
            : null,
          paymentTerms: "Pembelian langsung tanpa PO",
          includeTax: input.includeTax ?? false,
          totalAmount: scaledIntegerFromDecimal(totalAmount),
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          createdById: session.user.id,
          items: {
            create: items.map((item) => ({
              stockItem: { connect: { id: item.stockItem.id } },
              itemName: item.itemName,
              unit: item.unit,
              quantity: scaledIntegerFromDecimal(item.quantity),
              unitPrice: scaledIntegerFromDecimal(item.unitPrice),
              totalPrice: scaledIntegerFromDecimal(item.totalPrice),
            })),
          },
        },
        select: { id: true },
      });
      if (ticket) {
        await transaction.ticketAuditLog.create({
          data: {
            ticketId: ticket.id,
            userId: session.user.id,
            action: "LOGISTICS_DIRECT_PURCHASE_CREATED",
            notes: `Pembelian langsung ${number} ditautkan ke permintaan ini.`,
          },
        });
      }
      await sendNotification({
        roleTarget: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
        title: "Pembelian Langsung Menunggu Persetujuan",
        message: `Pembelian ${number} dari ${vendor.name} memerlukan persetujuan dana eksekutif.`,
        actionUrl: "/apps/approvals?tab=direct-purchase",
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      return number;
    });

    revalidatePath("/apps/logistics/stock");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    return {
      success: true,
      message: `Pembelian ${purchaseNumber} tercatat dan menunggu persetujuan Direktur. Stok belum berubah.`,
      purchaseNumber,
    };
  } catch (error) {
    console.error("Direct stock purchase creation failed:", error);
    return directPurchaseFailure(
      error instanceof Error &&
        (error.message.startsWith("Vendor ") ||
        error.message.startsWith("Tiket ") ||
        error.message.startsWith("Item tiket ") ||
        error.message.startsWith("Satu atau lebih") ||
        error.message.startsWith("Rekening "))
        ? error.message
        : "Pembelian stok gagal dicatat. Periksa data lalu coba kembali.",
    );
  }
}

export async function approveDirectStockPurchaseByDirector(
  purchaseId: string,
): Promise<DirectStockPurchaseActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.DIRECTOR &&
      session.user.role !== UserRole.DEPUTY_DIRECTOR)
  ) {
    return directPurchaseFailure(
      "Hanya Direktur atau Wakil Direktur yang dapat menyetujui pembelian langsung.",
    );
  }
  if (typeof purchaseId !== "string" || !purchaseId.trim()) {
    return directPurchaseFailure("Data pembelian tidak valid.");
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const purchase = await transaction.directStockPurchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          purchaseNumber: true,
          isApprovedByDirector: true,
          ticketId: true,
        },
      });
      if (!purchase) throw new Error("Pembelian langsung tidak ditemukan.");
      if (purchase.isApprovedByDirector) {
        throw new Error("Pembelian ini sudah disetujui Direktur.");
      }
      const approval = await transaction.directStockPurchase.updateMany({
        where: { id: purchase.id, isApprovedByDirector: false },
        data: {
          isApprovedByDirector: true,
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });
      if (approval.count !== 1) {
        throw new Error("Pembelian ini sudah disetujui Direktur.");
      }
      if (purchase.ticketId) {
        await transaction.ticketAuditLog.create({
          data: {
            ticketId: purchase.ticketId,
            userId: session.user.id,
            action: "DIRECT_PURCHASE_APPROVED",
            notes: `Pembelian langsung ${purchase.purchaseNumber} disetujui Direktur dan menunggu lampiran invoice/bon dari Logistik.`,
          },
        });
      }
      await sendNotification({
        roleTarget: UserRole.LOGISTICS,
        title: "Lampirkan Invoice / Bon Pembelian",
        message: `Pembelian ${purchase.purchaseNumber} disetujui Direktur. Lampirkan invoice/bon agar Keuangan dapat memproses pembayaran.`,
        actionUrl: "/apps/logistics?tab=stock",
        type: NotificationType.APPROVAL,
        database: transaction,
      });
    });
  } catch (error) {
    console.error("Direct stock purchase approval failed:", error);
    return directPurchaseFailure(
      error instanceof Error &&
        (error.message === "Pembelian langsung tidak ditemukan." ||
          error.message === "Pembelian ini sudah disetujui Direktur.")
        ? error.message
        : "Persetujuan pembelian gagal disimpan. Coba kembali.",
    );
  }

  revalidatePath("/apps/approvals");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/tickets");
  return {
    success: true,
    message: "Pembelian langsung disetujui. Logistik perlu melampirkan invoice/bon sebelum pembayaran.",
  };
}

export async function submitDirectStockPurchaseInvoice(
  formData: FormData,
): Promise<DirectStockPurchaseActionResult> {
  const purchaseId = formData.get("purchaseId");
  const documentPhoto = formData.get("invoicePhoto");
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.ADMINISTRATIONS)
  ) {
    return directPurchaseFailure(
      "Hanya Logistik atau Administrasi yang dapat melampirkan invoice/bon.",
    );
  }
  if (
    typeof purchaseId !== "string" ||
    !purchaseId.trim() ||
    !(documentPhoto instanceof File) ||
    documentPhoto.size < 1
  ) {
    return directPurchaseFailure(
      "File invoice/bon tidak valid. Pilih foto JPG, PNG, atau WEBP.",
    );
  }

  let uploadedPhotoUrl: string | null = null;
  let invoiceAttached = false;
  try {
    const purchaseBeforeUpload = await prisma.directStockPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        isApprovedByDirector: true,
        status: true,
        vendorInvoiceUrl: true,
      },
    });
    if (!purchaseBeforeUpload) {
      throw new Error("Pembelian langsung tidak ditemukan.");
    }
    if (!purchaseBeforeUpload.isApprovedByDirector) {
      throw new Error(
        "Pembelian harus disetujui Direktur sebelum invoice/bon dilampirkan.",
      );
    }
    if (purchaseBeforeUpload.status !== DirectStockPurchaseStatus.PENDING_RECEIPT) {
      throw new Error(
        "Pembelian sudah diterima dan tidak dapat dilampiri invoice/bon.",
      );
    }
    if (purchaseBeforeUpload.vendorInvoiceUrl) {
      throw new Error("Invoice/bon pembelian ini sudah dilampirkan.");
    }

    const documentUrl = (
      await uploadCloudinaryPhoto(
        documentPhoto,
        PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER,
      )
    ).secureUrl;
    uploadedPhotoUrl = documentUrl;
    if (!isPurchaseOrderInvoiceUrl(documentUrl)) {
      throw new Error("URL invoice/bon yang diunggah tidak valid.");
    }

    await prisma.$transaction(async (transaction) => {
      const purchase = await transaction.directStockPurchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          purchaseNumber: true,
          isApprovedByDirector: true,
          status: true,
          vendorInvoiceUrl: true,
        },
      });
      if (!purchase) throw new Error("Pembelian langsung tidak ditemukan.");
      if (!purchase.isApprovedByDirector) {
        throw new Error("Pembelian harus disetujui Direktur sebelum invoice/bon dilampirkan.");
      }
      if (purchase.status !== DirectStockPurchaseStatus.PENDING_RECEIPT) {
        throw new Error(
          "Pembelian sudah diterima dan tidak dapat dilampiri invoice/bon.",
        );
      }
      if (purchase.vendorInvoiceUrl) {
        throw new Error("Invoice/bon pembelian ini sudah dilampirkan.");
      }

      const updated = await transaction.directStockPurchase.updateMany({
        where: {
          id: purchase.id,
          isApprovedByDirector: true,
          status: DirectStockPurchaseStatus.PENDING_RECEIPT,
          OR: [
            { vendorInvoiceUrl: null },
            { vendorInvoiceUrl: { isSet: false } },
            { vendorInvoiceUrl: "" },
          ],
        },
        data: {
          vendorInvoiceUrl: documentUrl,
          vendorInvoiceUploadedById: session.user.id,
          vendorInvoiceUploadedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new Error("Status pembelian berubah. Muat ulang sebelum mengunggah invoice/bon.");
      }
      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "Invoice / Bon Pembelian Siap Dibayar",
        message: `Logistik telah melampirkan invoice/bon untuk pembelian ${purchase.purchaseNumber}.`,
        actionUrl: "/apps/finance?tab=payments",
        type: NotificationType.APPROVAL,
        database: transaction,
      });
    });
    invoiceAttached = true;
  } catch (error) {
    console.error("Direct stock purchase invoice submission failed:", error);
    if (uploadedPhotoUrl && !invoiceAttached) {
      try {
        await removeCloudinaryPhoto(uploadedPhotoUrl);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up unattached direct stock purchase invoice:",
          cleanupError,
        );
      }
    }
    return directPurchaseFailure(
      error instanceof CloudinaryPhotoValidationError ||
        error instanceof CloudinaryConfigurationError ||
        (error instanceof Error &&
          (error.message === "Pembelian langsung tidak ditemukan." ||
            error.message === "Invoice/bon pembelian ini sudah dilampirkan." ||
            error.message ===
            "Pembelian sudah diterima dan tidak dapat dilampiri invoice/bon." ||
          error.message ===
            "Pembelian harus disetujui Direktur sebelum invoice/bon dilampirkan." ||
          error.message.startsWith("Status pembelian berubah.")))
        ? error.message
        : "Invoice/bon gagal dilampirkan. Muat ulang dan coba kembali.",
    );
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/tickets");
  return {
    success: true,
    message: "Invoice/bon berhasil dilampirkan dan dikirim ke antrean Keuangan.",
  };
}

export async function receiveDirectStockPurchase(
  formData: FormData,
): Promise<DirectStockPurchaseActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.ADMINISTRATIONS)
  ) {
    return directPurchaseFailure(
      "Hanya Logistik atau Administrasi yang dapat menerima pembelian stok.",
    );
  }

  const purchaseId = formData.get("purchaseId");
  const submittedPhotos = formData.getAll("receivedPhotos");
  const receivedPhotoFiles = submittedPhotos.filter(
    (photo): photo is File => photo instanceof File,
  );
  if (
    typeof purchaseId !== "string" ||
    !purchaseId.trim() ||
    receivedPhotoFiles.length !== submittedPhotos.length ||
    receivedPhotoFiles.length < 1 ||
    receivedPhotoFiles.length > MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS
  ) {
    return directPurchaseFailure(
      `Pilih pembelian dan lampirkan 1 sampai ${MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS} foto bukti penerimaan.`,
    );
  }

  const receivedPhotos: string[] = [];
  let receiptRecorded = false;
  try {
    const purchase = await prisma.directStockPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        isApprovedByDirector: true,
        status: true,
      },
    });
    if (!purchase) {
      return directPurchaseFailure("Pembelian langsung tidak ditemukan.");
    }
    if (!purchase.isApprovedByDirector) {
      return directPurchaseFailure(
        "Pembelian langsung harus disetujui Direktur sebelum diterima.",
      );
    }
    if (purchase.status !== DirectStockPurchaseStatus.PENDING_RECEIPT) {
      return directPurchaseFailure(
        "Pembelian tidak ditemukan atau sudah pernah diterima.",
      );
    }

    const financeProof = await prisma.paymentTransaction.findFirst({
      where: {
        directStockPurchaseId: purchaseId,
        status: PaymentStatus.PAID,
        proofOfTransferUrl: { not: null },
      },
      select: { id: true },
    });
    if (!financeProof) {
      return directPurchaseFailure(
        "Bukti pembayaran dari Keuangan wajib diunggah sebelum penerimaan.",
      );
    }

    for (const photo of receivedPhotoFiles) {
      receivedPhotos.push(await saveDirectStockPurchasePhoto(photo));
    }

    const purchaseNumber = await prisma.$transaction(async (transaction) => {
      const purchase = await transaction.directStockPurchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          purchaseNumber: true,
          isApprovedByDirector: true,
          ticketId: true,
        },
      });
      if (!purchase) {
        throw new Error("Pembelian langsung tidak ditemukan.");
      }
      if (!purchase.isApprovedByDirector) {
        throw new Error(
          "Pembelian langsung harus disetujui Direktur sebelum diterima.",
        );
      }

      const financeProof = await transaction.paymentTransaction.findFirst({
        where: {
          directStockPurchaseId: purchase.id,
          status: PaymentStatus.PAID,
          proofOfTransferUrl: { not: null },
        },
        select: { id: true },
      });
      if (!financeProof) {
        throw new Error(
          "Bukti pembayaran dari Keuangan wajib diunggah sebelum penerimaan.",
        );
      }

      const receipt = await transaction.directStockPurchase.updateMany({
        where: {
          id: purchaseId,
          status: DirectStockPurchaseStatus.PENDING_RECEIPT,
        },
        data: {
          status: DirectStockPurchaseStatus.RECEIVED,
          receivedAt: new Date(),
          receivedById: session.user.id,
          arrivalPhotoUrl: receivedPhotos[0],
          receivedPhotos,
        },
      });
      if (receipt.count !== 1) {
        throw new Error(
          "Pembelian tidak ditemukan atau sudah pernah diterima.",
        );
      }

      const receivedPurchase =
        await transaction.directStockPurchase.findUniqueOrThrow({
          where: { id: purchaseId },
          select: {
            vendorName: true,
            notes: true,
            items: {
              select: {
                stockItemId: true,
                itemName: true,
                unit: true,
                quantity: true,
                unitPrice: true,
              },
            },
          },
        });
      const groupedItems = new Map<
        string,
        {
          itemName: string;
          unit: string;
          quantity: Prisma.Decimal;
          purchaseValue: Prisma.Decimal;
        }
      >();
      for (const item of receivedPurchase.items) {
        const group = groupedItems.get(item.stockItemId) ?? {
          itemName: item.itemName,
          unit: item.unit,
          quantity: new Prisma.Decimal(0),
          purchaseValue: new Prisma.Decimal(0),
        };
        const receivedQuantity = decimalFromScaledInteger(item.quantity);
        group.quantity = group.quantity.plus(receivedQuantity);
        group.purchaseValue = group.purchaseValue.plus(
          receivedQuantity.mul(decimalFromScaledInteger(item.unitPrice)),
        );
        groupedItems.set(item.stockItemId, group);
      }

      for (const [stockItemId, group] of groupedItems) {
        const stockItem = await transaction.stockItem.findUniqueOrThrow({
          where: { id: stockItemId },
          select: { stockQuantity: true, unitPrice: true },
        });
        const previousValue = decimalFromScaledInteger(
          stockItem.stockQuantity,
        ).mul(decimalFromScaledInteger(stockItem.unitPrice));
        const newQuantity = decimalFromScaledInteger(
          stockItem.stockQuantity,
        ).plus(group.quantity);
        const averageUnitPrice = previousValue
          .plus(group.purchaseValue)
          .div(newQuantity)
          .toDecimalPlaces(2);
        await transaction.stockItem.update({
          where: { id: stockItemId },
          data: {
            stockQuantity: scaledIntegerFromDecimal(newQuantity),
            unitPrice: scaledIntegerFromDecimal(averageUnitPrice),
          },
        });
        await transaction.stockMovement.create({
          data: {
            stockItemId,
            type: "IN",
            materialName: group.itemName,
            quantity: scaledIntegerFromDecimal(group.quantity),
            unit: group.unit,
            reference: purchase.purchaseNumber,
            notes:
              receivedPurchase.notes?.trim() ||
              `Penerimaan pembelian langsung dari ${receivedPurchase.vendorName}.`,
            createdById: session.user.id,
          },
        });
      }
      if (purchase.ticketId) {
        await transaction.ticketAuditLog.create({
          data: {
            ticketId: purchase.ticketId,
            userId: session.user.id,
            action: "DIRECT_PURCHASE_RECEIVED",
            notes: `Pembelian langsung ${purchase.purchaseNumber} diterima Logistik dengan ${receivedPhotos.length} foto bukti.`,
          },
        });
      }
      return purchase.purchaseNumber;
    });
    receiptRecorded = true;

    revalidatePath("/apps/logistics/stock");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    return {
      success: true,
      message: `Pembelian ${purchaseNumber} diterima. Saldo stok telah diperbarui.`,
      purchaseNumber,
    };
  } catch (error) {
    if (!receiptRecorded) {
      for (const photoUrl of receivedPhotos) {
        try {
          await removeDirectStockPurchasePhoto(photoUrl);
        } catch (cleanupError) {
          console.error("Direct stock purchase photo cleanup failed:", cleanupError);
        }
      }
    }
    console.error("Direct stock purchase receipt failed:", error);
    const publicMessage =
      error instanceof DirectStockPurchasePhotoValidationError ||
      error instanceof CloudinaryConfigurationError
        ? error.message
        : error instanceof Error &&
            (error.message.startsWith("Pembelian tidak ditemukan") ||
              error.message === "Pembelian langsung tidak ditemukan." ||
              error.message ===
                "Pembelian langsung harus disetujui Direktur sebelum diterima." ||
              error.message ===
                "Bukti pembayaran dari Keuangan wajib diunggah sebelum penerimaan.")
          ? error.message
          : null;
    return directPurchaseFailure(
      publicMessage ??
        "Penerimaan pembelian gagal dicatat. Periksa data lalu coba kembali.",
    );
  }
}

export async function deleteLogisticsStockItem(
  id: string,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk sebelum menghapus barang persediaan.");
  }
  if (
    session.user.role !== UserRole.LOGISTICS &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return actionFailure("Hanya Logistik yang dapat menghapus barang persediaan.");
  }
  if (typeof id !== "string" || !id.trim()) {
    return actionFailure("Barang persediaan yang dipilih tidak valid.");
  }

  try {
    const item = await prisma.stockItem.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!item) {
      return actionFailure("Barang persediaan sudah tidak ditemukan.");
    }
    await prisma.stockItem.delete({ where: { id: item.id } });
    revalidatePath("/apps/logistics/stock");
    revalidatePath("/apps/logistics");
    return {
      success: true,
      message: `Barang ${item.name} berhasil dihapus dari katalog persediaan.`,
    };
  } catch (error) {
    console.error("Logistics stock item deletion failed:", error);
    return actionFailure(
      "Barang gagal dihapus. Data mungkin sedang diperbarui; muat ulang halaman lalu coba kembali.",
    );
  }
}

export async function importLogisticsStockCsv(
  csvText: string,
): Promise<TicketActionResult & { importedCount?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk sebelum mengimpor katalog stok.");
  }
  if (
    session.user.role !== UserRole.LOGISTICS &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return actionFailure("Hanya Logistik yang dapat mengimpor katalog stok.");
  }
  if (typeof csvText !== "string" || csvText.length > 1_000_000) {
    return actionFailure("File CSV tidak valid atau melebihi batas 1 MB.");
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (quoted) {
      if (character === '"') {
        if (csvText[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      if (character === "\r" && csvText[index + 1] === "\n") index += 1;
    } else if (character === '"') {
      return actionFailure("Format CSV salah: tanda kutip tidak berpasangan.");
    } else {
      field += character;
    }
  }
  if (quoted) {
    return actionFailure("Format CSV salah: tanda kutip tidak berpasangan.");
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  const header = rows.shift()?.map((cell) => cell.trim().toLocaleLowerCase("id-ID"));
  const expectedHeader = [
    "sku",
    "nama barang",
    "satuan",
    "stok",
    "batas minimum",
    "harga satuan",
  ];
  if (
    !header ||
    expectedHeader.some((cell, index) => header[index] !== cell) ||
    rows.length < 1 ||
    rows.length > 500
  ) {
    return actionFailure(
      "CSV harus memiliki header SKU, Nama Barang, Satuan, Stok, Batas Minimum, Harga Satuan dan 1-500 baris data.",
    );
  }

  const seenSkus = new Set<string>();
  const importedItems: {
    sku: string;
    name: string;
    unit: string;
    stockQuantity: bigint;
    minimumStock: bigint;
    unitPrice: bigint;
  }[] = [];
  for (const [index, values] of rows.entries()) {
    const [rawSku, rawName, rawUnit, rawQuantity, rawMinimum, rawPrice] = values;
    const sku = rawSku?.trim().toUpperCase();
    const name = rawName?.trim();
    const unit = rawUnit?.trim();
    const decimalFields = [
      { value: rawQuantity, scale: 3, precision: 14 },
      { value: rawMinimum, scale: 3, precision: 14 },
      { value: rawPrice, scale: 2, precision: 18 },
    ];
    const decimalInputsValid = decimalFields.every(
      ({ value, scale, precision }) =>
        typeof value === "string" &&
        new RegExp(
          `^\\d{1,${precision - scale}}(?:\\.\\d{1,${scale}})?$`,
        ).test(value.trim()),
    );
    if (
      values.length < 6 ||
      !sku ||
      !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(sku) ||
      !name ||
      name.length > 120 ||
      !unit ||
      unit.length > 24 ||
      !decimalInputsValid
    ) {
      return actionFailure(`Data pada baris ${index + 2} tidak valid.`);
    }
    if (seenSkus.has(sku)) {
      return actionFailure(`SKU ${sku} duplikat pada file CSV.`);
    }
    seenSkus.add(sku);
    importedItems.push({
      sku,
      name,
      unit,
      stockQuantity: scaledIntegerFromDecimal(rawQuantity.trim()),
      minimumStock: scaledIntegerFromDecimal(rawMinimum.trim()),
      unitPrice: scaledIntegerFromDecimal(rawPrice.trim()),
    });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      for (const item of importedItems) {
        await transaction.stockItem.upsert({
          where: { sku: item.sku },
          update: {
            name: item.name,
            unit: item.unit,
            stockQuantity: item.stockQuantity,
            minimumStock: item.minimumStock,
            unitPrice: item.unitPrice,
          },
          create: item,
        });
      }
    });
  } catch (error) {
    console.error("Logistics stock CSV import failed:", error);
    return actionFailure(
      "Impor CSV gagal. Tidak ada perubahan yang disimpan; periksa data lalu coba kembali.",
    );
  }

  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/logistics");
  return {
    success: true,
    importedCount: importedItems.length,
    message: `${importedItems.length} barang berhasil diimpor atau diperbarui.`,
  };
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk sebelum membuat tiket.");
  }

  if (!input || typeof input !== "object") {
    return actionFailure("Data tiket tidak valid.");
  }

  if (
    typeof input.title !== "string" ||
    input.title.trim().length < 3 ||
    input.title.trim().length > 160
  ) {
    return actionFailure("Judul harus terdiri dari 3 sampai 160 karakter.");
  }
  if (
    !isTicketType(input.type) ||
    !isTicketPriority(input.priority) ||
    (input.requestCategory !== undefined &&
      !Object.values(TicketRequestCategory).includes(input.requestCategory)) ||
    !Array.isArray(input.items) ||
    input.items.length > 100
  ) {
    return actionFailure("Jenis, prioritas, atau rincian tiket tidak valid.");
  }
  const requestCategory =
    input.requestCategory ??
    (input.type === TicketType.OPERATIONAL
      ? TicketRequestCategory.OPS
      : input.type === TicketType.MATERIAL
        ? TicketRequestCategory.MATERIAL
        : TicketRequestCategory.OFFICE);
  const isWarehouseRequest =
    requestCategory === TicketRequestCategory.WAREHOUSE;
  const isFieldRequest =
    requestCategory === TicketRequestCategory.FIELD;
  const isShippingCostRequest =
    requestCategory === TicketRequestCategory.SHIPPING_COST;
  const isOfficeRequest =
    requestCategory === TicketRequestCategory.OFFICE;
  const isAPHRequest = requestCategory === TicketRequestCategory.APH;
  const isInternalFundingRequest = [
    TicketRequestCategory.REIMBURSEMENT,
    TicketRequestCategory.KASBON,
    TicketRequestCategory.OPERATING_EXPENSE,
  ].some((category) => category === requestCategory);
  if (
    isShippingCostRequest &&
    session.user.role !== UserRole.LOGISTICS &&
    session.user.role !== UserRole.DIRECTOR
  ) {
    return actionFailure(
      "Permintaan biaya pengiriman hanya dapat dibuat oleh Logistik atau Direktur.",
    );
  }
  const isFieldTeamInternalFundingRequest =
    requestCategory === TicketRequestCategory.REIMBURSEMENT ||
    requestCategory === TicketRequestCategory.KASBON;
  const isMoverReimbursementRequest =
    requestCategory === TicketRequestCategory.REIMBURSEMENT;
  if (
    isInternalFundingRequest &&
    session.user.role !== UserRole.DRAFTER &&
    !(
      (session.user.role === UserRole.FIELD_TEAM ||
        session.user.role === UserRole.KOORDINATOR) &&
      isFieldTeamInternalFundingRequest
    ) &&
    !(
      session.user.role === UserRole.MOVER &&
      isMoverReimbursementRequest
    )
  ) {
    return actionFailure(
      "Pengajuan reimbursement dan kasbon hanya dapat dibuat oleh Drafter, Tim Lapangan, atau Koordinator Lapangan.",
    );
  }
  if (
    isOfficeRequest &&
    session.user.role !== UserRole.ADMINISTRATIONS &&
    session.user.role !== UserRole.DRAFTER &&
    session.user.role !== UserRole.FINANCE
  ) {
    return actionFailure(
      "Permintaan belanja kantor hanya dapat dibuat oleh Admin, Drafter, atau Keuangan.",
    );
  }
  if (isFieldRequest && session.user.role !== UserRole.FIELD_TEAM) {
    return actionFailure(
      "Kebutuhan lapangan hanya dapat diajukan oleh Tim Lapangan.",
    );
  }
  if (
    session.user.role === UserRole.FIELD_TEAM &&
    (isFieldRequest ||
      requestCategory === TicketRequestCategory.MATERIAL ||
      (isInternalFundingRequest && !isFieldTeamInternalFundingRequest))
  ) {
    return actionFailure(
      "Tim Lapangan hanya dapat mengajukan material dari Gudang, Operasional, Reimbursement, atau Kasbon.",
    );
  }
  if (
    session.user.role === UserRole.MOVER &&
    isInternalFundingRequest &&
    !isMoverReimbursementRequest
  ) {
    return actionFailure(
      "Pengangkut hanya dapat membuat pengajuan reimbursement.",
    );
  }
  const receiptFiles = input.receiptFiles ?? [];
  if (
    !Array.isArray(receiptFiles) ||
    receiptFiles.length > 5 ||
    receiptFiles.some(
      (file) =>
        !(file instanceof File) ||
        file.size < 1 ||
        file.size > 10 * 1024 * 1024 ||
        ![
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
        ].includes(file.type),
    ) ||
    (requestCategory !== TicketRequestCategory.REIMBURSEMENT &&
      receiptFiles.length > 0) ||
    (requestCategory === TicketRequestCategory.REIMBURSEMENT &&
      receiptFiles.length === 0)
  ) {
    return actionFailure(
      "Bukti struk/nota tidak valid; reimbursement wajib menyertakan minimal satu bukti.",
    );
  }
  if (
    isAPHRequest &&
    session.user.role !== UserRole.DIRECTOR &&
    session.user.role !== UserRole.FINANCE
  ) {
    return actionFailure("APH hanya dapat diminta oleh Direktur atau Keuangan.");
  }
  const requiresProject =
    requestCategory === TicketRequestCategory.MATERIAL ||
    requestCategory === TicketRequestCategory.WAREHOUSE ||
    isFieldRequest;
  const isDirectStore =
    isFieldRequest &&
    input.fieldCategory === TicketFieldCategory.DIRECT_STORE;
  const requiresRecipientPayment =
    isFieldRequest &&
    input.fieldCategory !== undefined &&
    input.fieldCategory !== TicketFieldCategory.DIRECT_STORE;
  const isOperationalFunding =
    requestCategory === TicketRequestCategory.OPS;
  const requiresRequestedAmount =
    requiresRecipientPayment ||
    isOperationalFunding ||
    isAPHRequest ||
    isInternalFundingRequest ||
    isShippingCostRequest;
  let operationalRecipient: {
    name: string;
    bankName: string;
    accountNumber: string;
  } | null = null;
  const expectedType =
    requestCategory === TicketRequestCategory.OPS
      ? TicketType.OPERATIONAL
      : requestCategory === TicketRequestCategory.MATERIAL ||
          isWarehouseRequest ||
          isDirectStore
        ? TicketType.MATERIAL
        : TicketType.COST;

  if (isAPHRequest) {
    if (
      !input.requestPaymentMethod ||
      !Object.values(POPaymentMethod).includes(input.requestPaymentMethod) ||
      !isBoundedText(input.requestPaymentDescription, 2000) ||
      (input.requestPaymentMethod === POPaymentMethod.TRANSFER &&
        !isBoundedText(input.transferDestination, 300)) ||
      (input.requestPaymentMethod === POPaymentMethod.CASH &&
        input.transferDestination !== undefined)
    ) {
      return actionFailure(
        "Metode pembayaran, tujuan transfer, atau keterangan APH tidak valid.",
      );
    }
  } else if (
    input.requestPaymentMethod !== undefined ||
    input.transferDestination !== undefined ||
    input.requestPaymentDescription !== undefined
  ) {
    return actionFailure("Detail pembayaran APH tidak boleh digunakan pada tiket lain.");
  }

  if (
    (isFieldRequest &&
      (!input.fieldCategory ||
        !Object.values(TicketFieldCategory).includes(input.fieldCategory) ||
        input.fieldCategory === TicketFieldCategory.DIRECT_STORE)) ||
    (!isFieldRequest && input.fieldCategory !== undefined) ||
    input.type !== expectedType
  ) {
    return actionFailure("Kategori permintaan tidak sesuai dengan jenis tiket.");
  }
  if (isShippingCostRequest) {
    if (
      typeof input.originCity !== "string" ||
      input.originCity.trim().length < 1 ||
      input.originCity.trim().length > 120 ||
      typeof input.destinationCity !== "string" ||
      input.destinationCity.trim().length < 1 ||
      input.destinationCity.trim().length > 120 ||
      (input.relatedDocumentNumbers !== undefined &&
        (typeof input.relatedDocumentNumbers !== "string" ||
          input.relatedDocumentNumbers.length > 2000)) ||
      typeof input.requestedAmount !== "number" ||
      !Number.isSafeInteger(input.requestedAmount) ||
      input.requestedAmount <= 0 ||
      input.requestedAmount > Number.MAX_SAFE_INTEGER ||
      input.items.length > 0
    ) {
      return actionFailure(
        "Rute, nominal, atau dokumen terkait biaya pengiriman tidak valid.",
      );
    }
  } else if (
    input.originCity !== undefined ||
    input.destinationCity !== undefined ||
    input.relatedDocumentNumbers !== undefined
  ) {
    return actionFailure(
      "Detail rute hanya dapat digunakan pada permintaan biaya pengiriman.",
    );
  }
  if (
    input.moverAssigneeId !== undefined &&
    session.user.role !== UserRole.LOGISTICS &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return actionFailure(
      "Mover hanya dapat dipilih oleh Koordinator Logistik.",
    );
  }
  if (requiresRecipientPayment) {
    if (
      typeof input.recipientName !== "string" ||
      input.recipientName.trim().length < 2 ||
      input.recipientName.trim().length > 120 ||
      typeof input.bankName !== "string" ||
      input.bankName.trim().length < 2 ||
      input.bankName.trim().length > 80 ||
      typeof input.accountNumber !== "string" ||
      !/^[0-9]{6,30}$/.test(input.accountNumber.trim()) ||
      typeof input.requestedAmount !== "number" ||
      !Number.isSafeInteger(input.requestedAmount) ||
      input.requestedAmount <= 0 ||
      input.requestedAmount > Number.MAX_SAFE_INTEGER
    ) {
      return actionFailure(
        "Nama penerima, bank, nomor rekening, dan biaya wajib diisi dengan benar.",
      );
    }
    if (input.items.length > 0) {
      return actionFailure(
        "Permintaan biaya lapangan tidak boleh berisi rincian material.",
      );
    }
  } else if (isOperationalFunding) {
    if (
      typeof input.requestedAmount !== "number" ||
      !Number.isSafeInteger(input.requestedAmount) ||
      input.requestedAmount <= 0 ||
      input.requestedAmount > Number.MAX_SAFE_INTEGER
    ) {
      return actionFailure(
        "Jumlah dana operasional harus berupa angka lebih besar dari 0.",
      );
    }
    if (input.items.length > 0) {
      return actionFailure(
        "Permintaan dana operasional tidak boleh berisi rincian material.",
      );
    }
    const requesterProfile = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
      },
    });
    if (
      !requesterProfile?.bankName?.trim() ||
      !requesterProfile.bankAccountName?.trim() ||
      !requesterProfile.bankAccountNumber ||
      !/^[0-9]{6,30}$/.test(requesterProfile.bankAccountNumber)
    ) {
      return actionFailure(
        "Lengkapi nama bank, nama pemilik rekening, dan nomor rekening di Profil Saya sebelum mengajukan dana operasional.",
      );
    }
    operationalRecipient = {
      name: requesterProfile.bankAccountName.trim(),
      bankName: requesterProfile.bankName.trim(),
      accountNumber: requesterProfile.bankAccountNumber,
    };
  } else if (isAPHRequest) {
    if (
      typeof input.requestedAmount !== "number" ||
      !Number.isSafeInteger(input.requestedAmount) ||
      input.requestedAmount <= 0 ||
      input.requestedAmount > Number.MAX_SAFE_INTEGER
    ) {
      return actionFailure(
        "Jumlah dana APH harus berupa angka lebih besar dari 0.",
      );
    }
    if (input.items.length > 0) {
      return actionFailure("Permintaan dana APH tidak menggunakan rincian item.");
    }
  } else if (isInternalFundingRequest) {
    if (
      typeof input.requestedAmount !== "number" ||
      !Number.isSafeInteger(input.requestedAmount) ||
      input.requestedAmount <= 0 ||
      input.requestedAmount > Number.MAX_SAFE_INTEGER
    ) {
      return actionFailure("Nominal reimbursement/kasbon harus lebih besar dari 0.");
    }
    if (!isBoundedText(input.description, 5100)) {
      return actionFailure("Keterangan pengajuan wajib diisi.");
    }
    if (input.items.length > 0) {
      return actionFailure(
        "Pengajuan reimbursement/kasbon tidak menggunakan rincian barang.",
      );
    }
  } else if (isShippingCostRequest) {
    if (
      typeof input.requestedAmount !== "number" ||
      !Number.isSafeInteger(input.requestedAmount) ||
      input.requestedAmount <= 0 ||
      input.requestedAmount > Number.MAX_SAFE_INTEGER
    ) {
      return actionFailure(
        "Nominal biaya pengiriman harus berupa angka lebih besar dari 0.",
      );
    }
  } else if (input.items.length < 1) {
    return actionFailure("Tambahkan setidaknya satu rincian item.");
  }
  if (
    input.description !== undefined &&
    (typeof input.description !== "string" || input.description.length > 10000)
  ) {
    return actionFailure("Deskripsi tiket terlalu panjang atau tidak valid.");
  }
  if (
    input.projectId !== undefined &&
    (typeof input.projectId !== "string" || input.projectId.length > 100)
  ) {
    return actionFailure("Proyek yang dipilih tidak valid.");
  }
  if (requiresProject && !input.projectId) {
    return actionFailure(
      "Pilih proyek agar biaya dan pengiriman material dapat dilacak.",
    );
  }
  if (
    input.attachmentUrl !== undefined &&
    (typeof input.attachmentUrl !== "string" ||
      input.attachmentUrl.length > 2048 ||
      !validHttpUrl(input.attachmentUrl))
  ) {
    return actionFailure("Lampiran harus berupa URL HTTP atau HTTPS yang valid.");
  }

  let relatedPoIds: string[] = [];
  let relatedTicketIds: string[] = [];
  if (isShippingCostRequest) {
    const relatedDocumentNumbers = [
      ...new Set(
        (input.relatedDocumentNumbers ?? "")
          .split(",")
          .map((number) => number.trim())
          .filter(Boolean)
          .map((number) => number.toLocaleUpperCase("id-ID")),
      ),
    ];
    if (
      relatedDocumentNumbers.length > 20 ||
      relatedDocumentNumbers.some((number) => number.length > 120)
    ) {
      return actionFailure(
        "Maksimal 20 nomor PO atau tiket dapat dikaitkan; tiap nomor maksimal 120 karakter.",
      );
    }
    if (relatedDocumentNumbers.length > 0) {
      const [purchaseOrders, tickets] = await Promise.all([
        prisma.purchaseOrder.findMany({
          where: {
            OR: relatedDocumentNumbers.map((number) => ({
              poNumber: { equals: number, mode: "insensitive" as const },
            })),
          },
          select: { id: true, poNumber: true },
        }),
        prisma.ticket.findMany({
          where: {
            OR: relatedDocumentNumbers.map((number) => ({
              ticketNumber: { equals: number, mode: "insensitive" as const },
            })),
          },
          select: { id: true, ticketNumber: true, type: true },
        }),
      ]);
      const purchaseOrdersByNumber = new Map(
        purchaseOrders.map((purchaseOrder) => [
          purchaseOrder.poNumber.toLocaleLowerCase("id-ID"),
          purchaseOrder,
        ]),
      );
      const ticketsByNumber = new Map(
        tickets.map((ticket) => [
          ticket.ticketNumber.toLocaleLowerCase("id-ID"),
          ticket,
        ]),
      );
      const unresolvedNumbers: string[] = [];
      for (const number of relatedDocumentNumbers) {
        const key = number.toLocaleLowerCase("id-ID");
        const purchaseOrder = purchaseOrdersByNumber.get(key);
        const ticket = ticketsByNumber.get(key);
        if (purchaseOrder && ticket) {
          return actionFailure(
            `Nomor "${number}" cocok dengan PO dan tiket sekaligus. Gunakan nomor dokumen yang tidak ambigu.`,
          );
        }
        if (ticket && ticket.type !== TicketType.MATERIAL) {
          return actionFailure(
            `Tiket "${number}" bukan permintaan belanja material yang dapat dikaitkan.`,
          );
        }
        if (purchaseOrder) {
          relatedPoIds.push(purchaseOrder.id);
        } else if (ticket) {
          relatedTicketIds.push(ticket.id);
        } else {
          unresolvedNumbers.push(number);
        }
      }
      if (unresolvedNumbers.length > 0) {
        return actionFailure(
          `Dokumen terkait tidak ditemukan: ${unresolvedNumbers.join(", ")}.`,
        );
      }
    }
  }

  const supportsItemSource =
    input.type === TicketType.MATERIAL &&
    (requestCategory === TicketRequestCategory.MATERIAL ||
      isWarehouseRequest);
  const stockItemIds = input.items.flatMap((item) =>
    typeof item?.stockItemId === "string" ? [item.stockItemId] : [],
  );
  const warehouseStockItems = stockItemIds.length
    ? await prisma.stockItem.findMany({
        where: { id: { in: [...new Set(stockItemIds)] } },
        select: { id: true, name: true, unit: true },
      })
    : [];
  if (warehouseStockItems.length !== new Set(stockItemIds).size) {
    return actionFailure("Pilih barang yang masih tersedia di katalog gudang.");
  }
  const warehouseItemsById = new Map(
    warehouseStockItems.map((item) => [item.id, item]),
  );
  const selectedStockIds = new Set<string>();
  const items: TicketItemInput[] = [];
  for (const item of input.items) {
    const categoryHint = supportsItemSource
      ? item?.categoryHint ?? TicketCategoryHint.WAREHOUSE
      : TicketCategoryHint.PURCHASE;
    const stockItem =
      typeof item?.stockItemId === "string"
        ? warehouseItemsById.get(item.stockItemId)
        : undefined;
    const expectedDeliveryDate =
      typeof item?.expectedDeliveryDate === "string"
        ? item.expectedDeliveryDate
        : undefined;
    const parsedDeliveryDate = expectedDeliveryDate
      ? new Date(`${expectedDeliveryDate}T00:00:00.000Z`)
      : null;
    if (
      !item ||
      (supportsItemSource &&
        !Object.values(TicketCategoryHint).includes(categoryHint)) ||
      (isWarehouseRequest &&
        categoryHint !== TicketCategoryHint.WAREHOUSE) ||
      (categoryHint === TicketCategoryHint.WAREHOUSE &&
        isWarehouseRequest &&
        !stockItem) ||
      (item.stockItemId !== undefined &&
        (typeof item.stockItemId !== "string" || !stockItem)) ||
      (categoryHint === TicketCategoryHint.WAREHOUSE &&
        (!expectedDeliveryDate ||
          !/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate) ||
          !parsedDeliveryDate ||
          Number.isNaN(parsedDeliveryDate.getTime()) ||
          parsedDeliveryDate.toISOString().slice(0, 10) !==
            expectedDeliveryDate)) ||
      (!stockItem &&
        (typeof item.itemName !== "string" ||
          item.itemName.trim().length < 1 ||
          item.itemName.trim().length > 160 ||
          typeof item.unit !== "string" ||
          item.unit.trim().length < 1 ||
          item.unit.trim().length > 32)) ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 1_000_000_000 ||
      (item.stockItemId !== undefined &&
        selectedStockIds.has(item.stockItemId)) ||
      (item.estimatedCost !== undefined &&
        item.estimatedCost !== null &&
        (typeof item.estimatedCost !== "number" ||
          !Number.isFinite(item.estimatedCost) ||
          item.estimatedCost < 0 ||
          item.estimatedCost > 1_000_000_000_000_000))
    ) {
      return actionFailure("Periksa nama, jumlah, satuan, dan biaya setiap item.");
    }
    if (item.stockItemId) {
      selectedStockIds.add(item.stockItemId);
    }
    items.push({
      stockItemId: item.stockItemId,
      itemName: stockItem?.name ?? item.itemName.trim(),
      quantity: item.quantity,
      unit: stockItem?.unit ?? item.unit.trim(),
      estimatedCost:
        categoryHint === TicketCategoryHint.WAREHOUSE
          ? null
          : item.estimatedCost,
      categoryHint,
      expectedDeliveryDate:
        categoryHint === TicketCategoryHint.WAREHOUSE
          ? expectedDeliveryDate
          : null,
    });
  }

  const moverAssignee = input.moverAssigneeId
    ? await prisma.user.findFirst({
        where: {
          id: input.moverAssigneeId,
          role: UserRole.MOVER,
          isActive: true,
        },
        select: { id: true },
      })
    : null;
  if (input.moverAssigneeId && !moverAssignee) {
    return actionFailure("Mover tidak ditemukan atau sudah tidak aktif.");
  }

  if (input.projectId) {
    const isFieldPic =
      session.user.role === UserRole.FIELD_TEAM ||
      session.user.role === UserRole.KOORDINATOR;
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        isDeleted: false,
        ...(isFieldPic ? { fieldPicId: session.user.id } : {}),
      },
      select: { id: true },
    });
    if (!project) {
      return actionFailure(
        "Proyek tidak ditemukan, telah diarsipkan, atau bukan proyek penugasan Anda.",
      );
    }
  }

  const pricedItems = items.filter((item) => item.estimatedCost !== undefined && item.estimatedCost !== null);
  let totalAmount: Prisma.Decimal | null = requiresRequestedAmount
    ? new Prisma.Decimal(input.requestedAmount!.toString()).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      )
    : null;
  if (pricedItems.length > 0) {
    totalAmount = pricedItems.reduce((sum, item) => {
      if (item.estimatedCost === undefined || item.estimatedCost === null) {
        return sum;
      }
      return sum.plus(
        new Prisma.Decimal(item.quantity.toString()).times(
          item.estimatedCost.toString(),
        ),
      );
    },
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (totalAmount?.greaterThan("9999999999999999.99")) {
      return actionFailure("Total estimasi melebihi batas yang dapat disimpan.");
    }
  }

  let ticketNumber = "";
  const receiptUrls: string[] = [];
  try {
    for (const file of receiptFiles) {
      if (file.type === "application/pdf") {
        receiptUrls.push(
          await uploadCloudinaryRawFile(
            file,
            REQUEST_DOCUMENT_CLOUDINARY_FOLDER,
            ["pdf"],
            10 * 1024 * 1024,
          ),
        );
      } else {
        receiptUrls.push(
          (
            await uploadCloudinaryPhoto(
              file,
              REQUEST_DOCUMENT_CLOUDINARY_FOLDER,
              10 * 1024 * 1024,
            )
          ).secureUrl,
        );
      }
    }
    if (receiptUrls.some((url) => !isTicketRequestReceiptUrl(url))) {
      throw new Error("URL bukti reimbursement yang diunggah tidak valid.");
    }
    await retryTicketNumberTransaction(() =>
      nextTicketNumber(prisma).then((generatedTicketNumber) => {
        ticketNumber = generatedTicketNumber;
        return prisma.$transaction(async (transaction) => {
      await transaction.ticket.create({
        data: {
          id: randomUUID(),
          ticketNumber,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          type: input.type,
          requestCategory,
          ...(isShippingCostRequest
            ? {
                shippingDetails: {
                  originCity: input.originCity!.trim(),
                  destinationCity: input.destinationCity!.trim(),
                },
                relatedPoIds,
                relatedTicketIds,
              }
            : {}),
          fieldCategory: input.fieldCategory ?? null,
          requestPaymentMethod: isAPHRequest
            ? input.requestPaymentMethod
            : null,
          requestPaymentDescription: isAPHRequest
            ? input.requestPaymentDescription!.trim()
            : null,
          transferDestination: isAPHRequest
            ? input.transferDestination?.trim() || null
            : null,
          priority: input.priority,
          status: isInternalFundingRequest
            ? TicketStatus.PENDING_DIRECTOR
            : TicketStatus.DRAFT,
          totalAmount:
            totalAmount === null ? null : scaledIntegerFromDecimal(totalAmount),
          requestedAmount: requiresRequestedAmount
            ? input.requestedAmount!
            : null,
          receiptUrls: isInternalFundingRequest ? receiptUrls : [],
          paymentProofUrl: null,
          attachmentUrl: input.attachmentUrl?.trim() || null,
          recipientName: requiresRecipientPayment
            ? input.recipientName!.trim()
            : operationalRecipient?.name ?? null,
          bankName: requiresRecipientPayment
            ? input.bankName!.trim()
            : operationalRecipient?.bankName ?? null,
          accountNumber: requiresRecipientPayment
            ? input.accountNumber!.trim()
            : operationalRecipient?.accountNumber ?? null,
          requesterId: session.user.id,
          moverAssigneeId: moverAssignee?.id ?? null,
          projectId: input.projectId || null,
          updatedAt: new Date(),
          items: {
            create: items.map((item) => ({
              id: randomUUID(),
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              estimatedCost:
                item.estimatedCost === undefined || item.estimatedCost === null
                  ? null
                  : scaledIntegerFromDecimal(item.estimatedCost),
              categoryHint: item.categoryHint,
              expectedDeliveryDate: item.expectedDeliveryDate
                ? new Date(`${item.expectedDeliveryDate}T00:00:00.000Z`)
                : null,
            })),
          },
          auditLogs: {
            create: {
              id: randomUUID(),
              userId: session.user.id,
              action: "CREATED",
              notes: isInternalFundingRequest
                ? "Pengajuan reimbursement/kasbon diajukan untuk persetujuan Direktur."
                : "Draft tiket dibuat.",
            },
          },
        },
      });
      if (isInternalFundingRequest) {
        await sendNotification({
          roleTarget: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
          title: "Pengajuan Internal Menunggu Persetujuan",
          message: `${ticketNumber} · ${input.title.trim()} menunggu persetujuan Direktur.`,
          actionUrl: `/apps/approvals?tab=direct-purchase&openSheet=${encodeURIComponent(ticketNumber)}`,
          type: NotificationType.APPROVAL,
          database: transaction,
        });
      }
        }, { maxWait: 30000, timeout: 60000 });
      }),
    );
  } catch (error) {
    await Promise.all(
      receiptUrls.map(async (url) => {
        try {
          if (url.includes("/raw/upload/")) {
            await removeCloudinaryRawFile(url);
          } else {
            await removeCloudinaryPhoto(url);
          }
        } catch (cleanupError) {
          console.error("Removing unattached reimbursement receipt failed:", cleanupError);
        }
      }),
    );
    if (isTicketNumberConflict(error)) {
      return actionFailure("Nomor tiket bentrok. Silakan coba kembali.");
    }
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryRawFileValidationError
    ) {
      return actionFailure(error.message);
    }
    console.error("Ticket creation failed:", error);
    return actionFailure("Tiket gagal dibuat. Silakan coba kembali.");
  }

  if (moverAssignee) {
    try {
      await sendPushNotification(moverAssignee.id, {
        title: "Tiket baru ditugaskan kepada Anda",
        body: `${ticketNumber} · ${input.title.trim()}`,
        url: "/apps/tickets",
      });
    } catch (error) {
      console.error("New ticket push notification failed:", error);
    }
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/project");
  return {
    success: true,
    message: isInternalFundingRequest
      ? "Pengajuan berhasil dikirim ke Direktur untuk persetujuan."
      : "Draft tiket berhasil dibuat.",
  };
}

export async function getShippingDocumentOptions(): Promise<
  | { success: true; options: ShippingDocumentOptions }
  | { success: false; message: string }
> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.DIRECTOR)
  ) {
    return {
      success: false,
      message: "Pilihan PO dan tiket hanya tersedia untuk Logistik atau Direktur.",
    };
  }

  const [purchaseOrders, tickets] = await Promise.all([
    prisma.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        poNumber: true,
        vendorName: true,
        status: true,
      },
    }),
    prisma.ticket.findMany({
      where: { type: TicketType.MATERIAL },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
      },
    }),
  ]);

  return {
    success: true,
    options: { purchaseOrders, tickets },
  };
}

export async function updateTicketDetails(
  ticketId: string,
  input: {
    title: string;
    description: string;
    priority: TicketPriority;
    items?: Array<{
      id: string;
      itemName: string;
      quantity: number;
      unit: string;
    }>;
  },
): Promise<TicketActionResult> {
  const unlinkedTicketItemFilter: Prisma.TicketItemWhereInput = {
    AND: [
      {
        OR: [
          { poItemId: null },
          { poItemId: { isSet: false } },
        ],
      },
      {
        OR: [
          { doItemId: null },
          { doItemId: { isSet: false } },
        ],
      },
    ],
  };
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Anda tidak memiliki izin untuk mengedit tiket.");
  }
  if (
    typeof ticketId !== "string" ||
    !ticketId ||
    !input ||
    typeof input.title !== "string" ||
    input.title.trim().length < 3 ||
    input.title.trim().length > 160 ||
    typeof input.description !== "string" ||
    input.description.length > 5000 ||
    !isTicketPriority(input.priority) ||
    (input.items !== undefined &&
      (!Array.isArray(input.items) ||
        input.items.length > 100 ||
        input.items.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            item.id.length === 0 ||
            item.id.length > 64 ||
            typeof item.itemName !== "string" ||
            item.itemName.trim().length < 1 ||
            item.itemName.trim().length > 160 ||
            typeof item.unit !== "string" ||
            item.unit.trim().length < 1 ||
            item.unit.trim().length > 32 ||
            typeof item.quantity !== "number" ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0 ||
            item.quantity > 1_000_000_000,
        ) ||
        new Set(input.items.map((item) => item.id)).size !== input.items.length))
  ) {
    return actionFailure("Data tiket tidak valid.");
  }

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          requesterId: true,
          items: {
            select: {
              id: true,
              itemName: true,
              quantity: true,
              unit: true,
              estimatedCost: true,
              poItemId: true,
              doItemId: true,
            },
          },
        },
      });
      if (!ticket) return "NOT_FOUND" as const;
      const isDirector = session.user.role === UserRole.DIRECTOR;
      const isRequester = ticket.requesterId === session.user.id;
      if (!isDirector && !isRequester) {
        return "FORBIDDEN" as const;
      }
      if (!isDirector) {
        const previousEdits = await transaction.ticketAuditLog.count({
          where: {
            ticketId,
            userId: session.user.id,
            action: { in: ["UPDATED", "REQUESTER_EDITED"] },
          },
        });
        if (previousEdits > 0) return "EDIT_LIMIT_REACHED" as const;
      }

      const currentItems = new Map(ticket.items.map((item) => [item.id, item]));
      const submittedItems = input.items;
      const keptIds = new Set(submittedItems?.map((item) => item.id) ?? []);
      if (submittedItems !== undefined) {
        if (ticket.items.length > 0 && submittedItems.length === 0) {
          return "ITEMS_REQUIRED" as const;
        }

        for (const item of submittedItems) {
          const current = currentItems.get(item.id);
          if (!current) return "INVALID_ITEMS" as const;
          if (
            (current.poItemId || current.doItemId) &&
            (item.itemName.trim() !== current.itemName ||
              item.unit.trim() !== current.unit ||
              item.quantity !== current.quantity)
          ) {
            return "ITEMS_LOCKED" as const;
          }
        }

        if (
          ticket.items.some(
            (item) =>
              (item.poItemId || item.doItemId) && !keptIds.has(item.id),
          )
        ) {
          return "ITEMS_LOCKED" as const;
        }
      }

      const result = await transaction.ticket.updateMany({
        where: { id: ticketId },
        data: {
          title: input.title.trim(),
          description: input.description.trim() || null,
          priority: input.priority,
        },
      });
      if (result.count !== 1) return "LOCKED" as const;

      if (submittedItems !== undefined) {
        for (const item of submittedItems) {
          const current = currentItems.get(item.id)!;
          if (
            current.poItemId ||
            current.doItemId ||
            (current.itemName === item.itemName.trim() &&
              current.unit === item.unit.trim() &&
              current.quantity === item.quantity)
          ) {
            continue;
          }
          const updatedItem = await transaction.ticketItem.updateMany({
            where: {
              id: item.id,
              ticketId,
              ...unlinkedTicketItemFilter,
            },
            data: {
              itemName: item.itemName.trim(),
              quantity: item.quantity,
              unit: item.unit.trim(),
            },
          });
          if (updatedItem.count !== 1) throw new Error("TICKET_ITEMS_LOCKED");
        }

        const removedItems = ticket.items.filter(
          (item) => !keptIds.has(item.id),
        );
        for (const item of removedItems) {
          const deletedItem = await transaction.ticketItem.deleteMany({
            where: {
              id: item.id,
              ticketId,
              ...unlinkedTicketItemFilter,
            },
          });
          if (deletedItem.count !== 1) throw new Error("TICKET_ITEMS_LOCKED");
        }

        if (ticket.items.some((item) => item.estimatedCost !== null)) {
          const totalAmount = submittedItems.reduce((total, item) => {
            const estimatedCost = currentItems.get(item.id)?.estimatedCost;
            if (estimatedCost === null || estimatedCost === undefined) {
              return total;
            }
            return total.plus(
              decimalFromScaledInteger(estimatedCost).times(
                item.quantity.toString(),
              ),
            );
          }, new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          await transaction.ticket.update({
            where: { id: ticketId },
            data: { totalAmount: scaledIntegerFromDecimal(totalAmount) },
          });
        }
      }

      await transaction.ticketAuditLog.create({
        data: {
          ticketId,
          userId: session.user.id,
          action: isDirector ? "UPDATED" : "REQUESTER_EDITED",
          notes: "Informasi tiket dan rincian item diperbarui.",
        },
      });
      return "UPDATED" as const;
    });

    if (updated === "NOT_FOUND") {
      return actionFailure("Tiket tidak ditemukan.");
    }
    if (updated === "FORBIDDEN") {
      return actionFailure("Anda tidak memiliki izin untuk mengedit tiket ini.");
    }
    if (updated === "LOCKED") {
      return actionFailure("Tiket sudah tidak tersedia untuk diperbarui.");
    }
    if (updated === "EDIT_LIMIT_REACHED") {
      return actionFailure("Pemohon hanya dapat mengedit tiket satu kali.");
    }
    if (updated === "ITEMS_REQUIRED") {
      return actionFailure("Tiket harus memiliki setidaknya satu item.");
    }
    if (updated === "INVALID_ITEMS") {
      return actionFailure("Rincian item tiket tidak valid. Muat ulang halaman.");
    }
    if (updated === "ITEMS_LOCKED") {
      return actionFailure(
        "Item yang sudah terhubung ke PO atau Surat Jalan tidak dapat diubah atau dihapus.",
      );
    }
  } catch (error) {
    console.error("Ticket update failed:", error);
    if (error instanceof Error && error.message === "TICKET_ITEMS_LOCKED") {
      return actionFailure(
        "Item sudah terhubung ke PO atau Surat Jalan. Muat ulang tiket sebelum mengedit.",
      );
    }
    return actionFailure("Tiket gagal diperbarui. Silakan coba kembali.");
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/project");
  return { success: true, message: "Tiket berhasil diperbarui." };
}

export async function deleteTicket(
  ticketId: string,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.DIRECTOR) {
    return actionFailure("Anda tidak memiliki izin untuk menghapus tiket.");
  }
  if (typeof ticketId !== "string" || !ticketId) {
    return actionFailure("Nomor tiket tidak valid.");
  }

  try {
    const deleted = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true },
      });
      if (!ticket) return "NOT_FOUND" as const;

      await transaction.operationalDocument.deleteMany({
        where: { ticketId },
      });
      const result = await transaction.ticket.deleteMany({
        where: { id: ticketId },
      });
      return result.count === 1 ? ("DELETED" as const) : ("NOT_FOUND" as const);
    });

    if (deleted === "NOT_FOUND") {
      return actionFailure("Tiket tidak ditemukan.");
    }
  } catch (error) {
    console.error("Ticket deletion failed:", error);
    return actionFailure("Tiket gagal dihapus. Silakan coba kembali.");
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/project");
  return { success: true, message: "Tiket berhasil dihapus." };
}

export async function submitTicket(
  ticketId: string,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk sebelum mengajukan tiket.");
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      type: true,
      title: true,
      ticketNumber: true,
      requesterId: true,
      requestCategory: true,
      requester: { select: { role: true } },
    },
  });
  if (!ticket || ticket.requesterId !== session.user.id) {
    return actionFailure("Tiket tidak ditemukan atau bukan milik Anda.");
  }
  const isAPHRequest = ticket.requestCategory === TicketRequestCategory.APH;
  if (
    isAPHRequest &&
    ticket.requester.role !== UserRole.DIRECTOR &&
    ticket.requester.role !== UserRole.FINANCE
  ) {
    return actionFailure("APH hanya dapat diajukan oleh Direktur atau Keuangan.");
  }
  const submittedByFinance =
    isAPHRequest && ticket.requester.role === UserRole.FINANCE;
  const nextStatus =
    isAPHRequest ? TicketStatus.WAITING_FINANCE_PAYMENT : TicketStatus.PENDING_DIRECTOR;
  return transitionTicket({
    ticketId,
    expectedStatus: TicketStatus.DRAFT,
    nextStatus,
    allowedRoles: null,
    action: "SUBMITTED",
    notes: isAPHRequest
      ? "Permintaan APH diajukan langsung ke antrean pembayaran Keuangan."
      : "Tiket diajukan untuk persetujuan Direktur.",
    requesterOnly: true,
    notifications: [
      ...(isAPHRequest
        ? submittedByFinance
          ? []
          : [
              {
                roleTarget: UserRole.FINANCE,
                title: "Permintaan APH Menunggu Pembayaran",
                message: `${ticket.ticketNumber} · ${ticket.title} menunggu pembayaran Keuangan.`,
                actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
                type: NotificationType.APPROVAL,
              },
            ]
        : [
            {
              roleTarget: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
              title: "Tiket Menunggu Persetujuan",
              message: `${ticket.ticketNumber} · ${ticket.title} membutuhkan persetujuan eksekutif.`,
              actionUrl: `/apps/approvals?tab=direct-purchase&openSheet=${encodeURIComponent(ticketId)}`,
              type: NotificationType.APPROVAL,
            },
          ]),
      ...(ticket.type === TicketType.MATERIAL
        ? [
            {
              roleTarget: UserRole.KOORDINATOR,
              title: "Permintaan Material Baru",
              message: `${ticket.ticketNumber} · ${ticket.title} menunggu koordinasi lapangan.`,
              actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
              type: NotificationType.INFO,
            },
          ]
        : []),
    ],
  });
}

export async function approveByDirector(
  ticketId: string,
  type: TicketType,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk untuk menyetujui tiket.");
  }
  if (
    session.user.role !== UserRole.DIRECTOR &&
    session.user.role !== UserRole.DEPUTY_DIRECTOR
  ) {
    return actionFailure(
      "Hanya Direktur atau Wakil Direktur yang dapat menyetujui tiket.",
    );
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { type: true, requestCategory: true },
  });
  if (!ticket) {
    return actionFailure("Tiket tidak ditemukan.");
  }
  if (ticket.requestCategory === TicketRequestCategory.APH) {
    return actionFailure(
      "Permintaan APH diteruskan langsung ke Keuangan dan tidak memerlukan persetujuan Direktur.",
    );
  }
  if (ticket.type !== type) {
    return actionFailure("Jenis tiket tidak sesuai dengan data tiket.");
  }

  const nextStatus =
    type === TicketType.MATERIAL
      ? TicketStatus.PROCESSED_LOGISTIC
      : TicketStatus.WAITING_FINANCE_PAYMENT;

  return transitionTicket({
    ticketId,
    expectedStatus: TicketStatus.PENDING_DIRECTOR,
    nextStatus,
    allowedRoles: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
    action: "APPROVED_BY_DIR",
    notes: `Disetujui ${session.user.role === UserRole.DEPUTY_DIRECTOR ? "Wakil Direktur" : "Direktur"}; diteruskan ke ${nextStatus === TicketStatus.PROCESSED_LOGISTIC ? "Logistik" : "Keuangan"}.`,
    directorApproval: true,
  });
}

async function decideTicketByDirector(
  ticketId: string,
  type: TicketType,
  reason: string,
  decision: "REJECT" | "REVISION",
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk untuk meninjau tiket.");
  }
  if (
    session.user.role !== UserRole.DIRECTOR &&
    session.user.role !== UserRole.DEPUTY_DIRECTOR
  ) {
    return actionFailure(
      "Hanya Direktur atau Wakil Direktur yang dapat meninjau tiket.",
    );
  }
  if (
    typeof ticketId !== "string" ||
    !ticketId ||
    !isTicketType(type) ||
    typeof reason !== "string" ||
    reason.trim().length < 3 ||
    reason.trim().length > 2000
  ) {
    return actionFailure("Alasan wajib diisi (3–2.000 karakter).");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      type: true,
      requestCategory: true,
      ticketNumber: true,
      title: true,
      requesterId: true,
    },
  });
  if (!ticket) return actionFailure("Tiket tidak ditemukan.");
  if (ticket.type !== type) {
    return actionFailure("Jenis tiket tidak sesuai dengan data tiket.");
  }
  if (ticket.requestCategory === TicketRequestCategory.APH) {
    return actionFailure(
      "Permintaan APH diteruskan langsung ke Keuangan dan tidak memerlukan persetujuan Direktur.",
    );
  }

  const rejected = decision === "REJECT";
  const decisionLabel = rejected ? "ditolak" : "memerlukan revisi";
  return transitionTicket({
    ticketId,
    expectedStatus: TicketStatus.PENDING_DIRECTOR,
    nextStatus: rejected ? TicketStatus.REJECTED : TicketStatus.DRAFT,
    allowedRoles: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
    action: rejected ? "REJECTED_BY_DIR" : "REVISION_REQUESTED_BY_DIR",
    notes: `${decisionLabel} oleh ${session.user.role === UserRole.DEPUTY_DIRECTOR ? "Wakil Direktur" : "Direktur"}: ${reason.trim()}`,
    notifications: [
      {
        userId: ticket.requesterId,
        title: rejected ? "Tiket Ditolak Direktur" : "Tiket Memerlukan Revisi",
        message: `${ticket.ticketNumber} · ${ticket.title} ${decisionLabel}. Catatan: ${reason.trim()}`,
        actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
        type: rejected ? NotificationType.WARNING : NotificationType.INFO,
      },
    ],
  });
}

export async function rejectTicketByDirector(
  ticketId: string,
  type: TicketType,
  reason: string,
): Promise<TicketActionResult> {
  return decideTicketByDirector(ticketId, type, reason, "REJECT");
}

export async function requestTicketRevisionByDirector(
  ticketId: string,
  type: TicketType,
  reason: string,
): Promise<TicketActionResult> {
  return decideTicketByDirector(ticketId, type, reason, "REVISION");
}

export async function processLogisticsMaterial(
  ticketId: string,
  actionType: "READY_WAREHOUSE" | "BUY_STORE",
  invoiceFile?: File,
  externalDelivery?: {
    vehicleDocumentNumber: string;
    vehiclePlate: string;
    driverName: string;
    driverIdentityNumber: string;
    driverPhone: string;
  },
  vehicleId?: string,
  invoiceInput?: Omit<VendorInvoiceInput, "documentUrl">,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk untuk memproses tiket.");
  }
  if (session.user.role !== UserRole.LOGISTICS) {
    return actionFailure("Hanya Logistik yang dapat memproses tiket material.");
  }
  if (actionType !== "READY_WAREHOUSE" && actionType !== "BUY_STORE") {
    return actionFailure("Pilihan proses Logistik tidak valid.");
  }

  if (actionType === "READY_WAREHOUSE") {
    return createWarehouseDeliveryOrder(
      ticketId,
      session.user.id,
      session.user.name ?? "Tim Logistik",
      externalDelivery,
      undefined,
      undefined,
      vehicleId,
    );
  }

  const approvedPurchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { ticketId, status: POStatus.APPROVED },
    select: { poNumber: true, paidAt: true, vendorPoSentAt: true },
  });
  if (!approvedPurchaseOrder) {
    return actionFailure(
      "Buat PO untuk tiket ini dan tunggu persetujuan Finance serta Direktur sebelum mengirim invoice.",
    );
  }
  if (approvedPurchaseOrder.paidAt) {
    return actionFailure(
      `PO ${approvedPurchaseOrder.poNumber} sudah dibayar dan masuk ke stok gudang. Terbitkan DO melalui opsi stok gudang.`,
    );
  }
  if (!approvedPurchaseOrder.vendorPoSentAt) {
    return actionFailure("Logistik harus mengirim PO ke vendor sebelum mengunggah invoice.");
  }
  if (!invoiceInput || !(invoiceFile instanceof File)) {
    return actionFailure("Lengkapi data invoice dan pilih file invoice/bon.");
  }

  const ticketBeforeUpload = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, type: true, status: true, purchaseReceiptUrl: true },
  });
  if (
    !ticketBeforeUpload ||
    ticketBeforeUpload.type !== TicketType.MATERIAL ||
    ticketBeforeUpload.status !== TicketStatus.PROCESSED_LOGISTIC ||
    ticketBeforeUpload.purchaseReceiptUrl
  ) {
    return actionFailure("Tiket tidak lagi berada di antrean Logistik untuk invoice.");
  }
  const invoiceFields = vendorInvoiceInputSchema.safeParse({
    ...invoiceInput,
    documentUrl: "https://res.cloudinary.com/validation/placeholder.pdf",
  });
  if (!invoiceFields.success) {
    return actionFailure(
      invoiceFields.error.issues[0]?.message ?? "Data invoice tidak valid.",
    );
  }

  const extension = invoiceFile.name.split(".").at(-1)?.toLowerCase();
  let documentUrl = "";
  let parsedInvoice: ReturnType<typeof vendorInvoiceInputSchema.safeParse>;
  try {
    if (extension === "pdf") {
      documentUrl = await uploadCloudinaryRawFile(
        invoiceFile,
        PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER,
        ["pdf"],
        5 * 1024 * 1024,
      );
    } else if (["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) {
      documentUrl = (
        await uploadCloudinaryPhoto(
          invoiceFile,
          PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER,
          5 * 1024 * 1024,
        )
      ).secureUrl;
    } else {
      return actionFailure("File invoice/bon harus PDF, JPG, PNG, atau WEBP maksimal 5 MB.");
    }
    if (!isPurchaseOrderInvoiceUrl(documentUrl)) {
      throw new Error("URL invoice/bon yang diunggah tidak valid.");
    }
    parsedInvoice = vendorInvoiceInputSchema.safeParse({
      ...invoiceInput,
      documentUrl,
    });
    if (!parsedInvoice.success) {
      throw new Error("Data invoice tidak valid.");
    }
  } catch (error) {
    if (documentUrl) {
      try {
        if (documentUrl.includes("/raw/upload/")) {
          await removeCloudinaryRawFile(documentUrl);
        } else {
          await removeCloudinaryPhoto(documentUrl);
        }
      } catch (cleanupError) {
        console.error("Removing unattached ticket invoice failed:", cleanupError);
      }
    }
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryRawFileValidationError
    ) {
      return actionFailure(error.message);
    }
    console.error("Uploading ticket PO invoice failed:", error);
    return actionFailure(
      error instanceof Error ? error.message : "Invoice gagal diunggah.",
    );
  }

  let invoiceId: string;
  try {
    invoiceId = await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          type: true,
          title: true,
          projectId: true,
          purchaseReceiptUrl: true,
          purchaseOrders: {
            where: { status: POStatus.APPROVED },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              poNumber: true,
              vendorName: true,
              paymentMethod: true,
              paymentBankName: true,
              paymentAccountNumber: true,
              paymentAccountName: true,
              includeTax: true,
              vendorPoSentAt: true,
              paidAt: true,
              paymentTransactions: {
                where: { status: PaymentStatus.PAID },
                select: { id: true },
                take: 1,
              },
              items: {
                orderBy: { id: "asc" },
                select: {
                  itemCode: true,
                  itemName: true,
                  quantity: true,
                  unit: true,
                  unitPrice: true,
                },
              },
            },
          },
        },
      });
      if (!ticket || ticket.type !== TicketType.MATERIAL) {
        throw new Error("Tiket material tidak ditemukan.");
      }
      if (ticket.status !== TicketStatus.PROCESSED_LOGISTIC) {
        throw new Error("Tiket tidak lagi berada di antrean Logistik.");
      }
      if (ticket.purchaseReceiptUrl) {
        throw new Error("Invoice/bon untuk tiket ini sudah pernah dikirim.");
      }
      const order = ticket.purchaseOrders[0];
      if (!order || order.paidAt || order.paymentTransactions.length > 0) {
        throw new Error("PO tidak ditemukan atau pembayaran sudah dimulai.");
      }
      if (!order.vendorPoSentAt) {
        throw new Error("Logistik harus mengirim PO ke vendor sebelum mengunggah invoice.");
      }
      const items = order.items.map((item) => ({
        itemCode: item.itemCode,
        description: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
      }));
      const subTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const tax = order.includeTax ? Math.round(subTotal * 0.11) : 0;
      const deduction = 0;
      const grandTotal = subTotal + tax - deduction;
      if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
        throw new Error("Total invoice harus lebih besar dari nol.");
      }
      const update = await transaction.ticket.updateMany({
        where: {
          id: ticketId,
          type: TicketType.MATERIAL,
          status: TicketStatus.PROCESSED_LOGISTIC,
          OR: [
            { purchaseReceiptUrl: null },
            { purchaseReceiptUrl: { isSet: false } },
            { purchaseReceiptUrl: "" },
          ],
        },
        data: {
          status: TicketStatus.WAITING_FINANCE_PAYMENT,
          purchaseReceiptUrl: parsedInvoice.data.documentUrl,
          updatedAt: new Date(),
        },
      });
      if (update.count !== 1) {
        throw new Error("Status tiket berubah. Muat ulang sebelum mengirim invoice.");
      }
      const invoice = await transaction.invoice.create({
        data: {
          publicCode: await generateAvailablePublicCode(transaction),
          invoiceNumber: parsedInvoice.data.invoiceNumber?.trim() || null,
          poId: order.id,
          projectId: ticket.projectId,
          vendorName: order.vendorName,
          periodOrDate: parsedInvoice.data.periodOrDate?.trim() || null,
          paymentMethod: order.paymentMethod,
          bankAccount:
            order.paymentMethod === POPaymentMethod.TRANSFER
              ? formatVendorBankAccount({
                  bankName: order.paymentBankName,
                  bankAccount: order.paymentAccountNumber,
                  bankHolder: order.paymentAccountName,
                })
              : null,
          documentUrl: parsedInvoice.data.documentUrl,
          subTotal,
          tax,
          deduction,
          grandTotal,
          status: "UNPAID",
          items: { create: items },
        },
        select: { id: true },
      });
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: session.user.id,
          action: "LOGISTICS_BUY_STORE",
          notes: `Invoice${parsedInvoice.data.invoiceNumber ? ` ${parsedInvoice.data.invoiceNumber}` : " tanpa nomor"} PO ${order.poNumber} diteruskan ke Keuangan.`,
        },
      });
      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "Invoice PO Siap Dibayar",
        message: `Invoice${parsedInvoice.data.invoiceNumber ? ` ${parsedInvoice.data.invoiceNumber}` : " tanpa nomor"} untuk PO #${order.poNumber} siap diperiksa dan diproses.`,
        actionUrl: `/apps/finance?tab=payments&openSheet=${encodeURIComponent(ticketId)}`,
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      return invoice.id;
    });
  } catch (error) {
    console.error("Ticket purchase order invoice submission failed:", error);
    try {
      if (documentUrl.includes("/raw/upload/")) {
        await removeCloudinaryRawFile(documentUrl);
      } else {
        await removeCloudinaryPhoto(documentUrl);
      }
    } catch (cleanupError) {
      console.error("Removing unattached ticket invoice failed:", cleanupError);
    }
    return actionFailure(
      error instanceof Error
        ? error.message
        : "Invoice gagal dikirim ke Keuangan. Silakan coba kembali.",
    );
  }
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/tickets");
  revalidatePath("/apps/orders");
  return {
    success: true,
    message: `Invoice ${parsedInvoice.data.invoiceNumber} PO ${approvedPurchaseOrder.poNumber} berhasil dikirim ke Keuangan.`,
    invoiceId,
  };
}

export async function fulfillTicketItemsFromStock(
  ticketId: string,
  ticketItemIds: string[],
  moverAssigneeId: string,
  vehicleId: string,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return actionFailure("Hanya Logistik yang dapat memenuhi tiket dari stok.");
  }
  if (
    !isBoundedText(ticketId, 64) ||
    !Array.isArray(ticketItemIds) ||
    ticketItemIds.length === 0 ||
    ticketItemIds.length > 200 ||
    ticketItemIds.some((id) => !isBoundedText(id, 64)) ||
    new Set(ticketItemIds).size !== ticketItemIds.length
  ) {
    return actionFailure("Pilih setidaknya satu item tiket yang valid.");
  }
  if (!isBoundedText(moverAssigneeId, 64) || !isBoundedText(vehicleId, 64)) {
    return actionFailure("Pilih Mover dan kendaraan sebelum membuat DO.");
  }
  return createWarehouseDeliveryOrder(
    ticketId,
    session.user.id,
    session.user.name ?? "Tim Logistik",
    undefined,
    ticketItemIds,
    moverAssigneeId,
    vehicleId,
  );
}

export async function checkTicketItemsStock(
  ticketId: string,
  ticketItemIds: string[],
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return actionFailure("Hanya Logistik yang dapat memeriksa saldo gudang.");
  }
  if (
    !isBoundedText(ticketId, 64) ||
    !Array.isArray(ticketItemIds) ||
    ticketItemIds.length === 0 ||
    ticketItemIds.length > 200 ||
    ticketItemIds.some((id) => !isBoundedText(id, 64)) ||
    new Set(ticketItemIds).size !== ticketItemIds.length
  ) {
    return actionFailure("Pilih setidaknya satu item tiket yang valid.");
  }

  try {
    const stockCheck = await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          type: true,
          status: true,
          moverAssigneeId: true,
          items: {
            where: { id: { in: ticketItemIds } },
            select: {
              id: true,
              itemName: true,
              quantity: true,
              unit: true,
              status: true,
              categoryHint: true,
            },
          },
        },
      });
      if (
        !ticket ||
        ticket.type !== TicketType.MATERIAL ||
        ticket.status !== TicketStatus.PROCESSED_LOGISTIC
      ) {
        throw new Error("Tiket material tidak lagi berada di antrean Logistik.");
      }
      if (
        ticket.items.length !== ticketItemIds.length ||
        ticket.items.some(
          (item) => item.status !== FulfillmentStatus.PENDING,
        )
      ) {
        throw new Error(
          "Sebagian item sudah diproses. Muat ulang tiket.",
        );
      }
      const stockItems = await transaction.stockItem.findMany({
        select: {
          id: true,
          name: true,
          unit: true,
          stockQuantity: true,
          unitPrice: true,
        },
      });
      const availability = evaluateWarehouseItemAvailability(
        ticket.items,
        stockItems,
      );
      if (!availability.success) return availability;
      const activePurchases = await transaction.directStockPurchase.findMany({
        where: {
          ticketId,
          status: DirectStockPurchaseStatus.PENDING_RECEIPT,
        },
        select: {
          purchaseNumber: true,
          items: { select: { itemName: true, unit: true } },
        },
      });
      const activePurchaseByItem = new Map<string, string>();
      for (const purchase of activePurchases) {
        for (const item of purchase.items) {
          activePurchaseByItem.set(
            ticketStockItemKey(item.itemName, item.unit),
            purchase.purchaseNumber,
          );
        }
      }
      const items = availability.items.map((item) => {
        const pendingPurchaseNumber = activePurchaseByItem.get(
          ticketStockItemKey(item.itemName, item.unit),
        );
        return {
          ...item,
          ready: pendingPurchaseNumber ? false : item.ready,
          pendingPurchaseNumber,
          message: pendingPurchaseNumber
            ? `Selesaikan pesanan ${pendingPurchaseNumber} sebelum memenuhi atau memesan barang ini kembali.`
            : item.message,
        };
      });
      const readyItemIds = items
        .filter((item) => item.ready)
        .map((item) => item.ticketItemId);
      const needsOrderItemIds = items
        .filter((item) => !item.ready && !item.pendingPurchaseNumber)
        .map((item) => item.ticketItemId);
      const [movers, vehicles] =
        readyItemIds.length > 0
          ? await Promise.all([
              transaction.user.findMany({
                where: { role: UserRole.MOVER, isActive: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              }),
              transaction.vehicle.findMany({
                where: {
                  status: "AVAILABLE",
                  odometerInitialized: true,
                  deliveryOrders: {
                    none: {
                      status: { in: [DOStatus.PENDING, DOStatus.IN_TRANSIT] },
                    },
                  },
                },
                orderBy: { plateNumber: "asc" },
                select: {
                  id: true,
                  plateNumber: true,
                  vehicleType: true,
                  brand: true,
                  modelName: true,
                },
              }),
            ])
          : [[], []];
      return {
        success: true as const,
        message: "Status stok diperiksa.",
        items,
        readyItemIds,
        needsOrderItemIds,
        movers,
        vehicles,
        moverAssigneeId: ticket.moverAssigneeId,
      };
    });

    if (!stockCheck.success) {
      return {
        success: false,
        message: stockCheck.message,
      };
    }
    return {
      success: true,
      message: "Status stok setiap barang berhasil diperiksa.",
      stockAvailability: stockCheck.items,
      readyItemIds: stockCheck.readyItemIds,
      needsOrderItemIds: stockCheck.needsOrderItemIds,
      movers: stockCheck.movers,
      vehicles: stockCheck.vehicles,
      moverAssigneeId: stockCheck.moverAssigneeId,
    };
  } catch (error) {
    console.error("Ticket warehouse stock check failed:", error);
    return actionFailure(
      error instanceof Error
        ? error.message
        : "Saldo gudang gagal diperiksa. Silakan coba kembali.",
    );
  }
}

export async function switchTicketItemsToPurchase(
  ticketId: string,
  ticketItemIds: string[],
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return actionFailure("Hanya Logistik yang dapat mengalihkan sumber item.");
  }
  if (
    !isBoundedText(ticketId, 64) ||
    !Array.isArray(ticketItemIds) ||
    ticketItemIds.length === 0 ||
    ticketItemIds.length > 200 ||
    ticketItemIds.some((id) => !isBoundedText(id, 64)) ||
    new Set(ticketItemIds).size !== ticketItemIds.length
  ) {
    return actionFailure("Pilih setidaknya satu item tiket yang valid.");
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          ticketNumber: true,
          type: true,
          status: true,
          items: {
            where: { id: { in: ticketItemIds } },
            select: {
              id: true,
              itemName: true,
              quantity: true,
              unit: true,
              status: true,
              categoryHint: true,
            },
          },
        },
      });
      if (
        !ticket ||
        ticket.type !== TicketType.MATERIAL ||
        ticket.status !== TicketStatus.PROCESSED_LOGISTIC
      ) {
        throw new Error("Tiket material tidak lagi berada di antrean Logistik.");
      }
      if (
        ticket.items.length !== ticketItemIds.length ||
        ticket.items.some(
          (item) =>
            item.status !== FulfillmentStatus.PENDING ||
            ![
              TicketCategoryHint.WAREHOUSE,
              TicketCategoryHint.PURCHASE,
            ].includes(item.categoryHint),
        )
      ) {
        throw new Error(
          "Sebagian item sudah diproses. Muat ulang tiket.",
        );
      }
      const stockItems = await transaction.stockItem.findMany({
        select: {
          id: true,
          name: true,
          unit: true,
          stockQuantity: true,
          unitPrice: true,
        },
      });
      const availability = evaluateWarehouseItemAvailability(
        ticket.items,
        stockItems,
      );
      if (!availability.success) {
        throw new Error(availability.message);
      }
      if (availability.items.some((item) => item.ready)) {
        throw new Error(
          "Sebagian item masih tersedia di gudang. Teruskan hanya item yang berstatus perlu pemesanan.",
        );
      }
      const warehouseItemIds = ticket.items
        .filter((item) => item.categoryHint === TicketCategoryHint.WAREHOUSE)
        .map((item) => item.id);
      if (warehouseItemIds.length > 0) {
        const changed = await transaction.ticketItem.updateMany({
          where: {
            ticketId,
            id: { in: warehouseItemIds },
            status: FulfillmentStatus.PENDING,
            categoryHint: TicketCategoryHint.WAREHOUSE,
          },
          data: { categoryHint: TicketCategoryHint.PURCHASE },
        });
        if (changed.count !== warehouseItemIds.length) {
          throw new Error(
            "Status item berubah. Muat ulang tiket lalu coba kembali.",
          );
        }
      }
      await syncTicketStatus(transaction, ticketId);
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: session.user.id,
          action: "LOGISTICS_SWITCHED_TO_PURCHASE",
          notes: `Item dengan stok belum mencukupi diteruskan ke pengadaan baru: ${ticket.items
            .map((item) => item.itemName)
            .join(", ")}.`,
        },
      });
    });
  } catch (error) {
    console.error("Ticket item purchase fallback failed:", error);
    return actionFailure(
      error instanceof Error
        ? error.message
        : "Item gagal dialihkan ke pengadaan baru. Silakan coba kembali.",
    );
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/logistics");
  return {
    success: true,
    message: "Item yang belum ready diteruskan ke form pesanan Logistik.",
  };
}

export async function createLogisticsPurchaseOrderForTicket(
  ticketId: string,
  vendorName: string,
  items: Array<{
    ticketItemId?: string;
    stockItemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>,
  payment: {
    vendorId: string;
    vendorBankAccountId?: string;
    method: POPaymentMethod;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    includeTax?: boolean;
    paymentTerms?: string;
  },
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return actionFailure("Hanya Logistik yang dapat membuat PO dari tiket material.");
  }
  if (
    !isBoundedText(ticketId, 64) ||
    !isBoundedText(vendorName, 180) ||
    !payment ||
    !isBoundedText(payment.vendorId, 64) ||
    (payment.vendorBankAccountId !== undefined &&
      !isBoundedText(payment.vendorBankAccountId, 64)) ||
    !Object.values(POPaymentMethod).includes(payment.method) ||
    (payment.includeTax !== undefined &&
      typeof payment.includeTax !== "boolean") ||
    (payment.paymentTerms !== undefined &&
      !isBoundedText(payment.paymentTerms, 1200)) ||
    (payment.method === POPaymentMethod.TRANSFER &&
      !payment.vendorBankAccountId &&
      (!isBoundedText(payment.bankName, 120) ||
        !isBoundedText(payment.accountNumber, 80) ||
        !isBoundedText(payment.accountName, 180))) ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 200 ||
    items.some(
      (item) =>
        !item ||
        (item.ticketItemId !== undefined &&
          !isBoundedText(item.ticketItemId, 64)) ||
        !isBoundedText(item.stockItemId, 64) ||
        !isBoundedText(item.itemName, 180) ||
        !isBoundedText(item.unit, 40) ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        typeof item.unitPrice !== "number" ||
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice <= 0 ||
        item.unitPrice > 1_000_000_000_000,
    )
  ) {
    return actionFailure("Vendor dan rincian harga PO wajib diisi dengan benar.");
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          type: true,
          status: true,
          items: {
            select: {
              id: true,
              itemName: true,
              quantity: true,
              unit: true,
              status: true,
              categoryHint: true,
            },
            orderBy: { id: "asc" },
          },
        },
      });
      if (
        !ticket ||
        ticket.type !== TicketType.MATERIAL ||
        ticket.status !== TicketStatus.PROCESSED_LOGISTIC
      ) {
        throw new Error("Tiket material tidak lagi berada di antrean Logistik.");
      }
      const vendor = await transaction.vendor.findFirst({
        where: { id: payment.vendorId, isApproved: true },
        select: {
          id: true,
          name: true,
          bankName: true,
          bankAccount: true,
          bankHolder: true,
          bankAccounts: {
            select: {
              id: true,
              bankName: true,
              bankAccount: true,
              bankHolder: true,
              isPrimary: true,
            },
          },
        },
      });
      if (!vendor) {
        throw new Error("Vendor tidak ditemukan atau belum disetujui.");
      }
      const vendorBankAccount = resolveVendorBankAccount(
        vendor.bankAccounts,
        vendor,
        payment.vendorBankAccountId,
      );
      if (payment.vendorBankAccountId && !vendorBankAccount) {
        throw new Error("Rekening yang dipilih tidak terdaftar pada vendor ini.");
      }
      const selectedTicketItemIds = items
        .map((item) => item.ticketItemId)
        .filter((id): id is string => Boolean(id));
      if (
        new Set(selectedTicketItemIds).size !== selectedTicketItemIds.length
      ) {
        throw new Error("Item tiket yang sama tidak boleh dimasukkan lebih dari sekali.");
      }
      const ticketItemsById = new Map(
        ticket.items.map((item) => [item.id, item]),
      );
      if (
        items.some((inputItem) => {
          if (!inputItem.ticketItemId) return false;
          const ticketItem = ticketItemsById.get(inputItem.ticketItemId!);
          return (
            !ticketItem ||
            ticketItem.status !== FulfillmentStatus.PENDING ||
            ticketItem.itemName !== inputItem.itemName.trim() ||
            ticketItem.quantity !== inputItem.quantity ||
            ticketItem.unit !== inputItem.unit.trim()
          );
        })
      ) {
        throw new Error(
          "Nama, jumlah, dan satuan PO harus sesuai dengan item tiket yang masih menunggu pemenuhan.",
        );
      }
      const activeDirectPurchases =
        await transaction.directStockPurchase.findMany({
          where: {
            ticketId,
            status: DirectStockPurchaseStatus.PENDING_RECEIPT,
          },
          select: {
            purchaseNumber: true,
            items: { select: { itemName: true, unit: true } },
          },
        });
      const activeDirectPurchaseByItem = new Map<string, string>();
      for (const purchase of activeDirectPurchases) {
        for (const item of purchase.items) {
          activeDirectPurchaseByItem.set(
            ticketStockItemKey(item.itemName, item.unit),
            purchase.purchaseNumber,
          );
        }
      }
      for (const item of items) {
        const purchaseNumber = activeDirectPurchaseByItem.get(
          ticketStockItemKey(item.itemName, item.unit),
        );
        if (purchaseNumber) {
          throw new Error(
            `Item tiket ${item.itemName} (${item.unit}) masih ada dalam pesanan langsung ${purchaseNumber}. Selesaikan penerimaan pesanan tersebut sebelum membuat PO.`,
          );
        }
      }
      const selectedStockItems = await transaction.stockItem.findMany({
        where: { id: { in: [...new Set(items.map((item) => item.stockItemId))] } },
        select: { id: true, sku: true, name: true, unit: true },
      });
      const selectedStockById = new Map(
        selectedStockItems.map((item) => [item.id, item]),
      );
      const normalizeCatalogValue = (value: string) =>
        value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
      if (
        items.some((item) => {
          const stockItem = selectedStockById.get(item.stockItemId);
          return (
            !stockItem ||
            normalizeCatalogValue(stockItem.name) !==
              normalizeCatalogValue(item.itemName) ||
            normalizeCatalogValue(stockItem.unit) !==
              normalizeCatalogValue(item.unit)
          );
        })
      ) {
        throw new Error("Pilih barang katalog yang sesuai dengan rincian tiket.");
      }
      const publicCode = await generateAvailablePublicCode(transaction);
      const poNumber = await nextDocumentNumber(transaction, "PO");
      const poItems = items.map((item) => ({
        id: randomUUID(),
        ticketItemId: item.ticketItemId,
        stockItemId: item.stockItemId,
        itemCode: selectedStockById.get(item.stockItemId)?.sku ?? null,
        itemName: item.itemName.trim(),
        quantity: item.quantity,
        unit: item.unit.trim(),
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
      }));
      const vendorHasTransferDetails = Boolean(vendorBankAccount);
      const paymentMethod = vendorHasTransferDetails
        ? POPaymentMethod.TRANSFER
        : POPaymentMethod.CASH;
      const purchaseOrder = await transaction.purchaseOrder.create({
        data: {
          publicCode,
          poNumber,
          vendorId: vendor.id,
          vendorName: vendor.name,
          paymentMethod,
          paymentBankName: vendorHasTransferDetails
            ? vendorBankAccount?.bankName
            : null,
          paymentAccountNumber: vendorHasTransferDetails
            ? vendorBankAccount?.bankAccount
            : null,
          paymentAccountName: vendorHasTransferDetails
            ? vendorBankAccount?.bankHolder
            : null,
          paymentTerms: [
            `Pembelian untuk tiket ${ticket.ticketNumber}`,
            payment.paymentTerms?.trim(),
          ]
            .filter(Boolean)
            .join(" - "),
          includeTax: payment.includeTax ?? false,
          createdById: session.user.id,
          ticketId,
          items: {
            create: poItems.map((item) => ({
              id: item.id,
              itemCode: item.itemCode,
              stockItemId: item.stockItemId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
        select: { publicCode: true, poNumber: true },
      });
      for (const item of poItems) {
        if (!item.ticketItemId) continue;
        await transaction.ticketItem.update({
          where: { id: item.ticketItemId },
          data: {
            status: FulfillmentStatus.PROCESSED_TO_PO,
            poItemId: item.id,
          },
        });
      }
      await syncTicketStatus(transaction, ticketId);
      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "PO Menunggu Verifikasi",
        message: `PO #${purchaseOrder.poNumber} Butuh Pemeriksaan (Checked By).`,
        actionUrl: `/apps/finance?tab=po-check&openSheet=${encodeURIComponent(publicCode)}`,
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: session.user.id,
          action: "LOGISTICS_PO_CREATED",
          notes: `PO ${purchaseOrder.poNumber} dibuat untuk pembelian material; menunggu pemeriksaan Finance dan persetujuan Direktur.`,
        },
      });
      return purchaseOrder;
    });

    revalidatePath("/apps/tickets");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/orders");
    revalidatePath(`/d/${created.publicCode}`);
    return {
      success: true,
      message: `PO ${created.poNumber} dibuat dan menunggu pemeriksaan Finance serta persetujuan Direktur.`,
      purchaseNumber: created.poNumber,
      documentNumber: created.poNumber,
      publicCode: created.publicCode,
    };
  } catch (error) {
    console.error("Logistics Purchase Order creation failed:", error);
    return actionFailure(
      error instanceof Error
        ? error.message
        : "PO gagal dibuat. Periksa rincian tiket dan coba kembali.",
    );
  }
}

async function createWarehouseDeliveryOrder(
  ticketId: string,
  logisticsUserId: string,
  logisticsUserName: string,
  externalDelivery?: {
    vehicleDocumentNumber: string;
    vehiclePlate: string;
    driverName: string;
    driverIdentityNumber: string;
    driverPhone: string;
  },
  selectedTicketItemIds?: string[],
  moverAssigneeId?: string,
  vehicleId?: string,
): Promise<TicketActionResult> {
  try {
    const result = await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      await lockTicketDeliveryOrderCreation(transaction);

      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          status: true,
          isApprovedByDirector: true,
          projectId: true,
          requester: { select: { name: true } },
          moverAssignee: { select: { id: true, name: true } },
          purchaseOrders: {
            where: {
              status: POStatus.APPROVED,
              paidAt: { not: null },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, poNumber: true, paidAt: true },
          },
          items: {
            select: {
              id: true,
              itemName: true,
              quantity: true,
              unit: true,
              status: true,
              categoryHint: true,
              poItem: { select: { itemCode: true } },
            },
            orderBy: { id: "asc" },
          },
        },
      });
      if (!ticket || ticket.type !== TicketType.MATERIAL) {
        throw new Error("Tiket material tidak ditemukan.");
      }
      if (!ticket.isApprovedByDirector) {
        throw new Error(
          "Tiket harus memiliki persetujuan eksekutif sebelum DO diterbitkan.",
        );
      }
      const selectedItems = selectedTicketItemIds
        ? ticket.items.filter((item) =>
            selectedTicketItemIds.includes(item.id),
          )
        : ticket.items;
      if (
        selectedTicketItemIds &&
        (selectedItems.length !== selectedTicketItemIds.length ||
          selectedItems.some(
            (item) => item.status !== FulfillmentStatus.PENDING,
          ))
      ) {
        throw new Error(
          "Sebagian item sudah diproses. Muat ulang tiket.",
        );
      }
      if (selectedItems.length === 0) {
        throw new Error("Tidak ada item yang dapat dipenuhi dari stok.");
      }
      const paidPurchaseOrder = ticket.purchaseOrders[0] ?? null;
      const hasPaidPurchaseOrder =
        !selectedTicketItemIds && Boolean(paidPurchaseOrder);
      const existingOrder = await transaction.deliveryOrder.findFirst({
        where: { ticketId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          publicCode: true,
          doNumber: true,
          poId: true,
          deliveryMethod: true,
        },
      });
      if (existingOrder && !selectedTicketItemIds) {
        if (paidPurchaseOrder && !existingOrder.poId) {
          await transaction.deliveryOrder.update({
            where: { id: existingOrder.id },
            data: { poId: paidPurchaseOrder.id },
          });
        }
        const syncResult = await syncTicketStatus(
          transaction,
          ticketId,
          existingOrder.deliveryMethod === DODeliveryMethod.EXPEDITION
            ? TicketStatus.IN_TRANSIT
            : TicketStatus.ASSIGNED_TO_MOVER,
        );
        if (syncResult.statusChanged) {
          await transaction.ticketAuditLog.create({
            data: {
              id: randomUUID(),
              ticketId,
              userId: logisticsUserId,
              action: "LOGISTICS_READY_WAREHOUSE",
              notes:
                existingOrder.deliveryMethod === DODeliveryMethod.EXPEDITION
                  ? `DO ${existingOrder.doNumber} ditemukan; tiket menunggu kedatangan ekspedisi.`
                  : `DO ${existingOrder.doNumber} ditemukan; tiket diteruskan ke Mover tanpa membuat DO atau mengurangi stok lagi.`,
            },
          });
        }
        return {
          ...existingOrder,
          message: `DO ${existingOrder.doNumber} sudah ada. Tiket dilanjutkan menggunakan DO tersebut tanpa membuat dokumen atau mengurangi stok lagi.`,
          pushRecipientId: null,
          pushTicketNumber: "",
          pushTicketTitle: "",
        };
      }
      if (ticket.status !== TicketStatus.PROCESSED_LOGISTIC) {
        throw new Error("Tiket tidak lagi berada di antrean Logistik.");
      }
      const selectedMover = moverAssigneeId
        ? await transaction.user.findFirst({
            where: {
              id: moverAssigneeId,
              role: UserRole.MOVER,
              isActive: true,
            },
            select: { id: true, name: true },
          })
        : ticket.moverAssignee;
      const isNewMoverAssignment =
        !hasPaidPurchaseOrder &&
        Boolean(
          selectedMover && ticket.moverAssignee?.id !== selectedMover.id,
        );
      if (moverAssigneeId && !selectedMover) {
        throw new Error("Mover tidak ditemukan atau sudah tidak aktif.");
      }
      if (!hasPaidPurchaseOrder && !selectedMover) {
        throw new Error("Pilih Mover sebelum menerbitkan DO.");
      }
      if (!hasPaidPurchaseOrder && !isBoundedText(vehicleId ?? "", 64)) {
        throw new Error("Pilih kendaraan master sebelum menerbitkan DO.");
      }
      if (
        moverAssigneeId &&
        selectedMover &&
        ticket.moverAssignee?.id !== selectedMover.id
      ) {
        await transaction.ticket.update({
          where: { id: ticketId },
          data: { moverAssigneeId: selectedMover.id },
        });
      }
      if (
        hasPaidPurchaseOrder &&
        (!externalDelivery ||
          externalDelivery.vehicleDocumentNumber.trim().length < 1 ||
          externalDelivery.vehicleDocumentNumber.trim().length > 80 ||
          !/^[A-Za-z0-9./ -]{3,40}$/.test(externalDelivery.vehiclePlate.trim()) ||
          externalDelivery.driverName.trim().length < 2 ||
          externalDelivery.driverName.trim().length > 180 ||
          !/^\d{16}$/.test(externalDelivery.driverIdentityNumber.trim()) ||
          !/^[+()\d\s.-]{8,32}$/.test(externalDelivery.driverPhone.trim()))
      ) {
        throw new Error(
          "Lengkapi No. STK, plat nomor, nama driver, NIK 16 digit, dan nomor HP ekspedisi.",
        );
      }
      const selectedVehicle =
        !hasPaidPurchaseOrder && vehicleId
          ? await transaction.vehicle.findFirst({
              where: {
                id: vehicleId,
                status: "AVAILABLE",
                odometerInitialized: true,
                deliveryOrders: {
                  none: {
                    status: { in: [DOStatus.PENDING, DOStatus.IN_TRANSIT] },
                  },
                },
              },
              select: {
                id: true,
                plateNumber: true,
              },
            })
          : null;
      if (!hasPaidPurchaseOrder && !selectedVehicle) {
        throw new Error(
          "Kendaraan tidak tersedia atau KM awal belum diinisialisasi.",
        );
      }
      const stockItems = await transaction.stockItem.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          stockQuantity: true,
          unitPrice: true,
        },
      });
      const stockEvaluation = evaluateWarehouseStock(selectedItems, stockItems);
      if (!stockEvaluation.available) {
        throw new Error(stockEvaluation.message);
      }
      const reservations = stockEvaluation.reservations;

      const publicCode = await generateAvailablePublicCode(transaction);
      const doNumber = await nextDocumentNumber(transaction, "DO");
      const deliveryOrder = await transaction.deliveryOrder.create({
        data: {
          publicCode,
          doNumber,
          ticketId,
          poId: hasPaidPurchaseOrder ? paidPurchaseOrder?.id : undefined,
          createdById: logisticsUserId,
          deliveryMethod: hasPaidPurchaseOrder
            ? DODeliveryMethod.EXPEDITION
            : DODeliveryMethod.INTERNAL_MOVER,
          vehicleDocumentNumber: externalDelivery?.vehicleDocumentNumber.trim(),
          vehiclePlate: externalDelivery?.vehiclePlate.trim(),
          driverName: hasPaidPurchaseOrder
            ? externalDelivery!.driverName.trim()
            : selectedMover!.name,
          vehicleId: selectedVehicle?.id,
          vehiclePlateNumber: selectedVehicle?.plateNumber,
          driverIdentityNumber: externalDelivery?.driverIdentityNumber.trim(),
          driverPhone: externalDelivery?.driverPhone.trim(),
          receiverName: hasPaidPurchaseOrder
            ? logisticsUserName
            : ticket.requester.name,
          status: hasPaidPurchaseOrder ? DOStatus.IN_TRANSIT : DOStatus.PENDING,
        },
        select: { id: true, publicCode: true, doNumber: true },
      });
      if (selectedVehicle) {
        const reserved = await transaction.vehicle.updateMany({
          where: {
            id: selectedVehicle.id,
            status: "AVAILABLE",
            odometerInitialized: true,
          },
          data: { status: "RESERVED" },
        });
        if (reserved.count !== 1) {
          throw new Error("Kendaraan baru saja ditugaskan. Pilih kendaraan lain.");
        }
      }
      for (const item of selectedItems) {
        const doItem = await transaction.dOItem.create({
          data: {
            id: randomUUID(),
            doId: deliveryOrder.id,
            itemCode:
              item.poItem?.itemCode ??
              stockEvaluation.itemCodesByTicketItemId.get(item.id) ??
              null,
            itemName: item.itemName,
            qtyOrdered: item.quantity,
            qtyDelivered: item.quantity,
            unit: item.unit,
          },
          select: { id: true },
        });
        await transaction.ticketItem.update({
          where: { id: item.id },
          data: {
            doItemId: doItem.id,
            ...(item.status === FulfillmentStatus.PENDING
              ? { status: FulfillmentStatus.PROCESSED_TO_DO }
              : {}),
          },
        });
      }
      for (const reservation of reservations.values()) {
        const updated = await transaction.stockItem.updateMany({
          where: {
            id: reservation.stockItemId,
            stockQuantity: {
              gte: scaledIntegerFromDecimal(reservation.quantity),
            },
          },
          data: {
            stockQuantity: {
              decrement: scaledIntegerFromDecimal(reservation.quantity),
            },
          },
        });
        if (updated.count !== 1) {
          throw new Error(warehouseInsufficientMessage);
        }
        await transaction.stockMovement.create({
          data: {
            projectId: ticket.projectId,
            stockItemId: reservation.stockItemId,
            type: "OUT",
            materialName: reservation.name,
            quantity: scaledIntegerFromDecimal(reservation.quantity),
            unit: reservation.unit,
            totalCost: scaledIntegerFromDecimal(
              new Prisma.Decimal(reservation.quantity)
                .mul(reservation.unitPrice)
                .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            ),
            reference: doNumber,
            notes: `Pemenuhan tiket ${ticket.ticketNumber} melalui DO ${doNumber}.`,
            createdById: logisticsUserId,
          },
        });
      }
      await syncTicketStatus(
        transaction,
        ticketId,
        hasPaidPurchaseOrder
          ? TicketStatus.IN_TRANSIT
          : TicketStatus.ASSIGNED_TO_MOVER,
      );
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: logisticsUserId,
          action: "LOGISTICS_READY_WAREHOUSE",
          notes: hasPaidPurchaseOrder
            ? `DO ${deliveryOrder.doNumber} diterbitkan untuk pengiriman ekspedisi dari PO ${paidPurchaseOrder.poNumber}; stok gudang dicadangkan.`
            : `DO ${deliveryOrder.doNumber} diterbitkan; stok gudang dicadangkan dan tiket ditugaskan kepada ${selectedMover!.name}.`,
        },
      });
      return {
        ...deliveryOrder,
        message: hasPaidPurchaseOrder
          ? `DO ${deliveryOrder.doNumber} diterbitkan untuk pengiriman ekspedisi. Stok dicadangkan.`
          : `DO ${deliveryOrder.doNumber} diterbitkan. Stok dicadangkan dan tiket diteruskan ke ${selectedMover!.name}.`,
        pushRecipientId: isNewMoverAssignment ? selectedMover?.id ?? null : null,
        pushTicketNumber: ticket.ticketNumber,
        pushTicketTitle: ticket.title,
      };
    });

    if (result.pushRecipientId) {
      try {
        await sendPushNotification(result.pushRecipientId, {
          title: "Tiket baru ditugaskan kepada Anda",
          body: `${result.pushTicketNumber} · ${result.pushTicketTitle}`,
          url: "/apps/tickets",
        });
      } catch (error) {
        console.error("New ticket assignment push notification failed:", error);
      }
    }

    revalidatePath("/apps/tickets");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/orders");
    revalidatePath(`/d/${result.publicCode}`);
    return {
      success: true,
      message: result.message,
      documentNumber: result.doNumber,
      publicCode: result.publicCode,
    };
  } catch (error) {
    console.error("Warehouse Delivery Order creation failed:", error);
    if (
      error instanceof Error &&
      error.message === warehouseInsufficientMessage
    ) {
      return {
        ...actionFailure(warehouseInsufficientMessage),
        fallbackRequired: true,
      };
    }
    return actionFailure(
      error instanceof Error
        ? error.message
        : "DO gagal diterbitkan. Periksa stok dan data Mover.",
    );
  }
}

export async function processFinancePayment(
  ticketId: string,
  proof: FinancePaymentProofInput,
  transferDestination: string,
  financeAccountId: string,
  paymentType: PaymentType = PaymentType.FULL_PAYMENT,
  requestedPaymentAmount?: number,
  paymentMethod?: POPaymentMethod,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk untuk memproses pembayaran.");
  }
  if (session.user.role !== UserRole.FINANCE) {
    return actionFailure("Hanya Keuangan yang dapat menyelesaikan pembayaran.");
  }
  if (
    (!isBoundedText(transferDestination, 300) &&
      paymentMethod !== POPaymentMethod.CASH) ||
    !isBoundedText(financeAccountId, 100) ||
    (paymentMethod !== undefined &&
      !Object.values(POPaymentMethod).includes(paymentMethod))
  ) {
    return actionFailure(
      "Keterangan tujuan transfer dan buku bank/kas sumber wajib dipilih.",
    );
  }
  if (
    !isValidFinancePaymentProofInput(proof) ||
    !Object.values(PaymentType).includes(paymentType)
  ) {
    return actionFailure("Jenis pembayaran atau bukti transfer tidak valid.");
  }
  if (
    paymentType !== PaymentType.FULL_PAYMENT &&
    (!Number.isFinite(requestedPaymentAmount) ||
      requestedPaymentAmount! <= 0)
  ) {
    return actionFailure("Nominal pembayaran sebagian harus lebih besar dari nol.");
  }

  let receiptUrls: string[];
  let receiptUrl: string;
  try {
    receiptUrls = await storeFinancePaymentProofs(proof);
    receiptUrl = receiptUrls[0];
  } catch (error) {
    return actionFailure(
      error instanceof Error ? error.message : "File bukti gagal diproses.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      await lockTicketDeliveryOrderCreation(transaction);
      const ticket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          ticketNumber: true,
          title: true,
          type: true,
          status: true,
          isApprovedByDirector: true,
          requestCategory: true,
          requestPaymentMethod: true,
          requestedAmount: true,
          totalAmount: true,
          projectId: true,
          purchaseReceiptUrl: true,
          requester: { select: { role: true } },
          purchaseOrders: {
            where: { status: POStatus.APPROVED },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              poNumber: true,
              status: true,
              includeTax: true,
              vendorName: true,
              paymentTerms: true,
              items: {
                select: {
                  id: true,
                  itemCode: true,
                  stockItemId: true,
                  itemName: true,
                  quantity: true,
                  unit: true,
                  unitPrice: true,
                  totalPrice: true,
                },
              },
              invoices: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  subTotal: true,
                  tax: true,
                  deduction: true,
                  grandTotal: true,
                  items: {
                    orderBy: { id: "asc" },
                    select: {
                      itemCode: true,
                      description: true,
                      quantity: true,
                      unit: true,
                      unitPrice: true,
                      totalPrice: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!ticket) throw new Error("Tiket tidak ditemukan.");
      const isPaymentEligibleTicketStatus = [
        TicketStatus.WAITING_FINANCE_PAYMENT,
        TicketStatus.PROCESSED_FINANCE,
        TicketStatus.PROCESSED_LOGISTIC,
        TicketStatus.ASSIGNED_TO_MOVER,
        TicketStatus.IN_TRANSIT,
        TicketStatus.COMPLETED,
      ].some((status) => status === ticket.status);
      if (!isPaymentEligibleTicketStatus) {
        throw new Error("Tiket belum siap dibayar atau statusnya sudah berubah.");
      }

      const isAPHRequest =
        ticket.requestCategory === TicketRequestCategory.APH;
      const isInternalFundingRequest =
        ticket.requestCategory !== null &&
        [
        TicketRequestCategory.REIMBURSEMENT,
        TicketRequestCategory.KASBON,
        TicketRequestCategory.OPERATING_EXPENSE,
        ].some((category) => category === ticket.requestCategory);
      if (
        isInternalFundingRequest &&
        (!paymentMethod ||
          paymentType !== PaymentType.FULL_PAYMENT ||
          ticket.status !== TicketStatus.WAITING_FINANCE_PAYMENT)
      ) {
        throw new Error(
          "Pengajuan internal hanya dapat dibayar lunas dengan metode Cash atau Transfer setelah disetujui Direktur.",
        );
      }
      if (!isInternalFundingRequest && paymentMethod !== undefined) {
        throw new Error("Metode pembayaran khusus hanya berlaku untuk pengajuan internal.");
      }
      if (
        isAPHRequest &&
        ticket.requestPaymentMethod !== POPaymentMethod.CASH &&
        ticket.requestPaymentMethod !== POPaymentMethod.TRANSFER
      ) {
        throw new Error("Metode pembayaran APH tidak valid.");
      }
      const order = ticket.purchaseOrders[0];
      const isDirectAPHRequest =
        isAPHRequest &&
        (ticket.requester.role === UserRole.DIRECTOR ||
          ticket.requester.role === UserRole.FINANCE);
      if (!order && !ticket.isApprovedByDirector && !isDirectAPHRequest) {
        throw new Error(
          "Tiket tanpa PO wajib disetujui Direktur sebelum pembayaran.",
        );
      }
      if (
        ticket.type === TicketType.MATERIAL &&
        !order &&
        !ticket.purchaseReceiptUrl
      ) {
        throw new Error("Tiket material belum memiliki bukti pembelian dari Logistik.");
      }
      if (order && order.status !== POStatus.APPROVED) {
        throw new Error("PO belum disetujui Direktur.");
      }
      if (order && !ticket.purchaseReceiptUrl) {
        throw new Error("Logistik harus mengunggah invoice/bon sebelum pembayaran PO.");
      }
      const invoiceTotal = order
        ? order.invoices[0]?.grandTotal ??
          Math.round(
            order.items.reduce((sum, item) => sum + item.totalPrice, 0) *
              (order.includeTax ? 1.11 : 1) *
              100,
          ) / 100
        : ticket.requestedAmount ??
          (ticket.totalAmount
            ? decimalFromScaledInteger(ticket.totalAmount).toNumber()
            : 0);
      if (!Number.isFinite(invoiceTotal) || invoiceTotal <= 0) {
        throw new Error("Total tagihan tiket tidak valid.");
      }
      if (
        isInternalFundingRequest &&
        (!ticket.isApprovedByDirector ||
          paymentType !== PaymentType.FULL_PAYMENT ||
          (paymentMethod === POPaymentMethod.TRANSFER &&
            !isBoundedText(transferDestination, 300)))
      ) {
        throw new Error(
          "Pengajuan internal harus disetujui Direktur dan dibayar lunas; tujuan transfer wajib diisi untuk pembayaran transfer.",
        );
      }
      const effectiveTransferDestination =
        isInternalFundingRequest && paymentMethod === POPaymentMethod.CASH
          ? "Tunai"
          : transferDestination.trim();
      const paymentWhere = {
        status: PaymentStatus.PAID,
        ...(order ? { poId: order.id } : { ticketId }),
      };
      const previousPayments = await transaction.paymentTransaction.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
      });
      if (
        paymentType === PaymentType.DOWN_PAYMENT &&
        (await transaction.paymentTransaction.findFirst({
          where: paymentWhere,
          select: { id: true },
        }))
      ) {
        throw new Error("DP hanya dapat digunakan pada pembayaran pertama.");
      }
      const allocation = allocatePaymentAmount(
        invoiceTotal,
        previousPayments._sum.amount ?? 0,
        paymentType,
        requestedPaymentAmount,
      );
      const { amount, remainingAfter: newRemaining, isFullyPaid } = allocation;
      const now = new Date();
      const confirmationOrderNumber = order
        ? await nextDocumentNumber(transaction, "KO")
        : null;
      const payment = await transaction.paymentTransaction.create({
        data: {
          poId: order?.id,
          ticketId: order ? undefined : ticketId,
          confirmationOrderNumber,
          paymentType,
          amount,
          transferDestination: effectiveTransferDestination,
          status: PaymentStatus.PAID,
          processedById: session.user.id,
          proofOfTransferUrl: receiptUrl,
          additionalProofUrls: receiptUrls.slice(1),
          paidAt: now,
        },
        select: { id: true },
      });
      await recordFinanceCashflowOutflow(transaction, {
        paymentTransactionId: payment.id,
        financeAccountId,
        amount,
        sourceDesc: `Pembayaran ${order?.poNumber ?? ticket.ticketNumber} · ${ticket.title}`,
        projectId: ticket.projectId,
        paymentMethod:
          isInternalFundingRequest
            ? paymentMethod === POPaymentMethod.CASH
              ? "CASH"
              : "TRANSFER"
            : ticket.requestPaymentMethod === POPaymentMethod.CASH
            ? "CASH"
            : "TRANSFER",
        proofUrl: receiptUrl,
        recordedBy: session.user.id,
      });

      if (order && confirmationOrderNumber) {
        const invoice = order.invoices[0];
        const subtotal =
          invoice?.subTotal ??
          order.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const tax =
          invoice?.tax ??
          (order.includeTax ? Math.round(subtotal * 0.11 * 100) / 100 : 0);
        await transaction.orderConfirmation.create({
          data: {
            publicCode: await generateAvailablePublicCode(transaction),
            koNumber: confirmationOrderNumber,
            poId: order.id,
            paymentTransactionId: payment.id,
            paymentTerms: order.paymentTerms,
            paymentType,
            paymentAmount: amount,
            transferDestination: transferDestination.trim(),
            proofOfTransferUrl: receiptUrl,
            paidAt: now,
            subTotal: subtotal,
            tax,
            grandTotal: invoice?.grandTotal ?? subtotal + tax,
            items: {
              create: order.items.map((item) => ({
                itemCode: item.itemCode,
                description: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
              })),
            },
          },
        });
        if (invoice) {
          await transaction.invoice.updateMany({
            where: { poId: order.id, status: { not: "PAID" } },
            data: {
              status: isFullyPaid ? "PAID" : "PARTIAL",
            },
          });
        }
      }

      if (order && isFullyPaid) {
        await transaction.purchaseOrder.update({
          where: { id: order.id },
          data: {
            paidAt: now,
            paymentReceiptUrl: receiptUrl,
            transferDestination: transferDestination.trim(),
          },
        });
        await receivePurchaseOrderStock(transaction, {
          purchaseOrderId: order.id,
          poNumber: order.poNumber,
          vendorName: order.vendorName,
          projectId: ticket.projectId,
          receivedById: session.user.id,
          notes: `Penerimaan pembelian PO ${order.poNumber}; menunggu DO untuk pemenuhan tiket.`,
          items: order.items,
        });
        await transaction.ticketItem.updateMany({
          where: {
            ticketId,
            poItemId: { in: order.items.map((item) => item.id) },
            status: FulfillmentStatus.PROCESSED_TO_PO,
          },
          data: {
            status: FulfillmentStatus.PENDING,
            categoryHint: TicketCategoryHint.WAREHOUSE,
          },
        });
      }

      if (isFullyPaid) {
        await transaction.ticket.update({
          where: { id: ticketId },
          data: {
            ...(order
              ? ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
                ticket.status === TicketStatus.PROCESSED_FINANCE
                ? { status: TicketStatus.PROCESSED_LOGISTIC }
                : {}
              : { status: TicketStatus.COMPLETED }),
            transferReceiptUrl: receiptUrl,
            transferDestination: effectiveTransferDestination,
            ...(isInternalFundingRequest
              ? { paymentProofUrl: receiptUrl }
              : {}),
            updatedAt: now,
          },
        });
      } else {
        await transaction.ticket.update({
          where: { id: ticketId },
          data: {
            transferReceiptUrl: receiptUrl,
            transferDestination: effectiveTransferDestination,
            updatedAt: now,
          },
        });
      }
      if (ticket.type === TicketType.MATERIAL) {
        await syncTicketStatus(transaction, ticketId);
      }
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: session.user.id,
          action: isFullyPaid
            ? "FINANCE_PAYMENT_COMPLETED"
            : "FINANCE_PAYMENT_PARTIAL",
          notes: `${paymentType === PaymentType.DOWN_PAYMENT ? "DP" : paymentType === PaymentType.PROGRESS_PAYMENT ? "Pembayaran termin" : "Pelunasan"} sebesar Rp${amount.toLocaleString("id-ID")}; sisa tagihan Rp${newRemaining.toLocaleString("id-ID")}.`,
        },
      });
      if (order && confirmationOrderNumber) {
        await sendNotification({
          roleTarget: UserRole.LOGISTICS,
          title: "KO Siap Dikirim ke Vendor",
          message: `KO ${confirmationOrderNumber} untuk pembayaran ${paymentType === PaymentType.DOWN_PAYMENT ? "DP" : paymentType === PaymentType.PROGRESS_PAYMENT ? "termin" : "pelunasan"} PO #${order.poNumber} siap diteruskan bersama bukti transfer.`,
          actionUrl: "/apps/logistics?tab=documents",
          type: NotificationType.SUCCESS,
          database: transaction,
        });
      }
      if (order && isFullyPaid) {
        await sendNotification({
          roleTarget: UserRole.LOGISTICS,
          title: "PO Lunas",
          message: `PO #${order.poNumber} telah lunas dan material masuk stok gudang.`,
          actionUrl: `/apps/logistics?tab=tickets&openSheet=${encodeURIComponent(ticketId)}`,
          type: NotificationType.SUCCESS,
          database: transaction,
        });
      }
    });
  } catch (error) {
    await removeFinancePaymentProofs(receiptUrls);
    console.error("Finance ticket payment failed:", error);
    return actionFailure(
      error instanceof Error
        ? error.message
        : "Pembayaran tiket gagal diproses. Silakan coba kembali.",
    );
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/approvals");
  return {
    success: true,
    message:
      paymentType === PaymentType.FULL_PAYMENT
        ? "Pelunasan berhasil dicatat."
        : "Pembayaran sebagian berhasil dicatat; sisa tagihan tetap terbuka.",
  };
}

export async function processFinanceStandalonePurchaseOrderPayment(
  publicCode: string,
  proof: FinancePaymentProofInput,
  transferDestination: string,
  financeAccountId: string,
  paymentType: PaymentType = PaymentType.FULL_PAYMENT,
  requestedPaymentAmount?: number,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.FINANCE) {
    return actionFailure("Hanya Keuangan yang dapat menyelesaikan pembayaran PO.");
  }
  if (!isValidPublicCode(publicCode)) {
    return actionFailure("Kode Purchase Order tidak valid.");
  }
  if (
    !isBoundedText(transferDestination, 300) ||
    !isBoundedText(financeAccountId, 100)
  ) {
    return actionFailure(
      "Keterangan tujuan transfer dan buku bank/kas sumber wajib dipilih.",
    );
  }
  if (!isValidFinancePaymentProofInput(proof)) {
    return actionFailure("Bukti pembayaran wajib diunggah.");
  }
  if (!Object.values(PaymentType).includes(paymentType)) {
    return actionFailure("Jenis pembayaran tidak valid.");
  }
  if (
    paymentType !== PaymentType.FULL_PAYMENT &&
    (!Number.isFinite(requestedPaymentAmount) ||
      requestedPaymentAmount! <= 0)
  ) {
    return actionFailure("Nominal pembayaran sebagian harus lebih besar dari nol.");
  }

  let receiptUrls: string[];
  let receiptUrl: string;
  try {
    receiptUrls = await storeFinancePaymentProofs(proof);
    receiptUrl = receiptUrls[0];
  } catch (error) {
    return actionFailure(
      error instanceof Error ? error.message : "File bukti gagal diproses.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          projectId: true,
          poNumber: true,
          vendorName: true,
          status: true,
          ticketId: true,
          vendorInvoiceUrl: true,
          includeTax: true,
          paymentTerms: true,
          invoices: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              subTotal: true,
              tax: true,
              deduction: true,
              grandTotal: true,
              documentUrl: true,
              items: {
                orderBy: { id: "asc" },
                select: {
                  itemCode: true,
                  description: true,
                  quantity: true,
                  unit: true,
                  unitPrice: true,
                  totalPrice: true,
                },
              },
            },
          },
          items: {
            orderBy: { id: "asc" },
            select: {
              itemCode: true,
              stockItemId: true,
              itemName: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
      });
      if (!order || order.ticketId) {
        throw new Error("PO restock gudang tidak ditemukan.");
      }
      if (order.status !== POStatus.APPROVED) {
        throw new Error("PO belum disetujui Direktur.");
      }
      if (!order.vendorInvoiceUrl && !order.invoices[0]?.documentUrl) {
        throw new Error("Logistik harus mengunggah invoice/bon sebelum pembayaran PO.");
      }
      await acquireMongoTransactionLock(transaction, `po-payment:${order.id}`);
      const subtotal = order.invoices[0]?.subTotal ?? order.items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );
      const tax =
        order.invoices[0]?.tax ??
        Math.round(subtotal * (order.includeTax ? 0.11 : 0) * 100) / 100;
      const total =
        order.invoices[0]?.grandTotal ?? subtotal + tax;
      const paymentHistory = await transaction.paymentTransaction.aggregate({
        where: { poId: order.id, status: PaymentStatus.PAID },
        _sum: { amount: true },
      });
      if (
        paymentType === PaymentType.DOWN_PAYMENT &&
        (await transaction.paymentTransaction.findFirst({
          where: { poId: order.id, status: PaymentStatus.PAID },
          select: { id: true },
        }))
      ) {
        throw new Error("DP hanya dapat digunakan pada pembayaran pertama.");
      }
      const allocation = allocatePaymentAmount(
        total,
        paymentHistory._sum.amount ?? 0,
        paymentType,
        requestedPaymentAmount,
      );
      const { amount, isFullyPaid } = allocation;
      const now = new Date();
      const confirmationOrderNumber = await nextDocumentNumber(
        transaction,
        "KO",
      );
      const payment = await transaction.paymentTransaction.create({
        data: {
          poId: order.id,
          confirmationOrderNumber,
          paymentType,
          amount,
          transferDestination: transferDestination.trim(),
          status: PaymentStatus.PAID,
          processedById: session.user.id,
          proofOfTransferUrl: receiptUrl,
          additionalProofUrls: receiptUrls.slice(1),
          paidAt: now,
        },
        select: { id: true },
      });
      await recordFinanceCashflowOutflow(transaction, {
        paymentTransactionId: payment.id,
        financeAccountId,
        amount,
        sourceDesc: `Pembayaran ${order.poNumber} · ${order.vendorName}`,
        projectId: order.projectId,
        paymentMethod: "TRANSFER",
        proofUrl: receiptUrl,
        recordedBy: session.user.id,
      });
      const invoice = order.invoices[0];
      await transaction.orderConfirmation.create({
        data: {
          publicCode: await generateAvailablePublicCode(transaction),
          koNumber: confirmationOrderNumber,
          poId: order.id,
          paymentTransactionId: payment.id,
          paymentTerms: order.paymentTerms,
          paymentType,
          paymentAmount: amount,
          transferDestination: transferDestination.trim(),
          proofOfTransferUrl: receiptUrl,
          paidAt: now,
          subTotal: subtotal,
          tax,
          grandTotal: invoice?.grandTotal ?? total,
          items: {
            create: order.items.map((item) => ({
              itemCode: item.itemCode,
              description: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
      });
      if (invoice) {
        await transaction.invoice.updateMany({
          where: { poId: order.id, status: { not: "PAID" } },
          data: { status: isFullyPaid ? "PAID" : "PARTIAL" },
        });
      }

      if (isFullyPaid) {
        await transaction.purchaseOrder.update({
          where: { id: order.id },
          data: {
            paidAt: now,
            paymentReceiptUrl: receiptUrl,
            transferDestination: transferDestination.trim(),
          },
        });
      }

      await sendNotification({
        roleTarget: UserRole.LOGISTICS,
        title: "KO Siap Dikirim ke Vendor",
        message: `KO ${confirmationOrderNumber} untuk pembayaran ${paymentType === PaymentType.DOWN_PAYMENT ? "DP" : paymentType === PaymentType.PROGRESS_PAYMENT ? "termin" : "pelunasan"} PO #${order.poNumber} siap diteruskan bersama bukti transfer.`,
        actionUrl: "/apps/logistics?tab=documents",
        type: NotificationType.SUCCESS,
        database: transaction,
      });

      if (isFullyPaid) {
        await sendNotification({
          roleTarget: UserRole.LOGISTICS,
          title: "PO Lunas, Menunggu Penerimaan",
          message: `Pembayaran PO #${order.poNumber} telah lunas. Catat penerimaan barang setelah dikirim vendor.`,
          actionUrl: "/apps/logistics?tab=documents",
          type: NotificationType.SUCCESS,
          database: transaction,
        });
      }
    });
  } catch (error) {
    await removeFinancePaymentProofs(receiptUrls);
    console.error("Standalone Purchase Order payment failed:", error);
    return actionFailure(
      error instanceof Error &&
        (error.message === "PO restock gudang tidak ditemukan." ||
          error.message === "PO belum disetujui Direktur." ||
          error.message === "PO ini sudah lunas." ||
          error.message.startsWith("Total tagihan") ||
          error.message.startsWith("Tagihan sudah lunas.") ||
          error.message.startsWith("Nominal") ||
          error.message.startsWith("Saldo buku bank/kas") ||
          error.message.startsWith("Buku bank/kas sumber") ||
          error.message.startsWith("Barang ") ||
          error.message.startsWith("PO tidak memiliki rincian") ||
          error.message.startsWith("Status pembayaran PO") ||
          error.message.startsWith("DP hanya"))
        ? error.message
        : "Pembayaran PO gagal diproses. Muat ulang halaman dan coba kembali.",
    );
  }

  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/orders");
  revalidatePath(`/d/${publicCode}`);
  return {
    success: true,
    message:
      paymentType === PaymentType.FULL_PAYMENT
        ? "Pelunasan PO berhasil; menunggu pengiriman vendor dan konfirmasi penerimaan Logistik."
        : "Pembayaran sebagian PO berhasil dicatat; PO menunggu pelunasan.",
  };
}

export async function processFinanceDirectStockPurchasePayment(
  purchaseId: string,
  proof: FinancePaymentProofInput,
  transferDestination: string,
  financeAccountId: string,
  paymentType: PaymentType = PaymentType.FULL_PAYMENT,
  requestedPaymentAmount?: number,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.FINANCE) {
    return actionFailure(
      "Hanya Keuangan yang dapat memproses pembayaran pembelian langsung.",
    );
  }
  if (typeof purchaseId !== "string" || !purchaseId.trim()) {
    return actionFailure("Data pembelian tidak valid.");
  }
  if (
    !isBoundedText(transferDestination, 300) ||
    !isBoundedText(financeAccountId, 100)
  ) {
    return actionFailure(
      "Keterangan tujuan transfer dan buku bank/kas sumber wajib dipilih.",
    );
  }
  if (
    !isValidFinancePaymentProofInput(proof) ||
    !Object.values(PaymentType).includes(paymentType)
  ) {
    return actionFailure("Jenis pembayaran atau bukti transfer tidak valid.");
  }
  if (
    paymentType !== PaymentType.FULL_PAYMENT &&
    (!Number.isFinite(requestedPaymentAmount) || requestedPaymentAmount! <= 0)
  ) {
    return actionFailure("Nominal pembayaran sebagian harus lebih besar dari nol.");
  }

  let receiptUrls: string[];
  let receiptUrl: string;
  try {
    receiptUrls = await storeFinancePaymentProofs(proof);
    receiptUrl = receiptUrls[0];
  } catch (error) {
    return actionFailure(
      error instanceof Error ? error.message : "File bukti gagal diproses.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const purchase = await transaction.directStockPurchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          purchaseNumber: true,
          vendorName: true,
          totalAmount: true,
          isApprovedByDirector: true,
          vendorInvoiceUrl: true,
          status: true,
          ticketId: true,
          ticket: { select: { projectId: true } },
        },
      });
      if (!purchase) throw new Error("Pembelian langsung tidak ditemukan.");
      if (!purchase.isApprovedByDirector) {
        throw new Error("Pembelian langsung wajib disetujui Direktur sebelum pembayaran.");
      }
      if (!purchase.vendorInvoiceUrl) {
        throw new Error("Logistik harus melampirkan invoice/bon sebelum pembayaran.");
      }
      await acquireMongoTransactionLock(
        transaction,
        `direct-stock-payment:${purchase.id}`,
      );
      const paymentHistory = await transaction.paymentTransaction.aggregate({
        where: {
          directStockPurchaseId: purchase.id,
          status: PaymentStatus.PAID,
        },
        _sum: { amount: true },
      });
      if (
        paymentType === PaymentType.DOWN_PAYMENT &&
        (await transaction.paymentTransaction.findFirst({
          where: {
            directStockPurchaseId: purchase.id,
            status: PaymentStatus.PAID,
          },
          select: { id: true },
        }))
      ) {
        throw new Error("DP hanya dapat digunakan pada pembayaran pertama.");
      }
      const total = decimalFromScaledInteger(purchase.totalAmount).toNumber();
      const allocation = allocatePaymentAmount(
        total,
        paymentHistory._sum.amount ?? 0,
        paymentType,
        requestedPaymentAmount,
      );
      const { amount, isFullyPaid } = allocation;
      const now = new Date();
      const payment = await transaction.paymentTransaction.create({
        data: {
          directStockPurchaseId: purchase.id,
          paymentType,
          amount,
          transferDestination: transferDestination.trim(),
          status: PaymentStatus.PAID,
          processedById: session.user.id,
          proofOfTransferUrl: receiptUrl,
          additionalProofUrls: receiptUrls.slice(1),
          paidAt: now,
        },
        select: { id: true },
      });
      await recordFinanceCashflowOutflow(transaction, {
        paymentTransactionId: payment.id,
        financeAccountId,
        amount,
        sourceDesc: `Pembelian langsung ${purchase.purchaseNumber} · ${purchase.vendorName}`,
        projectId: purchase.ticket?.projectId,
        paymentMethod: "TRANSFER",
        proofUrl: receiptUrl,
        recordedBy: session.user.id,
      });
      if (purchase.ticketId) {
        const paymentLabel =
          paymentType === PaymentType.DOWN_PAYMENT
            ? "DP"
            : paymentType === PaymentType.PROGRESS_PAYMENT
              ? "pembayaran termin"
              : isFullyPaid
                ? "pelunasan"
                : "pembayaran";
        await transaction.ticketAuditLog.create({
          data: {
            ticketId: purchase.ticketId,
            userId: session.user.id,
            action: "DIRECT_PURCHASE_PAYMENT",
            notes: `${paymentLabel} pembelian langsung ${purchase.purchaseNumber} sebesar Rp${amount.toLocaleString("id-ID")} dicatat oleh Keuangan; bukti transfer tersedia di Riwayat Pembayaran.`,
          },
        });
      }
      if (isFullyPaid) {
        await transaction.directStockPurchase.update({
          where: { id: purchase.id },
          data: { paidAt: now },
        });
      }
      if (
        purchase.status === DirectStockPurchaseStatus.PENDING_RECEIPT &&
        (paymentHistory._sum.amount ?? 0) === 0
      ) {
        await sendNotification({
          roleTarget: UserRole.LOGISTICS,
          title: "Pembelian Langsung Siap Diterima",
          message: `Bukti pembayaran pembelian ${purchase.purchaseNumber} telah diunggah. Logistik dapat mencatat penerimaan dan mengunggah foto barang.`,
          actionUrl: "/apps/logistics?tab=stock",
          type: NotificationType.SUCCESS,
          database: transaction,
        });
      }
    });
  } catch (error) {
    await removeFinancePaymentProofs(receiptUrls);
    console.error("Direct stock purchase payment failed:", error);
    return actionFailure(
      error instanceof Error &&
        (error.message === "Pembelian langsung tidak ditemukan." ||
          error.message ===
            "Pembelian langsung wajib disetujui Direktur sebelum pembayaran." ||
          error.message ===
            "Logistik harus melampirkan invoice/bon sebelum pembayaran." ||
        error.message === "Pembelian langsung ini sudah lunas." ||
          error.message.startsWith("Saldo buku bank/kas") ||
          error.message.startsWith("Buku bank/kas sumber") ||
          error.message.startsWith("Total tagihan") ||
          error.message.startsWith("Tagihan sudah lunas.") ||
          error.message.startsWith("DP hanya") ||
          error.message.startsWith("Nominal pembayaran"))
        ? error.message
        : "Pembayaran pembelian langsung gagal diproses. Coba kembali.",
    );
  }

  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/tickets");
  return {
    success: true,
    message:
      paymentType === PaymentType.FULL_PAYMENT
        ? "Pelunasan pembelian langsung berhasil dicatat."
        : "Pembayaran sebagian pembelian langsung berhasil dicatat.",
  };
}

export type PaymentRecordTarget =
  | { kind: "ticket"; id: string }
  | { kind: "purchase-order"; id: string }
  | { kind: "direct-purchase"; id: string };

export async function submitPaymentRecord(input: {
  target: PaymentRecordTarget;
  files?: File[];
  file?: File;
  proofOfTransferUrl?: string;
  transferDestination: string;
  financeAccountId: string;
  paymentType: PaymentType;
  amount?: number;
  paymentMethod?: POPaymentMethod;
}): Promise<TicketActionResult> {
  if (
    !input ||
    !input.target ||
    typeof input.target !== "object" ||
    typeof input.target.id !== "string" ||
    !input.target.id.trim()
  ) {
    return actionFailure("Data pembayaran atau bukti transfer tidak valid.");
  }
  const proofSourceCount = [
    input.files !== undefined,
    input.file !== undefined,
    input.proofOfTransferUrl !== undefined,
  ].filter(Boolean).length;
  if (
    proofSourceCount !== 1 ||
    (input.files !== undefined &&
      (!Array.isArray(input.files) ||
        !isValidFinancePaymentProofInput(input.files))) ||
    (input.file !== undefined &&
      (!(input.file instanceof File) ||
        !isValidFinancePaymentProofInput(input.file))) ||
    (input.proofOfTransferUrl !== undefined &&
      !isValidFinancePaymentProofInput(input.proofOfTransferUrl)) ||
    !isBoundedText(input.transferDestination, 300) ||
    !isBoundedText(input.financeAccountId, 100) ||
    !Object.values(PaymentType).includes(input.paymentType) ||
    (input.paymentMethod !== undefined &&
      !Object.values(POPaymentMethod).includes(input.paymentMethod))
  ) {
    return actionFailure("Data pembayaran atau bukti transfer tidak valid.");
  }
  const proof = input.files ?? input.proofOfTransferUrl ?? input.file;
  if (!proof) {
    return actionFailure("Bukti pembayaran wajib diunggah.");
  }
  if (input.target.kind === "ticket") {
    return processFinancePayment(
      input.target.id,
      proof,
      input.transferDestination,
      input.financeAccountId,
      input.paymentType,
      input.amount,
      input.paymentMethod,
    );
  }
  if (input.target.kind === "purchase-order") {
    return processFinanceStandalonePurchaseOrderPayment(
      input.target.id,
      proof,
      input.transferDestination,
      input.financeAccountId,
      input.paymentType,
      input.amount,
    );
  }
  if (input.target.kind === "direct-purchase") {
    return processFinanceDirectStockPurchasePayment(
      input.target.id,
      proof,
      input.transferDestination,
      input.financeAccountId,
      input.paymentType,
      input.amount,
    );
  }
  return actionFailure("Jenis tagihan tidak valid.");
}

export async function replaceFinancePaymentProof(
  paymentTransactionId: string,
  file: File,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.FINANCE) {
    return actionFailure("Hanya Keuangan yang dapat mengganti bukti transfer.");
  }
  if (
    !isBoundedText(paymentTransactionId, 191) ||
    !paymentTransactionId.trim() ||
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024
  ) {
    return actionFailure("Pilih file bukti (PDF/JPG/PNG/WEBP) maksimal 5 MB.");
  }

  let uploadedProofUrl: string | null = null;
  try {
    uploadedProofUrl = await storeFinancePaymentProof(file);
    if (!isFinancePaymentProofUrl(uploadedProofUrl)) {
      throw new Error("Cloudinary mengembalikan URL bukti yang tidak valid.");
    }

    const updated = await prisma.paymentTransaction.updateMany({
      where: {
        id: paymentTransactionId.trim(),
        status: PaymentStatus.PAID,
        proofOfTransferUrl: { startsWith: "/api/tickets/receipts/" },
      },
      data: { proofOfTransferUrl: uploadedProofUrl },
    });
    if (updated.count !== 1) {
      await removeTicketReceipt(uploadedProofUrl);
      return actionFailure(
        "Transaksi tidak ditemukan atau bukti transfernya sudah diperbarui.",
      );
    }
  } catch (error) {
    if (uploadedProofUrl) {
      try {
        await removeTicketReceipt(uploadedProofUrl);
      } catch (cleanupError) {
        console.error(
          "Failed to remove an unreferenced replacement payment proof:",
          cleanupError,
        );
      }
    }
    console.error("Finance payment proof replacement failed:", error);
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryPrivatePdfValidationError
    ) {
      return actionFailure(error.message);
    }
    return actionFailure("Bukti transfer gagal diperbarui. Silakan coba kembali.");
  }

  revalidatePath("/apps/finance");
  revalidatePath("/apps/tickets");
  revalidatePath("/apps/orders");
  return {
    success: true,
    message: "Bukti transfer berhasil diperbarui.",
  };
}

export async function processMoverDelivery(
  _ticketId: string,
  _file: File,
): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.MOVER) {
    return actionFailure("Hanya Mover yang dapat melakukan aksi pengiriman.");
  }
  return actionFailure(
    "Selesaikan pengiriman melalui Surat Jalan pada Ruang Kerja Mover.",
  );
}

async function transitionTicket({
  ticketId,
  expectedStatus,
  nextStatus,
  allowedRoles,
  action,
  notes,
  requesterOnly = false,
  notifications = [],
  directorApproval = false,
}: {
  ticketId: string;
  expectedStatus: TicketStatus | TicketStatus[];
  nextStatus: TicketStatus;
  allowedRoles: UserRole[] | null;
  action: string;
  notes: string;
  requesterOnly?: boolean;
  directorApproval?: boolean;
  notifications?: {
    roleTarget?: UserRole | UserRole[];
    userId?: string;
    title: string;
    message: string;
    actionUrl: string;
    type: NotificationType;
  }[];
}): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk untuk melanjutkan.");
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return actionFailure("Role Anda tidak diizinkan melakukan aksi ini.");
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const update = await transaction.ticket.updateMany({
        where: {
          id: ticketId,
          status: Array.isArray(expectedStatus)
            ? { in: expectedStatus }
            : expectedStatus,
          ...(requesterOnly ? { requesterId: session.user.id } : {}),
        },
        data: {
          status: nextStatus,
          ...(directorApproval ? { isApprovedByDirector: true } : {}),
          updatedAt: new Date(),
        },
      });

      if (update.count !== 1) {
        throw new Error("Tiket tidak ditemukan atau statusnya sudah berubah.");
      }

      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: session.user.id,
          action,
          notes,
        },
      });
      for (const notification of notifications) {
        await sendNotification({
          ...notification,
          database: transaction,
        });
      }
    });
  } catch (error) {
    console.error(`Ticket transition ${action} failed:`, error);
    return actionFailure(
      error instanceof Error && error.message.includes("statusnya sudah berubah")
        ? error.message
        : "Aksi gagal diproses. Muat ulang tiket dan coba kembali.",
    );
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/project");
  revalidatePath("/apps/projects");
  revalidatePath("/apps/approvals");
  revalidatePath("/apps/finance");
  return { success: true, message: "Status tiket berhasil diperbarui." };
}

async function transitionWithReceipt({
  ticketId,
  file,
  role,
  expectedStatuses,
  nextStatus,
  receiptField,
  action,
  notes,
  requireMaterialPurchase,
  ticketType,
  transferDestination,
  notifications = [],
}: {
  ticketId: string;
  file: File;
  role: UserRole;
  expectedStatuses: TicketStatus[];
  nextStatus: TicketStatus;
  receiptField: "purchaseReceiptUrl" | "transferReceiptUrl" | "deliveryReceiptUrl";
  action: string;
  notes: string;
  requireMaterialPurchase: boolean;
  ticketType?: TicketType;
  transferDestination?: string;
  notifications?: {
    roleTarget: UserRole | UserRole[];
    title: string;
    message: string;
    actionUrl: string;
    type: NotificationType;
  }[];
}): Promise<TicketActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return actionFailure("Silakan masuk untuk melanjutkan.");
  }
  if (session.user.role !== role) {
    return actionFailure("Role Anda tidak diizinkan melakukan aksi ini.");
  }
  if (!(file instanceof File)) {
    return actionFailure("Bukti file wajib diunggah.");
  }

  let receiptUrl: string;
  try {
    receiptUrl = await saveTicketReceipt(file);
  } catch (error) {
    return actionFailure(
      error instanceof Error ? error.message : "File bukti gagal diproses.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await lockTicketFulfillment(transaction, ticketId);
      const relatedTicket = await transaction.ticket.findUnique({
        where: { id: ticketId },
        select: {
          type: true,
          projectId: true,
          purchaseOrders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              poNumber: true,
              status: true,
              paidAt: true,
              paymentReceiptUrl: true,
              transferDestination: true,
              vendorName: true,
              items: {
                orderBy: { id: "asc" },
                select: {
                  stockItemId: true,
                  itemName: true,
                  quantity: true,
                  unit: true,
                  unitPrice: true,
                },
              },
            },
          },
        },
      });
      if (!relatedTicket) {
        throw new Error("Tiket tidak ditemukan.");
      }
      const purchaseOrder = relatedTicket.purchaseOrders[0];
      if (relatedTicket.type === TicketType.MATERIAL && purchaseOrder) {
        if (receiptField === "transferReceiptUrl") {
          if (purchaseOrder.status !== POStatus.APPROVED) {
            throw new Error("PO belum disetujui Direktur.");
          }
          if (purchaseOrder.paidAt || purchaseOrder.paymentReceiptUrl) {
            throw new Error("PO ini sudah memiliki bukti pembayaran.");
          }
          const paidOrder = await transaction.purchaseOrder.updateMany({
            where: {
              id: purchaseOrder.id,
              status: POStatus.APPROVED,
              paidAt: null,
              paymentReceiptUrl: null,
            },
            data: {
              paidAt: new Date(),
              paymentReceiptUrl: receiptUrl,
              transferDestination,
            },
          });
          if (paidOrder.count !== 1) {
            throw new Error(
              "Status pembayaran PO berubah. Muat ulang dan coba kembali.",
            );
          }
          await receivePurchaseOrderStock(transaction, {
            purchaseOrderId: purchaseOrder.id,
            poNumber: purchaseOrder.poNumber,
            vendorName: purchaseOrder.vendorName,
            projectId: relatedTicket.projectId,
            receivedById: session.user.id,
            notes: `Penerimaan pembelian PO ${purchaseOrder.poNumber}; menunggu DO untuk pemenuhan tiket.`,
            items: purchaseOrder.items,
          });
        } else if (
          nextStatus === TicketStatus.COMPLETED &&
          (!purchaseOrder.paidAt ||
            !purchaseOrder.paymentReceiptUrl ||
            !purchaseOrder.transferDestination)
        ) {
          throw new Error(
            `PO #${purchaseOrder.poNumber} belum lunas atau belum memiliki bukti transfer Finance.`,
          );
        }
      }
      const update = await transaction.ticket.updateMany({
        where: {
          id: ticketId,
          status: { in: expectedStatuses },
          ...(ticketType ? { type: ticketType } : {}),
          ...(requireMaterialPurchase
            ? {
                OR: [
                  { type: { not: TicketType.MATERIAL } },
                  { purchaseReceiptUrl: { not: null } },
                ],
              }
            : {}),
        },
        data: {
          status: nextStatus,
          [receiptField]: receiptUrl,
          ...(transferDestination ? { transferDestination } : {}),
          updatedAt: new Date(),
        },
      });

      if (update.count !== 1) {
        throw new Error("Tiket tidak ditemukan atau statusnya sudah berubah.");
      }

      if (relatedTicket.type === TicketType.MATERIAL) {
        await syncTicketStatus(transaction, ticketId);
      }
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId,
          userId: session.user.id,
          action,
          notes,
        },
      });
      for (const notification of notifications) {
        await sendNotification({
          ...notification,
          database: transaction,
        });
      }
    });
  } catch (error) {
    try {
      await removeTicketReceipt(receiptUrl);
    } catch (cleanupError) {
      console.error("Failed to remove an unreferenced ticket receipt:", cleanupError);
    }
    console.error(`Ticket transition ${action} failed:`, error);
    return actionFailure(
      error instanceof Error &&
        (error.message.includes("statusnya sudah berubah") ||
          error.message === "Tiket tidak ditemukan." ||
          error.message === "PO belum disetujui Direktur." ||
          error.message === "PO ini sudah memiliki bukti pembayaran." ||
          error.message.startsWith("Barang ") ||
          error.message.startsWith("PO tidak memiliki rincian") ||
          error.message.startsWith("PO #") ||
          error.message.startsWith("Status pembayaran PO"))
        ? error.message
        : "Aksi gagal diproses. Muat ulang tiket dan coba kembali.",
    );
  }

  revalidatePath("/apps/tickets");
  revalidatePath("/apps/project");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/finance");
  return {
    success: true,
    message:
      nextStatus === TicketStatus.PROCESSED_LOGISTIC
        ? "Pembayaran PO tercatat; barang masuk ke stok gudang dan siap diproses dengan DO."
        : "Bukti tersimpan dan status tiket diperbarui.",
  };
}
