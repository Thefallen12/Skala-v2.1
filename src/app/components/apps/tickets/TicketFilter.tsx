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
      count: tickets.length,
      icon: ClipboardList,
      style: "bg-lightprimary text-primary",
    },
    {
      filter: "ACTIVE",
      title: "Tiket aktif",
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
      count: actionRequiredCount,
      icon: Clock3,
      style: "bg-lightwarning text-warning",
    },
    {
      filter: TicketStatus.COMPLETED,
      title: "Selesai",
      count: tickets.filter((ticket) => ticket.status === TicketStatus.COMPLETED)
        .length,
      icon: CircleCheck,
      style: "bg-lightsuccess text-success",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ filter, title, count, icon: Icon, style }) => (
        <Button
          key={title}
          type="button"
          variant="ghost"
          aria-pressed={activeFilter === filter}
          onClick={() => setFilter(filter)}
          className={`h-auto min-h-28 justify-start gap-4 rounded-md border border-border p-5 text-left hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary ${style} ${
            activeFilter === filter ? "ring-2 ring-primary" : ""
          }`}
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-background/70">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-2xl font-semibold">{count}</span>
            <span className="mt-1 block text-sm">{title}</span>
          </span>
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        aria-label="Tampilkan semua tiket untuk melihat total nilai"
        aria-pressed={activeFilter === "ALL"}
        onClick={() => setFilter("ALL")}
        className={`h-auto min-h-28 w-full flex-col items-start justify-center rounded-md border border-border bg-lightinfo p-5 text-left text-info hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary ${
          activeFilter === "ALL" ? "ring-2 ring-primary" : ""
        }`}
      >
        <span className="text-2xl font-semibold">
          {formatTicketCurrency(getTotalTicketValueInCents(tickets))}
        </span>
        <span className="mt-1 text-sm">Total nilai tiket · lihat semua data</span>
      </Button>
    </div>
  );
}
