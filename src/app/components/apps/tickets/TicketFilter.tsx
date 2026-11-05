"use client";

import { Activity, CircleCheck, ClipboardList, Clock3 } from "lucide-react";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { TicketStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
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
  const cards = [
    {
      filter: "ALL",
      title: "Total tiket",
      mobileTitle: "Total",
      count: tickets.length,
      icon: ClipboardList,
      style: "bg-lightprimary text-primary",
    },
    {
      filter: "ACTIVE",
      title: "Tiket aktif",
      mobileTitle: "Aktif",
      count: tickets.filter(
        (ticket) =>
          ticket.status !== TicketStatus.DRAFT &&
          ticket.status !== TicketStatus.COMPLETED &&
          ticket.status !== TicketStatus.REJECTED,
      ).length,
      icon: Activity,
      style: "bg-lightinfo text-info",
    },
    {
      filter: "ACTION_REQUIRED",
      title: "Memerlukan tindakan",
      mobileTitle: "Tindakan",
      count: actionRequiredCount,
      icon: Clock3,
      style: "bg-lightwarning text-warning",
    },
    {
      filter: TicketStatus.COMPLETED,
      title: "Selesai",
      mobileTitle: "Selesai",
      count: tickets.filter((ticket) => ticket.status === TicketStatus.COMPLETED)
        .length,
      icon: CircleCheck,
      style: "bg-lightsuccess text-success",
    },
  ];

  return (
    <div className="ticket-filter-grid grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
      {cards.map(({ filter, title, mobileTitle, count, icon: Icon, style }) => (
        <Button
          key={title}
          type="button"
          variant="ghost"
          aria-pressed={activeFilter === filter}
          onClick={() => setFilter(filter)}
          className={`h-auto min-h-24 justify-start gap-2 rounded-md border border-border p-3 text-left hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary sm:min-h-28 sm:gap-4 sm:p-5 ${style} ${
            activeFilter === filter ? "ring-2 ring-primary" : ""
          }`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background/70 sm:size-12">
            <Icon className="size-4 sm:size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-semibold sm:text-2xl">{count}</span>
            <span className="mt-1 block truncate text-xs sm:text-sm">
              <span className="hidden sm:inline">{title}</span>
              <span className="sm:hidden">{mobileTitle}</span>
            </span>
          </span>
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        aria-label="Tampilkan semua tiket untuk melihat total nilai"
        aria-pressed={activeFilter === "ALL"}
        onClick={() => setFilter("ALL")}
        className={`ticket-total-card col-span-2 h-auto min-h-24 w-full flex-col items-start justify-center rounded-md border border-border bg-lightinfo p-4 text-left text-info hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary sm:min-h-28 sm:p-5 xl:col-span-1 ${
          activeFilter === "ALL" ? "ring-2 ring-primary" : ""
        }`}
      >
        <span className="ticket-total-copy">
          <span className="ticket-total-label">Total nilai tiket:</span>
          <span className="ticket-total-value">
            {formatTicketCurrency(getTotalTicketValueInCents(tickets))}
          </span>
        </span>
        <span className="ticket-total-action">Lihat semua data ↗</span>
      </Button>
    </div>
  );
}
