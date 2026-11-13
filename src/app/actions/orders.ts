"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  DirectStockPurchaseStatus,
  DOStatus,
  DODeliveryMethod,
  FulfillmentStatus,
  NotificationType,
  PaymentStatus,
  POPaymentMethod,
  POStatus,
  StockMovementType,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { resolveVendorBankAccount } from "@/lib/vendor-bank-accounts";
import {
  generateAvailablePublicCode,
  isValidPublicCode,
} from "@/lib/documents/random-code";
import {
  getRequestOrigin,
  resolvePublicAppUrl,
} from "@/lib/documents/public-app-url";
import { nextDocumentNumber } from "@/lib/documents/numbering";
import { createBrandedQrDataUrl } from "@/lib/documents/qr-code";
import { documentVerificationPath } from "@/lib/documents/verification-url";
import { lockTicketDeliveryOrderCreation } from "@/lib/documents/lock-ticket-delivery-order";
import {
  buildActiveDirectPurchaseLookup,
  findActiveDirectPurchaseNumber,
  lockTicketFulfillment,
  normalizeTicketStockValue,
  syncTicketStatus,
} from "@/lib/ticket-utils";
import { sendNotification } from "@/lib/notifications";
import {
  DeliveryOrderArrivalPhotoValidationError,
  removeDeliveryOrderArrivalPhoto,
  saveDeliveryOrderArrivalPhoto,
} from "@/lib/delivery-order-arrival-photos";
import { Prisma } from "@prisma/client";
import { removeTicketReceipt, saveTicketReceipt } from "@/lib/ticket-receipts";
import { VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER } from "@/lib/vehicle-fuel";
import { isPurchaseOrderInvoiceUrl } from "@/lib/purchase-order-invoices";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  CloudinaryRawFileValidationError,
  removeCloudinaryRawFile,
  uploadCloudinaryRawFile,
} from "@/lib/cloudinary-raw-files";
import { PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER } from "@/lib/purchase-order-invoice-config";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";
import { receivePurchaseOrderStock } from "@/lib/logistics/receive-purchase-order-stock";
import {
  vendorInvoiceInputSchema,
  type VendorInvoiceInput,
} from "@/lib/invoice-input";
import { formatVendorBankAccount } from "@/lib/vendor-bank-accounts";

export type PurchaseOrderItemInput = {
  stockItemId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type DeliveryOrderItemInput = {
  id?: string;
  itemCode?: string | null;
  itemName: string;
  qtyOrdered: number;
  qtyDelivered: number;
  unit: string;
  remarks?: string;
};

export type OrderActionResult = {
  success: boolean;
  message: string;
  publicCode?: string;
  qrDataUrl?: string;
  actorName?: string;
  approvedAt?: string;
  invoiceId?: string;
};

type PurchaseOrderInput = {
  poNumber?: string;
  vendorId?: string;
  vendorBankAccountId?: string;
  vendorName: string;
  paymentMethod?: POPaymentMethod;
  paymentBankName?: string;
  paymentAccountNumber?: string;
  paymentAccountName?: string;
  paymentTerms?: string;
  includeTax?: boolean;
  items: PurchaseOrderItemInput[];
};

type DeliveryOrderInput = {
  doNumber?: string;
  ticketId?: string;
  vehicleId?: string;
  deliveryMethod?: DODeliveryMethod;
  vehicleDocumentNumber?: string;
  driverName?: string;
  vehiclePlate?: string;
  driverIdentityNumber?: string;
  driverPhone?: string;
  receiverName?: string;
  status: DOStatus;
  items: DeliveryOrderItemInput[];
};

const fail = (message: string): OrderActionResult => ({
  success: false,
  message,
});

function isText(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function isValidItems<T extends Record<string, unknown>>(
  items: unknown,
  validator: (item: unknown) => item is T,
): items is T[] {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= 200 &&
    items.every(validator)
  );
}

function isPurchaseOrderItem(value: unknown): value is PurchaseOrderItemInput {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isText(item.itemName, 180) &&
    isText(item.unit, 40) &&
    (item.stockItemId === undefined ||
      (typeof item.stockItemId === "string" &&
        item.stockItemId.length > 0 &&
        item.stockItemId.length <= 64)) &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    item.quantity <= 1_000_000_000 &&
    typeof item.unitPrice === "number" &&
    Number.isFinite(item.unitPrice) &&
    item.unitPrice >= 0 &&
    item.unitPrice <= 1_000_000_000_000
  );
}

function stockItemKey(name: string, unit: string): string {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  return `${normalize(name)}|${normalize(unit)}`;
}

async function findMatchingStockCodes(
  transaction: Prisma.TransactionClient,
  items: Pick<PurchaseOrderItemInput, "itemName" | "unit" | "stockItemId">[],
): Promise<Map<string, string>> {
  const unlinkedItems = items.filter((item) => !item.stockItemId);
  if (!unlinkedItems.length) return new Map();

  const stockItems = await transaction.stockItem.findMany({
    where: {
      OR: unlinkedItems.map((item) => ({
        name: { equals: item.itemName.trim(), mode: "insensitive" },
        unit: { equals: item.unit.trim(), mode: "insensitive" },
      })),
    },
    select: { sku: true, name: true, unit: true },
  });
  const codesByItem = new Map<string, Set<string>>();
  for (const stockItem of stockItems) {
    const key = stockItemKey(stockItem.name, stockItem.unit);
    const codes = codesByItem.get(key) ?? new Set<string>();
    codes.add(stockItem.sku);
    codesByItem.set(key, codes);
  }

  return new Map(
    [...codesByItem]
      .filter(([, codes]) => codes.size === 1)
      .map(([key, codes]) => [key, [...codes][0]]),
  );
}

function isDeliveryOrderItem(value: unknown): value is DeliveryOrderItemInput {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  const rawId = item.id;
  const hasId = typeof rawId === "string" && rawId.trim().length > 0;
  const qtyOrdered =
    typeof item.qtyOrdered === "number"
      ? item.qtyOrdered
      : Number(item.qtyOrdered);
  const qtyDelivered =
    typeof item.qtyDelivered === "number"
      ? item.qtyDelivered
      : Number(item.qtyDelivered);
  return (
    (!hasId || (typeof rawId === "string" && rawId.trim().length <= 64)) &&
    (item.itemCode === undefined ||
      item.itemCode === null ||
      isText(item.itemCode, 100, true)) &&
    isText(item.itemName, 180) &&
    Number.isFinite(qtyOrdered) &&
    qtyOrdered > 0 &&
    qtyOrdered <= 1_000_000_000 &&
    Number.isFinite(qtyDelivered) &&
    qtyDelivered >= 0 &&
    qtyDelivered <= qtyOrdered &&
    isText(item.unit, 40) &&
    (item.remarks === undefined ||
      item.remarks === null ||
      isText(item.remarks, 1000, true))
  );
}

function isValidPurchaseOrderPayment(input: PurchaseOrderInput): boolean {
  const method = input.paymentMethod ?? POPaymentMethod.CASH;
  if (!Object.values(POPaymentMethod).includes(method)) return false;

  if (input.vendorId) {
    return (
      (input.paymentBankName === undefined ||
        isText(input.paymentBankName, 120, true)) &&
      (input.paymentAccountNumber === undefined ||
        isText(input.paymentAccountNumber, 80, true)) &&
      (input.paymentAccountName === undefined ||
        isText(input.paymentAccountName, 180, true))
    );
  }

  if (method === POPaymentMethod.CASH) {
    return (
      (input.paymentBankName === undefined ||
        isText(input.paymentBankName, 120, true)) &&
      (input.paymentAccountNumber === undefined ||
        isText(input.paymentAccountNumber, 80, true)) &&
      (input.paymentAccountName === undefined ||
        isText(input.paymentAccountName, 180, true))
    );
  }

  return (
    isText(input.paymentBankName, 120) &&
    isText(input.paymentAccountNumber, 80) &&
    isText(input.paymentAccountName, 180)
  );
}

function validPublicCode(value: string): boolean {
  return isValidPublicCode(value);
}

function isValidKilometer(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 9_999_999_999 &&
    Number(value.toFixed(3)) === value
  );
}

function canEditPurchaseOrders(role: UserRole): boolean {
  return (
    role === UserRole.LOGISTICS ||
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR
  );
}

function canApprovePurchaseOrders(role: UserRole): boolean {
  return (
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.ADMINISTRATIONS
  );
}

async function makePurchaseOrderQr(
  publicCode: string,
): Promise<{ verificationUrl: string; qrDataUrl: string } | null> {
  try {
    const requestHeaders = await headers();
    const baseUrl = resolvePublicAppUrl(getRequestOrigin(requestHeaders));
    if (!baseUrl) return null;
    const verification = new URL(
      documentVerificationPath("po", publicCode),
      baseUrl,
    );
    const verificationUrl = verification.toString();
    const qrDataUrl = await createBrandedQrDataUrl(verificationUrl, 240);
    return { verificationUrl, qrDataUrl };
  } catch (error) {
    console.error("Purchase Order verification QR generation failed:", error);
    return null;
  }
}

function canEditDeliveryOrders(role: UserRole): boolean {
  return (
    canEditPurchaseOrders(role) ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.FIELD_TEAM ||
    role === UserRole.KOORDINATOR ||
    role === UserRole.MOVER
  );
}

export async function createPurchaseOrder(
  input: PurchaseOrderInput,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || !canEditPurchaseOrders(session.user.role)) {
    return fail("Anda tidak memiliki akses untuk membuat Purchase Order.");
  }
  if (
    !input ||
    !isText(input.vendorName, 180) ||
    (input.vendorId !== undefined &&
      (!isText(input.vendorId, 64) || input.vendorId.length === 0)) ||
    (input.vendorBankAccountId !== undefined &&
      (!isText(input.vendorBankAccountId, 64) ||
        input.vendorBankAccountId.length === 0)) ||
    !isValidPurchaseOrderPayment(input) ||
    (input.includeTax !== undefined && typeof input.includeTax !== "boolean") ||
    (input.paymentTerms !== undefined &&
      !isText(input.paymentTerms, 2000, true)) ||
    !isValidItems(input.items, isPurchaseOrderItem)
  ) {
    return fail("Data Purchase Order tidak valid. Periksa nomor, vendor, dan item.");
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const vendor = input.vendorId
        ? await transaction.vendor.findFirst({
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
        })
        : null;
      if (input.vendorId && !vendor) {
        throw new Error("Vendor tidak ditemukan atau belum disetujui.");
      }
      const selectedStockIds = [
        ...new Set(
          input.items.flatMap((item) =>
            item.stockItemId ? [item.stockItemId] : [],
          ),
        ),
      ];
      const selectedStockItems = selectedStockIds.length
        ? await transaction.stockItem.findMany({
          where: { id: { in: selectedStockIds } },
          select: { id: true, sku: true, name: true, unit: true },
        })
        : [];
      if (selectedStockItems.length !== selectedStockIds.length) {
        throw new Error("Salah satu barang katalog tidak ditemukan.");
      }
      const selectedStockById = new Map(
        selectedStockItems.map((item) => [item.id, item]),
      );
      const stockCodeByNameAndUnit = await findMatchingStockCodes(
        transaction,
        input.items,
      );
      const preparedItems = input.items.map((item) => {
        if (item.stockItemId) {
          const stockItem = selectedStockById.get(item.stockItemId);
          if (stockItem) {
            return {
              ...item,
              itemName: stockItem.name,
              unit: stockItem.unit,
            };
          }
        }
        return item;
      });
      const vendorBankAccount = vendor
        ? resolveVendorBankAccount(
          vendor.bankAccounts,
          vendor,
          input.vendorBankAccountId,
        )
        : null;
      if (vendor && input.vendorBankAccountId && !vendorBankAccount) {
        throw new Error("Rekening yang dipilih tidak terdaftar pada vendor ini.");
      }
      const vendorHasTransferDetails = Boolean(vendorBankAccount);
      const paymentMethod = vendor
        ? vendorHasTransferDetails
          ? POPaymentMethod.TRANSFER
          : POPaymentMethod.CASH
        : input.paymentMethod ?? POPaymentMethod.CASH;
      const code = await generateAvailablePublicCode(transaction);
      const poNumber = await nextDocumentNumber(transaction, "PO");
      await transaction.purchaseOrder.create({
        data: {
          publicCode: code,
          createdById: session.user.id,
          poNumber,
          vendorId: vendor?.id ?? null,
          vendorName: vendor?.name ?? input.vendorName.trim(),
          paymentMethod,
          paymentBankName: vendor
            ? vendorHasTransferDetails
              ? vendorBankAccount?.bankName
              : null
            : paymentMethod === POPaymentMethod.TRANSFER
              ? input.paymentBankName?.trim()
              : null,
          paymentAccountNumber: vendor
            ? vendorHasTransferDetails
              ? vendorBankAccount?.bankAccount
              : null
            : paymentMethod === POPaymentMethod.TRANSFER
              ? input.paymentAccountNumber?.trim()
              : null,
          paymentAccountName: vendor
            ? vendorHasTransferDetails
              ? vendorBankAccount?.bankHolder
              : null
            : paymentMethod === POPaymentMethod.TRANSFER
              ? input.paymentAccountName?.trim()
              : null,
          paymentTerms: input.paymentTerms?.trim() || null,
          includeTax: input.includeTax ?? false,
          status: POStatus.PENDING_FINANCE_REVIEW,
          items: {
            create: preparedItems.map((item) => ({
              ...item,
              itemCode: item.stockItemId
                ? (selectedStockById.get(item.stockItemId)?.sku ?? null)
                : (stockCodeByNameAndUnit.get(
                  stockItemKey(item.itemName, item.unit),
                ) ?? null),
              stockItemId: item.stockItemId ?? null,
              itemName: item.itemName.trim(),
              unit: item.unit.trim(),
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
        },
      });
      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "PO Menunggu Verifikasi",
        message: `PO #${poNumber} Butuh Pemeriksaan (Checked By).`,
        actionUrl: `/apps/finance?tab=check&openSheet=${encodeURIComponent(code)}`,
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      return { code, poNumber };
    });
    revalidatePath(`/d/${created.code}`);
    revalidatePath("/apps/orders");
    return {
      success: true,
      message: `Purchase Order ${created.poNumber} berhasil dibuat.`,
      publicCode: created.code,
    };
  } catch (error) {
    console.error("Purchase Order creation failed:", error);
    return fail(
      error instanceof Error &&
        (error.message.startsWith("Vendor ") ||
          error.message.startsWith("Rekening "))
        ? error.message
        : "Purchase Order gagal dibuat. Periksa nomor PO dan coba kembali.",
    );
  }
}

export async function updatePurchaseOrder(
  publicCode: string,
  input: PurchaseOrderInput,
): Promise<OrderActionResult> {
  const poNumber = input?.poNumber;
  const session = await auth();
  if (!session?.user || !canEditPurchaseOrders(session.user.role)) {
    return fail("Anda tidak memiliki akses untuk mengubah Purchase Order.");
  }
  if (
    !validPublicCode(publicCode) ||
    !input ||
    !isText(poNumber, 80) ||
    !isText(input.vendorName, 180) ||
    !isValidPurchaseOrderPayment(input) ||
    (input.includeTax !== undefined && typeof input.includeTax !== "boolean") ||
    (input.paymentTerms !== undefined &&
      !isText(input.paymentTerms, 2000, true)) ||
    !isValidItems(input.items, isPurchaseOrderItem)
  ) {
    return fail("Data Purchase Order tidak valid. Periksa nomor, vendor, dan item.");
  }

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const statusGuard = await transaction.purchaseOrder.updateMany({
        where: { publicCode, status: POStatus.DRAFT },
        data: { updatedAt: new Date() },
      });
      if (statusGuard.count !== 1) return false;
      const stockItemIds = [
        ...new Set(
          input.items.flatMap((item) =>
            item.stockItemId ? [item.stockItemId] : [],
          ),
        ),
      ];
      const stockItems = stockItemIds.length
        ? await transaction.stockItem.findMany({
          where: { id: { in: stockItemIds } },
          select: { id: true, sku: true },
        })
        : [];
      const stockCodeById = new Map(
        stockItems.map((item) => [item.id, item.sku]),
      );
      const stockCodeByNameAndUnit = await findMatchingStockCodes(
        transaction,
        input.items,
      );

      await transaction.purchaseOrder.update({
        where: { publicCode },
        data: {
          poNumber: poNumber.trim(),
          vendorName: input.vendorName.trim(),
          paymentMethod: input.paymentMethod ?? POPaymentMethod.CASH,
          paymentBankName:
            input.paymentMethod === POPaymentMethod.TRANSFER
              ? input.paymentBankName?.trim()
              : null,
          paymentAccountNumber:
            input.paymentMethod === POPaymentMethod.TRANSFER
              ? input.paymentAccountNumber?.trim()
              : null,
          paymentAccountName:
            input.paymentMethod === POPaymentMethod.TRANSFER
              ? input.paymentAccountName?.trim()
              : null,
          paymentTerms: input.paymentTerms?.trim() || null,
          includeTax: input.includeTax ?? false,
          status: POStatus.PENDING_FINANCE_REVIEW,
          items: {
            deleteMany: {},
            create: input.items.map((item) => ({
              ...item,
              itemCode: item.stockItemId
                ? (stockCodeById.get(item.stockItemId) ?? null)
                : (stockCodeByNameAndUnit.get(
                  stockItemKey(item.itemName, item.unit),
                ) ?? null),
              itemName: item.itemName.trim(),
              unit: item.unit.trim(),
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
        },
      });
      return true;
    });
    if (!updated) {
      return fail("Purchase Order hanya dapat diubah sebelum dikirim untuk persetujuan.");
    }
  } catch (error) {
    console.error("Purchase Order update failed:", error);
    return fail("Purchase Order gagal disimpan. Periksa nomor PO dan coba kembali.");
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/documents");
  return { success: true, message: "Perubahan Purchase Order berhasil disimpan." };
}

export async function deletePurchaseOrder(
  publicCode: string,
): Promise<OrderActionResult> {
  const session = await auth();
  const canDeleteAnyStatus =
    session?.user?.role === UserRole.DIRECTOR ||
    session?.user?.role === UserRole.DEPUTY_DIRECTOR;
  const canDeleteDraft = Boolean(
    session?.user && canEditPurchaseOrders(session.user.role),
  );
  if (!session?.user || (!canDeleteAnyStatus && !canDeleteDraft)) {
    return fail("Anda tidak memiliki akses untuk menghapus Purchase Order.");
  }
  if (!validPublicCode(publicCode)) {
    return fail("Kode Purchase Order tidak valid.");
  }

  try {
    const deleted = await prisma.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { publicCode },
        select: { id: true, status: true },
      });
      if (!order) return "not-found";
      if (!canDeleteAnyStatus && order.status !== POStatus.DRAFT) {
        return "not-draft";
      }

      const deleted = await transaction.purchaseOrder.deleteMany({
        where: { id: order.id, status: order.status },
      });
      return deleted.count === 1 ? "deleted" : "changed";
    });

    if (deleted === "not-found") return fail("Purchase Order tidak ditemukan.");
    if (deleted === "not-draft") {
      return fail("Hanya Purchase Order berstatus Draft yang dapat dihapus.");
    }
    if (deleted === "changed") {
      return fail("Status PO berubah. Muat ulang halaman sebelum mencoba lagi.");
    }
  } catch (error) {
    console.error("Purchase Order deletion failed:", error);
    return fail("Purchase Order gagal dihapus. Silakan coba kembali.");
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/orders");
  revalidatePath("/apps/documents");
  revalidatePath("/apps/documents/issued");
  revalidatePath("/apps/approvals");
  revalidatePath("/apps/finance");
  return { success: true, message: "Purchase Order berhasil dihapus." };
}

export async function reviewPurchaseOrder(
  publicCode: string,
): Promise<OrderActionResult> {
  const session = await auth();
  const canReview =
    session?.user?.role === UserRole.FINANCE ||
    session?.user?.role === UserRole.ADMINISTRATIONS ||
    session?.user?.role === UserRole.DIRECTOR ||
    session?.user?.role === UserRole.DEPUTY_DIRECTOR;
  if (!session?.user || !canReview) {
    return fail("Hanya Manager Keuangan, Administrasi, atau Direktur yang dapat memeriksa Purchase Order.");
  }
  if (!validPublicCode(publicCode)) {
    return fail("Kode Purchase Order tidak valid.");
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const update = await transaction.purchaseOrder.updateMany({
        where: {
          publicCode,
          status: {
            in: [POStatus.DRAFT, POStatus.PENDING_FINANCE_REVIEW],
          },
        },
        data: {
          status: POStatus.PENDING_APPROVAL,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });
      if (update.count === 1) {
        const order = await transaction.purchaseOrder.findUniqueOrThrow({
          where: { publicCode },
          select: { poNumber: true },
        });
        await sendNotification({
          roleTarget: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
          title: "PO Menunggu Tanda Tangan",
          message: `PO #${order.poNumber} Butuh Persetujuan & QR Sign.`,
          actionUrl: `/apps/approvals?tab=po&openSheet=${encodeURIComponent(publicCode)}`,
          type: NotificationType.APPROVAL,
          database: transaction,
        });
      }
      return update;
    });
    if (result.count !== 1) {
      return fail("PO tidak ditemukan atau sudah masuk proses persetujuan.");
    }
  } catch (error) {
    console.error("Purchase Order finance review failed:", error);
    return fail("Pemeriksaan PO gagal disimpan. Silakan coba kembali.");
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/orders");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/approvals");
  return {
    success: true,
    message: "PO telah diperiksa dan dikirim kepada Direktur/Wakil Direktur.",
    actorName: session.user.name ?? "Manager Keuangan",
  };
}

export async function submitPurchaseOrderForFinanceReview(
  publicCode: string,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || !canEditPurchaseOrders(session.user.role)) {
    return fail("Hanya Logistik yang dapat mengajukan draft PO untuk pemeriksaan.");
  }
  if (!validPublicCode(publicCode)) {
    return fail("Kode Purchase Order tidak valid.");
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { publicCode },
        select: {
          poNumber: true,
          vendorName: true,
          paymentMethod: true,
          paymentBankName: true,
          paymentAccountNumber: true,
          paymentAccountName: true,
          status: true,
          items: {
            select: { itemName: true, quantity: true, unit: true },
          },
        },
      });
      if (!order || order.status !== POStatus.DRAFT) return null;
      if (
        !order.vendorName.trim() ||
        order.items.length === 0 ||
        order.items.some(
          (item) =>
            !item.itemName.trim() ||
            !item.unit.trim() ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0,
        )
      ) {
        return "invalid";
      }

      const update = await transaction.purchaseOrder.updateMany({
        where: { publicCode, status: POStatus.DRAFT },
        data: { status: POStatus.PENDING_FINANCE_REVIEW },
      });
      if (update.count !== 1) return null;

      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "PO Menunggu Pemeriksaan Keuangan",
        message: `PO #${order.poNumber} diajukan Logistik untuk diperiksa.`,
        actionUrl: `/apps/finance?tab=check&openSheet=${encodeURIComponent(publicCode)}`,
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      return "submitted";
    });

    if (result === "invalid") {
      return fail("Lengkapi nama vendor dan rincian barang sebelum mengajukan PO.");
    }
    if (result !== "submitted") {
      return fail("Draft PO tidak ditemukan atau sudah diajukan sebelumnya.");
    }
  } catch (error) {
    console.error("Purchase Order submission for finance review failed:", error);
    return fail("Draft PO gagal diajukan. Silakan coba kembali.");
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/orders");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/documents/issued");
  return {
    success: true,
    message: "Draft PO berhasil diajukan ke Keuangan untuk diperiksa.",
  };
}

export async function approvePurchaseOrder(
  publicCode: string,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || !canApprovePurchaseOrders(session.user.role)) {
    return fail("Hanya Direktur, Wakil Direktur, atau Administrasi yang dapat menyetujui PO.");
  }
  if (!validPublicCode(publicCode)) {
    return fail("Kode Purchase Order tidak valid.");
  }

  const qr = await makePurchaseOrderQr(publicCode);
  if (!qr) {
    return fail(
      "QR verifikasi gagal dibuat. Pastikan NEXT_PUBLIC_APP_URL atau AUTH_URL valid, atau akses aplikasi melalui alamat yang valid. Periksa juga aset logo QR dan log server.",
    );
  }

  const approvalTime = new Date();
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const update = await transaction.purchaseOrder.updateMany({
        where: {
          publicCode,
          status: {
            in: [
              POStatus.PENDING_APPROVAL,
              POStatus.PENDING_FINANCE_REVIEW,
              POStatus.DRAFT,
            ],
          },
        },
        data: {
          status: POStatus.APPROVED,
          reviewedById: session.user.id,
          reviewedAt: approvalTime,
          approvedById: session.user.id,
          approvedAt: approvalTime,
        },
      });
      if (update.count === 1) {
        const order = await transaction.purchaseOrder.findUniqueOrThrow({
          where: { publicCode },
          select: { poNumber: true, ticketId: true },
        });
        await sendNotification({
          roleTarget: UserRole.LOGISTICS,
          title: "PO Disetujui",
          message: order.ticketId
            ? `PO #${order.poNumber} disetujui. Silakan unggah invoice dan proses tiket material.`
            : `PO #${order.poNumber} disetujui. Silakan proses pembayaran dan Surat Jalan.`,
          actionUrl: order.ticketId
            ? `/apps/logistics?tab=tickets&openSheet=${encodeURIComponent(order.ticketId)}`
            : `/apps/logistics?tab=stock`,
          type: NotificationType.SUCCESS,
          database: transaction,
        });
        await sendNotification({
          roleTarget: UserRole.FINANCE,
          title: "PO Disetujui Direktur",
          message: order.ticketId
            ? `PO #${order.poNumber} disetujui. Pembayaran dapat diproses setelah invoice diunggah Logistik.`
            : `PO #${order.poNumber} disetujui. Silakan proses pembayaran dan Surat Jalan.`,
          actionUrl: order.ticketId
            ? `/apps/finance?tab=payments`
            : `/apps/finance?tab=payments&openSheet=${encodeURIComponent(publicCode)}`,
          type: NotificationType.SUCCESS,
          database: transaction,
        });
      }
      return update;
    });
    if (result.count !== 1) {
      return fail("PO tidak ditemukan atau belum diperiksa oleh Manager Keuangan.");
    }
  } catch (error) {
    console.error("Purchase Order approval failed:", error);
    return fail("Persetujuan PO gagal disimpan. Silakan coba kembali.");
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/orders");
  revalidatePath("/apps/approvals");
  revalidatePath("/apps/documents/issued");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  revalidatePath(documentVerificationPath("po", publicCode));
  return {
    success: true,
    message: "Purchase Order disetujui. QR verifikasi unik telah dibuat.",
    qrDataUrl: qr.qrDataUrl,
    actorName: session.user.name ?? "Direksi",
    approvedAt: approvalTime.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    }),
  };
}

export async function submitPurchaseOrderInvoice(
  publicCode: string,
  input: Omit<VendorInvoiceInput, "documentUrl">,
  file: File,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || !canEditPurchaseOrders(session.user.role)) {
    return fail("Hanya Logistik yang dapat mengirim invoice/bon PO.");
  }
  if (!validPublicCode(publicCode) || !input || !(file instanceof File)) {
    return fail("Invoice/bon PO tidak valid. Pilih file invoice/bon.");
  }
  const invoiceFields = vendorInvoiceInputSchema.safeParse({
    ...input,
    documentUrl: "https://res.cloudinary.com/validation/placeholder.pdf",
  });
  if (!invoiceFields.success) {
    return fail(invoiceFields.error.issues[0]?.message ?? "Data invoice/bon PO tidak valid.");
  }
  const orderBeforeUpload = await prisma.purchaseOrder.findUnique({
    where: { publicCode },
    select: {
      status: true,
      ticketId: true,
      includeTax: true,
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
      vendorPoSentAt: true,
      vendorInvoiceUrl: true,
      invoices: { select: { id: true }, take: 1 },
      paymentTransactions: {
        where: { status: PaymentStatus.PAID },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!orderBeforeUpload || orderBeforeUpload.ticketId) {
    return fail("PO mandiri tidak ditemukan.");
  }
  if (orderBeforeUpload.status !== POStatus.APPROVED) {
    return fail("PO harus disetujui Direktur sebelum invoice dikirim.");
  }
  if (!orderBeforeUpload.vendorPoSentAt) {
    return fail("Tandai PO telah dikirim ke vendor sebelum mengirim invoice.");
  }
  if (orderBeforeUpload.paymentTransactions.length > 0) {
    return fail("Invoice PO tidak dapat diganti setelah pembayaran dimulai.");
  }
  if (orderBeforeUpload.vendorInvoiceUrl || orderBeforeUpload.invoices.length > 0) {
    return fail("Invoice/bon untuk PO ini sudah pernah dikirim.");
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase();
  let documentUrl = "";
  try {
    if (extension === "pdf") {
      documentUrl = await uploadCloudinaryRawFile(
        file,
        PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER,
        ["pdf"],
        5 * 1024 * 1024,
      );
    } else if (["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) {
      documentUrl = (
        await uploadCloudinaryPhoto(
          file,
          PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER,
          5 * 1024 * 1024,
        )
      ).secureUrl;
    } else {
      return fail("File invoice/bon harus PDF, JPG, PNG, atau WEBP maksimal 5 MB.");
    }
    if (!isPurchaseOrderInvoiceUrl(documentUrl)) {
      throw new Error("URL invoice/bon yang diunggah tidak valid.");
    }
    const parsed = vendorInvoiceInputSchema.safeParse({
      ...input,
      documentUrl,
    });
    if (!parsed.success) {
      throw new Error("Data invoice/bon PO tidak valid.");
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          poNumber: true,
          vendorName: true,
          paymentMethod: true,
          paymentBankName: true,
          paymentAccountNumber: true,
          paymentAccountName: true,
          status: true,
          ticketId: true,
          includeTax: true,
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
          projectId: true,
          vendorPoSentAt: true,
          vendorInvoiceUrl: true,
          invoices: {
            select: { id: true },
            take: 1,
          },
          ticket: { select: { projectId: true } },
          paymentTransactions: {
            where: { status: PaymentStatus.PAID },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!order || order.ticketId) {
        throw new Error("PO mandiri tidak ditemukan.");
      }
      if (order.status !== POStatus.APPROVED) {
        throw new Error("PO harus disetujui Direktur sebelum invoice dikirim.");
      }
      if (!order.vendorPoSentAt) {
        throw new Error("Tandai PO telah dikirim ke vendor sebelum mengirim invoice.");
      }
      if (order.paymentTransactions.length > 0) {
        throw new Error("Invoice PO tidak dapat diganti setelah pembayaran dimulai.");
      }
      if (order.vendorInvoiceUrl || order.invoices.length > 0) {
        throw new Error("Invoice/bon untuk PO ini sudah pernah dikirim.");
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

      const update = await transaction.purchaseOrder.updateMany({
        where: {
          id: order.id,
          status: POStatus.APPROVED,
          OR: [
            { vendorInvoiceUrl: null },
            { vendorInvoiceUrl: { isSet: false } },
            { vendorInvoiceUrl: "" },
          ],
        },
        data: {
          vendorInvoiceUrl: parsed.data.documentUrl,
          vendorInvoiceUploadedAt: new Date(),
          vendorInvoiceUploadedById: session.user.id,
        },
      });
      if (update.count !== 1) {
        throw new Error("Status PO berubah. Muat ulang sebelum mengirim invoice.");
      }
      const invoice = await transaction.invoice.create({
        data: {
          publicCode: await generateAvailablePublicCode(transaction),
          invoiceNumber: parsed.data.invoiceNumber?.trim() || null,
          poId: order.id,
          projectId: order.projectId ?? order.ticket?.projectId ?? null,
          vendorName: order.vendorName,
          periodOrDate: parsed.data.periodOrDate?.trim() || null,
          paymentMethod: order.paymentMethod,
          bankAccount:
            order.paymentMethod === POPaymentMethod.TRANSFER
              ? formatVendorBankAccount({
                bankName: order.paymentBankName,
                bankAccount: order.paymentAccountNumber,
                bankHolder: order.paymentAccountName,
              })
              : null,
          documentUrl: parsed.data.documentUrl,
          subTotal,
          tax,
          deduction,
          grandTotal,
          status: "UNPAID",
          items: {
            create: items,
          },
        },
        select: { id: true },
      });
      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "Invoice PO Siap Dibayar",
        message: `Invoice/bon PO #${order.poNumber} dari Logistik siap diperiksa dan dibayar.`,
        actionUrl: `/apps/finance?tab=payments&openSheet=${encodeURIComponent(publicCode)}`,
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      return { poNumber: order.poNumber, invoiceId: invoice.id };
    });

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/finance");
    return {
      success: true,
      message: `Invoice/bon PO ${updated.poNumber} berhasil dikirim ke Keuangan.`,
      invoiceId: updated.invoiceId,
    };
  } catch (error) {
    if (documentUrl) {
      try {
        if (documentUrl.includes("/raw/upload/")) {
          await removeCloudinaryRawFile(documentUrl);
        } else {
          await removeCloudinaryPhoto(documentUrl);
        }
      } catch (cleanupError) {
        console.error("Removing unattached PO invoice failed:", cleanupError);
      }
    }
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryRawFileValidationError
    ) {
      return fail(error.message);
    }
    console.error("Purchase order invoice submission failed:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Invoice/bon gagal dikirim ke Keuangan. Silakan coba kembali.",
    );
  }
}

export async function markPurchaseOrderSentToVendor(
  publicCode: string,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== UserRole.LOGISTICS) {
    return fail("Hanya Logistik yang dapat mencatat pengiriman PO ke vendor.");
  }
  if (!validPublicCode(publicCode)) {
    return fail("Kode Purchase Order tidak valid.");
  }

  try {
    const updated = await prisma.purchaseOrder.updateMany({
      where: {
        publicCode,
        status: POStatus.APPROVED,
        OR: [
          { vendorPoSentAt: null },
          { vendorPoSentAt: { isSet: false } },
        ],
      },
      data: {
        vendorPoSentAt: new Date(),
        vendorPoSentById: session.user.id,
      },
    });
    if (updated.count !== 1) {
      const current = await prisma.purchaseOrder.findUnique({
        where: { publicCode },
        select: { status: true, vendorPoSentAt: true },
      });
      if (!current) return fail("PO tidak ditemukan.");
      if (current.status !== POStatus.APPROVED) {
        return fail("PO harus disetujui Direktur sebelum dikirim ke vendor.");
      }
      if (current.vendorPoSentAt) {
        return fail("Pengiriman PO ke vendor sudah pernah dicatat.");
      }
      return fail("Status PO berubah. Muat ulang halaman sebelum mencoba lagi.");
    }

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/finance");
    return {
      success: true,
      message: "Pengiriman PO ke vendor berhasil dicatat.",
    };
  } catch (error) {
    console.error("Purchase order vendor dispatch failed:", error);
    return fail("Pengiriman PO ke vendor gagal dicatat. Silakan coba kembali.");
  }
}

export async function receiveStandalonePurchaseOrder(
  publicCode: string,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return fail("Hanya Logistik yang dapat mengonfirmasi penerimaan barang PO.");
  }
  if (!isValidPublicCode(publicCode)) {
    return fail("Kode Purchase Order tidak valid.");
  }

  try {
    const outcome = await prisma.$transaction(async (transaction) => {
      await acquireMongoTransactionLock(transaction, `po-receipt:${publicCode}`);
      const order = await transaction.purchaseOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          poNumber: true,
          vendorName: true,
          projectId: true,
          status: true,
          ticketId: true,
          paidAt: true,
          includeTax: true,
          vendorInvoiceUrl: true,
          items: {
            select: {
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
            select: { documentUrl: true, grandTotal: true },
          },
          stockPurchases: { select: { id: true }, take: 1 },
        },
      });

      if (!order) return "not-found";
      if (order.ticketId) return "ticket-linked";
      if (order.status !== POStatus.APPROVED) return "not-approved";
      if (!order.paidAt) return "not-paid";
      if (!order.vendorInvoiceUrl && !order.invoices[0]?.documentUrl) {
        return "missing-invoice";
      }
      if (order.stockPurchases.length > 0) return "already-received";
      const invoiceTotal =
        order.invoices[0]?.grandTotal ??
        Math.round(
          order.items.reduce((total, item) => total + item.totalPrice, 0) *
          (order.includeTax ? 1.11 : 1) *
          100,
        ) / 100;
      const paymentTotal = await transaction.paymentTransaction.aggregate({
        where: { poId: order.id, status: PaymentStatus.PAID },
        _sum: { amount: true },
      });
      if (
        !Number.isFinite(invoiceTotal) ||
        invoiceTotal <= 0 ||
        (paymentTotal._sum.amount ?? 0) + 0.005 < invoiceTotal
      ) {
        return "not-paid";
      }

      await receivePurchaseOrderStock(transaction, {
        purchaseOrderId: order.id,
        poNumber: order.poNumber,
        vendorName: order.vendorName,
        projectId: order.projectId,
        receivedById: session.user.id,
        notes: `Penerimaan PO ${order.poNumber} dikonfirmasi oleh Logistik.`,
        items: order.items,
      });
      return "received";
    });

    if (outcome !== "received") {
      const messages: Record<string, string> = {
        "not-found": "Purchase Order tidak ditemukan.",
        "ticket-linked": "PO ini terkait tiket dan tidak dapat diterima melalui alur PO mandiri.",
        "not-approved": "PO harus disetujui sebelum barang dapat diterima.",
        "not-paid": "PO harus lunas sebelum barang dapat diterima.",
        "missing-invoice": "Invoice/bon PO tidak ditemukan.",
        "already-received": "Penerimaan PO ini sudah pernah dicatat.",
      };
      return fail(messages[outcome] ?? "Status PO tidak valid untuk penerimaan.");
    }
  } catch (error) {
    console.error("Standalone purchase order receipt failed:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Penerimaan PO gagal dicatat. Silakan coba kembali.",
    );
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics/stock");
  return {
    success: true,
    message: "Penerimaan PO berhasil dicatat dan stok telah diperbarui.",
  };
}

export async function markPurchaseOrderConfirmationSent(
  paymentTransactionId: string,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== UserRole.LOGISTICS) {
    return fail("Hanya Logistik yang dapat menandai KO dikirim ke vendor.");
  }
  if (!isText(paymentTransactionId, 191)) {
    return fail("Data pembayaran KO tidak valid.");
  }

  try {
    const payment = await prisma.paymentTransaction.findFirst({
      where: {
        id: paymentTransactionId.trim(),
        status: PaymentStatus.PAID,
        confirmationOrderNumber: { not: null },
        poId: { not: null },
      },
      select: {
        id: true,
        confirmationOrderNumber: true,
        vendorSentAt: true,
        orderConfirmation: {
          select: { id: true, vendorSentAt: true },
        },
        po: { select: { poNumber: true, vendorName: true } },
      },
    });
    if (!payment || !payment.po) {
      return fail("Konfirmasi Order tidak ditemukan.");
    }
    if (payment.vendorSentAt || payment.orderConfirmation?.vendorSentAt) {
      return fail("Konfirmasi Order ini sudah ditandai dikirim ke vendor.");
    }

    const sentAt = new Date();
    const updated = await prisma.$transaction(async (transaction) => {
      const paymentUpdate = await transaction.paymentTransaction.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PAID,
          confirmationOrderNumber: payment.confirmationOrderNumber,
          vendorSentAt: null,
        },
        data: {
          vendorSentAt: sentAt,
          vendorSentById: session.user.id,
        },
      });
      if (paymentUpdate.count !== 1) return false;
      if (payment.orderConfirmation) {
        const confirmationUpdate =
          await transaction.orderConfirmation.updateMany({
            where: {
              id: payment.orderConfirmation.id,
              vendorSentAt: null,
            },
            data: {
              vendorSentAt: sentAt,
              vendorSentById: session.user.id,
            },
          });
        if (confirmationUpdate.count !== 1) {
          throw new Error("Status pengiriman KO berubah. Muat ulang sebelum mencoba lagi.");
        }
      }
      return true;
    });
    if (!updated) {
      return fail("Status pengiriman KO berubah. Muat ulang sebelum mencoba lagi.");
    }

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/finance");
    return {
      success: true,
      message: `KO ${payment.confirmationOrderNumber} untuk PO ${payment.po.poNumber} ditandai sudah dikirim ke ${payment.po.vendorName}.`,
    };
  } catch (error) {
    console.error("Purchase order confirmation handoff failed:", error);
    return fail("Status pengiriman KO gagal disimpan. Silakan coba kembali.");
  }
}

export async function createDeliveryOrder(
  input: DeliveryOrderInput & { poPublicCode?: string },
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || !canEditDeliveryOrders(session.user.role)) {
    return fail("Anda tidak memiliki akses untuk membuat Delivery Order.");
  }
  const deliveryMethod =
    input?.deliveryMethod ?? DODeliveryMethod.INTERNAL_MOVER;
  const isExpedition = deliveryMethod === DODeliveryMethod.EXPEDITION;
  const vehicleId = isExpedition
    ? undefined
    : (input.vehicleId?.trim() || undefined);
  const driverIdentityNumber = input.driverIdentityNumber?.trim() || undefined;
  const vehicleDocumentNumber =
    input.vehicleDocumentNumber?.trim() || undefined;
  const vehiclePlate = input.vehiclePlate?.trim() || "";
  const driverName = input.driverName?.trim() || "";
  const driverPhone = input.driverPhone?.trim() || "";

  if (
    deliveryMethod === DODeliveryMethod.INTERNAL_MOVER &&
    session.user.role !== UserRole.LOGISTICS
  ) {
    return fail("Hanya Logistik yang dapat menetapkan kendaraan master pada DO internal.");
  }
  if (!input) {
    return fail("Data Delivery Order tidak valid.");
  }
  if (input.ticketId !== undefined && !isText(input.ticketId, 64)) {
    return fail("ID tiket referensi tidak valid.");
  }
  if (!Object.values(DOStatus).includes(input.status)) {
    return fail("Status Delivery Order tidak valid.");
  }
  if (input.poPublicCode !== undefined && !validPublicCode(input.poPublicCode)) {
    return fail("Kode Purchase Order referensi tidak valid.");
  }
  if (
    input.deliveryMethod !== undefined &&
    !Object.values(DODeliveryMethod).includes(input.deliveryMethod)
  ) {
    return fail("Metode pengiriman tidak valid.");
  }
  if (!isExpedition && !isText(vehicleId ?? "", 64)) {
    return fail("Pilih kendaraan master untuk DO internal.");
  }
  if (!isExpedition && input.status !== DOStatus.PENDING) {
    return fail("Status DO internal baru harus Menunggu.");
  }
  if (
    isExpedition &&
    input.status !== DOStatus.PENDING &&
    input.status !== DOStatus.IN_TRANSIT
  ) {
    return fail("Status DO ekspedisi baru harus Menunggu atau Dalam Pengiriman.");
  }
  if (isExpedition) {
    if (!isText(driverName, 180)) {
      return fail("Nama driver / mover ekspedisi wajib diisi.");
    }
    if (!/^[A-Za-z0-9./ -]{3,40}$/.test(vehiclePlate)) {
      return fail("Plat nomor kendaraan ekspedisi tidak valid (minimal 3 karakter).");
    }
    if (Boolean(driverIdentityNumber) && !/^\d{8,20}$/.test(driverIdentityNumber!)) {
      return fail("NIK driver harus berupa 8-20 digit angka jika diisi.");
    }
    if (Boolean(driverPhone) && !/^[+()\d\s.-]{6,32}$/.test(driverPhone)) {
      return fail("Nomor HP driver tidak valid jika diisi.");
    }
  }
  if (!isValidItems(input.items, isDeliveryOrderItem)) {
    return fail("Item pengiriman tidak valid. Periksa jumlah barang yang dikirim.");
  }
  try {
    const created = await prisma.$transaction(async (transaction) => {
      if (input.ticketId) {
        await lockTicketDeliveryOrderCreation(transaction);
        await lockTicketFulfillment(transaction, input.ticketId);
      }
      const ticket = input.ticketId
        ? await transaction.ticket.findUnique({
          where: { id: input.ticketId },
          select: {
            id: true,
            type: true,
            requestCategory: true,
            relatedPoIds: true,
            status: true,
            isApprovedByDirector: true,
            projectId: true,
            ticketNumber: true,
            moverAssignee: { select: { name: true } },
            purchaseOrders: {
              where: {
                status: POStatus.APPROVED,
                paidAt: { not: null },
              },
              orderBy: { paidAt: "desc" },
              select: {
                id: true,
                poNumber: true,
                paidAt: true,
              },
            },
            directStockPurchases: {
              where: { status: DirectStockPurchaseStatus.PENDING_RECEIPT },
              select: {
                purchaseNumber: true,
                items: {
                  select: {
                    stockItemId: true,
                    itemName: true,
                    unit: true,
                  },
                },
              },
            },
            items: {
              select: {
                id: true,
                stockItemId: true,
                itemName: true,
                quantity: true,
                unit: true,
                categoryHint: true,
                status: true,
                doItemId: true,
                poItem: {
                  select: {
                    stockItemId: true,
                    po: {
                      select: {
                        id: true,
                        status: true,
                        paidAt: true,
                      },
                    },
                  },
                },
              },
              orderBy: { id: "asc" },
            },
          },
        })
        : null;
      if (
        input.ticketId &&
        (!ticket ||
          (ticket.type !== TicketType.MATERIAL &&
            ticket.requestCategory !== TicketRequestCategory.SHIPPING_COST))
      ) {
        throw new Error("Tiket referensi yang dirujuk tidak ditemukan.");
      }
      if (ticket && !ticket.isApprovedByDirector) {
        throw new Error(
          "Tiket harus memiliki persetujuan eksekutif sebelum DO diterbitkan.",
        );
      }
      const eligibleTicketItems = ticket
        ? ticket.items.filter(
          (item) =>
            item.doItemId === null &&
            item.status !== FulfillmentStatus.PROCESSED_TO_DO,
        )
        : [];
      if (ticket) {
        const existingOrder = await transaction.deliveryOrder.findFirst({
          where: { ticketId: ticket.id },
          orderBy: { createdAt: "desc" },
          select: { publicCode: true, doNumber: true },
        });
        if (
          existingOrder &&
          (ticket.items.length === 0 || eligibleTicketItems.length === 0)
        ) {
          return {
            code: existingOrder.publicCode,
            doNumber: existingOrder.doNumber,
            alreadyExists: true,
          };
        }
      }
      if (ticket && ticket.items.length > 0 && eligibleTicketItems.length === 0) {
        throw new Error("Semua item tiket sudah memiliki Delivery Order.");
      }
      if (
        ticket &&
        ticket.status !== TicketStatus.PROCESSED_LOGISTIC &&
        ticket.status !== TicketStatus.PROCESSED_FINANCE &&
        ticket.status !== TicketStatus.ASSIGNED_TO_MOVER &&
        ticket.status !== TicketStatus.IN_TRANSIT
      ) {
        throw new Error(
          "Tiket belum siap atau sudah selesai untuk diterbitkan DO.",
        );
      }
      const purchaseOrder = input.poPublicCode
        ? await transaction.purchaseOrder.findUnique({
          where: { publicCode: input.poPublicCode },
          select: { id: true, ticketId: true, status: true },
        })
        : null;
      if (input.poPublicCode && !purchaseOrder) {
        throw new Error("Purchase Order yang dirujuk tidak ditemukan.");
      }
      if (purchaseOrder && purchaseOrder.status !== POStatus.APPROVED) {
        throw new Error(
          "DO hanya dapat ditautkan ke Purchase Order yang sudah disetujui eksekutif.",
        );
      }
      if (
        purchaseOrder &&
        ticket &&
        purchaseOrder.ticketId !== ticket.id
      ) {
        throw new Error(
          "Purchase Order harus berasal dari tiket yang sama dengan DO.",
        );
      }
      const selectedVehicle =
        deliveryMethod === DODeliveryMethod.INTERNAL_MOVER
          ? await transaction.vehicle.findFirst({
            where: {
              id: input.vehicleId,
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
      if (deliveryMethod === DODeliveryMethod.INTERNAL_MOVER && !selectedVehicle) {
        throw new Error(
          "Kendaraan tidak tersedia atau KM awal belum diinisialisasi.",
        );
      }
      const normalize = normalizeTicketStockValue;
      const remainingEligibleTicketItems = [...eligibleTicketItems];
      const matchedItems = input.items.map((orderItem, index) => {
        if (!ticket) {
          return {
            orderItem,
            id: randomUUID(),
            ticketItem: null,
          };
        }
        let matchIdx = -1;
        if (
          remainingEligibleTicketItems.length === input.items.length &&
          eligibleTicketItems[index] &&
          remainingEligibleTicketItems.includes(eligibleTicketItems[index]) &&
          normalize(eligibleTicketItems[index].itemName) ===
          normalize(orderItem.itemName)
        ) {
          matchIdx = remainingEligibleTicketItems.indexOf(
            eligibleTicketItems[index],
          );
        }
        if (matchIdx === -1) {
          matchIdx = remainingEligibleTicketItems.findIndex(
            (candidate) =>
              normalize(candidate.itemName) === normalize(orderItem.itemName) &&
              normalize(candidate.unit) === normalize(orderItem.unit),
          );
        }
        if (matchIdx === -1) {
          matchIdx = remainingEligibleTicketItems.findIndex(
            (candidate) =>
              normalize(candidate.itemName) === normalize(orderItem.itemName),
          );
        }
        const ticketItem =
          matchIdx >= 0
            ? remainingEligibleTicketItems.splice(matchIdx, 1)[0]
            : null;
        return {
          orderItem,
          id: randomUUID(),
          ticketItem,
        };
      });

      if (
        ticket &&
        ticket.requestCategory !== TicketRequestCategory.SHIPPING_COST &&
        ticket.items.length > 0
      ) {
        const processedItems = ticket.items.filter(
          (item) =>
            item.doItemId !== null ||
            item.status === FulfillmentStatus.PROCESSED_TO_DO,
        );
        for (const { orderItem, ticketItem } of matchedItems) {
          if (!ticketItem) {
            const alreadyProcessed = processedItems.some(
              (candidate) =>
                normalize(candidate.itemName) === normalize(orderItem.itemName) &&
                normalize(candidate.unit) === normalize(orderItem.unit),
            );
            throw new Error(
              alreadyProcessed
                ? `Item "${orderItem.itemName.trim()}" sudah pernah diproses ke Delivery Order lain.`
                : "Item DO harus sesuai dengan item yang belum diproses pada tiket referensi.",
            );
          }
          if (
            orderItem.itemName.trim() !== ticketItem.itemName ||
            orderItem.qtyOrdered !== ticketItem.quantity ||
            orderItem.unit.trim() !== ticketItem.unit
          ) {
            throw new Error(
              "Item DO harus sesuai dengan item pada tiket referensi.",
            );
          }
        }
      }

      const activeDirectPurchaseLookup = buildActiveDirectPurchaseLookup(
        ticket?.directStockPurchases ?? [],
      );
      const code = await generateAvailablePublicCode(transaction);
      const doNumber = await nextDocumentNumber(transaction, "DO");

      const paidTicketPoIds = new Set(
        ticket?.purchaseOrders.map((po) => po.id) ?? [],
      );
      const warehouseItems: Array<{
        itemName: string;
        unit: string;
        stockItemId: string | null;
        quantity: Prisma.Decimal;
      }> = [];

      for (const entry of matchedItems) {
        const { ticketItem, orderItem } = entry;
        if (ticketItem) {
          const pendingPurchaseNumber = findActiveDirectPurchaseNumber(
            activeDirectPurchaseLookup,
            ticketItem,
          );
          if (pendingPurchaseNumber) {
            throw new Error(
              `Item "${ticketItem.itemName}" sedang dipesan melalui pembelian langsung ${pendingPurchaseNumber} dan belum diterima di gudang.`,
            );
          }
        }
        if (!ticketItem || orderItem.qtyDelivered <= 0) {
          continue;
        }
        if (ticketItem.status === FulfillmentStatus.PROCESSED_TO_PO) {
          const itemPo = ticketItem.poItem?.po;
          const isPaidPoItem =
            itemPo?.status === POStatus.APPROVED &&
            (itemPo.paidAt !== null || paidTicketPoIds.has(itemPo.id));
          if (!isPaidPoItem) {
            throw new Error(
              `Item "${ticketItem.itemName}" sedang diproses melalui PO dan belum dibayar lunas oleh Keuangan.`,
            );
          }
        } else if (ticketItem.status !== FulfillmentStatus.PENDING) {
          throw new Error(
            `Item "${ticketItem.itemName}" sudah diproses dan tidak dapat diterbitkan DO lagi.`,
          );
        }
        warehouseItems.push({
          itemName: ticketItem.itemName,
          unit: ticketItem.unit,
          stockItemId:
            ticketItem.poItem?.stockItemId ?? ticketItem.stockItemId ?? null,
          quantity: new Prisma.Decimal(orderItem.qtyDelivered.toString()),
        });
      }

      if (warehouseItems.length > 0) {
        const canDeductWarehouseStock =
          session.user.role === UserRole.LOGISTICS ||
          session.user.role === UserRole.ADMINISTRATIONS ||
          session.user.role === UserRole.DIRECTOR ||
          session.user.role === UserRole.DEPUTY_DIRECTOR;
        if (!canDeductWarehouseStock) {
          throw new Error(
            "Anda tidak memiliki otorisasi untuk mengurangi stok gudang melalui Delivery Order.",
          );
        }
      }

      const stockItems = warehouseItems.length
        ? await transaction.stockItem.findMany({
          select: {
            id: true,
            name: true,
            unit: true,
            stockQuantity: true,
            unitPrice: true,
          },
        })
        : [];
      const reservations = new Map<
        string,
        {
          name: string;
          unit: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
        }
      >();
      for (const item of warehouseItems) {
        const directMatch = item.stockItemId
          ? stockItems.find((stockItem) => stockItem.id === item.stockItemId)
          : undefined;
        const matches = directMatch
          ? [directMatch]
          : stockItems.filter(
            (stockItem) =>
              normalize(stockItem.name) === normalize(item.itemName) &&
              normalize(stockItem.unit) === normalize(item.unit),
          );
        if (matches.length !== 1) {
          throw new Error(
            matches.length === 0
              ? `Barang "${item.itemName}" tidak ditemukan di stok gudang.`
              : `Barang "${item.itemName}" memiliki SKU ganda di stok gudang.`,
          );
        }
        const stockItem = matches[0];
        const current = reservations.get(stockItem.id);
        reservations.set(stockItem.id, {
          name: stockItem.name,
          unit: stockItem.unit,
          quantity: (current?.quantity ?? new Prisma.Decimal(0)).plus(
            item.quantity,
          ),
          unitPrice: decimalFromScaledInteger(stockItem.unitPrice),
        });
      }
      for (const [stockItemId, reservation] of reservations) {
        const stockItem = stockItems.find((item) => item.id === stockItemId);
        if (
          !stockItem ||
          decimalFromScaledInteger(stockItem.stockQuantity).lessThan(
            reservation.quantity,
          )
        ) {
          throw new Error(
            `Stok gudang untuk "${reservation.name}" tidak mencukupi.`,
          );
        }
      }

      const deliveryOrder = await transaction.deliveryOrder.create({
        data: {
          publicCode: code,
          doNumber,
          poId: purchaseOrder?.id ?? ticket?.purchaseOrders[0]?.id,
          ticketId: ticket?.id,
          createdById: session.user.id,
          deliveryMethod,
          vehicleId: selectedVehicle?.id,
          vehiclePlateNumber: selectedVehicle?.plateNumber,
          vehicleDocumentNumber:
            input.vehicleDocumentNumber?.trim() || null,
          driverName:
            isExpedition
              ? input.driverName!.trim()
              : ticket?.moverAssignee?.name ?? input.driverName?.trim() ?? null,
          vehiclePlate:
            selectedVehicle?.plateNumber ??
            (input.vehiclePlate?.trim() || null),
          driverIdentityNumber: input.driverIdentityNumber?.trim() || null,
          driverPhone: input.driverPhone?.trim() || null,
          receiverName:
            isExpedition
              ? session.user.name?.trim() || "Tim Logistik"
              : input.receiverName?.trim() || null,
          status: input.status,
          items: {
            create: matchedItems.map(({ id, orderItem }) => ({
              id,
              itemCode: orderItem.itemCode?.trim() || null,
              qtyOrdered: orderItem.qtyOrdered,
              qtyDelivered: orderItem.qtyDelivered,
              itemName: orderItem.itemName.trim(),
              unit: orderItem.unit.trim(),
              remarks: orderItem.remarks?.trim() || null,
            })),
          },
        },
        select: { id: true },
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
      for (const [stockItemId, reservation] of reservations) {
        const updated = await transaction.stockItem.updateMany({
          where: {
            id: stockItemId,
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
          throw new Error(
            `Stok gudang untuk "${reservation.name}" tidak mencukupi.`,
          );
        }
        await transaction.stockMovement.create({
          data: {
            projectId: ticket?.projectId,
            stockItemId,
            type: StockMovementType.OUT,
            materialName: reservation.name,
            quantity: scaledIntegerFromDecimal(reservation.quantity),
            unit: reservation.unit,
            totalCost: scaledIntegerFromDecimal(
              reservation.quantity
                .mul(reservation.unitPrice)
                .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            ),
            reference: doNumber,
            notes: `Pemenuhan tiket ${ticket?.ticketNumber ?? ""} melalui DO ${doNumber}.`,
            createdById: session.user.id,
          },
        });
      }
      if (ticket) {
        for (const entry of matchedItems) {
          if (entry.ticketItem && entry.orderItem.qtyDelivered > 0) {
            await transaction.ticketItem.update({
              where: { id: entry.ticketItem.id },
              data: {
                doItemId: entry.id,
                status: FulfillmentStatus.PROCESSED_TO_DO,
              },
            });
          }
        }
        await syncTicketStatus(
          transaction,
          ticket.id,
          deliveryMethod === DODeliveryMethod.EXPEDITION
            ? TicketStatus.IN_TRANSIT
            : TicketStatus.ASSIGNED_TO_MOVER,
        );
        await transaction.ticketAuditLog.create({
          data: {
            id: randomUUID(),
            ticketId: ticket.id,
            userId: session.user.id,
            action: "LOGISTICS_DO_CREATED",
            notes: `Delivery Order ${doNumber} berhasil diterbitkan oleh Logistik untuk pengiriman barang.`,
          },
        });
      }
      return { code, doNumber, alreadyExists: false };
    });
    revalidatePath(`/d/${created.code}`);
    revalidatePath("/apps/orders");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/documents/issued");
    revalidatePath("/apps/logistics/stock");
    return {
      success: true,
      message: created.alreadyExists
        ? `DO ${created.doNumber} sudah ada. Lanjutkan menggunakan Surat Jalan tersebut.`
        : `Delivery Order ${created.doNumber} berhasil dibuat.`,
      publicCode: created.code,
    };
  } catch (error) {
    console.error("Delivery Order creation failed:", error);
    const inventoryError =
      error instanceof Error &&
      (/^Stok gudang/.test(error.message) ||
        /^Barang .* (tidak ditemukan|memiliki SKU ganda) di stok gudang\.$/.test(
          error.message,
        ));
    const vehicleError =
      error instanceof Error && error.message.startsWith("Kendaraan");
    const approvalError =
      error instanceof Error &&
      [
        "Tiket belum disetujui untuk diproses sebagai DO.",
        "Tiket harus memiliki persetujuan eksekutif sebelum DO diterbitkan.",
        "DO hanya dapat ditautkan ke Purchase Order yang sudah disetujui eksekutif.",
        "Purchase Order harus berasal dari tiket yang sama dengan DO.",
        "Item DO harus sesuai dengan item pada tiket referensi.",
      ].includes(error.message);
    return fail(
      inventoryError || approvalError || vehicleError
        ? error.message
        : "Delivery Order gagal dibuat. Periksa nomor DO dan PO terkait.",
    );
  }
}

export async function updateDeliveryOrder(
  publicCode: string,
  input: DeliveryOrderInput,
  arrivalPhotoFile?: File,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || !canEditDeliveryOrders(session.user.role)) {
    return fail("Anda tidak memiliki akses untuk mengubah Delivery Order.");
  }
  const deliveryMethod =
    input?.deliveryMethod ?? DODeliveryMethod.INTERNAL_MOVER;
  const isExpedition = deliveryMethod === DODeliveryMethod.EXPEDITION;
  const vehicleId = isExpedition
    ? undefined
    : (input.vehicleId?.trim() || undefined);
  const driverIdentityNumber = input.driverIdentityNumber?.trim() || undefined;
  const vehicleDocumentNumber =
    input.vehicleDocumentNumber?.trim() || undefined;
  const vehiclePlate = input.vehiclePlate?.trim() || "";
  const driverName = input.driverName?.trim() || "";
  const driverPhone = input.driverPhone?.trim() || "";

  if (!validPublicCode(publicCode)) {
    return fail("Kode Delivery Order tidak valid.");
  }
  if (!input) {
    return fail("Data Delivery Order tidak valid.");
  }
  const normalizedDoNumber = input.doNumber?.trim();
  if (!normalizedDoNumber || !isText(normalizedDoNumber, 80)) {
    return fail("Nomor Delivery Order wajib diisi (maksimal 80 karakter).");
  }
  if (!Object.values(DOStatus).includes(input.status)) {
    return fail("Status Delivery Order tidak valid.");
  }
  if (
    input.deliveryMethod !== undefined &&
    !Object.values(DODeliveryMethod).includes(input.deliveryMethod)
  ) {
    return fail("Metode pengiriman tidak valid.");
  }
  if (!isExpedition && input.vehicleId !== undefined && !isText(vehicleId ?? "", 64)) {
    return fail("Pilih kendaraan master untuk DO internal.");
  }
  if (isExpedition) {
    if (!isText(driverName, 180)) {
      return fail("Nama driver / mover ekspedisi wajib diisi.");
    }
    if (!/^[A-Za-z0-9./ -]{3,40}$/.test(vehiclePlate)) {
      return fail("Plat nomor kendaraan ekspedisi tidak valid (minimal 3 karakter).");
    }
    if (Boolean(driverIdentityNumber) && !/^\d{8,20}$/.test(driverIdentityNumber!)) {
      return fail("NIK driver harus berupa 8-20 digit angka jika diisi.");
    }
    if (Boolean(driverPhone) && !/^[+()\d\s.-]{6,32}$/.test(driverPhone)) {
      return fail("Nomor HP driver tidak valid jika diisi.");
    }
  }
  if (!isValidItems(input.items, isDeliveryOrderItem)) {
    return fail("Item pengiriman tidak valid. Periksa jumlah barang yang dikirim.");
  }

  let savedArrivalPhotoUrl: string | null = null;
  try {
    const existingOrder = await prisma.deliveryOrder.findUnique({
      where: { publicCode },
      select: {
        id: true,
        deliveryMethod: true,
        arrivalPhotoUrl: true,
        receivedAt: true,
        receivedById: true,
        ticket: {
          select: {
            id: true,
            moverAssignee: { select: { name: true } },
          },
        },
      },
    });
    if (!existingOrder) {
      return fail("Delivery Order tidak ditemukan.");
    }
    if (
      input.deliveryMethod !== undefined &&
      input.deliveryMethod !== existingOrder.deliveryMethod
    ) {
      return fail("Jenis pengiriman tidak dapat diubah setelah DO diterbitkan.");
    }
    const deliveryMethod =
      existingOrder.deliveryMethod;
    const isExpeditionArrival =
      deliveryMethod === DODeliveryMethod.EXPEDITION &&
      input.status === DOStatus.DELIVERED;
    if (isExpeditionArrival) {
      if (session.user.role !== UserRole.LOGISTICS) {
        return fail(
          "Material ekspedisi harus diterima dan diselesaikan oleh bagian Logistik.",
        );
      }
      if (
        !existingOrder.arrivalPhotoUrl &&
        (!(arrivalPhotoFile instanceof File) || arrivalPhotoFile.size === 0)
      ) {
        return fail("Unggah foto material saat tiba di gudang sebelum menyelesaikan DO.");
      }
      if (existingOrder.receivedAt && arrivalPhotoFile instanceof File) {
        return fail("Bukti penerimaan material yang sudah tercatat tidak dapat diganti.");
      }
      if (arrivalPhotoFile instanceof File) {
        savedArrivalPhotoUrl =
          await saveDeliveryOrderArrivalPhoto(arrivalPhotoFile);
      }
    } else if (arrivalPhotoFile instanceof File && arrivalPhotoFile.size > 0) {
      return fail("Foto kedatangan hanya dapat dicatat saat DO ekspedisi diterima.");
    }

    const assignedMoverName = existingOrder.ticket?.moverAssignee?.name;
    const receivedAt = existingOrder.receivedAt ?? new Date();
    await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          doNumber: true,
          deliveryMethod: true,
          status: true,
          vehicleId: true,
          driverName: true,
          vehicleDocumentNumber: true,
          vehiclePlateNumber: true,
          vehiclePlate: true,
          driverIdentityNumber: true,
          driverPhone: true,
          receiverName: true,
          signedAt: true,
          items: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              qtyOrdered: true,
              qtyDelivered: true,
              unit: true,
              remarks: true,
            },
          },
          ticket: {
            select: {
              id: true,
              projectId: true,
              ticketNumber: true,
            },
          },
        },
      });
      if (!currentOrder) {
        throw new Error("Delivery Order tidak ditemukan.");
      }
      if (
        currentOrder.deliveryMethod === DODeliveryMethod.INTERNAL_MOVER &&
        input.status !== currentOrder.status
      ) {
        throw new Error(
          "Status DO internal hanya dapat diubah melalui Ruang Kerja Mover.",
        );
      }
      if (
        currentOrder.deliveryMethod === DODeliveryMethod.EXPEDITION &&
        input.status !== currentOrder.status
      ) {
        const allowedNextStatuses: Record<DOStatus, DOStatus[]> = {
          [DOStatus.PENDING]: [
            DOStatus.IN_TRANSIT,
            DOStatus.DELIVERED,
            DOStatus.RETURNED,
          ],
          [DOStatus.IN_TRANSIT]: [DOStatus.DELIVERED, DOStatus.RETURNED],
          [DOStatus.DELIVERED]: [],
          [DOStatus.RETURNED]: [],
        };
        if (!allowedNextStatuses[currentOrder.status].includes(input.status)) {
          throw new Error(
            "Status Delivery Order hanya dapat maju searah dan tidak dapat dikembalikan.",
          );
        }
      }
      let assignedVehicle: { id: string; plateNumber: string } | null = null;
      if (input.vehicleId && input.vehicleId !== currentOrder.vehicleId) {
        if (
          session.user.role !== UserRole.LOGISTICS ||
          currentOrder.deliveryMethod !== DODeliveryMethod.INTERNAL_MOVER ||
          currentOrder.status !== DOStatus.PENDING ||
          currentOrder.vehicleId
        ) {
          throw new Error(
            "Kendaraan hanya dapat ditetapkan Logistik pada DO internal yang belum memiliki kendaraan.",
          );
        }
        assignedVehicle = await transaction.vehicle.findFirst({
          where: {
            id: input.vehicleId,
            status: "AVAILABLE",
            odometerInitialized: true,
            deliveryOrders: {
              none: { status: { in: [DOStatus.PENDING, DOStatus.IN_TRANSIT] } },
            },
          },
          select: { id: true, plateNumber: true },
        });
        if (!assignedVehicle) {
          throw new Error(
            "Kendaraan tidak tersedia atau KM awal belum diinisialisasi.",
          );
        }
        const reserved = await transaction.vehicle.updateMany({
          where: {
            id: assignedVehicle.id,
            status: "AVAILABLE",
            odometerInitialized: true,
          },
          data: { status: "RESERVED" },
        });
        if (reserved.count !== 1) {
          throw new Error("Kendaraan baru saja ditugaskan. Muat ulang DO.");
        }
        const attached = await transaction.deliveryOrder.updateMany({
          where: {
            id: currentOrder.id,
            status: DOStatus.PENDING,
            vehicleId: null,
          },
          data: {
            vehicleId: assignedVehicle.id,
            vehiclePlateNumber: assignedVehicle.plateNumber,
          },
        });
        if (attached.count !== 1) {
          throw new Error("DO sudah memiliki kendaraan atau statusnya berubah.");
        }
      }
      if (currentOrder.ticket) {
        await lockTicketFulfillment(transaction, currentOrder.ticket.id);
      }

      const currentItemIds = new Set(currentOrder.items.map((item) => item.id));
      const submittedItemIds = input.items.flatMap((item) =>
        item.id ? [item.id] : [],
      );
      if (
        new Set(submittedItemIds).size !== submittedItemIds.length ||
        submittedItemIds.some((id) => !currentItemIds.has(id)) ||
        (submittedItemIds.length === 0 &&
          input.items.length !== currentOrder.items.length)
      ) {
        throw new Error(
          "Daftar item DO berubah sejak halaman dibuka. Muat ulang sebelum menyimpan.",
        );
      }

      const nextDriverName =
        currentOrder.deliveryMethod === DODeliveryMethod.EXPEDITION
          ? input.driverName!.trim()
          : assignedMoverName ?? input.driverName?.trim() ?? null;
      const nextVehiclePlate =
        assignedVehicle?.plateNumber ?? input.vehiclePlate?.trim() ?? null;
      const nextReceiverName =
        isExpeditionArrival && !existingOrder.receivedAt
          ? session.user.name?.trim() || "Tim Logistik"
          : input.receiverName?.trim() || null;
      const documentContentChanged =
        normalizedDoNumber !== currentOrder.doNumber ||
        nextDriverName !== currentOrder.driverName ||
        (input.vehicleDocumentNumber?.trim() || null) !==
        currentOrder.vehicleDocumentNumber ||
        nextVehiclePlate !== currentOrder.vehiclePlate ||
        (assignedVehicle
          ? assignedVehicle.plateNumber !== currentOrder.vehiclePlateNumber
          : false) ||
        (input.driverIdentityNumber?.trim() || null) !==
        currentOrder.driverIdentityNumber ||
        (input.driverPhone?.trim() || null) !== currentOrder.driverPhone ||
        nextReceiverName !== currentOrder.receiverName ||
        input.items.length !== currentOrder.items.length ||
        input.items.some((item) => {
          const currentItem = currentOrder.items.find(
            (candidate) => candidate.id === item.id,
          );
          return (
            !currentItem ||
            (item.itemCode?.trim() || null) !== currentItem.itemCode ||
            item.itemName.trim() !== currentItem.itemName ||
            item.qtyOrdered !== currentItem.qtyOrdered ||
            item.qtyDelivered !== currentItem.qtyDelivered ||
            item.unit.trim() !== currentItem.unit ||
            (item.remarks?.trim() || null) !== currentItem.remarks
          );
        });
      if (currentOrder.signedAt && documentContentChanged) {
        throw new Error(
          "DO sudah ditandatangani. Perubahan isi dokumen memerlukan DO baru.",
        );
      }

      const outboundMovements =
        await transaction.stockMovement.findMany({
          where: {
            reference: currentOrder.doNumber,
            type: StockMovementType.OUT,
          },
          select: {
            stockItemId: true,
            materialName: true,
            unit: true,
          },
        });
      const trackedStockItemIds = new Set(
        outboundMovements.flatMap((movement) =>
          movement.stockItemId ? [movement.stockItemId] : [],
        ),
      );

      if (trackedStockItemIds.size > 0) {
        const [stockItems, movements] = await Promise.all([
          transaction.stockItem.findMany({
            where: { id: { in: [...trackedStockItemIds] } },
            select: {
              id: true,
              name: true,
              unit: true,
              stockQuantity: true,
              unitPrice: true,
            },
          }),
          transaction.stockMovement.findMany({
            where: {
              reference: currentOrder.doNumber,
              type: {
                in: [StockMovementType.IN, StockMovementType.OUT],
              },
              stockItemId: { in: [...trackedStockItemIds] },
            },
            select: {
              stockItemId: true,
              type: true,
              quantity: true,
            },
          }),
        ]);
        const normalize = (value: string) =>
          value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
        const itemKey = (name: string, unit: string) =>
          `${normalize(name)}\u0000${normalize(unit)}`;
        const movementItemIdsByKey = new Map<string, Set<string>>();
        for (const movement of outboundMovements) {
          if (!movement.stockItemId) continue;
          const key = itemKey(movement.materialName, movement.unit);
          const ids = movementItemIdsByKey.get(key) ?? new Set<string>();
          ids.add(movement.stockItemId);
          movementItemIdsByKey.set(key, ids);
        }
        const oldItemStockIds = new Map<string, string>();
        for (const item of currentOrder.items) {
          const ids = movementItemIdsByKey.get(itemKey(item.itemName, item.unit));
          if (ids?.size === 1) {
            oldItemStockIds.set(item.id, [...ids][0]);
          }
        }
        const targetQuantities = new Map<string, Prisma.Decimal>();
        for (const item of input.items) {
          const oldStockItemId = item.id
            ? oldItemStockIds.get(item.id)
            : undefined;
          if (item.id && oldStockItemId) {
            const oldItem = currentOrder.items.find(
              (current) => current.id === item.id,
            );
            if (
              oldItem &&
              itemKey(item.itemName, item.unit) !==
              itemKey(oldItem.itemName, oldItem.unit)
            ) {
              throw new Error(
                "Nama dan satuan barang yang stoknya sudah dipotong tidak dapat diubah pada DO.",
              );
            }
          }
          const itemIds = movementItemIdsByKey.get(
            itemKey(item.itemName, item.unit),
          );
          const stockItemId =
            oldStockItemId ??
            (itemIds?.size === 1 ? [...itemIds][0] : undefined);
          if (!stockItemId) continue;
          targetQuantities.set(
            stockItemId,
            (targetQuantities.get(stockItemId) ?? new Prisma.Decimal(0)).plus(
              new Prisma.Decimal(item.qtyDelivered.toString()),
            ),
          );
        }

        for (const stockItemId of trackedStockItemIds) {
          const stockItem = stockItems.find((item) => item.id === stockItemId);
          if (!stockItem) continue;
          const netIssued = movements
            .filter((movement) => movement.stockItemId === stockItemId)
            .reduce(
              (quantity, movement) =>
                movement.type === StockMovementType.OUT
                  ? quantity.plus(
                    decimalFromScaledInteger(movement.quantity),
                  )
                  : quantity.minus(
                    decimalFromScaledInteger(movement.quantity),
                  ),
              new Prisma.Decimal(0),
            );
          if (netIssued.lessThan(0)) {
            throw new Error(
              `Riwayat stok DO ${currentOrder.doNumber} tidak konsisten.`,
            );
          }
          const targetQuantity =
            targetQuantities.get(stockItemId) ?? new Prisma.Decimal(0);
          const difference = netIssued.minus(targetQuantity);
          if (difference.isZero()) continue;

          const isRestock = difference.greaterThan(0);
          const adjustedQuantity = difference.abs();
          const updated = await transaction.stockItem.updateMany({
            where: {
              id: stockItemId,
              ...(isRestock
                ? {}
                : {
                  stockQuantity: {
                    gte: scaledIntegerFromDecimal(adjustedQuantity),
                  },
                }),
            },
            data: {
              stockQuantity: isRestock
                ? {
                  increment: scaledIntegerFromDecimal(adjustedQuantity),
                }
                : {
                  decrement: scaledIntegerFromDecimal(adjustedQuantity),
                },
            },
          });
          if (updated.count !== 1) {
            throw new Error(
              `Stok ${stockItem.name} tidak mencukupi untuk menyesuaikan Qty DO.`,
            );
          }
          await transaction.stockMovement.create({
            data: {
              projectId: currentOrder.ticket?.projectId,
              stockItemId,
              type: isRestock
                ? StockMovementType.IN
                : StockMovementType.OUT,
              materialName: stockItem.name,
              quantity: scaledIntegerFromDecimal(adjustedQuantity),
              unit: stockItem.unit,
              totalCost: scaledIntegerFromDecimal(
                adjustedQuantity
                  .mul(decimalFromScaledInteger(stockItem.unitPrice))
                  .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
              ),
              reference: currentOrder.doNumber,
              notes: isRestock
                ? `Restock selisih Qty DO ${currentOrder.doNumber} dari tiket ${currentOrder.ticket?.ticketNumber ?? "tanpa tiket"}.`
                : `Pemotongan tambahan selisih Qty DO ${currentOrder.doNumber} dari tiket ${currentOrder.ticket?.ticketNumber ?? "tanpa tiket"}.`,
              createdById: session.user.id,
            },
          });
        }
      }

      await transaction.deliveryOrder.update({
        where: { publicCode },
        data: {
          doNumber: normalizedDoNumber,
          deliveryMethod: existingOrder.deliveryMethod,
          vehicleDocumentNumber:
            input.vehicleDocumentNumber?.trim() || null,
          driverName:
            currentOrder.deliveryMethod === DODeliveryMethod.EXPEDITION
              ? input.driverName!.trim()
              : assignedMoverName ?? input.driverName?.trim() ?? null,
          vehiclePlate: input.vehiclePlate?.trim() || null,
          ...(assignedVehicle
            ? {
              vehicleId: assignedVehicle.id,
              vehiclePlateNumber: assignedVehicle.plateNumber,
              vehiclePlate: assignedVehicle.plateNumber,
            }
            : {}),
          driverIdentityNumber: input.driverIdentityNumber?.trim() || null,
          driverPhone: input.driverPhone?.trim() || null,
          receiverName: isExpeditionArrival
            ? existingOrder.receivedAt
              ? input.receiverName?.trim() || null
              : session.user.name?.trim() || "Tim Logistik"
            : input.receiverName?.trim() || null,
          ...(isExpeditionArrival && !existingOrder.receivedAt
            ? {
              receivedAt,
              receivedById: session.user.id,
              arrivalPhotoUrl:
                savedArrivalPhotoUrl ?? existingOrder.arrivalPhotoUrl,
            }
            : {}),
          ...(currentOrder.deliveryMethod === DODeliveryMethod.EXPEDITION
            ? { status: input.status }
            : {}),
        },
      });
      if (normalizedDoNumber !== currentOrder.doNumber) {
        await transaction.stockMovement.updateMany({
          where: { reference: currentOrder.doNumber },
          data: { reference: normalizedDoNumber },
        });
      }
      await transaction.dOItem.deleteMany({
        where: {
          doId: currentOrder.id,
          id: { notIn: submittedItemIds },
        },
      });
      for (const item of input.items) {
        const data = {
          itemCode: item.itemCode?.trim() || null,
          itemName: item.itemName.trim(),
          qtyOrdered: item.qtyOrdered,
          qtyDelivered: item.qtyDelivered,
          unit: item.unit.trim(),
          remarks: item.remarks?.trim() || null,
        };
        if (item.id) {
          await transaction.dOItem.update({
            where: { id: item.id },
            data,
          });
        } else {
          await transaction.dOItem.create({
            data: { doId: currentOrder.id, ...data },
          });
        }
      }
      if (
        existingOrder.deliveryMethod ===
        DODeliveryMethod.EXPEDITION &&
        input.status === DOStatus.DELIVERED &&
        existingOrder.ticket
      ) {
        await syncTicketStatus(
          transaction,
          existingOrder.ticket.id,
          TicketStatus.COMPLETED,
        );
        await transaction.ticketAuditLog.create({
          data: {
            id: randomUUID(),
            ticketId: existingOrder.ticket.id,
            userId: session.user.id,
            action: "EXPEDITION_DELIVERY_COMPLETED",
            notes: `Material pada DO ${normalizedDoNumber} diterima oleh Logistik di gudang pada ${receivedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}.`,
          },
        });
      }
    });
  } catch (error) {
    if (savedArrivalPhotoUrl) {
      try {
        await removeDeliveryOrderArrivalPhoto(savedArrivalPhotoUrl);
      } catch (cleanupError) {
        console.error(
          "Delivery Order arrival photo cleanup failed:",
          cleanupError,
        );
      }
    }
    if (error instanceof DeliveryOrderArrivalPhotoValidationError) {
      return fail(error.message);
    }
    console.error("Delivery Order update failed:", error);
    const actionableError =
      error instanceof Error &&
      /^(Daftar item DO berubah|Nama dan satuan barang|Stok .* tidak mencukupi|Riwayat stok DO|Kendaraan|DO sudah memiliki kendaraan|Status DO internal|DO sudah ditandatangani)/.test(
        error.message,
      );
    return fail(
      actionableError
        ? error.message
        : "Delivery Order gagal disimpan. Periksa nomor DO dan coba kembali.",
    );
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/documents");
  revalidatePath("/apps/tickets");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  return { success: true, message: "Perubahan Delivery Order berhasil disimpan." };
}

export async function startMoverDeliveryOrder(
  publicCode: string,
  kilometerStart: number,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.MOVER) {
    return fail("Hanya Mover yang ditugaskan yang dapat memulai pengiriman.");
  }
  if (
    !validPublicCode(publicCode) ||
    !isValidKilometer(kilometerStart)
  ) {
    return fail("Kode DO atau kendaraan tidak valid.");
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const reference = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: { ticketId: true },
      });
      if (!reference) throw new Error("Delivery Order tidak ditemukan.");
      if (reference.ticketId) {
        await lockTicketFulfillment(transaction, reference.ticketId);
      }

      const order = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          doNumber: true,
          deliveryMethod: true,
          status: true,
          driverName: true,
          vehicleId: true,
          vehiclePlateNumber: true,
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              moverAssigneeId: true,
              status: true,
            },
          },
        },
      });
      if (!order) throw new Error("Delivery Order tidak ditemukan.");
      const isAssigned =
        order.ticket?.moverAssigneeId === session.user.id ||
        (!order.ticket?.moverAssigneeId &&
          Boolean(session.user.name) &&
          order.driverName === session.user.name);
      if (!isAssigned) {
        throw new Error("DO ini tidak ditugaskan kepada akun Mover Anda.");
      }
      if (order.deliveryMethod !== DODeliveryMethod.INTERNAL_MOVER) {
        throw new Error("DO ini bukan tugas pengiriman Mover internal.");
      }
      if (order.status !== DOStatus.PENDING) {
        throw new Error("Status DO sudah berubah. Muat ulang halaman.");
      }
      if (!order.vehicleId || !order.vehiclePlateNumber) {
        throw new Error("DO belum memiliki kendaraan yang ditetapkan Logistik.");
      }
      const vehicle = await transaction.vehicle.findFirst({
        where: {
          id: order.vehicleId,
          status: "RESERVED",
          odometerInitialized: true,
        },
        select: {
          id: true,
          plateNumber: true,
          currentKilometer: true,
          odometerInitialized: true,
        },
      });
      if (!vehicle) {
        throw new Error("Kendaraan yang ditetapkan Logistik tidak tersedia.");
      }
      if (!vehicle.odometerInitialized) {
        throw new Error("KM awal kendaraan belum diinisialisasi oleh Logistik.");
      }
      const startOdometer = new Prisma.Decimal(kilometerStart.toString());
      if (
        !decimalFromScaledInteger(vehicle.currentKilometer).equals(
          startOdometer,
        )
      ) {
        throw new Error(
          `KM berangkat harus sesuai odometer kendaraan (${decimalFromScaledInteger(vehicle.currentKilometer).toString()} km).`,
        );
      }
      const claimedVehicle = await transaction.vehicle.updateMany({
        where: {
          id: vehicle.id,
          status: "RESERVED",
          currentKilometer: scaledIntegerFromDecimal(startOdometer),
        },
        data: { status: "IN_USE" },
      });
      if (claimedVehicle.count !== 1) {
        throw new Error("Kendaraan baru saja digunakan. Pilih armada lain.");
      }

      const updated = await transaction.deliveryOrder.updateMany({
        where: { id: order.id, status: DOStatus.PENDING },
        data: {
          status: DOStatus.IN_TRANSIT,
          departureKilometer: scaledIntegerFromDecimal(startOdometer),
        },
      });
      if (updated.count !== 1) {
        throw new Error("Status DO sudah berubah. Muat ulang halaman.");
      }

      if (order.ticket) {
        await syncTicketStatus(
          transaction,
          order.ticket.id,
          TicketStatus.IN_TRANSIT,
        );
        await transaction.ticketAuditLog.create({
          data: {
            ticketId: order.ticket.id,
            userId: session.user.id,
            action: "MOVER_DELIVERY_STARTED",
            notes: `Mover memulai pengiriman DO ${order.doNumber} menggunakan kendaraan ${vehicle.plateNumber}.`,
          },
        });
      }
      return { doNumber: order.doNumber, plateNumber: vehicle.plateNumber };
    });

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath(`/d/${publicCode}`);
    return {
      success: true,
      message: `Pengiriman DO ${result.doNumber} dimulai dengan kendaraan ${result.plateNumber}.`,
      publicCode,
    };
  } catch (error) {
    console.error("Mover delivery start failed:", error);
    return fail(
      error instanceof Error &&
        (error.message.startsWith("Delivery Order") ||
          error.message.startsWith("DO ini") ||
          error.message.startsWith("Status DO") ||
          error.message.startsWith("Kendaraan") ||
          error.message.startsWith("KM berangkat") ||
          error.message.startsWith("KM awal kendaraan") ||
          error.message.startsWith("Ajukan dana") ||
          error.message.startsWith("DO belum memiliki"))
        ? error.message
        : "Pengiriman gagal dimulai. Muat ulang halaman lalu coba kembali.",
    );
  }
}

const MAX_MOVER_PROOF_PHOTOS = 5;
const MAX_MOVER_PROOF_TOTAL_BYTES = 25 * 1024 * 1024;
const MOVER_PROOF_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function submitMoverDeliveryProofs(
  publicCode: string,
  files: File[],
  completeDelivery: boolean,
  kilometerStart?: number,
  kilometerEnd?: number,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.MOVER) {
    return fail("Hanya Mover yang ditugaskan yang dapat mengirim bukti.");
  }
  if (
    !validPublicCode(publicCode) ||
    !Array.isArray(files) ||
    typeof completeDelivery !== "boolean" ||
    (completeDelivery &&
      (!isValidKilometer(kilometerStart) ||
        !isValidKilometer(kilometerEnd) ||
        kilometerEnd < kilometerStart)) ||
    files.length > MAX_MOVER_PROOF_PHOTOS ||
    files.some(
      (file) =>
        !(file instanceof File) ||
        !MOVER_PROOF_IMAGE_TYPES.includes(file.type) ||
        file.size < 1 ||
        file.size > 5 * 1024 * 1024,
    ) ||
    files.reduce((total, file) => total + file.size, 0) >
    MAX_MOVER_PROOF_TOTAL_BYTES ||
    (!completeDelivery && files.length === 0)
  ) {
    return fail(
      "Pilih 1–5 foto JPG, PNG, atau WEBP. Maksimal 5 MB per foto dan 25 MB per pengiriman.",
    );
  }

  const receiptUrls: string[] = [];
  try {
    for (const file of files) {
      receiptUrls.push(await saveTicketReceipt(file));
    }
  } catch (error) {
    await Promise.all(
      receiptUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove invalid Mover proof upload:", cleanupError);
        }
      }),
    );
    return fail(
      error instanceof Error
        ? error.message
        : "Foto bukti pengiriman gagal diproses.",
    );
  }

  let proofsCommitted = false;
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const reference = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: { ticketId: true },
      });
      if (!reference) throw new Error("Delivery Order tidak ditemukan.");
      if (reference.ticketId) {
        await lockTicketFulfillment(transaction, reference.ticketId);
      }

      const order = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          doNumber: true,
          deliveryMethod: true,
          status: true,
          driverName: true,
          vehicleId: true,
          departureKilometer: true,
          deliveryReceiptUrl: true,
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              moverAssigneeId: true,
              projectId: true,
            },
          },
          po: {
            select: {
              ticket: { select: { projectId: true } },
            },
          },
        },
      });
      if (!order) throw new Error("Delivery Order tidak ditemukan.");
      const isAssigned =
        order.ticket?.moverAssigneeId === session.user.id ||
        (!order.ticket?.moverAssigneeId &&
          Boolean(session.user.name) &&
          order.driverName === session.user.name);
      if (!isAssigned) {
        throw new Error("DO ini tidak ditugaskan kepada akun Mover Anda.");
      }
      if (order.deliveryMethod !== DODeliveryMethod.INTERNAL_MOVER) {
        throw new Error("DO ini bukan tugas pengiriman Mover internal.");
      }
      if (order.status !== DOStatus.IN_TRANSIT) {
        throw new Error("Mulai pengiriman terlebih dahulu sebelum menyelesaikan DO.");
      }

      const storedProofCount = await transaction.deliveryOrderProof.count({
        where: { deliveryOrderId: order.id },
      });
      const existingProofCount = Math.max(
        storedProofCount,
        order.deliveryReceiptUrl ? 1 : 0,
      );
      if (completeDelivery && existingProofCount + receiptUrls.length === 0) {
        throw new Error("Unggah minimal satu foto bukti sebelum menyelesaikan DO.");
      }

      let tripDistance: Prisma.Decimal | null = null;
      let tripFuelLiter: Prisma.Decimal | null = null;
      if (completeDelivery) {
        if (!order.vehicleId) {
          throw new Error("Kendaraan pengiriman belum terhubung ke DO.");
        }
        const startOdometer = new Prisma.Decimal(kilometerStart!.toString());
        const endOdometer = new Prisma.Decimal(kilometerEnd!.toString());
        if (
          order.departureKilometer &&
          !decimalFromScaledInteger(order.departureKilometer).equals(
            startOdometer,
          )
        ) {
          throw new Error("KM berangkat tidak sesuai dengan data saat kendaraan dipilih.");
        }
        const vehicle = await transaction.vehicle.findUnique({
          where: { id: order.vehicleId },
          select: { status: true, currentKilometer: true },
        });
        if (!vehicle || vehicle.status !== "IN_USE") {
          throw new Error("Status kendaraan tidak sesuai dengan DO yang berjalan.");
        }
        if (
          !decimalFromScaledInteger(vehicle.currentKilometer).equals(
            startOdometer,
          )
        ) {
          throw new Error(
            `KM berangkat harus sesuai odometer kendaraan (${decimalFromScaledInteger(vehicle.currentKilometer).toString()} km).`,
          );
        }
        tripDistance = endOdometer.minus(startOdometer);
        tripFuelLiter = tripDistance
          .div(VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const updatedVehicle = await transaction.vehicle.updateMany({
          where: {
            id: order.vehicleId,
            status: "IN_USE",
            currentKilometer: scaledIntegerFromDecimal(startOdometer),
          },
          data: {
            currentKilometer: scaledIntegerFromDecimal(endOdometer),
            status: "AVAILABLE",
          },
        });
        if (updatedVehicle.count !== 1) {
          throw new Error("Odometer kendaraan berubah. Muat ulang halaman.");
        }
      }

      if (receiptUrls.length > 0) {
        const uniqueUrls = Array.from(new Set(receiptUrls));
        const existingRecords = await transaction.deliveryOrderProof.findMany({
          where: { url: { in: uniqueUrls } },
          select: { url: true },
        });
        const existingUrlSet = new Set(existingRecords.map((r) => r.url));
        const urlsToInsert = uniqueUrls.filter((url) => !existingUrlSet.has(url));

        if (urlsToInsert.length > 0) {
          await transaction.deliveryOrderProof.createMany({
            data: urlsToInsert.map((url) => ({
              deliveryOrderId: order.id,
              url,
            })),
          });
        }
      }

      const primaryReceiptUrl =
        order.deliveryReceiptUrl ?? receiptUrls[0] ?? null;
      const updated = await transaction.deliveryOrder.updateMany({
        where: { id: order.id, status: DOStatus.IN_TRANSIT },
        data: {
          ...(primaryReceiptUrl
            ? { deliveryReceiptUrl: primaryReceiptUrl }
            : {}),
          ...(completeDelivery
            ? {
              status: DOStatus.DELIVERED,
              receivedAt: new Date(),
              departureKilometer: scaledIntegerFromDecimal(
                kilometerStart!.toString(),
              ),
            }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error("Status DO sudah berubah. Muat ulang halaman.");
      }
      if (completeDelivery) {
        await transaction.deliveryOrder.update({
          where: { id: order.id },
          data: { receivedBy: { connect: { id: session.user.id } } },
        });
      }

      if (completeDelivery && order.vehicleId && tripDistance && tripFuelLiter) {
        await transaction.vehicleTripLog.create({
          data: {
            vehicleId: order.vehicleId,
            deliveryOrderId: order.id,
            projectId:
              order.ticket?.projectId ?? order.po?.ticket?.projectId ?? null,
            kilometerStart: scaledIntegerFromDecimal(
              kilometerStart!.toString(),
            ),
            kilometerEnd: scaledIntegerFromDecimal(kilometerEnd!.toString()),
            distanceKm: scaledIntegerFromDecimal(tripDistance),
            fuelLiter: scaledIntegerFromDecimal(tripFuelLiter),
            fuelEfficiencyKmPerL: scaledIntegerFromDecimal(
              VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
            ),
            createdById: session.user.id,
          },
        });
      }

      if (order.ticket) {
        if (primaryReceiptUrl) {
          await transaction.ticket.update({
            where: { id: order.ticket.id },
            data: { deliveryOrderReceiptUrl: primaryReceiptUrl },
          });
        }
        if (completeDelivery) {
          await syncTicketStatus(
            transaction,
            order.ticket.id,
            TicketStatus.COMPLETED,
          );
        }
        await transaction.ticketAuditLog.create({
          data: {
            ticketId: order.ticket.id,
            userId: session.user.id,
            action: completeDelivery
              ? "MOVER_DELIVERY_COMPLETED"
              : "MOVER_DELIVERY_PROOF_ADDED",
            notes: completeDelivery
              ? `Mover menyelesaikan pengiriman DO ${order.doNumber} dengan ${existingProofCount + receiptUrls.length} foto bukti.`
              : `Mover menambahkan ${receiptUrls.length} foto bukti untuk DO ${order.doNumber}.`,
          },
        });
      }
      return {
        doNumber: order.doNumber,
        proofCount: existingProofCount + receiptUrls.length,
      };
    });
    proofsCommitted = true;

    revalidatePath("/apps/logistics");
    if (completeDelivery) revalidatePath("/apps/finance");
    revalidatePath("/apps/tickets");
    revalidatePath(`/d/${publicCode}`);
    return {
      success: true,
      message: completeDelivery
        ? `Pengiriman DO ${result.doNumber} selesai. ${result.proofCount} foto bukti tersimpan.`
        : `${receiptUrls.length} foto bukti untuk DO ${result.doNumber} berhasil disimpan.`,
      publicCode,
    };
  } catch (error) {
    if (!proofsCommitted) {
      await Promise.all(
        receiptUrls.map(async (url) => {
          try {
            await removeTicketReceipt(url);
          } catch (cleanupError) {
            console.error("Failed to remove unused Mover proof:", cleanupError);
          }
        }),
      );
    }
    console.error("Mover delivery proof submission failed:", error);
    return fail(
      error instanceof Error &&
        (error.message.startsWith("Delivery Order") ||
          error.message.startsWith("DO ini") ||
          error.message.startsWith("Mulai pengiriman") ||
          error.message.startsWith("Status DO") ||
          error.message.startsWith("Unggah minimal") ||
          error.message.startsWith("Kendaraan") ||
          error.message.startsWith("Status kendaraan") ||
          error.message.startsWith("KM berangkat") ||
          error.message.startsWith("Odometer"))
        ? error.message
        : "Foto bukti gagal disimpan. Muat ulang halaman lalu coba kembali.",
    );
  }
}

export async function receiveExpeditionDeliveryOrder(
  publicCode: string,
  arrivalPhotoFile: File,
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return fail("Hanya Logistik yang dapat menerima material ekspedisi.");
  }
  if (
    !isValidPublicCode(publicCode) ||
    !(arrivalPhotoFile instanceof File) ||
    arrivalPhotoFile.size === 0
  ) {
    return fail("Delivery Order dan foto bukti penerimaan wajib dipilih.");
  }

  let arrivalPhotoUrl: string;
  try {
    arrivalPhotoUrl = await saveDeliveryOrderArrivalPhoto(arrivalPhotoFile);
  } catch (error) {
    if (error instanceof DeliveryOrderArrivalPhotoValidationError) {
      return fail(error.message);
    }
    console.error("Expedition arrival photo save failed:", error);
    return fail("Foto kedatangan gagal disimpan. Silakan coba kembali.");
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const deliveryOrderReference = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: { ticketId: true },
      });
      if (!deliveryOrderReference?.ticketId) {
        throw new Error(
          "Delivery Order tidak ditemukan, bukan ekspedisi, atau tidak lagi dalam perjalanan.",
        );
      }

      await lockTicketFulfillment(
        transaction,
        deliveryOrderReference.ticketId,
      );
      const deliveryOrder = await transaction.deliveryOrder.findUnique({
        where: { publicCode },
        select: {
          id: true,
          doNumber: true,
          deliveryMethod: true,
          status: true,
          receivedAt: true,
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              status: true,
              requesterId: true,
            },
          },
        },
      });
      if (
        !deliveryOrder ||
        deliveryOrder.deliveryMethod !== DODeliveryMethod.EXPEDITION ||
        deliveryOrder.status !== DOStatus.IN_TRANSIT ||
        deliveryOrder.receivedAt ||
        deliveryOrder.ticket?.status !== TicketStatus.IN_TRANSIT
      ) {
        throw new Error(
          "Delivery Order tidak ditemukan, bukan ekspedisi, atau tidak lagi dalam perjalanan.",
        );
      }

      const receivedAt = new Date();
      const deliveryUpdate = await transaction.deliveryOrder.updateMany({
        where: {
          id: deliveryOrder.id,
          status: DOStatus.IN_TRANSIT,
          receivedAt: null,
        },
        data: {
          status: DOStatus.DELIVERED,
          receiverName: session.user.name?.trim() || "Tim Logistik",
          receivedAt,
          receivedById: session.user.id,
          arrivalPhotoUrl,
        },
      });
      if (deliveryUpdate.count !== 1) {
        throw new Error("Status DO berubah; muat ulang lalu coba kembali.");
      }
      await syncTicketStatus(
        transaction,
        deliveryOrder.ticket.id,
        TicketStatus.COMPLETED,
      );

      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId: deliveryOrder.ticket.id,
          userId: session.user.id,
          action: "EXPEDITION_DELIVERY_COMPLETED",
          notes: `Material pada DO ${deliveryOrder.doNumber} diterima di gudang oleh Logistik pada ${receivedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}.`,
        },
      });
      await sendNotification({
        userId: deliveryOrder.ticket.requesterId,
        title: "Material Tiba di Gudang",
        message: `Material pada DO ${deliveryOrder.doNumber} untuk tiket ${deliveryOrder.ticket.ticketNumber} telah diterima Logistik.`,
        actionUrl: `/apps/logistics`,
        type: NotificationType.SUCCESS,
        database: transaction,
      });
    });
  } catch (error) {
    try {
      await removeDeliveryOrderArrivalPhoto(arrivalPhotoUrl);
    } catch (cleanupError) {
      console.error("Expedition arrival photo cleanup failed:", cleanupError);
    }
    if (
      error instanceof DeliveryOrderArrivalPhotoValidationError ||
      (error instanceof Error &&
        (error.message.startsWith("Delivery Order") ||
          error.message.startsWith("Status DO")))
    ) {
      return fail(error.message);
    }
    console.error("Expedition delivery receipt failed:", error);
    return fail("Tiket gagal diselesaikan. Periksa DO lalu coba kembali.");
  }

  revalidatePath(`/d/${publicCode}`);
  revalidatePath("/apps/documents");
  revalidatePath("/apps/tickets");
  revalidatePath("/apps/logistics");
  return {
    success: true,
    message: "Material diterima di gudang dan tiket berhasil diselesaikan.",
  };
}
