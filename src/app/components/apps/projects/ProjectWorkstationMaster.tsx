"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect, type FormEvent } from "react";
import {
  addProjectProgress,
  assignProjectFieldPic,
  approveProjectWorkPointWage,
  createProjectWorkPoint,
  deleteProject,
  editApprovedProjectWorkPointWage,
  updateProjectKanbanStatus,
} from "@/app/actions/project";
import {
  createBlueprint,
  reviewBlueprint,
  submitSubkonTermyn,
  verifySubkonTermynField,
} from "@/app/actions/construction";
import ProjectFormModal from "@/app/components/project/ProjectFormModal";
import ImportProjectModal from "./ImportProjectModal";
import GISWorkspace from "@/app/components/apps/gis/GISWorkspace";
import type {
  FieldSurveySummary,
  SurveyProjectOption,
} from "@/app/components/apps/gis/SurveySidebar";
import CreateTicketModal from "@/app/components/apps/tickets/CreateTicketModal";
import type { TicketProjectOption } from "@/app/(DashboardLayout)/types/ticket";
import type { FieldTeamOption } from "@/app/(DashboardLayout)/types/project";
import type { ProjectDashboardRow } from "@/app/(DashboardLayout)/types/project";
import { ProjectProgressChart as ProjectProgressByPicChart } from "@/app/components/dashboard/ProjectProgressChart";
import CurrentLocation from "@/app/components/dashboard/CurrentLocation";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePaginationControls,
  TableRow,
} from "@/components/ui/table";
import { GlobalModal } from "@/components/ui/global-modal";
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
import { ProjectPriority, ProjectStatus, UserRole } from "@prisma/client";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import {
  Archive,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Download,
  Ellipsis,
  Eye,
  FileDown,
  FileSpreadsheet,
  HardHat,
  ImageIcon,
  Plus,
  CalendarDays,
  ChartSpline,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MapPinned,
  Search,
  Trash2,
  Upload,
  Pencil,
  Users,
  ExternalLink,
  Printer,
  Filter,
  LayoutTemplate,
  Check,
  Calendar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const workPointFieldClass =
  "flex w-full min-w-0 flex-col items-start gap-1.5 text-left";

function ProjectViewTab({
  value,
  label,
  badge,
  icon: Icon,
}: {
  value: string;
  label: string;
  badge?: string | number;
  icon: LucideIcon;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex h-auto min-h-10 w-full items-center justify-start gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2 text-left text-xs font-semibold text-foreground transition-all hover:border-primary/50 hover:bg-accent hover:text-accent-foreground aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-xs"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span className="ml-auto rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold leading-none dark:bg-white/15">
          {badge}
        </span>
      )}
    </TabsTrigger>
  );
}

function calculateWorkPointTotal(volumeValue: string, unitPriceValue: string) {
  if (!volumeValue || !unitPriceValue) return "";
  const volume = Number(volumeValue);
  const unitPrice = Number(unitPriceValue);
  if (!Number.isFinite(volume) || !Number.isFinite(unitPrice)) return "";

  const total = Math.round((volume * unitPrice + Number.EPSILON) * 100) / 100;
  return Number.isFinite(total) ? total.toFixed(2) : "";
}

function formatRupiahInput(value: string) {
  const amount = Number(value);
  if (!value || !Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

function RupiahInput({
  name,
  value,
  onValueChange,
}: {
  name: string;
  value: string;
  onValueChange: (value: string, form: HTMLFormElement | null) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="flex h-10 w-full items-center overflow-hidden rounded-lg border border-border bg-transparent focus-within:border-primary">
      <span className="pl-3 text-sm text-muted-foreground">Rp</span>
      <Input
        type="text"
        inputMode="decimal"
        value={isFocused ? value.replace(".", ",") : formatRupiahInput(value)}
        required
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => {
          const enteredValue = event.currentTarget.value.replace(",", ".");
          if (/^\d*(?:\.\d{0,2})?$/.test(enteredValue)) {
            onValueChange(enteredValue, event.currentTarget.closest("form"));
          }
        }}
        aria-label={name === "proposedUnitPrice" ? "Harga satuan Rupiah" : "Total upah Rupiah"}
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-foreground focus-visible:border-0 focus-visible:ring-0"
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export type ProjectWorkstationMasterData = {
  id: string;
  code: string;
  address: string;
  title: string;
  name: string;
  kelompokTani: string;
  jenisPekerjaan: string | null;
  location: string | null;
  fieldPicId: string | null;
  fieldPicName: string | null;
  fieldPicPhotoUrl: string | null;
  status: ProjectStatus;
  progress: number;
  pagu: string;
  landArea: string | null;
  priority: ProjectPriority;
  vendor: string | null;
  clientName: string | null;
  budget: string | null;
  realized: string;
  startDate: string | null;
  endDate: string | null;
  reports: {
    id: string;
    reportDate: string;
    weather: string | null;
    workersCount: number;
    progress: number | null;
    workPointId: string | null;
    dailyVolume: number | null;
    workSummary: string | null;
    notes: string | null;
    photoUrls: string[];
  }[];
  workPoints: {
    id: string;
    title: string;
    location: string | null;
    plannedStartDate: string | null;
    targetDate: string | null;
    progress: number;
    proposedVolume: string | null;
    proposedUnit: string | null;
    completedVolume: number | null;
    proposedTotalWage: string;
    approvedTotalWage: string | null;
    wageAuditLogs: {
      id: string;
      oldWage: string;
      newWage: string;
      reason: string | null;
      createdAt: string;
      changedByName: string;
    }[];
    progressReports: {
      id: string;
      reportDate: string;
      progress: number;
      workSummary: string | null;
      photoUrls: string[];
    }[];
  }[];
  wageTicketPayments: {
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    amount: string | null;
    paid: boolean;
    paidAt: string | null;
    requesterName: string;
  }[];
  blueprints: {
    id: string;
    publicCode: string;
    drawingNumber: string;
    title: string;
    category: string;
    revision: string;
    fileUrl: string;
    status: string;
    drafterName: string;
  }[];
  subkonContracts: {
    id: string;
    publicCode: string;
    contractNumber: string;
    subkonName: string;
    contractValue: string;
    status: string;
    termyns: {
      id: string;
      termynNumber: number;
      claimedPercent: string;
      grossAmount: string;
      retentionAmount: string;
      netAmount: string;
      status: string;
    }[];
  }[];
  bastDocuments: {
    publicCode: string;
    bastNumber: string;
    type: string;
    date: string;
    isApproved: boolean;
  }[];
};

const currency = (amount: number | string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount));

const formatVolume = (amount: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(amount);

const PROJECTS_PER_PAGE = 5;

const formatProjectDate = (date: string | null) =>
  date
    ? new Date(`${date}T00:00:00.000Z`).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Belum ditentukan";

const statusLabels: Record<string, string> = {
  PENDING_SETUP: "Menunggu Setup",
  RUNNING: "Berjalan",
  PENDING: "Menunggu Setup",
  PLANNED: "Menunggu Setup",
  ON_PROGRESS: "Berjalan",
  ACTIVE: "Berjalan",
  TERHAMBAT: "Terhambat",
  ON_HOLD: "Ditunda",
  DONE: "Selesai",
  COMPLETED: "Selesai",
};

const sCurveOptions: ApexOptions = {
  chart: {
    type: "line",
    toolbar: { show: false },
    zoom: { enabled: false },
    fontFamily: "inherit",
    foreColor: "#94a3b8",
  },
  colors: ["#38bdf8", "#f97316"],
  dataLabels: { enabled: false },
  stroke: { curve: "smooth", width: [3, 3.5], dashArray: [4, 0] },
  markers: {
    size: [3, 5],
    strokeWidth: 2,
    hover: { size: 7 },
  },
  grid: {
    borderColor: "rgba(148, 163, 184, 0.16)",
    strokeDashArray: 4,
    xaxis: { lines: { show: true } },
    yaxis: { lines: { show: true } },
  },
  legend: {
    position: "top",
    horizontalAlign: "left",
    labels: { colors: "#94a3b8" },
  },
  xaxis: {
    type: "datetime",
    labels: {
      datetimeUTC: false,
      format: "dd MMM yy",
      style: { colors: "#94a3b8", fontSize: "11px" },
    },
  },
  yaxis: {
    min: 0,
    max: 100,
    tickAmount: 5,
    labels: {
      style: { colors: "#94a3b8", fontSize: "11px" },
      formatter: (value) =>
        typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—",
    },
  },
  tooltip: {
    theme: "dark",
    x: { format: "dd MMM yyyy" },
    y: {
      formatter: (value) =>
        typeof value === "number" && Number.isFinite(value)
          ? `${value.toFixed(1)}%`
          : "Belum ada data",
    },
  },
};

function getStatusBadgeClass(status: string) {
  if (status === "PENDING_SETUP" || status === "PENDING" || status === "PLANNED") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (status === "RUNNING" || status === "ON_PROGRESS" || status === "ACTIVE") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300";
  }
  if (status === "TERHAMBAT" || status === "ON_HOLD") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300";
  }
  if (status === "DONE" || status === "COMPLETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function getSCurveSeries(project: ProjectWorkstationMasterData) {
  const reportDates = project.reports.map((report) => report.reportDate).sort();
  const plannedStartDates = project.workPoints
    .map((point) => point.plannedStartDate)
    .filter((date): date is string => date !== null)
    .sort();
  const targetDates = project.workPoints
    .map((point) => point.targetDate)
    .filter((date): date is string => date !== null)
    .sort();
  const startDate =
    project.startDate ??
    plannedStartDates[0] ??
    reportDates[0] ??
    new Date().toISOString().slice(0, 10);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const fallbackEnd = new Date(start.getTime() + 84 * 86400000)
    .toISOString()
    .slice(0, 10);
  const end = new Date(
    `${project.endDate ?? targetDates.at(-1) ?? fallbackEnd}T00:00:00.000Z`,
  );
  const range = Math.max(end.getTime() - start.getTime(), 7 * 86400000);
  const target = Array.from({ length: 13 }, (_, index) => {
    const progress = index / 12;
    const easedProgress = 3 * progress ** 2 - 2 * progress ** 3;
    return {
      x: start.getTime() + range * progress,
      y: Math.round(easedProgress * 100),
    };
  });
  const progressByDate = new Map<string, Map<string, number>>();
  for (const point of project.workPoints) {
    for (const report of point.progressReports) {
      const progressAtDate = progressByDate.get(report.reportDate) ?? new Map();
      progressAtDate.set(point.id, report.progress);
      progressByDate.set(report.reportDate, progressAtDate);
    }
  }
  const latestPointProgress = new Map<string, number>();
  for (const point of project.workPoints) latestPointProgress.set(point.id, 0);
  const actual = [...progressByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, progressAtDate]) => {
      for (const [pointId, progress] of progressAtDate) {
        latestPointProgress.set(pointId, progress);
      }
      return {
        x: new Date(`${date}T00:00:00.000Z`).getTime(),
        y: latestPointProgress.size > 0
          ? [...latestPointProgress.values()].reduce(
              (sum, progress) => sum + progress,
              0,
            ) / latestPointProgress.size
          : 0,
      };
    });
  if (actual.length === 0) {
    actual.push(
      ...project.reports
        .filter(
          (report): report is typeof report & { progress: number } =>
            report.progress !== null,
        )
        .slice()
        .sort((left, right) => left.reportDate.localeCompare(right.reportDate))
        .map((report) => ({
          x: new Date(`${report.reportDate}T00:00:00.000Z`).getTime(),
          y: report.progress,
        })),
    );
  }
  if (actual.length === 0 && project.progress > 0) {
    actual.push({
      x: Math.max(Date.now(), start.getTime()),
      y: project.progress,
    });
  }
  return [
    { name: "Target Rencana", data: target },
    { name: "Realisasi Aktual", data: actual },
  ];
}

export default function ProjectWorkstationMaster({
  projects,
  fieldTeamUsers,
  currentUserId,
  currentUserRole,
  surveyProjects,
  surveys,
  surveyorName,
  captureTime,
  initialSurveyProjectId,
}: {
  projects: ProjectWorkstationMasterData[];
  fieldTeamUsers: FieldTeamOption[];
  currentUserId: string;
  currentUserRole: UserRole;
  surveyProjects: SurveyProjectOption[];
  surveys: FieldSurveySummary[];
  surveyorName: string;
  captureTime: string;
  initialSurveyProjectId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<string>("pagu");
  const [showPicChart, setShowPicChart] = useState(false);
  const [selectedReportWorkPointId, setSelectedReportWorkPointId] =
    useState("");
  const sectionParam = searchParams.get("section");
  const viewParam = searchParams.get("view");
  const projectParam = searchParams.get("projectId");
  const statusParam = searchParams.get("status");
  const projectStatusFilter =
    statusParam && ["RUNNING", "PENDING_SETUP", "HOLD", "DONE"].includes(statusParam)
      ? statusParam
      : "ALL";
  const activeSection = sectionParam === "surveys" ? "surveys" : "projects";
  const surveyView = viewParam === "details" ? "details" : "map";
  const surveyProjectId =
    projectParam === "none"
      ? ""
      : projectParam ?? initialSurveyProjectId ?? surveyProjects[0]?.id ?? "";
  const [editingProject, setEditingProject] =
    useState<ProjectDashboardRow | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [proposedUnitPrice, setProposedUnitPrice] = useState("");
  const [proposedTotalWage, setProposedTotalWage] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectViewMode, setProjectViewMode] = useState<"tabel" | "papan">("tabel");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [blueprintCategory, setBlueprintCategory] = useState("ALL");
  const [blueprintStatus, setBlueprintStatus] = useState("ALL");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  const [projectList, setProjectList] = useState<ProjectWorkstationMasterData[]>(projects);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);

  useEffect(() => {
    setProjectList(projects);
  }, [projects]);

  const kanbanColumns = [
    {
      key: "tender" as const,
      title: "Tender",
      match: (p: ProjectWorkstationMasterData) => p.status === "PENDING_SETUP",
    },
    {
      key: "perencanaan" as const,
      title: "Perencanaan",
      match: (p: ProjectWorkstationMasterData) =>
        p.status === "PENDING" || p.status === "PLANNED",
    },
    {
      key: "berjalan" as const,
      title: "Berjalan",
      match: (p: ProjectWorkstationMasterData) =>
        (p.status === "RUNNING" || p.status === "ON_PROGRESS" || p.status === "ACTIVE") &&
        p.progress < 85,
    },
    {
      key: "hampir_selesai" as const,
      title: "Hampir Selesai",
      match: (p: ProjectWorkstationMasterData) =>
        (p.status === "RUNNING" || p.status === "ON_PROGRESS" || p.status === "ACTIVE") &&
        p.progress >= 85 &&
        p.progress < 100,
    },
    {
      key: "selesai" as const,
      title: "Selesai",
      match: (p: ProjectWorkstationMasterData) => p.status === "DONE" || p.progress >= 100,
    },
    {
      key: "ditunda" as const,
      title: "Ditunda & batal",
      match: (p: ProjectWorkstationMasterData) =>
        p.status === "TERHAMBAT" || (p.status as string) === "ON_HOLD",
    },
  ];

  const handleCardDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedProjectId(id);
  };

  const handleCardDragEnd = () => {
    setDraggedProjectId(null);
    setDragOverColumnKey(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumnKey !== key) {
      setDragOverColumnKey(key);
    }
  };

  const handleColumnDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverColumnKey(null);
  };

  const handleColumnDrop = async (
    e: React.DragEvent,
    targetKey: "tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda",
  ) => {
    e.preventDefault();
    setDragOverColumnKey(null);
    const pId = e.dataTransfer.getData("text/plain") || draggedProjectId;
    setDraggedProjectId(null);
    if (!pId) return;

    const pToMove = projectList.find((p) => p.id === pId);
    if (!pToMove) return;

    let nextStatus: any = pToMove.status;
    let nextProgress = pToMove.progress;

    if (targetKey === "tender") {
      nextStatus = "PENDING_SETUP";
    } else if (targetKey === "perencanaan") {
      nextStatus = "PENDING";
    } else if (targetKey === "berjalan") {
      nextStatus = "RUNNING";
      if (nextProgress >= 85) nextProgress = 50;
    } else if (targetKey === "hampir_selesai") {
      nextStatus = "RUNNING";
      if (nextProgress < 85 || nextProgress >= 100) nextProgress = 90;
    } else if (targetKey === "selesai") {
      nextStatus = "DONE";
      nextProgress = 100;
    } else if (targetKey === "ditunda") {
      nextStatus = "TERHAMBAT";
    }

    const previousList = [...projectList];
    setProjectList((prev) =>
      prev.map((p) =>
        p.id === pId ? { ...p, status: nextStatus, progress: nextProgress } : p,
      ),
    );

    try {
      const res = await updateProjectKanbanStatus(pId, targetKey);
      if (!res.success) {
        setProjectList(previousList);
        alert(res.message || "Gagal memindahkan proyek.");
      }
    } catch (err: any) {
      setProjectList(previousList);
      alert(err?.message || "Gagal memindahkan proyek.");
    }
  };

  const isProjectManager =
    currentUserRole === "ADMINISTRATIONS" || currentUserRole === "DIRECTOR";
  const canViewFinancials = true;

  const runningProjects = projectList.filter(
    (p) => p.status === "RUNNING" || p.status === "ON_PROGRESS" || p.status === "ACTIVE",
  );

  const totalContractRunning = runningProjects.reduce(
    (sum, p) => sum + (parseFloat(p.pagu) || 0),
    0,
  );

  const overdueRunningCount = runningProjects.filter((p) => {
    if (!p.endDate) return false;
    return new Date(p.endDate) < new Date() && p.progress < 100;
  }).length;
  const isFieldTeam =
    currentUserRole === UserRole.FIELD_TEAM ||
    currentUserRole === UserRole.KOORDINATOR;
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;
  const reportWorkPointId =
    activeProject?.workPoints.some(
      (point) => point.id === selectedReportWorkPointId,
    )
      ? selectedReportWorkPointId
      : activeProject?.workPoints[0]?.id ?? "";
  const reportWorkPoint = activeProject?.workPoints.find(
    (point) => point.id === reportWorkPointId,
  );
  const reportTargetVolume = Number(reportWorkPoint?.proposedVolume ?? 0);
  const reportCompletedVolume =
    reportWorkPoint?.completedVolume ??
    (reportTargetVolume * (reportWorkPoint?.progress ?? 0)) / 100;
  const reportRemainingVolume = Math.max(
    0,
    reportTargetVolume - reportCompletedVolume,
  );
  const pendingDeleteProject =
    projects.find((project) => project.id === pendingDeleteProjectId) ?? null;
  const filteredBlueprints = activeProject?.blueprints.filter(
    (blueprint) =>
      (blueprintCategory === "ALL" ||
        blueprint.category === blueprintCategory) &&
      (blueprintStatus === "ALL" || blueprint.status === blueprintStatus),
  ) ?? [];
  const filteredProjects = projectList.filter((project) => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    const matchesStatus =
      projectStatusFilter === "ALL" ||
      (projectStatusFilter === "RUNNING" &&
        ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(project.status)) ||
      (projectStatusFilter === "PENDING_SETUP" &&
        ["PENDING_SETUP", "PENDING", "PLANNED"].includes(project.status)) ||
      (projectStatusFilter === "HOLD" &&
        ["TERHAMBAT", "ON_HOLD"].includes(project.status)) ||
      (projectStatusFilter === "DONE" &&
        ["DONE", "COMPLETED"].includes(project.status));
    return matchesStatus && (
      !query ||
      [
        project.title,
        project.code,
        project.address,
        project.location ?? "",
        project.fieldPicName ?? "",
        project.kelompokTani ?? "",
      ].some((value) => value.toLocaleLowerCase("id-ID").includes(query))
    );
  });
  const projectPageCount = Math.max(
    1,
    Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE),
  );
  const currentProjectPage = Math.min(projectPage, projectPageCount);
  const visibleProjects = filteredProjects.slice(
    (currentProjectPage - 1) * PROJECTS_PER_PAGE,
    currentProjectPage * PROJECTS_PER_PAGE,
  );
  const runningProjectCount = projects.filter((project) =>
    ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(project.status),
  ).length;
  const pendingSetupProjectCount = projects.filter((project) =>
    ["PENDING_SETUP", "PENDING", "PLANNED"].includes(project.status),
  ).length;
  const completedProjectCount = projects.filter((project) =>
    ["DONE", "COMPLETED"].includes(project.status),
  ).length;
  const averageProgress =
    projects.length > 0
      ? projects.reduce((sum, p) => sum + p.progress, 0) / projects.length
      : 0;
  const assignedPicCount = new Set(
    projects
      .map((project) => project.fieldPicId ?? project.fieldPicName)
      .filter((pic): pic is string => Boolean(pic)),
  ).size;
  const ticketProjectOptions: TicketProjectOption[] = projects.map(
    ({ id, title, kelompokTani }) => ({ id, title, kelompokTani }),
  );

  const setStatusFilterUrl = (statusValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (statusValue === "ALL") params.delete("status");
    else params.set("status", statusValue);
    params.set("section", "projects");
    router.replace(`/apps/projects?${params.toString()}`, {
      scroll: false,
    });
    setProjectPage(1);
  };

  const openProjectModal = (
    project: ProjectWorkstationMasterData,
    initialTab?: string,
  ) => {
    setNotice("");
    setActiveProjectId(project.id);
    setSelectedReportWorkPointId(project.workPoints[0]?.id ?? "");
    setActiveModalTab(initialTab ?? "pagu");
  };

  const getExportHref = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams({ format });
    if (search.trim()) params.set("search", search.trim());
    return `/api/projects/export?${params.toString()}`;
  };

  const permanentlyDeleteProject = () => {
    if (!pendingDeleteProjectId) return;
    const projectId = pendingDeleteProjectId;
    setNotice("");
    startTransition(async () => {
      try {
        const result = await deleteProject(projectId);
        setNotice(result.message);
        if (result.success) {
          setConfirmArchiveOpen(false);
          setPendingDeleteProjectId(null);
          if (activeProjectId === projectId) setActiveProjectId(null);
          router.refresh();
        }
      } catch (error) {
        console.error("Permanently deleting project from workstation failed:", error);
        setNotice("Proyek gagal dihapus permanen. Silakan coba kembali.");
      }
    });
  };

  const assignFieldPic = (projectId: string, fieldPicId: string) => {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await assignProjectFieldPic(projectId, fieldPicId);
        setNotice(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Assigning project PIC from workstation failed:", error);
        setNotice("Penunjukan PIC gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const editProject = (project: ProjectWorkstationMasterData) => {
    setEditingProject({
      id: project.id,
      code: project.code,
      name: project.name,
      title: project.title,
      kelompokTani: project.kelompokTani,
      address: project.address,
      jenisPekerjaan: project.jenisPekerjaan,
      pagu: project.pagu,
      landArea: project.landArea,
      progress: project.progress,
      status: project.status,
      vendor: project.vendor,
      priority: project.priority,
      clientName: project.clientName,
      location: project.location,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
      fieldPicId: project.fieldPicId,
      fieldPicName: project.fieldPicName,
      proposedWorkPointWages: "0",
      approvedWorkPointWages: "0",
      progressReports: [],
      workPoints: [],
    });
  };

  const saveReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProject) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const photos = data.getAll("photos").filter((value) => value instanceof File);
    if (photos.length > 5 || photos.some((photo) => photo.size > 5 * 1024 * 1024)) {
      setNotice("Maksimal 5 foto laporan dengan ukuran maksimal 5 MB per foto.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await addProjectProgress(activeProject.id, data);
        setNotice(result.message);
        if (result.success) {
          form.reset();
          router.refresh();
        }
      } catch (error) {
        console.error("Saving project daily report failed:", error);
        setNotice("Laporan gagal disimpan. Periksa data dan coba kembali.");
      }
    });
  };

  const submitWorkPoint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProject) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createProjectWorkPoint(activeProject.id, {
          title: String(data.get("title") ?? ""),
          location: String(data.get("location") ?? ""),
          proposedVolume: String(data.get("proposedVolume") ?? ""),
          proposedUnit: String(data.get("proposedUnit") ?? ""),
          proposedUnitPrice: String(data.get("proposedUnitPrice") ?? ""),
          proposedTotalWage: String(data.get("proposedTotalWage") ?? ""),
          plannedStartDate: String(data.get("plannedStartDate") ?? ""),
          targetDate: String(data.get("targetDate") ?? ""),
        });
        setNotice(result.message);
        if (result.success) {
          form.reset();
          setProposedUnitPrice("");
          setProposedTotalWage("");
          router.refresh();
        }
      } catch (error) {
        console.error("Submitting project wage proposal failed:", error);
        setNotice("Usulan titik dan upah gagal dikirim.");
      }
    });
  };

  const submitBlueprint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProject) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createBlueprint(activeProject.id, data);
        setNotice(result.message);
        if (result.success) {
          form.reset();
          router.refresh();
        }
      } catch (error) {
        console.error("Uploading project blueprint failed:", error);
        setNotice("Gambar kerja gagal diunggah. Silakan coba kembali.");
      }
    });
  };

  const runProjectAction = (
    action: () => Promise<{ success: boolean; message: string }>,
  ) => {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await action();
        setNotice(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Project workstation action failed:", error);
        setNotice("Aksi proyek gagal diproses. Silakan coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {activeSection === "projects" && (
        <header className="overflow-hidden rounded-xl border border-border bg-card p-4 text-foreground shadow-2xs sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Tahap 01 · Proyek &amp; GIS
                </span>
                <CurrentLocation variant="badge" />
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Users className="size-3 shrink-0" aria-hidden="true" />
                  {assignedPicCount} PIC Lapangan Aktif
                </span>
              </div>
              <h1 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
                Master Proyek &amp; Kurva Progres (Kurva S)
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Pusat kendali paket pekerjaan, penunjukan PIC, otorisasi upah titik kerja, laporan harian, dan pemantauan Kurva S.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPicChart((prev) => !prev)}
                className="gap-1.5"
              >
                <ChartSpline className="size-4 text-primary" aria-hidden="true" />
                <span>Grafik PIC</span>
                {showPicChart ? (
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const projectId = surveyProjectId || surveyProjects[0]?.id || "none";
                  router.replace(
                    `/apps/projects?section=surveys&view=map&projectId=${encodeURIComponent(projectId)}`,
                    { scroll: false },
                  );
                }}
                className="gap-1.5"
              >
                <MapPinned className="size-4 text-sky-500" aria-hidden="true" />
                <span>Peta &amp; Survei GIS</span>
              </Button>
              {isProjectManager && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setNewProjectOpen(true)}
                  className="gap-1.5 font-semibold"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span>Proyek Baru</span>
                </Button>
              )}
            </div>
          </div>

          {/* Skema Alur Eksekusi Proyek 4 Tahap */}
          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                01
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Setup Proyek &amp; Tunjuk PIC</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Input pagu, lokasi, dan pilih PIC lapangan langsung di tabel proyek.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-xs font-extrabold text-sky-600 dark:text-sky-400">
                02
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Titik Kerja &amp; Setujui Upah</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Ajukan volume &amp; upah titik kerja; Direktur menyetujui agar proyek aktif.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-xs font-extrabold text-orange-600 dark:text-orange-400">
                03
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Laporan Harian &amp; Kurva S</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Catat volume selesai harian + foto lapangan; progres &amp; Kurva S terhitung otomatis.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                04
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">Gambar Kerja, Subkon &amp; BAST</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Unggah gambar DED/As-Built, verifikasi termin subkon, dan pencairan upah.
                </p>
              </div>
            </div>
          </div>
        </header>
      )}

      {activeSection === "projects" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setStatusFilterUrl("ALL")}
            className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
              projectStatusFilter === "ALL"
                ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Semua Proyek</span>
              <BriefcaseBusiness className="size-4 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-foreground">{projects.length}</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                Rata-rata {averageProgress.toFixed(1)}%
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilterUrl("RUNNING")}
            className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
              projectStatusFilter === "RUNNING"
                ? "border-sky-500 bg-sky-500/10 shadow-xs ring-1 ring-sky-500/30"
                : "border-border bg-card hover:border-sky-500/40 hover:bg-accent/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Sedang Berjalan</span>
              <ChartSpline className="size-4 text-sky-500" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">
                {runningProjectCount}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                Proyek aktif lapangan
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilterUrl("PENDING_SETUP")}
            className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
              projectStatusFilter === "PENDING_SETUP"
                ? "border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500/30"
                : "border-border bg-card hover:border-amber-500/40 hover:bg-accent/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Menunggu Setup</span>
              <Clock className="size-4 text-amber-500" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                {pendingSetupProjectCount}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                Perlu PIC / persetujuan upah
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilterUrl("DONE")}
            className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
              projectStatusFilter === "DONE"
                ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/30"
                : "border-border bg-card hover:border-emerald-500/40 hover:bg-accent/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Selesai / Tuntas</span>
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {completedProjectCount}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                Paket pekerjaan tuntas
              </span>
            </div>
          </button>
        </div>
      )}

      {activeSection === "projects" && showPicChart && (
        <Card className="border-border bg-card text-card-foreground shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base text-foreground">
                Persentase Progres Berdasarkan PIC Lapangan
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Rata-rata progres fisik dari proyek yang ditangani masing-masing PIC
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPicChart(false)}
            >
              Tutup Grafik
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <ProjectProgressByPicChart
              projects={projects.map((project) => ({
                picId: project.fieldPicId,
                picName: project.fieldPicName,
                progress: project.progress,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {activeSection === "projects" && (
        <div className="space-y-6">
          {/* Onboarding Banner: Langkah 3 dari 3 (Vasco) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground">Langkah 3 dari 3</span>
              <h3 className="text-sm font-bold text-foreground">Lihat jadwal (Gantt)</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ketuk Tambah task untuk menyusun jadwal pekerjaan. Belum ditagih dan portal klien ada di halaman proyek yang sama.
              </p>
            </div>
            <Link
              href="/apps/projects/schedule"
              className="inline-flex h-8 items-center rounded-lg bg-foreground px-4 text-xs font-semibold text-background hover:bg-foreground/90 transition"
            >
              Buka jadwal
            </Link>
          </div>

          {/* Page Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Daftar proyek</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="h-8 gap-1.5 px-3 text-xs rounded-lg"
              >
                <Upload className="size-3.5" />
                <span>Impor proyek</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => alert("Fitur Template Proyek Vasco siap digunakan.")}
                className="h-8 gap-1.5 px-3 text-xs rounded-lg"
              >
                <LayoutTemplate className="size-3.5" />
                <span>Template proyek</span>
              </Button>
              {isProjectManager && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setNewProjectOpen(true)}
                  className="h-8 gap-1.5 px-3.5 text-xs font-semibold rounded-lg bg-foreground text-background hover:bg-foreground/90 transition"
                >
                  <Plus className="size-3.5" />
                  <span>Tambah proyek</span>
                </Button>
              )}
            </div>
          </div>

          {/* 3 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <span>Proyek berjalan</span>
                <ChevronRight className="size-3" />
              </div>
              <p className="mt-1 text-2xl font-extrabold text-foreground">{runningProjects.length}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">dari {projects.length} proyek</p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <span>Nilai kontrak berjalan</span>
                <ChevronRight className="size-3" />
              </div>
              <p className="mt-1 text-2xl font-extrabold text-foreground">{currency(totalContractRunning)}</p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <span>Lewat target selesai</span>
                <ChevronRight className="size-3" />
              </div>
              <p className="mt-1 text-2xl font-extrabold text-foreground">{overdueRunningCount}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">proyek berjalan</p>
            </div>
          </div>

          {/* Views Toolbar: Tabel | Papan, Search, Filter, Export, Print */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-border/70 bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setProjectViewMode("tabel")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    projectViewMode === "tabel"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tabel
                </button>
                <button
                  type="button"
                  onClick={() => setProjectViewMode("papan")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    projectViewMode === "papan"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Papan
                </button>
              </div>

              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari proyek"
                  className="h-8 pl-8 text-xs bg-muted/20 rounded-lg"
                />
              </div>

              <Select
                value={projectStatusFilter}
                onValueChange={setStatusFilterUrl}
              >
                <SelectTrigger className="h-8 w-40 text-xs rounded-lg">
                  <Filter className="size-3 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  <SelectItem value="RUNNING">Berjalan</SelectItem>
                  <SelectItem value="PENDING_SETUP">Tender / Setup</SelectItem>
                  <SelectItem value="HOLD">Ditunda</SelectItem>
                  <SelectItem value="DONE">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{filteredProjects.length} proyek</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-3 text-xs rounded-lg">
                    <Download className="size-3.5 text-muted-foreground" />
                    <span>Ekspor</span>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={getExportHref("xlsx")}>Ekspor ke Excel (.xlsx)</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={getExportHref("csv")}>Ekspor ke CSV (.csv)</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-8 gap-1.5 px-3 text-xs rounded-lg"
              >
                <Printer className="size-3.5 text-muted-foreground" />
                <span>Cetak</span>
              </Button>
            </div>
          </div>

          {/* TABEL VIEW (Image 5) */}
          {projectViewMode === "tabel" && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-muted/40 font-semibold text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="w-10 px-3.5 py-3">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border"
                          checked={
                            selectedProjectIds.length > 0 &&
                            selectedProjectIds.length === filteredProjects.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjectIds(filteredProjects.map((p) => p.id));
                            } else {
                              setSelectedProjectIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-3.5 py-3 font-semibold">Proyek ⇅</th>
                      <th className="w-32 px-3.5 py-3 font-semibold">Status ⇅</th>
                      <th className="w-44 px-3.5 py-3 font-semibold">Progres ⇅</th>
                      <th className="w-40 px-3.5 py-3 font-semibold">Target selesai ⇅</th>
                      <th className="px-3.5 py-3 font-semibold">Perlu perhatian ⇅</th>
                      <th className="w-36 px-3.5 py-3 font-semibold">Nilai kontrak ⇅</th>
                      <th className="w-24 px-3.5 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleProjects.map((project) => {
                      const isSelected = selectedProjectIds.includes(project.id);
                      const isOverdue =
                        project.endDate &&
                        new Date(project.endDate) < new Date() &&
                        project.progress < 100;
                      const hasDeviation = project.progress < 10 && project.startDate;

                      return (
                        <tr
                          key={project.id}
                          className="hover:bg-muted/15 transition group"
                        >
                          <td className="px-3.5 py-3">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-border"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProjectIds((prev) => [...prev, project.id]);
                                } else {
                                  setSelectedProjectIds((prev) =>
                                    prev.filter((id) => id !== project.id),
                                  );
                                }
                              }}
                            />
                          </td>
                          <td className="px-3.5 py-3">
                            <Link
                              href={`/apps/projects/${project.id}`}
                              className="font-bold text-foreground hover:text-primary transition hover:underline"
                            >
                              {project.title}
                            </Link>
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              {project.code}
                            </span>
                          </td>
                          <td className="px-3.5 py-3">
                            <Badge
                              variant="outline"
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border-0 ${
                                project.status === "DONE"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : project.status === "TERHAMBAT" || (project.status as string) === "ON_HOLD"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                              }`}
                            >
                              {statusLabels[project.status] || "Berjalan"}
                            </Badge>
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2">
                              <Progress value={project.progress} className="h-1.5 flex-1 min-w-16" />
                              <span className="w-8 text-right font-mono text-[11px] text-foreground font-semibold">
                                {project.progress.toFixed(0)}%
                              </span>
                            </div>
                            {project.startDate && project.progress === 0 && (
                              <span className="block text-[10px] text-muted-foreground">
                                rencana 32%
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-muted-foreground whitespace-nowrap">
                            {project.endDate ? (
                              <div>
                                <p className="font-medium text-foreground">{formatProjectDate(project.endDate)}</p>
                                {project.startDate && (
                                  <p className="text-[10px] text-muted-foreground">
                                    mulai {formatProjectDate(project.startDate)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            {isOverdue ? (
                              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                Terlambat dari jadwal
                              </span>
                            ) : hasDeviation ? (
                              <div className="text-[11px] text-muted-foreground">
                                <p className="font-semibold text-amber-600 dark:text-amber-400">
                                  Progres tertinggal
                                </p>
                                <p className="text-[10px]">32 poin dari rencana</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                            {Number(project.pagu) > 0 ? currency(project.pagu) : "—"}
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                title="Catat progres / opname"
                                onClick={() => openProjectModal(project, "titik")}
                                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <CheckCircle2 className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Edit proyek"
                                onClick={() => editProject(project)}
                                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredProjects.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                          {projects.length
                            ? "Tidak ada proyek yang sesuai dengan pencarian."
                            : "Belum ada proyek yang terdaftar. Tambahkan proyek pertama Anda."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <TablePaginationControls
                count={filteredProjects.length}
                pageSize={PROJECTS_PER_PAGE}
                page={currentProjectPage}
                itemLabel="proyek"
                onPageChange={setProjectPage}
              />
            </div>
          )}

          {/* PAPAN (KANBAN) VIEW */}
          {projectViewMode === "papan" && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3.5 items-start">
              {kanbanColumns.map((col) => {
                const colProjects = filteredProjects.filter(col.match);
                const isDragOver = dragOverColumnKey === col.key;

                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => handleColumnDragOver(e, col.key)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => handleColumnDrop(e, col.key)}
                    className={`flex flex-col rounded-xl border p-2.5 transition-all duration-150 min-h-[320px] ${
                      isDragOver
                        ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-inner"
                        : "border-border/70 bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-xs font-bold text-foreground">{col.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {colProjects.length}
                      </span>
                    </div>

                    <div className="space-y-2 min-h-24 flex-1">
                      {colProjects.map((p) => {
                        const isDragging = draggedProjectId === p.id;
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => handleCardDragStart(e, p.id)}
                            onDragEnd={handleCardDragEnd}
                            className={`block rounded-lg border bg-card p-3 shadow-2xs transition group select-none cursor-grab active:cursor-grabbing ${
                              isDragging
                                ? "opacity-30 border-dashed border-primary scale-95"
                                : "border-border/80 hover:border-primary/50 hover:shadow-sm"
                            }`}
                          >
                            <Link
                              href={`/apps/projects/${p.id}`}
                              onClick={(e) => {
                                if (draggedProjectId) e.preventDefault();
                              }}
                              className="block space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-bold text-xs text-foreground group-hover:text-primary transition line-clamp-1">
                                  {p.title}
                                </span>
                              </div>

                              <div className="text-[11px] text-muted-foreground line-clamp-1">
                                {p.code}
                                {p.clientName ? ` · ${p.clientName}` : p.address ? ` · ${p.address}` : ""}
                              </div>

                              {Number(p.pagu) > 0 && (
                                <div className="font-mono text-xs font-semibold text-foreground">
                                  {currency(p.pagu)}
                                </div>
                              )}

                              {p.progress > 0 && (
                                <div className="space-y-1 pt-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground">Progres</span>
                                    <span className="font-bold">{p.progress.toFixed(0)}%</span>
                                  </div>
                                  <Progress value={p.progress} className="h-1.5" />
                                </div>
                              )}

                              <div className="flex items-center justify-between border-t border-border/50 pt-1.5 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="size-3 shrink-0" />
                                  <span>{p.endDate ? formatProjectDate(p.endDate) : "—"}</span>
                                </span>
                              </div>
                            </Link>
                          </div>
                        );
                      })}

                      {colProjects.length === 0 && (
                        <div
                          className={`flex h-28 items-center justify-center rounded-lg border border-dashed text-center text-xs transition-colors ${
                            isDragOver
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border/50 text-muted-foreground/70"
                          }`}
                        >
                          <span>{isDragOver ? "Lepas proyek di sini" : "Belum ada proyek"}</span>
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewProjectOpen(true)}
                      className="mt-2 w-full justify-start h-7 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3 mr-1" />
                      <span>Tambah proyek</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeSection === "surveys" && (
        <section>
          <GISWorkspace
            projects={surveyProjects}
            surveys={surveys}
            surveyorName={surveyorName}
            captureTime={captureTime}
            initialProjectId={surveyProjectId}
            initialView={surveyView}
            onViewChange={(view) => {
              const projectQuery =
                surveyProjectId || surveyProjects[0]?.id || "none";
              const nextUrl = `/apps/projects?section=surveys&view=${view}&projectId=${encodeURIComponent(projectQuery || "none")}`;
              if (typeof window !== "undefined") {
                const currentUrl = `${window.location.pathname}${window.location.search}`;
                if (currentUrl !== nextUrl) {
                  router.replace(nextUrl, { scroll: false });
                }
              }
            }}
            onOpenProjects={() => {
              const nextUrl = "/apps/projects";
              if (typeof window !== "undefined") {
                const currentUrl = `${window.location.pathname}${window.location.search}`;
                if (currentUrl !== nextUrl) {
                  router.replace(nextUrl, { scroll: false });
                }
              }
            }}
            onProjectChange={(projectId) => {
              const nextUrl = `/apps/projects?section=surveys&view=${surveyView}&projectId=${encodeURIComponent(projectId || "none")}`;
              if (typeof window !== "undefined") {
                const currentUrl = `${window.location.pathname}${window.location.search}`;
                if (currentUrl !== nextUrl) {
                  router.replace(nextUrl, { scroll: false });
                }
              }
            }}
          />
        </section>
      )}

      <ProjectFormModal
        key={editingProject?.id ?? (newProjectOpen ? "new-project" : "closed")}
        project={editingProject}
        fieldTeamUsers={fieldTeamUsers}
        canViewBudget={canViewFinancials || editingProject === null}
        canManageUsers={
          currentUserRole === UserRole.DIRECTOR ||
          currentUserRole === UserRole.ADMINISTRATIONS
        }
        open={newProjectOpen || editingProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNewProjectOpen(false);
            setEditingProject(null);
          }
        }}
      />
      <ImportProjectModal open={importOpen} onOpenChange={setImportOpen} />

      <GlobalModal
        isOpen={activeProject !== null}
        onClose={() => {
          setActiveProjectId(null);
          setSelectedReportWorkPointId("");
          setNotice("");
        }}
        title={activeProject?.title ?? "Detail Proyek"}
        description={
          activeProject
            ? `${activeProject.code} · ${activeProject.kelompokTani ? `${activeProject.kelompokTani} · ` : ""}${activeProject.location || activeProject.address}`
            : "Informasi dan aktivitas proyek."
        }
        className="max-w-5xl"
        footer={
          activeProject ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const projectId = activeProject.id;
                    setActiveProjectId(null);
                    router.replace(
                      `/apps/projects?section=surveys&view=map&projectId=${encodeURIComponent(projectId)}`,
                      { scroll: false },
                    );
                  }}
                >
                  <MapPinned className="size-4 text-sky-500" aria-hidden="true" />
                  <span>Buka Peta &amp; Survei</span>
                </Button>
                <Link
                  href={`/apps/projects/${activeProject.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span>Buka Halaman Detail</span>
                </Link>
                {isProjectManager && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => editProject(activeProject)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    <span>Edit Proyek</span>
                  </Button>
                )}
                {currentUserRole === UserRole.DIRECTOR && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setPendingDeleteProjectId(activeProject.id);
                      setConfirmArchiveOpen(true);
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    <span>Hapus Proyek</span>
                  </Button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveProjectId(null);
                  setSelectedReportWorkPointId("");
                  setNotice("");
                }}
              >
                Tutup
              </Button>
            </div>
          ) : undefined
        }
      >
        {activeProject && (
          <div className="space-y-4">
            {/* Checklist Kesiapan & Status Alur Proyek */}
            {(() => {
              const hasPic = Boolean(activeProject.fieldPicId);
              const totalPoints = activeProject.workPoints.length;
              const approvedPoints = activeProject.workPoints.filter((pt) =>
                Boolean(pt.approvedTotalWage),
              ).length;
              const isRunning = ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(
                activeProject.status,
              );

              return (
                <div className="rounded-xl border border-border bg-muted/25 p-3.5">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`font-semibold uppercase ${getStatusBadgeClass(activeProject.status)}`}
                      >
                        {statusLabels[activeProject.status] ?? activeProject.status}
                      </Badge>
                      <span className="text-xs font-semibold text-muted-foreground">
                        Skema Kesiapan &amp; Progres Proyek ({activeProject.progress.toFixed(1)}%)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-primary"
                      onClick={() => setActiveModalTab("kurva")}
                    >
                      <ChartSpline className="size-3.5" aria-hidden="true" />
                      <span>Lihat Kurva S</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div
                      className={`flex flex-col justify-between rounded-lg border p-2.5 text-xs ${
                        hasPic
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-amber-500/40 bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-bold">
                        <span>1. Penunjukan PIC Lapangan</span>
                        {hasPic ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : (
                          <Clock className="size-4 text-amber-500" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {hasPic
                          ? `PIC: ${activeProject.fieldPicName ?? "Sudah ditunjuk"}`
                          : "Wajib menunjuk PIC lapangan terlebih dahulu."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveModalTab("titik")}
                      className={`flex flex-col justify-between rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-primary ${
                        approvedPoints > 0
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-amber-500/40 bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-bold">
                        <span>2. Titik Kerja &amp; Upah</span>
                        {approvedPoints > 0 ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : (
                          <Clock className="size-4 text-amber-500" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {totalPoints === 0
                          ? "Belum ada titik kerja (Klik untuk tambah)"
                          : `${approvedPoints}/${totalPoints} titik disetujui Direktur`}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModalTab("harian")}
                      className={`flex flex-col justify-between rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-primary ${
                        isRunning
                          ? "border-sky-500/30 bg-sky-500/5"
                          : "border-border bg-background/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-bold">
                        <span>3. Laporan Harian &amp; Fisik</span>
                        <Camera className="size-4 text-sky-500" />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {isRunning
                          ? `${activeProject.reports.length} laporan tercatat (Klik untuk input)`
                          : "Terbuka otomatis setelah tahap 1 & 2 selesai"}
                      </p>
                    </button>
                  </div>
                </div>
              );
            })()}

            {notice && (
              <p
                role="status"
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs font-medium text-foreground"
              >
                {notice}
              </p>
            )}

            <Tabs
              key={activeProject.id}
              value={activeModalTab}
              onValueChange={setActiveModalTab}
              className="space-y-4"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/60 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
                <ProjectViewTab
                  value="pagu"
                  label={canViewFinancials ? "1. Info & Pagu" : "1. Info & Subkon"}
                  icon={ClipboardList}
                />
                <ProjectViewTab
                  value="titik"
                  label="2. Titik & Upah"
                  badge={activeProject.workPoints.length}
                  icon={HardHat}
                />
                <ProjectViewTab
                  value="harian"
                  label="3. Laporan Harian"
                  badge={activeProject.reports.length}
                  icon={Camera}
                />
                <ProjectViewTab
                  value="kurva"
                  label="4. Kurva S"
                  badge={`${activeProject.progress.toFixed(0)}%`}
                  icon={ChartSpline}
                />
                <ProjectViewTab
                  value="gambar"
                  label="5. Gambar Kerja"
                  badge={activeProject.blueprints.length}
                  icon={ImageIcon}
                />
                <ProjectViewTab
                  value="timeline"
                  label="6. Timeline & Gaji"
                  icon={CalendarDays}
                />
              </TabsList>

              <TabsContent value="pagu" className="space-y-4">
                {canViewFinancials && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Anggaran Pagu dan Realisasi Proyek
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(() => {
                        const pagu = Number(activeProject.pagu);
                        const realized = Number(activeProject.realized);
                        const percent =
                          pagu > 0 ? Math.min((realized / pagu) * 100, 100) : 0;
                        return (
                          <>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="text-xs text-muted-foreground">Nilai Pagu Kontrak</p>
                                <p className="mt-1 text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                                  {currency(pagu)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="text-xs text-muted-foreground">
                                  Realisasi (Material, Upah &amp; Biaya)
                                </p>
                                <p className="mt-1 text-base font-extrabold text-foreground">
                                  {currency(realized)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="text-xs text-muted-foreground">Sisa Pagu Anggaran</p>
                                <p className="mt-1 text-base font-extrabold text-sky-600 dark:text-sky-400">
                                  {currency(Math.max(pagu - realized, 0))}
                                </p>
                              </div>
                            </div>
                            <Progress
                              value={percent}
                              aria-label={`Realisasi ${percent.toFixed(0)} persen`}
                            />
                            <p className="text-right text-xs font-medium text-muted-foreground">
                              Terserap {percent.toFixed(1)}% dari nilai pagu
                            </p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Identitas &amp; Informasi Proyek</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="block text-xs text-muted-foreground">Kode &amp; Kelompok Tani</span>
                      <span className="mt-0.5 block font-semibold text-foreground">
                        {activeProject.code} · {activeProject.kelompokTani || "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="block text-xs text-muted-foreground">Lokasi &amp; Alamat</span>
                      <span className="mt-0.5 block font-semibold text-foreground">
                        {activeProject.location || activeProject.address}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="block text-xs text-muted-foreground">Jenis Pekerjaan</span>
                      <span className="mt-0.5 block font-semibold text-foreground">
                        {activeProject.jenisPekerjaan ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="block text-xs text-muted-foreground">PIC Lapangan</span>
                      <span className="mt-0.5 block font-semibold text-foreground">
                        {activeProject.fieldPicName ?? "Belum ditentukan"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="block text-xs text-muted-foreground">Jadwal Pelaksanaan</span>
                      <span className="mt-0.5 block font-semibold text-foreground">
                        {formatProjectDate(activeProject.startDate)} – {formatProjectDate(activeProject.endDate)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="block text-xs text-muted-foreground">Realisasi Progres Fisik</span>
                      <span className="mt-0.5 block font-extrabold text-primary">
                        {activeProject.progress.toFixed(1)}% ({activeProject.workPoints.length} Titik Kerja)
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {activeProject.subkonContracts.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Kontrak Subkon &amp; Termin (SPK)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeProject.subkonContracts.map((contract) => (
                        <section key={contract.id} className="rounded-lg border p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold">
                                {contract.contractNumber} · {contract.subkonName}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Nilai Kontrak: {currency(contract.contractValue)} · Status: {contract.status}
                              </p>
                            </div>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/d/${encodeURIComponent(contract.publicCode)}`}>
                                Buka Dokumen SPK
                              </Link>
                            </Button>
                          </div>
                          {contract.termyns.map((termyn) => (
                            <div
                              key={termyn.id}
                              className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5 text-xs"
                            >
                              <span className="font-medium">
                                Termin {termyn.termynNumber} · Klaim Fisik {termyn.claimedPercent}% · Netto {currency(termyn.netAmount)}
                              </span>
                              <span className="flex items-center gap-2">
                                <Badge variant="outline">{termyn.status}</Badge>
                                {termyn.status === "SUBMITTED" &&
                                  (isFieldTeam || canViewFinancials) && (
                                    <Button
                                      size="sm"
                                      disabled={isPending}
                                      onClick={() =>
                                        runProjectAction(() =>
                                          verifySubkonTermynField(termyn.id),
                                        )
                                      }
                                    >
                                      Verifikasi Fisik
                                    </Button>
                                  )}
                              </span>
                            </div>
                          ))}
                          {isFieldTeam && contract.status === "ACTIVE" && (
                            <form
                              className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3"
                              onSubmit={(event) => {
                                event.preventDefault();
                                const form = event.currentTarget;
                                const value = Number(
                                  new FormData(form).get("claimedPercent"),
                                );
                                runProjectAction(() =>
                                  submitSubkonTermyn(contract.publicCode, value),
                                );
                              }}
                            >
                              <Label className="text-xs">
                                Klaim Progres Fisik (%)
                                <Input
                                  name="claimedPercent"
                                  type="number"
                                  min="0.01"
                                  max="100"
                                  step="0.01"
                                  required
                                  className="mt-1 h-9 w-40"
                                />
                              </Label>
                              <Button size="sm" disabled={isPending}>
                                Ajukan Termin Subkon
                              </Button>
                            </form>
                          )}
                        </section>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {activeProject.bastDocuments.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Berita Acara Serah Terima (BAST)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {activeProject.bastDocuments.map((document) => (
                        <div
                          key={document.publicCode}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                        >
                          <div>
                            <p className="text-sm font-semibold">
                              {document.bastNumber} · {document.type}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {document.date} ·{" "}
                              {document.isApproved ? "Disetujui" : "Menunggu persetujuan"}
                            </p>
                          </div>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/d/${encodeURIComponent(document.publicCode)}`}>
                              Buka BAST
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

                <TabsContent value="titik" className="space-y-4">
                  {((currentUserRole === UserRole.FIELD_TEAM ||
                    currentUserRole === UserRole.KOORDINATOR) &&
                    activeProject.fieldPicId === currentUserId ||
                    currentUserRole === UserRole.DIRECTOR ||
                    currentUserRole === UserRole.ADMINISTRATIONS) && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Ajukan Titik dan Total Upah Tukang</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {currentUserRole === UserRole.FIELD_TEAM ||
                            currentUserRole === UserRole.KOORDINATOR
                              ? "Upah perlu disetujui Direktur sebelum proyek dapat dimulai."
                              : "Direktur/Administrasi dapat menyiapkan titik dan usulan upah. PIC tetap dapat mengajukan setelah ditunjuk."}
                          </p>
                        </CardHeader>
                        <CardContent>
                          <form className="grid w-full grid-cols-1 items-start gap-3 sm:grid-cols-2" onSubmit={submitWorkPoint}>
                            <Label className={workPointFieldClass}>Nama titik / tugas<Input className="w-full" name="title" required maxLength={180} /></Label>
                            <Label className={workPointFieldClass}>Koordinat<Input className="w-full" name="location" maxLength={240} /></Label>
                            <Label className={workPointFieldClass}>Tanggal mulai rencana<Input className="w-full" name="plannedStartDate" type="date" /></Label>
                            <Label className={workPointFieldClass}>Tanggal target selesai<Input className="w-full" name="targetDate" type="date" /></Label>
                            <Label className={workPointFieldClass}>Volume pekerjaan<Input className="w-full" name="proposedVolume" type="number" min="0.001" step="0.001" required onChange={(event) => {
                              const form = event.currentTarget.form;
                              if (!form) return;
                              const formData = new FormData(form);
                              setProposedTotalWage(calculateWorkPointTotal(
                                String(formData.get("proposedVolume") ?? ""),
                                String(formData.get("proposedUnitPrice") ?? ""),
                              ));
                            }} /></Label>
                            <Label className={workPointFieldClass}>Satuan volume<Input className="w-full" name="proposedUnit" maxLength={40} placeholder="m, m², m³, unit" required /></Label>
                            <Label className={workPointFieldClass}>
                              Harga satuan
                              <RupiahInput
                                name="proposedUnitPrice"
                                value={proposedUnitPrice}
                                onValueChange={(value, form) => {
                                  setProposedUnitPrice(value);
                                  const volume = String(
                                    new FormData(form ?? undefined).get("proposedVolume") ?? "",
                                  );
                                  setProposedTotalWage(
                                    calculateWorkPointTotal(volume, value),
                                  );
                                }}
                              />
                            </Label>
                            <Label className={workPointFieldClass}>
                              Total upah
                              <RupiahInput
                                name="proposedTotalWage"
                                value={proposedTotalWage}
                                onValueChange={setProposedTotalWage}
                              />
                            </Label>
                            <p className="text-xs text-muted-foreground sm:col-span-2">
                              Otomatis dihitung dari volume × harga satuan dan tetap dapat disesuaikan.
                            </p>
                            <Button type="submit" disabled={isPending} className="sm:col-span-2">
                              {isPending ? "Mengirim..." : "Kirim usulan ke Direktur"}
                            </Button>
                          </form>
                        </CardContent>
                      </Card>
                    )}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Daftar Titik Pekerjaan &amp; Otorisasi Upah ({activeProject.workPoints.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeProject.workPoints.map((point) => {
                        const targetVol = Number(point.proposedVolume ?? 0);
                        const doneVol =
                          point.completedVolume ??
                          (targetVol * point.progress) / 100;
                        return (
                          <article key={point.id} className="rounded-xl border border-border/80 bg-muted/15 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-foreground">{point.title}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {point.location || "Lokasi belum dicatat"}
                                  {targetVol > 0 &&
                                    ` · Volume: ${formatVolume(doneVol)}/${formatVolume(targetVol)} ${point.proposedUnit ?? "unit"}`}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    point.approvedTotalWage
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  }
                                >
                                  {point.approvedTotalWage
                                    ? "Upah Disetujui"
                                    : "Menunggu Persetujuan"}
                                </Badge>
                                <Badge variant="outline">
                                  Progres {point.progress.toFixed(1)}%
                                </Badge>
                              </div>
                            </div>

                            <div className="mt-2.5">
                              <Progress value={point.progress} className="h-2" />
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-foreground">
                                Usulan Upah: <strong>{currency(point.proposedTotalWage)}</strong>
                                {point.approvedTotalWage && (
                                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                    · Disetujui: <strong>{currency(point.approvedTotalWage)}</strong>
                                  </span>
                                )}
                              </span>
                              {["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(
                                activeProject.status,
                              ) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => {
                                    setSelectedReportWorkPointId(point.id);
                                    setActiveModalTab("harian");
                                  }}
                                >
                                  <Camera className="size-3.5" aria-hidden="true" />
                                  <span>Input Progres Titik Ini</span>
                                </Button>
                              )}
                            </div>

                            {point.approvedTotalWage &&
                              isFieldTeam &&
                              activeProject.fieldPicId === currentUserId && (
                                <div className="mt-3">
                                  <CreateTicketModal
                                    key={`wage-ticket-${point.id}`}
                                    projects={ticketProjectOptions}
                                    requesterRole={currentUserRole}
                                    triggerLabel="Ajukan pembayaran lewat tiket"
                                    initialWageRequest={{
                                      projectId: activeProject.id,
                                      projectTitle: activeProject.title,
                                      workPointTitle: point.title,
                                    }}
                                  />
                                </div>
                              )}
                            {currentUserRole === "DIRECTOR" && !point.approvedTotalWage && (
                              <form
                                className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const form = event.currentTarget;
                                  const amount = String(new FormData(form).get("amount") ?? "");
                                  runProjectAction(() => approveProjectWorkPointWage(point.id, amount));
                                }}
                              >
                                <Label className="flex-1 text-xs">
                                  Otorisasi Nilai Upah Direktur (Rp)
                                  <Input
                                    name="amount"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    defaultValue={point.proposedTotalWage}
                                    required
                                    className="mt-1"
                                  />
                                </Label>
                                <Button type="submit" disabled={isPending}>
                                  Setujui Upah &amp; Aktifkan Proyek
                                </Button>
                              </form>
                            )}
                            {isProjectManager && point.approvedTotalWage && (
                              <form
                                className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-[1fr_1fr_auto]"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const form = event.currentTarget;
                                  const data = new FormData(form);
                                  runProjectAction(() =>
                                    editApprovedProjectWorkPointWage(
                                      point.id,
                                      String(data.get("revisedWage") ?? ""),
                                      String(data.get("wageReason") ?? ""),
                                    ),
                                  );
                                }}
                              >
                                <Label className="text-xs">
                                  Revisi upah disetujui (Rp)
                                  <Input
                                    name="revisedWage"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    defaultValue={point.approvedTotalWage}
                                    required
                                    className="mt-1"
                                  />
                                </Label>
                                <Label className="text-xs">
                                  Alasan revisi
                                  <Input
                                    name="wageReason"
                                    placeholder="Contoh: Penyesuaian volume lapangan"
                                    minLength={5}
                                    maxLength={2000}
                                    required
                                    className="mt-1"
                                  />
                                </Label>
                                <Button type="submit" variant="outline" disabled={isPending} className="self-end">
                                  Simpan Revisi
                                </Button>
                              </form>
                            )}
                            {point.wageAuditLogs.length > 0 && (
                              <div className="mt-4 border-t pt-3">
                                <p className="text-xs font-semibold">Audit revisi upah</p>
                                <ul className="mt-2 space-y-2">
                                  {point.wageAuditLogs.map((audit) => (
                                    <li
                                      key={audit.id}
                                      className="rounded-md bg-muted/30 p-2.5 text-xs"
                                    >
                                      <p className="font-medium">
                                        {currency(audit.oldWage)} → {currency(audit.newWage)}
                                      </p>
                                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {formatProjectDate(audit.createdAt.slice(0, 10))} · {audit.changedByName}
                                      </p>
                                      {audit.reason && (
                                        <p className="mt-1 text-muted-foreground">{audit.reason}</p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {activeProject.workPoints.length === 0 && (
                        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Belum ada titik pekerjaan untuk proyek ini. Tambahkan titik kerja pada formulir di atas.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="harian" className="space-y-4">
                  {["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(activeProject.status) &&
                    ["ADMINISTRATIONS", "DIRECTOR", "DEPUTY_DIRECTOR", "KOORDINATOR", "FIELD_TEAM"].includes(currentUserRole) &&
                    (!(currentUserRole === UserRole.FIELD_TEAM ||
                      currentUserRole === UserRole.KOORDINATOR) ||
                      activeProject.fieldPicId === currentUserId) && (
                    <Card>
                      <CardHeader><CardTitle className="text-base">Tambah Laporan Progres Harian</CardTitle></CardHeader>
                      <CardContent>
                        <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveReport}>
                          <Label>Tanggal<Input name="reportDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Label>
                          <Label>
                            Cuaca
                            <Select name="weather" defaultValue="Cerah">
                              <SelectTrigger className="mt-2 w-full">
                                <SelectValue placeholder="Pilih cuaca" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Cerah">Cerah</SelectItem>
                                <SelectItem value="Hujan Gerimis">Hujan gerimis</SelectItem>
                                <SelectItem value="Hujan Lebat">Hujan lebat</SelectItem>
                                <SelectItem value="Mendung">Mendung</SelectItem>
                              </SelectContent>
                            </Select>
                          </Label>
                          <Label>Jumlah pekerja hadir<Input name="workersCount" type="number" min="0" max="100000" defaultValue="0" required /></Label>
                          {activeProject.workPoints.length > 0 ? (
                            <>
                              <Label>
                                Item pekerjaan
                                <Select
                                  name="workPointId"
                                  value={reportWorkPointId}
                                  onValueChange={setSelectedReportWorkPointId}
                                >
                                  <SelectTrigger className="mt-2 w-full">
                                    <SelectValue placeholder="Pilih item pekerjaan" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {activeProject.workPoints.map((point) => (
                                      <SelectItem key={point.id} value={point.id}>
                                        {point.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Label>
                              <Label>
                                {`Volume selesai hari ini (${reportWorkPoint?.proposedUnit ?? "unit"})`}
                                <Input
                                  name="dailyVolume"
                                  type="number"
                                  min="0.001"
                                  max={reportRemainingVolume}
                                  step="0.001"
                                  required
                                  disabled={
                                    !reportWorkPoint ||
                                    reportTargetVolume <= 0 ||
                                    reportRemainingVolume <= 0
                                  }
                                />
                                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                  {reportWorkPoint && reportTargetVolume > 0
                                    ? `Terkumpul ${formatVolume(reportCompletedVolume)} dari ${formatVolume(reportTargetVolume)} ${reportWorkPoint.proposedUnit ?? "unit"}; sisa ${formatVolume(reportRemainingVolume)}. Progres dihitung otomatis.`
                                    : "Item pekerjaan ini belum memiliki target volume yang valid."}
                                </span>
                              </Label>
                            </>
                          ) : (
                            <Label>
                              Progres kumulatif (%)
                              <Input
                                name="progress"
                                type="number"
                                min={activeProject.progress}
                                max="100"
                                step="0.1"
                                defaultValue={activeProject.progress}
                                required
                              />
                              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                Isi progres keseluruhan terbaru. Nilai tidak dapat lebih rendah dari progres proyek saat ini ({activeProject.progress}%).
                              </span>
                            </Label>
                          )}
                          <Label className="sm:col-span-2">
                            Uraian pekerjaan harian
                            <Textarea name="workSummary" maxLength={2000} required />
                          </Label>
                          <Label className="sm:col-span-2">Foto progres (maks. 5 foto, 5 MB/foto)
                            <Input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
                          </Label>
                          <Button
                            type="submit"
                            disabled={
                              isPending ||
                              (activeProject.workPoints.length > 0 &&
                                (!reportWorkPoint || reportTargetVolume <= 0))
                            }
                            className="sm:col-span-2"
                          >
                            {isPending ? "Menyimpan..." : "Simpan Laporan & Perbarui Kurva S"}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  )}
                  {!["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(activeProject.status) && (
                    <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center sm:flex-row sm:text-left">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">
                          Proyek Masih Berstatus Menunggu Setup (Pending Setup)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Formulir laporan harian akan aktif secara otomatis setelah PIC lapangan ditunjuk dan minimal 1 titik kerja disetujui upahnya oleh Direktur.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveModalTab("titik")}
                        className="shrink-0 gap-1.5"
                      >
                        <HardHat className="size-4" aria-hidden="true" />
                        <span>Buka Tab 2 · Titik &amp; Upah</span>
                      </Button>
                    </div>
                  )}
                  <Card>
                    <CardHeader><CardTitle>Riwayat Laporan Harian</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {activeProject.reports.map((report) => (
                        <article key={report.id} className="rounded-lg border p-4">
                          <div className="flex flex-wrap justify-between gap-2">
                            <p className="font-medium">{report.reportDate} · {report.weather ?? "Cuaca tidak dicatat"}</p>
                            <Badge variant="outline">{report.progress === null ? "—" : `${report.progress}%`}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{report.workersCount} pekerja · {report.photoUrls.length} foto</p>
                          {report.dailyVolume !== null &&
                            report.workPointId &&
                            (() => {
                              const point = activeProject.workPoints.find(
                                (workPoint) =>
                                  workPoint.id === report.workPointId,
                              );
                              if (!point) return null;
                              const target = Number(point.proposedVolume ?? 0);
                              const total =
                                (target * (report.progress ?? 0)) / 100;
                              return (
                                <p className="mt-1 text-sm">
                                  {point.title}: {formatVolume(report.dailyVolume)} {point.proposedUnit ?? "unit"} hari ini · total {formatVolume(total)}/{formatVolume(target)} {point.proposedUnit ?? "unit"}
                                </p>
                              );
                            })()}
                          {report.workSummary && <p className="mt-2 text-sm">{report.workSummary}</p>}
                          {report.photoUrls.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {report.photoUrls.map((url, index) => (
                                <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="text-sm underline">
                                  Buka foto {index + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                      {activeProject.reports.length === 0 && (
                        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Belum ada laporan harian untuk proyek ini.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="gambar" className="space-y-4">
                  {(currentUserRole === "DRAFTER" || isProjectManager) && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Unggah Gambar Kerja (DED / Shop Drawing / As-Built)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitBlueprint}>
                          <Label>
                            Nomor gambar
                            <Input name="drawingNumber" placeholder="Contoh: DED-STR-01" maxLength={80} required />
                          </Label>
                          <Label>
                            Judul gambar
                            <Input name="title" placeholder="Judul detail gambar kerja" maxLength={180} required />
                          </Label>
                          <Label>
                            Kategori
                            <select
                              name="category"
                              defaultValue="SHOP_DRAWING"
                              className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                            >
                              <option value="SHOP_DRAWING">Shop Drawing</option>
                              <option value="AS_BUILT">As-Built</option>
                              <option value="ARCHITECTURAL">Architectural</option>
                              <option value="STRUCTURAL">Structural</option>
                              <option value="MEP">MEP</option>
                            </select>
                          </Label>
                          <Label>
                            Revisi
                            <Input name="revision" defaultValue="REV-00" maxLength={30} required />
                          </Label>
                          <Label className="sm:col-span-2">
                            File PDF / DWG / DXF
                            <Input
                              name="file"
                              type="file"
                              accept=".pdf,.dwg,.dxf,application/pdf,application/acad,application/x-acad,application/dxf"
                              required
                            />
                          </Label>
                          <Button type="submit" disabled={isPending} className="sm:col-span-2">
                            {isPending ? "Mengunggah..." : "Unggah & Ajukan Review"}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-base">Daftar Gambar Kerja Proyek</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Dokumen teknis Shop Drawing, As-Built, dan status persetujuan IFC.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={blueprintCategory}
                          onValueChange={setBlueprintCategory}
                        >
                          <SelectTrigger aria-label="Filter kategori gambar" className="w-44">
                            <SelectValue placeholder="Semua kategori" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">Semua kategori</SelectItem>
                            <SelectItem value="SHOP_DRAWING">Shop Drawing</SelectItem>
                            <SelectItem value="ARCHITECTURAL">Architectural</SelectItem>
                            <SelectItem value="STRUCTURAL">Structural</SelectItem>
                            <SelectItem value="MEP">MEP</SelectItem>
                            <SelectItem value="AS_BUILT">As-Built</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={blueprintStatus}
                          onValueChange={setBlueprintStatus}
                        >
                          <SelectTrigger aria-label="Filter status gambar" className="w-48">
                            <SelectValue placeholder="Semua status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">Semua status</SelectItem>
                            <SelectItem value="DRAFT">Draft</SelectItem>
                            <SelectItem value="FOR_APPROVAL">Menunggu review</SelectItem>
                            <SelectItem value="APPROVED_FOR_CONSTRUCTION">Approved IFC</SelectItem>
                            <SelectItem value="REVISED">Direvisi</SelectItem>
                            <SelectItem value="REJECTED">Ditolak</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {filteredBlueprints.map((blueprint) => (
                        <article
                          key={blueprint.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5"
                        >
                          <div>
                            <p className="font-semibold">
                              {blueprint.drawingNumber} · {blueprint.title}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {blueprint.category} · {blueprint.revision} · Drafter: {blueprint.drafterName}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{blueprint.status}</Badge>
                            <Button asChild variant="outline" size="sm">
                              <a href={blueprint.fileUrl} target="_blank" rel="noreferrer">
                                Buka File
                              </a>
                            </Button>
                            {blueprint.status === "FOR_APPROVAL" &&
                              ["KOORDINATOR", "DIRECTOR", "DEPUTY_DIRECTOR"].includes(
                                currentUserRole,
                              ) && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() =>
                                      runProjectAction(() =>
                                        reviewBlueprint(
                                          blueprint.publicCode,
                                          "APPROVED_FOR_CONSTRUCTION",
                                        ),
                                      )
                                    }
                                  >
                                    Approve IFC
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() =>
                                      runProjectAction(() =>
                                        reviewBlueprint(blueprint.publicCode, "REJECTED"),
                                      )
                                    }
                                  >
                                    Tolak
                                  </Button>
                                </>
                              )}
                          </div>
                        </article>
                      ))}
                      {filteredBlueprints.length === 0 && (
                        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          {activeProject.blueprints.length === 0
                            ? "Belum ada file gambar kerja untuk proyek ini."
                            : "Tidak ada gambar kerja yang cocok dengan filter."}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="kurva" className="space-y-4">
                  {(() => {
                    const series = getSCurveSeries(activeProject);
                    const targetPoints = series[0]?.data ?? [];
                    const nowMs = Date.now();
                    let plannedToday = 0;
                    if (targetPoints.length > 0) {
                      const firstX = Number(targetPoints[0].x);
                      const lastX = Number(targetPoints[targetPoints.length - 1].x);
                      if (nowMs <= firstX) {
                        plannedToday = 0;
                      } else if (nowMs >= lastX) {
                        plannedToday = 100;
                      } else {
                        const t = (nowMs - firstX) / Math.max(1, lastX - firstX);
                        plannedToday = Math.round((3 * t ** 2 - 2 * t ** 3) * 1000) / 10;
                      }
                    }
                    const actualToday = Number(activeProject.progress.toFixed(1));
                    const deviation = Number((actualToday - plannedToday).toFixed(1));

                    return (
                      <>
                        <Card>
                          <CardHeader className="flex flex-col justify-between gap-3 pb-3 sm:flex-row sm:items-center">
                            <div>
                              <CardTitle className="text-base">
                                Kurva S — Evaluasi Target Rencana vs Realisasi Aktual
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">
                                Kurva rencana dihitung dari jadwal proyek; kurva aktual ditarik otomatis dari laporan harian titik kerja.
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs"
                                onClick={() => setActiveModalTab("titik")}
                              >
                                <HardHat className="size-3.5" aria-hidden="true" />
                                <span>Kelola Titik Kerja</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 text-xs"
                                onClick={() => setActiveModalTab("harian")}
                              >
                                <Camera className="size-3.5" aria-hidden="true" />
                                <span>+ Laporan Harian</span>
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <span className="block text-[11px] font-medium text-muted-foreground">
                                  Periode Pelaksanaan
                                </span>
                                <span className="mt-1 block text-xs font-bold text-foreground">
                                  {formatProjectDate(activeProject.startDate)} –{" "}
                                  {formatProjectDate(activeProject.endDate)}
                                </span>
                              </div>
                              <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                                <span className="block text-[11px] font-medium text-muted-foreground">
                                  Target Rencana Hari Ini
                                </span>
                                <span className="mt-1 block text-lg font-extrabold text-sky-500">
                                  {plannedToday.toFixed(1)}%
                                </span>
                              </div>
                              <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                                <span className="block text-[11px] font-medium text-muted-foreground">
                                  Realisasi Fisik Aktual
                                </span>
                                <span className="mt-1 block text-lg font-extrabold text-orange-500">
                                  {actualToday.toFixed(1)}%
                                </span>
                              </div>
                              <div
                                className={`rounded-lg border p-3 ${
                                  deviation >= 0
                                    ? "border-emerald-500/30 bg-emerald-500/5"
                                    : "border-rose-500/30 bg-rose-500/5"
                                }`}
                              >
                                <span className="block text-[11px] font-medium text-muted-foreground">
                                  Deviasi Progres (Selisih)
                                </span>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span
                                    className={`text-lg font-extrabold ${
                                      deviation >= 0
                                        ? "text-emerald-500"
                                        : "text-rose-500"
                                    }`}
                                  >
                                    {deviation > 0 ? `+${deviation}%` : `${deviation}%`}
                                  </span>
                                  <span className="text-[10px] font-semibold text-muted-foreground">
                                    {deviation >= 0 ? "Sesuai / Lebih Cepat" : "Perlu Percepatan"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="min-h-[320px] rounded-xl border border-border/80 bg-background/40 p-2 sm:p-3">
                              <Chart
                                type="line"
                                options={sCurveOptions}
                                series={series}
                                height={340}
                              />
                            </div>

                            {series[1].data.length === 0 && (
                              <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                                Belum ada riwayat laporan progres harian. Klik tombol{" "}
                                <strong>+ Laporan Harian</strong> di atas untuk mulai merekam realisasi fisik.
                              </p>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                              Rincian Kontribusi Titik Kerja terhadap Kurva S
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {activeProject.workPoints.length > 0 ? (
                              <div className="overflow-x-auto rounded-lg border border-border">
                                <Table pagination={false} className="text-xs">
                                  <TableHeader>
                                    <TableRow className="bg-muted/60">
                                      <TableHead className="px-3 py-2.5 text-left font-bold">
                                        Titik Kerja / Item
                                      </TableHead>
                                      <TableHead className="px-3 py-2.5 text-left font-bold">
                                        Volume Selesai / Target
                                      </TableHead>
                                      <TableHead className="px-3 py-2.5 text-left font-bold">
                                        Progres Item
                                      </TableHead>
                                      <TableHead className="px-3 py-2.5 text-left font-bold">
                                        Target Selesai
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {activeProject.workPoints.map((pt) => {
                                      const targetVol = Number(pt.proposedVolume ?? 0);
                                      const doneVol =
                                        pt.completedVolume ??
                                        (targetVol * pt.progress) / 100;
                                      return (
                                        <TableRow key={pt.id}>
                                          <TableCell className="px-3 py-2.5 font-semibold">
                                            {pt.title}
                                            {pt.location && (
                                              <span className="block text-[11px] font-normal text-muted-foreground">
                                                {pt.location}
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell className="px-3 py-2.5">
                                            {targetVol > 0
                                              ? `${formatVolume(doneVol)} / ${formatVolume(targetVol)} ${pt.proposedUnit ?? "unit"}`
                                              : "—"}
                                          </TableCell>
                                          <TableCell className="min-w-36 px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                              <Progress
                                                value={pt.progress}
                                                className="h-2 flex-1"
                                              />
                                              <span className="font-bold">
                                                {pt.progress.toFixed(1)}%
                                              </span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="px-3 py-2.5 text-muted-foreground">
                                            {formatProjectDate(pt.targetDate)}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                Belum ada titik pekerjaan yang terdaftar pada proyek ini.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Timeline Pekerjaan per Titik</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Jadwal mulai, target selesai, dan capaian progres setiap titik kerja proyek.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeProject.workPoints.map((point) => (
                        <article key={point.id} className="space-y-2.5 rounded-lg border p-3.5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold">{point.title}</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {point.location || "Lokasi belum dicatat"}
                              </p>
                            </div>
                            <Badge variant="outline">{point.progress.toFixed(1)}%</Badge>
                          </div>
                          <Progress value={point.progress} aria-label={`Progres ${point.title}`} />
                          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                            <span>Mulai: {formatProjectDate(point.plannedStartDate)}</span>
                            <span>Target: {formatProjectDate(point.targetDate)}</span>
                          </div>
                        </article>
                      ))}
                      {activeProject.workPoints.length === 0 && (
                        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Belum ada titik kerja untuk ditampilkan pada timeline.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  {(() => {
                    const approvedTotal = activeProject.workPoints.reduce(
                      (sum, point) => sum + Number(point.approvedTotalWage ?? 0),
                      0,
                    );
                    const paidTotal = activeProject.wageTicketPayments.reduce(
                      (sum, payment) =>
                        sum + (payment.paid ? Number(payment.amount ?? 0) : 0),
                      0,
                    );
                    const remaining = Math.max(approvedTotal - paidTotal, 0);

                    return (
                      <>
                        <Card>
                          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <CardTitle className="text-base">Ringkasan Upah Tukang</CardTitle>
                              <p className="text-xs text-muted-foreground">
                                Pengajuan pembayaran bertahap diproses dan dicatat melalui tiket.
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="text-xs text-muted-foreground">Total upah disetujui</p>
                              <p className="mt-1 font-bold">{currency(approvedTotal)}</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="text-xs text-muted-foreground">Total sudah dibayar</p>
                              <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">
                                {currency(paidTotal)}
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="text-xs text-muted-foreground">Sisa kewajiban upah</p>
                              <p className="mt-1 font-bold text-amber-600 dark:text-amber-400">
                                {currency(remaining)}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Histori Pencairan Tiket Upah</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {activeProject.wageTicketPayments.map((payment) => (
                              <article
                                key={payment.id}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3.5"
                              >
                                <div>
                                  <p className="font-semibold">
                                    Tiket {payment.ticketNumber} · {payment.title}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {payment.paid
                                      ? `Dibayar ${formatProjectDate(payment.paidAt)}`
                                      : `Status ${statusLabels[payment.status] ?? payment.status}`}
                                    {" · "}Diajukan oleh {payment.requesterName}
                                  </p>
                                </div>
                                <p className="font-bold">
                                  {payment.amount
                                    ? currency(payment.amount)
                                    : "Nominal belum ditetapkan"}
                                </p>
                              </article>
                            ))}
                            {activeProject.wageTicketPayments.length === 0 && (
                              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                Belum ada tiket pembayaran upah untuk proyek ini.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </div>
          )}
      </GlobalModal>

      <AlertDialog
        open={confirmArchiveOpen}
        onOpenChange={(open) => {
          setConfirmArchiveOpen(open);
          if (!open && !isPending) setPendingDeleteProjectId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus {pendingDeleteProject?.title ?? "proyek"} secara permanen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Proyek, titik pekerjaan, laporan, blueprint, upah, dan data terkait
              yang menggunakan penghapusan berantai akan dihapus permanen dan
              tidak dapat dipulihkan. Tiket, pergerakan stok, dan agenda yang
              mempertahankan riwayatnya akan tetap ada tanpa tautan ke proyek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                permanentlyDeleteProject();
              }}
            >
              {isPending ? "Menghapus..." : "Ya, Hapus Permanen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
