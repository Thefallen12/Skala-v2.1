"use client";

import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import type { TicketStatisticsMonth } from "./ticket-statistics";

export default function TicketStatisticsChart({
  months,
  categoryLabel,
  compact = false,
}: {
  months: TicketStatisticsMonth[];
  categoryLabel: string;
  compact?: boolean;
}) {
  const chartHeight = compact ? 185 : 340;
  const values = months.map((month) =>
    Number((month.totalCents + BigInt(50)) / BigInt(100)),
  );
  const counts = months.map((month) => month.count);

  const options: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: "#7C8FAC",
      height: chartHeight,
      zoom: { enabled: false },
    },
    colors: ["var(--color-info)", "var(--color-primary)"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: [3, 3] },
    markers: { size: 4, hover: { size: 6 } },
    grid: { borderColor: "rgba(124,143,172,0.18)", strokeDashArray: 3 },
    xaxis: {
      categories: months.map((month) => month.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { show: true },
    },
    yaxis: [
      {
        seriesName: "Nilai transaksi",
        title: compact ? { text: undefined } : { text: "Nilai (Rp)" },
        labels: {
          show: true,
          formatter: (value) =>
            new Intl.NumberFormat("id-ID", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(value),
        },
      },
      {
        seriesName: "Jumlah transaksi",
        opposite: true,
        min: 0,
        forceNiceScale: true,
        title: compact ? { text: undefined } : { text: "Jumlah tiket" },
        labels: {
          show: true,
          formatter: (value) => `${Math.round(value)}`,
        },
      },
    ],
    tooltip: {
      enabled: !compact,
      shared: true,
      intersect: false,
      theme: "dark",
      y: [
        {
          formatter: (value) =>
            new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              maximumFractionDigits: 0,
            }).format(value),
        },
        {
          formatter: (value) => `${value} tiket`,
        },
      ],
    },
    legend: { show: !compact, position: "top", horizontalAlign: "left" },
  };

  const series: ApexAxisChartSeries = [
    { name: `Nilai transaksi · ${categoryLabel}`, type: "line", data: values },
    { name: `Jumlah transaksi · ${categoryLabel}`, type: "line", data: counts },
  ];

  return (
    <div className={`${compact ? "min-h-[185px]" : "min-h-[340px]"} w-full`}>
      {months.length > 0 ? (
        <>
          {compact && (
            <div className="mobile-chart-legend">
              <span>
                <i className="bg-info" aria-hidden="true" />
                Nilai transaksi · Semua jenis permintaan
              </span>
              <span>
                <i className="bg-primary" aria-hidden="true" />
                Jumlah transaksi · Semua jenis permintaan
              </span>
            </div>
          )}
          <Chart
            options={options}
            series={series}
            type="line"
            height={chartHeight}
            width="100%"
          />
        </>
      ) : (
        <div className={`flex ${compact ? "h-[185px]" : "h-[340px]"} items-center justify-center text-sm text-muted-foreground`}>
          Belum ada data transaksi untuk periode ini.
        </div>
      )}
    </div>
  );
}
