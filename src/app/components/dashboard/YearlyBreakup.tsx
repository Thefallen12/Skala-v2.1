"use client";

import dynamic from "next/dynamic";
import { Icon } from "@iconify/react/dist/iconify.js";
import CardBox from "../shared/CardBox";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const YearlyBreakup = ({
  total,
  completed,
  running,
  other,
}: {
  total: number;
  completed: number;
  running: number;
  other: number;
}) => {
  const chartOptions: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "inherit",
      foreColor: "#8da6c4",
      height: 200,
      toolbar: { show: false },
      animations: {
        enabled: true,
        speed: 750,
        animateGradually: { enabled: true, delay: 100 },
      },
    },
    plotOptions: {
      pie: {
        startAngle: 0,
        endAngle: 360,
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: { show: true, offsetY: 18 },
            value: {
              show: true,
              offsetY: -10,
              formatter: (value) => `${value} proyek`,
            },
            total: {
              show: true,
              label: "Total proyek",
              formatter: () => `${total}`,
            },
          },
        },
      },
    },
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    colors: [
      "#10b981",
      "#f97316",
      "#3b82f6",
    ],
    tooltip: {
      theme: "dark",
      y: { formatter: (value) => `${value} proyek` },
    },
  };

  const breakdown = [
    { label: "Selesai", value: completed, color: "text-emerald-500" },
    { label: "Berjalan", value: running, color: "text-orange-500" },
    { label: "Lainnya / pending", value: other, color: "text-blue-500" },
  ];

  return (
    <CardBox className="h-full min-w-0 border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <h2 className="mb-4 font-bold text-slate-900 dark:text-white">
        Status Proyek
      </h2>
      <div className="grid min-w-0 grid-cols-1 items-center gap-2 2xl:grid-cols-[minmax(0,1fr)_180px]">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">Total proyek</p>
          <h3 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
            {total}
          </h3>
          <div className="flex flex-col gap-2">
            {breakdown.map((item) => (
              <div className="flex items-center gap-1.5" key={item.label}>
                <Icon
                  icon="tabler:point-filled"
                  className={`text-xl ${item.color}`}
                />
                <span className="text-xs text-muted-foreground">
                  {item.label}: {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 justify-center">
          {total > 0 ? (
            <div className="w-full max-w-[180px]">
              <Chart
                options={chartOptions}
                series={[completed, running, other]}
                type="donut"
                height={200}
                width="100%"
              />
            </div>
          ) : (
            <p className="py-12 text-center text-xs text-muted-foreground">
              Belum ada data proyek.
            </p>
          )}
        </div>
      </div>
    </CardBox>
  );
};

export { YearlyBreakup };
