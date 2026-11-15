import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";

const FINANCE_PROCESSED_AUDIT_ACTIONS = new Set([
  "FINANCE_PAYMENT_COMPLETED",
  "FINANCE_PAYMENT_PARTIAL",
  "DIRECT_PURCHASE_PAYMENT",
]);

/**
 * Menentukan apakah tiket sudah diproses oleh bagian Keuangan (Finance).
 * Jika sudah diproses Keuangan, Direktur maupun Wakil Direktur tidak dapat lagi
 * melakukan aksi edit, tambah barang, maupun hapus pada tiket tersebut.
 */
export function isTicketProcessedByFinance(
  ticket: Pick<
    TicketRow,
    | "status"
    | "paymentProofUrl"
    | "transferReceiptUrl"
    | "purchaseReceiptUrl"
    | "paymentTransactions"
    | "purchaseOrders"
    | "directStockPurchases"
    | "materialDeliveries"
    | "auditLogs"
  >,
): boolean {
  if (
    ticket.status === "PROCESSED_FINANCE" ||
    ticket.status === "COMPLETED"
  ) {
    return true;
  }

  if (
    Boolean(
      ticket.paymentProofUrl ||
        ticket.transferReceiptUrl ||
        ticket.purchaseReceiptUrl,
    )
  ) {
    return true;
  }

  if ((ticket.paymentTransactions?.length ?? 0) > 0) {
    return true;
  }

  if (
    (ticket.purchaseOrders ?? []).some((po) => Boolean(po.paidAt))
  ) {
    return true;
  }

  if (
    (ticket.directStockPurchases ?? []).some(
      (dp) => Boolean(dp.hasFinanceProof) || dp.status === "RECEIVED",
    )
  ) {
    return true;
  }

  if (
    (ticket.materialDeliveries ?? []).some(
      (md) => md.billingStatus === "BILLED",
    )
  ) {
    return true;
  }

  if (
    (ticket.auditLogs ?? []).some((log) =>
      FINANCE_PROCESSED_AUDIT_ACTIONS.has(log.action),
    )
  ) {
    return true;
  }

  return false;
}
