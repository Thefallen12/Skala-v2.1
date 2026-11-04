import { Prisma } from "@prisma/client";

export async function recordFinanceCashflowOutflow(
  transaction: Prisma.TransactionClient,
  input: {
    paymentTransactionId?: string;
    financeAccountId: string;
    amount: number;
    sourceDesc: string;
    projectId?: string | null;
    paymentMethod: "TRANSFER" | "CASH";
    proofUrl: string | null;
    recordedBy: string;
  },
) {
  const debit = await transaction.financeAccount.updateMany({
    where: {
      id: input.financeAccountId,
      balance: { gte: input.amount },
    },
    data: { balance: { decrement: input.amount } },
  });
  if (debit.count !== 1) {
    const account = await transaction.financeAccount.findUnique({
      where: { id: input.financeAccountId },
      select: { id: true },
    });
    throw new Error(
      account
        ? "Saldo buku bank/kas tidak mencukupi. Catat saldo awal atau pilih akun lain."
        : "Buku bank/kas sumber pembayaran tidak ditemukan.",
    );
  }

  await transaction.cashflow.create({
    data: {
      type: "OUT",
      amount: input.amount,
      sourceDesc: input.sourceDesc,
      projectId: input.projectId ?? null,
      paymentMethod: input.paymentMethod,
      proofUrl: input.proofUrl,
      accountId: input.financeAccountId,
      recordedBy: input.recordedBy,
      paymentTransactionId: input.paymentTransactionId,
    },
  });
}
