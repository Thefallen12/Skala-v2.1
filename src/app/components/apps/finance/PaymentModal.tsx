"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

export type PaymentModalTarget = {
  id: string;
  reference: string;
  title: string;
  grandTotal: number;
  paidAmount: number;
  isFirstPayment?: boolean;
  transferDestination: string;
  isInternalFunding?: boolean;
  requesterName?: string;
  receiptUrls?: string[];
};

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const isPaymentType = (value: string): value is PaymentType =>
  Object.values(PaymentType).some((paymentType) => paymentType === value);

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
  ) => Promise<TicketActionResult>;
}) {
  const router = useRouter();
  const [paidAmount, setPaidAmount] = useState(target?.paidAmount ?? 0);
  const [amount, setAmount] = useState(() =>
    target
      ? formatRupiahNumber(
          Math.max(0, target.grandTotal - target.paidAmount),
        )
      : "",
  );
  const [paymentType, setPaymentType] = useState<PaymentType>(
    PaymentType.FULL_PAYMENT,
  );
  const [destination, setDestination] = useState(
    target?.transferDestination ?? "",
  );
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<POPaymentMethod>(
    POPaymentMethod.TRANSFER,
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isMessageError, setIsMessageError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const remainingBalance = target
    ? Math.round((target.grandTotal - paidAmount) * 100) / 100
    : 0;
  const remainingAmount = Math.max(0, remainingBalance);
  const isSettled = remainingBalance <= 0;
  const paymentStatus =
    isSettled
      ? "LUNAS"
      : paidAmount > 0
        ? "DIBAYAR SEBAGIAN"
        : "BELUM DIBAYAR";
  const insufficientInternalAccounts = Boolean(
    target?.isInternalFunding &&
      !accounts.some((account) => account.balance >= remainingAmount),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !proofFile || !financeAccountId) {
      setMessage(
        !financeAccountId
          ? "Pilih buku kas/bank sumber pembayaran."
          : "Pilih bukti transfer terlebih dahulu.",
      );
      setIsMessageError(true);
      return;
    }
    if (!target.isFirstPayment && paymentType === PaymentType.DOWN_PAYMENT) {
      setPaymentType(PaymentType.FULL_PAYMENT);
      setMessage("DP hanya dapat digunakan pada pembayaran pertama.");
      setIsMessageError(true);
      return;
    }
    const transferAmount = parseRupiahInput(amount);
    if (
      ((!target.isInternalFunding ||
        paymentMethod === POPaymentMethod.TRANSFER) &&
        !destination.trim()) ||
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
      const result = await onPay(
        proofFile,
        destination.trim(),
        paymentType,
        transferAmount,
        financeAccountId,
        target.isInternalFunding ? paymentMethod : undefined,
      );
      setMessage(result.message);
      setIsMessageError(!result.success);
      if (!result.success) {
        router.refresh();
        return;
      }

      const updatedPaid = Math.min(
        target.grandTotal,
        Math.round((paidAmount + transferAmount) * 100) / 100,
      );
      setPaidAmount(updatedPaid);
      const updatedRemaining = Math.max(
        0,
        Math.round((target.grandTotal - updatedPaid) * 100) / 100,
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
      setMessage(
        isStaleServerAction
          ? "Halaman memakai versi aplikasi lama. Muat ulang halaman, lalu kirim pembayaran kembali. Pembayaran ini belum tercatat."
          : "Pembayaran gagal diproses. Silakan coba kembali.",
      );
      setIsMessageError(true);
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
      title="Bayar / Transfer"
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
            {target.isInternalFunding && (
              <>
                <section className="space-y-3 rounded-lg border p-4">
                  <div className="text-sm">
                    Pemohon
                    <strong className="mt-1 block">
                      {target.requesterName ?? "—"}
                    </strong>
                  </div>
                  {target.receiptUrls && target.receiptUrls.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Struk / nota asli</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {target.receiptUrls.map((url, index) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="overflow-hidden rounded-md border text-sm text-primary"
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
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
                <div className="space-y-2">
                  <Label htmlFor="payment-modal-method">Metode Pembayaran</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => {
                      if (
                        value === POPaymentMethod.CASH ||
                        value === POPaymentMethod.TRANSFER
                      ) {
                        setPaymentMethod(value);
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
                      <SelectItem value={POPaymentMethod.CASH}>Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <section className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-3">
              <div>
                Tagihan
                <strong className="mt-1 block">{currency(target.grandTotal)}</strong>
              </div>
              <div>
                Total Terbayar
                <strong className="mt-1 block">{currency(paidAmount)}</strong>
              </div>
              <div>
                Sisa Hutang
                <strong className="mt-1 block">{currency(remainingAmount)}</strong>
                <Badge
                  className="mt-1"
                  variant={
                    isSettled
                      ? "success"
                      : paidAmount > 0
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
                        target.isInternalFunding ||
                        paymentType === PaymentType.FULL_PAYMENT
                      }
                    />
                  </div>
                  {!target.isInternalFunding && <div className="space-y-2">
                    <Label htmlFor="payment-modal-type">Jenis Pembayaran</Label>
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
                        {target.isFirstPayment && (
                          <SelectItem value={PaymentType.DOWN_PAYMENT}>
                            Down Payment
                          </SelectItem>
                        )}
                        <SelectItem value={PaymentType.PROGRESS_PAYMENT}>
                          Progress Payment (Termin)
                        </SelectItem>
                        <SelectItem value={PaymentType.FULL_PAYMENT}>
                          Pelunasan
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-modal-finance-account">
                    Dibayar Dari (Buku Bank/Kas)
                  </Label>
                  <Select
                    value={financeAccountId}
                    onValueChange={setFinanceAccountId}
                    disabled={isPending || accounts.length === 0}
                  >
                    <SelectTrigger id="payment-modal-finance-account">
                      <SelectValue placeholder="Pilih akun sumber pembayaran" />
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
                    <p className="text-sm text-destructive" role="alert">
                      Buat buku bank/kas terlebih dahulu di tab Buku Kas &amp;
                      Arus Dana.
                    </p>
                  )}
                </div>
                {target.isInternalFunding &&
                  insufficientInternalAccounts && (
                    <p className="text-sm text-destructive" role="alert">
                      Tidak ada akun dengan saldo yang mencukupi untuk
                      pengajuan ini.
                    </p>
                  )}
                {(!target.isInternalFunding ||
                  paymentMethod === POPaymentMethod.TRANSFER) && (
                <div className="space-y-2">
                  <Label htmlFor="payment-modal-destination">
                    {target.isInternalFunding
                      ? "Tujuan Transfer"
                      : "Ditransfer Ke (Bank/Rekening/Atas Nama)"}
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
                </div>
                )}
                <div className="space-y-2">
                  <Label>
                    {target.isInternalFunding && paymentMethod === POPaymentMethod.CASH
                      ? "Bukti Kwitansi / Tanda Terima"
                      : "Bukti Transfer"}
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
              <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                {target.isInternalFunding
                  ? "Pengajuan ini sudah dibayar lunas."
                  : "PO ini sudah lunas."}
              </p>
            )}
            {message && (
              <div className="space-y-2">
                <p
                  className={`text-sm ${isMessageError ? "text-destructive" : "text-muted-foreground"}`}
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
                    Muat Ulang Halaman
                  </Button>
                )}
              </div>
            )}
          </form>
        )}
    </GlobalModal>
  );
}
