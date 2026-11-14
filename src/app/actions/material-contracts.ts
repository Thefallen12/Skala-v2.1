"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  FulfillmentStatus,
  MaterialDeliveryBillingStatus,
  NotificationType,
  POPaymentMethod,
  PaymentType,
  Prisma,
  TicketCategoryHint,
  TicketFulfillmentStatus,
  TicketStatus,
  UserRole,
  VendorInvoiceStatus,
} from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { connectToMongoDB } from "@/lib/mongoose";
import Cashflow from "@/models/cashflow";
import DocumentNumberSequence from "@/models/document-number-sequence";
import FinanceAccount from "@/models/finance-account";
import Notification from "@/models/notification";
import Project from "@/models/project";
import User from "@/models/user";
import {
  MaterialContract,
  MaterialDelivery,
  VendorInvoice,
  VendorInvoicePayment,
} from "@/models/finance-records";
import { sendNotification } from "@/lib/notifications";
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

async function generateNextContractNumber(
  tx: Prisma.TransactionClient,
  materialType: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const slug = sanitizeContractMaterialSlug(materialType);
  const sequence = await tx.documentNumberSequence.upsert({
    where: {
      kind_year: {
        kind: `KONTRAK_${slug}`,
        year,
      },
    },
    update: { value: { increment: 1 } },
    create: {
      kind: `KONTRAK_${slug}`,
      year,
      value: 1,
    },
    select: { value: true },
  });
  return `KONTRAK/${slug}/${year}/${String(sequence.value).padStart(3, "0")}`;
}

async function syncContractTicketFulfillment(
  tx: Prisma.TransactionClient,
  ticketId: string,
  contractNumber: string,
  userId: string,
  doNumber: string,
) {
  const [ticketItems, deliveries] = await Promise.all([
    tx.ticketItem.findMany({
      where: { ticketId },
      select: {
        id: true,
        quantity: true,
        status: true,
        categoryHint: true,
        materialContractId: true,
      },
    }),
    tx.materialDelivery.findMany({
      where: { ticketId },
      select: { contractId: true, quantityReceived: true },
    }),
  ]);
  const requestedByContract = new Map<string, number>();
  const deliveredByContract = new Map<string, number>();

  for (const item of ticketItems) {
    if (
      item.categoryHint === TicketCategoryHint.CONTRACT &&
      item.materialContractId
    ) {
      requestedByContract.set(
        item.materialContractId,
        (requestedByContract.get(item.materialContractId) ?? 0) +
          item.quantity,
      );
    }
  }
  for (const delivery of deliveries) {
    deliveredByContract.set(
      delivery.contractId,
      (deliveredByContract.get(delivery.contractId) ?? 0) +
        delivery.quantityReceived,
    );
  }

  const completedContractItemIds = ticketItems
    .filter(
      (item) =>
        item.categoryHint === TicketCategoryHint.CONTRACT &&
        item.materialContractId &&
        roundMaterialNumber(
          deliveredByContract.get(item.materialContractId) ?? 0,
          2,
        ) >=
          roundMaterialNumber(
            requestedByContract.get(item.materialContractId) ?? 0,
            2,
          ),
    )
    .map((item) => item.id);

  if (completedContractItemIds.length > 0) {
    await tx.ticketItem.updateMany({
      where: { id: { in: completedContractItemIds } },
      data: { status: FulfillmentStatus.PROCESSED_TO_DO },
    });
  }

  const completedItems = new Set(completedContractItemIds);
  const allItemsFulfilled =
    ticketItems.length > 0 &&
    ticketItems.every(
      (item) =>
        completedItems.has(item.id) ||
        item.status === FulfillmentStatus.PROCESSED_TO_DO,
    );
  const hasAnyFulfillment =
    deliveries.length > 0 ||
    ticketItems.some((item) => item.status !== FulfillmentStatus.PENDING);

  await tx.ticket.update({
    where: { id: ticketId },
    data: {
      fulfillmentStatus: allItemsFulfilled
        ? TicketFulfillmentStatus.COMPLETED
        : hasAnyFulfillment
          ? TicketFulfillmentStatus.PARTIALLY_FULFILLED
          : TicketFulfillmentStatus.PENDING,
    },
  });
  await tx.ticketAuditLog.create({
    data: {
      id: randomUUID(),
      ticketId,
      userId,
      action: "MATERIAL_CONTRACT_DELIVERY_RECORDED",
      notes: `Surat Jalan ${doNumber} untuk kontrak ${contractNumber} dicatat; pemenuhan tiket disinkronkan.`,
    },
  });
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
    const created = await prisma.$transaction(async (tx) => {
      let resolvedVendorId: string | null = data.vendorId?.trim() || null;
      let resolvedVendorName = data.vendorName.trim();

      if (resolvedVendorId) {
        const vendor = await tx.vendor.findUnique({
          where: { id: resolvedVendorId },
          select: { id: true, name: true },
        });
        if (!vendor) {
          throw new Error("Vendor yang dipilih tidak ditemukan.");
        }
        resolvedVendorId = vendor.id;
        resolvedVendorName = vendor.name;
      }

      let contractNumber = data.contractNumber?.trim().toUpperCase() || "";
      if (contractNumber) {
        const duplicate = await tx.materialContract.findUnique({
          where: { contractNumber },
          select: { id: true },
        });
        if (duplicate) {
          throw new Error(`Nomor kontrak ${contractNumber} sudah digunakan.`);
        }
      } else {
        contractNumber = await generateNextContractNumber(
          tx,
          normalizedMaterialType,
        );
      }

      return tx.materialContract.create({
        data: {
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
        },
        select: { id: true, contractNumber: true },
      });
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
    const updated = await prisma.materialContract.update({
      where: { id: contractId },
      data: { isActive },
      select: { contractNumber: true, isActive: true },
    });

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
    const created = await prisma.$transaction(async (tx) => {
      const [contract, project] = await Promise.all([
        tx.materialContract.findUnique({
          where: { id: data.contractId },
          select: {
            id: true,
            contractNumber: true,
            isActive: true,
          },
        }),
        tx.project.findFirst({
          where: { id: data.projectId, isDeleted: false },
          select: { id: true },
        }),
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

      const duplicateDo = await tx.materialDelivery.findFirst({
        where: {
          contractId: contract.id,
          doNumber: {
            equals: normalizedDoNumber,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });
      if (duplicateDo) {
        throw new Error(
          `Nomor Surat Jalan "${normalizedDoNumber}" sudah pernah dicatat pada kontrak ${contract.contractNumber}.`,
        );
      }

      let linkedTicketId: string | null = null;
      if (data.ticketId) {
        const ticket = await tx.ticket.findUnique({
          where: { id: data.ticketId },
          select: {
            id: true,
            ticketNumber: true,
            projectId: true,
            status: true,
            items: {
              select: {
                id: true,
                quantity: true,
                status: true,
                categoryHint: true,
                materialContractId: true,
              },
            },
          },
        });
        if (!ticket) {
          throw new Error("Tiket yang dipilih tidak ditemukan.");
        }
        const blockedStatuses: TicketStatus[] = [
          TicketStatus.DRAFT,
          TicketStatus.PENDING_DIRECTOR,
          TicketStatus.REJECTED,
          TicketStatus.COMPLETED,
        ];
        if (blockedStatuses.includes(ticket.status)) {
          throw new Error(
            `Tiket ${ticket.ticketNumber} belum disetujui atau sudah selesai, sehingga tidak dapat dikaitkan dengan Surat Jalan.`,
          );
        }
        if (ticket.projectId !== project.id) {
          throw new Error(
            `Proyek Surat Jalan harus sama dengan proyek pada tiket ${ticket.ticketNumber}.`,
          );
        }
        const hasContractItem = ticket.items.some(
          (item) =>
            item.categoryHint === TicketCategoryHint.CONTRACT &&
            item.materialContractId === contract.id,
        );
        if (!hasContractItem) {
          throw new Error(
            `Tiket ${ticket.ticketNumber} tidak memiliki item dari kontrak ${contract.contractNumber}.`,
          );
        }
        linkedTicketId = ticket.id;
      }

      const createdDelivery = await tx.materialDelivery.create({
        data: {
          contractId: contract.id,
          projectId: project.id,
          ticketId: linkedTicketId,
          deliveryDate,
          doNumber: normalizedDoNumber,
          vehiclePlate: data.vehiclePlate?.trim().toUpperCase() || null,
          driverName: data.driverName?.trim() || null,
          quantityReceived: normalizedQty,
          billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
          receivedById: session.user.id,
          proofUrl: uploadedProofUrl,
          notes: data.notes?.trim() || null,
        },
        select: { id: true, projectId: true },
      });

      if (linkedTicketId) {
        await syncContractTicketFulfillment(
          tx,
          linkedTicketId,
          contract.contractNumber,
          session.user.id,
          normalizedDoNumber,
        );
      }

      return createdDelivery;
    });

    revalidatePath("/apps/logistics");
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
    const existing = await prisma.materialDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        doNumber: true,
        projectId: true,
        billingStatus: true,
        vendorInvoiceId: true,
        receivedById: true,
        proofUrl: true,
      },
    });
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

    const deleted = await prisma.materialDelivery.deleteMany({
      where: {
        id: existing.id,
        billingStatus: MaterialDeliveryBillingStatus.UNBILLED,
        vendorInvoiceId: null,
      },
    });
    if (deleted.count !== 1) {
      return {
        success: false,
        message: "Surat Jalan baru saja ditagihkan atau sudah dihapus.",
      };
    }

    await removeDeliveryProofFile(existing.proofUrl);

    revalidatePath("/apps/logistics");
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
  if (!session?.user?.id || !canBillAndPayVendorContracts(session.user.role)) {
    return {
      success: false,
      message: "Akses Keuangan diperlukan untuk memuat daftar Surat Jalan belum ditagih.",
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
    const [projects, receivers] = await Promise.all([
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
    ]);
    const projectsById = new Map(
      projects.map((project) => [String(project._id), project]),
    );
    const receiversById = new Map(
      receivers.map((receiver) => [String(receiver._id), receiver]),
    );

    return {
      success: true,
      deliveries: rows.map((delivery) => {
        const project = projectsById.get(delivery.projectId);
        if (!project) {
          throw new Error(`Proyek pengiriman ${delivery.projectId} tidak ditemukan.`);
        }
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
            projectName: `${project.kelompokTani} · ${project.title}`,
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
  if (!canBillAndPayVendorContracts(session.user.role)) {
    return {
      success: false,
      message: "Hanya Keuangan, Administrasi, atau Direksi yang dapat menerbitkan tagihan vendor.",
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
        .select({ _id: 1, projectId: 1, quantityReceived: 1 })
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
        .select({ projectId: 1 })
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

      if (contract.createdById && contract.createdById !== session.user.id) {
        await Notification.create(
          [
            {
              _id: randomUUID(),
              userId: contract.createdById,
              title: isSettled
                ? `Tagihan Kontrak ${invoice.invoiceNumber} Lunas`
                : `Pembayaran ${paymentTypeLabel} Kontrak ${invoice.invoiceNumber}`,
              message: `Keuangan telah memproses ${paymentTypeLabel.toLowerCase()} sebesar Rp${Math.round(paymentAmount).toLocaleString("id-ID")} untuk ${contract.vendorName} (${contract.contractNumber}).`,
              type: isSettled ? NotificationType.SUCCESS : NotificationType.INFO,
              actionUrl: "/apps/logistics?tab=bulk-contracts",
              createdAt: now,
            },
          ],
          { session: mongoSession },
        );
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
