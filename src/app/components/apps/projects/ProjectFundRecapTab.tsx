"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  HardHat,
  Boxes,
  Wrench,
  Fuel,
  Download,
  Printer,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Filter,
  DollarSign,
  Receipt,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FundCategoryKey = "TUKANG" | "BAHAN" | "INVENTARIS" | "OPERASIONAL";

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
  requestCategory?: string | null;
  fieldCategory?: string | null;
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
  const num = typeof val === "string" ? parseFloat(val) : Number(val || 0);
  if (isNaN(num)) return "Rp 0";
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Function to classify a ticket into one of the 4 fund categories
export function classifyTicketFundCategory(ticket: FundTicketItem): {
  key: FundCategoryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
} {
  const title = (ticket.title || "").toLowerCase();
  const desc = (ticket.items || []).map((i) => i.itemName.toLowerCase()).join(" ");
  const text = `${title} ${desc}`;
  const reqCat = (ticket.requestCategory || "").toUpperCase();
  const fieldCat = (ticket.fieldCategory || "").toUpperCase();
  const type = (ticket.type || "").toUpperCase();

  // 1. Ambilan Tukang (Labor/Wage/Kasbon)
  const isLabor =
    fieldCat === "LABOR" ||
    reqCat === "KASBON" ||
    /tukang|mandor|upah|kasbon|gaji|ambilan|tenaga|pekerja|borongan|ongkos/.test(text);

  if (isLabor) {
    return {
      key: "TUKANG",
      label: "Ambilan Tukang",
      icon: HardHat,
      badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300",
    };
  }

  // 2. Barang Inventaris (Equipment, Tools, Machinery, Rental)
  const isInventaris =
    /inventaris|alat|sewa|mesin|genset|molen|peralatan|perkakas|gerobak|scaffolding|helm|rompi|cangkul|meteran|equipment|aset/.test(text);

  if (isInventaris) {
    return {
      key: "INVENTARIS",
      label: "Barang Inventaris",
      icon: Wrench,
      badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300",
    };
  }

  // 3. Pembelanjaan Bahan (Materials)
  const isBahan =
    type === "MATERIAL" ||
    reqCat === "MATERIAL" ||
    reqCat === "WAREHOUSE" ||
    fieldCat === "DIRECT_STORE" ||
    /bahan|material|semen|pasir|batu|besi|cat|keramik|kayu|paku|pipa|bata|toko|triplek|baut|seng/.test(text);

  if (isBahan) {
    return {
      key: "BAHAN",
      label: "Pembelanjaan Bahan",
      icon: Boxes,
      badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  }

  // 4. Operasional Lapangan & Lainnya (BBM, Transport, Konsumsi, dsb)
  return {
    key: "OPERASIONAL",
    label: "Operasional & Lainnya",
    icon: Fuel,
    badgeClass: "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:bg-slate-800 dark:text-slate-300",
  };
}

export default function ProjectFundRecapTab({
  projectTitle,
  projectCode,
  contractValue,
  tickets = [],
  stockItems = [],
}: ProjectFundRecapTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | FundCategoryKey>("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"ALL" | "PAID" | "PENDING">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Process & Categorize all tickets with material catalog pricing
  const classifiedTickets = useMemo(() => {
    const cleanStr = (s: string) =>
      s
        .toLowerCase()
        .replace(/½/g, "1/2")
        .replace(/[\/,\-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return tickets.map((t) => {
      const cat = classifyTicketFundCategory(t);
      let amountNum = Number(t.amount || 0);

      // If ticket amount is 0 and it has items, calculate from items * catalog price
      if (amountNum === 0 && t.items && t.items.length > 0) {
        let itemsSum = 0;
        for (const it of t.items) {
          const qty = Number(it.quantity || 0);
          const estCost = Number(it.estimatedCost || 0);
          const targetClean = cleanStr(it.itemName);

          const matchedStock = stockItems.find((s) => {
            if (s.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()) return true;
            if (cleanStr(s.name) === targetClean) return true;
            const sClean = cleanStr(s.name);
            return sClean.includes(targetClean) || targetClean.includes(sClean);
          });

          const stockPrice = matchedStock?.unitPrice ? Number(matchedStock.unitPrice) : 0;
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

  // Aggregated Summary by Category
  const summary = useMemo(() => {
    const res: Record<
      FundCategoryKey,
      {
        requested: number;
        paid: number;
        count: number;
      }
    > = {
      TUKANG: { requested: 0, paid: 0, count: 0 },
      BAHAN: { requested: 0, paid: 0, count: 0 },
      INVENTARIS: { requested: 0, paid: 0, count: 0 },
      OPERASIONAL: { requested: 0, paid: 0, count: 0 },
    };

    let grandRequested = 0;
    let grandPaid = 0;

    for (const t of classifiedTickets) {
      if (t.status === "REJECTED") continue;

      res[t.category.key].requested += t.amountNum;
      if (t.paid) {
        res[t.category.key].paid += t.amountNum;
      }
      res[t.category.key].count += 1;

      grandRequested += t.amountNum;
      if (t.paid) {
        grandPaid += t.amountNum;
      }
    }

    return {
      categories: res,
      grandRequested,
      grandPaid,
      remainingContract: Math.max(0, contractValue - grandRequested),
      totalTicketsCount: classifiedTickets.filter((t) => t.status !== "REJECTED").length,
    };
  }, [classifiedTickets, contractValue]);

  // Filtered tickets list
  const filteredTickets = useMemo(() => {
    return classifiedTickets.filter((t) => {
      // Category filter
      if (selectedCategory !== "ALL" && t.category.key !== selectedCategory) {
        return false;
      }
      // Payment status filter
      if (paymentStatusFilter === "PAID" && !t.paid) return false;
      if (paymentStatusFilter === "PENDING" && t.paid) return false;
      // Search
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

  // Export CSV
  const handleExportCSV = () => {
    const rows = [
      [`Rekap Penggunaan Dana Proyek · ${projectTitle}`],
      [`Kode Proyek: ${projectCode}`],
      [`Nilai Kontrak: ${currency(contractValue)}`],
      [`Tanggal Ekspor: ${new Date().toLocaleDateString("id-ID")}`],
      [],
      ["RINGKASAN PER KATEGORI"],
      ["Kategori", "Total Di-request", "Total Cair (Lunas)", "Jumlah Tiket"],
      ["Ambilan Tukang", summary.categories.TUKANG.requested.toString(), summary.categories.TUKANG.paid.toString(), summary.categories.TUKANG.count.toString()],
      ["Pembelanjaan Bahan", summary.categories.BAHAN.requested.toString(), summary.categories.BAHAN.paid.toString(), summary.categories.BAHAN.count.toString()],
      ["Barang Inventaris", summary.categories.INVENTARIS.requested.toString(), summary.categories.INVENTARIS.paid.toString(), summary.categories.INVENTARIS.count.toString()],
      ["Operasional & Lainnya", summary.categories.OPERASIONAL.requested.toString(), summary.categories.OPERASIONAL.paid.toString(), summary.categories.OPERASIONAL.count.toString()],
      ["TOTAL KESELURUHAN", summary.grandRequested.toString(), summary.grandPaid.toString(), summary.totalTicketsCount.toString()],
      [],
      ["RINCIAN TIKET DANA"],
      ["No Tiket", "Kategori", "Uraian / Judul", "Pemohon", "Tanggal", "Nominal (Rp)", "Status Pencairan"],
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

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rekap_dana_${projectCode || "proyek"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Rekap Penggunaan Dana · {projectTitle}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rekapitulasi realisasi pengajuan dana berdasarkan tiket proyek untuk ambilan tukang, bahan, dan inventaris.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <Download className="size-3.5" />
            <span>Ekspor CSV</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <Printer className="size-3.5" />
            <span>Cetak Rekap</span>
          </Button>
        </div>
      </div>

      {/* 2. Top Metric Cards (Overall Project Financial Health) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Receipt className="size-3.5 text-primary" />
            Nilai Kontrak Proyek
          </span>
          <p className="mt-1 text-base sm:text-lg font-bold text-foreground">
            {currency(contractValue)}
          </p>
          <span className="text-[10px] text-muted-foreground">Pagu anggaran dasar</span>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <DollarSign className="size-3.5" />
            Total Dana Di-request
          </span>
          <p className="mt-1 text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">
            {currency(summary.grandRequested)}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {contractValue > 0
              ? `${Math.round((summary.grandRequested / contractValue) * 100)}% dari nilai kontrak`
              : `${summary.totalTicketsCount} pengajuan`}
          </span>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" />
            Total Realisasi Cair
          </span>
          <p className="mt-1 text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {currency(summary.grandPaid)}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {summary.grandRequested > 0
              ? `${Math.round((summary.grandPaid / summary.grandRequested) * 100)}% pencairan tiket`
              : "Belum ada pencairan"}
          </span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-muted-foreground" />
            Sisa Pagu Anggaran
          </span>
          <p className="mt-1 text-base sm:text-lg font-bold text-foreground">
            {currency(summary.remainingContract)}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {contractValue > 0
              ? `${Math.max(0, Math.round((summary.remainingContract / contractValue) * 100))}% sisa kontrak`
              : "—"}
          </span>
        </div>
      </div>

      {/* 3. The 4 Category Cards (Requested by User) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Ambilan Tukang */}
        <div
          onClick={() => setSelectedCategory(selectedCategory === "TUKANG" ? "ALL" : "TUKANG")}
          className={`cursor-pointer rounded-xl border p-4 shadow-2xs transition-all hover:border-amber-500/60 ${
            selectedCategory === "TUKANG"
              ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20"
              : "border-border/80 bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
              <HardHat className="size-4 shrink-0" />
              Ambilan Tukang
            </span>
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
              {summary.categories.TUKANG.count} Tiket
            </Badge>
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">
            {currency(summary.categories.TUKANG.requested)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            <span>Cair (Lunas):</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {currency(summary.categories.TUKANG.paid)}
            </strong>
          </div>
        </div>

        {/* Card 2: Pembelanjaan Bahan */}
        <div
          onClick={() => setSelectedCategory(selectedCategory === "BAHAN" ? "ALL" : "BAHAN")}
          className={`cursor-pointer rounded-xl border p-4 shadow-2xs transition-all hover:border-emerald-500/60 ${
            selectedCategory === "BAHAN"
              ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20"
              : "border-border/80 bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Boxes className="size-4 shrink-0" />
              Pembelanjaan Bahan
            </span>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              {summary.categories.BAHAN.count} Tiket
            </Badge>
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">
            {currency(summary.categories.BAHAN.requested)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            <span>Cair (Lunas):</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {currency(summary.categories.BAHAN.paid)}
            </strong>
          </div>
        </div>

        {/* Card 3: Barang Inventaris */}
        <div
          onClick={() => setSelectedCategory(selectedCategory === "INVENTARIS" ? "ALL" : "INVENTARIS")}
          className={`cursor-pointer rounded-xl border p-4 shadow-2xs transition-all hover:border-blue-500/60 ${
            selectedCategory === "INVENTARIS"
              ? "border-blue-500 bg-blue-500/5 ring-2 ring-blue-500/20"
              : "border-border/80 bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
              <Wrench className="size-4 shrink-0" />
              Barang Inventaris
            </span>
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
              {summary.categories.INVENTARIS.count} Tiket
            </Badge>
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">
            {currency(summary.categories.INVENTARIS.requested)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            <span>Cair (Lunas):</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {currency(summary.categories.INVENTARIS.paid)}
            </strong>
          </div>
        </div>

        {/* Card 4: Operasional & Lainnya */}
        <div
          onClick={() => setSelectedCategory(selectedCategory === "OPERASIONAL" ? "ALL" : "OPERASIONAL")}
          className={`cursor-pointer rounded-xl border p-4 shadow-2xs transition-all hover:border-slate-500/60 ${
            selectedCategory === "OPERASIONAL"
              ? "border-slate-500 bg-slate-500/5 ring-2 ring-slate-500/20"
              : "border-border/80 bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Fuel className="size-4 shrink-0" />
              Operasional / Lainnya
            </span>
            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600 border-slate-500/30">
              {summary.categories.OPERASIONAL.count} Tiket
            </Badge>
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">
            {currency(summary.categories.OPERASIONAL.requested)}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-2">
            <span>Cair (Lunas):</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {currency(summary.categories.OPERASIONAL.paid)}
            </strong>
          </div>
        </div>
      </div>

      {/* 4. Rincian Tiket Data Table Card */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-bold">Rincian Pengajuan Dana Berdasarkan Tiket</CardTitle>
            <CardDescription className="text-xs">
              Daftar seluruh tiket material, upah tukang, dan operasional yang diajukan untuk proyek ini.
            </CardDescription>
          </div>

          {/* Filters Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Payment filter pills */}
            <div className="flex items-center rounded-lg border border-border/80 bg-muted/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPaymentStatusFilter("ALL")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  paymentStatusFilter === "ALL" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground"
                }`}
              >
                Semua Status
              </button>
              <button
                type="button"
                onClick={() => setPaymentStatusFilter("PAID")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  paymentStatusFilter === "PAID" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground"
                }`}
              >
                Lunas
              </button>
              <button
                type="button"
                onClick={() => setPaymentStatusFilter("PENDING")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  paymentStatusFilter === "PENDING" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground"
                }`}
              >
                Pending
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-44 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari tiket / judul..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-2.5">No. Tiket</th>
                  <th className="px-3.5 py-2.5">Kategori Rekap</th>
                  <th className="px-3.5 py-2.5">Uraian / Judul</th>
                  <th className="px-3.5 py-2.5">Pemohon</th>
                  <th className="px-3.5 py-2.5">Tanggal</th>
                  <th className="px-3.5 py-2.5 text-right">Nominal Request</th>
                  <th className="px-3.5 py-2.5 text-center">Status Pencairan</th>
                  <th className="px-3.5 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredTickets.map((ticket) => {
                  const Icon = ticket.category.icon;
                  return (
                    <tr key={ticket.id} className="hover:bg-muted/20 transition-colors">
                      {/* Ticket Number */}
                      <td className="px-3.5 py-2.5 font-mono font-medium text-primary">
                        <Link
                          href={`/apps/tickets?tab=all&openSheet=${encodeURIComponent(ticket.id)}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          {ticket.ticketNumber}
                          <ArrowUpRight className="size-3 opacity-60" />
                        </Link>
                      </td>

                      {/* Category Badge */}
                      <td className="px-3.5 py-2.5">
                        <Badge variant="outline" className={`gap-1 text-[11px] ${ticket.category.badgeClass}`}>
                          <Icon className="size-3" />
                          <span>{ticket.category.label}</span>
                        </Badge>
                      </td>

                      {/* Title & Items preview */}
                      <td className="px-3.5 py-2.5 max-w-xs">
                        <p className="font-semibold text-foreground truncate" title={ticket.title}>
                          {ticket.title}
                        </p>
                        {ticket.items && ticket.items.length > 0 && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {ticket.items.map((it) => `${it.itemName} (${it.quantity} ${it.unit})`).join(", ")}
                          </p>
                        )}
                      </td>

                      {/* Requester */}
                      <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap">
                        {ticket.requesterName}
                      </td>

                      {/* Date */}
                      <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDateIndo(ticket.createdAt)}
                      </td>

                      {/* Amount */}
                      <td className="px-3.5 py-2.5 text-right font-bold text-foreground tabular-nums">
                        {currency(ticket.amountNum)}
                      </td>

                      {/* Payment Status */}
                      <td className="px-3.5 py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className={
                            ticket.paid
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]"
                          }
                        >
                          {ticket.paid ? "Cair (Lunas)" : "Menunggu Cair"}
                        </Badge>
                      </td>

                      {/* Action */}
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary hover:text-primary"
                        >
                          <Link href={`/apps/tickets?tab=all&openSheet=${encodeURIComponent(ticket.id)}`}>
                            Buka Tiket
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {filteredTickets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                      Tidak ada pengajuan dana yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
