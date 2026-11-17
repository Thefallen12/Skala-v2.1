"use client";

import dynamic from "next/dynamic";
import { Icon } from "@iconify/react/dist/iconify.js";
import CardBox from "../shared/CardBox";
import { EmptyState } from "@/components/ui/empty-state";
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
    <CardBox className="h-full min-w-0 border border-border bg-card p-4 text-card-foreground shadow-2xs sm:p-5">
      <h2 className="type-h2 mb-4 text-foreground">
        Status Proyek
      </h2>
      <div className="grid min-w-0 grid-cols-1 items-center gap-2 2xl:grid-cols-[minmax(0,1fr)_180px]">
        <div className="min-w-0">
          <p className="type-p3 mb-1 text-muted-foreground">Total proyek</p>
          <h3 className="type-kpi mb-4 text-foreground">
            {total}
          </h3>
          <div className="flex flex-col gap-2">
            {breakdown.map((item) => (
              <div className="flex items-center gap-1.5" key={item.label}>
                <Icon
                  icon="tabler:point-filled"
                  className={`text-xl ${item.color}`}
                />
                <span className="type-p3 text-muted-foreground">
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
            <EmptyState
              variant="inline"
              title="Belum ada data"
              description="Data status proyek akan tampil di sini."
            />
          )}
        </div>
      </div>
    </CardBox>
  );
};

export { YearlyBreakup };
