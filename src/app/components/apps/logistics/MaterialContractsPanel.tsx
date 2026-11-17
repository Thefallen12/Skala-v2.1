"use client";

import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  FilePlus2,
  Layers,
  Loader2,
  Plus,
  Receipt,
  Search,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import type {
  TicketPageRole,
  TicketProjectOption,
} from "@/app/(DashboardLayout)/types/ticket";
import {
  createMaterialContract,
  createVendorInvoiceFromDeliveries,
  deleteUnbilledMaterialDelivery,
  getUnbilledDeliveriesForContract,
  toggleMaterialContractActive,
} from "@/app/actions/material-contracts";
import { getJakartaDateKey } from "@/lib/habit-date";
import {
  BULK_MATERIAL_TYPE_OPTIONS,
  BULK_MATERIAL_UNIT_OPTIONS,
  canManageMaterialContracts,
  canPrepareVendorInvoices,
  canRecordMaterialDeliveries,
  formatMaterialVolume,
  roundMaterialNumber,
  type ContractTicketDeliveryOption,
  type MaterialContractRow,
  type MaterialDeliveryRow,
  type VendorInvoiceRow,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function ContractMobileCard({
  contract,
  canCreateContract,
  canRecordDelivery,
  canPrepareInvoices,
  isPending,
  onToggleActive,
  onRecordDo,
  onSendBilling,
}: {
  contract: MaterialContractRow;
  canCreateContract: boolean;
  canRecordDelivery: boolean;
  canPrepareInvoices: boolean;
  isPending: boolean;
  onToggleActive: (contract: MaterialContractRow, checked: boolean) => void;
  onRecordDo: (contractId: string) => void;
  onSendBilling: (contractId: string) => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-p3 font-mono font-bold text-primary">
            {contract.contractNumber}
          </p>
          <p className="type-p1 font-semibold text-foreground">
            {contract.vendorName}
          </p>
          <p className="type-p3 text-muted-foreground">
            {contract.materialType} · {currency(contract.unitPrice)} /{" "}
            {contract.unit}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateContract && (
            <Switch
              checked={contract.isActive}
              disabled={isPending}
              onCheckedChange={(checked) => onToggleActive(contract, checked)}
              aria-label={`Aktifkan kontrak ${contract.contractNumber}`}
            />
          )}
          <Badge variant={contract.isActive ? "lightSuccess" : "outline"}>
            {contract.isActive ? "Aktif" : "Nonaktif"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
        <div>
          <span className="type-p3 text-muted-foreground">Total Kirim</span>
          <p className="type-p2 font-semibold text-foreground">
            {formatMaterialVolume(contract.totalDeliveredVolume, contract.unit)}{" "}
            ({contract.totalDeliveriesCount} DO)
          </p>
        </div>
        <div className="text-right">
          <span className="type-p3 text-muted-foreground">Belum Ditagih</span>
          <p className="type-p2 font-bold text-amber-700 dark:text-amber-300">
            {formatMaterialVolume(contract.unbilledVolume, contract.unit)}
          </p>
          <p className="type-p3 text-muted-foreground tabular-nums">
            {currency(contract.unbilledEstimatedAmount)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-p3 text-muted-foreground">
          {contract.startDate}
          {contract.endDate ? ` s.d. ${contract.endDate}` : " · Tanpa batas"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {canPrepareInvoices && contract.unbilledDeliveriesCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outlinesuccess"
              onClick={() => onSendBilling(contract.id)}
            >
              <Send className="size-3.5" aria-hidden="true" />
              Kirim Tagihan
            </Button>
          )}
          {canRecordDelivery && contract.isActive && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRecordDo(contract.id)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Catat DO
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryMobileCard({
  delivery,
  canRecordDelivery,
  isPending,
  onPreviewProof,
  onDelete,
}: {
  delivery: MaterialDeliveryRow;
  canRecordDelivery: boolean;
  isPending: boolean;
  onPreviewProof: (delivery: MaterialDeliveryRow) => void;
  onDelete: (delivery: MaterialDeliveryRow) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-p3 font-mono font-bold text-primary">
              {delivery.doNumber}
            </span>
            {delivery.ticketNumber && (
              <Badge variant="outline">{delivery.ticketNumber}</Badge>
            )}
          </div>
          <p className="type-p1 mt-0.5 font-semibold text-foreground">
            {delivery.projectName}
          </p>
          <p className="type-p3 text-muted-foreground">
            {delivery.vendorName} · {delivery.contractNumber} (
            {delivery.materialType})
          </p>
        </div>
        {delivery.billingStatus === "BILLED" ? (
          <Badge variant="lightSuccess" className="shrink-0 gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            BILLED
          </Badge>
        ) : (
          <Badge variant="lightWarning" className="shrink-0">
            UNBILLED
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
        <span className="type-p2 font-semibold text-foreground">
          {formatMaterialVolume(delivery.quantityReceived, delivery.unit)}
        </span>
        <span className="type-p2 font-mono font-bold tabular-nums text-foreground">
          {currency(delivery.estimatedAmount)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="type-p3 text-muted-foreground">
          {delivery.deliveryDate} · {delivery.vehiclePlate || "-"}
          {delivery.driverName ? ` (${delivery.driverName})` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          {delivery.proofUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onPreviewProof(delivery)}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              Foto
            </Button>
          )}
          {canRecordDelivery && delivery.billingStatus === "UNBILLED" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              className="text-destructive"
              onClick={() => onDelete(delivery)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Hapus
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BillingDeliveryMobileCard({
  delivery,
  checked,
  onToggle,
  onPreviewProof,
}: {
  delivery: MaterialDeliveryRow;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onPreviewProof: (delivery: MaterialDeliveryRow) => void;
}) {
  return (
    <div
      className={`space-y-2 rounded-xl border p-3.5 transition-colors ${
        checked
          ? "border-primary/50 bg-primary/5"
          : "border-border/80 bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
          <Checkbox
            checked={checked}
            onCheckedChange={(val) => onToggle(val === true)}
            aria-label={`Pilih DO ${delivery.doNumber}`}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-p2 font-mono font-bold text-primary">
                {delivery.doNumber}
              </span>
              {delivery.ticketNumber && (
                <Badge variant="outline">{delivery.ticketNumber}</Badge>
              )}
            </div>
            <p className="type-p3 text-muted-foreground">
              {delivery.deliveryDate} · {delivery.projectName}
            </p>
          </div>
        </label>
        {delivery.proofUrl && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPreviewProof(delivery)}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            Foto
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5">
        <span className="type-p3 text-muted-foreground">
          {formatMaterialVolume(delivery.quantityReceived, delivery.unit)} ·{" "}
          {delivery.vehiclePlate || "-"}
        </span>
        <span className="type-p2 font-mono font-bold tabular-nums text-foreground">
          {currency(delivery.estimatedAmount)}
        </span>
      </div>
    </div>
  );
}

export default function MaterialContractsPanel({
  role,
  contracts,
  deliveries,
  vendors,
  projects,
  contractTickets = [],
  vendorInvoices = [],
}: {
  role: TicketPageRole;
  contracts: MaterialContractRow[];
  deliveries: MaterialDeliveryRow[];
  vendors: ContractVendorCatalogOption[];
  projects: TicketProjectOption[];
  contractTickets?: ContractTicketDeliveryOption[];
  vendorInvoices?: VendorInvoiceRow[];
}) {
  const router = useRouter();
  const canCreateContract = canManageMaterialContracts(role);
  const canRecordDelivery = canRecordMaterialDeliveries(role);
  const canPrepareInvoices = canPrepareVendorInvoices(role);

  const [activeSubTab, setActiveSubTab] = useState<
    "contracts" | "deliveries" | "billing"
  >("contracts");
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [selectedContractForDo, setSelectedContractForDo] = useState<
    string | undefined
  >(undefined);
  const [deleteDeliveryTarget, setDeleteDeliveryTarget] =
    useState<MaterialDeliveryRow | null>(null);
  const [proofPreview, setProofPreview] = useState<{
    title: string;
    url: string;
  } | null>(null);

  const [billingFilter, setBillingFilter] = useState<
    "ALL" | "UNBILLED" | "BILLED"
  >("ALL");
  const [contractFilter, setContractFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Billing Builder state ("Kirim Tagihan ke Keuangan")
  const [billingContractId, setBillingContractId] = useState(() => {
    const firstWithUnbilled = contracts.find(
      (c) => c.unbilledDeliveriesCount > 0,
    );
    return firstWithUnbilled?.id ?? contracts[0]?.id ?? "";
  });
  const [unbilledDeliveries, setUnbilledDeliveries] = useState<
    MaterialDeliveryRow[]
  >([]);
  const [loadingUnbilled, setLoadingUnbilled] = useState(false);
  const [unbilledError, setUnbilledError] = useState("");
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [invoiceNotesInput, setInvoiceNotesInput] = useState("");
  const [billingConfirmOpen, setBillingConfirmOpen] = useState(false);

  const loadContractUnbilled = async (targetContractId: string) => {
    if (!targetContractId || !canPrepareInvoices) {
      setUnbilledDeliveries([]);
      setSelectedDeliveryIds([]);
      return;
    }
    setLoadingUnbilled(true);
    setUnbilledError("");
    try {
      const res = await getUnbilledDeliveriesForContract(targetContractId);
      if (res.success) {
        setUnbilledDeliveries(res.deliveries);
        setSelectedDeliveryIds(res.deliveries.map((d) => d.id));
      } else {
        setUnbilledDeliveries([]);
        setSelectedDeliveryIds([]);
        setUnbilledError(res.message ?? "Gagal memuat daftar Surat Jalan.");
      }
    } catch (error) {
      console.error("Failed to fetch unbilled deliveries:", error);
      setUnbilledDeliveries([]);
      setSelectedDeliveryIds([]);
      setUnbilledError("Gagal memuat daftar Surat Jalan belum ditagih.");
    } finally {
      setLoadingUnbilled(false);
    }
  };

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
        (delivery.ticketNumber ?? "").toLowerCase().includes(query) ||
        (delivery.vehiclePlate ?? "").toLowerCase().includes(query) ||
        (delivery.driverName ?? "").toLowerCase().includes(query)
      );
    });
  }, [deliveries, billingFilter, contractFilter, searchQuery]);

  const billingContractOptions = useMemo<ComboboxOption[]>(() => {
    const sorted = [...contracts].sort(
      (a, b) => b.unbilledDeliveriesCount - a.unbilledDeliveriesCount,
    );
    return sorted.map((c) => ({
      value: c.id,
      label: `${c.contractNumber} · ${c.vendorName}`,
      description: `${c.materialType} · ${c.unbilledDeliveriesCount} DO belum ditagih (${currency(c.unbilledEstimatedAmount)})`,
      keywords: [c.contractNumber, c.vendorName, c.materialType],
    }));
  }, [contracts]);

  const selectedBillingContract =
    contracts.find((c) => c.id === billingContractId) ?? null;

  const selectedBillingDeliveries = useMemo(() => {
    const idSet = new Set(selectedDeliveryIds);
    return unbilledDeliveries.filter((d) => idSet.has(d.id));
  }, [selectedDeliveryIds, unbilledDeliveries]);

  const selectedTotalQty = roundMaterialNumber(
    selectedBillingDeliveries.reduce((sum, d) => sum + d.quantityReceived, 0),
    2,
  );
  const selectedGrandTotal = selectedBillingContract
    ? roundMaterialNumber(selectedTotalQty * selectedBillingContract.unitPrice, 2)
    : 0;

  const allUnbilledChecked =
    unbilledDeliveries.length > 0 &&
    selectedDeliveryIds.length === unbilledDeliveries.length;

  const handleToggleActive = (
    contract: MaterialContractRow,
    checked: boolean,
  ) => {
    startTransition(async () => {
      try {
        const result = await toggleMaterialContractActive(contract.id, checked);
        if (result.success) {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Toggle material contract error:", error);
        toast.error("Gagal memperbarui status kontrak.");
      }
    });
  };

  const confirmDeleteDelivery = () => {
    if (!deleteDeliveryTarget) return;
    startTransition(async () => {
      try {
        const result = await deleteUnbilledMaterialDelivery(
          deleteDeliveryTarget.id,
        );
        if (result.success) {
          toast.success(result.message);
          setDeleteDeliveryTarget(null);
          requestNotificationFeedRefresh();
          router.refresh();
          if (activeSubTab === "billing" && billingContractId) {
            void loadContractUnbilled(billingContractId);
          }
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Delete delivery error:", error);
        toast.error("Gagal menghapus Surat Jalan.");
      }
    });
  };

  const handleOpenBillingForContract = (targetContractId?: string) => {
    let resolvedId = billingContractId;
    if (targetContractId) {
      resolvedId = targetContractId;
      setBillingContractId(targetContractId);
    } else if (!billingContractId) {
      const firstUnbilled = contracts.find(
        (c) => c.unbilledDeliveriesCount > 0,
      );
      if (firstUnbilled) {
        resolvedId = firstUnbilled.id;
        setBillingContractId(firstUnbilled.id);
      }
    }
    setActiveSubTab("billing");
    if (resolvedId) {
      void loadContractUnbilled(resolvedId);
    }
  };

  const handleTabChange = (value: string) => {
    const nextTab = value as "contracts" | "deliveries" | "billing";
    setActiveSubTab(nextTab);
    if (nextTab === "billing" && billingContractId) {
      void loadContractUnbilled(billingContractId);
    }
  };

  const handleBillingContractChange = (nextContractId: string) => {
    setBillingContractId(nextContractId);
    void loadContractUnbilled(nextContractId);
  };

  const handleConfirmCreateInvoice = () => {
    if (!selectedBillingContract || selectedDeliveryIds.length === 0) return;
    startTransition(async () => {
      try {
        const result = await createVendorInvoiceFromDeliveries({
          contractId: selectedBillingContract.id,
          deliveryIds: selectedDeliveryIds,
          invoiceNumber: invoiceNumberInput.trim() || null,
          dueDate: dueDateInput.trim() || null,
          notes: invoiceNotesInput.trim() || null,
        });
        if (result.success) {
          toast.success("Tagihan dikirim ke Keuangan", {
            description: result.message,
          });
          setBillingConfirmOpen(false);
          setInvoiceNumberInput("");
          setDueDateInput("");
          setInvoiceNotesInput("");
          requestNotificationFeedRefresh();
          router.refresh();
          await loadContractUnbilled(selectedBillingContract.id);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Create vendor invoice failed:", error);
        toast.error("Gagal mengirim tagihan ke Keuangan.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="type-h2 flex items-center gap-2 text-foreground">
            <Layers className="size-5 text-primary" aria-hidden="true" />
            Kontrak Material Alam
          </h2>
          <p className="type-p2 mt-1 text-muted-foreground">
            Ikat harga kontrak vendor, catat Surat Jalan per tiket proyek, dan kirim tagihan ke Keuangan.
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
            >
              <Truck className="size-4" aria-hidden="true" />
              Catat Surat Jalan
            </Button>
          )}
          {canPrepareInvoices && (
            <Button
              type="button"
              variant="outlinesuccess"
              onClick={() => handleOpenBillingForContract()}
            >
              <Send className="size-4" aria-hidden="true" />
              Kirim Tagihan
            </Button>
          )}
          {canCreateContract && (
            <Button type="button" onClick={() => setContractModalOpen(true)}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              Buat Kontrak
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-border/80 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3">
              Kontrak Aktif
            </CardDescription>
            <CardTitle className="type-kpi">
              {activeContractsCount}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                / {contracts.length} kontrak
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3 text-amber-700 dark:text-amber-300">
              Surat Jalan UNBILLED
            </CardDescription>
            <CardTitle className="type-kpi text-amber-700 dark:text-amber-300">
              {unbilledDeliveriesCount} DO
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-2xs">
          <CardHeader className="pb-2">
            <CardDescription className="type-p3 text-emerald-700 dark:text-emerald-300">
              Estimasi Nilai UNBILLED
            </CardDescription>
            <CardTitle className="type-kpi text-emerald-700 dark:text-emerald-300">
              {currency(totalUnbilledEstimate)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs
        value={activeSubTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 rounded-xl border border-border bg-muted/60 p-1.5 sm:w-auto sm:inline-grid">
          <TabsTrigger value="contracts" className="gap-1.5">
            <Layers className="size-4" aria-hidden="true" />
            <span>Kontrak Material</span>
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="gap-1.5">
            <Truck className="size-4" aria-hidden="true" />
            <span>Surat Jalan</span>
          </TabsTrigger>
          {canPrepareInvoices && (
            <TabsTrigger value="billing" className="gap-1.5">
              <Send className="size-4" aria-hidden="true" />
              <span>Kirim Tagihan</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="contracts">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader>
              <CardTitle className="type-h3">
                Daftar Kontrak Payung Vendor
              </CardTitle>
              <CardDescription className="type-p2">
                Harga satuan kontrak mengikat otomatis setiap Surat Jalan dan tagihan Keuangan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="Belum Ada Kontrak Material"
                  description="Klik tombol Buat Kontrak untuk mendaftarkan harga kesepakatan pasir/batu dengan vendor."
                  action={
                    canCreateContract ? (
                      <Button
                        type="button"
                        onClick={() => setContractModalOpen(true)}
                      >
                        <FilePlus2 className="size-4" aria-hidden="true" />
                        Buat Kontrak
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="space-y-2.5 md:hidden">
                    {contracts.map((contract) => (
                      <ContractMobileCard
                        key={contract.id}
                        contract={contract}
                        canCreateContract={canCreateContract}
                        canRecordDelivery={canRecordDelivery}
                        canPrepareInvoices={canPrepareInvoices}
                        isPending={isPending}
                        onToggleActive={handleToggleActive}
                        onRecordDo={(contractId) => {
                          setSelectedContractForDo(contractId);
                          setDeliveryModalOpen(true);
                        }}
                        onSendBilling={(contractId) =>
                          handleOpenBillingForContract(contractId)
                        }
                      />
                    ))}
                  </div>

                  <div className="hidden md:block">
                    <Table itemLabel="kontrak material">
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Kontrak &amp; Vendor</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">
                            Harga Kontrak
                          </TableHead>
                          <TableHead>Masa Berlaku</TableHead>
                          <TableHead className="text-right">Total Kirim</TableHead>
                          <TableHead className="text-right">
                            Belum Ditagih
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contracts.map((contract) => (
                          <TableRow key={contract.id}>
                            <TableCell className="whitespace-normal">
                              <p className="type-p2 font-bold text-foreground">
                                {contract.contractNumber}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {contract.vendorName}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {contract.materialType}
                              </Badge>
                            </TableCell>
                            <TableCell className="type-p2 text-right font-semibold tabular-nums">
                              {currency(contract.unitPrice)} / {contract.unit}
                            </TableCell>
                            <TableCell className="type-p3 text-muted-foreground">
                              {contract.startDate}
                              {contract.endDate
                                ? ` s.d. ${contract.endDate}`
                                : " · Tanpa batas"}
                            </TableCell>
                            <TableCell className="text-right">
                              <p className="type-p2 font-semibold tabular-nums">
                                {formatMaterialVolume(
                                  contract.totalDeliveredVolume,
                                  contract.unit,
                                )}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {contract.totalDeliveriesCount} DO
                              </p>
                            </TableCell>
                            <TableCell className="text-right">
                              <p className="type-p2 font-bold tabular-nums text-amber-700 dark:text-amber-300">
                                {formatMaterialVolume(
                                  contract.unbilledVolume,
                                  contract.unit,
                                )}
                              </p>
                              <p className="type-p3 text-muted-foreground tabular-nums">
                                {contract.unbilledDeliveriesCount} DO ·{" "}
                                {currency(contract.unbilledEstimatedAmount)}
                              </p>
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
                                  variant={
                                    contract.isActive ? "lightSuccess" : "outline"
                                  }
                                >
                                  {contract.isActive ? "Aktif" : "Nonaktif"}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {canPrepareInvoices &&
                                  contract.unbilledDeliveriesCount > 0 && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outlinesuccess"
                                      onClick={() =>
                                        handleOpenBillingForContract(contract.id)
                                      }
                                    >
                                      <Send className="size-3.5" aria-hidden="true" />
                                      Kirim Tagihan
                                    </Button>
                                  )}
                                {canRecordDelivery && contract.isActive && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedContractForDo(contract.id);
                                      setDeliveryModalOpen(true);
                                    }}
                                  >
                                    <Plus className="size-3.5" aria-hidden="true" />
                                    Catat DO
                                  </Button>
                                )}
                              </div>
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
        </TabsContent>

        <TabsContent value="deliveries">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="type-h3">
                    Log Surat Jalan Material Alam
                  </CardTitle>
                  <CardDescription className="type-p2">
                    Setiap kiriman UNBILLED siap disusun menjadi tagihan ke Keuangan.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["ALL", "UNBILLED", "BILLED"] as const).map((status) => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={billingFilter === status ? "default" : "outline"}
                      onClick={() => setBillingFilter(status)}
                    >
                      {status === "ALL"
                        ? "Semua"
                        : status === "UNBILLED"
                          ? "UNBILLED"
                          : "BILLED"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Cari No. DO, tiket, proyek, vendor..."
                    className="pl-9"
                  />
                </div>
                <Select value={contractFilter} onValueChange={setContractFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter kontrak" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Kontrak</SelectItem>
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
                <EmptyState
                  icon={Truck}
                  title="Belum Ada Surat Jalan"
                  description="Tidak ada data Surat Jalan sesuai filter saat ini."
                />
              ) : (
                <>
                  <div className="space-y-2.5 md:hidden">
                    {filteredDeliveries.map((delivery) => (
                      <DeliveryMobileCard
                        key={delivery.id}
                        delivery={delivery}
                        canRecordDelivery={canRecordDelivery}
                        isPending={isPending}
                        onPreviewProof={(d) =>
                          setProofPreview({
                            title: `Surat Jalan ${d.doNumber}`,
                            url: d.proofUrl!,
                          })
                        }
                        onDelete={setDeleteDeliveryTarget}
                      />
                    ))}
                  </div>

                  <div className="hidden md:block">
                    <Table itemLabel="surat jalan">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>No. DO &amp; Tiket</TableHead>
                          <TableHead>Kontrak &amp; Vendor</TableHead>
                          <TableHead>Proyek Tujuan</TableHead>
                          <TableHead>Truk / Supir</TableHead>
                          <TableHead className="text-right">Volume</TableHead>
                          <TableHead className="text-right">Nilai</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDeliveries.map((delivery) => (
                          <TableRow key={delivery.id}>
                            <TableCell className="type-p2 tabular-nums">
                              {delivery.deliveryDate}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <p className="type-p2 font-bold text-foreground">
                                {delivery.doNumber}
                              </p>
                              {delivery.ticketNumber && (
                                <Badge variant="outline" className="mt-1">
                                  {delivery.ticketNumber}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <p className="type-p2 font-medium text-foreground">
                                {delivery.vendorName}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {delivery.contractNumber} ({delivery.materialType})
                              </p>
                            </TableCell>
                            <TableCell className="type-p2 max-w-[200px] truncate">
                              {delivery.projectName}
                            </TableCell>
                            <TableCell className="type-p3 text-muted-foreground">
                              {delivery.vehiclePlate || "-"}
                              {delivery.driverName
                                ? ` · ${delivery.driverName}`
                                : ""}
                            </TableCell>
                            <TableCell className="type-p2 text-right font-semibold tabular-nums">
                              {formatMaterialVolume(
                                delivery.quantityReceived,
                                delivery.unit,
                              )}
                            </TableCell>
                            <TableCell className="type-p2 text-right font-medium tabular-nums">
                              {currency(delivery.estimatedAmount)}
                            </TableCell>
                            <TableCell>
                              {delivery.billingStatus === "BILLED" ? (
                                <div className="space-y-0.5">
                                  <Badge variant="lightSuccess" className="gap-1">
                                    <CheckCircle2
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    BILLED
                                  </Badge>
                                  {delivery.vendorInvoiceNumber && (
                                    <p className="type-p3 text-muted-foreground">
                                      {delivery.vendorInvoiceNumber}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="lightWarning">UNBILLED</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
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
                                    <Eye className="size-4" aria-hidden="true" />
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
                                      onClick={() =>
                                        setDeleteDeliveryTarget(delivery)
                                      }
                                    >
                                      <Trash2
                                        className="size-4 text-destructive"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  )}
                              </div>
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
        </TabsContent>

        {canPrepareInvoices && (
          <TabsContent value="billing" className="space-y-5">
            <Card className="border-border/80 shadow-2xs">
              <CardHeader>
                <CardTitle className="type-h3">
                  Kirim Tagihan ke Keuangan
                </CardTitle>
                <CardDescription className="type-p2">
                  Pilih kontrak dan centang Surat Jalan UNBILLED yang siap ditagihkan ke Bagian Keuangan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="billing-contract-select"
                      className="type-p2 font-semibold"
                    >
                      Pilih Kontrak Vendor
                    </Label>
                    <Combobox
                      id="billing-contract-select"
                      options={billingContractOptions}
                      value={billingContractId}
                      onValueChange={handleBillingContractChange}
                      placeholder="Pilih kontrak..."
                      searchPlaceholder="Cari kontrak atau vendor..."
                    />
                  </div>
                  {selectedBillingContract && (
                    <div className="flex flex-col justify-center rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
                      <p className="type-p3 text-muted-foreground">
                        {selectedBillingContract.vendorName} ·{" "}
                        {selectedBillingContract.materialType}
                      </p>
                      <p className="type-p2 font-semibold text-foreground tabular-nums">
                        Harga: {currency(selectedBillingContract.unitPrice)} /{" "}
                        {selectedBillingContract.unit}
                      </p>
                    </div>
                  )}
                </div>

                {loadingUnbilled ? (
                  <div className="type-p2 flex items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Memuat Surat Jalan belum ditagih...
                  </div>
                ) : unbilledError ? (
                  <EmptyState
                    icon={Receipt}
                    title="Gagal Memuat Surat Jalan"
                    description={unbilledError}
                  />
                ) : unbilledDeliveries.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Tidak Ada DO UNBILLED"
                    description="Semua Surat Jalan pada kontrak ini sudah dikirim ke Keuangan atau belum ada pengiriman tercatat."
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <label className="type-p2 flex cursor-pointer items-center gap-2 font-medium">
                        <Checkbox
                          checked={allUnbilledChecked}
                          onCheckedChange={(checked) =>
                            setSelectedDeliveryIds(
                              checked === true
                                ? unbilledDeliveries.map((d) => d.id)
                                : [],
                            )
                          }
                          aria-label="Pilih semua Surat Jalan"
                        />
                        <span>
                          Pilih Semua ({selectedDeliveryIds.length}/
                          {unbilledDeliveries.length} DO)
                        </span>
                      </label>
                      <span className="type-p2 font-bold tabular-nums text-primary">
                        Total:{" "}
                        {formatMaterialVolume(
                          selectedTotalQty,
                          selectedBillingContract?.unit ?? "RIT",
                        )}{" "}
                        · {currency(selectedGrandTotal)}
                      </span>
                    </div>

                    <div className="space-y-2.5 md:hidden">
                      {unbilledDeliveries.map((delivery) => (
                        <BillingDeliveryMobileCard
                          key={delivery.id}
                          delivery={delivery}
                          checked={selectedDeliveryIds.includes(delivery.id)}
                          onToggle={(checked) => {
                            setSelectedDeliveryIds((prev) =>
                              checked
                                ? [...new Set([...prev, delivery.id])]
                                : prev.filter((id) => id !== delivery.id),
                            );
                          }}
                          onPreviewProof={(d) =>
                            setProofPreview({
                              title: `Surat Jalan ${d.doNumber}`,
                              url: d.proofUrl!,
                            })
                          }
                        />
                      ))}
                    </div>

                    <div className="hidden md:block">
                      <Table itemLabel="surat jalan unbilled">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={allUnbilledChecked}
                                onCheckedChange={(checked) =>
                                  setSelectedDeliveryIds(
                                    checked === true
                                      ? unbilledDeliveries.map((d) => d.id)
                                      : [],
                                  )
                                }
                                aria-label="Pilih semua Surat Jalan"
                              />
                            </TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>No. DO &amp; Truk</TableHead>
                            <TableHead>No. Tiket</TableHead>
                            <TableHead>Proyek Lokasi</TableHead>
                            <TableHead className="text-right">Volume</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead className="text-right">Bukti</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unbilledDeliveries.map((delivery) => {
                            const checked = selectedDeliveryIds.includes(
                              delivery.id,
                            );
                            return (
                              <TableRow
                                key={delivery.id}
                                data-state={checked ? "selected" : undefined}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(val) => {
                                      setSelectedDeliveryIds((prev) =>
                                        val === true
                                          ? [...new Set([...prev, delivery.id])]
                                          : prev.filter(
                                              (id) => id !== delivery.id,
                                            ),
                                      );
                                    }}
                                    aria-label={`Pilih DO ${delivery.doNumber}`}
                                  />
                                </TableCell>
                                <TableCell className="type-p2 tabular-nums">
                                  {delivery.deliveryDate}
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                  <p className="type-p2 font-bold text-foreground">
                                    {delivery.doNumber}
                                  </p>
                                  <p className="type-p3 text-muted-foreground">
                                    {delivery.vehiclePlate || "-"}
                                    {delivery.driverName
                                      ? ` · ${delivery.driverName}`
                                      : ""}
                                  </p>
                                </TableCell>
                                <TableCell>
                                  {delivery.ticketNumber ? (
                                    <Badge variant="outline">
                                      {delivery.ticketNumber}
                                    </Badge>
                                  ) : (
                                    <span className="type-p3 text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="type-p2 max-w-[220px] truncate">
                                  {delivery.projectName}
                                </TableCell>
                                <TableCell className="type-p2 text-right font-semibold tabular-nums">
                                  {formatMaterialVolume(
                                    delivery.quantityReceived,
                                    delivery.unit,
                                  )}
                                </TableCell>
                                <TableCell className="type-p2 text-right font-semibold tabular-nums">
                                  {currency(delivery.estimatedAmount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {delivery.proofUrl ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setProofPreview({
                                          title: `Surat Jalan ${delivery.doNumber}`,
                                          url: delivery.proofUrl!,
                                        })
                                      }
                                    >
                                      <Eye
                                        className="size-3.5"
                                        aria-hidden="true"
                                      />
                                      Foto
                                    </Button>
                                  ) : (
                                    <span className="type-p3 text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="bi-invoice-number"
                          className="type-p2 font-medium"
                        >
                          No. Tagihan (Opsional)
                        </Label>
                        <Input
                          id="bi-invoice-number"
                          placeholder="Kosongkan untuk auto-generate"
                          value={invoiceNumberInput}
                          onChange={(e) => setInvoiceNumberInput(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bi-due-date" className="type-p2 font-medium">
                          Jatuh Tempo (Opsional)
                        </Label>
                        <DatePicker
                          id="bi-due-date"
                          value={dueDateInput}
                          clearable
                          onValueChange={setDueDateInput}
                          placeholder="Pilih jatuh tempo"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="bi-notes" className="type-p2 font-medium">
                          Catatan Tagihan (Opsional)
                        </Label>
                        <Textarea
                          id="bi-notes"
                          rows={2}
                          placeholder="Keterangan verifikasi lapangan / rekening vendor..."
                          value={invoiceNotesInput}
                          onChange={(e) => setInvoiceNotesInput(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                        <div>
                          <p className="type-p3 text-muted-foreground">
                            {selectedDeliveryIds.length} Surat Jalan dipilih ·{" "}
                            {formatMaterialVolume(
                              selectedTotalQty,
                              selectedBillingContract?.unit ?? "RIT",
                            )}
                          </p>
                          <p className="type-kpi text-primary">
                            {currency(selectedGrandTotal)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="success"
                          disabled={
                            isPending || selectedDeliveryIds.length === 0
                          }
                          onClick={() => setBillingConfirmOpen(true)}
                        >
                          <Send className="size-4" aria-hidden="true" />
                          Kirim Tagihan
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {vendorInvoices.length > 0 && (
              <Card className="border-border/80 shadow-2xs">
                <CardHeader>
                  <CardTitle className="type-h3">
                    Riwayat Tagihan Terkirim
                  </CardTitle>
                  <CardDescription className="type-p2">
                    Daftar tagihan kontrak material yang sudah diteruskan ke Bagian Keuangan.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table itemLabel="tagihan vendor">
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Tagihan</TableHead>
                        <TableHead>Kontrak &amp; Vendor</TableHead>
                        <TableHead>Jumlah DO</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendorInvoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="type-p2 font-mono font-semibold">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <p className="type-p2 font-medium">
                              {inv.vendorName}
                            </p>
                            <p className="type-p3 text-muted-foreground">
                              {inv.contractNumber} · {inv.materialType}
                            </p>
                          </TableCell>
                          <TableCell className="type-p2">
                            {inv.deliveryCount} DO (
                            {formatMaterialVolume(inv.totalQuantity, inv.unit)})
                          </TableCell>
                          <TableCell className="type-p2 text-right font-bold tabular-nums">
                            {currency(inv.grandTotal)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                inv.status === "PAID"
                                  ? "lightSuccess"
                                  : inv.status === "PARTIAL"
                                    ? "lightInfo"
                                    : "lightWarning"
                              }
                            >
                              {inv.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Modals */}
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
        contractTickets={contractTickets}
        defaultContractId={selectedContractForDo}
        onSaved={() => {
          if (activeSubTab === "billing" && billingContractId) {
            void loadContractUnbilled(billingContractId);
          }
        }}
      />

      <MaterialDeliveryProofModal
        preview={proofPreview}
        onClose={() => setProofPreview(null)}
      />

      {/* Delete DO Confirmation */}
      <GlobalModal
        isOpen={deleteDeliveryTarget !== null}
        onClose={() => {
          if (!isPending) setDeleteDeliveryTarget(null);
        }}
        title="Hapus Surat Jalan?"
        description={
          deleteDeliveryTarget
            ? `Surat Jalan ${deleteDeliveryTarget.doNumber} (${formatMaterialVolume(deleteDeliveryTarget.quantityReceived, deleteDeliveryTarget.unit)}) akan dihapus.`
            : undefined
        }
        className="sm:max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setDeleteDeliveryTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={confirmDeleteDelivery}
            >
              {isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      >
        <p className="type-p2 text-muted-foreground">
          Hanya Surat Jalan berstatus UNBILLED yang dapat dihapus.
        </p>
      </GlobalModal>

      {/* Billing Confirmation */}
      <GlobalModal
        isOpen={billingConfirmOpen}
        onClose={() => {
          if (!isPending) setBillingConfirmOpen(false);
        }}
        title="Konfirmasi Kirim Tagihan"
        description="Tagihan akan dibuat dari Surat Jalan terpilih dan diteruskan ke Keuangan."
        className="sm:max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setBillingConfirmOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={isPending}
              onClick={handleConfirmCreateInvoice}
            >
              {isPending ? "Mengirim..." : "Kirim Tagihan"}
            </Button>
          </>
        }
      >
        {selectedBillingContract && (
          <dl className="type-p2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 p-3.5">
            <dt className="text-muted-foreground">Kontrak</dt>
            <dd className="text-right font-semibold">
              {selectedBillingContract.contractNumber}
            </dd>
            <dt className="text-muted-foreground">Vendor</dt>
            <dd className="text-right font-medium">
              {selectedBillingContract.vendorName}
            </dd>
            <dt className="text-muted-foreground">Jumlah DO</dt>
            <dd className="text-right font-medium">
              {selectedDeliveryIds.length} Surat Jalan
            </dd>
            <dt className="text-muted-foreground">Total Volume</dt>
            <dd className="text-right font-medium">
              {formatMaterialVolume(
                selectedTotalQty,
                selectedBillingContract.unit,
              )}
            </dd>
            <dt className="text-muted-foreground">Total Tagihan</dt>
            <dd className="text-right font-bold tabular-nums text-primary">
              {currency(selectedGrandTotal)}
            </dd>
          </dl>
        )}
      </GlobalModal>
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
      title="Buat Kontrak Material"
      description="Ikat harga per rit atau m3 dengan vendor untuk pengiriman bertahap."
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
  const [startDate, setStartDate] = useState(() => getJakartaDateKey());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const vendorOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "CUSTOM", label: "Input Vendor Manual" },
      ...vendors.map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
        description: vendor.category,
        keywords: [vendor.name, vendor.category],
      })),
    ],
    [vendors],
  );

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
      toast.error(
        "Nama vendor, jenis material, dan harga kontrak wajib diisi dengan benar.",
      );
      return;
    }

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
        if (result.success) {
          toast.success(result.message);
          onCreated();
          onClose();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Create contract failed:", error);
        toast.error("Gagal menyimpan kontrak material. Silakan coba lagi.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mc-catalog-vendor" className="type-p2 font-medium">
            Katalog Vendor
          </Label>
          <Combobox
            id="mc-catalog-vendor"
            options={vendorOptions}
            value={vendorSelection}
            onValueChange={handleVendorChange}
            placeholder="Pilih vendor..."
            searchPlaceholder="Cari nama vendor..."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mc-vendor-name" className="type-p2 font-medium">
            Nama Vendor <span className="text-destructive">*</span>
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
          <Label htmlFor="mc-number" className="type-p2 font-medium">
            Nomor Kontrak (Opsional)
          </Label>
          <Input
            id="mc-number"
            placeholder="Auto jika dikosongkan"
            value={contractNumber}
            onChange={(event) => setContractNumber(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mc-material" className="type-p2 font-medium">
            Jenis Material <span className="text-destructive">*</span>
          </Label>
          <Select value={materialType} onValueChange={setMaterialType}>
            <SelectTrigger id="mc-material" className="w-full">
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
          <Label htmlFor="mc-custom-material" className="type-p2 font-medium">
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
          <Label htmlFor="mc-unit" className="type-p2 font-medium">
            Satuan Hitung <span className="text-destructive">*</span>
          </Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger id="mc-unit" className="w-full">
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
          <Label htmlFor="mc-est-volume" className="type-p2 font-medium">
            Target Volume (Opsional)
          </Label>
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
        <Label htmlFor="mc-unit-price" className="type-p2 font-medium">
          Harga Kesepakatan per {unit}{" "}
          <span className="text-destructive">*</span>
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
          <Label htmlFor="mc-start-date" className="type-p2 font-medium">
            Tanggal Mulai <span className="text-destructive">*</span>
          </Label>
          <DatePicker
            id="mc-start-date"
            value={startDate}
            onValueChange={setStartDate}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mc-end-date" className="type-p2 font-medium">
            Tanggal Berakhir (Opsional)
          </Label>
          <DatePicker
            id="mc-end-date"
            value={endDate}
            minDate={startDate}
            clearable
            onValueChange={setEndDate}
            placeholder="Tanpa batas"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mc-notes" className="type-p2 font-medium">
          Catatan Syarat
        </Label>
        <Textarea
          id="mc-notes"
          rows={2}
          placeholder="Mis. Harga sudah termasuk ongkos kirim..."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

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
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Menyimpan...
            </>
          ) : (
            "Simpan Kontrak"
          )}
        </Button>
      </div>
    </form>
  );
}
