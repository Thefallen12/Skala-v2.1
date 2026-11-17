"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
  type FormEvent,
} from "react";
import type { ApexOptions } from "apexcharts";
import {
  ArrowUpDown,
  BriefcaseBusiness,
  Calendar,
  CalendarDays,
  Camera,
  ChartSpline,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Download,
  Ellipsis,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  HardHat,
  ImageIcon,
  LayoutTemplate,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
  Users,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProjectPriority, ProjectStatus, UserRole } from "@prisma/client";
import { toast } from "sonner";
import {
  createBlueprint,
  reviewBlueprint,
  submitSubkonTermyn,
  verifySubkonTermynField,
} from "@/app/actions/construction";
import {
  approveProjectWorkPointWage,
  assignProjectFieldPic,
  createProjectWorkPoint,
  deleteProject,
  editApprovedProjectWorkPointWage,
  updateProjectKanbanStatus,
} from "@/app/actions/project";
import type {
  FieldTeamOption,
  ProjectDashboardRow,
} from "@/app/(DashboardLayout)/types/project";
import type { TicketProjectOption } from "@/app/(DashboardLayout)/types/ticket";
import type {
  FieldSurveySummary,
  SurveyProjectOption,
} from "@/app/components/apps/gis/SurveySidebar";
import GISWorkspace from "@/app/components/apps/gis/GISWorkspace";
import CreateTicketModal from "@/app/components/apps/tickets/CreateTicketModal";
import CurrentLocation from "@/app/components/dashboard/CurrentLocation";
import { ProjectProgressChart as ProjectProgressByPicChart } from "@/app/components/dashboard/ProjectProgressChart";
import ProjectFormModal from "@/app/components/project/ProjectFormModal";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
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
  TableHead,
  TableHeader,
  TablePaginationControls,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TicketMaterialContractOption } from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  countOfflineDailyReports,
  flushOfflineDailyReports,
  registerOfflineDailyReportAutoSync,
} from "@/lib/offline-daily-report-queue";
import { photoDownloadHref, withLocalPhotoPreview } from "@/lib/photo-urls";
import {
  buildProjectSCurveSeries,
  calculatePlannedSCurveProgress,
  calculateWeightedProjectProgress,
} from "@/lib/project-progress";
import { cn } from "@/lib/utils";
import DailyProgressModal, {
  isRunningProjectStatus,
  submitOfflineDailyReportAction,
} from "./DailyProgressModal";
import { DinasProjectReportPage } from "./DinasProjectReportPage";
import ImportProjectModal from "./ImportProjectModal";
import {
  classifyTicketFundCategory,
  type FundCategoryKey,
} from "./ProjectFundRecapTab";

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
      className="type-p3 flex h-auto min-h-10 w-full items-center justify-start gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2 text-left font-semibold text-foreground transition-all hover:border-primary/50 hover:bg-accent hover:text-accent-foreground aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-xs"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span className="type-p3 ml-auto rounded-full bg-black/10 px-2 py-0.5 font-bold leading-none tabular-nums dark:bg-white/15">
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
      <span className="type-p2 pl-3 text-muted-foreground">Rp</span>
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
        aria-label={
          name === "proposedUnitPrice"
            ? "Harga satuan Rupiah"
            : "Total upah Rupiah"
        }
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
  rapMaterialPlans?: {
    id: string;
    stockItemId: string | null;
    materialName: string;
    unit: string;
    plannedQuantity: number;
    actualQuantity: number;
    unitPrice: string;
    totalPrice: string;
    scope: string;
    notes: string | null;
  }[];
  rapLaborPlans?: {
    id: string;
    jobName: string;
    volume: number;
    unit: string;
    boronganRate: string;
    totalBorongan: string;
    subkonName: string | null;
    notes: string | null;
  }[];
  realized: string;
  requestedTotal?: string;
  laborRealized?: string;
  laborRequested?: string;
  materialRealized?: string;
  materialRequested?: string;
  operationalRealized?: string;
  operationalRequested?: string;
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
    k3SafetyLog?: string | null;
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
    proposedUnitPrice?: string | null;
    completedVolume: number | null;
    proposedTotalWage: string;
    approvedTotalWage: string | null;
    totalPrice?: number;
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
    type?: string | null;
    requestCategory?: string | null;
    fieldCategory?: string | null;
    fundCategory?: FundCategoryKey | null;
    createdAt?: string | null;
    items?: Array<{
      itemName: string;
      quantity: number;
      unit: string;
      estimatedCost?: string | number | null;
    }>;
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

type TicketModalTriggerConfig = {
  nonce: string;
  fixedProjectId?: string;
  defaultRequestCategory?: "MATERIAL" | "WAREHOUSE" | "OPS" | "FIELD" | "KASBON" | "EQUIPMENT_REQUEST";
  initialWageRequest?: {
    projectId: string;
    projectTitle: string;
    workPointTitle: string;
  };
};

type PreviewMediaState = {
  url: string;
  title: string;
  kind: "image" | "document";
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
      style: { colors: "#94a3b8", fontSize: "12px" },
    },
  },
  yaxis: {
    min: 0,
    max: 100,
    tickAmount: 5,
    labels: {
      style: { colors: "#94a3b8", fontSize: "12px" },
      formatter: (value) =>
        typeof value === "number" && Number.isFinite(value)
          ? `${value}%`
          : "—",
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
  if (
    status === "PENDING_SETUP" ||
    status === "PENDING" ||
    status === "PLANNED"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (
    status === "RUNNING" ||
    status === "ON_PROGRESS" ||
    status === "ACTIVE"
  ) {
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

function getSCurveSeries(project: ProjectWorkstationMasterData, nowMs: number) {
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
  const endDate = project.endDate ?? targetDates.at(-1) ?? fallbackEnd;

  const progressByDate = new Map<string, Map<string, number>>();
  for (const point of project.workPoints) {
    for (const report of point.progressReports) {
      const progressAtDate =
        progressByDate.get(report.reportDate) ?? new Map();
      progressAtDate.set(point.id, report.progress);
      progressByDate.set(report.reportDate, progressAtDate);
    }
  }
  const latestPointProgress = new Map<string, number>();
  for (const point of project.workPoints) latestPointProgress.set(point.id, 0);

  const weightedFromPoints = [...progressByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, progressAtDate]) => {
      for (const [pointId, progress] of progressAtDate) {
        latestPointProgress.set(pointId, progress);
      }
      return {
        reportDate: date,
        progress: calculateWeightedProjectProgress(
          project.workPoints.map((pt) => ({
            progress: latestPointProgress.get(pt.id) ?? 0,
            proposedTotalWage: pt.proposedTotalWage,
            approvedTotalWage: pt.approvedTotalWage,
          })),
        ),
      };
    });

  const directReports = project.reports
    .filter(
      (report): report is typeof report & { progress: number } =>
        report.progress !== null,
    )
    .map((report) => ({
      reportDate: report.reportDate,
      progress: report.progress,
    }));

  const built = buildProjectSCurveSeries({
    startDate,
    endDate,
    currentProgress: project.progress,
    dailyReports: [...weightedFromPoints, ...directReports],
    nowMs,
  });

  return [
    { name: "Target Rencana", data: built.planned },
    { name: "Realisasi Aktual", data: built.actual },
  ];
}

type ProjectSortField =
  | "default"
  | "title"
  | "status"
  | "progress"
  | "endDate"
  | "attention"
  | "pagu"
  | "realized"
  | "labor";

function statusSortRank(status: string) {
  if (
    status === "RUNNING" ||
    status === "ON_PROGRESS" ||
    status === "ACTIVE"
  ) {
    return 0;
  }
  if (status === "TERHAMBAT" || status === "ON_HOLD") return 1;
  if (
    status === "PENDING_SETUP" ||
    status === "PENDING" ||
    status === "PLANNED"
  ) {
    return 2;
  }
  if (status === "DONE" || status === "COMPLETED") return 3;
  return 4;
}

function getPlannedProgress(
  startDate: string | null,
  endDate: string | null,
  nowMs: number,
): number | null {
  return calculatePlannedSCurveProgress(startDate, endDate, nowMs);
}

/* ============================================================================
 * TOP-LEVEL ROW & CARD COMPONENTS (Zero inline components/selects in rows)
 * ============================================================================ */

interface ProjectItemActionsProps {
  project: ProjectWorkstationMasterData;
  isSelected: boolean;
  onToggleSelect: (projectId: string, checked: boolean) => void;
  currentTimeMs: number;
  canViewFinancials: boolean;
  isProjectManager: boolean;
  canDelete: boolean;
  canSubmitProgress: boolean;
  hasFieldTeamUsers: boolean;
  onOpenDailyProgress: (project: ProjectWorkstationMasterData) => void;
  onOpenWorkstation: (
    project: ProjectWorkstationMasterData,
    tab?: string,
  ) => void;
  onOpenAssignPic: (project: ProjectWorkstationMasterData) => void;
  onOpenTicket: (project: ProjectWorkstationMasterData) => void;
  onEditProject: (project: ProjectWorkstationMasterData) => void;
  onRequestDelete: (project: ProjectWorkstationMasterData) => void;
}

function ProjectActionMenu({
  project,
  isProjectManager,
  canDelete,
  canSubmitProgress,
  hasFieldTeamUsers,
  onOpenDailyProgress,
  onOpenWorkstation,
  onOpenAssignPic,
  onOpenTicket,
  onEditProject,
  onRequestDelete,
}: Pick<
  ProjectItemActionsProps,
  | "project"
  | "isProjectManager"
  | "canDelete"
  | "canSubmitProgress"
  | "hasFieldTeamUsers"
  | "onOpenDailyProgress"
  | "onOpenWorkstation"
  | "onOpenAssignPic"
  | "onOpenTicket"
  | "onEditProject"
  | "onRequestDelete"
>) {
  const isRunning = isRunningProjectStatus(project.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Aksi untuk ${project.title}`}
          title="Aksi"
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {isRunning && canSubmitProgress && (
          <DropdownMenuItem onSelect={() => onOpenDailyProgress(project)}>
            <Camera aria-hidden="true" />
            Isi Progres
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/apps/projects/${project.id}`}>
            <ExternalLink aria-hidden="true" />
            Buka Detail
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenWorkstation(project, "kurva")}>
          <ChartSpline aria-hidden="true" />
          Kurva S
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenWorkstation(project, "titik")}>
          <HardHat aria-hidden="true" />
          Titik &amp; Upah
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpenTicket(project)}>
          <Ticket aria-hidden="true" />
          Ajukan Tiket
        </DropdownMenuItem>
        {isProjectManager && hasFieldTeamUsers && (
          <DropdownMenuItem onSelect={() => onOpenAssignPic(project)}>
            <UserPlus aria-hidden="true" />
            Tunjuk PIC
          </DropdownMenuItem>
        )}
        {isProjectManager && (
          <DropdownMenuItem onSelect={() => onEditProject(project)}>
            <Pencil aria-hidden="true" />
            Edit Proyek
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onRequestDelete(project)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              Hapus Proyek
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectMobileCard(props: ProjectItemActionsProps) {
  const {
    project,
    isSelected,
    onToggleSelect,
    currentTimeMs,
    canViewFinancials,
    canSubmitProgress,
    onOpenDailyProgress,
    onOpenWorkstation,
  } = props;

  const plannedProgress = getPlannedProgress(
    project.startDate,
    project.endDate,
    currentTimeMs,
  );
  const isPendingSetup = [
    "PENDING_SETUP",
    "PENDING",
    "PLANNED",
  ].includes(project.status);
  const isRunning = isRunningProjectStatus(project.status);
  const paguNum = Number(project.pagu) || 0;
  const realizedNum = Number(project.realized) || 0;
  const requestedNum = Number(project.requestedTotal ?? 0) || 0;
  const laborRealizedNum = Number(project.laborRealized ?? 0) || 0;

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border bg-card p-3.5 transition",
        isSelected
          ? "border-primary/60 ring-1 ring-primary/30"
          : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Checkbox
            aria-label={`Pilih ${project.title}`}
            checked={isSelected}
            onCheckedChange={(checked) =>
              onToggleSelect(project.id, checked === true)
            }
            className="mt-1"
          />
          <div className="min-w-0">
            <Link
              href={`/apps/projects/${project.id}`}
              className="type-p1 block font-bold text-foreground hover:text-primary hover:underline"
            >
              {project.title}
            </Link>
            <p className="type-p3 text-muted-foreground">
              <span className="font-mono font-medium">{project.code}</span>
              {project.kelompokTani &&
                project.kelompokTani.toLowerCase() !==
                  project.title.toLowerCase() &&
                ` · ${project.kelompokTani}`}
            </p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn("shrink-0", getStatusBadgeClass(project.status))}
        >
          {statusLabels[project.status] || "Berjalan"}
        </Badge>
      </div>

      {(project.location || project.address) && (
        <p className="type-p3 line-clamp-1 flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
          <span>{project.location || project.address}</span>
        </p>
      )}

      {canViewFinancials && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2.5">
          <div>
            <span className="type-p3 text-muted-foreground">Nilai Kontrak</span>
            <p className="type-p2 font-mono font-bold text-foreground tabular-nums">
              {currency(paguNum)}
            </p>
          </div>
          <div>
            <span className="type-p3 text-muted-foreground">Tiket Cair</span>
            <p className="type-p2 font-mono font-bold text-success tabular-nums">
              {realizedNum > 0
                ? currency(realizedNum)
                : requestedNum > 0
                  ? `Ajuan ${currency(requestedNum)}`
                  : "Belum ada"}
            </p>
          </div>
          <div>
            <span className="type-p3 text-muted-foreground">Upah Cair</span>
            <p className="type-p2 font-mono font-semibold text-warning tabular-nums">
              {laborRealizedNum > 0 ? currency(laborRealizedNum) : "—"}
            </p>
          </div>
          <div>
            <span className="type-p3 text-muted-foreground">Target Selesai</span>
            <p className="type-p2 font-medium text-foreground">
              {project.endDate ? formatProjectDate(project.endDate) : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="type-p3 flex items-center justify-between tabular-nums">
          <span className="text-muted-foreground">
            Progres ({project.workPoints.length} titik)
            {plannedProgress !== null && project.progress < 100
              ? ` · Rencana ${plannedProgress}%`
              : ""}
          </span>
          <span className="font-mono font-bold text-foreground">
            {project.progress > 0 && project.progress < 10
              ? `${project.progress.toFixed(1)}%`
              : `${project.progress.toFixed(0)}%`}
          </span>
        </div>
        <Progress
          value={project.progress}
          aria-label={`Progres ${project.title}`}
          className="h-2"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        <span className="type-p3 truncate text-muted-foreground">
          PIC: {project.fieldPicName ?? "Belum ditunjuk"}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          {isRunning && canSubmitProgress ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenDailyProgress(project)}
              className="gap-1.5"
            >
              <Camera className="size-3.5" aria-hidden="true" />
              Isi Progres
            </Button>
          ) : isPendingSetup ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenWorkstation(project, "titik")}
            >
              Setup
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href={`/apps/projects/${project.id}`}>Detail</Link>
            </Button>
          )}
          <ProjectActionMenu {...props} />
        </div>
      </div>
    </div>
  );
}

function ProjectTableRow(props: ProjectItemActionsProps) {
  const {
    project,
    isSelected,
    onToggleSelect,
    currentTimeMs,
    canViewFinancials,
    canSubmitProgress,
    onOpenDailyProgress,
    onOpenWorkstation,
  } = props;

  const isOverdue =
    Boolean(project.endDate) &&
    new Date(project.endDate!).getTime() < currentTimeMs &&
    project.progress < 100;
  const plannedProgress = getPlannedProgress(
    project.startDate,
    project.endDate,
    currentTimeMs,
  );
  const progressGap =
    plannedProgress !== null
      ? Math.round(plannedProgress - project.progress)
      : 0;
  const hasDeviation = project.progress < 100 && progressGap >= 10;
  const isPendingSetup = [
    "PENDING_SETUP",
    "PENDING",
    "PLANNED",
  ].includes(project.status);
  const isRunning = isRunningProjectStatus(project.status);
  const paguNum = Number(project.pagu) || 0;
  const realizedNum = Number(project.realized) || 0;
  const requestedNum = Number(project.requestedTotal ?? 0) || 0;
  const laborRealizedNum = Number(project.laborRealized ?? 0) || 0;
  const laborRequestedNum = Number(project.laborRequested ?? 0) || 0;
  const absorptionPercent =
    paguNum > 0 ? Math.min(100, (realizedNum / paguNum) * 100) : 0;

  return (
    <TableRow className="group">
      <TableCell className="align-top">
        <Checkbox
          aria-label={`Pilih ${project.title}`}
          checked={isSelected}
          onCheckedChange={(checked) =>
            onToggleSelect(project.id, checked === true)
          }
          className="mt-0.5"
        />
      </TableCell>
      <TableCell className="max-w-[280px] whitespace-normal align-top">
        <Link
          href={`/apps/projects/${project.id}`}
          className="type-p2 block font-bold text-foreground transition hover:text-primary hover:underline"
        >
          {project.title}
        </Link>
        <p className="type-p3 mt-0.5 text-muted-foreground">
          <span className="font-mono">{project.code}</span>
          {project.kelompokTani &&
            project.kelompokTani.toLowerCase() !==
              project.title.toLowerCase() &&
            ` · ${project.kelompokTani}`}
        </p>
        {(project.location || project.address) && (
          <p className="type-p3 mt-0.5 line-clamp-1 flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
            <span>{project.location || project.address}</span>
          </p>
        )}
        <p className="type-p3 mt-1 text-muted-foreground">
          PIC: {project.fieldPicName ?? "Belum ditunjuk"}
        </p>
      </TableCell>
      <TableCell className="align-top">
        <Badge
          variant="outline"
          className={getStatusBadgeClass(project.status)}
        >
          {statusLabels[project.status] || "Berjalan"}
        </Badge>
        <span className="type-p3 mt-1 block text-muted-foreground tabular-nums">
          {project.workPoints.length} titik RAB
        </span>
      </TableCell>
      <TableCell className="align-top">
        <button
          type="button"
          onClick={() => onOpenWorkstation(project, "kurva")}
          title="Klik untuk membuka grafik Kurva S"
          className="w-full rounded-md p-1 -m-1 text-left transition hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Progress
              value={project.progress}
              aria-label={`Progres ${project.title}`}
              className="h-2 min-w-16 flex-1"
            />
            <span className="type-p3 w-11 text-right font-mono font-semibold text-foreground tabular-nums">
              {project.progress > 0 && project.progress < 10
                ? `${project.progress.toFixed(1)}%`
                : `${project.progress.toFixed(0)}%`}
            </span>
          </div>
          <p className="type-p3 mt-0.5 text-muted-foreground">
            {plannedProgress !== null && project.progress < 100
              ? `rencana ${plannedProgress}%`
              : "lihat Kurva S"}
          </p>
        </button>
      </TableCell>
      <TableCell className="hidden align-top whitespace-nowrap md:table-cell">
        {project.endDate ? (
          <div>
            <p className="type-p2 font-medium text-foreground">
              {formatProjectDate(project.endDate)}
            </p>
            {project.startDate && (
              <p className="type-p3 text-muted-foreground">
                mulai {formatProjectDate(project.startDate)}
              </p>
            )}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="hidden align-top xl:table-cell">
        {isOverdue ? (
          <span className="type-p3 font-semibold text-destructive">
            Terlambat dari jadwal
          </span>
        ) : hasDeviation ? (
          <div className="type-p3">
            <p className="font-semibold text-warning">Progres tertinggal</p>
            <p className="text-muted-foreground tabular-nums">
              {progressGap} poin dari rencana
            </p>
          </div>
        ) : isPendingSetup ? (
          <span className="type-p3 font-medium text-warning">
            Perlu setup RAB &amp; PIC
          </span>
        ) : (
          <span className="type-p3 inline-flex items-center gap-1 font-medium text-success">
            <Check className="size-3.5" aria-hidden="true" />
            Sesuai Kurva S
          </span>
        )}
      </TableCell>
      {canViewFinancials && (
        <>
          <TableCell className="hidden align-top whitespace-nowrap sm:table-cell">
            <button
              type="button"
              onClick={() => onOpenWorkstation(project, "pagu")}
              className="text-left transition hover:text-primary"
            >
              <p className="type-p2 font-mono font-semibold text-foreground tabular-nums">
                {paguNum > 0 ? currency(paguNum) : "—"}
              </p>
              <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                {realizedNum > 0
                  ? `Terserap ${absorptionPercent.toFixed(1)}%`
                  : project.jenisPekerjaan || "Kontrak Fisik"}
              </p>
            </button>
          </TableCell>
          <TableCell className="hidden align-top whitespace-nowrap lg:table-cell">
            <button
              type="button"
              onClick={() => onOpenWorkstation(project, "timeline")}
              className="rounded-md p-1 -m-1 text-left transition hover:bg-muted/50"
            >
              {realizedNum > 0 ? (
                <p className="type-p2 font-mono font-bold text-success tabular-nums">
                  {currency(realizedNum)}
                </p>
              ) : requestedNum > 0 ? (
                <p className="type-p2 font-mono font-semibold text-primary tabular-nums">
                  Ajuan: {currency(requestedNum)}
                </p>
              ) : (
                <p className="type-p3 text-muted-foreground">Belum ada tiket</p>
              )}
              {laborRealizedNum > 0 ? (
                <p className="type-p3 mt-0.5 font-medium text-warning tabular-nums">
                  Upah cair: {currency(laborRealizedNum)}
                </p>
              ) : laborRequestedNum > 0 ? (
                <p className="type-p3 mt-0.5 font-medium text-warning tabular-nums">
                  Ajuan upah: {currency(laborRequestedNum)}
                </p>
              ) : null}
            </button>
          </TableCell>
        </>
      )}
      <TableCell className="sticky right-0 z-10 bg-card/95 text-right align-top backdrop-blur-xs">
        <div className="flex items-center justify-end gap-1.5">
          {isRunning && canSubmitProgress ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenDailyProgress(project)}
              className="gap-1.5"
            >
              <Camera className="size-3.5" aria-hidden="true" />
              Isi Progres
            </Button>
          ) : isPendingSetup ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenWorkstation(project, "titik")}
            >
              Setup
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={`/apps/projects/${project.id}`}>Detail</Link>
            </Button>
          )}
          <ProjectActionMenu {...props} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ============================================================================
 * MAIN COMPONENT
 * ============================================================================ */

export default function ProjectWorkstationMaster({
  projects,
  materialContracts = [],
  fieldTeamUsers,
  currentUserId,
  currentUserRole,
  surveyProjects,
  surveys,
  surveyorName,
  captureTime,
  currentTimeMs,
  initialSurveyProjectId,
}: {
  projects: ProjectWorkstationMasterData[];
  materialContracts?: TicketMaterialContractOption[];
  fieldTeamUsers: FieldTeamOption[];
  currentUserId: string;
  currentUserRole: UserRole;
  surveyProjects: SurveyProjectOption[];
  surveys: FieldSurveySummary[];
  surveyorName: string;
  captureTime: string;
  currentTimeMs: number;
  initialSurveyProjectId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const viewParam = searchParams.get("view");
  const projectParam = searchParams.get("projectId");
  const statusParam = searchParams.get("status");
  const actionParam = searchParams.get("action");

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    if (
      sectionParam === "surveys" ||
      actionParam === "daily-report" ||
      !projectParam
    ) {
      return null;
    }
    return projects.some((project) => project.id === projectParam)
      ? projectParam
      : null;
  });
  const [activeModalTab, setActiveModalTab] = useState<string>("pagu");
  const [showPicChart, setShowPicChart] = useState(false);
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false);

  // Daily Progress One-Way Modal state
  const [dailyProgressState, setDailyProgressState] = useState<{
    open: boolean;
    lockedProject: ProjectWorkstationMasterData | null;
    initialProjectId: string | null;
    initialWorkPointId: string | null;
  }>(() => ({
    open: actionParam === "daily-report",
    lockedProject: null,
    initialProjectId: projectParam,
    initialWorkPointId: null,
  }));

  // Hoisted Assign PIC Modal state
  const [picModalProject, setPicModalProject] =
    useState<ProjectWorkstationMasterData | null>(null);
  const [picModalSelectedUserId, setPicModalSelectedUserId] = useState("");

  // Hoisted CreateTicketModal state (mounted 1x at master level)
  const [ticketModalRequest, setTicketModalRequest] =
    useState<TicketModalTriggerConfig | null>(null);

  // In-App Photo & Document Lightbox
  const [previewMedia, setPreviewMedia] = useState<PreviewMediaState | null>(
    null,
  );

  // Offline queue count
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [ticketSeq, setTicketSeq] = useState(0);

  const projectStatusFilter =
    statusParam &&
    ["RUNNING", "PENDING_SETUP", "HOLD", "DONE"].includes(statusParam)
      ? statusParam
      : "ALL";
  const activeSection = sectionParam === "surveys" ? "surveys" : "projects";
  const surveyView = viewParam === "details" ? "details" : "map";
  const surveyProjectId =
    projectParam === "none"
      ? ""
      : (projectParam ?? initialSurveyProjectId ?? surveyProjects[0]?.id ?? "");

  const [editingProject, setEditingProject] =
    useState<ProjectDashboardRow | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [sortField, setSortField] = useState<ProjectSortField>("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [proposedUnitPrice, setProposedUnitPrice] = useState("");
  const [proposedTotalWage, setProposedTotalWage] = useState("");
  const [plannedStartDateInput, setPlannedStartDateInput] = useState("");
  const [targetDateInput, setTargetDateInput] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectViewMode, setProjectViewMode] = useState<
    "tabel" | "papan" | "dinas"
  >("tabel");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [blueprintCategory, setBlueprintCategory] = useState("ALL");
  const [blueprintStatus, setBlueprintStatus] = useState("ALL");
  const [uploadBlueprintCategory, setUploadBlueprintCategory] =
    useState("SHOP_DRAWING");
  const [isPending, startTransition] = useTransition();

  const [projectList, setProjectList] =
    useState<ProjectWorkstationMasterData[]>(projects);
  const [previousProjects, setPreviousProjects] = useState(projects);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(
    null,
  );

  if (projects !== previousProjects) {
    setPreviousProjects(projects);
    setProjectList(projects);
  }

  // Sync URL ?action=daily-report when query param changes
  const [prevActionParam, setPrevActionParam] = useState(actionParam);
  if (actionParam !== prevActionParam) {
    setPrevActionParam(actionParam);
    if (actionParam === "daily-report") {
      setDailyProgressState({
        open: true,
        lockedProject: null,
        initialProjectId: projectParam,
        initialWorkPointId: null,
      });
    }
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

  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    try {
      const result = await flushOfflineDailyReports(
        submitOfflineDailyReportAction,
      );
      await refreshQueueCount();
      if (result.skippedOffline) {
        toast.warning("Perangkat masih offline.");
      } else if (result.syncedCount > 0) {
        toast.success(
          `${result.syncedCount} laporan antrean berhasil dikirim.`,
        );
        requestNotificationFeedRefresh();
        router.refresh();
      } else if (result.failedCount > 0) {
        toast.error(
          result.results.find((r) => !r.success)?.message ||
            "Gagal mengirim antrean.",
        );
      }
    } finally {
      setIsFlushingQueue(false);
    }
  };

  // RBAC computations (accurate role checks — never hardcoded!)
  const isProjectManager =
    currentUserRole === UserRole.ADMINISTRATIONS ||
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR;

  const canViewFinancials = (
    [
      UserRole.DIRECTOR,
      UserRole.DEPUTY_DIRECTOR,
      UserRole.ADMINISTRATIONS,
      UserRole.FINANCE,
      UserRole.LOGISTICS,
    ] as UserRole[]
  ).includes(currentUserRole);

  const canDeleteProject =
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR;

  const isFieldTeam =
    currentUserRole === UserRole.FIELD_TEAM ||
    currentUserRole === UserRole.KOORDINATOR;

  const canSubmitDailyProgressRole = (
    [
      UserRole.ADMINISTRATIONS,
      UserRole.DIRECTOR,
      UserRole.DEPUTY_DIRECTOR,
      UserRole.KOORDINATOR,
      UserRole.FIELD_TEAM,
    ] as UserRole[]
  ).includes(currentUserRole);

  const canUserReportProject = (project: ProjectWorkstationMasterData) => {
    if (!canSubmitDailyProgressRole) return false;
    if (!isFieldTeam) return true;
    return project.fieldPicId === currentUserId;
  };

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
        isRunningProjectStatus(p.status) && p.progress < 85,
    },
    {
      key: "hampir_selesai" as const,
      title: "Hampir Selesai",
      match: (p: ProjectWorkstationMasterData) =>
        isRunningProjectStatus(p.status) &&
        p.progress >= 85 &&
        p.progress < 100,
    },
    {
      key: "selesai" as const,
      title: "Selesai",
      match: (p: ProjectWorkstationMasterData) =>
        p.status === "DONE" || p.progress >= 100,
    },
    {
      key: "ditunda" as const,
      title: "Ditunda & Batal",
      match: (p: ProjectWorkstationMasterData) =>
        p.status === "TERHAMBAT" || (p.status as string) === "ON_HOLD",
    },
  ];

  const handleCardDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedProjectId(id);
  };

  const handleCardDragEnd = () => {
    setDraggedProjectId(null);
    setDragOverColumnKey(null);
  };

  const handleColumnDragOver = (e: DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumnKey !== key) setDragOverColumnKey(key);
  };

  const handleColumnDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverColumnKey(null);
  };

  const handleColumnDrop = async (
    e: DragEvent,
    targetKey:
      | "tender"
      | "perencanaan"
      | "berjalan"
      | "hampir_selesai"
      | "selesai"
      | "ditunda",
  ) => {
    e.preventDefault();
    setDragOverColumnKey(null);
    const pId = e.dataTransfer.getData("text/plain") || draggedProjectId;
    setDraggedProjectId(null);
    if (!pId) return;

    const pToMove = projectList.find((p) => p.id === pId);
    if (!pToMove) return;

    let nextStatus: ProjectStatus = pToMove.status;
    let nextProgress = pToMove.progress;

    if (targetKey === "tender") nextStatus = ProjectStatus.PENDING_SETUP;
    else if (targetKey === "perencanaan") nextStatus = ProjectStatus.PENDING;
    else if (targetKey === "berjalan") {
      nextStatus = ProjectStatus.RUNNING;
      if (nextProgress >= 85) nextProgress = 50;
    } else if (targetKey === "hampir_selesai") {
      nextStatus = ProjectStatus.RUNNING;
      if (nextProgress < 85 || nextProgress >= 100) nextProgress = 90;
    } else if (targetKey === "selesai") {
      nextStatus = ProjectStatus.DONE;
      nextProgress = 100;
    } else if (targetKey === "ditunda") {
      nextStatus = ProjectStatus.TERHAMBAT;
    }

    const previousList = [...projectList];
    setProjectList((prev) =>
      prev.map((p) =>
        p.id === pId
          ? { ...p, status: nextStatus, progress: nextProgress }
          : p,
      ),
    );

    try {
      const res = await updateProjectKanbanStatus(pId, targetKey);
      if (!res.success) {
        setProjectList(previousList);
        toast.error(res.message || "Gagal memindahkan proyek.");
      } else {
        toast.success("Tahap proyek diperbarui.");
      }
    } catch (err) {
      setProjectList(previousList);
      toast.error(
        err instanceof Error ? err.message : "Gagal memindahkan proyek.",
      );
    }
  };

  const runningProjects = projectList.filter((p) =>
    isRunningProjectStatus(p.status),
  );
  const totalContractRunning = runningProjects.reduce(
    (sum, p) => sum + (Number.parseFloat(p.pagu) || 0),
    0,
  );
  const totalContractAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.pagu) || 0),
    0,
  );
  const totalRealizedAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.realized) || 0),
    0,
  );
  const totalRequestedAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.requestedTotal ?? p.realized) || 0),
    0,
  );
  const totalLaborRealizedAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.laborRealized ?? "0") || 0),
    0,
  );
  const totalLaborRequestedAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.laborRequested ?? "0") || 0),
    0,
  );
  const totalMaterialRealizedAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.materialRealized ?? "0") || 0),
    0,
  );
  const totalOperationalRealizedAll = projectList.reduce(
    (sum, p) => sum + (Number.parseFloat(p.operationalRealized ?? "0") || 0),
    0,
  );
  const projectsWithTicketsCount = projectList.filter(
    (p) =>
      (Number.parseFloat(p.realized) || 0) > 0 ||
      (Number.parseFloat(p.requestedTotal ?? "0") || 0) > 0,
  ).length;
  const projectsWithLaborCount = projectList.filter(
    (p) =>
      (Number.parseFloat(p.laborRealized ?? "0") || 0) > 0 ||
      (Number.parseFloat(p.laborRequested ?? "0") || 0) > 0,
  ).length;

  const overdueRunningCount = runningProjects.filter((p) => {
    if (!p.endDate) return false;
    return new Date(p.endDate).getTime() < currentTimeMs && p.progress < 100;
  }).length;
  const laggingRunningCount = runningProjects.filter((p) => {
    const planned = getPlannedProgress(p.startDate, p.endDate, currentTimeMs);
    return (
      planned !== null &&
      p.progress < 100 &&
      Math.round(planned - p.progress) >= 10
    );
  }).length;

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;
  const pendingDeleteProject =
    projects.find((project) => project.id === pendingDeleteProjectId) ?? null;
  const filteredBlueprints =
    activeProject?.blueprints.filter(
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
        isRunningProjectStatus(project.status)) ||
      (projectStatusFilter === "PENDING_SETUP" &&
        ["PENDING_SETUP", "PENDING", "PLANNED"].includes(project.status)) ||
      (projectStatusFilter === "HOLD" &&
        ["TERHAMBAT", "ON_HOLD"].includes(project.status)) ||
      (projectStatusFilter === "DONE" &&
        ["DONE", "COMPLETED"].includes(project.status));

    return (
      matchesStatus &&
      (!query ||
        [
          project.title,
          project.code,
          project.address,
          project.location ?? "",
          project.fieldPicName ?? "",
          project.kelompokTani ?? "",
        ].some((value) => value.toLocaleLowerCase("id-ID").includes(query)))
    );
  });

  const getAttentionRank = (project: ProjectWorkstationMasterData) => {
    const isOverdue =
      Boolean(project.endDate) &&
      new Date(project.endDate!).getTime() < currentTimeMs &&
      project.progress < 100;
    if (isOverdue) return 2;
    const plannedProgress = getPlannedProgress(
      project.startDate,
      project.endDate,
      currentTimeMs,
    );
    const hasDeviation =
      plannedProgress !== null &&
      project.progress < 100 &&
      Math.round(plannedProgress - project.progress) >= 10;
    return hasDeviation ? 1 : 0;
  };

  const sortedProjects = [...filteredProjects].sort((left, right) => {
    if (sortField === "default") {
      return (
        statusSortRank(left.status) - statusSortRank(right.status) ||
        left.title.localeCompare(right.title, "id-ID")
      );
    }
    const direction = sortDir === "asc" ? 1 : -1;
    let comparison = 0;
    switch (sortField) {
      case "title":
        comparison = left.title.localeCompare(right.title, "id-ID");
        break;
      case "status":
        comparison =
          statusSortRank(left.status) - statusSortRank(right.status) ||
          left.title.localeCompare(right.title, "id-ID");
        break;
      case "progress":
        comparison = left.progress - right.progress;
        break;
      case "endDate": {
        const leftDate = left.endDate ?? "9999-12-31";
        const rightDate = right.endDate ?? "9999-12-31";
        comparison = leftDate.localeCompare(rightDate);
        break;
      }
      case "attention":
        comparison = getAttentionRank(left) - getAttentionRank(right);
        break;
      case "pagu":
        comparison =
          (Number.parseFloat(left.pagu) || 0) -
          (Number.parseFloat(right.pagu) || 0);
        break;
      case "realized":
        comparison =
          (Number.parseFloat(left.realized) || 0) -
            (Number.parseFloat(right.realized) || 0) ||
          (Number.parseFloat(left.requestedTotal ?? "0") || 0) -
            (Number.parseFloat(right.requestedTotal ?? "0") || 0);
        break;
      case "labor":
        comparison =
          (Number.parseFloat(left.laborRealized ?? "0") || 0) -
            (Number.parseFloat(right.laborRealized ?? "0") || 0) ||
          (Number.parseFloat(left.laborRequested ?? "0") || 0) -
            (Number.parseFloat(right.laborRequested ?? "0") || 0);
        break;
    }
    return (
      comparison * direction || left.title.localeCompare(right.title, "id-ID")
    );
  });

  const toggleSort = (field: Exclude<ProjectSortField, "default">) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(
        field === "progress" ||
          field === "pagu" ||
          field === "attention" ||
          field === "realized" ||
          field === "labor"
          ? "desc"
          : "asc",
      );
    }
    setProjectPage(1);
  };

  const projectPageCount = Math.max(
    1,
    Math.ceil(sortedProjects.length / PROJECTS_PER_PAGE),
  );
  const currentProjectPage = Math.min(projectPage, projectPageCount);
  const visibleProjects = sortedProjects.slice(
    (currentProjectPage - 1) * PROJECTS_PER_PAGE,
    currentProjectPage * PROJECTS_PER_PAGE,
  );

  const runningProjectCount = projects.filter((project) =>
    isRunningProjectStatus(project.status),
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
    router.push(`/apps/projects?${params.toString()}`, { scroll: false });
    setProjectPage(1);
  };

  const openProjectModal = (
    project: ProjectWorkstationMasterData,
    initialTab?: string,
  ) => {
    setActiveProjectId(project.id);
    setActiveModalTab(initialTab ?? "pagu");
  };

  const openDailyProgressForProject = (
    project?: ProjectWorkstationMasterData | null,
    workPointId?: string | null,
  ) => {
    setDailyProgressState({
      open: true,
      lockedProject: project ?? null,
      initialProjectId: project?.id ?? null,
      initialWorkPointId: workPointId ?? null,
    });
  };

  const openTicketModal = (config: Omit<TicketModalTriggerConfig, "nonce">) => {
    const nextSeq = ticketSeq + 1;
    setTicketSeq(nextSeq);
    setTicketModalRequest({
      ...config,
      nonce: `tkt_${nextSeq}`,
    });
  };

  const openAssignPicModal = (project: ProjectWorkstationMasterData) => {
    setPicModalProject(project);
    setPicModalSelectedUserId(project.fieldPicId ?? "");
  };

  const getExportHref = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams({ format });
    if (search.trim()) params.set("search", search.trim());
    return `/api/projects/export?${params.toString()}`;
  };

  const handleToggleProjectSelect = (projectId: string, checked: boolean) => {
    if (checked) {
      setSelectedProjectIds((prev) =>
        prev.includes(projectId) ? prev : [...prev, projectId],
      );
    } else {
      setSelectedProjectIds((prev) => prev.filter((id) => id !== projectId));
    }
  };

  const permanentlyDeleteProject = () => {
    if (!pendingDeleteProjectId) return;
    const projectId = pendingDeleteProjectId;
    startTransition(async () => {
      try {
        const result = await deleteProject(projectId);
        if (result.success) {
          toast.success(result.message || "Proyek berhasil dihapus.");
          setConfirmArchiveOpen(false);
          setPendingDeleteProjectId(null);
          if (activeProjectId === projectId) setActiveProjectId(null);
          router.refresh();
        } else {
          toast.error(result.message || "Proyek gagal dihapus.");
        }
      } catch (error) {
        console.error(
          "Permanently deleting project from workstation failed:",
          error,
        );
        toast.error("Proyek gagal dihapus permanen. Silakan coba kembali.");
      }
    });
  };

  const handleSavePicAssignment = () => {
    if (!picModalProject) return;
    const projectId = picModalProject.id;
    const fieldPicId = picModalSelectedUserId;
    const selectedPic = fieldTeamUsers.find((user) => user.id === fieldPicId);

    startTransition(async () => {
      try {
        const result = await assignProjectFieldPic(projectId, fieldPicId);
        if (result.success) {
          toast.success(result.message || "PIC lapangan diperbarui.");
          setProjectList((prev) =>
            prev.map((project) =>
              project.id === projectId
                ? {
                    ...project,
                    fieldPicId: fieldPicId || null,
                    fieldPicName: selectedPic?.name ?? null,
                    fieldPicPhotoUrl: selectedPic?.profilePhotoUrl ?? null,
                  }
                : project,
            ),
          );
          setPicModalProject(null);
          router.refresh();
        } else {
          toast.error(result.message || "Penunjukan PIC gagal disimpan.");
        }
      } catch (error) {
        console.error("Assigning project PIC from workstation failed:", error);
        toast.error("Penunjukan PIC gagal disimpan. Silakan coba kembali.");
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
          plannedStartDate: plannedStartDateInput,
          targetDate: targetDateInput,
        });
        if (result.success) {
          toast.success(result.message || "Titik kerja berhasil diajukan.");
          form.reset();
          setProposedUnitPrice("");
          setProposedTotalWage("");
          setPlannedStartDateInput("");
          setTargetDateInput("");
          router.refresh();
        } else {
          toast.error(result.message || "Usulan titik dan upah gagal dikirim.");
        }
      } catch (error) {
        console.error("Submitting project wage proposal failed:", error);
        toast.error("Usulan titik dan upah gagal dikirim.");
      }
    });
  };

  const submitBlueprint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProject) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("category", uploadBlueprintCategory);
    startTransition(async () => {
      try {
        const result = await createBlueprint(activeProject.id, data);
        if (result.success) {
          toast.success(result.message || "Gambar kerja berhasil diunggah.");
          form.reset();
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message || "Gambar kerja gagal diunggah.");
        }
      } catch (error) {
        console.error("Uploading project blueprint failed:", error);
        toast.error("Gambar kerja gagal diunggah. Silakan coba kembali.");
      }
    });
  };

  const runProjectAction = (
    action: () => Promise<{ success: boolean; message: string }>,
  ) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Project workstation action failed:", error);
        toast.error("Aksi proyek gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const openMediaLightbox = (url: string, title: string) => {
    const isPdf = /\.pdf(?:[?#]|$)/i.test(url);
    setPreviewMedia({
      url: withLocalPhotoPreview(url),
      title,
      kind: isPdf ? "document" : "image",
    });
  };

  return (
    <div className="space-y-5">
      {activeSection === "projects" && (
        <div className="space-y-4">
          <PageHeader
            title="Master Proyek & Kurva S"
            description="Kendali paket pekerjaan, penunjukan PIC, otorisasi upah titik kerja, laporan harian, dan Kurva S."
            badge={
              <div className="flex flex-wrap items-center gap-2">
                <CurrentLocation variant="badge" />
                <Badge variant="secondary" className="gap-1.5">
                  <Users className="size-3.5" aria-hidden="true" />
                  <span>{assignedPicCount} PIC Aktif</span>
                </Badge>
              </div>
            }
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canSubmitDailyProgressRole && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openDailyProgressForProject(null)}
                    className="gap-1.5"
                  >
                    <Camera className="size-4" aria-hidden="true" />
                    <span>Isi Progres</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWorkflowGuide((prev) => !prev)}
                  className="gap-1.5"
                >
                  <span>Alur 4 Tahap</span>
                  {showWorkflowGuide ? (
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPicChart((prev) => !prev)}
                  className="gap-1.5"
                >
                  <ChartSpline
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  <span>Grafik PIC</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const projectId =
                      surveyProjectId || surveyProjects[0]?.id || "none";
                    router.push(
                      `/apps/projects?section=surveys&view=map&projectId=${encodeURIComponent(projectId)}`,
                    );
                  }}
                  className="gap-1.5"
                >
                  <MapPinned
                    className="size-4 text-sky-500"
                    aria-hidden="true"
                  />
                  <span>Peta GIS</span>
                </Button>
                {isProjectManager && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewProjectOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span>Proyek Baru</span>
                  </Button>
                )}
              </div>
            }
          />

          {showWorkflowGuide && (
            <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-border bg-card p-4 shadow-2xs sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  num: "01",
                  title: "Setup & Tunjuk PIC",
                  desc: "Input pagu, lokasi, dan tunjuk PIC lapangan melalui menu Aksi.",
                },
                {
                  num: "02",
                  title: "Titik Kerja & Upah",
                  desc: "Ajukan volume & upah titik kerja; Direktur menyetujui agar proyek aktif.",
                },
                {
                  num: "03",
                  title: "Laporan Harian",
                  desc: "Catat volume selesai harian + foto lapangan; Kurva S terhitung otomatis.",
                },
                {
                  num: "04",
                  title: "Gambar & BAST",
                  desc: "Unggah gambar DED/As-Built, verifikasi termin subkon, dan BAST.",
                },
              ].map((stepItem) => (
                <div
                  key={stepItem.num}
                  className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-3"
                >
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {stepItem.num}
                  </Badge>
                  <div className="min-w-0">
                    <p className="type-p2 font-bold text-foreground">
                      {stepItem.title}
                    </p>
                    <p className="type-p3 text-muted-foreground">
                      {stepItem.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Offline Outbox Banner */}
          {offlineQueueCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5">
              <div className="flex items-center gap-2.5">
                <WifiOff
                  className="size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div>
                  <p className="type-p2 font-semibold text-foreground">
                    Menunggu Sinyal ({offlineQueueCount} laporan)
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    Laporan progres harian tersimpan di perangkat dan akan
                    dikirim otomatis saat online.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isFlushingQueue}
                onClick={() => void handleFlushQueue()}
                className="gap-1.5"
              >
                <RefreshCw
                  className={cn("size-3.5", isFlushingQueue && "animate-spin")}
                  aria-hidden="true"
                />
                Kirim Antrean Sekarang
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status Filter Summary Cards */}
      {activeSection === "projects" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setStatusFilterUrl("ALL")}
            className={cn(
              "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
              projectStatusFilter === "ALL"
                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                : "border-border bg-card hover:border-primary/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="type-p3 font-semibold text-muted-foreground">
                Semua Proyek
              </span>
              <BriefcaseBusiness
                className="size-4 text-primary"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="type-kpi text-foreground">{projects.length}</span>
              <span className="type-p3 font-medium text-muted-foreground tabular-nums">
                Rata-rata {averageProgress.toFixed(1)}%
              </span>
            </div>
          </button>

          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setStatusFilterUrl("RUNNING")}
            className={cn(
              "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
              projectStatusFilter === "RUNNING"
                ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/30"
                : "border-border bg-card hover:border-sky-500/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="type-p3 font-semibold text-muted-foreground">
                Sedang Berjalan
              </span>
              <ChartSpline
                className="size-4 text-sky-500"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="type-kpi text-sky-600 dark:text-sky-400">
                {runningProjectCount}
              </span>
              <span className="type-p3 font-medium text-muted-foreground">
                Proyek aktif
              </span>
            </div>
          </button>

          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setStatusFilterUrl("PENDING_SETUP")}
            className={cn(
              "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
              projectStatusFilter === "PENDING_SETUP"
                ? "border-warning bg-warning/10 ring-1 ring-warning/30"
                : "border-border bg-card hover:border-warning/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="type-p3 font-semibold text-muted-foreground">
                Menunggu Setup
              </span>
              <Clock className="size-4 text-warning" aria-hidden="true" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="type-kpi text-warning">
                {pendingSetupProjectCount}
              </span>
              <span className="type-p3 font-medium text-muted-foreground">
                Perlu PIC / upah
              </span>
            </div>
          </button>

          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setStatusFilterUrl("DONE")}
            className={cn(
              "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
              projectStatusFilter === "DONE"
                ? "border-success bg-success/10 ring-1 ring-success/30"
                : "border-border bg-card hover:border-success/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="type-p3 font-semibold text-muted-foreground">
                Selesai / Tuntas
              </span>
              <CheckCircle2
                className="size-4 text-success"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="type-kpi text-success">
                {completedProjectCount}
              </span>
              <span className="type-p3 font-medium text-muted-foreground">
                Paket tuntas
              </span>
            </div>
          </button>
        </div>
      )}

      {activeSection === "projects" && showPicChart && (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="type-h3 text-foreground">
                Progres Berdasarkan PIC Lapangan
              </CardTitle>
              <p className="type-p3 text-muted-foreground">
                Rata-rata progres fisik dari proyek yang ditangani masing-masing
                PIC.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPicChart(false)}
            >
              Tutup
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
          {/* Schedule Quick Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
            <div>
              {pendingSetupProjectCount > 0 ? (
                <>
                  <span className="type-p3 font-semibold text-warning">
                    Tahap 01 · Persiapan Proyek
                  </span>
                  <p className="type-h3 text-foreground">
                    {pendingSetupProjectCount} proyek menunggu penunjukan PIC
                    atau persetujuan upah
                  </p>
                  <p className="type-p3 mt-0.5 text-muted-foreground">
                    Tunjuk PIC lapangan lewat menu Aksi atau buka detail proyek
                    untuk menyusun titik kerja &amp; jadwal.
                  </p>
                </>
              ) : (
                <>
                  <span className="type-p3 font-semibold text-muted-foreground">
                    Penjadwalan Lapangan
                  </span>
                  <h3 className="type-h3 text-foreground">
                    Jadwal Pekerjaan &amp; Kurva S (Gantt)
                  </h3>
                  <p className="type-p3 mt-0.5 text-muted-foreground">
                    Pantau linimasa titik kerja, target selesai, dan progres
                    aktual seluruh proyek.
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pendingSetupProjectCount > 0 &&
                projectStatusFilter !== "PENDING_SETUP" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStatusFilterUrl("PENDING_SETUP")}
                  >
                    Menunggu Setup ({pendingSetupProjectCount})
                  </Button>
                )}
              <Button asChild size="sm">
                <Link
                  href={
                    selectedProjectIds.length === 1
                      ? `/apps/projects/schedule?projectId=${encodeURIComponent(selectedProjectIds[0])}`
                      : "/apps/projects/schedule"
                  }
                >
                  Buka Jadwal
                </Link>
              </Button>
            </div>
          </div>

          {/* Section Header & Import/Template Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="type-h2 text-foreground">
                Daftar Proyek{canViewFinancials ? " & Realisasi Anggaran" : ""}
              </h2>
              <p className="type-p3 text-muted-foreground">
                {canViewFinancials
                  ? "Klik kartu metrik untuk memfilter berdasarkan nilai kontrak, tiket cair, upah tukang, atau deviasi Kurva S."
                  : "Pantau daftar proyek lapangan, progres fisik, dan kirim laporan harian."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sortField !== "default" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSortField("default");
                    setSortDir("asc");
                    setProjectPage(1);
                  }}
                >
                  Reset Urutan
                </Button>
              )}
              {isProjectManager && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setImportOpen(true)}
                    className="gap-1.5"
                  >
                    <Upload className="size-3.5" aria-hidden="true" />
                    <span>Impor Proyek</span>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href="/api/projects/template-excel"
                      download="template-proyek.xlsx"
                      className="gap-1.5"
                    >
                      <LayoutTemplate
                        className="size-3.5"
                        aria-hidden="true"
                      />
                      <span>Template</span>
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Operational & Financial KPI Cards (RBAC guarded!) */}
          {canViewFinancials ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => {
                  setStatusFilterUrl("RUNNING");
                  setSortField("pagu");
                  setSortDir("desc");
                  setProjectViewMode("tabel");
                }}
                className={cn(
                  "rounded-xl border p-4 text-left shadow-2xs transition-all",
                  sortField === "pagu" && projectStatusFilter === "RUNNING"
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="type-p3 flex items-center justify-between gap-1 font-medium text-muted-foreground">
                  <span>Nilai Kontrak ({runningProjects.length} proyek)</span>
                  <ChevronRight
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                </div>
                <p className="type-kpi mt-1 text-foreground">
                  {currency(totalContractRunning)}
                </p>
                <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                  Total pagu ({projectList.length}):{" "}
                  {currency(totalContractAll)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilterUrl("ALL");
                  setSortField("realized");
                  setSortDir("desc");
                  setProjectViewMode("tabel");
                }}
                className={cn(
                  "rounded-xl border p-4 text-left shadow-2xs transition-all",
                  sortField === "realized"
                    ? "border-success bg-success/10 ring-1 ring-success/30"
                    : "border-border bg-card hover:border-success/40",
                )}
              >
                <div className="type-p3 flex items-center justify-between gap-1 font-medium text-muted-foreground">
                  <span>Pengeluaran Tiket (Cair)</span>
                  <ChevronRight
                    className="size-3.5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                </div>
                <p className="type-kpi mt-1 text-success">
                  {currency(totalRealizedAll)}
                </p>
                <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                  Ajuan: {currency(totalRequestedAll)} ({projectsWithTicketsCount}
                  ) · Mat/Ops:{" "}
                  {currency(
                    totalMaterialRealizedAll + totalOperationalRealizedAll,
                  )}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilterUrl("ALL");
                  setSortField("labor");
                  setSortDir("desc");
                  setProjectViewMode("tabel");
                }}
                className={cn(
                  "rounded-xl border p-4 text-left shadow-2xs transition-all",
                  sortField === "labor"
                    ? "border-warning bg-warning/10 ring-1 ring-warning/30"
                    : "border-border bg-card hover:border-warning/40",
                )}
              >
                <div className="type-p3 flex items-center justify-between gap-1 font-medium text-muted-foreground">
                  <span>Realisasi Upah Tukang</span>
                  <ChevronRight
                    className="size-3.5 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                </div>
                <p className="type-kpi mt-1 text-warning">
                  {currency(totalLaborRealizedAll)}
                </p>
                <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                  Ajuan upah: {currency(totalLaborRequestedAll)} (
                  {projectsWithLaborCount} proyek)
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilterUrl("RUNNING");
                  setSortField("attention");
                  setSortDir("desc");
                  setProjectViewMode("tabel");
                }}
                className={cn(
                  "rounded-xl border p-4 text-left shadow-2xs transition-all",
                  sortField === "attention"
                    ? "border-destructive bg-destructive/10 ring-1 ring-destructive/30"
                    : "border-border bg-card hover:border-destructive/40",
                )}
              >
                <div className="type-p3 flex items-center justify-between gap-1 font-medium text-muted-foreground">
                  <span>Evaluasi Jadwal &amp; Kurva S</span>
                  <ChevronRight
                    className="size-3.5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                </div>
                <p className="type-kpi mt-1 text-foreground">
                  {overdueRunningCount} terlambat · {laggingRunningCount} deviasi
                </p>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Lewat batas atau tertinggal ≥10% dari Kurva S
                </p>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStatusFilterUrl("RUNNING");
                setSortField("attention");
                setSortDir("desc");
                setProjectViewMode("tabel");
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-2xs transition-all hover:border-primary/40"
            >
              <div>
                <p className="type-p3 font-medium text-muted-foreground">
                  Evaluasi Jadwal &amp; Kurva S
                </p>
                <p className="type-h2 mt-0.5 text-foreground tabular-nums">
                  {overdueRunningCount} terlambat · {laggingRunningCount} deviasi
                </p>
              </div>
              <Badge variant="outline">Filter Perlu Perhatian</Badge>
            </button>
          )}

          {/* Views Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={projectViewMode === "tabel" ? "secondary" : "ghost"}
                  onClick={() => setProjectViewMode("tabel")}
                >
                  Tabel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={projectViewMode === "papan" ? "secondary" : "ghost"}
                  onClick={() => setProjectViewMode("papan")}
                >
                  Papan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={projectViewMode === "dinas" ? "default" : "ghost"}
                  onClick={() => setProjectViewMode("dinas")}
                >
                  Laporan Dinas
                </Button>
              </div>

              {projectViewMode !== "dinas" && (
                <>
                  <div className="relative w-full sm:w-56">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setProjectPage(1);
                      }}
                      placeholder="Cari proyek..."
                      className="pl-8"
                    />
                  </div>

                  <Select
                    value={projectStatusFilter}
                    onValueChange={setStatusFilterUrl}
                  >
                    <SelectTrigger
                      aria-label="Filter status proyek"
                      className="w-40"
                    >
                      <Filter
                        className="mr-1 size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <SelectValue placeholder="Semua status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Status</SelectItem>
                      <SelectItem value="RUNNING">Berjalan</SelectItem>
                      <SelectItem value="PENDING_SETUP">
                        Tender / Setup
                      </SelectItem>
                      <SelectItem value="HOLD">Ditunda</SelectItem>
                      <SelectItem value="DONE">Selesai</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {projectViewMode !== "dinas" && (
              <div className="flex items-center gap-2">
                <span className="type-p3 text-muted-foreground tabular-nums">
                  {filteredProjects.length} proyek
                </span>
                {canViewFinancials && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        <span>Ekspor</span>
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={getExportHref("xlsx")}>
                          Ekspor ke Excel (.xlsx)
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={getExportHref("csv")}>
                          Ekspor ke CSV (.csv)
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5"
                >
                  <Printer className="size-3.5" aria-hidden="true" />
                  <span>Cetak</span>
                </Button>
              </div>
            )}
          </div>

          {/* TABEL VIEW */}
          {projectViewMode === "tabel" && (
            <div className="space-y-4">
              {/* Mobile Card View (< 768px) */}
              <div className="space-y-3 md:hidden">
                {sortedProjects.length > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                    <Label
                      htmlFor="select-all-projects-mobile"
                      className="type-p2 flex cursor-pointer items-center gap-2 font-medium text-foreground"
                    >
                      <Checkbox
                        id="select-all-projects-mobile"
                        checked={
                          selectedProjectIds.length > 0 &&
                          selectedProjectIds.length === sortedProjects.length
                        }
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setSelectedProjectIds(
                              sortedProjects.map((p) => p.id),
                            );
                          } else {
                            setSelectedProjectIds([]);
                          }
                        }}
                      />
                      <span>Pilih Semua ({sortedProjects.length})</span>
                    </Label>
                    <span className="type-p3 text-muted-foreground tabular-nums">
                      Hal. {currentProjectPage}
                    </span>
                  </div>
                )}

                {visibleProjects.map((project) => (
                  <ProjectMobileCard
                    key={project.id}
                    project={project}
                    isSelected={selectedProjectIds.includes(project.id)}
                    onToggleSelect={handleToggleProjectSelect}
                    currentTimeMs={currentTimeMs}
                    canViewFinancials={canViewFinancials}
                    isProjectManager={isProjectManager}
                    canDelete={canDeleteProject}
                    canSubmitProgress={canUserReportProject(project)}
                    hasFieldTeamUsers={fieldTeamUsers.length > 0}
                    onOpenDailyProgress={(p) =>
                      openDailyProgressForProject(p)
                    }
                    onOpenWorkstation={openProjectModal}
                    onOpenAssignPic={openAssignPicModal}
                    onOpenTicket={(p) =>
                      openTicketModal({ fixedProjectId: p.id })
                    }
                    onEditProject={editProject}
                    onRequestDelete={(p) => {
                      setPendingDeleteProjectId(p.id);
                      setConfirmArchiveOpen(true);
                    }}
                  />
                ))}

                {sortedProjects.length === 0 && (
                  <EmptyState
                    title={
                      projects.length
                        ? "Proyek tidak ditemukan"
                        : "Belum ada proyek terdaftar"
                    }
                    description={
                      projects.length
                        ? "Tidak ada proyek yang sesuai dengan filter atau pencarian."
                        : "Tambahkan proyek pertama untuk mulai memantau progres."
                    }
                  />
                )}
              </div>

              {/* Desktop Shadcn Table (>= 768px) */}
              <div className="hidden md:block">
                <Table pagination={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="Pilih semua proyek"
                          checked={
                            selectedProjectIds.length > 0 &&
                            selectedProjectIds.length === sortedProjects.length
                          }
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedProjectIds(
                                sortedProjects.map((p) => p.id),
                              );
                            } else {
                              setSelectedProjectIds([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="min-w-[200px]">
                        <button
                          type="button"
                          onClick={() => toggleSort("title")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <span>Proyek</span>
                          <ArrowUpDown
                            className={cn(
                              "size-3.5",
                              sortField === "title"
                                ? "text-primary"
                                : "opacity-60",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </TableHead>
                      <TableHead className="w-32">
                        <button
                          type="button"
                          onClick={() => toggleSort("status")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <span>Status</span>
                          <ArrowUpDown
                            className={cn(
                              "size-3.5",
                              sortField === "status"
                                ? "text-primary"
                                : "opacity-60",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </TableHead>
                      <TableHead className="w-40">
                        <button
                          type="button"
                          onClick={() => toggleSort("progress")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <span>Progres &amp; Kurva S</span>
                          <ArrowUpDown
                            className={cn(
                              "size-3.5",
                              sortField === "progress"
                                ? "text-primary"
                                : "opacity-60",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </TableHead>
                      <TableHead className="hidden w-36 md:table-cell">
                        <button
                          type="button"
                          onClick={() => toggleSort("endDate")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <span>Target Selesai</span>
                          <ArrowUpDown
                            className={cn(
                              "size-3.5",
                              sortField === "endDate"
                                ? "text-primary"
                                : "opacity-60",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        <button
                          type="button"
                          onClick={() => toggleSort("attention")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <span>Evaluasi Kurva S</span>
                          <ArrowUpDown
                            className={cn(
                              "size-3.5",
                              sortField === "attention"
                                ? "text-primary"
                                : "opacity-60",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </TableHead>
                      {canViewFinancials && (
                        <>
                          <TableHead className="hidden w-36 sm:table-cell">
                            <button
                              type="button"
                              onClick={() => toggleSort("pagu")}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              <span>Nilai Kontrak</span>
                              <ArrowUpDown
                                className={cn(
                                  "size-3.5",
                                  sortField === "pagu"
                                    ? "text-primary"
                                    : "opacity-60",
                                )}
                                aria-hidden="true"
                              />
                            </button>
                          </TableHead>
                          <TableHead className="hidden w-44 lg:table-cell">
                            <button
                              type="button"
                              onClick={() => toggleSort("realized")}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              <span>Tiket &amp; Upah</span>
                              <ArrowUpDown
                                className={cn(
                                  "size-3.5",
                                  sortField === "realized" ||
                                    sortField === "labor"
                                    ? "text-primary"
                                    : "opacity-60",
                                )}
                                aria-hidden="true"
                              />
                            </button>
                          </TableHead>
                        </>
                      )}
                      <TableHead className="sticky right-0 z-10 bg-muted/95 text-right backdrop-blur-xs">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleProjects.map((project) => (
                      <ProjectTableRow
                        key={project.id}
                        project={project}
                        isSelected={selectedProjectIds.includes(project.id)}
                        onToggleSelect={handleToggleProjectSelect}
                        currentTimeMs={currentTimeMs}
                        canViewFinancials={canViewFinancials}
                        isProjectManager={isProjectManager}
                        canDelete={canDeleteProject}
                        canSubmitProgress={canUserReportProject(project)}
                        hasFieldTeamUsers={fieldTeamUsers.length > 0}
                        onOpenDailyProgress={(p) =>
                          openDailyProgressForProject(p)
                        }
                        onOpenWorkstation={openProjectModal}
                        onOpenAssignPic={openAssignPicModal}
                        onOpenTicket={(p) =>
                          openTicketModal({ fixedProjectId: p.id })
                        }
                        onEditProject={editProject}
                        onRequestDelete={(p) => {
                          setPendingDeleteProjectId(p.id);
                          setConfirmArchiveOpen(true);
                        }}
                      />
                    ))}

                    {sortedProjects.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canViewFinancials ? 9 : 7}
                          className="py-10"
                        >
                          <EmptyState
                            variant="inline"
                            title={
                              projects.length
                                ? "Proyek tidak ditemukan"
                                : "Belum ada proyek terdaftar"
                            }
                            description={
                              projects.length
                                ? "Tidak ada proyek yang sesuai dengan filter atau pencarian."
                                : "Tambahkan proyek pertama Anda."
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <TablePaginationControls
                count={sortedProjects.length}
                pageSize={PROJECTS_PER_PAGE}
                page={currentProjectPage}
                itemLabel="proyek"
                onPageChange={setProjectPage}
              />
            </div>
          )}

          {/* PAPAN (KANBAN) VIEW */}
          {projectViewMode === "papan" && (
            <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-3 lg:grid-cols-6">
              {kanbanColumns.map((col) => {
                const colProjects = filteredProjects.filter(col.match);
                const isDragOver = dragOverColumnKey === col.key;

                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => handleColumnDragOver(e, col.key)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => void handleColumnDrop(e, col.key)}
                    className={cn(
                      "flex min-h-[320px] flex-col rounded-xl border p-2.5 transition-all",
                      isDragOver
                        ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                        : "border-border bg-muted/20",
                    )}
                  >
                    <div className="flex items-center justify-between pb-2">
                      <span className="type-p2 font-bold text-foreground">
                        {col.title}
                      </span>
                      <Badge variant="secondary" className="tabular-nums">
                        {colProjects.length}
                      </Badge>
                    </div>

                    <div className="min-h-24 flex-1 space-y-2">
                      {colProjects.map((p) => {
                        const isDragging = draggedProjectId === p.id;
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => handleCardDragStart(e, p.id)}
                            onDragEnd={handleCardDragEnd}
                            className={cn(
                              "block cursor-grab rounded-lg border bg-card p-3 shadow-2xs transition select-none active:cursor-grabbing",
                              isDragging
                                ? "scale-95 border-dashed border-primary opacity-30"
                                : "border-border hover:border-primary/50 hover:shadow-sm",
                            )}
                          >
                            <Link
                              href={`/apps/projects/${p.id}`}
                              onClick={(e) => {
                                if (draggedProjectId) e.preventDefault();
                              }}
                              className="block space-y-1.5"
                            >
                              <p className="type-p2 line-clamp-1 font-bold text-foreground">
                                {p.title}
                              </p>
                              <p className="type-p3 line-clamp-1 text-muted-foreground">
                                {p.code}
                                {p.clientName
                                  ? ` · ${p.clientName}`
                                  : p.address
                                    ? ` · ${p.address}`
                                    : ""}
                              </p>

                              {canViewFinancials && Number(p.pagu) > 0 && (
                                <p className="type-p2 font-mono font-semibold text-foreground tabular-nums">
                                  {currency(p.pagu)}
                                </p>
                              )}

                              {canViewFinancials && Number(p.realized) > 0 && (
                                <p className="type-p3 font-medium text-success tabular-nums">
                                  Tiket cair: {currency(p.realized)}
                                </p>
                              )}

                              <div className="space-y-1 pt-1">
                                <div className="type-p3 flex items-center justify-between tabular-nums">
                                  <span className="text-muted-foreground">
                                    Progres
                                  </span>
                                  <span className="font-bold">
                                    {p.progress > 0 && p.progress < 10
                                      ? `${p.progress.toFixed(1)}%`
                                      : `${p.progress.toFixed(0)}%`}
                                  </span>
                                </div>
                                <Progress
                                  value={p.progress}
                                  aria-label={`Progres ${p.title}`}
                                  className="h-1.5"
                                />
                              </div>

                              <div className="type-p3 flex items-center justify-between border-t border-border/50 pt-1.5 text-muted-foreground">
                                <span className="flex items-center gap-1 truncate">
                                  <Users className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="truncate">
                                    {p.fieldPicName || "Belum ada PIC"}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                  <Calendar
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {p.endDate
                                      ? formatProjectDate(p.endDate)
                                      : "—"}
                                  </span>
                                </span>
                              </div>
                            </Link>
                          </div>
                        );
                      })}

                      {colProjects.length === 0 && (
                        <div
                          className={cn(
                            "type-p3 flex h-28 items-center justify-center rounded-lg border border-dashed text-center",
                            isDragOver
                              ? "border-primary bg-primary/10 font-semibold text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          <span>
                            {isDragOver
                              ? "Lepas proyek di sini"
                              : "Belum ada proyek"}
                          </span>
                        </div>
                      )}
                    </div>

                    {isProjectManager && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewProjectOpen(true)}
                        className="mt-2 w-full justify-start gap-1.5 text-muted-foreground"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        <span>Tambah Proyek</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* LAPORAN RESMI DINAS VIEW */}
          {projectViewMode === "dinas" && (
            <div className="pt-2">
              <DinasProjectReportPage projects={projectList} />
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
                  router.push(nextUrl, { scroll: false });
                }
              }
            }}
            onOpenProjects={() => {
              const nextUrl = "/apps/projects";
              if (typeof window !== "undefined") {
                const currentUrl = `${window.location.pathname}${window.location.search}`;
                if (currentUrl !== nextUrl) {
                  router.push(nextUrl, { scroll: false });
                }
              }
            }}
            onProjectChange={(projectId) => {
              const nextUrl = `/apps/projects?section=surveys&view=${surveyView}&projectId=${encodeURIComponent(projectId || "none")}`;
              if (typeof window !== "undefined") {
                const currentUrl = `${window.location.pathname}${window.location.search}`;
                if (currentUrl !== nextUrl) {
                  router.push(nextUrl, { scroll: false });
                }
              }
            }}
          />
        </section>
      )}

      {/* Project Form Modal */}
      <ProjectFormModal
        key={editingProject?.id ?? (newProjectOpen ? "new-project" : "closed")}
        project={editingProject}
        fieldTeamUsers={fieldTeamUsers}
        canViewBudget={canViewFinancials}
        canManageUsers={isProjectManager}
        open={newProjectOpen || editingProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNewProjectOpen(false);
            setEditingProject(null);
          }
        }}
      />

      <ImportProjectModal open={importOpen} onOpenChange={setImportOpen} />

      {/* Unified One-Way Daily Progress Modal */}
      <DailyProgressModal
        open={dailyProgressState.open}
        onOpenChange={(open) => {
          setDailyProgressState((prev) => ({ ...prev, open }));
          if (!open && searchParams.get("action") === "daily-report") {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("action");
            const nextQuery = params.toString();
            window.history.replaceState(
              null,
              "",
              nextQuery ? `/apps/projects?${nextQuery}` : "/apps/projects",
            );
          }
        }}
        projects={projectList}
        lockedProject={dailyProgressState.lockedProject}
        initialProjectId={dailyProgressState.initialProjectId}
        initialWorkPointId={dailyProgressState.initialWorkPointId}
        onSuccess={() => router.refresh()}
        onQueueChange={setOfflineQueueCount}
      />

      {/* Hoisted Assign PIC Modal */}
      <GlobalModal
        isOpen={picModalProject !== null}
        onClose={() => setPicModalProject(null)}
        mobileBehavior="sheet"
        icon={<UserPlus className="size-4" aria-hidden="true" />}
        title="Tunjuk PIC Lapangan"
        description={
          picModalProject
            ? `Pilih PIC lapangan untuk proyek ${picModalProject.title}.`
            : ""
        }
        className="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPicModalProject(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSavePicAssignment}
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Simpan PIC"}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label className="type-p2 font-medium">PIC Lapangan</Label>
          <Combobox
            allowClear
            options={fieldTeamUsers.map((member) => ({
              value: member.id,
              label: member.name,
              description: member.email,
            }))}
            value={picModalSelectedUserId}
            onValueChange={setPicModalSelectedUserId}
            placeholder="Pilih PIC lapangan..."
            searchPlaceholder="Cari nama PIC..."
          />
        </div>
      </GlobalModal>

      {/* Workstation Detail Modal */}
      <GlobalModal
        isOpen={activeProject !== null}
        onClose={() => {
          setActiveProjectId(null);
          if (searchParams.get("projectId") && activeSection !== "surveys") {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("projectId");
            const nextQuery = params.toString();
            window.history.replaceState(
              null,
              "",
              nextQuery ? `/apps/projects?${nextQuery}` : "/apps/projects",
            );
          }
        }}
        mobileBehavior="sheet"
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
                {isFieldTeam &&
                  (activeProject.fieldPicId === currentUserId ||
                    currentUserRole === UserRole.KOORDINATOR) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() =>
                        openTicketModal({
                          fixedProjectId: activeProject.id,
                          defaultRequestCategory: "EQUIPMENT_REQUEST",
                        })
                      }
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      <span>Ajukan Alat</span>
                    </Button>
                  )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const projectId = activeProject.id;
                    setActiveProjectId(null);
                    router.push(
                      `/apps/projects?section=surveys&view=map&projectId=${encodeURIComponent(projectId)}`,
                    );
                  }}
                >
                  <MapPinned
                    className="size-4 text-sky-500"
                    aria-hidden="true"
                  />
                  <span>Peta GIS</span>
                </Button>
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/apps/projects/${activeProject.id}`}>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    <span>Detail Lengkap</span>
                  </Link>
                </Button>
                {isProjectManager && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => editProject(activeProject)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </Button>
                )}
                {canDeleteProject && (
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
                    <span>Hapus</span>
                  </Button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveProjectId(null)}
              >
                Tutup
              </Button>
            </div>
          ) : undefined
        }
      >
        {activeProject && (
          <div className="space-y-4">
            {/* Readiness Strip */}
            {(() => {
              const hasPic = Boolean(activeProject.fieldPicId);
              const totalPoints = activeProject.workPoints.length;
              const approvedPoints = activeProject.workPoints.filter((pt) =>
                Boolean(pt.approvedTotalWage),
              ).length;
              const isRunning = isRunningProjectStatus(activeProject.status);

              return (
                <div className="rounded-xl border border-border bg-muted/25 p-3.5">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={getStatusBadgeClass(activeProject.status)}
                      >
                        {statusLabels[activeProject.status] ??
                          activeProject.status}
                      </Badge>
                      <span className="type-p3 font-semibold text-muted-foreground tabular-nums">
                        Progres Proyek ({activeProject.progress.toFixed(1)}%)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-primary"
                      onClick={() => setActiveModalTab("kurva")}
                    >
                      <ChartSpline className="size-3.5" aria-hidden="true" />
                      <span>Lihat Kurva S</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div
                      className={cn(
                        "flex flex-col justify-between rounded-lg border p-3",
                        hasPic
                          ? "border-success/30 bg-success/5"
                          : "border-warning/40 bg-warning/10",
                      )}
                    >
                      <div className="type-p2 flex items-center justify-between gap-1 font-bold">
                        <span>1. Penunjukan PIC</span>
                        {hasPic ? (
                          <CheckCircle2
                            className="size-4 text-success"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="size-4 text-warning"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {hasPic
                          ? `PIC: ${activeProject.fieldPicName ?? "Sudah ditunjuk"}`
                          : "Wajib menunjuk PIC lapangan."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveModalTab("titik")}
                      className={cn(
                        "flex flex-col justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary",
                        approvedPoints > 0
                          ? "border-success/30 bg-success/5"
                          : "border-warning/40 bg-warning/10",
                      )}
                    >
                      <div className="type-p2 flex items-center justify-between gap-1 font-bold">
                        <span>2. Titik Kerja &amp; Upah</span>
                        {approvedPoints > 0 ? (
                          <CheckCircle2
                            className="size-4 text-success"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="size-4 text-warning"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {totalPoints === 0
                          ? "Belum ada titik kerja"
                          : `${approvedPoints}/${totalPoints} titik disetujui`}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        isRunning && canUserReportProject(activeProject)
                          ? openDailyProgressForProject(activeProject)
                          : setActiveModalTab("harian")
                      }
                      className={cn(
                        "flex flex-col justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary",
                        isRunning
                          ? "border-sky-500/30 bg-sky-500/5"
                          : "border-border bg-background/60",
                      )}
                    >
                      <div className="type-p2 flex items-center justify-between gap-1 font-bold">
                        <span>3. Laporan Harian</span>
                        <Camera
                          className="size-4 text-sky-500"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="type-p3 mt-1 text-muted-foreground">
                        {isRunning
                          ? `${activeProject.reports.length} laporan · Ketuk untuk isi`
                          : "Aktif setelah tahap 1 & 2 selesai"}
                      </p>
                    </button>
                  </div>
                </div>
              );
            })()}

            <Tabs
              key={activeProject.id}
              value={activeModalTab}
              onValueChange={setActiveModalTab}
              className="space-y-4"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/60 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
                <ProjectViewTab
                  value="pagu"
                  label={canViewFinancials ? "1. Info & Pagu" : "1. Info"}
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
                  label="6. Timeline"
                  icon={CalendarDays}
                />
              </TabsList>

              <TabsContent value="pagu" className="space-y-4">
                {canViewFinancials && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="type-h3">
                        Anggaran Pagu dan Realisasi Proyek
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(() => {
                        const pagu = Number(activeProject.pagu);
                        const realized = Number(activeProject.realized);
                        const requestedTotal = Number(
                          activeProject.requestedTotal ??
                            activeProject.realized,
                        );
                        const laborRealized = Number(
                          activeProject.laborRealized ?? 0,
                        );
                        const laborRequested = Number(
                          activeProject.laborRequested ?? 0,
                        );
                        const materialRealized = Number(
                          activeProject.materialRealized ?? 0,
                        );
                        const operationalRealized = Number(
                          activeProject.operationalRealized ?? 0,
                        );
                        const percent =
                          pagu > 0 ? Math.min((realized / pagu) * 100, 100) : 0;

                        return (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="type-p3 text-muted-foreground">
                                  Nilai Pagu Kontrak
                                </p>
                                <p className="type-h3 mt-1 font-mono text-success tabular-nums">
                                  {currency(pagu)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="type-p3 text-muted-foreground">
                                  Pengeluaran Tiket (Cair)
                                </p>
                                <p className="type-h3 mt-1 font-mono text-foreground tabular-nums">
                                  {currency(realized)}
                                </p>
                                <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                                  Diajukan: {currency(requestedTotal)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="type-p3 text-muted-foreground">
                                  Upah Tukang (Cair)
                                </p>
                                <p className="type-h3 mt-1 font-mono text-warning tabular-nums">
                                  {currency(laborRealized)}
                                </p>
                                <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                                  Ajuan: {currency(laborRequested)} · Mat/Ops:{" "}
                                  {currency(
                                    materialRealized + operationalRealized,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <p className="type-p3 text-muted-foreground">
                                  Sisa Pagu Anggaran
                                </p>
                                <p className="type-h3 mt-1 font-mono text-primary tabular-nums">
                                  {currency(Math.max(pagu - realized, 0))}
                                </p>
                              </div>
                            </div>
                            <Progress
                              value={percent}
                              aria-label={`Realisasi ${percent.toFixed(0)} persen`}
                            />
                            <p className="type-p3 text-right font-medium text-muted-foreground tabular-nums">
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
                    <CardTitle className="type-h3">
                      Identitas &amp; Informasi Proyek
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="type-p3 block text-muted-foreground">
                        Kode &amp; Kelompok Tani
                      </span>
                      <span className="type-p2 mt-0.5 block font-semibold text-foreground">
                        {activeProject.code} ·{" "}
                        {activeProject.kelompokTani || "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="type-p3 block text-muted-foreground">
                        Lokasi &amp; Alamat
                      </span>
                      <span className="type-p2 mt-0.5 block font-semibold text-foreground">
                        {activeProject.location || activeProject.address}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="type-p3 block text-muted-foreground">
                        Jenis Pekerjaan
                      </span>
                      <span className="type-p2 mt-0.5 block font-semibold text-foreground">
                        {activeProject.jenisPekerjaan ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="type-p3 block text-muted-foreground">
                        PIC Lapangan
                      </span>
                      <span className="type-p2 mt-0.5 block font-semibold text-foreground">
                        {activeProject.fieldPicName ?? "Belum ditentukan"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="type-p3 block text-muted-foreground">
                        Jadwal Pelaksanaan
                      </span>
                      <span className="type-p2 mt-0.5 block font-semibold text-foreground">
                        {formatProjectDate(activeProject.startDate)} –{" "}
                        {formatProjectDate(activeProject.endDate)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <span className="type-p3 block text-muted-foreground">
                        Realisasi Progres Fisik
                      </span>
                      <span className="type-p2 mt-0.5 block font-bold text-primary tabular-nums">
                        {activeProject.progress.toFixed(1)}% (
                        {activeProject.workPoints.length} Titik Kerja)
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {activeProject.subkonContracts.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="type-h3">
                        Kontrak Subkon &amp; Termin (SPK)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeProject.subkonContracts.map((contract) => (
                        <section
                          key={contract.id}
                          className="rounded-lg border p-3.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="type-p2 font-semibold">
                                {contract.contractNumber} ·{" "}
                                {contract.subkonName}
                              </p>
                              <p className="type-p3 mt-0.5 text-muted-foreground">
                                {canViewFinancials
                                  ? `Nilai: ${currency(contract.contractValue)} · `
                                  : ""}
                                Status: {contract.status}
                              </p>
                            </div>
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={`/d/${encodeURIComponent(contract.publicCode)}`}
                              >
                                Buka SPK
                              </Link>
                            </Button>
                          </div>
                          {contract.termyns.map((termyn) => (
                            <div
                              key={termyn.id}
                              className="type-p3 mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5"
                            >
                              <span className="font-medium tabular-nums">
                                Termin {termyn.termynNumber} · Klaim{" "}
                                {termyn.claimedPercent}%
                                {canViewFinancials
                                  ? ` · Netto ${currency(termyn.netAmount)}`
                                  : ""}
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
                                  submitSubkonTermyn(
                                    contract.publicCode,
                                    value,
                                  ),
                                );
                              }}
                            >
                              <Label className="type-p3">
                                Klaim Progres Fisik (%)
                                <Input
                                  name="claimedPercent"
                                  type="number"
                                  min="0.01"
                                  max="100"
                                  step="0.01"
                                  required
                                  className="mt-1 w-40"
                                />
                              </Label>
                              <Button size="sm" disabled={isPending}>
                                Ajukan Termin
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
                      <CardTitle className="type-h3">
                        Berita Acara Serah Terima (BAST)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {activeProject.bastDocuments.map((document) => (
                        <div
                          key={document.publicCode}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                        >
                          <div>
                            <p className="type-p2 font-semibold">
                              {document.bastNumber} · {document.type}
                            </p>
                            <p className="type-p3 text-muted-foreground">
                              {document.date} ·{" "}
                              {document.isApproved
                                ? "Disetujui"
                                : "Menunggu persetujuan"}
                            </p>
                          </div>
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/d/${encodeURIComponent(document.publicCode)}`}
                            >
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
                {((isFieldTeam && activeProject.fieldPicId === currentUserId) ||
                  isProjectManager) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="type-h3">
                        Ajukan Titik dan Total Upah Tukang
                      </CardTitle>
                      <p className="type-p3 text-muted-foreground">
                        {isFieldTeam
                          ? "Upah perlu disetujui Direktur sebelum proyek dapat dimulai."
                          : "Direktur/Administrasi dapat menyiapkan titik dan usulan upah."}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <form
                        className="grid w-full grid-cols-1 items-start gap-3 sm:grid-cols-2"
                        onSubmit={submitWorkPoint}
                      >
                        <Label className={workPointFieldClass}>
                          Nama titik / tugas
                          <Input
                            className="w-full"
                            name="title"
                            required
                            maxLength={180}
                          />
                        </Label>
                        <Label className={workPointFieldClass}>
                          Koordinat / Lokasi
                          <Input
                            className="w-full"
                            name="location"
                            maxLength={240}
                          />
                        </Label>
                        <div className={workPointFieldClass}>
                          <Label className="type-p2">Tanggal mulai rencana</Label>
                          <DatePicker
                            clearable
                            value={plannedStartDateInput}
                            onValueChange={setPlannedStartDateInput}
                            placeholder="Opsional"
                          />
                        </div>
                        <div className={workPointFieldClass}>
                          <Label className="type-p2">Tanggal target selesai</Label>
                          <DatePicker
                            clearable
                            value={targetDateInput}
                            onValueChange={setTargetDateInput}
                            placeholder="Opsional"
                          />
                        </div>
                        <Label className={workPointFieldClass}>
                          Volume pekerjaan
                          <Input
                            className="w-full"
                            name="proposedVolume"
                            type="number"
                            min="0.001"
                            step="0.001"
                            required
                            onChange={(event) => {
                              const form = event.currentTarget.form;
                              if (!form) return;
                              const formData = new FormData(form);
                              setProposedTotalWage(
                                calculateWorkPointTotal(
                                  String(formData.get("proposedVolume") ?? ""),
                                  String(
                                    formData.get("proposedUnitPrice") ?? "",
                                  ),
                                ),
                              );
                            }}
                          />
                        </Label>
                        <Label className={workPointFieldClass}>
                          Satuan volume
                          <Input
                            className="w-full"
                            name="proposedUnit"
                            maxLength={40}
                            placeholder="m, m², m³, unit"
                            required
                          />
                        </Label>
                        <Label className={workPointFieldClass}>
                          Harga satuan
                          <RupiahInput
                            name="proposedUnitPrice"
                            value={proposedUnitPrice}
                            onValueChange={(value, form) => {
                              setProposedUnitPrice(value);
                              const volume = String(
                                new FormData(form ?? undefined).get(
                                  "proposedVolume",
                                ) ?? "",
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
                        <p className="type-p3 text-muted-foreground sm:col-span-2">
                          Otomatis dihitung dari volume × harga satuan dan dapat
                          disesuaikan.
                        </p>
                        <Button
                          type="submit"
                          disabled={isPending}
                          className="sm:col-span-2"
                        >
                          {isPending
                            ? "Mengirim..."
                            : "Kirim Usulan ke Direktur"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="type-h3">
                      Daftar Titik Pekerjaan ({activeProject.workPoints.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {activeProject.workPoints.map((point) => {
                      const targetVol = Number(point.proposedVolume ?? 0);
                      const doneVol =
                        point.completedVolume ??
                        (targetVol * point.progress) / 100;

                      return (
                        <article
                          key={point.id}
                          className="rounded-xl border border-border bg-muted/15 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="type-p2 font-bold text-foreground">
                                {point.title}
                              </p>
                              <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                                {point.location || "Lokasi belum dicatat"}
                                {targetVol > 0 &&
                                  ` · Volume: ${formatVolume(doneVol)}/${formatVolume(targetVol)} ${point.proposedUnit ?? "unit"}`}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  point.approvedTotalWage
                                    ? "success"
                                    : "warning"
                                }
                              >
                                {point.approvedTotalWage
                                  ? "Upah Disetujui"
                                  : "Menunggu Persetujuan"}
                              </Badge>
                              <Badge variant="outline" className="tabular-nums">
                                Progres {point.progress.toFixed(1)}%
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-2.5">
                            <Progress
                              value={point.progress}
                              aria-label={`Progres ${point.title}`}
                              className="h-2"
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="type-p3 font-medium text-foreground tabular-nums">
                              Usulan Upah:{" "}
                              <strong>
                                {currency(point.proposedTotalWage)}
                              </strong>
                              {point.approvedTotalWage && (
                                <span className="ml-2 text-success">
                                  · Disetujui:{" "}
                                  <strong>
                                    {currency(point.approvedTotalWage)}
                                  </strong>
                                </span>
                              )}
                            </span>

                            <div className="flex flex-wrap items-center gap-2">
                              {isRunningProjectStatus(activeProject.status) &&
                                canUserReportProject(activeProject) && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5"
                                    onClick={() =>
                                      openDailyProgressForProject(
                                        activeProject,
                                        point.id,
                                      )
                                    }
                                  >
                                    <Camera
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    <span>Isi Progres</span>
                                  </Button>
                                )}

                              {point.approvedTotalWage &&
                                isFieldTeam &&
                                activeProject.fieldPicId === currentUserId && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="gap-1.5"
                                    onClick={() =>
                                      openTicketModal({
                                        fixedProjectId: activeProject.id,
                                        initialWageRequest: {
                                          projectId: activeProject.id,
                                          projectTitle: activeProject.title,
                                          workPointTitle: point.title,
                                        },
                                      })
                                    }
                                  >
                                    <Ticket
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    <span>Ajukan Upah</span>
                                  </Button>
                                )}
                            </div>
                          </div>

                          {currentUserRole === "DIRECTOR" &&
                            !point.approvedTotalWage && (
                              <form
                                className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const form = event.currentTarget;
                                  const amount = String(
                                    new FormData(form).get("amount") ?? "",
                                  );
                                  runProjectAction(() =>
                                    approveProjectWorkPointWage(
                                      point.id,
                                      amount,
                                    ),
                                  );
                                }}
                              >
                                <Label className="type-p3 flex-1">
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
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={isPending}
                                >
                                  Setujui &amp; Aktifkan
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
                              <Label className="type-p3">
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
                              <Label className="type-p3">
                                Alasan revisi
                                <Input
                                  name="wageReason"
                                  placeholder="Penyesuaian volume lapangan"
                                  minLength={5}
                                  maxLength={2000}
                                  required
                                  className="mt-1"
                                />
                              </Label>
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                className="self-end"
                              >
                                Simpan Revisi
                              </Button>
                            </form>
                          )}

                          {point.wageAuditLogs.length > 0 && (
                            <div className="mt-4 border-t border-border pt-3">
                              <p className="type-p3 font-semibold">
                                Audit revisi upah
                              </p>
                              <ul className="mt-2 space-y-2">
                                {point.wageAuditLogs.map((audit) => (
                                  <li
                                    key={audit.id}
                                    className="type-p3 rounded-md bg-muted/30 p-2.5"
                                  >
                                    <p className="font-medium tabular-nums">
                                      {currency(audit.oldWage)} →{" "}
                                      {currency(audit.newWage)}
                                    </p>
                                    <p className="mt-0.5 text-muted-foreground">
                                      {formatProjectDate(
                                        audit.createdAt.slice(0, 10),
                                      )}{" "}
                                      · {audit.changedByName}
                                    </p>
                                    {audit.reason && (
                                      <p className="mt-1 text-muted-foreground">
                                        {audit.reason}
                                      </p>
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
                      <EmptyState
                        title="Belum ada titik pekerjaan"
                        description="Tambahkan titik kerja dan usulan upah pada formulir di atas."
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 3: Laporan Harian (Terpadu ke DailyProgressModal + In-App Lightbox) */}
              <TabsContent value="harian" className="space-y-4">
                {isRunningProjectStatus(activeProject.status) &&
                canUserReportProject(activeProject) ? (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="space-y-1">
                        <h3 className="type-h3 text-foreground">
                          Isi Laporan Progres Harian
                        </h3>
                        <p className="type-p3 text-muted-foreground">
                          Catat progres multi-item, cuaca, pekerja, kendala, K3,
                          dan foto terkompresi (mendukung mode offline).
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          openDailyProgressForProject(activeProject)
                        }
                        className="shrink-0 gap-1.5"
                      >
                        <Camera className="size-4" aria-hidden="true" />
                        Isi Laporan Hari Ini
                      </Button>
                    </CardContent>
                  </Card>
                ) : !isRunningProjectStatus(activeProject.status) ? (
                  <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-center sm:flex-row sm:text-left">
                    <div className="space-y-1">
                      <p className="type-p2 font-bold text-foreground">
                        Proyek Menunggu Setup
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        Laporan harian aktif setelah PIC lapangan ditunjuk dan
                        minimal 1 titik kerja disetujui Direktur.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setActiveModalTab("titik")}
                      className="shrink-0 gap-1.5"
                    >
                      <HardHat className="size-4" aria-hidden="true" />
                      Buka Titik &amp; Upah
                    </Button>
                  </div>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle className="type-h3">
                      Riwayat Laporan Harian
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {activeProject.reports.map((report) => (
                      <article
                        key={report.id}
                        className="space-y-2 rounded-xl border border-border p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="type-p2 font-semibold text-foreground">
                            {report.reportDate} ·{" "}
                            {report.weather ?? "Cuaca tidak dicatat"}
                          </p>
                          <Badge variant="outline" className="tabular-nums">
                            {report.progress === null
                              ? "—"
                              : `${report.progress}%`}
                          </Badge>
                        </div>

                        <p className="type-p3 text-muted-foreground tabular-nums">
                          {report.workersCount} pekerja ·{" "}
                          {report.photoUrls.length} foto
                        </p>

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
                              <p className="type-p2 text-foreground tabular-nums">
                                {point.title}:{" "}
                                {formatVolume(report.dailyVolume)}{" "}
                                {point.proposedUnit ?? "unit"} hari ini · total{" "}
                                {formatVolume(total)}/{formatVolume(target)}{" "}
                                {point.proposedUnit ?? "unit"}
                              </p>
                            );
                          })()}

                        {report.workSummary && (
                          <p className="type-p2 whitespace-pre-line text-foreground">
                            {report.workSummary}
                          </p>
                        )}
                        {report.notes && (
                          <p className="type-p3 whitespace-pre-line text-muted-foreground">
                            Catatan: {report.notes}
                          </p>
                        )}
                        {report.k3SafetyLog && (
                          <p className="type-p3 flex items-center gap-1.5 text-success">
                            <ShieldCheck
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>K3: {report.k3SafetyLog}</span>
                          </p>
                        )}

                        {report.photoUrls.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {report.photoUrls.map((url, index) => (
                              <button
                                key={`${url}-${index}`}
                                type="button"
                                onClick={() =>
                                  openMediaLightbox(
                                    url,
                                    `Foto Laporan ${report.reportDate} #${index + 1}`,
                                  )
                                }
                                className="group relative size-16 overflow-hidden rounded-lg border border-border bg-muted/30"
                              >
                                <Image
                                  src={withLocalPhotoPreview(url)}
                                  alt={`Foto laporan ${index + 1}`}
                                  width={64}
                                  height={64}
                                  className="size-full object-cover transition group-hover:scale-105"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                    {activeProject.reports.length === 0 && (
                      <EmptyState
                        variant="inline"
                        title="Belum ada laporan harian"
                        description="Laporan progres harian akan tampil di sini."
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="gambar" className="space-y-4">
                {(currentUserRole === "DRAFTER" || isProjectManager) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="type-h3">
                        Unggah Gambar Kerja (DED / Shop Drawing / As-Built)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={submitBlueprint}
                      >
                        <Label className="type-p2">
                          Nomor gambar
                          <Input
                            name="drawingNumber"
                            placeholder="Contoh: DED-STR-01"
                            maxLength={80}
                            required
                          />
                        </Label>
                        <Label className="type-p2">
                          Judul gambar
                          <Input
                            name="title"
                            placeholder="Judul detail gambar kerja"
                            maxLength={180}
                            required
                          />
                        </Label>
                        <div className="space-y-1.5">
                          <Label className="type-p2">Kategori</Label>
                          <Select
                            value={uploadBlueprintCategory}
                            onValueChange={setUploadBlueprintCategory}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Pilih kategori" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SHOP_DRAWING">
                                Shop Drawing
                              </SelectItem>
                              <SelectItem value="AS_BUILT">As-Built</SelectItem>
                              <SelectItem value="ARCHITECTURAL">
                                Architectural
                              </SelectItem>
                              <SelectItem value="STRUCTURAL">
                                Structural
                              </SelectItem>
                              <SelectItem value="MEP">MEP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Label className="type-p2">
                          Revisi
                          <Input
                            name="revision"
                            defaultValue="REV-00"
                            maxLength={30}
                            required
                          />
                        </Label>
                        <Label className="type-p2 sm:col-span-2">
                          File PDF / DWG / DXF
                          <Input
                            name="file"
                            type="file"
                            accept=".pdf,.dwg,.dxf,application/pdf,application/acad,application/x-acad,application/dxf"
                            required
                          />
                        </Label>
                        <Button
                          type="submit"
                          disabled={isPending}
                          className="sm:col-span-2"
                        >
                          {isPending
                            ? "Mengunggah..."
                            : "Unggah & Ajukan Review"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="type-h3">
                        Daftar Gambar Kerja Proyek
                      </CardTitle>
                      <p className="type-p3 text-muted-foreground">
                        Dokumen teknis Shop Drawing, As-Built, dan status IFC.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/apps/drafter?projectId=${encodeURIComponent(activeProject.id)}`}
                        >
                          Workspace Drafter
                        </Link>
                      </Button>
                      <Select
                        value={blueprintCategory}
                        onValueChange={setBlueprintCategory}
                      >
                        <SelectTrigger
                          aria-label="Filter kategori gambar"
                          className="w-40"
                        >
                          <SelectValue placeholder="Semua kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Semua kategori</SelectItem>
                          <SelectItem value="SHOP_DRAWING">
                            Shop Drawing
                          </SelectItem>
                          <SelectItem value="ARCHITECTURAL">
                            Architectural
                          </SelectItem>
                          <SelectItem value="STRUCTURAL">Structural</SelectItem>
                          <SelectItem value="MEP">MEP</SelectItem>
                          <SelectItem value="AS_BUILT">As-Built</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={blueprintStatus}
                        onValueChange={setBlueprintStatus}
                      >
                        <SelectTrigger
                          aria-label="Filter status gambar"
                          className="w-44"
                        >
                          <SelectValue placeholder="Semua status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Semua status</SelectItem>
                          <SelectItem value="DRAFT">Draft</SelectItem>
                          <SelectItem value="FOR_APPROVAL">
                            Menunggu review
                          </SelectItem>
                          <SelectItem value="APPROVED_FOR_CONSTRUCTION">
                            Approved IFC
                          </SelectItem>
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
                          <p className="type-p2 font-semibold">
                            {blueprint.drawingNumber} · {blueprint.title}
                          </p>
                          <p className="type-p3 mt-0.5 text-muted-foreground">
                            {blueprint.category} · {blueprint.revision} ·
                            Drafter: {blueprint.drafterName}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{blueprint.status}</Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openMediaLightbox(
                                blueprint.fileUrl,
                                `${blueprint.drawingNumber} · ${blueprint.title}`,
                              )
                            }
                          >
                            Buka File
                          </Button>
                          {blueprint.status === "FOR_APPROVAL" &&
                            [
                              "KOORDINATOR",
                              "DIRECTOR",
                              "DEPUTY_DIRECTOR",
                            ].includes(currentUserRole) && (
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
                                      reviewBlueprint(
                                        blueprint.publicCode,
                                        "REJECTED",
                                      ),
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
                      <EmptyState
                        variant="inline"
                        title="Belum ada gambar kerja"
                        description={
                          activeProject.blueprints.length === 0
                            ? "Belum ada file gambar kerja untuk proyek ini."
                            : "Tidak ada gambar kerja yang cocok dengan filter."
                        }
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="kurva" className="space-y-4">
                {(() => {
                  const series = getSCurveSeries(activeProject, currentTimeMs);
                  const targetPoints = series[0]?.data ?? [];
                  const nowMs = currentTimeMs;
                  let plannedToday = 0;
                  if (targetPoints.length > 0) {
                    const firstX = Number(targetPoints[0].x);
                    const lastX = Number(
                      targetPoints[targetPoints.length - 1].x,
                    );
                    if (nowMs <= firstX) plannedToday = 0;
                    else if (nowMs >= lastX) plannedToday = 100;
                    else {
                      const t = (nowMs - firstX) / Math.max(1, lastX - firstX);
                      plannedToday =
                        Math.round((3 * t ** 2 - 2 * t ** 3) * 1000) / 10;
                    }
                  }
                  const actualToday = Number(activeProject.progress.toFixed(1));
                  const deviation = Number(
                    (actualToday - plannedToday).toFixed(1),
                  );

                  return (
                    <>
                      <Card>
                        <CardHeader className="flex flex-col justify-between gap-3 pb-3 sm:flex-row sm:items-center">
                          <div>
                            <CardTitle className="type-h3">
                              Kurva S — Target Rencana vs Realisasi
                            </CardTitle>
                            <p className="type-p3 text-muted-foreground">
                              Dihitung otomatis dari jadwal proyek dan laporan
                              harian titik kerja.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setActiveModalTab("titik")}
                            >
                              <HardHat
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              <span>Titik Kerja</span>
                            </Button>
                            {isRunningProjectStatus(activeProject.status) &&
                              canUserReportProject(activeProject) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() =>
                                    openDailyProgressForProject(activeProject)
                                  }
                                >
                                  <Camera
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Isi Progres</span>
                                </Button>
                              )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                              <span className="type-p3 block font-medium text-muted-foreground">
                                Periode Pelaksanaan
                              </span>
                              <span className="type-p2 mt-1 block font-bold text-foreground">
                                {formatProjectDate(activeProject.startDate)} –{" "}
                                {formatProjectDate(activeProject.endDate)}
                              </span>
                            </div>
                            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                              <span className="type-p3 block font-medium text-muted-foreground">
                                Target Hari Ini
                              </span>
                              <span className="type-kpi mt-1 block text-sky-500">
                                {plannedToday.toFixed(1)}%
                              </span>
                            </div>
                            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                              <span className="type-p3 block font-medium text-muted-foreground">
                                Realisasi Aktual
                              </span>
                              <span className="type-kpi mt-1 block text-orange-500">
                                {actualToday.toFixed(1)}%
                              </span>
                            </div>
                            <div
                              className={cn(
                                "rounded-lg border p-3",
                                deviation >= 0
                                  ? "border-success/30 bg-success/5"
                                  : "border-destructive/30 bg-destructive/5",
                              )}
                            >
                              <span className="type-p3 block font-medium text-muted-foreground">
                                Deviasi Progres
                              </span>
                              <div className="mt-1 flex items-baseline gap-2">
                                <span
                                  className={cn(
                                    "type-kpi",
                                    deviation >= 0
                                      ? "text-success"
                                      : "text-destructive",
                                  )}
                                >
                                  {deviation > 0
                                    ? `+${deviation}%`
                                    : `${deviation}%`}
                                </span>
                                <span className="type-p3 font-medium text-muted-foreground">
                                  {deviation >= 0
                                    ? "Sesuai"
                                    : "Perlu Percepatan"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="min-h-[320px] rounded-xl border border-border bg-background/40 p-2 sm:p-3">
                            <Chart
                              type="line"
                              options={sCurveOptions}
                              series={series}
                              height={340}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="type-h3">
                            Rincian Kontribusi Titik Kerja
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {activeProject.workPoints.length > 0 ? (
                            <Table pagination={false}>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Titik Kerja / Item</TableHead>
                                  <TableHead>Volume Selesai / Target</TableHead>
                                  <TableHead>Progres Item</TableHead>
                                  <TableHead>Target Selesai</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {activeProject.workPoints.map((pt) => {
                                  const targetVol = Number(
                                    pt.proposedVolume ?? 0,
                                  );
                                  const doneVol =
                                    pt.completedVolume ??
                                    (targetVol * pt.progress) / 100;
                                  return (
                                    <TableRow key={pt.id}>
                                      <TableCell className="type-p2 font-semibold">
                                        {pt.title}
                                        {pt.location && (
                                          <span className="type-p3 block font-normal text-muted-foreground">
                                            {pt.location}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className="type-p3 tabular-nums">
                                        {targetVol > 0
                                          ? `${formatVolume(doneVol)} / ${formatVolume(targetVol)} ${pt.proposedUnit ?? "unit"}`
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="min-w-36">
                                        <div className="flex items-center gap-2">
                                          <Progress
                                            value={pt.progress}
                                            aria-label={`Progres ${pt.title}`}
                                            className="h-2 flex-1"
                                          />
                                          <span className="type-p3 font-bold tabular-nums">
                                            {pt.progress.toFixed(1)}%
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="type-p3 text-muted-foreground">
                                        {formatProjectDate(pt.targetDate)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          ) : (
                            <EmptyState
                              variant="inline"
                              title="Belum ada titik pekerjaan"
                              description="Belum ada titik pekerjaan terdaftar pada proyek ini."
                            />
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
                    <CardTitle className="type-h3">
                      Timeline Pekerjaan per Titik
                    </CardTitle>
                    <p className="type-p3 text-muted-foreground">
                      Jadwal mulai, target selesai, dan capaian progres setiap
                      titik kerja proyek.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {activeProject.workPoints.map((point) => (
                      <article
                        key={point.id}
                        className="space-y-2.5 rounded-lg border p-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="type-p2 font-semibold">
                              {point.title}
                            </h3>
                            <p className="type-p3 mt-0.5 text-muted-foreground">
                              {point.location || "Lokasi belum dicatat"}
                            </p>
                          </div>
                          <Badge variant="outline" className="tabular-nums">
                            {point.progress.toFixed(1)}%
                          </Badge>
                        </div>
                        <Progress
                          value={point.progress}
                          aria-label={`Progres ${point.title}`}
                        />
                        <div className="type-p3 flex flex-wrap justify-between gap-2 text-muted-foreground">
                          <span>
                            Mulai: {formatProjectDate(point.plannedStartDate)}
                          </span>
                          <span>
                            Target: {formatProjectDate(point.targetDate)}
                          </span>
                        </div>
                      </article>
                    ))}
                    {activeProject.workPoints.length === 0 && (
                      <EmptyState
                        variant="inline"
                        title="Belum ada titik kerja"
                        description="Belum ada titik kerja untuk ditampilkan pada timeline."
                      />
                    )}
                  </CardContent>
                </Card>

                {canViewFinancials &&
                  (() => {
                    const approvedTotal = activeProject.workPoints.reduce(
                      (sum, point) =>
                        sum +
                        Number(
                          point.approvedTotalWage ??
                            point.proposedTotalWage ??
                            0,
                        ),
                      0,
                    );
                    const laborTickets =
                      activeProject.wageTicketPayments.filter(
                        (payment) =>
                          (payment.fundCategory ??
                            classifyTicketFundCategory(payment).key) ===
                          "TUKANG",
                      );
                    const paidLaborTotal = laborTickets.reduce(
                      (sum, payment) =>
                        sum + (payment.paid ? Number(payment.amount ?? 0) : 0),
                      0,
                    );
                    const requestedLaborTotal = laborTickets.reduce(
                      (sum, payment) => sum + Number(payment.amount ?? 0),
                      0,
                    );
                    const allPaidTicketsTotal =
                      activeProject.wageTicketPayments.reduce(
                        (sum, payment) =>
                          sum +
                          (payment.paid ? Number(payment.amount ?? 0) : 0),
                        0,
                      );
                    const allRequestedTicketsTotal =
                      activeProject.wageTicketPayments.reduce(
                        (sum, payment) => sum + Number(payment.amount ?? 0),
                        0,
                      );
                    const remaining = Math.max(
                      approvedTotal - paidLaborTotal,
                      0,
                    );

                    return (
                      <>
                        <Card>
                          <CardHeader>
                            <CardTitle className="type-h3">
                              Ringkasan Upah Tukang &amp; Pengeluaran Tiket
                            </CardTitle>
                            <p className="type-p3 text-muted-foreground">
                              Tersinkronisasi otomatis dengan pengajuan dan
                              pencairan tiket proyek.
                            </p>
                          </CardHeader>
                          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="type-p3 text-muted-foreground">
                                Nilai Pekerjaan / Upah
                              </p>
                              <p className="type-h3 mt-1 font-mono tabular-nums">
                                {currency(approvedTotal)}
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="type-p3 text-muted-foreground">
                                Upah Tukang Dibayar
                              </p>
                              <p className="type-h3 mt-1 font-mono text-success tabular-nums">
                                {currency(paidLaborTotal)}
                              </p>
                              <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                                Diajukan: {currency(requestedLaborTotal)} (
                                {laborTickets.length})
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="type-p3 text-muted-foreground">
                                Total Tiket Proyek
                              </p>
                              <p className="type-h3 mt-1 font-mono text-primary tabular-nums">
                                {currency(allPaidTicketsTotal)}
                              </p>
                              <p className="type-p3 mt-0.5 text-muted-foreground tabular-nums">
                                Ajuan: {currency(allRequestedTicketsTotal)} (
                                {activeProject.wageTicketPayments.length})
                              </p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-3">
                              <p className="type-p3 text-muted-foreground">
                                Sisa Pagu Upah
                              </p>
                              <p className="type-h3 mt-1 font-mono text-warning tabular-nums">
                                {currency(remaining)}
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="type-h3">
                              Histori Pencairan Tiket Proyek
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {activeProject.wageTicketPayments.map((payment) => {
                              const cat = classifyTicketFundCategory(payment);
                              return (
                                <article
                                  key={payment.id}
                                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3.5"
                                >
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="type-p2 font-semibold">
                                        Tiket {payment.ticketNumber} ·{" "}
                                        {payment.title}
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className={cat.badgeClass}
                                      >
                                        {cat.label}
                                      </Badge>
                                      <Badge
                                        variant={
                                          payment.paid ? "success" : "warning"
                                        }
                                      >
                                        {payment.paid
                                          ? "Cair / Dibayar"
                                          : "Menunggu"}
                                      </Badge>
                                    </div>
                                    <p className="type-p3 mt-1 text-muted-foreground">
                                      {payment.paid
                                        ? `Dibayar ${formatProjectDate(payment.paidAt)}`
                                        : `Status ${statusLabels[payment.status] ?? payment.status}`}
                                      {" · "}Diajukan oleh{" "}
                                      {payment.requesterName}
                                    </p>
                                  </div>
                                  <p className="type-p2 font-mono font-bold tabular-nums">
                                    {payment.amount &&
                                    Number(payment.amount) > 0
                                      ? currency(payment.amount)
                                      : "Belum ditetapkan"}
                                  </p>
                                </article>
                              );
                            })}
                            {activeProject.wageTicketPayments.length === 0 && (
                              <EmptyState
                                variant="inline"
                                title="Belum ada tiket pengeluaran"
                                description="Belum ada tiket pengeluaran atau upah pada proyek ini."
                              />
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

      {/* In-App Lightbox Modal (Photo & Document Preview — zero target="_blank") */}
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
                <a
                  href={photoDownloadHref(previewMedia.url)}
                  download
                >
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

      {/* Hoisted Single CreateTicketModal (never mounted inside rows/cards) */}
      {ticketModalRequest && (
        <div className="hidden" aria-hidden="true">
          <CreateTicketModal
            key={ticketModalRequest.nonce}
            projects={ticketProjectOptions}
            materialContracts={materialContracts}
            requesterRole={currentUserRole}
            defaultOpen={true}
            defaultRequestCategory={ticketModalRequest.defaultRequestCategory}
            fixedProjectId={ticketModalRequest.fixedProjectId}
            initialWageRequest={ticketModalRequest.initialWageRequest}
            triggerLabel="Buat Tiket"
          />
        </div>
      )}

      {/* Delete Project Confirmation */}
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
              Proyek, titik pekerjaan, laporan, blueprint, upah, dan data
              terkait akan dihapus permanen dan tidak dapat dipulihkan.
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
