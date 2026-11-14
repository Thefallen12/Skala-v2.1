"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authForProxy } from "../../../auth";
import { PaymentType } from "@prisma/client";
import {
  EQUIPMENT_REQUEST_TYPE,
  EQUIPMENT_TIME_UNITS,
  type EquipmentTimeUnit,
} from "@/lib/equipment-request";
import {
  detectImageMimeFromBytes,
  getFinancePaymentProofMimeType,
  hasPdfSignature,
  normalizeFinancePaymentProofFile,
} from "@/lib/finance-payment-proof-file";
import { isFinancePaymentProofUrl } from "@/lib/finance-payment-proofs";
import { FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER } from "@/lib/finance-payment-proof-config";
import { uploadCloudinaryPhoto } from "@/lib/cloudinary-photos";
import { removeTicketReceipt, saveTicketReceipt } from "@/lib/ticket-receipts";
import { connectToMongoDB } from "@/lib/mongoose";
import Cashflow from "@/models/cashflow";
import DocumentNumberSequence from "@/models/document-number-sequence";
import FinanceAccount from "@/models/finance-account";
import PaymentTransaction from "@/models/payment-transaction";
import Project from "@/models/project";
import Ticket from "@/models/ticket";
import TicketAuditLog from "@/models/ticket-audit-log";
import Notification from "@/models/notification";
import User from "@/models/user";

const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

type CreateEquipmentRequestInput = {
  projectId: string;
  equipmentName: string;
  startDate: string;
  duration: number;
  timeUnit: EquipmentTimeUnit;
  priority: (typeof validPriorities)[number];
};

function failure(message: string) {
  return { success: false as const, message };
}

export async function submitEquipmentRequest(ticketId: string) {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (!userId) {
    return failure("Silakan masuk sebelum mengajukan tiket.");
  }
  if (typeof ticketId !== "string" || ticketId.length === 0 || ticketId.length > 64) {
    return failure("ID tiket tidak valid.");
  }

  try {
    const mongoose = await connectToMongoDB();
    const account = await User.findById(userId)
      .select({ isActive: 1, role: 1 })
      .lean();
    if (
      !account?.isActive ||
      (account.role !== "FIELD_TEAM" && account.role !== "TIM_LAPANGAN")
    ) {
      return failure("Hanya Tim Lapangan aktif yang dapat mengajukan tiket ini.");
    }

    await mongoose.connection.transaction(async (transactionSession) => {
      const ticket = await Ticket.findOne({
        _id: ticketId,
        requesterId: userId,
        ticketType: EQUIPMENT_REQUEST_TYPE,
        status: "DRAFT",
      })
        .session(transactionSession)
        .select({ ticketNumber: 1, title: 1 });
      if (!ticket) {
        throw new Error("Tiket tidak ditemukan atau tidak dapat diajukan.");
      }

      const updated = await Ticket.updateOne(
        { _id: ticketId, status: "DRAFT" },
        { $set: { status: "PENDING_DIRECTOR", updatedAt: new Date() } },
        { session: transactionSession },
      );
      if (updated.modifiedCount !== 1) {
        throw new Error("Tiket sudah berubah. Muat ulang sebelum mengajukan.");
      }

      await TicketAuditLog.create(
        [
          {
            _id: randomUUID(),
            ticketId,
            userId,
            action: "SUBMITTED",
            notes: "Permintaan alat diajukan untuk persetujuan Direktur.",
          },
        ],
        { session: transactionSession },
      );

      const directors = await User.find({
        isActive: true,
        role: {
          $in: [
            "DIRECTOR",
            "DIRECTUR",
            "DEPUTY_DIRECTOR",
            "WAKIL_DIRECTUR",
          ],
        },
      })
        .select({ _id: 1 })
        .session(transactionSession)
        .lean();
      if (directors.length > 0) {
        await Notification.create(
          directors.map((director) => ({
            _id: randomUUID(),
            userId: String(director._id),
            title: "Tiket Menunggu Persetujuan",
            message: `${ticket.ticketNumber} · ${ticket.title} membutuhkan persetujuan eksekutif.`,
            type: "APPROVAL",
            actionUrl: `/apps/approvals?tab=direct-purchase&openSheet=${encodeURIComponent(ticketId)}`,
          })),
          { session: transactionSession },
        );
      }
    });

    revalidatePath("/apps/tickets");
    revalidatePath("/apps/approvals");
    return { success: true as const, message: "Tiket berhasil diajukan." };
  } catch (error) {
    console.error("Submitting equipment request failed:", error);
    return failure("Tiket gagal diajukan. Silakan coba kembali.");
  }
}

export async function approveEquipmentRequest(ticketId: string) {
  const session = await authForProxy();
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) {
    return failure("Silakan masuk sebelum menyetujui tiket.");
  }
  if (typeof ticketId !== "string" || ticketId.length === 0 || ticketId.length > 64) {
    return failure("ID tiket tidak valid.");
  }
  if (role !== "DIRECTOR" && role !== "DEPUTY_DIRECTOR") {
    return failure("Hanya Direktur atau Wakil Direktur yang dapat menyetujui tiket.");
  }

  try {
    const mongoose = await connectToMongoDB();
    const account = await User.findById(userId)
      .select({ isActive: 1, role: 1 })
      .lean();
    if (
      !account?.isActive ||
      (account.role !== "DIRECTOR" &&
        account.role !== "DIRECTUR" &&
        account.role !== "DEPUTY_DIRECTOR" &&
        account.role !== "WAKIL_DIRECTUR")
    ) {
      return failure("Akun tidak memiliki izin persetujuan yang aktif.");
    }

    await mongoose.connection.transaction(async (transactionSession) => {
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ticketType: EQUIPMENT_REQUEST_TYPE,
        status: "PENDING_DIRECTOR",
      })
        .session(transactionSession)
        .select({ ticketNumber: 1, title: 1, requesterId: 1 });
      if (!ticket) {
        throw new Error("Tiket tidak ditemukan atau sudah ditinjau.");
      }

      const approverLabel =
        role === "DEPUTY_DIRECTOR" ? "Wakil Direktur" : "Direktur";
      const updated = await Ticket.updateOne(
        { _id: ticketId, status: "PENDING_DIRECTOR" },
        {
          $set: {
            status: "PROCESSED_LOGISTIC",
            isApprovedByDirector: true,
            updatedAt: new Date(),
          },
        },
        { session: transactionSession },
      );
      if (updated.modifiedCount !== 1) {
        throw new Error("Tiket sudah berubah. Muat ulang sebelum menyetujui.");
      }

      await TicketAuditLog.create(
        [
          {
            _id: randomUUID(),
            ticketId,
            userId,
            action: "APPROVED_BY_DIR",
            notes: `Disetujui ${approverLabel}; diteruskan ke Logistik.`,
          },
        ],
        { session: transactionSession },
      );

      const logisticsUsers = await User.find({
        isActive: true,
        role: { $in: ["LOGISTICS", "KOORDINATOR_LOGISTIK"] },
      })
        .select({ _id: 1 })
        .session(transactionSession)
        .lean();
      const notifications = logisticsUsers.map((logisticsUser) => ({
        _id: randomUUID(),
        userId: String(logisticsUser._id),
        title: "Permintaan Alat Disetujui",
        message: `${ticket.ticketNumber} · ${ticket.title} siap diproses Logistik.`,
        type: "APPROVAL",
        actionUrl: `/apps/logistics?tab=tickets&openSheet=${encodeURIComponent(ticketId)}`,
      }));
      if (ticket.requesterId !== userId) {
        notifications.push({
          _id: randomUUID(),
          userId: ticket.requesterId,
          title: "Tiket Disetujui Direksi",
          message: `${ticket.ticketNumber} · ${ticket.title} disetujui dan diteruskan ke Logistik.`,
          type: "SUCCESS",
          actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
        });
      }
      if (notifications.length > 0) {
        await Notification.create(notifications, {
          session: transactionSession,
        });
      }
    });

    revalidatePath("/apps/tickets");
    revalidatePath("/apps/approvals");
    revalidatePath("/apps/logistics");
    return {
      success: true as const,
      message: "Tiket disetujui dan diteruskan ke Logistik.",
    };
  } catch (error) {
    console.error("Approving equipment request failed:", error);
    return failure("Tiket gagal disetujui. Silakan coba kembali.");
  }
}

async function decideEquipmentRequest(
  ticketId: string,
  reason: string,
  decision: "REJECT" | "REVISION",
) {
  const session = await authForProxy();
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) {
    return failure("Silakan masuk sebelum meninjau tiket.");
  }
  if (role !== "DIRECTOR" && role !== "DEPUTY_DIRECTOR") {
    return failure("Hanya Direktur atau Wakil Direktur yang dapat meninjau tiket.");
  }
  if (
    typeof ticketId !== "string" ||
    ticketId.length === 0 ||
    ticketId.length > 64 ||
    typeof reason !== "string" ||
    reason.trim().length < 3 ||
    reason.trim().length > 2000
  ) {
    return failure("Alasan wajib diisi (3–2.000 karakter).");
  }

  try {
    const mongoose = await connectToMongoDB();
    const account = await User.findById(userId)
      .select({ isActive: 1, role: 1 })
      .lean();
    if (
      !account?.isActive ||
      (account.role !== "DIRECTOR" &&
        account.role !== "DIRECTUR" &&
        account.role !== "DEPUTY_DIRECTOR" &&
        account.role !== "WAKIL_DIRECTUR")
    ) {
      return failure("Akun tidak memiliki izin peninjauan yang aktif.");
    }

    const rejected = decision === "REJECT";
    const nextStatus = rejected ? "REJECTED" : "DRAFT";
    const decisionLabel = rejected ? "ditolak" : "memerlukan revisi";
    const actorLabel =
      role === "DEPUTY_DIRECTOR" ? "Wakil Direktur" : "Direktur";
    await mongoose.connection.transaction(async (transactionSession) => {
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ticketType: EQUIPMENT_REQUEST_TYPE,
        status: "PENDING_DIRECTOR",
      })
        .session(transactionSession)
        .select({ ticketNumber: 1, title: 1, requesterId: 1 });
      if (!ticket) {
        throw new Error("Tiket tidak ditemukan atau sudah ditinjau.");
      }

      const updated = await Ticket.updateOne(
        { _id: ticketId, status: "PENDING_DIRECTOR" },
        {
          $set: {
            status: nextStatus,
            isApprovedByDirector: false,
            updatedAt: new Date(),
          },
        },
        { session: transactionSession },
      );
      if (updated.modifiedCount !== 1) {
        throw new Error("Tiket sudah berubah. Muat ulang sebelum meninjau.");
      }

      await TicketAuditLog.create(
        [
          {
            _id: randomUUID(),
            ticketId,
            userId,
            action: rejected
              ? "REJECTED_BY_DIR"
              : "REVISION_REQUESTED_BY_DIR",
            notes: `${decisionLabel} oleh ${actorLabel}: ${reason.trim()}`,
          },
        ],
        { session: transactionSession },
      );
      await Notification.create(
        [
          {
            _id: randomUUID(),
            userId: ticket.requesterId,
            title: rejected ? "Tiket Ditolak Direktur" : "Tiket Memerlukan Revisi",
            message: `${ticket.ticketNumber} · ${ticket.title} ${decisionLabel}. Catatan: ${reason.trim()}`,
            type: rejected ? "WARNING" : "INFO",
            actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
          },
        ],
        { session: transactionSession },
      );
    });

    revalidatePath("/apps/tickets");
    revalidatePath("/apps/approvals");
    return {
      success: true as const,
      message: rejected ? "Tiket berhasil ditolak." : "Revisi tiket diminta.",
    };
  } catch (error) {
    console.error("Deciding equipment request failed:", error);
    return failure("Keputusan tiket gagal disimpan. Silakan coba kembali.");
  }
}

export async function rejectEquipmentRequest(
  ticketId: string,
  reason: string,
) {
  return decideEquipmentRequest(ticketId, reason, "REJECT");
}

export async function requestEquipmentRequestRevision(
  ticketId: string,
  reason: string,
) {
  return decideEquipmentRequest(ticketId, reason, "REVISION");
}

export async function processEquipmentRequestAtLogistics(
  ticketId: string,
  source: "INTERNAL" | "EXTERNAL_VENDOR",
  vendorName?: string,
  quotedCost?: number,
) {
  const session = await authForProxy();
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) {
    return failure("Silakan masuk sebelum memproses tiket.");
  }
  if (role !== "LOGISTICS") {
    return failure("Hanya Logistik yang dapat memproses permintaan alat.");
  }
  if (
    typeof ticketId !== "string" ||
    ticketId.length === 0 ||
    ticketId.length > 64 ||
    (source !== "INTERNAL" && source !== "EXTERNAL_VENDOR")
  ) {
    return failure("Rincian pemrosesan tidak valid.");
  }

  const trimmedVendorName = vendorName?.trim() ?? "";
  if (
    source === "EXTERNAL_VENDOR" &&
    (trimmedVendorName.length < 2 ||
      trimmedVendorName.length > 160 ||
      !Number.isFinite(quotedCost) ||
      (quotedCost ?? 0) <= 0 ||
      (quotedCost ?? 0) > 1_000_000_000_000)
  ) {
    return failure("Nama vendor dan biaya sewa yang valid wajib diisi.");
  }

  try {
    const mongoose = await connectToMongoDB();
    const account = await User.findById(userId)
      .select({ isActive: 1, role: 1 })
      .lean();
    if (
      !account?.isActive ||
      (account.role !== "LOGISTICS" &&
        account.role !== "KOORDINATOR_LOGISTIK")
    ) {
      return failure("Akun tidak memiliki izin Logistik yang aktif.");
    }

    await mongoose.connection.transaction(async (transactionSession) => {
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ticketType: EQUIPMENT_REQUEST_TYPE,
        status: { $in: ["PENDING_LOGISTIK", "PROCESSED_LOGISTIC"] },
      })
        .session(transactionSession)
        .select({ ticketNumber: 1, title: 1, requesterId: 1, equipmentDetails: 1 });
      if (!ticket) {
        throw new Error("Tiket tidak ditemukan atau sudah diproses.");
      }

      const isRental = source === "EXTERNAL_VENDOR";
      const processedAt = new Date();
      const updated = await Ticket.updateOne(
        {
          _id: ticketId,
          status: { $in: ["PENDING_LOGISTIK", "PROCESSED_LOGISTIC"] },
        },
        {
          $set: {
            status: isRental ? "WAITING_FINANCE_PAYMENT" : "COMPLETED",
            fulfillmentStatus: isRental ? "PENDING" : "COMPLETED",
            "equipmentDetails.fulfillmentSource": source,
            "equipmentDetails.vendorName": isRental ? trimmedVendorName : null,
            "equipmentDetails.quotedCost": isRental ? quotedCost : null,
            "equipmentDetails.processedById": userId,
            "equipmentDetails.processedAt": processedAt,
            ...(isRental
              ? {
                  requestCategory: "OPS",
                  requestedAmount: quotedCost,
                  recipientName: trimmedVendorName,
                  requestPaymentDescription: `Sewa alat: ${ticket.equipmentDetails?.equipmentName ?? ticket.title}`,
                }
              : {}),
            updatedAt: processedAt,
          },
        },
        { session: transactionSession },
      );
      if (updated.modifiedCount !== 1) {
        throw new Error("Tiket sudah berubah. Muat ulang sebelum memproses.");
      }

      await TicketAuditLog.create(
        [
          {
            _id: randomUUID(),
            ticketId,
            userId,
            action: isRental
              ? "LOGISTICS_EQUIPMENT_RENTAL"
              : "LOGISTICS_EQUIPMENT_INTERNAL",
            notes: isRental
              ? `Disiapkan melalui vendor ${trimmedVendorName} dengan estimasi biaya ${quotedCost}.`
              : "Dipenuhi menggunakan alat internal.",
          },
        ],
        { session: transactionSession },
      );

      const recipientIds = new Set([ticket.requesterId]);
      if (isRental) {
        const financeUsers = await User.find({
          isActive: true,
          role: { $in: ["FINANCE", "KEUANGAN"] },
        })
          .select({ _id: 1 })
          .session(transactionSession)
          .lean();
        financeUsers.forEach((financeUser) =>
          recipientIds.add(String(financeUser._id)),
        );
      }
      await Notification.create(
        [...recipientIds].map((recipientId) => ({
          _id: randomUUID(),
          userId: recipientId,
          title: isRental
            ? "Permintaan Sewa Alat Menunggu Pembayaran"
            : "Permintaan Alat Dipenuhi",
          message: isRental
            ? `${ticket.ticketNumber} · sewa melalui ${trimmedVendorName} menunggu pembayaran Finance.`
            : `${ticket.ticketNumber} · permintaan alat dipenuhi dari aset internal.`,
          type: isRental ? "INFO" : "SUCCESS",
          actionUrl: isRental
            ? `/apps/finance?tab=payment`
            : `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
        })),
        { session: transactionSession },
      );
    });

    revalidatePath("/apps/logistics");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/finance");
    return {
      success: true as const,
      message:
        source === "EXTERNAL_VENDOR"
          ? "Permintaan sewa diteruskan ke Finance untuk pembayaran."
          : "Permintaan dipenuhi menggunakan alat internal.",
    };
  } catch (error) {
    console.error("Processing equipment request at logistics failed:", error);
    return failure("Pemrosesan Logistik gagal disimpan. Silakan coba kembali.");
  }
}

type EquipmentPaymentProof = File | File[] | string;

async function storeEquipmentPaymentProofs(proof: EquipmentPaymentProof) {
  const proofs = Array.isArray(proof) ? proof : [proof];
  if (
    proofs.length < 1 ||
    proofs.length > 5 ||
    proofs.some(
      (item) =>
        typeof item !== "string" &&
        (!(item instanceof File) ||
          item.size < 1 ||
          item.size > 5 * 1024 * 1024),
    )
  ) {
    throw new Error("Pilih 1–5 bukti pembayaran PDF/JPG/PNG/WEBP, maksimal 5 MB per file.");
  }

  const storedUrls: string[] = [];
  const uploadedUrls: string[] = [];
  try {
    for (const item of proofs) {
      if (typeof item === "string") {
        if (!isFinancePaymentProofUrl(item)) {
          throw new Error("URL bukti pembayaran tidak valid.");
        }
        storedUrls.push(item);
        continue;
      }

      const expectedMime = getFinancePaymentProofMimeType(item);
      if (!expectedMime) {
        throw new Error("Format bukti pembayaran harus PDF, JPG, PNG, atau WEBP.");
      }
      const bytes = new Uint8Array(await item.arrayBuffer());
      const detectedMime = expectedMime === "application/pdf"
        ? hasPdfSignature(bytes)
          ? "application/pdf"
          : null
        : detectImageMimeFromBytes(bytes);
      if (detectedMime !== expectedMime) {
        throw new Error("Isi file bukti tidak sesuai dengan formatnya.");
      }
      const normalizedFile = normalizeFinancePaymentProofFile(item);
      if (!normalizedFile) {
        throw new Error("File bukti pembayaran tidak dapat diproses.");
      }

      const url =
        expectedMime === "application/pdf"
          ? await saveTicketReceipt(normalizedFile)
          : (
              await uploadCloudinaryPhoto(
                normalizedFile,
                FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER,
              )
            ).secureUrl;
      uploadedUrls.push(url);
      if (!isFinancePaymentProofUrl(url)) {
        throw new Error("Penyimpanan bukti pembayaran menghasilkan URL tidak valid.");
      }
      storedUrls.push(url);
    }
    return { storedUrls, uploadedUrls };
  } catch (error) {
    await Promise.all(
      uploadedUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove unattached equipment payment proof:", cleanupError);
        }
      }),
    );
    throw error;
  }
}

export async function submitEquipmentRentalPayment(input: {
  ticketId: string;
  proof: EquipmentPaymentProof;
  transferDestination: string;
  financeAccountId: string;
  paymentType: PaymentType;
  amount?: number;
}) {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (!userId || session.user.role !== "FINANCE") {
    return failure("Hanya Keuangan yang dapat menyelesaikan pembayaran.");
  }
  if (
    typeof input?.ticketId !== "string" ||
    input.ticketId.trim().length === 0 ||
    input.ticketId.length > 64 ||
    typeof input.transferDestination !== "string" ||
    input.transferDestination.trim().length === 0 ||
    input.transferDestination.trim().length > 300 ||
    typeof input.financeAccountId !== "string" ||
    input.financeAccountId.trim().length === 0 ||
    input.financeAccountId.length > 100 ||
    !Object.values(PaymentType).includes(input.paymentType) ||
    (input.paymentType !== PaymentType.FULL_PAYMENT &&
      (!Number.isFinite(input.amount) || (input.amount ?? 0) <= 0))
  ) {
    return failure("Data pembayaran atau tujuan transfer tidak valid.");
  }

  let uploadedUrls: string[] = [];
  try {
    const mongoose = await connectToMongoDB();
    const financeUser = await User.findById(userId)
      .select({ isActive: 1, role: 1 })
      .lean();
    if (
      !financeUser?.isActive ||
      (financeUser.role !== "FINANCE" && financeUser.role !== "KEUANGAN")
    ) {
      return failure("Akun Keuangan tidak aktif atau tidak memiliki izin.");
    }
    const ticket = await Ticket.findOne({
      _id: input.ticketId,
      ticketType: EQUIPMENT_REQUEST_TYPE,
      status: "WAITING_FINANCE_PAYMENT",
      "equipmentDetails.fulfillmentSource": "EXTERNAL_VENDOR",
    })
      .select({
        ticketNumber: 1,
        title: 1,
        requesterId: 1,
        projectId: 1,
        requestedAmount: 1,
        totalAmount: 1,
      })
      .lean();
    if (!ticket) {
      return failure("Tiket sewa tidak ditemukan atau belum siap dibayar.");
    }

    const totalAmount =
      ticket.requestedAmount ??
      (ticket.totalAmount ? Number(ticket.totalAmount) / 1000 : 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return failure("Total tagihan sewa alat tidak valid.");
    }

    const { storedUrls, uploadedUrls: newUploads } =
      await storeEquipmentPaymentProofs(input.proof);
    uploadedUrls = newUploads;
    await mongoose.connection.transaction(async (transactionSession) => {
      const currentTicket = await Ticket.findOne({
        _id: input.ticketId,
        ticketType: EQUIPMENT_REQUEST_TYPE,
        status: "WAITING_FINANCE_PAYMENT",
        "equipmentDetails.fulfillmentSource": "EXTERNAL_VENDOR",
      })
        .session(transactionSession)
        .select({
          ticketNumber: 1,
          title: 1,
          requesterId: 1,
          projectId: 1,
          requestedAmount: 1,
          totalAmount: 1,
        });
      if (!currentTicket) {
        throw new Error("Tiket sewa sudah berubah atau tidak dapat dibayar.");
      }

      const transactionTotal =
        currentTicket.requestedAmount ??
        (currentTicket.totalAmount
          ? Number(currentTicket.totalAmount) / 1000
          : 0);
      const previousPayments = await PaymentTransaction.find({
        ticketId: input.ticketId,
        status: "PAID",
      })
        .session(transactionSession)
        .select({ amount: 1, paymentType: 1 })
        .lean();
      const paidAmount = previousPayments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
      if (
        input.paymentType === PaymentType.DOWN_PAYMENT &&
        previousPayments.length > 0
      ) {
        throw new Error("Uang muka hanya dapat digunakan pada pembayaran pertama.");
      }
      const remainingAmount =
        Math.round((transactionTotal - paidAmount) * 100) / 100;
      const amount =
        input.paymentType === PaymentType.FULL_PAYMENT
          ? remainingAmount
          : Math.round((input.amount ?? 0) * 100) / 100;
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > remainingAmount
      ) {
        throw new Error("Nominal pembayaran melebihi sisa tagihan atau tidak valid.");
      }

      const financeAccount = await FinanceAccount.findOneAndUpdate(
        {
          _id: input.financeAccountId,
          balance: { $gte: amount },
        },
        { $inc: { balance: -amount } },
        { new: true, session: transactionSession },
      ).select({ _id: 1 });
      if (!financeAccount) {
        const accountExists = await FinanceAccount.exists({
          _id: input.financeAccountId,
        }).session(transactionSession);
        throw new Error(
          accountExists
            ? "Saldo buku bank/kas tidak mencukupi."
            : "Buku bank/kas sumber pembayaran tidak ditemukan.",
        );
      }

      const paidAt = new Date();
      const paymentId = randomUUID();
      await PaymentTransaction.create(
        [
          {
            _id: paymentId,
            ticketId: input.ticketId,
            paymentType: input.paymentType,
            amount,
            transferDestination: input.transferDestination.trim(),
            status: "PAID",
            processedById: userId,
            proofOfTransferUrl: storedUrls[0],
            additionalProofUrls: storedUrls.slice(1),
            proofEditDisabledUrls: storedUrls,
            paidAt,
          },
        ],
        { session: transactionSession },
      );
      await Cashflow.create(
        [
          {
            _id: randomUUID(),
            type: "OUT",
            amount,
            sourceDesc: `Pembayaran ${currentTicket.ticketNumber} · ${currentTicket.title}`,
            projectId: currentTicket.projectId ?? null,
            paymentMethod: "TRANSFER",
            proofUrl: storedUrls[0],
            accountId: input.financeAccountId,
            recordedBy: userId,
            paymentTransactionId: paymentId,
            createdAt: paidAt,
          },
        ],
        { session: transactionSession },
      );

      const isFullyPaid = amount >= remainingAmount;
      const updated = await Ticket.updateOne(
        {
          _id: input.ticketId,
          status: "WAITING_FINANCE_PAYMENT",
        },
        {
          $set: {
            ...(isFullyPaid
              ? {
                  status: "COMPLETED",
                  fulfillmentStatus: "COMPLETED",
                }
              : {}),
            transferReceiptUrl: storedUrls[0],
            transferDestination: input.transferDestination.trim(),
            updatedAt: paidAt,
          },
        },
        { session: transactionSession },
      );
      if (updated.modifiedCount !== 1) {
        throw new Error("Status tiket berubah saat pembayaran disimpan.");
      }

      await TicketAuditLog.create(
        [
          {
            _id: randomUUID(),
            ticketId: input.ticketId,
            userId,
            action: isFullyPaid
              ? "FINANCE_PAYMENT_COMPLETED"
              : "FINANCE_PAYMENT_PARTIAL",
            notes: `${input.paymentType === PaymentType.DOWN_PAYMENT ? "Uang muka" : input.paymentType === PaymentType.PROGRESS_PAYMENT ? "Pembayaran termin" : "Pelunasan"} sebesar Rp${amount.toLocaleString("id-ID")}; sisa tagihan Rp${Math.max(0, transactionTotal - paidAmount - amount).toLocaleString("id-ID")}.`,
          },
        ],
        { session: transactionSession },
      );
      await Notification.create(
        [
          {
            _id: randomUUID(),
            userId: currentTicket.requesterId,
            title: isFullyPaid
              ? "Sewa Alat Telah Dibayar"
              : "Pembayaran Sewa Alat Dicatat",
            message: `${currentTicket.ticketNumber} · pembayaran Rp${amount.toLocaleString("id-ID")} telah dicatat Finance.`,
            type: isFullyPaid ? "SUCCESS" : "INFO",
            actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(input.ticketId)}`,
          },
        ],
        { session: transactionSession },
      );
    });

    uploadedUrls = [];
    revalidatePath("/apps/finance");
    revalidatePath("/apps/tickets");
    revalidatePath("/apps/logistics");
    return {
      success: true as const,
      message: "Pembayaran sewa alat berhasil dicatat.",
    };
  } catch (error) {
    console.error("Submitting equipment rental payment failed:", error);
    await Promise.all(
      uploadedUrls.map(async (url) => {
        try {
          await removeTicketReceipt(url);
        } catch (cleanupError) {
          console.error("Failed to remove unattached equipment payment proof:", cleanupError);
        }
      }),
    );
    return failure(
      error instanceof Error
        ? error.message
        : "Pembayaran sewa alat gagal diproses.",
    );
  }
}

export async function createEquipmentRequest(
  input: CreateEquipmentRequestInput,
) {
  const session = await authForProxy();
  const userId = session?.user?.id;
  if (!userId) {
    return failure("Silakan masuk sebelum membuat permintaan alat.");
  }

  if (
    !input ||
    typeof input.projectId !== "string" ||
    input.projectId.length === 0 ||
    input.projectId.length > 64 ||
    typeof input.equipmentName !== "string" ||
    input.equipmentName.trim().length < 2 ||
    input.equipmentName.trim().length > 120 ||
    typeof input.startDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0 ||
    !EQUIPMENT_TIME_UNITS.includes(input.timeUnit) ||
    !validPriorities.includes(input.priority)
  ) {
    return failure("Rincian permintaan alat tidak valid.");
  }

  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  if (
    Number.isNaN(startDate.getTime()) ||
    startDate.toISOString().slice(0, 10) !== input.startDate
  ) {
    return failure("Tanggal mulai pemakaian tidak valid.");
  }

  try {
    const mongoose = await connectToMongoDB();
    const account = await User.findById(userId)
      .select({ isActive: 1, role: 1 })
      .lean();
    if (
      !account?.isActive ||
      ![
        "FIELD_TEAM",
        "TIM_LAPANGAN",
        "KOORDINATOR",
        "KOORDINATOR_LAPANGAN",
      ].includes(account.role)
    ) {
      return failure(
        "Permintaan alat hanya dapat dibuat Tim Lapangan atau Koordinator Lapangan yang aktif.",
      );
    }

    const project = await Project.findById(input.projectId)
      .select({ fieldPicId: 1 })
      .lean();
    if (!project) {
      return failure("Proyek yang dipilih tidak ditemukan.");
    }
    if (
      (account.role === "FIELD_TEAM" || account.role === "TIM_LAPANGAN") &&
      project.fieldPicId !== userId
    ) {
      return failure("Anda bukan PIC lapangan untuk proyek yang dipilih.");
    }

    const now = new Date();
    const prefix = `TKT-${now.getUTCFullYear()}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}-`;
    const sequence = await DocumentNumberSequence.findOneAndUpdate(
      { kind: prefix, year: 0 },
      {
        $inc: { value: 1 },
        $setOnInsert: { _id: randomUUID(), kind: prefix, year: 0 },
      },
      { upsert: true, new: true },
    ).lean();
    if (!sequence) {
      throw new Error("Ticket number sequence could not be generated.");
    }

    const ticketId = randomUUID();
    const ticketNumber = `${prefix}${String(sequence.value).padStart(3, "0")}`;
    const equipmentName = input.equipmentName.trim();
    const description = [
      `Jenis permintaan: Permintaan Alat Berat & Kendaraan`,
      `Nama alat/kendaraan: ${equipmentName}`,
      `Tanggal mulai pemakaian: ${input.startDate}`,
      `Durasi pemakaian: ${input.duration} ${input.timeUnit.toLowerCase()}`,
    ].join("\n");

    await mongoose.connection.transaction(async (transactionSession) => {
      await Ticket.create(
        [
          {
            _id: ticketId,
            ticketNumber,
            title: `Permintaan Alat Berat & Kendaraan: ${equipmentName}`,
            description,
            type: "OPERATIONAL",
            ticketType: EQUIPMENT_REQUEST_TYPE,
            equipmentDetails: {
              equipmentName,
              startDate,
              duration: input.duration,
              timeUnit: input.timeUnit,
            },
            requestCategory: "OPS",
            priority: input.priority,
            status: "PENDING_LOGISTIK",
            fulfillmentStatus: "PENDING",
            requesterId: userId,
            projectId: input.projectId,
          },
        ],
        { session: transactionSession },
      );

      await TicketAuditLog.create(
        [
          {
            _id: randomUUID(),
            ticketId,
            userId,
            action: "CREATED",
            notes: "Permintaan alat diajukan langsung ke antrean Logistik.",
          },
        ],
        { session: transactionSession },
      );

      const logisticsUsers = await User.find({
        isActive: true,
        role: { $in: ["LOGISTICS", "KOORDINATOR_LOGISTIK"] },
      })
        .select({ _id: 1 })
        .session(transactionSession)
        .lean();
      if (logisticsUsers.length > 0) {
        await Notification.create(
          logisticsUsers.map((logisticsUser) => ({
            _id: randomUUID(),
            userId: String(logisticsUser._id),
            title: "Permintaan Alat Menunggu Logistik",
            message: `${ticketNumber} · Permintaan ${equipmentName} menunggu diproses.`,
            type: "APPROVAL",
            actionUrl: `/apps/tickets?openSheet=${encodeURIComponent(ticketId)}`,
          })),
          { session: transactionSession },
        );
      }
    });

    revalidatePath("/apps/tickets");
    revalidatePath("/apps/logistics");
    revalidatePath("/apps/projects");
    revalidatePath(`/apps/projects/${input.projectId}`);
    return {
      success: true as const,
      message: "Permintaan alat berhasil dikirim ke antrean Logistik.",
      ticketNumber,
    };
  } catch (error) {
    console.error("Creating equipment request failed:", error);
    return failure("Permintaan alat gagal disimpan. Silakan coba kembali.");
  }
}
