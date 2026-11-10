"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Printer,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FinanceAccountCard } from "@/app/components/apps/finance/FinanceLedger";

export type ReportTransactionRow = {
  id: string;
  date: string;
  createdAtIso?: string;
  description: string;
  category: string;
  accountName: string;
  accountId?: string;
  direction: "IN" | "OUT";
  amount: number;
  projectName?: string | null;
  counterparty?: string | null;
  paymentMethod?: string | null;
  proofUrl?: string;
};

export type ReportPayableRow = {
  id: string;
  reference: string;
  title: string;
  vendorOrRequester: string;
  sourceLabel: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  transferDestination?: string;
};

type ReportTemplateType =
  | "CASHFLOW_FULL"
  | "ACCOUNT_BALANCE"
  | "EXPENSE_BREAKDOWN"
  | "OUTSTANDING_PAYABLE";

type PeriodFilterType = "ALL" | "THIS_MONTH" | "LAST_30_DAYS" | "CUSTOM";

const currency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const escapeCsvCell = (value: string | number) => {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const TEMPLATE_OPTIONS: {
  id: ReportTemplateType;
  title: string;
  subtitle: string;
  badge: string;
}[] = [
  {
    id: "CASHFLOW_FULL",
    title: "1. Laporan Arus Kas & Mutasi Lengkap",
    subtitle: "Rekap saldo kas/bank beserta rincian dana masuk & keluar.",
    badge: "Standar Utama",
  },
  {
    id: "ACCOUNT_BALANCE",
    title: "2. Laporan Posisi Saldo Rekening & Kas",
    subtitle: "Ringkasan posisi saldo per bank, e-wallet, dan kas tunai.",
    badge: "Rekonsiliasi",
  },
  {
    id: "EXPENSE_BREAKDOWN",
    title: "3. Laporan Pengeluaran per Kategori & Proyek",
    subtitle: "Analisa porsi biaya PO, operasional tiket, kas kantor, & proyek.",
    badge: "Analitik Biaya",
  },
  {
    id: "OUTSTANDING_PAYABLE",
    title: "4. Laporan Hutang & Tagihan Belum Lunas",
    subtitle: "Daftar tagihan PO & pengajuan dana yang menunggu pelunasan.",
    badge: "Kontrol Hutang",
  },
];

export default function FinanceReportTemplateModal({
  open,
  onClose,
  accounts,
  transactions,
  payables = [],
  totalBalance,
  outstandingTotal,
  financeSignerName,
  financeQrDataUrl,
  coordinatorSignerName,
  directorSignerName,
}: {
  open: boolean;
  onClose: () => void;
  accounts: FinanceAccountCard[];
  transactions: ReportTransactionRow[];
  payables?: ReportPayableRow[];
  totalBalance: number;
  outstandingTotal: number;
  financeSignerName?: string;
  financeQrDataUrl?: string | null;
  coordinatorSignerName?: string;
  directorSignerName?: string;
}) {
  const [templateType, setTemplateType] =
    useState<ReportTemplateType>("CASHFLOW_FULL");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterType>("ALL");
  const [selectedAccountName, setSelectedAccountName] = useState<string>("ALL");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [reportNote, setReportNote] = useState<string>(
    "Laporan keuangan dan mutasi arus kas operasional PT. Skala Prioritas Engineering.",
  );
  const preparedBy = financeSignerName || "Bagian Keuangan (Finance)";
  const [checkedBy, setCheckedBy] = useState<string>(
    coordinatorSignerName || "Koordinator / Administrasi",
  );
  const [approvedBy, setApprovedBy] = useState<string>(
    directorSignerName || "Direktur Utama",
  );

  const now = useMemo(() => new Date(), []);
  const reportNumber = useMemo(() => {
    const romanMonths = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
    ];
    const year = now.getFullYear();
    const monthIdx = now.getMonth();
    const month = String(monthIdx + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const roman = romanMonths[monthIdx] ?? "I";
    const typeShort =
      templateType === "ACCOUNT_BALANCE"
        ? "FIN-BAL"
        : templateType === "EXPENSE_BREAKDOWN"
          ? "FIN-EXP"
          : templateType === "OUTSTANDING_PAYABLE"
            ? "FIN-AP"
            : "FIN-CF";
    return `SPE-${month}${day}/${typeShort}/${roman}/${year}`;
  }, [now, templateType]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (
        selectedAccountName !== "ALL" &&
        tx.accountName !== selectedAccountName
      ) {
        return false;
      }

      if (periodFilter === "ALL" || !tx.createdAtIso) {
        return true;
      }

      const txDate = new Date(tx.createdAtIso);
      if (Number.isNaN(txDate.getTime())) return true;

      if (periodFilter === "THIS_MONTH") {
        return (
          txDate.getFullYear() === now.getFullYear() &&
          txDate.getMonth() === now.getMonth()
        );
      }

      if (periodFilter === "LAST_30_DAYS") {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return txDate >= thirtyDaysAgo;
      }

      if (periodFilter === "CUSTOM") {
        if (customStartDate) {
          const start = new Date(`${customStartDate}T00:00:00`);
          if (txDate < start) return false;
        }
        if (customEndDate) {
          const end = new Date(`${customEndDate}T23:59:59`);
          if (txDate > end) return false;
        }
      }

      return true;
    });
  }, [
    transactions,
    selectedAccountName,
    periodFilter,
    customStartDate,
    customEndDate,
    now,
  ]);

  const summary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let countIn = 0;
    let countOut = 0;

    for (const tx of filteredTransactions) {
      if (tx.direction === "IN") {
        totalIn += tx.amount;
        countIn += 1;
      } else {
        totalOut += tx.amount;
        countOut += 1;
      }
    }

    return {
      totalIn,
      totalOut,
      netCashflow: totalIn - totalOut,
      countIn,
      countOut,
      totalCount: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  const accountSummaryRows = useMemo(() => {
    return accounts.map((acc) => {
      let accIn = 0;
      let accOut = 0;
      let txCount = 0;
      for (const tx of filteredTransactions) {
        if (tx.accountName === acc.accountName) {
          txCount += 1;
          if (tx.direction === "IN") accIn += tx.amount;
          else accOut += tx.amount;
        }
      }
      const sharePct =
        totalBalance > 0
          ? Math.max(0, Math.round((acc.balance / totalBalance) * 1000) / 10)
          : 0;
      return {
        ...acc,
        accIn,
        accOut,
        txCount,
        sharePct,
      };
    });
  }, [accounts, filteredTransactions, totalBalance]);

  const expenseCategoryRows = useMemo(() => {
    const map = new Map<
      string,
      { category: string; count: number; total: number }
    >();
    let grandOut = 0;
    for (const tx of filteredTransactions) {
      if (tx.direction !== "OUT") continue;
      grandOut += tx.amount;
      const key = tx.category || "Lainnya";
      const current = map.get(key) ?? { category: key, count: 0, total: 0 };
      current.count += 1;
      current.total += tx.amount;
      map.set(key, current);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map((item) => ({
        ...item,
        percentage:
          grandOut > 0 ? Math.round((item.total / grandOut) * 1000) / 10 : 0,
      }));
  }, [filteredTransactions]);

  const periodLabel = useMemo(() => {
    if (periodFilter === "THIS_MONTH") {
      return new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
      }).format(now);
    }
    if (periodFilter === "LAST_30_DAYS") {
      return "30 Hari Terakhir";
    }
    if (periodFilter === "CUSTOM") {
      return `${customStartDate || "Awal"} s/d ${customEndDate || "Sekarang"}`;
    }
    return "Semua Periode Tercatat";
  }, [periodFilter, customStartDate, customEndDate, now]);

  const activeTemplateMeta =
    TEMPLATE_OPTIONS.find((item) => item.id === templateType) ??
    TEMPLATE_OPTIONS[0];

  const handleDownloadCsvReport = () => {
    const lines: (string | number)[][] = [
      ["PT. SKALA PRIORITAS ENGINEERING (KODE PERUSAHAAN: SPE) - LAPORAN KEUANGAN & ARUS KAS"],
      ["Kode Perusahaan", "SPE (PT. Skala Prioritas Engineering)"],
      ["Jenis Laporan", activeTemplateMeta.title],
      ["Nomor Dokumen", reportNumber],
      ["Periode", periodLabel],
      [
        "Filter Buku Kas/Bank",
        selectedAccountName === "ALL" ? "Semua Rekening" : selectedAccountName,
      ],
      ["Catatan Laporan", reportNote],
      [],
      ["RINGKASAN EKSEKUTIF"],
      ["Total Saldo Kas & Bank Saat Ini", totalBalance],
      ["Total Dana Masuk (Periode Filter)", summary.totalIn],
      ["Total Dana Keluar (Periode Filter)", summary.totalOut],
      ["Arus Kas Bersih (Net Cashflow)", summary.netCashflow],
      ["Total Sisa Hutang / Tagihan Belum Lunas", outstandingTotal],
      [],
    ];

    if (templateType === "ACCOUNT_BALANCE") {
      lines.push([
        "POSISI SALDO PER BUKU KAS & BANK",
      ]);
      lines.push([
        "No",
        "Nama Rekening / Kas",
        "Nomor Rekening",
        "Atas Nama / Pemegang Kas",
        "Dana Masuk (Periode)",
        "Dana Keluar (Periode)",
        "Saldo Akhir Saat Ini",
        "Porsi Kas (%)",
      ]);
      accountSummaryRows.forEach((acc, idx) => {
        lines.push([
          idx + 1,
          acc.accountName,
          acc.accountNumber ?? "Kas Tunai",
          acc.holderName,
          acc.accIn,
          acc.accOut,
          acc.balance,
          `${acc.sharePct}%`,
        ]);
      });
    } else if (templateType === "EXPENSE_BREAKDOWN") {
      lines.push(["REKAPITULASI PENGELUARAN PER KATEGORI"]);
      lines.push([
        "No",
        "Kategori Pengeluaran",
        "Jumlah Transaksi",
        "Total Nominal (Rp)",
        "Porsi Biaya (%)",
      ]);
      expenseCategoryRows.forEach((row, idx) => {
        lines.push([
          idx + 1,
          row.category,
          row.count,
          row.total,
          `${row.percentage}%`,
        ]);
      });
      lines.push([]);
      lines.push(["RINCIAN TRANSAKSI PENGELUARAN"]);
      lines.push([
        "No",
        "Tanggal",
        "Kategori",
        "Keterangan",
        "Proyek",
        "Buku Kas/Bank",
        "Nominal Keluar (Rp)",
      ]);
      filteredTransactions
        .filter((tx) => tx.direction === "OUT")
        .forEach((tx, idx) => {
          lines.push([
            idx + 1,
            tx.date,
            tx.category,
            tx.description,
            tx.projectName ?? "-",
            tx.accountName,
            tx.amount,
          ]);
        });
    } else if (templateType === "OUTSTANDING_PAYABLE") {
      lines.push(["DAFTAR HUTANG & TAGIHAN BELUM LUNAS (OUTSTANDING)"]);
      lines.push([
        "No",
        "Nomor Referensi",
        "Sumber Tagihan",
        "Judul / Keperluan",
        "Vendor / Pemohon",
        "Tujuan Transfer",
        "Total Tagihan (Rp)",
        "Sudah Dibayar (Rp)",
        "Sisa Hutang (Rp)",
      ]);
      payables.forEach((row, idx) => {
        lines.push([
          idx + 1,
          row.reference,
          row.sourceLabel,
          row.title,
          row.vendorOrRequester,
          row.transferDestination ?? "-",
          row.grandTotal,
          row.paidAmount,
          row.remainingAmount,
        ]);
      });
    } else {
      lines.push(["REKAP SALDO REKENING"]);
      lines.push([
        "Nama Rekening / Kas",
        "Nomor Rekening",
        "Atas Nama",
        "Saldo Saat Ini (Rp)",
      ]);
      accountSummaryRows.forEach((acc) => {
        lines.push([
          acc.accountName,
          acc.accountNumber ?? "Kas Tunai",
          acc.holderName,
          acc.balance,
        ]);
      });
      lines.push([]);
      lines.push(["RINCIAN MUTASI ARUS KAS (DANA MASUK & KELUAR)"]);
      lines.push([
        "No",
        "Tanggal & Waktu",
        "Kategori / Referensi",
        "Deskripsi Transaksi",
        "Proyek",
        "Buku Kas / Bank",
        "Arus (IN/OUT)",
        "Dana Masuk (+)",
        "Dana Keluar (-)",
      ]);
      filteredTransactions.forEach((tx, idx) => {
        lines.push([
          idx + 1,
          tx.date,
          tx.category,
          tx.description,
          tx.projectName ?? "-",
          tx.accountName,
          tx.direction === "IN" ? "DANA MASUK" : "DANA KELUAR",
          tx.direction === "IN" ? tx.amount : 0,
          tx.direction === "OUT" ? tx.amount : 0,
        ]);
      });
    }

    lines.push([]);
    lines.push(["OTORISASI LAPORAN"]);
    lines.push(["Disusun Oleh", "Diperiksa Oleh", "Disetujui Oleh"]);
    lines.push([preparedBy, checkedBy, approvedBy]);

    const csvContent =
      "\uFEFF" +
      lines
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SPE-Laporan-Keuangan-${templateType.toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBlankTemplate = () => {
    const templateRows: (string | number)[][] = [
      ["TEMPLATE PENCATATAN BUKU KAS & ARUS DANA - PT. SKALA PRIORITAS ENGINEERING (KODE: SPE)"],
      ["Kode Perusahaan: SPE | Petunjuk: Isi baris di bawah ini untuk rekapitulasi kas harian/mingguan."],
      [],
      [
        "No",
        "Tanggal (YYYY-MM-DD)",
        "Jenis Arus (MASUK / KELUAR)",
        "Kategori (Dana Masuk / PO / Tiket / Kas Kantor / BBM)",
        "Nama Buku Kas / Bank",
        "Metode (TRANSFER / CASH)",
        "Proyek Terkait",
        "Nama Pengirim / Penerima",
        "Uraian / Keterangan Lengkap",
        "Nominal Masuk (Rp)",
        "Nominal Keluar (Rp)",
        "Nomor Bukti / Referensi SPE",
      ],
      [
        1,
        now.toISOString().slice(0, 10),
        "MASUK",
        "Dana Masuk",
        accounts[0]?.accountName ?? "Bank BCA",
        "TRANSFER",
        "Proyek Contoh",
        "PT. Pemberi Kerja",
        "Contoh: Penerimaan Termin 1 Proyek",
        25000000,
        0,
        "SPE-001/INV/2026",
      ],
      [
        2,
        now.toISOString().slice(0, 10),
        "KELUAR",
        "Kas Kantor",
        accounts[0]?.accountName ?? "Kas Kecil (Petty Cash)",
        "CASH",
        "-",
        "Staf Operasional",
        "Contoh: Pembelian ATK & Konsumsi Rapat",
        0,
        350000,
        "SPE-002/KW/2026",
      ],
    ];

    const csvContent =
      "\uFEFF" +
      templateRows
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SPE-Template-Kosong-Arus-Kas.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintOfficialReport = () => {
    const printWindow = window.open("", "_blank", "width=1024,height=800");
    if (!printWindow) return;

    const printedAt = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());

    const accountRowsHtml = accountSummaryRows
      .map(
        (acc, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong>${escapeHtml(acc.accountName)}</strong></td>
          <td>${escapeHtml(acc.accountNumber ?? "Kas Tunai")}</td>
          <td>${escapeHtml(acc.holderName)}</td>
          <td style="text-align:right;">+${escapeHtml(currency(acc.accIn))}</td>
          <td style="text-align:right;">-${escapeHtml(currency(acc.accOut))}</td>
          <td style="text-align:right;font-weight:700;color:#102a4d;">${escapeHtml(currency(acc.balance))}</td>
        </tr>`,
      )
      .join("");

    const transactionRowsHtml = filteredTransactions
      .map(
        (tx, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td>${escapeHtml(tx.date)}</td>
          <td>${escapeHtml(tx.category)}</td>
          <td>
            <div><strong>${escapeHtml(tx.description)}</strong></div>
            ${tx.projectName ? `<div style="font-size:10px;color:#475569;">Proyek: ${escapeHtml(tx.projectName)}</div>` : ""}
          </td>
          <td>${escapeHtml(tx.accountName)}</td>
          <td style="text-align:right;font-weight:600;color:#102a4d;">
            ${tx.direction === "IN" ? `+${escapeHtml(currency(tx.amount))}` : "-"}
          </td>
          <td style="text-align:right;font-weight:600;color:#c9772d;">
            ${tx.direction === "OUT" ? `-${escapeHtml(currency(tx.amount))}` : "-"}
          </td>
        </tr>`,
      )
      .join("");

    const expenseRowsHtml = expenseCategoryRows
      .map(
        (row, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong>${escapeHtml(row.category)}</strong></td>
          <td style="text-align:center;">${row.count} transaksi</td>
          <td style="text-align:right;font-weight:700;color:#102a4d;">${escapeHtml(currency(row.total))}</td>
          <td style="text-align:right;">${row.percentage}%</td>
        </tr>`,
      )
      .join("");

    const payableRowsHtml = payables
      .map(
        (row, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong>${escapeHtml(row.reference)}</strong><div style="font-size:10px;color:#475569;">${escapeHtml(row.sourceLabel)}</div></td>
          <td>${escapeHtml(row.title)}</td>
          <td>${escapeHtml(row.vendorOrRequester)}</td>
          <td style="text-align:right;">${escapeHtml(currency(row.grandTotal))}</td>
          <td style="text-align:right;color:#102a4d;">${escapeHtml(currency(row.paidAmount))}</td>
          <td style="text-align:right;font-weight:700;color:#c9772d;">${escapeHtml(currency(row.remainingAmount))}</td>
        </tr>`,
      )
      .join("");

    let bodySectionHtml = "";
    if (templateType === "ACCOUNT_BALANCE") {
      bodySectionHtml = `
        <h3 class="section-title">A. Rekapitulasi Posisi Saldo Buku Kas & Bank</h3>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">No</th>
              <th>Nama Rekening / Kas</th>
              <th>Nomor Rekening</th>
              <th>Atas Nama</th>
              <th style="text-align:right;">Mutasi Masuk</th>
              <th style="text-align:right;">Mutasi Keluar</th>
              <th style="text-align:right;">Saldo Akhir</th>
            </tr>
          </thead>
          <tbody>
            ${accountRowsHtml || `<tr><td colspan="7" style="text-align:center;">Belum ada rekening terdaftar.</td></tr>`}
          </tbody>
        </table>
      `;
    } else if (templateType === "EXPENSE_BREAKDOWN") {
      bodySectionHtml = `
        <h3 class="section-title">A. Ringkasan Pengeluaran per Kategori</h3>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">No</th>
              <th>Kategori Pengeluaran</th>
              <th style="text-align:center;">Frekuensi</th>
              <th style="text-align:right;">Total Nominal</th>
              <th style="text-align:right;">Porsi (%)</th>
            </tr>
          </thead>
          <tbody>
            ${expenseRowsHtml || `<tr><td colspan="5" style="text-align:center;">Tidak ada data pengeluaran pada periode ini.</td></tr>`}
          </tbody>
        </table>
        <h3 class="section-title" style="margin-top:18px;">B. Rincian Transaksi Pengeluaran</h3>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">No</th>
              <th>Tanggal</th>
              <th>Kategori</th>
              <th>Deskripsi & Proyek</th>
              <th>Buku Kas/Bank</th>
              <th style="text-align:right;">Masuk (+)</th>
              <th style="text-align:right;">Keluar (-)</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRowsHtml || `<tr><td colspan="7" style="text-align:center;">Tidak ada transaksi pada periode ini.</td></tr>`}
          </tbody>
        </table>
      `;
    } else if (templateType === "OUTSTANDING_PAYABLE") {
      bodySectionHtml = `
        <h3 class="section-title">A. Daftar Tagihan & Hutang Belum Lunas (Outstanding Payables)</h3>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">No</th>
              <th>No. Referensi</th>
              <th>Uraian / Keperluan</th>
              <th>Vendor / Pemohon</th>
              <th style="text-align:right;">Total Tagihan</th>
              <th style="text-align:right;">Terbayar</th>
              <th style="text-align:right;">Sisa Hutang</th>
            </tr>
          </thead>
          <tbody>
            ${payableRowsHtml || `<tr><td colspan="7" style="text-align:center;">Seluruh tagihan telah lunas. Tidak ada hutang menggantung.</td></tr>`}
          </tbody>
        </table>
      `;
    } else {
      bodySectionHtml = `
        <h3 class="section-title">A. Posisi Saldo Buku Kas & Bank</h3>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">No</th>
              <th>Nama Rekening / Kas</th>
              <th>Nomor Rekening</th>
              <th>Atas Nama</th>
              <th style="text-align:right;">Mutasi Masuk</th>
              <th style="text-align:right;">Mutasi Keluar</th>
              <th style="text-align:right;">Saldo Saat Ini</th>
            </tr>
          </thead>
          <tbody>
            ${accountRowsHtml || `<tr><td colspan="7" style="text-align:center;">Belum ada rekening terdaftar.</td></tr>`}
          </tbody>
        </table>
        <h3 class="section-title" style="margin-top:18px;">B. Rincian Mutasi Arus Kas (Inflow & Outflow)</h3>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">No</th>
              <th style="width:115px;">Tanggal</th>
              <th style="width:110px;">Kategori</th>
              <th>Deskripsi Transaksi</th>
              <th style="width:120px;">Buku Kas/Bank</th>
              <th style="width:115px;text-align:right;">Dana Masuk (+)</th>
              <th style="width:115px;text-align:right;">Dana Keluar (-)</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRowsHtml || `<tr><td colspan="7" style="text-align:center;">Tidak ada mutasi pada periode ini.</td></tr>`}
          </tbody>
        </table>
      `;
    }

    const logoUrl = `${window.location.origin}/images/logos/cop-surat.png`;
    const cleanSubtitle = activeTemplateMeta.title
      .replace(/^\d+\.\s*/, "")
      .toUpperCase();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(activeTemplateMeta.title)} - ${escapeHtml(reportNumber)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, "Segoe UI", sans-serif;
            color: #172b45;
            margin: 0;
            padding: 0;
            font-size: 9.5pt;
            line-height: 1.4;
          }
          @media screen {
            html, body { background: #f1f5f9; }
            .report-document {
              width: 210mm;
              min-height: 297mm;
              margin: 12px auto;
              padding: 12mm;
              background: #ffffff;
              box-shadow: 0 4px 20px rgba(15, 23, 42, 0.12);
            }
          }
          .doc-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            padding-bottom: 12px;
            border-bottom: 2px solid #102a4d;
            margin-bottom: 12px;
          }
          .doc-logo {
            display: block;
            width: 47%;
            max-width: 325px;
            height: auto;
            object-fit: contain;
            object-position: left top;
          }
          .doc-heading {
            width: 53%;
            color: #102a4d;
            text-align: right;
          }
          .doc-heading h1 {
            margin: 0;
            font-size: 16pt;
            font-weight: 800;
            line-height: 1.15;
            text-align: right;
          }
          .doc-title-row {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 4px;
          }
          .doc-title-row p {
            margin: 0;
            color: #c9772d;
            font-size: 9.5pt;
            font-weight: 700;
          }
          .doc-title-rule {
            position: relative;
            flex: 0 0 34%;
            height: 12px;
          }
          .doc-title-rule::before,
          .doc-title-rule::after {
            position: absolute;
            right: 0;
            content: "";
            height: 4px;
          }
          .doc-title-rule::before {
            top: 0;
            left: 0;
            background: #c9772d;
          }
          .doc-title-rule::after {
            top: 6px;
            width: 62%;
            background: #102a4d;
          }
          .doc-number {
            display: block;
            width: fit-content;
            margin: 8px 0 0 auto;
            border: 2px solid transparent;
            background: linear-gradient(#fff, #fff) padding-box,
              linear-gradient(90deg, #c9772d 0 48%, #102a4d 48% 100%) border-box;
            padding: 5px 10px;
            font-size: 9pt;
            font-weight: 800;
            text-align: right;
          }
          .doc-meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 18px;
            margin: 0 0 12px;
            padding: 10px 12px;
            border: 1.5px solid #102a4d;
            border-radius: 8px;
            background: #f1f5f9;
            font-size: 9pt;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 16px;
          }
          .kpi-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 10px;
            background: #ffffff;
          }
          .kpi-label {
            font-size: 9.5px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 700;
          }
          .kpi-value {
            font-size: 13px;
            font-weight: 800;
            margin-top: 4px;
          }
          .section-title {
            font-size: 11.5px;
            font-weight: 800;
            margin: 12px 0 6px 0;
            color: #102a4d;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
          }
          th, td {
            border: 1px solid #7b8b9b;
            padding: 6px 8px;
            vertical-align: top;
          }
          th {
            background: #102a4d;
            font-weight: 700;
            text-align: left;
            color: #ffffff;
          }
          .signatures {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 26px;
            page-break-inside: avoid;
          }
          .sig-box {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            min-height: 155px;
          }
          .sig-role {
            font-size: 10px;
            color: #102a4d;
            font-weight: 700;
            line-height: 1.25;
          }
          .sig-role small {
            display: block;
            font-size: 8.5px;
            color: #64748b;
            font-weight: 400;
          }
          .sig-qr {
            width: 82px;
            height: 82px;
            object-fit: contain;
            margin: 6px auto;
            display: block;
          }
          .sig-space {
            height: 82px;
          }
          .sig-footer {
            width: 100%;
            margin-top: auto;
          }
          .sig-name {
            font-weight: 700;
            border-top: 1px solid #94a3b8;
            padding-top: 4px;
            font-size: 10.5px;
            color: #102a4d;
          }
          .sig-position {
            font-size: 9px;
            color: #475569;
            margin-top: 1px;
          }
          .doc-footer {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 20px;
            color: #c9772d;
            font-size: 9pt;
            font-weight: 900;
            letter-spacing: 1.5px;
          }
          .doc-footer::before {
            content: "";
            height: 4px;
            flex: 1;
            background: #c9772d;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report-document {
              margin: 0;
              padding: 0;
              box-shadow: none;
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <main class="report-document">
          <header class="doc-header">
            <img id="report-logo-img" class="doc-logo" src="${escapeHtml(logoUrl)}" alt="PT. Skala Prioritas Engineering" />
            <div class="doc-heading">
              <h1>LAPORAN KEUANGAN</h1>
              <div class="doc-title-row">
                <span class="doc-title-rule"></span>
                <p>${escapeHtml(cleanSubtitle)}</p>
              </div>
              <div class="doc-number"><strong>NO. LAPORAN: ${escapeHtml(reportNumber)}</strong></div>
            </div>
          </header>

          <section class="doc-meta">
            <div>
              <div><strong>Kode Perusahaan:</strong> SPE &middot; PT. Skala Prioritas Engineering</div>
              <div style="margin-top:3px;"><strong>Periode Laporan:</strong> ${escapeHtml(periodLabel)}</div>
              <div style="margin-top:3px;"><strong>Filter Buku Kas / Bank:</strong> ${escapeHtml(selectedAccountName === "ALL" ? "Semua Rekening & Kas" : selectedAccountName)}</div>
            </div>
            <div>
              <div><strong>Nomor Dokumen:</strong> ${escapeHtml(reportNumber)}</div>
              <div style="margin-top:3px;"><strong>Tanggal Cetak:</strong> ${escapeHtml(printedAt)}</div>
              <div style="margin-top:3px;"><strong>Catatan:</strong> ${escapeHtml(reportNote || "-")}</div>
            </div>
          </section>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Total Saldo Kas & Bank</div>
              <div class="kpi-value" style="color:#102a4d;">${escapeHtml(currency(totalBalance))}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Dana Masuk</div>
              <div class="kpi-value" style="color:#102a4d;">+${escapeHtml(currency(summary.totalIn))}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Dana Keluar</div>
              <div class="kpi-value" style="color:#c9772d;">-${escapeHtml(currency(summary.totalOut))}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Sisa Hutang / Tagihan</div>
              <div class="kpi-value" style="color:#102a4d;">${escapeHtml(currency(outstandingTotal))}</div>
            </div>
          </div>

          ${bodySectionHtml}

          <div class="signatures">
            <div class="sig-box">
              <div class="sig-role">Disusun Oleh,<small>Prepared By</small></div>
              ${
                financeQrDataUrl
                  ? `<img id="finance-qr-img" class="sig-qr" src="${escapeHtml(financeQrDataUrl)}" alt="QR Tanda Tangan Keuangan" />`
                  : `<div class="sig-space"></div>`
              }
              <div class="sig-footer">
                <div class="sig-name">${escapeHtml(preparedBy)}</div>
                <div class="sig-position">Keuangan / Finance</div>
              </div>
            </div>
            <div class="sig-box">
              <div class="sig-role">Diperiksa Oleh,<small>Checked By</small></div>
              <div class="sig-space"></div>
              <div class="sig-footer">
                <div class="sig-name">${escapeHtml(checkedBy)}</div>
                <div class="sig-position">Koordinator / Administrasi</div>
              </div>
            </div>
            <div class="sig-box">
              <div class="sig-role">Disetujui Oleh,<small>Approved By</small></div>
              <div class="sig-space"></div>
              <div class="sig-footer">
                <div class="sig-name">${escapeHtml(approvedBy)}</div>
                <div class="sig-position">Direktur Utama / Director</div>
              </div>
            </div>
          </div>

          <footer class="doc-footer">ADAPT, IMPROVISE AND FINISH</footer>
        </main>

        <script>
          (function() {
            var images = Array.prototype.slice.call(document.images || []);
            var printed = false;
            function triggerPrint() {
              if (printed) return;
              printed = true;
              setTimeout(function() { window.print(); }, 200);
            }
            var pending = images.filter(function(img) { return !img.complete; });
            if (pending.length > 0) {
              var loadedCount = 0;
              function onImgDone() {
                loadedCount++;
                if (loadedCount >= pending.length) triggerPrint();
              }
              pending.forEach(function(img) {
                img.addEventListener("load", onImgDone);
                img.addEventListener("error", onImgDone);
              });
              setTimeout(triggerPrint, 1200);
            } else {
              window.onload = triggerPrint;
              setTimeout(triggerPrint, 400);
            }
          })();
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={onClose}
      title="Template & Generator Laporan Keuangan"
      icon={<FileText aria-hidden="true" className="size-5" />}
      description="Pilih format template laporan resmi, saring periode atau rekening, lalu cetak ke A4/PDF atau unduh ke Excel/CSV."
      className="max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] sm:max-w-5xl"
      bodyClassName="overscroll-y-contain space-y-6"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadBlankTemplate}
            className="gap-2"
          >
            <FileSpreadsheet className="size-4 text-emerald-500" />
            Unduh Template Kosong (.CSV)
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Tutup
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDownloadCsvReport}
              className="gap-2"
            >
              <Download className="size-4" />
              Unduh Excel / CSV
            </Button>
            <Button
              type="button"
              onClick={handlePrintOfficialReport}
              className="gap-2"
            >
              <Printer className="size-4" />
              Cetak Laporan / PDF (A4)
            </Button>
          </div>
        </div>
      }
    >
      {/* Langkah 1: Pilih Jenis Template */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
            Langkah 1 · Pilih Jenis Template Laporan
          </Label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="default" className="font-mono text-xs">
              Kode Perusahaan: SPE
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              No. Dokumen: {reportNumber}
            </Badge>
          </div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {TEMPLATE_OPTIONS.map((item) => {
            const isSelected = templateType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTemplateType(item.id)}
                className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  <Badge
                    variant={isSelected ? "default" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {item.badge}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {item.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Langkah 2: Filter Periode, Rekening & Otorisasi */}
      <section className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-muted-foreground">
          <Filter className="size-3.5 text-primary" />
          Langkah 2 · Filter Periode, Buku Kas & Pengesahan
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-period-filter" className="text-xs">
              Periode Transaksi
            </Label>
            <select
              id="report-period-filter"
              value={periodFilter}
              onChange={(e) =>
                setPeriodFilter(e.target.value as PeriodFilterType)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground"
            >
              <option value="ALL">Semua Waktu ({transactions.length} mutasi)</option>
              <option value="THIS_MONTH">Bulan Ini</option>
              <option value="LAST_30_DAYS">30 Hari Terakhir</option>
              <option value="CUSTOM">Rentang Tanggal Kustom</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-account-filter" className="text-xs">
              Filter Buku Kas / Rekening
            </Label>
            <select
              id="report-account-filter"
              value={selectedAccountName}
              onChange={(e) => setSelectedAccountName(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground"
            >
              <option value="ALL">Semua Rekening ({accounts.length} akun)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.accountName}>
                  {acc.accountName} ({currency(acc.balance)})
                </option>
              ))}
            </select>
          </div>

          {periodFilter === "CUSTOM" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="report-date-start" className="text-xs">
                  Dari Tanggal
                </Label>
                <Input
                  id="report-date-start"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-date-end" className="text-xs">
                  Sampai Tanggal
                </Label>
                <Input
                  id="report-date-end"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="report-note-input" className="text-xs">
                Catatan / Keterangan Laporan
              </Label>
              <Input
                id="report-note-input"
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                placeholder="Contoh: Rekonsiliasi arus kas bulanan"
                className="h-9 text-xs"
              />
            </div>
          )}
        </div>

        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="report-prepared-by" className="text-[11px] text-muted-foreground">
              Disusun Oleh (Otomatis Role Keuangan)
            </Label>
            <Input
              id="report-prepared-by"
              value={preparedBy}
              readOnly
              className="h-8 bg-muted/40 font-semibold text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-checked-by" className="text-[11px] text-muted-foreground">
              Diperiksa Oleh (Koordinator/Admin)
            </Label>
            <Input
              id="report-checked-by"
              value={checkedBy}
              onChange={(e) => setCheckedBy(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-approved-by" className="text-[11px] text-muted-foreground">
              Disetujui Oleh (Direktur)
            </Label>
            <Input
              id="report-approved-by"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </section>

      {/* Langkah 3: Pratinjau Dokumen Laporan */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
            Langkah 3 · Pratinjau Template Laporan Resmi
          </Label>
          <span className="text-xs text-muted-foreground">
            Menampilkan <strong>{filteredTransactions.length}</strong> mutasi · Periode:{" "}
            <strong>{periodLabel}</strong>
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xs space-y-5">
          {/* Kop Surat Pratinjau Resmi dengan Logo */}
          <div className="flex flex-col justify-between gap-4 border-b-2 border-[#102a4d] dark:border-border pb-4 sm:flex-row sm:items-start">
            <div className="space-y-2">
              <div className="inline-block rounded-lg border border-slate-200 bg-white px-3.5 py-2 shadow-2xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/logos/cop-surat.png"
                  alt="PT. Skala Prioritas Engineering"
                  className="h-12 w-auto max-w-[290px] object-contain object-left sm:h-14"
                />
              </div>
              {reportNote && (
                <p className="text-xs text-muted-foreground italic">
                  &ldquo;{reportNote}&rdquo;
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1 text-xs sm:items-end sm:text-right">
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <Badge variant="outline" className="font-mono text-[10px] font-bold">
                  KODE PERUSAHAAN: SPE
                </Badge>
                <h3 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                  LAPORAN KEUANGAN
                </h3>
              </div>
              <p className="text-xs font-bold tracking-wide uppercase text-orange-600 dark:text-orange-400">
                {activeTemplateMeta.title.replace(/^\d+\.\s*/, "")}
              </p>
              <span className="mt-1 inline-flex w-fit items-center rounded border border-orange-500/50 bg-orange-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-foreground">
                NO. LAPORAN: {reportNumber}
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-muted-foreground sm:justify-end">
                <Calendar className="size-3.5" />
                Periode: <strong className="text-foreground">{periodLabel}</strong>
              </span>
              <span className="text-muted-foreground">
                Rekening:{" "}
                <strong className="text-foreground">
                  {selectedAccountName === "ALL"
                    ? "Semua Buku Kas/Bank"
                    : selectedAccountName}
                </strong>
              </span>
            </div>
          </div>

          {/* 4 Kotak Ringkasan Eksekutif */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/80 bg-muted/15 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Saldo Kas &amp; Bank</span>
                <Wallet className="size-3.5 text-primary" />
              </div>
              <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                {currency(totalBalance)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {accounts.length} buku kas/rekening aktif
              </p>
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/15 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Dana Masuk</span>
                <TrendingUp className="size-3.5 text-primary" />
              </div>
              <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                +{currency(summary.totalIn)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {summary.countIn} transaksi penerimaan
              </p>
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/15 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Dana Keluar</span>
                <TrendingDown className="size-3.5 text-primary" />
              </div>
              <p className="mt-1 text-base font-bold tabular-nums text-primary">
                -{currency(summary.totalOut)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {summary.countOut} transaksi pengeluaran
              </p>
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/15 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Arus Kas Bersih (Net)</span>
                <CheckCircle2 className="size-3.5 text-primary" />
              </div>
              <p className="mt-1 text-base font-bold tabular-nums text-foreground">
                {summary.netCashflow >= 0 ? "+" : ""}
                {currency(summary.netCashflow)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Sisa Hutang PO/Tiket: {currency(outstandingTotal)}
              </p>
            </div>
          </div>

          {/* Konten Tabel Berdasarkan Template */}
          {templateType === "ACCOUNT_BALANCE" && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                Tabel Posisi Saldo Buku Kas &amp; Rekening Bank
              </h4>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Rekening / Kas</th>
                      <th className="px-3 py-2.5">No. Rekening &amp; Atas Nama</th>
                      <th className="px-3 py-2.5 text-right">Dana Masuk</th>
                      <th className="px-3 py-2.5 text-right">Dana Keluar</th>
                      <th className="px-3 py-2.5 text-right">Saldo Saat Ini</th>
                      <th className="px-3 py-2.5 text-right">Porsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {accountSummaryRows.map((acc) => (
                      <tr key={acc.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-semibold text-foreground">
                          {acc.accountName}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {acc.accountNumber ?? "Kas Tunai"} · {acc.holderName}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                          +{currency(acc.accIn)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-rose-600 dark:text-rose-400">
                          -{currency(acc.accOut)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground">
                          {currency(acc.balance)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {acc.sharePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {templateType === "EXPENSE_BREAKDOWN" && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                Rekapitulasi Pengeluaran per Kategori Operasional
              </h4>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Kategori Pengeluaran</th>
                      <th className="px-3 py-2.5 text-center">Jumlah Mutasi</th>
                      <th className="px-3 py-2.5 text-right">Total Pengeluaran</th>
                      <th className="px-3 py-2.5 text-right">Porsi Biaya</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {expenseCategoryRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          Belum ada transaksi pengeluaran pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      expenseCategoryRows.map((row) => (
                        <tr key={row.category} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 font-semibold text-foreground">
                            {row.category}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                            {row.count} transaksi
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">
                            {currency(row.total)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.percentage}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {templateType === "OUTSTANDING_PAYABLE" && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                Daftar Tagihan PO &amp; Pengajuan Belum Lunas ({payables.length} item)
              </h4>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Referensi</th>
                      <th className="px-3 py-2.5">Keperluan / Judul</th>
                      <th className="px-3 py-2.5">Vendor / Pemohon</th>
                      <th className="px-3 py-2.5 text-right">Total Tagihan</th>
                      <th className="px-3 py-2.5 text-right">Terbayar</th>
                      <th className="px-3 py-2.5 text-right">Sisa Hutang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {payables.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          Seluruh tagihan PO dan pengajuan tiket sudah lunas.
                        </td>
                      </tr>
                    ) : (
                      payables.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5">
                            <span className="font-mono font-semibold text-foreground">
                              {row.reference}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {row.sourceLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-foreground">
                            {row.title}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {row.vendorOrRequester}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {currency(row.grandTotal)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {currency(row.paidAmount)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-rose-600 dark:text-rose-400">
                            {currency(row.remainingAmount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(templateType === "CASHFLOW_FULL" ||
            templateType === "EXPENSE_BREAKDOWN") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                  Rincian Mutasi Transaksi (Pratinjau 15 Baris Terbaru)
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  Seluruh {filteredTransactions.length} baris akan disertakan saat Cetak / Unduh CSV
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Kategori</th>
                      <th className="px-3 py-2.5">Deskripsi &amp; Proyek</th>
                      <th className="px-3 py-2.5">Buku Kas/Bank</th>
                      <th className="px-3 py-2.5 text-right">Dana Masuk (+)</th>
                      <th className="px-3 py-2.5 text-right">Dana Keluar (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          Tidak ada transaksi yang sesuai dengan filter periode/rekening.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.slice(0, 15).map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {tx.date}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px]">
                              {tx.category}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">
                              {tx.description}
                            </p>
                            {tx.projectName && (
                              <span className="text-[11px] text-muted-foreground">
                                Proyek: {tx.projectName}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {tx.accountName}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {tx.direction === "IN"
                              ? `+${currency(tx.amount)}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                            {tx.direction === "OUT"
                              ? `-${currency(tx.amount)}`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pratinjau Blok Tanda Tangan */}
          <div className="grid gap-3 border-t border-border pt-4 text-center text-xs sm:grid-cols-3">
            <div className="flex flex-col items-center justify-between rounded-lg border border-border/80 bg-muted/10 p-3">
              <div>
                <p className="font-semibold text-foreground">Disusun Oleh,</p>
                <p className="text-[10px] text-muted-foreground">Prepared By</p>
              </div>
              {financeQrDataUrl ? (
                <div className="my-2.5 rounded-md border border-slate-200 bg-white p-1.5 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={financeQrDataUrl}
                    alt={`QR Tanda Tangan ${preparedBy}`}
                    className="size-20 object-contain"
                  />
                </div>
              ) : (
                <div className="my-6 h-12" />
              )}
              <div className="w-full border-t border-border/80 pt-1.5">
                <p className="font-bold text-foreground">{preparedBy}</p>
                <p className="text-[10px] text-muted-foreground">
                  Keuangan / Finance
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center justify-between rounded-lg border border-border/80 bg-muted/10 p-3">
              <div>
                <p className="font-semibold text-foreground">Diperiksa Oleh,</p>
                <p className="text-[10px] text-muted-foreground">Checked By</p>
              </div>
              <div className="my-6 h-12" />
              <div className="w-full border-t border-border/80 pt-1.5">
                <p className="font-bold text-foreground">{checkedBy}</p>
                <p className="text-[10px] text-muted-foreground">
                  Koordinator / Administrasi
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center justify-between rounded-lg border border-border/80 bg-muted/10 p-3">
              <div>
                <p className="font-semibold text-foreground">Disetujui Oleh,</p>
                <p className="text-[10px] text-muted-foreground">Approved By</p>
              </div>
              <div className="my-6 h-12" />
              <div className="w-full border-t border-border/80 pt-1.5">
                <p className="font-bold text-foreground">{approvedBy}</p>
                <p className="text-[10px] text-muted-foreground">
                  Direktur Utama / Director
                </p>
              </div>
            </div>
          </div>

          {/* Footer Slogan Resmi Kop Surat */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-1 flex-1 rounded-full bg-orange-600/80" />
            <span className="text-[11px] font-black tracking-widest text-orange-600 dark:text-orange-400">
              ADAPT, IMPROVISE AND FINISH
            </span>
          </div>
        </div>
      </section>
    </GlobalModal>
  );
}
