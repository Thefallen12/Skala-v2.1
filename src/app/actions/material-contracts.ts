"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ClientSession } from "mongoose";
import {
  DOStatus,
  FulfillmentStatus,
  MaterialDeliveryBillingStatus,
  NotificationType,
  POPaymentMethod,
  PaymentType,
  TicketCategoryHint,
  TicketFulfillmentStatus,
  TicketStatus,
  TicketType,
  UserRole,
  VendorInvoiceStatus,
} from "@prisma/client";
import { auth } from "../../../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import Cashflow from "@/models/cashflow";
import DirectStockPurchase from "@/models/direct-stock-purchase";
import DocumentNumberSequence from "@/models/document-number-sequence";
import FinanceAccount from "@/models/finance-account";
import Notification from "@/models/notification";
import OfficeExpense from "@/models/office-expense";
import PaymentTransaction from "@/models/payment-transaction";
import Project from "@/models/project";
import PurchaseOrder from "@/models/purchase-order";
import Ticket from "@/models/ticket";
import TicketAuditLog from "@/models/ticket-audit-log";
import User from "@/models/user";
import {
  DeliveryOrder,
  EquipmentRental,
  Invoice,
  MaterialContract,
  MaterialDelivery,
  OrderConfirmation,
  SubkonTermyn,
  TicketItem,
  VehicleFuelRequest,
  Vendor,
  VendorInvoice,
  VendorInvoicePayment,
} from "@/models/finance-records";
import {
  CloudinaryConfigurationError,
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  removeTicketReceipt,
  saveTicketReceipt,
} from "@/lib/ticket-receipts";
import { CloudinaryPrivatePdfValidationError } from "@/lib/cloudinary-private-pdfs";
import { isFinanceCashflowProofUrl } from "@/lib/finance-cashflow";
import { normalizeFinancePaymentProofFile } from "@/lib/finance-payment-proof-file";
import {
  removeUploadedCashflowProof,
  uploadCashflowProof,
} from "@/app/actions/finance-cashflow";
import {
  MATERIAL_DELIVERY_PROOF_CLOUDINARY_FOLDER,
  calculateContractDeliverySubtotal,
  canBillAndPayVendorContracts,
  canManageMaterialContracts,
  canPrepareVendorInvoices,
  canRecordMaterialDeliveries,
  createMaterialContractSchema,
  createVendorInvoiceSchema,
  recordMaterialDeliverySchema,
  roundMaterialNumber,
  type CreateMaterialContractInput,
  type CreateVendorInvoiceInput,
  type MaterialDeliveryRow,
} from "@/lib/material-contracts";

export type MaterialContractActionResult = {
  success: boolean;
  message: string;
  id?: string;
};

function parseDateOnlyInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

function sanitizeContractMaterialSlug(materialType: string): string {
  const cleaned = materialType
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "MATERIAL";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function generateNextContractNumber(
  mongoSession: ClientSession,
  materialType: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const slug = sanitizeContractMaterialSlug(materialType);
  const sequence = await DocumentNumberSequence.findOneAndUpdate(
    { kind: `KONTRAK_${slug}`, year },
    {
      $inc: { value: 1 },
      $setOnInsert: { _id: randomUUID() },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      session: mongoSession,
    },
  )
    .select({ value: 1 })
    .lean();
  return `KONTRAK/${slug}/${year}/${String(sequence?.value ?? 1).padStart(3, "0")}`;
}

const LOGISTICS_DB_ROLES = [UserRole.LOGISTICS, "KOORDINATOR_LOGISTIK"];
const FINANCE_DB_ROLES = [UserRole.FINANCE, "KEUANGAN"];

async function syncContractTicketFulfillment(
  mongoSession: ClientSession,
  ticketId: string,
  contractNumber: string,
  userId: string,
  doNumber: string,
  mode: "RECORDED" | "REMOVED" | "PAID" = "RECORDED",
) {
  const [ticket, ticketItems, deliveries] = await Promise.all([
    Ticket.findById(ticketId)
      .session(mongoSession)
      .select({
        _id: 1,
        ticketNumber: 1,
        title: 1,
        status: 1,
        requesterId: 1,
      })
      .lean(),
    TicketItem.find({ ticketId })
      .session(mongoSession)
      .select({
        _id: 1,
        quantity: 1,
        status: 1,
        categoryHint: 1,
        materialContractId: 1,
      })
      .lean(),
    MaterialDelivery.find({ ticketId })
      .session(mongoSession)
      .select({
        contractId: 1,
        quantityReceived: 1,
        billingStatus: 1,
        vendorInvoiceId: 1,
      })
      .lean(),
  ]);
  if (!ticket) {
    return null;
  }

  const requestedByContract = new Map<string, number>();
  const deliveredByContract = new Map<string, number>();

  for (const item of ticketItems) {
    if (
      item.categoryHint === TicketCategoryHint.CONTRACT &&
      item.materialContractId
    ) {
      const contractIdKey = String(item.materialContractId);
      requestedByContract.set(
        contractIdKey,
        (requestedByContract.get(contractIdKey) ?? 0) + Number(item.quantity ?? 0),
      );
    }
  }
  for (const delivery of deliveries) {
    const contractIdKey = String(delivery.contractId);
    deliveredByContract.set(
      contractIdKey,
      (deliveredByContract.get(contractIdKey) ?? 0) +
        Number(delivery.quantityReceived ?? 0),
    );
  }

  const completedContractItemIds: string[] = [];
  const pendingContractItemIds: string[] = [];
  for (const item of ticketItems) {
    if (
      item.categoryHint !== TicketCategoryHint.CONTRACT ||
      !item.materialContractId
    ) {
      continue;
    }
    const contractIdKey = String(item.materialContractId);
    const delivered = roundMaterialNumber(
      deliveredByContract.get(contractIdKey) ?? 0,
      2,
    );
    const requested = roundMaterialNumber(
      requestedByContract.get(contractIdKey) ?? 0,
      2,
    );
    if (delivered >= requested && requested > 0) {
      completedContractItemIds.push(String(item._id));
    } else {
      pendingContractItemIds.push(String(item._id));
    }
  }

  if (completedContractItemIds.length > 0) {
    await TicketItem.updateMany(
      { _id: { $in: completedContractItemIds } },
      { $set: { status: FulfillmentStatus.PROCESSED_TO_DO } },
      { session: mongoSession },
    );
  }
  if (pendingContractItemIds.length > 0) {
    await TicketItem.updateMany(
      { _id: { $in: pendingContractItemIds } },
      { $set: { status: FulfillmentStatus.PENDING } },
      { session: mongoSession },
    );
  }

  const completedSet = new Set(completedContractItemIds);
  const pendingSet = new Set(pendingContractItemIds);
  const effectiveItemStatus = (item: (typeof ticketItems)[number]) => {
    const itemId = String(item._id);
    if (completedSet.has(itemId)) {
      return FulfillmentStatus.PROCESSED_TO_DO;
    }
    if (pendingSet.has(itemId)) {
      return FulfillmentStatus.PENDING;
    }
    return item.status;
  };

  const contractItems = ticketItems.filter(
    (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
  );
  const nonContractItems = ticketItems.filter(
    (item) => item.categoryHint !== TicketCategoryHint.CONTRACT,
  );
  const allItemsFulfilled =
    ticketItems.length > 0 &&
    ticketItems.every(
      (item) => effectiveItemStatus(item) === FulfillmentStatus.PROCESSED_TO_DO,
    );
  const hasAnyFulfillment =
    deliveries.length > 0 ||
    ticketItems.some(
      (item) => effectiveItemStatus(item) !== FulfillmentStatus.PENDING,
    );

  const vendorInvoiceIds = [
    ...new Set(
      deliveries
        .map((delivery) => delivery.vendorInvoiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [regularDeliveryOrders, unpaidPoCount, unpaidDspCount, vendorInvoices] =
    await Promise.all([
      nonContractItems.length > 0 && allItemsFulfilled
        ? DeliveryOrder.find({ ticketId })
            .session(mongoSession)
            .select({ status: 1 })
            .lean()
        : Promise.resolve([]),
      PurchaseOrder.countDocuments({
        ticketId,
        paidAt: null,
        status: { $nin: ["REJECTED", "CANCELLED"] },
      }).session(mongoSession),
      DirectStockPurchase.countDocuments({
        ticketId,
        paidAt: null,
      }).session(mongoSession),
      vendorInvoiceIds.length > 0
        ? VendorInvoice.find({ _id: { $in: vendorInvoiceIds } })
            .session(mongoSession)
            .select({ _id: 1, status: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

  const invoiceStatusById = new Map(
    vendorInvoices.map((inv) => [String(inv._id), inv.status]),
  );
  const allContractDeliveriesSettled =
    deliveries.length > 0 &&
    deliveries.every(
      (delivery) =>
        delivery.billingStatus === MaterialDeliveryBillingStatus.BILLED &&
        Boolean(delivery.vendorInvoiceId) &&
        invoiceStatusById.get(String(delivery.vendorInvoiceId)) ===
          VendorInvoiceStatus.PAID,
    );
  const allPaymentsSettled =
    unpaidPoCount === 0 &&
    unpaidDspCount === 0 &&
    (contractItems.length === 0 || allContractDeliveriesSettled);

  const nonContractReadyForCompletion =
    nonContractItems.length === 0 ||
    (regularDeliveryOrders.length > 0 &&
      regularDeliveryOrders.every(
        (order) => order.status === DOStatus.DELIVERED,
      ));

  const currentStatus = String(ticket.status ?? "") as TicketStatus;
  const activeStatuses: TicketStatus[] = [
    TicketStatus.APPROVED_DIR,
    TicketStatus.PROCESSED_FINANCE,
    TicketStatus.PROCESSED_LOGISTIC,
    TicketStatus.ASSIGNED_TO_MOVER,
    TicketStatus.IN_TRANSIT,
    TicketStatus.WAITING_FINANCE_PAYMENT,
  ];
  let nextStatus = currentStatus;
  if (
    allItemsFulfilled &&
    nonContractReadyForCompletion &&
    activeStatuses.includes(currentStatus)
  ) {
    nextStatus = allPaymentsSettled
      ? TicketStatus.COMPLETED
      : TicketStatus.WAITING_FINANCE_PAYMENT;
  } else if (
    !allItemsFulfilled &&
    (currentStatus === TicketStatus.COMPLETED ||
      (mode === "REMOVED" &&
        currentStatus === TicketStatus.WAITING_FINANCE_PAYMENT &&
        unpaidPoCount === 0 &&
        unpaidDspCount === 0 &&
        deliveries.every(
          (delivery) =>
            delivery.billingStatus !== MaterialDeliveryBillingStatus.BILLED,
        )))
  ) {
    nextStatus = TicketStatus.PROCESSED_LOGISTIC;
  }

  const nextFulfillmentStatus = allItemsFulfilled
    ? TicketFulfillmentStatus.COMPLETED
    : hasAnyFulfillment
      ? TicketFulfillmentStatus.PARTIALLY_FULFILLED
      : TicketFulfillmentStatus.PENDING;

  await Ticket.updateOne(
    { _id: ticketId },
    {
      $set: {
        fulfillmentStatus: nextFulfillmentStatus,
        ...(nextStatus !== currentStatus
          ? { status: nextStatus, updatedAt: new Date() }
          : {}),
      },
    },
    { session: mongoSession },
  );

  const auditAction =
    mode === "REMOVED"
      ? "MATERIAL_CONTRACT_DELIVERY_REMOVED"
      : mode === "PAID"
        ? "MATERIAL_CONTRACT_INVOICE_PAID"
        : "MATERIAL_CONTRACT_DELIVERY_RECORDED";
  const auditNotes =
    mode === "REMOVED"
      ? `Surat Jalan ${doNumber} pada kontrak ${contractNumber} dihapus; status pemenuhan tiket disinkronkan ulang.`
      : mode === "PAID"
        ? nextStatus === TicketStatus.COMPLETED
          ? `Tagihan Material Alam ${doNumber} pada kontrak ${contractNumber} telah dibayar lunas oleh Keuangan; tiket selesai.`
          : `Tagihan Material Alam ${doNumber} pada kontrak ${contractNumber} telah dibayar lunas oleh Keuangan; menunggu pemenuhan item/tagihan tersisa.`
        : nextStatus === TicketStatus.COMPLETED
          ? `Surat Jalan ${doNumber} untuk kontrak ${contractNumber} dicatat; seluruh volume kontrak dan tagihan telah selesai.`
          : nextStatus === TicketStatus.WAITING_FINANCE_PAYMENT
            ? `Surat Jalan ${doNumber} untuk kontrak ${contractNumber} dicatat; seluruh volume kontrak telah tiba dan menunggu tagihan/pembayaran Keuangan.`
            : `Surat Jalan ${doNumber} untuk kontrak ${contractNumber} dicatat; pemenuhan tiket disinkronkan.`;

  await TicketAuditLog.create(
    [
      {
        _id: randomUUID(),
        ticketId,
        userId,
        action: auditAction,
        notes: auditNotes,
        createdAt: new Date(),
      },
    ],
    { session: mongoSession },
  );

  return {
    ticketNumber: String(ticket.ticketNumber ?? ""),
    title: String(ticket.title ?? ""),
    requesterId: String(ticket.requesterId ?? ""),
    isCompleted: nextStatus === TicketStatus.COMPLETED,
    isWaitingFinancePayment: nextStatus === TicketStatus.WAITING_FINANCE_PAYMENT,
    nextStatus,
  };
}

async function uploadDeliveryProofFile(file: File): Promise<string> {
  const normalized = normalizeFinancePaymentProofFile(file);
  if (!normalized) {
    throw new CloudinaryPhotoValidationError(
      "Format foto Surat Jalan harus JPG, PNG, WEBP, atau PDF.",
    );
  }
  if (normalized.type === "application/pdf") {
    return saveTicketReceipt(normalized);
  }
  const uploaded = await uploadCloudinaryPhoto(
    normalized,
    MATERIAL_DELIVERY_PROOF_CLOUDINARY_FOLDER,
  );
  return uploaded.secureUrl;
}

async function removeDeliveryProofFile(url: string | null | undefined) {
  if (!url) return;
  try {
    await removeCloudinaryPhoto(url);
    await removeTicketReceipt(url);
  } catch (error) {
    console.error("Failed to remove material delivery proof:", error);
  }
}

export async function createMaterialContract(
  input: CreateMaterialContractInput,
): Promise<MaterialContractActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canManageMaterialContracts(session.user.role)) {
    return {
      success: false,
      message: "Hanya Logistik, Administrasi, atau Direksi yang dapat membuat kontrak material.",
    };
  }

  const parsed = createMaterialContractSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Data kontrak tidak valid.",
    };
  }

  const data = parsed.data;
  const startDate = parseDateOnlyInput(data.startDate);
  if (!startDate) {
    return { success: false, message: "Tanggal mulai kontrak tidak valid." };
  }
  const endDate = data.endDate ? parseDateOnlyInput(data.endDate) : null;
  if (data.endDate && !endDate) {
    return { success: false, message: "Tanggal berakhir kontrak tidak valid." };
  }
  if (endDate && endDate.getTime() < startDate.getTime()) {
    return {
      success: false,
      message: "Tanggal berakhir kontrak tidak boleh lebih awal dari tanggal mulai.",
    };
  }

  const normalizedMaterialType = data.materialType.trim().toUpperCase();
  const normalizedUnit = data.unit.trim().toUpperCase();
  const normalizedUnitPrice = roundMaterialNumber(data.unitPrice, 2);
  const normalizedEstimatedVolume =
    data.estimatedVolume && data.estimatedVolume > 0
      ? roundMaterialNumber(data.estimatedVolume, 2)
      : null;

  try {
    const mongoose = await connectToMongoDB();
    const created = await mongoose.connection.transaction(async (mongoSession) => {
      let resolvedVendorId: string | null = data.vendorId?.trim() || null;
      let resolvedVendorName = data.vendorName.trim();

      if (resolvedVendorId) {
        const vendor = await Vendor.findById(resolvedVendorId)
          .session(mongoSession)
          .select({ _id: 1, name: 1 })
          .lean();
        if (!vendor) {
          throw new Error("Vendor yang dipilih tidak ditemukan.");
        }
        resolvedVendorId = String(vendor._id);
        resolvedVendorName = String(vendor.name ?? resolvedVendorName);
      }

      let contractNumber = data.contractNumber?.trim().toUpperCase() || "";
      if (contractNumber) {
        const duplicate = await MaterialContract.findOne({ contractNumber })
          .session(mongoSession)
          .select({ _id: 1 })
          .lean();
        if (duplicate) {
          throw new Error(`Nomor kontrak ${contractNumber} sudah digunakan.`);
        }
      } else {
        contractNumber = await generateNextContractNumber(
          mongoSession,
          normalizedMaterialType,
        );
      }

      const newContractId = randomUUID();
      const now = new Date();
      await MaterialContract.create(
        [
          {
            _id: newContractId,
            contractNumber,
            vendorId: resolvedVendorId,
            vendorName: resolvedVendorName,
            materialType: normalizedMaterialType,
            unitPrice: normalizedUnitPrice,
            unit: normalizedUnit,
            estimatedVolume: normalizedEstimatedVolume,
            notes: data.notes?.trim() || null,
            startDate,
            endDate,
            isActive: true,
            createdById: session.user.id,
            createdAt: now,
            updatedAt: now,
          },
        ],
        { session: mongoSession },
      );
      return { id: newContractId, contractNumber };
    });

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/finance");
    return {
      success: true,
      id: created.id,
      message: `Kontrak payung ${created.contractNumber} berhasil dibuat.`,
    };
  } catch (error) {
    console.error("Create material contract error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal membuat kontrak payung material.",
    };
  }
}

export async function toggleMaterialContractActive(
  contractId: string,
  isActive: boolean,
): Promise<MaterialContractActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canManageMaterialContracts(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin mengubah status kontrak.",
    };
  }

  try {
    await connectToMongoDB();
    const updated = await MaterialContract.findByIdAndUpdate(
      contractId,
      { $set: { isActive, updatedAt: new Date() } },
      { returnDocument: "after" },
    )
      .select({ contractNumber: 1, isActive: 1 })
      .lean();
    if (!updated) {
      throw new Error("Kontrak material tidak ditemukan.");
    }

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/finance");
    return {
      success: true,
      message: `Kontrak ${updated.contractNumber} kini ${
        updated.isActive ? "Aktif" : "Nonaktif"
      }.`,
    };
  } catch (error) {
    console.error("Toggle material contract error:", error);
    return {
      success: false,
      message: "Kontrak material tidak ditemukan atau gagal diperbarui.",
    };
  }
}

export async function recordMaterialDelivery(
  formData: FormData,
): Promise<MaterialContractActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canRecordMaterialDeliveries(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak diizinkan mencatat penerimaan Surat Jalan material.",
    };
  }

  const rawPayload = {
    contractId: String(formData.get("contractId") ?? ""),
    projectId: String(formData.get("projectId") ?? ""),
    ticketId: String(formData.get("ticketId") ?? "") || null,
    deliveryDate: String(formData.get("deliveryDate") ?? ""),
    doNumber: String(formData.get("doNumber") ?? ""),
    vehiclePlate: String(formData.get("vehiclePlate") ?? "") || null,
    driverName: String(formData.get("driverName") ?? "") || null,
    quantityReceived: formData.get("quantityReceived"),
    notes: String(formData.get("notes") ?? "") || null,
  };

  const parsed = recordMaterialDeliverySchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Data Surat Jalan tidak valid.",
    };
  }

  const data = parsed.data;
  const deliveryDate = parseDateOnlyInput(data.deliveryDate);
  if (!deliveryDate) {
    return { success: false, message: "Tanggal pengiriman tidak valid." };
  }

  const proofCandidate = formData.get("proof");
  const proofFile =
    proofCandidate instanceof File && proofCandidate.size > 0
      ? proofCandidate
      : null;

  let uploadedProofUrl: string | null = null;
  if (proofFile) {
    try {
      uploadedProofUrl = await uploadDeliveryProofFile(proofFile);
    } catch (error) {
      console.error("Upload material delivery proof error:", error);
      if (
        error instanceof CloudinaryPhotoValidationError ||
        error instanceof CloudinaryConfigurationError ||
        error instanceof CloudinaryPrivatePdfValidationError
      ) {
        return { success: false, message: error.message };
      }
      return {
        success: false,
        message: "Gagal mengunggah foto bukti Surat Jalan.",
      };
    }
  }

  const normalizedDoNumber = data.doNumber.trim();
  const normalizedQty = roundMaterialNumber(data.quantityReceived, 2);

  try {
    const mongoose = await connectToMongoDB();
    const created = await mongoose.connection.transaction(async (mongoSession) => {
      const [contract, project] = await Promise.all([
        MaterialContract.findById(data.contractId)
          .session(mongoSession)
          .select({
            _id: 1,
            contractNumber: 1,
            unit: 1,
            isActive: 1,
          })
          .lean(),
        Project.findOne({ _id: data.projectId, isDeleted: { $ne: true } })
          .session(mongoSession)
          .select({ _id: 1 })
          .lean(),
      ]);

      if (!contract) {
        throw new Error("Kontrak material yang dipilih tidak ditemukan.");
      }
      if (!contract.isActive) {
        throw new Error(
          `Kontrak ${contract.contractNumber} sedang nonaktif dan tidak dapat menerima Surat Jalan baru.`,
        );
      }
      if (!project) {
        throw new Error("Proyek tujuan pengiriman tidak ditemukan.");
      }

      const duplicateDo = await MaterialDelivery.findOne({
        contractId: String(contract._id),
        doNumber: {
          $regex: new RegExp(`^${escapeRegExp(normalizedDoNumber)}$`, "i"),
        },
      })
        .session(mongoSession)
        .select({ _id: 1 })
        .lean();
      if (duplicateDo) {
        throw new Error(
          `Nomor Surat Jalan "${normalizedDoNumber}" sudah pernah dicatat pada kontrak ${contract.contractNumber}.`,
        );
      }

      if (!data.ticketId?.trim()) {
        throw new Error(
          "Surat Jalan Material Alam wajib ditautkan ke Tiket dari Tim Lapangan.",
        );
      }

      const [ticket, ticketItems] = await Promise.all([
        Ticket.findOne({
          _id: data.ticketId,
          isDeleted: { $ne: true },
        })
          .session(mongoSession)
          .select({
            _id: 1,
            ticketNumber: 1,
            title: 1,
            type: 1,
            projectId: 1,
            status: 1,
          })
          .lean(),
        TicketItem.find({ ticketId: data.ticketId })
          .session(mongoSession)
          .select({
            _id: 1,
            quantity: 1,
            status: 1,
            categoryHint: 1,
            materialContractId: 1,
          })
          .lean(),
      ]);
      if (!ticket) {
        throw new Error("Tiket yang dipilih tidak ditemukan atau telah dihapus.");
      }
      if (ticket.type !== TicketType.MATERIAL) {
        throw new Error(
          "Surat Jalan Material Alam hanya dapat ditautkan ke Tiket Material.",
        );
      }
      const blockedStatuses: TicketStatus[] = [
        TicketStatus.DRAFT,
        TicketStatus.PENDING_DIRECTOR,
        TicketStatus.REJECTED,
        TicketStatus.COMPLETED,
      ];
      if (blockedStatuses.includes(ticket.status as TicketStatus)) {
        throw new Error(
          `Tiket ${ticket.ticketNumber} belum aktif di antrean Logistik atau sudah selesai, sehingga tidak dapat dikaitkan dengan Surat Jalan.`,
        );
      }
      if (String(ticket.projectId ?? "") !== String(project._id)) {
        throw new Error(
          `Proyek Surat Jalan harus sama dengan proyek pada tiket ${ticket.ticketNumber}.`,
        );
      }
      const hasContractItem = ticketItems.some(
        (item) =>
          item.categoryHint === TicketCategoryHint.CONTRACT &&
          String(item.materialContractId ?? "") === String(contract._id),
      );
      if (!hasContractItem) {
        throw new Error(
          `Tiket ${ticket.ticketNumber} tidak memiliki item dari kontrak ${contract.contractNumber}.`,
        );
      }
      const linkedTicketId = String(ticket._id);

      const newDeliveryId = randomUUID();
      const now = new Date();
      await MaterialDelivery.create(
        [
          {
            _id: newDeliveryId,
            contractId: String(contract._id),
            projectId: String(project._id),
            ticketId: linkedTicketId,
            deliveryDate,
            doNumber: normalizedDoNumber,
            vehiclePlate: data.vehiclePlate?.trim().toUpperCase() || null,
            driverName: data.driverName?.trim() || null,
            quantityReceived: normalizedQty,
            billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
            vendorInvoiceId: null,
            receivedById: session.user.id,
            proofUrl: uploadedProofUrl,
            notes: data.notes?.trim() || null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        { session: mongoSession },
      );

      const synced = await syncContractTicketFulfillment(
        mongoSession,
        linkedTicketId,
        String(contract.contractNumber),
        session.user.id,
        normalizedDoNumber,
        "RECORDED",
      );

      const [financeUsers, logisticsUsers] = await Promise.all([
        User.find({
          isActive: true,
          role: { $in: FINANCE_DB_ROLES },
        })
          .select({ _id: 1 })
          .session(mongoSession)
          .lean(),
        User.find({
          isActive: true,
          role: { $in: LOGISTICS_DB_ROLES },
        })
          .select({ _id: 1 })
          .session(mongoSession)
          .lean(),
      ]);

      const notificationRows: Array<Record<string, unknown>> = [];
      const unitLabel = String(contract.unit ?? "");
      const deliverySummary = `${synced?.ticketNumber ?? ticket.ticketNumber} · ${synced?.title ?? ticket.title} — Surat Jalan ${normalizedDoNumber} (${normalizedQty} ${unitLabel}) pada kontrak ${contract.contractNumber}`;

      if (synced?.requesterId && synced.requesterId !== session.user.id) {
        notificationRows.push({
          _id: randomUUID(),
          userId: synced.requesterId,
          title: synced.isCompleted
            ? "Pengiriman Material Alam Selesai"
            : synced.isWaitingFinancePayment
              ? "Material Alam Tiba - Menunggu Pembayaran Keuangan"
              : "Surat Jalan Material Alam Dicatat",
          message: synced.isWaitingFinancePayment
            ? `${deliverySummary} telah tiba seluruhnya dan diteruskan untuk proses tagihan/pembayaran Keuangan.`
            : `${deliverySummary} telah dicatat.`,
          actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(linkedTicketId)}`,
          type: synced.isCompleted
            ? NotificationType.SUCCESS
            : NotificationType.INFO,
          isRead: false,
          createdAt: now,
        });
      }

      for (const financeUser of financeUsers) {
        const financeUserId = String(financeUser._id);
        if (financeUserId === session.user.id) continue;
        notificationRows.push({
          _id: randomUUID(),
          userId: financeUserId,
          title: "Surat Jalan Material Alam Siap Ditagihkan",
          message: `${deliverySummary} telah dicatat dan siap ditagihkan/dibayar.`,
          actionUrl: "/apps/finance?tab=vendor-contracts",
          type: NotificationType.INFO,
          isRead: false,
          createdAt: now,
        });
      }

      for (const logisticsUser of logisticsUsers) {
        const logisticsUserId = String(logisticsUser._id);
        if (
          logisticsUserId === session.user.id ||
          logisticsUserId === synced?.requesterId
        ) {
          continue;
        }
        notificationRows.push({
          _id: randomUUID(),
          userId: logisticsUserId,
          title: "Surat Jalan Material Alam Dicatat",
          message: `${deliverySummary} siap disusun ke tagihan vendor.`,
          actionUrl: "/apps/logistics?tab=bulk-contracts",
          type: NotificationType.INFO,
          isRead: false,
          createdAt: now,
        });
      }

      if (notificationRows.length > 0) {
        await Notification.insertMany(notificationRows, { session: mongoSession });
      }

      return { id: newDeliveryId, projectId: String(project._id) };
    });

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/finance");
    revalidatePath(`/apps/projects/${created.projectId}`);
    return {
      success: true,
      id: created.id,
      message: `Surat Jalan ${normalizedDoNumber} berhasil dicatat (UNBILLED).`,
    };
  } catch (error) {
    await removeDeliveryProofFile(uploadedProofUrl);
    console.error("Record material delivery error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal mencatat Surat Jalan pengiriman material.",
    };
  }
}

export async function deleteUnbilledMaterialDelivery(
  deliveryId: string,
): Promise<MaterialContractActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canRecordMaterialDeliveries(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin menghapus Surat Jalan.",
    };
  }

  try {
    const mongoose = await connectToMongoDB();
    const existing = await MaterialDelivery.findById(deliveryId)
      .select({
        _id: 1,
        contractId: 1,
        doNumber: 1,
        projectId: 1,
        ticketId: 1,
        billingStatus: 1,
        vendorInvoiceId: 1,
        receivedById: 1,
        proofUrl: 1,
      })
      .lean();
    if (!existing) {
      return { success: false, message: "Surat Jalan tidak ditemukan." };
    }
    if (
      existing.billingStatus !== MaterialDeliveryBillingStatus.UNBILLED ||
      existing.vendorInvoiceId !== null
    ) {
      return {
        success: false,
        message: "Surat Jalan yang sudah masuk tagihan vendor tidak dapat dihapus.",
      };
    }

    const isFieldSelfOnly =
      session.user.role === UserRole.FIELD_TEAM ||
      session.user.role === UserRole.MOVER;
    if (
      isFieldSelfOnly &&
      existing.receivedById &&
      existing.receivedById !== session.user.id
    ) {
      return {
        success: false,
        message: "Anda hanya dapat menghapus Surat Jalan yang Anda catat sendiri.",
      };
    }

    const contract = await MaterialContract.findById(existing.contractId)
      .select({ contractNumber: 1 })
      .lean();

    const deletedCount = await mongoose.connection.transaction(
      async (mongoSession) => {
        const deleted = await MaterialDelivery.deleteOne(
          {
            _id: existing._id,
            billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
            $or: [
              { vendorInvoiceId: null },
              { vendorInvoiceId: { $exists: false } },
            ],
          },
          { session: mongoSession },
        );
        if (deleted.deletedCount !== 1) {
          return 0;
        }

        if (existing.ticketId) {
          await syncContractTicketFulfillment(
            mongoSession,
            String(existing.ticketId),
            String(contract?.contractNumber ?? "-"),
            session.user.id,
            String(existing.doNumber ?? ""),
            "REMOVED",
          );
        }
        return 1;
      },
    );
    if (deletedCount !== 1) {
      return {
        success: false,
        message: "Surat Jalan baru saja ditagihkan atau sudah dihapus.",
      };
    }

    await removeDeliveryProofFile(existing.proofUrl);

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/finance");
    revalidatePath(`/apps/projects/${existing.projectId}`);
    return {
      success: true,
      message: `Surat Jalan ${existing.doNumber} berhasil dihapus.`,
    };
  } catch (error) {
    console.error("Delete material delivery error:", error);
    return {
      success: false,
      message: "Gagal menghapus Surat Jalan.",
    };
  }
}

export async function getUnbilledDeliveriesForContract(
  contractId: string,
): Promise<{
  success: boolean;
  message?: string;
  deliveries: MaterialDeliveryRow[];
}> {
  const session = await auth();
  if (!session?.user?.id || !canPrepareVendorInvoices(session.user.role)) {
    return {
      success: false,
      message: "Akses Logistik atau Keuangan diperlukan untuk memuat daftar Surat Jalan belum ditagih.",
      deliveries: [],
    };
  }

  try {
    await connectToMongoDB();
    const rows = await MaterialDelivery.find({
      contractId,
      billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
      vendorInvoiceId: null,
    })
      .sort({ deliveryDate: 1, createdAt: 1 })
      .lean();
    const contract = await MaterialContract.findById(contractId)
      .select({
        contractNumber: 1,
        vendorName: 1,
        materialType: 1,
        unitPrice: 1,
        unit: 1,
      })
      .lean();
    if (!contract) {
      return {
        success: false,
        message: "Kontrak material tidak ditemukan.",
        deliveries: [],
      };
    }
    const ticketIds = [
      ...new Set(
        rows
          .map((delivery) => delivery.ticketId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [projects, receivers, linkedTickets] = await Promise.all([
      rows.length
        ? Project.find({
            _id: { $in: [...new Set(rows.map((delivery) => delivery.projectId))] },
          })
            .select({ _id: 1, title: 1, kelompokTani: 1 })
            .lean()
        : Promise.resolve([]),
      rows.some((delivery) => delivery.receivedById)
        ? User.find({
            _id: {
              $in: [
                ...new Set(
                  rows
                    .map((delivery) => delivery.receivedById)
                    .filter((id): id is string => Boolean(id)),
                ),
              ],
            },
          })
            .select({ _id: 1, name: 1 })
            .lean()
        : Promise.resolve([]),
      ticketIds.length
        ? Ticket.find({ _id: { $in: ticketIds } })
            .select({ _id: 1, ticketNumber: 1 })
            .lean()
        : Promise.resolve([]),
    ]);
    const projectsById = new Map(
      projects.map((project) => [String(project._id), project]),
    );
    const receiversById = new Map(
      receivers.map((receiver) => [String(receiver._id), receiver]),
    );
    const ticketNumbersById = new Map(
      linkedTickets.map((ticket) => [
        String(ticket._id),
        String(ticket.ticketNumber ?? ""),
      ]),
    );

    return {
      success: true,
      deliveries: rows.map((delivery) => {
        const project = projectsById.get(delivery.projectId);
        const receiver = delivery.receivedById
          ? receiversById.get(delivery.receivedById)
          : null;
        return {
          id: String(delivery._id),
          contractId: delivery.contractId,
          contractNumber: contract.contractNumber,
          vendorName: contract.vendorName,
          materialType: contract.materialType,
          unitPrice: contract.unitPrice,
          unit: contract.unit,
          projectId: delivery.projectId,
          projectName: project
            ? `${project.kelompokTani} · ${project.title}`
            : "Proyek tidak ditemukan",
          ticketId: delivery.ticketId ?? null,
          ticketNumber: delivery.ticketId
            ? (ticketNumbersById.get(delivery.ticketId) ?? null)
            : null,
          deliveryDate: delivery.deliveryDate.toISOString().slice(0, 10),
          doNumber: delivery.doNumber,
          vehiclePlate: delivery.vehiclePlate ?? null,
          driverName: delivery.driverName ?? null,
          quantityReceived: roundMaterialNumber(delivery.quantityReceived, 2),
          estimatedAmount: calculateContractDeliverySubtotal(
            delivery.quantityReceived,
            contract.unitPrice,
          ),
          billingStatus: delivery.billingStatus,
          vendorInvoiceId: null,
          vendorInvoiceNumber: null,
          receivedById: delivery.receivedById ?? null,
          receivedByName: receiver?.name ?? null,
          proofUrl: delivery.proofUrl ?? null,
          notes: delivery.notes ?? null,
          createdAt: delivery.createdAt.toISOString(),
        };
      }),
    };
  } catch (error) {
    console.error("Query unbilled deliveries error:", error);
    return {
      success: false,
      message: "Gagal memuat daftar Surat Jalan belum ditagih.",
      deliveries: [],
    };
  }
}

export async function createVendorInvoiceFromDeliveries(
  input: CreateVendorInvoiceInput,
): Promise<MaterialContractActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canPrepareVendorInvoices(session.user.role)) {
    return {
      success: false,
      message: "Hanya Logistik, Keuangan, Administrasi, atau Direksi yang dapat menerbitkan tagihan vendor.",
    };
  }

  const parsed = createVendorInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Data tagihan vendor tidak valid.",
    };
  }

  const data = parsed.data;
  const uniqueDeliveryIds = Array.from(new Set(data.deliveryIds));
  if (uniqueDeliveryIds.length === 0) {
    return {
      success: false,
      message: "Pilih minimal satu Surat Jalan (DO) untuk ditagihkan.",
    };
  }

  const dueDate = data.dueDate ? parseDateOnlyInput(data.dueDate) : null;
  if (data.dueDate && !dueDate) {
    return { success: false, message: "Tanggal jatuh tempo tidak valid." };
  }

  try {
    const mongoose = await connectToMongoDB();
    const created = await mongoose.connection.transaction(async (mongoSession) => {
      const contract = await MaterialContract.findById(data.contractId)
        .session(mongoSession)
        .select({
          _id: 1,
          contractNumber: 1,
          vendorName: 1,
          materialType: 1,
          unitPrice: 1,
          unit: 1,
        })
        .lean();
      if (!contract) throw new Error("Kontrak payung tidak ditemukan.");

      const deliveries = await MaterialDelivery.find({
        _id: { $in: uniqueDeliveryIds },
        contractId: String(contract._id),
        billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
        vendorInvoiceId: null,
      })
        .session(mongoSession)
        .select({ _id: 1, projectId: 1, ticketId: 1, quantityReceived: 1 })
        .lean();
      if (deliveries.length !== uniqueDeliveryIds.length) {
        throw new Error(
          "Sebagian Surat Jalan tidak ditemukan atau sudah masuk ke tagihan vendor lain.",
        );
      }

      const totalQuantity = roundMaterialNumber(
        deliveries.reduce((sum, delivery) => sum + delivery.quantityReceived, 0),
        2,
      );
      const grandTotal = calculateContractDeliverySubtotal(
        deliveries.reduce((sum, delivery) => sum + delivery.quantityReceived, 0),
        contract.unitPrice,
      );
      let invoiceNumber = data.invoiceNumber?.trim().toUpperCase() || "";
      if (invoiceNumber) {
        if (await VendorInvoice.exists({ invoiceNumber }).session(mongoSession)) {
          throw new Error(`Nomor tagihan ${invoiceNumber} sudah digunakan.`);
        }
      } else {
        const year = new Date().getUTCFullYear();
        const sequence = await DocumentNumberSequence.findOneAndUpdate(
          { kind: "VENDOR_CONTRACT_INVOICE", year },
          {
            $inc: { value: 1 },
            $setOnInsert: { _id: randomUUID() },
          },
          { upsert: true, new: true, session: mongoSession },
        );
        if (!sequence) {
          throw new Error("Nomor tagihan vendor gagal dibuat.");
        }
        invoiceNumber = `INV-KTR-${year}-${String(sequence.value).padStart(4, "0")}`;
      }

      const invoiceId = randomUUID();
      await VendorInvoice.create(
        [
          {
            _id: invoiceId,
            invoiceNumber,
            contractId: String(contract._id),
            totalQuantity,
            unitPrice: contract.unitPrice,
            grandTotal,
            paidAmount: 0,
            dueDate,
            status: VendorInvoiceStatus.UNPAID,
            notes: data.notes?.trim() || null,
            processedById: session.user.id,
            createdAt: new Date(),
          },
        ],
        { session: mongoSession },
      );

      const updatedDeliveries = await MaterialDelivery.updateMany(
        {
          _id: { $in: uniqueDeliveryIds },
          contractId: String(contract._id),
          billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
          vendorInvoiceId: null,
        },
        {
          $set: {
            billingStatus: MaterialDeliveryBillingStatus.BILLED,
            vendorInvoiceId: invoiceId,
            updatedAt: new Date(),
          },
        },
        { session: mongoSession },
      );
      if (updatedDeliveries.modifiedCount !== uniqueDeliveryIds.length) {
        throw new Error(
          "Sebagian Surat Jalan baru saja ditagihkan pada proses lain. Silakan muat ulang daftar DO.",
        );
      }

      const now = new Date();
      const financeUsers = await User.find({
        isActive: true,
        role: { $in: FINANCE_DB_ROLES },
      })
        .select({ _id: 1 })
        .session(mongoSession)
        .lean();
      const financeNotifications = financeUsers
        .map((user) => String(user._id))
        .filter((financeUserId) => financeUserId !== session.user.id)
        .map((financeUserId) => ({
          _id: randomUUID(),
          userId: financeUserId,
          title: "Tagihan Kontrak Material Alam Siap Dibayar",
          message: `Tagihan ${invoiceNumber} (${uniqueDeliveryIds.length} Surat Jalan · ${totalQuantity} ${contract.unit} · Rp${Math.round(grandTotal).toLocaleString("id-ID")}) untuk ${contract.vendorName} (${contract.contractNumber}) menunggu pembayaran Keuangan.`,
          type: NotificationType.APPROVAL,
          actionUrl: `/apps/finance?tab=vendor-contracts&openInvoice=${encodeURIComponent(invoiceId)}`,
          isRead: false,
          createdAt: now,
        }));
      if (financeNotifications.length > 0) {
        await Notification.insertMany(financeNotifications, {
          session: mongoSession,
        });
      }

      return {
        invoiceId,
        invoiceNumber,
        projectIds: Array.from(new Set(deliveries.map((delivery) => delivery.projectId))),
        contract,
        totalQuantity,
        grandTotal,
      };
    });

    revalidatePath("/apps/finance");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    for (const projectId of created.projectIds) {
      revalidatePath(`/apps/projects/${projectId}`);
    }

    return {
      success: true,
      id: created.invoiceId,
      message: `Tagihan ${created.invoiceNumber} (${uniqueDeliveryIds.length} DO, ${created.totalQuantity} ${created.contract.unit} · Rp${Math.round(created.grandTotal).toLocaleString("id-ID")}) berhasil diterbitkan.`,
    };
  } catch (error) {
    console.error("Create vendor invoice error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal menerbitkan tagihan kontrak vendor.",
    };
  }
}

export async function payVendorInvoice(input: {
  vendorInvoiceId: string;
  proof: string | File;
  transferDestination: string;
  paymentType: PaymentType;
  amount: number;
  financeAccountId: string;
  paymentMethod?: POPaymentMethod;
  notes?: string | null;
}): Promise<MaterialContractActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canBillAndPayVendorContracts(session.user.role)) {
    return {
      success: false,
      message: "Hanya Keuangan, Administrasi, atau Direksi yang dapat memproses pembayaran.",
    };
  }

  const vendorInvoiceId = input.vendorInvoiceId?.trim();
  const financeAccountId = input.financeAccountId?.trim();
  const paymentMethod = input.paymentMethod ?? POPaymentMethod.TRANSFER;
  const paymentType = input.paymentType;
  const transferDestination = input.transferDestination?.trim() ?? "";

  if (!vendorInvoiceId || !financeAccountId) {
    return {
      success: false,
      message: "Tagihan dan rekening sumber pembayaran wajib dipilih.",
    };
  }
  if (
    paymentMethod === POPaymentMethod.TRANSFER &&
    !transferDestination
  ) {
    return {
      success: false,
      message: "Rekening tujuan transfer vendor wajib diisi.",
    };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      success: false,
      message: "Nominal pembayaran harus lebih dari 0.",
    };
  }

  let uploadedProofUrl: string;
  let createdProofInUpload = false;
  if (input.proof instanceof File) {
    try {
      uploadedProofUrl = await uploadCashflowProof(input.proof);
      createdProofInUpload = true;
    } catch (error) {
      console.error("Vendor invoice proof upload failed:", error);
      if (
        error instanceof CloudinaryPhotoValidationError ||
        error instanceof CloudinaryConfigurationError ||
        error instanceof CloudinaryPrivatePdfValidationError
      ) {
        return { success: false, message: error.message };
      }
      return {
        success: false,
        message: "Gagal mengunggah bukti pembayaran tagihan vendor.",
      };
    }
  } else if (typeof input.proof === "string" && input.proof.trim()) {
    uploadedProofUrl = input.proof.trim();
  } else {
    return {
      success: false,
      message: "Bukti transfer / pembayaran wajib dilampirkan.",
    };
  }

  try {
    const mongoose = await connectToMongoDB();
    const result = await mongoose.connection.transaction(async (mongoSession) => {
      const invoice = await VendorInvoice.findById(vendorInvoiceId)
        .session(mongoSession)
        .lean();
      if (!invoice) throw new Error("Tagihan vendor tidak ditemukan.");
      if (invoice.status === VendorInvoiceStatus.PAID) {
        throw new Error("Tagihan ini sudah dibayar lunas.");
      }

      const contract = await MaterialContract.findById(invoice.contractId)
        .session(mongoSession)
        .lean();
      if (!contract) throw new Error("Kontrak tagihan vendor tidak ditemukan.");

      const grandTotal = roundMaterialNumber(invoice.grandTotal);
      const currentPaid = roundMaterialNumber(invoice.paidAmount);
      const remaining = roundMaterialNumber(grandTotal - currentPaid);
      const paymentAmount = roundMaterialNumber(input.amount);
      if (remaining <= 0) throw new Error("Sisa tagihan sudah lunas.");
      if (paymentType === PaymentType.DOWN_PAYMENT && currentPaid > 0) {
        throw new Error("DP hanya dapat digunakan pada pembayaran pertama.");
      }
      if (paymentAmount <= 0 || paymentAmount > remaining) {
        throw new Error("Nominal pembayaran tidak boleh melebihi sisa tagihan.");
      }
      if (
        paymentType === PaymentType.FULL_PAYMENT &&
        paymentAmount !== remaining
      ) {
        throw new Error("Nominal pelunasan harus sama dengan sisa tagihan.");
      }
      if (
        paymentType !== PaymentType.FULL_PAYMENT &&
        paymentAmount >= remaining
      ) {
        throw new Error(
          "Nominal DP atau termin harus lebih kecil dari sisa tagihan. Gunakan Pelunasan jika langsung lunas.",
        );
      }

      const newPaidAmount = roundMaterialNumber(currentPaid + paymentAmount);
      const isSettled = newPaidAmount >= grandTotal;
      const newStatus = isSettled
        ? VendorInvoiceStatus.PAID
        : VendorInvoiceStatus.PARTIAL;
      const now = new Date();
      const invoiceDeliveries = await MaterialDelivery.find({
        vendorInvoiceId,
      })
        .session(mongoSession)
        .select({ projectId: 1, ticketId: 1, doNumber: 1 })
        .lean();
      const projectIds = Array.from(
        new Set(invoiceDeliveries.map((delivery) => delivery.projectId)),
      );
      const paymentTypeLabel =
        paymentType === PaymentType.DOWN_PAYMENT
          ? "DP"
          : paymentType === PaymentType.PROGRESS_PAYMENT
            ? "Termin"
            : "Pelunasan";
      const resolvedDestination =
        paymentMethod === POPaymentMethod.CASH && !transferDestination
          ? "Pembayaran tunai kas kantor"
          : transferDestination;

      const account = await FinanceAccount.findOneAndUpdate(
        {
          _id: financeAccountId,
          balance: { $gte: paymentAmount },
        },
        { $inc: { balance: -paymentAmount } },
        { new: true, session: mongoSession },
      ).select({ _id: 1 });
      if (!account) {
        const accountExists = await FinanceAccount.exists({
          _id: financeAccountId,
        }).session(mongoSession);
        throw new Error(
          accountExists
            ? "Saldo buku bank/kas tidak mencukupi. Catat saldo awal atau pilih akun lain."
            : "Buku bank/kas sumber pembayaran tidak ditemukan.",
        );
      }

      const cashflowId = randomUUID();
      await Cashflow.create(
        [
          {
            _id: cashflowId,
            type: "OUT",
            amount: paymentAmount,
            sourceDesc: `${paymentTypeLabel} Tagihan Kontrak ${contract.materialType} · ${invoice.invoiceNumber} (${contract.vendorName})`,
            projectId: projectIds.length === 1 ? projectIds[0] : null,
            paymentMethod,
            proofUrl: uploadedProofUrl,
            accountId: financeAccountId,
            recordedBy: session.user.id,
            createdAt: now,
          },
        ],
        { session: mongoSession },
      );
      await VendorInvoicePayment.create(
        [
          {
            _id: randomUUID(),
            vendorInvoiceId,
            paymentType,
            paymentMethod,
            amount: paymentAmount,
            transferDestination: resolvedDestination,
            proofOfTransferUrl: uploadedProofUrl,
            financeAccountId,
            cashflowId,
            notes: input.notes?.trim() || null,
            processedById: session.user.id,
            paidAt: now,
            createdAt: now,
          },
        ],
        { session: mongoSession },
      );

      const updatedInvoice = await VendorInvoice.updateOne(
        {
          _id: vendorInvoiceId,
          paidAmount: invoice.paidAmount,
          status: { $ne: VendorInvoiceStatus.PAID },
        },
        {
          $set: {
            paidAmount: newPaidAmount,
            status: newStatus,
            paidAt: isSettled ? now : invoice.paidAt,
            updatedAt: now,
          },
        },
        { session: mongoSession },
      );
      if (updatedInvoice.modifiedCount !== 1) {
        throw new Error(
          "Status tagihan berubah saat transaksi diproses. Silakan coba lagi.",
        );
      }

      const deliveryDosByTicketId = new Map<string, string[]>();
      for (const delivery of invoiceDeliveries) {
        if (!delivery.ticketId) continue;
        const ticketIdKey = String(delivery.ticketId);
        const list = deliveryDosByTicketId.get(ticketIdKey) ?? [];
        if (delivery.doNumber) list.push(String(delivery.doNumber));
        deliveryDosByTicketId.set(ticketIdKey, list);
      }

      const notificationRows: Array<Record<string, unknown>> = [];
      const syncedRequesterIds = new Map<
        string,
        {
          ticketId: string;
          requesterId: string;
          ticketNumber: string;
          title: string;
          isCompleted: boolean;
        }
      >();

      if (isSettled) {
        for (const [linkedTicketId, doNumbers] of deliveryDosByTicketId) {
          const synced = await syncContractTicketFulfillment(
            mongoSession,
            linkedTicketId,
            String(contract.contractNumber),
            session.user.id,
            `${invoice.invoiceNumber} (${doNumbers.join(", ") || "-"})`,
            "PAID",
          );
          if (synced && synced.requesterId && synced.requesterId !== session.user.id) {
            syncedRequesterIds.set(linkedTicketId, {
              ticketId: linkedTicketId,
              requesterId: synced.requesterId,
              ticketNumber: synced.ticketNumber,
              title: synced.title,
              isCompleted: synced.isCompleted,
            });
          }
        }
      }

      const logisticsUsers = await User.find({
        isActive: true,
        role: { $in: LOGISTICS_DB_ROLES },
      })
        .select({ _id: 1 })
        .session(mongoSession)
        .lean();

      const logisticsRecipientIds = new Set<string>(
        logisticsUsers.map((user) => String(user._id)),
      );
      if (contract.createdById) {
        logisticsRecipientIds.add(String(contract.createdById));
      }
      if (invoice.processedById) {
        logisticsRecipientIds.add(String(invoice.processedById));
      }

      for (const {
        ticketId: linkedTicketId,
        requesterId,
        ticketNumber,
        title,
        isCompleted,
      } of syncedRequesterIds.values()) {
        notificationRows.push({
          _id: randomUUID(),
          userId: requesterId,
          title: isCompleted
            ? "Tiket Material Alam Selesai & Lunas"
            : `Tagihan Material Alam ${invoice.invoiceNumber} Lunas`,
          message: isCompleted
            ? `${ticketNumber} · ${title} — seluruh tagihan Material Alam (${invoice.invoiceNumber}) telah dibayar lunas oleh Keuangan.`
            : `${ticketNumber} · ${title} — tagihan ${invoice.invoiceNumber} telah dibayar lunas oleh Keuangan; menunggu pemenuhan item/tagihan tersisa.`,
          type: NotificationType.SUCCESS,
          actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(linkedTicketId)}`,
          isRead: false,
          createdAt: now,
        });
      }

      const notifiedRequesters = new Set(
        notificationRows.map((row) => String(row.userId)),
      );
      for (const recipientId of logisticsRecipientIds) {
        if (
          !recipientId ||
          recipientId === session.user.id ||
          notifiedRequesters.has(recipientId)
        ) {
          continue;
        }
        notificationRows.push({
          _id: randomUUID(),
          userId: recipientId,
          title: isSettled
            ? `Tagihan Kontrak ${invoice.invoiceNumber} Lunas`
            : `Pembayaran ${paymentTypeLabel} Kontrak ${invoice.invoiceNumber}`,
          message: `Keuangan telah memproses ${paymentTypeLabel.toLowerCase()} sebesar Rp${Math.round(paymentAmount).toLocaleString("id-ID")} untuk ${contract.vendorName} (${contract.contractNumber}).`,
          type: isSettled ? NotificationType.SUCCESS : NotificationType.INFO,
          actionUrl: "/apps/logistics?tab=bulk-contracts",
          isRead: false,
          createdAt: now,
        });
      }

      const validNotifications = notificationRows.filter(
        (row) => typeof row.userId === "string" && row.userId.length > 0,
      );
      if (validNotifications.length > 0) {
        await Notification.insertMany(validNotifications, {
          session: mongoSession,
        });
      }

      return {
        invoiceNumber: invoice.invoiceNumber,
        isSettled,
        paymentAmount,
        projectIds,
      };
    });

    revalidatePath("/apps/finance");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/projects");
    for (const projectId of result.projectIds) {
      revalidatePath(`/apps/projects/${projectId}`);
    }

    return {
      success: true,
      message: result.isSettled
        ? `Tagihan ${result.invoiceNumber} berhasil dibayar lunas.`
        : `Pembayaran sebagian (${result.invoiceNumber}) sebesar Rp${Math.round(result.paymentAmount).toLocaleString("id-ID")} berhasil dicatat.`,
    };
  } catch (error) {
    if (createdProofInUpload) {
      await removeUploadedCashflowProof(uploadedProofUrl);
    }
    console.error("Pay vendor invoice error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal memproses pembayaran tagihan vendor.",
    };
  }
}

function isLegacySharedProofUrl(url: string): boolean {
  return /\/file\.(?:jpe?g|png|webp|pdf)(?:[?#]|$)/i.test(url);
}

async function isProofUrlReferencedInDb(url: string): Promise<boolean> {
  const [
    cashflowRef,
    officeExpenseRef,
    paymentTxRef,
    vendorPaymentRef,
    rentalRef,
    ticketRef,
    poRef,
    directPurchaseRef,
    deliveryRef,
    fuelRef,
    invoiceRef,
    confirmationRef,
    termynRef,
    deliveryOrderRef,
  ] = await Promise.all([
    Cashflow.exists({ proofUrl: url }),
    OfficeExpense.exists({ proofUrls: url }),
    PaymentTransaction.exists({
      $or: [{ proofOfTransferUrl: url }, { additionalProofUrls: url }],
    }),
    VendorInvoicePayment.exists({ proofOfTransferUrl: url }),
    EquipmentRental.exists({ proofOfPaymentUrl: url }),
    Ticket.exists({
      $or: [
        { paymentProofUrl: url },
        { purchaseReceiptUrl: url },
        { transferReceiptUrl: url },
        { deliveryReceiptUrl: url },
        { deliveryOrderReceiptUrl: url },
        { receiptUrls: url },
      ],
    }),
    PurchaseOrder.exists({
      $or: [{ paymentReceiptUrl: url }, { vendorInvoiceUrl: url }],
    }),
    DirectStockPurchase.exists({ vendorInvoiceUrl: url }),
    MaterialDelivery.exists({ proofUrl: url }),
    VehicleFuelRequest.exists({
      $or: [
        { transferProofUrl: url },
        { beforeFillingPhotoUrl: url },
        { afterFillingPhotoUrl: url },
        { receiptPhotoUrl: url },
      ],
    }),
    Invoice.exists({ documentUrl: url }),
    OrderConfirmation.exists({ proofOfTransferUrl: url }),
    SubkonTermyn.exists({ paymentProofUrl: url }),
    DeliveryOrder.exists({
      $or: [{ deliveryReceiptUrl: url }, { arrivalPhotoUrl: url }],
    }),
  ]);

  return Boolean(
    cashflowRef ||
      officeExpenseRef ||
      paymentTxRef ||
      vendorPaymentRef ||
      rentalRef ||
      ticketRef ||
      poRef ||
      directPurchaseRef ||
      deliveryRef ||
      fuelRef ||
      invoiceRef ||
      confirmationRef ||
      termynRef ||
      deliveryOrderRef,
  );
}

export async function replaceVendorInvoicePaymentProof(
  formData: FormData,
): Promise<{ success: boolean; message: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }
  if (!canBillAndPayVendorContracts(session.user.role)) {
    return {
      success: false,
      message:
        "Hanya Keuangan, Administrasi, atau Direksi yang dapat mengganti bukti pembayaran.",
    };
  }

  if (!(formData instanceof FormData)) {
    return { success: false, message: "Data unggahan tidak valid." };
  }

  const rawInvoiceId = formData.get("invoiceId");
  const rawPaymentId = formData.get("paymentId");
  const rawProof = formData.get("proof");

  const invoiceId =
    typeof rawInvoiceId === "string" ? rawInvoiceId.trim() : "";
  const paymentId =
    typeof rawPaymentId === "string" ? rawPaymentId.trim() : "";

  if (
    !invoiceId ||
    invoiceId.length > 191 ||
    !paymentId ||
    paymentId.length > 191
  ) {
    return {
      success: false,
      message: "Referensi tagihan dan pembayaran vendor tidak valid.",
    };
  }

  if (
    !(rawProof instanceof File) ||
    rawProof.size < 1 ||
    rawProof.size > 5 * 1024 * 1024
  ) {
    return {
      success: false,
      message: "Pilih file bukti (PDF/JPG/PNG/WEBP) maksimal 5 MB.",
    };
  }

  const normalizedFile = normalizeFinancePaymentProofFile(rawProof);
  if (!normalizedFile) {
    return {
      success: false,
      message: "Format file bukti harus PDF, JPG, PNG, atau WEBP.",
    };
  }

  let uploadedProofUrl: string | null = null;
  try {
    const mongoose = await connectToMongoDB();

    const [existingInvoice, existingPayment] = await Promise.all([
      VendorInvoice.findById(invoiceId).select({ _id: 1 }).lean(),
      VendorInvoicePayment.findOne({
        _id: paymentId,
        vendorInvoiceId: invoiceId,
      })
        .select({ _id: 1 })
        .lean(),
    ]);
    if (!existingInvoice || !existingPayment) {
      return {
        success: false,
        message: "Data pembayaran tagihan vendor tidak ditemukan.",
      };
    }

    uploadedProofUrl = await uploadCashflowProof(normalizedFile);
    if (!isFinanceCashflowProofUrl(uploadedProofUrl)) {
      throw new Error("URL bukti pembayaran yang diunggah tidak valid.");
    }
    const nextProofUrl = uploadedProofUrl;

    const result = await mongoose.connection.transaction(
      async (mongoSession) => {
        const [invoice, payment] = await Promise.all([
          VendorInvoice.findById(invoiceId)
            .session(mongoSession)
            .select({ _id: 1 })
            .lean(),
          VendorInvoicePayment.findOne({
            _id: paymentId,
            vendorInvoiceId: invoiceId,
          })
            .session(mongoSession)
            .select({ _id: 1, proofOfTransferUrl: 1, cashflowId: 1 })
            .lean(),
        ]);
        if (!invoice || !payment) {
          throw new Error("Data pembayaran tagihan vendor tidak ditemukan.");
        }

        const oldProofUrl =
          typeof payment.proofOfTransferUrl === "string" &&
          payment.proofOfTransferUrl.trim()
            ? payment.proofOfTransferUrl.trim()
            : null;
        const cashflowId =
          typeof payment.cashflowId === "string" && payment.cashflowId.trim()
            ? payment.cashflowId.trim()
            : null;

        const updatedPayment = await VendorInvoicePayment.updateOne(
          { _id: paymentId, vendorInvoiceId: invoiceId },
          { $set: { proofOfTransferUrl: nextProofUrl } },
          { session: mongoSession },
        );
        if (updatedPayment.matchedCount !== 1) {
          throw new Error("Gagal memperbarui bukti pembayaran tagihan vendor.");
        }

        if (cashflowId) {
          await Cashflow.updateOne(
            { _id: cashflowId },
            { $set: { proofUrl: nextProofUrl } },
            { session: mongoSession },
          );
        }

        const deliveries = await MaterialDelivery.find({
          vendorInvoiceId: invoiceId,
        })
          .session(mongoSession)
          .select({ projectId: 1 })
          .lean();
        const projectIds = Array.from(
          new Set(
            deliveries
              .map((delivery) => delivery.projectId)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        return { oldProofUrl, projectIds };
      },
    );

    if (
      result.oldProofUrl &&
      result.oldProofUrl !== nextProofUrl &&
      !isLegacySharedProofUrl(result.oldProofUrl)
    ) {
      const stillReferenced = await isProofUrlReferencedInDb(
        result.oldProofUrl,
      ).catch(() => true);
      if (!stillReferenced) {
        await removeUploadedCashflowProof(result.oldProofUrl).catch(
          () => undefined,
        );
      }
    }

    revalidatePath("/apps/finance");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/projects");
    for (const projectId of result.projectIds) {
      revalidatePath(`/apps/projects/${projectId}`);
    }

    return {
      success: true,
      message: "Bukti pembayaran tagihan vendor berhasil diperbarui.",
    };
  } catch (error) {
    if (uploadedProofUrl) {
      await removeUploadedCashflowProof(uploadedProofUrl).catch(
        () => undefined,
      );
    }
    console.error("Replace vendor invoice payment proof error:", error);
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryConfigurationError ||
      error instanceof CloudinaryPrivatePdfValidationError
    ) {
      return { success: false, message: error.message };
    }
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui bukti pembayaran tagihan vendor.",
    };
  }
}
