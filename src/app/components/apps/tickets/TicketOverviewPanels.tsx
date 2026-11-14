"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceStrict } from "date-fns";
import { id } from "date-fns/locale";
import {
  Activity,
  BellRing,
  CheckCircle2,
  Download,
  FilePlus2,
  ListFilter,
  TriangleAlert,
} from "lucide-react";
import CardBox from "@/app/components/shared/CardBox";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TicketFieldCategory,
  TicketRequestCategory,
  TicketStatus,
} from "@prisma/client";
import { categoryForTicket } from "./ticket-statistics";

const statusLabels: Record<TicketRow["status"], string> = {
  DRAFT: "Draft",
  PENDING_DIRECTOR: "Menunggu persetujuan Direktur",
  PENDING_LOGISTIK: "Menunggu diproses Logistik",
  APPROVED_DIR: "Disetujui Direktur",
  PROCESSED_FINANCE: "Diproses Finance",
  PROCESSED_LOGISTIC: "Diproses Logistik",
  ASSIGNED_TO_MOVER: "Ditugaskan ke Mover",
  IN_TRANSIT: "Dalam perjalanan (ekspedisi)",
  WAITING_FINANCE_PAYMENT: "Menunggu pembayaran Finance",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

const statusVariants: Record<
  TicketRow["status"],
  "gray" | "lightWarning" | "lightSuccess" | "lightInfo" | "lightError"
> = {
  DRAFT: "gray",
  PENDING_DIRECTOR: "lightWarning",
  PENDING_LOGISTIK: "lightWarning",
  APPROVED_DIR: "lightSuccess",
  PROCESSED_FINANCE: "lightInfo",
  PROCESSED_LOGISTIC: "lightInfo",
  ASSIGNED_TO_MOVER: "lightWarning",
  IN_TRANSIT: "lightInfo",
  WAITING_FINANCE_PAYMENT: "lightWarning",
  COMPLETED: "lightSuccess",
  REJECTED: "lightError",
};

const activityLabels: Record<string, string> = {
  CREATED: "Tiket dibuat",
  SUBMITTED: "Tiket diajukan",
  APPROVED_BY_DIR: "Disetujui Direktur",
  LOGISTICS_READY_WAREHOUSE: "Stok gudang siap",
  LOGISTICS_BUY_STORE: "Pembelian diteruskan",
  LOGISTICS_PO_CREATED: "PO dibuat; menunggu persetujuan",
  FINANCE_PAYMENT_COMPLETED: "Pembayaran selesai",
  MOVER_DELIVERY_COMPLETED: "Barang diterima di lapangan",
  COMPLETED: "Pemrosesan selesai",
};

function relativeTimeLabel(createdAt: string, now: Date | null) {
  if (!now) {
    return `${createdAt.slice(0, 16).replace("T", " ")} UTC`;
  }

  return formatDistanceStrict(new Date(createdAt), now, {
    addSuffix: true,
    locale: id,
  });
}

const statuses = Object.values(TicketStatus);
const requestCategories = [
  {
    value: TicketRequestCategory.OPS,
    label: "Operasional (OPS)",
    color: "bg-primary",
    textColor: "text-primary",
  },
  {
    value: TicketRequestCategory.MATERIAL,
    label: "Belanja Material",
    color: "bg-info",
    textColor: "text-info",
  },
  {
    value: TicketRequestCategory.WAREHOUSE,
    label: "Permintaan Material dari Gudang",
    color: "bg-secondary",
    textColor: "text-secondary",
  },
  {
    value: TicketRequestCategory.OFFICE,
    label: "Belanja Kantor",
    color: "bg-success",
    textColor: "text-success",
  },
  {
    value: TicketRequestCategory.FIELD,
    label: "Kebutuhan Tim Lapangan",
    color: "bg-warning",
    textColor: "text-warning",
  },
  {
    value: TicketRequestCategory.APH,
    label: "APH",
    color: "bg-destructive",
    textColor: "text-destructive",
  },
  {
    value: TicketRequestCategory.REIMBURSEMENT,
    label: "Reimbursement",
    color: "bg-warning",
    textColor: "text-warning",
  },
  {
    value: TicketRequestCategory.KASBON,
    label: "Kasbon / Ambilan",
    color: "bg-warning",
    textColor: "text-warning",
  },
  {
    value: TicketRequestCategory.OPERATING_EXPENSE,
    label: "Biaya Operasional",
    color: "bg-warning",
    textColor: "text-warning",
  },
  {
    value: TicketRequestCategory.SHIPPING_COST,
    label: "Pengiriman Barang PO",
    color: "bg-info",
    textColor: "text-info",
  },
] as const;

const requestCategoryLabels: Record<TicketRequestCategory, string> = {
  OPS: "Operasional (OPS)",
  MATERIAL: "Belanja Material",
  WAREHOUSE: "Permintaan Material dari Gudang",
  OFFICE: "Belanja Kantor",
  FIELD: "Kebutuhan Tim Lapangan",
  APH: "APH",
  REIMBURSEMENT: "Reimbursement",
  KASBON: "Kasbon / Ambilan",
  OPERATING_EXPENSE: "Biaya Operasional",
  SHIPPING_COST: "Pengiriman Barang PO",
};

const fieldCategoryLabels: Record<TicketFieldCategory, string> = {
  HAULING: "Upah Langsir",
  LABOR: "Upah Tukang",
  DIRECT_STORE: "Belanja Langsung ke Toko",
};

function TicketStatusDistribution({ tickets }: { tickets: TicketRow[] }) {
  const counts = statuses
    .map((status) => ({
      status,
      byCategory: requestCategories.map((category) => ({
        ...category,
        count: tickets.filter(
          (ticket) =>
            ticket.status === status &&
            categoryForTicket(ticket) === category.value,
        ).length,
      })),
    }))
    .map((item) => ({
      ...item,
      count: item.byCategory.reduce((total, category) => total + category.count, 0),
    }))
    .filter(({ count }) => count > 0);

  return (
    <CardBox className="ticket-status-panel h-full overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h3 className="font-semibold">Distribusi Status Tiket</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Jumlah tiket pada setiap status, dirinci menurut jenis permintaan
        </p>
      </div>
      <div className="max-h-[440px] space-y-4 overflow-y-auto p-5">
        {counts.length > 0 ? (
          counts.map(({ status, count, byCategory }) => (
            <div key={status} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={statusVariants[status]}>
                  {statusLabels[status]}
                </Badge>
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
              <div
                role="img"
                aria-label={`${statusLabels[status]}: ${byCategory
                  .filter((category) => category.count > 0)
                  .map(
                    (category) =>
                      `${category.label} ${category.count}`,
                  )
                  .join(", ")}`}
                className="flex h-2 overflow-hidden rounded-full bg-muted"
              >
                {byCategory
                  .filter((category) => category.count > 0)
                  .map((category) => (
                    <span
                      key={category.value}
                      className={category.color}
                      style={{ width: `${(category.count / count) * 100}%` }}
                    />
                  ))}
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {byCategory
                  .filter((category) => category.count > 0)
                  .map((category) => (
                    <li
                      key={category.value}
                      className={`text-xs ${category.textColor}`}
                    >
                      {category.label}: {category.count}
                    </li>
                  ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Belum ada tiket untuk ditampilkan.
          </p>
        )}
      </div>
    </CardBox>
  );
}

function RecentTicketActivity({
  tickets,
  onSelectTicket,
  now,
}: {
  tickets: TicketRow[];
  onSelectTicket: (ticketNumber: string) => void;
  now: Date | null;
}) {
  const activities = tickets
    .flatMap((ticket) =>
      ticket.auditLogs.map((log) => ({
        id: log.id,
        ticketNumber: ticket.ticketNumber,
        title: activityLabels[log.action] ?? log.action,
        notes: log.notes,
        userName: log.user.name,
        createdAt: log.createdAt,
      })),
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 6);

  return (
    <CardBox className="ticket-activity-panel h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="font-semibold">Aktivitas Terbaru</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Perubahan alur tiket terbaru
          </p>
        </div>
        <Activity className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="divide-y divide-border">
        {activities.length ? (
          activities.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => onSelectTicket(activity.ticketNumber)}
              className="w-full px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium">
                  {activity.title}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {activity.ticketNumber}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <time dateTime={activity.createdAt}>
                    {relativeTimeLabel(activity.createdAt, now)}
                  </time>
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {activity.notes || `Diperbarui oleh ${activity.userName}`}
              </span>
            </button>
          ))
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Belum ada aktivitas tiket.
          </p>
        )}
      </div>
    </CardBox>
  );
}

export default function TicketOverviewPanels({
  tickets,
  actionRequired,
  onSelectTicket,
  onFilter,
}: {
  tickets: TicketRow[];
  actionRequired: TicketRow[];
  onSelectTicket: (ticketNumber: string) => void;
  onFilter: (filter: string) => void;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    updateNow();
    const intervalId = window.setInterval(updateNow, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const alerts = actionRequired
    .slice()
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    )
    .slice(0, 4);

  const downloadReport = () => {
    const headers = [
      "Nomor tiket",
      "Permintaan",
      "Jenis permintaan",
      "Subjenis permintaan",
      "Status",
      "Prioritas",
      "Pemohon",
      "Proyek",
      "Tanggal dan waktu request",
      "Total estimasi",
    ];
    const rows = tickets.map((ticket) => [
      ticket.ticketNumber,
      ticket.title,
      requestCategoryLabels[categoryForTicket(ticket)],
      ticket.fieldCategory
        ? fieldCategoryLabels[ticket.fieldCategory]
        : "",
      statusLabels[ticket.status],
      ticket.priority,
      ticket.requester.name,
      ticket.project
        ? `${ticket.project.kelompokTani} - ${ticket.project.title}`
        : "",
      format(new Date(ticket.createdAt), "yyyy-MM-dd HH:mm", { locale: id }),
      ticket.totalAmount ?? "",
    ]);
    const escapeCsvValue = (value: string) => {
      const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };
    const csv = [
      headers,
      ...rows,
    ]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-tiket-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="ticket-overview-grid grid grid-cols-1 gap-6 xl:grid-cols-3">
      <TicketStatusDistribution tickets={tickets} />

      <RecentTicketActivity
        tickets={tickets}
        onSelectTicket={onSelectTicket}
        now={now}
      />

      <div className="grid gap-6">
        <CardBox className="ticket-alert-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="font-semibold">Peringatan Tiket</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tiket yang menunggu tindakan role Anda
              </p>
            </div>
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                actionRequired.length > 0
                  ? "bg-destructive text-white"
                  : "bg-success/10 text-success"
              }`}
            >
              {actionRequired.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {alerts.length ? (
              alerts.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => onSelectTicket(ticket.ticketNumber)}
                  className="flex w-full items-start justify-between gap-4 bg-warning/10 px-4 py-3 text-left transition-colors hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <TriangleAlert
                        className="size-4 shrink-0 text-warning"
                        aria-hidden="true"
                      />
                      <span className="truncate">{ticket.title}</span>
                    </span>
                    <span className="mt-1 block pl-6 text-xs text-muted-foreground">
                      {ticket.ticketNumber} · {statusLabels[ticket.status]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <time dateTime={ticket.createdAt}>
                      {relativeTimeLabel(ticket.createdAt, now)}
                    </time>
                  </span>
                </button>
              ))
            ) : (
              <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                <CheckCircle2
                  className="size-4 text-success"
                  aria-hidden="true"
                />
                Tidak ada tiket yang memerlukan tindakan saat ini.
              </p>
            )}
            {actionRequired.length > alerts.length && (
              <Button
                type="button"
                variant="ghost"
                className="w-full rounded-none"
                onClick={() => onFilter("ACTION_REQUIRED")}
              >
                Lihat semua {actionRequired.length} tiket menunggu
              </Button>
            )}
          </div>
        </CardBox>

        <CardBox className="ticket-quick-panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-semibold">Tindakan Cepat</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Buka daftar yang relevan dengan satu klik
            </p>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
              onClick={() => onFilter("ACTION_REQUIRED")}
            >
              <BellRing className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 whitespace-normal text-left">
                <span className="hidden sm:inline">Tiket menunggu tindakan</span>
                <span className="sm:hidden">Menunggu</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
              onClick={() => onFilter(TicketStatus.DRAFT)}
            >
              <FilePlus2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 whitespace-normal text-left">
                <span className="hidden sm:inline">Draft tiket</span>
                <span className="sm:hidden">Draft</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
              onClick={() => onFilter(TicketStatus.COMPLETED)}
            >
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              <span className="min-w-0 whitespace-normal text-left">
                <span className="hidden sm:inline">Tiket selesai</span>
                <span className="sm:hidden">Selesai</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug"
              onClick={() => {
                onFilter("ALL");
                onSelectTicket("");
              }}
            >
              <ListFilter className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 whitespace-normal text-left">
                <span className="hidden sm:inline">Semua tiket</span>
                <span className="sm:hidden">Semua</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal py-2 text-left leading-snug sm:col-span-2"
              onClick={downloadReport}
            >
              <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 whitespace-normal text-left">
                <span className="hidden sm:inline">Generate Report</span>
                <span className="sm:hidden">Report</span>
              </span>
            </Button>
          </div>
        </CardBox>
      </div>

    </div>
  );
}

export { TicketStatusDistribution };
