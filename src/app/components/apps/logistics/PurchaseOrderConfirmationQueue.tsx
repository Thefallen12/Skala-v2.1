"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileCheck2, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { markPurchaseOrderConfirmationSent } from "@/app/actions/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { photoDownloadHref } from "@/lib/photo-urls";
import { printUrlInFrame } from "@/lib/print-url";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";

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

function ConfirmationOrderRowCard({
  row,
  isPending,
  onSelect,
  onMarkSent,
}: {
  row: PurchaseOrderConfirmationRow;
  isPending: boolean;
  onSelect: (row: PurchaseOrderConfirmationRow) => void;
  onMarkSent: (row: PurchaseOrderConfirmationRow) => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="type-h3 text-foreground">
            {row.confirmationOrderNumber} · PO {row.po.poNumber}
          </p>
          <Badge variant={row.vendorSentAt ? "lightSuccess" : "lightWarning"}>
            {row.vendorSentAt ? "Sudah Dikirim" : "Menunggu Dikirim"}
          </Badge>
        </div>
        <p className="type-p2 text-muted-foreground">
          {row.po.vendorName} · {paymentLabel(row.paymentType)} ·{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {currency(row.amount)}
          </span>
        </p>
        {row.vendorSentAt ? (
          <p className="type-p3 text-muted-foreground">
            Dikirim {new Date(row.vendorSentAt).toLocaleString("id-ID")} oleh{" "}
            {row.vendorSentBy?.name ?? "Logistik"}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onSelect(row)}
        >
          <Printer className="size-3.5" aria-hidden="true" />
          Cetak KO
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <a
            href={photoDownloadHref(row.proofOfTransferUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Bukti Transfer
          </a>
        </Button>
        {!row.vendorSentAt ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onMarkSent(row)}
            disabled={isPending}
          >
            <Send className="size-3.5" aria-hidden="true" />
            Tandai Dikirim
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export default function PurchaseOrderConfirmationQueue({
  rows,
}: {
  rows: PurchaseOrderConfirmationRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PurchaseOrderConfirmationRow | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const markAsSent = (row: PurchaseOrderConfirmationRow) => {
    startTransition(async () => {
      try {
        const result = await markPurchaseOrderConfirmationSent(row.id);
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("KO vendor handoff failed:", error);
        toast.error("Status pengiriman KO gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <>
      <section className="space-y-3">
        <div>
          <h3 className="type-h3 text-foreground">
            KO &amp; Bukti Pembayaran Vendor
          </h3>
          <p className="type-p2 text-muted-foreground">
            Cetak KO, lampirkan bukti transfer, lalu tandai setelah dikirim ke
            vendor.
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="Belum Ada Antrean KO"
            description="Belum ada pembayaran PO yang menunggu atau memiliki riwayat pengiriman KO."
          />
        ) : (
          <div className="space-y-2.5">
            {rows.map((row) => (
              <ConfirmationOrderRowCard
                key={row.id}
                row={row}
                isPending={isPending}
                onSelect={setSelected}
                onMarkSent={markAsSent}
              />
            ))}
          </div>
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
                toast.error("KO gagal disiapkan untuk dicetak. Silakan coba kembali.");
              });
            }}
            disabled={!selected}
          >
            <Printer className="size-4" aria-hidden="true" />
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
              <Button variant="link" size="sm" asChild className="px-0">
                <a
                  href={photoDownloadHref(selected.po.vendorInvoiceUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Referensi Invoice Vendor
                </a>
              </Button>
            )}
          </div>
        )}
      </GlobalModal>
    </>
  );
}
