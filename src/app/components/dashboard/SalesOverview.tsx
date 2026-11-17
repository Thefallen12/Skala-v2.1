"use client";

import dynamic from "next/dynamic";
import CardBox from "../shared/CardBox";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const monthLabels = (year: number) =>
  Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat("id-ID", { month: "short" }).format(
      new Date(year, month, 1),
    ),
  );

const SalesOverview = ({
  year,
  projectCounts,
  ticketCounts,
}: {
  year: number;
  projectCounts: number[];
  ticketCounts: number[];
}) => {
  const chartOptions: ApexOptions = {
    chart: {
      toolbar: { show: false },
      type: "bar",
      fontFamily: "inherit",
      foreColor: "#7C8FAC",
      height: 310,
      stacked: false,
      width: "100%",
      offsetX: 0,
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 750,
        animateGradually: { enabled: true, delay: 90 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
    },
    colors: ["#38bdf8", "#f97316"],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "45%",
        borderRadius: 4,
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: "rgba(141,166,196,0.18)", strokeDashArray: 3 },
    xaxis: {
      categories: monthLabels(year),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: { formatter: (value) => Math.round(value).toString() },
    },
    tooltip: {
      theme: "dark",
      y: { formatter: (value) => `${value} data` },
    },
  };

  return (
    <CardBox className="dashboard-enter h-full w-full overflow-hidden border-border bg-card p-5 text-card-foreground shadow-2xs transition-shadow duration-300 hover:shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="type-h2 text-foreground">
            Aktivitas Bulanan
          </h2>
          <p className="type-p3 mt-1 text-muted-foreground">
            Proyek baru dan tiket masuk selama {year}
          </p>
        </div>
        <div className="type-p3 flex flex-wrap gap-4 text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-sky-400" />
            Proyek baru
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-orange-500" />
            Tiket masuk
          </span>
        </div>
      </div>
      <Chart
        options={chartOptions}
        series={[
          { name: "Proyek baru", data: projectCounts },
          { name: "Tiket masuk", data: ticketCounts },
        ]}
        type="bar"
        height={316}
        width="100%"
      />
    </CardBox>
  );
};

export default SalesOverview;
