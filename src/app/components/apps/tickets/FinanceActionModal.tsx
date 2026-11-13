"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { submitPaymentRecord } from "@/app/actions/tickets";
import { listFinanceAccountsForPayments } from "@/app/actions/finance-cashflow";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import {
  PaymentType,
  POPaymentMethod,
  TicketRequestCategory,
} from "@prisma/client";
import {
  formatRupiahNumber,
  parseRupiahInput,
} from "@/lib/indonesian-currency";
import {
  FINANCE_PROOF_ACCEPT_ALL,
  prepareFinanceProofFile,
} from "@/lib/finance-proof-client";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";

type FinanceAccountOption = {
  id: string;
  accountName: string;
  balance: number;
};

const formatCurrency = (amount: string | null) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(amount));

export default function FinanceActionModal({
  open,
  ticket,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  ticket: Pick<
    TicketRow,
    | "id"
    | "ticketNumber"
    | "title"
    | "totalAmount"
    | "recipientName"
    | "bankName"
    | "accountNumber"
    | "requestCategory"
    | "requestPaymentMethod"
    | "requestPaymentDescription"
    | "transferDestination"
    | "purchaseOrders"
    | "paymentTransactions"
  >;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [paymentType, setPaymentType] = useState<PaymentType>(
    PaymentType.FULL_PAYMENT,
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const purchaseOrder = ticket.purchaseOrders?.[0];
  const amountPaid = ticket.paymentTransactions?.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  ) ?? 0;
  const isFirstPayment = (ticket.paymentTransactions?.length ?? 0) === 0;
  const currentPaymentType =
    !isFirstPayment && paymentType === PaymentType.DOWN_PAYMENT
      ? PaymentType.FULL_PAYMENT
      : paymentType;

  useEffect(() => {
    if (!open) return;
    let active = true;
    listFinanceAccountsForPayments()
      .then((result) => {
        if (active) setAccounts(result);
      })
      .catch((error) => {
        console.error("Finance account list failed to load:", error);
        if (active) setMessage("Daftar buku kas/bank gagal dimuat.");
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    const formData = new FormData(event.currentTarget);
    const transferDestination = String(
      formData.get("transferDestination") ?? "",
    );
    const financeAccountId = String(
      formData.get("financeAccountId") ?? "",
    );
    if (!financeAccountId) {
      setMessage("Pilih buku kas/bank sumber pembayaran terlebih dahulu.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitPaymentRecord({
          target: { kind: "ticket", id: ticket.id },
          file,
          transferDestination,
          financeAccountId,
          paymentType: currentPaymentType,
          amount:
            currentPaymentType === PaymentType.FULL_PAYMENT
              ? undefined
              : parseRupiahInput(paymentAmount),
        });
        setMessage(result.message);
        if (result.success) {
          setFile(null);
          setPaymentAmount("");
          setPaymentType(PaymentType.FULL_PAYMENT);
          onOpenChange(false);
          onSuccess();
        }
      } catch (error) {
        console.error("Finance ticket action failed:", error);
        setMessage("Pembayaran gagal diproses. Silakan coba kembali.");
      }
    });
  };
  const remainingAmount = Math.max(
    0,
    Number(ticket.totalAmount ?? 0) - amountPaid,
  );
  const defaultDestination =
    ticket.requestCategory === TicketRequestCategory.APH &&
    ticket.requestPaymentMethod === POPaymentMethod.CASH
      ? "Pembayaran tunai"
      : ticket.requestCategory === TicketRequestCategory.APH
        ? ticket.transferDestination ?? ""
      : purchaseOrder?.paymentBankName && purchaseOrder.paymentAccountNumber
      ? `Ditransfer ke: ${purchaseOrder.paymentBankName} & ${purchaseOrder.paymentAccountNumber}`
      : ticket.bankName && ticket.accountNumber
        ? `Ditransfer ke: ${ticket.bankName} & ${ticket.accountNumber}`
        : "";
  const isAPHRequest = ticket.requestCategory === TicketRequestCategory.APH;
  const isCashPayment =
    isAPHRequest && ticket.requestPaymentMethod === POPaymentMethod.CASH;

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        setFile(null);
        setPaymentAmount("");
        setPaymentType(PaymentType.FULL_PAYMENT);
        setMessage("");
        onOpenChange(false);
      }}
      title="Konfirmasi Pembayaran Finance"
      description={`Periksa nilai dan tujuan dana berikut, lalu unggah bukti ${isCashPayment ? "pembayaran tunai" : "transfer"}. File PDF, JPG, PNG, atau WEBP maksimal 5 MB.`}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Tutup
            </Button>
          </DialogClose>
          <Button
            type="submit"
            form="finance-action-form"
            disabled={
              !file ||
              isPending ||
              isPreparingFile ||
              accountsLoading ||
              accounts.length === 0 ||
              (currentPaymentType !== PaymentType.FULL_PAYMENT &&
                parseRupiahInput(paymentAmount) <= 0)
            }
          >
            {isPending
              ? "Menyimpan..."
              : isPreparingFile
                ? "Memproses File..."
                : currentPaymentType === PaymentType.FULL_PAYMENT
                  ? "Selesaikan Pembayaran"
                  : "Catat Pembayaran DP"}
          </Button>
        </div>
      }
    >
        <form id="finance-action-form" key={ticket.id} className="space-y-4" onSubmit={submit}>
          <section className="space-y-2 rounded-md border p-4 text-sm">
            <p className="font-semibold">
              {ticket.ticketNumber} · {ticket.title}
            </p>
            <p>
              <span className="text-muted-foreground">Biaya: </span>
              <span className="font-semibold">
                {formatCurrency(ticket.totalAmount)}
              </span>
            </p>
            {isAPHRequest && (
              <>
                <p>
                  <span className="text-muted-foreground">Type pembayaran: </span>
                  {isCashPayment ? "Cash" : "Transfer"}
                </p>
                {ticket.requestPaymentDescription && (
                  <p className="whitespace-pre-wrap">
                    <span className="text-muted-foreground">Keterangan: </span>
                    {ticket.requestPaymentDescription}
                  </p>
                )}
              </>
            )}
            <p>
              <span className="text-muted-foreground">Sisa tagihan: </span>
              <span className="font-semibold">
                {formatCurrency(String(remainingAmount))}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Nama penerima: </span>
              {ticket.recipientName || "Tidak dicantumkan"}
            </p>
            <p>
              <span className="text-muted-foreground">Bank: </span>
              {ticket.bankName || "Tidak dicantumkan"}
            </p>
            <p>
              <span className="text-muted-foreground">Nomor rekening: </span>
              {ticket.accountNumber || "Tidak dicantumkan"}
            </p>
          </section>
          <FormLabel className="block space-y-2 text-sm font-medium">
            {isCashPayment ? "Keterangan pembayaran tunai" : "Tujuan transfer"}
            <Input
              key={ticket.id}
              name="transferDestination"
              defaultValue={defaultDestination}
              placeholder={
                isCashPayment
                  ? "Keterangan penyerahan tunai"
                  : "Nama penerima, bank, atau nomor rekening tujuan"
              }
              maxLength={300}
              required
              disabled={isPending}
            />
          </FormLabel>
          <div className="space-y-2">
            <Label htmlFor="ticket-finance-account">
              Dibayar Dari (Buku Bank/Kas)
            </Label>
            <select
              id="ticket-finance-account"
              name="financeAccountId"
              required
              defaultValue=""
              disabled={isPending || accountsLoading || accounts.length === 0}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="" disabled>
                {accountsLoading
                  ? "Memuat akun..."
                  : "Pilih akun sumber pembayaran"}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} · {formatCurrency(String(account.balance))}
                </option>
              ))}
            </select>
            {accounts.length === 0 && !accountsLoading && (
              <p className="text-sm text-destructive" role="alert">
                Belum ada akun. Tambahkan buku bank/kas dari Finance Hub.
              </p>
            )}
          </div>
          <fieldset className="space-y-2 rounded-md border p-3 text-sm">
            <legend className="px-1 font-medium">Skema pembayaran</legend>
            <FormLabel className="flex items-center gap-2">
              <input
                type="radio"
                name="paymentType"
                checked={currentPaymentType === PaymentType.FULL_PAYMENT}
                onChange={() => setPaymentType(PaymentType.FULL_PAYMENT)}
              />
              Bayar Lunas (Full Payment)
            </FormLabel>
            {isFirstPayment && (
              <FormLabel className="flex items-center gap-2">
                <input
                  type="radio"
                  name="paymentType"
                  checked={currentPaymentType === PaymentType.DOWN_PAYMENT}
                  onChange={() => setPaymentType(PaymentType.DOWN_PAYMENT)}
                />
                Bayar Uang Muka (DP) / Sebagian
              </FormLabel>
            )}
            <FormLabel className="block space-y-2 font-medium">
              Nominal Pembayaran (Rp)
              <RupiahAmountInput
                id="finance-action-payment-amount"
                value={
                  currentPaymentType === PaymentType.FULL_PAYMENT
                    ? formatRupiahNumber(remainingAmount)
                    : paymentAmount
                }
                onChange={setPaymentAmount}
                required
                disabled={
                  isPending || currentPaymentType === PaymentType.FULL_PAYMENT
                }
              />
            </FormLabel>
          </fieldset>
          <FormLabel className="block space-y-2 text-sm font-medium">
            {isCashPayment
              ? "Upload Bukti Penyerahan Dana"
              : "Upload Bukti Transfer / Pengiriman Dana"}
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept={FINANCE_PROOF_ACCEPT_ALL}
                disabled={isPending || isPreparingFile}
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const rawFile = input.files?.[0] ?? null;
                  if (!rawFile) {
                    setFile(null);
                    return;
                  }
                  setIsPreparingFile(true);
                  setMessage("");
                  try {
                    const prepared = await prepareFinanceProofFile(rawFile);
                    setFile(prepared);
                  } catch (err) {
                    setFile(null);
                    input.value = "";
                    setMessage(
                      err instanceof Error
                        ? err.message
                        : "File bukti tidak valid.",
                    );
                  } finally {
                    setIsPreparingFile(false);
                  }
                }}
              />
              <InvoiceFilePreview
                file={file}
                title="Pratinjau Bukti Pembayaran"
                label="Pratinjau bukti pembayaran"
                tooltip="Pratinjau bukti pembayaran"
              />
            </div>
          </FormLabel>
          {message && (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </form>
    </GlobalModal>
  );
}
