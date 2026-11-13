"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { recordOfficeExpense } from "@/app/actions/finance";
import type { OfficeExpenseInput } from "@/app/actions/finance";
import type {
  FinanceAccountOption,
} from "@/app/components/apps/finance/IncomingFundModal";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
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
  const amount = useWatch({ control: form.control, name: "amount" });
  const accountId = useWatch({ control: form.control, name: "accountId" });

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
        onClose();
        router.refresh();
      }
    } catch (error) {
      console.error("Office expense form submission failed:", error);
      setMessage("Pengeluaran gagal dicatat. Silakan coba kembali.");
      setIsError(true);
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
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Buat akun bank/kas terlebih dahulu sebelum mencatat pengeluaran.
        </p>
      ) : recipients.length === 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Tidak ada pengguna aktif yang dapat dipilih sebagai penerima dana.
        </p>
      ) : (
        <form id={formId} className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-type`}>Tipe Pengeluaran</Label>
              <select
                id={`${formId}-type`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                {...form.register("expenseType")}
              >
                {Object.entries(expenseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-recipient`}>Penerima Dana</Label>
              <select
                id={`${formId}-recipient`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                {...form.register("recipientId")}
              >
                <option value="">Pilih karyawan / tim</option>
                {recipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name} · {recipient.role}
                  </option>
                ))}
              </select>
              {form.formState.errors.recipientId && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.recipientId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-amount`}>Nominal Pengeluaran (Rp)</Label>
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
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.amount.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-account`}>Sumber Dana (Buku Kas / Bank)</Label>
              <select
                id={`${formId}-account`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                {...form.register("accountId")}
              >
                <option value="">Pilih akun kas / bank</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName} · Saldo {currency(account.balance)}
                  </option>
                ))}
              </select>
              {form.formState.errors.accountId && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.accountId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-date`}>Tanggal Pengeluaran</Label>
              <Input
                type="date"
                id={`${formId}-date`}
                className="h-10 bg-background text-foreground"
                {...form.register("transactionDate")}
              />
              <p className="text-xs text-muted-foreground">
                Bebas disesuaikan jika pengeluaran terlambat di-input (input susulan).
              </p>
              {form.formState.errors.transactionDate && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.transactionDate.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <div className="flex flex-wrap gap-4 pt-1.5">
                {[
                  ["TRANSFER", "Transfer Bank / E-Wallet"],
                  ["CASH", "Kas Tunai (Cash)"],
                ].map(([value, label]) => (
                  <FormLabel
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <input
                      type="radio"
                      value={value}
                      {...form.register("paymentMethod")}
                    />
                    {label}
                  </FormLabel>
                ))}
              </div>
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
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-proofs`}>{proofLabel}</Label>
            <Input
              id={`${formId}-proofs`}
              type="file"
              accept={FINANCE_PROOF_ACCEPT_ALL}
              multiple
              disabled={isPending || isPreparingProof || proofs.length >= 5}
              onChange={async (event) => {
                const input = event.currentTarget;
                const selectedFiles = Array.from(input.files ?? []);
                if (selectedFiles.length === 0) return;

                setIsPreparingProof(true);
                setProofError("");
                try {
                  const { prepared, error: prepError } =
                    await prepareFinanceProofFiles(selectedFiles);
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
                  input.value = "";
                }
              }}
            />
            {isPreparingProof && (
              <p className="text-xs text-muted-foreground" role="status">
                Memproses dan mengompres file bukti...
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              File tetap lokal sampai tombol Simpan Pengeluaran ditekan. PDF, JPG, PNG, WEBP, atau foto iPhone (HEIC) · Maks. 5 MB/file · Maks. 5 file.
            </p>
            <p className="text-xs text-muted-foreground">
              {expenseType === "REIMBURSEMENT"
                ? "Untuk reimbursement, unggah minimal dua file: nota pembelian dan bukti pembayaran."
                : "Unggah minimal satu bukti transaksi."}
            </p>
            {proofError && (
              <p className="text-sm text-destructive" role="alert">
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
                    <div className="flex h-28 flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground">
                      {proof.file.type === "application/pdf" ? (
                        <FileText className="size-8" aria-hidden="true" />
                      ) : (
                        <ReceiptText className="size-8" aria-hidden="true" />
                      )}
                      <span className="text-xs">File lokal siap disimpan</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="min-w-0 truncate text-xs" title={proof.name}>
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
              className={isError ? "text-sm text-destructive" : "text-sm text-emerald-600"}
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
