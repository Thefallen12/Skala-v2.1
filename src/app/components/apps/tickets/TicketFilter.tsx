"use client";

import { Activity, CircleCheck, ClipboardList, Clock3, Wallet } from "lucide-react";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { TicketStatus } from "@prisma/client";
import {
  formatTicketCurrency,
  getTotalTicketValueInCents,
} from "./ticket-statistics";

export default function TicketFilter({
  tickets,
  activeFilter,
  setFilter,
  actionRequiredCount,
}: {
  tickets: TicketRow[];
  activeFilter: string;
  setFilter: (filter: string) => void;
  actionRequiredCount: number;
}) {
  const activeCount = tickets.filter(
    (ticket) =>
      ticket.status !== TicketStatus.DRAFT &&
      ticket.status !== TicketStatus.COMPLETED &&
      ticket.status !== TicketStatus.REJECTED,
  ).length;

  const completedCount = tickets.filter(
    (ticket) => ticket.status === TicketStatus.COMPLETED,
  ).length;

  const cards = [
    {
      filter: "ALL",
      title: "Semua Tiket",
      subtitle: "Total seluruh pengajuan",
      count: tickets.length,
      icon: ClipboardList,
      iconStyle: "bg-primary/15 text-primary border-primary/25",
      activeRing: "border-primary bg-primary/5 ring-2 ring-primary/25",
    },
    {
      filter: "ACTION_REQUIRED",
      title: "Perlu Tindakan Anda",
      subtitle:
        actionRequiredCount > 0
          ? "Menunggu persetujuan / proses Anda"
          : "Tidak ada antrean tertunda",
      count: actionRequiredCount,
      icon: Clock3,
      iconStyle: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      activeRing: "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/25",
      highlight: actionRequiredCount > 0,
    },
    {
      filter: "ACTIVE",
      title: "Sedang Diproses",
      subtitle: "Berjalan di Direktur / Logistik / Finance",
      count: activeCount,
      icon: Activity,
      iconStyle: "bg-sky-500/15 text-sky-500 border-sky-500/25",
      activeRing: "border-sky-500 bg-sky-500/5 ring-2 ring-sky-500/25",
    },
    {
      filter: TicketStatus.COMPLETED,
      title: "Selesai / Tuntas",
      subtitle: "Barang diterima / dana cair",
      count: completedCount,
      icon: CircleCheck,
      iconStyle: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
      activeRing: "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/25",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map(
        ({
          filter,
          title,
          subtitle,
          count,
          icon: Icon,
          iconStyle,
          activeRing,
          highlight,
        }) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(filter)}
              className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all sm:p-4 ${
                isActive
                  ? activeRing
                  : highlight
                    ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                  {title}
                </span>
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${iconStyle}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
                    {count}
                  </span>
                  {highlight && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                      Prioritas
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  {subtitle}
                </p>
              </div>
            </button>
          );
        },
      )}

      <div className="col-span-2 flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 sm:p-4 lg:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Total Estimasi Tiket
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/25 bg-indigo-500/15 text-indigo-400">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-2">
          <p className="truncate text-lg font-extrabold tracking-tight text-foreground tabular-nums sm:text-xl">
            {formatTicketCurrency(getTotalTicketValueInCents(tickets))}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Akumulasi seluruh tiket terdaftar
          </p>
        </div>
      </div>
    </div>
  );
}
