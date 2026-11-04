import type { Prisma } from "@prisma/client";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";

export async function lockTicketDeliveryOrderCreation(
  transaction: Prisma.TransactionClient,
) {
  await acquireMongoTransactionLock(transaction, "warehouse-stock-reservation");
}
