"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../../auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFinanceCashflowProofUrl } from "@/lib/finance-cashflow";
import {
  removeUploadedCashflowProof,
  uploadCashflowProof,
} from "@/app/actions/finance-cashflow";

const expenseTypes = ["SALARY", "ADVANCE", "REIMBURSEMENT"] as const;
const paymentMethods = ["CASH", "TRANSFER"] as const;

export type UpdateOfficeExpenseInput = {
  id: string;
  transactionDate?: string;
  amount?: number;
  newProofFiles?: File[];
  keepProofUrls?: string[];
  description?: string;
};

export async function updateOfficeExpense(
  input: UpdateOfficeExpenseInput,
): Promise<OfficeExpenseActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return {
      success: false,
      message: "Hanya Keuangan atau Direktur yang dapat mengubah data pengeluaran.",
    };
  }
  if (!input || typeof input.id !== "string" || !input.id.trim()) {
    return { success: false, message: "ID pengeluaran tidak valid." };
  }

  const existing = await prisma.officeExpense.findUnique({
    where: { id: input.id },
    include: { account: true, cashflow: true },
  });
  if (!existing) {
    return { success: false, message: "Data pengeluaran tidak ditemukan." };
  }

  const newAmount =
    input.amount !== undefined && Number.isFinite(input.amount) && input.amount > 0
      ? input.amount
      : existing.amount;

  const diff = newAmount - existing.amount;
  if (diff > 0 && existing.account.balance < diff) {
    return {
      success: false,
      message: `Saldo akun tidak mencukupi untuk penambahan nominal (Kurang Rp ${Math.round(diff).toLocaleString("id-ID")}).`,
    };
  }

  const uploadedProofUrls: string[] = [];
  try {
    if (Array.isArray(input.newProofFiles) && input.newProofFiles.length > 0) {
      for (const file of input.newProofFiles) {
        if (
          file instanceof File &&
          file.size > 0 &&
          file.size <= 5 * 1024 * 1024 &&
          ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)
        ) {
          uploadedProofUrls.push(await uploadCashflowProof(file));
        }
      }
    }

    const keepUrls = input.keepProofUrls
      ? input.keepProofUrls.filter((url) => existing.proofUrls.includes(url))
      : existing.proofUrls;

    const finalProofUrls = [...keepUrls, ...uploadedProofUrls];
    if (finalProofUrls.length === 0) {
      return {
        success: false,
        message: "Minimal harus ada satu bukti foto/struk transaksi.",
      };
    }

    const effectiveDate = input.transactionDate
      ? parseTransactionDate(input.transactionDate)
      : existing.createdAt;

    await prisma.$transaction(async (tx) => {
      if (diff !== 0) {
        await tx.financeAccount.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: diff } },
        });
      }

      await tx.cashflow.update({
        where: { id: existing.cashflowId },
        data: {
          amount: newAmount,
          createdAt: effectiveDate,
          proofUrl: finalProofUrls[0],
          ...(input.description?.trim()
            ? { sourceDesc: `[${existing.expenseType}] ${input.description.trim()}` }
            : {}),
        },
      });

      await tx.officeExpense.update({
        where: { id: existing.id },
        data: {
          amount: newAmount,
          createdAt: effectiveDate,
          proofUrls: finalProofUrls,
          ...(input.description?.trim()
            ? { description: input.description.trim() }
            : {}),
        },
      });
    });

    revalidatePath("/apps/finance");
    return {
      success: true,
      message: "Data pengeluaran berhasil diperbarui (Tanggal, Nominal, dan Bukti Foto).",
    };
  } catch (error) {
    await Promise.all(
      uploadedProofUrls.map(async (url) => {
        await removeUploadedCashflowProof(url);
      }),
    );
    console.error("Updating office expense failed:", error);
    return {
      success: false,
      message: "Gagal memperbarui pengeluaran. Silakan coba kembali.",
    };
  }
}

export type OfficeExpenseInput = {
  expenseType: (typeof expenseTypes)[number];
  description: string;
  amount: number;
  recipientId: string;
  accountId: string;
  paymentMethod: (typeof paymentMethods)[number];
  proofFiles: File[];
  transactionDate?: string;
};

export type OfficeExpenseActionResult = {
  success: boolean;
  message: string;
};

class OfficeExpenseError extends Error {}

function isFinanceOperator(role: UserRole): boolean {
  return (
    role === UserRole.FINANCE ||
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR
  );
}

function parseTransactionDate(dateStr?: string): Date {
  if (!dateStr || typeof dateStr !== "string") {
    return new Date();
  }
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date();
  }
  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0),
  );
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maximum
  );
}

export async function recordOfficeExpense(
  input: OfficeExpenseInput,
): Promise<OfficeExpenseActionResult> {
  const session = await auth();
  if (!session?.user || !isFinanceOperator(session.user.role)) {
    return { success: false, message: "Hanya Keuangan yang dapat mencatat pengeluaran internal." };
  }
  if (
    !input ||
    !expenseTypes.includes(input.expenseType) ||
    !paymentMethods.includes(input.paymentMethod) ||
    !isBoundedText(input.description, 1000) ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > 1_000_000_000_000_000 ||
    Math.abs(input.amount * 100 - Math.round(input.amount * 100)) >= 1e-8 ||
    !isBoundedText(input.recipientId, 100) ||
    !isBoundedText(input.accountId, 100) ||
    !Array.isArray(input.proofFiles) ||
    input.proofFiles.length > 5 ||
    input.proofFiles.length <
      (input.expenseType === "REIMBURSEMENT" ? 2 : 1) ||
    input.proofFiles.some(
      (file) =>
        !(file instanceof File) ||
        file.size < 1 ||
        file.size > 5 * 1024 * 1024 ||
        ![
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
        ].includes(file.type),
    )
  ) {
    return {
      success: false,
      message: "Data pengeluaran atau bukti transaksi tidak valid.",
    };
  }

  const [recipientBeforeUpload, accountBeforeUpload] = await Promise.all([
    prisma.user.findFirst({
      where: { id: input.recipientId, isActive: true },
      select: { id: true },
    }),
    prisma.financeAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true, balance: true },
    }),
  ]);
  if (!recipientBeforeUpload) {
    return { success: false, message: "Penerima tidak ditemukan atau tidak aktif." };
  }
  if (!accountBeforeUpload) {
    return { success: false, message: "Akun kas/bank sumber dana tidak ditemukan." };
  }
  if (accountBeforeUpload.balance < input.amount) {
    return { success: false, message: "Saldo di akun kas/bank ini tidak mencukupi!" };
  }

  const uploadedProofUrls: string[] = [];
  try {
    for (const file of input.proofFiles) {
      uploadedProofUrls.push(await uploadCashflowProof(file));
    }
    if (uploadedProofUrls.some((url) => !isFinanceCashflowProofUrl(url))) {
      throw new OfficeExpenseError("URL bukti transaksi tidak valid.");
    }

    const effectiveDate = parseTransactionDate(input.transactionDate);

    await prisma.$transaction(async (transaction) => {
      const recipient = await transaction.user.findFirst({
        where: { id: input.recipientId, isActive: true },
        select: { id: true },
      });
      if (!recipient) {
        throw new OfficeExpenseError("Penerima tidak ditemukan atau tidak aktif.");
      }

      const debit = await transaction.financeAccount.updateMany({
        where: {
          id: input.accountId,
          balance: { gte: input.amount },
        },
        data: { balance: { decrement: input.amount } },
      });
      if (debit.count !== 1) {
        const account = await transaction.financeAccount.findUnique({
          where: { id: input.accountId },
          select: { id: true },
        });
        throw new OfficeExpenseError(
          account
            ? "Saldo di akun kas/bank ini tidak mencukupi!"
            : "Akun kas/bank sumber dana tidak ditemukan.",
        );
      }

      const cashflow = await transaction.cashflow.create({
        data: {
          type: "OUT",
          amount: input.amount,
          sourceDesc: `[${input.expenseType}] ${input.description.trim()}`,
          paymentMethod: input.paymentMethod,
          proofUrl: uploadedProofUrls[0],
          accountId: input.accountId,
          recordedBy: session.user.id,
          createdAt: effectiveDate,
        },
        select: { id: true },
      });

      await transaction.officeExpense.create({
        data: {
          expenseType: input.expenseType,
          description: input.description.trim(),
          amount: input.amount,
          recipientId: input.recipientId,
          accountId: input.accountId,
          paymentMethod: input.paymentMethod,
          proofUrls: uploadedProofUrls,
          recordedBy: session.user.id,
          cashflowId: cashflow.id,
          createdAt: effectiveDate,
        },
      });
    });

    revalidatePath("/apps/finance");
    return { success: true, message: "Pengeluaran internal berhasil dicatat." };
  } catch (error) {
    await Promise.all(
      uploadedProofUrls.map(async (url) => {
        await removeUploadedCashflowProof(url);
      }),
    );
    if (error instanceof OfficeExpenseError) {
      return { success: false, message: error.message };
    }
    console.error("Recording office expense failed:", error);
    return {
      success: false,
      message: "Pengeluaran internal gagal dicatat. Silakan coba kembali.",
    };
  }
}
