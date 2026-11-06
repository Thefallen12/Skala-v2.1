"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { useTheme } from "next-themes";

const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[280px] items-center justify-center text-sm text-muted-foreground"
      aria-live="polite"
    >
      Memuat grafik progres...
    </div>
  ),
});

type ProjectProgressItem = {
  picId: string | null;
  picName: string | null;
  progress: number;
};

export function ProjectProgressChart({
  projects,
}: {
  projects: ProjectProgressItem[];
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const progressByPic = new Map<
    string,
    { name: string; totalProgress: number; projectCount: number }
  >();

  projects.forEach((project) => {
    const key = project.picId ?? "unassigned";
    const current = progressByPic.get(key) ?? {
      name: project.picName ?? "Belum ditentukan",
      totalProgress: 0,
      projectCount: 0,
    };

    current.totalProgress += Math.min(100, Math.max(0, project.progress));
    current.projectCount += 1;
    progressByPic.set(key, current);
  });

  const picProgress = Array.from(progressByPic.values())
    .map((pic) => ({
      name: pic.name,
      progress: pic.totalProgress / pic.projectCount,
    }))
    .sort(
      (a, b) =>
        b.progress - a.progress ||
        a.name.localeCompare(b.name, "id-ID"),
    );

  if (projects.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Belum ada data proyek untuk ditampilkan.
      </p>
    );
  }

  const options: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: isDark ? "#a0aec0" : "#64748b",
      height: Math.max(240, picProgress.length * 40),
      parentHeightOffset: 0,
      animations: {
        enabled: true,
        easing: "easeout",
        speed: 500,
      },
    },
    colors: ["#6366f1"],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: "56%",
        borderRadius: 4,
        dataLabels: { position: "top" },
      },
    },
    dataLabels: {
      enabled: true,
      offsetX: 5,
      formatter: (value) =>
        Number(value) === 0 ? "" : `${Math.round(Number(value))}%`,
      style: {
        colors: [isDark ? "#e2e8f0" : "#334155"],
        fontSize: "11px",
        fontWeight: 600,
      },
      background: { enabled: false },
    },
    grid: {
      borderColor: "rgba(124,143,172,0.18)",
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
      padding: { left: 0, right: 24 },
    },
    xaxis: {
      categories: picProgress.map((pic) => pic.name),
      min: 0,
      max: 100,
      tickAmount: 4,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        formatter: (value) => `${Math.round(Number(value))}%`,
        style: { fontSize: "10px" },
      },
    },
    yaxis: {
      labels: {
        maxWidth: 140,
        style: { fontSize: "11px" },
      },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: {
        formatter: (value) =>
          `${Math.round(value)}% rata-rata progres`,
      },
    },
    legend: { show: false },
  };

  const series: ApexAxisChartSeries = [
    {
      name: "Rata-rata progres",
      data: picProgress.map((pic) => Math.round(pic.progress)),
    },
  ];

  return (
    <div
      role="img"
      aria-label={`Grafik rata-rata progres ${picProgress.length} PIC`}
      className="min-w-0"
    >
      <Chart
        options={options}
        series={series}
        type="bar"
        height={Math.max(240, picProgress.length * 40)}
        width="100%"
      />
    </div>
  );
}
