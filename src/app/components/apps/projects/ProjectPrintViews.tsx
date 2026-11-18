"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildProjectSCurveSeries,
  calculateWeightedProjectProgress,
  clampProjectProgress,
  toJakartaDateKey,
} from "@/lib/project-progress";

function currency(val: number | string | null | undefined): string {
  const num = typeof val === "string" ? parseFloat(val) : Number(val || 0);
  if (isNaN(num)) return "Rp 0";
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Belum ditentukan";
  try {
    const key = toJakartaDateKey(dateStr);
    const d = key ? new Date(`${key}T00:00:00+07:00`) : new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return dateStr;
  }
}

function formatMsIndo(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function resolveClientName(project: {
  clientName?: string | null;
  kelompokTani?: string | null;
}): string {
  const client = project.clientName?.trim();
  if (client) return client;
  const partner = project.kelompokTani?.trim();
  if (partner) return partner;
  return "—";
}

function filenameFromDisposition(
  headerValue: string | null,
  fallback: string,
): string {
  if (!headerValue) return fallback;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }
  const plainMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallback;
}

async function triggerProjectReportDownload(
  projectId: string,
  type: "daily" | "progress" | "financial",
  format: "pdf" | "xlsx",
  fallbackFilename: string,
) {
  const url = `/api/projects/${encodeURIComponent(projectId)}/reports?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    let errMsg = "Gagal mengunduh laporan otomatis.";
    try {
      const payload = (await res.json()) as { message?: string };
      if (payload?.message) errMsg = payload.message;
    } catch {
      // Ignore non-JSON error body
    }
    throw new Error(errMsg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filenameFromDisposition(
      res.headers.get("content-disposition"),
      fallbackFilename,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface PrintViewItem {
  id: string;
  code: string;
  title: string;
  section: string;
  volumeText: string;
  unitPrice: number;
  totalPrice: number;
  bobot: number;
  terpasangText: string;
  progress: number;
}

export interface PrintViewGroup {
  sectionName: string;
  items: PrintViewItem[];
}

export interface ProjectPrintReportEntry {
  reportDate: string;
  progress?: number | null;
  workSummary?: string | null;
}

export interface ProjectPrintWorkPointEntry {
  id: string;
  plannedStartDate?: string | null;
  targetDate?: string | null;
  progress: number;
  proposedTotalWage: string | number;
  approvedTotalWage?: string | number | null;
  progressReports?: Array<{
    reportDate: string;
    progress: number;
  }>;
}

interface ProjectPrintProps {
  project: {
    id: string;
    title: string;
    code: string;
    clientName?: string | null;
    kelompokTani?: string | null;
    jenisPekerjaan?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    progress: number;
    reports?: ProjectPrintReportEntry[];
    workPoints?: ProjectPrintWorkPointEntry[];
  };
  rabGroups: PrintViewGroup[];
  totalRabNumber: number;
  plannedToday?: number;
  deviation?: number;
  onBack: () => void;
}

// =========================================================================
// 1. CETAK RAB
// =========================================================================
export function ProjectPrintRabView({
  project,
  rabGroups,
  totalRabNumber,
  onBack,
}: ProjectPrintProps) {
  const [mountNowMs] = useState(() => Date.now());
  const [downloadingFormat, setDownloadingFormat] = useState<"xlsx" | "pdf" | null>(
    null,
  );
  const currentDateFormatted = formatMsIndo(mountNowMs);
  const clientLabel = resolveClientName(project);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadReport = async (format: "xlsx" | "pdf") => {
    setDownloadingFormat(format);
    try {
      await triggerProjectReportDownload(
        project.id,
        "financial",
        format,
        `RAB-Keuangan-${project.code || "proyek"}.${format}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Gagal mengekspor file ${format.toUpperCase()}.`,
      );
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 pb-16 print:bg-white print:p-0 print:pb-0">
      {/* Top action toolbar (hidden on print) */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke proyek</span>
          </Button>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Pratinjau A4. Hanya volume, harga dan jumlah yang dicetak; RAP, bobot dan progres tidak ikut.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingFormat !== null}
            onClick={() => void handleDownloadReport("xlsx")}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            {downloadingFormat === "xlsx" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5 text-muted-foreground" />
            )}
            <span>Ekspor Excel (.xlsx)</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingFormat !== null}
            onClick={() => void handleDownloadReport("pdf")}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            {downloadingFormat === "pdf" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5 text-muted-foreground" />
            )}
            <span>Unduh PDF</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90"
          >
            <Printer className="size-3.5" />
            <span>Cetak Halaman</span>
          </Button>
        </div>
      </header>

      {/* A4 Sheet Container */}
      <main className="max-w-[850px] mx-auto mt-6 bg-white text-slate-900 shadow-xl rounded-sm p-10 print:shadow-none print:m-0 print:p-0 print:max-w-none print:w-full print:rounded-none">
        {/* Header Strip */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-950">Skala-prioritas</h1>
            <p className="text-xs text-slate-600 font-mono">
              {project.jenisPekerjaan || "Manajemen Proyek Konstruksi"}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xl font-extrabold tracking-wider text-slate-950">RAB</span>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="mt-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-950">Rencana Anggaran Biaya</h2>
          <div className="grid grid-cols-2 gap-x-6 text-xs text-slate-700 max-w-lg">
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Proyek</span>
              <span className="font-semibold text-slate-900">: {project.title}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Kode</span>
              <span className="font-mono font-semibold text-slate-900">: {project.code}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Klien / Mitra</span>
              <span className="font-semibold text-slate-900">: {clientLabel}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] py-0.5">
              <span className="text-slate-500">Tanggal cetak</span>
              <span className="text-slate-900">: {currentDateFormatted}</span>
            </div>
          </div>
        </div>

        {/* RAB Table */}
        <div className="mt-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-900 font-bold text-slate-900">
                <th className="py-2 px-2 w-10">No</th>
                <th className="py-2 px-2">Uraian pekerjaan</th>
                <th className="py-2 px-2 text-right w-16">Volume</th>
                <th className="py-2 px-2 text-left w-16">Satuan</th>
                <th className="py-2 px-2 text-right w-28">Harga satuan</th>
                <th className="py-2 px-2 text-right w-32">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {rabGroups.map((group, gIdx) => {
                const subtotal = group.items.reduce((sum, it) => sum + it.totalPrice, 0);
                return (
                  <React.Fragment key={gIdx}>
                    {/* Section Header */}
                    <tr className="bg-slate-50 font-bold text-slate-950">
                      <td colSpan={6} className="py-2 px-2 font-bold text-slate-950">
                        {group.sectionName}
                      </td>
                    </tr>

                    {/* Section Items */}
                    {group.items.map((it) => {
                      const parts = it.volumeText.trim().split(" ");
                      const vol = parts[0] || "1";
                      const unit = parts.slice(1).join(" ") || "paket";
                      return (
                        <tr key={it.id} className="border-b border-slate-200">
                          <td className="py-2 px-2 text-slate-500 font-mono">{it.code}</td>
                          <td className="py-2 px-2 text-slate-800 font-medium">{it.title}</td>
                          <td className="py-2 px-2 text-right font-mono">{vol}</td>
                          <td className="py-2 px-2 text-slate-600">{unit}</td>
                          <td className="py-2 px-2 text-right font-mono">{currency(it.unitPrice)}</td>
                          <td className="py-2 px-2 text-right font-mono font-medium">{currency(it.totalPrice)}</td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Section */}
                    <tr className="border-b border-slate-300 font-semibold bg-slate-50/50">
                      <td colSpan={5} className="py-2 px-2 text-right text-slate-700">
                        Subtotal {group.sectionName}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                        {currency(subtotal)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* Total RAB Row */}
              <tr className="border-t-2 border-b-2 border-slate-900 font-bold">
                <td colSpan={5} className="py-2.5 px-2 text-slate-950 font-bold">
                  Total RAB
                </td>
                <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-950">
                  {currency(totalRabNumber)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rekapitulasi Section */}
        <div className="mt-8 space-y-2">
          <h3 className="text-xs font-bold text-slate-950">Rekapitulasi</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-900 font-bold text-slate-900">
                <th className="py-1.5 px-2 w-10">No</th>
                <th className="py-1.5 px-2">Uraian pekerjaan</th>
                <th className="py-1.5 px-2 text-right w-32">Jumlah</th>
                <th className="py-1.5 px-2 text-right w-20">Porsi</th>
              </tr>
            </thead>
            <tbody>
              {rabGroups.map((group, idx) => {
                const subtotal = group.items.reduce((sum, it) => sum + it.totalPrice, 0);
                const porsi = totalRabNumber > 0 ? ((subtotal / totalRabNumber) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-1.5 px-2 text-slate-600">{group.sectionName.split(" ")[0]}</td>
                    <td className="py-1.5 px-2 text-slate-800">{group.sectionName}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{currency(subtotal)}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{porsi}%</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-b border-slate-900 font-bold">
                <td colSpan={2} className="py-2 px-2 text-slate-950 font-bold">
                  Total RAB
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                  {currency(totalRabNumber)}
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                  {totalRabNumber > 0 ? "100%" : "0%"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signature Section */}
        <div className="mt-14 pt-4 grid grid-cols-2 gap-12 text-center text-xs">
          <div>
            <p className="text-slate-600">Dibuat oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              Skala-prioritas
            </div>
          </div>
          <div>
            <p className="text-slate-600">Disetujui oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              {clientLabel}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 2. CETAK LAPORAN PROGRES (Dynamic DB S-Curve + Opname Dates)
// =========================================================================
export function ProjectPrintProgressView({
  project,
  rabGroups,
  plannedToday,
  deviation,
  onBack,
}: ProjectPrintProps) {
  const [mountNowMs] = useState(() => Date.now());
  const [downloadingFormat, setDownloadingFormat] = useState<"xlsx" | "pdf" | null>(
    null,
  );
  const currentDateFormatted = formatMsIndo(mountNowMs);
  const clientLabel = resolveClientName(project);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadReport = async (format: "xlsx" | "pdf") => {
    setDownloadingFormat(format);
    try {
      await triggerProjectReportDownload(
        project.id,
        "progress",
        format,
        `Laporan-Progres-${project.code || "proyek"}.${format}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Gagal mengekspor laporan progres (${format.toUpperCase()}).`,
      );
    } finally {
      setDownloadingFormat(null);
    }
  };

  const {
    sCurve,
    effectivePlannedToday,
    effectiveDeviation,
    lastOpnameLabel,
    estimatedCompletionLabel,
    startDateStr,
    midDateStr,
    endDateStr,
    plannedPath,
    actualPath,
    actualSvgPoints,
  } = useMemo(() => {
    const workPoints = project.workPoints ?? [];
    const reports = project.reports ?? [];

    const plannedStartDates = workPoints
      .map((point) => point.plannedStartDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    const targetDates = workPoints
      .map((point) => point.targetDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    const allReportDates = [
      ...reports.map((report) => toJakartaDateKey(report.reportDate)),
      ...workPoints.flatMap((point) =>
        (point.progressReports ?? []).map((pr) => toJakartaDateKey(pr.reportDate)),
      ),
    ]
      .filter((key): key is string => Boolean(key))
      .sort();

    const latestOpnameKey = allReportDates.at(-1) ?? null;

    const effectiveStartDate =
      project.startDate ??
      plannedStartDates[0] ??
      allReportDates[0] ??
      null;
    const effectiveEndDate =
      project.endDate ?? targetDates.at(-1) ?? null;

    const progressByDate = new Map<string, Map<string, number>>();
    for (const point of workPoints) {
      for (const report of point.progressReports ?? []) {
        const dateKey = toJakartaDateKey(report.reportDate);
        if (!dateKey) continue;
        const progressAtDate = progressByDate.get(dateKey) ?? new Map();
        progressAtDate.set(point.id, report.progress);
        progressByDate.set(dateKey, progressAtDate);
      }
    }
    const latestPointProgress = new Map<string, number>();
    for (const point of workPoints) latestPointProgress.set(point.id, 0);

    const weightedFromPoints = [...progressByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, progressAtDate]) => {
        for (const [pointId, progress] of progressAtDate) {
          latestPointProgress.set(pointId, progress);
        }
        return {
          reportDate: date,
          progress: calculateWeightedProjectProgress(
            workPoints.map((pt) => ({
              progress: latestPointProgress.get(pt.id) ?? 0,
              proposedTotalWage: pt.proposedTotalWage,
              approvedTotalWage: pt.approvedTotalWage,
            })),
          ),
        };
      });

    const directReports = reports
      .filter(
        (report): report is ProjectPrintReportEntry & { progress: number } =>
          report.progress !== null && report.progress !== undefined,
      )
      .map((report) => ({
        reportDate: report.reportDate,
        progress: Number(report.progress),
      }));

    const series = buildProjectSCurveSeries({
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      currentProgress: project.progress,
      dailyReports: [...weightedFromPoints, ...directReports],
      nowMs: mountNowMs,
    });

    const computedPlanned = series.plannedToday ?? 0;
    const planTodayVal =
      typeof plannedToday === "number" && Number.isFinite(plannedToday)
        ? plannedToday
        : computedPlanned;
    const devVal =
      typeof deviation === "number" && Number.isFinite(deviation)
        ? deviation
        : Number((project.progress - planTodayVal).toFixed(1));

    const firstPlannedMs = series.planned[0]?.x ?? mountNowMs;
    const lastPlannedMs =
      series.planned.at(-1)?.x ?? firstPlannedMs + 30 * 86400000;
    const lastActualMs = series.actual.at(-1)?.x ?? firstPlannedMs;

    const xMin = Math.min(firstPlannedMs, series.actual[0]?.x ?? firstPlannedMs);
    const xMax = Math.max(lastPlannedMs, lastActualMs, xMin + 86400000);
    const midMs = Math.round((xMin + xMax) / 2);

    const mapX = (x: number) =>
      Math.round((50 + ((x - xMin) / (xMax - xMin)) * 620) * 10) / 10;
    const mapY = (y: number) =>
      Math.round((180 - (clampProjectProgress(y) / 100) * 160) * 10) / 10;

    const plannedD =
      series.planned.length > 0
        ? series.planned
            .map(
              (pt, idx) =>
                `${idx === 0 ? "M" : "L"} ${mapX(pt.x)} ${mapY(pt.y)}`,
            )
            .join(" ")
        : "";

    const mappedActualPoints = series.actual.map((pt) => ({
      cx: mapX(pt.x),
      cy: mapY(pt.y),
      progress: pt.y,
    }));
    const actualD =
      mappedActualPoints.length > 0
        ? mappedActualPoints
            .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.cx} ${pt.cy}`)
            .join(" ")
        : "";

    let etaLabel = "Menunggu progres awal";
    if (project.progress >= 100) {
      etaLabel = latestOpnameKey
        ? `Selesai (${formatDateIndo(latestOpnameKey)})`
        : "Selesai (100%)";
    } else if (project.progress > 0 && allReportDates.length > 0) {
      const refMs = Math.max(mountNowMs, lastActualMs);
      const elapsedDays = Math.max(1, (refMs - firstPlannedMs) / 86400000);
      const dailyRate = project.progress / elapsedDays;
      if (dailyRate > 0.01) {
        const remainingDays = Math.min(
          3650,
          Math.ceil((100 - project.progress) / dailyRate),
        );
        const projectedEndMs = refMs + remainingDays * 86400000;
        etaLabel = `${formatMsIndo(projectedEndMs)}${effectiveEndDate ? ` (Target: ${formatDateIndo(effectiveEndDate)})` : ""}`;
      } else if (effectiveEndDate) {
        etaLabel = `Target: ${formatDateIndo(effectiveEndDate)}`;
      }
    } else if (effectiveEndDate) {
      etaLabel = `Target: ${formatDateIndo(effectiveEndDate)}`;
    }

    return {
      sCurve: series,
      effectivePlannedToday: planTodayVal,
      effectiveDeviation: devVal,
      lastOpnameLabel: latestOpnameKey
        ? formatDateIndo(latestOpnameKey)
        : "Belum tercatat",
      estimatedCompletionLabel: etaLabel,
      startDateStr: formatMsIndo(xMin),
      midDateStr: formatMsIndo(midMs),
      endDateStr: formatMsIndo(xMax),
      plannedPath: plannedD,
      actualPath: actualD,
      actualSvgPoints: mappedActualPoints,
    };
  }, [project, plannedToday, deviation, mountNowMs]);

  const totalBobot = rabGroups
    .flatMap((g) => g.items)
    .reduce((sum, it) => sum + it.bobot, 0);
  const totalAchievedBobot = rabGroups
    .flatMap((g) => g.items)
    .reduce((sum, it) => sum + (it.bobot * it.progress) / 100, 0);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 pb-16 print:bg-white print:p-0 print:pb-0">
      {/* Top action toolbar (hidden on print) */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke proyek</span>
          </Button>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Pratinjau A4 Laporan Progres Pekerjaan &amp; Kurva S (Live Database).
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingFormat !== null}
            onClick={() => void handleDownloadReport("xlsx")}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            {downloadingFormat === "xlsx" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5 text-muted-foreground" />
            )}
            <span>Ekspor Excel (.xlsx)</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingFormat !== null}
            onClick={() => void handleDownloadReport("pdf")}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            {downloadingFormat === "pdf" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5 text-muted-foreground" />
            )}
            <span>Unduh PDF</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90"
          >
            <Printer className="size-3.5" />
            <span>Cetak Halaman</span>
          </Button>
        </div>
      </header>

      {/* A4 Sheet Container */}
      <main className="max-w-[850px] mx-auto mt-6 bg-white text-slate-900 shadow-xl rounded-sm p-10 print:shadow-none print:m-0 print:p-0 print:max-w-none print:w-full print:rounded-none">
        {/* Header Strip */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-950">Skala-prioritas</h1>
            <p className="text-xs text-slate-600 font-mono">
              {project.jenisPekerjaan || "Manajemen Proyek Konstruksi"}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xl font-extrabold tracking-wider text-slate-950">PROGRES</span>
          </div>
        </div>

        {/* Metadata Details */}
        <div className="mt-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-950">Laporan progres pekerjaan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-xs text-slate-700">
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Proyek</span>
              <span className="font-semibold text-slate-900">: {project.title}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Kode</span>
              <span className="font-mono font-semibold text-slate-900">: {project.code}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Klien / Mitra</span>
              <span className="font-semibold text-slate-900">: {clientLabel}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Opname terakhir</span>
              <span className="text-slate-900">: {lastOpnameLabel}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Progres aktual</span>
              <span className="font-bold text-slate-950">: {project.progress.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Rencana hari ini</span>
              <span className="font-bold text-slate-950">: {effectivePlannedToday.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Deviasi</span>
              <span
                className={
                  effectiveDeviation < 0
                    ? "font-bold text-rose-600"
                    : "font-bold text-emerald-700"
                }
              >
                : {effectiveDeviation > 0 ? `+${effectiveDeviation.toFixed(1)}%` : `${effectiveDeviation.toFixed(1)}%`}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Perkiraan selesai</span>
              <span className="text-slate-900">: {estimatedCompletionLabel}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] py-0.5">
              <span className="text-slate-500">Tanggal cetak</span>
              <span className="text-slate-900">: {currentDateFormatted}</span>
            </div>
          </div>
        </div>

        {/* Progress Table */}
        <div className="mt-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-900 font-bold text-slate-900">
                <th className="py-2 px-2 w-10">No</th>
                <th className="py-2 px-2">Uraian pekerjaan</th>
                <th className="py-2 px-2 text-right w-20">Volume</th>
                <th className="py-2 px-2 text-right w-16">Bobot</th>
                <th className="py-2 px-2 text-right w-24">Terpasang</th>
                <th className="py-2 px-2 text-right w-16">Progres</th>
                <th className="py-2 px-2 text-right w-24">Bobot tercapai</th>
              </tr>
            </thead>
            <tbody>
              {rabGroups.map((group, gIdx) => {
                const subBobot = group.items.reduce((s, it) => s + it.bobot, 0);
                const subAchieved = group.items.reduce((s, it) => s + (it.bobot * it.progress) / 100, 0);

                return (
                  <React.Fragment key={gIdx}>
                    {/* Section Header */}
                    <tr className="bg-slate-50 font-bold text-slate-950">
                      <td colSpan={7} className="py-2 px-2 font-bold text-slate-950">
                        {group.sectionName}
                      </td>
                    </tr>

                    {/* Section Items */}
                    {group.items.map((it) => {
                      const achieved = ((it.bobot * it.progress) / 100).toFixed(2);
                      return (
                        <tr key={it.id} className="border-b border-slate-200">
                          <td className="py-2 px-2 text-slate-500 font-mono">{it.code}</td>
                          <td className="py-2 px-2 text-slate-800 font-medium">{it.title}</td>
                          <td className="py-2 px-2 text-right text-slate-700">{it.volumeText}</td>
                          <td className="py-2 px-2 text-right font-mono">{it.bobot.toFixed(2)}%</td>
                          <td className="py-2 px-2 text-right text-slate-700">{it.terpasangText}</td>
                          <td className="py-2 px-2 text-right font-mono font-medium">{it.progress}%</td>
                          <td className="py-2 px-2 text-right font-mono">{achieved}%</td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Section */}
                    <tr className="border-b border-slate-300 font-semibold bg-slate-50/50">
                      <td colSpan={3} className="py-2 px-2 text-right text-slate-700">
                        Subtotal {group.sectionName}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                        {subBobot.toFixed(2)}%
                      </td>
                      <td colSpan={2} />
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">
                        {subAchieved.toFixed(2)}%
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {/* Total Row */}
              <tr className="border-t-2 border-b-2 border-slate-900 font-bold">
                <td colSpan={3} className="py-2.5 px-2 text-slate-950 font-bold">
                  Total
                </td>
                <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-950">
                  {totalBobot > 0 ? `${totalBobot.toFixed(1)}%` : "0%"}
                </td>
                <td colSpan={2} />
                <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-950">
                  {totalBobot > 0
                    ? `${totalAchievedBobot.toFixed(2)}%`
                    : `${project.progress.toFixed(1)}%`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Kurva S Graphical Canvas (Dynamic from buildProjectSCurveSeries) */}
        <div className="mt-8 pt-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-950">Kurva S</h3>
              <p className="text-[11px] text-slate-500">
                Garis penuh: progres aktual ({project.progress.toFixed(1)}%) · garis putus-putus: rencana ({effectivePlannedToday.toFixed(1)}%)
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {sCurve.actual.length} titik histori
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 bg-white">
            <svg viewBox="0 0 700 200" className="w-full h-48 overflow-visible">
              {/* Horizontal Gridlines */}
              {[
                { y: 20, label: "100%" },
                { y: 60, label: "75%" },
                { y: 100, label: "50%" },
                { y: 140, label: "25%" },
                { y: 180, label: "0%" },
              ].map((g, i) => (
                <g key={i}>
                  <line x1="45" y1={g.y} x2="680" y2={g.y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x="40" y={g.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                    {g.label}
                  </text>
                </g>
              ))}

              {/* X Axis dates */}
              <text x="50" y="196" fontSize="10" fill="#64748b">
                {startDateStr}
              </text>
              <text x="360" y="196" textAnchor="middle" fontSize="10" fill="#64748b">
                {midDateStr}
              </text>
              <text x="670" y="196" textAnchor="end" fontSize="10" fill="#64748b">
                {endDateStr}
              </text>

              {/* Planned S-Curve (Dashed gray line) */}
              {plannedPath && (
                <path
                  d={plannedPath}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
              )}

              {/* Actual Curve (Solid thick black line) */}
              {actualPath && (
                <path
                  d={actualPath}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                />
              )}
              {actualSvgPoints.map((pt, idx) => (
                <circle
                  key={`${pt.cx}-${pt.cy}-${idx}`}
                  cx={pt.cx}
                  cy={pt.cy}
                  r="3"
                  fill="#0f172a"
                />
              ))}
            </svg>
          </div>
        </div>

        {/* 3-Column Signatures */}
        <div className="mt-12 pt-4 grid grid-cols-3 gap-8 text-center text-xs">
          <div>
            <p className="text-slate-600">Dibuat oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              Skala-prioritas
            </div>
          </div>
          <div>
            <p className="text-slate-600">Diperiksa oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 text-slate-600 font-mono">
              (....................................)
            </div>
          </div>
          <div>
            <p className="text-slate-600">Disetujui oleh</p>
            <div className="h-20" />
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-950">
              {clientLabel}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 3. CETAK JADWAL PROYEK (Matching Image media_1794381659449_48c313f1.png)
// =========================================================================
export interface ProjectPrintScheduleTask {
  id: string;
  title: string;
  location: string; // Fase, e.g. "A. Persiapan"
  plannedStartDate: string | null;
  targetDate: string | null;
  progress: number;
  dependencies?: string | null;
}

export interface ProjectPrintScheduleProps {
  project: {
    id: string;
    title: string;
    code?: string;
    startDate?: string | null;
    endDate?: string | null;
    progress: number;
  };
  tasks: ProjectPrintScheduleTask[];
  totalWeeks?: number;
  onBack: () => void;
}

export function ProjectPrintScheduleView({
  project,
  tasks,
  totalWeeks = 8,
  onBack,
}: ProjectPrintScheduleProps) {
  const [mountNowMs] = useState(() => Date.now());
  const currentDateFormatted = formatMsIndo(mountNowMs);

  const weeksCount = Math.max(4, Math.min(24, totalWeeks));
  const weekNumbers = Array.from({ length: weeksCount }, (_, i) => i + 1);

  // Group tasks by phase/location
  const phaseOrder: string[] = [];
  const tasksByPhase = new Map<string, ProjectPrintScheduleTask[]>();

  for (const t of tasks) {
    const phase = t.location?.trim() || "A. Pekerjaan Utama";
    if (!tasksByPhase.has(phase)) {
      phaseOrder.push(phase);
      tasksByPhase.set(phase, []);
    }
    tasksByPhase.get(phase)!.push(t);
  }

  // Calculate task status label
  const getTaskStatus = (prog: number) => {
    if (prog >= 100) return "Selesai";
    if (prog > 0) return "Berjalan";
    return "Belum mulai";
  };

  // Helper to estimate week span for gantt bar
  const getTaskWeekSpan = (task: ProjectPrintScheduleTask, index: number) => {
    // If dates are provided, compute relative to project startDate
    if (task.plannedStartDate && project.startDate) {
      try {
        const pStart = new Date(project.startDate).getTime();
        const tStart = new Date(task.plannedStartDate).getTime();
        const tEnd = task.targetDate ? new Date(task.targetDate).getTime() : tStart + 7 * 86400000;
        const startW = Math.max(1, Math.min(weeksCount, Math.floor((tStart - pStart) / (7 * 86400000)) + 1));
        const endW = Math.max(startW, Math.min(weeksCount, Math.ceil((tEnd - pStart) / (7 * 86400000))));
        return { startWeek: startW, endWeek: endW };
      } catch {
        // fallback
      }
    }
    // Fallback: stagger tasks evenly
    const spanStart = Math.min(weeksCount, Math.max(1, (index % weeksCount) + 1));
    const spanEnd = Math.min(weeksCount, spanStart + (index === 0 ? 0 : index === 1 ? 2 : 2));
    return { startWeek: spanStart, endWeek: spanEnd };
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 print:bg-white print:p-0">
      {/* Top action bar (hidden on print) */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-xs print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Jadwal proyek
          </Button>

          <Button
            type="button"
            variant="default"
            onClick={() => window.print()}
            className="gap-2 rounded-lg bg-slate-900 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
          >
            <Printer className="size-3.5" />
            Cetak / PDF
          </Button>
        </div>
      </header>

      {/* Main Print Container */}
      <main className="mx-auto max-w-6xl p-6 sm:p-10 print:p-0">
        {/* Title Header */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Skala-prioritas</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
            Jadwal proyek · {project.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-600">
            <span>
              Dicetak: <strong className="text-slate-800">{currentDateFormatted}</strong>
            </span>
            <span>
              Total task: <strong className="text-slate-800">{tasks.length}</strong>
            </span>
            <span>
              Rentang: <strong className="text-slate-800">{weeksCount} minggu</strong>
            </span>
            <span>
              Progres keseluruhan: <strong className="text-slate-800">{Math.round(project.progress)}%</strong>
            </span>
            <span>
              Mulai proyek: <strong className="text-slate-800">{formatDateIndo(project.startDate)}</strong>
            </span>
          </div>
        </div>

        <div className="my-5 border-b border-slate-200" />

        {/* 1. Table of Tasks */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <tr>
                <th className="px-3.5 py-2.5">Task</th>
                <th className="px-3.5 py-2.5">Fase</th>
                <th className="px-3.5 py-2.5">Mulai</th>
                <th className="px-3.5 py-2.5">Selesai</th>
                <th className="px-3.5 py-2.5 text-center">Progres</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Tergantung pada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-800">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/60">
                  <td className="px-3.5 py-2 font-medium text-slate-950">{task.title}</td>
                  <td className="px-3.5 py-2 text-slate-600">{task.location}</td>
                  <td className="px-3.5 py-2 whitespace-nowrap text-slate-600">
                    {formatDateIndo(task.plannedStartDate)}
                  </td>
                  <td className="px-3.5 py-2 whitespace-nowrap text-slate-600">
                    {formatDateIndo(task.targetDate)}
                  </td>
                  <td className="px-3.5 py-2 text-center font-medium">
                    {Math.round(task.progress)}%
                  </td>
                  <td className="px-3.5 py-2">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        task.progress >= 100
                          ? "bg-emerald-50 text-emerald-700"
                          : task.progress > 0
                            ? "bg-blue-50 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {getTaskStatus(task.progress)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 text-slate-400">
                    {task.dependencies || "—"}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    Belum ada task dalam jadwal proyek ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 2. Timeline (per minggu) Gantt View */}
        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Timeline (per minggu)</h2>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="w-72 border-r border-slate-200 px-3.5 py-2.5 font-semibold text-slate-700">
                    Task
                  </th>
                  {weekNumbers.map((w) => (
                    <th
                      key={w}
                      className="border-r border-slate-100 px-2 py-2.5 text-center font-semibold text-slate-600 last:border-r-0"
                    >
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {phaseOrder.map((phase) => {
                  const phaseTasks = tasksByPhase.get(phase) || [];
                  return (
                    <React.Fragment key={phase}>
                      {/* Phase Header row */}
                      <tr className="bg-slate-50/70">
                        <td
                          colSpan={weeksCount + 1}
                          className="px-3.5 py-1.5 text-[11px] font-bold text-slate-700"
                        >
                          {phase}
                        </td>
                      </tr>

                      {/* Tasks under this phase */}
                      {phaseTasks.map((task, tIndex) => {
                        const globalIndex = tasks.findIndex((t) => t.id === task.id);
                        const { startWeek, endWeek } = getTaskWeekSpan(task, globalIndex >= 0 ? globalIndex : tIndex);
                        const spanLength = Math.max(1, endWeek - startWeek + 1);

                        return (
                          <tr key={task.id} className="hover:bg-slate-50/40">
                            <td className="border-r border-slate-200 px-3.5 py-2 font-medium text-slate-900">
                              <span className="block truncate max-w-64" title={task.title}>
                                {task.title}
                              </span>
                            </td>

                            {weekNumbers.map((w) => {
                              // If current week is start of the span, render the bar with colSpan
                              if (w === startWeek) {
                                return (
                                  <td
                                    key={w}
                                    colSpan={spanLength}
                                    className="border-r border-slate-100 px-1 py-1.5 text-center align-middle"
                                  >
                                    <div className="relative h-6 w-full overflow-hidden rounded-md bg-slate-200">
                                      {/* Completed Progress Bar */}
                                      <div
                                        className="h-full rounded-md bg-slate-800 transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                                      />
                                      {/* Bar label if space allows */}
                                      {task.progress > 0 && (
                                        <span className="absolute inset-0 flex items-center justify-start pl-2 text-[10px] font-bold text-white">
                                          {Math.round(task.progress)}%
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              }
                              // Skip cells that are swallowed by colSpan
                              if (w > startWeek && w <= endWeek) {
                                return null;
                              }
                              // Empty week cell
                              return (
                                <td
                                  key={w}
                                  className="border-r border-slate-100 px-2 py-2 text-center text-slate-300 last:border-r-0"
                                >
                                  ·
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer print signature strip */}
        <div className="mt-12 hidden print:grid grid-cols-3 gap-8 text-center text-xs text-slate-600">
          <div>
            <p>Dibuat oleh</p>
            <div className="h-16" />
            <div className="border-t border-slate-800 pt-1 font-bold text-slate-900">Skala-prioritas</div>
          </div>
          <div>
            <p>Diperiksa oleh</p>
            <div className="h-16" />
            <div className="border-t border-slate-800 pt-1 font-mono text-slate-500">(....................)</div>
          </div>
          <div>
            <p>Disetujui oleh</p>
            <div className="h-16" />
            <div className="border-t border-slate-800 pt-1 font-bold text-slate-900">Manajer Proyek</div>
          </div>
        </div>
      </main>
    </div>
  );
}
