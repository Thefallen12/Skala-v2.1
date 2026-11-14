"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  FileSpreadsheet,
  Layers,
  ListChecks,
  Loader2,
  Receipt,
  Search,
} from "lucide-react";
import type { POPaymentMethod, PaymentType } from "@prisma/client";
import {
  createVendorInvoiceFromDeliveries,
  getUnbilledDeliveriesForContract,
  payVendorInvoice,
} from "@/app/actions/material-contracts";
import {
  formatMaterialVolume,
  roundMaterialNumber,
  type MaterialContractRow,
  type MaterialDeliveryRow,
  type VendorInvoiceRow,
} from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { FinanceAccountOption } from "@/app/components/apps/finance/IncomingFundModal";
import PaymentModal, {
  type PaymentModalTarget,
} from "@/app/components/apps/finance/PaymentModal";
import MaterialDeliveryProofModal from "@/app/components/apps/material-contracts/MaterialDeliveryProofModal";

function currency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const invoiceStatusBadge: Record<
  VendorInvoiceRow["status"],
  { label: string; variant: "destructive" | "warning" | "success" }
> = {
  UNPAID: { label: "UNPAID", variant: "destructive" },
  PARTIAL: { label: "PARTIAL (Cicil/DP)", variant: "warning" },
  PAID: { label: "PAID (Lunas)", variant: "success" },
};

const paymentTypeLabel: Record<string, string> = {
  DOWN_PAYMENT: "DP",
  PROGRESS_PAYMENT: "Termin",
  FULL_PAYMENT: "Pelunasan",
};

export default function VendorContractBillingPanel({
  contracts,
  vendorInvoices,
  financeAccounts,
  canManage,
  onPreviewProof,
}: {
  contracts: MaterialContractRow[];
  vendorInvoices: VendorInvoiceRow[];
  financeAccounts: FinanceAccountOption[];
  canManage: boolean;
  onPreviewProof?: (url: string, label: string) => void;
}) {
  const router = useRouter();
  const [showInactiveContracts, setShowInactiveContracts] = useState(false);
  const [contractSearch, setContractSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState<"OPEN" | "PAID" | "ALL">(
    "OPEN",
  );
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Invoice builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderContract, setBuilderContract] =
    useState<MaterialContractRow | null>(null);
  const [builderDeliveries, setBuilderDeliveries] = useState<
    MaterialDeliveryRow[]
  >([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState("");

  // Detail & payment modals
  const [detailInvoice, setDetailInvoice] = useState<VendorInvoiceRow | null>(
    null,
  );
  const [payingInvoice, setPayingInvoice] = useState<VendorInvoiceRow | null>(
    null,
  );
  const [localPreview, setLocalPreview] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  const openProof = (url: string, title: string) => {
    if (onPreviewProof) {
      onPreviewProof(url, title);
    } else {
      setLocalPreview({ url, title });
    }
  };

  // KPI calculations
  const activeContracts = contracts.filter((contract) => contract.isActive);
  const totalUnbilledDos = contracts.reduce(
    (sum, contract) => sum + contract.unbilledDeliveriesCount,
    0,
  );
  const totalUnbilledEstimate = contracts.reduce(
    (sum, contract) => sum + contract.unbilledEstimatedAmount,
    0,
  );
  const openInvoices = vendorInvoices.filter(
    (invoice) => invoice.status !== "PAID",
  );
  const totalOutstandingAmount = openInvoices.reduce(
    (sum, invoice) => sum + invoice.remainingAmount,
    0,
  );
  const paidInvoices = vendorInvoices.filter(
    (invoice) => invoice.status === "PAID",
  );
  const totalPaidAmount = vendorInvoices.reduce(
    (sum, invoice) => sum + invoice.paidAmount,
    0,
  );

  const visibleContracts = useMemo(() => {
    const query = contractSearch.trim().toLowerCase();
    return contracts.filter((contract) => {
      if (!showInactiveContracts && !contract.isActive) return false;
      if (!query) return true;
      return (
        contract.contractNumber.toLowerCase().includes(query) ||
        contract.vendorName.toLowerCase().includes(query) ||
        contract.materialType.toLowerCase().includes(query)
      );
    });
  }, [contracts, showInactiveContracts, contractSearch]);

  const filteredInvoices = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    return vendorInvoices.filter((invoice) => {
      if (invoiceFilter === "OPEN" && invoice.status === "PAID") return false;
      if (invoiceFilter === "PAID" && invoice.status !== "PAID") return false;
      if (!query) return true;
      return (
        invoice.invoiceNumber.toLowerCase().includes(query) ||
        invoice.contractNumber.toLowerCase().includes(query) ||
        invoice.vendorName.toLowerCase().includes(query) ||
        invoice.projectNames.some((project) =>
          project.toLowerCase().includes(query),
        )
      );
    });
  }, [vendorInvoices, invoiceFilter, invoiceSearch]);

  const openCreateInvoiceModal = async (contract: MaterialContractRow) => {
    setFeedback(null);
    setBuilderContract(contract);
    setBuilderDeliveries([]);
    setBuilderError("");
    setBuilderOpen(true);
    setBuilderLoading(true);
    try {
      const response = await getUnbilledDeliveriesForContract(contract.id);
      if (!response.success) {
        setBuilderError(
          response.message || "Gagal memuat Surat Jalan belum ditagih.",
        );
      } else {
        setBuilderDeliveries(response.deliveries);
      }
    } catch (error) {
      console.error("Load unbilled deliveries failed:", error);
      setBuilderError("Terjadi kesalahan saat menarik data Surat Jalan.");
    } finally {
      setBuilderLoading(false);
    }
  };

  const paymentModalTarget: PaymentModalTarget | null = payingInvoice
    ? {
        id: payingInvoice.id,
        reference: payingInvoice.invoiceNumber,
        title: `${payingInvoice.vendorName} · Kontrak ${payingInvoice.materialType} (${payingInvoice.deliveryCount} DO)`,
        grandTotal: payingInvoice.grandTotal,
        paidAmount: payingInvoice.paidAmount,
        isFirstPayment: payingInvoice.paidAmount <= 0,
        transferDestination:
          payingInvoice.vendorBankAccounts.find((account) => account.isPrimary)
            ?.destination ??
          payingInvoice.vendorBankAccounts[0]?.destination ??
          "",
        vendorBankAccounts: payingInvoice.vendorBankAccounts,
        allowPaymentMethodSelection: true,
        hasInvoice: true,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/80 bg-card p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <FileSpreadsheet className="size-4 text-primary" />
          Tagihan Kontrak Vendor Material Curah (Blanket PO Pasir &amp; Batu)
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cocokkan daftar Surat Jalan (DO) lintas proyek berstatus UNBILLED dengan
          tagihan fisik vendor untuk menerbitkan Tagihan Kumulatif (VendorInvoice)
          dan memproses pembayaran DP / Termin / Pelunasan.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">
              Kontrak Payung Aktif
            </CardDescription>
            <CardTitle className="text-xl font-bold">
              {activeContracts.length} Kontrak
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-amber-700 dark:text-amber-300">
              DO Siap Ditagih (UNBILLED)
            </CardDescription>
            <CardTitle className="text-xl font-bold text-amber-700 dark:text-amber-300">
              {totalUnbilledDos} DO · {currency(totalUnbilledEstimate)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-rose-500/30 bg-rose-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-rose-700 dark:text-rose-300">
              Tagihan Belum Lunas ({openInvoices.length})
            </CardDescription>
            <CardTitle className="text-xl font-bold text-rose-700 dark:text-rose-300">
              {currency(totalOutstandingAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-emerald-700 dark:text-emerald-300">
              Total Sudah Dibayar ({paidInvoices.length} Lunas)
            </CardDescription>
            <CardTitle className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {currency(totalPaidAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs font-medium ${
            feedback.isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Section 1: Active Contracts -> Buat Tagihan */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Layers className="size-4 text-primary" />
              1. Kontrak Material Vendor — Buat Tagihan dari Surat Jalan UNBILLED
            </CardTitle>
            <CardDescription className="text-xs">
              Klik &ldquo;Buat Tagihan&rdquo; pada vendor untuk menarik semua Surat
              Jalan lapangan berstatus UNBILLED.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={showInactiveContracts}
                onCheckedChange={(checked) =>
                  setShowInactiveContracts(checked === true)
                }
              />
              Tampilkan nonaktif
            </label>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={contractSearch}
                onChange={(event) => setContractSearch(event.target.value)}
                placeholder="Cari kontrak / vendor..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {visibleContracts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
              Belum ada kontrak material aktif. Kontrak dibuat oleh tim Logistik
              pada menu Logistik &rarr; Kontrak Curah.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor &amp; No. Kontrak</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">DO Belum Ditagih</TableHead>
                    <TableHead className="text-right">Volume UNBILLED</TableHead>
                    <TableHead className="text-right">Estimasi Tagihan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi Keuangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleContracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <div className="text-xs font-bold">
                          {contract.vendorName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {contract.contractNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {contract.materialType}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                        {currency(contract.unitPrice)} / {contract.unit}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold">
                        {contract.unbilledDeliveriesCount > 0 ? (
                          <Badge variant="warning">
                            {contract.unbilledDeliveriesCount} DO
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0 DO</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                        {formatMaterialVolume(
                          contract.unbilledVolume,
                          contract.unit,
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-bold text-primary">
                        {currency(contract.unbilledEstimatedAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={contract.isActive ? "success" : "outline"}
                          className="text-[10px]"
                        >
                          {contract.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              contract.unbilledDeliveriesCount > 0
                                ? "default"
                                : "outline"
                            }
                            disabled={contract.unbilledDeliveriesCount === 0}
                            onClick={() => openCreateInvoiceModal(contract)}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <ListChecks className="size-3.5" />
                            Buat Tagihan
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: VendorInvoices & Payments */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Receipt className="size-4 text-primary" />
                2. Daftar Tagihan Kontrak Vendor &amp; Pembayaran
              </CardTitle>
              <CardDescription className="text-xs">
                Kelola tagihan kumulatif dan proses pembayaran DP, Termin, atau
                Pelunasan melalui buku kas/bank.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["OPEN", "PAID", "ALL"] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={invoiceFilter === status ? "default" : "outline"}
                  onClick={() => setInvoiceFilter(status)}
                  className="h-8 text-xs"
                >
                  {status === "OPEN"
                    ? `Belum Lunas (${openInvoices.length})`
                    : status === "PAID"
                      ? `Lunas (${paidInvoices.length})`
                      : `Semua (${vendorInvoices.length})`}
                </Button>
              ))}
            </div>
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
              placeholder="Cari No. Tagihan, vendor, kontrak, atau proyek..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
              Tidak ada tagihan kontrak vendor pada filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Tagihan &amp; Jatuh Tempo</TableHead>
                    <TableHead>Vendor &amp; Kontrak</TableHead>
                    <TableHead>Cakupan DO &amp; Proyek</TableHead>
                    <TableHead className="text-right">Total Volume</TableHead>
                    <TableHead className="text-right">Total Tagihan</TableHead>
                    <TableHead className="text-right">Terbayar / Sisa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const badge = invoiceStatusBadge[invoice.status];
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <div className="text-xs font-bold">
                            {invoice.invoiceNumber}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Dibuat: {invoice.createdAt.slice(0, 10)}
                            {invoice.dueDate
                              ? ` · JT ${invoice.dueDate}`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold">
                            {invoice.vendorName}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {invoice.contractNumber} ({invoice.materialType})
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setDetailInvoice(invoice)}
                            className="text-left text-xs font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {invoice.deliveryCount} Surat Jalan
                          </button>
                          <div className="max-w-[210px] truncate text-[11px] text-muted-foreground">
                            {invoice.projectNames.join(", ") || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                          {formatMaterialVolume(
                            invoice.totalQuantity,
                            invoice.unit,
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs font-bold">
                          {currency(invoice.grandTotal)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs">
                          <div className="font-medium text-emerald-700 dark:text-emerald-300">
                            {currency(invoice.paidAmount)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Sisa: {currency(invoice.remainingAmount)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="text-[10px]">
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailInvoice(invoice)}
                              className="h-8 gap-1 text-xs"
                            >
                              <Eye className="size-3.5" />
                              Rincian
                            </Button>
                            {canManage && invoice.status !== "PAID" && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setPayingInvoice(invoice)}
                                className="h-8 gap-1 text-xs"
                              >
                                <CreditCard className="size-3.5" />
                                Bayar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Builder Modal: Create VendorInvoice from UNBILLED DO checkboxes */}
      <GlobalModal
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onOpenChange={setBuilderOpen}
        title="Buat Tagihan Kontrak Vendor (Akumulasi Surat Jalan)"
        description={
          builderContract
            ? `${builderContract.vendorName} · ${builderContract.contractNumber} · ${currency(builderContract.unitPrice)} / ${builderContract.unit}`
            : ""
        }
        className="sm:max-w-3xl"
      >
        {builderContract && (
          <CreateVendorInvoiceBuilderBody
            key={builderContract.id}
            contract={builderContract}
            deliveries={builderDeliveries}
            loading={builderLoading}
            loadError={builderError}
            onClose={() => setBuilderOpen(false)}
            onPreviewProof={(url, title) => setLocalPreview({ url, title })}
            onCreated={(message) => {
              setFeedback({ text: message, isError: false });
              setBuilderOpen(false);
              router.refresh();
            }}
          />
        )}
      </GlobalModal>

      {/* Invoice Detail Modal (included DOs + Payment Receipts) */}
      <GlobalModal
        isOpen={Boolean(detailInvoice)}
        onClose={() => setDetailInvoice(null)}
        title={
          detailInvoice
            ? `Rincian Tagihan ${detailInvoice.invoiceNumber}`
            : "Rincian Tagihan"
        }
        description={
          detailInvoice
            ? `${detailInvoice.vendorName} · Kontrak ${detailInvoice.contractNumber} (${currency(detailInvoice.unitPrice)}/${detailInvoice.unit})`
            : ""
        }
        className="sm:max-w-3xl"
      >
        {detailInvoice && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                <p className="text-[11px] text-muted-foreground">Total Kuantitas</p>
                <p className="text-sm font-bold">
                  {formatMaterialVolume(
                    detailInvoice.totalQuantity,
                    detailInvoice.unit,
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                <p className="text-[11px] text-muted-foreground">Grand Total</p>
                <p className="text-sm font-bold">
                  {currency(detailInvoice.grandTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Sudah Dibayar
                </p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  {currency(detailInvoice.paidAmount)}
                </p>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5">
                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                  Sisa Tagihan
                </p>
                <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                  {currency(detailInvoice.remainingAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Surat Jalan Tercakup ({detailInvoice.deliveries.length} DO)
              </h4>
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No. DO</TableHead>
                      <TableHead>Lokasi Proyek</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Foto DO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailInvoice.deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {delivery.deliveryDate}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {delivery.doNumber}
                          {delivery.vehiclePlate ? (
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {delivery.vehiclePlate}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {delivery.projectName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                          {formatMaterialVolume(
                            delivery.quantityReceived,
                            detailInvoice.unit,
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs font-semibold">
                          {currency(delivery.subtotal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {delivery.proofUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setLocalPreview({
                                  url: delivery.proofUrl!,
                                  title: `Foto DO ${delivery.doNumber}`,
                                })
                              }
                              className="h-7 gap-1 text-[11px]"
                            >
                              <Eye className="size-3" />
                              Lihat
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Riwayat Pembayaran ({detailInvoice.payments.length})
              </h4>
              {detailInvoice.payments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Belum ada pembayaran tercatat untuk tagihan ini.
                </p>
              ) : (
                <div className="space-y-2">
                  {detailInvoice.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Badge variant="outline" className="text-[10px]">
                            {paymentTypeLabel[payment.paymentType] ??
                              payment.paymentType}
                          </Badge>
                          <span>{currency(payment.amount)}</span>
                          <span className="text-muted-foreground">
                            · {payment.paymentMethod}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {payment.paidAt.slice(0, 10)} · Sumber:{" "}
                          {payment.financeAccountName ?? "-"} · Tujuan:{" "}
                          {payment.transferDestination} · Oleh:{" "}
                          {payment.processedByName}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openProof(
                            payment.proofOfTransferUrl,
                            `Bukti Pembayaran ${detailInvoice.invoiceNumber}`,
                          )
                        }
                        className="h-7 gap-1 text-[11px]"
                      >
                        <Eye className="size-3" />
                        Bukti Transfer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {canManage && detailInvoice.status !== "PAID" && (
                <Button
                  type="button"
                  onClick={() => {
                    const target = detailInvoice;
                    setDetailInvoice(null);
                    setPayingInvoice(target);
                  }}
                >
                  Proses Pembayaran
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setDetailInvoice(null)}
              >
                Tutup
              </Button>
            </div>
          </div>
        )}
      </GlobalModal>

      {/* Payment Modal (Reuses existing Finance PaymentModal) */}
      <PaymentModal
        key={payingInvoice?.id ?? "none"}
        open={Boolean(payingInvoice)}
        onOpenChange={(open) => {
          if (!open) setPayingInvoice(null);
        }}
        target={paymentModalTarget}
        accounts={financeAccounts}
        onPay={async (
          proof: string | File,
          transferDestination: string,
          paymentType: PaymentType,
          amount: number,
          financeAccountId: string,
          paymentMethod?: POPaymentMethod,
        ) => {
          if (!payingInvoice) {
            return { success: false, message: "Tagihan tidak ditemukan." };
          }
          const result = await payVendorInvoice({
            vendorInvoiceId: payingInvoice.id,
            proof,
            transferDestination,
            paymentType,
            amount,
            financeAccountId,
            paymentMethod,
          });
          if (result.success) {
            setFeedback({ text: result.message, isError: false });
            setPayingInvoice(null);
            requestNotificationFeedRefresh();
            router.refresh();
          }
          return result;
        }}
      />

      <MaterialDeliveryProofModal
        preview={localPreview}
        onClose={() => setLocalPreview(null)}
      />
    </div>
  );
}

function CreateVendorInvoiceBuilderBody({
  contract,
  deliveries,
  loading,
  loadError,
  onClose,
  onPreviewProof,
  onCreated,
}: {
  contract: MaterialContractRow;
  deliveries: MaterialDeliveryRow[];
  loading: boolean;
  loadError: string;
  onClose: () => void;
  onPreviewProof: (url: string, title: string) => void;
  onCreated: (message: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Default to checking all loaded UNBILLED deliveries once loaded.
  const effectiveSelectedIds =
    !loading &&
    deliveries.length > 0 &&
    !hasInitializedSelection &&
    selectedIds.length === 0
      ? deliveries.map((d) => d.id)
      : selectedIds;

  const selectedSet = new Set(effectiveSelectedIds);
  const allChecked =
    deliveries.length > 0 && effectiveSelectedIds.length === deliveries.length;

  const toggleAll = (checked: boolean) => {
    setHasInitializedSelection(true);
    setSelectedIds(checked ? deliveries.map((d) => d.id) : []);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setHasInitializedSelection(true);
    const current = new Set(effectiveSelectedIds);
    if (checked) current.add(id);
    else current.delete(id);
    setSelectedIds(Array.from(current));
  };

  const selectedDeliveries = deliveries.filter((d) => selectedSet.has(d.id));
  const totalSelectedQuantity = roundMaterialNumber(
    selectedDeliveries.reduce((sum, d) => sum + d.quantityReceived, 0),
    2,
  );
  const grandTotal = roundMaterialNumber(
    totalSelectedQuantity * contract.unitPrice,
    2,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || loading) return;

    if (effectiveSelectedIds.length === 0) {
      setSubmitMessage("Centang minimal satu Surat Jalan (DO) untuk ditagihkan.");
      return;
    }

    setSubmitMessage("");
    startTransition(async () => {
      try {
        const result = await createVendorInvoiceFromDeliveries({
          contractId: contract.id,
          deliveryIds: effectiveSelectedIds,
          invoiceNumber: invoiceNumber.trim() || null,
          dueDate: dueDate.trim() || null,
          notes: notes.trim() || null,
        });
        if (result.success) {
          onCreated(result.message);
        } else {
          setSubmitMessage(result.message);
        }
      } catch (error) {
        console.error("Create vendor invoice failed:", error);
        setSubmitMessage("Gagal menerbitkan tagihan vendor. Silakan coba lagi.");
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Mengambil daftar Surat Jalan UNBILLED dari database...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 py-2">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {loadError}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="space-y-4 py-2">
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Semua Surat Jalan untuk kontrak {contract.contractNumber} sudah
          ditagihkan, atau belum ada kiriman lapangan yang tercatat.
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
        Cocokkan daftar Surat Jalan fisik yang dikirim vendor dengan catatan
        lapangan di bawah ini. Hanya DO yang dicentang yang akan masuk ke tagihan
        dan berubah status menjadi <strong>BILLED</strong>.
      </div>

      <div className="max-h-72 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Pilih semua Surat Jalan"
                />
              </TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>No. DO &amp; Truk</TableHead>
              <TableHead>Proyek Lokasi</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Foto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => {
              const checked = selectedSet.has(delivery.id);
              return (
                <TableRow
                  key={delivery.id}
                  className={checked ? "bg-primary/5" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(val) =>
                        toggleOne(delivery.id, val === true)
                      }
                      aria-label={`Pilih DO ${delivery.doNumber}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {delivery.deliveryDate}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-bold">{delivery.doNumber}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {delivery.vehiclePlate || "-"}
                      {delivery.driverName ? ` · ${delivery.driverName}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{delivery.projectName}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs font-semibold">
                    {formatMaterialVolume(
                      delivery.quantityReceived,
                      contract.unit,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                    {currency(delivery.estimatedAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {delivery.proofUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onPreviewProof(
                            delivery.proofUrl!,
                            `Foto DO ${delivery.doNumber}`,
                          )
                        }
                        className="h-7 gap-1 text-[11px]"
                      >
                        <Eye className="size-3" />
                        Foto
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Live Totals Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="size-4 text-primary" />
          <span>
            <strong>{selectedDeliveries.length}</strong> DO dipilih · Total:{" "}
            <strong>
              {formatMaterialVolume(totalSelectedQuantity, contract.unit)}
            </strong>{" "}
            &times; {currency(contract.unitPrice)}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">
            Grand Total Tagihan
          </p>
          <p className="text-lg font-extrabold text-primary">
            {currency(grandTotal)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vi-number">
            No. Invoice / Tagihan Vendor (Kosongkan untuk Auto)
          </Label>
          <Input
            id="vi-number"
            placeholder="Contoh: INV/PM/2026/045"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vi-due-date">Tanggal Jatuh Tempo (Opsional)</Label>
          <Input
            id="vi-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vi-notes">Catatan Rekap Tagihan</Label>
        <Textarea
          id="vi-notes"
          rows={2}
          placeholder="Mis. Rekap pengiriman minggu ke-2 bulan November sesuai invoice fisik vendor"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {submitMessage && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {submitMessage}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Batal
        </Button>
        <Button
          type="submit"
          disabled={isPending || effectiveSelectedIds.length === 0}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              Menerbitkan Tagihan...
            </>
          ) : (
            `Terbitkan Tagihan (${selectedDeliveries.length} DO)`
          )}
        </Button>
      </div>
    </form>
  );
}
