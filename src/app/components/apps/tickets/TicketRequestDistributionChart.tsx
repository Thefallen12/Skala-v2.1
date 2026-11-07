"use client";

import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { TicketRequestCategory } from "@prisma/client";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { categoryForTicket } from "./ticket-statistics";
import { TicketStatus } from "@prisma/client";

const statusLabels: Partial<Record<TicketStatus, string>> = {
  PENDING_DIRECTOR: "Menunggu Persetujuan Direktur",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

const categories = [
  {
    value: TicketRequestCategory.OPS,
    label: "Operasional (OPS)",
    color: "var(--color-primary)",
  },
  {
    value: TicketRequestCategory.MATERIAL,
    label: "Permintaan Material",
    color: "var(--color-info)",
  },
  {
    value: TicketRequestCategory.WAREHOUSE,
    label: "Permintaan Material dari Gudang",
    color: "var(--color-secondary)",
  },
  {
    value: TicketRequestCategory.OFFICE,
    label: "Belanja Kantor",
    color: "var(--color-success)",
  },
  {
    value: TicketRequestCategory.FIELD,
    label: "Kebutuhan Tim Lapangan",
    color: "var(--color-warning)",
  },
  {
    value: TicketRequestCategory.APH,
    label: "APH",
    color: "var(--color-destructive)",
  },
  {
    value: TicketRequestCategory.REIMBURSEMENT,
    label: "Reimbursement",
    color: "var(--color-warning)",
  },
  {
    value: TicketRequestCategory.KASBON,
    label: "Kasbon / Ambilan",
    color: "var(--color-secondary)",
  },
  {
    value: TicketRequestCategory.OPERATING_EXPENSE,
    label: "Biaya Operasional",
    color: "var(--color-success)",
  },
  {
    value: TicketRequestCategory.SHIPPING_COST,
    label: "Biaya Pengiriman",
    color: "var(--color-info)",
  },
] as const;

export default function TicketRequestDistributionChart({
  tickets,
  compact = false,
}: {
  tickets: TicketRow[];
  compact?: boolean;
}) {
  const counts = categories.map(
    (category) =>
      tickets.filter((ticket) => categoryForTicket(ticket) === category.value)
        .length,
  );
  const populatedCategories = categories
    .map((category, index) => ({ ...category, count: counts[index] }))
    .filter((category) => category.count > 0);
  const statusCounts = Object.values(TicketStatus)
    .map((status) => ({
      status,
      count: tickets.filter((ticket) => ticket.status === status).length,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
  const leadingStatus = statusCounts[0];

  const options: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "inherit",
      foreColor: "#7C8FAC",
    },
    colors: categories.map((category) => category.color),
    labels: categories.map((category) => category.label),
    dataLabels: { enabled: false },
    legend: { show: false },
    stroke: { colors: ["var(--color-card)"] },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            name: { show: true, offsetY: 18 },
            value: {
              show: true,
              offsetY: -10,
              formatter: (value) => `${value} tiket`,
            },
            total: {
              show: true,
              label: "Total tiket",
              formatter: () => `${tickets.length}`,
            },
          },
        },
      },
    },
    tooltip: {
      y: { formatter: (value) => `${value} tiket` },
    },
  };

  return (
    <div>
      {tickets.length > 0 ? (
        <>
          <Chart
            options={options}
            series={counts}
            type="donut"
          height={compact ? 170 : 220}
            width="100%"
          />
          <ul className="mt-2 space-y-2">
            {populatedCategories.map((category) => (
              <li
                key={category.value}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{category.label}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {category.count}
                </span>
              </li>
            ))}
          </ul>
          {compact && leadingStatus && (
            <div className="mobile-chart-status" aria-label="Distribusi status tiket">
              <div className="flex items-center justify-between gap-2">
                <span>Distribusi Status</span>
                <span>{leadingStatus.count}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-warning"
                  style={{
                    width: `${(leadingStatus.count / tickets.length) * 100}%`,
                  }}
                />
              </div>
              <span className="mt-1 block truncate text-warning">
                {statusLabels[leadingStatus.status] ?? leadingStatus.status} ({leadingStatus.count})
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
          Belum ada data jenis permintaan.
        </div>
      )}
    </div>
  );
}
