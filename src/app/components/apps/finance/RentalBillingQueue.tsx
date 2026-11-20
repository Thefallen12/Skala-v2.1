"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Home,
  MapPin,
  Pencil,
  Phone,
  Search,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  type RentalItemRow,
  type RentalType,
  getRentals,
  processRentalPayment,
  replaceRentalPaymentProof,
} from "@/app/actions/rentals";
import { getDefaultRentalUnit } from "@/lib/equipment-catalog";
import { parseClientAssetCode, withLocalPhotoPreview } from "@/lib/photo-urls";
import FinancePaymentProofReplacement from "@/app/components/apps/finance/FinancePaymentProofReplacement";
import FinancePaymentProofUpload from "@/app/components/apps/finance/FinancePaymentProofUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
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

type FinanceAccountOption = {
  id: string;
  accountName: string;
  holderName?: string;
  accountNumber: string | null;
  balance: number;
};

const rentalTypeMeta: Record<
  RentalType,
  {
    label: string;
    icon: LucideIcon;
    badgeVariant: "warning" | "info" | "success";
  }
> = {
  EQUIPMENT: {
    label: "Alat Sewa",
    icon: Wrench,
    badgeVariant: "warning",
  },
  VEHICLE: {
    label: "Kendaraan Sewa",
    icon: Truck,
    badgeVariant: "info",
  },
  HOUSE: {
    label: "Rumah Sewa",
    icon: Home,
    badgeVariant: "success",
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

export default function RentalBillingQueue({
  rentals = [],
  financeAccounts = [],
  canManage = true,
  onPreviewProof,
}: {
  rentals: RentalItemRow[];
  financeAccounts: FinanceAccountOption[];
  canManage?: boolean;
  onPreviewProof?: (url: string, label: string) => void;
}) {
  const router = useRouter();
  const [hydratedRentals, setHydratedRentals] = useState<
    RentalItemRow[] | null
  >(null);
  const rentalRows = hydratedRentals ?? rentals;
  const [filterTab, setFilterTab] = useState<"PENDING" | "PAID" | "ALL">(
    "PENDING",
  );
  const [typeFilter, setTypeFilter] = useState<"ALL" | RentalType>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedRental, setSelectedRental] = useState<RentalItemRow | null>(
    null,
  );
  const [replacingRental, setReplacingRental] = useState<RentalItemRow | null>(
    null,
  );

  // Form states
  const [formAccountId, setFormAccountId] = useState(
    financeAccounts[0]?.id ?? "",
  );
  const [formProofFile, setFormProofFile] = useState<File | null>(null);
  const [formProofDocType, setFormProofDocType] = useState<"BKT" | "BON" | "KWT" | "INV">("BKT");
  const [formBankName, setFormBankName] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formAccountName, setFormAccountName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    getRentals()
      .then((fresh) => {
        if (active) {
          setHydratedRentals(fresh);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [rentals]);

  // Statistics
  const pendingRentals = useMemo(
    () => rentalRows.filter((r) => r.paymentStatus === "PENDING_PAYMENT"),
    [rentalRows],
  );
  const totalPendingAmount = useMemo(
    () =>
      pendingRentals.reduce(
        (sum, r) => sum + (parseFloat(r.totalCost) || 0),
        0,
      ),
    [pendingRentals],
  );
  const paidRentals = useMemo(
    () => rentalRows.filter((r) => r.paymentStatus === "PAID"),
    [rentalRows],
  );
  const totalPaidAmount = useMemo(
    () =>
      paidRentals.reduce((sum, r) => sum + (parseFloat(r.totalCost) || 0), 0),
    [paidRentals],
  );
  const houseCount = useMemo(
    () => rentalRows.filter((r) => r.type === "HOUSE").length,
    [rentalRows],
  );

  // Filtered list
  const filteredRentals = useMemo(() => {
    return rentalRows.filter((r) => {
      if (filterTab === "PENDING" && r.paymentStatus !== "PENDING_PAYMENT")
        return false;
      if (filterTab === "PAID" && r.paymentStatus !== "PAID") return false;
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesVendor = r.vendorName.toLowerCase().includes(q);
        const matchesLandlord = (r.landlordName ?? "").toLowerCase().includes(q);
        const matchesAddress = (r.propertyAddress ?? "")
          .toLowerCase()
          .includes(q);
        const matchesPlate = (r.codeOrPlate ?? "").toLowerCase().includes(q);
        const matchesProject = (r.projectName ?? "").toLowerCase().includes(q);
        if (
          !matchesName &&
          !matchesVendor &&
          !matchesLandlord &&
          !matchesAddress &&
          !matchesPlate &&
          !matchesProject
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rentalRows, filterTab, typeFilter, searchQuery]);

  const openPaymentModal = (rental: RentalItemRow) => {
    setSelectedRental(rental);
    setFormBankName(rental.paymentBankName ?? "");
    setFormAccountNumber(rental.paymentAccountNumber ?? "");
    setFormAccountName(rental.paymentAccountName ?? "");
    setFormProofFile(null);
    setFormProofDocType("BKT");
    setFormNotes("");
    setFormAccountId(financeAccounts[0]?.id ?? "");
    setActionMessage(null);
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRental) return;

    const totalCostNum = parseFloat(selectedRental.totalCost) || 0;
    if (totalCostNum > 0) {
      if (!formAccountId.trim()) {
        const errMsg = "Pilih Rekening Kas / Bank sumber pembayaran.";
        setActionMessage({ text: errMsg, error: true });
        toast.error(errMsg);
        return;
      }
      if (!formProofFile) {
        const errMsg = "Unggah bukti transfer (PDF, JPG, PNG, atau WEBP).";
        setActionMessage({ text: errMsg, error: true });
        toast.error(errMsg);
        return;
      }
    }

    setActionMessage(null);
    startTransition(async () => {
      try {
        const res = await processRentalPayment({
          rentalId: selectedRental.id,
          proof: formProofFile,
          paymentBankName: formBankName.trim() || undefined,
          paymentAccountNumber: formAccountNumber.trim() || undefined,
          paymentAccountName: formAccountName.trim() || undefined,
          financeNotes: formNotes.trim() || undefined,
          financeAccountId: formAccountId || undefined,
          proofDocType: formProofDocType,
        });

        if (res.success) {
          toast.success(res.message || "Pembayaran tagihan sewa dicatat.");
          setPaymentModalOpen(false);
          const fresh = await getRentals().catch(() => null);
          if (fresh) setHydratedRentals(fresh);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          setActionMessage({ text: res.message, error: true });
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Rental payment error:", error);
        const errMsg = "Pembayaran sewa gagal diproses. Silakan coba lagi.";
        setActionMessage({ text: errMsg, error: true });
        toast.error(errMsg);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-semibold text-muted-foreground uppercase tracking-wider">
              Menunggu Pembayaran
            </CardTitle>
            <Clock className="size-5 text-amber-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="type-kpi text-amber-600 dark:text-amber-400">
              {pendingRentals.length} Tagihan
            </div>
            <div className="type-p2 mt-1 font-semibold text-foreground tabular-nums">
              {formatCurrency(totalPendingAmount)}
            </div>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Diajukan oleh tim logistik lapangan
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-semibold text-muted-foreground uppercase tracking-wider">
              Tagihan Sewa Lunas
            </CardTitle>
            <CheckCircle2 className="size-5 text-emerald-500" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="type-kpi text-emerald-600 dark:text-emerald-400">
              {paidRentals.length} Tagihan
            </div>
            <div className="type-p2 mt-1 font-semibold text-foreground tabular-nums">
              {formatCurrency(totalPaidAmount)}
            </div>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Tercatat ke arus kas &amp; rekap proyek
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="type-p3 font-semibold text-muted-foreground uppercase tracking-wider">
              Total Kontrak Sewa
            </CardTitle>
            <div className="flex items-center gap-1.5 text-primary">
              <Home className="size-4 text-emerald-600" aria-hidden="true" />
              <Truck className="size-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="type-kpi text-primary">
              {rentalRows.length} Kontrak
            </div>
            <p className="type-p3 mt-1 text-muted-foreground">
              Alat berat, kendaraan &amp; {houseCount} rumah sewa tukang
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="type-h2 text-foreground flex flex-wrap items-center gap-2">
                <span>Tagihan Sewa Alat, Kendaraan &amp; Rumah</span>
                <Badge variant="outline">{filteredRentals.length} Data</Badge>
              </CardTitle>
              <CardDescription className="type-p3 mt-1">
                Pelunasan sewa alat, kendaraan sewa, dan rumah sewa tukang yang terhubung ke proyek &amp; arus kas.
              </CardDescription>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-3 border-t">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari aset, pemilik, alamat, nopol, proyek..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-background p-1">
              <span className="type-p3 px-2 text-muted-foreground font-medium whitespace-nowrap">
                Tipe:
              </span>
              {(
                [
                  { id: "ALL", label: "Semua", icon: null },
                  { id: "HOUSE", label: "Rumah", icon: Home },
                  { id: "VEHICLE", label: "Kendaraan", icon: Truck },
                  { id: "EQUIPMENT", label: "Alat", icon: Wrench },
                ] as const
              ).map((item) => {
                const IconComp = item.icon;
                const active = typeFilter === item.id;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "ghost"}
                    onClick={() => setTypeFilter(item.id)}
                  >
                    {IconComp && <IconComp className="size-3.5" aria-hidden="true" />}
                    {item.label}
                  </Button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-background p-1">
              <span className="type-p3 px-2 text-muted-foreground flex items-center gap-1 font-medium whitespace-nowrap">
                <Filter className="size-3.5" aria-hidden="true" /> Status:
              </span>
              {(
                [
                  { id: "PENDING", label: `Menunggu (${pendingRentals.length})` },
                  { id: "PAID", label: `Lunas (${paidRentals.length})` },
                  { id: "ALL", label: `Semua (${rentalRows.length})` },
                ] as const
              ).map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={filterTab === item.id ? "default" : "ghost"}
                  onClick={() => setFilterTab(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Mobile Card View (< 768px) */}
          <div className="space-y-3 p-4 md:hidden">
            {filteredRentals.map((r) => {
              const isPaid = r.paymentStatus === "PAID";
              const isPendingPay = r.paymentStatus === "PENDING_PAYMENT";
              const typeMeta = rentalTypeMeta[r.type] ?? rentalTypeMeta.EQUIPMENT;
              const TypeIcon = typeMeta.icon;
              const ownerName = r.landlordName || r.vendorName;
              const ownerPhone = r.landlordPhone || r.vendorPhone;
              const unitText = getDefaultRentalUnit(r.type, r.rentalPeriodType);
              const isOperational =
                r.type !== "HOUSE" &&
                (r.usageScope === "OPERATIONAL" || !r.projectId);
              const missingHouseProject = r.type === "HOUSE" && !r.projectName;

              return (
                <div
                  key={r.id}
                  className="space-y-3 rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <TypeIcon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="type-p1 font-semibold text-foreground break-words">
                          {r.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant={typeMeta.badgeVariant}>
                            {typeMeta.label}
                          </Badge>
                          {r.codeOrPlate && (
                            <Badge variant="outline" className="font-mono">
                              {r.codeOrPlate}
                            </Badge>
                          )}
                        </div>
                        <p className="type-p3 mt-1 text-muted-foreground break-words">
                          {ownerName}
                          {ownerPhone ? ` · ${ownerPhone}` : ""}
                        </p>
                        {r.type === "HOUSE" && r.propertyAddress && (
                          <p className="type-p3 mt-1 flex items-start gap-1 text-muted-foreground break-words">
                            <MapPin className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>{r.propertyAddress}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={
                        isPaid ? "success" : isPendingPay ? "warning" : "outline"
                      }
                      className="shrink-0"
                    >
                      {isPaid ? "Lunas" : isPendingPay ? "Menunggu" : "Draft"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2.5">
                    <div>
                      <span className="type-p3 text-muted-foreground">
                        Durasi &amp; Jadwal
                      </span>
                      <p className="type-p2 font-medium text-foreground">
                        {r.duration} {unitText}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {new Date(r.startDate).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        –{" "}
                        {new Date(r.endDate).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      {r.type === "HOUSE" && r.occupantCount && (
                        <p className="type-p3 mt-0.5 inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                          <Users className="size-3.5" aria-hidden="true" />
                          {r.occupantCount} Penghuni
                        </p>
                      )}
                      {r.type !== "HOUSE" && (r.withOperator || r.withFuel) && (
                        <p className="type-p3 mt-0.5 text-muted-foreground">
                          {[
                            r.withOperator
                              ? `Operator${r.operatorName ? `: ${r.operatorName}` : ""}`
                              : null,
                            r.withFuel ? "Termasuk BBM" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="type-p3 text-muted-foreground">
                        Total Tagihan
                      </span>
                      <p className="type-p1 font-bold text-primary tabular-nums">
                        {formatCurrency(r.totalCost)}
                      </p>
                      <p
                        className={`type-p3 break-words ${
                          missingHouseProject
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isOperational
                          ? "Operasional Umum"
                          : (r.projectName ??
                            (r.type === "HOUSE"
                              ? "Proyek wajib diisi"
                              : "Tanpa proyek"))}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
                    <span className="type-p3 font-mono text-muted-foreground">
                      {r.paymentBankName || "Bank —"}:{" "}
                      {r.paymentAccountNumber || "—"}
                    </span>
                    {canManage &&
                      (isPaid ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {r.proofOfPaymentUrl ? (
                            <>
                              {(() => {
                                const assetMeta = parseClientAssetCode(r.proofOfPaymentUrl);
                                return assetMeta ? (
                                  <span
                                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80"
                                    title={`${assetMeta.kindLabel} (${assetMeta.assetCode})`}
                                  >
                                    {assetMeta.assetCode}
                                  </span>
                                ) : null;
                              })()}
                              {onPreviewProof ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    onPreviewProof(
                                      r.proofOfPaymentUrl!,
                                      `Bukti Bayar ${r.name}`,
                                    )
                                  }
                                >
                                  <Eye className="size-3.5" aria-hidden="true" />
                                  Bukti Bayar
                                </Button>
                              ) : (
                                <Button asChild variant="outline" size="sm">
                                  <a
                                    href={withLocalPhotoPreview(r.proofOfPaymentUrl)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                    Bukti Bayar
                                  </a>
                                </Button>
                              )}
                            </>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReplacingRental(r)}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            {r.proofOfPaymentUrl ? "Ganti Bukti" : "Unggah Bukti"}
                          </Button>
                        </div>
                      ) : isPendingPay ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openPaymentModal(r)}
                        >
                          <CreditCard className="size-3.5" aria-hidden="true" />
                          Bayar
                        </Button>
                      ) : (
                        <span className="type-p3 text-muted-foreground">
                          Menunggu logistik
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}

            {filteredRentals.length === 0 && (
              <EmptyState
                icon={FileText}
                title="Tidak ada tagihan sewa"
                description="Tagihan sewa yang diajukan oleh tim logistik lapangan akan muncul di sini."
              />
            )}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden p-4 md:block">
            <Table pageSize={10} itemLabel="tagihan sewa">
              <TableHeader>
                <TableRow>
                  <TableHead>Aset / Rumah Sewa</TableHead>
                  <TableHead>Pemilik / Rekening</TableHead>
                  <TableHead>Periode &amp; Jadwal</TableHead>
                  <TableHead className="text-right">Total Tagihan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Proyek / Lingkup</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Aksi</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRentals.map((r) => {
                  const isPaid = r.paymentStatus === "PAID";
                  const isPendingPay = r.paymentStatus === "PENDING_PAYMENT";
                  const typeMeta =
                    rentalTypeMeta[r.type] ?? rentalTypeMeta.EQUIPMENT;
                  const TypeIcon = typeMeta.icon;
                  const ownerName = r.landlordName || r.vendorName;
                  const ownerPhone = r.landlordPhone || r.vendorPhone;
                  const unitText = getDefaultRentalUnit(
                    r.type,
                    r.rentalPeriodType,
                  );
                  const isOperational =
                    r.type !== "HOUSE" &&
                    (r.usageScope === "OPERATIONAL" || !r.projectId);
                  const missingHouseProject =
                    r.type === "HOUSE" && !r.projectName;

                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <TypeIcon className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <span className="type-p2 font-semibold text-foreground block">
                              {r.name}
                            </span>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant={typeMeta.badgeVariant}>
                                {typeMeta.label}
                              </Badge>
                              {r.codeOrPlate && (
                                <Badge variant="outline" className="font-mono">
                                  {r.codeOrPlate}
                                </Badge>
                              )}
                            </div>
                            {r.type === "HOUSE" && r.propertyAddress && (
                              <div className="type-p3 mt-1 flex items-center gap-1 text-muted-foreground max-w-[240px]">
                                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                                <span
                                  className="truncate"
                                  title={r.propertyAddress}
                                >
                                  {r.propertyAddress}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="type-p2 font-semibold text-foreground block">
                          {ownerName}
                        </span>
                        {ownerPhone && (
                          <span className="type-p3 mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                            <Phone className="size-3" aria-hidden="true" />
                            {ownerPhone}
                          </span>
                        )}
                        {r.type === "HOUSE" && r.occupantCount && (
                          <span className="type-p3 mt-1 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                            <Users className="size-3.5" aria-hidden="true" />
                            {r.occupantCount} Penghuni
                          </span>
                        )}
                        <div className="type-p3 mt-1 text-muted-foreground font-mono">
                          {r.paymentBankName || "Bank —"}:{" "}
                          {r.paymentAccountNumber || "—"}
                          {r.paymentAccountName &&
                            ` (a/n ${r.paymentAccountName})`}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="type-p2 font-semibold text-foreground block">
                          {r.duration} {unitText}
                        </span>
                        <div className="type-p3 mt-0.5 flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                          <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                          {new Date(r.startDate).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          –{" "}
                          {new Date(r.endDate).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="type-p2 font-bold text-primary tabular-nums">
                          {formatCurrency(r.totalCost)}
                        </div>
                        <span className="type-p3 text-muted-foreground tabular-nums">
                          Tarif: {formatCurrency(r.ratePerPeriod)}
                        </span>
                      </TableCell>

                      <TableCell>
                        {isPaid ? (
                          <div className="space-y-1">
                            <Badge variant="success">Lunas</Badge>
                            {r.paidAt && (
                              <span className="type-p3 block text-muted-foreground">
                                {new Date(r.paidAt).toLocaleDateString("id-ID")}
                              </span>
                            )}
                          </div>
                        ) : isPendingPay ? (
                          <div className="space-y-1">
                            <Badge variant="warning">Menunggu Bayar</Badge>
                            {r.billingSubmittedAt && (
                              <span className="type-p3 block text-muted-foreground">
                                {new Date(
                                  r.billingSubmittedAt,
                                ).toLocaleDateString("id-ID")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline">Belum Diajukan</Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        {isOperational ? (
                          <Badge variant="outline">Operasional Umum</Badge>
                        ) : (
                          <span
                            className={`type-p3 block max-w-[180px] truncate ${
                              missingHouseProject
                                ? "font-semibold text-destructive"
                                : "font-medium text-foreground"
                            }`}
                            title={r.projectName ?? "-"}
                          >
                            {r.projectName ??
                              (r.type === "HOUSE"
                                ? "Proyek wajib diisi"
                                : "Tanpa proyek")}
                          </span>
                        )}
                      </TableCell>

                      {canManage && (
                        <TableCell className="text-right">
                          {isPaid ? (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {r.proofOfPaymentUrl ? (
                                <>
                                  {(() => {
                                    const assetMeta = parseClientAssetCode(r.proofOfPaymentUrl);
                                    return assetMeta ? (
                                      <span
                                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80"
                                        title={`${assetMeta.kindLabel} (${assetMeta.assetCode})`}
                                      >
                                        {assetMeta.assetCode}
                                      </span>
                                    ) : null;
                                  })()}
                                  {onPreviewProof ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        onPreviewProof(
                                          r.proofOfPaymentUrl!,
                                          `Bukti Bayar ${r.name}`,
                                        )
                                      }
                                    >
                                      <Eye className="size-3.5" aria-hidden="true" />
                                      Bukti Bayar
                                    </Button>
                                  ) : (
                                    <Button asChild variant="outline" size="sm">
                                      <a
                                        href={withLocalPhotoPreview(r.proofOfPaymentUrl)}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <ExternalLink className="size-3.5" aria-hidden="true" />
                                        Bukti Bayar
                                      </a>
                                    </Button>
                                  )}
                                </>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setReplacingRental(r)}
                              >
                                <Pencil className="size-3.5" aria-hidden="true" />
                                {r.proofOfPaymentUrl ? "Ganti Bukti" : "Unggah Bukti"}
                              </Button>
                            </div>
                          ) : isPendingPay ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => openPaymentModal(r)}
                            >
                              <CreditCard className="size-3.5" aria-hidden="true" />
                              Bayar
                            </Button>
                          ) : (
                            <span className="type-p3 text-muted-foreground">
                              Menunggu
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}

                {filteredRentals.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 7 : 6}
                      className="py-10 text-center"
                    >
                      <EmptyState
                        variant="inline"
                        icon={FileText}
                        title="Tidak ada tagihan sewa pada filter ini"
                        description="Tagihan sewa yang diajukan oleh tim logistik lapangan akan muncul di antrean ini."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Confirmation Modal */}
      <GlobalModal
        isOpen={paymentModalOpen}
        onClose={() => {
          if (isPending) return;
          setPaymentModalOpen(false);
        }}
        title="Bayar Tagihan Sewa"
        description="Konfirmasi pelunasan tagihan sewa dan catat otomatis ke Arus Kas & Rekap Proyek."
        className="sm:max-w-xl"
        footer={
          selectedRental ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentModalOpen(false)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button
                type="submit"
                form="rental-payment-form"
                disabled={isPending || financeAccounts.length === 0}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {isPending ? "Memproses..." : "Konfirmasi Lunas"}
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedRental && (
          <form
            id="rental-payment-form"
            onSubmit={handleConfirmPayment}
            className="space-y-4"
          >
            {actionMessage && (
              <div
                className={`type-p2 rounded-lg border p-3 font-medium ${
                  actionMessage.error
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                }`}
                role={actionMessage.error ? "alert" : "status"}
              >
                {actionMessage.text}
              </div>
            )}

            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="type-p3 text-muted-foreground">
                    {rentalTypeMeta[selectedRental.type]?.label ?? "Unit Sewa"}
                  </span>
                  <p className="type-h3 text-primary break-words">
                    {selectedRental.name}
                  </p>
                  <p className="type-p3 text-muted-foreground break-words">
                    Pemilik/Vendor:{" "}
                    <strong className="text-foreground">
                      {selectedRental.landlordName || selectedRental.vendorName}
                    </strong>
                    {selectedRental.projectName &&
                      ` · ${selectedRental.projectName}`}
                  </p>
                  {selectedRental.type === "HOUSE" &&
                    selectedRental.propertyAddress && (
                      <p className="type-p3 mt-1 text-muted-foreground break-words">
                        Lokasi: {selectedRental.propertyAddress}
                        {selectedRental.occupantCount
                          ? ` (${selectedRental.occupantCount} tukang)`
                          : ""}
                      </p>
                    )}
                </div>
                <div className="text-right shrink-0">
                  <span className="type-p3 text-muted-foreground">
                    Total Tagihan
                  </span>
                  <div className="type-kpi text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(selectedRental.totalCost)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-3 space-y-2 bg-muted/25">
              <span className="type-p3 font-bold text-primary flex items-center gap-1.5">
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                Rekening Tujuan Penerima
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="rental-bank-name" className="type-p3">
                    Nama Bank
                  </Label>
                  <Input
                    id="rental-bank-name"
                    placeholder="mis. BCA / Mandiri"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rental-account-number" className="type-p3">
                    No. Rekening
                  </Label>
                  <Input
                    id="rental-account-number"
                    placeholder="1234567890"
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rental-account-name" className="type-p3">
                    Atas Nama
                  </Label>
                  <Input
                    id="rental-account-name"
                    placeholder="Nama pemilik rekening"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rental-source-account">
                  Sumber Buku Kas / Bank *
                </Label>
                <Select
                  value={formAccountId}
                  onValueChange={setFormAccountId}
                  disabled={isPending || financeAccounts.length === 0}
                >
                  <SelectTrigger id="rental-source-account" className="w-full">
                    <SelectValue placeholder="Pilih rekening kas / bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {financeAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.accountName} — {formatCurrency(acc.balance)}
                        {acc.accountNumber ? ` (${acc.accountNumber})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="type-p3 text-muted-foreground">
                  Saldo dipotong otomatis sebesar{" "}
                  {formatCurrency(selectedRental.totalCost)}.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rental-proof-doc-kind">Jenis Dokumen Bukti</Label>
                <Select
                  value={formProofDocType}
                  onValueChange={(value) =>
                    setFormProofDocType(value as "BKT" | "BON" | "KWT" | "INV")
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="rental-proof-doc-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BKT">Bukti Transfer (BKT)</SelectItem>
                    <SelectItem value="KWT">Kwitansi Tunai (KWT)</SelectItem>
                    <SelectItem value="BON">Bon / Nota / Struk (BON)</SelectItem>
                    <SelectItem value="INV">Invoice / Faktur (INV)</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Bukti Transfer *</Label>
                <FinancePaymentProofUpload
                  value={formProofFile}
                  onChange={setFormProofFile}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rental-finance-notes">
                  Catatan (Opsional)
                </Label>
                <Input
                  id="rental-finance-notes"
                  placeholder="Catatan pelunasan, nomor referensi bank..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
            </div>
          </form>
        )}
      </GlobalModal>

      <FinancePaymentProofReplacement
        key={
          replacingRental
            ? `${replacingRental.id}-${replacingRental.proofOfPaymentUrl ?? ""}`
            : "none"
        }
        existingProofUrl={replacingRental?.proofOfPaymentUrl ?? undefined}
        label={
          replacingRental
            ? `bukti pembayaran sewa ${replacingRental.name}`
            : "bukti pembayaran sewa"
        }
        buttonLabel="Ganti Bukti"
        allowAllProofFormats
        open={replacingRental !== null}
        onOpenChange={(open) => {
          if (!open) setReplacingRental(null);
        }}
        showTrigger={false}
        onSubmitFile={async (file) => {
          if (!replacingRental) {
            return {
              success: false,
              message: "Data sewa tidak ditemukan.",
            };
          }
          const formData = new FormData();
          formData.set("rentalId", replacingRental.id);
          formData.set("proof", file);
          return replaceRentalPaymentProof(formData);
        }}
        onSaved={() => {
          setReplacingRental(null);
          getRentals()
            .then((fresh) => setHydratedRentals(fresh))
            .catch(() => undefined);
          router.refresh();
        }}
      />
    </div>
  );
}
