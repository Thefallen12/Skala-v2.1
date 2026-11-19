"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  DollarSign,
  Download,
  Fuel,
  HardHat,
  Home,
  Layers,
  Printer,
  Receipt,
  Search,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import ProjectActionButton from "./ProjectActionButton";

export type FundCategoryKey =
  | "TUKANG"
  | "BAHAN"
  | "SEWA"
  | "INVENTARIS"
  | "OPERASIONAL";

export interface FundTicketItem {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  amount: string | number | null;
  paid: boolean;
  paidAt?: string | null;
  requesterName: string;
  type?: string | null;
  ticketType?: string | null;
  requestCategory?: string | null;
  fieldCategory?: string | null;
  fundCategory?: FundCategoryKey | null;
  createdAt?: string | null;
  items?: Array<{
    itemName: string;
    quantity: number;
    unit: string;
    estimatedCost?: string | number | null;
  }>;
}

interface ProjectFundRecapTabProps {
  projectTitle: string;
  projectCode: string;
  contractValue: number;
  tickets: FundTicketItem[];
  stockItems?: Array<{
    name: string;
    unitPrice?: string | number | null;
    unit?: string;
  }>;
}

function currency(val: number | string | null | undefined): string {
  const num = typeof val === "string" ? Number.parseFloat(val) : Number(val || 0);
  if (Number.isNaN(num)) return "Rp 0";
  return `Rp ${Math.round(num).toLocaleString("id-ID")}`;
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const SEWA_RENTAL_TEXT_PATTERN =
  /rumah\s*sewa|mess\s*(tukang|pekerja|proyek)?|kontrakan|basecamp|kendaraan\s*sewa|sewa\s*(rumah|mess|kos|kendaraan|armada|alat|truk|truck|mobil|pickup|excavator|molen|genset|stamper)|\bsewa\b/i;

export function classifyTicketFundCategory(ticket: FundTicketItem): {
  key: FundCategoryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
} {
  const title = (ticket.title || "").toLowerCase();
  const desc = (ticket.items || [])
    .map((item) => item.itemName.toLowerCase())
    .join(" ");
  const text = `${title} ${desc}`;
  const reqCat = (ticket.requestCategory || "").toUpperCase();
  const fieldCat = (ticket.fieldCategory || "").toUpperCase();
  const type = (ticket.type || "").toUpperCase();
  const ticketType = (ticket.ticketType || "").toUpperCase();

  const isSewa =
    ticket.fundCategory === "SEWA" ||
    reqCat === "HOUSE_RENTAL" ||
    reqCat === "VEHICLE_RENTAL" ||
    reqCat === "EQUIPMENT_REQUEST" ||
    fieldCat === "HOUSE_RENTAL" ||
    fieldCat === "VEHICLE_RENTAL" ||
    fieldCat === "RENTAL" ||
    ticketType === "EQUIPMENT_REQUEST" ||
    ticketType === "HOUSE_RENTAL" ||
    ticketType === "VEHICLE_RENTAL" ||
    ticketType === "EQUIPMENT_RENTAL" ||
    SEWA_RENTAL_TEXT_PATTERN.test(text);

  if (isSewa) {
    return {
      key: "SEWA",
      label: "Rumah & Kendaraan Sewa",
      icon: Home,
      badgeClass:
        "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-300",
    };
  }

  if (fieldCat === "HAULING" || /langsir/.test(text)) {
    return {
      key: "OPERASIONAL",
      label: "Operasional & Lainnya",
      icon: Fuel,
      badgeClass:
        "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:bg-slate-800 dark:text-slate-300",
    };
  }

  const isLabor =
    ticket.fundCategory === "TUKANG" ||
    fieldCat === "LABOR" ||
    reqCat === "KASBON" ||
    /tukang|mandor|upah|kasbon|gaji|ambilan|tenaga|pekerja|borongan|ongkos/.test(
      text,
    );

  if (isLabor) {
    return {
      key: "TUKANG",
      label: "Ambilan Tukang",
      icon: HardHat,
      badgeClass:
        "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300",
    };
  }

  const isInventaris =
    ticket.fundCategory === "INVENTARIS" ||
    /inventaris|alat|mesin|genset|molen|peralatan|perkakas|gerobak|scaffolding|helm|rompi|cangkul|meteran|equipment|aset/.test(
      text,
    );

  if (isInventaris) {
    return {
      key: "INVENTARIS",
      label: "Barang Inventaris",
      icon: Wrench,
      badgeClass:
        "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300",
    };
  }

  const isBahan =
    ticket.fundCategory === "BAHAN" ||
    type === "MATERIAL" ||
    reqCat === "MATERIAL" ||
    reqCat === "WAREHOUSE" ||
    reqCat === "STOCK" ||
    reqCat === "NEW_PURCHASE" ||
    reqCat === "MATERIAL_CONTRACT" ||
    fieldCat === "MATERIAL" ||
    fieldCat === "DIRECT_STORE" ||
    /bahan|material|semen|pasir|batu|besi|cat|keramik|kayu|paku|pipa|bata|toko|triplek|baut|seng/.test(
      text,
    );

  if (isBahan) {
    return {
      key: "BAHAN",
      label: "Pembelanjaan Bahan",
      icon: Boxes,
      badgeClass:
        "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  }

  return {
    key: "OPERASIONAL",
    label: "Operasional & Lainnya",
    icon: Fuel,
    badgeClass:
      "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:bg-slate-800 dark:text-slate-300",
  };
}

export default function ProjectFundRecapTab({
  projectTitle,
  projectCode,
  contractValue,
  tickets = [],
  stockItems = [],
}: ProjectFundRecapTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    "ALL" | FundCategoryKey
  >("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<
    "ALL" | "PAID" | "PENDING"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const classifiedTickets = useMemo(() => {
    const cleanStr = (s: string) =>
      s
        .toLowerCase()
        .replace(/½/g, "1/2")
        .replace(/1[,.]5/g, "1/2")
        .replace(/[\/,\-_x×]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return tickets
      .filter((ticket) => ticket.status !== "REJECTED")
      .map((t) => {
        const cat = classifyTicketFundCategory(t);
        let amountNum = Number(t.amount || 0);

        if (amountNum === 0 && t.items && t.items.length > 0) {
          let itemsSum = 0;
          for (const it of t.items) {
            const qty = Number(it.quantity || 0);
            const estCost = Number(it.estimatedCost || 0);
            const targetClean = cleanStr(it.itemName);

            const matchedStock = stockItems.find((s) => {
              if (
                s.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()
              ) {
                return true;
              }
              if (cleanStr(s.name) === targetClean) return true;
              const sClean = cleanStr(s.name);
              return (
                sClean.includes(targetClean) || targetClean.includes(sClean)
              );
            });

            const stockPrice = matchedStock?.unitPrice
              ? Number(matchedStock.unitPrice)
              : 0;
            const unitPrice = stockPrice > 0 ? stockPrice : estCost;
            itemsSum += qty * unitPrice;
          }
          if (itemsSum > 0) {
            amountNum = itemsSum;
          }
        }

        return {
          ...t,
          category: cat,
          amountNum,
        };
      });
  }, [tickets, stockItems]);

  const summary = useMemo(() => {
    const res: Record<
      FundCategoryKey,
      { requested: number; paid: number; count: number }
    > = {
      TUKANG: { requested: 0, paid: 0, count: 0 },
      BAHAN: { requested: 0, paid: 0, count: 0 },
      SEWA: { requested: 0, paid: 0, count: 0 },
      INVENTARIS: { requested: 0, paid: 0, count: 0 },
      OPERASIONAL: { requested: 0, paid: 0, count: 0 },
    };

    let grandRequested = 0;
    let grandPaid = 0;

    for (const t of classifiedTickets) {
      res[t.category.key].requested += t.amountNum;
      if (t.paid) res[t.category.key].paid += t.amountNum;
      res[t.category.key].count += 1;

      grandRequested += t.amountNum;
      if (t.paid) grandPaid += t.amountNum;
    }

    return {
      categories: res,
      grandRequested,
      grandPaid,
      remainingContract: Math.max(0, contractValue - grandRequested),
      totalTicketsCount: classifiedTickets.length,
    };
  }, [classifiedTickets, contractValue]);

  const filteredTickets = useMemo(() => {
    return classifiedTickets.filter((t) => {
      if (selectedCategory !== "ALL" && t.category.key !== selectedCategory) {
        return false;
      }
      if (paymentStatusFilter === "PAID" && !t.paid) return false;
      if (paymentStatusFilter === "PENDING" && t.paid) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNum = t.ticketNumber.toLowerCase().includes(q);
        const matchReq = t.requesterName.toLowerCase().includes(q);
        if (!matchTitle && !matchNum && !matchReq) return false;
      }
      return true;
    });
  }, [classifiedTickets, selectedCategory, paymentStatusFilter, searchQuery]);

  const handleExportCSV = () => {
    const rows = [
      [`Rekap Penggunaan Dana Proyek · ${projectTitle}`],
      [`Kode Proyek: ${projectCode}`],
      [`Nilai Kontrak: ${currency(contractValue)}`],
      [`Tanggal Ekspor: ${new Date().toLocaleDateString("id-ID")}`],
      [],
      ["RINGKASAN PER KATEGORI"],
      ["Kategori", "Total Di-request", "Total Cair (Lunas)", "Jumlah Tiket"],
      [
        "Ambilan Tukang",
        summary.categories.TUKANG.requested.toString(),
        summary.categories.TUKANG.paid.toString(),
        summary.categories.TUKANG.count.toString(),
      ],
      [
        "Pembelanjaan Bahan",
        summary.categories.BAHAN.requested.toString(),
        summary.categories.BAHAN.paid.toString(),
        summary.categories.BAHAN.count.toString(),
      ],
      [
        "Rumah & Kendaraan Sewa",
        summary.categories.SEWA.requested.toString(),
        summary.categories.SEWA.paid.toString(),
        summary.categories.SEWA.count.toString(),
      ],
      [
        "Barang Inventaris",
        summary.categories.INVENTARIS.requested.toString(),
        summary.categories.INVENTARIS.paid.toString(),
        summary.categories.INVENTARIS.count.toString(),
      ],
      [
        "Operasional & Lainnya",
        summary.categories.OPERASIONAL.requested.toString(),
        summary.categories.OPERASIONAL.paid.toString(),
        summary.categories.OPERASIONAL.count.toString(),
      ],
      [
        "TOTAL KESELURUHAN",
        summary.grandRequested.toString(),
        summary.grandPaid.toString(),
        summary.totalTicketsCount.toString(),
      ],
      [],
      ["RINCIAN TIKET DANA"],
      [
        "No Tiket",
        "Kategori",
        "Uraian / Judul",
        "Pemohon",
        "Tanggal",
        "Nominal (Rp)",
        "Status Pencairan",
      ],
    ];

    for (const t of classifiedTickets) {
      rows.push([
        t.ticketNumber,
        t.category.label,
        `"${t.title.replace(/"/g, '""')}"`,
        t.requesterName,
        formatDateIndo(t.createdAt),
        t.amountNum.toString(),
        t.paid ? "Lunas (Cair)" : "Menunggu Pencairan",
      ]);
    }

    const csvString = "\uFEFF" + rows.map((e) => e.join(",")).join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const objUrl = URL.createObjectURL(blob);
    const filename = `rekap_dana_${projectCode || "proyek"}.csv`;
    const link = document.createElement("a");
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    toast.success(`Unduhan ${filename} dimulai.`);
  };

  const categoryCards: Array<{
    key: FundCategoryKey;
    label: string;
    unitLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
    activeClass: string;
  }> = [
    {
      key: "TUKANG",
      label: "Ambilan Tukang",
      unitLabel: "Tiket",
      icon: HardHat,
      accentClass: "text-amber-600 dark:text-amber-400",
      activeClass: "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20",
    },
    {
      key: "BAHAN",
      label: "Pembelanjaan Bahan",
      unitLabel: "Tiket",
      icon: Boxes,
      accentClass: "text-emerald-600 dark:text-emerald-400",
      activeClass:
        "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20",
    },
    {
      key: "SEWA",
      label: "Rumah & Sewa",
      unitLabel: "Item",
      icon: Home,
      accentClass: "text-teal-700 dark:text-teal-300",
      activeClass: "border-teal-500 bg-teal-500/5 ring-2 ring-teal-500/20",
    },
    {
      key: "INVENTARIS",
      label: "Barang Inventaris",
      unitLabel: "Tiket",
      icon: Wrench,
      accentClass: "text-blue-600 dark:text-blue-400",
      activeClass: "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20",
    },
    {
      key: "OPERASIONAL",
      label: "Operasional",
      unitLabel: "Tiket",
      icon: Fuel,
      accentClass: "text-muted-foreground",
      activeClass: "border-primary bg-primary/5 ring-2 ring-primary/20",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="type-h2 text-foreground">
            Rekap Dana · {projectTitle}
          </h2>
          <p className="type-p3 mt-0.5 text-muted-foreground">
            Realisasi pengajuan dana proyek untuk tukang, bahan, sewa, dan
            inventaris.
          </p>
        </div>

        <div className="ml-auto flex items-center justify-end gap-2">
          <ProjectActionButton
            type="button"
            label="Ekspor CSV"
            icon={<Download className="size-3.5" aria-hidden="true" />}
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
          />
          <ProjectActionButton
            type="button"
            label="Cetak Rekap"
            icon={<Printer className="size-3.5" aria-hidden="true" />}
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          />
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="type-p3 flex items-center gap-1.5 font-semibold text-muted-foreground">
            <Receipt className="size-3.5 text-primary" aria-hidden="true" />
            Nilai Kontrak Proyek
          </span>
          <p className="type-kpi mt-1 text-foreground">
            {currency(contractValue)}
          </p>
          <span className="type-p3 text-muted-foreground">
            Pagu anggaran dasar
          </span>
        </div>

        <div className="rounded-xl border border-warning/30 bg-card p-4 shadow-2xs">
          <span className="type-p3 flex items-center gap-1.5 font-semibold text-warning">
            <DollarSign className="size-3.5" aria-hidden="true" />
            Total Dana Diajukan
          </span>
          <p className="type-kpi mt-1 text-warning">
            {currency(summary.grandRequested)}
          </p>
          <span className="type-p3 text-muted-foreground tabular-nums">
            {contractValue > 0
              ? `${Math.round((summary.grandRequested / contractValue) * 100)}% dari kontrak`
              : `${summary.totalTicketsCount} pengajuan`}
          </span>
        </div>

        <div className="rounded-xl border border-success/30 bg-card p-4 shadow-2xs">
          <span className="type-p3 flex items-center gap-1.5 font-semibold text-success">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Total Realisasi Cair
          </span>
          <p className="type-kpi mt-1 text-success">
            {currency(summary.grandPaid)}
          </p>
          <span className="type-p3 text-muted-foreground tabular-nums">
            {summary.grandRequested > 0
              ? `${Math.round((summary.grandPaid / summary.grandRequested) * 100)}% pencairan`
              : "Belum ada pencairan"}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="type-p3 flex items-center gap-1.5 font-semibold text-muted-foreground">
            <Layers className="size-3.5" aria-hidden="true" />
            Sisa Pagu Anggaran
          </span>
          <p className="type-kpi mt-1 text-foreground">
            {currency(summary.remainingContract)}
          </p>
          <span className="type-p3 text-muted-foreground tabular-nums">
            {contractValue > 0
              ? `${Math.max(0, Math.round((summary.remainingContract / contractValue) * 100))}% sisa kontrak`
              : "—"}
          </span>
        </div>
      </div>

      {/* 5 Category Filter Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {categoryCards.map((cat) => {
          const Icon = cat.icon;
          const stats = summary.categories[cat.key];
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() =>
                setSelectedCategory(isSelected ? "ALL" : cat.key)
              }
              aria-pressed={isSelected}
              className={cn(
                "rounded-xl border bg-card p-4 text-left shadow-2xs transition-all hover:border-primary/50",
                isSelected ? cat.activeClass : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "type-p3 flex items-center gap-1.5 font-bold",
                    cat.accentClass,
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{cat.label}</span>
                </span>
                <Badge variant="outline" className="shrink-0 tabular-nums">
                  {stats.count} {cat.unitLabel}
                </Badge>
              </div>
              <p className="type-kpi mt-2 text-foreground">
                {currency(stats.requested)}
              </p>
              <div className="type-p3 mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-muted-foreground tabular-nums">
                <span>Lunas:</span>
                <strong className="text-success">{currency(stats.paid)}</strong>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tickets Table Card */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="type-h3 text-foreground">
              Rincian Pengajuan Dana per Tiket
            </CardTitle>
            <CardDescription className="type-p3">
              Daftar tiket yang diperhitungkan. Tiket ditolak tidak masuk rekap.
            </CardDescription>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={paymentStatusFilter === "ALL" ? "secondary" : "ghost"}
                onClick={() => setPaymentStatusFilter("ALL")}
              >
                Semua
              </Button>
              <Button
                type="button"
                size="sm"
                variant={paymentStatusFilter === "PAID" ? "secondary" : "ghost"}
                onClick={() => setPaymentStatusFilter("PAID")}
              >
                Lunas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  paymentStatusFilter === "PENDING" ? "secondary" : "ghost"
                }
                onClick={() => setPaymentStatusFilter("PENDING")}
              >
                Pending
              </Button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="Cari tiket / judul..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredTickets.length === 0 ? (
            <EmptyState
              title="Belum ada pengajuan tiket"
              description="Tidak ada pengajuan dana yang cocok dengan filter saat ini."
            />
          ) : (
            <>
              {/* Mobile Card View (< 768px) */}
              <div className="space-y-2.5 md:hidden">
                {filteredTickets.map((ticket) => {
                  const Icon = ticket.category.icon;
                  const href = ticket.id.startsWith("rental-")
                    ? "/apps/logistics?tab=equipment"
                    : `/apps/tickets?tab=all&openSheet=${encodeURIComponent(ticket.id)}`;
                  return (
                    <div
                      key={ticket.id}
                      className="space-y-2.5 rounded-xl border border-border bg-card p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={href}
                            className="type-p3 inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                          >
                            {ticket.ticketNumber}
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                          </Link>
                          <p className="type-p2 mt-0.5 font-semibold text-foreground">
                            {ticket.title}
                          </p>
                        </div>
                        <Badge
                          variant={ticket.paid ? "success" : "warning"}
                          className="shrink-0"
                        >
                          {ticket.paid ? "Lunas" : "Menunggu"}
                        </Badge>
                      </div>

                      {ticket.items && ticket.items.length > 0 && (
                        <p className="type-p3 line-clamp-2 text-muted-foreground">
                          {ticket.items
                            .map(
                              (it) =>
                                `${it.itemName} (${it.quantity} ${it.unit})`,
                            )
                            .join(", ")}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 p-2.5">
                        <Badge
                          variant="outline"
                          className={cn("gap-1", ticket.category.badgeClass)}
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                          <span>{ticket.category.label}</span>
                        </Badge>
                        <span className="type-p2 font-mono font-bold text-foreground tabular-nums">
                          {currency(ticket.amountNum)}
                        </span>
                      </div>

                      <div className="type-p3 flex items-center justify-between text-muted-foreground">
                        <span>Pemohon: {ticket.requesterName}</span>
                        <span>{formatDateIndo(ticket.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Shadcn Table (>= 768px) */}
              <div className="hidden md:block">
                <Table pagination={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. Tiket</TableHead>
                      <TableHead>Kategori Rekap</TableHead>
                      <TableHead>Uraian / Judul</TableHead>
                      <TableHead>Pemohon</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">
                        Nominal Request
                      </TableHead>
                      <TableHead className="text-center">
                        Status Pencairan
                      </TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => {
                      const Icon = ticket.category.icon;
                      const href = ticket.id.startsWith("rental-")
                        ? "/apps/logistics?tab=equipment"
                        : `/apps/tickets?tab=all&openSheet=${encodeURIComponent(ticket.id)}`;

                      return (
                        <TableRow key={ticket.id}>
                          <TableCell className="font-mono font-medium text-primary">
                            <Link
                              href={href}
                              className="type-p3 inline-flex items-center gap-1 hover:underline"
                            >
                              {ticket.ticketNumber}
                              <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("gap-1", ticket.category.badgeClass)}
                            >
                              <Icon className="size-3.5" aria-hidden="true" />
                              <span>{ticket.category.label}</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs whitespace-normal">
                            <p
                              className="type-p2 truncate font-semibold text-foreground"
                              title={ticket.title}
                            >
                              {ticket.title}
                            </p>
                            {ticket.items && ticket.items.length > 0 && (
                              <p className="type-p3 truncate text-muted-foreground">
                                {ticket.items
                                  .map(
                                    (it) =>
                                      `${it.itemName} (${it.quantity} ${it.unit})`,
                                  )
                                  .join(", ")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="type-p3 text-muted-foreground">
                            {ticket.requesterName}
                          </TableCell>
                          <TableCell className="type-p3 text-muted-foreground">
                            {formatDateIndo(ticket.createdAt)}
                          </TableCell>
                          <TableCell className="type-p2 text-right font-bold text-foreground tabular-nums">
                            {currency(ticket.amountNum)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={ticket.paid ? "success" : "warning"}
                            >
                              {ticket.paid ? "Lunas" : "Menunggu"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link
                                href={href}
                                aria-label={
                                  ticket.id.startsWith("rental-")
                                    ? `Lihat sewa ${ticket.ticketNumber}`
                                    : `Buka tiket ${ticket.ticketNumber}`
                                }
                              >
                                <ArrowUpRight
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                <span>
                                  {ticket.id.startsWith("rental-")
                                    ? "Lihat Sewa"
                                    : "Buka Tiket"}
                                </span>
                              </Link>
                            </Button>
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
    </div>
  );
}
