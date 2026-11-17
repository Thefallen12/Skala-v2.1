"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOfficeExpense } from "@/app/actions/finance";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { DatePicker } from "@/components/ui/date-picker";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiahInput, parseRupiahInput } from "@/lib/indonesian-currency";
import { withLocalPhotoPreview } from "@/lib/photo-urls";
import {
  FINANCE_PROOF_ACCEPT_ALL,
  prepareFinanceProofFiles,
} from "@/lib/finance-proof-client";
import { Calendar, Eye, FileText, Image as ImageIcon, ReceiptText, Trash2, Wallet } from "lucide-react";

type NewExpenseProofItem = {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  isPdf: boolean;
};

function revokeProofItems(items: NewExpenseProofItem[]) {
  for (const item of items) {
    if (item.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

export type EditingOfficeExpense = {
  id: string;
  expenseType: string;
  description: string;
  amount: number;
  paymentMethod: string;
  proofUrls: string[];
  createdAt: string;
  recipientName: string;
  recipientRole: string;
  account: { accountName: string };
};

export default function EditOfficeExpenseModal({
  open,
  onClose,
  expense,
  onReceiptPreview,
}: {
  open: boolean;
  onClose: () => void;
  expense: EditingOfficeExpense | null;
  onReceiptPreview?: (receipt: { url: string; label: string }) => void;
}) {
  const router = useRouter();
  const [transactionDate, setTransactionDate] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [description, setDescription] = useState("");
  const [keepUrls, setKeepUrls] = useState<string[]>([]);
  const [newProofFiles, setNewProofFiles] = useState<NewExpenseProofItem[]>([]);
  const newProofFilesRef = useRef<NewExpenseProofItem[]>([]);
  const [proofError, setProofError] = useState("");
  const [isPreparingProof, setIsPreparingProof] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    newProofFilesRef.current = newProofFiles;
  }, [newProofFiles]);

  useEffect(() => {
    return () => {
      revokeProofItems(newProofFilesRef.current);
    };
  }, []);

  const [prevSyncKey, setPrevSyncKey] = useState("");
  const syncKey =
    open && expense
      ? `${expense.id}:${expense.amount}:${expense.description ?? ""}:${expense.createdAt}:${(expense.proofUrls ?? []).join(",")}`
      : "";

  if (syncKey && syncKey !== prevSyncKey && expense) {
    setPrevSyncKey(syncKey);
    const d = new Date(expense.createdAt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setTransactionDate(`${yyyy}-${mm}-${dd}`);
    setAmountInput(formatRupiahInput(String(expense.amount)));
    setDescription(expense.description || "");
    setKeepUrls(expense.proofUrls || []);
    revokeProofItems(newProofFiles);
    setNewProofFiles([]);
    setProofError("");
    setMessage("");
    setIsError(false);
  } else if (!open && prevSyncKey !== "") {
    setPrevSyncKey("");
    revokeProofItems(newProofFiles);
    setNewProofFiles([]);
  }

  if (!expense) return null;

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSave = async () => {
    const parsedAmount = parseRupiahInput(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Nominal pengeluaran harus lebih besar dari Rp 0.");
      setIsError(true);
      return;
    }

    if (!transactionDate) {
      setMessage("Pilih tanggal pengeluaran.");
      setIsError(true);
      return;
    }

    const totalProofs = keepUrls.length + newProofFiles.length;
    if (totalProofs === 0) {
      setProofError("Minimal harus ada satu foto bukti transaksi.");
      return;
    }

    setProofError("");
    setMessage("");
    setIsPending(true);

    try {
      const result = await updateOfficeExpense({
        id: expense.id,
        transactionDate,
        amount: parsedAmount,
        keepProofUrls: keepUrls,
        newProofFiles: newProofFiles.map((item) => item.file),
        description: description.trim(),
      });

      setMessage(result.message);
      setIsError(!result.success);

      if (result.success) {
        toast.success(result.message || "Pengeluaran berhasil diperbarui.");
        onClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error("Update office expense error:", err);
      const errMsg = "Gagal memperbarui pengeluaran. Silakan coba kembali.";
      setMessage(errMsg);
      setIsError(true);
      toast.error(errMsg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={handleClose}
      title="Edit Pengeluaran Internal"
      icon={<Wallet aria-hidden="true" className="size-5" />}
      description={`Penerima: ${expense.recipientName} (${expense.recipientRole.replaceAll("_", " ")}) · ${expense.account.accountName}`}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || isPreparingProof}
            className="bg-orange-600 text-white hover:bg-orange-700 font-semibold"
          >
            {isPending
              ? "Menyimpan Perubahan..."
              : isPreparingProof
                ? "Memproses Foto..."
                : "Simpan Perubahan"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1. Edit Tanggal */}
          <div className="space-y-2">
            <Label htmlFor="edit-expense-date" className="flex items-center gap-1.5 font-medium">
              <Calendar className="size-4 text-primary" />
              Tanggal Transaksi
            </Label>
            <DatePicker
              id="edit-expense-date"
              value={transactionDate}
              onValueChange={setTransactionDate}
              disabled={isPending}
            />
            <p className="type-p3 text-muted-foreground">
              Ubah tanggal transaksi sesuai catatan bukti.
            </p>
          </div>

          {/* 2. Edit Nominal */}
          <div className="space-y-2">
            <Label htmlFor="edit-expense-amount" className="flex items-center gap-1.5 font-medium">
              <Wallet className="size-4 text-primary" />
              Nominal (Rp)
            </Label>
            <RupiahAmountInput
              id="edit-expense-amount"
              value={amountInput}
              onChange={(formatted) => setAmountInput(formatted)}
              required
            />
            <p className="type-p3 text-muted-foreground">
              Saldo buku kas disesuaikan otomatis.
            </p>
          </div>
        </div>

        {/* Keterangan */}
        <div className="space-y-2">
          <Label htmlFor="edit-expense-desc">Keterangan / Catatan</Label>
          <Textarea
            id="edit-expense-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={2}
            disabled={isPending}
          />
        </div>

        {/* 3. Edit Photo / Bukti */}
        <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 font-semibold text-sm">
              <ImageIcon className="size-4 text-orange-600" />
              Edit Foto Bukti Transaksi
            </Label>
            <span className="text-xs font-medium text-muted-foreground">
              {keepUrls.length + newProofFiles.length} Bukti Terpasang
            </span>
          </div>

          {/* Existing Photos List */}
          {keepUrls.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Bukti Saat Ini:</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {keepUrls.map((url, idx) => (
                  <div key={url} className="relative overflow-hidden rounded-lg border bg-card p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-1.5">
                      <span className="text-xs font-medium">Bukti {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        {onReceiptPreview && (
                          <ActionIconButton
                            label="Lihat Foto"
                            tooltip="Lihat Foto"
                            icon={Eye}
                            onClick={() => onReceiptPreview({ url, label: `Bukti ${idx + 1} · ${expense.recipientName}` })}
                            variant="ghost"
                            className="size-7 text-primary"
                          />
                        )}
                        <ActionIconButton
                          label="Hapus Foto Ini"
                          tooltip="Hapus Foto Ini"
                          icon={Trash2}
                          onClick={() => setKeepUrls((current) => current.filter((u) => u !== url))}
                          variant="ghost"
                          className="size-7 text-destructive hover:bg-destructive/10"
                        />
                      </div>
                    </div>
                    <div className="h-20 w-full overflow-hidden rounded bg-muted flex items-center justify-center">
                      {url.split(/[?#]/, 1)[0].toLowerCase().endsWith(".pdf") ? (
                        <FileText className="size-8 text-muted-foreground" />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          key={url}
                          src={withLocalPhotoPreview(url)}
                          alt={`Bukti ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Uploaded Photos */}
          {newProofFiles.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <span className="text-xs font-medium text-emerald-600">Foto Baru Siap Diunggah:</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {newProofFiles.map((proof) => (
                  <div key={proof.id} className="relative overflow-hidden rounded-lg border border-emerald-500/40 bg-emerald-50/20 p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs truncate font-medium max-w-[120px]" title={proof.name}>
                        {proof.name}
                      </span>
                      <ActionIconButton
                        label="Batal Unggah"
                        tooltip="Batal Unggah"
                        icon={Trash2}
                        onClick={() => {
                          if (proof.previewUrl.startsWith("blob:")) {
                            URL.revokeObjectURL(proof.previewUrl);
                          }
                          setNewProofFiles((current) => current.filter((item) => item.id !== proof.id));
                        }}
                        variant="ghost"
                        className="size-7 text-destructive"
                      />
                    </div>
                    <div className="h-20 w-full overflow-hidden flex items-center justify-center bg-muted/40 rounded text-xs text-muted-foreground">
                      {proof.isPdf ? (
                        <div className="flex items-center gap-1.5 text-emerald-700">
                          <ReceiptText className="size-5" />
                          <span>PDF</span>
                        </div>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          key={proof.previewUrl}
                          src={proof.previewUrl}
                          alt={`Pratinjau ${proof.name}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File input to add new/replacement photos */}
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="edit-expense-file-input" className="type-p3 font-medium">
              Tambah / Ganti Foto Bukti
            </Label>
            <FileDropzone
              id="edit-expense-file-input"
              accept={FINANCE_PROOF_ACCEPT_ALL}
              multiple
              capture="environment"
              maxFiles={Math.max(1, 5 - keepUrls.length)}
              maxSizeMb={5}
              files={newProofFiles.map((item) => item.file)}
              label={
                isPreparingProof ? "Memproses file bukti..." : "Tambah Bukti"
              }
              hint="PDF, JPG, PNG, WEBP, atau HEIC; maks 5 MB/file (total maks 5 file)."
              disabled={
                isPending ||
                isPreparingProof ||
                keepUrls.length + newProofFiles.length >= 5
              }
              onError={(err) => setProofError(err)}
              onFilesChange={async (nextFiles) => {
                if (nextFiles.length < newProofFiles.length) {
                  const kept = newProofFiles.filter((item) =>
                    nextFiles.includes(item.file),
                  );
                  const removed = newProofFiles.filter(
                    (item) => !nextFiles.includes(item.file),
                  );
                  revokeProofItems(removed);
                  setNewProofFiles(kept);
                  return;
                }
                const newlyAdded = nextFiles.filter(
                  (file) => !newProofFiles.some((item) => item.file === file),
                );
                if (newlyAdded.length === 0) return;

                setIsPreparingProof(true);
                setProofError("");
                try {
                  const { prepared, error: prepError } =
                    await prepareFinanceProofFiles(newlyAdded);
                  const maxAdditional = Math.max(
                    0,
                    5 - keepUrls.length - newProofFiles.length,
                  );
                  const added = prepared.slice(0, maxAdditional).map((file) => ({
                    id: crypto.randomUUID(),
                    file,
                    name: file.name,
                    previewUrl: URL.createObjectURL(file),
                    isPdf:
                      file.type === "application/pdf" ||
                      file.name.toLowerCase().endsWith(".pdf"),
                  }));
                  if (added.length > 0) {
                    setNewProofFiles((prev) => [...prev, ...added]);
                  }
                  setProofError(prepError);
                } finally {
                  setIsPreparingProof(false);
                }
              }}
            />
          </div>

          {proofError && (
            <p className="type-p3 text-destructive font-medium" role="alert">
              {proofError}
            </p>
          )}
        </div>

        {message && (
          <p
            className={
              isError
                ? "type-p2 text-destructive font-medium"
                : "type-p2 text-emerald-600 dark:text-emerald-400 font-medium"
            }
            role="status"
          >
            {message}
          </p>
        )}
      </div>
    </GlobalModal>
  );
}
