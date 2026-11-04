import type { Prisma } from "@prisma/client";

export async function nextDocumentNumber(
  transaction: Prisma.TransactionClient,
  kind: "PO" | "DO" | "KO" | "INV" | "STOCK",
): Promise<string> {
  const year = new Date().getFullYear();
  const format = (value: number) =>
    `SPE-${new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(value)}/${kind}/${year}`;

  while (true) {
    const sequence = await transaction.documentNumberSequence.upsert({
      where: { kind_year: { kind, year } },
      update: { value: { increment: 1 } },
      create: { kind, year, value: 1 },
      select: { value: true },
    });
    const number = format(sequence.value);
    if (kind === "KO") {
      const [legacyPayment, confirmation] = await Promise.all([
        transaction.paymentTransaction.findUnique({
          where: { confirmationOrderNumber: number },
          select: { id: true },
        }),
        transaction.orderConfirmation.findUnique({
          where: { koNumber: number },
          select: { id: true },
        }),
      ]);
      if (!legacyPayment && !confirmation) return number;
      continue;
    }

    const existing =
      kind === "PO"
        ? await transaction.purchaseOrder.findUnique({
            where: { poNumber: number },
            select: { id: true },
          })
        : kind === "DO"
          ? await transaction.deliveryOrder.findUnique({
              where: { doNumber: number },
              select: { id: true },
            })
          : kind === "INV"
            ? await transaction.invoice.findUnique({
                where: { invoiceNumber: number },
                select: { id: true },
              })
            : await transaction.stockPurchase.findUnique({
                where: { purchaseNumber: number },
                select: { id: true },
              });
    if (!existing) return number;
  }
}
