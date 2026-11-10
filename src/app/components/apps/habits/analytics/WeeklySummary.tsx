"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ApexOptions } from "apexcharts";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { ArrowLeft, ArrowRight, Ellipsis } from "lucide-react";
import { getWeekDateKeys } from "@/lib/habit-date";
import CardBox from "@/app/components/shared/CardBox";
import { Button } from "@/components/ui/button";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Entry = { workDate: string; durationMinutes: number; projectId: string };

function datesForWeek(start: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${start}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export default function WeeklySummary({
  weekStart,
  previousStart,
  nextWeekStart,
  today,
  memberId,
  team,
  projectId,
  entries,
  previousEntries,
}: {
  weekStart: string;
  previousStart: string;
  nextWeekStart: string;
  today: string;
  memberId: string;
  team: string;
  projectId: string;
  entries: Entry[];
  previousEntries: Entry[];
}) {
  const dates = datesForWeek(weekStart);
  const previousDates = datesForWeek(previousStart);
  const dailyHours = dates.map(
    (date) =>
      Number(
        (
          entries
            .filter((entry) => entry.workDate === date)
            .reduce((total, entry) => total + entry.durationMinutes, 0) / 60
        ).toFixed(1),
      ),
  );
  const currentProjects = new Set(entries.map((entry) => entry.projectId)).size;
  const previousProjects = new Set(previousEntries.map((entry) => entry.projectId)).size;
  const projectChange =
    previousProjects > 0
      ? Math.round(((currentProjects - previousProjects) / previousProjects) * 100)
      : null;
  const dailyProjects = dates.map(
    (date) =>
      new Set(
        entries
          .filter((entry) => entry.workDate === date)
          .map((entry) => entry.projectId),
      ).size,
  );
  const previousDailyProjects = previousDates.map(
    (date) =>
      new Set(
        previousEntries
          .filter((entry) => entry.workDate === date)
          .map((entry) => entry.projectId),
      ).size,
  );
  const barOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit", foreColor: "#94a3b8" },
    colors: ["#e67e22"],
    plotOptions: { bar: { columnWidth: "42%", borderRadius: 4 } },
    dataLabels: { enabled: false },
    grid: { show: false },
    xaxis: {
      categories: dates.map((date) => format(new Date(`${date}T12:00:00`), "EEE", { locale: id })),
      labels: { style: { fontSize: "10px" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { show: false },
    legend: { show: false },
    tooltip: { y: { formatter: (value) => `${value} jam` } },
  };
  const trendOptions: ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, sparkline: { enabled: true }, fontFamily: "inherit" },
    colors: ["#3b82f6", "#e67e22"],
    stroke: { curve: "smooth", width: [2.5, 1.5], dashArray: [0, 4] },
    markers: { size: 0 },
    dataLabels: { enabled: false },
    tooltip: { enabled: false },
    yaxis: { show: false },
    xaxis: { categories: dates.map((date) => format(new Date(`${date}T12:00:00`), "d MMM", { locale: id })) },
    legend: { show: false },
  };
  const queryFor = (date: string, timeframe?: number) => {
    const query = new URLSearchParams({
      tab: "timesheet",
      date,
      memberId,
      team,
      projectId,
    });
    if (timeframe) query.set("timeframe", String(timeframe));
    return query.toString();
  };
  const navigate = (date: string) =>
    `/apps/habits?${queryFor(date)}`;
  const isCurrentWeek = weekStart === getWeekDateKeys(today)[0];
  const totalWeeklyHours = dailyHours.reduce((sum, h) => sum + h, 0).toFixed(1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Evaluasi &amp; Produktivitas Mingguan</h2>
          <p className="text-xs text-muted-foreground">
            Rekapitulasi jam kerja aktual dan keterlibatan proyek untuk periode minggu terpilih.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild variant="outline" size="icon" className="size-8" aria-label="Minggu sebelumnya">
            <Link href={navigate(previousStart)} scroll={false}><ArrowLeft className="size-3.5" /></Link>
          </Button>
          <span className="min-w-36 text-center text-xs font-medium text-foreground">
            {format(new Date(`${weekStart}T12:00:00`), "d MMM", { locale: id })} –{" "}
            {format(new Date(`${dates[6]}T12:00:00`), "d MMM yyyy", { locale: id })}
          </span>
          <Button asChild variant="outline" size="icon" className="size-8" aria-label="Minggu berikutnya">
            <Link href={navigate(nextWeekStart)} scroll={false}><ArrowRight className="size-3.5" /></Link>
          </Button>
          {!isCurrentWeek && (
            <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-xs">
              <Link href={navigate(today)} scroll={false}>Minggu ini</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <CardBox className="overflow-hidden p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold">Jam Kerja Harian</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Total minggu ini: <strong className="text-foreground">{totalWeeklyHours} jam</strong>
              </p>
            </div>
            <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {entries.length} entri
            </span>
          </div>
          {entries.length ? (
            <div className="pt-2">
              <Chart
                options={barOptions}
                series={[{ name: "Jam kerja", data: dailyHours }]}
                type="bar"
                height={120}
                width="100%"
              />
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Belum ada catatan jam kerja minggu ini. Gunakan tombol &ldquo;+ Catat Jam Kerja&rdquo; di bawah.
            </p>
          )}
        </CardBox>

        <CardBox className="overflow-hidden p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold">Proyek Dikerjakan</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Jumlah proyek aktif yang tercatat minggu ini</p>
            </div>
            <span className="rounded-lg bg-info/10 px-2.5 py-1 text-xs font-bold text-info">
              {currentProjects} proyek
            </span>
          </div>
          <div className="pt-2">
            <p className="text-2xl font-bold">{currentProjects}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {projectChange === null
                ? previousProjects === 0
                  ? "Belum ada proyek pada minggu pembanding"
                  : `${previousProjects} proyek minggu lalu`
                : `${projectChange > 0 ? "+" : ""}${projectChange}% dibanding minggu lalu`}
            </p>
          </div>
          {entries.length || previousEntries.length ? (
            <div className="pt-2">
              <Chart
                options={trendOptions}
                series={[
                  { name: "Minggu ini", data: dailyProjects },
                  { name: "Minggu lalu", data: previousDailyProjects },
                ]}
                type="line"
                height={80}
                width="100%"
              />
            </div>
          ) : (
            <p className="py-6 text-xs text-muted-foreground">Belum ada aktivitas timesheet untuk dibandingkan.</p>
          )}
        </CardBox>
      </div>
    </div>
  );
}
