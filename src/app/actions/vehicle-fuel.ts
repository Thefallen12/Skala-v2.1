"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  DODeliveryMethod,
  DOStatus,
  NotificationType,
  POPaymentMethod,
  UserRole,
  VehicleFuelRequestStatus,
  VehicleFuelSource,
} from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";
import { getFinancePaymentProofMimeType } from "@/lib/finance-payment-proof-file";
import { removeTicketReceipt, saveTicketReceipt } from "@/lib/ticket-receipts";
import {
  VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
  VEHICLE_FUEL_PRICE_PER_LITER,
} from "@/lib/vehicle-fuel";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import { recordFinanceCashflowOutflow } from "@/lib/finance-cashflow-ledger";

export type VehicleFuelActionResult = {
  success: boolean;
  message: string;
};

function fail(message: string): VehicleFuelActionResult {
  return { success: false, message };
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function isPhoto(value: unknown): value is File {
  const mime = value instanceof File ? getFinancePaymentProofMimeType(value) : null;
  return (
    value instanceof File &&
    value.size > 0 &&
    value.size <= 5 * 1024 * 1024 &&
    mime !== null &&
    mime !== "application/pdf"
  );
}

function isTransferProof(value: unknown): value is File {
  return (
    value instanceof File &&
    value.size > 0 &&
    value.size <= 5 * 1024 * 1024 &&
    getFinancePaymentProofMimeType(value) !== null
  );
}

async function moverOwnsDeliveryOrder(
  transaction: Prisma.TransactionClient,
  publicCode: string,
  moverId: string,
  moverName: string | null,
) {
  const order = await transaction.deliveryOrder.findUnique({
    where: { publicCode },
    select: {
      id: true,
      doNumber: true,
      status: true,
      deliveryMethod: true,
      driverName: true,
      vehicleId: true,
      vehiclePlateNumber: true,
      vehicleTripLog: {
        select: {
          distanceKm: true,
        },
      },
      ticket: {
        select: {
          moverAssigneeId: true,
          projectId: true,
        },
      },
      po: { select: { ticket: { select: { projectId: true } } } },
      fuelRequests: {
        where: {
          status: {
            in: [
              VehicleFuelRequestStatus.PENDING_FINANCE,
              VehicleFuelRequestStatus.FUNDED,
              VehicleFuelRequestStatus.PROOF_SUBMITTED,
              VehicleFuelRequestStatus.COMPLETED,
            ],
          },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!order) throw new Error("DO tidak ditemukan.");
  const isAssigned =
    order.ticket?.moverAssigneeId === moverId ||
    (!order.ticket?.moverAssigneeId &&
      Boolean(moverName) &&
      order.driverName === moverName);
  if (!isAssigned) {
    throw new Error("DO ini tidak ditugaskan kepada akun Mover Anda.");
  }
  if (order.deliveryMethod !== DODeliveryMethod.INTERNAL_MOVER) {
    throw new Error("Permintaan BBM hanya dapat dibuat untuk DO Mover internal.");
  }
  if (order.status !== DOStatus.DELIVERED || !order.vehicleTripLog) {
    throw new Error(
      "Request BBM baru dapat dibuat setelah Mover kembali ke gudang dan mencatat ODO pulang.",
    );
  }
  if (!order.vehicleId || !order.vehiclePlateNumber) {
    throw new Error("DO belum memiliki kendaraan yang ditetapkan Logistik.");
  }
  if (order.fuelRequests.length > 0) {
    throw new Error("Selesaikan atau tunggu proses request BBM sebelumnya.");
  }
  const vehicle = await transaction.vehicle.findUnique({
    where: { id: order.vehicleId },
    select: { plateNumber: true },
  });
  if (!vehicle || vehicle.plateNumber !== order.vehiclePlateNumber) {
    throw new Error("Kendaraan pada DO tidak sesuai dengan data armada.");
  }
  return {
    order,
    projectId:
      order.ticket?.projectId ?? order.po?.ticket?.projectId ?? null,
  };
}

export async function createVehicleFuelRequest(
  publicCode: string,
  input: {
    source: VehicleFuelSource;
    beforeFillingPhoto: File;
    afterFillingPhoto: File;
    receiptPhoto?: File;
    includeExceptionAllowance: boolean;
    exceptionReason?: string;
  },
): Promise<VehicleFuelActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.MOVER) {
    return fail("Hanya Mover yang ditugaskan dapat mengajukan dana BBM.");
  }
  if (
    typeof publicCode !== "string" ||
    publicCode.length > 64 ||
    !input ||
    !Object.values(VehicleFuelSource).includes(input.source) ||
    !isPhoto(input.beforeFillingPhoto) ||
    !isPhoto(input.afterFillingPhoto) ||
    (input.receiptPhoto !== undefined && !isPhoto(input.receiptPhoto)) ||
    typeof input.includeExceptionAllowance !== "boolean" ||
    (input.exceptionReason !== undefined &&
      typeof input.exceptionReason !== "string") ||
    (input.includeExceptionAllowance &&
      !isBoundedText(input.exceptionReason, 300)) ||
    (!input.includeExceptionAllowance &&
      input.exceptionReason !== undefined &&
      input.exceptionReason.trim().length > 0)
  ) {
    return fail(
      "Pilih sumber BBM, unggah foto speedometer sebelum dan sesudah pengisian, serta isi alasan jika meminta toleransi kondisi khusus.",
    );
  }

  const savedPhotoUrls: string[] = [];
  try {
    savedPhotoUrls.push(await saveTicketReceipt(input.beforeFillingPhoto));
    savedPhotoUrls.push(await saveTicketReceipt(input.afterFillingPhoto));
    if (input.receiptPhoto) {
      savedPhotoUrls.push(await saveTicketReceipt(input.receiptPhoto));
    }
  } catch (error) {
    await Promise.all(
      savedPhotoUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove incomplete fuel reimbursement photos:", cleanupError);
        }
      }),
    );
    console.error("Vehicle fuel reimbursement photo upload failed:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Foto bukti BBM gagal diunggah.",
    );
  }

  let requestSummary: {
    amount: Prisma.Decimal;
    liters: Prisma.Decimal;
    tripDistance: Prisma.Decimal;
  } | null = null;
  try {
    requestSummary = await prisma.$transaction(
      async (transaction) => {
        const { order, projectId } = await moverOwnsDeliveryOrder(
          transaction,
          publicCode,
          session.user.id,
          session.user.name ?? null,
        );
        const tripDistance = decimalFromScaledInteger(
          order.vehicleTripLog!.distanceKm,
        );
        if (tripDistance.lte(0)) {
          throw new Error(
            "Jarak ODO perjalanan 0 km. Request BBM tidak diperlukan.",
          );
        }
        const exceptionDistance = input.includeExceptionAllowance
          ? new Prisma.Decimal(10)
          : new Prisma.Decimal(0);
        const estimatedDistanceKm = tripDistance.plus(exceptionDistance);
        const unitPrice = new Prisma.Decimal(
          VEHICLE_FUEL_PRICE_PER_LITER[input.source],
        );
        const exactFuelLiter = estimatedDistanceKm.div(
          VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
        );
        const estimatedFuelLiter = exactFuelLiter.toDecimalPlaces(
          2,
          Prisma.Decimal.ROUND_HALF_UP,
        );
        const requestedAmount = exactFuelLiter
          .mul(unitPrice)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
        if (requestedAmount.lte(0)) {
          throw new Error(
            "Estimasi biaya BBM terlalu kecil untuk diproses sebagai request.",
          );
        }
        await transaction.vehicleFuelRequest.create({
          data: {
            vehicleId: order.vehicleId!,
            deliveryOrderId: order.id,
            projectId,
            requestedById: session.user.id,
            source: input.source,
            estimatedDistanceKm: scaledIntegerFromDecimal(estimatedDistanceKm),
            exceptionDistanceKm: scaledIntegerFromDecimal(exceptionDistance),
            exceptionReason: input.includeExceptionAllowance
              ? input.exceptionReason!.trim()
              : null,
            estimatedFuelLiter: scaledIntegerFromDecimal(estimatedFuelLiter),
            unitPrice: scaledIntegerFromDecimal(unitPrice),
            requestedAmount: scaledIntegerFromDecimal(requestedAmount),
            fuelEfficiencyKmPerL: scaledIntegerFromDecimal(
              VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
            ),
            beforeFillingPhotoUrl: savedPhotoUrls[0],
            afterFillingPhotoUrl: savedPhotoUrls[1],
            receiptPhotoUrl: savedPhotoUrls[2] ?? null,
            proofSubmittedAt: new Date(),
          },
        });
        const summary = {
          amount: requestedAmount,
          liters: estimatedFuelLiter,
          tripDistance,
        };
        await sendNotification({
          roleTarget: UserRole.FINANCE,
          title: "Request Reimbursement BBM Mover",
          message: `${order.doNumber} · Rp${requestedAmount.toNumber().toLocaleString("id-ID")} untuk ${estimatedDistanceKm.toString()} km menunggu persetujuan.`,
          actionUrl: "/apps/finance?tab=fuel-requests",
          type: NotificationType.APPROVAL,
          database: transaction,
        });
        return summary;
      },
    );
  } catch (error) {
    await Promise.all(
      savedPhotoUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove unused fuel reimbursement photo:", cleanupError);
        }
      }),
    );
    console.error("Vehicle fuel request creation failed:", error);
    if (
      error instanceof Error &&
      (error.message.startsWith("DO ") ||
        error.message.startsWith("Permintaan BBM") ||
        error.message.startsWith("Request BBM") ||
        error.message.startsWith("Selesaikan") ||
        error.message.startsWith("Kendaraan") ||
        error.message.startsWith("Request BBM baru") ||
        error.message.startsWith("Jarak ODO") ||
        error.message.startsWith("Estimasi biaya"))
    ) {
      return fail(error.message);
    }
    return fail("Request dana BBM gagal dikirim. Silakan coba kembali.");
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  if (!requestSummary) {
    return fail("Request BBM gagal dikirim. Silakan coba kembali.");
  }
  return {
    success: true,
    message: `Request reimbursement terkirim: Rp${requestSummary.amount.toNumber().toLocaleString("id-ID")} untuk ${requestSummary.tripDistance.toString()} km aktual (estimasi ${requestSummary.liters.toString()} L). Menunggu Keuangan.`,
  };
}

export async function submitVehicleFuelProof(
  requestId: string,
  afterFillingPhoto: File,
  receiptPhoto?: File,
): Promise<VehicleFuelActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.MOVER) {
    return fail("Hanya Mover yang mengajukan dapat mengirim bukti pengisian.");
  }
  if (
    typeof requestId !== "string" ||
    requestId.length === 0 ||
    requestId.length > 64 ||
    !isPhoto(afterFillingPhoto) ||
    (receiptPhoto !== undefined && !isPhoto(receiptPhoto))
  ) {
    return fail("Foto speedometer setelah pengisian wajib; format JPG, PNG, atau WEBP maksimal 5 MB.");
  }

  const savedUrls: string[] = [];
  try {
    savedUrls.push(await saveTicketReceipt(afterFillingPhoto));
    if (receiptPhoto) savedUrls.push(await saveTicketReceipt(receiptPhoto));
  } catch (error) {
    await Promise.all(
      savedUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove unused fuel proof photo:", cleanupError);
        }
      }),
    );
    console.error("Vehicle fuel proof upload failed:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Foto bukti pengisian gagal diunggah.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.vehicleFuelRequest.updateMany({
        where: {
          id: requestId,
          requestedById: session.user.id,
          status: VehicleFuelRequestStatus.FUNDED,
        },
        data: {
          afterFillingPhotoUrl: savedUrls[0],
          receiptPhotoUrl: savedUrls[1] ?? null,
          proofSubmittedAt: new Date(),
          status: VehicleFuelRequestStatus.PROOF_SUBMITTED,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Request belum didanai atau bukti sudah pernah dikirim.");
      }
      const request = await transaction.vehicleFuelRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { deliveryOrder: { select: { doNumber: true } } },
      });
      await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "Bukti Pengisian BBM Diterima",
        message: `Mover mengirim bukti pengisian untuk ${request.deliveryOrder.doNumber}.`,
        actionUrl: "/apps/finance?tab=fuel-requests",
        type: NotificationType.INFO,
        database: transaction,
      });
    });
  } catch (error) {
    await Promise.all(
      savedUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove uncommitted fuel proof:", cleanupError);
        }
      }),
    );
    console.error("Vehicle fuel proof submission failed:", error);
    return fail(
      error instanceof Error &&
        error.message.startsWith("Request belum didanai")
        ? error.message
        : "Bukti BBM gagal dikirim. Silakan coba kembali.",
    );
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  return {
    success: true,
    message: "Bukti pengisian BBM berhasil dikirim ke Keuangan.",
  };
}

export async function processVehicleFuelRequest(
  requestId: string,
  approve: boolean,
  input?: {
    disbursementMethod?: POPaymentMethod;
    transferDestination?: string;
    financeAccountId?: string;
    transferProof?: File;
    financeNote?: string;
  },
): Promise<VehicleFuelActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.FINANCE) {
    return fail("Hanya Keuangan yang dapat memproses request dana BBM.");
  }
  if (
    typeof requestId !== "string" ||
    requestId.length === 0 ||
    requestId.length > 64 ||
    typeof approve !== "boolean" ||
    (input?.disbursementMethod !== undefined &&
      !Object.values(POPaymentMethod).includes(input.disbursementMethod)) ||
    (input?.transferDestination !== undefined &&
      (typeof input.transferDestination !== "string" ||
        input.transferDestination.length > 300)) ||
    (input?.financeAccountId !== undefined &&
      (typeof input.financeAccountId !== "string" ||
        input.financeAccountId.length > 100)) ||
    (input?.financeNote !== undefined &&
      (typeof input.financeNote !== "string" ||
        input.financeNote.length > 1000)) ||
    (input?.transferProof !== undefined &&
      !isTransferProof(input.transferProof)) ||
    (approve &&
      (!input ||
        !Object.values(POPaymentMethod).includes(input.disbursementMethod!) ||
        !isBoundedText(input.transferDestination, 300) ||
        !isBoundedText(input.financeAccountId, 100) ||
        (input.disbursementMethod === POPaymentMethod.TRANSFER &&
          !isTransferProof(input.transferProof)) ||
        (input.disbursementMethod === POPaymentMethod.CASH &&
          input.transferProof !== undefined)))
  ) {
    return fail("Data proses request BBM tidak valid.");
  }

  let transferProofUrl: string | null = null;
  if (
    approve &&
    input?.disbursementMethod === POPaymentMethod.TRANSFER &&
    input.transferProof
  ) {
    try {
      transferProofUrl = await saveTicketReceipt(input.transferProof);
    } catch (error) {
      console.error("Vehicle fuel transfer proof upload failed:", error);
      return fail(
        error instanceof Error
          ? error.message
          : "Bukti transfer BBM gagal diunggah.",
      );
    }
  }

  let processed = false;
  try {
    processed = await prisma.$transaction(async (transaction) => {
      const request = await transaction.vehicleFuelRequest.findUnique({
        where: { id: requestId },
        select: {
          status: true,
          afterFillingPhotoUrl: true,
          requestedAmount: true,
          projectId: true,
          deliveryOrder: { select: { doNumber: true } },
          requestedById: true,
        },
      });
      if (!request || request.status !== VehicleFuelRequestStatus.PENDING_FINANCE) {
        return false;
      }
      const result = await transaction.vehicleFuelRequest.updateMany({
        where: {
          id: requestId,
          status: VehicleFuelRequestStatus.PENDING_FINANCE,
        },
        data: {
          status: approve
            ? request.afterFillingPhotoUrl
              ? VehicleFuelRequestStatus.COMPLETED
              : VehicleFuelRequestStatus.FUNDED
            : VehicleFuelRequestStatus.REJECTED,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          disbursedAt: approve ? new Date() : null,
          financeNote: input?.financeNote?.trim() || null,
          disbursementMethod: approve ? input?.disbursementMethod : null,
          transferDestination: approve
            ? input?.transferDestination?.trim() ?? null
            : null,
          transferProofUrl: approve ? transferProofUrl : null,
        },
      });
      if (result.count !== 1) return false;
      if (approve) {
        await recordFinanceCashflowOutflow(transaction, {
          financeAccountId: input!.financeAccountId!,
          amount: decimalFromScaledInteger(request.requestedAmount).toNumber(),
          sourceDesc: `Reimbursement BBM ${request.deliveryOrder.doNumber}`,
          projectId: request.projectId,
          paymentMethod:
            input!.disbursementMethod === POPaymentMethod.CASH
              ? "CASH"
              : "TRANSFER",
          proofUrl: transferProofUrl,
          recordedBy: session.user.id,
        });
      }
      await sendNotification({
        userId: request.requestedById,
        title: approve ? "Dana BBM Disetujui" : "Request BBM Ditolak",
        message: approve
          ? `Reimbursement BBM untuk ${request.deliveryOrder.doNumber} telah selesai disalurkan melalui ${input?.disbursementMethod === POPaymentMethod.TRANSFER ? "transfer" : "tunai"}.`
          : `Request BBM untuk ${request.deliveryOrder.doNumber} ditolak oleh Keuangan.`,
        actionUrl: "/apps/logistics",
        type: approve ? NotificationType.APPROVAL : NotificationType.INFO,
        database: transaction,
      });
      return true;
    });
    if (!processed) {
      if (transferProofUrl) await removeTicketReceipt(transferProofUrl);
      return fail("Request tidak ditemukan atau sudah diproses.");
    }
  } catch (error) {
    if (transferProofUrl) {
      try {
        await removeTicketReceipt(transferProofUrl);
      } catch (cleanupError) {
        console.error("Failed to remove unused fuel transfer proof:", cleanupError);
      }
    }
    console.error("Vehicle fuel request processing failed:", error);
    return fail(
      error instanceof Error &&
        (error.message.startsWith("Saldo buku bank/kas") ||
          error.message.startsWith("Buku bank/kas sumber"))
        ? error.message
        : "Request BBM gagal diproses. Silakan coba kembali.",
    );
  }

  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  return {
    success: true,
    message: approve
      ? "Dana request BBM berhasil dicatat telah disalurkan."
      : "Request dana BBM ditolak.",
  };
}

export async function completeVehicleFuelRequestReview(
  requestId: string,
  financeNote: string,
): Promise<VehicleFuelActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.FINANCE) {
    return fail("Hanya Keuangan yang dapat menutup rekonsiliasi request BBM.");
  }
  if (
    typeof requestId !== "string" ||
    requestId.length === 0 ||
    requestId.length > 64 ||
    typeof financeNote !== "string" ||
    financeNote.length > 1000
  ) {
    return fail("Data penutupan rekonsiliasi BBM tidak valid.");
  }

  try {
    const completed = await prisma.$transaction(async (transaction) => {
      const request = await transaction.vehicleFuelRequest.findUnique({
        where: { id: requestId },
        select: {
          status: true,
          requestedById: true,
          deliveryOrder: { select: { doNumber: true } },
        },
      });
      if (
        !request ||
        request.status !== VehicleFuelRequestStatus.PROOF_SUBMITTED
      ) {
        return false;
      }

      const updated = await transaction.vehicleFuelRequest.updateMany({
        where: {
          id: requestId,
          status: VehicleFuelRequestStatus.PROOF_SUBMITTED,
        },
        data: {
          status: VehicleFuelRequestStatus.COMPLETED,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          ...(financeNote.trim()
            ? { financeNote: financeNote.trim() }
            : {}),
        },
      });
      if (updated.count !== 1) return false;

      await sendNotification({
        userId: request.requestedById,
        title: "Rekonsiliasi BBM Selesai",
        message: `Bukti BBM untuk ${request.deliveryOrder.doNumber} telah ditinjau dan rekonsiliasinya ditutup oleh Keuangan.`,
        actionUrl: "/apps/logistics",
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      return true;
    });

    if (!completed) {
      return fail(
        "Bukti tidak ditemukan atau rekonsiliasi sudah ditutup sebelumnya.",
      );
    }
  } catch (error) {
    console.error("Vehicle fuel reconciliation completion failed:", error);
    return fail("Rekonsiliasi BBM gagal ditutup. Silakan coba kembali.");
  }

  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  return {
    success: true,
    message: "Bukti BBM telah direkonsiliasi dan request ditutup.",
  };
}
