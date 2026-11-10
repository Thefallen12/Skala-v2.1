import Link from "next/link";
import { ArrowUpRight, Ticket, UserRound } from "lucide-react";
import CardBox from "../shared/CardBox";
import { Badge } from "@/components/ui/badge";
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
  <CardBox className="h-full w-full border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
      <div>
        <h2 className="font-bold text-slate-900 dark:text-white">
          Pengguna yang Mengajukan Request
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pemohon dari request terbaru yang tercatat
        </p>
      </div>
      <Link
        href="/apps/tickets"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-600 hover:underline dark:text-orange-400"
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
            className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 transition hover:border-orange-400/60 hover:bg-orange-50/50 dark:border-slate-700/80 dark:bg-[#0e1626] dark:hover:bg-slate-800/70"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-500">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-900 group-hover:text-orange-600 dark:text-white dark:group-hover:text-orange-300">
                  {ticket.requesterName}
                </span>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {ticket.title} · {ticket.projectName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="gray" className="px-2 py-0.5 text-[10px]">
                    {ticket.statusLabel}
                  </Badge>
                  {ticket.totalAmount !== "—" && (
                    <span className="text-[10px] text-muted-foreground">
                      {ticket.totalAmount}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {ticket.createdAt}
                  </span>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 px-2 py-0.5 text-[10px] ${priorityClasses[ticket.priority]}`}
            >
              {priorityLabels[ticket.priority]}
            </Badge>
          </Link>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <Ticket className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
          Belum ada tiket.
          </p>
        </div>
      )}
    </div>
  </CardBox>
);
