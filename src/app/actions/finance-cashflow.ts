"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { PaymentStatus, UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  CloudinaryConfigurationError,
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  CloudinaryPrivatePdfValidationError,
  isCloudinaryPrivateTicketReceiptPdf,
} from "@/lib/cloudinary-private-pdfs";
import { removeTicketReceipt, saveTicketReceipt } from "@/lib/ticket-receipts";
import {
  isCashflowPaymentMethod,
  isFinanceCashflowProofUrl,
  type CashflowPaymentMethod,
} from "@/lib/finance-cashflow";
import {
  getFinancePaymentProofMimeType,
  normalizeFinancePaymentProofFile,
} from "@/lib/finance-payment-proof-file";
import { FINANCE_CASHFLOW_CLOUDINARY_FOLDER } from "@/lib/finance-cashflow-config";

export type FinanceActionResult = {
  success: boolean;
  message: string;
};

export type IncomingFundInput = {
  amount: number;
  sourceDesc: string;
  accountId: string;
  paymentMethod: CashflowPaymentMethod;
  senderName?: string;
  proof: File;
  projectId?: string;
  transactionDate?: string;
};

export type OutgoingFundInput = {
  amount: number;
  sourceDesc: string;
  accountId: string;
  paymentMethod: CashflowPaymentMethod;
  recipientName?: string;
  proof: File;
  projectId?: string;
  transactionDate?: string;
};

export type FinanceAccountInput = {
  accountName: string;
  accountNumber?: string;
  holderName: string;
};

export type FinanceTransferInput = {
  amount: number;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceDesc: string;
  proof: File;
  transactionDate?: string;
};

export type HistoricalPaymentCashflowInput = {
  paymentTransactionId: string;
  financeAccountId: string;
};

const fail = (message: string): FinanceActionResult => ({
  success: false,
  message,
});

function isFinanceOperator(role: UserRole): boolean {
  return (
    role === UserRole.FINANCE ||
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR
  );
}

function validAmount(amount: number): boolean {
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 1_000_000_000_000_000 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
  );
}

function isText(
  value: unknown,
  maxLength: number,
  minLength = 1,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.trim().length <= maxLength
  );
}

function isValidFinanceProofFile(file: unknown): file is File {
  return (
    file instanceof File &&
    file.size > 0 &&
    file.size <= 5 * 1024 * 1024 &&
    getFinancePaymentProofMimeType(file) !== null
  );
}

function parseTransactionDate(dateStr?: string | null): Date {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.trim()) {
    return new Date();
  }
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const now = new Date();
    const d = new Date(
      year,
      month - 1,
      day,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date();
}

export async function uploadCashflowProof(file: File): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !isFinanceOperator(session.user.role)) {
    throw new Error("Akses Keuangan diperlukan untuk mengunggah bukti transaksi.");
  }
  const normalizedFile = normalizeFinancePaymentProofFile(file);
  if (!normalizedFile) {
    throw new CloudinaryPhotoValidationError(
      "Format file bukti harus PDF, JPG, PNG, atau WEBP.",
    );
  }
  if (normalizedFile.type === "application/pdf") {
    const url = await saveTicketReceipt(normalizedFile);
    if (!isFinanceCashflowProofUrl(url)) {
      await removeTicketReceipt(url);
      throw new Error("URL PDF bukti transaksi tidak valid.");
    }
    return url;
  }

  const uploaded = await uploadCloudinaryPhoto(
    normalizedFile,
    FINANCE_CASHFLOW_CLOUDINARY_FOLDER,
  );
  if (!isFinanceCashflowProofUrl(uploaded.secureUrl)) {
    await removeCloudinaryPhoto(uploaded.secureUrl);
    throw new Error("Cloudinary mengembalikan URL foto bukti yang tidak valid.");
  }
  return uploaded.secureUrl;
}

export async function removeUploadedCashflowProof(url: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !isFinanceOperator(session.user.role)) {
    throw new Error("Akses Keuangan diperlukan untuk menghapus bukti transaksi.");
  }
  try {
    if (isCloudinaryPrivateTicketReceiptPdf(url)) {
      await removeTicketReceipt(url);
    } else {
      await removeCloudinaryPhoto(url);
    }
  } catch (error) {
    console.error("Removing unreferenced cashflow proof failed:", error);
  }
}

export async function listFinanceAccountsForPayments(): Promise<
  { id: string; accountName: string; balance: number }[]
> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) return [];

  return prisma.financeAccount.findMany({
    orderBy: { accountName: "asc" },
    select: { id: true, accountName: true, balance: true },
  });
}

export async function createFinanceAccount(
  input: FinanceAccountInput,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return fail("Hanya Keuangan yang dapat mengelola buku bank dan kas.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    !isText(input.accountName ?? "", 120) ||
    !isText(input.holderName ?? "", 120) ||
    (input.accountNumber !== undefined &&
      input.accountNumber !== null &&
      typeof input.accountNumber !== "string") ||
    (typeof input.accountNumber === "string" &&
      input.accountNumber.trim().length > 80)
  ) {
    return fail("Nama akun, pemilik, atau nomor rekening tidak valid.");
  }

  try {
    if (input.accountName.trim() === "Kas Tunai") {
      const existingCashAccount = await prisma.financeAccount.findFirst({
        where: { accountName: "Kas Tunai" },
        select: { id: true },
      });
      if (existingCashAccount) {
        return { success: true, message: "Akun Kas Tunai sudah tersedia." };
      }
    }
    await prisma.financeAccount.create({
      data: {
        accountName: input.accountName.trim(),
        accountNumber: input.accountNumber?.trim() || null,
        holderName: input.holderName.trim(),
      },
    });
  } catch (error) {
    console.error("Finance account creation failed:", error);
    return fail("Akun keuangan gagal dibuat. Silakan coba kembali.");
  }
  revalidatePath("/apps/finance");
  return { success: true, message: "Akun keuangan berhasil dibuat." };
}

export async function recordIncomingFund(
  input: IncomingFundInput,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return fail("Hanya Keuangan yang dapat mencatat dana masuk.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    !validAmount(input.amount) ||
    !isText(input.sourceDesc ?? "", 300, 3) ||
    !isText(input.accountId ?? "", 100) ||
    !isCashflowPaymentMethod(input.paymentMethod) ||
    (input.paymentMethod === "TRANSFER" &&
      !isText(input.senderName ?? "", 160)) ||
    (input.senderName !== undefined &&
      input.senderName !== null &&
      typeof input.senderName !== "string") ||
    (typeof input.senderName === "string" && input.senderName.length > 160) ||
    !isValidFinanceProofFile(input.proof) ||
    (input.projectId !== undefined &&
      input.projectId !== "" &&
      (typeof input.projectId !== "string" || input.projectId.length > 100))
  ) {
    return fail(
      "Data dana masuk tidak valid. Bukti harus PDF, JPG, PNG, atau WEBP maksimal 5 MB.",
    );
  }

  let proofUrl: string;
  try {
    proofUrl = await uploadCashflowProof(input.proof);
  } catch (error) {
    console.error("Incoming cashflow proof upload failed:", error);
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryConfigurationError ||
      error instanceof CloudinaryPrivatePdfValidationError
    ) {
      return fail(error.message);
    }
    return fail("Bukti dana masuk gagal diunggah. Silakan coba kembali.");
  }

  try {
    await prisma.$transaction(
      async (transaction) => {
        const account = await transaction.financeAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true },
        });
        if (!account) throw new Error("Buku bank/kas yang dipilih tidak ditemukan.");
        if (input.projectId) {
          const project = await transaction.project.findUnique({
            where: { id: input.projectId },
            select: { id: true },
          });
          if (!project) throw new Error("Proyek yang dipilih tidak ditemukan.");
        }

        const effectiveDate = parseTransactionDate(input.transactionDate);

        await transaction.financeAccount.update({
          where: { id: account.id },
          data: { balance: { increment: input.amount } },
        });
        await transaction.cashflow.create({
          data: {
            type: "IN",
            amount: input.amount,
            sourceDesc: input.sourceDesc.trim(),
            projectId: input.projectId || null,
            paymentMethod: input.paymentMethod,
            senderName:
              input.paymentMethod === "TRANSFER"
                ? input.senderName!.trim()
                : null,
            proofUrl,
            accountId: account.id,
            recordedBy: session.user.id,
            transferGroupId: null,
            createdAt: effectiveDate,
          },
        });
      },
    );
  } catch (error) {
    console.error("Incoming fund recording failed:", error);
    await removeUploadedCashflowProof(proofUrl);
    return fail(
      error instanceof Error &&
        (error.message.includes("tidak ditemukan") ||
          error.message.includes("tidak valid"))
        ? error.message
        : "Dana masuk gagal disimpan. Saldo akun tidak diubah.",
    );
  }

  revalidatePath("/apps/finance");
  return { success: true, message: "Dana masuk berhasil dicatat." };
}

export async function recordOutgoingFund(
  input: OutgoingFundInput,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return fail("Hanya Keuangan yang dapat mencatat dana keluar.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    !validAmount(input.amount) ||
    !isText(input.sourceDesc ?? "", 300, 3) ||
    !isText(input.accountId ?? "", 100) ||
    !isCashflowPaymentMethod(input.paymentMethod) ||
    !isValidFinanceProofFile(input.proof) ||
    (input.recipientName !== undefined &&
      input.recipientName !== null &&
      typeof input.recipientName !== "string") ||
    (typeof input.recipientName === "string" && input.recipientName.length > 160) ||
    (input.projectId !== undefined &&
      input.projectId !== "" &&
      (typeof input.projectId !== "string" || input.projectId.length > 100))
  ) {
    return fail(
      "Data dana keluar tidak valid. Bukti harus PDF, JPG, PNG, atau WEBP maksimal 5 MB.",
    );
  }

  let proofUrl: string;
  try {
    proofUrl = await uploadCashflowProof(input.proof);
  } catch (error) {
    console.error("Outgoing cashflow proof upload failed:", error);
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryConfigurationError ||
      error instanceof CloudinaryPrivatePdfValidationError
    ) {
      return fail(error.message);
    }
    return fail("Bukti transaksi gagal diunggah. Silakan coba kembali.");
  }

  try {
    await prisma.$transaction(
      async (transaction) => {
        const account = await transaction.financeAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true, balance: true },
        });
        if (!account) throw new Error("Buku bank/kas yang dipilih tidak ditemukan.");
        if (input.projectId) {
          const project = await transaction.project.findUnique({
            where: { id: input.projectId },
            select: { id: true },
          });
          if (!project) throw new Error("Proyek yang dipilih tidak ditemukan.");
        }

        const debit = await transaction.financeAccount.updateMany({
          where: {
            id: account.id,
            balance: { gte: input.amount },
          },
          data: { balance: { decrement: input.amount } },
        });
        if (debit.count !== 1) {
          throw new Error("Saldo buku bank/kas tidak mencukupi untuk pengeluaran ini.");
        }

        const effectiveDate = parseTransactionDate(input.transactionDate);

        await transaction.cashflow.create({
          data: {
            type: "OUT",
            amount: input.amount,
            sourceDesc: input.sourceDesc.trim(),
            projectId: input.projectId || null,
            paymentMethod: input.paymentMethod,
            senderName: input.recipientName?.trim() || null,
            proofUrl,
            accountId: account.id,
            recordedBy: session.user.id,
            transferGroupId: null,
            createdAt: effectiveDate,
          },
        });
      },
    );
  } catch (error) {
    console.error("Outgoing fund recording failed:", error);
    await removeUploadedCashflowProof(proofUrl);
    return fail(
      error instanceof Error &&
        (error.message.includes("tidak ditemukan") ||
          error.message.includes("tidak mencukupi") ||
          error.message.includes("tidak valid"))
        ? error.message
        : "Dana keluar gagal disimpan. Saldo akun tidak diubah.",
    );
  }

  revalidatePath("/apps/finance");
  return { success: true, message: "Dana keluar berhasil dicatat." };
}

export async function recordHistoricalPaymentCashflow(
  input: HistoricalPaymentCashflowInput,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return fail("Hanya Keuangan yang dapat mencatat pembayaran historis.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    !isText(input.paymentTransactionId ?? "", 100) ||
    !isText(input.financeAccountId ?? "", 100)
  ) {
    return fail("Pembayaran atau akun sumber tidak valid.");
  }

  try {
    await prisma.$transaction(
      async (transaction) => {
        const payment = await transaction.paymentTransaction.findUnique({
          where: { id: input.paymentTransactionId },
          select: {
            id: true,
            amount: true,
            transferDestination: true,
            proofOfTransferUrl: true,
            status: true,
            paidAt: true,
            cashflow: { select: { id: true } },
            ticket: {
              select: {
                ticketNumber: true,
                title: true,
                projectId: true,
              },
            },
            po: {
              select: {
                poNumber: true,
                vendorName: true,
                projectId: true,
              },
            },
            directStockPurchase: {
              select: {
                purchaseNumber: true,
                vendorName: true,
                ticket: { select: { projectId: true } },
              },
            },
          },
        });
        if (
          !payment ||
          payment.status !== PaymentStatus.PAID ||
          !payment.paidAt
        ) {
          throw new Error("Pembayaran lunas tidak ditemukan.");
        }
        if (payment.cashflow) {
          throw new Error("Pembayaran ini sudah tercatat di Buku Kas.");
        }

        const account = await transaction.financeAccount.findUnique({
          where: { id: input.financeAccountId },
          select: { id: true },
        });
        if (!account) throw new Error("Buku bank/kas sumber tidak ditemukan.");

        const source = payment.ticket
          ? {
              description: `${payment.ticket.ticketNumber} · ${payment.ticket.title}`,
              projectId: payment.ticket.projectId,
            }
          : payment.po
            ? {
                description: `${payment.po.poNumber} · ${payment.po.vendorName}`,
                projectId: payment.po.projectId,
              }
            : payment.directStockPurchase
              ? {
                  description: `${payment.directStockPurchase.purchaseNumber} · ${payment.directStockPurchase.vendorName}`,
                  projectId: payment.directStockPurchase.ticket?.projectId ?? null,
                }
              : null;
        if (!source) {
          throw new Error("Jenis transaksi ini tidak dapat dimasukkan ke Buku Kas.");
        }
        if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
          throw new Error("Nominal pembayaran historis tidak valid.");
        }

        const debit = await transaction.financeAccount.updateMany({
          where: {
            id: account.id,
            balance: { gte: payment.amount },
          },
          data: { balance: { decrement: payment.amount } },
        });
        if (debit.count !== 1) {
          throw new Error(
            "Saldo akun tidak mencukupi. Catat total dana masuk terlebih dahulu.",
          );
        }

        const paymentMethod = /cash|tunai/i.test(payment.transferDestination)
          ? "HISTORICAL_CASH"
          : "HISTORICAL_TRANSFER";
        await transaction.cashflow.create({
          data: {
            type: "OUT",
            amount: payment.amount,
            sourceDesc: source.description,
            projectId: source.projectId,
            paymentMethod,
            proofUrl: payment.proofOfTransferUrl,
            accountId: account.id,
            recordedBy: session.user.id,
            paymentTransactionId: payment.id,
            createdAt: payment.paidAt,
          },
        });
      },
    );
  } catch (error) {
    console.error("Historical payment cashflow recording failed:", error);
    return fail(
      error instanceof Error &&
        (error.message.includes("tidak ditemukan") ||
          error.message.includes("sudah tercatat") ||
          error.message.includes("tidak dapat") ||
        error.message.includes("tidak valid") ||
        error.message.includes("tidak mencukupi"))
        ? error.message
        : "Pembayaran historis gagal dicatat. Saldo rekening tidak diubah.",
    );
  }

  revalidatePath("/apps/finance");
  return {
    success: true,
    message: "Pembayaran historis masuk ke Buku Kas dan saldo akun berkurang.",
  };
}

export async function transferBetweenFinanceAccounts(
  input: FinanceTransferInput,
): Promise<FinanceActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return fail("Hanya Keuangan yang dapat memindahkan saldo antar akun.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    !validAmount(input.amount) ||
    !isText(input.sourceAccountId ?? "", 100) ||
    !isText(input.destinationAccountId ?? "", 100) ||
    input.sourceAccountId === input.destinationAccountId ||
    !isText(input.sourceDesc ?? "", 300, 3) ||
    !isValidFinanceProofFile(input.proof)
  ) {
    return fail(
      "Data transfer tidak valid. Bukti harus PDF, JPG, PNG, atau WEBP maksimal 5 MB.",
    );
  }

  let proofUrl: string;
  try {
    proofUrl = await uploadCashflowProof(input.proof);
  } catch (error) {
    console.error("Finance account transfer proof upload failed:", error);
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryConfigurationError ||
      error instanceof CloudinaryPrivatePdfValidationError
    ) {
      return fail(error.message);
    }
    return fail("Bukti transfer gagal diunggah. Silakan coba kembali.");
  }

  const transferGroupId = randomUUID();
  try {
    await prisma.$transaction(
      async (transaction) => {
        const [source, destination] = await Promise.all([
          transaction.financeAccount.findUnique({
            where: { id: input.sourceAccountId },
            select: { id: true, accountName: true },
          }),
          transaction.financeAccount.findUnique({
            where: { id: input.destinationAccountId },
            select: { id: true, accountName: true },
          }),
        ]);
        if (!source || !destination) {
          throw new Error("Buku bank/kas sumber atau tujuan tidak ditemukan.");
        }
        const debit = await transaction.financeAccount.updateMany({
          where: {
            id: source.id,
            balance: { gte: input.amount },
          },
          data: { balance: { decrement: input.amount } },
        });
        if (debit.count !== 1) {
          throw new Error("Saldo buku sumber tidak mencukupi.");
        }
        await transaction.financeAccount.update({
          where: { id: destination.id },
          data: { balance: { increment: input.amount } },
        });

        const effectiveDate = parseTransactionDate(input.transactionDate);
        const description = input.sourceDesc.trim();
        await transaction.cashflow.createMany({
          data: [
            {
              type: "OUT",
              amount: input.amount,
              sourceDesc: `${description} · Transfer ke ${destination.accountName}`,
              paymentMethod: "TRANSFER",
              senderName: null,
              proofUrl,
              accountId: source.id,
              recordedBy: session.user.id,
              transferGroupId,
              createdAt: effectiveDate,
            },
            {
              type: "IN",
              amount: input.amount,
              sourceDesc: `${description} · Transfer dari ${source.accountName}`,
              paymentMethod: "TRANSFER",
              senderName: source.accountName,
              proofUrl,
              accountId: destination.id,
              recordedBy: session.user.id,
              transferGroupId,
              createdAt: effectiveDate,
            },
          ],
        });
      },
    );
  } catch (error) {
    console.error("Finance account transfer failed:", error);
    await removeUploadedCashflowProof(proofUrl);
    return fail(
      error instanceof Error &&
        (error.message.includes("tidak ditemukan") ||
          error.message.includes("tidak mencukupi"))
        ? error.message
        : "Transfer antar akun gagal. Saldo kedua akun tidak diubah.",
    );
  }

  revalidatePath("/apps/finance");
  return { success: true, message: "Transfer antar buku berhasil dicatat." };
}
