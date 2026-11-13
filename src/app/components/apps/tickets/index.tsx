"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  BarChart3,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Filter,
  Package,
  SearchCheck,
  ShieldCheck,
  Truck,
  Wallet,
  Wrench,
} from "lucide-react";
import CardBox from "@/app/components/shared/CardBox";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import TicketFilter from "@/app/components/apps/tickets/TicketFilter";
import TicketListing from "@/app/components/apps/tickets/TicketListing";
import TicketOverviewPanels from "@/app/components/apps/tickets/TicketOverviewPanels";
import TicketStatisticsModal from "./TicketStatisticsModal";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import type { PurchaseVendorOption } from "@/app/components/forms/CreateVendorInline";
import {
  DOStatus,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import {
  formatTicketCurrency,
  getTicketMonthlyStatistics,
  getCountableTickets,
  getTotalTicketValueInCents,
} from "./ticket-statistics";

const TicketStatisticsChart = dynamic(
  () => import("./TicketStatisticsChart"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        Memuat grafik statistik...
      </div>
    ),
  },
);

const TicketRequestDistributionChart = dynamic(
  () => import("./TicketRequestDistributionChart"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Memuat distribusi permintaan...
      </div>
    ),
  },
);

function isMaterialOrLogisticsTicket(ticket: TicketRow): boolean {
  return (
    ticket.type === TicketType.MATERIAL ||
    ticket.requestCategory === TicketRequestCategory.SHIPPING_COST
  );
}

function requiresRoleAction(role: TicketPageRole, ticket: TicketRow): boolean {
  const hasLogisticsWorkflowAction =
    (ticket.requestCategory === TicketRequestCategory.SHIPPING_COST &&
      (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
        ticket.status === TicketStatus.PROCESSED_FINANCE)) ||
    (ticket.type === TicketType.MATERIAL &&
      (((ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
        ticket.status === TicketStatus.PROCESSED_FINANCE) &&
        (ticket.items.some((item) => item.status === "PENDING") ||
          (Boolean(ticket.purchaseOrders?.some((po) => po.paidAt)) &&
            ticket.items.some((item) => item.status !== "PROCESSED_TO_DO")))) ||
        (ticket.status === TicketStatus.IN_TRANSIT &&
          Boolean(
            ticket.deliveryOrders?.some(
              (deliveryOrder) => deliveryOrder.status === DOStatus.IN_TRANSIT,
            ),
          ))));

  switch (role) {
    case UserRole.DIRECTOR:
      return (
        ticket.status === TicketStatus.PENDING_DIRECTOR ||
        hasLogisticsWorkflowAction
      );
    case UserRole.DEPUTY_DIRECTOR:
      return (
        ticket.status === TicketStatus.PENDING_DIRECTOR ||
        hasLogisticsWorkflowAction
      );
    case UserRole.FINANCE:
      return ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT;
    case UserRole.LOGISTICS:
      return (
        isMaterialOrLogisticsTicket(ticket) &&
        (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
          ticket.status === TicketStatus.PROCESSED_FINANCE ||
          ticket.status === TicketStatus.IN_TRANSIT)
      );
    case UserRole.MOVER:
      return (
        isMaterialOrLogisticsTicket(ticket) &&
        ticket.status === TicketStatus.ASSIGNED_TO_MOVER
      );
    case UserRole.ADMINISTRATIONS:
      return (
        ticket.status !== TicketStatus.DRAFT &&
        ticket.status !== TicketStatus.COMPLETED &&
        ticket.status !== TicketStatus.REJECTED
      );
    default:
      return ticket.status === TicketStatus.DRAFT && ticket.canSubmit;
  }
}

function isTicketStatus(value: string | undefined): value is TicketStatus {
  return (
    value !== undefined &&
    Object.values(TicketStatus).some((status) => status === value)
  );
}

export default function TicketsApp({
  tickets,
  projects,
  vendors,
  stockItems,
  role,
  initialOpenSheet,
  initialFilter,
}: {
  tickets: TicketRow[];
  projects: TicketProjectOption[];
  vendors: PurchaseVendorOption[];
  stockItems: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    unitPrice: string;
  }[];
  role: TicketPageRole;
  initialOpenSheet?: string;
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState(() =>
    initialFilter === "ACTIVE" ||
    initialFilter === "ACTION_REQUIRED" ||
    isTicketStatus(initialFilter)
      ? initialFilter
      : "ALL",
  );
  const [typeFilter, setTypeFilter] = useState<"ALL" | TicketType>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [ticketSearch, setTicketSearch] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    if (!initialFilter) return;
    document.getElementById("ticket-directory")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [initialFilter]);

  const actionRequired = useMemo(
    () => tickets.filter((ticket) => requiresRoleAction(role, ticket)),
    [role, tickets],
  );
  const actionRequiredIds = useMemo(
    () => new Set(actionRequired.map((ticket) => ticket.id)),
    [actionRequired],
  );
  const countableTickets = useMemo(
    () => getCountableTickets(tickets),
    [tickets],
  );
  const monthlyStatistics = useMemo(
    () => getTicketMonthlyStatistics(tickets, 12),
    [tickets],
  );
  const formattedTotal = formatTicketCurrency(
    getTotalTicketValueInCents(countableTickets),
  );

  // Stage counts for 4-Step Schema Banner
  const stageCounts = useMemo(() => {
    const draftCount = tickets.filter(
      (t) => t.status === TicketStatus.DRAFT,
    ).length;
    const directorCount = tickets.filter(
      (t) => t.status === TicketStatus.PENDING_DIRECTOR,
    ).length;
    const executionCount = tickets.filter(
      (t) =>
        t.status === TicketStatus.PROCESSED_LOGISTIC ||
        t.status === TicketStatus.PROCESSED_FINANCE ||
        t.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
        t.status === TicketStatus.ASSIGNED_TO_MOVER ||
        t.status === TicketStatus.IN_TRANSIT,
    ).length;
    const completedCount = tickets.filter(
      (t) => t.status === TicketStatus.COMPLETED,
    ).length;
    return { draftCount, directorCount, executionCount, completedCount };
  }, [tickets]);

  const visibleTickets = useMemo(() => {
    const search = ticketSearch.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "ACTIVE" &&
          ticket.status !== TicketStatus.DRAFT &&
          ticket.status !== TicketStatus.COMPLETED &&
          ticket.status !== TicketStatus.REJECTED) ||
        (filter === "STAGE_EXECUTION" &&
          (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
            ticket.status === TicketStatus.PROCESSED_FINANCE ||
            ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
            ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
            ticket.status === TicketStatus.IN_TRANSIT)) ||
        (filter === "ACTION_REQUIRED"
          ? actionRequiredIds.has(ticket.id)
          : ticket.status === filter);

      const matchesType =
        typeFilter === "ALL" ||
        (typeFilter === TicketType.MATERIAL
          ? isMaterialOrLogisticsTicket(ticket)
          : typeFilter === TicketType.COST
            ? ticket.type === TicketType.COST &&
              ticket.requestCategory !== TicketRequestCategory.SHIPPING_COST
            : ticket.type === typeFilter);

      const matchesProject =
        projectFilter === "ALL" ||
        (projectFilter === "__NO_PROJECT__"
          ? ticket.project === null
          : Boolean(
              ticket.project &&
                `${ticket.project.kelompokTani} - ${ticket.project.title}` ===
                  projectFilter,
            ));

      const matchesSearch =
        !search ||
        `${ticket.ticketNumber} ${ticket.title} ${ticket.requester.name} ${ticket.project?.kelompokTani ?? ""} ${ticket.project?.title ?? ""}`
          .toLowerCase()
          .includes(search);

      return matchesFilter && matchesType && matchesProject && matchesSearch;
    }).sort((a, b) => {
      const aTerminal =
        a.status === TicketStatus.COMPLETED ||
        a.status === TicketStatus.REJECTED;
      const bTerminal =
        b.status === TicketStatus.COMPLETED ||
        b.status === TicketStatus.REJECTED;
      if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [actionRequiredIds, filter, typeFilter, projectFilter, ticketSearch, tickets]);

  const selectTicketFilter = (nextFilter: string) => {
    setFilter(nextFilter);
  };

  const focusTicket = (ticketNumber: string) => {
    setFilter("ALL");
    setTypeFilter("ALL");
    setProjectFilter("ALL");
    setTicketSearch(ticketNumber);
    document.getElementById("ticket-directory")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const schemaSteps = [
    {
      step: "01",
      title: "Buat & Ajukan",
      desc: "Draft kebutuhan barang/dana",
      count: stageCounts.draftCount,
      filterKey: TicketStatus.DRAFT,
      icon: ClipboardCheck,
      color: "text-slate-400 border-slate-500/30 bg-slate-500/10",
    },
    {
      step: "02",
      title: "Otorisasi Direktur",
      desc: "Verifikasi & persetujuan",
      count: stageCounts.directorCount,
      filterKey: TicketStatus.PENDING_DIRECTOR,
      icon: ShieldCheck,
      color: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    },
    {
      step: "03",
      title: "Logistik & Keuangan",
      desc: "Terbit DO/PO atau bayar dana",
      count: stageCounts.executionCount,
      filterKey: "STAGE_EXECUTION",
      icon: Truck,
      color: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    },
    {
      step: "04",
      title: "Serah Terima & Selesai",
      desc: "Barang tiba / pembayaran lunas",
      count: stageCounts.completedCount,
      filterKey: TicketStatus.COMPLETED,
      icon: CheckCircle2,
      color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Alur Skema 4 Tahap Tiket (Bisa Diklik untuk Filter Tahapan) */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {schemaSteps.map((item) => {
          const Icon = item.icon;
          const isSelected = filter === item.filterKey;
          return (
            <button
              key={item.step}
              type="button"
              onClick={() =>
                setFilter(isSelected ? "ALL" : item.filterKey)
              }
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                  : "border-border bg-card/70 hover:border-primary/40 hover:bg-muted/30"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                    TAHAP {item.step}
                  </span>
                  <span className="truncate text-xs font-bold text-foreground">
                    {item.title}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {item.desc}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-extrabold tabular-nums ${item.color}`}
                >
                  <Icon className="size-3.5" />
                  {item.count}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Ringkasan KPI & Filter Cepat */}
      <TicketFilter
        tickets={tickets}
        activeFilter={filter}
        setFilter={selectTicketFilter}
        actionRequiredCount={actionRequired.length}
      />

      {/* 3. Direktori Tiket Utama */}
      <CardBox className="overflow-hidden">
        <div
          id="ticket-directory"
          className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Daftar &amp; Antrean Tiket Permintaan
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Klik tombol aksi pada kolom kanan untuk mengajukan, menyetujui, memproses logistik/keuangan, atau melihat rincian tiket
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground tabular-nums">
                {filter === "ACTION_REQUIRED" ? (
                  <Activity className="size-3.5 text-amber-500" aria-hidden="true" />
                ) : (
                  <SearchCheck className="size-3.5 text-primary" aria-hidden="true" />
                )}
                {visibleTickets.length} dari {tickets.length} tiket
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAnalytics((prev) => !prev)}
                className="gap-1.5 text-xs"
              >
                <BarChart3 className="size-3.5 text-primary" />
                <span>
                  {showAnalytics ? "Sembunyikan Grafik" : "Statistik & Grafik"}
                </span>
                {showAnalytics ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Baris Filter Jenis Tiket & Filter Proyek */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTypeFilter("ALL")}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  typeFilter === "ALL"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Semua Jenis ({countableTickets.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter(TicketType.MATERIAL)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  typeFilter === TicketType.MATERIAL
                    ? "border-sky-500 bg-sky-500/15 text-sky-400"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Package className="size-3.5" />
                Material &amp; Gudang (
                {
                  countableTickets.filter((t) =>
                    isMaterialOrLogisticsTicket(t),
                  ).length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter(TicketType.COST)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  typeFilter === TicketType.COST
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Wallet className="size-3.5" />
                Biaya &amp; Upah (
                {
                  countableTickets.filter(
                    (t) =>
                      t.type === TicketType.COST &&
                      t.requestCategory !== TicketRequestCategory.SHIPPING_COST,
                  ).length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter(TicketType.OPERATIONAL)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  typeFilter === TicketType.OPERATIONAL
                    ? "border-amber-500 bg-amber-500/15 text-amber-400"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Wrench className="size-3.5" />
                Operasional (
                {countableTickets.filter((t) => t.type === TicketType.OPERATIONAL).length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Filter className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
                <select
                  aria-label="Filter berdasarkan proyek"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-background pl-8 pr-7 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="ALL">Semua Proyek ({projects.length})</option>
                  <option value="__NO_PROJECT__">
                    Kantor Pusat / Tanpa Proyek
                  </option>
                  {projects.map((p) => {
                    const label = `${p.kelompokTani} - ${p.title}`;
                    return (
                      <option key={p.id} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              {(filter !== "ALL" ||
                typeFilter !== "ALL" ||
                projectFilter !== "ALL" ||
                ticketSearch.trim() !== "") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilter("ALL");
                    setTypeFilter("ALL");
                    setProjectFilter("ALL");
                    setTicketSearch("");
                  }}
                  className="h-8 px-2.5 text-xs font-semibold text-primary"
                >
                  Reset Filter
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="px-3.5 py-2 sm:px-5">
          <TicketListing
            tickets={visibleTickets}
            projects={projects}
            vendors={vendors}
            stockItems={stockItems}
            role={role}
            ticketSearch={ticketSearch}
            searchTickets={setTicketSearch}
            initialOpenSheet={initialOpenSheet}
          />
        </div>
      </CardBox>

      {/* 4. Panel Analitik & Statistik (Collapsible) */}
      {showAnalytics && (
        <div className="space-y-5">
          <TicketOverviewPanels
            tickets={tickets}
            actionRequired={actionRequired}
            onSelectTicket={focusTicket}
            onFilter={selectTicketFilter}
          />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <CardBox className="overflow-hidden xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h3 className="font-semibold">Tren Tiket &amp; Transaksi</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jumlah tiket dan nilai transaksi 12 bulan terakhir
                  </p>
                </div>
                <TicketStatisticsModal
                  tickets={tickets}
                  formattedTotal={formattedTotal}
                  trigger={
                    <ActionIconButton
                      label="Lihat statistik nilai & transaksi"
                      tooltip="Lihat statistik nilai & transaksi"
                      icon={ChartNoAxesCombined}
                      className="shrink-0"
                      variant="ghost"
                    />
                  }
                />
              </div>
              <div className="p-4">
                <TicketStatisticsChart
                  months={monthlyStatistics.months}
                  categoryLabel="Semua jenis permintaan"
                  compact
                />
              </div>
            </CardBox>
            <CardBox className="h-full overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Distribusi Jenis Permintaan</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Proporsi tiket yang dapat Anda akses
                </p>
              </div>
              <div className="p-4">
                <TicketRequestDistributionChart tickets={tickets} compact />
              </div>
            </CardBox>
          </div>
        </div>
      )}
    </div>
  );
}
