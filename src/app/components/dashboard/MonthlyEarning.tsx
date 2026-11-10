"use client";

import dynamic from "next/dynamic";
import { Icon } from "@iconify/react/dist/iconify.js";
import CardBox from "../shared/CardBox";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const MonthlyEarning = ({
  hours,
  dayLabels,
  hoursByDay,
}: {
  hours: number;
  dayLabels: string[];
  hoursByDay: number[];
}) => {
  const chartOptions: ApexOptions = {
    series: [{ name: "Jam kerja", color: "#34d399", data: hoursByDay }],
    chart: {
      id: "weekly-timesheet",
      type: "area",
      height: 64,
      sparkline: { enabled: true },
      fontFamily: "inherit",
      foreColor: "#adb0bb",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 750,
        animateGradually: { enabled: true, delay: 100 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
    },
    xaxis: { categories: dayLabels },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 0,
        inverseColors: false,
        opacityFrom: 0.35,
        opacityTo: 0,
        stops: [20, 180],
      },
    },
    markers: { size: 0 },
    tooltip: {
      theme: "dark",
      x: { show: true },
      y: { formatter: (value) => `${value} jam` },
    },
  };

  return (
    <CardBox className="mt-0! overflow-hidden border border-slate-200 bg-white p-0! shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="px-5 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-white">
            Timesheet Bulan Ini
          </h2>
          <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500 text-white">
            <Icon icon="tabler:clock-hour-4" className="text-xl" />
          </div>
        </div>
        <h3 className="mb-1 text-xl font-black text-slate-900 dark:text-white">
          {hours} jam
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Total jam kerja tercatat
        </p>
      </div>
      <Chart
        options={chartOptions}
        series={chartOptions.series}
        type="area"
        height={64}
        width="100%"
      />
    </CardBox>
  );
};

export { MonthlyEarning };
