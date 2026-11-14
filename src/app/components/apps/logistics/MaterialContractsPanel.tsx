"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  FilePlus2,
  Layers,
  Loader2,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import type { TicketPageRole, TicketProjectOption } from "@/app/(DashboardLayout)/types/ticket";
import {
  createMaterialContract,
  deleteUnbilledMaterialDelivery,
  toggleMaterialContractActive,
} from "@/app/actions/material-contracts";
import {
  BULK_MATERIAL_TYPE_OPTIONS,
  BULK_MATERIAL_UNIT_OPTIONS,
  canManageMaterialContracts,
  canRecordMaterialDeliveries,
  formatMaterialVolume,
  type MaterialContractRow,
  type MaterialDeliveryRow,
} from "@/lib/material-contracts";
import { parseRupiahInput } from "@/lib/indonesian-currency";
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
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import MaterialDeliveryModal from "@/app/components/apps/material-contracts/MaterialDeliveryModal";
import MaterialDeliveryProofModal from "@/app/components/apps/material-contracts/MaterialDeliveryProofModal";

export type ContractVendorCatalogOption = {
  id: string;
  name: string;
  category: string;
};

function currency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getLocalTodayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function MaterialContractsPanel({
  role,
  contracts,
  deliveries,
  vendors,
  projects,
}: {
  role: TicketPageRole;
  contracts: MaterialContractRow[];
  deliveries: MaterialDeliveryRow[];
  vendors: ContractVendorCatalogOption[];
  projects: TicketProjectOption[];
}) {
  const router = useRouter();
  const canCreateContract = canManageMaterialContracts(role);
  const canRecordDelivery = canRecordMaterialDeliveries(role);

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedContractForDo, setSelectedContractForDo] = useState<
    string | undefined
  >(undefined);
  const [proofPreview, setProofPreview] = useState<{
    title: string;
    url: string;
  } | null>(null);

  const [billingFilter, setBillingFilter] = useState<"ALL" | "UNBILLED" | "BILLED">(
    "ALL",
  );
  const [contractFilter, setContractFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeContractsCount = contracts.filter((c) => c.isActive).length;
  const unbilledDeliveriesCount = deliveries.filter(
    (d) => d.billingStatus === "UNBILLED",
  ).length;
  const totalUnbilledEstimate = contracts.reduce(
    (sum, contract) => sum + contract.unbilledEstimatedAmount,
    0,
  );

  const filteredDeliveries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return deliveries.filter((delivery) => {
      if (billingFilter !== "ALL" && delivery.billingStatus !== billingFilter) {
        return false;
      }
      if (contractFilter !== "ALL" && delivery.contractId !== contractFilter) {
        return false;
      }
      if (!query) return true;
      return (
        delivery.doNumber.toLowerCase().includes(query) ||
        delivery.contractNumber.toLowerCase().includes(query) ||
        delivery.vendorName.toLowerCase().includes(query) ||
        delivery.projectName.toLowerCase().includes(query) ||
        (delivery.vehiclePlate ?? "").toLowerCase().includes(query) ||
        (delivery.driverName ?? "").toLowerCase().includes(query)
      );
    });
  }, [deliveries, billingFilter, contractFilter, searchQuery]);

  const handleToggleActive = (contract: MaterialContractRow, checked: boolean) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await toggleMaterialContractActive(contract.id, checked);
      setFeedback({ text: result.message, isError: !result.success });
      if (result.success) {
        router.refresh();
      }
    });
  };

  const handleDeleteDelivery = (delivery: MaterialDeliveryRow) => {
    if (
      !window.confirm(
        `Hapus Surat Jalan ${delivery.doNumber} (${formatMaterialVolume(delivery.quantityReceived, delivery.unit)})?`,
      )
    ) {
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await deleteUnbilledMaterialDelivery(delivery.id);
      setFeedback({ text: result.message, isError: !result.success });
      if (result.success) {
        requestNotificationFeedRefresh();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Layers className="size-4 text-primary" />
            Kontrak Payung Material Curah (Blanket PO Pasir &amp; Batu)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ikat harga &amp; kuantitas kontrak vendor, catat Surat Jalan (DO) per
            kedatangan truk di berbagai proyek, dan kirim rekap siap-tagih ke
            Keuangan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRecordDelivery && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedContractForDo(undefined);
                setDeliveryModalOpen(true);
              }}
              className="gap-1.5"
            >
              <Truck className="size-4" />
              Catat Surat Jalan (DO)
            </Button>
          )}
          {canCreateContract && (
            <Button
              type="button"
              onClick={() => setContractModalOpen(true)}
              className="gap-1.5"
            >
              <FilePlus2 className="size-4" />
              Buat Kontrak Payung
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-border/80 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">
              Kontrak Payung Aktif
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {activeContractsCount}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {contracts.length} total kontrak
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-amber-700 dark:text-amber-300">
              Surat Jalan Belum Ditagih (UNBILLED)
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700 dark:text-amber-300">
              {unbilledDeliveriesCount} DO
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-emerald-700 dark:text-emerald-300">
              Estimasi Nilai Material UNBILLED
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {currency(totalUnbilledEstimate)}
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

      {/* Contracts List */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader>
          <CardTitle className="text-sm font-bold">
            Daftar Perjanjian Induk / Kontrak Payung Vendor
          </CardTitle>
          <CardDescription className="text-xs">
            Harga satuan kontrak mengikat otomatis setiap Surat Jalan dan tagihan
            Keuangan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-sm font-semibold">Belum ada kontrak material curah</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Klik tombol &ldquo;Buat Kontrak Payung&rdquo; untuk mendaftarkan
                harga kesepakatan pasir/batu dengan vendor.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Kontrak &amp; Vendor</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Harga Kontrak</TableHead>
                    <TableHead>Masa Berlaku</TableHead>
                    <TableHead className="text-right">Total Kirim</TableHead>
                    <TableHead className="text-right">Belum Ditagih</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <div className="text-xs font-bold text-foreground">
                          {contract.contractNumber}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {contract.vendorName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contract.materialType}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-semibold">
                        {currency(contract.unitPrice)} / {contract.unit}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {contract.startDate}
                        {contract.endDate ? ` s.d. ${contract.endDate}` : " · Tanpa batas"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs">
                        <div className="font-semibold">
                          {formatMaterialVolume(
                            contract.totalDeliveredVolume,
                            contract.unit,
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {contract.totalDeliveriesCount} DO
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs">
                        <div className="font-bold text-amber-700 dark:text-amber-300">
                          {formatMaterialVolume(
                            contract.unbilledVolume,
                            contract.unit,
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {contract.unbilledDeliveriesCount} DO ·{" "}
                          {currency(contract.unbilledEstimatedAmount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canCreateContract && (
                            <Switch
                              checked={contract.isActive}
                              disabled={isPending}
                              onCheckedChange={(checked) =>
                                handleToggleActive(contract, checked)
                              }
                              aria-label={`Aktifkan kontrak ${contract.contractNumber}`}
                            />
                          )}
                          <Badge
                            variant={contract.isActive ? "success" : "outline"}
                            className="text-[10px]"
                          >
                            {contract.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {canRecordDelivery && contract.isActive && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedContractForDo(contract.id);
                              setDeliveryModalOpen(true);
                            }}
                            className="h-8 gap-1 text-xs"
                          >
                            <Plus className="size-3.5" />
                            Catat DO
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

      {/* Deliveries History */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-bold">
                Log Surat Jalan (DO) Material Curah Lintas Proyek
              </CardTitle>
              <CardDescription className="text-xs">
                Setiap kiriman berstatus UNBILLED siap dipilih Keuangan pada menu
                Tagihan Kontrak Vendor.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "UNBILLED", "BILLED"] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={billingFilter === status ? "default" : "outline"}
                  onClick={() => setBillingFilter(status)}
                  className="h-8 text-xs"
                >
                  {status === "ALL"
                    ? "Semua"
                    : status === "UNBILLED"
                      ? "Belum Ditagih"
                      : "Sudah Ditagih"}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari No. DO, proyek, vendor, plat truk..."
                className="pl-9 text-xs"
              />
            </div>
            <Select value={contractFilter} onValueChange={setContractFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Filter berdasarkan kontrak" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kontrak Vendor</SelectItem>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>
                    {contract.contractNumber} · {contract.vendorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {filteredDeliveries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
              Tidak ada data Surat Jalan sesuai filter saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No. Surat Jalan</TableHead>
                    <TableHead>Kontrak &amp; Vendor</TableHead>
                    <TableHead>Proyek Tujuan</TableHead>
                    <TableHead>Truk / Supir</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Nilai Kontrak</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {delivery.deliveryDate}
                      </TableCell>
                      <TableCell className="text-xs font-bold">
                        {delivery.doNumber}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">
                          {delivery.vendorName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {delivery.contractNumber} ({delivery.materialType})
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs">
                        {delivery.projectName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {delivery.vehiclePlate || "-"}
                        {delivery.driverName ? ` · ${delivery.driverName}` : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-semibold">
                        {formatMaterialVolume(
                          delivery.quantityReceived,
                          delivery.unit,
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                        {currency(delivery.estimatedAmount)}
                      </TableCell>
                      <TableCell>
                        {delivery.billingStatus === "BILLED" ? (
                          <div className="space-y-0.5">
                            <Badge variant="success" className="gap-1 text-[10px]">
                              <CheckCircle2 className="size-3" />
                              BILLED
                            </Badge>
                            {delivery.vendorInvoiceNumber && (
                              <div className="text-[10px] text-muted-foreground">
                                {delivery.vendorInvoiceNumber}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">
                            UNBILLED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {delivery.proofUrl && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              title="Lihat Foto Surat Jalan"
                              onClick={() =>
                                setProofPreview({
                                  title: `Surat Jalan ${delivery.doNumber}`,
                                  url: delivery.proofUrl!,
                                })
                              }
                            >
                              <Eye className="size-3.5" />
                            </Button>
                          )}
                          {canRecordDelivery &&
                            delivery.billingStatus === "UNBILLED" && (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={isPending}
                                title="Hapus DO belum ditagih"
                                onClick={() => handleDeleteDelivery(delivery)}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateMaterialContractModal
        open={contractModalOpen}
        onOpenChange={setContractModalOpen}
        vendors={vendors}
        onCreated={() => {
          router.refresh();
        }}
      />

      <MaterialDeliveryModal
        open={deliveryModalOpen}
        onOpenChange={setDeliveryModalOpen}
        contracts={contracts}
        projects={projects}
        defaultContractId={selectedContractForDo}
      />

      <MaterialDeliveryProofModal
        preview={proofPreview}
        onClose={() => setProofPreview(null)}
      />
    </div>
  );
}

function CreateMaterialContractModal({
  open,
  onOpenChange,
  vendors,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: ContractVendorCatalogOption[];
  onCreated: () => void;
}) {
  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onOpenChange={onOpenChange}
      title="Buat Kontrak Payung Material Curah"
      description="Ikat harga per rit atau m3 dengan vendor untuk pengiriman bertahap ke berbagai lokasi proyek."
      className="sm:max-w-xl"
    >
      <CreateMaterialContractFormBody
        key={open ? "open" : "closed"}
        vendors={vendors}
        onClose={() => onOpenChange(false)}
        onCreated={onCreated}
      />
    </GlobalModal>
  );
}

function CreateMaterialContractFormBody({
  vendors,
  onClose,
  onCreated,
}: {
  vendors: ContractVendorCatalogOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [contractNumber, setContractNumber] = useState("");
  const [vendorSelection, setVendorSelection] = useState<string>("CUSTOM");
  const [vendorName, setVendorName] = useState("");
  const [materialType, setMaterialType] = useState("PASIR");
  const [customMaterial, setCustomMaterial] = useState("");
  const [unitPriceFormatted, setUnitPriceFormatted] = useState("");
  const [unit, setUnit] = useState("RIT");
  const [estimatedVolume, setEstimatedVolume] = useState("");
  const [startDate, setStartDate] = useState(() => getLocalTodayIsoDate());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleVendorChange = (value: string) => {
    setVendorSelection(value);
    if (value !== "CUSTOM") {
      const selected = vendors.find((v) => v.id === value);
      if (selected) {
        setVendorName(selected.name);
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const resolvedMaterial =
      materialType === "CUSTOM"
        ? customMaterial.trim().toUpperCase()
        : materialType;
    const numericUnitPrice = parseRupiahInput(unitPriceFormatted);

    if (!vendorName.trim() || !resolvedMaterial || numericUnitPrice <= 0) {
      setMessage(
        "Nama vendor, jenis material, dan harga kontrak wajib diisi dengan benar.",
      );
      setIsError(true);
      return;
    }

    setMessage("");
    setIsError(false);

    startTransition(async () => {
      try {
        const result = await createMaterialContract({
          contractNumber: contractNumber.trim() || null,
          vendorId: vendorSelection === "CUSTOM" ? null : vendorSelection,
          vendorName: vendorName.trim(),
          materialType: resolvedMaterial,
          unitPrice: numericUnitPrice,
          unit,
          estimatedVolume: estimatedVolume.trim()
            ? Number(estimatedVolume)
            : null,
          startDate,
          endDate: endDate.trim() || null,
          notes: notes.trim() || null,
        });
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          onCreated();
          onClose();
        }
      } catch (error) {
        console.error("Create contract failed:", error);
        setMessage("Gagal menyimpan kontrak material. Silakan coba lagi.");
        setIsError(true);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mc-catalog-vendor">Pilih dari Katalog Vendor</Label>
          <Select value={vendorSelection} onValueChange={handleVendorChange}>
            <SelectTrigger id="mc-catalog-vendor">
              <SelectValue placeholder="Pilih vendor atau ketik manual" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CUSTOM">-- Input Vendor Manual --</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name} ({vendor.category})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mc-vendor-name">
            Nama Vendor / Supplier <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mc-vendor-name"
            required
            placeholder="Contoh: PT Pasir Maju"
            value={vendorName}
            onChange={(event) => {
              setVendorName(event.target.value);
              if (vendorSelection !== "CUSTOM") {
                const chosen = vendors.find((v) => v.id === vendorSelection);
                if (chosen && chosen.name !== event.target.value) {
                  setVendorSelection("CUSTOM");
                }
              }
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mc-number">
            Nomor Kontrak (Kosongkan untuk Auto)
          </Label>
          <Input
            id="mc-number"
            placeholder="KONTRAK/PASIR/2026/001"
            value={contractNumber}
            onChange={(event) => setContractNumber(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mc-material">
            Jenis Material Curah <span className="text-destructive">*</span>
          </Label>
          <Select value={materialType} onValueChange={setMaterialType}>
            <SelectTrigger id="mc-material">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BULK_MATERIAL_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
              <SelectItem value="CUSTOM">Lainnya (Ketik Sendiri)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {materialType === "CUSTOM" && (
        <div className="space-y-1.5">
          <Label htmlFor="mc-custom-material">
            Nama Jenis Material <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mc-custom-material"
            required
            placeholder="Mis. ABU BATU atau PASIR COR"
            value={customMaterial}
            onChange={(event) => setCustomMaterial(event.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mc-unit">
            Satuan Hitung Kontrak <span className="text-destructive">*</span>
          </Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger id="mc-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BULK_MATERIAL_UNIT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mc-est-volume">Target Volume Kontrak (Opsional)</Label>
          <Input
            id="mc-est-volume"
            type="number"
            min="0.01"
            step="0.01"
            placeholder={`Mis. 500 (${unit})`}
            value={estimatedVolume}
            onChange={(event) => setEstimatedVolume(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mc-unit-price">
          Harga Kesepakatan per {unit} <span className="text-destructive">*</span>
        </Label>
        <RupiahAmountInput
          id="mc-unit-price"
          value={unitPriceFormatted}
          onChange={setUnitPriceFormatted}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mc-start-date">
            Tanggal Mulai Berlaku <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mc-start-date"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mc-end-date">Tanggal Berakhir (Opsional)</Label>
          <Input
            id="mc-end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mc-notes">Catatan Syarat / Ketentuan</Label>
        <Textarea
          id="mc-notes"
          rows={2}
          placeholder="Mis. Harga sudah termasuk ongkos kirim ke lokasi proyek area Subang"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {message}
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
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            "Simpan Kontrak Payung"
          )}
        </Button>
      </div>
    </form>
  );
}
