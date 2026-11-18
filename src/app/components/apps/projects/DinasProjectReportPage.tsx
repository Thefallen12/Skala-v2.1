"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Landmark,
  Layers,
  Loader2,
  Printer,
  Search,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DINAS_PROJECTS_DATA,
  DINAS_REPORT_METADATA,
} from "@/lib/dinas-report-data";
import {
  calculatePlannedSCurveProgress,
  toJakartaDateKey,
} from "@/lib/project-progress";
import {
  formatWorkTypeBadge,
  PROJECT_WORK_TYPE_GROUPS,
  resolveProjectWorkType,
  type WorkTypeBadgeTone,
} from "@/lib/project-work-types";
import { cn } from "@/lib/utils";

type ReportViewMode = "portfolio_live" | "dinas_preset";
type DinasTabType = "rekapitulasi" | "rincian_sid" | "database_spk";

export type DinasProjectProgressSource = {
  id?: string;
  code?: string;
  kelompokTani: string;
  name: string;
  title: string;
  progress: number;
  jenisPekerjaan?: string | null;
  status?: string | null;
  pagu?: string | number | null;
  realized?: string | number | null;
  startDate?: string | null;
  endDate?: string | null;
  fieldPicName?: string | null;
  location?: string | null;
  address?: string | null;
  clientName?: string | null;
  vendor?: string | null;
  reports?: Array<{
    id?: string;
    reportDate: string;
    progress?: number | null;
    workSummary?: string | null;
  }>;
  workPoints?: Array<{
    id?: string;
    title?: string;
    progress?: number;
  }>;
  progressSubmissions?: Array<{
    id: string;
    periodType: string;
    periodLabel: string;
    actualProgress: number;
    plannedProgress: number;
    deviation: number;
    submittedAt: string;
  }>;
};

const WORK_TYPE_TONE_CLASSES: Record<WorkTypeBadgeTone, string> = {
  indigo:
    "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  teal: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  slate: "border-border bg-muted/60 text-foreground",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  RUNNING: "Berjalan",
  PENDING_SETUP: "Persiapan",
  HOLD: "Tertahan",
  DONE: "Selesai",
};

function parseAmountSafe(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCompactRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function parseDownloadFilename(
  disposition: string | null,
  fallback: string,
): string {
  if (!disposition) return fallback;
  const utfMatch = /filename\*=UTF-8''([^;\s]+)/i.exec(disposition);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const quotedMatch = /filename="?([^";]+)"?/i.exec(disposition);
  return quotedMatch?.[1] || fallback;
}

function normalizeGroupName(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("id-ID");
}

function calculateRealizedArea(
  areaHa: number,
  progressPercent: number,
): number {
  return (areaHa * progressPercent) / 100;
}

export function DinasProjectReportPage({
  projects,
  canViewFinancials = true,
}: {
  projects: DinasProjectProgressSource[];
  canViewFinancials?: boolean;
}) {
  const hasLiveDbMetadata = useMemo(
    () => projects.some((project) => Boolean(project.id)),
    [projects],
  );
  const [reportMode, setReportMode] = useState<ReportViewMode>(() =>
    projects.some((project) => Boolean(project.id))
      ? "portfolio_live"
      : "dinas_preset",
  );
  const [referenceNowMs] = useState<number>(() => Date.now());
  const [portfolioSearch, setPortfolioSearch] = useState<string>("");
  const [portfolioWorkTypeFilter, setPortfolioWorkTypeFilter] =
    useState<string>("ALL");
  const [portfolioStatusFilter, setPortfolioStatusFilter] =
    useState<string>("ALL");
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DinasTabType>("rekapitulasi");
  const [selectedKecamatan, setSelectedKecamatan] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPoktanIndex, setSelectedPoktanIndex] = useState<number>(0);

  const portfolioRows = useMemo(() => {
    return projects.map((project, index) => {
      const workTypeDef = resolveProjectWorkType(project.jenisPekerjaan);
      const badge = formatWorkTypeBadge(project.jenisPekerjaan);
      const actualProgress = Math.min(
        100,
        Math.max(0, Number.isFinite(project.progress) ? project.progress : 0),
      );
      const plannedProgress = calculatePlannedSCurveProgress(
        project.startDate,
        project.endDate,
        referenceNowMs,
      );
      const deviation =
        plannedProgress !== null
          ? Math.round((actualProgress - plannedProgress) * 10) / 10
          : null;
      const paguValue = parseAmountSafe(project.pagu);
      const realizedValue = parseAmountSafe(project.realized);
      const reports = project.reports ?? [];
      const sortedReportDates = reports
        .map((report) => toJakartaDateKey(report.reportDate))
        .filter((dateKey): dateKey is string => Boolean(dateKey))
        .sort()
        .reverse();
      const latestReportDate = sortedReportDates[0] ?? null;
      const clientLabel =
        project.clientName?.trim() ||
        project.kelompokTani?.trim() ||
        project.vendor?.trim() ||
        "-";
      const locationLabel =
        project.location?.trim() || project.address?.trim() || "-";
      const statusKey = (project.status || "RUNNING").toUpperCase();

      return {
        key: project.id || `${project.code || project.name}-${index}`,
        id: project.id,
        code: project.code || `PRJ-${index + 1}`,
        title: project.title || project.name,
        name: project.name,
        rawJenisPekerjaan: project.jenisPekerjaan || "",
        workTypeId: workTypeDef.id,
        workTypeBadge: badge,
        statusKey,
        statusLabel: STATUS_LABEL_MAP[statusKey] || statusKey,
        actualProgress,
        plannedProgress,
        deviation,
        paguValue,
        realizedValue,
        reportsCount: reports.length,
        latestReportDate,
        workPointsCount: project.workPoints?.length ?? 0,
        submissionsCount: project.progressSubmissions?.length ?? 0,
        fieldPicName: project.fieldPicName?.trim() || "-",
        clientLabel,
        locationLabel,
      };
    });
  }, [projects, referenceNowMs]);

  const filteredPortfolioRows = useMemo(() => {
    const query = portfolioSearch.trim().toLowerCase();
    return portfolioRows.filter((row) => {
      const matchWorkType =
        portfolioWorkTypeFilter === "ALL" ||
        (portfolioWorkTypeFilter === "CONSULTANCY" &&
          row.workTypeBadge.group === "CONSULTANCY") ||
        (portfolioWorkTypeFilter === "PHYSICAL" &&
          row.workTypeBadge.group === "PHYSICAL") ||
        row.workTypeId === portfolioWorkTypeFilter ||
        row.rawJenisPekerjaan.toLowerCase() ===
          portfolioWorkTypeFilter.toLowerCase();
      const matchStatus =
        portfolioStatusFilter === "ALL" ||
        row.statusKey === portfolioStatusFilter;
      const matchSearch =
        !query ||
        row.code.toLowerCase().includes(query) ||
        row.title.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.workTypeBadge.label.toLowerCase().includes(query) ||
        row.clientLabel.toLowerCase().includes(query) ||
        row.fieldPicName.toLowerCase().includes(query) ||
        row.locationLabel.toLowerCase().includes(query);

      return matchWorkType && matchStatus && matchSearch;
    });
  }, [
    portfolioRows,
    portfolioSearch,
    portfolioWorkTypeFilter,
    portfolioStatusFilter,
  ]);

  const portfolioSummary = useMemo(() => {
    const count = filteredPortfolioRows.length;
    const totalProgress = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.actualProgress,
      0,
    );
    const plannedList = filteredPortfolioRows.filter(
      (row) => row.plannedProgress !== null,
    );
    const totalPlanned = plannedList.reduce(
      (sum, row) => sum + (row.plannedProgress ?? 0),
      0,
    );
    const consultancyCount = filteredPortfolioRows.filter(
      (row) => row.workTypeBadge.group === "CONSULTANCY",
    ).length;
    const physicalCount = count - consultancyCount;
    const totalPagu = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.paguValue,
      0,
    );
    const totalRealized = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.realizedValue,
      0,
    );
    const totalReports = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.reportsCount,
      0,
    );
    const behindScheduleCount = filteredPortfolioRows.filter(
      (row) => row.deviation !== null && row.deviation < -5,
    ).length;

    const breakdownMap = new Map<
      string,
      {
        workTypeId: string;
        label: string;
        group: "CONSULTANCY" | "PHYSICAL";
        tone: WorkTypeBadgeTone;
        count: number;
        totalProgress: number;
        totalPagu: number;
      }
    >();

    for (const row of portfolioRows) {
      const existing = breakdownMap.get(row.workTypeId);
      if (existing) {
        existing.count += 1;
        existing.totalProgress += row.actualProgress;
        existing.totalPagu += row.paguValue;
      } else {
        breakdownMap.set(row.workTypeId, {
          workTypeId: row.workTypeId,
          label: row.workTypeBadge.shortLabel,
          group: row.workTypeBadge.group,
          tone: row.workTypeBadge.tone,
          count: 1,
          totalProgress: row.actualProgress,
          totalPagu: row.paguValue,
        });
      }
    }

    const workTypeBreakdown = Array.from(breakdownMap.values())
      .map((item) => ({
        ...item,
        avgProgress:
          item.count > 0
            ? Math.round((item.totalProgress / item.count) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      count,
      avgProgress:
        count > 0 ? Math.round((totalProgress / count) * 10) / 10 : 0,
      avgPlanned:
        plannedList.length > 0
          ? Math.round((totalPlanned / plannedList.length) * 10) / 10
          : null,
      consultancyCount,
      physicalCount,
      totalPagu,
      totalRealized,
      realizationPercent:
        totalPagu > 0 ? Math.round((totalRealized / totalPagu) * 1000) / 10 : 0,
      totalReports,
      behindScheduleCount,
      workTypeBreakdown,
    };
  }, [filteredPortfolioRows, portfolioRows]);

  const handleDownloadPortfolio = async (format: "xlsx" | "pdf") => {
    const key = `portfolio-${format}`;
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const params = new URLSearchParams({ format });
      if (portfolioSearch.trim()) {
        params.set("search", portfolioSearch.trim());
      }
      if (portfolioWorkTypeFilter !== "ALL") {
        params.set("jenisPekerjaan", portfolioWorkTypeFilter);
      }
      if (portfolioStatusFilter !== "ALL") {
        params.set("status", portfolioStatusFilter);
      }
      const res = await fetch(`/api/projects/export?${params.toString()}`);
      if (!res.ok) {
        let message = `Gagal mengekspor portofolio (${res.status})`;
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // ignore non-json error body
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const fallbackName = `Rekap_Portofolio_Proyek_${new Date().toISOString().slice(0, 10)}.${format}`;
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(`Unduhan ${filename} dimulai`);
    } catch {
      toast.error("Gagal mengunduh rekap portofolio.");
    } finally {
      setExportingKey(null);
    }
  };

  const handleDownloadProjectReport = async (
    projectId: string,
    projectCode: string,
    type: "progress" | "financial",
    format: "pdf" | "xlsx",
  ) => {
    const key = `${projectId}-${type}-${format}`;
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/reports?type=${type}&format=${format}`,
      );
      if (!res.ok) {
        let message = `Gagal membuat laporan ${type} (${res.status})`;
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // ignore non-json error body
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const fallbackName = `Laporan_${type}_${projectCode}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(`Unduhan ${filename} dimulai`);
    } catch {
      toast.error("Gagal mengunduh laporan proyek.");
    } finally {
      setExportingKey(null);
    }
  };

  const linkedProjectsByGroup = useMemo(() => {
    const projectByGroup = new Map<string, DinasProjectProgressSource>();
    const ambiguousGroups = new Set<string>();
    for (const project of projects) {
      const keys = new Set(
        [project.kelompokTani, project.name, project.title]
          .map(normalizeGroupName)
          .filter(Boolean),
      );
      for (const key of keys) {
        if (ambiguousGroups.has(key)) continue;
        if (projectByGroup.has(key)) {
          projectByGroup.delete(key);
          ambiguousGroups.add(key);
        } else {
          projectByGroup.set(key, project);
        }
      }
    }
    return projectByGroup;
  }, [projects]);

  const projectReportData = useMemo(
    () =>
      DINAS_PROJECTS_DATA.map((record) => {
        const linkedProject = linkedProjectsByGroup.get(
          normalizeGroupName(record.poktan),
        );
        const sourceProgress =
          linkedProject && Number.isFinite(linkedProject.progress)
            ? linkedProject.progress
            : record.progresFisikKonstruksiPercent;
        const progress = Math.min(100, Math.max(0, sourceProgress));
        const realizedArea = calculateRealizedArea(
          record.luasLahanHa,
          progress,
        );
        return {
          ...record,
          progresFisikKonstruksiPercent: progress,
          realisasiHaKonstruksi: realizedArea,
          biayaDigunakanKonstruksi:
            record.luasLahanHa > 0
              ? Math.round(
                  (record.totalBiayaKonstruksi / record.luasLahanHa) *
                    realizedArea,
                )
              : 0,
        };
      }),
    [linkedProjectsByGroup],
  );

  const kecamatanList = useMemo(() => {
    const set = new Set<string>();
    projectReportData.forEach((p) => set.add(p.kecamatan));
    return Array.from(set).sort();
  }, [projectReportData]);

  const filteredData = useMemo(() => {
    return projectReportData.filter((item) => {
      const matchKecamatan =
        selectedKecamatan === "ALL" ||
        item.kecamatan.toLowerCase() === selectedKecamatan.toLowerCase();
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.poktan.toLowerCase().includes(query) ||
        item.desa.toLowerCase().includes(query) ||
        item.kecamatan.toLowerCase().includes(query) ||
        item.nomorSpk.toLowerCase().includes(query) ||
        item.ketuaPoktan.toLowerCase().includes(query) ||
        item.ketuaUpkk.toLowerCase().includes(query);

      return matchKecamatan && matchSearch;
    });
  }, [projectReportData, selectedKecamatan, searchQuery]);

  const aggregates = useMemo(() => {
    let totalLuas = 0;
    let totalBiayaKonstruksi = 0;
    let totalBiayaDigunakanKonstruksi = 0;
    let totalRealisasiHaKonstruksi = 0;
    let totalBiayaOlahLahan = 0;
    let totalBiayaDigunakanOlahLahan = 0;
    let totalSp2d1 = 0;
    let totalSp2d2 = 0;

    filteredData.forEach((d) => {
      totalLuas += d.luasLahanHa;
      totalBiayaKonstruksi += d.totalBiayaKonstruksi;
      totalBiayaDigunakanKonstruksi += d.biayaDigunakanKonstruksi;
      totalRealisasiHaKonstruksi += d.realisasiHaKonstruksi;
      totalBiayaOlahLahan += d.totalBiayaOlahLahan;
      totalBiayaDigunakanOlahLahan += d.biayaDigunakanOlahLahan;
      totalSp2d1 += d.sp2d1Jumlah;
      totalSp2d2 += d.sp2d2Jumlah;
    });

    return {
      totalLuas,
      totalBiayaKonstruksi,
      totalBiayaDigunakanKonstruksi,
      totalRealisasiHaKonstruksi,
      totalBiayaOlahLahan,
      totalBiayaDigunakanOlahLahan,
      totalSp2d1,
      totalSp2d2,
      totalPenyaluran: totalSp2d1 + totalSp2d2,
    };
  }, [filteredData]);

  const handleExportCsv = () => {
    let csvHeader = "";
    let csvRows: string[] = [];

    if (activeTab === "rekapitulasi") {
      csvHeader =
        "No,Kabupaten,Kecamatan,Desa,Nama Poktan,Luas (Ha),Total Biaya Konstruksi,Biaya Digunakan Konstruksi,Realisasi Konstruksi (Ha),Progres Fisik Konstruksi (%),BAST Teknis UPKK,BAST UPKK ke PPK,BAST PPK ke KPA,BAST KPA ke Poktan,Total Biaya Olah Lahan,Biaya Digunakan Olah Lahan,Progres Fisik Olah Lahan (%),Realisasi Olah Lahan (Ha)";
      csvRows = filteredData.map((d) =>
        [
          d.no,
          `"${d.kabupaten}"`,
          `"${d.kecamatan}"`,
          `"${d.desa}"`,
          `"${d.poktan}"`,
          d.luasLahanHa,
          d.totalBiayaKonstruksi,
          d.biayaDigunakanKonstruksi,
          d.realisasiHaKonstruksi,
          `${d.progresFisikKonstruksiPercent}%`,
          `"${d.bastTeknisUpkk || ""}"`,
          `"${d.bastUpkkPpk || ""}"`,
          `"${d.bastPpkKpa || ""}"`,
          `"${d.bastKpaPoktan || ""}"`,
          d.totalBiayaOlahLahan,
          d.biayaDigunakanOlahLahan,
          `${d.progresFisikOlahLahanPercent}%`,
          d.realisasiHaOlahLahan,
        ].join(","),
      );
    } else if (activeTab === "database_spk") {
      csvHeader =
        "No,Kecamatan,Desa,Nama Poktan,SK CPCL,Nomor SPK,Tanggal SPK,Mulai,Selesai,Nama Bank,No Rekening,Ketua Poktan,NIK Ketua,Anggota,Ketua UPKK,NIK UPKK,SP2D 1,Jumlah SP2D 1,SP2D 2,Jumlah SP2D 2";
      csvRows = filteredData.map((d) =>
        [
          d.no,
          `"${d.kecamatan}"`,
          `"${d.desa}"`,
          `"${d.poktan}"`,
          `"${d.noTglSkCpcl}"`,
          `"${d.nomorSpk}"`,
          `"${d.tglSpk}"`,
          `"${d.tglMulai}"`,
          `"${d.tglSelesai}"`,
          `"${d.namaBank}"`,
          `'${d.noRekening}`,
          `"${d.ketuaPoktan}"`,
          `'${d.nikKetua}`,
          d.jumlahAnggota,
          `"${d.ketuaUpkk}"`,
          `'${d.nikUpkk}`,
          `"${d.sp2d1NoTgl}"`,
          d.sp2d1Jumlah,
          `"${d.sp2d2NoTgl || ""}"`,
          d.sp2d2Jumlah,
        ].join(","),
      );
    } else {
      csvHeader =
        "No,Kecamatan,Desa,Nama Poktan,Luas (Ha),Nama Pekerjaan,Volume SID,Satuan,Biaya Rencana,Realisasi Volume,Realisasi Satuan";
      csvRows = filteredData.flatMap((d) =>
        d.pekerjaanList.map((p) =>
          [
            d.no,
            `"${d.kecamatan}"`,
            `"${d.desa}"`,
            `"${d.poktan}"`,
            d.luasLahanHa,
            `"${p.namaPekerjaan}"`,
            `"${p.volume || ""}"`,
            `"${p.satuan || ""}"`,
            p.biaya,
            `"${p.realisasiVolume || ""}"`,
            `"${p.realisasiSatuan || ""}"`,
          ].join(","),
        ),
      );
    }

    const csvContent =
      "data:text/csv;charset=utf-8," + [csvHeader, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Laporan_Dinas_${activeTab}_Aceh_Tengah_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedPoktan =
    filteredData[selectedPoktanIndex] || filteredData[0] || projectReportData[0];

  return (
    <div className="space-y-6">
      {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={reportMode === "portfolio_live" ? "default" : "outline"}
            onClick={() => setReportMode("portfolio_live")}
            className="gap-1.5"
          >
            <Building2 className="size-3.5" aria-hidden="true" />
            <span>Rekap Portofolio Live DB</span>
            <Badge
              variant={
                reportMode === "portfolio_live" ? "secondary" : "outline"
              }
              className="ml-0.5 tabular-nums"
            >
              {portfolioRows.length}
            </Badge>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={reportMode === "dinas_preset" ? "default" : "outline"}
            onClick={() => setReportMode("dinas_preset")}
            className="gap-1.5"
          >
            <Landmark className="size-3.5" aria-hidden="true" />
            <span>Preset Dinas Aceh Tengah</span>
          </Button>
        </div>
        <span className="type-p3 text-muted-foreground">
          {reportMode === "portfolio_live"
            ? hasLiveDbMetadata
              ? "Tersinkron langsung dengan progres Kurva-S & proyek aktif di database"
              : "Data ringkas dari database proyek (akses Master Proyek untuk kolom lengkap)"
            : "Template resmi Dinas Aceh Tengah (38 Poktan / 754 Ha) terintegrasi progres live"}
        </span>
      </div>

      {reportMode === "portfolio_live" ? (
        <div className="space-y-6">
          {/* Portfolio Live DB Header */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-xs">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex items-start gap-3.5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Briefcase className="size-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Rekap Otomatis Live DB</Badge>
                    <span className="type-p3 text-muted-foreground">
                      Konsultansi &amp; Konstruksi Fisik
                    </span>
                  </div>
                  <h2 className="type-h2 mt-1 text-foreground">
                    Rekapitulasi Portofolio Proyek &amp; Jenis Pekerjaan
                  </h2>
                  <p className="type-p2 text-muted-foreground">
                    Rekap otomatis seluruh proyek aktif di database (DED,
                    Konsultan Pengawas, Gedung, Jalan &amp; Jembatan, Irigasi,
                    MEP, dan spesialisasi lainnya) beserta Kurva-S rencana.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingKey !== null}
                  onClick={() => void handleDownloadPortfolio("xlsx")}
                  className="gap-1.5"
                >
                  {exportingKey === "portfolio-xlsx" ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileSpreadsheet
                      className="size-3.5 text-emerald-600"
                      aria-hidden="true"
                    />
                  )}
                  <span>Ekspor Excel (.xlsx)</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingKey !== null}
                  onClick={() => void handleDownloadPortfolio("pdf")}
                  className="gap-1.5"
                >
                  {exportingKey === "portfolio-pdf" ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText
                      className="size-3.5 text-rose-600"
                      aria-hidden="true"
                    />
                  )}
                  <span>Ekspor PDF</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5"
                >
                  <Printer className="size-3.5" aria-hidden="true" />
                  <span>Cetak</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Portfolio KPI Summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="type-p3 text-muted-foreground">
                Total Proyek Ditampilkan
              </p>
              <p className="type-kpi mt-1 text-foreground tabular-nums">
                {portfolioSummary.count}{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  dari {portfolioRows.length} proyek
                </span>
              </p>
              <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
                Deviasi tertinggal (&lt;-5%):{" "}
                {portfolioSummary.behindScheduleCount} proyek
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="type-p3 text-muted-foreground">
                Rata-rata Progres Aktual
              </p>
              <p className="type-kpi mt-1 text-foreground tabular-nums">
                {portfolioSummary.avgProgress.toFixed(1)}%
              </p>
              <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
                {portfolioSummary.avgPlanned !== null
                  ? `Rata-rata Rencana Kurva-S: ${portfolioSummary.avgPlanned.toFixed(1)}%`
                  : "Jadwal Kurva-S belum lengkap"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="type-p3 text-muted-foreground">
                Komposisi Jenis Pekerjaan
              </p>
              <p className="type-kpi mt-1 text-foreground tabular-nums">
                {portfolioSummary.consultancyCount}{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  Konsultansi · {portfolioSummary.physicalCount} Fisik
                </span>
              </p>
              <p className="type-p3 mt-1 text-muted-foreground">
                {portfolioSummary.workTypeBreakdown.length} kategori aktif
              </p>
            </div>

            {canViewFinancials ? (
              <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
                <p className="type-p3 text-muted-foreground">
                  Total Pagu &amp; Realisasi Biaya
                </p>
                <p className="type-kpi mt-1 text-foreground tabular-nums">
                  {formatCompactRupiah(portfolioSummary.totalPagu)}
                </p>
                <p className="type-p3 mt-1 font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                  Realisasi:{" "}
                  {formatCompactRupiah(portfolioSummary.totalRealized)} (
                  {portfolioSummary.realizationPercent.toFixed(1)}%)
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
                <p className="type-p3 text-muted-foreground">
                  Total Laporan Harian
                </p>
                <p className="type-kpi mt-1 text-foreground tabular-nums">
                  {portfolioSummary.totalReports}
                </p>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Dokumentasi lapangan terekam
                </p>
              </div>
            )}
          </div>

          {/* Interactive Work Type Breakdown Pills */}
          {portfolioSummary.workTypeBreakdown.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="type-p3 font-semibold text-foreground">
                  Ringkasan per Jenis Pekerjaan (Klik untuk filter)
                </p>
                {portfolioWorkTypeFilter !== "ALL" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPortfolioWorkTypeFilter("ALL")}
                    className="h-7 px-2 text-xs"
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {portfolioSummary.workTypeBreakdown.map((item) => {
                  const isActive = portfolioWorkTypeFilter === item.workTypeId;
                  return (
                    <button
                      key={item.workTypeId}
                      type="button"
                      onClick={() =>
                        setPortfolioWorkTypeFilter(
                          isActive ? "ALL" : item.workTypeId,
                        )
                      }
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors",
                        isActive
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-background hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
                          WORK_TYPE_TONE_CLASSES[item.tone],
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="type-p3 font-semibold text-foreground tabular-nums">
                        {item.count} proyek
                      </span>
                      <span className="type-p3 text-muted-foreground tabular-nums">
                        · {item.avgProgress.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Portfolio Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={portfolioSearch}
                  onChange={(event) => setPortfolioSearch(event.target.value)}
                  placeholder="Cari kode, nama proyek, klien, PIC..."
                  className="pl-8"
                />
              </div>

              <Select
                value={portfolioWorkTypeFilter}
                onValueChange={setPortfolioWorkTypeFilter}
              >
                <SelectTrigger className="w-60">
                  <Filter
                    className="mr-1.5 size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <SelectValue placeholder="Semua Jenis Pekerjaan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">
                    Semua Jenis Pekerjaan ({portfolioRows.length})
                  </SelectItem>
                  <SelectItem value="CONSULTANCY">
                    Semua Jasa Konsultansi
                  </SelectItem>
                  <SelectItem value="PHYSICAL">
                    Semua Konstruksi Fisik
                  </SelectItem>
                  {PROJECT_WORK_TYPE_GROUPS.map((group) => (
                    <SelectGroup key={group.group}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={portfolioStatusFilter}
                onValueChange={setPortfolioStatusFilter}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  <SelectItem value="RUNNING">Berjalan</SelectItem>
                  <SelectItem value="PENDING_SETUP">Persiapan</SelectItem>
                  <SelectItem value="HOLD">Tertahan</SelectItem>
                  <SelectItem value="DONE">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="type-p3 text-muted-foreground tabular-nums">
              Menampilkan{" "}
              <strong className="font-semibold text-foreground">
                {filteredPortfolioRows.length}
              </strong>{" "}
              proyek
            </p>
          </div>

          {filteredPortfolioRows.length === 0 ? (
            <EmptyState
              title="Tidak ada proyek yang sesuai filter"
              description="Ubah kata kunci pencarian, kategori jenis pekerjaan, atau status proyek."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12 text-center">No</TableHead>
                    <TableHead className="min-w-[230px]">
                      Kode &amp; Nama Proyek
                    </TableHead>
                    <TableHead className="min-w-[170px]">
                      Jenis Pekerjaan
                    </TableHead>
                    <TableHead className="min-w-[160px]">
                      Mitra / Klien &amp; PIC
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aktual</TableHead>
                    <TableHead className="text-right">Rencana</TableHead>
                    <TableHead className="text-right">Deviasi</TableHead>
                    <TableHead className="text-center">
                      Laporan Harian
                    </TableHead>
                    {canViewFinancials && (
                      <>
                        <TableHead className="text-right">
                          Pagu Anggaran
                        </TableHead>
                        <TableHead className="text-right">Realisasi</TableHead>
                      </>
                    )}
                    <TableHead className="text-right print:hidden">
                      Laporan Proyek
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPortfolioRows.map((row, idx) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-center text-muted-foreground tabular-nums">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground">
                              {row.code}
                            </span>
                          </div>
                          <p className="font-medium text-foreground">
                            {row.title}
                          </p>
                          {row.locationLabel !== "-" && (
                            <p className="type-p3 text-muted-foreground">
                              {row.locationLabel}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                              WORK_TYPE_TONE_CLASSES[row.workTypeBadge.tone],
                            )}
                          >
                            {row.workTypeBadge.shortLabel}
                          </span>
                          <p className="type-p3 text-muted-foreground">
                            {row.workTypeBadge.groupShortLabel}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs">
                          <p className="font-medium text-foreground">
                            {row.clientLabel}
                          </p>
                          <p className="text-muted-foreground">
                            PIC: {row.fieldPicName}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{row.statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.actualProgress.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {row.plannedProgress !== null
                          ? `${row.plannedProgress.toFixed(1)}%`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.deviation !== null ? (
                          <span
                            className={cn(
                              "font-semibold",
                              row.deviation >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : row.deviation < -10
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            {row.deviation >= 0 ? "+" : ""}
                            {row.deviation.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs tabular-nums">
                        <span className="font-medium text-foreground">
                          {row.reportsCount}x
                        </span>
                        {row.latestReportDate && (
                          <p className="text-muted-foreground">
                            {row.latestReportDate}
                          </p>
                        )}
                      </TableCell>
                      {canViewFinancials && (
                        <>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatCompactRupiah(row.paguValue)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                            {formatCompactRupiah(row.realizedValue)}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right print:hidden">
                        {row.id ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={exportingKey !== null}
                              onClick={() =>
                                void handleDownloadProjectReport(
                                  row.id!,
                                  row.code,
                                  "progress",
                                  "pdf",
                                )
                              }
                              className="h-7 px-2 text-xs"
                              title="Unduh PDF Progres & Kurva-S"
                            >
                              PDF
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={exportingKey !== null}
                              onClick={() =>
                                void handleDownloadProjectReport(
                                  row.id!,
                                  row.code,
                                  "progress",
                                  "xlsx",
                                )
                              }
                              className="h-7 px-2 text-xs"
                              title="Unduh Excel Progres"
                            >
                              XLSX
                            </Button>
                            {canViewFinancials && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={exportingKey !== null}
                                onClick={() =>
                                  void handleDownloadProjectReport(
                                    row.id!,
                                    row.code,
                                    "financial",
                                    "xlsx",
                                  )
                                }
                                className="h-7 px-2 text-xs"
                                title="Unduh Excel Keuangan RAB/RAP"
                              >
                                RAB
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={5}>
                      Total / Rata-rata ({filteredPortfolioRows.length} proyek)
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {portfolioSummary.avgProgress.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {portfolioSummary.avgPlanned !== null
                        ? `${portfolioSummary.avgPlanned.toFixed(1)}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {portfolioSummary.avgPlanned !== null
                        ? `${(portfolioSummary.avgProgress - portfolioSummary.avgPlanned) >= 0 ? "+" : ""}${(portfolioSummary.avgProgress - portfolioSummary.avgPlanned).toFixed(1)}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {portfolioSummary.totalReports}x
                    </TableCell>
                    {canViewFinancials && (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {formatCompactRupiah(portfolioSummary.totalPagu)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 tabular-nums dark:text-emerald-400">
                          {formatCompactRupiah(portfolioSummary.totalRealized)}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="print:hidden" />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Official Dinas Report Header */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Landmark className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Format Laporan Resmi Dinas</Badge>
                <span className="type-p3 text-muted-foreground">
                  Tahun Anggaran 2026
                </span>
              </div>
              <h2 className="type-h2 mt-1 text-foreground">
                {DINAS_REPORT_METADATA.kegiatan}
              </h2>
              <p className="type-p2 text-muted-foreground">
                {DINAS_REPORT_METADATA.satker} · Kabupaten Aceh Tengah (Pagu: Rp
                10.179.000.000 · 754 Ha · 38 Poktan)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-1.5"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>Ekspor CSV</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="size-3.5" aria-hidden="true" />
              <span>Cetak Laporan</span>
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "rekapitulasi" ? "default" : "outline"}
            onClick={() => setActiveTab("rekapitulasi")}
            className="gap-1.5"
          >
            <Layers className="size-3.5" aria-hidden="true" />
            <span>Rekapitulasi Fisik</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "rincian_sid" ? "default" : "outline"}
            onClick={() => setActiveTab("rincian_sid")}
            className="gap-1.5"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            <span>Hasil SID &amp; Foto</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "database_spk" ? "default" : "outline"}
            onClick={() => setActiveTab("database_spk")}
            className="gap-1.5"
          >
            <UserCheck className="size-3.5" aria-hidden="true" />
            <span>Database SPK &amp; SP2D</span>
          </Button>
        </div>
      </div>

      {/* Metric Summaries */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">Total Poktan Terdaftar</p>
          <p className="type-kpi mt-1 text-foreground">
            {filteredData.length}{" "}
            <span className="type-p3 font-normal text-muted-foreground">
              dari 38 Poktan
            </span>
          </p>
          <p className="type-p3 mt-1 text-muted-foreground">
            9 Kecamatan se-Aceh Tengah
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">
            Total Luas Lahan (CPCL)
          </p>
          <p className="type-kpi mt-1 text-foreground">
            {aggregates.totalLuas.toLocaleString("id-ID")}{" "}
            <span className="type-p3 font-normal text-muted-foreground">
              Hektar
            </span>
          </p>
          <p className="type-p3 mt-1 font-medium text-success tabular-nums">
            Realisasi:{" "}
            {aggregates.totalRealisasiHaKonstruksi.toLocaleString("id-ID")} Ha
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">
            Pagu Konstruksi &amp; Olah Lahan
          </p>
          <p className="type-kpi mt-1 text-foreground">
            Rp{" "}
            {(
              aggregates.totalBiayaKonstruksi + aggregates.totalBiayaOlahLahan
            ).toLocaleString("id-ID")}
          </p>
          <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
            Digunakan: Rp{" "}
            {(
              aggregates.totalBiayaDigunakanKonstruksi +
              aggregates.totalBiayaDigunakanOlahLahan
            ).toLocaleString("id-ID")}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <p className="type-p3 text-muted-foreground">
            Tersalurkan SP2D (Bank)
          </p>
          <p className="type-kpi mt-1 text-success">
            Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
          </p>
          <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
            T1: Rp {aggregates.totalSp2d1.toLocaleString("id-ID")} · T2: Rp{" "}
            {aggregates.totalSp2d2.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari Poktan, Desa, SPK, Ketua..."
              className="pl-8"
            />
          </div>

          <Select
            value={selectedKecamatan}
            onValueChange={setSelectedKecamatan}
          >
            <SelectTrigger className="w-52">
              <Filter
                className="mr-1.5 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <SelectValue placeholder="Semua Kecamatan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">
                Semua Kecamatan ({projectReportData.length})
              </SelectItem>
              {kecamatanList.map((kec) => (
                <SelectItem key={kec} value={kec}>
                  Kec. {kec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="type-p3 text-muted-foreground tabular-nums">
          Menampilkan{" "}
          <strong className="font-semibold text-foreground">
            {filteredData.length}
          </strong>{" "}
          baris data
        </p>
      </div>

      {filteredData.length === 0 ? (
        <EmptyState
          title="Data laporan dinas tidak ditemukan"
          description="Coba ubah filter kecamatan atau kata kunci pencarian."
        />
      ) : (
        <>
          {/* TAB 1: Rekapitulasi */}
          {activeTab === "rekapitulasi" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div>
                <h3 className="type-h3 text-foreground">
                  Tabel 1: Rekapitulasi Realisasi Fisik Konstruksi &amp; Olah
                  Lahan
                </h3>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026
                </p>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="text-center">
                      No
                    </TableHead>
                    <TableHead rowSpan={2}>Kecamatan</TableHead>
                    <TableHead rowSpan={2}>Desa / Kampung</TableHead>
                    <TableHead rowSpan={2}>Nama Poktan</TableHead>
                    <TableHead rowSpan={2} className="text-right">
                      Luas (Ha)
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      Konstruksi
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      BAST Fisik
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      Olah Lahan
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right">Biaya (Rp)</TableHead>
                    <TableHead className="text-right">Digunakan (Rp)</TableHead>
                    <TableHead className="text-right">Realisasi (Ha)</TableHead>
                    <TableHead className="text-center">% Fisik</TableHead>
                    <TableHead className="text-center">UPKK</TableHead>
                    <TableHead className="text-center">UPKK-PPK</TableHead>
                    <TableHead className="text-center">PPK-KPA</TableHead>
                    <TableHead className="text-center">KPA-Poktan</TableHead>
                    <TableHead className="text-right">Biaya (Rp)</TableHead>
                    <TableHead className="text-right">Digunakan (Rp)</TableHead>
                    <TableHead className="text-center">% Fisik</TableHead>
                    <TableHead className="text-right">Realisasi (Ha)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((d) => (
                    <TableRow key={d.no}>
                      <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                        {d.no}
                      </TableCell>
                      <TableCell className="type-p2 font-medium text-foreground">
                        {d.kecamatan}
                      </TableCell>
                      <TableCell className="type-p3 text-muted-foreground">
                        {d.desa}
                      </TableCell>
                      <TableCell className="type-p2 font-semibold text-foreground">
                        {d.poktan}
                      </TableCell>
                      <TableCell className="type-p2 text-right font-medium tabular-nums">
                        {d.luasLahanHa}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                        {d.totalBiayaKonstruksi.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-foreground tabular-nums">
                        {d.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-medium tabular-nums">
                        {d.realisasiHaKonstruksi.toLocaleString("id-ID", {
                          maximumFractionDigits: 5,
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {d.progresFisikKonstruksiPercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastTeknisUpkk || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastUpkkPpk || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastPpkKpa || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastKpaPoktan || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                        {d.totalBiayaOlahLahan.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-foreground tabular-nums">
                        {d.biayaDigunakanOlahLahan.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {d.progresFisikOlahLahanPercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 text-right font-medium tabular-nums">
                        {d.realisasiHaOlahLahan}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="type-p2 text-center font-bold">
                      Total Keseluruhan ({filteredData.length} Poktan)
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalLuas.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalRealisasiHaKonstruksi.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-center font-bold">
                      100%
                    </TableCell>
                    <TableCell
                      colSpan={4}
                      className="type-p3 text-center text-muted-foreground"
                    >
                      Selesai &amp; BAST Lengkap
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaOlahLahan.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaDigunakanOlahLahan.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-center font-bold">
                      100%
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalLuas.toLocaleString("id-ID")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {/* TAB 2: Hasil SID & Dokumentasi Foto */}
          {activeTab === "rincian_sid" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="type-h3 text-foreground">
                      Pilih Kelompok Tani untuk Rincian Fisik &amp; Dokumentasi
                    </h3>
                    <p className="type-p3 text-muted-foreground">
                      Laporan Realisasi Fisik Hasil SID vs Fisik Konstruksi
                    </p>
                  </div>
                  <Badge variant="outline">
                    {selectedPoktan.kecamatan} · {selectedPoktan.desa}
                  </Badge>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {filteredData.map((p, idx) => (
                    <button
                      key={p.no}
                      type="button"
                      onClick={() => setSelectedPoktanIndex(idx)}
                      className={cn(
                        "flex min-w-[160px] shrink-0 flex-col rounded-lg border p-3 text-left transition",
                        selectedPoktan.no === p.no
                          ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      <span className="type-p3 uppercase tracking-wider text-muted-foreground">
                        #{p.no} · {p.kecamatan}
                      </span>
                      <span className="type-p2 truncate font-bold text-foreground">
                        {p.poktan}
                      </span>
                      <span className="type-p3 mt-0.5 tabular-nums">
                        Luas: {p.luasLahanHa} Ha
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="type-h3 text-foreground">
                        Rincian Item Pekerjaan Konstruksi
                      </h4>
                      <p className="type-p3 text-muted-foreground">
                        {selectedPoktan.poktan} · Kec.{" "}
                        {selectedPoktan.kecamatan}, Desa {selectedPoktan.desa}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="type-p3 text-muted-foreground">
                        Total Anggaran Konstruksi
                      </span>
                      <p className="type-h3 font-bold text-primary tabular-nums">
                        Rp{" "}
                        {selectedPoktan.totalBiayaKonstruksi.toLocaleString(
                          "id-ID",
                        )}
                      </p>
                    </div>
                  </div>

                  <Table pagination={false}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">No</TableHead>
                        <TableHead>Rincian Pekerjaan</TableHead>
                        <TableHead className="text-right">Vol SID</TableHead>
                        <TableHead className="text-center">Satuan</TableHead>
                        <TableHead className="text-right">Biaya (Rp)</TableHead>
                        <TableHead className="text-right">Realisasi</TableHead>
                        <TableHead className="text-center">Satuan</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPoktan.pekerjaanList.map((item, i) => (
                        <TableRow key={`${item.namaPekerjaan}-${i}`}>
                          <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                            {i + 1}
                          </TableCell>
                          <TableCell className="type-p2 whitespace-normal font-medium text-foreground">
                            {item.namaPekerjaan}
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                            {item.volume !== null && item.volume !== undefined
                              ? String(item.volume)
                              : "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-center text-muted-foreground">
                            {item.satuan || "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono font-semibold text-foreground tabular-nums">
                            {item.biaya > 0
                              ? item.biaya.toLocaleString("id-ID")
                              : "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono font-medium text-success tabular-nums">
                            {item.realisasiVolume !== null &&
                            item.realisasiVolume !== undefined
                              ? String(item.realisasiVolume)
                              : "—"}
                          </TableCell>
                          <TableCell className="type-p3 text-center text-muted-foreground">
                            {item.realisasiSatuan || item.satuan || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="type-p3 inline-flex items-center gap-1 font-semibold text-success">
                              <CheckCircle2
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              100%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="type-p2 text-center font-bold">
                          Total Biaya Konstruksi
                        </TableCell>
                        <TableCell className="type-p2 text-right font-mono font-bold text-primary tabular-nums">
                          Rp{" "}
                          {selectedPoktan.totalBiayaKonstruksi.toLocaleString(
                            "id-ID",
                          )}
                        </TableCell>
                        <TableCell
                          colSpan={3}
                          className="type-p3 text-center font-semibold text-success"
                        >
                          Progres Fisik 100% Selesai
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* 4 Photo Stages */}
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h4 className="type-h3 flex items-center gap-2 text-foreground">
                        <ImageIcon
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        Dokumentasi Resmi
                      </h4>
                      <Badge variant="outline">4 Tahap</Badge>
                    </div>
                    <p className="type-p3 mb-4 text-muted-foreground">
                      Dokumentasi visual fisik wajib untuk lampiran BAST dan
                      pertanggungjawaban dinas.
                    </p>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-border bg-muted/15 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <ImageIcon className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-foreground">
                          Kondisi 0%
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Sebelum Kerja
                        </span>
                        <Badge variant="secondary" className="mt-1.5">
                          Terverifikasi
                        </Badge>
                      </div>

                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-border bg-muted/15 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <ImageIcon className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-foreground">
                          Kondisi 50%
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Sedang Jalan
                        </span>
                        <Badge variant="secondary" className="mt-1.5">
                          Terverifikasi
                        </Badge>
                      </div>

                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-success/40 bg-success/5 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-success">
                          Kondisi 100%
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Selesai
                        </span>
                        <Badge variant="outline" className="mt-1.5">
                          Lengkap
                        </Badge>
                      </div>

                      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-warning/40 bg-warning/5 p-3 text-center">
                        <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-warning/15 text-warning">
                          <Landmark className="size-4" aria-hidden="true" />
                        </div>
                        <span className="type-p2 font-bold text-warning">
                          Prasasti
                        </span>
                        <span className="type-p3 text-muted-foreground">
                          Batu Prasasti
                        </span>
                        <Badge variant="outline" className="mt-1.5">
                          Terpasang
                        </Badge>
                      </div>
                    </div>

                    <div className="type-p3 mt-4 space-y-1.5 border-t border-border pt-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Ketua Poktan:
                        </span>
                        <span className="font-semibold text-foreground">
                          {selectedPoktan.ketuaPoktan}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Ketua UPKK:
                        </span>
                        <span className="font-semibold text-foreground">
                          {selectedPoktan.ketuaUpkk}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nomor SPK:</span>
                        <span className="font-mono text-foreground">
                          {selectedPoktan.nomorSpk}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Database SPK & SP2D */}
          {activeTab === "database_spk" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="type-h3 text-foreground">
                    Tabel 3: Database SPK, Pengurus Poktan/UPKK &amp; SP2D
                  </h3>
                  <p className="type-p3 mt-0.5 text-muted-foreground">
                    Penyaluran Dana Hibah Rehabilitasi Lahan Sawah Aceh Tengah
                    T.A. 2026
                  </p>
                </div>
                <Badge variant="outline">
                  Bank Syariah Indonesia (BSI)
                </Badge>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">No</TableHead>
                    <TableHead>Kecamatan / Desa</TableHead>
                    <TableHead>Nama Poktan &amp; Luas</TableHead>
                    <TableHead>Nomor &amp; Tanggal SPK</TableHead>
                    <TableHead>Jangka Waktu</TableHead>
                    <TableHead>Bank &amp; Rekening</TableHead>
                    <TableHead>Pengurus</TableHead>
                    <TableHead className="text-right">SP2D Tahap 1</TableHead>
                    <TableHead className="text-right">SP2D Tahap 2</TableHead>
                    <TableHead className="text-right">Total Tersalur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((d) => {
                    const totalTersalur = d.sp2d1Jumlah + d.sp2d2Jumlah;
                    return (
                      <TableRow key={d.no}>
                        <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                          {d.no}
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-semibold text-foreground">
                            Kec. {d.kecamatan}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Desa {d.desa}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-bold text-foreground">
                            {d.poktan}
                          </p>
                          <p className="type-p3 text-muted-foreground tabular-nums">
                            {d.luasLahanHa} Ha ({d.jumlahAnggota} Anggota)
                          </p>
                        </TableCell>
                        <TableCell className="font-mono">
                          <p className="type-p3 font-semibold text-foreground">
                            {d.nomorSpk}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Tgl: {d.tglSpk}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3 tabular-nums">
                          <p>{d.tglMulai} s/d</p>
                          <p className="text-muted-foreground">{d.tglSelesai}</p>
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-medium text-foreground">
                            {d.namaBank}
                          </p>
                          <p className="type-p3 font-mono text-muted-foreground">
                            {d.noRekening}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3">
                          <p>
                            <span className="text-muted-foreground">
                              Ketua:{" "}
                            </span>
                            <span className="font-medium text-foreground">
                              {d.ketuaPoktan}
                            </span>
                          </p>
                          <p className="font-mono text-muted-foreground">
                            NIK: {d.nikKetua}
                          </p>
                          <p>
                            <span className="text-muted-foreground">UPKK: </span>
                            <span className="font-medium text-foreground">
                              {d.ketuaUpkk}
                            </span>
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <p className="type-p2 font-semibold text-foreground">
                            Rp {d.sp2d1Jumlah.toLocaleString("id-ID")}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {d.sp2d1NoTgl}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <p className="type-p2 font-semibold text-foreground">
                            Rp {d.sp2d2Jumlah.toLocaleString("id-ID")}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {d.sp2d2NoTgl || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="type-p2 text-right font-mono font-bold text-success tabular-nums">
                          Rp {totalTersalur.toLocaleString("id-ID")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={7} className="type-p2 text-center font-bold">
                      Total Penyaluran SP2D ({filteredData.length} Poktan)
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      Rp {aggregates.totalSp2d1.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      Rp {aggregates.totalSp2d2.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold text-success tabular-nums">
                      Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Official Sign-Off Section for Dinas Printing */}
      <div className="mt-12 hidden border-t border-border pt-6 print:block">
        <div className="type-p3 grid grid-cols-3 gap-6 text-center">
          <div>
            <p>Mengetahui,</p>
            <p className="font-bold">Kuasa Pengguna Anggaran (KPA)</p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA KPA LENGKAP, M.Si</p>
            <p className="text-muted-foreground">NIP. 19780101 200501 1 001</p>
          </div>
          <div>
            <p>Disetujui Oleh,</p>
            <p className="font-bold">Pejabat Pembuat Komitmen (PPK)</p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA PPK LENGKAP, ST</p>
            <p className="text-muted-foreground">NIP. 19820315 200801 1 002</p>
          </div>
          <div>
            <p>
              Takengon,{" "}
              {new Date().toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="font-bold">
              Pejabat Pelaksana Teknis Kegiatan (PPTK)
            </p>
            <div className="h-20" />
            <p className="font-bold underline">NAMA PPTK LENGKAP, SP</p>
            <p className="text-muted-foreground">NIP. 19850720 201001 1 003</p>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
