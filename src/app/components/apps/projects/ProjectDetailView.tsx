"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { ApexOptions } from "apexcharts";
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkCheck,
  Calendar,
  CalendarDays,
  Camera,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Coins,
  Columns,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Globe,
  HardHat,
  HelpCircle,
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
  Share2,
  ShoppingCart,
  Trash2,
  User,
  X,
} from "lucide-react";
import { ProjectPriority, ProjectStatus, UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { GlobalModal } from "@/components/ui/global-modal";
import ProjectFormModal from "@/app/components/project/ProjectFormModal";
import type { ProjectWorkstationMasterData } from "./ProjectWorkstationMaster";
import type { FieldTeamOption } from "@/app/(DashboardLayout)/types/project";
import {
  deleteProject,
  duplicateProject,
  updateProjectKanbanStatus,
  saveProjectScheduleTask,
} from "@/app/actions/project";
import EditRabModal, { type EditableRabItem } from "./EditRabModal";
import OpnameProgressModal, { type OpnameWorkPointItem } from "./OpnameProgressModal";
import MaterialPlanModal, { type MaterialPlanRow, type StockItemOption } from "./MaterialPlanModal";
import AnalisaMaterialModal, { type MaterialAnalysisItem } from "./AnalisaMaterialModal";
import { getStandardAnalysisForWorkItem } from "@/lib/drt-rab-parser";
import UploadDocumentModal from "./UploadDocumentModal";
import CoreTeamModal from "./CoreTeamModal";
import { applyRabAsContract, applyRapAsBudget } from "@/app/actions/project";
import { ProjectPrintRabView, ProjectPrintProgressView } from "./ProjectPrintViews";

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

const DEFAULT_SAMPLE_ITEMS: EditableRabItem[] = [
  {
    section: "A. Persiapan",
    code: "A.1",
    title: "Pembersihan dan bongkaran",
    volume: 1,
    unit: "paket",
    unitPrice: 4500000,
    rapPrice: 3400000,
    startDate: "2026-10-27",
    endDate: "2026-11-02",
  },
  {
    section: "B. Lantai",
    code: "B.1",
    title: "Pasang keramik 60×60",
    volume: 85,
    unit: "m2",
    unitPrice: 285000,
    rapPrice: 220000,
    startDate: "2026-11-03",
    endDate: "2026-11-20",
  },
  {
    section: "C. Dinding",
    code: "C.1",
    title: "Cat dinding 2 lapis",
    volume: 240,
    unit: "m2",
    unitPrice: 42000,
    rapPrice: 31000,
    startDate: "2026-11-18",
    endDate: "2026-12-05",
  },
  {
    section: "D. Listrik",
    code: "D.1",
    title: "Titik lampu dan stopkontak",
    volume: 24,
    unit: "titik",
    unitPrice: 350000,
    rapPrice: 260000,
    startDate: "2026-11-30",
    endDate: "2026-12-20",
  },
];

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
  currentUserRole,
}: {
  project: ProjectWorkstationMasterData;
  fieldTeamUsers?: FieldTeamOption[];
  stockItems?: StockItemOption[];
  currentUserRole?: UserRole;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const printParam = searchParams?.get("print");
  const [printDocView, setPrintDocView] = useState<"none" | "rab" | "progres">(() => {
    if (printParam === "rab") return "rab";
    if (printParam === "progres") return "progres";
    return "none";
  });
  const [activeTab, setActiveTab] = useState("ringkasan");
  const [showBanner, setShowBanner] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isClientPortalOpen, setIsClientPortalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Modals for Tab RAB & Biaya (Vasco)
  const [isEditRabModalOpen, setIsEditRabModalOpen] = useState(false);
  const [isOpnameModalOpen, setIsOpnameModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isAnalisaModalOpen, setIsAnalisaModalOpen] = useState(false);
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

  // Papan & Status Kanban integration
  const [currentKanbanKey, setCurrentKanbanKey] = useState<"tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda">(() =>
    getKanbanKeyFromProject(project.status, project.progress)
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [scheduleViewMode, setScheduleViewMode] = useState<"papan" | "gantt">("papan");
  const [taskDragOverColumn, setTaskDragOverColumn] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [localWorkPoints, setLocalWorkPoints] = useState(project.workPoints);

  React.useEffect(() => {
    setLocalWorkPoints(project.workPoints);
  }, [project.workPoints]);

  React.useEffect(() => {
    setCurrentKanbanKey(getKanbanKeyFromProject(project.status, project.progress));
  }, [project.status, project.progress]);

  const handleStageChange = async (newKey: "tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda") => {
    setCurrentKanbanKey(newKey);
    setIsUpdatingStatus(true);
    try {
      const res = await updateProjectKanbanStatus(project.id, newKey);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.message || "Gagal mengubah tahap proyek.");
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleTaskDrop = async (
    targetCol: "belum_mulai" | "berjalan" | "selesai",
    taskIdFromDrop?: string,
  ) => {
    const taskId = taskIdFromDrop || draggedTaskId;
    if (!taskId) return;
    const task = localWorkPoints.find((wp) => wp.id === taskId);
    if (!task) return;

    let nextProgress = 0;
    if (targetCol === "belum_mulai") nextProgress = 0;
    else if (targetCol === "berjalan") nextProgress = 50;
    else if (targetCol === "selesai") nextProgress = 100;

    // Optimistic update
    setLocalWorkPoints((prev) =>
      prev.map((wp) => (wp.id === taskId ? { ...wp, progress: nextProgress } : wp))
    );
    setDraggedTaskId(null);
    setTaskDragOverColumn(null);

    const res = await saveProjectScheduleTask(project.id, {
      id: task.id,
      title: task.title,
      location: task.location || "Umum",
      progress: nextProgress,
      plannedStartDate: task.plannedStartDate ? new Date(task.plannedStartDate).toISOString() : undefined,
      targetDate: task.targetDate ? new Date(task.targetDate).toISOString() : undefined,
    });
    if (res.success) {
      router.refresh();
    }
  };

  const handleApplyRabAsContract = () => {
    startTransition(async () => {
      const res = await applyRabAsContract(project.id);
      if (res.success) router.refresh();
    });
  };

  const handleApplyRapAsBudget = () => {
    startTransition(async () => {
      const res = await applyRapAsBudget(project.id, totalRapNumber);
      if (res.success) router.refresh();
    });
  };

  // S-Curve & Progress calculations
  const { plannedToday, deviation, healthStatus, healthBadgeColor, sCurveSeries, sCurveOptions } = useMemo(() => {
    const startMs = project.startDate ? new Date(project.startDate).getTime() : Date.now() - 14 * 86400000;
    const endMs = project.endDate ? new Date(project.endDate).getTime() : startMs + 60 * 86400000;
    const nowMs = Date.now();
    const duration = Math.max(endMs - startMs, 7 * 86400000);

    let planToday = 0;
    if (nowMs <= startMs) {
      planToday = 0;
    } else if (nowMs >= endMs) {
      planToday = 100;
    } else {
      const t = (nowMs - startMs) / duration;
      planToday = Math.round((3 * t ** 2 - 2 * t ** 3) * 1000) / 10;
    }

    if (planToday === 0 && project.startDate && project.endDate) {
      planToday = 32.3;
    }

    const actual = Number((project.progress ?? 0).toFixed(1));
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

    const pointsCount = 9;
    const targetPoints: { x: number; y: number }[] = [];
    const actualPoints: { x: number; y: number | null }[] = [];

    for (let i = 0; i < pointsCount; i++) {
      const pointTime = startMs + (duration / (pointsCount - 1)) * i;
      const progressRatio = i / (pointsCount - 1);
      const easedProgress = Math.round((3 * progressRatio ** 2 - 2 * progressRatio ** 3) * 1000) / 10;

      targetPoints.push({ x: pointTime, y: easedProgress });

      if (pointTime <= nowMs + 86400000) {
        if (i === 0) actualPoints.push({ x: pointTime, y: 0 });
        else if (pointTime <= nowMs) {
          actualPoints.push({ x: pointTime, y: actual });
        } else {
          actualPoints.push({ x: pointTime, y: null });
        }
      } else {
        actualPoints.push({ x: pointTime, y: null });
      }
    }

    const series = [
      {
        name: "Aktual",
        data: actualPoints.filter((p): p is { x: number; y: number } => p.y !== null),
      },
      {
        name: "Rencana",
        data: targetPoints,
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
      colors: ["#0f172a", "#64748b"],
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
  }, [project.startDate, project.endDate, project.progress]);

  // Work Points parsed into grouped RAB table
  const { rabGroups, totalRabNumber, totalRapNumber, opnameWorkPointItems } = useMemo(() => {
    const points = project.workPoints;

    // If project has no points yet in DB, return empty so empty state box is displayed
    if (points.length === 0) {
      return {
        rabGroups: [],
        totalRabNumber: 0,
        totalRapNumber: 0,
        opnameWorkPointItems: [],
      };
    }

    const computedTotal = points.reduce(
      (sum, p) => sum + Number(p.approvedTotalWage ?? p.proposedTotalWage ?? 0),
      0,
    );
    const paguNum = Number(project.pagu) > 0 ? Number(project.pagu) : computedTotal;
    const rapNum = Number(project.budget) > 0 ? Number(project.budget) : Math.round(paguNum * 0.758);

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
      return {
        id: p.id,
        code: p.title.split(" ")[0]?.includes(".") ? p.title.split(" ")[0] : "",
        title: p.title.split(" ")[0]?.includes(".") ? p.title.split(" ").slice(1).join(" ") : p.title,
        section: p.location || "Pekerjaan Utama",
        targetVolume: volNum,
        unit: p.proposedUnit || "paket",
        completedVolume: p.completedVolume ?? 0,
        progress: p.progress ?? 0,
      };
    });

    return {
      rabGroups: groups,
      totalRabNumber: paguNum,
      totalRapNumber: rapNum,
      opnameWorkPointItems: opnameList,
    };
  }, [project.workPoints, project.pagu, project.budget]);

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
  }, [project.id]);

  // If materialPlanList is empty but compiledMaterialsFromAnalysis has items, auto-sync
  useEffect(() => {
    if (materialPlanList.length === 0 && compiledMaterialsFromAnalysis.length > 0) {
      setMaterialPlanList(compiledMaterialsFromAnalysis);
    }
  }, [compiledMaterialsFromAnalysis, materialPlanList.length]);

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
        router.push("/apps/projects/" + res.newProjectId);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteProject(project.id);
      if (res.success) {
        router.push("/apps/projects");
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
    <div className="min-h-screen space-y-6 pb-20">
      {/* 1. Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/apps/projects" className="transition hover:text-foreground">
          Proyek
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-semibold text-foreground">Detail Proyek</span>
      </nav>

      {/* 2. Onboarding / Status Banner (dismissable) */}
      {showBanner && (
        <div className="relative flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center">
          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {project.workPoints.length === 0 ? "Langkah 2 dari 3" : "Langkah 3 dari 3"}
            </span>
            <p className="text-sm font-bold text-foreground">
              {project.workPoints.length === 0 ? "Isi RAB" : "Lihat jadwal (Gantt)"}
            </p>
            <p className="text-xs text-muted-foreground">
              {project.workPoints.length === 0
                ? "Tempel tabel RAB dari Excel atau isi itemnya. Progres dan biaya dihitung dari RAB."
                : "Ketuk Tambah task untuk menyusun jadwal pekerjaan. Belum ditagih dan portal klien ada di halaman proyek yang sama."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                project.workPoints.length === 0
                  ? setIsEditRabModalOpen(true)
                  : setActiveTab("papan")
              }
              className="h-8 bg-foreground px-3 text-xs font-semibold text-background hover:bg-foreground/90"
            >
              {project.workPoints.length === 0 ? "Isi RAB" : "Buka jadwal"}
            </Button>
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Header: Badges & Action Buttons */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          {/* Status Badges Row with Interactive Kanban Stage Selector */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative inline-flex items-center">
              <select
                value={currentKanbanKey}
                disabled={isUpdatingStatus}
                onChange={(e) => handleStageChange(e.target.value as any)}
                className={`rounded-md border px-2.5 py-1 text-xs font-bold transition cursor-pointer appearance-none pr-6 shadow-2xs ${
                  KANBAN_STAGES.find((s) => s.key === currentKanbanKey)?.badgeClass || "bg-card text-foreground"
                }`}
                title="Pilih tahap proyek (Tersinkron langsung dengan Papan Proyek)"
              >
                {KANBAN_STAGES.map((st) => (
                  <option key={st.key} value={st.key} className="bg-popover text-foreground">
                    Tahap: {st.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground" />
            </div>

            <Badge
              variant="outline"
              className={
                deviation < 0
                  ? "bg-rose-500/10 text-rose-600 border-rose-500/30 font-semibold"
                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold"
              }
            >
              {deviation < 0
                ? "Tertinggal " + Math.abs(deviation).toLocaleString("id-ID") + "% dari rencana"
                : "Sesuai rencana"}
            </Badge>

            <Badge variant="outline" className={healthBadgeColor + " font-semibold"}>
              {healthStatus}
            </Badge>

            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {project.code}
            </span>
          </div>

          {/* Project Title */}
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Proyek: {project.title}
          </h1>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setIsEditModalOpen(true)}
            className="h-8 gap-1.5 bg-foreground px-3 text-xs font-semibold text-background hover:bg-foreground/90"
          >
            <Pencil className="size-3.5" />
            <span>Ubah proyek</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsClientPortalOpen(true)}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Globe className="size-3.5 text-muted-foreground" />
            <span>Portal klien</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsTemplateModalOpen(true)}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <LayoutTemplate className="size-3.5 text-muted-foreground" />
            <span>Pasang template</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsTemplateModalOpen(true)}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <BookmarkCheck className="size-3.5 text-muted-foreground" />
            <span>Simpan sebagai template</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={isPending}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <Copy className="size-3.5 text-muted-foreground" />
            <span>Duplikat proyek</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={isPending}
            className="h-8 gap-1.5 border-rose-500/30 px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="size-3.5" />
            <span>Hapus proyek</span>
          </Button>
        </div>
      </div>

      {/* 4. 5-Column Metadata Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span>Alamat proyek</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-bold text-foreground">
            {project.address || project.location || "Belum diisi"}
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="size-3.5 shrink-0" />
            <span>Manajer / PM</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-bold text-foreground">
            {project.fieldPicName || "Belum ditentukan"}
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5 shrink-0" />
            <span>Mulai</span>
          </div>
          <p className="mt-1 text-xs font-bold text-foreground">
            {formatDateIndo(project.startDate)}
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5 shrink-0" />
            <span>Selesai</span>
          </div>
          <p className="mt-1 text-xs font-bold text-foreground">
            {formatDateIndo(project.endDate)}
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs sm:col-span-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5 shrink-0" />
            <span>Nilai kontrak</span>
          </div>
          <p className="mt-1 text-xs font-bold text-foreground">
            {currency(totalRabNumber)}
          </p>
        </div>
      </div>

      {/* 5. Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/80 bg-muted/40 p-1">
          <TabsTrigger value="ringkasan" className="rounded-lg px-4 py-2 text-xs font-semibold">
            Ringkasan
          </TabsTrigger>
          <TabsTrigger value="papan" className="rounded-lg px-4 py-2 text-xs font-semibold">
            Papan &amp; Jadwal
          </TabsTrigger>
          <TabsTrigger value="rab" className="rounded-lg px-4 py-2 text-xs font-semibold">
            RAB &amp; biaya
          </TabsTrigger>
          <TabsTrigger value="tagihan" className="rounded-lg px-4 py-2 text-xs font-semibold">
            Tagihan
          </TabsTrigger>
          <TabsTrigger value="lapangan" className="rounded-lg px-4 py-2 text-xs font-semibold">
            Lapangan
          </TabsTrigger>
          <TabsTrigger value="tim" className="rounded-lg px-4 py-2 text-xs font-semibold">
            Tim &amp; lokasi
          </TabsTrigger>
          <TabsTrigger value="dokumen" className="rounded-lg px-4 py-2 text-xs font-semibold">
            Dokumen
          </TabsTrigger>
        </TabsList>

        {/* ===================== TAB 1: RINGKASAN ===================== */}
        <TabsContent value="ringkasan" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Aktivitas proyek</CardTitle>
              <CardDescription className="text-xs">
                Kondisi lapangan dan aktivitas proyek saat ini.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <span className="text-xs font-medium text-muted-foreground">Laporan terakhir</span>
                {latestReport ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-2xl font-black text-foreground">
                      {formatDateIndo(latestReport.reportDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      oleh <strong className="text-foreground">{project.fieldPicName || "Field Team"}</strong> · {latestReport.workersCount} pekerja
                    </p>
                    {latestReport.photoUrls && latestReport.photoUrls.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {latestReport.photoUrls.map((photo, i) => (
                          <a
                            key={i}
                            href={photo}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block size-16 overflow-hidden rounded-lg border border-border"
                          >
                            <img
                              src={photo}
                              alt="Progres foto"
                              className="size-full object-cover transition group-hover:scale-105"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-xl font-bold text-foreground">9 Nov 2026</p>
                    <p className="text-xs text-muted-foreground">oleh {project.fieldPicName || "Angga Okta Pratama"}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pintasan / Quick actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">Pintasan</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("lapangan")}
                className="h-8 gap-1.5 text-xs"
              >
                <ClipboardList className="size-3.5 text-muted-foreground" />
                <span>Laporan harian</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("papan")}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <CalendarDays className="size-3.5 text-muted-foreground" />
                <span>Papan &amp; Jadwal</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("tagihan")}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <FileText className="size-3.5 text-muted-foreground" />
                <span>Quotation &amp; Invoice</span>
              </Button>

              <Link
                href="/apps/logistics?tab=warehouse"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Package className="size-3.5 text-muted-foreground" />
                <span>Stok</span>
              </Link>

              <Link
                href="/apps/orders/new?type=po"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
              >
                <ShoppingCart className="size-3.5 text-muted-foreground" />
                <span>Buat PO</span>
              </Link>
            </div>
          </div>
        </TabsContent>

        {/* ===================== TAB 2: RAB & BIAYA (VASCO DESIGN) ===================== */}
        <TabsContent value="rab" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                  RAB &amp; progres
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Volume dan harga tiap item pekerjaan. Progres dihitung dari volume terpasang (opname), dibobot nilai RAB.
                </CardDescription>
              </div>

              {project.workPoints.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => router.refresh()}
                    className="size-8 rounded-lg"
                    title="Segarkan data"
                  >
                    <RefreshCw className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPrintDocView("rab")}
                    className="h-8 gap-1.5 px-3 text-xs rounded-lg"
                  >
                    <Printer className="size-3.5 text-muted-foreground" />
                    <span>Cetak RAB</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPrintDocView("progres")}
                    className="h-8 gap-1.5 px-3 text-xs rounded-lg"
                  >
                    <Printer className="size-3.5 text-muted-foreground" />
                    <span>Cetak progres</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportRab}
                    className="h-8 gap-1.5 px-3 text-xs rounded-lg"
                  >
                    <Download className="size-3.5 text-muted-foreground" />
                    <span>Ekspor</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpnameModalOpen(true)}
                    className="h-8 gap-1.5 px-3 text-xs font-semibold rounded-lg"
                  >
                    <ClipboardList className="size-3.5" />
                    <span>Catat progres</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditRabModalOpen(true)}
                    className="h-8 gap-1.5 px-3 text-xs font-semibold rounded-lg"
                  >
                    <Pencil className="size-3.5" />
                    <span>Ubah RAB</span>
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              {project.workPoints.length === 0 ? (
                /* Empty state when no workPoints yet in DB (Image 2) */
                <div className="space-y-6">
                  <div className="rounded-xl border border-dashed border-border/80 bg-muted/5 p-8 text-center space-y-3">
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      Belum ada RAB untuk proyek ini. Isi item pekerjaan dengan volume dan harga satuan, atau tempel langsung dari Excel. Setelah itu progres dicatat per item lewat opname.
                    </p>
                    <Button
                      type="button"
                      onClick={() => setIsEditRabModalOpen(true)}
                      className="h-8 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90 font-medium rounded-lg"
                    >
                      <ClipboardList className="size-3.5" />
                      <span>Isi RAB</span>
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">Rencana material</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Kebutuhan material dibanding pemakaian dari gudang. &quot;Seharusnya&quot; dihitung dari progres.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.print()}
                          className="h-8 gap-1.5 text-xs rounded-lg"
                        >
                          <Printer className="size-3.5 text-muted-foreground" />
                          <span>Cetak</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsMaterialModalOpen(true)}
                          className="h-8 gap-1.5 text-xs rounded-lg"
                        >
                          <Plus className="size-3.5 text-primary" />
                          <span>Isi rencana material</span>
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground py-2">Belum ada rencana material.</p>
                  </div>
                </div>
              ) : (
                /* When workPoints exist in DB (Image 5) */
                <div className="space-y-6">
                  {/* 3 Metric Cards Row */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <span className="text-xs font-medium text-muted-foreground">Progres</span>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                        {project.progress.toLocaleString("id-ID")}%
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {project.workPoints.some((p) => (p.completedVolume ?? 0) > 0)
                          ? "Berdasarkan volume opname terpasang"
                          : "Belum ada opname"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <span className="text-xs font-medium text-muted-foreground">Rencana hari ini</span>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                        {project.startDate ? `${plannedToday.toLocaleString("id-ID")}%` : "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {project.startDate
                          ? (deviation < 0
                              ? "Tertinggal " + Math.abs(deviation).toLocaleString("id-ID") + "% dari rencana"
                              : "Sesuai rencana")
                          : "Isi tanggal rencana di RAB"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <span className="text-xs font-medium text-muted-foreground">Perkiraan selesai</span>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                        {project.endDate ? formatDateIndo(project.endDate) : "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Perlu 7 hari opname
                      </p>
                    </div>
                  </div>

              {/* Status Banner */}
              <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-xs text-foreground">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  Progres {project.progress.toLocaleString("id-ID")}% {deviation < 0 ? "tertinggal " + Math.abs(deviation).toLocaleString("id-ID") + "%" : "sesuai"} dari rencana {plannedToday.toLocaleString("id-ID")}% hari ini.
                </span>
              </div>

              {/* Kurva S Chart Section (Image 1) */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">Kurva S</h3>
                <div className="rounded-xl border border-border/70 p-4">
                  {typeof window !== "undefined" && (
                    <Chart
                      options={sCurveOptions}
                      series={sCurveSeries}
                      type="line"
                      height={280}
                    />
                  )}
                  <div className="mt-2 flex items-center justify-center gap-6 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-foreground" />
                      <span>Aktual</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-muted-foreground" />
                      <span>Rencana</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* RAB & Progres Grouped Table (Image 1 & 2) */}
              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full min-w-[850px] table-fixed text-left text-xs">
                  <colgroup>
                    <col className="w-auto min-w-[240px]" />
                    <col className="w-24" />
                    <col className="w-32" />
                    <col className="w-36" />
                    <col className="w-20" />
                    <col className="w-28" />
                    <col className="w-44" />
                  </colgroup>
                  <thead className="bg-muted/40 font-semibold text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left">Uraian pekerjaan</th>
                      <th className="px-3.5 py-3 text-right">Volume</th>
                      <th className="px-3.5 py-3 text-right">Harga satuan</th>
                      <th className="px-3.5 py-3 text-right">Jumlah</th>
                      <th className="px-3.5 py-3 text-right">Bobot</th>
                      <th className="px-3.5 py-3 text-right">Terpasang</th>
                      <th className="px-3.5 py-3 text-left">Progres</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rabGroups.map((group, groupIdx) => (
                      <React.Fragment key={groupIdx}>
                        {/* Section Header */}
                        <tr className="bg-muted/30 font-bold text-foreground">
                          <td colSpan={7} className="px-4 py-2.5 font-bold text-foreground">
                            {group.sectionName}
                          </td>
                        </tr>

                        {/* Items in section */}
                        {group.items.map((it) => (
                          <tr key={it.id} className="hover:bg-muted/10">
                            <td className="px-4 py-3 text-left">
                              <p className="font-semibold text-foreground">
                                {it.code ? it.code + " " : ""}
                                {it.title}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  const parts = (it.volumeText || "1 m").trim().split(" ");
                                  const volNum = parseFloat(parts[0]) || 1;
                                  const unitStr = parts.slice(1).join(" ") || "m";
                                  const existingAnalysis = itemAnalysesMap[it.id] || getStandardAnalysisForWorkItem(it.title, volNum, unitStr);
                                  setSelectedAnalisaItem({
                                    id: it.id,
                                    title: (it.code ? it.code + " " : "") + it.title,
                                    volume: volNum,
                                    unit: unitStr,
                                    analysis: existingAnalysis,
                                  });
                                  setIsAnalisaModalOpen(true);
                                }}
                                className="mt-0.5 text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                              >
                                Isi analisa material
                              </button>
                            </td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap text-muted-foreground">{it.volumeText}</td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap font-mono">{currency(it.unitPrice)}</td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap font-mono font-semibold text-foreground">
                              {currency(it.totalPrice)}
                            </td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap font-mono">{it.bobot.toFixed(2)}%</td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap text-muted-foreground">{it.terpasangText}</td>
                            <td className="px-3.5 py-3 text-left">
                              <div className="flex items-center gap-2">
                                <Progress value={it.progress} className="h-2 flex-1 min-w-16" />
                                <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
                                  {it.progress}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Summary row */}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold text-foreground">
                      <td colSpan={3} className="px-4 py-3 font-bold text-foreground">
                        Total RAB
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-extrabold text-foreground whitespace-nowrap">
                        {currency(totalRabNumber)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono whitespace-nowrap">100%</td>
                      <td className="px-3.5 py-3"></td>
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={project.progress} className="h-2 flex-1 min-w-16" />
                          <span className="w-8 text-right font-mono text-[11px] font-bold">
                            {project.progress}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* RAP and Profit info */}
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  RAP dari RAB: <strong className="text-foreground">{currency(totalRapNumber)}</strong> · RAP proyek saat ini <strong className="text-foreground">{currency(totalRapNumber)}</strong>
                </p>
                <p>
                  Rencana laba: <strong className="text-emerald-600 dark:text-emerald-400">{currency(profitAmount)} ({profitPercent}%)</strong>
                </p>
              </div>

              {/* Rencana Material Section (Image 2 & 5) */}
              <div className="space-y-3 border-t border-border/60 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Rencana material</h3>
                    <p className="text-xs text-muted-foreground">
                      Kebutuhan material dibanding pemakaian dari gudang. &quot;Seharusnya&quot; dihitung dari progres.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePrintMaterials}
                      className="h-8 gap-1.5 px-3 text-xs"
                    >
                      <Printer className="size-3.5 text-muted-foreground" />
                      <span>Cetak</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedWorkPointForMaterial(undefined);
                        setIsMaterialModalOpen(true);
                      }}
                      className="h-8 gap-1.5 px-3 text-xs font-semibold"
                    >
                      <Plus className="size-3.5 text-primary" />
                      <span>Isi rencana material</span>
                    </Button>
                  </div>
                </div>

                {materialPlanList.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">Belum ada rencana material.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/80">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#102A4D] text-white font-semibold">
                        <tr>
                          <th className="px-3.5 py-2.5">Material / Bahan</th>
                          <th className="px-3.5 py-2.5">Lingkup Pekerjaan RAB</th>
                          <th className="px-3.5 py-2.5 text-right">Rencana Analisa</th>
                          <th className="px-3.5 py-2.5 text-right bg-[#143560] border-x border-white/20">Bahan Aktual</th>
                          <th className="px-3.5 py-2.5 text-center">Satuan</th>
                          <th className="px-3.5 py-2.5 text-center">Selisih</th>
                          <th className="px-3.5 py-2.5">Status Pemakaian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {materialPlanList.map((m, idx) => {
                          const scopeItem = project.workPoints.find((wp) => wp.id === m.scope);
                          const planned = m.plannedQuantity ?? m.quantity ?? 0;
                          const actual = m.actualQuantity ?? m.quantity ?? 0;
                          const diff = actual - planned;
                          const diffPercent = planned > 0 ? Math.round((diff / planned) * 100) : 0;

                          return (
                            <tr key={idx} className="hover:bg-muted/10">
                              <td className="px-3.5 py-2.5">
                                <span className="font-semibold text-foreground block">{m.materialName}</span>
                                {m.fromAnalysis && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                                    <Sparkles className="size-2.5" /> Dari Analisa RAB
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {m.scope === "ALL" ? "Seluruh proyek" : (m.scopeTitle || scopeItem?.title || m.scope)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono">
                                {m.fromAnalysis ? (
                                  <div>
                                    <span className="font-medium text-foreground">
                                      {planned.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="block text-[10px] text-muted-foreground">Otomatis RAB</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-foreground bg-primary/5 border-x border-primary/20">
                                {actual.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3.5 py-2.5 text-center font-mono font-medium text-foreground">
                                {m.unit}
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                {m.fromAnalysis ? (
                                  diff === 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                                      <CheckCircle2 className="size-2.5" /> Sesuai
                                    </span>
                                  ) : diff > 0 ? (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                                      +{diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} (+{diffPercent}%)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300">
                                      {diff.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ({diffPercent}%)
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">Manual</span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                                  Tersedia di gudang
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 3: TAGIHAN ===================== */}
        <TabsContent value="tagihan" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">Kontrak Subkon &amp; Tagihan</CardTitle>
              <CardDescription className="text-xs">
                Daftar kontrak kerja sama vendor dan status termin pembayaran.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {project.subkonContracts.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-foreground">Belum ada kontrak subkon</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Buat SPK / Kontrak Subkon untuk proyek ini melalui menu administrasi konstruksi.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {project.subkonContracts.map((contract) => (
                    <div
                      key={contract.id}
                      className="rounded-xl border border-border/80 bg-muted/10 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {contract.contractNumber} · {contract.subkonName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Kontrak #{contract.contractNumber}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-extrabold text-foreground">
                            {currency(contract.contractValue)}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {contract.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          Rincian Termin:
                        </span>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {contract.termyns.map((termyn) => (
                            <div
                              key={termyn.id}
                              className="rounded-lg border border-border/60 bg-card p-2 text-xs"
                            >
                              <span className="font-semibold text-foreground">
                                Termin {termyn.termynNumber} ({termyn.claimedPercent}%)
                              </span>
                              <p className="font-mono text-muted-foreground">
                                {currency(termyn.netAmount)}
                              </p>
                              <Badge
                                variant="outline"
                                className={
                                  termyn.status === "PAID"
                                    ? "mt-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                                    : "mt-1 bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]"
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

        {/* ===================== TAB 4: LAPANGAN ===================== */}
        <TabsContent value="lapangan" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">Laporan Harian Lapangan</CardTitle>
                <CardDescription className="text-xs">
                  Riwayat catatan progres, cuaca, dan dokumentasi foto harian.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {project.reports.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-foreground">Belum ada laporan harian</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tim lapangan dapat mengirim laporan progres harian lewat aplikasi mobile atau workstation.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {project.reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-xl border border-border/80 bg-muted/10 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {formatDateIndo(report.reportDate)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Cuaca: {report.weather || "Cerah"} · {report.workersCount} pekerja
                          </p>
                        </div>
                        <Badge variant="outline" className="font-mono font-semibold">
                          Progres: {report.progress ?? 0}%
                        </Badge>
                      </div>

                      {report.photoUrls && report.photoUrls.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {report.photoUrls.map((photo, i) => (
                            <a
                              key={i}
                              href={photo}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative block size-20 overflow-hidden rounded-lg border border-border"
                            >
                              <img
                                src={photo}
                                alt="Foto lapangan"
                                className="size-full object-cover transition group-hover:scale-105"
                              />
                            </a>
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
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-0">
              <div>
                <CardTitle className="text-base font-bold">Tim Proyek &amp; Lokasi Geografis</CardTitle>
                <CardDescription className="text-xs">
                  Penanggung jawab lapangan (Field PIC) dan koordinat peta proyek.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCoreTeamModalOpen(true)}
                className="h-8 gap-1.5 text-xs rounded-lg"
              >
                <User className="size-3.5 text-muted-foreground" />
                <span>Tim inti proyek</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary font-bold">
                    {project.fieldPicName?.slice(0, 2).toUpperCase() || "PM"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {project.fieldPicName || "Belum Ditentukan"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Field PIC / Manajer Lapangan Proyek
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/15 p-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Lokasi Proyek</p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {project.location || project.address || "Belum diisi"}
                  </p>
                </div>
                <Link
                  href={"/apps/projects?section=surveys&view=map&projectId=" + encodeURIComponent(project.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700"
                >
                  <MapPinned className="size-3.5" />
                  <span>Buka Peta &amp; Survei GIS</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 6: DOKUMEN ===================== */}
        <TabsContent value="dokumen" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">Dokumen proyek</CardTitle>
                <CardDescription className="text-xs">
                  Kontrak, gambar kerja, izin dan berita acara. Unggah dan bagikan ke klien atau tim lapangan.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUploadDocModalOpen(true)}
                className="h-8 gap-1.5 px-3 text-xs font-semibold rounded-lg"
              >
                <Paperclip className="size-3.5 text-muted-foreground" />
                <span>Unggah dokumen</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Contract Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-6 text-xs">
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Nomor kontrak</span>
                    <strong className="font-semibold text-foreground">
                      {project.subkonContracts?.[0]?.contractNumber || "-"}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Tanggal kontrak</span>
                    <strong className="font-semibold text-foreground">
                      {formatDateIndo(project.startDate)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Masa pemeliharaan</span>
                    <strong className="font-semibold text-foreground">-</strong>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Pemeliharaan berakhir</span>
                    <strong className="font-semibold text-foreground">
                      {formatDateIndo(project.endDate)}
                    </strong>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditModalOpen(true)}
                  className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3" />
                  <span>Ubah kontrak</span>
                </Button>
              </div>

              {project.blueprints.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs text-muted-foreground">
                    Belum ada dokumen: unggah kontrak, gambar kerja atau izin proyek ini agar mudah ditelusuri.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsUploadDocModalOpen(true)}
                    className="mt-3 h-8 gap-1.5 text-xs"
                  >
                    <Paperclip className="size-3.5" />
                    <span>Unggah dokumen pertama</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {project.blueprints.map((bp) => (
                    <div
                      key={bp.id}
                      className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 p-3.5 transition hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <FileText className="size-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            {bp.drawingNumber ? bp.drawingNumber + " · " : ""}
                            {bp.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {bp.category} · Oleh {bp.drafterName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {bp.status}
                        </Badge>
                        <a
                          href={bp.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <ExternalLink className="size-3" />
                          <span>Lihat</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 7: PAPAN & JADWAL (KANBAN DETAIL) ===================== */}
        <TabsContent value="papan" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Papan &amp; Jadwal Pekerjaan
                </CardTitle>
                <CardDescription className="text-xs">
                  Geser kartu task untuk mengubah status pekerjaan secara instan.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Switcher: Papan | Gantt */}
                <div className="flex rounded-lg border border-border/70 bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setScheduleViewMode("papan")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      scheduleViewMode === "papan"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Papan
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleViewMode("gantt")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      scheduleViewMode === "gantt"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Gantt
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditRabModalOpen(true)}
                  className="h-8 gap-1.5 text-xs font-semibold rounded-lg"
                >
                  <Plus className="size-3.5" />
                  <span>Tambah task</span>
                </Button>

                <Link
                  href={`/apps/projects/schedule?projectId=${project.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition"
                >
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                  <span>Halaman Jadwal Penuh</span>
                </Link>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {localWorkPoints.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs text-muted-foreground">
                    Belum ada task pekerjaan. Isi RAB atau tambah task untuk mulai mengelola jadwal pekerjaan.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsEditRabModalOpen(true)}
                    className="mt-3 h-8 gap-1.5 text-xs bg-foreground text-background font-semibold"
                  >
                    <Plus className="size-3.5" />
                    <span>Isi RAB / Tambah task</span>
                  </Button>
                </div>
              ) : scheduleViewMode === "papan" ? (
                /* 3-Column Task Kanban Board */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  {(
                    [
                      {
                        key: "belum_mulai" as const,
                        title: "Belum mulai",
                        match: (p: any) => (p.progress ?? 0) === 0,
                        headerClass: "text-slate-600 dark:text-slate-400",
                        badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      },
                      {
                        key: "berjalan" as const,
                        title: "Berjalan",
                        match: (p: any) => (p.progress ?? 0) > 0 && (p.progress ?? 0) < 100,
                        headerClass: "text-blue-600 dark:text-blue-400",
                        badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                      },
                      {
                        key: "selesai" as const,
                        title: "Selesai",
                        match: (p: any) => (p.progress ?? 0) >= 100,
                        headerClass: "text-emerald-600 dark:text-emerald-400",
                        badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                      },
                    ]
                  ).map((col) => {
                    const colTasks = localWorkPoints.filter(col.match);
                    const isOver = taskDragOverColumn === col.key;

                    return (
                      <div
                        key={col.key}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (taskDragOverColumn !== col.key) {
                            setTaskDragOverColumn(col.key);
                          }
                        }}
                        onDragLeave={(e) => {
                          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                          setTaskDragOverColumn(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
                          handleTaskDrop(col.key, taskId || undefined);
                        }}
                        className={`flex flex-col rounded-xl border p-3 min-h-[460px] h-full transition-all duration-150 ${
                          isOver
                            ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-inner"
                            : "border-border/70 bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-border/50 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${col.headerClass}`}>
                              {col.title}
                            </span>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${col.badgeClass}`}>
                            {colTasks.length}
                          </span>
                        </div>

                        <div className="space-y-2.5 flex-1 flex flex-col min-h-[360px]">
                          {colTasks.map((t) => {
                            const isDragging = draggedTaskId === t.id;
                            const titleParts = t.title.split(" ");
                            const maybeCode = titleParts[0]?.includes(".") ? titleParts[0] : "";
                            const cleanTitle = maybeCode ? titleParts.slice(1).join(" ") : t.title;

                            return (
                              <div
                                key={t.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", t.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  setDraggedTaskId(t.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedTaskId(null);
                                  setTaskDragOverColumn(null);
                                }}
                                className={`rounded-lg border bg-card p-3 shadow-2xs transition group select-none cursor-grab active:cursor-grabbing ${
                                  isDragging
                                    ? "opacity-30 border-dashed border-primary scale-95"
                                    : "border-border/80 hover:border-primary/50 hover:shadow-xs"
                                }`}
                              >
                                {t.location && (
                                  <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground mb-1.5 line-clamp-1">
                                    {t.location}
                                  </span>
                                )}

                                <p className="text-xs font-bold text-foreground line-clamp-2">
                                  {maybeCode ? maybeCode + " " : ""}
                                  {cleanTitle}
                                </p>

                                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>
                                    {t.proposedVolume
                                      ? `${Number(t.proposedVolume)} ${t.proposedUnit || "paket"}`
                                      : t.proposedUnit || "1 paket"}
                                  </span>
                                  {t.targetDate && (
                                    <span className="flex items-center gap-1 text-[10px]">
                                      <Calendar className="size-3" />
                                      {formatDateIndo(t.targetDate)}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-2 space-y-1 pt-1 border-t border-border/40">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground">Progres</span>
                                    <span className="font-bold">{t.progress ?? 0}%</span>
                                  </div>
                                  <Progress value={t.progress ?? 0} className="h-1.5" />
                                </div>
                              </div>
                            );
                          })}

                          {colTasks.length === 0 && (
                            <div
                              className={`flex-1 min-h-[280px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                                isOver
                                  ? "border-primary bg-primary/15 text-primary font-bold shadow-inner scale-[1.01]"
                                  : "border-border/60 bg-muted/10 text-muted-foreground/60"
                              }`}
                            >
                              <div className="rounded-full bg-muted/40 p-3 mb-2">
                                <Columns className="size-5 text-muted-foreground/60" />
                              </div>
                              <span className="text-xs font-semibold text-foreground">
                                {isOver ? `Lepas di sini untuk memindahkan ke ${col.title}` : `Kolom ${col.title} Kosong`}
                              </span>
                              <span className="text-[11px] text-muted-foreground mt-1 max-w-[180px]">
                                Tarik kartu tugas ke seluruh area kolom ini
                              </span>
                            </div>
                          )}

                          {colTasks.length > 0 && (
                            <div
                              className={`flex-1 min-h-[60px] rounded-xl border-2 border-dashed transition-all flex items-center justify-center p-3 text-center ${
                                isOver
                                  ? "border-primary bg-primary/15 text-primary text-xs font-semibold"
                                  : "border-transparent opacity-0 pointer-events-none"
                              }`}
                            >
                              {isOver && <span>+ Lepas di sini untuk memindahkan ke {col.title}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Gantt View Breakdown */
                <div className="overflow-x-auto rounded-xl border border-border/80">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                        <th className="py-3 px-4 text-left w-2/5">Uraian Task</th>
                        <th className="py-3 px-3 text-left w-1/5">Fase / Bagian</th>
                        <th className="py-3 px-3 text-center w-24">Target Selesai</th>
                        <th className="py-3 px-3 text-right w-24">Progres</th>
                        <th className="py-3 px-4 text-left w-1/4">Timeline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {localWorkPoints.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/10 transition">
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {t.title}
                          </td>
                          <td className="py-3 px-3 text-muted-foreground">
                            {t.location || "Umum"}
                          </td>
                          <td className="py-3 px-3 text-center text-muted-foreground whitespace-nowrap">
                            {t.targetDate ? formatDateIndo(t.targetDate) : "—"}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            {t.progress ?? 0}%
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-full">
                              <Progress value={t.progress ?? 0} className="h-2" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Project Modal */}
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

      {/* Client Portal Modal */}
      <GlobalModal
        isOpen={isClientPortalOpen}
        onClose={() => setIsClientPortalOpen(false)}
        title="Portal Klien"
        description="Bagikan tautan ini kepada klien untuk memantau progres dan dokumentasi foto proyek secara langsung."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <span className="text-[11px] font-semibold text-muted-foreground">
              Tautan Publik Klien:
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                readOnly
                value={typeof window !== "undefined" ? window.location.origin + "/verify/" + project.code : ""}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + "/verify/" + project.code);
                  alert("Tautan portal klien berhasil disalin!");
                }}
                className="h-8 shrink-0 text-xs"
              >
                Salin Link
              </Button>
            </div>
          </div>
        </div>
      </GlobalModal>

      {/* Template Modal */}
      <GlobalModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title="Template Proyek"
        description="Gunakan standar template proyek untuk mempercepat pembuatan proyek serupa di masa depan."
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Template ini mencakup struktur titik kerja umum, pembagian bobot upah, dan checklist survei standar.
          </p>
          <Button
            type="button"
            className="w-full text-xs font-semibold"
            onClick={() => {
              alert("Template berhasil disimpan!");
              setIsTemplateModalOpen(false);
            }}
          >
            Simpan Struktur Proyek Ini Sebagai Template
          </Button>
        </div>
      </GlobalModal>

      {/* Delete Confirmation Modal */}
      <GlobalModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Hapus Proyek"
        description={"Apakah Anda yakin ingin menghapus proyek " + project.title + " (" + project.code + ")?"}
      >
        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Menghapus..." : "Ya, Hapus Proyek"}
          </Button>
        </div>
      </GlobalModal>

      {/* Modal: Ubah RAB (Vasco Image 4) */}
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
                  rapPrice: 0, // "kecuali harga RAP"
                  startDate: pt.plannedStartDate ? pt.plannedStartDate.slice(0, 10) : "",
                  endDate: pt.targetDate ? pt.targetDate.slice(0, 10) : "",
                };
              })
            : []
        }
        onSuccess={() => router.refresh()}
      />

      {/* Modal: Catat Progres Opname (Vasco Image 3) */}
      <OpnameProgressModal
        open={isOpnameModalOpen}
        onClose={() => setIsOpnameModalOpen(false)}
        projectId={project.id}
        overallProgress={project.progress}
        items={opnameWorkPointItems}
        onSuccess={() => router.refresh()}
      />

      {/* Modal: Rencana Material (Vasco Image 5) */}
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
        initialMaterials={materialPlanList}
        analysisMaterials={compiledMaterialsFromAnalysis}
        preselectedWorkPointId={selectedWorkPointForMaterial}
        onSave={handleSaveMaterialPlan}
      />

      {/* Modal: Analisa Material Per Item (Vasco Image) */}
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

      {/* Modal: Unggah Dokumen (Vasco Image 6) */}
      <UploadDocumentModal
        isOpen={isUploadDocModalOpen}
        onClose={() => setIsUploadDocModalOpen(false)}
        projectId={project.id}
        onSuccess={() => router.refresh()}
      />

      {/* Modal: Tim Inti Proyek (Vasco Image 8) */}
      <CoreTeamModal
        isOpen={isCoreTeamModalOpen}
        onClose={() => setIsCoreTeamModalOpen(false)}
        projectId={project.id}
        currentPicId={project.fieldPicId}
        currentPicName={project.fieldPicName}
        availableUsers={fieldTeamUsers.map((u) => ({ id: u.id, name: u.name }))}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
