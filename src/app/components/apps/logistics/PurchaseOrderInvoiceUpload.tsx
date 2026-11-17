"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import type { POPaymentMethod } from "@prisma/client";
import {
  markPurchaseOrderSentToVendor,
  submitPurchaseOrderInvoice,
} from "@/app/actions/orders";
import InvoiceDetailsFields, {
  type InvoiceDraft,
} from "@/app/components/apps/logistics/InvoiceDetailsFields";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
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
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;
  const setResolvedOpen = (next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

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

    if (invoiceUrl) {
      return (
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
                label="Cetak invoice"
                tooltip="Cetak Invoice"
                icon={FileText}
                href={`/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(invoiceId)}`}
                target="_blank"
                rel="noreferrer"
              />
            </div>
          )}
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
