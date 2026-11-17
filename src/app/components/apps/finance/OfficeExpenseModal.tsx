"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordOfficeExpense } from "@/app/actions/finance";
import type { OfficeExpenseInput } from "@/app/actions/finance";
import type {
  FinanceAccountOption,
} from "@/app/components/apps/finance/IncomingFundModal";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseRupiahInput } from "@/lib/indonesian-currency";
import {
  FINANCE_PROOF_ACCEPT_ALL,
  prepareFinanceProofFiles,
} from "@/lib/finance-proof-client";
import { FileText, ReceiptText, Trash2, Wallet } from "lucide-react";

const getTodayDateStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const officeExpenseSchema = z.object({
  expenseType: z.enum(["SALARY", "ADVANCE", "REIMBURSEMENT"]),
  recipientId: z.string().min(1, "Pilih penerima dana."),
  accountId: z.string().min(1, "Pilih sumber dana."),
  paymentMethod: z.enum(["TRANSFER", "CASH"]),
  amount: z.number().positive("Nominal harus lebih besar dari nol."),
  transactionDate: z.string().min(1, "Pilih tanggal transaksi."),
  description: z
    .string()
    .trim()
    .min(3, "Keterangan minimal 3 karakter.")
    .max(1000, "Keterangan maksimal 1.000 karakter."),
});

type OfficeExpenseFormValues = z.infer<typeof officeExpenseSchema>;
type OfficeExpenseProof = { file: File; name: string };

const expenseTypeLabels = {
  SALARY: "Gaji",
  ADVANCE: "Kasbon / Ambilan",
  REIMBURSEMENT: "Reimbursement",
} as const;

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function OfficeExpenseModal({
  open,
  onClose,
  accounts,
  recipients,
}: {
  open: boolean;
  onClose: () => void;
  accounts: FinanceAccountOption[];
  recipients: { id: string; name: string; role: string }[];
}) {
  const router = useRouter();
  const [proofs, setProofs] = useState<OfficeExpenseProof[]>([]);
  const [proofError, setProofError] = useState("");
  const [isPreparingProof, setIsPreparingProof] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const form = useForm<OfficeExpenseFormValues>({
    resolver: zodResolver(officeExpenseSchema),
    defaultValues: {
      expenseType: "SALARY",
      recipientId: recipients[0]?.id ?? "",
      accountId: accounts[0]?.id ?? "",
      paymentMethod: "TRANSFER",
      amount: 0,
      transactionDate: getTodayDateStr(),
      description: "",
    },
  });

  const [prevOpen, setPrevOpen] = useState(false);

  if (open && !prevOpen) {
    setPrevOpen(true);
    setProofs([]);
    setProofError("");
    setMessage("");
    setIsError(false);
    setAmountInput("");
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  useEffect(() => {
    if (open) {
      form.reset({
        expenseType: "SALARY",
        recipientId: recipients[0]?.id ?? "",
        accountId: accounts[0]?.id ?? "",
        paymentMethod: "TRANSFER",
        amount: 0,
        transactionDate: getTodayDateStr(),
        description: "",
      });
    }
  }, [open, recipients, accounts, form]);

  const expenseType = useWatch({
    control: form.control,
    name: "expenseType",
  });
  const paymentMethod = useWatch({
    control: form.control,
    name: "paymentMethod",
  });
  const recipientId = useWatch({ control: form.control, name: "recipientId" });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  const transactionDate = useWatch({
    control: form.control,
    name: "transactionDate",
  });

  const recipientOptions = useMemo(
    () =>
      recipients.map((recipient) => ({
        value: recipient.id,
        label: recipient.name,
        description: recipient.role.replaceAll("_", " "),
        keywords: [recipient.role],
      })),
    [recipients],
  );

  const requiredProofCount = expenseType === "REIMBURSEMENT" ? 2 : 1;
  const proofLabel =
    expenseType === "REIMBURSEMENT"
      ? "Wajib: Unggah Bukti Struk Asli/Nota Pembelian DAN Bukti Pembayaran (Kwitansi/Transfer)"
      : paymentMethod === "CASH"
        ? "Wajib: Unggah Foto Kwitansi Tanda Terima"
        : "Wajib: Unggah Bukti Transfer";

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    const chosenAccount = accounts.find((a) => a.id === values.accountId);
    if (!chosenAccount) {
      form.setError("accountId", {
        type: "validate",
        message: "Pilih akun sumber dana terlebih dahulu.",
      });
      return;
    }
    if (chosenAccount.balance < values.amount) {
      form.setError("accountId", {
        type: "validate",
        message: `Saldo akun ini tidak mencukupi (Tersedia ${currency(chosenAccount.balance)}, Dibutuhkan ${currency(values.amount)}).`,
      });
      return;
    }
    if (proofs.length < requiredProofCount) {
      setProofError(
        expenseType === "REIMBURSEMENT"
          ? "Unggah minimal dua bukti: nota pembelian dan bukti pembayarannya."
          : "Unggah minimal satu bukti transaksi terlebih dahulu.",
      );
      return;
    }
    setProofError("");
    setIsPending(true);
    setMessage("");
    try {
      const result = await recordOfficeExpense({
        ...values,
        proofFiles: proofs.map((proof) => proof.file),
        transactionDate: values.transactionDate,
      } satisfies OfficeExpenseInput);
      setMessage(result.message);
      setIsError(!result.success);
      if (result.success) {
        toast.success(result.message || "Pengeluaran internal dicatat.");
        onClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Office expense form submission failed:", error);
      const errMsg = "Pengeluaran gagal dicatat. Silakan coba kembali.";
      setMessage(errMsg);
      setIsError(true);
      toast.error(errMsg);
    } finally {
      setIsPending(false);
    }
  });

  const formId = "finance-office-expense-form";

  return (
    <GlobalModal
      isOpen={open}
      onClose={handleClose}
      title="Catat Pengeluaran Internal"
      icon={<Wallet aria-hidden="true" className="size-5" />}
      description="Catat gaji, kasbon, atau reimbursement; saldo akun dipotong saat transaksi tersimpan."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => {
              form.handleSubmit(
                (values) => submit(),
                (errors) => {
                  if (proofs.length < requiredProofCount) {
                    setProofError(
                      expenseType === "REIMBURSEMENT"
                        ? "Unggah minimal dua bukti: nota pembelian dan bukti pembayarannya."
                        : "Unggah bukti transaksi terlebih dahulu.",
                    );
                  }
                },
              )();
            }}
            disabled={
              isPending ||
              isPreparingProof ||
              recipients.length === 0 ||
              accounts.length === 0
            }
            className="bg-orange-600 text-white hover:bg-orange-700 font-semibold"
          >
            {isPending
              ? "Menyimpan..."
              : isPreparingProof
                ? "Memproses Foto..."
                : "Simpan Pengeluaran"}
          </Button>
        </>
      }
    >
      {accounts.length === 0 ? (
        <p className="type-p2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          Buat akun bank/kas terlebih dahulu sebelum mencatat pengeluaran.
        </p>
      ) : recipients.length === 0 ? (
        <p className="type-p2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          Tidak ada pengguna aktif yang dapat dipilih sebagai penerima dana.
        </p>
      ) : (
        <form id={formId} className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-type`}>Tipe Pengeluaran</Label>
              <Select
                value={expenseType}
                onValueChange={(value) => {
                  if (
                    value === "SALARY" ||
                    value === "ADVANCE" ||
                    value === "REIMBURSEMENT"
                  ) {
                    form.setValue("expenseType", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                }}
                disabled={isPending}
              >
                <SelectTrigger id={`${formId}-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(expenseTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-recipient`}>Penerima Dana</Label>
              <Combobox
                id={`${formId}-recipient`}
                options={recipientOptions}
                value={recipientId}
                onValueChange={(value) =>
                  form.setValue("recipientId", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                placeholder="Pilih karyawan / tim"
                searchPlaceholder="Cari nama atau role..."
                disabled={isPending}
              />
              {form.formState.errors.recipientId && (
                <p className="type-p2 text-destructive" role="alert">
                  {form.formState.errors.recipientId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-amount`}>Nominal (Rp)</Label>
              <input type="hidden" {...form.register("amount")} />
              <RupiahAmountInput
                id={`${formId}-amount`}
                value={amountInput}
                onChange={(formatted) => {
                  const parsed = parseRupiahInput(formatted);
                  setAmountInput(formatted);
                  form.setValue("amount", parsed, {
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

            <div className="space-y-2">
              <Label htmlFor={`${formId}-account`}>Sumber Kas / Bank</Label>
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
                  <SelectValue placeholder="Pilih akun kas / bank" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.accountName} · Saldo {currency(account.balance)}
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-date`}>Tanggal Pengeluaran</Label>
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
                Sesuaikan tanggal jika input susulan.
              </p>
              {form.formState.errors.transactionDate && (
                <p className="type-p2 text-destructive" role="alert">
                  {form.formState.errors.transactionDate.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Metode Bayar</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(value) => {
                  if (value === "TRANSFER" || value === "CASH") {
                    form.setValue("paymentMethod", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                }}
                className="flex flex-wrap gap-3 pt-1"
              >
                {[
                  ["TRANSFER", "Transfer"],
                  ["CASH", "Tunai (Cash)"],
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
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-description`}>Keterangan</Label>
            <Textarea
              id={`${formId}-description`}
              maxLength={1000}
              placeholder="Contoh: Gaji Bulan November 2026 - Drafter"
              {...form.register("description")}
            />
            {form.formState.errors.description && (
              <p className="type-p2 text-destructive" role="alert">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-proofs`}>{proofLabel}</Label>
            <FileDropzone
              id={`${formId}-proofs`}
              accept={FINANCE_PROOF_ACCEPT_ALL}
              multiple
              capture="environment"
              maxFiles={5}
              maxSizeMb={5}
              files={proofs.map((item) => item.file)}
              label={
                isPreparingProof ? "Memproses file bukti..." : "Unggah Bukti"
              }
              hint={
                expenseType === "REIMBURSEMENT"
                  ? "Minimal 2 file: nota pembelian dan bukti bayar (PDF/JPG/PNG/WEBP/HEIC, maks 5 MB/file)."
                  : "Minimal 1 bukti transaksi (PDF/JPG/PNG/WEBP/HEIC, maks 5 MB/file)."
              }
              disabled={isPending || isPreparingProof}
              onError={(err) => setProofError(err)}
              onFilesChange={async (nextFiles) => {
                // Jika user menghapus satu file lewat chip dropzone
                if (nextFiles.length < proofs.length) {
                  setProofs(
                    nextFiles.map((file) => ({ file, name: file.name })),
                  );
                  return;
                }
                const newlyAdded = nextFiles.filter(
                  (file) => !proofs.some((existing) => existing.file === file),
                );
                if (newlyAdded.length === 0) return;

                setIsPreparingProof(true);
                setProofError("");
                try {
                  const { prepared, error: prepError } =
                    await prepareFinanceProofFiles(newlyAdded);
                  if (prepared.length > 0) {
                    setProofs((current) =>
                      [
                        ...current,
                        ...prepared.map((file) => ({
                          file,
                          name: file.name,
                        })),
                      ].slice(0, 5),
                    );
                  }
                  setProofError(prepError);
                } finally {
                  setIsPreparingProof(false);
                }
              }}
            />
            {proofError && (
              <p className="type-p2 text-destructive" role="alert">
                {proofError}
              </p>
            )}
            {proofs.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {proofs.map((proof) => (
                  <div
                    key={`${proof.file.name}-${proof.file.lastModified}-${proof.file.size}`}
                    className="overflow-hidden rounded-lg border bg-card"
                  >
                    <div className="flex h-24 flex-col items-center justify-center gap-1.5 bg-muted/50 text-muted-foreground">
                      {proof.file.type === "application/pdf" ? (
                        <FileText className="size-7" aria-hidden="true" />
                      ) : (
                        <ReceiptText className="size-7" aria-hidden="true" />
                      )}
                      <span className="type-p3">Siap disimpan</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="type-p3 min-w-0 truncate" title={proof.name}>
                        {proof.name}
                      </span>
                      <ActionIconButton
                        label={`Hapus ${proof.name}`}
                        tooltip={`Hapus ${proof.name}`}
                        icon={Trash2}
                        onClick={() =>
                          setProofs((current) =>
                            current.filter((item) => item !== proof),
                          )
                        }
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        variant="ghost"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Badge variant={proofs.length >= requiredProofCount ? "success" : "warning"}>
              {proofs.length} dari minimal {requiredProofCount} bukti
            </Badge>
          </div>
          {message && (
            <p
              className={
                isError
                  ? "type-p2 text-destructive"
                  : "type-p2 text-emerald-600 dark:text-emerald-400"
              }
              role="status"
            >
              {message}
            </p>
          )}
        </form>
      )}
    </GlobalModal>
  );
}
