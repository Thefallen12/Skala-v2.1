"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ArrowLeft, Check, Download, Plus, Printer, Save, Trash2 } from "lucide-react";
import { POPaymentMethod, type POStatus } from "@prisma/client";
import {
  approvePurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrder,
  reviewPurchaseOrder,
  submitPurchaseOrderForFinanceReview,
  updatePurchaseOrder,
} from "@/app/actions/orders";
import type { PurchaseOrderItemInput } from "@/app/actions/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";

type POFormValues = {
  poNumber: string;
  vendorName: string;
  paymentMethod: POPaymentMethod;
  paymentBankName: string;
  paymentAccountNumber: string;
  paymentAccountName: string;
  paymentTerms: string;
  includeTax: boolean;
  items: PurchaseOrderItemInput[];
};

const emptyItems: PurchaseOrderItemInput[] = [];

const statusLabels: Record<POStatus, string> = {
  DRAFT: "Draft",
  PENDING_FINANCE_REVIEW: "Menunggu pemeriksaan Keuangan",
  PENDING_APPROVAL: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function POEditForm({
  publicCode,
  poNumber,
  vendorName,
  vendorAddress,
  vendorContact,
  vendorPhone,
  paymentMethod,
  paymentBankName,
  paymentAccountNumber,
  paymentAccountName,
  paymentTerms,
  includeTax = false,
  projectSiteName,
  status,
  items,
  qrDataUrl,
  canEdit = true,
  canReview = false,
  canApprove = false,
  createdAt,
  logisticsStaffName,
  initialPreviewOpen = false,
  financeReviewerName,
  financeReviewedAt,
  approvedByName,
  approvedAt,
}: {
  publicCode?: string;
  poNumber?: string;
  vendorName?: string;
  vendorAddress?: string | null;
  vendorContact?: string | null;
  vendorPhone?: string | null;
  paymentMethod?: POPaymentMethod;
  paymentBankName?: string | null;
  paymentAccountNumber?: string | null;
  paymentAccountName?: string | null;
  paymentTerms?: string | null;
  includeTax?: boolean;
  projectSiteName?: string | null;
  status?: POStatus;
  items?: PurchaseOrderItemInput[];
  qrDataUrl?: string | null;
  canEdit?: boolean;
  canReview?: boolean;
  canApprove?: boolean;
  createdAt?: string;
  logisticsStaffName?: string | null;
  initialPreviewOpen?: boolean;
  financeReviewerName?: string | null;
  financeReviewedAt?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(initialPreviewOpen);
  const [currentStatus, setCurrentStatus] = useState<POStatus>(status ?? "DRAFT");
  const [currentQr, setCurrentQr] = useState(qrDataUrl ?? null);
  const [currentReviewer, setCurrentReviewer] = useState(financeReviewerName ?? "");
  const [currentReviewTime, setCurrentReviewTime] = useState(financeReviewedAt ?? "");
  const [currentApprover, setCurrentApprover] = useState(approvedByName ?? "");
  const [currentApprovalTime, setCurrentApprovalTime] = useState(approvedAt ?? "");
  const isEditable = canEdit && currentStatus === "DRAFT";
  const form = useForm<POFormValues>({
    defaultValues: {
      poNumber: poNumber ?? "",
      vendorName: vendorName ?? "",
      paymentMethod: paymentMethod ?? POPaymentMethod.CASH,
      paymentBankName: paymentBankName ?? "",
      paymentAccountNumber: paymentAccountNumber ?? "",
      paymentAccountName: paymentAccountName ?? "",
      paymentTerms: paymentTerms ?? "",
      includeTax,
      items: items?.length
        ? items
        : [{ itemName: "", quantity: 1, unit: "pcs", unitPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const watchedItems =
    useWatch({ control: form.control, name: "items" }) ?? emptyItems;
  const watchedForm = useWatch({ control: form.control });
  const subtotal = useMemo(
    () =>
      watchedItems.reduce(
        (sum, item) =>
          sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        0,
      ),
    [watchedItems],
  );
  const tax = watchedForm.includeTax ? subtotal * 0.11 : 0;

  const submit = form.handleSubmit(async (values) => {
    setMessage("");
    setIsSaving(true);
    try {
      const result = publicCode
        ? await updatePurchaseOrder(publicCode, values)
        : await createPurchaseOrder(values);
      setIsError(!result.success);
      setMessage(result.message);
      if (result.success) {
        if (publicCode) router.back();
        else if (result.publicCode) router.replace(`/d/${result.publicCode}`);
        else router.refresh();
      }
    } catch (error) {
      console.error("Purchase Order edit failed:", error);
      setIsError(true);
      setMessage("PO gagal disimpan. Periksa koneksi lalu coba kembali.");
    } finally {
      setIsSaving(false);
    }
  });

  const handleReview = async () => {
    if (!publicCode) return;
    setIsSaving(true);
    setMessage("");
    try {
      const result = await reviewPurchaseOrder(publicCode);
      setIsError(!result.success);
      setMessage(result.message);
      if (result.success) {
        setCurrentStatus("PENDING_APPROVAL");
        setCurrentReviewer(result.actorName ?? "Manager Keuangan");
        setCurrentReviewTime(new Date().toLocaleString("id-ID"));
        router.refresh();
      }
    } catch (error) {
      console.error("Purchase Order finance review failed:", error);
      setIsError(true);
      setMessage("Pemeriksaan PO gagal. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitForFinanceReview = async () => {
    if (!publicCode) return;
    const isValid = await form.trigger();
    if (!isValid) {
      setIsError(true);
      setMessage("Lengkapi data PO sebelum mengajukan ke Keuangan.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const saved = await updatePurchaseOrder(publicCode, form.getValues());
      if (!saved.success) {
        setIsError(true);
        setMessage(saved.message);
        return;
      }

      const result = await submitPurchaseOrderForFinanceReview(publicCode);
      setIsError(!result.success);
      setMessage(result.message);
      if (result.success) {
        setCurrentStatus("PENDING_FINANCE_REVIEW");
        router.refresh();
      }
    } catch (error) {
      console.error("Purchase Order submission failed:", error);
      setIsError(true);
      setMessage("PO gagal diajukan ke Keuangan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproval = async () => {
    if (!publicCode) return;
    setIsSaving(true);
    setMessage("");
    try {
      const result = await approvePurchaseOrder(publicCode);
      setIsError(!result.success);
      setMessage(result.message);
      if (result.success) {
        setCurrentStatus("APPROVED");
        setCurrentQr(result.qrDataUrl ?? null);
        setCurrentApprover(result.actorName ?? "Direktur");
        setCurrentApprovalTime(new Date().toLocaleString("id-ID"));
        router.refresh();
      }
    } catch (error) {
      console.error("Purchase Order approval failed:", error);
      setIsError(true);
      setMessage("Persetujuan PO gagal. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePurchaseOrder = async () => {
    const canDelete =
      (canEdit && currentStatus === "DRAFT") || canApprove;
    if (!publicCode || !canDelete) return;
    setIsSaving(true);
    setMessage("");
    try {
      const result = await deletePurchaseOrder(publicCode);
      setIsError(!result.success);
      setMessage(result.message);
      if (result.success) {
        setIsDeleteDialogOpen(false);
        router.replace(
          canApprove ? "/apps/approvals" : "/apps/logistics?tab=documents",
        );
        router.refresh();
      }
    } catch (error) {
      console.error("Purchase Order deletion failed:", error);
      setIsError(true);
      setMessage("Purchase Order gagal dihapus. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="order-editor-print-area space-y-6">
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {publicCode ? "Edit Purchase Order" : "Buat Purchase Order"}
            </p>
            <h1 className="text-2xl font-semibold">Purchase Order</h1>
          </div>
          <Badge variant={currentStatus === "APPROVED" ? "default" : "secondary"}>
            {statusLabels[currentStatus]}
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="po-number">Nomor PO</Label>
            {publicCode ? (
              <Input
                id="po-number"
                disabled={!isEditable}
                {...form.register("poNumber", {
                  required: "Nomor PO wajib diisi.",
                  maxLength: 80,
                })}
              />
            ) : (
              <Input
                id="po-number"
                value="Terbit otomatis saat PO disimpan"
                readOnly
                aria-describedby="po-number-hint"
              />
            )}
            {!publicCode && (
              <p id="po-number-hint" className="text-xs text-muted-foreground">
                Format nomor: SPE-urutan/PO/tahun.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-vendor">Nama vendor</Label>
            <Input
              id="po-vendor"
              disabled={!isEditable}
              {...form.register("vendorName", {
                required: "Nama vendor wajib diisi.",
                maxLength: 180,
              })}
            />
          </div>
          <div className="space-y-2">
            <Label>Metode pembayaran</Label>
            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (
                      value !== POPaymentMethod.CASH &&
                      value !== POPaymentMethod.TRANSFER
                    ) {
                      return;
                    }
                    field.onChange(value);
                    if (value === POPaymentMethod.CASH) {
                      form.setValue("paymentBankName", "");
                      form.setValue("paymentAccountNumber", "");
                      form.setValue("paymentAccountName", "");
                    }
                  }}
                  disabled={!isEditable}
                >
                  <SelectTrigger aria-label="Metode pembayaran">
                    <SelectValue placeholder="Pilih metode pembayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={POPaymentMethod.CASH}>Cash</SelectItem>
                    <SelectItem value={POPaymentMethod.TRANSFER}>
                      Transfer
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {watchedForm.paymentMethod === POPaymentMethod.TRANSFER && (
            <>
              <div className="space-y-2">
                <Label htmlFor="po-bank-name">Nama bank tujuan</Label>
                <Input
                  id="po-bank-name"
                  disabled={!isEditable}
                  required
                  maxLength={120}
                  {...form.register("paymentBankName", {
                    required: "Nama bank tujuan wajib diisi.",
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="po-account-number">Nomor rekening</Label>
                <Input
                  id="po-account-number"
                  disabled={!isEditable}
                  required
                  maxLength={80}
                  {...form.register("paymentAccountNumber", {
                    required: "Nomor rekening wajib diisi.",
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="po-account-name">Nama pemilik rekening</Label>
                <Input
                  id="po-account-name"
                  disabled={!isEditable}
                  required
                  maxLength={180}
                  {...form.register("paymentAccountName", {
                    required: "Nama pemilik rekening wajib diisi.",
                  })}
                />
              </div>
            </>
          )}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="po-terms">Syarat pembayaran</Label>
            <Input
              id="po-terms"
              disabled={!isEditable}
              placeholder="Contoh: 30 hari setelah barang diterima"
              {...form.register("paymentTerms", { maxLength: 2000 })}
            />
          </div>
        </div>
        {publicCode && (
          <p className="text-xs text-muted-foreground">URL samaran: /d/{publicCode}</p>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Rincian material</h2>
            <p className="text-sm text-muted-foreground">
              Subtotal dan pajak dihitung otomatis dari jumlah serta harga satuan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!isEditable}
            onClick={() =>
              append({ itemName: "", quantity: 1, unit: "pcs", unitPrice: 0 })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Tambah item material
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama barang</TableHead>
                <TableHead className="w-28">Qty</TableHead>
                <TableHead className="w-32">Satuan</TableHead>
                <TableHead className="w-44">Harga satuan</TableHead>
                <TableHead className="w-44 text-right">Subtotal</TableHead>
                <TableHead className="w-16"><span className="sr-only">Aksi</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <Input
                      aria-label={`Nama barang baris ${index + 1}`}
                      disabled={!isEditable}
                      {...form.register(`items.${index}.itemName`, {
                        required: "Nama barang wajib diisi.",
                        maxLength: 180,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      aria-label={`Qty baris ${index + 1}`}
                      disabled={!isEditable}
                      {...form.register(`items.${index}.quantity`, {
                        valueAsNumber: true,
                        required: true,
                        min: 0.01,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Satuan baris ${index + 1}`}
                      disabled={!isEditable}
                      {...form.register(`items.${index}.unit`, {
                        required: true,
                        maxLength: 40,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`Harga satuan baris ${index + 1}`}
                      disabled={!isEditable}
                      {...form.register(`items.${index}.unitPrice`, {
                        valueAsNumber: true,
                        required: true,
                        min: 0,
                      })}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {currency(
                      (Number(watchedItems[index]?.quantity) || 0) *
                        (Number(watchedItems[index]?.unitPrice) || 0),
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Hapus item baris ${index + 1}`}
                      disabled={!isEditable || fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="ml-auto w-full max-w-sm space-y-3 border-t pt-4 text-sm">
          {isEditable && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="po-include-tax">Kenakan PPN 11%</Label>
              <Controller
                name="includeTax"
                control={form.control}
                render={({ field }) => (
                  <Switch
                    id="po-include-tax"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <span>Subtotal</span><span className="text-right">{currency(subtotal)}</span>
            <span>PPN (11%) {watchedForm.includeTax ? "" : "(tidak dikenakan)"}</span>
            <span className="text-right">{watchedForm.includeTax ? currency(tax) : "—"}</span>
          <strong className="text-base">Grand Total</strong>
          <strong className="text-right text-base">{currency(subtotal + tax)}</strong>
          </div>
        </div>
      </Card>

      {currentStatus === "APPROVED" && (
        <Card className="flex flex-col items-center gap-3 p-5 text-center">
          <h2 className="font-semibold">PO disetujui · {currentApprover}</h2>
          {currentQr ? (
            <Image
              src={currentQr}
              alt="QR unik untuk verifikasi persetujuan Purchase Order"
              width={180}
              height={180}
              unoptimized
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              QR verifikasi belum tersedia. Muat ulang halaman untuk mencoba kembali.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {currentApprovalTime ? `Disetujui pada ${currentApprovalTime}. ` : ""}
            Verifikasi publik tersedia melalui QR ini.
          </p>
        </Card>
      )}

      {message && (
        <p
          className={`text-sm ${isError ? "text-destructive" : "text-emerald-700"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <div className="order-editor-actions flex flex-wrap gap-2">
        {publicCode && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const cameFromApp =
                document.referrer.startsWith(window.location.origin) &&
                window.history.length > 1;
              if (cameFromApp) router.back();
              else router.push("/");
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali
          </Button>
        )}
        {isEditable && (
          <Button type="submit" disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving
            ? "Menyimpan..."
            : publicCode
              ? "Simpan Perubahan"
              : "Buat Purchase Order"}
          </Button>
        )}
        {publicCode &&
          ((canEdit && currentStatus === "DRAFT") || canApprove) && (
          <Button
            type="button"
            variant="destructive"
            disabled={isSaving}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 size-4" aria-hidden="true" />
            {currentStatus === "DRAFT" ? "Hapus Draft" : "Hapus PO"}
          </Button>
        )}
        {canReview &&
          (currentStatus === "DRAFT" ||
            currentStatus === "PENDING_FINANCE_REVIEW") && (
          <Button type="button" disabled={isSaving} onClick={handleReview}>
            <Check className="mr-2 h-4 w-4" />
            Periksa PO (Manager Keuangan)
          </Button>
        )}
        {publicCode && isEditable && (
          <Button
            type="button"
            className="h-9"
            disabled={isSaving}
            onClick={handleSubmitForFinanceReview}
          >
            <Check className="mr-2 h-4 w-4" />
            {isSaving ? "Mengajukan..." : "Simpan & Ajukan ke Keuangan"}
          </Button>
        )}
        {canApprove && currentStatus === "PENDING_APPROVAL" && (
          <Button type="button" disabled={isSaving} onClick={handleApproval}>
            <Check className="mr-2 h-4 w-4" />
            Approve PO
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!publicCode}
          onClick={() => setIsPdfPreviewOpen(true)}
        >
          <Printer className="mr-2 h-4 w-4" /> Pratinjau / Cetak PDF
        </Button>
        {!publicCode && (
          <p className="self-center text-xs text-muted-foreground">
            Simpan PO terlebih dahulu untuk melihat pratinjau cetak.
          </p>
        )}
      </div>
      {publicCode && (
        <GlobalModal
          isOpen={isPdfPreviewOpen}
          onClose={() => setIsPdfPreviewOpen(false)}
          title={`Pratinjau PO ${poNumber}`}
          description="Pratinjau dokumen Purchase Order sesuai format cetak."
          className="max-w-6xl"
          bodyClassName="flex min-h-[65vh] flex-1 flex-col"
          footerNote=""
          footer={
            <>
              {currentStatus === "APPROVED" && (
                <Button asChild>
                  <a
                    href={`/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(publicCode)}`}
                    download
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </a>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPdfPreviewOpen(false)}
              >
                Tutup
              </Button>
            </>
          }
        >
          <UniversalDocumentPreview
            title={`Purchase Order ${poNumber ?? "PO"}`}
            documentNumber={poNumber ?? "PO"}
            src={`/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(publicCode)}`}
          />
        </GlobalModal>
      )}
      </form>
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus {currentStatus === "DRAFT" ? "draft " : ""}PO?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {poNumber ? `“${poNumber}”` : "Purchase Order"} beserta rincian
              barang dan konfirmasi pesanannya akan dihapus permanen. Catatan
              pembayaran atau invoice yang terkait dapat kehilangan hubungan
              dengan PO ini. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isSaving}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void handleDeletePurchaseOrder();
              }}
            >
              {isSaving
                ? "Menghapus..."
                : `Ya, Hapus ${currentStatus === "DRAFT" ? "Draft" : "PO"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
