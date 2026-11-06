"use client";

import type { VendorInvoiceInput } from "@/lib/invoice-input";
import type { POPaymentMethod } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVendorBankAccount } from "@/lib/vendor-bank-accounts";

export type InvoiceDraft = Omit<
  VendorInvoiceInput,
  "documentUrl" | "paymentMethod" | "bankAccount"
>;

export default function InvoiceDetailsFields({
  value,
  onChange,
  idPrefix,
  paymentMethod,
  paymentTerms,
  bankName,
  bankAccount,
  bankHolder,
}: {
  value: InvoiceDraft;
  onChange: (value: InvoiceDraft) => void;
  idPrefix: string;
  paymentMethod: POPaymentMethod | null;
  paymentTerms: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
}) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-invoice-number`}>Nomor Invoice (opsional)</Label>
          <Input
            id={`${idPrefix}-invoice-number`}
            value={value.invoiceNumber ?? ""}
            maxLength={100}
            onChange={(event) =>
              onChange({ ...value, invoiceNumber: event.target.value })
            }
            placeholder="Tidak tercantum pada invoice"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-period-date`}>Tanggal / Periode</Label>
          <Input
            id={`${idPrefix}-period-date`}
            value={value.periodOrDate ?? ""}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...value, periodOrDate: event.target.value })
            }
            placeholder="Contoh: 2 November 2026"
          />
        </div>
        <div className="space-y-2">
          <Label>Metode Pembayaran</Label>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {paymentMethod === "TRANSFER"
              ? "Transfer"
              : paymentMethod === "CASH"
                ? "Tunai"
                : "-"}
          </p>
        </div>
        <div className="space-y-2">
          <Label>No. Rekening / Bank</Label>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {paymentMethod === "CASH"
              ? "Tidak digunakan (Tunai)"
              : formatVendorBankAccount({ bankName, bankAccount, bankHolder }) ??
                "-"}
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Skema Pembayaran PO</Label>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {paymentTerms?.trim() || "Belum ditentukan"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label>Rincian sesuai Purchase Order</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Rincian barang, nilai pembayaran, dan tujuan pembayaran mengikuti PO.
          </p>
        </div>
        <div className="space-y-3">
          {value.items.map((item, index) => (
            <div
              className="grid min-w-0 gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-6"
              key={`${idPrefix}-item-${index}`}
            >
              <div className="space-y-1">
                <Label>Kode Barang</Label>
                <p className="break-words px-3 py-2 text-sm">{item.itemCode || "-"}</p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Deskripsi</Label>
                <p className="break-words px-3 py-2 text-sm">{item.description}</p>
              </div>
              <div className="space-y-1">
                <Label>Qty</Label>
                <p className="px-3 py-2 text-sm tabular-nums">{item.quantity}</p>
              </div>
              <div className="space-y-1">
                <Label>Satuan</Label>
                <p className="break-words px-3 py-2 text-sm">{item.unit}</p>
              </div>
              <div className="space-y-1">
                <Label>Harga Satuan</Label>
                <p className="break-words px-3 py-2 text-sm tabular-nums">
                  {formatCurrency(item.unitPrice)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Subtotal</Label>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium tabular-nums">
            {formatCurrency(
              value.items.reduce(
                (sum, item) => sum + item.quantity * item.unitPrice,
                0,
              ),
            )}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Pajak / PPN</Label>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm tabular-nums">
            {formatCurrency(value.tax ?? 0)}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Potongan / Kasbon</Label>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm tabular-nums">
            {formatCurrency(value.deduction ?? 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
