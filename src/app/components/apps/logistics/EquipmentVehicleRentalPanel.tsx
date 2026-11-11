"use client";

import {
  useState,
  useTransition,
  useMemo,
  useRef,
  useEffect,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  Clock,
  Coins,
  FileText,
  Filter,
  Flame,
  Info,
  Pencil,
  Plus,
  Trash2,
  Truck,
  UserCheck,
  Wrench,
  Search,
  CheckCircle2,
  CreditCard,
  Send,
  Building2,
  ExternalLink,
} from "lucide-react";
import {
  type RentalItemRow,
  type RentalPeriodType,
  type RentalType,
  type RentalStatus,
  saveRental,
  deleteRental,
  submitRentalBilling,
} from "@/app/actions/rentals";
import {
  STANDARD_EQUIPMENT_CATALOG,
  ALL_CATALOG_ITEMS,
} from "@/lib/equipment-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { NativeDataTable } from "@/components/ui/native-data-table";

type ProjectOption = { id: string; title: string; kelompokTani: string };
type VendorOption = {
  id: string;
  name: string;
  phone?: string | null;
  category?: string | null;
};

const periodTypeLabels: Record<RentalPeriodType, { label: string; unit: string; badgeClass: string }> = {
  DAILY: {
    label: "Sewa Harian",
    unit: "Hari",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
  },
  WEEKLY: {
    label: "Sewa Mingguan",
    unit: "Minggu",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
  },
  MONTHLY: {
    label: "Sewa Bulanan",
    unit: "Bulan",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
};

const statusLabels: Record<RentalStatus, { label: string; badgeClass: string }> = {
  ACTIVE: {
    label: "Sedang Berjalan",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  COMPLETED: {
    label: "Selesai",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
  EXTENDED: {
    label: "Diperpanjang",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
  },
  CANCELLED: {
    label: "Dibatalkan",
    badgeClass: "bg-rose-100 text-rose-700 border-rose-300",
  },
};

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function EquipmentVehicleRentalPanel({
  rentals = [],
  projects = [],
  vendors = [],
  canManage = true,
}: {
  rentals: RentalItemRow[];
  projects: ProjectOption[];
  vendors?: VendorOption[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RentalItemRow | null>(null);
  const [typeFilter, setTypeFilter] = useState<"ALL" | RentalType>("ALL");
  const [periodFilter, setPeriodFilter] = useState<"ALL" | RentalPeriodType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | RentalStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingTargetRental, setBillingTargetRental] = useState<RentalItemRow | null>(null);
  const [billingBankName, setBillingBankName] = useState("");
  const [billingAccountNumber, setBillingAccountNumber] = useState("");
  const [billingAccountName, setBillingAccountName] = useState("");
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const openBillingModal = (rental: RentalItemRow) => {
    setBillingTargetRental(rental);
    setBillingBankName(rental.paymentBankName ?? "");
    setBillingAccountNumber(rental.paymentAccountNumber ?? "");
    setBillingAccountName(rental.paymentAccountName ?? "");
    setBillingMessage(null);
    setBillingModalOpen(true);
  };

  const handleConfirmBilling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingTargetRental) return;
    setBillingMessage(null);
    startTransition(async () => {
      const res = await submitRentalBilling(billingTargetRental.id, {
        paymentBankName: billingBankName.trim() || undefined,
        paymentAccountNumber: billingAccountNumber.trim() || undefined,
        paymentAccountName: billingAccountName.trim() || undefined,
      });
      if (res.success) {
        setBillingModalOpen(false);
        router.refresh();
      } else {
        setBillingMessage(res.message);
      }
    });
  };

  // Form states
  const [formType, setFormType] = useState<RentalType>("EQUIPMENT");
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formCodeOrPlate, setFormCodeOrPlate] = useState("");
  const [formVendorName, setFormVendorName] = useState("");
  const [formVendorPhone, setFormVendorPhone] = useState("");
  const [formPeriodType, setFormPeriodType] = useState<RentalPeriodType>("MONTHLY");
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [formEndDate, setFormEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [formDuration, setFormDuration] = useState("1");
  const [formRate, setFormRate] = useState("0");
  const [formAdditionalCost, setFormAdditionalCost] = useState("0");
  const [formTotalCost, setFormTotalCost] = useState("0");
  const [formProjectId, setFormProjectId] = useState("");
  const [formStatus, setFormStatus] = useState<RentalStatus>("ACTIVE");
  const [formWithOperator, setFormWithOperator] = useState(false);
  const [formOperatorName, setFormOperatorName] = useState("");
  const [formWithFuel, setFormWithFuel] = useState(false);
  const [formNotes, setFormNotes] = useState("");
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const vendorComboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        vendorComboboxRef.current &&
        !vendorComboboxRef.current.contains(event.target as Node)
      ) {
        setVendorDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredVendors = useMemo(() => {
    if (!formVendorName.trim()) return vendors;
    const query = formVendorName.toLowerCase();
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        (v.category && v.category.toLowerCase().includes(query)),
    );
  }, [vendors, formVendorName]);

  const selectVendor = (v: VendorOption) => {
    setFormVendorName(v.name);
    if (v.phone) {
      setFormVendorPhone(v.phone);
    }
    setVendorDropdownOpen(false);
  };

  // Recalculate duration and total cost based on dates & period
  const handleDatesChange = (startStr: string, endStr: string, periodType: RentalPeriodType) => {
    setFormStartDate(startStr);
    setFormEndDate(endStr);
    if (!startStr || !endStr) return;

    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return;

    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    let calculatedDuration = 1;
    if (periodType === "DAILY") {
      calculatedDuration = diffDays;
    } else if (periodType === "WEEKLY") {
      calculatedDuration = Math.max(1, Math.round(diffDays / 7));
    } else if (periodType === "MONTHLY") {
      calculatedDuration = Math.max(1, Math.round(diffDays / 30));
    }

    setFormDuration(String(calculatedDuration));
    const rateNum = parseFloat(formRate) || 0;
    const addNum = parseFloat(formAdditionalCost) || 0;
    setFormTotalCost(String(rateNum * calculatedDuration + addNum));
  };

  const handlePeriodTypeChange = (newPeriod: RentalPeriodType) => {
    setFormPeriodType(newPeriod);
    const start = new Date(formStartDate);
    let endDays = 1;
    if (newPeriod === "DAILY") endDays = 1;
    else if (newPeriod === "WEEKLY") endDays = 7;
    else if (newPeriod === "MONTHLY") endDays = 30;

    const newEnd = new Date(start.getTime() + (endDays - 1) * 24 * 60 * 60 * 1000);
    const endStr = newEnd.toISOString().slice(0, 10);
    handleDatesChange(formStartDate, endStr, newPeriod);
  };

  const handleRateOrAddChange = (rateStr: string, addStr: string, durStr: string) => {
    const rateNum = parseFloat(rateStr) || 0;
    const addNum = parseFloat(addStr) || 0;
    const durNum = parseFloat(durStr) || 1;
    setFormRate(rateStr);
    setFormAdditionalCost(addStr);
    setFormDuration(durStr);
    setFormTotalCost(String(rateNum * durNum + addNum));
  };

  const openCreateModal = (type: RentalType = "EQUIPMENT") => {
    setEditingItem(null);
    setFormType(type);
    setFormName("");
    setFormCategory(type === "EQUIPMENT" ? "Alat Berat" : "Kendaraan Angkutan");
    setFormCodeOrPlate("");
    setFormVendorName("");
    setFormVendorPhone("");
    setFormPeriodType("MONTHLY");
    const todayStr = new Date().toISOString().slice(0, 10);
    const endStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setFormStartDate(todayStr);
    setFormEndDate(endStr);
    setFormDuration("1");
    setFormRate("0");
    setFormAdditionalCost("0");
    setFormTotalCost("0");
    setFormProjectId(projects[0]?.id ?? "");
    setFormStatus("ACTIVE");
    setFormWithOperator(false);
    setFormOperatorName("");
    setFormWithFuel(false);
    setFormNotes("");
    setVendorDropdownOpen(false);
    setActionMessage(null);
    setModalOpen(true);
  };

  const openEditModal = (item: RentalItemRow) => {
    setEditingItem(item);
    setFormType(item.type);
    setFormName(item.name);
    setFormCategory(item.category ?? "");
    setFormCodeOrPlate(item.codeOrPlate ?? "");
    setFormVendorName(item.vendorName);
    setFormVendorPhone(item.vendorPhone ?? "");
    setFormPeriodType(item.rentalPeriodType);
    setFormStartDate(item.startDate);
    setFormEndDate(item.endDate);
    setFormDuration(String(item.duration));
    setFormRate(item.ratePerPeriod);
    setFormAdditionalCost(item.additionalCost);
    setFormTotalCost(item.totalCost);
    setFormProjectId(item.projectId ?? "");
    setFormStatus(item.status);
    setFormWithOperator(item.withOperator);
    setFormOperatorName(item.operatorName ?? "");
    setFormWithFuel(item.withFuel);
    setFormNotes(item.notes ?? "");
    setVendorDropdownOpen(false);
    setActionMessage(null);
    setModalOpen(true);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionMessage(null);

    const payload = {
      id: editingItem?.id,
      type: formType,
      name: formName,
      category: formCategory || null,
      codeOrPlate: formCodeOrPlate || null,
      vendorName: formVendorName,
      vendorPhone: formVendorPhone || null,
      rentalPeriodType: formPeriodType,
      startDate: formStartDate,
      endDate: formEndDate,
      duration: parseFloat(formDuration) || 1,
      ratePerPeriod: parseFloat(formRate) || 0,
      additionalCost: parseFloat(formAdditionalCost) || 0,
      totalCost: parseFloat(formTotalCost) || 0,
      status: formStatus,
      withOperator: formWithOperator,
      operatorName: formWithOperator ? formOperatorName : null,
      withFuel: formWithFuel,
      projectId: formProjectId || null,
      notes: formNotes || null,
    };

    startTransition(async () => {
      const res = await saveRental(payload);
      if (res.success) {
        setModalOpen(false);
        router.refresh();
      } else {
        setActionMessage({ text: res.message, error: true });
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Hapus catatan sewa "${name}"?`)) return;
    startTransition(async () => {
      const res = await deleteRental(id);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.message);
      }
    });
  };

  // Filtered rentals
  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
      if (periodFilter !== "ALL" && r.rentalPeriodType !== periodFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(query);
        const matchesVendor = r.vendorName.toLowerCase().includes(query);
        const matchesPlate = (r.codeOrPlate ?? "").toLowerCase().includes(query);
        const matchesProject = (r.projectName ?? "").toLowerCase().includes(query);
        if (!matchesName && !matchesVendor && !matchesPlate && !matchesProject) return false;
      }
      return true;
    });
  }, [rentals, typeFilter, periodFilter, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalEquipment = rentals.filter((r) => r.type === "EQUIPMENT").length;
    const totalVehicle = rentals.filter((r) => r.type === "VEHICLE").length;
    const activeRentals = rentals.filter((r) => r.status === "ACTIVE").length;
    const totalCostAll = rentals.reduce((sum, r) => sum + (parseFloat(r.totalCost) || 0), 0);
    return { totalEquipment, totalVehicle, activeRentals, totalCostAll };
  }, [rentals]);

  return (
    <div className="space-y-6">
      {/* Header and Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sewa Alat Berat / Ringan
            </CardTitle>
            <Wrench className="size-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEquipment} Unit</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Excavator, Bulldozer, Molen, Genset, dll
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sewa Kendaraan & Armada
            </CardTitle>
            <Truck className="size-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVehicle} Unit</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Dump Truck, Pick Up, Truk Operasional
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unit Sewa Aktif
            </CardTitle>
            <Clock className="size-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats.activeRentals} Sedang Berjalan</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Unit sewa yang saat ini bertugas di lapangan
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Komitmen Biaya Sewa
            </CardTitle>
            <Coins className="size-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-primary truncate" title={formatCurrency(stats.totalCostAll)}>
              {formatCurrency(stats.totalCostAll)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Akumulasi biaya seluruh unit sewa
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Card */}
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <span>Pencatatan Sewa Alat & Kendaraan</span>
                <Badge variant="outline" className="text-xs">
                  {filteredRentals.length} Catatan
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Catat tanggal mulai/selesai sewa, biaya harian, mingguan, maupun bulanan untuk alat dan kendaraan proyek.
              </CardDescription>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => openCreateModal("EQUIPMENT")}
                  className="h-9 px-3.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold gap-1.5 shadow-sm rounded-lg"
                  size="sm"
                >
                  <Plus className="size-4" />
                  + Sewa Alat
                </Button>
                <Button
                  onClick={() => openCreateModal("VEHICLE")}
                  className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-1.5 shadow-sm rounded-lg"
                  size="sm"
                >
                  <Plus className="size-4" />
                  + Sewa Kendaraan
                </Button>
              </div>
            )}
          </div>

          {/* Filter Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-2 border-t">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari unit, vendor, nopol, proyek..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Type Filter */}
            <div className="flex h-9 items-center rounded-lg border bg-background/80 p-1 text-xs">
              <span className="px-2 text-muted-foreground flex items-center gap-1 font-medium whitespace-nowrap">
                <Filter className="size-3.5" /> Kategori:
              </span>
              <button
                type="button"
                onClick={() => setTypeFilter("ALL")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  typeFilter === "ALL"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("EQUIPMENT")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  typeFilter === "EQUIPMENT"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                🚜 Alat
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("VEHICLE")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  typeFilter === "VEHICLE"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                🚚 Kendaraan
              </button>
            </div>

            {/* Period Filter */}
            <div className="flex h-9 items-center rounded-lg border bg-background/80 p-1 text-xs">
              <span className="px-2 text-muted-foreground font-medium whitespace-nowrap">Periode:</span>
              <button
                type="button"
                onClick={() => setPeriodFilter("ALL")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  periodFilter === "ALL"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter("DAILY")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  periodFilter === "DAILY"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Harian
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter("WEEKLY")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  periodFilter === "WEEKLY"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Mingguan
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter("MONTHLY")}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  periodFilter === "MONTHLY"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Bulanan
              </button>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | RentalStatus)}
              className="h-9 rounded-md border bg-background px-2.5 text-xs font-medium"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Sedang Berjalan</option>
              <option value="COMPLETED">Selesai</option>
              <option value="EXTENDED">Diperpanjang</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <NativeDataTable itemLabel="data sewa">
            <table className="app-data-table w-full min-w-[850px] text-sm">
              <thead className="bg-[#102A4D] text-left text-white text-xs">
                <tr>
                  <th className="p-3">Unit Sewa</th>
                  <th className="p-3">Vendor / Pemilik</th>
                  <th className="p-3">Periode & Durasi</th>
                  <th className="p-3">Tanggal Sewa</th>
                  <th className="p-3 text-right">Biaya / Tarif</th>
                  <th className="p-3 text-right">Total Biaya</th>
                  <th className="p-3">Status Sewa</th>
                  <th className="p-3">Tagihan Keuangan</th>
                  <th className="p-3">Proyek</th>
                  {canManage && <th className="p-3 text-center w-24">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {filteredRentals.map((r) => {
                  const periodMeta = periodTypeLabels[r.rentalPeriodType] ?? {
                    label: r.rentalPeriodType || "Sewa",
                    unit: "Hari",
                    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
                  };
                  const statusMeta = statusLabels[r.status] ?? {
                    label: r.status || "Aktif",
                    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
                  };
                  return (
                    <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                      {/* Unit Sewa */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {r.type === "EQUIPMENT" ? "🚜" : "🚚"}
                          </span>
                          <div>
                            <span className="font-semibold text-primary block text-sm">
                              {r.name}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                              {r.category && <span>{r.category}</span>}
                              {r.codeOrPlate && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
                                  {r.codeOrPlate}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="p-3">
                        <span className="font-medium text-foreground block">{r.vendorName}</span>
                        {r.vendorPhone && (
                          <span className="text-[11px] text-muted-foreground block">{r.vendorPhone}</span>
                        )}
                      </td>

                      {/* Periode & Durasi */}
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${periodMeta.badgeClass}`}>
                          {periodMeta.label}
                        </span>
                        <div className="mt-1 text-xs font-medium text-foreground">
                          {r.duration} {periodMeta.unit}
                        </div>
                      </td>

                      {/* Tanggal Sewa */}
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-xs text-foreground">
                          <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                          <span>
                            {new Date(r.startDate).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          s/d {new Date(r.endDate).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>

                      {/* Tarif */}
                      <td className="p-3 text-right">
                        <div className="font-medium text-foreground">
                          {formatCurrency(r.ratePerPeriod)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          per {periodMeta.unit.toLowerCase()}
                        </span>
                        {parseFloat(r.additionalCost) > 0 && (
                          <div className="text-[10px] text-amber-600 mt-0.5">
                            +Mob/Ops: {formatCurrency(r.additionalCost)}
                          </div>
                        )}
                      </td>

                      {/* Total Biaya */}
                      <td className="p-3 text-right">
                        <div className="font-bold text-sm text-primary">
                          {formatCurrency(r.totalCost)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-end gap-1">
                          {r.withOperator && (
                            <span className="inline-flex items-center text-blue-600" title={`Termasuk Operator: ${r.operatorName || "Ya"}`}>
                              <UserCheck className="size-3" /> Supir
                            </span>
                          )}
                          {r.withFuel && (
                            <span className="inline-flex items-center text-amber-600" title="Termasuk BBM">
                              <Flame className="size-3" /> BBM
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                      </td>

                      {/* Tagihan Keuangan */}
                      <td className="p-3">
                        {r.paymentStatus === "PAID" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                              <CheckCircle2 className="size-3" /> Lunas
                            </span>
                            {r.paidAt && (
                              <span className="block text-[10px] text-muted-foreground">
                                {new Date(r.paidAt).toLocaleDateString("id-ID")}
                              </span>
                            )}
                            {r.proofOfPaymentUrl && (
                              <a
                                href={r.proofOfPaymentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                              >
                                <ExternalLink className="size-3" /> Bukti Bayar
                              </a>
                            )}
                          </div>
                        ) : r.paymentStatus === "PENDING_PAYMENT" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                              <Clock className="size-3" /> Menunggu Keuangan
                            </span>
                            {r.billingSubmittedAt && (
                              <span className="block text-[10px] text-muted-foreground">
                                Diajukan {new Date(r.billingSubmittedAt).toLocaleDateString("id-ID")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border">
                              Belum Diajukan
                            </span>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => openBillingModal(r)}
                                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                              >
                                <Send className="size-3" /> Ajukan Tagihan
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Proyek */}
                      <td className="p-3">
                        <span className="font-medium text-xs text-foreground block max-w-[200px] truncate" title={r.projectName ?? "-"}>
                          {r.projectName ?? "Tanpa proyek"}
                        </span>
                        {r.notes && (
                          <span className="text-[11px] text-muted-foreground block max-w-[200px] truncate mt-0.5" title={r.notes}>
                            {r.notes}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <ActionIconButton
                              type="button"
                              label="Edit sewa"
                              tooltip="Edit sewa"
                              icon={Pencil}
                              onClick={() => openEditModal(r)}
                              className="size-7"
                            />
                            <ActionIconButton
                              type="button"
                              label="Hapus sewa"
                              tooltip="Hapus sewa"
                              icon={Trash2}
                              onClick={() => handleDelete(r.id, r.name)}
                              className="size-7 text-rose-500 hover:text-rose-700"
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {filteredRentals.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 10 : 9} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <FileText className="size-10 text-muted-foreground/40 mb-2" />
                        <p className="font-semibold text-sm">Belum ada data sewa alat / kendaraan</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                          Klik tombol &quot;+ Sewa Alat&quot; atau &quot;+ Sewa Kendaraan&quot; untuk mulai mencatat tanggal dan rincian biaya sewa.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </NativeDataTable>
        </CardContent>
      </Card>

      {/* Modal Dialog Form */}
      <GlobalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingItem
            ? `Edit Sewa ${formType === "EQUIPMENT" ? "Alat" : "Kendaraan"}: ${editingItem.name}`
            : `Catat ${formType === "EQUIPMENT" ? "Sewa Alat Berat & Ringan" : "Sewa Kendaraan & Armada"}`
        }
        description="Pencatatan rincian sewa, tanggal mulai/selesai, periode (harian, mingguan, bulanan), dan rincian biaya."
        className="sm:max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {actionMessage && (
            <div
              className={`p-3 rounded-lg text-xs font-medium ${
                actionMessage.error ? "bg-rose-50 text-rose-800 border border-rose-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {/* Toggle Type & Period */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">
                Tipe Sewa *
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormType("EQUIPMENT");
                    if (!formCategory) setFormCategory("Alat Berat");
                  }}
                  className={`h-10 w-full flex items-center justify-center gap-1.5 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${
                    formType === "EQUIPMENT"
                      ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/40 shadow-sm"
                      : "border-border/80 bg-background/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Wrench className="size-3.5 shrink-0 text-amber-500" />
                  <span>Sewa Alat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormType("VEHICLE");
                    if (!formCategory) setFormCategory("Kendaraan Angkutan");
                  }}
                  className={`h-10 w-full flex items-center justify-center gap-1.5 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${
                    formType === "VEHICLE"
                      ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40 shadow-sm"
                      : "border-border/80 bg-background/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Truck className="size-3.5 shrink-0 text-blue-500" />
                  <span>Sewa Kendaraan</span>
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">
                Tipe Periode Sewa *
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handlePeriodTypeChange("DAILY")}
                  className={`h-10 w-full flex items-center justify-center px-2 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${
                    formPeriodType === "DAILY"
                      ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40 shadow-sm"
                      : "border-border/80 bg-background/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  Harian
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodTypeChange("WEEKLY")}
                  className={`h-10 w-full flex items-center justify-center px-2 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${
                    formPeriodType === "WEEKLY"
                      ? "border-purple-500 bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/40 shadow-sm"
                      : "border-border/80 bg-background/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  Mingguan
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodTypeChange("MONTHLY")}
                  className={`h-10 w-full flex items-center justify-center px-2 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${
                    formPeriodType === "MONTHLY"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/40 shadow-sm"
                      : "border-border/80 bg-background/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  Bulanan
                </button>
              </div>
            </div>
          </div>

          {/* Unit Details & Catalog Quick Selection */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Nama {formType === "EQUIPMENT" ? "Alat" : "Kendaraan"} *
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Pilih cepat katalog atau ketik bebas
                </span>
              </div>
              <select
                className="h-8 w-full rounded-md border border-dashed border-primary/50 bg-primary/5 px-2.5 text-xs font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
                defaultValue=""
                onChange={(e) => {
                  const selectedId = e.target.value;
                  if (!selectedId) return;
                  const found = ALL_CATALOG_ITEMS.find((item) => item.id === selectedId);
                  if (found) {
                    setFormName(found.name);
                    setFormCategory(found.category);
                    setFormType(found.type);
                  }
                  e.target.value = "";
                }}
              >
                <option value="">⚡ Pilih Cepat dari 6 Kategori Katalog Standar...</option>
                {STANDARD_EQUIPMENT_CATALOG.map((group) => (
                  <optgroup key={group.categoryNumber} label={`${group.categoryNumber}. ${group.categoryName}`}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.description ? `— ${item.description}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Input
                placeholder={
                  formType === "EQUIPMENT"
                    ? "contoh: Excavator Komatsu PC200"
                    : "contoh: Dump Truck Hino 500 FM 260 JD"
                }
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">
                {formType === "EQUIPMENT" ? "No. Seri / Kode" : "No. Polisi (Plat)"}
              </Label>
              <Input
                placeholder={formType === "EQUIPMENT" ? "cth: EX-01" : "cth: BL 8234 AB"}
                value={formCodeOrPlate}
                onChange={(e) => setFormCodeOrPlate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Vendor & Category */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">Kategori Unit</Label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-xs font-medium text-foreground"
              >
                <option value="">Pilih Kategori...</option>
                <option value="Alat Gali & Pemuat">1. Alat Gali & Pemuat</option>
                <option value="Alat Pemadat">2. Alat Pemadat Tanah & Aspal</option>
                <option value="Kendaraan Pengangkut">3. Kendaraan Pengangkut & Logistik</option>
                <option value="Alat Pengecoran Beton">4. Alat Pengecoran & Beton</option>
                <option value="Alat Angkat">5. Alat Angkat (Crane/Forklift)</option>
                <option value="Daya & Utilitas">6. Daya & Utilitas Lapangan</option>
                {formCategory &&
                  ![
                    "Alat Gali & Pemuat",
                    "Alat Pemadat",
                    "Kendaraan Pengangkut",
                    "Alat Pengecoran Beton",
                    "Alat Angkat",
                    "Daya & Utilitas",
                  ].includes(formCategory) && (
                    <option value={formCategory}>{formCategory}</option>
                  )}
              </select>
            </div>
            <div className="relative" ref={vendorComboboxRef}>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">Vendor / Pemilik Sewa *</Label>
              <div className="relative">
                <Input
                  placeholder="Cari atau ketik nama vendor..."
                  value={formVendorName}
                  onChange={(e) => {
                    setFormVendorName(e.target.value);
                    setVendorDropdownOpen(true);
                  }}
                  onFocus={() => setVendorDropdownOpen(true)}
                  required
                  autoComplete="off"
                  className="h-9 text-xs pr-8"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setVendorDropdownOpen((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors"
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform duration-200 ${
                      vendorDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {vendorDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl z-50 divide-y divide-border/40">
                  {filteredVendors.length > 0 ? (
                    filteredVendors.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectVendor(v);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold block truncate">
                            {v.name}
                          </span>
                          {v.phone && (
                            <span className="text-[10px] text-muted-foreground block truncate">
                              📞 {v.phone}
                            </span>
                          )}
                        </div>
                        {v.category && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium text-muted-foreground border">
                            {v.category}
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      <p>Tidak ada di katalog vendor.</p>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setVendorDropdownOpen(false);
                        }}
                        className="mt-1 font-semibold text-primary underline text-xs"
                      >
                        Gunakan &quot;{formVendorName}&quot; (Ketik Bebas)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">Kontak Vendor (HP)</Label>
              <Input
                placeholder="08123456789"
                value={formVendorPhone}
                onChange={(e) => setFormVendorPhone(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Project & Status */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">Proyek yang Menggunakan</Label>
              <select
                value={formProjectId}
                onChange={(e) => setFormProjectId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-xs"
              >
                <option value="">— Tidak terikat proyek spesifik —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kelompokTani} · {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">Status Sewa</Label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as RentalStatus)}
                className="h-9 w-full rounded-md border bg-background px-3 text-xs font-medium"
              >
                <option value="ACTIVE">Sedang Berjalan (Aktif)</option>
                <option value="COMPLETED">Selesai</option>
                <option value="EXTENDED">Diperpanjang</option>
                <option value="CANCELLED">Dibatalkan</option>
              </select>
            </div>
          </div>

          {/* Date & Duration Tracking */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span className="text-xs font-bold text-primary">Periode &amp; Jadwal Sewa</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">Tanggal Mulai Sewa *</Label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => handleDatesChange(e.target.value, formEndDate, formPeriodType)}
                  required
                  className="h-9 text-xs bg-background"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">Tanggal Selesai Sewa *</Label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => handleDatesChange(formStartDate, e.target.value, formPeriodType)}
                  required
                  className="h-9 text-xs bg-background"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">
                  Durasi ({periodTypeLabels[formPeriodType].unit}) *
                </Label>
                <Input
                  type="number"
                  min="0.1"
                  step="any"
                  value={formDuration}
                  onChange={(e) => handleRateOrAddChange(formRate, formAdditionalCost, e.target.value)}
                  required
                  className="h-9 text-xs bg-background font-semibold text-center"
                />
              </div>
            </div>
          </div>

          {/* Cost & Rates */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-emerald-600" />
              <span className="text-xs font-bold text-primary">Rincian Biaya Sewa</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">
                  Tarif Sewa per {periodTypeLabels[formPeriodType].unit} (Rp) *
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={formRate}
                  onChange={(e) => handleRateOrAddChange(e.target.value, formAdditionalCost, formDuration)}
                  required
                  className="h-9 text-xs bg-background font-medium"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {formatCurrency(formRate)} / {periodTypeLabels[formPeriodType].unit.toLowerCase()}
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground block mb-1.5">Biaya Tambahan / Mobilisasi (Rp)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={formAdditionalCost}
                  onChange={(e) => handleRateOrAddChange(formRate, e.target.value, formDuration)}
                  className="h-9 text-xs bg-background"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {formatCurrency(formAdditionalCost)}
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold text-primary block mb-1.5">Total Biaya Sewa (Rp) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={formTotalCost}
                  onChange={(e) => setFormTotalCost(e.target.value)}
                  required
                  className="h-9 text-xs bg-background font-bold text-primary"
                />
                <span className="text-[11px] font-bold text-emerald-600 mt-0.5 block">
                  {formatCurrency(formTotalCost)}
                </span>
              </div>
            </div>
          </div>

          {/* Inclusions & Notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-2.5">
              <span className="text-xs font-semibold text-muted-foreground block">Fasilitas Termasuk</span>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formWithOperator}
                  onChange={(e) => setFormWithOperator(e.target.checked)}
                  className="rounded border-gray-300 size-4 text-primary"
                />
                <span>Termasuk Operator / Supir</span>
              </label>
              {formWithOperator && (
                <Input
                  placeholder="Nama Operator / Supir"
                  value={formOperatorName}
                  onChange={(e) => setFormOperatorName(e.target.value)}
                  className="h-8 text-xs"
                />
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formWithFuel}
                  onChange={(e) => setFormWithFuel(e.target.checked)}
                  className="rounded border-gray-300 size-4 text-primary"
                />
                <span>Termasuk BBM (Bahan Bakar Minyak)</span>
              </label>
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">Catatan / Keterangan Sewa</Label>
              <textarea
                placeholder="Catatan kondisi alat, perjanjian sewa, mobilisasi..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-background p-2 text-xs resize-none"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={isPending}
              className="h-9 px-4 text-xs font-semibold rounded-lg"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="h-9 px-5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              {isPending ? "Menyimpan..." : editingItem ? "Simpan Perubahan" : "Simpan Catatan Sewa"}
            </Button>
          </div>
        </form>
      </GlobalModal>

      {/* Modal Ajukan Tagihan ke Keuangan */}
      <GlobalModal
        isOpen={billingModalOpen}
        onClose={() => setBillingModalOpen(false)}
        title="Ajukan Tagihan Sewa ke Bagian Keuangan"
        description="Kirimkan tagihan sewa alat / kendaraan ke antrean pencairan Bagian Keuangan."
        className="sm:max-w-lg"
      >
        {billingTargetRental && (
          <form onSubmit={handleConfirmBilling} className="mt-4 space-y-4">
            {billingMessage && (
              <div className="p-3 rounded-lg text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200">
                {billingMessage}
              </div>
            )}

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Unit Sewa:</span>
                  <p className="text-sm font-bold text-primary">
                    {billingTargetRental.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vendor: <strong className="text-foreground">{billingTargetRental.vendorName}</strong>
                    {billingTargetRental.projectName && ` · ${billingTargetRental.projectName}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Total Tagihan:</span>
                  <div className="text-base font-bold text-emerald-600">
                    {formatCurrency(billingTargetRental.totalCost)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border p-3.5 bg-muted/20">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Building2 className="size-3.5" /> Konfirmasi Rekening Tujuan Transfer (Vendor)
              </span>
              <div className="space-y-2.5">
                <div>
                  <Label className="text-xs font-semibold text-foreground block mb-1">Nama Bank Vendor</Label>
                  <Input
                    placeholder="mis. BCA / Mandiri / BRI / BSI"
                    value={billingBankName}
                    onChange={(e) => setBillingBankName(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground block mb-1">Nomor Rekening</Label>
                  <Input
                    placeholder="Contoh: 1234567890"
                    value={billingAccountNumber}
                    onChange={(e) => setBillingAccountNumber(e.target.value)}
                    className="h-9 text-xs bg-background font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground block mb-1">Atas Nama Pemilik Rekening</Label>
                  <Input
                    placeholder="Nama pada buku rekening vendor"
                    value={billingAccountName}
                    onChange={(e) => setBillingAccountName(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBillingModalOpen(false)}
                disabled={isPending}
                className="h-9 px-4 text-xs font-semibold rounded-lg"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="h-9 px-5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
              >
                <Send className="size-3.5" />
                {isPending ? "Mengajukan..." : "Kirim Tagihan ke Keuangan"}
              </Button>
            </div>
          </form>
        )}
      </GlobalModal>
    </div>
  );
}
