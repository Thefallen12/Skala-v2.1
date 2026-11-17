"use client";

import React, { useState, useTransition, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { ApexOptions } from "apexcharts";
import {
  Calculator,
  AlertTriangle,
  BookmarkCheck,
  Calendar,
  CalendarDays,
  Camera,
  CheckCircle2,
  Sparkles,
  ClipboardList,
  Coins,
  Copy,
  Download,
  Ellipsis,
  FileText,
  Globe,
  HardHat,
  ImageIcon,
  LayoutTemplate,
  MapPin,
  MapPinned,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  User,
  WalletCards,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ProjectStatus, UserRole } from "@prisma/client";
import {
  buildProjectSCurveSeries,
  calculateWeightedProjectProgress,
} from "@/lib/project-progress";
import { photoDownloadHref, withLocalPhotoPreview } from "@/lib/photo-urls";
import {
  countOfflineDailyReports,
  flushOfflineDailyReports,
  registerOfflineDailyReportAutoSync,
} from "@/lib/offline-daily-report-queue";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { GlobalModal } from "@/components/ui/global-modal";
import ProjectFormModal from "@/app/components/project/ProjectFormModal";
import type { ProjectWorkstationMasterData } from "./ProjectWorkstationMaster";
import ProjectActionButton from "./ProjectActionButton";
import type { FieldTeamOption } from "@/app/(DashboardLayout)/types/project";
import {
  deleteProject,
  duplicateProject,
  updateProjectKanbanStatus,
} from "@/app/actions/project";
import DailyProgressModal, {
  isRunningProjectStatus,
  submitOfflineDailyReportAction,
} from "./DailyProgressModal";
import EditRabModal from "./EditRabModal";
import RapManagementModal from "./RapManagementModal";
import ProjectScheduleGantt, { type ScheduleMilestoneItem } from "./ProjectScheduleGantt";
import OpnameProgressModal, { type OpnameWorkPointItem } from "./OpnameProgressModal";
import MaterialPlanModal, { type MaterialPlanRow, type StockItemOption } from "./MaterialPlanModal";
import AnalisaMaterialModal, { type MaterialAnalysisItem } from "./AnalisaMaterialModal";
import { getStandardAnalysisForWorkItem } from "@/lib/drt-rab-parser";
import UploadDocumentModal from "./UploadDocumentModal";
import CoreTeamModal from "./CoreTeamModal";
import ProjectFundRecapTab, {
  classifyTicketFundCategory,
} from "./ProjectFundRecapTab";
import { ProjectPrintRabView, ProjectPrintProgressView } from "./ProjectPrintViews";
import ProjectMaterialDeliveriesCard from "./ProjectMaterialDeliveriesCard";
import type {
  ContractTicketDeliveryOption,
  MaterialContractRow,
  MaterialDeliveryRow,
} from "@/lib/material-contracts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function currency(val: number | string | null | undefined): string {
  const num = typeof val === "string" ? parseFloat(val) : Number(val || 0);
  if (isNaN(num)) return "Rp 0";
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Belum diisi";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const KANBAN_STAGES: Array<{
  key: "tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda";
  label: string;
  badgeClass: string;
}> = [
  { key: "tender", label: "Tender", badgeClass: "bg-slate-500/10 text-slate-700 border-slate-300 dark:text-slate-300" },
  { key: "perencanaan", label: "Perencanaan", badgeClass: "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-300" },
  { key: "berjalan", label: "Berjalan", badgeClass: "bg-blue-500/10 text-blue-700 border-blue-300 dark:text-blue-300" },
  { key: "hampir_selesai", label: "Hampir Selesai", badgeClass: "bg-purple-500/10 text-purple-700 border-purple-300 dark:text-purple-300" },
  { key: "selesai", label: "Selesai", badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-300" },
  { key: "ditunda", label: "Ditunda & batal", badgeClass: "bg-rose-500/10 text-rose-700 border-rose-300 dark:text-rose-300" },
];

function getKanbanKeyFromProject(status: ProjectStatus, progress: number): "tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda" {
  if (status === ProjectStatus.PENDING_SETUP) return "tender";
  if (status === ProjectStatus.PENDING || status === ProjectStatus.PLANNED) return "perencanaan";
  if (status === ProjectStatus.DONE || status === ProjectStatus.COMPLETED || progress >= 100) return "selesai";
  if (status === ProjectStatus.TERHAMBAT || status === ProjectStatus.ON_HOLD) return "ditunda";
  if (progress >= 85 && progress < 100) return "hampir_selesai";
  return "berjalan";
}

export default function ProjectDetailView({
  project,
  fieldTeamUsers = [],
  stockItems = [],
  currentUserId,
  currentUserRole,
  initialMilestones = [],
  materialContracts = [],
  materialDeliveries = [],
  contractTickets = [],
}: {
  project: ProjectWorkstationMasterData;
  fieldTeamUsers?: FieldTeamOption[];
  stockItems?: StockItemOption[];
  currentUserId?: string;
  currentUserRole?: UserRole;
  initialMilestones?: ScheduleMilestoneItem[];
  materialContracts?: MaterialContractRow[];
  materialDeliveries?: MaterialDeliveryRow[];
  contractTickets?: ContractTicketDeliveryOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const printParam = searchParams?.get("print");
  const actionParam = searchParams?.get("action");
  const [printDocView, setPrintDocView] = useState<"none" | "rab" | "progres">(() => {
    if (printParam === "rab") return "rab";
    if (printParam === "progres") return "progres";
    return "none";
  });
  const [activeTab, setActiveTab] = useState(() =>
    actionParam === "daily-report" ? "lapangan" : "ringkasan",
  );
  const [showBanner, setShowBanner] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isClientPortalOpen, setIsClientPortalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDailyProgressOpen, setIsDailyProgressOpen] = useState(
    () => actionParam === "daily-report",
  );
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    title: string;
    kind: "image" | "document";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modals for Tab RAB & Biaya
  const [isEditRabModalOpen, setIsEditRabModalOpen] = useState(false);
  const [isOpnameModalOpen, setIsOpnameModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isAnalisaModalOpen, setIsAnalisaModalOpen] = useState(false);
  const [isRapModalOpen, setIsRapModalOpen] = useState(false);
  const [selectedAnalisaItem, setSelectedAnalisaItem] = useState<{
    id?: string;
    title: string;
    volume: number;
    unit: string;
    analysis?: MaterialAnalysisItem[];
  } | null>(null);
  const [itemAnalysesMap, setItemAnalysesMap] = useState<Record<string, MaterialAnalysisItem[]>>({});
  const [selectedWorkPointForMaterial, setSelectedWorkPointForMaterial] = useState<string | undefined>();
  const [isUploadDocModalOpen, setIsUploadDocModalOpen] = useState(false);
  const [isCoreTeamModalOpen, setIsCoreTeamModalOpen] = useState(false);
  const [materialPlanList, setMaterialPlanList] = useState<MaterialPlanRow[]>([]);

  const canManageProject =
    currentUserRole === UserRole.ADMINISTRATIONS ||
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR;
  const canViewFinancials =
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR ||
    currentUserRole === UserRole.ADMINISTRATIONS ||
    currentUserRole === UserRole.FINANCE ||
    currentUserRole === UserRole.LOGISTICS;
  const canSubmitDailyProgress =
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR ||
    currentUserRole === UserRole.ADMINISTRATIONS ||
    currentUserRole === UserRole.KOORDINATOR ||
    currentUserRole === UserRole.FIELD_TEAM;
  const canAccessMaterialPlanning =
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR ||
    currentUserRole === UserRole.ADMINISTRATIONS ||
    currentUserRole === UserRole.LOGISTICS;
  const canEditProjectRab =
    canManageProject ||
    ((currentUserRole === UserRole.FIELD_TEAM ||
      currentUserRole === UserRole.KOORDINATOR) &&
      Boolean(currentUserId) &&
      project.fieldPicId === currentUserId);

  const [currentKanbanKey, setCurrentKanbanKey] = useState<"tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda">(() =>
    getKanbanKeyFromProject(project.status, project.progress)
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [localWorkPoints, setLocalWorkPoints] = useState(project.workPoints);
  const [prevWorkPoints, setPrevWorkPoints] = useState(project.workPoints);
  const derivedKanbanKey = getKanbanKeyFromProject(project.status, project.progress);
  const [prevDerivedKanbanKey, setPrevDerivedKanbanKey] = useState(derivedKanbanKey);
  const [mountNowMs] = useState(() => Date.now());

  if (prevWorkPoints !== project.workPoints) {
    setPrevWorkPoints(project.workPoints);
    setLocalWorkPoints(project.workPoints);
  }

  if (prevDerivedKanbanKey !== derivedKanbanKey) {
    setPrevDerivedKanbanKey(derivedKanbanKey);
    setCurrentKanbanKey(derivedKanbanKey);
  }

  const refreshQueueCount = useCallback(async () => {
    const count = await countOfflineDailyReports();
    setOfflineQueueCount(count);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void countOfflineDailyReports().then((count) => {
      if (!cancelled) setOfflineQueueCount(count);
    });
    const unregister = registerOfflineDailyReportAutoSync(
      submitOfflineDailyReportAction,
      {
        onSynced: (result) => {
          void refreshQueueCount();
          if (result.syncedCount > 0) {
            toast.success(
              `${result.syncedCount} laporan harian antrean berhasil disinkronkan.`,
            );
            requestNotificationFeedRefresh();
            router.refresh();
          }
        },
      },
    );
    return () => {
      cancelled = true;
      unregister();
    };
  }, [refreshQueueCount, router]);

  const handleFlushOfflineQueue = async () => {
    setIsFlushingQueue(true);
    try {
      const result = await flushOfflineDailyReports(submitOfflineDailyReportAction);
      await refreshQueueCount();
      if (result.skippedOffline) {
        toast.warning("Perangkat masih offline. Antrean akan dikirim otomatis saat sinyal stabil.");
      } else if (result.syncedCount > 0) {
        toast.success(
          `${result.syncedCount} laporan harian berhasil dikirim.`,
        );
        requestNotificationFeedRefresh();
        router.refresh();
      } else if (result.failedCount > 0 || result.remainingCount > 0) {
        toast.warning(
          result.results.find((r) => !r.success)?.message ||
            "Antrean belum bisa dikirim. Pastikan koneksi internet stabil.",
        );
      } else {
        toast.info("Tidak ada laporan yang menunggu antrean.");
      }
    } finally {
      setIsFlushingQueue(false);
    }
  };

  const openMediaLightbox = (url: string, title: string) => {
    const isPdf = /\.pdf(?:[?#]|$)/i.test(url);
    setPreviewMedia({
      url: withLocalPhotoPreview(url),
      title,
      kind: isPdf ? "document" : "image",
    });
  };

  const handleStageChange = async (newKey: "tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda") => {
    const previousKey = currentKanbanKey;
    setCurrentKanbanKey(newKey);
    setIsUpdatingStatus(true);
    try {
      const res = await updateProjectKanbanStatus(project.id, newKey);
      if (res.success) {
        toast.success("Tahap proyek diperbarui.");
        router.refresh();
      } else {
        setCurrentKanbanKey(previousKey);
        toast.error(res.message || "Gagal mengubah tahap proyek.");
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // S-Curve & Progress calculations
  const { plannedToday, deviation, healthStatus, healthBadgeColor, sCurveSeries, sCurveOptions } = useMemo(() => {
    const nowMs = mountNowMs;
    const plannedStartDates = localWorkPoints
      .map((point) => point.plannedStartDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    const targetDates = localWorkPoints
      .map((point) => point.targetDate)
      .filter((date): date is string => Boolean(date))
      .sort();
    const reportDates = (project.reports ?? [])
      .map((report) => report.reportDate)
      .filter(Boolean)
      .sort();

    const effectiveStartDate =
      project.startDate ??
      plannedStartDates[0] ??
      reportDates[0] ??
      new Date(nowMs - 14 * 86400000).toISOString().slice(0, 10);
    const startMs = new Date(`${effectiveStartDate}T00:00:00.000Z`).getTime();
    const fallbackEnd = new Date(startMs + 84 * 86400000)
      .toISOString()
      .slice(0, 10);
    const effectiveEndDate =
      project.endDate ?? targetDates.at(-1) ?? fallbackEnd;

    const progressByDate = new Map<string, Map<string, number>>();
    for (const point of localWorkPoints) {
      for (const report of point.progressReports ?? []) {
        const progressAtDate =
          progressByDate.get(report.reportDate) ?? new Map();
        progressAtDate.set(point.id, report.progress);
        progressByDate.set(report.reportDate, progressAtDate);
      }
    }
    const latestPointProgress = new Map<string, number>();
    for (const point of localWorkPoints) latestPointProgress.set(point.id, 0);

    const weightedFromPoints = [...progressByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, progressAtDate]) => {
        for (const [pointId, progress] of progressAtDate) {
          latestPointProgress.set(pointId, progress);
        }
        return {
          reportDate: date,
          progress: calculateWeightedProjectProgress(
            localWorkPoints.map((pt) => ({
              progress: latestPointProgress.get(pt.id) ?? 0,
              proposedTotalWage: pt.proposedTotalWage,
              approvedTotalWage: pt.approvedTotalWage,
            })),
          ),
        };
      });

    const directReports = (project.reports ?? [])
      .filter(
        (r): r is typeof r & { progress: number } =>
          r.progress !== null && r.progress !== undefined,
      )
      .map((r) => ({
        reportDate: r.reportDate,
        progress: Number(r.progress),
      }));

    const hasWpProgress = localWorkPoints.some((wp) => (wp.progress ?? 0) > 0);
    const effectiveCurrentProgress = hasWpProgress
      ? calculateWeightedProjectProgress(localWorkPoints)
      : Number(project.progress ?? 0);

    const built = buildProjectSCurveSeries({
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      currentProgress: effectiveCurrentProgress,
      dailyReports: [...weightedFromPoints, ...directReports],
      nowMs,
    });

    const planToday = built.plannedToday ?? 0;
    const actual = Number(effectiveCurrentProgress.toFixed(1));
    const dev = Number((actual - planToday).toFixed(1));

    let health = "Sehat";
    let color = "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    if (dev < -25) {
      health = "Kritis";
      color = "bg-rose-500/10 text-rose-600 border-rose-500/30";
    } else if (dev < -10) {
      health = "Perhatian";
      color = "bg-amber-500/10 text-amber-600 border-amber-500/30";
    }

    const series = [
      {
        name: "Aktual",
        data: built.actual,
      },
      {
        name: "Rencana",
        data: built.planned,
      },
    ];

    const options: ApexOptions = {
      chart: {
        type: "line",
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: "inherit",
        foreColor: "#94a3b8",
      },
      colors: ["#f97316", "#64748b"],
      stroke: {
        curve: "smooth",
        width: [3, 2.5],
        dashArray: [0, 4],
      },
      markers: {
        size: [4, 3],
        strokeWidth: 2,
        hover: { size: 6 },
      },
      grid: {
        borderColor: "rgba(148, 163, 184, 0.16)",
        strokeDashArray: 3,
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: true } },
      },
      legend: { show: false },
      xaxis: {
        type: "datetime",
        labels: {
          datetimeUTC: false,
          format: "dd MMM yyyy",
          style: { colors: "#94a3b8", fontSize: "11px" },
        },
      },
      yaxis: {
        min: 0,
        max: 100,
        tickAmount: 4,
        labels: {
          style: { colors: "#94a3b8", fontSize: "11px" },
          formatter: (v) => (typeof v === "number" ? Math.round(v) + "%" : "0%"),
        },
      },
      tooltip: {
        theme: "dark",
        x: { format: "dd MMM yyyy" },
        y: {
          formatter: (v) => (typeof v === "number" ? v.toFixed(1) + "%" : "0%"),
        },
      },
    };

    return {
      plannedToday: planToday,
      deviation: dev,
      healthStatus: health,
      healthBadgeColor: color,
      sCurveSeries: series,
      sCurveOptions: options,
    };
  }, [
    project.startDate,
    project.endDate,
    project.progress,
    project.reports,
    localWorkPoints,
    mountNowMs,
  ]);

  // Work Points parsed into grouped RAB table
  const savedRapMaterials = project.rapMaterialPlans ?? [];
  const savedRapLaborPlans = project.rapLaborPlans ?? [];
  const savedRapMaterialTotal = savedRapMaterials.reduce(
    (sum, plan) => sum + Number(plan.totalPrice),
    0,
  );
  const savedRapLaborTotal = savedRapLaborPlans.reduce((sum, plan) => {
    const savedRate = Number(plan.boronganRate);
    const savedTotal = Number(plan.totalBorongan);
    const unitPrice =
      savedRate > 0 ? savedRate : plan.volume > 0 ? savedTotal / plan.volume : 0;
    return sum + Math.round(plan.volume * unitPrice);
  }, 0);
  const hasSavedRapPlans =
    savedRapMaterials.length > 0 || savedRapLaborPlans.length > 0;
  const savedRapTotal = savedRapMaterialTotal + savedRapLaborTotal;

  const { rabGroups, totalRabNumber, totalRapNumber, opnameWorkPointItems } = useMemo(() => {
    const points = project.workPoints;

    // If project has no points yet in DB, return empty so empty state box is displayed
    if (points.length === 0) {
      return {
        rabGroups: [],
        totalRabNumber: 0,
        totalRapNumber: hasSavedRapPlans ? savedRapTotal : 0,
        opnameWorkPointItems: [],
      };
    }

    const computedTotal = points.reduce(
      (sum, p) => sum + Number(p.approvedTotalWage ?? p.proposedTotalWage ?? 0),
      0,
    );
    const paguNum = computedTotal > 0 ? computedTotal : (Number(project.pagu) > 0 ? Number(project.pagu) : 0);
    const rapNum = hasSavedRapPlans
      ? savedRapTotal
      : Number(project.budget) > 0 && Math.abs(Number(project.budget) - paguNum) < paguNum * 0.5
        ? Number(project.budget)
        : Math.round(paguNum * 0.758);

    const groupsMap = new Map<string, typeof points>();
    for (const point of points) {
      const sec = point.location || "Pekerjaan Utama";
      const arr = groupsMap.get(sec) ?? [];
      arr.push(point);
      groupsMap.set(sec, arr);
    }

    const groups = Array.from(groupsMap.entries()).map(([sectionName, items]) => ({
      sectionName,
      items: items.map((pt) => {
        const total = Number(pt.approvedTotalWage ?? pt.proposedTotalWage ?? 0);
        const bobot = paguNum > 0 ? (total / paguNum) * 100 : 0;
        const volNum = pt.proposedVolume ? Math.max(0, Number(pt.proposedVolume)) : 1;
        const vol = volNum.toString();
        const unit = pt.proposedUnit || "paket";
        const comp = pt.completedVolume ?? 0;

        const titleParts = pt.title.split(" ");
        const maybeCode = titleParts[0]?.includes(".") ? titleParts[0] : "";
        const cleanTitle = maybeCode ? titleParts.slice(1).join(" ") : pt.title;

        const unitPrice = pt.proposedUnitPrice && Number(pt.proposedUnitPrice) > 0
          ? Math.round(Number(pt.proposedUnitPrice))
          : (volNum > 0 ? Math.round(total / volNum) : total);

        return {
          id: pt.id,
          code: maybeCode || "•",
          title: cleanTitle,
          section: sectionName,
          volumeText: vol + " " + unit,
          unitPrice,
          totalPrice: total,
          bobot,
          terpasangText: comp + " " + unit,
          progress: pt.progress ?? 0,
        };
      }),
    }));

    const opnameList: OpnameWorkPointItem[] = points.map((p) => {
      const volNum = p.proposedVolume ? Math.max(0, Number(p.proposedVolume)) : 1;
      const itemTotal =
        p.totalPrice ?? Number(p.approvedTotalWage ?? p.proposedTotalWage ?? 0);
      return {
        id: p.id,
        code: p.title.split(" ")[0]?.includes(".") ? p.title.split(" ")[0] : "",
        title: p.title.split(" ")[0]?.includes(".") ? p.title.split(" ").slice(1).join(" ") : p.title,
        section: p.location || "Pekerjaan Utama",
        targetVolume: volNum,
        unit: p.proposedUnit || "paket",
        completedVolume: p.completedVolume ?? 0,
        progress: p.progress ?? 0,
        totalPrice: itemTotal,
      };
    });

    return {
      rabGroups: groups,
      totalRabNumber: paguNum,
      totalRapNumber: rapNum,
      opnameWorkPointItems: opnameList,
    };
  }, [
    project.workPoints,
    project.pagu,
    project.budget,
    hasSavedRapPlans,
    savedRapTotal,
  ]);

  const profitAmount = totalRabNumber - totalRapNumber;
  const profitPercent = totalRabNumber > 0 ? ((profitAmount / totalRabNumber) * 100).toFixed(1) : "0.0";

  // Auto-compile materials from all RAB work points' "Isi analisa material"
  const compiledMaterialsFromAnalysis = useMemo<MaterialPlanRow[]>(() => {
    const list: MaterialPlanRow[] = [];
    for (const group of rabGroups) {
      for (const it of group.items) {
        const parts = (it.volumeText || "1 m").trim().split(" ");
        const volNum = parseFloat(parts[0]) || 1;
        const unitStr = parts.slice(1).join(" ") || "m";
        const analysis = itemAnalysesMap[it.id] || getStandardAnalysisForWorkItem(it.title, volNum, unitStr);

        for (const mat of analysis) {
          const plannedQty = Math.round((volNum * (mat.coefficient || 0) * (1 + (mat.wastePercent || 0) / 100)) * 100) / 100;
          list.push({
            id: `plan_${it.id}_${mat.id}`,
            materialName: mat.materialName,
            plannedQuantity: plannedQty,
            actualQuantity: plannedQty,
            quantity: plannedQty,
            unit: mat.unit,
            scope: it.id,
            scopeTitle: `${it.code && it.code !== "•" ? it.code + " " : ""}${it.title}`,
            fromAnalysis: true,
            coefficient: mat.coefficient,
            wastePercent: mat.wastePercent,
          });
        }
      }
    }
    return list;
  }, [rabGroups, itemAnalysesMap]);

  // Load persisted material plan and item analyses from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const savedAnalyses = localStorage.getItem(`project_analyses_map_${project.id}`);
        if (savedAnalyses) {
          setItemAnalysesMap(JSON.parse(savedAnalyses));
        }
        const savedPlan = localStorage.getItem(`project_material_plan_${project.id}`);
        if (savedPlan) {
          setMaterialPlanList(JSON.parse(savedPlan));
        }
      } catch (e) {
        console.error("Failed to load material plan from localStorage", e);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const effectiveMaterialPlanList =
    materialPlanList.length > 0 ? materialPlanList : compiledMaterialsFromAnalysis;

  const handleSaveMaterialPlan = (newMaterials: MaterialPlanRow[]) => {
    setMaterialPlanList(newMaterials);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`project_material_plan_${project.id}`, JSON.stringify(newMaterials));
      } catch (e) {
        console.error("Failed to save material plan to localStorage", e);
      }
    }
  };

  const handleSaveAnalisaMaterial = (workPointId: string, updatedMaterials: MaterialAnalysisItem[]) => {
    setItemAnalysesMap((prev) => {
      const nextMap = { ...prev, [workPointId]: updatedMaterials };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`project_analyses_map_${project.id}`, JSON.stringify(nextMap));
        } catch (e) {
          console.error("Failed to save analyses map to localStorage", e);
        }
      }
      return nextMap;
    });
  };

  const handlePrintRab = () => {
    window.print();
  };

  const handleExportRab = () => {
    const rows = [
      ["Bagian", "Kode", "Uraian Pekerjaan", "Volume", "Harga Satuan", "Jumlah", "Bobot %", "Terpasang", "Progres %"],
    ];

    for (const group of rabGroups) {
      for (const it of group.items) {
        rows.push([
          group.sectionName,
          it.code,
          it.title,
          it.volumeText,
          it.unitPrice.toString(),
          it.totalPrice.toString(),
          it.bobot.toFixed(2) + "%",
          it.terpasangText,
          it.progress + "%",
        ]);
      }
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.map((c) => '"' + c + '"').join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "RAB-" + (project.code || "proyek") + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintMaterials = () => {
    window.print();
  };

  const handleDuplicate = () => {
    startTransition(async () => {
      const res = await duplicateProject(project.id);
      if (res.success && res.newProjectId) {
        toast.success("Proyek berhasil diduplikasi.");
        router.push("/apps/projects/" + res.newProjectId);
      } else {
        toast.error(res.message || "Gagal menduplikasi proyek.");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteProject(project.id);
      if (res.success) {
        toast.success("Proyek berhasil dihapus.");
        router.push("/apps/projects");
      } else {
        toast.error(res.message || "Gagal menghapus proyek.");
      }
    });
  };

  const latestReport = project.reports[0];

  if (printDocView === "rab") {
    return (
      <ProjectPrintRabView
        project={project}
        rabGroups={rabGroups}
        totalRabNumber={totalRabNumber}
        onBack={() => setPrintDocView("none")}
      />
    );
  }

  if (printDocView === "progres") {
    return (
      <ProjectPrintProgressView
        project={project}
        rabGroups={rabGroups}
        totalRabNumber={totalRabNumber}
        plannedToday={plannedToday}
        deviation={deviation}
        onBack={() => setPrintDocView("none")}
      />
    );
  }

  return (
    <div className="min-h-screen space-y-5 pb-20">
      {/* 1. Header Proyek */}
      <PageHeader
        title={`Proyek: ${project.title}`}
        breadcrumbs={[
          { label: "Proyek", href: "/apps/projects" },
          { label: "Detail Proyek" },
        ]}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            {canManageProject ? (
              <Select
                value={currentKanbanKey}
                disabled={isUpdatingStatus}
                onValueChange={(value) =>
                  handleStageChange(
                    value as
                      | "tender"
                      | "perencanaan"
                      | "berjalan"
                      | "hampir_selesai"
                      | "selesai"
                      | "ditunda",
                  )
                }
              >
                <SelectTrigger
                  aria-label="Pilih tahap proyek"
                  className={`h-8 w-auto min-w-44 font-semibold ${
                    KANBAN_STAGES.find((s) => s.key === currentKanbanKey)
                      ?.badgeClass || "bg-card text-foreground"
                  }`}
                >
                  <SelectValue placeholder="Pilih tahap" />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_STAGES.map((st) => (
                    <SelectItem key={st.key} value={st.key}>
                      Tahap: {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge
                variant="outline"
                className={
                  KANBAN_STAGES.find((s) => s.key === currentKanbanKey)
                    ?.badgeClass || "bg-card text-foreground"
                }
              >
                Tahap:{" "}
                {KANBAN_STAGES.find((s) => s.key === currentKanbanKey)?.label ||
                  "Berjalan"}
              </Badge>
            )}

            <Badge
              variant="outline"
              className={
                deviation < 0
                  ? "border-rose-500/30 bg-rose-500/10 font-semibold text-rose-600 dark:text-rose-400"
                  : "border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400"
              }
            >
              {deviation < 0
                ? "Tertinggal " +
                  Math.abs(deviation).toLocaleString("id-ID") +
                  "% dari rencana"
                : "Sesuai rencana"}
            </Badge>

            <Badge variant="outline" className={healthBadgeColor + " font-semibold"}>
              {healthStatus}
            </Badge>

            <span className="type-p3 font-mono font-semibold text-muted-foreground">
              {project.code}
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canSubmitDailyProgress &&
              isRunningProjectStatus(project.status) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsDailyProgressOpen(true)}
                  className="gap-1.5 font-semibold"
                >
                  <Camera className="size-4" aria-hidden="true" />
                  <span>Isi Progres</span>
                </Button>
              )}

            {canManageProject && (
              <>
                <div className="sm:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Aksi proyek"
                        title="Aksi proyek"
                        className="size-11"
                      >
                        <Ellipsis className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      <DropdownMenuItem onSelect={() => setIsEditModalOpen(true)}>
                        <Pencil />
                        Ubah Proyek
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setIsClientPortalOpen(true)}>
                        <Globe />
                        Portal Klien
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setIsTemplateModalOpen(true)}>
                        <LayoutTemplate />
                        Simpan Template
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={handleDuplicate} disabled={isPending}>
                        <Copy />
                        Duplikat Proyek
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setIsDeleteModalOpen(true)}
                        disabled={isPending}
                        className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 dark:focus:bg-rose-950/30"
                      >
                        <Trash2 />
                        Hapus Proyek
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="hidden flex-wrap justify-end gap-2 sm:flex">
                  <ProjectActionButton
                    type="button"
                    label="Ubah Proyek"
                    icon={<Pencil className="size-3.5" />}
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditModalOpen(true)}
                  />
                  <ProjectActionButton
                    type="button"
                    label="Portal Klien"
                    icon={<Globe className="size-3.5 text-muted-foreground" />}
                    variant="outline"
                    size="sm"
                    onClick={() => setIsClientPortalOpen(true)}
                  />
                  <ProjectActionButton
                    type="button"
                    label="Simpan Template"
                    icon={<BookmarkCheck className="size-3.5 text-muted-foreground" />}
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTemplateModalOpen(true)}
                  />
                  <ProjectActionButton
                    type="button"
                    label="Duplikat"
                    icon={<Copy className="size-3.5 text-muted-foreground" />}
                    variant="outline"
                    size="sm"
                    onClick={handleDuplicate}
                    disabled={isPending}
                  />
                  <ProjectActionButton
                    type="button"
                    label="Hapus"
                    icon={<Trash2 className="size-3.5" />}
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={isPending}
                    className="border-rose-500/30 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
                  />
                </div>
              </>
            )}
          </div>
        }
      />

      {/* Offline Outbox Sync Banner */}
      {offlineQueueCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <WifiOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <p className="type-p2 font-semibold text-foreground">
                Menunggu Sinyal ({offlineQueueCount} laporan)
              </p>
              <p className="type-p3 text-muted-foreground">
                Laporan tersimpan aman di perangkat dan akan otomatis terkirim saat sinyal stabil.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFlushOfflineQueue}
            disabled={isFlushingQueue}
            className="gap-1.5"
          >
            {isFlushingQueue ? (
              <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-3.5" aria-hidden="true" />
            )}
            <span>Kirim Antrean Sekarang</span>
          </Button>
        </div>
      )}

      {/* 2. Onboarding / Status Banner (dismissable) */}
      {showBanner && (project.workPoints.length > 0 || canEditProjectRab) && (
        <div className="relative flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs sm:flex-row sm:items-center">
          <div className="space-y-0.5">
            <span className="type-p3 font-semibold text-muted-foreground">
              {project.workPoints.length === 0 ? "Langkah 2 dari 3" : "Langkah 3 dari 3"}
            </span>
            <p className="type-h3 text-foreground">
              {project.workPoints.length === 0
                ? "Isi Item Pekerjaan"
                : "Pantau Jadwal & Laporan"}
            </p>
            <p className="type-p3 text-muted-foreground">
              {project.workPoints.length === 0
                ? "Tempel tabel RAB dari Excel atau isi itemnya. Progres dihitung dari volume pekerjaan."
                : "Buka Papan & Jadwal untuk memperbarui target pekerjaan atau kirim laporan harian langsung."}
            </p>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {project.workPoints.length === 0 && canEditProjectRab ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setIsEditRabModalOpen(true)}
                className="gap-1.5"
              >
                <ClipboardList className="size-4" aria-hidden="true" />
                <span>Isi RAB</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("papan")}
                className="gap-1.5"
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                <span>Buka Jadwal</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Tutup panduan"
              title="Tutup panduan"
              onClick={() => setShowBanner(false)}
              className="size-11 shrink-0 sm:size-8"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 3. Metadata & KPI Cards (RBAC: Financial cards hidden for FIELD_TEAM) */}
      {(() => {
        const totalRequestedFunds = (project.wageTicketPayments || []).reduce(
          (sum, p) => sum + (p.status !== "REJECTED" ? Number(p.amount || 0) : 0),
          0,
        );
        const totalPaidFunds = (project.wageTicketPayments || []).reduce(
          (sum, p) =>
            sum +
            (p.status !== "REJECTED" && p.paid ? Number(p.amount || 0) : 0),
          0,
        );
        const laborTickets = (project.wageTicketPayments || []).filter(
          (p) =>
            p.status !== "REJECTED" &&
            (p.fundCategory ?? classifyTicketFundCategory(p).key) === "TUKANG",
        );
        const paidLaborFromTickets = laborTickets.reduce(
          (sum, p) => sum + (p.paid ? Number(p.amount || 0) : 0),
          0,
        );
        const requestedLaborFromTickets = laborTickets.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );
        const effectiveRealized = Math.max(
          totalPaidFunds,
          Number(project.realized || 0),
        );
        const effectiveRequested = Math.max(
          totalRequestedFunds,
          Number(project.requestedTotal || 0),
          effectiveRealized,
        );
        const effectiveLaborRealized = Math.max(
          paidLaborFromTickets,
          Number(project.laborRealized || 0),
        );
        const effectiveLaborRequested = Math.max(
          requestedLaborFromTickets,
          Number(project.laborRequested || 0),
          effectiveLaborRealized,
        );
        const contractValueDisplay =
          Number(project.pagu) > 0 ? Number(project.pagu) : totalRabNumber;

        return (
          <div
            className={
              canViewFinancials
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
                : "grid grid-cols-1 gap-3 sm:grid-cols-3"
            }
          >
            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" />
                <span>Alamat proyek</span>
              </div>
              <p className="type-p2 mt-1 line-clamp-1 font-bold text-foreground">
                {project.address || project.location || "Belum diisi"}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
                <User className="size-3.5 shrink-0" />
                <span>Manajer / PM</span>
              </div>
              <p className="type-p2 mt-1 line-clamp-1 font-bold text-foreground">
                {project.fieldPicName || "Belum ditentukan"}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="size-3.5 shrink-0" />
                <span>Jadwal Proyek</span>
              </div>
              <p className="type-p2 mt-1 font-bold text-foreground">
                {formatDateIndo(project.startDate)} – {formatDateIndo(project.endDate)}
              </p>
            </div>

            {canViewFinancials && (
              <>
                <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
                  <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
                    <Coins className="size-3.5 shrink-0" />
                    <span>Nilai kontrak (Pagu)</span>
                  </div>
                  <p className="type-p2 mt-1 font-bold tabular-nums text-foreground">
                    {currency(contractValueDisplay)}
                  </p>
                  {totalRabNumber > 0 &&
                    Math.abs(totalRabNumber - contractValueDisplay) > 1 && (
                      <p className="type-p3 mt-0.5 tabular-nums text-muted-foreground">
                        Total RAB: {currency(totalRabNumber)}
                      </p>
                    )}
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-card p-3.5 shadow-2xs">
                  <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
                    <WalletCards className="size-3.5 shrink-0 text-emerald-500" />
                    <span className="truncate">Pengeluaran Tiket (Cair)</span>
                  </div>
                  <p className="type-p2 mt-1 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {currency(effectiveRealized)}
                  </p>
                  <p className="type-p3 mt-0.5 tabular-nums text-muted-foreground">
                    Total pengajuan: {currency(effectiveRequested)}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-card p-3.5 shadow-2xs">
                  <div className="type-p3 flex items-center gap-1.5 text-muted-foreground">
                    <HardHat className="size-3.5 shrink-0 text-amber-500" />
                    <span className="truncate">Upah Tukang (Tiket)</span>
                  </div>
                  <p className="type-p2 mt-1 font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {currency(effectiveLaborRealized)}
                  </p>
                  <p className="type-p3 mt-0.5 tabular-nums text-muted-foreground">
                    Pengajuan upah: {currency(effectiveLaborRequested)}
                  </p>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* 5. Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/80 bg-muted/40 p-1">
          <TabsTrigger value="ringkasan" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
            Ringkasan
          </TabsTrigger>
          <TabsTrigger value="papan" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
            Papan &amp; Jadwal
          </TabsTrigger>
          <TabsTrigger value="rab" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
            {canViewFinancials ? "RAB & biaya" : "Titik Kerja"}
          </TabsTrigger>
          {canViewFinancials && (
            <TabsTrigger value="rekap-dana" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
              Rekap dana
            </TabsTrigger>
          )}
          {canViewFinancials && (
            <TabsTrigger value="tagihan" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
              Tagihan
            </TabsTrigger>
          )}
          <TabsTrigger value="lapangan" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
            Lapangan
          </TabsTrigger>
          <TabsTrigger value="tim" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
            Tim &amp; lokasi
          </TabsTrigger>
          <TabsTrigger value="dokumen" className="type-p3 shrink-0 rounded-lg px-4 py-2 font-semibold">
            Dokumen
          </TabsTrigger>
        </TabsList>

        {/* ===================== TAB 1: RINGKASAN ===================== */}
        <TabsContent value="ringkasan" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/80 shadow-2xs lg:col-span-1">
              <CardHeader>
                <CardTitle className="type-h3">Aktivitas &amp; Status Lapangan</CardTitle>
                <CardDescription className="type-p3">
                  Kondisi lapangan, progres fisik, dan aktivitas proyek saat ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                  <span className="type-p3 font-medium text-muted-foreground">Laporan terakhir</span>
                  {latestReport ? (
                    <div className="mt-2 space-y-2">
                      <p className="type-kpi font-bold text-foreground">
                        {formatDateIndo(latestReport.reportDate)}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        oleh <strong className="text-foreground">{project.fieldPicName || "Field Team"}</strong> · {latestReport.workersCount} pekerja
                      </p>
                      <p className="type-p3 font-medium tabular-nums text-foreground">
                        Akumulasi progres proyek: {latestReport.progress ?? project.progress}%
                      </p>
                      {latestReport.photoUrls && latestReport.photoUrls.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {latestReport.photoUrls.map((photo, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() =>
                                openMediaLightbox(
                                  photo,
                                  `Foto progres · ${formatDateIndo(latestReport.reportDate)}`,
                                )
                              }
                              aria-label={`Lihat foto progres ${i + 1}`}
                              className="group relative block size-16 overflow-hidden rounded-lg border border-border"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={withLocalPhotoPreview(photo)}
                                alt={`Progres foto ${i + 1}`}
                                className="size-full object-cover transition group-hover:scale-105"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {canSubmitDailyProgress &&
                          isRunningProjectStatus(project.status) && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setIsDailyProgressOpen(true)}
                              className="gap-1.5"
                            >
                              <Camera className="size-3.5" aria-hidden="true" />
                              <span>Isi Progres</span>
                            </Button>
                          )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab("lapangan")}
                        >
                          Buka Lapangan
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="type-h3 text-foreground">
                        {project.progress > 0
                          ? `Progres Opname ${project.progress.toLocaleString("id-ID")}%`
                          : "Belum ada laporan harian"}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        PIC Lapangan:{" "}
                        <strong className="text-foreground">
                          {project.fieldPicName || "Belum ditentukan"}
                        </strong>{" "}
                        · {project.workPoints.length} item pekerjaan
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canSubmitDailyProgress &&
                          isRunningProjectStatus(project.status) && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setIsDailyProgressOpen(true)}
                              className="gap-1.5"
                            >
                              <Camera className="size-3.5" aria-hidden="true" />
                              <span>Isi Progres</span>
                            </Button>
                          )}
                        {canManageProject && project.workPoints.length > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setIsOpnameModalOpen(true)}
                          >
                            Catat Opname
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setActiveTab("lapangan")}
                        >
                          Buka Lapangan
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                    <span className="type-p3 text-muted-foreground">Progres Aktual</span>
                    <p className="type-kpi mt-0.5 font-extrabold tabular-nums text-orange-500">
                      {project.progress.toLocaleString("id-ID")}%
                    </p>
                    <span className="type-p3 tabular-nums text-muted-foreground">
                      Rencana hari ini: {project.startDate ? `${plannedToday.toLocaleString("id-ID")}%` : "—"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                    <span className="type-p3 text-muted-foreground">Kelompok Tani</span>
                    <p className="type-p2 mt-0.5 line-clamp-1 font-bold text-foreground">
                      {project.kelompokTani || project.clientName || "—"}
                    </p>
                    <span className="type-p3 line-clamp-1 text-muted-foreground">
                      {project.jenisPekerjaan || "Pekerjaan Konstruksi"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-2xs lg:col-span-2">
              <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="type-h3">
                    Kurva S — Target Rencana vs Realisasi Aktual
                  </CardTitle>
                  <CardDescription className="type-p3">
                    Kurva rencana dihitung dari jadwal proyek; kurva aktual ditarik otomatis dari opname &amp; laporan harian.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab("rab")}
                  >
                    {canViewFinancials ? "Buka RAB" : "Titik Kerja"}
                  </Button>
                  {canViewFinancials && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab("rekap-dana")}
                    >
                      Rekap Dana
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-border/70 p-3">
                  <Chart
                    options={sCurveOptions}
                    series={sCurveSeries}
                    type="line"
                    height={230}
                  />
                  <div className="type-p3 mt-1 flex items-center justify-center gap-6 font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-orange-500" />
                      <span className="tabular-nums">Aktual ({project.progress.toLocaleString("id-ID")}%)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-muted-foreground" />
                      <span className="tabular-nums">Rencana ({project.startDate ? `${plannedToday.toLocaleString("id-ID")}%` : "—"})</span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pintasan / Quick actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="type-h3 text-foreground">Pintasan</h3>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {canSubmitDailyProgress &&
                isRunningProjectStatus(project.status) && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsDailyProgressOpen(true)}
                    className="gap-1.5"
                  >
                    <Camera className="size-3.5" aria-hidden="true" />
                    <span>Isi Progres</span>
                  </Button>
                )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("lapangan")}
                className="gap-1.5"
              >
                <ClipboardList className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Laporan Harian</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("papan")}
                className="gap-1.5"
              >
                <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Papan &amp; Jadwal</span>
              </Button>

              {canViewFinancials && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("tagihan")}
                  className="gap-1.5"
                >
                  <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Tagihan</span>
                </Button>
              )}

              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/apps/logistics?tab=warehouse">
                  <Package className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>Stok</span>
                </Link>
              </Button>

              {canViewFinancials && (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href="/apps/orders/new?type=po">
                    <ShoppingCart className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Buat PO</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===================== TAB 2: RAB & BIAYA (VASCO DESIGN) ===================== */}
        <TabsContent value="rab" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="type-h3 text-foreground">
                  {canViewFinancials ? "RAB & progres" : "Titik Kerja & Progres"}
                </CardTitle>
                <CardDescription className="type-p3 text-muted-foreground">
                  {canViewFinancials
                    ? "Volume dan harga tiap item pekerjaan. Progres dihitung dari volume terpasang (opname), dibobot nilai RAB."
                    : "Daftar target volume dan capaian terpasang tiap item pekerjaan lapangan."}
                </CardDescription>
              </div>

              {project.workPoints.length > 0 && (
                <div className="ml-auto flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label="Aksi item pekerjaan"
                        title="Aksi item pekerjaan"
                        className="min-h-11 min-w-11 gap-2 sm:min-h-8 sm:min-w-0"
                      >
                        <Ellipsis className="size-4" />
                        <span className="sr-only sm:not-sr-only">Aksi</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      <DropdownMenuItem onSelect={() => router.refresh()}>
                        <RefreshCw />
                        Segarkan data
                      </DropdownMenuItem>
                      {canViewFinancials && (
                        <DropdownMenuItem onSelect={() => setPrintDocView("rab")}>
                          <Printer />
                          Cetak RAB
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={() => setPrintDocView("progres")}>
                        <Printer />
                        Cetak progres
                      </DropdownMenuItem>
                      {canViewFinancials && (
                        <DropdownMenuItem onSelect={handleExportRab}>
                          <Download />
                          Ekspor CSV
                        </DropdownMenuItem>
                      )}
                      {canEditProjectRab && (
                        <DropdownMenuItem onSelect={() => setIsOpnameModalOpen(true)}>
                          <ClipboardList />
                          Catat opname
                        </DropdownMenuItem>
                      )}
                      {canEditProjectRab && (
                        <DropdownMenuItem onSelect={() => setIsEditRabModalOpen(true)}>
                          <Pencil />
                          Ubah RAB
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              {project.workPoints.length === 0 ? (
                <div className="space-y-6">
                  <EmptyState
                    icon={ClipboardList}
                    title="Belum ada item pekerjaan"
                    description={
                      canEditProjectRab
                        ? "Isi item pekerjaan dengan volume dan harga satuan, atau tempel langsung dari Excel."
                        : "Belum ada daftar item pekerjaan pada proyek ini."
                    }
                    action={
                      canEditProjectRab ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setIsEditRabModalOpen(true)}
                          className="gap-1.5"
                        >
                          <ClipboardList className="size-4" aria-hidden="true" />
                          <span>Isi RAB</span>
                        </Button>
                      ) : undefined
                    }
                  />

                  {canAccessMaterialPlanning && (
                    <div className="border-t border-border/60 pt-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="type-p2 font-semibold text-foreground">Rencana material</h4>
                          <p className="type-p3 text-muted-foreground">
                            Kebutuhan material dibanding pemakaian dari gudang. &quot;Seharusnya&quot; dihitung dari progres.
                          </p>
                        </div>
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <ProjectActionButton
                            type="button"
                            label="Cetak material"
                            icon={<Printer className="size-3.5 text-muted-foreground" />}
                            variant="outline"
                            size="sm"
                            onClick={() => window.print()}
                          />
                          <ProjectActionButton
                            type="button"
                            label="Rencana material"
                            icon={<Plus className="size-3.5 text-primary" />}
                            variant="outline"
                            size="sm"
                            onClick={() => setIsMaterialModalOpen(true)}
                          />
                        </div>
                      </div>
                      <p className="type-p3 py-2 text-muted-foreground">Belum ada rencana material.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 3 Metric Cards Row */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <span className="type-p3 font-medium text-muted-foreground">Progres</span>
                      <p className="type-kpi mt-1 font-bold tabular-nums text-foreground">
                        {project.progress.toLocaleString("id-ID")}%
                      </p>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {project.workPoints.some((p) => (p.completedVolume ?? 0) > 0)
                          ? "Berdasarkan volume terpasang"
                          : "Belum ada realisasi volume"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <span className="type-p3 font-medium text-muted-foreground">Rencana hari ini</span>
                      <p className="type-kpi mt-1 font-bold tabular-nums text-foreground">
                        {project.startDate ? `${plannedToday.toLocaleString("id-ID")}%` : "—"}
                      </p>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {project.startDate
                          ? (deviation < 0
                              ? "Tertinggal " + Math.abs(deviation).toLocaleString("id-ID") + "% dari rencana"
                              : "Sesuai rencana")
                          : "Isi tanggal rencana proyek"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <span className="type-p3 font-medium text-muted-foreground">Perkiraan selesai</span>
                      <p className="type-kpi mt-1 font-bold text-foreground">
                        {project.endDate ? formatDateIndo(project.endDate) : "—"}
                      </p>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {project.reports.length > 0
                          ? `${project.reports.length} laporan progres tercatat`
                          : "Belum ada laporan progres"}
                      </p>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div className="type-p3 flex items-center gap-2.5 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-foreground">
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                    <span className="tabular-nums">
                      Progres {project.progress.toLocaleString("id-ID")}% {deviation < 0 ? "tertinggal " + Math.abs(deviation).toLocaleString("id-ID") + "%" : "sesuai"} dari rencana {plannedToday.toLocaleString("id-ID")}% hari ini.
                    </span>
                  </div>

                  {/* Kurva S Chart Section */}
                  <div className="space-y-2">
                    <h3 className="type-h3 text-foreground">Kurva S</h3>
                    <div className="rounded-xl border border-border/70 p-4">
                      <Chart
                        options={sCurveOptions}
                        series={sCurveSeries}
                        type="line"
                        height={280}
                      />
                      <div className="type-p3 mt-2 flex items-center justify-center gap-6 font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-orange-500" />
                          <span>Aktual</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-muted-foreground" />
                          <span>Rencana</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* RAB & Progres Grouped Table */}
                  <Table
                    pagination={false}
                    className={canViewFinancials ? "min-w-[850px]" : "min-w-[620px]"}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[240px]">Uraian pekerjaan</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                        {canViewFinancials && (
                          <TableHead className="text-right">Harga satuan</TableHead>
                        )}
                        {canViewFinancials && (
                          <TableHead className="text-right">Jumlah</TableHead>
                        )}
                        {canViewFinancials && (
                          <TableHead className="text-right">Bobot</TableHead>
                        )}
                        <TableHead className="text-right">Terpasang</TableHead>
                        <TableHead className="min-w-[160px]">Progres</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rabGroups.map((group, groupIdx) => (
                        <React.Fragment key={groupIdx}>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell
                              colSpan={canViewFinancials ? 7 : 4}
                              className="type-p2 font-bold text-foreground"
                            >
                              {group.sectionName}
                            </TableCell>
                          </TableRow>

                          {group.items.map((it) => (
                            <TableRow key={it.id}>
                              <TableCell>
                                <p className="type-p3 font-semibold text-foreground">
                                  {it.code ? it.code + " " : ""}
                                  {it.title}
                                </p>
                                {canAccessMaterialPlanning && (
                                  <button
                                    type="button"
                                    aria-label={`Isi analisa material untuk ${it.title}`}
                                    title="Isi analisa material"
                                    onClick={() => {
                                      const parts = (it.volumeText || "1 m").trim().split(" ");
                                      const volNum = parseFloat(parts[0]) || 1;
                                      const unitStr = parts.slice(1).join(" ") || "m";
                                      const existingAnalysis =
                                        itemAnalysesMap[it.id] ||
                                        getStandardAnalysisForWorkItem(it.title, volNum, unitStr);
                                      setSelectedAnalisaItem({
                                        id: it.id,
                                        title: (it.code ? it.code + " " : "") + it.title,
                                        volume: volNum,
                                        unit: unitStr,
                                        analysis: existingAnalysis,
                                      });
                                      setIsAnalisaModalOpen(true);
                                    }}
                                    className="type-p3 mt-0.5 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded px-2 py-1 font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-400 sm:min-h-0 sm:min-w-0 sm:px-0 sm:py-0 sm:hover:bg-transparent"
                                  >
                                    <Package className="size-3.5" aria-hidden="true" />
                                    <span className="sr-only sm:not-sr-only">Analisa material</span>
                                  </button>
                                )}
                              </TableCell>
                              <TableCell className="type-p3 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                                {it.volumeText}
                              </TableCell>
                              {canViewFinancials && (
                                <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                                  {currency(it.unitPrice)}
                                </TableCell>
                              )}
                              {canViewFinancials && (
                                <TableCell className="type-p3 text-right font-mono font-semibold whitespace-nowrap tabular-nums text-foreground">
                                  {currency(it.totalPrice)}
                                </TableCell>
                              )}
                              {canViewFinancials && (
                                <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                                  {it.bobot.toFixed(2)}%
                                </TableCell>
                              )}
                              <TableCell className="type-p3 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                                {it.terpasangText}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={it.progress} className="h-2 min-w-16 flex-1" />
                                  <span className="type-p3 w-10 text-right font-mono tabular-nums text-muted-foreground">
                                    {it.progress}%
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell
                          colSpan={canViewFinancials ? 3 : 2}
                          className="type-p2 font-bold text-foreground"
                        >
                          {canViewFinancials ? "Total RAB" : "Total Progres"}
                        </TableCell>
                        {canViewFinancials && (
                          <TableCell className="type-p2 text-right font-mono font-extrabold whitespace-nowrap tabular-nums text-foreground">
                            {currency(totalRabNumber)}
                          </TableCell>
                        )}
                        {canViewFinancials && (
                          <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                            100%
                          </TableCell>
                        )}
                        <TableCell />
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={project.progress} className="h-2 min-w-16 flex-1" />
                            <span className="type-p3 w-10 text-right font-mono font-bold tabular-nums">
                              {project.progress}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>

                  {/* RAP and Profit info (Financial roles only) */}
                  {canViewFinancials && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-4">
                      <div className="type-p3 space-y-1 text-muted-foreground">
                        <p>
                          Nilai Kontrak RAB (Pagu):{" "}
                          <strong className="tabular-nums text-foreground">
                            {currency(totalRabNumber)}
                          </strong>{" "}
                          · RAP Proyek:{" "}
                          <strong className="tabular-nums text-foreground">
                            {currency(totalRapNumber)}
                          </strong>
                        </p>
                        <p>
                          Estimasi Keuntungan:{" "}
                          <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
                            {currency(profitAmount)} ({profitPercent}%)
                          </strong>{" "}
                          · Skema Jasa: <strong className="text-amber-500">Upah Borongan</strong>
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setIsRapModalOpen(true)}
                        className="ml-auto gap-1.5"
                      >
                        <Calculator className="size-3.5" aria-hidden="true" />
                        <span>Susun RAP</span>
                      </Button>
                    </div>
                  )}

                  {/* Rencana Material Section */}
                  {canAccessMaterialPlanning && (
                    <div className="space-y-3 border-t border-border/60 pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="type-h3 text-foreground">Rencana material</h3>
                          <p className="type-p3 text-muted-foreground">
                            Kebutuhan material dibanding pemakaian dari gudang. &quot;Seharusnya&quot; dihitung dari progres.
                          </p>
                        </div>
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <ProjectActionButton
                            type="button"
                            label="Cetak material"
                            icon={<Printer className="size-3.5 text-muted-foreground" />}
                            variant="outline"
                            size="sm"
                            onClick={handlePrintMaterials}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setIsRapModalOpen(true)}
                            className="gap-1.5"
                          >
                            <Calculator className="size-3.5" aria-hidden="true" />
                            <span>Susun RAP</span>
                          </Button>
                          <ProjectActionButton
                            type="button"
                            label="Rencana material"
                            icon={<Plus className="size-3.5 text-primary" />}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedWorkPointForMaterial(undefined);
                              setIsMaterialModalOpen(true);
                            }}
                          />
                        </div>
                      </div>

                      {effectiveMaterialPlanList.length === 0 ? (
                        <p className="type-p3 py-2 text-muted-foreground">
                          Belum ada rencana material.
                        </p>
                      ) : (
                        <Table pagination={false} className="min-w-[860px]">
                          <TableHeader>
                            <TableRow className="bg-[#102A4D] hover:bg-[#102A4D]">
                              <TableHead className="text-white">Material / Bahan</TableHead>
                              <TableHead className="text-white">Lingkup Pekerjaan</TableHead>
                              <TableHead className="text-right text-white">Rencana Analisa</TableHead>
                              <TableHead className="border-x border-white/20 bg-[#143560] text-right text-white">
                                Bahan Aktual
                              </TableHead>
                              <TableHead className="text-center text-white">Satuan</TableHead>
                              <TableHead className="text-center text-white">Selisih</TableHead>
                              <TableHead className="text-white">Status Pemakaian</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {effectiveMaterialPlanList.map((m, idx) => {
                              const scopeItem = project.workPoints.find((wp) => wp.id === m.scope);
                              const planned = m.plannedQuantity ?? m.quantity ?? 0;
                              const actual = m.actualQuantity ?? m.quantity ?? 0;
                              const diff = actual - planned;
                              const diffPercent =
                                planned > 0 ? Math.round((diff / planned) * 100) : 0;

                              return (
                                <TableRow key={idx}>
                                  <TableCell>
                                    <span className="type-p3 block font-semibold text-foreground">
                                      {m.materialName}
                                    </span>
                                    {m.fromAnalysis && (
                                      <span className="type-p3 inline-flex items-center gap-1 text-primary">
                                        <Sparkles className="size-3" /> Dari Analisa RAB
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="type-p3 text-muted-foreground">
                                    {m.scope === "ALL"
                                      ? "Seluruh proyek"
                                      : m.scopeTitle || scopeItem?.title || m.scope}
                                  </TableCell>
                                  <TableCell className="type-p3 text-right font-mono tabular-nums">
                                    {m.fromAnalysis ? (
                                      <div>
                                        <span className="font-medium text-foreground">
                                          {planned.toLocaleString("id-ID", {
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                        <span className="type-p3 block text-muted-foreground">
                                          Otomatis RAB
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="type-p3 border-x border-primary/20 bg-primary/5 text-right font-mono font-bold tabular-nums text-foreground">
                                    {actual.toLocaleString("id-ID", {
                                      maximumFractionDigits: 2,
                                    })}
                                  </TableCell>
                                  <TableCell className="type-p3 text-center font-mono font-medium text-foreground">
                                    {m.unit}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {m.fromAnalysis ? (
                                      diff === 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="type-p3 border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                        >
                                          <CheckCircle2 className="size-3" /> Sesuai
                                        </Badge>
                                      ) : diff > 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="type-p3 border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                        >
                                          +{diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ({diffPercent > 0 ? `+${diffPercent}` : diffPercent}%)
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="type-p3 border-sky-300 bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                                        >
                                          {diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ({diffPercent}%)
                                        </Badge>
                                      )
                                    ) : (
                                      <span className="type-p3 text-muted-foreground">Manual</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className="type-p3 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    >
                                      Tersedia di gudang
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              )}

              {canViewFinancials && (
                <section className="space-y-3 border-t border-border/60 pt-6">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="type-h3 text-foreground">RAP yang disusun</h3>
                      <p className="type-p3 text-muted-foreground">
                        Rincian bahan dan jasa borongan dari RAP tersimpan.
                      </p>
                    </div>
                    {savedRapMaterials.length === 0 && savedRapLaborPlans.length === 0 && (
                      <ProjectActionButton
                        type="button"
                        label="Susun RAP"
                        icon={<Calculator className="size-3.5" />}
                        variant="outline"
                        size="sm"
                        onClick={() => setIsRapModalOpen(true)}
                      />
                    )}
                  </div>

                  {savedRapMaterials.length === 0 && savedRapLaborPlans.length === 0 ? (
                    <EmptyState
                      icon={Calculator}
                      title="Belum ada rincian RAP"
                      description="Tambahkan rencana anggaran pelaksanaan (bahan dan jasa borongan) melalui tombol Susun RAP."
                    />
                  ) : (
                    <Table pagination={false} className="min-w-[760px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jenis</TableHead>
                          <TableHead>Uraian</TableHead>
                          <TableHead className="text-right">Volume RAP</TableHead>
                          <TableHead className="text-right">Harga satuan</TableHead>
                          <TableHead className="text-right">Jumlah RAP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {savedRapMaterials.map((material) => {
                          const scopeTitle =
                            material.scope === "ALL" || !material.scope
                              ? "Seluruh proyek"
                              : project.workPoints.find((point) => point.id === material.scope)?.title ??
                                material.scope;

                          return (
                            <TableRow key={material.id}>
                              <TableCell className="type-p3 text-muted-foreground">Bahan</TableCell>
                              <TableCell>
                                <span className="type-p3 block font-semibold text-foreground">
                                  {material.materialName}
                                </span>
                                {material.stockItemId && (() => {
                                  const linkedStockItem = stockItems.find(
                                    (item) => item.id === material.stockItemId,
                                  );
                                  return (
                                    <span className="type-p3 block text-muted-foreground">
                                      Stok: {linkedStockItem?.name ?? "Barang tidak tersedia"}
                                      {linkedStockItem
                                        ? ` · ${Number(linkedStockItem.stockQuantity || 0).toLocaleString("id-ID")} ${linkedStockItem.unit}`
                                        : ""}
                                    </span>
                                  );
                                })()}
                                <span className="type-p3 block text-muted-foreground">{scopeTitle}</span>
                                {material.notes && (
                                  <span className="type-p3 block text-muted-foreground">{material.notes}</span>
                                )}
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono tabular-nums">
                                {material.actualQuantity.toLocaleString("id-ID", {
                                  maximumFractionDigits: 3,
                                })}{" "}
                                {material.unit}
                                {material.plannedQuantity > 0 && (
                                  <span className="type-p3 block text-muted-foreground">
                                    RAB:{" "}
                                    {material.plannedQuantity.toLocaleString("id-ID", {
                                      maximumFractionDigits: 3,
                                    })}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                                {currency(material.unitPrice)}
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono font-semibold whitespace-nowrap tabular-nums">
                                {currency(material.totalPrice)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {savedRapLaborPlans.map((labor) => {
                          const unitPrice =
                            Number(labor.boronganRate) > 0
                              ? Number(labor.boronganRate)
                              : labor.volume > 0
                                ? Number(labor.totalBorongan) / labor.volume
                                : 0;
                          const lineTotal = Math.round(labor.volume * unitPrice);

                          return (
                            <TableRow key={labor.id}>
                              <TableCell className="type-p3 text-muted-foreground">Jasa</TableCell>
                              <TableCell>
                                <span className="type-p3 block font-semibold text-foreground">
                                  {labor.jobName}
                                </span>
                                {labor.subkonName && (
                                  <span className="type-p3 block text-muted-foreground">
                                    {labor.subkonName}
                                  </span>
                                )}
                                {labor.notes && (
                                  <span className="type-p3 block text-muted-foreground">
                                    {labor.notes}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono tabular-nums">
                                {labor.volume.toLocaleString("id-ID", {
                                  maximumFractionDigits: 3,
                                })}{" "}
                                {labor.unit}
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                                {currency(unitPrice)}
                              </TableCell>
                              <TableCell className="type-p3 text-right font-mono font-semibold whitespace-nowrap tabular-nums">
                                {currency(lineTotal)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={4} className="type-p3 font-semibold text-foreground">
                            Total bahan
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                            {currency(savedRapMaterialTotal)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={4} className="type-p3 font-semibold text-foreground">
                            Total jasa borongan
                          </TableCell>
                          <TableCell className="type-p3 text-right font-mono whitespace-nowrap tabular-nums">
                            {currency(savedRapLaborTotal)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={4} className="type-p2 font-bold text-foreground">
                            Total RAP
                          </TableCell>
                          <TableCell className="type-p2 text-right font-mono font-bold whitespace-nowrap tabular-nums text-foreground">
                            {currency(savedRapTotal)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  )}
                </section>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB: REKAP DANA ===================== */}
        {canViewFinancials && (
          <TabsContent value="rekap-dana" className="space-y-6">
            <ProjectFundRecapTab
              projectTitle={project.title}
              projectCode={project.code}
              contractValue={
                Number(project.pagu) > 0 ? Number(project.pagu) : totalRabNumber
              }
              tickets={project.wageTicketPayments}
              stockItems={stockItems}
            />
          </TabsContent>
        )}

        {/* ===================== TAB 3: TAGIHAN ===================== */}
        {canViewFinancials && (
          <TabsContent value="tagihan" className="space-y-6">
            <Card className="border-border/80 shadow-2xs">
              <CardHeader>
                <CardTitle className="type-h3">Kontrak Subkon &amp; Tagihan</CardTitle>
                <CardDescription className="type-p3">
                  Daftar kontrak kerja sama vendor dan status termin pembayaran.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {project.subkonContracts.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Belum ada kontrak subkon"
                    description="Buat SPK atau kontrak subkon melalui menu administrasi konstruksi."
                  />
                ) : (
                  <div className="space-y-4">
                    {project.subkonContracts.map((contract) => (
                      <div
                        key={contract.id}
                        className="rounded-xl border border-border/80 bg-muted/10 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                          <div>
                            <p className="type-p2 font-bold text-foreground">
                              {contract.contractNumber} · {contract.subkonName}
                            </p>
                            <p className="type-p3 text-muted-foreground">
                              Kontrak #{contract.contractNumber}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="type-p2 font-extrabold tabular-nums text-foreground">
                              {currency(contract.contractValue)}
                            </p>
                            <Badge variant="outline" className="type-p3">
                              {contract.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3">
                          <span className="type-p3 font-semibold text-muted-foreground">
                            Rincian Termin:
                          </span>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {contract.termyns.map((termyn) => (
                              <div
                                key={termyn.id}
                                className="rounded-lg border border-border/60 bg-card p-2.5"
                              >
                                <span className="type-p3 font-semibold text-foreground">
                                  Termin {termyn.termynNumber} ({termyn.claimedPercent}%)
                                </span>
                                <p className="type-p3 font-mono tabular-nums text-muted-foreground">
                                  {currency(termyn.netAmount)}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={
                                    termyn.status === "PAID"
                                      ? "type-p3 mt-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      : "type-p3 mt-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  }
                                >
                                  {termyn.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ===================== TAB 4: LAPANGAN ===================== */}
        <TabsContent value="lapangan" className="space-y-6">
          {/* Primary One-Way Daily Report CTA Banner */}
          {canSubmitDailyProgress && (
            <Card className="border-primary/30 bg-primary/5 shadow-2xs">
              <CardContent className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <p className="type-h3 text-foreground">Isi Laporan Hari Ini</p>
                  <p className="type-p3 text-muted-foreground">
                    {isRunningProjectStatus(project.status)
                      ? "Catat volume progres per item pekerjaan, cuaca, jumlah pekerja, catatan K3, kendala, dan dokumentasi foto."
                      : "Proyek belum berstatus berjalan. Ubah tahap proyek ke Berjalan untuk mengirim laporan harian."}
                  </p>
                </div>
                {isRunningProjectStatus(project.status) && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsDailyProgressOpen(true)}
                    className="shrink-0 gap-1.5"
                  >
                    <Camera className="size-4" aria-hidden="true" />
                    <span>Isi Laporan Hari Ini</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <ProjectMaterialDeliveriesCard
            project={{
              id: project.id,
              title: project.title,
              kelompokTani: project.kelompokTani,
            }}
            contracts={materialContracts}
            deliveries={materialDeliveries}
            contractTickets={contractTickets}
            currentUserRole={currentUserRole ?? UserRole.FIELD_TEAM}
          />

          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="type-h3">Laporan Harian Lapangan</CardTitle>
                <CardDescription className="type-p3">
                  Riwayat catatan progres, cuaca, K3, dan dokumentasi foto harian.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {project.reports.length === 0 ? (
                <EmptyState
                  icon={Camera}
                  title="Belum ada laporan harian"
                  description="Kirim laporan progres fisik, cuaca, kendala, dan dokumentasi foto langsung dari proyek ini."
                  action={
                    canSubmitDailyProgress &&
                    isRunningProjectStatus(project.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setIsDailyProgressOpen(true)}
                        className="gap-1.5"
                      >
                        <Camera className="size-4" aria-hidden="true" />
                        <span>Isi Laporan Hari Ini</span>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-4">
                  {project.reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-xl border border-border/80 bg-muted/10 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                        <div>
                          <p className="type-p2 font-bold text-foreground">
                            {formatDateIndo(report.reportDate)}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Cuaca: {report.weather || "Cerah"} · {report.workersCount} pekerja
                          </p>
                        </div>
                        <Badge variant="outline" className="type-p3 font-mono font-semibold tabular-nums">
                          Akumulasi proyek: {report.progress ?? 0}%
                        </Badge>
                      </div>

                      {(report.workSummary || report.notes || report.k3SafetyLog) && (
                        <div className="mt-3 space-y-1.5">
                          {report.workSummary && (
                            <div className="type-p3 font-medium text-foreground">
                              {report.workSummary.startsWith("Opname Mingguan") && (
                                <Badge variant="outline" className="type-p3 mr-2 border-sky-500/40 text-sky-600 dark:text-sky-400">
                                  Mingguan
                                </Badge>
                              )}
                              {report.workSummary.startsWith("Laporan Progres Harian") && (
                                <Badge variant="outline" className="type-p3 mr-2 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                                  Harian
                                </Badge>
                              )}
                              {report.workSummary}
                            </div>
                          )}
                          {report.notes && (
                            <p className="type-p3 flex items-start gap-1.5 text-muted-foreground">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                              <span>Catatan / Kendala: {report.notes}</span>
                            </p>
                          )}
                          {report.k3SafetyLog && (
                            <p className="type-p3 flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
                              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                              <span>K3: {report.k3SafetyLog}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {report.photoUrls && report.photoUrls.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {report.photoUrls.map((photo, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() =>
                                openMediaLightbox(
                                  photo,
                                  `Foto lapangan · ${formatDateIndo(report.reportDate)} (${i + 1})`,
                                )
                              }
                              aria-label={`Lihat foto lapangan ${i + 1}`}
                              className="group relative block size-20 overflow-hidden rounded-lg border border-border"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={withLocalPhotoPreview(photo)}
                                alt={`Foto lapangan ${i + 1}`}
                                className="size-full object-cover transition group-hover:scale-105"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 5: TIM & LOKASI ===================== */}
        <TabsContent value="tim" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-col justify-between gap-3 pb-0 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="type-h3">Tim Proyek &amp; Lokasi Geografis</CardTitle>
                <CardDescription className="type-p3">
                  Penanggung jawab lapangan (Field PIC) dan koordinat peta proyek.
                </CardDescription>
              </div>
              {canManageProject && (
                <ProjectActionButton
                  type="button"
                  label="Tim Inti"
                  icon={<User className="size-3.5 text-muted-foreground" />}
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCoreTeamModalOpen(true)}
                  className="ml-auto"
                />
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                <div className="flex items-center gap-3">
                  <div className="type-p2 grid size-12 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                    {project.fieldPicName?.slice(0, 2).toUpperCase() || "PM"}
                  </div>
                  <div>
                    <p className="type-p2 font-bold text-foreground">
                      {project.fieldPicName || "Belum Ditentukan"}
                    </p>
                    <p className="type-p3 text-muted-foreground">
                      Field PIC / Manajer Lapangan Proyek
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/15 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="type-p3 font-semibold text-muted-foreground">Lokasi Proyek</p>
                  <p className="type-p2 mt-1 font-bold text-foreground">
                    {project.location || project.address || "Belum diisi"}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="ml-auto gap-1.5">
                  <Link
                    href={"/apps/projects?section=surveys&view=map&projectId=" + encodeURIComponent(project.id)}
                  >
                    <MapPinned className="size-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    <span>Peta GIS</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 6: DOKUMEN ===================== */}
        <TabsContent value="dokumen" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="type-h3 text-foreground">Dokumen proyek</CardTitle>
                <CardDescription className="type-p3">
                  Kontrak, gambar kerja, izin dan berita acara proyek ini.
                </CardDescription>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={`/apps/drafter?projectId=${encodeURIComponent(project.id)}`}>
                    <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Gambar Kerja</span>
                  </Link>
                </Button>
                {canEditProjectRab && (
                  <ProjectActionButton
                    type="button"
                    label="Unggah Dokumen"
                    icon={<Paperclip className="size-3.5 text-muted-foreground" />}
                    variant="outline"
                    size="sm"
                    onClick={() => setIsUploadDocModalOpen(true)}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Contract Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="type-p3 flex flex-wrap items-center gap-6">
                  <div>
                    <span className="type-p3 block text-muted-foreground">Nomor kontrak</span>
                    <strong className="font-semibold text-foreground">
                      {project.subkonContracts?.[0]?.contractNumber || "-"}
                    </strong>
                  </div>
                  <div>
                    <span className="type-p3 block text-muted-foreground">Tanggal kontrak</span>
                    <strong className="font-semibold text-foreground">
                      {formatDateIndo(project.startDate)}
                    </strong>
                  </div>
                  <div>
                    <span className="type-p3 block text-muted-foreground">Masa pemeliharaan</span>
                    <strong className="font-semibold text-foreground">-</strong>
                  </div>
                  <div>
                    <span className="type-p3 block text-muted-foreground">Pemeliharaan berakhir</span>
                    <strong className="font-semibold text-foreground">
                      {formatDateIndo(project.endDate)}
                    </strong>
                  </div>
                </div>
                {canManageProject && (
                  <ProjectActionButton
                    type="button"
                    label="Ubah Kontrak"
                    icon={<Pencil className="size-3" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditModalOpen(true)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  />
                )}
              </div>

              {project.blueprints.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Belum ada dokumen"
                  description="Unggah kontrak, gambar kerja, atau dokumen izin proyek ini agar mudah ditelusuri."
                  action={
                    canEditProjectRab ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsUploadDocModalOpen(true)}
                        className="gap-1.5"
                      >
                        <Paperclip className="size-3.5" aria-hidden="true" />
                        <span>Unggah Dokumen</span>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  {project.blueprints.map((bp) => (
                    <div
                      key={bp.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/10 p-3.5 transition hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <FileText className="size-4" />
                        </div>
                        <div>
                          <p className="type-p3 font-bold text-foreground">
                            {bp.drawingNumber ? bp.drawingNumber + " · " : ""}
                            {bp.title}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {bp.category} · Oleh {bp.drafterName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="type-p3">
                          {bp.status}
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openMediaLightbox(bp.fileUrl, bp.title)}
                          aria-label={`Lihat ${bp.title}`}
                        >
                          Lihat
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 7: PAPAN & JADWAL (JADWAL PROYEK LENGKAP) ===================== */}
        <TabsContent value="papan" className="space-y-6">
          <ProjectScheduleGantt
            selectedProject={{
              id: project.id,
              code: project.code,
              title: project.title,
              name: project.title,
              startDate: project.startDate,
              endDate: project.endDate,
              progress: project.progress,
            }}
            defaultAssigneeName={project.fieldPicName}
            teamMembers={fieldTeamUsers}
            initialTasks={project.workPoints.map((wp) => ({
              id: wp.id,
              title: wp.title,
              location: wp.location || "A. Persiapan",
              plannedStartDate: wp.plannedStartDate,
              targetDate: wp.targetDate,
              progress: wp.progress ?? 0,
              projectId: project.id,
              projectName: project.title,
            }))}
            initialMilestones={initialMilestones}
            embedded={true}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Project Modal (Admin only) */}
      {canManageProject && (
        <ProjectFormModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          project={{
            id: project.id,
            code: project.code,
            title: project.title,
            kelompokTani: project.kelompokTani,
            address: project.address,
            jenisPekerjaan: project.jenisPekerjaan,
            location: project.location,
            priority: project.priority,
            progress: project.progress,
            pagu: project.pagu,
            budget: project.budget,
            landArea: project.landArea,
            fieldPicId: project.fieldPicId,
            startDate: project.startDate,
            endDate: project.endDate,
            vendor: project.vendor,
            clientName: project.clientName,
          }}
          fieldTeamUsers={fieldTeamUsers}
        />
      )}

      {/* Client Portal Modal */}
      {canManageProject && (
        <GlobalModal
          isOpen={isClientPortalOpen}
          onClose={() => setIsClientPortalOpen(false)}
          mobileBehavior="sheet"
          title="Portal Klien"
          description="Bagikan tautan ini kepada klien untuk memantau progres dan dokumentasi foto proyek secara langsung."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <span className="type-p3 font-semibold text-muted-foreground">
                Tautan Publik Klien:
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? window.location.origin + "/verify/" + project.code
                      : ""
                  }
                  className="font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      window.location.origin + "/verify/" + project.code,
                    );
                    toast.success("Tautan portal klien berhasil disalin.");
                  }}
                  className="shrink-0 gap-1.5"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  <span>Salin Tautan</span>
                </Button>
              </div>
            </div>
          </div>
        </GlobalModal>
      )}

      {/* Template Modal */}
      {canManageProject && (
        <GlobalModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          mobileBehavior="sheet"
          title="Template Proyek"
          description="Gunakan standar template proyek untuk mempercepat pembuatan proyek serupa di masa depan."
        >
          <div className="space-y-3">
            <p className="type-p3 text-muted-foreground">
              Template ini mencakup struktur titik kerja umum, pembagian bobot upah, dan checklist survei standar.
            </p>
            <Button
              type="button"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                toast.success("Template proyek berhasil disimpan.");
                setIsTemplateModalOpen(false);
              }}
            >
              <BookmarkCheck className="size-4" aria-hidden="true" />
              <span>Simpan Template</span>
            </Button>
          </div>
        </GlobalModal>
      )}

      {/* Delete Confirmation Dialog */}
      {canManageProject && (
        <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Proyek?</AlertDialogTitle>
              <AlertDialogDescription>
                Apakah Anda yakin ingin menghapus proyek{" "}
                <strong>{project.title}</strong> ({project.code})? Tindakan ini tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending ? "Menghapus..." : "Hapus Proyek"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Unified One-Way Daily Progress Modal */}
      {canSubmitDailyProgress && (
        <DailyProgressModal
          open={isDailyProgressOpen}
          onOpenChange={(open) => {
            setIsDailyProgressOpen(open);
            if (!open && searchParams?.get("action") === "daily-report") {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("action");
              const nextQuery = params.toString();
              window.history.replaceState(
                null,
                "",
                nextQuery
                  ? `/apps/projects/${project.id}?${nextQuery}`
                  : `/apps/projects/${project.id}`,
              );
            }
          }}
          lockedProject={project}
          onSuccess={() => router.refresh()}
          onQueueChange={setOfflineQueueCount}
        />
      )}

      {/* In-App Photo & Document Lightbox Modal (zero target="_blank") */}
      <GlobalModal
        isOpen={previewMedia !== null}
        onClose={() => setPreviewMedia(null)}
        mobileBehavior="dialog"
        icon={<ImageIcon className="size-4" aria-hidden="true" />}
        title={previewMedia?.title ?? "Pratinjau Media"}
        className="max-w-3xl"
        footer={
          previewMedia ? (
            <div className="flex w-full items-center justify-between gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={photoDownloadHref(previewMedia.url)} download>
                  <Download className="size-3.5" aria-hidden="true" />
                  Unduh Berkas
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setPreviewMedia(null)}
              >
                Tutup
              </Button>
            </div>
          ) : undefined
        }
      >
        {previewMedia &&
          (previewMedia.kind === "image" ? (
            <div className="flex max-h-[70dvh] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                className="max-h-[65dvh] w-auto rounded-lg object-contain"
              />
            </div>
          ) : (
            <iframe
              src={previewMedia.url}
              title={previewMedia.title}
              className="h-[65dvh] w-full rounded-xl border border-border bg-background"
            />
          ))}
      </GlobalModal>

      {/* Modal: Ubah RAB */}
      {canEditProjectRab && (
        <EditRabModal
          open={isEditRabModalOpen}
          onClose={() => setIsEditRabModalOpen(false)}
          projectId={project.id}
          initialItems={
            project.workPoints.length > 0
              ? project.workPoints.map((pt) => {
                  const parts = pt.title.split(" ");
                  const code = parts[0]?.includes(".") ? parts[0] : "";
                  const title = code ? parts.slice(1).join(" ") : pt.title;
                  const itemVol = pt.proposedVolume ? Math.max(1, Number(pt.proposedVolume)) : 1;
                  const total = Number(pt.approvedTotalWage ?? pt.proposedTotalWage ?? 0);
                  const unitPrice = pt.proposedUnitPrice && Number(pt.proposedUnitPrice) > 0
                    ? Math.round(Number(pt.proposedUnitPrice))
                    : (itemVol > 0 ? Math.round(total / itemVol) : total);
                  return {
                    id: pt.id,
                    section: pt.location || "A. Persiapan",
                    code,
                    title,
                    volume: itemVol,
                    unit: pt.proposedUnit || "paket",
                    unitPrice,
                    rapPrice: 0,
                    startDate: pt.plannedStartDate ? pt.plannedStartDate.slice(0, 10) : "",
                    endDate: pt.targetDate ? pt.targetDate.slice(0, 10) : "",
                  };
                })
              : []
          }
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Modal: Catat Progres Opname */}
      {canEditProjectRab && (
        <OpnameProgressModal
          open={isOpnameModalOpen}
          onClose={() => setIsOpnameModalOpen(false)}
          projectId={project.id}
          overallProgress={project.progress}
          items={opnameWorkPointItems}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Modal: Rencana Material */}
      {canAccessMaterialPlanning && (
        <MaterialPlanModal
          open={isMaterialModalOpen}
          onClose={() => setIsMaterialModalOpen(false)}
          projectId={project.id}
          rabItems={project.workPoints.map((p) => ({
            id: p.id,
            code: p.title.split(" ")[0]?.includes(".") ? p.title.split(" ")[0] : "",
            title: p.title.split(" ")[0]?.includes(".") ? p.title.split(" ").slice(1).join(" ") : p.title,
          }))}
          stockItems={stockItems}
          initialMaterials={effectiveMaterialPlanList}
          analysisMaterials={compiledMaterialsFromAnalysis}
          preselectedWorkPointId={selectedWorkPointForMaterial}
          onSave={handleSaveMaterialPlan}
        />
      )}

      {/* Modal: Analisa Material Per Item */}
      {canAccessMaterialPlanning && (
        <AnalisaMaterialModal
          isOpen={isAnalisaModalOpen}
          onClose={() => setIsAnalisaModalOpen(false)}
          itemTitle={selectedAnalisaItem?.title || ""}
          itemVolume={selectedAnalisaItem?.volume || 1}
          itemUnit={selectedAnalisaItem?.unit || "m"}
          initialMaterials={selectedAnalisaItem?.analysis}
          onSave={(updatedMaterials) => {
            if (selectedAnalisaItem?.id) {
              handleSaveAnalisaMaterial(selectedAnalisaItem.id, updatedMaterials);
            }
          }}
        />
      )}

      {/* Modal: Penyusunan RAP */}
      {canViewFinancials && (
        <RapManagementModal
          isOpen={isRapModalOpen}
          onClose={() => setIsRapModalOpen(false)}
          projectId={project.id}
          projectTitle={project.title}
          paguRab={totalRabNumber}
          stockItems={stockItems}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Modal: Unggah Dokumen */}
      {canEditProjectRab && (
        <UploadDocumentModal
          isOpen={isUploadDocModalOpen}
          onClose={() => setIsUploadDocModalOpen(false)}
          projectId={project.id}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Modal: Tim Inti Proyek */}
      {canManageProject && (
        <CoreTeamModal
          isOpen={isCoreTeamModalOpen}
          onClose={() => setIsCoreTeamModalOpen(false)}
          projectId={project.id}
          currentPicId={project.fieldPicId}
          currentPicName={project.fieldPicName}
          availableUsers={fieldTeamUsers.map((u) => ({ id: u.id, name: u.name }))}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
