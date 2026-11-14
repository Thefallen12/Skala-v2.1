"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PaymentStatus, UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import Cashflow from "@/models/cashflow";
import DirectStockPurchase from "@/models/direct-stock-purchase";
import FinanceAccount from "@/models/finance-account";
import PaymentTransaction from "@/models/payment-transaction";
import Project from "@/models/project";
import PurchaseOrder from "@/models/purchase-order";
import Ticket from "@/models/ticket";
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

  await connectToMongoDB();
  const accounts = await FinanceAccount.find({})
    .sort({ accountName: 1 })
    .select({ _id: 1, accountName: 1, balance: 1 })
    .lean();
  return accounts.map((account) => ({
    id: String(account._id),
    accountName: account.accountName,
    balance: account.balance,
  }));
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
    await connectToMongoDB();
    if (input.accountName.trim() === "Kas Tunai") {
      const existingCashAccount = await FinanceAccount.findOne({
        accountName: "Kas Tunai",
      })
        .select({ _id: 1 })
        .lean();
      if (existingCashAccount) {
        return { success: true, message: "Akun Kas Tunai sudah tersedia." };
      }
    }
    await FinanceAccount.create({
      _id: randomUUID(),
      accountName: input.accountName.trim(),
      accountNumber: input.accountNumber?.trim() || null,
      holderName: input.holderName.trim(),
      balance: 0,
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
    const mongoose = await connectToMongoDB();
    await mongoose.connection.transaction(async (transactionSession) => {
        const account = await FinanceAccount.findById(input.accountId)
          .select({ _id: 1 })
          .session(transactionSession)
          .lean();
        if (!account) {
          throw new Error("Buku bank/kas yang dipilih tidak ditemukan.");
        }
        if (input.projectId) {
          const project = await Project.exists({ _id: input.projectId }).session(
            transactionSession,
          );
          if (!project) throw new Error("Proyek yang dipilih tidak ditemukan.");
        }

        const effectiveDate = parseTransactionDate(input.transactionDate);

        const updatedAccount = await FinanceAccount.updateOne(
          { _id: account._id },
          { $inc: { balance: input.amount } },
          { session: transactionSession },
        );
        if (updatedAccount.modifiedCount !== 1) {
          throw new Error("Buku bank/kas yang dipilih tidak ditemukan.");
        }
        await Cashflow.create(
          [
            {
              _id: randomUUID(),
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
              accountId: String(account._id),
              recordedBy: session.user.id,
              transferGroupId: null,
              createdAt: effectiveDate,
            },
          ],
          { session: transactionSession },
        );
      });
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
    const mongoose = await connectToMongoDB();
    await mongoose.connection.transaction(async (transactionSession) => {
        const account = await FinanceAccount.findById(input.accountId)
          .select({ _id: 1 })
          .session(transactionSession)
          .lean();
        if (!account) throw new Error("Buku bank/kas yang dipilih tidak ditemukan.");
        if (input.projectId) {
          const project = await Project.exists({ _id: input.projectId }).session(
            transactionSession,
          );
          if (!project) throw new Error("Proyek yang dipilih tidak ditemukan.");
        }

        const debit = await FinanceAccount.updateOne(
          {
            _id: account._id,
            balance: { $gte: input.amount },
          },
          { $inc: { balance: -input.amount } },
          { session: transactionSession },
        );
        if (debit.modifiedCount !== 1) {
          throw new Error("Saldo buku bank/kas tidak mencukupi untuk pengeluaran ini.");
        }

        const effectiveDate = parseTransactionDate(input.transactionDate);

        await Cashflow.create(
          [
            {
              _id: randomUUID(),
              type: "OUT",
              amount: input.amount,
              sourceDesc: input.sourceDesc.trim(),
              projectId: input.projectId || null,
              paymentMethod: input.paymentMethod,
              senderName: input.recipientName?.trim() || null,
              proofUrl,
              accountId: String(account._id),
              recordedBy: session.user.id,
              transferGroupId: null,
              createdAt: effectiveDate,
            },
          ],
          { session: transactionSession },
        );
      });
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
    const mongoose = await connectToMongoDB();
    await mongoose.connection.transaction(async (transactionSession) => {
        const payment = await PaymentTransaction.findById(
          input.paymentTransactionId,
        )
          .session(transactionSession)
          .lean();
        if (
          !payment ||
          payment.status !== PaymentStatus.PAID ||
          !payment.paidAt
        ) {
          throw new Error("Pembayaran lunas tidak ditemukan.");
        }
        if (
          await Cashflow.exists({
            paymentTransactionId: input.paymentTransactionId,
          }).session(transactionSession)
        ) {
          throw new Error("Pembayaran ini sudah tercatat di Buku Kas.");
        }

        const account = await FinanceAccount.findById(input.financeAccountId)
          .select({ _id: 1 })
          .session(transactionSession)
          .lean();
        if (!account) throw new Error("Buku bank/kas sumber tidak ditemukan.");

        const ticket = payment.ticketId
          ? await Ticket.findById(payment.ticketId)
              .select({ ticketNumber: 1, title: 1, projectId: 1 })
              .session(transactionSession)
              .lean()
          : null;
        const purchaseOrder = payment.poId
          ? await PurchaseOrder.findById(payment.poId)
              .select({ poNumber: 1, vendorName: 1, projectId: 1 })
              .session(transactionSession)
              .lean()
          : null;
        const directPurchase = payment.directStockPurchaseId
          ? await DirectStockPurchase.findById(payment.directStockPurchaseId)
              .select({ purchaseNumber: 1, vendorName: 1, ticketId: 1 })
              .session(transactionSession)
              .lean()
          : null;
        const directPurchaseTicket = directPurchase?.ticketId
          ? await Ticket.findById(directPurchase.ticketId)
              .select({ projectId: 1 })
              .session(transactionSession)
              .lean()
          : null;
        const source = ticket
          ? {
              description: `${ticket.ticketNumber} · ${ticket.title}`,
              projectId: ticket.projectId,
            }
          : purchaseOrder
            ? {
                description: `${purchaseOrder.poNumber} · ${purchaseOrder.vendorName}`,
                projectId: purchaseOrder.projectId,
              }
            : directPurchase
              ? {
                  description: `${directPurchase.purchaseNumber} · ${directPurchase.vendorName}`,
                  projectId: directPurchaseTicket?.projectId ?? null,
                }
              : null;
        if (!source) {
          throw new Error("Jenis transaksi ini tidak dapat dimasukkan ke Buku Kas.");
        }
        if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
          throw new Error("Nominal pembayaran historis tidak valid.");
        }

        const debit = await FinanceAccount.updateOne(
          {
            _id: account._id,
            balance: { $gte: payment.amount },
          },
          { $inc: { balance: -payment.amount } },
          { session: transactionSession },
        );
        if (debit.modifiedCount !== 1) {
          throw new Error(
            "Saldo akun tidak mencukupi. Catat total dana masuk terlebih dahulu.",
          );
        }

        const paymentMethod = /cash|tunai/i.test(payment.transferDestination)
          ? "HISTORICAL_CASH"
          : "HISTORICAL_TRANSFER";
        await Cashflow.create(
          [
            {
              _id: randomUUID(),
              type: "OUT",
              amount: payment.amount,
              sourceDesc: source.description,
              projectId: source.projectId,
              paymentMethod,
              proofUrl: payment.proofOfTransferUrl,
              accountId: String(account._id),
              recordedBy: session.user.id,
              paymentTransactionId: String(payment._id),
              createdAt: payment.paidAt,
            },
          ],
          { session: transactionSession },
        );
      });
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
    const mongoose = await connectToMongoDB();
    await mongoose.connection.transaction(async (transactionSession) => {
        const [source, destination] = await Promise.all([
          FinanceAccount.findById(input.sourceAccountId)
            .select({ _id: 1, accountName: 1 })
            .session(transactionSession)
            .lean(),
          FinanceAccount.findById(input.destinationAccountId)
            .select({ _id: 1, accountName: 1 })
            .session(transactionSession)
            .lean(),
        ]);
        if (!source || !destination) {
          throw new Error("Buku bank/kas sumber atau tujuan tidak ditemukan.");
        }
        const debit = await FinanceAccount.updateOne(
          {
            _id: source._id,
            balance: { $gte: input.amount },
          },
          { $inc: { balance: -input.amount } },
          { session: transactionSession },
        );
        if (debit.modifiedCount !== 1) {
          throw new Error("Saldo buku sumber tidak mencukupi.");
        }
        const credit = await FinanceAccount.updateOne(
          { _id: destination._id },
          { $inc: { balance: input.amount } },
          { session: transactionSession },
        );
        if (credit.modifiedCount !== 1) {
          throw new Error("Akun tujuan tidak ditemukan.");
        }

        const effectiveDate = parseTransactionDate(input.transactionDate);
        const description = input.sourceDesc.trim();
        await Cashflow.create(
          [
            {
              _id: randomUUID(),
              type: "OUT",
              amount: input.amount,
              sourceDesc: `${description} · Transfer ke ${destination.accountName}`,
              paymentMethod: "TRANSFER",
              senderName: null,
              proofUrl,
              accountId: String(source._id),
              recordedBy: session.user.id,
              transferGroupId,
              createdAt: effectiveDate,
            },
            {
              _id: randomUUID(),
              type: "IN",
              amount: input.amount,
              sourceDesc: `${description} · Transfer dari ${source.accountName}`,
              paymentMethod: "TRANSFER",
              senderName: source.accountName,
              proofUrl,
              accountId: String(destination._id),
              recordedBy: session.user.id,
              transferGroupId,
              createdAt: effectiveDate,
            },
          ],
          { session: transactionSession },
        );
      });
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
