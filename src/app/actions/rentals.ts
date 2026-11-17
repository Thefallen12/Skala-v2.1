"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NotificationType, UserRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "../../../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import Cashflow from "@/models/cashflow";
import FinanceAccount from "@/models/finance-account";
import { EquipmentRental } from "@/models/finance-records";
import Notification from "@/models/notification";
import PaymentTransaction from "@/models/payment-transaction";
import Project from "@/models/project";
import User from "@/models/user";
import { isFinanceCashflowProofUrl } from "@/lib/finance-cashflow";
import { isFinancePaymentProofUrl } from "@/lib/finance-payment-proofs";
import {
  decimalNumberFromScaledInteger,
  decimalStringFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import {
  removeUploadedCashflowProof,
  uploadCashflowProof,
} from "./finance-cashflow";

const allowedRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.LOGISTICS,
  UserRole.KOORDINATOR,
  UserRole.FINANCE,
  UserRole.FIELD_TEAM,
];

const financeRoles: UserRole[] = [
  UserRole.FINANCE,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
];

const deleteRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.LOGISTICS,
];

export type RentalPeriodType = "DAILY" | "WEEKLY" | "MONTHLY";
export type RentalType = "EQUIPMENT" | "VEHICLE" | "HOUSE";
export type RentalUsageScope = "PROJECT" | "OPERATIONAL";
export type RentalStatus = "ACTIVE" | "COMPLETED" | "EXTENDED" | "CANCELLED";
export type RentalPaymentStatus = "UNPAID" | "PENDING_PAYMENT" | "PAID";

export type RentalItemRow = {
  id: string;
  type: RentalType;
  usageScope?: RentalUsageScope | null;
  name: string;
  category: string | null;
  codeOrPlate: string | null;
  vendorName: string;
  vendorPhone: string | null;
  propertyAddress?: string | null;
  landlordName?: string | null;
  landlordPhone?: string | null;
  occupantCount?: number | null;
  rentalPeriodType: RentalPeriodType;
  startDate: string;
  endDate: string;
  duration: number;
  ratePerPeriod: string;
  additionalCost: string;
  totalCost: string;
  status: RentalStatus;
  withOperator: boolean;
  operatorName: string | null;
  withFuel: boolean;
  projectId: string | null;
  projectName: string | null;
  sourceTicketId?: string | null;
  cashflowId?: string | null;
  paymentTransactionId?: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;

  // Finance & Billing
  paymentStatus: RentalPaymentStatus;
  billingSubmittedAt: string | null;
  billingSubmittedByName: string | null;
  paidAt: string | null;
  paidByName: string | null;
  proofOfPaymentUrl: string | null;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  financeNotes: string | null;
};

const optionalPositiveInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}, z.number().int().min(1, "Jumlah penghuni minimal 1 orang.").nullable().optional());

const rentalInputSchema = z.object({
  id: z.string().trim().optional(),
  type: z.enum(["EQUIPMENT", "VEHICLE", "HOUSE"]),
  usageScope: z.enum(["PROJECT", "OPERATIONAL"]).optional().default("PROJECT"),
  name: z
    .string()
    .trim()
    .min(1, "Nama aset / rumah sewa / kendaraan wajib diisi."),
  category: z.string().trim().optional().nullable(),
  codeOrPlate: z.string().trim().optional().nullable(),
  vendorName: z.string().trim().optional().default(""),
  vendorPhone: z.string().trim().optional().nullable(),
  propertyAddress: z.string().trim().optional().nullable(),
  landlordName: z.string().trim().optional().nullable(),
  landlordPhone: z.string().trim().optional().nullable(),
  occupantCount: optionalPositiveInt,
  rentalPeriodType: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  startDate: z.string().min(10, "Tanggal mulai sewa wajib diisi."),
  endDate: z.string().min(10, "Tanggal selesai sewa wajib diisi."),
  duration: z.coerce.number().positive("Durasi harus lebih dari 0."),
  ratePerPeriod: z.coerce.number().min(0, "Biaya sewa tidak boleh negatif."),
  additionalCost: z.coerce.number().min(0).default(0),
  totalCost: z.coerce.number().min(0),
  status: z
    .enum(["ACTIVE", "COMPLETED", "EXTENDED", "CANCELLED"])
    .default("ACTIVE"),
  withOperator: z.boolean().default(false),
  operatorName: z.string().trim().optional().nullable(),
  withFuel: z.boolean().default(false),
  projectId: z.string().trim().optional().nullable(),
  sourceTicketId: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  paymentBankName: z.string().trim().optional().nullable(),
  paymentAccountNumber: z.string().trim().optional().nullable(),
  paymentAccountName: z.string().trim().optional().nullable(),
});

export type RentalInput = z.input<typeof rentalInputSchema>;

export type RentalPaymentInput = {
  rentalId: string;
  proof?: File | null;
  proofOfPaymentUrl?: string | null;
  paymentBankName?: string;
  paymentAccountNumber?: string;
  paymentAccountName?: string;
  financeNotes?: string;
  financeAccountId?: string;
};

export type RentalActionResult = {
  success: boolean;
  message: string;
  id?: string;
};

function cleanOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toScaledBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return BigInt(0);
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return BigInt(0);
    try {
      return BigInt(trimmed);
    } catch {
      return BigInt(0);
    }
  }
  if (value && typeof value === "object" && "toString" in value) {
    try {
      return BigInt(String(value));
    } catch {
      return BigInt(0);
    }
  }
  return BigInt(0);
}

function formatDateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function formatIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function getRentalTypeLabel(type: string | null | undefined): string {
  if (type === "HOUSE") return "Rumah Sewa Tukang";
  if (type === "VEHICLE") return "Kendaraan Sewa";
  return "Alat Sewa";
}

function getRentalExpenseType(
  type: string | null | undefined,
): "HOUSE_RENTAL" | "VEHICLE_RENTAL" | "EQUIPMENT_RENTAL" {
  if (type === "HOUSE") return "HOUSE_RENTAL";
  if (type === "VEHICLE") return "VEHICLE_RENTAL";
  return "EQUIPMENT_RENTAL";
}

function isAcceptedProofUrl(url: string): boolean {
  if (isFinanceCashflowProofUrl(url) || isFinancePaymentProofUrl(url)) {
    return true;
  }
  if (url.startsWith("/uploads/") || url.startsWith("/api/")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function findActiveProject(projectId: string) {
  return Project.findOne({
    _id: projectId,
    isDeleted: { $ne: true },
    status: { $nin: ["CANCELLED", "BATAL", "DELETED"] },
  })
    .select({ _id: 1, title: 1, kelompokTani: 1, status: 1 })
    .lean();
}

function revalidateRentalPaths() {
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/finance/cashflow");
  revalidatePath("/apps/projects");
  revalidatePath("/");
}

export async function getRentals(filters?: {
  type?: RentalType;
  usageScope?: RentalUsageScope;
  status?: RentalStatus;
  paymentStatus?: RentalPaymentStatus;
  projectId?: string;
}): Promise<RentalItemRow[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  await connectToMongoDB();

  const query: Record<string, unknown> = {};
  if (filters?.type) query.type = filters.type;
  if (filters?.usageScope) query.usageScope = filters.usageScope;
  if (filters?.status) query.status = filters.status;
  if (filters?.paymentStatus) query.paymentStatus = filters.paymentStatus;
  if (filters?.projectId) query.projectId = filters.projectId;

  const rentals = await EquipmentRental.find(query)
    .sort({ startDate: -1, createdAt: -1 })
    .lean();

  const projectIds = [
    ...new Set(
      rentals
        .map((rental) => cleanOptionalText(rental.projectId))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds } })
        .select({ _id: 1, title: 1, kelompokTani: 1 })
        .lean()
    : [];

  const projectMap = new Map<
    string,
    { _id: string; title?: string | null; kelompokTani?: string | null }
  >();
  for (const project of projects) {
    projectMap.set(String(project._id), {
      _id: String(project._id),
      title: project.title ?? null,
      kelompokTani: project.kelompokTani ?? null,
    });
  }

  return rentals.map((r) => {
    const rentalType: RentalType =
      r.type === "HOUSE"
        ? "HOUSE"
        : r.type === "VEHICLE"
          ? "VEHICLE"
          : "EQUIPMENT";
    const projectId = cleanOptionalText(r.projectId);
    const project = projectId ? projectMap.get(projectId) : undefined;
    const usageScope: RentalUsageScope =
      rentalType === "HOUSE"
        ? "PROJECT"
        : r.usageScope === "OPERATIONAL" && !projectId
          ? "OPERATIONAL"
          : r.usageScope === "OPERATIONAL"
            ? "OPERATIONAL"
            : "PROJECT";

    return {
      id: String(r._id),
      type: rentalType,
      usageScope,
      name: String(r.name ?? ""),
      category: cleanOptionalText(r.category),
      codeOrPlate: cleanOptionalText(r.codeOrPlate),
      vendorName: String(r.vendorName ?? r.landlordName ?? ""),
      vendorPhone: cleanOptionalText(r.vendorPhone ?? r.landlordPhone),
      propertyAddress: cleanOptionalText(r.propertyAddress),
      landlordName: cleanOptionalText(r.landlordName),
      landlordPhone: cleanOptionalText(r.landlordPhone),
      occupantCount:
        typeof r.occupantCount === "number" && Number.isFinite(r.occupantCount)
          ? r.occupantCount
          : null,
      rentalPeriodType:
        r.rentalPeriodType === "WEEKLY" || r.rentalPeriodType === "MONTHLY"
          ? r.rentalPeriodType
          : "DAILY",
      startDate: formatDateOnly(r.startDate),
      endDate: formatDateOnly(r.endDate),
      duration:
        typeof r.duration === "number" && Number.isFinite(r.duration)
          ? r.duration
          : 1,
      ratePerPeriod: decimalStringFromScaledInteger(
        toScaledBigInt(r.ratePerPeriod),
      ),
      additionalCost: decimalStringFromScaledInteger(
        toScaledBigInt(r.additionalCost),
      ),
      totalCost: decimalStringFromScaledInteger(toScaledBigInt(r.totalCost)),
      status:
        r.status === "COMPLETED" ||
        r.status === "EXTENDED" ||
        r.status === "CANCELLED"
          ? r.status
          : "ACTIVE",
      withOperator: rentalType === "HOUSE" ? false : Boolean(r.withOperator),
      operatorName:
        rentalType === "HOUSE" ? null : cleanOptionalText(r.operatorName),
      withFuel: rentalType === "HOUSE" ? false : Boolean(r.withFuel),
      projectId,
      projectName: project
        ? `${project.kelompokTani || "Proyek"} · ${project.title || "-"}`
        : null,
      sourceTicketId: cleanOptionalText(r.sourceTicketId),
      cashflowId: cleanOptionalText(r.cashflowId),
      paymentTransactionId: cleanOptionalText(r.paymentTransactionId),
      notes: cleanOptionalText(r.notes),
      createdByName: cleanOptionalText(r.createdByName),
      createdAt: formatIsoTimestamp(r.createdAt) ?? new Date().toISOString(),

      // Finance & Billing
      paymentStatus:
        r.paymentStatus === "PENDING_PAYMENT" || r.paymentStatus === "PAID"
          ? r.paymentStatus
          : "UNPAID",
      billingSubmittedAt: formatIsoTimestamp(r.billingSubmittedAt),
      billingSubmittedByName: cleanOptionalText(r.billingSubmittedByName),
      paidAt: formatIsoTimestamp(r.paidAt),
      paidByName: cleanOptionalText(r.paidByName),
      proofOfPaymentUrl: cleanOptionalText(r.proofOfPaymentUrl),
      paymentBankName: cleanOptionalText(r.paymentBankName),
      paymentAccountNumber: cleanOptionalText(r.paymentAccountNumber),
      paymentAccountName: cleanOptionalText(r.paymentAccountName),
      financeNotes: cleanOptionalText(r.financeNotes),
    };
  });
}

export async function saveRental(
  rawInput: unknown,
): Promise<RentalActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }

  if (!allowedRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin untuk mengelola data sewa.",
    };
  }

  const parsed = rentalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Data sewa tidak valid.";
    return { success: false, message: firstIssue };
  }

  const data = parsed.data;

  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { success: false, message: "Format tanggal tidak valid." };
  }

  if (end < start) {
    return {
      success: false,
      message:
        "Tanggal selesai sewa tidak boleh mendahului tanggal mulai sewa.",
    };
  }

  const effectiveLandlordName = cleanOptionalText(data.landlordName);
  const effectiveVendorName =
    cleanOptionalText(data.vendorName) || effectiveLandlordName;
  if (!effectiveVendorName) {
    return {
      success: false,
      message:
        data.type === "HOUSE"
          ? "Nama pemilik rumah / ibu kos / pengelola wajib diisi."
          : "Nama vendor / pemilik sewa wajib diisi.",
    };
  }

  const effectiveLandlordPhone = cleanOptionalText(data.landlordPhone);
  const effectiveVendorPhone =
    cleanOptionalText(data.vendorPhone) || effectiveLandlordPhone;

  const isHouse = data.type === "HOUSE";
  const enforcedUsageScope: RentalUsageScope = isHouse
    ? "PROJECT"
    : data.usageScope === "OPERATIONAL"
      ? "OPERATIONAL"
      : "PROJECT";

  const enforcedWithOperator = isHouse ? false : Boolean(data.withOperator);
  const enforcedWithFuel = isHouse ? false : Boolean(data.withFuel);
  const enforcedOperatorName =
    enforcedWithOperator && !isHouse
      ? cleanOptionalText(data.operatorName)
      : null;

  const rawProjectId = cleanOptionalText(data.projectId);
  let resolvedProjectId: string | null = null;

  await connectToMongoDB();

  if (isHouse) {
    if (!rawProjectId) {
      return {
        success: false,
        message:
          "Biaya Rumah Sewa (Mess Tukang) wajib dihubungkan ke Project aktif.",
      };
    }
    const activeProject = await findActiveProject(rawProjectId);
    if (!activeProject) {
      return {
        success: false,
        message:
          "Project untuk Rumah Sewa tidak ditemukan, sudah dihapus, atau berstatus batal.",
      };
    }
    resolvedProjectId = String(activeProject._id);
  } else if (enforcedUsageScope === "PROJECT") {
    if (!rawProjectId) {
      return {
        success: false,
        message:
          "Sewa dengan lingkup Proyek wajib memilih Project aktif.",
      };
    }
    const activeProject = await findActiveProject(rawProjectId);
    if (!activeProject) {
      return {
        success: false,
        message:
          "Project tujuan tidak ditemukan, sudah dihapus, atau berstatus batal.",
      };
    }
    resolvedProjectId = String(activeProject._id);
  } else {
    // OPERATIONAL scope: operational expense without project attribution
    resolvedProjectId = null;
  }

  const ratePerPeriodScaled = scaledIntegerFromDecimal(data.ratePerPeriod);
  const additionalCostScaled = scaledIntegerFromDecimal(data.additionalCost);
  const totalCostScaled = scaledIntegerFromDecimal(data.totalCost);
  const now = new Date();

  try {
    if (data.id) {
      const existing = await EquipmentRental.findById(data.id).lean();
      if (!existing) {
        return { success: false, message: "Data sewa tidak ditemukan." };
      }

      if (existing.paymentStatus === "PAID") {
        const existingTotal = toScaledBigInt(existing.totalCost);
        if (totalCostScaled !== existingTotal) {
          return {
            success: false,
            message:
              "Tagihan sewa yang sudah dibayar lunas tidak dapat diubah nominal biayanya.",
          };
        }
        const existingProjectId = cleanOptionalText(existing.projectId);
        if (resolvedProjectId !== existingProjectId || data.type !== existing.type) {
          return {
            success: false,
            message:
              "Tagihan sewa yang sudah dibayar lunas tidak dapat diubah tipe atau Project-nya agar sesuai Cashflow.",
          };
        }
      }

      await EquipmentRental.updateOne(
        { _id: data.id },
        {
          $set: {
            type: data.type,
            usageScope: enforcedUsageScope,
            name: data.name,
            category: cleanOptionalText(data.category),
            codeOrPlate: isHouse ? null : cleanOptionalText(data.codeOrPlate),
            vendorName: effectiveVendorName,
            vendorPhone: effectiveVendorPhone,
            propertyAddress: isHouse
              ? cleanOptionalText(data.propertyAddress)
              : null,
            landlordName: isHouse
              ? effectiveLandlordName || effectiveVendorName
              : null,
            landlordPhone: isHouse ? effectiveVendorPhone : null,
            occupantCount: isHouse ? (data.occupantCount ?? null) : null,
            rentalPeriodType: data.rentalPeriodType,
            startDate: start,
            endDate: end,
            duration: data.duration,
            ratePerPeriod: ratePerPeriodScaled,
            additionalCost: additionalCostScaled,
            totalCost: totalCostScaled,
            status: data.status,
            withOperator: enforcedWithOperator,
            operatorName: enforcedOperatorName,
            withFuel: enforcedWithFuel,
            projectId: resolvedProjectId,
            sourceTicketId:
              cleanOptionalText(data.sourceTicketId) ??
              cleanOptionalText(existing.sourceTicketId),
            notes: cleanOptionalText(data.notes),
            paymentBankName:
              cleanOptionalText(data.paymentBankName) ??
              cleanOptionalText(existing.paymentBankName),
            paymentAccountNumber:
              cleanOptionalText(data.paymentAccountNumber) ??
              cleanOptionalText(existing.paymentAccountNumber),
            paymentAccountName:
              cleanOptionalText(data.paymentAccountName) ??
              cleanOptionalText(existing.paymentAccountName),
            updatedAt: now,
          },
        },
      );

      revalidateRentalPaths();
      return {
        success: true,
        message: "Data sewa berhasil diperbarui.",
        id: data.id,
      };
    }

    const rentalId = randomUUID();
    await EquipmentRental.create({
      _id: rentalId,
      type: data.type,
      usageScope: enforcedUsageScope,
      name: data.name,
      category: cleanOptionalText(data.category),
      codeOrPlate: isHouse ? null : cleanOptionalText(data.codeOrPlate),
      vendorName: effectiveVendorName,
      vendorPhone: effectiveVendorPhone,
      propertyAddress: isHouse
        ? cleanOptionalText(data.propertyAddress)
        : null,
      landlordName: isHouse
        ? effectiveLandlordName || effectiveVendorName
        : null,
      landlordPhone: isHouse ? effectiveVendorPhone : null,
      occupantCount: isHouse ? (data.occupantCount ?? null) : null,
      rentalPeriodType: data.rentalPeriodType,
      startDate: start,
      endDate: end,
      duration: data.duration,
      ratePerPeriod: ratePerPeriodScaled,
      additionalCost: additionalCostScaled,
      totalCost: totalCostScaled,
      status: data.status,
      withOperator: enforcedWithOperator,
      operatorName: enforcedOperatorName,
      withFuel: enforcedWithFuel,
      projectId: resolvedProjectId,
      sourceTicketId: cleanOptionalText(data.sourceTicketId),
      notes: cleanOptionalText(data.notes),
      createdById: session.user.id,
      createdByName: session.user.name || null,
      paymentBankName: cleanOptionalText(data.paymentBankName),
      paymentAccountNumber: cleanOptionalText(data.paymentAccountNumber),
      paymentAccountName: cleanOptionalText(data.paymentAccountName),
      paymentStatus: "UNPAID",
      createdAt: now,
      updatedAt: now,
    });

    revalidateRentalPaths();
    return {
      success: true,
      message: "Pencatatan sewa berhasil disimpan.",
      id: rentalId,
    };
  } catch (error) {
    console.error("Save rental error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal menyimpan data sewa.",
    };
  }
}

export async function submitRentalBilling(
  rentalId: string,
  bankDetails?: {
    paymentBankName?: string;
    paymentAccountNumber?: string;
    paymentAccountName?: string;
  },
): Promise<RentalActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }

  if (!allowedRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin mengajukan tagihan sewa.",
    };
  }

  try {
    const mongoose = await connectToMongoDB();
    await mongoose.connection.transaction(async (mongoSession) => {
      const rental = await EquipmentRental.findById(rentalId)
        .session(mongoSession)
        .lean();
      if (!rental) {
        throw new Error("Data sewa tidak ditemukan.");
      }
      if (rental.status === "CANCELLED") {
        throw new Error(
          "Data sewa yang sudah dibatalkan tidak dapat diajukan tagihannya.",
        );
      }
      if (rental.paymentStatus && rental.paymentStatus !== "UNPAID") {
        throw new Error(
          "Tagihan sewa ini sudah pernah diajukan atau sudah dibayar.",
        );
      }

      if (rental.type === "HOUSE") {
        const projectId = cleanOptionalText(rental.projectId);
        if (!projectId) {
          throw new Error(
            "Rumah Sewa Tukang wajib terhubung ke Project sebelum diajukan ke Keuangan.",
          );
        }
        const activeProject = await Project.findOne({
          _id: projectId,
          isDeleted: { $ne: true },
          status: { $nin: ["CANCELLED", "BATAL", "DELETED"] },
        })
          .select({ _id: 1 })
          .session(mongoSession)
          .lean();
        if (!activeProject) {
          throw new Error(
            "Project untuk Rumah Sewa tidak ditemukan atau sudah tidak aktif.",
          );
        }
      }

      const now = new Date();
      const updated = await EquipmentRental.updateOne(
        {
          _id: rentalId,
          $or: [
            { paymentStatus: "UNPAID" },
            { paymentStatus: null },
            { paymentStatus: { $exists: false } },
          ],
        },
        {
          $set: {
            paymentStatus: "PENDING_PAYMENT",
            billingSubmittedAt: now,
            billingSubmittedById: session.user.id,
            billingSubmittedByName: session.user.name || null,
            paymentBankName:
              cleanOptionalText(bankDetails?.paymentBankName) ??
              cleanOptionalText(rental.paymentBankName),
            paymentAccountNumber:
              cleanOptionalText(bankDetails?.paymentAccountNumber) ??
              cleanOptionalText(rental.paymentAccountNumber),
            paymentAccountName:
              cleanOptionalText(bankDetails?.paymentAccountName) ??
              cleanOptionalText(rental.paymentAccountName),
            updatedAt: now,
          },
        },
        { session: mongoSession },
      );

      if (updated.modifiedCount !== 1) {
        throw new Error("Status tagihan sewa berubah. Muat ulang halaman.");
      }

      const financeUsers = await User.find({
        isActive: true,
        role: UserRole.FINANCE,
      })
        .select({ _id: 1 })
        .session(mongoSession)
        .lean();

      const totalAmount = decimalNumberFromScaledInteger(
        toScaledBigInt(rental.totalCost),
      );
      const label = getRentalTypeLabel(rental.type).toLowerCase();

      if (financeUsers.length > 0) {
        await Notification.insertMany(
          financeUsers.map((user) => ({
            _id: randomUUID(),
            userId: String(user._id),
            title: "Tagihan Sewa Menunggu Pembayaran",
            message: `Tagihan ${label} ${rental.name} (${rental.vendorName || rental.landlordName || "-"}) senilai Rp${totalAmount.toLocaleString("id-ID")} menunggu pembayaran Keuangan.`,
            actionUrl: "/apps/finance?tab=rentals",
            type: NotificationType.APPROVAL,
            isRead: false,
            createdAt: now,
          })),
          { session: mongoSession },
        );
      }
    });

    revalidateRentalPaths();
    return {
      success: true,
      message: "Tagihan sewa berhasil diajukan ke Bagian Keuangan.",
      id: rentalId,
    };
  } catch (error) {
    console.error("Submit rental billing error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal mengajukan tagihan sewa.",
    };
  }
}

export async function processRentalPayment(
  input: RentalPaymentInput,
): Promise<RentalActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }

  if (!financeRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin untuk memproses pembayaran.",
    };
  }

  const financeAccountId = cleanOptionalText(input.financeAccountId);
  const rawUrlInput = cleanOptionalText(input.proofOfPaymentUrl);

  let uploadedProofUrl: string | null = null;
  let resolvedProofUrl: string | null = null;

  try {
    if (input.proof instanceof File && input.proof.size > 0) {
      uploadedProofUrl = await uploadCashflowProof(input.proof);
      resolvedProofUrl = uploadedProofUrl;
    } else if (rawUrlInput) {
      if (!isAcceptedProofUrl(rawUrlInput)) {
        return {
          success: false,
          message:
            "URL bukti transfer tidak valid. Silakan unggah file bukti transfer.",
        };
      }
      resolvedProofUrl = rawUrlInput;
    }

    const mongoose = await connectToMongoDB();
    await mongoose.connection.transaction(async (mongoSession) => {
      const current = await EquipmentRental.findById(input.rentalId)
        .session(mongoSession)
        .lean();
      if (!current) {
        throw new Error("Data sewa tidak ditemukan.");
      }
      if (current.status === "CANCELLED") {
        throw new Error("Tagihan sewa berstatus dibatalkan.");
      }
      if (current.paymentStatus !== "PENDING_PAYMENT") {
        throw new Error("Tagihan sewa belum diajukan atau sudah dibayar.");
      }

      if (current.type === "HOUSE") {
        const projectId = cleanOptionalText(current.projectId);
        if (!projectId) {
          throw new Error(
            "Rumah Sewa Tukang wajib terhubung ke Project aktif sebelum dibayar.",
          );
        }
        const activeProject = await Project.findOne({
          _id: projectId,
          isDeleted: { $ne: true },
          status: { $nin: ["CANCELLED", "BATAL", "DELETED"] },
        })
          .select({ _id: 1 })
          .session(mongoSession)
          .lean();
        if (!activeProject) {
          throw new Error(
            "Project untuk Rumah Sewa tidak ditemukan atau sudah tidak aktif.",
          );
        }
      }

      const sourceTicketId = cleanOptionalText(current.sourceTicketId);
      if (sourceTicketId) {
        const existingTicketPayment = await PaymentTransaction.exists({
          ticketId: sourceTicketId,
          status: "PAID",
        }).session(mongoSession);
        if (existingTicketPayment) {
          throw new Error(
            "Tagihan ini berasal dari tiket pengajuan yang sudah dibayar. Pembayaran ganda dicegah.",
          );
        }
      }

      const existingCashflow = await Cashflow.exists({
        equipmentRentalId: String(current._id),
      }).session(mongoSession);
      if (existingCashflow || cleanOptionalText(current.cashflowId)) {
        throw new Error(
          "Tagihan sewa ini sudah memiliki catatan Cashflow pembayaran.",
        );
      }

      const totalAmount = decimalNumberFromScaledInteger(
        toScaledBigInt(current.totalCost),
      );
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw new Error("Nominal tagihan sewa tidak valid.");
      }

      if (totalAmount > 0) {
        if (!financeAccountId) {
          throw new Error(
            "Buku bank / akun kas sumber pembayaran wajib dipilih.",
          );
        }
        if (!resolvedProofUrl) {
          throw new Error("Bukti transfer pembayaran wajib diunggah.");
        }
      }

      const paidAt = new Date();
      let cashflowId: string | null = null;
      let paymentTransactionId: string | null = null;

      const resolvedBankName =
        cleanOptionalText(input.paymentBankName) ??
        cleanOptionalText(current.paymentBankName);
      const resolvedAccountNumber =
        cleanOptionalText(input.paymentAccountNumber) ??
        cleanOptionalText(current.paymentAccountNumber);
      const resolvedAccountName =
        cleanOptionalText(input.paymentAccountName) ??
        cleanOptionalText(current.paymentAccountName);

      if (totalAmount > 0 && financeAccountId) {
        const account = await FinanceAccount.findOneAndUpdate(
          {
            _id: financeAccountId,
            balance: { $gte: totalAmount },
          },
          { $inc: { balance: -totalAmount } },
          { new: true, session: mongoSession },
        ).select({ _id: 1 });

        if (!account) {
          const exists = await FinanceAccount.exists({
            _id: financeAccountId,
          }).session(mongoSession);
          throw new Error(
            exists
              ? "Saldo buku bank/kas tidak mencukupi."
              : "Buku bank/kas sumber pembayaran tidak ditemukan.",
          );
        }

        paymentTransactionId = randomUUID();
        cashflowId = randomUUID();

        const transferDestination =
          [resolvedBankName, resolvedAccountNumber, resolvedAccountName]
            .filter((part): part is string => Boolean(part))
            .join(" · ") ||
          cleanOptionalText(current.vendorName) ||
          cleanOptionalText(current.landlordName) ||
          "Penerima Sewa";

        await PaymentTransaction.create(
          [
            {
              _id: paymentTransactionId,
              ticketId: null,
              poId: null,
              directStockPurchaseId: null,
              paymentType: "FULL_PAYMENT",
              amount: totalAmount,
              transferDestination,
              status: "PAID",
              processedById: session.user.id,
              proofOfTransferUrl: resolvedProofUrl,
              proofEditDisabledUrls: resolvedProofUrl ? [resolvedProofUrl] : [],
              paidAt,
              createdAt: paidAt,
            },
          ],
          { session: mongoSession },
        );

        const typeLabel = getRentalTypeLabel(current.type);
        const ownerLabel =
          cleanOptionalText(current.landlordName) ||
          cleanOptionalText(current.vendorName) ||
          "-";
        const effectiveProjectId =
          current.type === "HOUSE"
            ? cleanOptionalText(current.projectId)
            : current.usageScope === "OPERATIONAL"
              ? null
              : cleanOptionalText(current.projectId);

        await Cashflow.create(
          [
            {
              _id: cashflowId,
              type: "OUT",
              amount: totalAmount,
              sourceDesc: `Pelunasan ${typeLabel} · ${current.name} (${ownerLabel})`,
              projectId: effectiveProjectId,
              paymentMethod: "TRANSFER",
              proofUrl: resolvedProofUrl,
              accountId: financeAccountId,
              recordedBy: session.user.id,
              paymentTransactionId,
              equipmentRentalId: String(current._id),
              category: "SEWA",
              expenseType: getRentalExpenseType(current.type),
              createdAt: paidAt,
            },
          ],
          { session: mongoSession },
        );
      }

      const updated = await EquipmentRental.updateOne(
        { _id: input.rentalId, paymentStatus: "PENDING_PAYMENT" },
        {
          $set: {
            paymentStatus: "PAID",
            paidAt,
            paidById: session.user.id,
            paidByName: session.user.name || null,
            proofOfPaymentUrl: resolvedProofUrl,
            paymentBankName: resolvedBankName,
            paymentAccountNumber: resolvedAccountNumber,
            paymentAccountName: resolvedAccountName,
            financeNotes: cleanOptionalText(input.financeNotes),
            cashflowId,
            paymentTransactionId,
            updatedAt: paidAt,
          },
        },
        { session: mongoSession },
      );

      if (updated.modifiedCount !== 1) {
        throw new Error(
          "Status tagihan sewa berubah. Muat ulang sebelum membayar.",
        );
      }

      const recipientIds = current.billingSubmittedById
        ? current.billingSubmittedById !== session.user.id
          ? [String(current.billingSubmittedById)]
          : []
        : (
            await User.find({ isActive: true, role: UserRole.LOGISTICS })
              .select({ _id: 1 })
              .session(mongoSession)
              .lean()
          ).map((user) => String(user._id));

      if (recipientIds.length > 0) {
        const label = getRentalTypeLabel(current.type).toLowerCase();
        await Notification.insertMany(
          recipientIds.map((userId) => ({
            _id: randomUUID(),
            userId,
            title: "Pembayaran Sewa Selesai",
            message: `Tagihan ${label} ${current.name} (${current.vendorName || current.landlordName || "-"}) sebesar Rp${totalAmount.toLocaleString("id-ID")} telah dibayar lunas Keuangan.`,
            type: NotificationType.SUCCESS,
            actionUrl: "/apps/logistics?tab=equipment",
            isRead: false,
            createdAt: paidAt,
          })),
          { session: mongoSession },
        );
      }
    });

    revalidateRentalPaths();
    return {
      success: true,
      message: "Pembayaran tagihan sewa berhasil diproses dan dicatat lunas.",
      id: input.rentalId,
    };
  } catch (error) {
    console.error("Process rental payment error:", error);
    if (uploadedProofUrl) {
      await removeUploadedCashflowProof(uploadedProofUrl).catch(() => undefined);
    }
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal memproses pembayaran sewa.",
    };
  }
}

export async function payEquipmentRentalBilling(
  input: RentalPaymentInput,
): Promise<RentalActionResult> {
  return processRentalPayment(input);
}

export async function deleteRental(id: string): Promise<RentalActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }

  if (!deleteRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin untuk menghapus data sewa.",
    };
  }

  try {
    await connectToMongoDB();
    const existing = await EquipmentRental.findById(id).lean();
    if (!existing) {
      return { success: false, message: "Data sewa tidak ditemukan." };
    }

    if (
      existing.paymentStatus === "PAID" ||
      cleanOptionalText(existing.cashflowId)
    ) {
      return {
        success: false,
        message:
          "Data sewa yang sudah dibayar lunas dan masuk Cashflow tidak dapat dihapus.",
      };
    }

    const existingCashflow = await Cashflow.exists({ equipmentRentalId: id });
    if (existingCashflow) {
      return {
        success: false,
        message:
          "Data sewa ini sudah tercatat di Cashflow Keuangan dan tidak dapat dihapus.",
      };
    }

    await EquipmentRental.deleteOne({ _id: id });
    revalidateRentalPaths();
    return { success: true, message: "Data sewa berhasil dihapus.", id };
  } catch (error) {
    console.error("Delete rental error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal menghapus data sewa.",
    };
  }
}
