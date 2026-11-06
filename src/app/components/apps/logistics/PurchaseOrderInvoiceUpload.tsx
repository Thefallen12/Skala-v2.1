"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Send, Upload } from "lucide-react";
import {
  markPurchaseOrderSentToVendor,
  submitPurchaseOrderInvoice,
} from "@/app/actions/orders";
import InvoiceDetailsFields, {
  type InvoiceDraft,
} from "@/app/components/apps/logistics/InvoiceDetailsFields";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
): InvoiceDraft {
  return {
    invoiceNumber: "",
    periodOrDate: invoiceDate,
    paymentMethod: "",
    bankAccount: "",
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
}: {
  publicCode: string;
  invoiceUrl: string | null;
  invoiceId: string | null;
  vendorPoSentAt: string | null;
  ticketLinked: boolean;
  items: InvoiceItemSeed[];
  includeTax: boolean;
  invoiceDate: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [draft, setDraft] = useState(() => {
    const seed = createInvoiceDraft(items, invoiceDate);
    if (includeTax) {
      seed.tax = Math.round(
        seed.items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        ) * 0.11,
      );
    }
    return seed;
  });

  const markPoSent = async () => {
    setIsPending(true);
    setMessage("");
    try {
      const response = await markPurchaseOrderSentToVendor(publicCode);
      setMessage(response.message);
      setIsError(!response.success);
      if (response.success) router.refresh();
    } catch (error) {
      console.error("Purchase order vendor dispatch failed:", error);
      setMessage("Pengiriman PO gagal dicatat. Silakan coba kembali.");
      setIsError(true);
    } finally {
      setIsPending(false);
    }
  };

  const submitInvoice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoiceFile) {
      setMessage("Pilih file invoice/bon terlebih dahulu.");
      setIsError(true);
      return;
    }
    setIsPending(true);
    setMessage("");
    try {
      const response = await submitPurchaseOrderInvoice(publicCode, draft, invoiceFile);
      setMessage(response.message);
      setIsError(!response.success);
      if (response.success) {
        setIsOpen(false);
        router.refresh();
      }
    } catch (error) {
      console.error("Purchase order invoice submission failed:", error);
      setMessage("Invoice gagal dikirim ke Keuangan. Silakan coba kembali.");
      setIsError(true);
    } finally {
      setIsPending(false);
    }
  };

  if (!vendorPoSentAt) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={
                isPending ? "Menyimpan status pengiriman PO..." : "Tandai PO Dikirim ke Vendor"
              }
              title={
                isPending ? "Menyimpan status pengiriman PO..." : "Tandai PO Dikirim ke Vendor"
              }
              className="size-10 p-0"
              onClick={markPoSent}
              disabled={isPending}
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isPending ? "Menyimpan..." : "Tandai PO Dikirim ke Vendor"}
          </TooltipContent>
        </Tooltip>
        <span className="text-center text-[10px] leading-3 text-muted-foreground">
          {isPending ? "Menyimpan" : "Kirim"}
        </span>
        {message && (
          <p
            className={`max-w-full break-words text-center text-xs leading-4 ${isError ? "text-destructive" : "text-muted-foreground"}`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </div>
    );
  }

  if (invoiceUrl) {
    return (
      <div className="flex items-start gap-1.5">
        <div className="flex w-12 flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="size-10 p-0"
                aria-label="Lihat invoice vendor"
                title="Lihat invoice vendor"
              >
                <a href={invoiceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Lihat invoice vendor</TooltipContent>
          </Tooltip>
          <span className="text-center text-[10px] leading-3 text-muted-foreground">
            Invoice
          </span>
        </div>
        {invoiceId && (
          <div className="flex w-12 flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="size-10 p-0"
                  aria-label="Cetak invoice"
                  title="Cetak invoice"
                >
                  <a
                    href={`/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(invoiceId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cetak invoice</TooltipContent>
            </Tooltip>
            <span className="text-center text-[10px] leading-3 text-muted-foreground">
              Cetak
            </span>
          </div>
        )}
      </div>
    );
  }

  if (ticketLinked) {
    return (
      <p className="min-w-0 break-words text-sm text-muted-foreground">
        PO dikirim. Invoice/bon dan rincian tagihan dicatat melalui detail tiket.
      </p>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              aria-label="Catat Invoice Vendor"
              className="size-10 p-0"
              onClick={() => setIsOpen(true)}
            >
              <Upload className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Catat Invoice Vendor</TooltipContent>
        </Tooltip>
        <span className="text-center text-[10px] leading-3 text-muted-foreground">
          Invoice
        </span>
        {message && (
          <p
            className={`break-words text-center text-xs leading-4 ${isError ? "text-destructive" : "text-muted-foreground"}`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </div>
      <GlobalModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Invoice / Bon Vendor"
        description="Masukkan rincian sesuai invoice yang diterima; Keuangan menggunakan nilai ini untuk pembayaran."
        className="sm:max-w-5xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button form="purchase-order-invoice-form" type="submit" disabled={isPending}>
              {isPending ? "Mengirim..." : "Simpan & Kirim ke Keuangan"}
            </Button>
          </>
        }
      >
        <form
          id="purchase-order-invoice-form"
          className="max-h-[70vh] space-y-5 overflow-y-auto px-1"
          onSubmit={submitInvoice}
        >
          <InvoiceDetailsFields
            idPrefix={`po-invoice-${publicCode}`}
            value={draft}
            onChange={setDraft}
          />
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Dokumen Invoice / Bon</p>
            <Input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={isPending}
              onChange={(event) => {
                setInvoiceFile(event.currentTarget.files?.[0] ?? null);
                setMessage("");
              }}
            />
            {invoiceFile && (
              <p className="text-sm text-muted-foreground">
                File lokal siap dikirim: {invoiceFile.name}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              File baru diunggah saat tombol Simpan &amp; Kirim ditekan. PDF, JPG, PNG, atau WEBP; maksimal 5 MB.
            </p>
          </div>
          {message && (
            <p
              className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </form>
      </GlobalModal>
    </>
  );
}
