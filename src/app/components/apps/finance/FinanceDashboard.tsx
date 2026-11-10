"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Printer,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { FinanceAccountOption } from "@/app/components/apps/finance/IncomingFundModal";
import FinanceReportTemplateModal, {
  type ReportPayableRow,
  type ReportTransactionRow,
} from "@/app/components/apps/finance/FinanceReportTemplateModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { withLocalPhotoPreview } from "@/lib/photo-urls";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export type FinanceDashboardMonth = {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
};

export type FinanceExpenseCategory = {
  kind: "ticket" | "purchase-order" | "direct-material" | "office-expense";
  label: string;
  amount: number;
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

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const compactCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(amount);

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

export default function FinanceDashboard({
  reviewCount,
  pendingPaymentCount,
  outstandingAmount,
  months,
  accounts,
  transactions,
  expenseCategories,
  monthInflow,
  monthOutflow,
  payables = [],
  financeSignerName,
  financeQrDataUrl,
  coordinatorSignerName,
  directorSignerName,
}: {
  reviewCount: number;
  pendingPaymentCount: number;
  outstandingAmount: number;
  months: FinanceDashboardMonth[];
  accounts: FinanceAccountOption[];
  transactions: FinanceDashboardTransaction[];
  expenseCategories: FinanceExpenseCategory[];
  monthInflow: number;
  monthOutflow: number;
  payables?: ReportPayableRow[];
  financeSignerName?: string;
  financeQrDataUrl?: string | null;
  coordinatorSignerName?: string;
  directorSignerName?: string;
  onNavigate?: (
    tab: "check" | "payment" | "history" | "ledger",
    cashflowType?: "IN" | "OUT" | null,
  ) => void;
  onOpenIncoming?: () => void;
  onOpenTransfer?: () => void;
  onOpenOfficeExpense?: () => void;
  onPreviewProof?: (url: string, label: string) => void;
}) {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [showCharts, setShowCharts] = useState(true);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + account.balance, 0),
    [accounts],
  );

  // Pastikan seluruh transaksi Dana Masuk (IN) & Dana Keluar (OUT) masuk ke seri bulan grafik
  const enrichedMonths = useMemo(() => {
    const txByMonth = new Map<string, { in: number; out: number }>();
    for (const tx of transactions) {
      const d = new Date(tx.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const current = txByMonth.get(key) ?? { in: 0, out: 0 };
      if (tx.type === "IN") {
        current.in += tx.amount;
      } else {
        current.out += tx.amount;
      }
      txByMonth.set(key, current);
    }

    return months.map((m) => {
      const fromTx = txByMonth.get(m.key);
      return {
        ...m,
        inflow: Math.max(m.inflow, fromTx?.in ?? 0),
        outflow: Math.max(m.outflow, fromTx?.out ?? 0),
      };
    });
  }, [months, transactions]);

  const effectiveMonthInflow = useMemo(() => {
    const lastBucket = enrichedMonths[enrichedMonths.length - 1];
    return Math.max(monthInflow, lastBucket?.inflow ?? 0);
  }, [monthInflow, enrichedMonths]);

  const effectiveMonthOutflow = useMemo(() => {
    const lastBucket = enrichedMonths[enrichedMonths.length - 1];
    return Math.max(monthOutflow, lastBucket?.outflow ?? 0);
  }, [monthOutflow, enrichedMonths]);

  const monthNet = effectiveMonthInflow - effectiveMonthOutflow;

  const totalSixMonthInflow = useMemo(() => {
    const fromMonths = enrichedMonths.reduce((sum, m) => sum + m.inflow, 0);
    const fromTx = transactions
      .filter((tx) => tx.type === "IN")
      .reduce((sum, tx) => sum + tx.amount, 0);
    return Math.max(fromMonths, fromTx);
  }, [enrichedMonths, transactions]);

  const reportTransactions = useMemo<ReportTransactionRow[]>(
    () =>
      transactions.map((tx) => ({
        id: tx.id,
        date: formatDateTime(tx.createdAt),
        createdAtIso: tx.createdAt,
        description: tx.sourceDesc,
        category: tx.category,
        accountName: tx.accountOrDestination,
        direction: tx.type,
        amount: tx.amount,
        projectName: tx.projectName,
        counterparty: tx.counterparty,
        paymentMethod: tx.paymentMethod,
        proofUrl: tx.proofUrl ? withLocalPhotoPreview(tx.proofUrl) : undefined,
      })),
    [transactions],
  );

  // Masukkan Dana Masuk ke dalam Donut Chart bersama kategori pengeluaran
  const cashflowDistributionItems = useMemo(() => {
    const items: { label: string; amount: number; color: string }[] = [];

    if (totalSixMonthInflow > 0) {
      items.push({
        label: "Dana Masuk (Pemasukan)",
        amount: totalSixMonthInflow,
        color: "#38bdf8",
      });
    }

    const palette = ["#f97316", "#fb923c", "#64748b", "#475569", "#94a3b8"];
    expenseCategories.forEach((cat, idx) => {
      if (cat.amount > 0) {
        items.push({
          label: cat.label,
          amount: cat.amount,
          color: palette[idx % palette.length],
        });
      }
    });

    if (items.length === 0) {
      return [
        {
          label: "Belum ada transaksi",
          amount: 1,
          color: "#64748b",
        },
      ];
    }

    return items;
  }, [totalSixMonthInflow, expenseCategories]);

  const cashflowChartOptions: ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: "#94a3b8",
    },
    colors: ["#38bdf8", "#f97316"],
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: "50%",
      },
    },
    dataLabels: { enabled: false },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    xaxis: {
      categories: enrichedMonths.map((item) => item.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (value) => compactCurrency(value),
      },
    },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (value) => currency(value),
      },
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
    },
    grid: {
      borderColor: "rgba(148, 163, 184, 0.15)",
      strokeDashArray: 4,
    },
  };

  const donutOptions: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "inherit",
      foreColor: "#94a3b8",
    },
    labels: cashflowDistributionItems.map((item) => item.label),
    colors: cashflowDistributionItems.map((item) => item.color),
    dataLabels: { enabled: false },
    legend: {
      position: "bottom",
    },
    stroke: { width: 0 },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (value) =>
          cashflowDistributionItems[0]?.label === "Belum ada transaksi"
            ? "Rp 0"
            : currency(value),
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      {/* Header Ringkas 1 Baris */}
      <Card className="border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-semibold">
                FINANCE HUB &amp; ARUS KAS
              </Badge>
              <span className="text-xs text-muted-foreground">
                PT. Skala Prioritas Engineering
              </span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Pusat Kendali Keuangan, Pembayaran &amp; Buku Kas
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCharts((prev) => !prev)}
              className="gap-1.5 text-xs"
            >
              <BarChart3 className="size-3.5 text-primary" />
              {showCharts ? "Tutup Grafik" : "Lihat Grafik"}
              {showCharts ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setReportModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Printer className="size-3.5" />
              Template &amp; Cetak Laporan
            </Button>
          </div>
        </div>

        {/* 4 KPI Ringkas Menyatu di Dalam Kartu Atas */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5">
            <div>
              <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                Total Saldo Kas &amp; Bank
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight tabular-nums text-foreground">
                {currency(totalBalance)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {accounts.length} rekening / buku kas aktif
              </p>
            </div>
            <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5">
            <div>
              <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                Dana Masuk (Bulan Ini)
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight tabular-nums text-foreground">
                +{currency(effectiveMonthInflow)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Arus bersih:{" "}
                <strong className="text-foreground">
                  {monthNet >= 0 ? "+" : ""}
                  {currency(monthNet)}
                </strong>
              </p>
            </div>
            <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <TrendingUp className="size-4" aria-hidden="true" />
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5">
            <div>
              <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                Dana Keluar (Bulan Ini)
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight tabular-nums text-primary">
                -{currency(effectiveMonthOutflow)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                PO, tiket &amp; pengeluaran kantor
              </p>
            </div>
            <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <TrendingDown className="size-4" aria-hidden="true" />
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5">
            <div>
              <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                Sisa Tagihan Belum Lunas
              </p>
              <p className="mt-1 text-xl font-bold tracking-tight tabular-nums text-foreground">
                {currency(outstandingAmount)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pendingPaymentCount} antrean bayar · {reviewCount} PO diperiksa
              </p>
            </div>
            <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <FileCheck2 className="size-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Card>

      {/* Grafik Analitik Arus Kas (Hanya tampil jika dibuka, tanpa tabel/kartu berulang) */}
      {showCharts && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="p-4 sm:p-5 lg:col-span-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">
                  Tren Arus Kas (6 Bulan Terakhir)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Perbandingan bulanan antara Dana Masuk dan Dana Keluar.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                Total Masuk 6 Bln: +{currency(totalSixMonthInflow)}
              </Badge>
            </div>
            <Chart
              options={cashflowChartOptions}
              series={[
                {
                  name: "Dana Masuk",
                  data: enrichedMonths.map((item) => item.inflow),
                },
                {
                  name: "Dana Keluar",
                  data: enrichedMonths.map((item) => item.outflow),
                },
              ]}
              type="bar"
              height={250}
            />
          </Card>

          <Card className="p-4 sm:p-5 lg:col-span-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">
                Komposisi Dana Masuk &amp; Pengeluaran
              </h2>
              <p className="text-xs text-muted-foreground">
                Proporsi Dana Masuk dibandingkan kategori pengeluaran.
              </p>
            </div>
            <Chart
              options={donutOptions}
              series={cashflowDistributionItems.map((item) => item.amount)}
              type="donut"
              height={250}
            />
          </Card>
        </div>
      )}

      {/* Modal Template & Generator Laporan Keuangan */}
      <FinanceReportTemplateModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        accounts={accounts}
        transactions={reportTransactions}
        payables={payables}
        totalBalance={totalBalance}
        outstandingTotal={outstandingAmount}
        financeSignerName={financeSignerName}
        financeQrDataUrl={financeQrDataUrl}
        coordinatorSignerName={coordinatorSignerName}
        directorSignerName={directorSignerName}
      />
    </div>
  );
}
