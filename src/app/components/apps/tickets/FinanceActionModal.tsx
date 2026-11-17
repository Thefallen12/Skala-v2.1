"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import {
  PaymentType,
  POPaymentMethod,
  POStatus,
  TicketRequestCategory,
} from "@prisma/client";
import { submitPaymentRecord } from "@/app/actions/tickets";
import { listFinanceAccountsForPayments } from "@/app/actions/finance-cashflow";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type TicketPurchaseOrderRow = NonNullable<TicketRow["purchaseOrders"]>[number];

const computePoGrandTotal = (order: TicketPurchaseOrderRow): number => {
  const subtotal = (order.items ?? []).reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );
  if (!order.includeTax) return Math.round(subtotal * 100) / 100;
  return Math.round(subtotal * 1.11 * 100) / 100;
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
  const [selectedPoCode, setSelectedPoCode] = useState("");
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [transferDestination, setTransferDestination] = useState("");
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const approvedPurchaseOrders = (ticket.purchaseOrders ?? []).filter(
    (order) => order.status === POStatus.APPROVED,
  );
  const unpaidPurchaseOrders = approvedPurchaseOrders.filter(
    (order) => !order.paidAt,
  );
  const purchaseOrder =
    unpaidPurchaseOrders.find((order) => order.publicCode === selectedPoCode) ??
    unpaidPurchaseOrders.find((order) => Boolean(order.vendorInvoiceUrl)) ??
    unpaidPurchaseOrders[0] ??
    approvedPurchaseOrders[0];

  const poScopedPayments = purchaseOrder
    ? (ticket.paymentTransactions ?? []).filter(
        (payment) => payment.reference === purchaseOrder.poNumber,
      )
    : [];
  const relevantPayments =
    approvedPurchaseOrders.length > 0 && purchaseOrder
      ? poScopedPayments
      : (ticket.paymentTransactions ?? []);
  const amountPaid = relevantPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const isFirstPayment = relevantPayments.length === 0;
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

  const totalFromAllApprovedPos =
    approvedPurchaseOrders.length > 0
      ? approvedPurchaseOrders.reduce(
          (sum, order) => sum + computePoGrandTotal(order),
          0,
        )
      : Number(ticket.totalAmount ?? 0);
  const selectedOrderTotal = purchaseOrder
    ? computePoGrandTotal(purchaseOrder) || Number(ticket.totalAmount ?? 0)
    : Number(ticket.totalAmount ?? 0);
  const remainingAmount = purchaseOrder?.paidAt
    ? 0
    : Math.max(0, selectedOrderTotal - amountPaid);

  const defaultDestination =
    ticket.requestCategory === TicketRequestCategory.APH &&
    ticket.requestPaymentMethod === POPaymentMethod.CASH
      ? "Pembayaran tunai"
      : ticket.requestCategory === TicketRequestCategory.APH
        ? (ticket.transferDestination ?? "")
        : purchaseOrder?.paymentBankName && purchaseOrder.paymentAccountNumber
          ? `Ditransfer ke: ${purchaseOrder.paymentBankName} & ${purchaseOrder.paymentAccountNumber}`
          : ticket.bankName && ticket.accountNumber
            ? `Ditransfer ke: ${ticket.bankName} & ${ticket.accountNumber}`
            : "";

  const resolvedTransferDestination =
    transferDestination || defaultDestination;

  const isAPHRequest = ticket.requestCategory === TicketRequestCategory.APH;
  const isCashPayment =
    isAPHRequest && ticket.requestPaymentMethod === POPaymentMethod.CASH;
  const hasApprovedPosWithoutAnyUnpaid =
    approvedPurchaseOrders.length > 0 && unpaidPurchaseOrders.length === 0;

  const resetModal = () => {
    setFile(null);
    setPaymentAmount("");
    setPaymentType(PaymentType.FULL_PAYMENT);
    setSelectedPoCode("");
    setFinanceAccountId("");
    setTransferDestination("");
    setMessage("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setMessage("Unggah bukti pembayaran terlebih dahulu.");
      return;
    }
    if (!financeAccountId) {
      setMessage("Pilih buku kas/bank sumber pembayaran terlebih dahulu.");
      return;
    }
    if (!resolvedTransferDestination.trim()) {
      setMessage("Tujuan transfer wajib diisi.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitPaymentRecord({
          target: {
            kind: "ticket",
            id: ticket.id,
            ...(purchaseOrder ? { poId: purchaseOrder.publicCode } : {}),
          },
          file,
          transferDestination: resolvedTransferDestination.trim(),
          financeAccountId,
          paymentType: currentPaymentType,
          amount:
            currentPaymentType === PaymentType.FULL_PAYMENT
              ? undefined
              : parseRupiahInput(paymentAmount),
        });
        if (result.success) {
          toast.success(result.message);
          resetModal();
          onOpenChange(false);
          onSuccess();
        } else {
          setMessage(result.message);
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Finance ticket action failed:", error);
        const errorMsg = "Pembayaran gagal diproses. Silakan coba kembali.";
        setMessage(errorMsg);
        toast.error(errorMsg);
      }
    });
  };

  const handleProofSelected = async (files: File[]) => {
    const rawFile = files[0] ?? null;
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
      setMessage(
        err instanceof Error ? err.message : "File bukti tidak valid.",
      );
    } finally {
      setIsPreparingFile(false);
    }
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        resetModal();
        onOpenChange(false);
      }}
      title="Pembayaran Finance"
      description={`Periksa rincian pembayaran lalu unggah bukti ${isCashPayment ? "penyerahan tunai" : "transfer"}.`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              resetModal();
              onOpenChange(false);
            }}
          >
            Tutup
          </Button>
          <Button
            type="submit"
            form="finance-action-form"
            disabled={
              !file ||
              isPending ||
              isPreparingFile ||
              accountsLoading ||
              accounts.length === 0 ||
              !financeAccountId ||
              hasApprovedPosWithoutAnyUnpaid ||
              (currentPaymentType !== PaymentType.FULL_PAYMENT &&
                parseRupiahInput(paymentAmount) <= 0)
            }
          >
            {isPending
              ? "Menyimpan..."
              : isPreparingFile
                ? "Memproses..."
                : currentPaymentType === PaymentType.FULL_PAYMENT
                  ? "Bayar Lunas"
                  : "Bayar DP"}
          </Button>
        </>
      }
    >
      <form
        id="finance-action-form"
        key={ticket.id}
        className="space-y-4"
        onSubmit={submit}
      >
        <section className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
          <p className="type-p1 font-semibold text-foreground">
            {ticket.ticketNumber} · {ticket.title}
          </p>

          {approvedPurchaseOrders.length > 0 && (
            <div className="space-y-1.5">
              <Label
                htmlFor="finance-po-select"
                className="type-p3 text-muted-foreground"
              >
                Purchase Order ({unpaidPurchaseOrders.length} belum lunas dari{" "}
                {approvedPurchaseOrders.length} PO)
              </Label>
              <Select
                value={purchaseOrder?.publicCode ?? ""}
                onValueChange={(value) => {
                  setSelectedPoCode(value);
                  setPaymentAmount("");
                  setPaymentType(PaymentType.FULL_PAYMENT);
                }}
                disabled={isPending}
              >
                <SelectTrigger id="finance-po-select" className="h-10 w-full">
                  <SelectValue placeholder="Pilih PO" />
                </SelectTrigger>
                <SelectContent>
                  {approvedPurchaseOrders.map((po) => {
                    const poTotal = computePoGrandTotal(po);
                    const statusText = po.paidAt
                      ? "Lunas"
                      : po.vendorInvoiceUrl
                        ? "Siap Bayar"
                        : "Belum Upload Invoice";
                    return (
                      <SelectItem key={po.publicCode} value={po.publicCode}>
                        {po.poNumber} · {po.vendorName} ·{" "}
                        {formatCurrency(String(poTotal))} ({statusText})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="type-p3 text-muted-foreground">
                {approvedPurchaseOrders.length > 1
                  ? "Total Seluruh PO"
                  : "Nominal Tagihan"}
              </dt>
              <dd className="type-p2 font-semibold text-foreground tabular-nums">
                {formatCurrency(String(totalFromAllApprovedPos))}
              </dd>
            </div>
            <div>
              <dt className="type-p3 text-muted-foreground">Sisa Tagihan</dt>
              <dd className="type-p2 font-semibold text-primary tabular-nums">
                {formatCurrency(String(remainingAmount))}
              </dd>
            </div>
            <div>
              <dt className="type-p3 text-muted-foreground">Nama Penerima</dt>
              <dd className="type-p2 font-medium text-foreground">
                {purchaseOrder?.paymentAccountName ||
                  purchaseOrder?.vendorName ||
                  ticket.recipientName ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="type-p3 text-muted-foreground">Bank &amp; Rekening</dt>
              <dd className="type-p2 font-medium text-foreground">
                {purchaseOrder?.paymentBankName || ticket.bankName || "—"} ·{" "}
                {purchaseOrder?.paymentAccountNumber ||
                  ticket.accountNumber ||
                  "—"}
              </dd>
            </div>
          </dl>

          {isAPHRequest && ticket.requestPaymentDescription && (
            <p className="type-p3 whitespace-pre-wrap text-muted-foreground">
              Keterangan: {ticket.requestPaymentDescription}
            </p>
          )}
        </section>

        <div className="space-y-1.5">
          <Label htmlFor="finance-transfer-dest" className="type-p2 font-medium">
            {isCashPayment ? "Keterangan Penyerahan Tunai" : "Tujuan Transfer"}
          </Label>
          <Input
            id="finance-transfer-dest"
            value={resolvedTransferDestination}
            onChange={(event) => setTransferDestination(event.target.value)}
            placeholder={
              isCashPayment
                ? "Keterangan penyerahan tunai"
                : "Nama penerima, bank, atau nomor rekening tujuan"
            }
            maxLength={300}
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="ticket-finance-account"
            className="type-p2 font-medium"
          >
            Sumber Kas / Bank <span className="text-destructive">*</span>
          </Label>
          <Select
            value={financeAccountId}
            onValueChange={setFinanceAccountId}
            disabled={isPending || accountsLoading || accounts.length === 0}
          >
            <SelectTrigger id="ticket-finance-account" className="h-10 w-full">
              <SelectValue
                placeholder={
                  accountsLoading
                    ? "Memuat akun..."
                    : "Pilih akun sumber pembayaran"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.accountName} ·{" "}
                  {formatCurrency(String(account.balance))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {accounts.length === 0 && !accountsLoading && (
            <p className="type-p3 text-destructive" role="alert">
              Belum ada akun. Tambahkan buku bank/kas dari Finance Hub.
            </p>
          )}
        </div>

        <fieldset className="space-y-3 rounded-xl border border-border p-3.5">
          <legend className="type-p2 px-1 font-semibold">
            Skema Pembayaran
          </legend>
          <RadioGroup
            value={currentPaymentType}
            onValueChange={(value) => setPaymentType(value as PaymentType)}
            className="grid gap-2 sm:grid-cols-2"
          >
            <Label
              htmlFor="finance-pay-full"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <RadioGroupItem
                id="finance-pay-full"
                value={PaymentType.FULL_PAYMENT}
              />
              <span className="type-p2">Bayar Lunas</span>
            </Label>
            {isFirstPayment && (
              <Label
                htmlFor="finance-pay-dp"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <RadioGroupItem
                  id="finance-pay-dp"
                  value={PaymentType.DOWN_PAYMENT}
                />
                <span className="type-p2">Bayar DP / Sebagian</span>
              </Label>
            )}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label
              htmlFor="finance-action-payment-amount"
              className="type-p2 font-medium"
            >
              Nominal Pembayaran (Rp)
            </Label>
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
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label className="type-p2 font-medium">
            {isCashPayment
              ? "Bukti Penyerahan Dana"
              : "Bukti Transfer / Pengiriman Dana"}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <FileDropzone
            accept={FINANCE_PROOF_ACCEPT_ALL}
            multiple={false}
            maxSizeMb={5}
            capture="environment"
            disabled={isPending || isPreparingFile}
            files={file ? [file] : []}
            onFilesChange={(files) => void handleProofSelected(files)}
            onError={setMessage}
            label="Unggah Bukti Pembayaran"
            hint="Format PDF, JPG, PNG, atau WEBP maksimal 5 MB."
          />
          {file && (
            <div className="flex items-center gap-2">
              <InvoiceFilePreview
                file={file}
                title="Pratinjau Bukti Pembayaran"
                label="Pratinjau bukti"
                tooltip="Pratinjau bukti pembayaran"
              />
            </div>
          )}
        </div>

        {message && (
          <p className="type-p2 text-destructive" role="alert">
            {message}
          </p>
        )}
      </form>
    </GlobalModal>
  );
}
