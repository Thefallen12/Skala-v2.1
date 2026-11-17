"use client";

import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Home,
  Info,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteRental,
  getRentals,
  saveRental,
  submitRentalBilling,
  type RentalItemRow,
  type RentalPeriodType,
  type RentalStatus,
  type RentalType,
  type RentalUsageScope,
} from "@/app/actions/rentals";
import {
  ALL_CATALOG_ITEMS,
  getDefaultRentalPeriodType,
  getDefaultRentalUnit,
  getRentalCatalogGroups,
  getRentalCategoryOptions,
} from "@/lib/equipment-catalog";
import { getJakartaDateKey, shiftDateKey } from "@/lib/habit-date";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ProjectOption = { id: string; title: string; kelompokTani: string };
type VendorOption = {
  id: string;
  name: string;
  phone?: string | null;
  category?: string | null;
};

const periodTypeLabels: Record<
  RentalPeriodType,
  { label: string; unit: string; badgeVariant: "lightInfo" | "lightSecondary" | "lightSuccess" }
> = {
  DAILY: { label: "Harian", unit: "Hari", badgeVariant: "lightInfo" },
  WEEKLY: { label: "Mingguan", unit: "Minggu", badgeVariant: "lightSecondary" },
  MONTHLY: { label: "Bulanan", unit: "Bulan", badgeVariant: "lightSuccess" },
};

const statusLabels: Record<
  RentalStatus,
  { label: string; badgeVariant: "lightSuccess" | "gray" | "lightWarning" | "lightError" }
> = {
  ACTIVE: { label: "Berjalan", badgeVariant: "lightSuccess" },
  COMPLETED: { label: "Selesai", badgeVariant: "gray" },
  EXTENDED: { label: "Diperpanjang", badgeVariant: "lightWarning" },
  CANCELLED: { label: "Dibatalkan", badgeVariant: "lightError" },
};

const rentalTypeMeta: Record<
  RentalType,
  {
    label: string;
    shortLabel: string;
    badgeVariant: "lightWarning" | "lightInfo" | "lightSuccess";
  }
> = {
  EQUIPMENT: {
    label: "Sewa Alat",
    shortLabel: "Alat",
    badgeVariant: "lightWarning",
  },
  VEHICLE: {
    label: "Sewa Kendaraan",
    shortLabel: "Kendaraan",
    badgeVariant: "lightInfo",
  },
  HOUSE: {
    label: "Rumah Sewa",
    shortLabel: "Rumah Sewa",
    badgeVariant: "lightSuccess",
  },
};

function RentalTypeIcon({
  type,
  className = "size-4 shrink-0",
}: {
  type: RentalType;
  className?: string;
}) {
  if (type === "HOUSE") {
    return <Home className={`${className} text-emerald-600`} aria-hidden="true" />;
  }
  if (type === "VEHICLE") {
    return <Truck className={`${className} text-blue-600`} aria-hidden="true" />;
  }
  return <Wrench className={`${className} text-amber-600`} aria-hidden="true" />;
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) || 0 : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function RentalMobileCard({
  rental,
  canManage,
  onDetail,
  onBilling,
  onEdit,
  onDelete,
}: {
  rental: RentalItemRow;
  canManage: boolean;
  onDetail: (rental: RentalItemRow) => void;
  onBilling: (rental: RentalItemRow) => void;
  onEdit: (rental: RentalItemRow) => void;
  onDelete: (rental: RentalItemRow) => void;
}) {
  const periodMeta = periodTypeLabels[rental.rentalPeriodType] ?? periodTypeLabels.DAILY;
  const unitText = getDefaultRentalUnit(rental.type, rental.rentalPeriodType);
  const statusMeta = statusLabels[rental.status] ?? statusLabels.ACTIVE;
  const typeMeta = rentalTypeMeta[rental.type] ?? rentalTypeMeta.EQUIPMENT;
  const ownerName = rental.landlordName || rental.vendorName;
  const isOperational =
    rental.type !== "HOUSE" &&
    (rental.usageScope === "OPERATIONAL" || !rental.projectId);

  return (
    <div className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <RentalTypeIcon type={rental.type} />
          </span>
          <div className="min-w-0">
            <p className="type-p1 font-semibold text-foreground break-words">
              {rental.name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={typeMeta.badgeVariant}>{typeMeta.shortLabel}</Badge>
              <span className="type-p3 text-muted-foreground break-words">
                {ownerName}
                {rental.codeOrPlate ? ` · ${rental.codeOrPlate}` : ""}
              </span>
            </div>
            {rental.type === "HOUSE" && rental.propertyAddress ? (
              <p className="type-p3 mt-1 flex items-start gap-1 text-muted-foreground break-words">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{rental.propertyAddress}</span>
              </p>
            ) : null}
          </div>
        </div>
        <Badge variant={statusMeta.badgeVariant} className="shrink-0">
          {statusMeta.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
        <div className="min-w-0">
          <span className="type-p3 text-muted-foreground">Durasi</span>
          <p className="type-p2 font-medium text-foreground">
            {rental.duration} {unitText} ({periodMeta.label})
          </p>
          <p className="type-p3 text-muted-foreground">
            {new Date(rental.startDate).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
            })}{" "}
            -{" "}
            {new Date(rental.endDate).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
            })}
          </p>
          {rental.type === "HOUSE" && rental.occupantCount ? (
            <p className="type-p3 mt-0.5 inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <Users className="size-3.5" aria-hidden="true" />
              {rental.occupantCount} Tukang
            </p>
          ) : null}
        </div>
        <div className="min-w-0 text-right">
          <span className="type-p3 text-muted-foreground">Total Biaya</span>
          <p className="type-p1 font-mono font-bold tabular-nums text-primary">
            {formatCurrency(rental.totalCost)}
          </p>
          <p className="type-p3 truncate text-muted-foreground">
            {isOperational
              ? "Operasional Umum"
              : (rental.projectName ?? "Tanpa proyek")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div>
          {rental.paymentStatus === "PAID" ? (
            <Badge variant="lightSuccess" className="gap-1">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Lunas
            </Badge>
          ) : rental.paymentStatus === "PENDING_PAYMENT" ? (
            <Badge variant="lightWarning" className="gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              Menunggu Finance
            </Badge>
          ) : canManage && rental.status !== "CANCELLED" ? (
            <Button
              type="button"
              size="sm"
              variant="outlinesuccess"
              onClick={() => onBilling(rental)}
            >
              <Send className="size-3.5" aria-hidden="true" />
              Tagih Finance
            </Button>
          ) : (
            <Badge variant="gray">Belum Diajukan</Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDetail(rental)}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            Detail
          </Button>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={`Opsi sewa ${rental.name}`}
                  className="size-8"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(rental)}>
                  <Pencil aria-hidden="true" />
                  Edit Sewa
                </DropdownMenuItem>
                {rental.paymentStatus !== "PAID" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDelete(rental)}
                    >
                      <Trash2 aria-hidden="true" />
                      Hapus
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
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
  const [hydratedBundle, setHydratedBundle] = useState<{
    source: RentalItemRow[];
    rows: RentalItemRow[];
  } | null>(null);
  const rentalRows =
    hydratedBundle?.source === rentals ? hydratedBundle.rows : rentals;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RentalItemRow | null>(null);
  const [detailRental, setDetailRental] = useState<RentalItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentalItemRow | null>(null);

  const [typeFilter, setTypeFilter] = useState<"ALL" | RentalType>("ALL");
  const [periodFilter, setPeriodFilter] = useState<"ALL" | RentalPeriodType>(
    "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<"ALL" | RentalStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Billing Modal states
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingTargetRental, setBillingTargetRental] =
    useState<RentalItemRow | null>(null);
  const [billingBankName, setBillingBankName] = useState("");
  const [billingAccountNumber, setBillingAccountNumber] = useState("");
  const [billingAccountName, setBillingAccountName] = useState("");

  const refreshRentals = async () => {
    const fresh = await getRentals().catch(() => null);
    if (fresh) {
      setHydratedBundle({ source: rentals, rows: fresh });
    }
    router.refresh();
  };

  const openBillingModal = (rental: RentalItemRow) => {
    setBillingTargetRental(rental);
    setBillingBankName(rental.paymentBankName ?? "");
    setBillingAccountNumber(rental.paymentAccountNumber ?? "");
    setBillingAccountName(rental.paymentAccountName ?? "");
    setBillingModalOpen(true);
  };

  const handleConfirmBilling = (event: FormEvent) => {
    event.preventDefault();
    if (!billingTargetRental) return;
    startTransition(async () => {
      try {
        const res = await submitRentalBilling(billingTargetRental.id, {
          paymentBankName: billingBankName.trim() || undefined,
          paymentAccountNumber: billingAccountNumber.trim() || undefined,
          paymentAccountName: billingAccountName.trim() || undefined,
        });
        if (res.success) {
          toast.success(res.message);
          setBillingModalOpen(false);
          requestNotificationFeedRefresh();
          await refreshRentals();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Rental billing submission failed:", error);
        toast.error("Gagal mengirim tagihan sewa ke Keuangan.");
      }
    });
  };

  // Form states
  const [formType, setFormType] = useState<RentalType>("EQUIPMENT");
  const [formUsageScope, setFormUsageScope] =
    useState<RentalUsageScope>("PROJECT");
  const [formCatalogId, setFormCatalogId] = useState("");
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formCodeOrPlate, setFormCodeOrPlate] = useState("");
  const [formSelectedVendorId, setFormSelectedVendorId] = useState("");
  const [formVendorName, setFormVendorName] = useState("");
  const [formVendorPhone, setFormVendorPhone] = useState("");
  const [formPropertyAddress, setFormPropertyAddress] = useState("");
  const [formOccupantCount, setFormOccupantCount] = useState("");
  const [formPeriodType, setFormPeriodType] =
    useState<RentalPeriodType>("MONTHLY");
  const [formStartDate, setFormStartDate] = useState(() => getJakartaDateKey());
  const [formEndDate, setFormEndDate] = useState(() =>
    shiftDateKey(getJakartaDateKey(), 29),
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

  const activeCatalogGroups = useMemo(
    () => getRentalCatalogGroups(formType),
    [formType],
  );
  const activeCategoryOptions = useMemo(
    () => getRentalCategoryOptions(formType),
    [formType],
  );

  const catalogComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      activeCatalogGroups.flatMap((group) =>
        group.items.map((item) => ({
          value: item.id,
          label: item.name,
          description: [group.categoryName, item.description]
            .filter(Boolean)
            .join(" · "),
          keywords: [
            group.categoryName,
            item.category,
            item.brand ?? "",
            item.description ?? "",
          ],
        })),
      ),
    [activeCatalogGroups],
  );

  const vendorComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      vendors.map((v) => ({
        value: v.id,
        label: v.name,
        description: [v.category, v.phone].filter(Boolean).join(" · ") || undefined,
        keywords: [v.name, v.category ?? "", v.phone ?? ""],
      })),
    [vendors],
  );

  const projectComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.kelompokTani} · ${p.title}`,
        keywords: [p.kelompokTani, p.title],
      })),
    [projects],
  );

  const handleDatesChange = (
    startStr: string,
    endStr: string,
    periodType: RentalPeriodType,
  ) => {
    setFormStartDate(startStr);
    setFormEndDate(endStr);
    if (!startStr || !endStr) return;

    const start = new Date(`${startStr}T00:00:00Z`);
    const end = new Date(`${endStr}T00:00:00Z`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return;
    }

    const diffDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    );
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
    const offsetDays =
      newPeriod === "DAILY" ? 0 : newPeriod === "WEEKLY" ? 6 : 29;
    const endStr = shiftDateKey(formStartDate || getJakartaDateKey(), offsetDays);
    handleDatesChange(formStartDate, endStr, newPeriod);
  };

  const handleRateOrAddChange = (
    rateStr: string,
    addStr: string,
    durStr: string,
  ) => {
    const rateNum = parseFloat(rateStr) || 0;
    const addNum = parseFloat(addStr) || 0;
    const durNum = parseFloat(durStr) || 1;
    setFormRate(rateStr);
    setFormAdditionalCost(addStr);
    setFormDuration(durStr);
    setFormTotalCost(String(rateNum * durNum + addNum));
  };

  const applyRentalTypeSwitch = (nextType: RentalType) => {
    setFormType(nextType);
    setFormCatalogId("");
    const defaultCategories: Record<RentalType, string> = {
      EQUIPMENT: "Alat Gali & Pemuat",
      VEHICLE: "Kendaraan Pengangkut",
      HOUSE: "Rumah Sewa Tukang",
    };
    const nextCategoryOptions = getRentalCategoryOptions(nextType);
    if (!nextCategoryOptions.includes(formCategory)) {
      setFormCategory(defaultCategories[nextType]);
    }
    if (nextType === "HOUSE") {
      setFormUsageScope("PROJECT");
      setFormWithOperator(false);
      setFormOperatorName("");
      setFormWithFuel(false);
      setFormCodeOrPlate("");
      if (formPeriodType === "DAILY") {
        handlePeriodTypeChange("MONTHLY");
      }
    }
  };

  const openCreateModal = (type: RentalType = "EQUIPMENT") => {
    const defaultPeriod = getDefaultRentalPeriodType(type);
    const endOffsetDays =
      defaultPeriod === "DAILY" ? 0 : defaultPeriod === "WEEKLY" ? 6 : 29;
    const todayStr = getJakartaDateKey();
    const endStr = shiftDateKey(todayStr, endOffsetDays);

    setEditingItem(null);
    setFormType(type);
    setFormUsageScope("PROJECT");
    setFormCatalogId("");
    setFormName("");
    setFormCategory(
      type === "HOUSE"
        ? "Rumah Sewa Tukang"
        : type === "VEHICLE"
          ? "Kendaraan Pengangkut"
          : "Alat Gali & Pemuat",
    );
    setFormCodeOrPlate("");
    setFormSelectedVendorId("");
    setFormVendorName("");
    setFormVendorPhone("");
    setFormPropertyAddress("");
    setFormOccupantCount("");
    setFormPeriodType(defaultPeriod);
    setFormStartDate(todayStr);
    setFormEndDate(endStr);
    setFormDuration("1");
    setFormRate("0");
    setFormAdditionalCost("0");
    setFormTotalCost("0");
    setFormProjectId(projects.length === 1 ? projects[0].id : "");
    setFormStatus("ACTIVE");
    setFormWithOperator(false);
    setFormOperatorName("");
    setFormWithFuel(false);
    setFormNotes("");
    setModalOpen(true);
  };

  const openEditModal = (item: RentalItemRow) => {
    const itemScope: RentalUsageScope =
      item.type === "HOUSE"
        ? "PROJECT"
        : item.usageScope === "OPERATIONAL" || !item.projectId
          ? "OPERATIONAL"
          : "PROJECT";

    setEditingItem(item);
    setFormType(item.type);
    setFormUsageScope(itemScope);
    setFormCatalogId("");
    setFormName(item.name);
    setFormCategory(item.category ?? "");
    setFormCodeOrPlate(item.codeOrPlate ?? "");
    setFormSelectedVendorId("");
    setFormVendorName(item.landlordName ?? item.vendorName);
    setFormVendorPhone(item.landlordPhone ?? item.vendorPhone ?? "");
    setFormPropertyAddress(item.propertyAddress ?? "");
    setFormOccupantCount(
      typeof item.occupantCount === "number" ? String(item.occupantCount) : "",
    );
    setFormPeriodType(item.rentalPeriodType);
    setFormStartDate(item.startDate);
    setFormEndDate(item.endDate);
    setFormDuration(String(item.duration));
    setFormRate(item.ratePerPeriod);
    setFormAdditionalCost(item.additionalCost);
    setFormTotalCost(item.totalCost);
    setFormProjectId(item.projectId ?? "");
    setFormStatus(item.status);
    setFormWithOperator(item.type === "HOUSE" ? false : item.withOperator);
    setFormOperatorName(
      item.type === "HOUSE" ? "" : (item.operatorName ?? ""),
    );
    setFormWithFuel(item.type === "HOUSE" ? false : item.withFuel);
    setFormNotes(item.notes ?? "");
    setModalOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (formType === "HOUSE" && !formProjectId.trim()) {
      toast.error("Rumah Sewa wajib dihubungkan ke Proyek aktif.");
      return;
    }

    if (
      formType !== "HOUSE" &&
      formUsageScope === "PROJECT" &&
      !formProjectId.trim()
    ) {
      toast.error(
        "Pilih Proyek tujuan untuk lingkup Proyek, atau ubah lingkup ke Operasional.",
      );
      return;
    }

    const effectiveScope: RentalUsageScope =
      formType === "HOUSE" ? "PROJECT" : formUsageScope;
    const isHouse = formType === "HOUSE";

    const payload = {
      id: editingItem?.id,
      type: formType,
      usageScope: effectiveScope,
      name: formName,
      category: formCategory || null,
      codeOrPlate: isHouse ? null : formCodeOrPlate || null,
      vendorName: formVendorName,
      vendorPhone: formVendorPhone || null,
      propertyAddress: isHouse ? formPropertyAddress || null : null,
      landlordName: isHouse ? formVendorName : null,
      landlordPhone: isHouse ? formVendorPhone || null : null,
      occupantCount:
        isHouse && formOccupantCount.trim()
          ? parseInt(formOccupantCount, 10) || null
          : null,
      rentalPeriodType: formPeriodType,
      startDate: formStartDate,
      endDate: formEndDate,
      duration: parseFloat(formDuration) || 1,
      ratePerPeriod: parseFloat(formRate) || 0,
      additionalCost: parseFloat(formAdditionalCost) || 0,
      totalCost: parseFloat(formTotalCost) || 0,
      status: formStatus,
      withOperator: isHouse ? false : formWithOperator,
      operatorName: !isHouse && formWithOperator ? formOperatorName : null,
      withFuel: isHouse ? false : formWithFuel,
      projectId: effectiveScope === "PROJECT" ? formProjectId || null : null,
      notes: formNotes || null,
    };

    startTransition(async () => {
      try {
        const res = await saveRental(payload);
        if (res.success) {
          toast.success(res.message);
          setModalOpen(false);
          await refreshRentals();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Save rental failed:", error);
        toast.error("Gagal menyimpan catatan sewa.");
      }
    });
  };

  const confirmDeleteRental = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        const res = await deleteRental(deleteTarget.id);
        if (res.success) {
          toast.success(res.message);
          setDeleteTarget(null);
          await refreshRentals();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Delete rental failed:", error);
        toast.error("Gagal menghapus catatan sewa.");
      }
    });
  };

  const filteredRentals = useMemo(() => {
    return rentalRows.filter((r) => {
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
      if (periodFilter !== "ALL" && r.rentalPeriodType !== periodFilter)
        return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matches =
          r.name.toLowerCase().includes(query) ||
          r.vendorName.toLowerCase().includes(query) ||
          (r.landlordName ?? "").toLowerCase().includes(query) ||
          (r.propertyAddress ?? "").toLowerCase().includes(query) ||
          (r.codeOrPlate ?? "").toLowerCase().includes(query) ||
          (r.projectName ?? "").toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [rentalRows, typeFilter, periodFilter, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const totalEquipment = rentalRows.filter((r) => r.type === "EQUIPMENT").length;
    const totalVehicle = rentalRows.filter((r) => r.type === "VEHICLE").length;
    const totalHouse = rentalRows.filter((r) => r.type === "HOUSE").length;
    const activeRentals = rentalRows.filter((r) => r.status === "ACTIVE").length;
    const totalCostAll = rentalRows.reduce(
      (sum, r) => sum + (parseFloat(r.totalCost) || 0),
      0,
    );
    return {
      totalEquipment,
      totalVehicle,
      totalHouse,
      activeRentals,
      totalCostAll,
    };
  }, [rentalRows]);

  const activeUnitLabel = getDefaultRentalUnit(formType, formPeriodType);

  return (
    <div className="space-y-6">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-medium text-muted-foreground">
              Sewa Alat
            </CardTitle>
            <Wrench className="size-4 text-amber-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="type-kpi">{stats.totalEquipment} Unit</div>
            <p className="type-p3 mt-1 text-muted-foreground">
              Alat berat &amp; proyek
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-medium text-muted-foreground">
              Sewa Kendaraan
            </CardTitle>
            <Truck className="size-4 text-blue-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="type-kpi">{stats.totalVehicle} Unit</div>
            <p className="type-p3 mt-1 text-muted-foreground">
              Armada angkut &amp; ops
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-medium text-muted-foreground">
              Rumah Sewa
            </CardTitle>
            <Home className="size-4 text-emerald-600" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="type-kpi text-emerald-700 dark:text-emerald-400">
              {stats.totalHouse} Unit
            </div>
            <p className="type-p3 mt-1 text-muted-foreground">
              Mess &amp; kontrakan tukang
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-medium text-muted-foreground">
              Kontrak Aktif
            </CardTitle>
            <Clock className="size-4 text-emerald-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="type-kpi text-emerald-600">
              {stats.activeRentals} Berjalan
            </div>
            <p className="type-p3 mt-1 text-muted-foreground">
              Periode aktif saat ini
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-medium text-muted-foreground">
              Total Komitmen
            </CardTitle>
            <Coins className="size-4 text-indigo-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div
              className="type-kpi truncate text-primary"
              title={formatCurrency(stats.totalCostAll)}
            >
              {formatCurrency(stats.totalCostAll)}
            </div>
            <p className="type-p3 mt-1 text-muted-foreground">
              Akumulasi seluruh sewa
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="type-h2 flex flex-wrap items-center gap-2">
                <span>Sewa Alat, Kendaraan &amp; Rumah</span>
                <Badge variant="outline">{filteredRentals.length} Catatan</Badge>
              </CardTitle>
              <CardDescription className="type-p2 mt-1">
                Kelola sewa alat proyek, kendaraan operasional, serta rumah sewa tukang.
              </CardDescription>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openCreateModal("EQUIPMENT")}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  + Sewa Alat
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openCreateModal("VEHICLE")}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  + Kendaraan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outlinesuccess"
                  onClick={() => openCreateModal("HOUSE")}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  + Rumah Sewa
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="Cari aset, pemilik, alamat, proyek..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as "ALL" | RentalType)}
            >
              <SelectTrigger className="w-full" aria-label="Filter tipe sewa">
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Tipe</SelectItem>
                <SelectItem value="EQUIPMENT">Alat</SelectItem>
                <SelectItem value="VEHICLE">Kendaraan</SelectItem>
                <SelectItem value="HOUSE">Rumah Sewa</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={periodFilter}
              onValueChange={(value) =>
                setPeriodFilter(value as "ALL" | RentalPeriodType)
              }
            >
              <SelectTrigger className="w-full" aria-label="Filter periode sewa">
                <SelectValue placeholder="Semua Periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Periode</SelectItem>
                <SelectItem value="DAILY">Harian</SelectItem>
                <SelectItem value="WEEKLY">Mingguan</SelectItem>
                <SelectItem value="MONTHLY">Bulanan</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "ALL" | RentalStatus)
              }
            >
              <SelectTrigger className="w-full" aria-label="Filter status sewa">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="ACTIVE">Berjalan</SelectItem>
                <SelectItem value="COMPLETED">Selesai</SelectItem>
                <SelectItem value="EXTENDED">Diperpanjang</SelectItem>
                <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {filteredRentals.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Belum Ada Data Sewa"
              description="Gunakan tombol + Sewa Alat, + Kendaraan, atau + Rumah Sewa untuk mencatat sewa baru."
            />
          ) : (
            <>
              <div className="space-y-2.5 md:hidden">
                {filteredRentals.map((rental) => (
                  <RentalMobileCard
                    key={rental.id}
                    rental={rental}
                    canManage={canManage}
                    onDetail={setDetailRental}
                    onBilling={openBillingModal}
                    onEdit={openEditModal}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                <Table itemLabel="data sewa">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit / Properti</TableHead>
                      <TableHead>Vendor / Pemilik</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Jadwal</TableHead>
                      <TableHead className="text-right">Tarif</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tagihan</TableHead>
                      <TableHead>Proyek / Lingkup</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRentals.map((r) => {
                      const periodMeta =
                        periodTypeLabels[r.rentalPeriodType] ??
                        periodTypeLabels.DAILY;
                      const unitText = getDefaultRentalUnit(
                        r.type,
                        r.rentalPeriodType,
                      );
                      const statusMeta =
                        statusLabels[r.status] ?? statusLabels.ACTIVE;
                      const typeMeta =
                        rentalTypeMeta[r.type] ?? rentalTypeMeta.EQUIPMENT;
                      const ownerName = r.landlordName || r.vendorName;
                      const ownerPhone = r.landlordPhone || r.vendorPhone;
                      const isOperational =
                        r.type !== "HOUSE" &&
                        (r.usageScope === "OPERATIONAL" || !r.projectId);

                      return (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-normal">
                            <div className="flex items-start gap-2.5">
                              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                                <RentalTypeIcon type={r.type} />
                              </span>
                              <div className="min-w-0">
                                <p className="type-p2 font-semibold text-foreground">
                                  {r.name}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <Badge variant={typeMeta.badgeVariant}>
                                    {typeMeta.shortLabel}
                                  </Badge>
                                  {r.category && (
                                    <span className="type-p3 text-muted-foreground">
                                      {r.category}
                                    </span>
                                  )}
                                  {r.codeOrPlate && (
                                    <Badge variant="gray" className="font-mono">
                                      {r.codeOrPlate}
                                    </Badge>
                                  )}
                                </div>
                                {r.type === "HOUSE" && r.propertyAddress && (
                                  <p className="type-p3 mt-1 flex items-center gap-1 text-muted-foreground">
                                    <MapPin
                                      className="size-3.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span className="max-w-[220px] truncate">
                                      {r.propertyAddress}
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="whitespace-normal">
                            <p className="type-p2 font-medium text-foreground">
                              {ownerName}
                            </p>
                            {ownerPhone && (
                              <p className="type-p3 text-muted-foreground">
                                {ownerPhone}
                              </p>
                            )}
                            {r.type === "HOUSE" && r.occupantCount && (
                              <Badge variant="lightSuccess" className="mt-1 gap-1">
                                <Users className="size-3" aria-hidden="true" />
                                {r.occupantCount} Penghuni
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell>
                            <Badge variant={periodMeta.badgeVariant}>
                              {periodMeta.label}
                            </Badge>
                            <p className="type-p3 mt-1 font-medium text-foreground">
                              {r.duration} {unitText}
                            </p>
                          </TableCell>

                          <TableCell>
                            <p className="type-p2 flex items-center gap-1 text-foreground">
                              <Calendar
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              {new Date(r.startDate).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                            <p className="type-p3 text-muted-foreground">
                              s/d{" "}
                              {new Date(r.endDate).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          </TableCell>

                          <TableCell className="text-right">
                            <p className="type-p2 font-medium tabular-nums">
                              {formatCurrency(r.ratePerPeriod)}
                            </p>
                            <p className="type-p3 text-muted-foreground">
                              per {unitText.toLowerCase()}
                            </p>
                            {parseFloat(r.additionalCost) > 0 && (
                              <p className="type-p3 text-amber-600 tabular-nums">
                                +{formatCurrency(r.additionalCost)}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <p className="type-p2 font-bold tabular-nums text-primary">
                              {formatCurrency(r.totalCost)}
                            </p>
                            {r.type !== "HOUSE" && (r.withOperator || r.withFuel) && (
                              <div className="type-p3 mt-0.5 flex items-center justify-end gap-1.5 text-muted-foreground">
                                {r.withOperator && (
                                  <span className="inline-flex items-center gap-0.5 text-blue-600">
                                    <UserCheck className="size-3.5" aria-hidden="true" />
                                    Supir
                                  </span>
                                )}
                                {r.withFuel && (
                                  <span className="inline-flex items-center gap-0.5 text-amber-600">
                                    <Flame className="size-3.5" aria-hidden="true" />
                                    BBM
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>

                          <TableCell>
                            <Badge variant={statusMeta.badgeVariant}>
                              {statusMeta.label}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {r.paymentStatus === "PAID" ? (
                              <div className="space-y-1">
                                <Badge variant="lightSuccess" className="gap-1">
                                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                  Lunas
                                </Badge>
                                {r.proofOfPaymentUrl && (
                                  <div>
                                    <a
                                      href={r.proofOfPaymentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="type-p3 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                    >
                                      <ExternalLink className="size-3" aria-hidden="true" />
                                      Bukti Bayar
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : r.paymentStatus === "PENDING_PAYMENT" ? (
                              <Badge variant="lightWarning" className="gap-1">
                                <Clock className="size-3.5" aria-hidden="true" />
                                Menunggu Finance
                              </Badge>
                            ) : canManage && r.status !== "CANCELLED" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outlinesuccess"
                                onClick={() => openBillingModal(r)}
                              >
                                <Send className="size-3.5" aria-hidden="true" />
                                Tagih Finance
                              </Button>
                            ) : (
                              <Badge variant="gray">Belum Diajukan</Badge>
                            )}
                          </TableCell>

                          <TableCell className="whitespace-normal">
                            {isOperational ? (
                              <Badge variant="gray">Operasional</Badge>
                            ) : (
                              <p
                                className="type-p2 max-w-[180px] truncate font-medium text-foreground"
                                title={r.projectName ?? "-"}
                              >
                                {r.projectName ?? "Tanpa proyek"}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setDetailRental(r)}
                              >
                                Detail
                              </Button>
                              {canManage && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      aria-label={`Opsi sewa ${r.name}`}
                                      className="size-8"
                                    >
                                      <MoreHorizontal
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => openEditModal(r)}>
                                      <Pencil aria-hidden="true" />
                                      Edit Sewa
                                    </DropdownMenuItem>
                                    {r.paymentStatus !== "PAID" && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onSelect={() => setDeleteTarget(r)}
                                        >
                                          <Trash2 aria-hidden="true" />
                                          Hapus
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
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

      {/* Create / Edit Modal */}
      <GlobalModal
        isOpen={modalOpen}
        onClose={() => {
          if (!isPending) setModalOpen(false);
        }}
        title={
          editingItem
            ? `Edit ${rentalTypeMeta[formType].label}`
            : `Catat ${rentalTypeMeta[formType].label}`
        }
        description={
          formType === "HOUSE"
            ? "Biaya rumah sewa / mess tukang terhubung ke Proyek terkait."
            : "Lengkapi tipe, lingkup pembebanan, jadwal, dan rincian tarif sewa."
        }
        className="sm:max-w-2xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button type="submit" form="rental-form" disabled={isPending}>
              {isPending
                ? "Menyimpan..."
                : editingItem
                  ? "Simpan Perubahan"
                  : "Simpan Sewa"}
            </Button>
          </>
        }
      >
        <form id="rental-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="type-p2 font-semibold">
                Tipe Sewa <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={formType}
                onValueChange={(value) =>
                  applyRentalTypeSwitch(value as RentalType)
                }
                className="grid grid-cols-3 gap-2"
              >
                {(
                  [
                    { value: "EQUIPMENT", label: "Alat" },
                    { value: "VEHICLE", label: "Kendaraan" },
                    { value: "HOUSE", label: "Rumah" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 transition-colors ${
                      formType === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem value={option.value} className="sr-only" />
                    <RentalTypeIcon type={option.value} className="size-3.5" />
                    <span className="type-p3 font-semibold">{option.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label className="type-p2 font-semibold">
                Periode Sewa <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={formPeriodType}
                onValueChange={(value) =>
                  handlePeriodTypeChange(value as RentalPeriodType)
                }
                className="grid grid-cols-3 gap-2"
              >
                {(
                  [
                    { value: "DAILY", label: "Harian" },
                    { value: "WEEKLY", label: "Mingguan" },
                    { value: "MONTHLY", label: "Bulanan" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 transition-colors ${
                      formPeriodType === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem value={option.value} className="sr-only" />
                    <span className="type-p3 font-semibold">{option.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>

          {formType === "HOUSE" ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-900 dark:text-emerald-200">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="type-p2 font-semibold">
                  Rumah Sewa Wajib Terhubung ke Proyek
                </p>
                <p className="type-p3 opacity-90">
                  Biaya sewa mess tukang yang dibayar otomatis masuk ke rekap dana proyek terkait.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label className="type-p2 font-semibold">
                  Lingkup Pembebanan <span className="text-destructive">*</span>
                </Label>
                <p className="type-p3 text-muted-foreground">
                  Tentukan apakah biaya masuk ke Proyek atau Operasional umum.
                </p>
              </div>
              <RadioGroup
                value={formUsageScope}
                onValueChange={(value) => {
                  const next = value as RentalUsageScope;
                  setFormUsageScope(next);
                  if (next === "OPERATIONAL") setFormProjectId("");
                }}
                className="grid shrink-0 grid-cols-2 gap-2 sm:w-60"
              >
                <label
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-2.5 py-2 ${
                    formUsageScope === "PROJECT"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <RadioGroupItem value="PROJECT" className="sr-only" />
                  <span className="type-p3 font-semibold">Proyek</span>
                </label>
                <label
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-2.5 py-2 ${
                    formUsageScope === "OPERATIONAL"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <RadioGroupItem value="OPERATIONAL" className="sr-only" />
                  <span className="type-p3 font-semibold">Operasional</span>
                </label>
              </RadioGroup>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rf-name" className="type-p2 font-semibold">
                {formType === "HOUSE"
                  ? "Nama Rumah Sewa *"
                  : formType === "VEHICLE"
                    ? "Nama Kendaraan *"
                    : "Nama Alat *"}
              </Label>
              <Combobox
                options={catalogComboboxOptions}
                value={formCatalogId}
                onValueChange={(selectedId) => {
                  setFormCatalogId(selectedId);
                  const found = ALL_CATALOG_ITEMS.find(
                    (item) => item.id === selectedId,
                  );
                  if (found) {
                    applyRentalTypeSwitch(found.type);
                    setFormName(found.name);
                    setFormCategory(found.category);
                    if (found.defaultPeriodType) {
                      handlePeriodTypeChange(found.defaultPeriodType);
                    }
                  }
                }}
                placeholder={`Pilih preset ${rentalTypeMeta[formType].shortLabel} (opsional)...`}
                searchPlaceholder="Cari katalog unit..."
              />
              <Input
                id="rf-name"
                placeholder={
                  formType === "HOUSE"
                    ? "Contoh: Rumah Kontrakan Pak Budi"
                    : formType === "EQUIPMENT"
                      ? "Contoh: Excavator Komatsu PC200"
                      : "Contoh: Dump Truck Hino 500"
                }
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            {formType === "HOUSE" ? (
              <div className="space-y-1.5">
                <Label htmlFor="rf-occupants" className="type-p2 font-semibold">
                  Jumlah Penghuni
                </Label>
                <Input
                  id="rf-occupants"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="cth: 8"
                  value={formOccupantCount}
                  onChange={(e) => setFormOccupantCount(e.target.value)}
                />
                <p className="type-p3 text-muted-foreground">
                  Kapasitas pekerja mess.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="rf-code" className="type-p2 font-semibold">
                  {formType === "EQUIPMENT" ? "No. Seri / Kode" : "No. Polisi"}
                </Label>
                <Input
                  id="rf-code"
                  placeholder={
                    formType === "EQUIPMENT" ? "cth: EX-01" : "cth: BL 8234 AB"
                  }
                  value={formCodeOrPlate}
                  onChange={(e) => setFormCodeOrPlate(e.target.value)}
                />
              </div>
            )}
          </div>

          {formType === "HOUSE" && (
            <div className="space-y-1.5">
              <Label htmlFor="rf-address" className="type-p2 font-semibold">
                Alamat Rumah Sewa
              </Label>
              <Input
                id="rf-address"
                placeholder="Contoh: Jl. Kebun Baru No. 12, Desa Suka Makmur"
                value={formPropertyAddress}
                onChange={(e) => setFormPropertyAddress(e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rf-category" className="type-p2 font-semibold">
                {formType === "HOUSE" ? "Kategori Properti" : "Kategori Unit"}
              </Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger id="rf-category" className="w-full">
                  <SelectValue placeholder="Pilih kategori..." />
                </SelectTrigger>
                <SelectContent>
                  {activeCategoryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                  {formCategory &&
                    !activeCategoryOptions.includes(formCategory) && (
                      <SelectItem value={formCategory}>
                        {formCategory}
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rf-vendor-name" className="type-p2 font-semibold">
                {formType === "HOUSE"
                  ? "Pemilik Rumah *"
                  : "Vendor / Pemilik *"}
              </Label>
              {formType !== "HOUSE" && vendors.length > 0 && (
                <Combobox
                  options={vendorComboboxOptions}
                  value={formSelectedVendorId}
                  allowClear
                  onValueChange={(vendorId) => {
                    setFormSelectedVendorId(vendorId);
                    const matched = vendors.find((v) => v.id === vendorId);
                    if (matched) {
                      setFormVendorName(matched.name);
                      if (matched.phone) setFormVendorPhone(matched.phone);
                    }
                  }}
                  placeholder="Pilih dari katalog vendor..."
                  searchPlaceholder="Cari vendor..."
                />
              )}
              <Input
                id="rf-vendor-name"
                placeholder={
                  formType === "HOUSE"
                    ? "Nama pemilik rumah..."
                    : "Ketik nama vendor..."
                }
                value={formVendorName}
                onChange={(e) => {
                  setFormVendorName(e.target.value);
                  if (formSelectedVendorId) setFormSelectedVendorId("");
                }}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rf-phone" className="type-p2 font-semibold">
                {formType === "HOUSE" ? "No. HP Pemilik" : "Kontak Vendor"}
              </Label>
              <Input
                id="rf-phone"
                placeholder="08123456789"
                value={formVendorPhone}
                onChange={(e) => setFormVendorPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rf-project" className="type-p2 font-semibold">
                {formType === "HOUSE"
                  ? "Proyek Terkait *"
                  : formUsageScope === "PROJECT"
                    ? "Proyek Pengguna *"
                    : "Lingkup Operasional"}
              </Label>
              {formType !== "HOUSE" && formUsageScope === "OPERATIONAL" ? (
                <Input
                  id="rf-project"
                  readOnly
                  value="Operasional Umum (Non-Proyek)"
                  className="bg-muted/40"
                />
              ) : (
                <Combobox
                  id="rf-project"
                  options={projectComboboxOptions}
                  value={formProjectId}
                  onValueChange={setFormProjectId}
                  placeholder="Pilih proyek aktif..."
                  searchPlaceholder="Cari nama proyek..."
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rf-status" className="type-p2 font-semibold">
                Status Sewa
              </Label>
              <Select
                value={formStatus}
                onValueChange={(value) => setFormStatus(value as RentalStatus)}
              >
                <SelectTrigger id="rf-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Berjalan (Aktif)</SelectItem>
                  <SelectItem value="COMPLETED">Selesai</SelectItem>
                  <SelectItem value="EXTENDED">Diperpanjang</SelectItem>
                  <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-2 text-primary">
              <Calendar className="size-4" aria-hidden="true" />
              <span className="type-p2 font-semibold">Periode &amp; Jadwal</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rf-start" className="type-p2 font-medium">
                  Mulai <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  id="rf-start"
                  value={formStartDate}
                  onValueChange={(val) =>
                    handleDatesChange(val, formEndDate, formPeriodType)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rf-end" className="type-p2 font-medium">
                  Selesai <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  id="rf-end"
                  value={formEndDate}
                  minDate={formStartDate}
                  onValueChange={(val) =>
                    handleDatesChange(formStartDate, val, formPeriodType)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rf-duration" className="type-p2 font-medium">
                  Durasi ({activeUnitLabel}) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rf-duration"
                  type="number"
                  min="0.1"
                  step="any"
                  value={formDuration}
                  onChange={(e) =>
                    handleRateOrAddChange(
                      formRate,
                      formAdditionalCost,
                      e.target.value,
                    )
                  }
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-2 text-emerald-600">
              <Coins className="size-4" aria-hidden="true" />
              <span className="type-p2 font-semibold text-foreground">
                Rincian Biaya
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rf-rate" className="type-p2 font-medium">
                  Tarif / {activeUnitLabel} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rf-rate"
                  type="number"
                  min="0"
                  step="any"
                  value={formRate}
                  onChange={(e) =>
                    handleRateOrAddChange(
                      e.target.value,
                      formAdditionalCost,
                      formDuration,
                    )
                  }
                  required
                />
                <span className="type-p3 block text-muted-foreground tabular-nums">
                  {formatCurrency(formRate)} / {activeUnitLabel.toLowerCase()}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rf-add-cost" className="type-p2 font-medium">
                  {formType === "HOUSE" ? "Listrik / Deposit" : "Biaya Tambahan"}
                </Label>
                <Input
                  id="rf-add-cost"
                  type="number"
                  min="0"
                  step="any"
                  value={formAdditionalCost}
                  onChange={(e) =>
                    handleRateOrAddChange(
                      formRate,
                      e.target.value,
                      formDuration,
                    )
                  }
                />
                <span className="type-p3 block text-muted-foreground tabular-nums">
                  {formatCurrency(formAdditionalCost)}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rf-total" className="type-p2 font-semibold text-primary">
                  Total Biaya <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rf-total"
                  type="number"
                  min="0"
                  step="any"
                  value={formTotalCost}
                  onChange={(e) => setFormTotalCost(e.target.value)}
                  required
                  className="font-bold text-primary"
                />
                <span className="type-p3 block font-bold tabular-nums text-emerald-600">
                  {formatCurrency(formTotalCost)}
                </span>
              </div>
            </div>
          </div>

          <div
            className={
              formType === "HOUSE"
                ? "space-y-1.5"
                : "grid gap-3 sm:grid-cols-2"
            }
          >
            {formType !== "HOUSE" && (
              <div className="space-y-2.5 rounded-xl border border-border p-3">
                <span className="type-p2 block font-semibold text-foreground">
                  Fasilitas Termasuk
                </span>
                <label className="type-p2 flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={formWithOperator}
                    onCheckedChange={(checked) =>
                      setFormWithOperator(checked === true)
                    }
                  />
                  <span>Termasuk Operator / Supir</span>
                </label>
                {formWithOperator && (
                  <Input
                    placeholder="Nama Operator / Supir"
                    value={formOperatorName}
                    onChange={(e) => setFormOperatorName(e.target.value)}
                  />
                )}
                <label className="type-p2 flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={formWithFuel}
                    onCheckedChange={(checked) => setFormWithFuel(checked === true)}
                  />
                  <span>Termasuk BBM</span>
                </label>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="rf-notes" className="type-p2 font-semibold">
                Catatan Sewa
              </Label>
              <Textarea
                id="rf-notes"
                placeholder={
                  formType === "HOUSE"
                    ? "Fasilitas rumah, jadwal perpanjangan, listrik/air..."
                    : "Kondisi unit, perjanjian sewa, mobilisasi..."
                }
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </form>
      </GlobalModal>

      {/* Detail Modal */}
      <GlobalModal
        isOpen={detailRental !== null}
        onClose={() => setDetailRental(null)}
        title={detailRental?.name ?? "Detail Sewa"}
        description={
          detailRental
            ? `${rentalTypeMeta[detailRental.type].label} · ${detailRental.landlordName || detailRental.vendorName}`
            : undefined
        }
        className="sm:max-w-lg"
        footer={
          detailRental ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDetailRental(null)}
              >
                Tutup
              </Button>
              {canManage &&
                detailRental.paymentStatus === "UNPAID" &&
                detailRental.status !== "CANCELLED" && (
                  <Button
                    type="button"
                    variant="success"
                    onClick={() => {
                      const target = detailRental;
                      setDetailRental(null);
                      openBillingModal(target);
                    }}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    Tagih Finance
                  </Button>
                )}
            </>
          ) : undefined
        }
      >
        {detailRental && (
          <div className="space-y-4">
            <dl className="type-p2 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <dt className="text-muted-foreground">Tipe</dt>
              <dd className="text-right font-medium">
                {rentalTypeMeta[detailRental.type].label}
              </dd>

              <dt className="text-muted-foreground">Lingkup</dt>
              <dd className="text-right font-medium">
                {detailRental.type !== "HOUSE" &&
                (detailRental.usageScope === "OPERATIONAL" ||
                  !detailRental.projectId)
                  ? "Operasional Umum"
                  : (detailRental.projectName ?? "Proyek")}
              </dd>

              <dt className="text-muted-foreground">
                {detailRental.type === "HOUSE" ? "Pemilik Rumah" : "Vendor"}
              </dt>
              <dd className="text-right font-medium">
                {detailRental.landlordName || detailRental.vendorName}
              </dd>

              {(detailRental.landlordPhone || detailRental.vendorPhone) && (
                <>
                  <dt className="text-muted-foreground">Kontak</dt>
                  <dd className="flex items-center justify-end gap-1 font-medium">
                    <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {detailRental.landlordPhone || detailRental.vendorPhone}
                  </dd>
                </>
              )}

              {detailRental.propertyAddress && (
                <>
                  <dt className="text-muted-foreground">Alamat Properti</dt>
                  <dd className="text-right font-medium">
                    {detailRental.propertyAddress}
                  </dd>
                </>
              )}

              {detailRental.occupantCount && (
                <>
                  <dt className="text-muted-foreground">Jumlah Penghuni</dt>
                  <dd className="text-right font-medium">
                    {detailRental.occupantCount} Orang
                  </dd>
                </>
              )}

              {detailRental.codeOrPlate && (
                <>
                  <dt className="text-muted-foreground">Kode / Plat</dt>
                  <dd className="text-right font-mono font-medium">
                    {detailRental.codeOrPlate}
                  </dd>
                </>
              )}

              <dt className="text-muted-foreground">Jadwal</dt>
              <dd className="text-right font-medium">
                {detailRental.startDate} s/d {detailRental.endDate} (
                {detailRental.duration}{" "}
                {getDefaultRentalUnit(
                  detailRental.type,
                  detailRental.rentalPeriodType,
                )}
                )
              </dd>

              <dt className="text-muted-foreground">Total Biaya</dt>
              <dd className="text-right font-bold tabular-nums text-primary">
                {formatCurrency(detailRental.totalCost)}
              </dd>

              <dt className="text-muted-foreground">Status Tagihan</dt>
              <dd className="text-right font-medium">
                {detailRental.paymentStatus === "PAID"
                  ? "Lunas"
                  : detailRental.paymentStatus === "PENDING_PAYMENT"
                    ? "Menunggu Pembayaran Finance"
                    : "Belum Diajukan"}
              </dd>

              {detailRental.sourceTicketId && (
                <>
                  <dt className="text-muted-foreground">Tiket Sumber</dt>
                  <dd className="text-right font-mono text-xs">
                    {detailRental.sourceTicketId}
                  </dd>
                </>
              )}
            </dl>

            {(detailRental.paymentBankName ||
              detailRental.paymentAccountNumber) && (
              <div className="type-p3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-semibold text-foreground">
                  Rekening Pembayaran
                </p>
                <p className="text-muted-foreground">
                  {detailRental.paymentBankName ?? "-"} ·{" "}
                  {detailRental.paymentAccountNumber ?? "-"} (
                  {detailRental.paymentAccountName ?? "-"})
                </p>
              </div>
            )}

            {detailRental.notes && (
              <div className="type-p3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-semibold text-foreground">Catatan</p>
                <p className="text-muted-foreground">{detailRental.notes}</p>
              </div>
            )}

            {detailRental.financeNotes && (
              <div className="type-p3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-semibold text-foreground">Catatan Keuangan</p>
                <p className="text-muted-foreground">
                  {detailRental.financeNotes}
                </p>
              </div>
            )}
          </div>
        )}
      </GlobalModal>

      {/* Billing Confirmation Modal */}
      <GlobalModal
        isOpen={billingModalOpen}
        onClose={() => {
          if (!isPending) setBillingModalOpen(false);
        }}
        title="Tagih Sewa ke Keuangan"
        description="Kirimkan tagihan sewa ke antrean pembayaran Bagian Keuangan."
        className="sm:max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBillingModalOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="rental-billing-form"
              variant="success"
              disabled={isPending}
            >
              <Send className="size-4" aria-hidden="true" />
              {isPending ? "Mengirim..." : "Tagih Finance"}
            </Button>
          </>
        }
      >
        {billingTargetRental && (
          <form
            id="rental-billing-form"
            onSubmit={handleConfirmBilling}
            className="space-y-4"
          >
            <div className="flex items-start justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
              <div>
                <p className="type-p3 text-muted-foreground">
                  {rentalTypeMeta[billingTargetRental.type]?.shortLabel}
                </p>
                <p className="type-p1 font-bold text-primary">
                  {billingTargetRental.name}
                </p>
                <p className="type-p3 text-muted-foreground">
                  {billingTargetRental.landlordName ||
                    billingTargetRental.vendorName}
                  {billingTargetRental.projectName
                    ? ` · ${billingTargetRental.projectName}`
                    : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="type-p3 text-muted-foreground">Total Tagihan</p>
                <p className="type-h3 font-bold tabular-nums text-emerald-600">
                  {formatCurrency(billingTargetRental.totalCost)}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
              <p className="type-p2 flex items-center gap-1.5 font-semibold text-foreground">
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                Rekening Tujuan Transfer
              </p>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label htmlFor="rb-bank" className="type-p2 font-medium">
                    Nama Bank
                  </Label>
                  <Input
                    id="rb-bank"
                    placeholder="mis. BCA / Mandiri / BRI / BSI"
                    value={billingBankName}
                    onChange={(e) => setBillingBankName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rb-account" className="type-p2 font-medium">
                    Nomor Rekening
                  </Label>
                  <Input
                    id="rb-account"
                    placeholder="Contoh: 1234567890"
                    value={billingAccountNumber}
                    onChange={(e) => setBillingAccountNumber(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rb-holder" className="type-p2 font-medium">
                    Atas Nama Rekening
                  </Label>
                  <Input
                    id="rb-holder"
                    placeholder="Nama pemilik rekening"
                    value={billingAccountName}
                    onChange={(e) => setBillingAccountName(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </form>
        )}
      </GlobalModal>

      {/* Delete Confirmation Modal */}
      <GlobalModal
        isOpen={deleteTarget !== null}
        onClose={() => {
          if (!isPending) setDeleteTarget(null);
        }}
        title="Hapus Catatan Sewa?"
        description={
          deleteTarget
            ? `Catatan sewa "${deleteTarget.name}" akan dihapus permanen.`
            : undefined
        }
        className="sm:max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={confirmDeleteRental}
            >
              {isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      >
        <p className="type-p2 text-muted-foreground">
          Tindakan ini tidak dapat dibatalkan. Data yang sudah lunas tidak dapat dihapus.
        </p>
      </GlobalModal>
    </div>
  );
}
