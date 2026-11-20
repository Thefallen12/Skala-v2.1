"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  recordIncomingFund,
  recordOutgoingFund,
  transferBetweenFinanceAccounts,
} from "@/app/actions/finance-cashflow";
import type {
  FinanceTransferInput,
  IncomingFundInput,
  OutgoingFundInput,
} from "@/app/actions/finance-cashflow";
import { parseRupiahInput } from "@/lib/indonesian-currency";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
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
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import FinancePaymentProofUpload from "@/app/components/apps/finance/FinancePaymentProofUpload";
import { Wallet } from "lucide-react";

export type FinanceAccountOption = {
  id: string;
  accountName: string;
  accountNumber: string | null;
  holderName: string;
  balance: number;
};

export type FinanceProjectOption = {
  id: string;
  name: string;
};

type FundFormValues = {
  amount: number;
  sourceDesc: string;
  transactionDate: string;
  accountId: string;
  paymentMethod: "TRANSFER" | "CASH" | "DEPOSIT";
  senderName: string;
  projectId: string;
  sourceAccountId: string;
  destinationAccountId: string;
};

const getTodayDateStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fundFormSchema = z.object({
  amount: z.number().positive("Nominal harus lebih besar dari nol."),
  sourceDesc: z.string().trim().min(3).max(300),
  transactionDate: z.string().min(1, "Pilih tanggal transaksi."),
  accountId: z.string(),
  paymentMethod: z.enum(["TRANSFER", "CASH", "DEPOSIT"]),
  senderName: z.string().max(160),
  projectId: z.string(),
  sourceAccountId: z.string(),
  destinationAccountId: z.string(),
});

const proofLabels = {
  TRANSFER: "Unggah Bukti Transfer",
  CASH: "Unggah Foto Kwitansi Tanda Terima",
  DEPOSIT: "Unggah Slip Setoran Bank",
} as const;

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function IncomingFundModal({
  open,
  onClose,
  mode,
  accounts,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  mode: "incoming" | "outgoing" | "transfer";
  accounts: FinanceAccountOption[];
  projects: FinanceProjectOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDocType, setProofDocType] = useState<"BKT" | "BON" | "KWT" | "INV" | null>(null);
  const [proofError, setProofError] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const form = useForm<FundFormValues>({
    resolver: zodResolver(fundFormSchema),
    defaultValues: {
      amount: 0,
      sourceDesc: "",
      transactionDate: getTodayDateStr(),
      accountId: accounts[0]?.id ?? "",
      paymentMethod: "TRANSFER",
      senderName: "",
      projectId: "",
      sourceAccountId: accounts[0]?.id ?? "",
      destinationAccountId: accounts[1]?.id ?? "",
    },
  });
  const paymentMethod = useWatch({
    control: form.control,
    name: "paymentMethod",
  });
  const effectiveProofDocType =
    proofDocType ?? (paymentMethod === "CASH" && mode !== "transfer" ? "KWT" : "BKT");
  const transactionDate = useWatch({
    control: form.control,
    name: "transactionDate",
  });
  const accountId = useWatch({
    control: form.control,
    name: "accountId",
  });
  const projectId = useWatch({
    control: form.control,
    name: "projectId",
  });
  const sourceAccountId = useWatch({
    control: form.control,
    name: "sourceAccountId",
  });
  const destinationAccountId = useWatch({
    control: form.control,
    name: "destinationAccountId",
  });
  const projectOptions = useMemo(
    () => [
      { value: "__NONE__", label: "Tanpa proyek" },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [projects],
  );
  useEffect(() => {
    if (!open) return;
    form.reset({
      amount: 0,
      sourceDesc: "",
      transactionDate: getTodayDateStr(),
      accountId: accounts[0]?.id ?? "",
      paymentMethod: "TRANSFER",
      senderName: "",
      projectId: "",
      sourceAccountId: accounts[0]?.id ?? "",
      destinationAccountId: accounts[1]?.id ?? "",
    });
  }, [accounts, form, mode, open]);

  const handleClose = () => {
    setAmountInput("");
    setProofFile(null);
    setProofError("");
    setMessage("");
    setIsError(false);
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    if (!proofFile) {
      setProofError("Unggah bukti transaksi terlebih dahulu.");
      return;
    }
    setProofError("");
    if (mode === "incoming" || mode === "outgoing") {
      if (!values.accountId) {
        form.setError("accountId", {
          type: "required",
          message:
            mode === "incoming"
              ? "Pilih buku bank/kas penerima."
              : "Pilih buku bank/kas sumber dana.",
        });
        return;
      }
      if (mode === "incoming" && values.paymentMethod === "TRANSFER" && !values.senderName.trim()) {
        form.setError("senderName", {
          type: "required",
          message: "Nama pengirim wajib diisi untuk penerimaan transfer.",
        });
        return;
      }
    } else if (
      !values.sourceAccountId ||
      !values.destinationAccountId ||
      values.sourceAccountId === values.destinationAccountId
    ) {
      form.setError("destinationAccountId", {
        type: "validate",
        message: "Pilih akun tujuan yang berbeda dengan akun sumber.",
      });
      return;
    }

    setIsPending(true);
    setMessage("");
    try {
      let result;
      if (mode === "incoming") {
        result = await recordIncomingFund({
          amount: values.amount,
          sourceDesc: values.sourceDesc,
          accountId: values.accountId,
          paymentMethod: values.paymentMethod,
          senderName: values.senderName,
          proof: proofFile,
          projectId: values.projectId || undefined,
          transactionDate: values.transactionDate,
          proofDocType: effectiveProofDocType,
        } satisfies IncomingFundInput);
      } else if (mode === "outgoing") {
        result = await recordOutgoingFund({
          amount: values.amount,
          sourceDesc: values.sourceDesc,
          accountId: values.accountId,
          paymentMethod: values.paymentMethod,
          recipientName: values.senderName,
          proof: proofFile,
          projectId: values.projectId || undefined,
          transactionDate: values.transactionDate,
          proofDocType: effectiveProofDocType,
        } satisfies OutgoingFundInput);
      } else {
        result = await transferBetweenFinanceAccounts({
          amount: values.amount,
          sourceAccountId: values.sourceAccountId,
          destinationAccountId: values.destinationAccountId,
          sourceDesc: values.sourceDesc,
          proof: proofFile,
          transactionDate: values.transactionDate,
          proofDocType: effectiveProofDocType,
        } satisfies FinanceTransferInput);
      }
      setMessage(result.message);
      setIsError(!result.success);
      if (result.success) {
        toast.success(result.message || "Transaksi kas berhasil dicatat.");
        handleClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Cashflow form submission failed:", error);
      const errMsg = "Transaksi gagal dicatat. Silakan coba kembali.";
      setMessage(errMsg);
      setIsError(true);
      toast.error(errMsg);
    } finally {
      setIsPending(false);
    }
  });

  const modalTitle =
    mode === "incoming"
      ? "Catat Dana Masuk"
      : mode === "outgoing"
        ? "Catat Dana Keluar"
        : "Transfer Antar Kas";
  const formId = `finance-cashflow-${mode}-form`;

  return (
    <GlobalModal
      isOpen={open}
      onClose={handleClose}
      title={modalTitle}
      icon={<Wallet aria-hidden="true" className="size-5" />}
      description={
        mode === "incoming"
          ? "Catat sumber, metode penerimaan, akun penyimpanan, dan bukti dana masuk."
          : mode === "outgoing"
            ? "Catat pengeluaran kas/bank manual atau susulan; saldo akun dipotong saat transaksi tersimpan."
            : "Pindahkan saldo antar buku secara tercatat dan atomik."
      }
      className="sm:max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose}>
            Batal
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={
              isPending || accounts.length === 0 ||
              (mode === "transfer" && accounts.length < 2)
            }
            className={
              mode === "outgoing"
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : undefined
            }
          >
            {isPending
              ? "Menyimpan..."
              : mode === "incoming"
                ? "Simpan Dana Masuk"
                : mode === "outgoing"
                  ? "Simpan Dana Keluar"
                  : "Simpan Transaksi"}
          </Button>
        </>
      }
    >
      {accounts.length === 0 ? (
        <p className="type-p2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          Buat akun bank/kas terlebih dahulu sebelum mencatat transaksi.
        </p>
      ) : (
        <form id={formId} className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-date`}>Tanggal Transaksi</Label>
              <DatePicker
                id={`${formId}-date`}
                value={transactionDate}
                onValueChange={(dateKey) =>
                  form.setValue("transactionDate", dateKey, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                disabled={isPending}
              />
              <p className="type-p3 text-muted-foreground">
                {mode === "incoming"
                  ? "Sesuaikan tanggal jika input susulan."
                  : mode === "outgoing"
                    ? "Sesuaikan tanggal jika pengeluaran susulan."
                    : "Sesuaikan tanggal transaksi bila perlu."}
              </p>
              {form.formState.errors.transactionDate && (
                <p className="type-p2 text-destructive" role="alert">
                  {form.formState.errors.transactionDate.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-amount`}>Nominal (Rp)</Label>
              <input type="hidden" {...form.register("amount")} />
              <RupiahAmountInput
                id={`${formId}-amount`}
                value={amountInput}
                onChange={(formatted) => {
                  setAmountInput(formatted);
                  form.setValue("amount", parseRupiahInput(formatted), {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                required
              />
              {form.formState.errors.amount && (
                <p className="type-p2 text-destructive" role="alert">
                  {form.formState.errors.amount.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-description`}>
              {mode === "incoming"
                ? "Sumber Dana"
                : mode === "outgoing"
                  ? "Keperluan"
                  : "Keterangan"}
            </Label>
            <Input
              id={`${formId}-description`}
              maxLength={300}
              placeholder={
                mode === "incoming"
                  ? "Contoh: Pembayaran Termin 1 Project A"
                  : mode === "outgoing"
                    ? "Contoh: Pembelian ATK kantor, bensin armada"
                    : "Contoh: Pindah kas operasional mingguan"
              }
              {...form.register("sourceDesc")}
            />
            {form.formState.errors.sourceDesc && (
              <p className="type-p2 text-destructive" role="alert">
                {form.formState.errors.sourceDesc.message}
              </p>
            )}
          </div>

          {mode === "incoming" || mode === "outgoing" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-account`}>
                  {mode === "incoming"
                    ? "Simpan Ke Rekening"
                    : "Sumber Rekening"}
                </Label>
                <Select
                  value={accountId}
                  onValueChange={(value) =>
                    form.setValue("accountId", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id={`${formId}-account`}>
                    <SelectValue placeholder="Pilih buku bank/kas" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.accountName} · {currency(account.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.accountId && (
                  <p className="type-p2 text-destructive" role="alert">
                    {form.formState.errors.accountId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  {mode === "incoming" ? "Metode Masuk" : "Metode Keluar"}
                </Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => {
                    if (
                      value === "TRANSFER" ||
                      value === "CASH" ||
                      value === "DEPOSIT"
                    ) {
                      form.setValue("paymentMethod", value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                  className="flex flex-wrap gap-3"
                >
                  {[
                    ["TRANSFER", "Transfer"],
                    ["CASH", "Tunai"],
                    ...(mode === "incoming" ? [["DEPOSIT", "Setor Tunai"]] : []),
                  ].map(([value, label]) => (
                    <Label
                      key={value}
                      htmlFor={`${formId}-method-${value}`}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 font-normal hover:bg-muted/40"
                    >
                      <RadioGroupItem
                        id={`${formId}-method-${value}`}
                        value={value}
                      />
                      <span className="type-p2">{label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-sender`}>
                    {mode === "incoming"
                      ? "Pengirim"
                      : "Penerima (Opsional)"}
                  </Label>
                  <Input
                    id={`${formId}-sender`}
                    maxLength={160}
                    placeholder={
                      mode === "incoming"
                        ? "Contoh: PT Mitra Sejahtera"
                        : "Contoh: Toko Bangunan Berkah"
                    }
                    {...form.register("senderName")}
                  />
                  {form.formState.errors.senderName && (
                    <p className="type-p2 text-destructive" role="alert">
                      {form.formState.errors.senderName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${formId}-project`}>
                    Proyek (Opsional)
                  </Label>
                  <Combobox
                    id={`${formId}-project`}
                    options={projectOptions}
                    value={projectId || "__NONE__"}
                    onValueChange={(value) =>
                      form.setValue(
                        "projectId",
                        value === "__NONE__" ? "" : value,
                        { shouldDirty: true },
                      )
                    }
                    placeholder="Tanpa proyek"
                    searchPlaceholder="Cari proyek..."
                    disabled={isPending}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${formId}-source-account`}>Akun Sumber</Label>
                <Select
                  value={sourceAccountId}
                  onValueChange={(value) =>
                    form.setValue("sourceAccountId", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id={`${formId}-source-account`}>
                    <SelectValue placeholder="Pilih akun sumber" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.accountName} · {currency(account.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${formId}-destination-account`}>
                  Akun Tujuan
                </Label>
                <Select
                  value={destinationAccountId}
                  onValueChange={(value) =>
                    form.setValue("destinationAccountId", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id={`${formId}-destination-account`}>
                    <SelectValue placeholder="Pilih akun tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.accountName} · {currency(account.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.destinationAccountId && (
                  <p className="type-p2 text-destructive" role="alert">
                    Pilih akun tujuan yang berbeda.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="cashflow-doc-kind">Jenis Dokumen Bukti</Label>
              <Select
                value={effectiveProofDocType}
                onValueChange={(value) =>
                  setProofDocType(value as "BKT" | "BON" | "KWT" | "INV")
                }
                disabled={isPending}
              >
                <SelectTrigger id="cashflow-doc-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BKT">Bukti Transfer / Setoran (BKT)</SelectItem>
                  <SelectItem value="KWT">Kwitansi Tunai (KWT)</SelectItem>
                  <SelectItem value="BON">Bon / Nota / Struk (BON)</SelectItem>
                  <SelectItem value="INV">Invoice / Faktur (INV)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Label>
              {mode === "incoming"
                ? proofLabels[paymentMethod]
                : mode === "outgoing"
                  ? "Bukti Pengeluaran"
                  : "Bukti Transfer"}
            </Label>
            <FinancePaymentProofUpload
              value={proofFile}
              onChange={(file) => {
                setProofFile(file);
                setProofError("");
              }}
              disabled={isPending}
            />
            {proofError && (
              <p className="type-p2 text-destructive" role="alert">
                {proofError}
              </p>
            )}
          </div>
          {message && (
            <p
              className={`type-p2 ${isError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </form>
      )}
    </GlobalModal>
  );
}
