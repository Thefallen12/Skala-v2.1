import type { Prisma } from "@prisma/client";

export async function acquireMongoTransactionLock(
  transaction: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await transaction.documentNumberSequence.upsert({
    where: { kind_year: { kind: `LOCK:${key}`, year: 0 } },
    update: { value: { increment: 1 } },
    create: { kind: `LOCK:${key}`, year: 0, value: 1 },
    select: { id: true },
  });
}
