"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Printer, Send } from "lucide-react";
import { markPurchaseOrderConfirmationSent } from "@/app/actions/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { photoDownloadHref } from "@/lib/photo-urls";
import { printUrlInFrame } from "@/lib/print-url";

export type PurchaseOrderConfirmationRow = {
  id: string;
  confirmationOrderNumber: string;
  paymentType: string;
  amount: number;
  transferDestination: string;
  proofOfTransferUrl: string;
  paidAt: string | null;
  vendorSentAt: string | null;
  vendorSentBy: { name: string | null } | null;
  po: {
    poNumber: string;
    vendorName: string;
    vendorInvoiceUrl: string | null;
    items: { itemName: string; quantity: number; unit: string }[];
  };
};

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const paymentLabel = (paymentType: string) =>
  paymentType === "DOWN_PAYMENT"
    ? "Uang Muka (DP)"
    : paymentType === "PROGRESS_PAYMENT"
      ? "Pembayaran Termin"
      : "Pelunasan";

export default function PurchaseOrderConfirmationQueue({
  rows,
}: {
  rows: PurchaseOrderConfirmationRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PurchaseOrderConfirmationRow | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const markAsSent = (row: PurchaseOrderConfirmationRow) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await markPurchaseOrderConfirmationSent(row.id);
        setMessage(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("KO vendor handoff failed:", error);
        setMessage("Status pengiriman KO gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <>
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">KO & Bukti Pembayaran untuk Vendor</h3>
          <p className="text-sm text-muted-foreground">
            Cetak KO, lampirkan bukti transfer, lalu tandai setelah dikirim ke
            vendor.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Belum ada pembayaran PO yang menunggu atau memiliki riwayat
            pengiriman KO.
          </p>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">
                  {row.confirmationOrderNumber} · PO {row.po.poNumber}
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.po.vendorName} · {paymentLabel(row.paymentType)} ·{" "}
                  {currency(row.amount)}
                </p>
                <Badge variant={row.vendorSentAt ? "lightSuccess" : "warning"}>
                  {row.vendorSentAt ? "Sudah dikirim ke vendor" : "Menunggu dikirim"}
                </Badge>
                {row.vendorSentAt && (
                  <p className="text-xs text-muted-foreground">
                    Dikirim{" "}
                    {new Date(row.vendorSentAt).toLocaleString("id-ID")} oleh{" "}
                    {row.vendorSentBy?.name ?? "Logistik"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(row)}
                >
                  <Printer className="mr-2 size-4" aria-hidden="true" />
                  Lihat / Cetak KO
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={photoDownloadHref(row.proofOfTransferUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                    Bukti Transfer
                  </a>
                </Button>
                {!row.vendorSentAt && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => markAsSent(row)}
                    disabled={isPending}
                  >
                    <Send className="mr-2 size-4" aria-hidden="true" />
                    Tandai Dikirim
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
      </section>

      <GlobalModal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title="Konfirmasi Order (KO)"
        description={
          selected
            ? `${selected.confirmationOrderNumber} · PO ${selected.po.poNumber}`
            : "Dokumen konfirmasi pembayaran PO."
        }
        className="sm:max-w-3xl"
        footer={
          <Button
            type="button"
            onClick={() => {
              if (!selected) return;
              void printUrlInFrame(
                `/api/documents/transactions?kind=KO&id=${encodeURIComponent(selected.id)}`,
              ).catch((error: unknown) => {
                console.error("KO print failed:", error);
                setMessage("KO gagal disiapkan untuk dicetak. Silakan coba kembali.");
              });
            }}
            disabled={!selected}
          >
            <Printer className="mr-2 size-4" aria-hidden="true" />
            Cetak KO
          </Button>
        }
      >
        {selected && (
          <div className="space-y-3">
            <UniversalDocumentPreview
              title={`Konfirmasi Order ${selected.confirmationOrderNumber}`}
              documentNumber={selected.confirmationOrderNumber}
              src={`/api/documents/transactions?kind=KO&id=${encodeURIComponent(selected.id)}`}
            />
            {selected.po.vendorInvoiceUrl && (
              <a
                className="text-sm underline"
                href={photoDownloadHref(selected.po.vendorInvoiceUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Referensi invoice/bon vendor
              </a>
            )}
          </div>
        )}
      </GlobalModal>
    </>
  );
}
