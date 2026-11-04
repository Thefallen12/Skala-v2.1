"use client";

import { useState } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";

export type UserChartRecord = {
  role: UserRole;
  createdAt: string;
};

const roleOptions: { role: UserRole; label: string }[] = [
  { role: UserRole.DIRECTOR, label: "Direktur" },
  { role: UserRole.DEPUTY_DIRECTOR, label: "Wakil Direktur" },
  { role: UserRole.DRAFTER, label: "Drafter" },
  { role: UserRole.FINANCE, label: "Keuangan" },
  { role: UserRole.LOGISTICS, label: "Koordinator Logistik" },
  { role: UserRole.KOORDINATOR, label: "Koordinator Lapangan" },
  { role: UserRole.FIELD_TEAM, label: "Tim Lapangan" },
  { role: UserRole.MOVER, label: "Mover" },
  { role: UserRole.ADMINISTRATIONS, label: "Administrasi" },
];

const colors = [
  "var(--color-primary)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

export default function UserManagementCharts({
  users,
}: {
  users: UserChartRecord[];
}) {
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const today = new Date();
  const rangeStart = new Date(today);
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (range - 1));
  const bucketSize = range === 7 ? 1 : 7;
  const registrationBuckets = Array.from(
    { length: Math.ceil(range / bucketSize) },
    (_, index) => {
      const start = new Date(rangeStart);
      start.setDate(start.getDate() + index * bucketSize);
      const end = new Date(start);
      end.setDate(end.getDate() + bucketSize);
      return { start, end };
    },
  );
  const registrationCounts = registrationBuckets.map(({ start, end }) =>
    users.filter((user) => {
      const createdAt = new Date(user.createdAt);
      return createdAt >= start && createdAt < end;
    }).length,
  );
  const roleCounts = roleOptions.map(
    ({ role }) => users.filter((user) => user.role === role).length,
  );
  const presentRoles = roleOptions
    .map((role, index) => ({ ...role, count: roleCounts[index] }))
    .filter(({ count }) => count > 0);

  const trendOptions: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: "#7C8FAC",
    },
    colors: ["var(--color-primary)"],
    plotOptions: {
      bar: { borderRadius: 4, columnWidth: "45%", distributed: false },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: "rgba(124,143,172,0.18)", strokeDashArray: 3 },
    xaxis: {
      categories: registrationBuckets.map(({ start }) =>
        range === 7
          ? new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(start)
          : new Intl.DateTimeFormat("id-ID", {
              day: "numeric",
              month: "short",
            }).format(start),
      ),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: { formatter: (value) => `${Math.round(value)}` },
    },
    tooltip: { y: { formatter: (value) => `${value} akun` } },
  };

  const roleOptionsChart: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit", foreColor: "#7C8FAC" },
    colors,
    labels: roleOptions.map(({ label }) => label),
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
            value: { show: true, offsetY: -10 },
            total: {
              show: true,
              label: "Total pengguna",
              formatter: () => `${users.length}`,
            },
          },
        },
      },
    },
    tooltip: { y: { formatter: (value) => `${value} pengguna` } },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="overflow-hidden rounded-md border border-border bg-card lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Tren Registrasi Pengguna</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Akun baru yang dibuat dalam {range} hari terakhir
            </p>
          </div>
          <div className="flex gap-1" aria-label="Periode tren registrasi">
            {([7, 30, 90] as const).map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={range === days ? "default" : "outline"}
                aria-pressed={range === days}
                onClick={() => setRange(days)}
              >
                {days}D
              </Button>
            ))}
          </div>
        </div>
        {users.length > 0 ? (
          <div className="p-4">
            <Chart
              options={trendOptions}
              series={[{ name: "Akun baru", data: registrationCounts }]}
              type="bar"
              height={290}
              width="100%"
            />
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Belum ada pengguna untuk ditampilkan.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Distribusi Pengguna</h2>
          <p className="mt-1 text-sm text-muted-foreground">Berdasarkan role</p>
        </div>
        {users.length > 0 ? (
          <>
            <Chart
              options={roleOptionsChart}
              series={roleCounts}
              type="donut"
              height={240}
              width="100%"
            />
            <ul className="space-y-2 px-5 pb-5">
              {presentRoles.map((role) => (
                <li
                  key={role.role}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          colors[roleOptions.findIndex((item) => item.role === role.role)],
                      }}
                      aria-hidden="true"
                    />
                    {role.label}
                  </span>
                  <span className="font-medium tabular-nums">{role.count}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Belum ada distribusi role.
          </p>
        )}
      </section>
    </div>
  );
}
