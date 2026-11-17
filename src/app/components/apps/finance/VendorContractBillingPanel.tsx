"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  Ticket as TicketIcon,
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
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
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
  deliveries = [],
  vendorInvoices,
  financeAccounts,
  canManage,
  onPreviewProof,
  initialInvoiceId,
  onInitialInvoiceHandled,
}: {
  contracts: MaterialContractRow[];
  deliveries?: MaterialDeliveryRow[];
  vendorInvoices: VendorInvoiceRow[];
  financeAccounts: FinanceAccountOption[];
  canManage: boolean;
  onPreviewProof?: (url: string, label: string) => void;
  initialInvoiceId?: string | null;
  onInitialInvoiceHandled?: () => void;
}) {
  const router = useRouter();
  const [showInactiveContracts, setShowInactiveContracts] = useState(false);
  const [contractSearch, setContractSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<
    "UNBILLED" | "BILLED" | "ALL"
  >("UNBILLED");
  const [deliverySearch, setDeliverySearch] = useState("");
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

  const resolvedDetailInvoice =
    detailInvoice ??
    (initialInvoiceId
      ? vendorInvoices.find((inv) => inv.id === initialInvoiceId) ?? null
      : null);

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

  const filteredDeliveries = useMemo(() => {
    const query = deliverySearch.trim().toLowerCase();
    return deliveries.filter((delivery) => {
      if (deliveryFilter !== "ALL" && delivery.billingStatus !== deliveryFilter) {
        return false;
      }
      if (!query) return true;
      return (
        delivery.doNumber.toLowerCase().includes(query) ||
        (delivery.ticketNumber ?? "").toLowerCase().includes(query) ||
        delivery.vendorName.toLowerCase().includes(query) ||
        delivery.projectName.toLowerCase().includes(query) ||
        delivery.contractNumber.toLowerCase().includes(query) ||
        delivery.materialType.toLowerCase().includes(query)
      );
    });
  }, [deliveries, deliveryFilter, deliverySearch]);

  const unbilledDeliveryRowsCount = useMemo(
    () => deliveries.filter((d) => d.billingStatus === "UNBILLED").length,
    [deliveries],
  );
  const billedDeliveryRowsCount = useMemo(
    () => deliveries.filter((d) => d.billingStatus === "BILLED").length,
    [deliveries],
  );

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
        ) ||
        invoice.deliveries.some((d) =>
          (d.ticketNumber ?? "").toLowerCase().includes(query),
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
        <h2 className="type-h2 flex items-center gap-2 text-foreground">
          <FileSpreadsheet className="size-5 text-primary" aria-hidden="true" />
          Material Alam &amp; Kontrak Curah
        </h2>
        <p className="type-p3 mt-1 text-muted-foreground">
          Cocokkan Surat Jalan (DO) lintas proyek berstatus UNBILLED dengan invoice vendor, lalu proses DP, Termin, atau Pelunasan.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3">
              Kontrak Aktif
            </CardDescription>
            <CardTitle className="type-kpi">
              {activeContracts.length} Kontrak
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3 text-amber-700 dark:text-amber-300">
              DO Siap Ditagih ({totalUnbilledDos} DO)
            </CardDescription>
            <CardTitle className="type-kpi text-amber-700 dark:text-amber-300">
              {currency(totalUnbilledEstimate)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-rose-500/30 bg-rose-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3 text-rose-700 dark:text-rose-300">
              Tagihan Belum Lunas ({openInvoices.length})
            </CardDescription>
            <CardTitle className="type-kpi text-rose-700 dark:text-rose-300">
              {currency(totalOutstandingAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3 text-emerald-700 dark:text-emerald-300">
              Sudah Dibayar ({paidInvoices.length} Lunas)
            </CardDescription>
            <CardTitle className="type-kpi text-emerald-700 dark:text-emerald-300">
              {currency(totalPaidAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {feedback && (
        <div
          className={`type-p2 rounded-lg border px-4 py-2.5 font-medium ${
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
            <CardTitle className="type-h3 flex items-center gap-2">
              <Layers className="size-4 text-primary" aria-hidden="true" />
              1. Kontrak Material Vendor
            </CardTitle>
            <CardDescription className="type-p3">
              Klik &ldquo;Buat Tagihan&rdquo; untuk menarik Surat Jalan (DO) berstatus UNBILLED.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="type-p3 flex cursor-pointer items-center gap-2 text-muted-foreground">
              <Checkbox
                checked={showInactiveContracts}
                onCheckedChange={(checked) =>
                  setShowInactiveContracts(checked === true)
                }
              />
              Tampilkan nonaktif
            </label>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={contractSearch}
                onChange={(event) => setContractSearch(event.target.value)}
                placeholder="Cari kontrak / vendor..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {visibleContracts.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Belum ada kontrak material"
              description="Kontrak material dibuat oleh tim Logistik pada menu Kontrak Curah."
            />
          ) : (
            <>
              {/* Mobile Card View (< 768px) */}
              <div className="space-y-2.5 md:hidden">
                {visibleContracts.map((contract) => (
                  <div
                    key={contract.id}
                    className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="type-p1 font-bold text-foreground">
                          {contract.vendorName}
                        </p>
                        <p className="type-p3 font-mono text-muted-foreground">
                          {contract.contractNumber} · {contract.materialType}
                        </p>
                      </div>
                      <Badge
                        variant={contract.isActive ? "success" : "outline"}
                        className="shrink-0"
                      >
                        {contract.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-2.5">
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          DO Belum Ditagih
                        </span>
                        <p className="type-p2 font-semibold text-foreground">
                          {contract.unbilledDeliveriesCount} DO (
                          {formatMaterialVolume(
                            contract.unbilledVolume,
                            contract.unit,
                          )}
                          )
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="type-p3 text-muted-foreground">
                          Estimasi
                        </span>
                        <p className="type-p2 font-mono font-bold text-primary">
                          {currency(contract.unbilledEstimatedAmount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="type-p3">
                        {currency(contract.unitPrice)} / {contract.unit}
                      </span>
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
                        >
                          <ListChecks className="size-3.5" aria-hidden="true" />
                          Buat Tagihan
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block">
                <Table pageSize={10} itemLabel="kontrak">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor &amp; No. Kontrak</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Harga Satuan</TableHead>
                      <TableHead className="text-right">DO UNBILLED</TableHead>
                      <TableHead className="text-right">Volume UNBILLED</TableHead>
                      <TableHead className="text-right">Estimasi</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleContracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell>
                          <div className="type-p2 font-bold">
                            {contract.vendorName}
                          </div>
                          <div className="type-p3 text-muted-foreground">
                            {contract.contractNumber}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {contract.materialType}
                          </Badge>
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
                          {currency(contract.unitPrice)} / {contract.unit}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {contract.unbilledDeliveriesCount > 0 ? (
                            <Badge variant="warning">
                              {contract.unbilledDeliveriesCount} DO
                            </Badge>
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              0 DO
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
                          {formatMaterialVolume(
                            contract.unbilledVolume,
                            contract.unit,
                          )}
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-bold text-primary tabular-nums">
                          {currency(contract.unbilledEstimatedAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={contract.isActive ? "success" : "outline"}
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
                            >
                              <ListChecks className="size-3.5" aria-hidden="true" />
                              Buat Tagihan
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Surat Jalan (DO) Material Alam per Tiket & Proyek */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="type-h3 flex items-center gap-2">
                <TicketIcon className="size-4 text-primary" aria-hidden="true" />
                2. Surat Jalan Material Alam (DO &amp; Referensi Tiket)
              </CardTitle>
              <CardDescription className="type-p3">
                Pantau seluruh kiriman DO lapangan per Tiket, Proyek, Supplier, Volume, Nominal, dan Foto Surat Jalan.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "UNBILLED", label: `UNBILLED (${unbilledDeliveryRowsCount})` },
                  { id: "BILLED", label: `BILLED (${billedDeliveryRowsCount})` },
                  { id: "ALL", label: `Semua (${deliveries.length})` },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="sm"
                  variant={deliveryFilter === tab.id ? "default" : "outline"}
                  onClick={() => setDeliveryFilter(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={deliverySearch}
              onChange={(event) => setDeliverySearch(event.target.value)}
              placeholder="Cari Tiket, No. DO, supplier, proyek..."
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent>
          {filteredDeliveries.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="Belum ada Surat Jalan pada filter ini"
              description="Surat Jalan yang dicatat oleh lapangan atau logistik akan muncul di sini."
            />
          ) : (
            <>
              {/* Mobile Card View (< 768px) */}
              <div className="space-y-2.5 md:hidden">
                {filteredDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="type-p2 font-mono font-bold text-primary">
                            {delivery.doNumber}
                          </span>
                          {delivery.ticketNumber && (
                            <Badge variant="outline" className="font-mono">
                              Tiket {delivery.ticketNumber}
                            </Badge>
                          )}
                        </div>
                        <p className="type-p2 mt-0.5 font-semibold text-foreground">
                          {delivery.vendorName} · {delivery.materialType}
                        </p>
                        <p className="type-p3 text-muted-foreground">
                          {delivery.projectName}
                        </p>
                      </div>
                      <Badge
                        variant={
                          delivery.billingStatus === "UNBILLED"
                            ? "warning"
                            : "success"
                        }
                        className="shrink-0"
                      >
                        {delivery.billingStatus}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-2.5">
                      <div>
                        <span className="type-p3 text-muted-foreground">
                          Volume ({delivery.deliveryDate})
                        </span>
                        <p className="type-p2 font-semibold text-foreground tabular-nums">
                          {formatMaterialVolume(
                            delivery.quantityReceived,
                            delivery.unit,
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="type-p3 text-muted-foreground">
                          Nominal Estimasi
                        </span>
                        <p className="type-p2 font-bold text-primary tabular-nums">
                          {currency(delivery.estimatedAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="type-p3 text-muted-foreground">
                        {delivery.vendorInvoiceNumber
                          ? `Invoice: ${delivery.vendorInvoiceNumber}`
                          : `Kontrak ${delivery.contractNumber}`}
                      </span>
                      {delivery.proofUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openProof(
                              delivery.proofUrl!,
                              `Foto DO ${delivery.doNumber}`,
                            )
                          }
                        >
                          <Eye className="size-3.5" aria-hidden="true" />
                          Foto SJ
                        </Button>
                      ) : (
                        <span className="type-p3 text-muted-foreground">
                          Tanpa foto
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block">
                <Table pageSize={10} itemLabel="Surat Jalan">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal &amp; No. DO</TableHead>
                      <TableHead>Tiket</TableHead>
                      <TableHead>Proyek</TableHead>
                      <TableHead>Supplier &amp; Kontrak</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Foto SJ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell>
                          <div className="type-p2 font-bold text-foreground">
                            {delivery.doNumber}
                          </div>
                          <div className="type-p3 text-muted-foreground">
                            {delivery.deliveryDate}
                            {delivery.vehiclePlate
                              ? ` · ${delivery.vehiclePlate}`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          {delivery.ticketNumber ? (
                            <Badge variant="outline" className="font-mono">
                              {delivery.ticketNumber}
                            </Badge>
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="type-p2 max-w-[200px] truncate">
                          {delivery.projectName}
                        </TableCell>
                        <TableCell>
                          <div className="type-p2 font-semibold text-foreground">
                            {delivery.vendorName}
                          </div>
                          <div className="type-p3 text-muted-foreground">
                            {delivery.contractNumber} ({delivery.materialType})
                          </div>
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
                          {formatMaterialVolume(
                            delivery.quantityReceived,
                            delivery.unit,
                          )}
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-bold tabular-nums">
                          {currency(delivery.estimatedAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              delivery.billingStatus === "UNBILLED"
                                ? "warning"
                                : "success"
                            }
                          >
                            {delivery.billingStatus}
                          </Badge>
                          {delivery.vendorInvoiceNumber && (
                            <span className="type-p3 mt-0.5 block text-muted-foreground">
                              {delivery.vendorInvoiceNumber}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {delivery.proofUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openProof(
                                  delivery.proofUrl!,
                                  `Foto DO ${delivery.doNumber}`,
                                )
                              }
                            >
                              <Eye className="size-3.5" aria-hidden="true" />
                              Lihat
                            </Button>
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 3: VendorInvoices & Payments */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="type-h3 flex items-center gap-2">
                <Receipt className="size-4 text-primary" aria-hidden="true" />
                3. Daftar Tagihan Kontrak Vendor &amp; Pembayaran
              </CardTitle>
              <CardDescription className="type-p3">
                Kelola tagihan kumulatif dan proses DP, Termin, atau Pelunasan melalui buku kas/bank.
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
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
              placeholder="Cari No. Tagihan, tiket, vendor, proyek..."
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent>
          {filteredInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Tidak ada tagihan kontrak vendor"
              description="Tagihan yang diterbitkan dari Surat Jalan (DO) akan tampil di daftar ini."
            />
          ) : (
            <>
              {/* Mobile Card View (< 768px) */}
              <div className="space-y-2.5 md:hidden">
                {filteredInvoices.map((invoice) => {
                  const badge = invoiceStatusBadge[invoice.status];
                  const ticketNumbers = Array.from(
                    new Set(
                      invoice.deliveries
                        .map((d) => d.ticketNumber)
                        .filter((t): t is string => Boolean(t)),
                    ),
                  );
                  return (
                    <div
                      key={invoice.id}
                      className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="type-p2 font-mono font-bold text-primary">
                            {invoice.invoiceNumber}
                          </p>
                          <p className="type-p1 font-semibold text-foreground">
                            {invoice.vendorName}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {invoice.contractNumber} ({invoice.materialType}) ·{" "}
                            {invoice.deliveryCount} DO
                          </p>
                          {ticketNumbers.length > 0 && (
                            <p className="type-p3 mt-0.5 font-mono text-primary">
                              Tiket: {ticketNumbers.join(", ")}
                            </p>
                          )}
                        </div>
                        <Badge variant={badge.variant} className="shrink-0">
                          {badge.label}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/30 p-2.5">
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Total
                          </span>
                          <p className="type-p2 font-bold tabular-nums">
                            {currency(invoice.grandTotal)}
                          </p>
                        </div>
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Terbayar
                          </span>
                          <p className="type-p2 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {currency(invoice.paidAmount)}
                          </p>
                        </div>
                        <div>
                          <span className="type-p3 text-muted-foreground">
                            Sisa
                          </span>
                          <p className="type-p2 font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                            {currency(invoice.remainingAmount)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <span className="type-p3 text-muted-foreground">
                          {invoice.createdAt.slice(0, 10)}
                          {invoice.dueDate ? ` · JT ${invoice.dueDate}` : ""}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailInvoice(invoice)}
                          >
                            <Eye className="size-3.5" aria-hidden="true" />
                            Rincian
                          </Button>
                          {canManage && invoice.status !== "PAID" && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setPayingInvoice(invoice)}
                            >
                              <CreditCard className="size-3.5" aria-hidden="true" />
                              Bayar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block">
                <Table pageSize={10} itemLabel="tagihan vendor">
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. Tagihan &amp; Jatuh Tempo</TableHead>
                      <TableHead>Vendor &amp; Kontrak</TableHead>
                      <TableHead>Cakupan DO, Tiket &amp; Proyek</TableHead>
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
                      const ticketNumbers = Array.from(
                        new Set(
                          invoice.deliveries
                            .map((d) => d.ticketNumber)
                            .filter((t): t is string => Boolean(t)),
                        ),
                      );
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <div className="type-p2 font-bold">
                              {invoice.invoiceNumber}
                            </div>
                            <div className="type-p3 text-muted-foreground">
                              {invoice.createdAt.slice(0, 10)}
                              {invoice.dueDate
                                ? ` · JT ${invoice.dueDate}`
                                : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="type-p2 font-semibold">
                              {invoice.vendorName}
                            </div>
                            <div className="type-p3 text-muted-foreground">
                              {invoice.contractNumber} ({invoice.materialType})
                            </div>
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => setDetailInvoice(invoice)}
                              className="type-p2 text-left font-medium text-primary underline-offset-2 hover:underline"
                            >
                              {invoice.deliveryCount} Surat Jalan
                            </button>
                            {ticketNumbers.length > 0 && (
                              <div className="type-p3 font-mono text-foreground">
                                Tiket: {ticketNumbers.join(", ")}
                              </div>
                            )}
                            <div className="type-p3 max-w-[210px] truncate text-muted-foreground">
                              {invoice.projectNames.join(", ") || "-"}
                            </div>
                          </TableCell>
                          <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
                            {formatMaterialVolume(
                              invoice.totalQuantity,
                              invoice.unit,
                            )}
                          </TableCell>
                          <TableCell className="type-p2 whitespace-nowrap text-right font-bold tabular-nums">
                            {currency(invoice.grandTotal)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <div className="type-p2 font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                              {currency(invoice.paidAmount)}
                            </div>
                            <div className="type-p3 text-muted-foreground tabular-nums">
                              Sisa: {currency(invoice.remainingAmount)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setDetailInvoice(invoice)}
                              >
                                <Eye className="size-3.5" aria-hidden="true" />
                                Rincian
                              </Button>
                              {canManage && invoice.status !== "PAID" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => setPayingInvoice(invoice)}
                                >
                                  <CreditCard className="size-3.5" aria-hidden="true" />
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Builder Modal: Create VendorInvoice from UNBILLED DO checkboxes */}
      <GlobalModal
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onOpenChange={setBuilderOpen}
        title="Buat Tagihan Kontrak Vendor"
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
            onPreviewProof={(url, title) => openProof(url, title)}
            onCreated={(message) => {
              setFeedback({ text: message, isError: false });
              toast.success(message);
              setBuilderOpen(false);
              router.refresh();
            }}
          />
        )}
      </GlobalModal>

      {/* Invoice Detail Modal (included DOs + Payment Receipts) */}
      <GlobalModal
        isOpen={Boolean(resolvedDetailInvoice)}
        onClose={() => {
          setDetailInvoice(null);
          onInitialInvoiceHandled?.();
        }}
        title={
          resolvedDetailInvoice
            ? `Rincian Tagihan ${resolvedDetailInvoice.invoiceNumber}`
            : "Rincian Tagihan"
        }
        description={
          resolvedDetailInvoice
            ? `${resolvedDetailInvoice.vendorName} · Kontrak ${resolvedDetailInvoice.contractNumber} (${currency(resolvedDetailInvoice.unitPrice)}/${resolvedDetailInvoice.unit})`
            : ""
        }
        className="sm:max-w-3xl"
      >
        {resolvedDetailInvoice && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="type-p3 text-muted-foreground">Total Kuantitas</p>
                <p className="type-p1 font-bold">
                  {formatMaterialVolume(
                    resolvedDetailInvoice.totalQuantity,
                    resolvedDetailInvoice.unit,
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="type-p3 text-muted-foreground">Grand Total</p>
                <p className="type-p1 font-bold tabular-nums">
                  {currency(resolvedDetailInvoice.grandTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="type-p3 text-emerald-700 dark:text-emerald-300">
                  Sudah Dibayar
                </p>
                <p className="type-p1 font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {currency(resolvedDetailInvoice.paidAmount)}
                </p>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <p className="type-p3 text-rose-700 dark:text-rose-300">
                  Sisa Tagihan
                </p>
                <p className="type-p1 font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                  {currency(resolvedDetailInvoice.remainingAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="type-p3 font-bold uppercase tracking-wide text-muted-foreground">
                Surat Jalan Tercakup ({resolvedDetailInvoice.deliveries.length} DO)
              </h4>
              <div className="max-h-64 overflow-auto">
                <Table pagination={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No. DO &amp; Truk</TableHead>
                      <TableHead>Tiket</TableHead>
                      <TableHead>Lokasi Proyek</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Foto DO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolvedDetailInvoice.deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="type-p3 whitespace-nowrap">
                          {delivery.deliveryDate}
                        </TableCell>
                        <TableCell>
                          <span className="type-p2 font-semibold block">
                            {delivery.doNumber}
                          </span>
                          {delivery.vehiclePlate ? (
                            <span className="type-p3 block text-muted-foreground">
                              {delivery.vehiclePlate}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {delivery.ticketNumber ? (
                            <Badge variant="outline" className="font-mono">
                              {delivery.ticketNumber}
                            </Badge>
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="type-p3">
                          {delivery.projectName}
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
                          {formatMaterialVolume(
                            delivery.quantityReceived,
                            resolvedDetailInvoice.unit,
                          )}
                        </TableCell>
                        <TableCell className="type-p2 whitespace-nowrap text-right font-semibold tabular-nums">
                          {currency(delivery.subtotal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {delivery.proofUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openProof(
                                  delivery.proofUrl!,
                                  `Foto DO ${delivery.doNumber}`,
                                )
                              }
                            >
                              <Eye className="size-3.5" aria-hidden="true" />
                              Lihat
                            </Button>
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              —
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
              <h4 className="type-p3 font-bold uppercase tracking-wide text-muted-foreground">
                Riwayat Pembayaran ({resolvedDetailInvoice.payments.length})
              </h4>
              {resolvedDetailInvoice.payments.length === 0 ? (
                <p className="type-p3 rounded-lg border border-dashed border-border p-3 text-muted-foreground">
                  Belum ada pembayaran tercatat untuk tagihan ini.
                </p>
              ) : (
                <div className="space-y-2">
                  {resolvedDetailInvoice.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 p-3"
                    >
                      <div>
                        <div className="type-p2 flex items-center gap-1.5 font-semibold">
                          <Badge variant="outline">
                            {paymentTypeLabel[payment.paymentType] ??
                              payment.paymentType}
                          </Badge>
                          <span className="tabular-nums">
                            {currency(payment.amount)}
                          </span>
                          <span className="text-muted-foreground">
                            · {payment.paymentMethod}
                          </span>
                        </div>
                        <p className="type-p3 mt-1 text-muted-foreground">
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
                            `Bukti Pembayaran ${resolvedDetailInvoice.invoiceNumber}`,
                          )
                        }
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        Bukti Transfer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {canManage && resolvedDetailInvoice.status !== "PAID" && (
                <Button
                  type="button"
                  onClick={() => {
                    const target = resolvedDetailInvoice;
                    setDetailInvoice(null);
                    onInitialInvoiceHandled?.();
                    setPayingInvoice(target);
                  }}
                >
                  Proses Bayar
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDetailInvoice(null);
                  onInitialInvoiceHandled?.();
                }}
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
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Create vendor invoice failed:", error);
        const errMsg = "Gagal menerbitkan tagihan vendor. Silakan coba lagi.";
        setSubmitMessage(errMsg);
        toast.error(errMsg);
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

      <div className="max-h-72 overflow-auto">
        <Table pagination={false}>
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
              <TableHead>Tiket</TableHead>
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
                  <TableCell className="type-p3 whitespace-nowrap">
                    {delivery.deliveryDate}
                  </TableCell>
                  <TableCell>
                    <div className="type-p2 font-bold">{delivery.doNumber}</div>
                    <div className="type-p3 text-muted-foreground">
                      {delivery.vehiclePlate || "-"}
                      {delivery.driverName ? ` · ${delivery.driverName}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {delivery.ticketNumber ? (
                      <Badge variant="outline" className="font-mono">
                        {delivery.ticketNumber}
                      </Badge>
                    ) : (
                      <span className="type-p3 text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="type-p3">{delivery.projectName}</TableCell>
                  <TableCell className="type-p2 whitespace-nowrap text-right font-semibold tabular-nums">
                    {formatMaterialVolume(
                      delivery.quantityReceived,
                      contract.unit,
                    )}
                  </TableCell>
                  <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
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
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        Foto
                      </Button>
                    ) : (
                      <span className="type-p3 text-muted-foreground">-</span>
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
        <div className="type-p2 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          <span>
            <strong>{selectedDeliveries.length}</strong> DO dipilih · Total:{" "}
            <strong>
              {formatMaterialVolume(totalSelectedQuantity, contract.unit)}
            </strong>{" "}
            &times; {currency(contract.unitPrice)}
          </span>
        </div>
        <div className="text-right">
          <p className="type-p3 text-muted-foreground">Grand Total Tagihan</p>
          <p className="type-kpi text-primary">{currency(grandTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vi-number">
            No. Invoice (Kosongkan untuk Auto)
          </Label>
          <Input
            id="vi-number"
            placeholder="Contoh: INV/PM/2026/045"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vi-due-date">Jatuh Tempo (Opsional)</Label>
          <DatePicker
            id="vi-due-date"
            value={dueDate}
            onValueChange={setDueDate}
            clearable
            disabled={isPending}
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
