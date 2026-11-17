import Link from "next/link";
import { ArrowUpRight, Ticket, UserRound } from "lucide-react";
import CardBox from "../shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TicketPriority } from "@prisma/client";

type DashboardTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  createdAt: string;
  totalAmount: string;
  statusLabel: string;
  requesterName: string;
  projectName: string;
  priority: TicketPriority;
};

const priorityLabels: Record<TicketPriority, string> = {
  [TicketPriority.LOW]: "Rendah",
  [TicketPriority.MEDIUM]: "Normal",
  [TicketPriority.HIGH]: "Tinggi",
  [TicketPriority.URGENT]: "Kritis",
};

const priorityClasses: Record<TicketPriority, string> = {
  [TicketPriority.LOW]:
    "border-slate-400/25 bg-slate-400/10 text-slate-600 dark:text-slate-300",
  [TicketPriority.MEDIUM]:
    "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  [TicketPriority.HIGH]:
    "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  [TicketPriority.URGENT]:
    "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300",
};

export const RecentTransaction = ({
  tickets,
}: {
  tickets: DashboardTicket[];
}) => (
  <CardBox className="h-full w-full border border-border bg-card p-5 text-card-foreground shadow-2xs sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
      <div>
        <h2 className="type-h2 text-foreground">
          Permintaan Tiket Terbaru
        </h2>
        <p className="type-p3 mt-1 text-muted-foreground">
          Pemohon dari tiket yang tercatat terakhir
        </p>
      </div>
      <Link
        href="/apps/tickets"
        className="type-p3 inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
      >
        Semua tiket
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
    <div className="space-y-3">
      {tickets.length ? (
        tickets.map((ticket) => (
          <Link
            href={`/apps/tickets?openSheet=${encodeURIComponent(ticket.id)}`}
            key={ticket.id}
            className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3.5 transition hover:border-primary/50 hover:bg-muted/70"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="type-p2 block truncate font-bold text-foreground group-hover:text-primary">
                  {ticket.requesterName}
                </span>
                <p className="type-p3 mt-0.5 truncate text-muted-foreground">
                  {ticket.title} · {ticket.projectName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="gray">
                    {ticket.statusLabel}
                  </Badge>
                  {ticket.totalAmount !== "—" && (
                    <span className="type-p3 text-muted-foreground">
                      {ticket.totalAmount}
                    </span>
                  )}
                  <span className="type-p3 text-muted-foreground">
                    {ticket.createdAt}
                  </span>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 ${priorityClasses[ticket.priority]}`}
            >
              {priorityLabels[ticket.priority]}
            </Badge>
          </Link>
        ))
      ) : (
        <EmptyState
          variant="inline"
          icon={Ticket}
          title="Belum ada tiket"
          description="Pengajuan tiket terbaru akan tampil di sini."
        />
      )}
    </div>
  </CardBox>
);
