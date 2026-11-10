"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateOfficeExpense } from "@/app/actions/finance";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiahInput, parseRupiahInput } from "@/lib/indonesian-currency";
import { Calendar, Eye, FileText, Image as ImageIcon, ReceiptText, Trash2, Wallet } from "lucide-react";

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
  const [newProofFiles, setNewProofFiles] = useState<{ file: File; name: string }[]>([]);
  const [proofError, setProofError] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (expense && open) {
      const d = new Date(expense.createdAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setTransactionDate(`${yyyy}-${mm}-${dd}`);
      setAmountInput(formatRupiahInput(String(expense.amount)));
      setDescription(expense.description || "");
      setKeepUrls(expense.proofUrls || []);
      setNewProofFiles([]);
      setProofError("");
      setMessage("");
      setIsError(false);
    }
  }, [expense, open]);

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
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 800);
      }
    } catch (err) {
      console.error("Update office expense error:", err);
      setMessage("Gagal memperbarui pengeluaran. Silakan coba kembali.");
      setIsError(true);
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
            disabled={isPending}
            className="bg-orange-600 text-white hover:bg-orange-700 font-semibold"
          >
            {isPending ? "Menyimpan Perubahan..." : "Simpan Perubahan"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1. Edit Tanggal */}
          <div className="space-y-2">
            <Label htmlFor="edit-expense-date" className="flex items-center gap-1.5 font-medium">
              <Calendar className="size-4 text-orange-600" />
              Edit Tanggal Transaksi
            </Label>
            <Input
              type="date"
              id="edit-expense-date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="h-10 bg-background text-foreground"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Ubah tanggal transaksi sesuai catatan bukti pengeluaran.
            </p>
          </div>

          {/* 2. Edit Nominal */}
          <div className="space-y-2">
            <Label htmlFor="edit-expense-amount" className="flex items-center gap-1.5 font-medium">
              <Wallet className="size-4 text-orange-600" />
              Edit Nominal (Rp)
            </Label>
            <RupiahAmountInput
              id="edit-expense-amount"
              value={amountInput}
              onChange={(formatted) => setAmountInput(formatted)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Saldo akun buku kas akan otomatis disesuaikan dengan selisih nominal.
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
                      {url.endsWith(".pdf") ? (
                        <FileText className="size-8 text-muted-foreground" />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={url} alt={`Bukti ${idx + 1}`} className="h-full w-full object-cover" />
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
                {newProofFiles.map((proof, idx) => (
                  <div key={`${proof.name}-${idx}`} className="relative overflow-hidden rounded-lg border border-emerald-500/40 bg-emerald-50/20 p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs truncate font-medium max-w-[120px]" title={proof.name}>
                        {proof.name}
                      </span>
                      <ActionIconButton
                        label="Batal Unggah"
                        tooltip="Batal Unggah"
                        icon={Trash2}
                        onClick={() => setNewProofFiles((current) => current.filter((_, i) => i !== idx))}
                        variant="ghost"
                        className="size-7 text-destructive"
                      />
                    </div>
                    <div className="h-14 w-full flex items-center justify-center bg-muted/40 rounded text-xs text-muted-foreground">
                      <ReceiptText className="size-6 text-emerald-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File input to add new/replacement photos */}
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="edit-expense-file-input" className="text-xs font-medium">
              Tambah / Ganti Foto Bukti (JPG, PNG, WEBP, PDF - Maks 5 MB)
            </Label>
            <Input
              id="edit-expense-file-input"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              disabled={isPending || keepUrls.length + newProofFiles.length >= 5}
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? []);
                const valid = files.filter(
                  (f) => f.size > 0 && f.size <= 5 * 1024 * 1024 && ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type)
                );
                setNewProofFiles((prev) => [...prev, ...valid.map((file) => ({ file, name: file.name }))].slice(0, 5 - keepUrls.length));
                setProofError(valid.length !== files.length ? "Beberapa file dilewati karena bukan foto/PDF atau melebihi 5 MB." : "");
                e.currentTarget.value = "";
              }}
            />
          </div>

          {proofError && (
            <p className="text-xs text-destructive font-medium" role="alert">
              {proofError}
            </p>
          )}
        </div>

        {message && (
          <p className={isError ? "text-sm text-destructive font-medium" : "text-sm text-emerald-600 font-medium"} role="status">
            {message}
          </p>
        )}
      </div>
    </GlobalModal>
  );
}
