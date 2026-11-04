"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import {
  TicketRequestCategory,
} from "@prisma/client";
import {
  formatTicketCurrency,
  getTicketMonthlyStatistics,
} from "./ticket-statistics";

const categoryOptions = [
  { value: "ALL", label: "Semua jenis permintaan" },
  { value: TicketRequestCategory.OPS, label: "Operasional (OPS)" },
  { value: TicketRequestCategory.MATERIAL, label: "Belanja Material" },
  {
    value: TicketRequestCategory.WAREHOUSE,
    label: "Permintaan Material dari Gudang",
  },
  { value: TicketRequestCategory.OFFICE, label: "Belanja Kantor" },
  {
    value: TicketRequestCategory.FIELD,
    label: "Belanja Kebutuhan Tim Lapangan",
  },
  { value: TicketRequestCategory.APH, label: "APH" },
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
      <div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
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
      <span
        onClick={() => setOpen(true)}
        aria-label={`Lihat statistik nilai & transaksi, total ${formattedTotal}`}
      >
        {trigger}
      </span>

      <GlobalModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Statistik Tiket"
        description="Tren nilai dan jumlah tiket berdasarkan tanggal dibuat. Statistik mengikuti tiket yang tersedia pada daftar Anda."
        className="max-w-5xl"
      >

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-lightinfo p-4 text-info">
                <p className="text-sm">Total nilai tiket</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatTicketCurrency(statistics.totalCents)}
                </p>
              </div>
              <div className="rounded-md bg-lightprimary p-4 text-primary">
                <p className="text-sm">Jumlah transaksi</p>
                <p className="mt-1 text-xl font-semibold">
                  {statistics.totalCount} tiket
                </p>
              </div>
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1.5 block text-sm font-medium">
                Periode
              </label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger aria-label="Periode statistik">
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
              <label className="mb-1.5 block text-sm font-medium">
                Jenis permintaan
              </label>
              <Select
                value={category}
                onValueChange={(value) => {
                  if (isCategoryFilter(value)) setCategory(value);
                }}
              >
                <SelectTrigger aria-label="Filter jenis permintaan">
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
