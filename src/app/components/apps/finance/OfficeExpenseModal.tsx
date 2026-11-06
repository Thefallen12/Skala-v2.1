"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseRupiahInput } from "@/lib/indonesian-currency";
import { FileText, ReceiptText, Trash2, Wallet } from "lucide-react";

const officeExpenseSchema = z.object({
  expenseType: z.enum(["SALARY", "ADVANCE", "REIMBURSEMENT"]),
  recipientId: z.string().min(1, "Pilih penerima dana."),
  accountId: z.string().min(1, "Pilih sumber dana."),
  paymentMethod: z.enum(["TRANSFER", "CASH"]),
  amount: z.number().positive("Nominal harus lebih besar dari nol."),
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
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const form = useForm<OfficeExpenseFormValues>({
    resolver: zodResolver(officeExpenseSchema),
    defaultValues: {
      expenseType: "SALARY",
      recipientId: recipients[0]?.id ?? "",
      accountId: accounts.find((account) => account.balance > 0)?.id ?? "",
      paymentMethod: "TRANSFER",
      amount: 0,
      description: "",
    },
  });
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
  const eligibleAccounts = accounts.filter(
    (account) => account.balance >= amount && account.balance > 0,
  );
  const selectedAccountIsEligible = eligibleAccounts.some(
    (account) => account.id === accountId,
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
    if (
      !accounts.some(
        (account) =>
          account.id === values.accountId && account.balance >= values.amount,
      )
    ) {
      form.setError("accountId", {
        type: "validate",
        message: "Saldo akun yang dipilih tidak mencukupi.",
      });
      return;
    }
    if (proofs.length < requiredProofCount) {
      setProofError(
        expenseType === "REIMBURSEMENT"
          ? "Unggah minimal dua bukti: nota pembelian dan bukti pembayarannya."
          : "Unggah bukti transaksi terlebih dahulu.",
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
            type="submit"
            form={formId}
            disabled={
              isPending ||
              !selectedAccountIsEligible ||
              recipients.length === 0 ||
              proofs.length < requiredProofCount
            }
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            {isPending ? "Menyimpan..." : "Simpan Pengeluaran"}
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

          <div className="space-y-2">
            <Label htmlFor={`${formId}-account`}>Sumber Dana</Label>
            <select
              id={`${formId}-account`}
              disabled={eligibleAccounts.length === 0}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
              {...form.register("accountId")}
            >
              <option value="">Pilih akun dengan saldo mencukupi</option>
              {accounts.map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                  disabled={account.balance < amount || account.balance <= 0}
                >
                  {account.accountName} · Saldo {currency(account.balance)}
                </option>
              ))}
            </select>
            {eligibleAccounts.length === 0 && (
              <p className="text-sm text-destructive" role="alert">
                Tidak ada akun dengan saldo yang mencukupi untuk nominal ini.
              </p>
            )}
            {form.formState.errors.accountId && (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.accountId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Metode Pembayaran</Label>
            <div className="flex flex-wrap gap-4">
              {[
                ["TRANSFER", "Transfer"],
                ["CASH", "Cash"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    value={value}
                    {...form.register("paymentMethod")}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-amount`}>Nominal (Rupiah)</Label>
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
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.amount.message}
              </p>
            )}
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
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              disabled={isPending || proofs.length >= 5}
              onChange={(event) => {
                const selectedFiles = Array.from(event.currentTarget.files ?? []);
                const validFiles = selectedFiles.filter(
                  (file) =>
                    file.size > 0 &&
                    file.size <= 5 * 1024 * 1024 &&
                    [
                      "application/pdf",
                      "image/jpeg",
                      "image/png",
                      "image/webp",
                    ].includes(file.type),
                );
                setProofs((current) =>
                  [
                    ...current,
                    ...validFiles.map((file) => ({ file, name: file.name })),
                  ].slice(0, 5),
                );
                setProofError(
                  validFiles.length !== selectedFiles.length
                    ? "Pilih PDF, JPG, PNG, atau WEBP berukuran maksimal 5 MB."
                    : "",
                );
                event.currentTarget.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              File tetap lokal sampai tombol Simpan Pengeluaran ditekan. PDF, JPG, PNG, WEBP · Maks. 5 MB/file · Maks. 5 file.
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
