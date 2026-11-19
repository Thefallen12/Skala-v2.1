"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Info,
  Landmark,
  Layers,
  Loader2,
  Maximize2,
  Printer,
  Search,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
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
  pagu?: string | number | bigint | null;
  realized?: string | number | bigint | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  fieldPicName?: string | null;
  fieldPic?: { name: string } | null;
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
  dailyReports?: Array<{
    id?: string;
    reportDate: string | Date;
    progress?: number | null;
    workSummary?: string | null;
    weather?: string | null;
    workersCount?: number | null;
    notes?: string | null;
    progressPhotos?: Array<{
      url?: string | null;
      fileUrl?: string | null;
    }>;
  }>;
  workPoints?: Array<{
    id?: string;
    title?: string;
    proposedVolume?: string | number | bigint | null;
    completedVolume?: string | number | bigint | null;
    proposedUnit?: string | null;
    proposedUnitPrice?: string | number | bigint | null;
    progress?: number;
  }>;
  progressSubmissions?: Array<{
    id: string;
    periodType: string;
    periodLabel: string;
    actualProgress: number;
    plannedProgress: number;
    deviation: number;
    submittedAt: string | Date;
  }>;
};

export type ClassifiedPhotoItem = {
  url: string;
  reportDate: string;
  reportDateRaw?: string | Date;
  progress: number;
  workSummary?: string;
  weather?: string;
  workersCount?: number;
  notes?: string;
  stage: "0%" | "50%" | "100%" | "Prasasti";
  stageLabel: string;
  poktan: string;
  desa: string;
  kecamatan: string;
};

export type PoktanPhotoClassification = {
  photos0: ClassifiedPhotoItem[];
  photos50: ClassifiedPhotoItem[];
  photos100: ClassifiedPhotoItem[];
  photosPrasasti: ClassifiedPhotoItem[];
  allPhotos: ClassifiedPhotoItem[];
  totalPhotosCount: number;
  dailyReportsCount: number;
  latestReportDate: string | null;
  latestProgress: number;
  latestWeeklySubmission: {
    periodLabel: string;
    actualProgress: number;
    submittedAt: string;
  } | null;
};

export type LightboxState = {
  photo: ClassifiedPhotoItem;
  photoList: ClassifiedPhotoItem[];
  currentIndex: number;
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

function parseAmountSafe(
  value: string | number | bigint | null | undefined,
): number {
  if (typeof value === "bigint") return Number(value);
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

function formatDateIndo(value?: string | Date | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function classifyProjectPhotos(
  poktan: string,
  desa: string,
  kecamatan: string,
  linkedProject?: DinasProjectProgressSource,
): PoktanPhotoClassification {
  const photos0: ClassifiedPhotoItem[] = [];
  const photos50: ClassifiedPhotoItem[] = [];
  const photos100: ClassifiedPhotoItem[] = [];
  const photosPrasasti: ClassifiedPhotoItem[] = [];
  const allPhotos: ClassifiedPhotoItem[] = [];

  const dailyReports = linkedProject?.dailyReports || [];
  let latestReportDate: string | null = null;
  let latestProgress = linkedProject?.progress ?? 0;

  for (const dr of dailyReports) {
    const reportDateStr = formatDateIndo(dr.reportDate);
    if (
      !latestReportDate ||
      new Date(dr.reportDate) > new Date(latestReportDate)
    ) {
      latestReportDate = reportDateStr;
    }
    const reportProg =
      typeof dr.progress === "number" && !isNaN(dr.progress)
        ? dr.progress
        : latestProgress;

    const photos = dr.progressPhotos || [];
    for (const p of photos) {
      const url = p.url || p.fileUrl;
      if (!url) continue;

      const summary = dr.workSummary || "";
      const notes = dr.notes || "";
      const isPrasasti =
        /prasasti|batu\s*prasasti|serah\s*terima|bast/i.test(summary) ||
        /prasasti|batu\s*prasasti|serah\s*terima|bast/i.test(notes) ||
        reportProg >= 95;

      let stage: ClassifiedPhotoItem["stage"] = "50%";
      let stageLabel = "Kondisi Pelaksanaan (50%)";

      if (isPrasasti) {
        stage = "Prasasti";
        stageLabel = "Batu Prasasti / BAST Fisik";
      } else if (reportProg <= 15) {
        stage = "0%";
        stageLabel = "Kondisi Titik Nol (0%)";
      } else if (reportProg > 75) {
        stage = "100%";
        stageLabel = "Kondisi Akhir Selesai (100%)";
      } else {
        stage = "50%";
        stageLabel = `Kondisi Pelaksanaan (${reportProg.toFixed(1)}%)`;
      }

      const item: ClassifiedPhotoItem = {
        url,
        reportDate: reportDateStr,
        reportDateRaw: dr.reportDate,
        progress: reportProg,
        workSummary: summary,
        weather: dr.weather || undefined,
        workersCount: dr.workersCount || undefined,
        notes: notes,
        stage,
        stageLabel,
        poktan,
        desa,
        kecamatan,
      };

      allPhotos.push(item);
      if (stage === "Prasasti") photosPrasasti.push(item);
      else if (stage === "0%") photos0.push(item);
      else if (stage === "100%") photos100.push(item);
      else photos50.push(item);
    }
  }

  const submissions = linkedProject?.progressSubmissions || [];
  const latestSub = submissions.length > 0 ? submissions[0] : null;
  const latestWeeklySubmission = latestSub
    ? {
        periodLabel: latestSub.periodLabel,
        actualProgress: latestSub.actualProgress,
        submittedAt: formatDateIndo(latestSub.submittedAt),
      }
    : null;

  return {
    photos0,
    photos50,
    photos100,
    photosPrasasti,
    allPhotos,
    totalPhotosCount: allPhotos.length,
    dailyReportsCount: dailyReports.length,
    latestReportDate,
    latestProgress,
    latestWeeklySubmission,
  };
}

function PhotoThumbnailSlot({
  photos,
  stageName,
  stageTitle,
  onOpenLightbox,
}: {
  photos: ClassifiedPhotoItem[];
  stageName: string;
  stageTitle: string;
  onOpenLightbox: (
    photo: ClassifiedPhotoItem,
    photoList: ClassifiedPhotoItem[],
    currentIndex: number,
  ) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="mx-auto flex h-14 w-full min-w-[62px] max-w-[80px] flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/10 p-1 text-center text-muted-foreground">
        <ImageIcon className="size-3.5 opacity-30 mb-0.5" aria-hidden="true" />
        <span className="text-[10px] font-medium leading-tight">Nihil</span>
        <span className="text-[9px] text-muted-foreground/60">{stageName}</span>
      </div>
    );
  }

  const firstPhoto = photos[0];
  const count = photos.length;

  return (
    <button
      type="button"
      onClick={() => onOpenLightbox(firstPhoto, photos, 0)}
      className="group relative mx-auto flex h-14 w-full min-w-[62px] max-w-[80px] overflow-hidden rounded-md border border-border/80 bg-muted/30 shadow-2xs transition hover:border-primary hover:shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
      title={`${stageTitle} - Klik untuk pratinjau (${count} foto)`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={firstPhoto.url}
        alt={`${stageTitle} - ${firstPhoto.poktan}`}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-85 group-hover:opacity-95 transition-opacity" />
      <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white tracking-tight drop-shadow-xs">
        {stageName}
      </span>
      {count > 1 && (
        <span className="absolute top-1 right-1 rounded-full bg-primary/95 px-1 py-0.2 text-[8px] font-extrabold text-white shadow-xs">
          +{count - 1}
        </span>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
        <Maximize2 className="size-3.5 text-white drop-shadow-md" />
      </div>
    </button>
  );
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

  // Controls for Tab 2: Hasil SID & Foto Master
  const [photoFilter, setPhotoFilter] = useState<
    "ALL" | "WITH_PHOTOS" | "FULL_4_STAGES" | "NO_PHOTOS"
  >("ALL");
  const [reportFilter, setReportFilter] = useState<
    "ALL" | "HAS_DAILY" | "HAS_WEEKLY"
  >("ALL");
  const [showAllItems, setShowAllItems] = useState<boolean>(true);
  const [expandedPoktanNos, setExpandedPoktanNos] = useState<Set<number>>(
    () => new Set(),
  );
  const [sidViewMode, setSidViewMode] = useState<"excel_table" | "mobile_cards">(
    "excel_table",
  );
  const [lightboxData, setLightboxData] = useState<LightboxState | null>(null);

  const togglePoktan = (no: number) => {
    setExpandedPoktanNos((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const handleOpenLightbox = (
    photo: ClassifiedPhotoItem,
    photoList: ClassifiedPhotoItem[],
    currentIndex: number,
  ) => {
    setLightboxData({
      photo,
      photoList,
      currentIndex,
    });
  };

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
        fieldPicName:
          project.fieldPic?.name?.trim() || project.fieldPicName?.trim() || "-",
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
    for (const project of projects) {
      const keys = [
        normalizeGroupName(project.name),
        normalizeGroupName(project.kelompokTani),
        normalizeGroupName(project.title),
        normalizeGroupName(project.code || ""),
      ].filter(Boolean);

      for (const key of keys) {
        if (!projectByGroup.has(key)) {
          projectByGroup.set(key, project);
        }
      }
    }
    return projectByGroup;
  }, [projects]);

  const projectReportData = useMemo(
    () =>
      DINAS_PROJECTS_DATA.map((record) => {
        const linkedProject =
          linkedProjectsByGroup.get(normalizeGroupName(record.poktan)) ||
          linkedProjectsByGroup.get(normalizeGroupName(record.desa)) ||
          linkedProjectsByGroup.get(normalizeGroupName(record.nomorSpk));

        const sourceProgress =
          linkedProject && Number.isFinite(linkedProject.progress)
            ? linkedProject.progress
            : record.progresFisikKonstruksiPercent;
        const progress = Math.min(100, Math.max(0, sourceProgress));
        const realizedArea = calculateRealizedArea(
          record.luasLahanHa,
          progress,
        );

        const photoClassification = classifyProjectPhotos(
          record.poktan,
          record.desa,
          record.kecamatan,
          linkedProject,
        );

        const totalBiayaKonstruksi = record.totalBiayaKonstruksi;
        const pekerjaanListWithBobot = record.pekerjaanList.map((item) => {
          const bobotPercent =
            totalBiayaKonstruksi > 0
              ? (item.biaya / totalBiayaKonstruksi) * 100
              : 0;
          const realisasiBiaya = Math.round((progress / 100) * item.biaya);
          const realisasiVolumeCalc =
            typeof item.volume === "number" && item.volume > 0
              ? Math.round(((progress / 100) * item.volume) * 100) / 100
              : item.realisasiVolume ?? "-";

          return {
            ...item,
            bobotPercent,
            realisasiBiaya,
            realisasiVolumeCalc,
          };
        });

        const totalRealisasiBiaya = Math.round(
          (progress / 100) * totalBiayaKonstruksi,
        );

        return {
          ...record,
          progresFisikKonstruksiPercent: progress,
          realisasiHaKonstruksi: realizedArea,
          biayaDigunakanKonstruksi: totalRealisasiBiaya,
          pekerjaanListWithBobot,
          photoClassification,
          linkedProject,
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

      if (activeTab === "rincian_sid") {
        if (
          photoFilter === "WITH_PHOTOS" &&
          item.photoClassification.totalPhotosCount === 0
        ) {
          return false;
        }
        if (
          photoFilter === "FULL_4_STAGES" &&
          (item.photoClassification.photos0.length === 0 ||
            item.photoClassification.photos50.length === 0 ||
            item.photoClassification.photos100.length === 0 ||
            item.photoClassification.photosPrasasti.length === 0)
        ) {
          return false;
        }
        if (
          photoFilter === "NO_PHOTOS" &&
          item.photoClassification.totalPhotosCount > 0
        ) {
          return false;
        }

        if (
          reportFilter === "HAS_DAILY" &&
          item.photoClassification.dailyReportsCount === 0
        ) {
          return false;
        }
        if (
          reportFilter === "HAS_WEEKLY" &&
          !item.photoClassification.latestWeeklySubmission
        ) {
          return false;
        }
      }

      return matchKecamatan && matchSearch;
    });
  }, [
    projectReportData,
    selectedKecamatan,
    searchQuery,
    activeTab,
    photoFilter,
    reportFilter,
  ]);

  const aggregates = useMemo(() => {
    let totalLuas = 0;
    let totalBiayaKonstruksi = 0;
    let totalBiayaDigunakanKonstruksi = 0;
    let totalRealisasiHaKonstruksi = 0;
    let totalBiayaOlahLahan = 0;
    let totalBiayaDigunakanOlahLahan = 0;
    let totalSp2d1 = 0;
    let totalSp2d2 = 0;
    let totalPhotosCount = 0;
    let poktanWithPhotosCount = 0;
    let totalDailyReportsCount = 0;

    filteredData.forEach((d) => {
      totalLuas += d.luasLahanHa;
      totalBiayaKonstruksi += d.totalBiayaKonstruksi;
      totalBiayaDigunakanKonstruksi += d.biayaDigunakanKonstruksi;
      totalRealisasiHaKonstruksi += d.realisasiHaKonstruksi;
      totalBiayaOlahLahan += d.totalBiayaOlahLahan;
      totalBiayaDigunakanOlahLahan += d.biayaDigunakanOlahLahan;
      totalSp2d1 += d.sp2d1Jumlah;
      totalSp2d2 += d.sp2d2Jumlah;
      totalPhotosCount += d.photoClassification.totalPhotosCount;
      if (d.photoClassification.totalPhotosCount > 0) {
        poktanWithPhotosCount += 1;
      }
      totalDailyReportsCount += d.photoClassification.dailyReportsCount;
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
      totalPhotosCount,
      poktanWithPhotosCount,
      totalDailyReportsCount,
      avgProgressPercent:
        totalBiayaKonstruksi > 0
          ? Math.round(
              (totalBiayaDigunakanKonstruksi / totalBiayaKonstruksi) * 1000,
            ) / 10
          : 0,
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
        "No,Kabupaten,Kecamatan,Desa,Nama Poktan,Luas Desain (Ha),Item Pekerjaan,Volume SID,Satuan,Biaya Rencana (Rp),Bobot Pekerjaan (%),Realisasi Volume,Satuan Realisasi,Realisasi Biaya (Rp),Progres Fisik (%),Jumlah Lap. Harian,Progres Mingguan Terkini,Tanggal Update Terakhir,URL Foto 0%,URL Foto 50%,URL Foto 100%,URL Foto Prasasti";
      csvRows = filteredData.flatMap((d) => {
        const photo0Url = d.photoClassification.photos0
          .map((x) => x.url)
          .join(" | ");
        const photo50Url = d.photoClassification.photos50
          .map((x) => x.url)
          .join(" | ");
        const photo100Url = d.photoClassification.photos100
          .map((x) => x.url)
          .join(" | ");
        const prasastiUrl = d.photoClassification.photosPrasasti
          .map((x) => x.url)
          .join(" | ");
        const weeklyText = d.photoClassification.latestWeeklySubmission
          ? `${d.photoClassification.latestWeeklySubmission.periodLabel} (${d.photoClassification.latestWeeklySubmission.actualProgress}%)`
          : "-";

        return d.pekerjaanListWithBobot.map((p) =>
          [
            d.no,
            `"${d.kabupaten}"`,
            `"${d.kecamatan}"`,
            `"${d.desa}"`,
            `"${d.poktan}"`,
            d.luasLahanHa,
            `"${p.namaPekerjaan}"`,
            `"${p.volume || ""}"`,
            `"${p.satuan || ""}"`,
            p.biaya,
            `"${p.bobotPercent.toFixed(2)}%"`,
            `"${p.realisasiVolumeCalc || ""}"`,
            `"${p.realisasiSatuan || p.satuan || ""}"`,
            p.realisasiBiaya,
            `"${d.progresFisikKonstruksiPercent.toFixed(1)}%"`,
            d.photoClassification.dailyReportsCount,
            `"${weeklyText}"`,
            `"${d.photoClassification.latestReportDate || "-"}"`,
            `"${photo0Url}"`,
            `"${photo50Url}"`,
            `"${photo100Url}"`,
            `"${prasastiUrl}"`,
          ].join(","),
        );
      });
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
      {activeTab === "rincian_sid" ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Total Poktan</p>
            <p className="type-kpi mt-1 text-foreground">
              {filteredData.length}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                / {projectReportData.length}
              </span>
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              {aggregates.totalLuas.toFixed(2)} Ha Desain
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Pagu Konstruksi</p>
            <p className="type-p2 mt-1 font-mono font-bold text-primary tabular-nums">
              Rp {(aggregates.totalBiayaKonstruksi / 1000000).toLocaleString("id-ID")} Jt
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Pagu Fisik 38 Poktan
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Realisasi Biaya</p>
            <p className="type-p2 mt-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              Rp {(aggregates.totalBiayaDigunakanKonstruksi / 1000000).toLocaleString("id-ID")} Jt
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              {aggregates.avgProgressPercent}% dari Pagu
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Rata-rata Progres</p>
            <p className="type-kpi mt-1 text-emerald-600 dark:text-emerald-400">
              {aggregates.avgProgressPercent}%
            </p>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, aggregates.avgProgressPercent)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Foto Lapangan</p>
            <p className="type-kpi mt-1 text-foreground">
              {aggregates.totalPhotosCount}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                Foto
              </span>
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              {aggregates.poktanWithPhotosCount} Poktan Terdata
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Laporan Masuk</p>
            <p className="type-kpi mt-1 text-foreground">
              {aggregates.totalDailyReportsCount}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                Lap. Harian
              </span>
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Sinkronisasi Live DB
            </p>
          </div>
        </div>
      ) : (
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
      )}

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

                    {/* TAB 2: Hasil SID & Dokumentasi Foto (Master Table 38 Poktan & Lightbox) */}
          {activeTab === "rincian_sid" && (
            <div className="space-y-4">
              {/* Toolbar & Filters for Hasil SID & Foto */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1">
                    <Button
                      type="button"
                      variant={
                        sidViewMode === "excel_table" ? "secondary" : "ghost"
                      }
                      size="xs"
                      onClick={() => setSidViewMode("excel_table")}
                      className="gap-1.5 font-medium"
                    >
                      <FileSpreadsheet className="size-3.5 text-primary" />
                      <span className="hidden sm:inline">
                        Tabel Master (Excel)
                      </span>
                      <span className="sm:hidden">Tabel Excel</span>
                    </Button>
                    <Button
                      type="button"
                      variant={
                        sidViewMode === "mobile_cards" ? "secondary" : "ghost"
                      }
                      size="xs"
                      onClick={() => setSidViewMode("mobile_cards")}
                      className="gap-1.5 font-medium"
                    >
                      <Layers className="size-3.5 text-primary" />
                      <span className="hidden sm:inline">Tampilan Kartu</span>
                      <span className="sm:hidden">Kartu</span>
                    </Button>
                  </div>

                  {sidViewMode === "excel_table" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowAllItems((v) => !v)}
                      className="gap-1.5 text-xs"
                    >
                      {showAllItems ? (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {showAllItems
                          ? "Ringkas (Sembunyikan Sub-Item)"
                          : "Buka Semua Rincian Item SID"}
                      </span>
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Photo Filter Dropdown */}
                  <Select
                    value={photoFilter}
                    onValueChange={(val) =>
                      setPhotoFilter(
                        val as
                          | "ALL"
                          | "WITH_PHOTOS"
                          | "FULL_4_STAGES"
                          | "NO_PHOTOS",
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <ImageIcon className="mr-1 size-3.5 text-muted-foreground" />
                      <SelectValue placeholder="Status Foto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Foto (38 Poktan)</SelectItem>
                      <SelectItem value="WITH_PHOTOS">Ada Foto Terunggah</SelectItem>
                      <SelectItem value="FULL_4_STAGES">Lengkap 4 Tahap</SelectItem>
                      <SelectItem value="NO_PHOTOS">Belum Ada Foto</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Report Filter Dropdown */}
                  <Select
                    value={reportFilter}
                    onValueChange={(val) =>
                      setReportFilter(val as "ALL" | "HAS_DAILY" | "HAS_WEEKLY")
                    }
                  >
                    <SelectTrigger className="h-8 w-[165px] text-xs">
                      <FileText className="mr-1 size-3.5 text-muted-foreground" />
                      <SelectValue placeholder="Status Laporan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Laporan</SelectItem>
                      <SelectItem value="HAS_DAILY">Ada Lap. Harian</SelectItem>
                      <SelectItem value="HAS_WEEKLY">Ada SP Mingguan</SelectItem>
                    </SelectContent>
                  </Select>

                  <Badge variant="outline" className="hidden text-xs sm:inline-flex">
                    {filteredData.length} Poktan · {aggregates.totalPhotosCount} Foto
                  </Badge>
                </div>
              </div>

              {/* TABLE VIEW (EXCEL FORMAT) */}
              {sidViewMode === "excel_table" && (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1550px]">
                      <TableHeader className="sticky top-0 z-10 bg-muted/70 text-xs">
                        {/* Tier 1 Header */}
                        <TableRow className="border-b border-border/80">
                          <TableHead
                            rowSpan={2}
                            className="w-12 border-r border-border/60 text-center font-bold text-foreground"
                          >
                            No
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="min-w-[130px] border-r border-border/60 font-bold text-foreground"
                          >
                            Kecamatan &amp; Desa
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="min-w-[170px] border-r border-border/60 font-bold text-foreground"
                          >
                            Kelompok Tani (Poktan)
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="w-24 border-r border-border/60 text-right font-bold text-foreground"
                          >
                            Luas Desain (Ha)
                          </TableHead>
                          <TableHead
                            colSpan={5}
                            className="border-r border-border/60 bg-primary/10 py-2 text-center font-bold text-primary"
                          >
                            HASIL SID (RENCANA DESAIN)
                          </TableHead>
                          <TableHead
                            colSpan={5}
                            className="border-r border-border/60 bg-emerald-500/10 py-2 text-center font-bold text-emerald-600 dark:text-emerald-400"
                          >
                            HASIL FISIK KONSTRUKSI &amp; LAPORAN
                          </TableHead>
                          <TableHead
                            colSpan={4}
                            className="bg-amber-500/10 py-2 text-center font-bold text-amber-600 dark:text-amber-400"
                          >
                            DOKUMENTASI FOTO LAPANGAN (4 TAHAP)
                          </TableHead>
                        </TableRow>

                        {/* Tier 2 Header */}
                        <TableRow className="border-b border-border/80 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {/* HASIL SID */}
                          <TableHead className="min-w-[160px] bg-primary/5">
                            Pekerjaan
                          </TableHead>
                          <TableHead className="w-20 bg-primary/5 text-right">
                            Vol SID
                          </TableHead>
                          <TableHead className="w-14 bg-primary/5 text-center">
                            Sat
                          </TableHead>
                          <TableHead className="w-28 bg-primary/5 text-right">
                            Biaya (Rp)
                          </TableHead>
                          <TableHead className="w-20 border-r border-border/60 bg-primary/5 text-right font-semibold text-primary">
                            Bobot (%)
                          </TableHead>

                          {/* HASIL FISIK KONSTRUKSI */}
                          <TableHead className="w-24 bg-emerald-500/5 text-right">
                            Realisasi Vol
                          </TableHead>
                          <TableHead className="w-14 bg-emerald-500/5 text-center">
                            Sat
                          </TableHead>
                          <TableHead className="w-28 bg-emerald-500/5 text-right">
                            Realisasi (Rp)
                          </TableHead>
                          <TableHead className="w-24 bg-emerald-500/5 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                            Progres Fisik
                          </TableHead>
                          <TableHead className="min-w-[140px] border-r border-border/60 bg-emerald-500/5">
                            Laporan Lapangan
                          </TableHead>

                          {/* FOTO DOKUMENTASI */}
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Foto 0%
                          </TableHead>
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Foto 50%
                          </TableHead>
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Foto 100%
                          </TableHead>
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Prasasti
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {filteredData.map((p) => {
                          const isExpanded =
                            showAllItems || expandedPoktanNos.has(p.no);
                          const photos = p.photoClassification;

                          return (
                            <Fragment key={`poktan-row-${p.no}`}>
                              {/* Main Poktan Summary Row */}
                              <TableRow className="border-t-2 border-border/80 bg-muted/20 font-medium transition hover:bg-muted/30">
                                <TableCell className="border-r border-border/60 text-center font-mono text-xs font-bold text-foreground">
                                  {p.no}
                                </TableCell>
                                <TableCell className="border-r border-border/60">
                                  <span className="block text-xs font-bold text-foreground">
                                    {p.kecamatan}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    Desa {p.desa}
                                  </span>
                                </TableCell>
                                <TableCell className="border-r border-border/60">
                                  <div className="flex items-center gap-1.5">
                                    {!showAllItems && (
                                      <button
                                        type="button"
                                        onClick={() => togglePoktan(p.no)}
                                        className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                        aria-label={
                                          isExpanded
                                            ? "Tutup rincian item"
                                            : "Buka rincian item"
                                        }
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="size-3.5" />
                                        ) : (
                                          <ChevronRight className="size-3.5" />
                                        )}
                                      </button>
                                    )}
                                    <div>
                                      <span className="block text-xs font-bold text-foreground">
                                        {p.poktan}
                                      </span>
                                      <span className="font-mono text-[10px] text-muted-foreground">
                                        SPK: {p.nomorSpk || "-"}
                                      </span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="border-r border-border/60 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                                  {p.luasLahanHa.toFixed(2)} Ha
                                </TableCell>

                                {/* HASIL SID Summary */}
                                <TableCell className="bg-primary/5 text-xs font-semibold text-primary">
                                  Total Konstruksi ({p.pekerjaanListWithBobot.length} Item)
                                </TableCell>
                                <TableCell className="bg-primary/5 text-right font-mono text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-primary/5 text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-primary/5 text-right font-mono text-xs font-bold tabular-nums text-primary">
                                  Rp {p.totalBiayaKonstruksi.toLocaleString("id-ID")}
                                </TableCell>
                                <TableCell className="border-r border-border/60 bg-primary/5 text-right font-mono text-xs font-bold tabular-nums text-primary">
                                  100.0%
                                </TableCell>

                                {/* HASIL FISIK KONSTRUKSI Summary */}
                                <TableCell className="bg-emerald-500/5 text-right font-mono text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-emerald-500/5 text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-emerald-500/5 text-right font-mono text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                  Rp {p.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                                </TableCell>
                                <TableCell className="bg-emerald-500/5 text-center">
                                  <Badge
                                    variant={
                                      p.progresFisikKonstruksiPercent >= 100
                                        ? "success"
                                        : p.progresFisikKonstruksiPercent > 0
                                          ? "default"
                                          : "secondary"
                                    }
                                    className="font-mono text-[11px] font-bold"
                                  >
                                    {p.progresFisikKonstruksiPercent.toFixed(1)}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="border-r border-border/60 bg-emerald-500/5 text-xs">
                                  <div className="space-y-0.5">
                                    <Badge
                                      variant={
                                        photos.dailyReportsCount > 0
                                          ? "outline"
                                          : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {photos.dailyReportsCount > 0
                                        ? `${photos.dailyReportsCount} Lap. Harian`
                                        : "Belum Ada Lap."}
                                    </Badge>
                                    {photos.latestWeeklySubmission && (
                                      <div className="text-[10px] font-medium text-muted-foreground">
                                        {photos.latestWeeklySubmission.periodLabel}:{" "}
                                        <span className="font-mono font-bold text-foreground">
                                          {photos.latestWeeklySubmission.actualProgress}%
                                        </span>
                                      </div>
                                    )}
                                    {photos.latestReportDate && (
                                      <div className="text-[9px] text-muted-foreground">
                                        Update: {photos.latestReportDate}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>

                                {/* 4 FOTO CELLS */}
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photos0}
                                    stageName="0%"
                                    stageTitle="Foto Kondisi 0%"
                                    onOpenLightbox={handleOpenLightbox}
                                  />
                                </TableCell>
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photos50}
                                    stageName="50%"
                                    stageTitle="Foto Kondisi 50%"
                                    onOpenLightbox={handleOpenLightbox}
                                  />
                                </TableCell>
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photos100}
                                    stageName="100%"
                                    stageTitle="Foto Kondisi 100%"
                                    onOpenLightbox={handleOpenLightbox}
                                  />
                                </TableCell>
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photosPrasasti}
                                    stageName="Prasasti"
                                    stageTitle="Foto Batu Prasasti"
                                    onOpenLightbox={handleOpenLightbox}
                                  />
                                </TableCell>
                              </TableRow>

                              {/* Sub-Rows for each Pekerjaan Item */}
                              {isExpanded &&
                                p.pekerjaanListWithBobot.map((item, idx) => (
                                  <TableRow
                                    key={`item-${p.no}-${item.namaPekerjaan}-${idx}`}
                                    className="border-b border-border/40 text-xs transition hover:bg-muted/10"
                                  >
                                    <TableCell className="border-r border-border/60 text-center font-mono text-[10px] text-muted-foreground/60">
                                      {p.no}.{idx + 1}
                                    </TableCell>
                                    <TableCell
                                      colSpan={2}
                                      className="border-r border-border/60 pl-6"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-muted-foreground/60">
                                          ↳
                                        </span>
                                        <span className="font-medium text-foreground">
                                          {item.namaPekerjaan}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="border-r border-border/60 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                      —
                                    </TableCell>

                                    {/* HASIL SID Item Columns */}
                                    <TableCell className="bg-primary/2 text-xs text-muted-foreground">
                                      {item.namaPekerjaan}
                                    </TableCell>
                                    <TableCell className="bg-primary/2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                      {item.volume !== null &&
                                      item.volume !== undefined
                                        ? String(item.volume)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="bg-primary/2 text-center text-xs text-muted-foreground">
                                      {item.satuan || "—"}
                                    </TableCell>
                                    <TableCell className="bg-primary/2 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                                      {item.biaya > 0
                                        ? item.biaya.toLocaleString("id-ID")
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="border-r border-border/60 bg-primary/2 text-right font-mono text-xs font-bold tabular-nums text-primary">
                                      {item.bobotPercent.toFixed(2)}%
                                    </TableCell>

                                    {/* HASIL FISIK KONSTRUKSI Item Columns */}
                                    <TableCell className="bg-emerald-500/2 text-right font-mono text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                                      {item.realisasiVolumeCalc !== null &&
                                      item.realisasiVolumeCalc !== undefined
                                        ? String(item.realisasiVolumeCalc)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="bg-emerald-500/2 text-center text-xs text-muted-foreground">
                                      {item.realisasiSatuan || item.satuan || "—"}
                                    </TableCell>
                                    <TableCell className="bg-emerald-500/2 text-right font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                      {item.realisasiBiaya > 0
                                        ? item.realisasiBiaya.toLocaleString("id-ID")
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="bg-emerald-500/2 text-center text-xs font-medium text-emerald-600">
                                      {p.progresFisikKonstruksiPercent.toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="border-r border-border/60 bg-emerald-500/2 text-[11px] text-muted-foreground">
                                      {item.biaya > 0
                                        ? p.progresFisikKonstruksiPercent >= 100
                                          ? "100% Selesai"
                                          : p.progresFisikKonstruksiPercent > 0
                                            ? "Pelaksanaan"
                                            : "Belum Mulai"
                                        : "Opsional"}
                                    </TableCell>

                                    {/* Empty Foto Slots for sub-row */}
                                    <TableCell
                                      colSpan={4}
                                      className="bg-muted/5 py-1 text-center text-[10px] italic text-muted-foreground/40"
                                    >
                                      ↳ Foto di baris Kelompok Tani
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </Fragment>
                          );
                        })}
                      </TableBody>

                      <TableFooter className="bg-muted/80 text-xs font-bold">
                        <TableRow>
                          <TableCell colSpan={3} className="text-center font-bold">
                            TOTAL KESELURUHAN ({filteredData.length} KELOMPOK TANI)
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {aggregates.totalLuas.toFixed(2)} Ha
                          </TableCell>
                          <TableCell colSpan={3} className="text-right text-primary">
                            Total Anggaran SID:
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums text-primary">
                            Rp {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell className="border-r border-border/60 text-right font-mono font-bold tabular-nums text-primary">
                            100.0%
                          </TableCell>
                          <TableCell colSpan={2} className="text-right text-emerald-600">
                            Total Realisasi Fisik:
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                            Rp{" "}
                            {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString(
                              "id-ID",
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-emerald-600">
                            {aggregates.avgProgressPercent}%
                          </TableCell>
                          <TableCell className="border-r border-border/60 text-xs text-muted-foreground">
                            {aggregates.totalDailyReportsCount} Lap. Harian
                          </TableCell>
                          <TableCell
                            colSpan={4}
                            className="text-center font-bold text-amber-600"
                          >
                            {aggregates.totalPhotosCount} Foto ({aggregates.poktanWithPhotosCount} Poktan)
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
              )}

              {/* MOBILE CARDS VIEW */}
              {sidViewMode === "mobile_cards" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {filteredData.map((p) => {
                      const photos = p.photoClassification;
                      const isExpanded = expandedPoktanNos.has(p.no);

                      return (
                        <div
                          key={`card-poktan-${p.no}`}
                          className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px]">
                                  #{p.no} · {p.kecamatan}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                  Desa {p.desa}
                                </span>
                              </div>
                              <h4 className="type-h3 mt-1 font-bold text-foreground">
                                {p.poktan}
                              </h4>
                              <p className="font-mono text-[11px] text-muted-foreground">
                                SPK: {p.nomorSpk || "-"}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge
                                variant={
                                  p.progresFisikKonstruksiPercent >= 100
                                    ? "success"
                                    : p.progresFisikKonstruksiPercent > 0
                                      ? "default"
                                      : "secondary"
                                }
                                className="font-mono text-xs font-bold"
                              >
                                {p.progresFisikKonstruksiPercent.toFixed(1)}% Fisik
                              </Badge>
                              <span className="mt-1 block text-xs font-medium text-foreground">
                                {p.luasLahanHa.toFixed(2)} Ha Desain
                              </span>
                            </div>
                          </div>

                          {/* Financial & Progress Info */}
                          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
                            <div>
                              <span className="block text-[10px] text-muted-foreground">
                                Pagu Konstruksi
                              </span>
                              <span className="font-mono font-bold text-primary">
                                Rp {p.totalBiayaKonstruksi.toLocaleString("id-ID")}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground">
                                Realisasi Biaya
                              </span>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                Rp {p.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                              </span>
                            </div>
                          </div>

                          {/* Photo Documentation Grid (4 Stages) */}
                          <div>
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1 font-semibold text-foreground">
                                <ImageIcon className="size-3.5 text-amber-500" />
                                Dokumentasi Foto Lapangan (4 Tahap)
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {photos.totalPhotosCount} Foto
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              <PhotoThumbnailSlot
                                photos={photos.photos0}
                                stageName="0%"
                                stageTitle="Foto 0%"
                                onOpenLightbox={handleOpenLightbox}
                              />
                              <PhotoThumbnailSlot
                                photos={photos.photos50}
                                stageName="50%"
                                stageTitle="Foto 50%"
                                onOpenLightbox={handleOpenLightbox}
                              />
                              <PhotoThumbnailSlot
                                photos={photos.photos100}
                                stageName="100%"
                                stageTitle="Foto 100%"
                                onOpenLightbox={handleOpenLightbox}
                              />
                              <PhotoThumbnailSlot
                                photos={photos.photosPrasasti}
                                stageName="Prasasti"
                                stageTitle="Prasasti"
                                onOpenLightbox={handleOpenLightbox}
                              />
                            </div>
                          </div>

                          {/* Collapsible Work Items Accordion */}
                          <div className="border-t border-border/60 pt-2">
                            <button
                              type="button"
                              onClick={() => togglePoktan(p.no)}
                              className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline"
                            >
                              <span>
                                {isExpanded ? "Tutup" : "Lihat"} Rincian {p.pekerjaanListWithBobot.length} Item SID &amp; Bobot (%)
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-2.5 text-xs">
                                {p.pekerjaanListWithBobot.map((item, idx) => (
                                  <div
                                    key={`card-item-${p.no}-${idx}`}
                                    className="flex items-center justify-between border-b border-border/40 pb-1.5 last:border-0 last:pb-0"
                                  >
                                    <div>
                                      <span className="block font-medium text-foreground">
                                        {item.namaPekerjaan}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        Vol: {item.volume ?? "-"} {item.satuan} · Real:{" "}
                                        {item.realisasiVolumeCalc}{" "}
                                        {item.realisasiSatuan || item.satuan}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="block font-mono font-bold text-primary">
                                        {item.bobotPercent.toFixed(2)}%
                                      </span>
                                      <span className="font-mono text-[10px] text-muted-foreground">
                                        Rp{" "}
                                        {item.biaya > 0
                                          ? item.biaya.toLocaleString("id-ID")
                                          : "-"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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

      {/* In-App Interactive Lightbox Modal */}
      {lightboxData && (
        <GlobalModal
          isOpen={Boolean(lightboxData)}
          onClose={() => setLightboxData(null)}
          title={
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              <span className="type-h3">{lightboxData.photo.stageLabel}</span>
            </div>
          }
          description={`${lightboxData.photo.poktan} · Desa ${lightboxData.photo.desa}, Kec. ${lightboxData.photo.kecamatan} · Progres ${lightboxData.photo.progress.toFixed(1)}%`}
          className="max-w-3xl"
          footer={
            <div className="flex w-full items-center justify-between">
              <a
                href={lightboxData.photo.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Download className="size-3.5" />
                Unduh Foto Asli
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLightboxData(null)}
              >
                Tutup
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Main Photo Frame */}
            <div className="relative flex max-h-[60vh] min-h-[260px] w-full items-center justify-center overflow-hidden rounded-xl bg-black/90 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxData.photo.url}
                alt={`${lightboxData.photo.stageLabel} - ${lightboxData.photo.poktan}`}
                className="max-h-[58vh] max-w-full rounded-lg object-contain shadow-2xl transition-all"
              />
              {lightboxData.photoList.length > 1 && (
                <>
                  <button
                    type="button"
                    disabled={lightboxData.currentIndex <= 0}
                    onClick={() => {
                      const newIdx = lightboxData.currentIndex - 1;
                      if (newIdx >= 0) {
                        setLightboxData({
                          ...lightboxData,
                          currentIndex: newIdx,
                          photo: lightboxData.photoList[newIdx],
                        });
                      }
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white hover:bg-black disabled:opacity-20 transition"
                    aria-label="Foto Sebelumnya"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    disabled={
                      lightboxData.currentIndex >=
                      lightboxData.photoList.length - 1
                    }
                    onClick={() => {
                      const newIdx = lightboxData.currentIndex + 1;
                      if (newIdx < lightboxData.photoList.length) {
                        setLightboxData({
                          ...lightboxData,
                          currentIndex: newIdx,
                          photo: lightboxData.photoList[newIdx],
                        });
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white hover:bg-black disabled:opacity-20 transition"
                    aria-label="Foto Selanjutnya"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
              <div className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                {lightboxData.currentIndex + 1} / {lightboxData.photoList.length}
              </div>
            </div>

            {/* Detailed Metadata Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <div>
                <span className="block text-[10px] text-muted-foreground">
                  Kelompok Tani &amp; Wilayah
                </span>
                <span className="text-sm font-bold text-foreground">
                  {lightboxData.photo.poktan}
                </span>
                <p className="mt-0.5 text-muted-foreground">
                  Kec. {lightboxData.photo.kecamatan}, Desa {lightboxData.photo.desa}
                </p>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">
                  Tahapan Dokumentasi
                </span>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {lightboxData.photo.stageLabel}
                  </Badge>
                  <span className="font-mono font-bold text-emerald-600">
                    {lightboxData.photo.progress.toFixed(1)}% Fisik
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Laporan Tanggal: {lightboxData.photo.reportDate}
                </p>
              </div>
              {(lightboxData.photo.workSummary || lightboxData.photo.notes) && (
                <div className="sm:col-span-2 border-t border-border/60 pt-2">
                  <span className="block text-[10px] font-medium text-muted-foreground">
                    Uraian Pekerjaan / Catatan Lapangan:
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap font-medium text-foreground">
                    {lightboxData.photo.workSummary || lightboxData.photo.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Thumbnail carousel strip */}
            {lightboxData.photoList.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
                {lightboxData.photoList.map((item, idx) => (
                  <button
                    key={`modal-thumb-${item.url}-${idx}`}
                    type="button"
                    onClick={() =>
                      setLightboxData({
                        ...lightboxData,
                        currentIndex: idx,
                        photo: item,
                      })
                    }
                    className={cn(
                      "relative size-14 shrink-0 overflow-hidden rounded-md border transition-all",
                      idx === lightboxData.currentIndex
                        ? "border-primary ring-2 ring-primary scale-105"
                        : "border-border/60 opacity-60 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`Thumb ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] font-bold text-white text-center">
                      {item.stage}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </GlobalModal>
      )}
    </div>
  );
}
