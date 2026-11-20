"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import type { TicketActionResult } from "@/app/actions/tickets";
import FinancePaymentProofUpload from "@/app/components/apps/finance/FinancePaymentProofUpload";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import type { FinanceAccountOption } from "@/app/components/apps/finance/IncomingFundModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { POPaymentMethod, PaymentType } from "@prisma/client";
import {
  formatRupiahNumber,
  parseRupiahInput,
} from "@/lib/indonesian-currency";
import { parseClientAssetCode } from "@/lib/photo-urls";

export type PaymentVendorBankOption = {
  id: string;
  label: string;
  destination: string;
  isPrimary?: boolean;
};

export type PaymentPoSummaryOption = {
  id: string;
  publicCode: string;
  poNumber: string;
  vendorName: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  isPaid: boolean;
  hasInvoice: boolean;
  vendorInvoiceUrl: string | null;
  transferDestination: string | null;
  vendorBankAccounts: PaymentVendorBankOption[];
};

export type PaymentModalTarget = {
  id: string;
  reference: string;
  title: string;
  grandTotal: number;
  paidAmount: number;
  isFirstPayment?: boolean;
  transferDestination: string;
  vendorBankDestination?: string;
  vendorBankAccounts?: PaymentVendorBankOption[];
  poSummaries?: PaymentPoSummaryOption[];
  defaultPaymentMethod?: POPaymentMethod;
  allowPaymentMethodSelection?: boolean;
  isInternalFunding?: boolean;
  requesterName?: string;
  receiptUrls?: string[];
  hasInvoice?: boolean;
  needsNominalInput?: boolean;
};

const CASH_DIRECT_PURCHASE_DESTINATION = "Pembayaran tunai pembelian langsung";

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const isPaymentType = (value: string): value is PaymentType =>
  Object.values(PaymentType).some((paymentType) => paymentType === value);

function resolveInitialPoId(poSummaries: PaymentPoSummaryOption[] | undefined): string {
  if (!poSummaries || poSummaries.length === 0) return "";
  return (
    poSummaries.find((po) => !po.isPaid && po.hasInvoice)?.id ??
    poSummaries.find((po) => !po.isPaid)?.id ??
    poSummaries[0].id
  );
}

export default function PaymentModal({
  open,
  onOpenChange,
  target,
  accounts,
  onPay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PaymentModalTarget | null;
  accounts: FinanceAccountOption[];
  onPay: (
    proof: string | File,
    transferDestination: string,
    paymentType: PaymentType,
    amount: number,
    financeAccountId: string,
    paymentMethod?: POPaymentMethod,
    poId?: string,
    proofDocType?: string,
  ) => Promise<TicketActionResult>;
}) {
  const router = useRouter();
  const poSummaries = target?.poSummaries ?? [];
  const hasPoOptions = poSummaries.length > 0;
  const [selectedPoId, setSelectedPoId] = useState<string>(() =>
    resolveInitialPoId(target?.poSummaries),
  );
  const [paidByPoId, setPaidByPoId] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const po of target?.poSummaries ?? []) {
      map[po.id] = po.paidAmount;
    }
    return map;
  });

  const selectedPo = hasPoOptions
    ? poSummaries.find((po) => po.id === selectedPoId) ?? poSummaries[0]
    : null;

  const [paidAmount, setPaidAmount] = useState(target?.paidAmount ?? 0);
  const activeGrandTotal = selectedPo ? selectedPo.totalAmount : (target?.grandTotal ?? 0);
  const activePaidAmount = selectedPo
    ? (paidByPoId[selectedPo.id] ?? selectedPo.paidAmount)
    : paidAmount;
  const activeIsFirstPayment = selectedPo
    ? activePaidAmount <= 0
    : Boolean(target?.isFirstPayment);
  const activeVendorAccounts =
    selectedPo && selectedPo.vendorBankAccounts.length > 0
      ? selectedPo.vendorBankAccounts
      : (target?.vendorBankAccounts ?? []);
  const activeVendorDestination = selectedPo
    ? (selectedPo.transferDestination ??
      selectedPo.vendorBankAccounts[0]?.destination ??
      target?.vendorBankDestination ??
      "")
    : (target?.vendorBankDestination ?? "");

  const [amount, setAmount] = useState(() => {
    if (!target) return "";
    const initialPo = poSummaries.find(
      (po) => po.id === resolveInitialPoId(poSummaries),
    );
    if (initialPo) {
      return formatRupiahNumber(
        Math.max(0, initialPo.totalAmount - initialPo.paidAmount),
      );
    }
    return formatRupiahNumber(
      Math.max(0, target.grandTotal - target.paidAmount),
    );
  });
  const [paymentType, setPaymentType] = useState<PaymentType>(
    PaymentType.FULL_PAYMENT,
  );
  const [destination, setDestination] = useState(() => {
    if (!target) return "";
    const initialPo = poSummaries.find(
      (po) => po.id === resolveInitialPoId(poSummaries),
    );
    if (initialPo) {
      return (
        initialPo.transferDestination?.trim() ??
        initialPo.vendorBankAccounts[0]?.destination ??
        target.transferDestination?.trim() ??
        ""
      );
    }
    const vendorDest = target.vendorBankDestination?.trim() ?? "";
    if (vendorDest) return vendorDest;
    const existing = target.transferDestination?.trim() ?? "";
    return existing === CASH_DIRECT_PURCHASE_DESTINATION ? "" : existing;
  });
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [proofDocType, setProofDocType] = useState<"BKT" | "BON" | "KWT" | "INV" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<POPaymentMethod>(
    target?.defaultPaymentMethod ?? POPaymentMethod.TRANSFER,
  );
  const canSelectPaymentMethod = Boolean(
    target?.isInternalFunding || target?.allowPaymentMethodSelection,
  );
  const requiresTransferDestination = !(
    canSelectPaymentMethod && paymentMethod === POPaymentMethod.CASH
  );
  const isCashPayment =
    canSelectPaymentMethod && paymentMethod === POPaymentMethod.CASH;
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isMessageError, setIsMessageError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);

  const needsNominalInput = Boolean(
    !selectedPo && target?.needsNominalInput && activePaidAmount === 0,
  );
  const remainingBalance = target
    ? Math.round((activeGrandTotal - activePaidAmount) * 100) / 100
    : 0;
  const remainingAmount = Math.max(0, remainingBalance);
  const isSettled = !needsNominalInput && remainingBalance <= 0;
  const multiPoMissingInvoice = Boolean(
    poSummaries.length > 1 && selectedPo && !selectedPo.isPaid && !selectedPo.hasInvoice,
  );
  const paymentStatus = needsNominalInput
    ? "Belum Ada Nominal"
    : isSettled
      ? "Lunas"
      : activePaidAmount > 0
        ? "Dibayar Sebagian"
        : "Belum Dibayar";
  const insufficientInternalAccounts = Boolean(
    target?.isInternalFunding &&
      !accounts.some((account) => account.balance >= remainingAmount),
  );

  const handleSelectPo = (nextPoId: string) => {
    const nextPo = poSummaries.find((po) => po.id === nextPoId);
    if (!nextPo) return;
    setSelectedPoId(nextPoId);
    const nextPaid = paidByPoId[nextPo.id] ?? nextPo.paidAmount;
    const nextRemaining = Math.max(
      0,
      Math.round((nextPo.totalAmount - nextPaid) * 100) / 100,
    );
    setAmount(formatRupiahNumber(nextRemaining));
    setPaymentType(PaymentType.FULL_PAYMENT);
    setDestination(
      nextPo.transferDestination?.trim() ??
        nextPo.vendorBankAccounts[0]?.destination ??
        target?.transferDestination?.trim() ??
        "",
    );
    setMessage("");
    setIsMessageError(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !proofFile || !financeAccountId) {
      const errMsg = !financeAccountId
        ? "Pilih buku kas/bank sumber pembayaran."
        : "Pilih bukti transfer terlebih dahulu.";
      setMessage(errMsg);
      setIsMessageError(true);
      toast.error(errMsg);
      return;
    }
    if (multiPoMissingInvoice) {
      const errMsg = `PO ${selectedPo?.poNumber ?? ""} menunggu invoice vendor dari Logistik.`;
      setMessage(errMsg);
      setIsMessageError(true);
      toast.error(errMsg);
      return;
    }
    if (!activeIsFirstPayment && paymentType === PaymentType.DOWN_PAYMENT) {
      setPaymentType(PaymentType.FULL_PAYMENT);
      setMessage("DP hanya dapat digunakan pada pembayaran pertama.");
      setIsMessageError(true);
      return;
    }
    const transferAmount = parseRupiahInput(amount);
    if (needsNominalInput) {
      if (
        (requiresTransferDestination && !destination.trim()) ||
        !Number.isFinite(transferAmount) ||
        transferAmount <= 0
      ) {
        setMessage("Nominal pembayaran dan tujuan transfer wajib diisi dengan benar.");
        setIsMessageError(true);
        return;
      }
    } else if (
      (requiresTransferDestination && !destination.trim()) ||
      !Number.isFinite(transferAmount) ||
      transferAmount <= 0 ||
      transferAmount > remainingAmount ||
      ((target.isInternalFunding ||
        paymentType === PaymentType.FULL_PAYMENT) &&
        transferAmount !== remainingAmount) ||
      (!target.isInternalFunding &&
        paymentType !== PaymentType.FULL_PAYMENT &&
        transferAmount >= remainingAmount)
    ) {
      setMessage(
        target.isInternalFunding ||
        paymentType === PaymentType.FULL_PAYMENT
          ? "Nominal pelunasan harus sama dengan sisa tagihan."
          : "Nominal DP/termin harus lebih kecil dari sisa tagihan.",
      );
      setIsMessageError(true);
      return;
    }

    setMessage("");
    setRequiresReload(false);
    setIsPending(true);
    try {
      const submittedDestination = isCashPayment
        ? destination.trim() &&
          destination.trim() !== activeVendorDestination.trim()
          ? destination.trim()
          : target.isInternalFunding
            ? "Pembayaran tunai"
            : CASH_DIRECT_PURCHASE_DESTINATION
        : destination.trim();
      const result = await onPay(
        proofFile,
        submittedDestination,
        paymentType,
        transferAmount,
        financeAccountId,
        canSelectPaymentMethod ? paymentMethod : undefined,
        selectedPo?.id,
        proofDocType ?? (isCashPayment ? "KWT" : "BKT"),
      );
      setMessage(result.message);
      setIsMessageError(!result.success);
      if (!result.success) {
        toast.error(result.message);
        router.refresh();
        return;
      }

      toast.success(result.message || "Pembayaran berhasil dicatat.");
      const effectiveTotal = needsNominalInput ? transferAmount : activeGrandTotal;
      const updatedPaid = Math.min(
        effectiveTotal,
        Math.round((activePaidAmount + transferAmount) * 100) / 100,
      );
      if (selectedPo) {
        setPaidByPoId((prev) => ({ ...prev, [selectedPo.id]: updatedPaid }));
      } else {
        setPaidAmount(updatedPaid);
      }
      const updatedRemaining = Math.max(
        0,
        Math.round((effectiveTotal - updatedPaid) * 100) / 100,
      );
      setAmount(formatRupiahNumber(updatedRemaining));
      setPaymentType(PaymentType.FULL_PAYMENT);
      setProofFile(null);
      router.refresh();
    } catch (error) {
      console.error("Finance payment submission failed:", error);
      const isStaleServerAction =
        error instanceof Error &&
        /(?:Server Action.*not found|Failed to find Server Action)/i.test(
          error.message,
        );
      setRequiresReload(isStaleServerAction);
      const errMsg = isStaleServerAction
        ? "Halaman memakai versi aplikasi lama. Muat ulang halaman, lalu kirim pembayaran kembali."
        : "Pembayaran gagal diproses. Silakan coba kembali.";
      setMessage(errMsg);
      setIsMessageError(true);
      toast.error(errMsg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        if (isPending) return;
        setProofFile(null);
        setMessage("");
        onOpenChange(false);
      }}
      title="Bayar Tagihan"
      description={
        target
          ? `${target.reference} · ${target.title}`
          : "Pilih tagihan yang akan dibayar."
      }
      className="sm:max-w-xl"
      footer={
        target ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setProofFile(null);
                setMessage("");
                onOpenChange(false);
              }}
            >
              Tutup
            </Button>
            {!isSettled && (
              <Button
                type="submit"
                form="payment-modal-form"
                disabled={
                  isPending ||
                  !proofFile ||
                  !financeAccountId ||
                  multiPoMissingInvoice ||
                  (target.isInternalFunding && insufficientInternalAccounts)
                }
              >
                {isPending ? "Memproses..." : "Simpan Pembayaran"}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {target && (
        <form id="payment-modal-form" className="space-y-4" onSubmit={submit}>
          {poSummaries.length > 1 && (
            <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="payment-modal-po-select" className="type-h3">
                  Pilih PO Tiket ({poSummaries.length} PO)
                </Label>
                <Badge variant="outline">
                  Total Tiket: {currency(target.grandTotal)}
                </Badge>
              </div>
              <Select
                value={selectedPo?.id ?? ""}
                onValueChange={handleSelectPo}
                disabled={isPending}
              >
                <SelectTrigger id="payment-modal-po-select">
                  <SelectValue placeholder="Pilih PO yang akan dibayar" />
                </SelectTrigger>
                <SelectContent>
                  {poSummaries.map((po) => {
                    const poPaid = paidByPoId[po.id] ?? po.paidAmount;
                    const poRem = Math.max(0, po.totalAmount - poPaid);
                    const statusText =
                      poRem <= 0
                        ? "Lunas"
                        : !po.hasInvoice
                          ? "Menunggu Invoice"
                          : `Sisa ${currency(poRem)}`;
                    return (
                      <SelectItem key={po.id} value={po.id}>
                        {po.poNumber} · {po.vendorName} ({statusText})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {multiPoMissingInvoice && (
                <p
                  className="type-p3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300"
                  role="alert"
                >
                  Logistik belum mengunggah invoice/bon untuk PO{" "}
                  <strong>{selectedPo?.poNumber}</strong>. Pilih PO lain yang sudah memiliki invoice.
                </p>
              )}
            </div>
          )}

          {target.isInternalFunding && (
            <section className="space-y-3 rounded-lg border p-4">
              <div className="type-p2">
                Pemohon
                <strong className="mt-1 block text-foreground">
                  {target.requesterName ?? "—"}
                </strong>
              </div>
              {target.receiptUrls && target.receiptUrls.length > 0 && (
                <div className="space-y-2">
                  <p className="type-p2 font-medium">Struk / nota asli</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {target.receiptUrls.map((url, index) => {
                      const assetMeta = parseClientAssetCode(url);
                      return (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="type-p3 overflow-hidden rounded-md border text-primary"
                        >
                          {/\/image\/upload\//.test(url) ? (
                            <Image
                              src={url}
                              alt={`Bukti pengajuan ${index + 1}`}
                              width={320}
                              height={220}
                              unoptimized
                              className="h-28 w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-28 items-center justify-center">
                              Buka dokumen {index + 1}
                            </span>
                          )}
                          {assetMeta && (
                            <span
                              className="block truncate border-t bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80"
                              title={`${assetMeta.kindLabel} (${assetMeta.assetCode})`}
                            >
                              {assetMeta.assetCode}
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {canSelectPaymentMethod && (
            <div className="space-y-2">
              <Label htmlFor="payment-modal-method">Metode Bayar</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => {
                  if (
                    value === POPaymentMethod.CASH ||
                    value === POPaymentMethod.TRANSFER
                  ) {
                    setPaymentMethod(value);
                    if (value === POPaymentMethod.TRANSFER) {
                      setDestination((current) => {
                        const trimmed = current.trim();
                        if (
                          !trimmed ||
                          trimmed === CASH_DIRECT_PURCHASE_DESTINATION
                        ) {
                          return activeVendorDestination;
                        }
                        return current;
                      });
                    }
                  }
                }}
                disabled={isPending}
              >
                <SelectTrigger id="payment-modal-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={POPaymentMethod.TRANSFER}>
                    Transfer
                  </SelectItem>
                  <SelectItem value={POPaymentMethod.CASH}>Cash / Tunai</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <section className="grid gap-2 rounded-lg border p-4 sm:grid-cols-3">
            <div>
              <span className="type-p3 text-muted-foreground">
                {selectedPo ? `Tagihan ${selectedPo.poNumber}` : "Total Tagihan"}
              </span>
              <strong className="type-p1 mt-1 block tabular-nums">
                {needsNominalInput ? "Belum ditetapkan" : currency(activeGrandTotal)}
              </strong>
            </div>
            <div>
              <span className="type-p3 text-muted-foreground">Sudah Dibayar</span>
              <strong className="type-p1 mt-1 block tabular-nums text-emerald-600 dark:text-emerald-400">
                {currency(activePaidAmount)}
              </strong>
            </div>
            <div>
              <span className="type-p3 text-muted-foreground">Sisa Tagihan</span>
              <strong className="type-p1 mt-1 block tabular-nums text-rose-600 dark:text-rose-400">
                {needsNominalInput ? "Belum ditetapkan" : currency(remainingAmount)}
              </strong>
              <Badge
                className="mt-1"
                variant={
                  needsNominalInput
                    ? "warning"
                    : isSettled
                      ? "success"
                      : activePaidAmount > 0
                        ? "warning"
                        : "error"
                }
              >
                {paymentStatus}
              </Badge>
            </div>
          </section>

          {!isSettled ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment-modal-amount">
                    {target.isInternalFunding
                      ? "Nominal Dibayarkan (Rp)"
                      : "Nominal Transfer (Rp)"}
                  </Label>
                  <RupiahAmountInput
                    id="payment-modal-amount"
                    value={amount}
                    onChange={setAmount}
                    required
                    disabled={
                      isPending ||
                      (!needsNominalInput &&
                        (target.isInternalFunding ||
                          paymentType === PaymentType.FULL_PAYMENT))
                    }
                  />
                </div>
                {!target.isInternalFunding && (
                  <div className="space-y-2">
                    <Label htmlFor="payment-modal-type">Jenis Bayar</Label>
                    <Select
                      value={paymentType}
                      onValueChange={(value) => {
                        if (isPaymentType(value)) {
                          setPaymentType(value);
                          if (value === PaymentType.FULL_PAYMENT) {
                            setAmount(formatRupiahNumber(remainingAmount));
                          }
                        }
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger id="payment-modal-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeIsFirstPayment && (
                          <SelectItem value={PaymentType.DOWN_PAYMENT}>
                            Uang Muka (DP)
                          </SelectItem>
                        )}
                        <SelectItem value={PaymentType.PROGRESS_PAYMENT}>
                          Termin
                        </SelectItem>
                        <SelectItem value={PaymentType.FULL_PAYMENT}>
                          Pelunasan
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-modal-finance-account">
                  Sumber Buku Kas / Bank
                </Label>
                <Select
                  value={financeAccountId}
                  onValueChange={setFinanceAccountId}
                  disabled={isPending || accounts.length === 0}
                >
                  <SelectTrigger id="payment-modal-finance-account">
                    <SelectValue placeholder="Pilih akun sumber" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem
                        key={account.id}
                        value={account.id}
                        disabled={
                          target.isInternalFunding &&
                          account.balance < remainingAmount
                        }
                      >
                        {account.accountName} · {currency(account.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {accounts.length === 0 && (
                  <p className="type-p2 text-destructive" role="alert">
                    Buat buku bank/kas terlebih dahulu di tab Buku Kas.
                  </p>
                )}
              </div>

              {target.isInternalFunding && insufficientInternalAccounts && (
                <p className="type-p2 text-destructive" role="alert">
                  Tidak ada akun dengan saldo yang mencukupi untuk pengajuan ini.
                </p>
              )}

              {requiresTransferDestination && (
                <div className="space-y-2">
                  {activeVendorAccounts.length > 1 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-modal-vendor-bank">
                        Rekening Vendor
                      </Label>
                      <Select
                        value={
                          activeVendorAccounts.find(
                            (account) =>
                              account.destination === destination.trim(),
                          )?.id ?? ""
                        }
                        onValueChange={(accountId) => {
                          const picked = activeVendorAccounts.find(
                            (account) => account.id === accountId,
                          );
                          if (picked) setDestination(picked.destination);
                        }}
                        disabled={isPending}
                      >
                        <SelectTrigger id="payment-modal-vendor-bank">
                          <SelectValue placeholder="Pilih rekening vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeVendorAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.label}
                              {account.isPrimary ? " (Utama)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Label htmlFor="payment-modal-destination">
                    {target.isInternalFunding
                      ? "Tujuan Transfer"
                      : "Rekening Tujuan"}
                  </Label>
                  <Input
                    id="payment-modal-destination"
                    maxLength={300}
                    required
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    disabled={isPending}
                    placeholder="Nama bank, nomor rekening, atas nama"
                  />
                  {!target.isInternalFunding &&
                    (activeVendorDestination ? (
                      <p className="type-p3 text-muted-foreground">
                        Diisi otomatis dari rekening vendor terdaftar.
                      </p>
                    ) : !destination.trim() ? (
                      <p className="type-p3 text-amber-600 dark:text-amber-400">
                        Vendor belum memiliki nomor rekening terdaftar. Isi detail bank tujuan di atas.
                      </p>
                    ) : null)}
                </div>
              )}

              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="payment-modal-doc-kind">Jenis Dokumen Bukti</Label>
                  <Select
                    value={proofDocType ?? (isCashPayment ? "KWT" : "BKT")}
                    onValueChange={(value) =>
                      setProofDocType(value as "BKT" | "BON" | "KWT" | "INV")
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger id="payment-modal-doc-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BKT">Bukti Transfer (BKT)</SelectItem>
                      <SelectItem value="KWT">Kwitansi Tunai (KWT)</SelectItem>
                      <SelectItem value="BON">Bon / Nota / Struk (BON)</SelectItem>
                      <SelectItem value="INV">Invoice / Faktur (INV)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Label>
                  {isCashPayment ? "Bukti Kwitansi" : "Bukti Transfer"}
                </Label>
                <FinancePaymentProofUpload
                  value={proofFile}
                  onChange={(file) => {
                    setProofFile(file);
                    setMessage("");
                    setIsMessageError(false);
                  }}
                  disabled={isPending}
                />
              </div>
            </>
          ) : (
            <p className="type-p2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
              {target.isInternalFunding
                ? "Pengajuan ini sudah dibayar lunas."
                : selectedPo
                  ? `PO ${selectedPo.poNumber} sudah dibayar lunas.`
                  : "Tagihan ini sudah lunas."}
            </p>
          )}

          {message && (
            <div className="space-y-2">
              <p
                className={`type-p2 ${isMessageError ? "text-destructive" : "text-muted-foreground"}`}
                role={isMessageError ? "alert" : "status"}
              >
                {message}
              </p>
              {requiresReload && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Muat Ulang
                </Button>
              )}
            </div>
          )}
        </form>
      )}
    </GlobalModal>
  );
}
