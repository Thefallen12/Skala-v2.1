"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FilePenLine, FileText, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import type { POPaymentMethod } from "@prisma/client";
import {
  markPurchaseOrderSentToVendor,
  replacePurchaseOrderInvoice,
  submitPurchaseOrderInvoice,
} from "@/app/actions/orders";
import { compressFieldImageFile } from "@/lib/image-compression-client";
import InvoiceDetailsFields, {
  type InvoiceDraft,
} from "@/app/components/apps/logistics/InvoiceDetailsFields";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";

type InvoiceItemSeed = {
  itemCode: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

function createInvoiceDraft(
  items: InvoiceItemSeed[],
  invoiceDate: string,
  includeTax: boolean,
): InvoiceDraft {
  const seed: InvoiceDraft = {
    invoiceNumber: "",
    periodOrDate: invoiceDate,
    tax: 0,
    deduction: 0,
    items: items.map((item) => ({
      itemCode: item.itemCode ?? "",
      description: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
    })),
  };
  if (includeTax) {
    seed.tax = Math.round(
      seed.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) *
        0.11,
    );
  }
  return seed;
}

export default function PurchaseOrderInvoiceUpload({
  publicCode,
  invoiceUrl,
  invoiceId,
  vendorPoSentAt,
  ticketLinked,
  items,
  includeTax,
  invoiceDate,
  paymentMethod,
  paymentTerms,
  paymentBankName,
  paymentAccountNumber,
  paymentAccountName,
  open,
  onOpenChange,
  hideTrigger = false,
  mode,
  canReplace = true,
}: {
  publicCode: string;
  invoiceUrl: string | null;
  invoiceId: string | null;
  vendorPoSentAt: string | null;
  ticketLinked: boolean;
  items: InvoiceItemSeed[];
  includeTax: boolean;
  invoiceDate: string;
  paymentMethod: POPaymentMethod;
  paymentTerms: string | null;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  mode?: "submit" | "replace";
  canReplace?: boolean;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;
  const setResolvedOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };
  const isReplaceMode = mode === "replace" || Boolean(invoiceUrl);

  const markPoSent = async () => {
    setIsPending(true);
    try {
      const response = await markPurchaseOrderSentToVendor(publicCode);
      if (response.success) {
        toast.success(response.message);
        router.refresh();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error("Purchase order vendor dispatch failed:", error);
      toast.error("Pengiriman PO gagal dicatat. Silakan coba kembali.");
    } finally {
      setIsPending(false);
    }
  };

  if (!hideTrigger) {
    if (invoiceUrl) {
      return (
        <>
          <div className="flex items-start gap-1.5">
            <div className="flex w-10 flex-col items-center">
              <ActionIconButton
                label="Lihat invoice vendor"
                tooltip="Lihat Nota"
                icon={ExternalLink}
                href={invoiceUrl}
                target="_blank"
                rel="noreferrer"
              />
            </div>
            {invoiceId && (
              <div className="flex w-10 flex-col items-center">
                <ActionIconButton
                  label="Pratinjau invoice"
                  tooltip="Pratinjau Invoice"
                  icon={FileText}
                  onClick={() => setInvoicePreviewOpen(true)}
                />
              </div>
            )}
            {canReplace && (
              <div className="flex w-10 flex-col items-center">
                <ActionIconButton
                  label="Ganti Foto/PDF Nota"
                  tooltip="Ganti Nota"
                  icon={FilePenLine}
                  disabled={isPending}
                  onClick={() => setResolvedOpen(true)}
                />
              </div>
            )}
          </div>
          {invoiceId && (
            <GlobalModal
              isOpen={invoicePreviewOpen}
              onClose={() => setInvoicePreviewOpen(false)}
              title="Pratinjau Invoice"
              description="Pratinjau dokumen invoice resmi PO."
              hideHeader
              footerNote=""
              bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
              className="sm:max-w-3xl"
            >
              <UniversalDocumentPreview
                title="Pratinjau Invoice"
                documentNumber="INVOICE"
                src={`/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(invoiceId)}`}
                minimalToolbar
                onClose={() => setInvoicePreviewOpen(false)}
              />
            </GlobalModal>
          )}
          {canReplace && (
            <ReplacePurchaseOrderInvoiceModal
              publicCode={publicCode}
              currentInvoiceUrl={invoiceUrl}
              open={resolvedOpen}
              onOpenChange={setResolvedOpen}
              isPending={isPending}
              setIsPending={setIsPending}
            />
          )}
        </>
      );
    }

    if (!vendorPoSentAt) {
      return (
        <div className="flex min-w-0 flex-col items-center">
          <ActionIconButton
            label={
              isPending
                ? "Menyimpan pengiriman PO..."
                : "Tandai PO Dikirim ke Vendor"
            }
            tooltip={isPending ? "Menyimpan..." : "Tandai PO Dikirim"}
            icon={Send}
            onClick={markPoSent}
            disabled={isPending}
            className="text-orange-500 hover:text-white"
          />
        </div>
      );
    }

    if (ticketLinked) {
      return (
        <p className="type-p3 min-w-0 break-words text-muted-foreground">
          PO dikirim. Nota dicatat melalui detail tiket.
        </p>
      );
    }
  }

  if (isReplaceMode) {
    if (!canReplace) return null;
    return (
      <ReplacePurchaseOrderInvoiceModal
        publicCode={publicCode}
        currentInvoiceUrl={invoiceUrl}
        open={resolvedOpen}
        onOpenChange={setResolvedOpen}
        isPending={isPending}
        setIsPending={setIsPending}
      />
    );
  }

  return (
    <>
      {!hideTrigger && (
        <ActionIconButton
          label="Catat Invoice Vendor"
          tooltip="Unggah Nota"
          icon={Upload}
          onClick={() => setResolvedOpen(true)}
        />
      )}
      <GlobalModal
        isOpen={resolvedOpen}
        onClose={() => setResolvedOpen(false)}
        onOpenChange={setResolvedOpen}
        title="Invoice Vendor"
        description="Masukkan rincian sesuai invoice yang diterima; Keuangan menggunakan nilai ini untuk pembayaran."
        className="sm:max-w-4xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolvedOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              form={`purchase-order-invoice-form-${publicCode}`}
              type="submit"
              disabled={isPending}
            >
              {isPending ? "Mengirim..." : "Kirim ke Keuangan"}
            </Button>
          </>
        }
      >
        <PurchaseOrderInvoiceFormBody
          key={`${publicCode}:${resolvedOpen ? "open" : "closed"}`}
          publicCode={publicCode}
          items={items}
          includeTax={includeTax}
          invoiceDate={invoiceDate}
          paymentMethod={paymentMethod}
          paymentTerms={paymentTerms}
          paymentBankName={paymentBankName}
          paymentAccountNumber={paymentAccountNumber}
          paymentAccountName={paymentAccountName}
          isPending={isPending}
          setIsPending={setIsPending}
          onClose={() => setResolvedOpen(false)}
        />
      </GlobalModal>
    </>
  );
}

function PurchaseOrderInvoiceFormBody({
  publicCode,
  items,
  includeTax,
  invoiceDate,
  paymentMethod,
  paymentTerms,
  paymentBankName,
  paymentAccountNumber,
  paymentAccountName,
  isPending,
  setIsPending,
  onClose,
}: {
  publicCode: string;
  items: InvoiceItemSeed[];
  includeTax: boolean;
  invoiceDate: string;
  paymentMethod: POPaymentMethod;
  paymentTerms: string | null;
  paymentBankName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountName: string | null;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState(() =>
    createInvoiceDraft(items, invoiceDate, includeTax),
  );

  const submitInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invoiceFile = invoiceFiles[0] ?? null;
    if (!invoiceFile) {
      toast.error("Pilih berkas invoice/bon terlebih dahulu.");
      return;
    }
    setIsPending(true);
    try {
      const response = await submitPurchaseOrderInvoice(
        publicCode,
        draft,
        invoiceFile,
      );
      if (response.success) {
        toast.success(response.message);
        onClose();
        router.refresh();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error("Purchase order invoice submission failed:", error);
      toast.error("Invoice gagal dikirim ke Keuangan. Silakan coba kembali.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form
      id={`purchase-order-invoice-form-${publicCode}`}
      className="max-h-[70vh] space-y-5 overflow-y-auto px-1"
      onSubmit={submitInvoice}
    >
      <InvoiceDetailsFields
        idPrefix={`po-invoice-${publicCode}`}
        value={draft}
        onChange={setDraft}
        paymentMethod={paymentMethod}
        paymentTerms={paymentTerms}
        bankName={paymentBankName}
        bankAccount={paymentAccountNumber}
        bankHolder={paymentAccountName}
      />
      <div className="space-y-2 rounded-lg border border-border p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="type-p2 font-semibold text-foreground">
            Dokumen Invoice / Bon
          </p>
          {invoiceFiles[0] ? <InvoiceFilePreview file={invoiceFiles[0]} /> : null}
        </div>
        <FileDropzone
          accept="application/pdf,image/jpeg,image/png,image/webp"
          maxFiles={1}
          maxSizeMb={5}
          files={invoiceFiles}
          disabled={isPending}
          label="Unggah Berkas Invoice"
          hint="PDF, JPG, PNG, atau WEBP; maksimal 5 MB."
          onFilesChange={setInvoiceFiles}
          onError={(err) => toast.error(err)}
        />
      </div>
    </form>
  );
}

function ReplacePurchaseOrderInvoiceModal({
  publicCode,
  currentInvoiceUrl,
  open,
  onOpenChange,
  isPending,
  setIsPending,
}: {
  publicCode: string;
  currentInvoiceUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
}) {
  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        if (!isPending) onOpenChange(false);
      }}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
      title="Ganti Foto / PDF Nota"
      description="Unggah berkas invoice/bon baru untuk menggantikan berkas sebelumnya tanpa mengubah rincian atau nominal tagihan."
      className="sm:max-w-xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button
            form={`replace-purchase-order-invoice-form-${publicCode}`}
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Menyimpan..." : "Simpan Nota Baru"}
          </Button>
        </>
      }
    >
      <ReplacePurchaseOrderInvoiceFormBody
        key={`replace:${publicCode}:${open ? "open" : "closed"}`}
        publicCode={publicCode}
        currentInvoiceUrl={currentInvoiceUrl}
        isPending={isPending}
        setIsPending={setIsPending}
        onClose={() => onOpenChange(false)}
      />
    </GlobalModal>
  );
}

function ReplacePurchaseOrderInvoiceFormBody({
  publicCode,
  currentInvoiceUrl,
  isPending,
  setIsPending,
  onClose,
}: {
  publicCode: string;
  currentInvoiceUrl: string | null;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);

  const handleFilesChange = async (files: File[]) => {
    const rawFile = files[0];
    if (!rawFile) {
      setInvoiceFiles([]);
      return;
    }
    setIsPreparing(true);
    try {
      const prepared = await compressFieldImageFile(rawFile, {
        allowPdfPassthrough: true,
      });
      setInvoiceFiles([prepared]);
    } catch (error) {
      setInvoiceFiles([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Berkas invoice/bon tidak dapat diproses.",
      );
    } finally {
      setIsPreparing(false);
    }
  };

  const submitReplacement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPreparing || isPending) return;
    const invoiceFile = invoiceFiles[0] ?? null;
    if (!invoiceFile) {
      toast.error("Pilih berkas invoice/bon pengganti terlebih dahulu.");
      return;
    }
    setIsPending(true);
    try {
      const response = await replacePurchaseOrderInvoice(
        publicCode,
        invoiceFile,
      );
      if (response.success) {
        toast.success(response.message);
        onClose();
        router.refresh();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error("Purchase order invoice replacement failed:", error);
      toast.error(
        "Berkas invoice/bon gagal diperbarui. Silakan coba kembali.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form
      id={`replace-purchase-order-invoice-form-${publicCode}`}
      className="space-y-4"
      onSubmit={submitReplacement}
    >
      {currentInvoiceUrl && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
          <p className="type-p3 text-muted-foreground">
            Berkas nota saat ini akan diganti dengan berkas baru.
          </p>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={currentInvoiceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Lihat Nota Lama
            </a>
          </Button>
        </div>
      )}
      <div className="space-y-2 rounded-lg border border-border p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="type-p2 font-semibold text-foreground">
            Berkas Invoice / Bon Pengganti
          </p>
          {invoiceFiles[0] ? <InvoiceFilePreview file={invoiceFiles[0]} /> : null}
        </div>
        <FileDropzone
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          maxFiles={1}
          maxSizeMb={5}
          files={invoiceFiles}
          disabled={isPending || isPreparing}
          label={isPreparing ? "Memproses berkas..." : "Unggah Berkas Nota Baru"}
          hint="PDF, JPG, PNG, atau WEBP; maksimal 5 MB."
          onFilesChange={(files) => {
            void handleFilesChange(files);
          }}
          onError={(err) => toast.error(err)}
        />
      </div>
    </form>
  );
}
