"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { ApexOptions } from "apexcharts";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  Clock3,
  ExternalLink,
  Eye,
  ReceiptText,
  Wallet,
} from "lucide-react";
import type { FinanceAccountOption } from "@/app/components/apps/finance/IncomingFundModal";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { DataTableTemplate } from "@/components/ui/data-table-template";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export type FinanceDashboardMonth = {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
};

export type FinanceDashboardTransaction = {
  id: string;
  createdAt: string;
  type: "IN" | "OUT";
  category: string;
  sourceDesc: string;
  paymentMethod: string;
  counterparty: string;
  accountOrDestination: string;
  projectName: string | null;
  amount: number;
  proofUrl: string | null;
};

export type FinanceExpenseCategory = {
  kind:
    | "ticket"
    | "purchase-order"
    | "direct-material"
    | "office-expense";
  label: string;
  amount: number;
};

const colors = ["#3b82f6", "#60a5fa", "#93c5fd", "#f97345"];

const compactCurrency = (value: number) =>
  `Rp ${new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)}`;

const currency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function escapeCsv(value: string | number): string {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

export default function FinanceDashboard({
  reviewCount,
  pendingPaymentCount,
  outstandingAmount,
  accounts,
  transactions,
  months,
  expenseCategories,
  monthInflow,
  monthOutflow,
  onNavigate,
  onOpenIncoming,
  onPreviewProof,
}: {
  reviewCount: number;
  pendingPaymentCount: number;
  outstandingAmount: number;
  accounts: FinanceAccountOption[];
  transactions: FinanceDashboardTransaction[];
  months: FinanceDashboardMonth[];
  expenseCategories: FinanceExpenseCategory[];
  monthInflow: number;
  monthOutflow: number;
  onNavigate: (
    tab: "check" | "payment" | "history" | "ledger",
    cashflowType?: "IN" | "OUT" | null,
  ) => void;
  onOpenIncoming: () => void;
  onPreviewProof: (url: string, label: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const chartTextColor = isDark ? "#a7b5c8" : "#64748b";
  const totalBalance = accounts.reduce(
    (total, account) => total + account.balance,
    0,
  );
  const populatedExpenseCategories = expenseCategories.filter(
    (category) => category.amount > 0,
  );
  const expenseTotal = populatedExpenseCategories.reduce(
    (total, category) => total + category.amount,
    0,
  );
  const hasTrend = months.some((month) => month.inflow > 0 || month.outflow > 0);
  const trendSeries: ApexAxisChartSeries = [
    {
      name: "Dana Masuk (Inflow)",
      type: "area",
      data: months.map((month) => month.inflow),
    },
    {
      name: "Dana Keluar (Outflow)",
      type: "area",
      data: months.map((month) => month.outflow),
    },
  ];
  const trendOptions: ApexOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: chartTextColor,
      zoom: { enabled: false },
      background: "transparent",
    },
    colors: ["#3b82f6", "#f97345"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: [3, 3] },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.55,
        opacityTo: 0.08,
        stops: [0, 90, 100],
      },
    },
    grid: {
      borderColor: isDark
        ? "rgba(148,163,184,0.16)"
        : "rgba(100,116,139,0.2)",
      strokeDashArray: 4,
    },
    xaxis: {
      categories: months.map((month) => month.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      labels: { formatter: compactCurrency },
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: isDark ? "dark" : "light",
      y: { formatter: currency },
    },
    legend: { position: "top", horizontalAlign: "right" },
  };
  const distributionOptions: ApexOptions = {
    chart: {
      type: "radialBar",
      fontFamily: "inherit",
      foreColor: chartTextColor,
      background: "transparent",
    },
    colors,
    labels: populatedExpenseCategories.map((category) => category.label),
    plotOptions: {
      radialBar: {
        startAngle: -110,
        endAngle: 250,
        hollow: { size: "28%", background: "transparent" },
        track: {
          background: isDark
            ? "rgba(148,163,184,0.12)"
            : "rgba(100,116,139,0.16)",
          margin: 5,
          strokeWidth: "90%",
        },
        dataLabels: {
          name: { show: false },
          value: { show: false },
          total: {
            show: true,
            label: "Total pengeluaran",
            color: chartTextColor,
            formatter: () => compactCurrency(expenseTotal),
          },
        },
      },
    },
    stroke: { lineCap: "round" },
    legend: { show: false },
    tooltip: {
      y: {
        formatter: (percentage, options) => {
          const index = options.seriesIndex;
          const category = populatedExpenseCategories[index];
          return category
            ? `${currency(category.amount)} (${percentage.toFixed(1)}%)`
            : `${percentage.toFixed(1)}%`;
        },
      },
    },
  };
  const expenseSeries =
    expenseTotal > 0
      ? populatedExpenseCategories.map((category) =>
          Math.round((category.amount / expenseTotal) * 1000) / 10,
        )
      : [];

  const downloadReport = () => {
    const header = [
      "Tanggal",
      "Tipe",
      "Deskripsi",
      "Metode",
      "Pengirim",
      "Akun",
      "Proyek",
      "Nominal",
    ];
    const rows = transactions.map((transaction) => [
      new Date(transaction.createdAt).toLocaleString("id-ID"),
      transaction.type === "IN" ? "Dana Masuk" : "Pengeluaran",
      `${transaction.category} · ${transaction.sourceDesc}`,
      transaction.paymentMethod,
      transaction.counterparty,
      transaction.accountOrDestination,
      transaction.projectName ?? "",
      transaction.amount,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = [
    {
      title: "Total Saldo (All Accounts)",
      value: currency(totalBalance),
      note: `${accounts.length} rekening / buku kas`,
      icon: Wallet,
      cashflowType: null,
      tone:
        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300",
    },
    {
      title: "Total Pemasukan (Inflow)",
      value: currency(monthInflow),
      note: "Bulan berjalan",
      icon: ArrowDownLeft,
      cashflowType: "IN",
      tone:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300",
    },
    {
      title: "Total Pengeluaran (Outflow)",
      value: currency(monthOutflow),
      note: "Bulan berjalan",
      icon: ArrowUpRight,
      cashflowType: "OUT",
      tone:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300",
    },
  ] as const;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Finance Hub &amp; Arus Kas
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Analisis arus kas dan buku bank. Dana keluar hanya diproses untuk
            permintaan atau tagihan yang tercatat dan menunggu pembayaran.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionIconButton
            type="button"
            label="Input Dana Masuk"
            tooltip="Input Dana Masuk"
            icon={ArrowDownLeft}
            onClick={onOpenIncoming}
            variant="secondary"
            className="size-11"
          />
          <ActionIconButton
            type="button"
            label="Unduh Laporan"
            tooltip="Unduh Laporan"
            icon={ArrowDownToLine}
            onClick={downloadReport}
            disabled={transactions.length === 0}
            className="size-11"
          />
        </div>
      </header>

      <div className="grid !grid-cols-2 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.title}
              onClick={() => onNavigate("ledger", item.cashflowType)}
              aria-label={`Buka buku kas: ${item.title}`}
              className={`min-w-0 rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${item.tone}`}
            >
              <div className="flex min-h-9 items-start justify-between gap-2 sm:min-h-0 sm:gap-3">
                <p className="min-w-0 text-xs font-medium leading-tight text-foreground sm:text-sm">
                  {item.title}
                </p>
                <Icon className="size-4 shrink-0 sm:size-5" aria-hidden="true" />
              </div>
              <p className="mt-2 truncate text-base font-bold tabular-nums text-foreground sm:text-xl 2xl:text-2xl">
                {item.value}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                {item.note}
              </p>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onNavigate("history")}
          aria-label="Buka riwayat dan bukti transfer"
          className="min-w-0 rounded-xl border border-violet-200 bg-violet-50 p-4 text-left text-violet-900 transition hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/15"
        >
          <span className="flex min-h-9 items-start justify-between gap-2 sm:min-h-0 sm:gap-3">
            <span className="min-w-0 text-xs font-medium leading-tight text-violet-800 dark:text-slate-300 sm:text-sm">
              Hutang / Sisa Tagihan
            </span>
            <Clock3 className="size-4 shrink-0 text-violet-300 sm:size-5" aria-hidden="true" />
          </span>
          <span className="mt-2 block truncate text-base font-bold tabular-nums text-foreground sm:text-xl 2xl:text-2xl">
            {currency(outstandingAmount)}
          </span>
          <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-muted-foreground sm:text-xs">
            Dibayar bertahap melalui DP, Termin, atau Pelunasan
          </span>
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <article className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-7">
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h2 className="font-semibold">Tren Arus Kas (Inflow vs Outflow)</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pergerakan dana selama enam bulan terakhir
              </p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-400" />
                Dana Masuk
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-orange-400" />
                Dana Keluar
              </span>
            </div>
          </header>
          {hasTrend ? (
            <div className="px-2 py-3 sm:px-4">
              <Chart
                options={trendOptions}
                series={trendSeries}
                type="area"
                height={230}
                width="100%"
              />
            </div>
          ) : (
            <p className="flex min-h-[230px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Belum ada arus kas pada periode enam bulan terakhir.
            </p>
          )}
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Antrean:{" "}
            <button
              type="button"
              onClick={() => onNavigate("check")}
              className="font-semibold text-primary hover:underline"
            >
              {reviewCount} PO perlu diperiksa
            </button>
            <span className="px-2 text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => onNavigate("payment")}
              className="font-semibold text-secondary hover:underline"
            >
              {pendingPaymentCount} pembayaran menunggu
            </button>
            <span className="px-2 text-muted-foreground">·</span>
            Sisa tagihan {compactCurrency(outstandingAmount)}
          </p>
        </article>

        <article className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-5">
          <header className="border-b border-border px-4 py-3 sm:px-5">
            <h2 className="font-semibold">Distribusi Pengeluaran</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tiket, PO, dan Belanja Material Langsung yang sudah dibayar
            </p>
          </header>
          {expenseSeries.length ? (
            <>
              <Chart
                options={distributionOptions}
                series={expenseSeries}
                type="radialBar"
                height={220}
                width="100%"
              />
              <ul className="grid gap-x-4 gap-y-2 px-4 pb-4 sm:grid-cols-2">
                {populatedExpenseCategories.map((category, index) => (
                  <li
                    key={category.kind}
                    className="flex min-w-0 items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[index % colors.length] }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-foreground">
                        {category.label}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                      {compactCurrency(category.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex min-h-[280px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Belum ada pembayaran lunas dari Tiket, PO, atau Belanja Material Langsung.
            </p>
          )}
        </article>
      </div>

      <article className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-blue-300" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Daftar Transaksi Terbaru (Arus Kas)</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Maksimal lima transaksi per halaman
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("history")}
            className="shrink-0 text-primary hover:bg-muted hover:text-primary"
          >
            Riwayat pembayaran
            <ExternalLink className="ml-1 size-3.5" aria-hidden="true" />
          </Button>
        </header>
        <DataTableTemplate
          data={transactions}
          itemLabel="transaksi"
          pageSize={5}
          tableClassName="min-w-[900px] text-left text-xs sm:text-sm"
        >
          {(pageData) => (
            <>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal &amp; Waktu</TableHead>
                  <TableHead>Deskripsi &amp; Kategori</TableHead>
                  <TableHead>Metode / Termin &amp; Bukti</TableHead>
                  <TableHead>Pihak &amp; Rekening Tujuan</TableHead>
                  <TableHead className="text-right">Status &amp; Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.map((transaction) => (
                  <TableRow
                    key={`${transaction.type}-${transaction.id}`}
                    className="text-foreground"
                  >
                    <TableCell className="whitespace-nowrap">
                      <span className="block text-foreground">
                        {new Date(transaction.createdAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {new Date(transaction.createdAt).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="block truncate font-medium text-foreground">
                        {transaction.sourceDesc}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground">
                        {transaction.projectName || transaction.category}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="block">{transaction.paymentMethod}</span>
                      {transaction.proofUrl && (
                        <div className="mt-1">
                          <ActionIconButton
                            type="button"
                            label={`Lihat bukti transaksi ${transaction.sourceDesc}`}
                            tooltip="Lihat bukti"
                            icon={Eye}
                            onClick={() => {
                              if (transaction.proofUrl) {
                                onPreviewProof(
                                  transaction.proofUrl,
                                  `Bukti transaksi ${transaction.sourceDesc}`,
                                );
                              }
                            }}
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate">
                        {transaction.counterparty}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground">
                        {transaction.accountOrDestination}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold sm:text-[11px] ${
                          transaction.type === "IN"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-rose-500/15 text-rose-300"
                        }`}
                      >
                        {transaction.type === "IN" ? (
                          <ArrowDownLeft className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="size-3" aria-hidden="true" />
                        )}
                        {transaction.type === "IN" ? "Masuk" : "Keluar"}
                      </span>
                      <span className="mt-1 block font-semibold tabular-nums text-foreground">
                        {transaction.type === "IN" ? "+" : "-"}
                        {currency(transaction.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {pageData.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Belum ada transaksi arus kas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </>
          )}
        </DataTableTemplate>
      </article>
    </section>
  );
}
