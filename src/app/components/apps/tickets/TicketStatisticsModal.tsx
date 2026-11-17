"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { TicketRequestCategory } from "@prisma/client";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { GlobalModal } from "@/components/ui/global-modal";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatTicketCurrency,
  getTicketMonthlyStatistics,
} from "./ticket-statistics";

const categoryOptions = [
  { value: "ALL", label: "Semua jenis permintaan" },
  { value: TicketRequestCategory.OPS, label: "Operasional (OPS)" },
  { value: TicketRequestCategory.MATERIAL, label: "Belanja Material" },
  { value: TicketRequestCategory.WAREHOUSE, label: "Material Gudang" },
  { value: TicketRequestCategory.OFFICE, label: "Belanja Kantor" },
  { value: TicketRequestCategory.FIELD, label: "Kebutuhan Lapangan" },
  { value: TicketRequestCategory.APH, label: "APH" },
  { value: TicketRequestCategory.SHIPPING_COST, label: "Pengiriman PO" },
] as const;

type CategoryFilter = (typeof categoryOptions)[number]["value"];

function isCategoryFilter(value: string): value is CategoryFilter {
  return categoryOptions.some((option) => option.value === value);
}

const TicketStatisticsChart = dynamic(
  () => import("./TicketStatisticsChart"),
  {
    ssr: false,
    loading: () => (
      <div className="type-p2 flex h-[340px] items-center justify-center text-muted-foreground">
        Memuat grafik statistik...
      </div>
    ),
  },
);

export default function TicketStatisticsModal({
  tickets,
  formattedTotal,
  trigger,
}: {
  tickets: TicketRow[];
  formattedTotal: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("12");
  const [category, setCategory] = useState<CategoryFilter>("ALL");

  const statistics = useMemo(() => {
    return getTicketMonthlyStatistics(tickets, Number(period), category);
  }, [category, period, tickets]);

  const selectedCategoryLabel =
    categoryOptions.find((option) => option.value === category)?.label ??
    categoryOptions[0].label;

  return (
    <>
      <div
        className="inline-flex"
        onClick={() => setOpen(true)}
        aria-label={`Lihat statistik nilai & transaksi, total ${formattedTotal}`}
      >
        {trigger}
      </div>

      <GlobalModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Statistik Tiket"
        description="Tren nilai dan jumlah tiket berdasarkan tanggal dibuat."
        className="max-w-5xl"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-lightinfo p-4 text-info">
              <p className="type-p2">Total Nilai Tiket</p>
              <p className="type-kpi mt-1">
                {formatTicketCurrency(statistics.totalCents)}
              </p>
            </div>
            <div className="rounded-xl bg-lightprimary p-4 text-primary">
              <p className="type-p2">Jumlah Transaksi</p>
              <p className="type-kpi mt-1">{statistics.totalCount} tiket</p>
            </div>
          </div>
          <div className="w-full sm:w-44">
            <Label htmlFor="stats-period" className="type-p2 mb-1.5 block font-medium">
              Periode
            </Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger id="stats-period" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 bulan terakhir</SelectItem>
                <SelectItem value="12">12 bulan terakhir</SelectItem>
                <SelectItem value="24">24 bulan terakhir</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-64">
            <Label htmlFor="stats-category" className="type-p2 mb-1.5 block font-medium">
              Jenis Permintaan
            </Label>
            <Select
              value={category}
              onValueChange={(value) => {
                if (isCategoryFilter(value)) setCategory(value);
              }}
            >
              <SelectTrigger id="stats-category" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TicketStatisticsChart
          months={statistics.months}
          categoryLabel={selectedCategoryLabel}
        />
      </GlobalModal>
    </>
  );
}
