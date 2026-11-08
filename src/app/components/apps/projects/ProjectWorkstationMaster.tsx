"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  addProjectProgress,
  assignProjectFieldPic,
  approveProjectWorkPointWage,
  createProjectWorkPoint,
  deleteProject,
  editApprovedProjectWorkPointWage,
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
  ClipboardList,
  Download,
  Ellipsis,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const workPointFieldClass =
  "flex w-full min-w-0 flex-col items-start gap-1.5 text-left";

function ProjectViewTab({
  value,
  label,
  icon: Icon,
}: {
  value: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTrigger
          value={value}
          aria-label={label}
          className="h-10 w-10 min-w-10 shrink-0 rounded-md border border-primary/75 bg-transparent p-0 text-primary hover:bg-primary hover:text-primary-foreground aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-sm aria-selected:ring-2 aria-selected:ring-primary/40 aria-selected:ring-offset-2 aria-selected:ring-offset-background sm:h-auto sm:w-auto sm:min-w-0 sm:shrink sm:rounded-sm sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5 sm:text-foreground sm:hover:bg-accent sm:hover:text-accent-foreground sm:aria-selected:bg-primary sm:aria-selected:text-primary-foreground sm:aria-selected:ring-0 sm:aria-selected:ring-offset-0"
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </TabsTrigger>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
  PENDING_SETUP: "PENDING SETUP",
  RUNNING: "RUNNING",
  PENDING: "PENDING SETUP",
  PLANNED: "PENDING SETUP",
  ON_PROGRESS: "RUNNING",
  ACTIVE: "RUNNING",
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
  },
  colors: ["#102A4D", "#E67E22"],
  dataLabels: { enabled: false },
  stroke: { curve: "smooth", width: 3 },
  legend: { position: "top" },
  xaxis: {
    type: "datetime",
    labels: { datetimeUTC: false, format: "dd MMM yy" },
  },
  yaxis: {
    min: 0,
    max: 100,
    tickAmount: 5,
    labels: {
      formatter: (value) =>
        typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—",
    },
  },
  tooltip: {
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
  if (status === "PENDING_SETUP") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (status === "RUNNING" || status === "ON_PROGRESS" || status === "ACTIVE") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300";
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
  const sectionParam = searchParams.get("section");
  const viewParam = searchParams.get("view");
  const projectParam = searchParams.get("projectId");
  const projectStatusFilter =
    searchParams.get("status") === "RUNNING" ? "RUNNING" : "ALL";
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
  const [importOpen, setImportOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [blueprintCategory, setBlueprintCategory] = useState("ALL");
  const [blueprintStatus, setBlueprintStatus] = useState("ALL");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const isProjectManager =
    currentUserRole === "ADMINISTRATIONS" || currentUserRole === "DIRECTOR";
  const canViewFinancials = currentUserRole === UserRole.DIRECTOR;
  const isFieldTeam =
    currentUserRole === UserRole.FIELD_TEAM ||
    currentUserRole === UserRole.KOORDINATOR;
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;
  const pendingDeleteProject =
    projects.find((project) => project.id === pendingDeleteProjectId) ?? null;
  const filteredBlueprints = activeProject?.blueprints.filter(
    (blueprint) =>
      (blueprintCategory === "ALL" ||
        blueprint.category === blueprintCategory) &&
      (blueprintStatus === "ALL" || blueprint.status === blueprintStatus),
  ) ?? [];
  const filteredProjects = projects.filter((project) => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    const matchesStatus =
      projectStatusFilter === "ALL" ||
      ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(project.status);
    return matchesStatus && (
      !query ||
      [
        project.title,
        project.code,
        project.address,
        project.location ?? "",
        project.fieldPicName ?? "",
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
  const activeProjectCount = projects.filter(
    (project) => project.status !== "DONE" && project.status !== "COMPLETED",
  ).length;
  const assignedPicCount = new Set(
    projects
      .map((project) => project.fieldPicId ?? project.fieldPicName)
      .filter((pic): pic is string => Boolean(pic)),
  ).size;
  const ticketProjectOptions: TicketProjectOption[] = projects.map(
    ({ id, title, kelompokTani }) => ({ id, title, kelompokTani }),
  );

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
      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-card to-muted p-5 text-foreground shadow-lg sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-border bg-muted p-2">
              <Image
                src="/images/logos/icont%20logo%201.svg"
                alt="Skala Prioritas Engineering"
                width={48}
                height={48}
                className="size-12 rounded-lg bg-white object-contain p-1"
              />
            </div>
            <div className="min-w-0 border-l-2 border-secondary pl-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
                Skala Prioritas Engineering
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Project Workstation
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Satu pusat kendali untuk data proyek, anggaran, pelaksanaan, dan dokumen.
              </p>
            </div>
          </div>
          <div className="shrink-0 space-y-2 sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Adapt, Improvise and Finish
            </p>
            <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
              <MapPin className="size-3.5 text-secondary" aria-hidden="true" />
              Takengon, Aceh
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
                <BriefcaseBusiness className="size-3.5" aria-hidden="true" />
                {activeProjectCount} Proyek Aktif
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300">
                <Users className="size-3.5" aria-hidden="true" />
                {assignedPicCount} PIC Terlibat
              </span>
            </div>
          </div>
        </div>
      </header>
      )}

      <nav
        aria-label="Submenu Project Workstation"
        className={`${activeSection === "surveys" ? "hidden" : ""} flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2 shadow-sm`}
      >
        <Button
          type="button"
          variant={activeSection === "projects" ? "default" : "ghost"}
          onClick={() => {
            router.replace("/apps/projects", { scroll: false });
          }}
          className="gap-2"
        >
          <BriefcaseBusiness className="size-4" aria-hidden="true" />
          Daftar Proyek
        </Button>
        <Button
          type="button"
          variant={activeSection === "surveys" ? "default" : "ghost"}
          onClick={() => {
            const projectId = surveyProjectId || surveyProjects[0]?.id || "none";
            router.replace(
              `/apps/projects?section=surveys&view=map&projectId=${encodeURIComponent(projectId)}`,
              { scroll: false },
            );
          }}
          className="gap-2"
        >
          <MapPinned className="size-4" aria-hidden="true" />
          Peta & Survei Lapangan
        </Button>
      </nav>

      {activeSection === "projects" && (
      <Card className="border-border bg-card text-card-foreground shadow-md">
        <CardHeader className="flex-row items-start justify-between gap-2 pb-4 md:items-center">
          <div className="min-w-0 flex-1 md:flex md:items-center md:gap-2">
            <CardTitle className="text-lg text-foreground">Daftar Proyek</CardTitle>
            <span className="mt-1 inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground md:mt-0">
              {filteredProjects.length} dari {projects.length} proyek
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            {isProjectManager && (
              <ActionIconButton
                type="button"
                label="Tambah Proyek Baru"
                tooltip="Tambah Proyek Baru"
                icon={Plus}
                onClick={() => setNewProjectOpen(true)}
                className="size-11"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Aksi proyek lainnya"
                  title="Aksi proyek lainnya"
                  className="size-11 border border-primary/75 bg-transparent text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <Ellipsis className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isProjectManager && (
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                    <Upload aria-hidden="true" />
                    Import CSV
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href={getExportHref("csv")}>
                    <Download aria-hidden="true" />
                    Export CSV
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={getExportHref("xlsx")}>
                    <FileSpreadsheet aria-hidden="true" />
                    Export Excel
                  </Link>
                </DropdownMenuItem>
                {isProjectManager && (
                  <DropdownMenuItem asChild>
                    <Link href="/api/projects/template-csv" download>
                      <FileDown aria-hidden="true" />
                      Download Template CSV
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
            {isProjectManager && (
              <>
                <ActionIconButton
                  type="button"
                  label="Tambah Proyek Baru"
                  tooltip="Tambah Proyek Baru"
                  icon={Plus}
                  onClick={() => setNewProjectOpen(true)}
                  className="size-11"
                />
                <ActionIconButton
                  type="button"
                  label="Import CSV"
                  tooltip="Import CSV"
                  icon={Upload}
                  onClick={() => setImportOpen(true)}
                  className="size-11"
                />
              </>
            )}
            <ActionIconButton
              label="Export proyek ke CSV"
              tooltip="Export CSV"
              icon={Download}
              href={getExportHref("csv")}
              className="size-11"
            />
            <ActionIconButton
              label="Export proyek ke Excel"
              tooltip="Export Excel"
              icon={FileSpreadsheet}
              href={getExportHref("xlsx")}
              className="size-11"
            />
            {isProjectManager && (
              <ActionIconButton
                label="Download Template CSV"
                tooltip="Download Template CSV"
                icon={FileDown}
                href="/api/projects/template-csv"
                download
                className="size-11"
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                aria-label="Cari proyek"
                placeholder="Cari nama, kode, lokasi, atau PIC..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setProjectPage(1);
                }}
                className="border-border bg-background pl-9 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
              />
            </div>
            <Select
              value={projectStatusFilter}
              onValueChange={(value) => {
                const params = new URLSearchParams(searchParams.toString());
                if (value === "ALL") params.delete("status");
                else params.set("status", value);
                params.set("section", "projects");
                router.replace(`/apps/projects?${params.toString()}`, {
                  scroll: false,
                });
                setProjectPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter status proyek" className="w-full sm:w-52">
                <SelectValue placeholder="Semua status proyek" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status proyek</SelectItem>
                <SelectItem value="RUNNING">Proyek berjalan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {notice && (
            <p
              role="status"
              className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground"
            >
              {notice}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table pagination={false} className="text-xs">
              <TableHeader>
                <TableRow className="border-border bg-muted hover:bg-muted">
                  <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Kode & Nama Proyek
                  </TableHead>
                  <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Lokasi
                  </TableHead>
                  {canViewFinancials && (
                    <>
                      <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Pagu Budget
                      </TableHead>
                      <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Realisasi
                      </TableHead>
                    </>
                  )}
                  <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Penunjukan PIC
                  </TableHead>
                  <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    tabIndex={0}
                    className="cursor-pointer border-border text-foreground transition-colors hover:bg-accent focus-visible:bg-accent"
                    onClick={() => {
                      setNotice("");
                      setActiveProjectId(project.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveProjectId(project.id);
                      }
                    }}
                  >
                    <TableCell className="min-w-56 px-4 py-3">
                      <span className="mb-1 block max-w-72 truncate font-mono text-[10px] text-slate-400">
                        {project.code}
                      </span>
                      <span className="block font-semibold text-foreground">
                        {project.title}
                      </span>
                      {project.kelompokTani && (
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {project.kelompokTani}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-44 max-w-64 whitespace-normal px-4 py-3 text-muted-foreground">
                      {project.location || project.address}
                    </TableCell>
                    {canViewFinancials && (
                      <>
                        <TableCell className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-700 dark:text-emerald-300">
                          {currency(project.pagu)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-3 text-right text-foreground">
                          {currency(project.realized)}
                        </TableCell>
                      </>
                    )}
                    <TableCell
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {(() => {
                        const fieldPic = fieldTeamUsers.find(
                          (user) => user.id === project.fieldPicId,
                        );
                        const picName =
                          fieldPic?.name ??
                          project.fieldPicName ??
                          "Belum ditentukan";
                        const photoUrl =
                          fieldPic?.profilePhotoUrl ??
                          project.fieldPicPhotoUrl;
                        return isProjectManager ? (
                          <Select
                            value={project.fieldPicId ?? "unassigned"}
                            disabled={isPending}
                            onValueChange={(value) =>
                              assignFieldPic(
                                project.id,
                                value === "unassigned" ? "" : value,
                              )
                            }
                          >
                            <SelectTrigger
                              aria-label={`PIC proyek ${project.title}`}
                              className="w-full min-w-44 border-border bg-background text-foreground hover:border-primary"
                            >
                              <SelectValue placeholder="Pilih PIC" />
                            </SelectTrigger>
                            <SelectContent className="border border-border bg-popover text-popover-foreground">
                              <SelectItem value="unassigned">
                                Belum ditentukan
                              </SelectItem>
                              {fieldTeamUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  <Avatar className="size-6 border border-border">
                                    <AvatarImage
                                      src={user.profilePhotoUrl ?? undefined}
                                      alt=""
                                    />
                                    <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                                      {user.name.slice(0, 1).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex min-w-36 items-center gap-2">
                            <Avatar className="size-7 border border-border">
                              <AvatarImage src={photoUrl ?? undefined} alt="" />
                              <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                                {picName.slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="max-w-40 truncate text-foreground">
                              {picName}
                            </span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`whitespace-nowrap font-semibold uppercase tracking-wide ${getStatusBadgeClass(project.status)}`}
                      >
                        {statusLabels[project.status] ?? project.status}
                      </Badge>
                    </TableCell>
                    <TableCell
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <ActionIconButton
                          type="button"
                          label={`Buka peta survei untuk ${project.title}`}
                          tooltip="Buka peta dan survei proyek"
                          icon={MapPinned}
                          className="text-sky-600 hover:text-white dark:text-sky-300"
                          onClick={() => {
                            router.replace(
                              `/apps/projects?section=surveys&view=map&projectId=${encodeURIComponent(project.id)}`,
                              { scroll: false },
                            );
                          }}
                        />
                        {isProjectManager && (
                          <ActionIconButton
                            label={`Edit proyek ${project.title}`}
                            tooltip={`Edit proyek ${project.title}`}
                            icon={Pencil}
                            onClick={() => editProject(project)}
                          />
                        )}
                        {currentUserRole === UserRole.DIRECTOR && (
                          <ActionIconButton
                            label={`Hapus proyek ${project.title}`}
                            tooltip={`Hapus proyek ${project.title}`}
                            icon={Trash2}
                            className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => {
                              setPendingDeleteProjectId(project.id);
                              setConfirmArchiveOpen(true);
                            }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProjects.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canViewFinancials ? 7 : 5}
                      className="h-24 text-center text-slate-400"
                    >
                      {projects.length
                        ? "Tidak ada proyek yang cocok dengan pencarian."
                        : "Belum ada proyek yang dapat ditampilkan."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <TablePaginationControls
            count={filteredProjects.length}
            pageSize={PROJECTS_PER_PAGE}
            page={currentProjectPage}
            itemLabel="proyek"
            onPageChange={setProjectPage}
          />
        </CardContent>
      </Card>
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
          setNotice("");
        }}
        title={activeProject?.title ?? "Detail Proyek"}
        description={
          activeProject
            ? `${activeProject.code} · ${activeProject.location || activeProject.address}`
            : "Informasi dan aktivitas proyek."
        }
        className="max-w-5xl"
      >
          {activeProject && currentUserRole === UserRole.DIRECTOR && (
            <div className="mb-4 flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setPendingDeleteProjectId(activeProject.id);
                  setConfirmArchiveOpen(true);
                }}
              >
                <Archive className="mr-2 size-4" />
                Hapus Proyek
              </Button>
            </div>
          )}

          {activeProject && (
            <div className="mt-6 space-y-5">
              {notice && (
                <p role="status" className="rounded-md border p-3 text-sm">
                  {notice}
                </p>
              )}
              <Tabs
                key={activeProject.id}
                defaultValue={canViewFinancials ? "pagu" : "titik"}
                className="space-y-4"
              >
                <TabsList className="grid h-auto w-full grid-cols-6 justify-items-center gap-1 rounded-lg border border-border bg-muted p-2 sm:flex sm:flex-wrap sm:justify-start">
                  {canViewFinancials && (
                    <ProjectViewTab
                      value="pagu"
                      label="Pagu & Realisasi"
                      icon={ClipboardList}
                    />
                  )}
                  <ProjectViewTab
                    value="titik"
                    label="Titik & Upah"
                    icon={HardHat}
                  />
                  <ProjectViewTab
                    value="harian"
                    label="Laporan Harian"
                    icon={Camera}
                  />
                  {!isFieldTeam && (
                    <>
                      <ProjectViewTab
                        value="gambar"
                        label="Gambar Kerja"
                        icon={ImageIcon}
                      />
                      <ProjectViewTab
                        value="kurva"
                        label="Kurva S"
                        icon={ChartSpline}
                      />
                      <ProjectViewTab
                        value="timeline"
                        label="Timeline Pekerjaan & Gaji"
                        icon={CalendarDays}
                      />
                    </>
                  )}
                </TabsList>

                {canViewFinancials && (
                  <TabsContent value="pagu" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Anggaran dan Realisasi Proyek</CardTitle>
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
                              <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Pagu</p>
                                <p className="mt-1 font-semibold">{currency(pagu)}</p>
                              </div>
                              <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Realisasi material, upah, dan biaya</p>
                                <p className="mt-1 font-semibold">{currency(realized)}</p>
                              </div>
                              <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Sisa pagu</p>
                                <p className="mt-1 font-semibold">
                                  {currency(Math.max(pagu - realized, 0))}
                                </p>
                              </div>
                            </div>
                            <Progress
                              value={percent}
                              aria-label={`Realisasi ${percent.toFixed(0)} persen`}
                            />
                            <p className="text-right text-sm text-muted-foreground">
                              {percent.toFixed(1)}% dari pagu
                            </p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Informasi Proyek</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                      <p><span className="text-muted-foreground">Lokasi:</span> {activeProject.address}</p>
                      <p><span className="text-muted-foreground">Jenis pekerjaan:</span> {activeProject.jenisPekerjaan ?? "—"}</p>
                      <p><span className="text-muted-foreground">PIC:</span> {activeProject.fieldPicName ?? "Belum ditentukan"}</p>
                      <p><span className="text-muted-foreground">Progres:</span> {activeProject.progress}%</p>
                    </CardContent>
                  </Card>
                  {activeProject.subkonContracts.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle>Kontrak Subkon</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {activeProject.subkonContracts.map((contract) => (
                          <section key={contract.id} className="rounded-md border p-3">
                            <p className="font-medium">{contract.contractNumber} · {contract.subkonName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {currency(contract.contractValue)} · {contract.status}
                            </p>
                            <Link
                              href={`/d/${encodeURIComponent(contract.publicCode)}`}
                              className="mt-2 inline-block text-sm underline underline-offset-4"
                            >
                              Buka dokumen SPK
                            </Link>
                            {contract.termyns.map((termyn) => (
                              <div key={termyn.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-muted/30 p-2 text-sm">
                                <span>Termin {termyn.termynNumber} · {termyn.claimedPercent}% · {currency(termyn.netAmount)}</span>
                                <span className="flex items-center gap-2">
                                  <Badge variant="outline">{termyn.status}</Badge>
                                  {termyn.status === "SUBMITTED" &&
                                    (isFieldTeam || canViewFinancials) && (
                                      <Button size="sm" disabled={isPending} onClick={() =>
                                        runProjectAction(() => verifySubkonTermynField(termyn.id))
                                      }>
                                        Verifikasi Fisik
                                      </Button>
                                    )}
                                </span>
                              </div>
                            ))}
                            {isFieldTeam && contract.status === "ACTIVE" && (
                                <form
                                  className="mt-3 flex flex-wrap items-end gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const form = event.currentTarget;
                                    const value = Number(new FormData(form).get("claimedPercent"));
                                    runProjectAction(() => submitSubkonTermyn(contract.publicCode, value));
                                  }}
                                >
                                  <Label>Progres fisik (%)<Input name="claimedPercent" type="number" min="0.01" max="100" step="0.01" required /></Label>
                                  <Button disabled={isPending}>Ajukan Termyn</Button>
                                </form>
                              )}
                          </section>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {activeProject.bastDocuments.map((document) => (
                    <Card key={document.publicCode}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6">
                        <div>
                          <p className="font-medium">{document.bastNumber} · {document.type}</p>
                          <p className="text-sm text-muted-foreground">{document.date} · {document.isApproved ? "Disetujui" : "Menunggu persetujuan"}</p>
                        </div>
                        <Link className="text-sm underline" href={`/d/${encodeURIComponent(document.publicCode)}`}>Buka BAST</Link>
                      </CardContent>
                    </Card>
                  ))}
                  </TabsContent>
                )}

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
                    <CardHeader><CardTitle>Titik Pekerjaan & Usulan Upah</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {activeProject.workPoints.map((point) => (
                        <article key={point.id} className="rounded-lg border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{point.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {point.location ?? "Lokasi belum dicatat"} · Progres {point.progress}%
                              </p>
                            </div>
                            <Badge variant="outline">
                              {point.approvedTotalWage ? "Upah disetujui" : "Menunggu persetujuan"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm">
                            Usulan {currency(point.proposedTotalWage)}
                            {point.approvedTotalWage && ` · Disetujui ${currency(point.approvedTotalWage)}`}
                          </p>
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
                              className="mt-3 flex flex-wrap items-end gap-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                const form = event.currentTarget;
                                const amount = String(new FormData(form).get("amount") ?? "");
                                runProjectAction(() => approveProjectWorkPointWage(point.id, amount));
                              }}
                            >
                              <Label>Nilai disetujui (Rp)<Input name="amount" type="number" min="0.01" step="0.01" defaultValue={point.proposedTotalWage} required /></Label>
                              <Button type="submit" disabled={isPending}>Setujui Upah</Button>
                            </form>
                          )}
                          {isProjectManager && point.approvedTotalWage && (
                            <form
                            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
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
                            <Label>
                              Revisi upah disetujui (Rp)
                              <Input
                                name="revisedWage"
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue={point.approvedTotalWage}
                                required
                              />
                            </Label>
                            <Label>
                              Alasan revisi
                              <Input name="wageReason" minLength={5} maxLength={2000} required />
                            </Label>
                            <Button type="submit" disabled={isPending} className="self-end">
                              Simpan Revisi
                            </Button>
                            </form>
                          )}
                          {point.wageAuditLogs.length > 0 && (
                            <div className="mt-4 border-t pt-3">
                            <p className="text-sm font-medium">Audit revisi upah</p>
                            <ul className="mt-2 space-y-2">
                              {point.wageAuditLogs.map((audit) => (
                                <li
                                  key={audit.id}
                                  className="rounded-md bg-muted/30 p-3 text-sm"
                                >
                                  <p className="font-medium">
                                    {currency(audit.oldWage)} → {currency(audit.newWage)}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
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
                      ))}
                      {activeProject.workPoints.length === 0 && (
                        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Belum ada titik pekerjaan untuk proyek ini.
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
                      <CardHeader><CardTitle>Tambah Laporan Harian</CardTitle></CardHeader>
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
                          <Label className="sm:col-span-2">
                            Uraian pekerjaan harian
                            <Textarea name="workSummary" maxLength={2000} required />
                          </Label>
                          <Label className="sm:col-span-2">Foto progres (maks. 5 foto, 5 MB/foto)
                            <Input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple />
                          </Label>
                          <Button type="submit" disabled={isPending} className="sm:col-span-2">
                            {isPending ? "Menyimpan..." : "Simpan Laporan"}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  )}
                  {!["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(activeProject.status) && (
                    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Form laporan harian akan tersedia setelah PIC ditunjuk dan minimal satu upah titik disetujui Direktur.
                    </p>
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

                {!isFieldTeam && (
                <TabsContent value="gambar" className="space-y-4">
                  {currentUserRole === "DRAFTER" && (
                    <Card>
                      <CardHeader><CardTitle>Unggah Gambar Kerja</CardTitle></CardHeader>
                      <CardContent>
                        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitBlueprint}>
                          <Label>Nomor gambar<Input name="drawingNumber" maxLength={80} required /></Label>
                          <Label>Judul gambar<Input name="title" maxLength={180} required /></Label>
                          <Label>Kategori
                            <select name="category" defaultValue="SHOP_DRAWING" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                              <option value="SHOP_DRAWING">Shop Drawing</option>
                              <option value="AS_BUILT">As-Built</option>
                              <option value="ARCHITECTURAL">Architectural</option>
                              <option value="STRUCTURAL">Structural</option>
                              <option value="MEP">MEP</option>
                            </select>
                          </Label>
                          <Label>Revisi<Input name="revision" defaultValue="REV-00" maxLength={30} required /></Label>
                          <Label className="sm:col-span-2">File PDF / DWG / DXF
                            <Input name="file" type="file" accept=".pdf,.dwg,.dxf,application/pdf,application/acad,application/x-acad,application/dxf" required />
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
                      <CardTitle>Gambar Kerja Proyek</CardTitle>
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
                        <article key={blueprint.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                          <div>
                            <p className="font-medium">{blueprint.drawingNumber} · {blueprint.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {blueprint.category} · {blueprint.revision} · {blueprint.drafterName}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{blueprint.status}</Badge>
                            <a href={blueprint.fileUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                              Buka file
                            </a>
                            {blueprint.status === "FOR_APPROVAL" &&
                              ["KOORDINATOR", "DIRECTOR", "DEPUTY_DIRECTOR"].includes(currentUserRole) && (
                                <>
                                  <Button size="sm" disabled={isPending} onClick={() =>
                                    runProjectAction(() => reviewBlueprint(blueprint.publicCode, "APPROVED_FOR_CONSTRUCTION"))
                                  }>Approve IFC</Button>
                                  <Button variant="destructive" size="sm" disabled={isPending} onClick={() =>
                                    runProjectAction(() => reviewBlueprint(blueprint.publicCode, "REJECTED"))
                                  }>Tolak</Button>
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
                )}

                {!isFieldTeam && (
                <TabsContent value="kurva" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Kurva S — Target dan Realisasi</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Target mengikuti jadwal proyek; realisasi diambil dari progres titik yang tercatat pada laporan harian.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p><span className="font-medium text-primary">Target rencana:</span> {formatProjectDate(activeProject.startDate)} – {formatProjectDate(activeProject.endDate)}</p>
                        <p><span className="font-medium text-orange-600">Realisasi saat ini:</span> {activeProject.progress.toFixed(1)}%</p>
                      </div>
                      <div className="mt-4 min-h-[320px]">
                        <Chart
                          type="line"
                          options={sCurveOptions}
                          series={getSCurveSeries(activeProject)}
                          height={340}
                        />
                      </div>
                      {getSCurveSeries(activeProject)[1].data.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground">
                          Belum ada data progres aktual untuk ditampilkan.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                )}

                {!isFieldTeam && (
                <TabsContent value="timeline" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Timeline Pekerjaan</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Jadwal dan progres setiap titik kerja proyek.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {activeProject.workPoints.map((point) => (
                        <article key={point.id} className="space-y-3 rounded-lg border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold">{point.title}</h3>
                              <p className="mt-1 text-sm text-muted-foreground">
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
                          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <CardTitle>Ringkasan Upah Tukang</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                Pengajuan pembayaran bertahap diproses dan dicatat melalui tiket.
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">Total upah disetujui</p>
                              <p className="mt-1 font-semibold">{currency(approvedTotal)}</p>
                            </div>
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">Total sudah dibayar</p>
                              <p className="mt-1 font-semibold">{currency(paidTotal)}</p>
                            </div>
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">Sisa kewajiban upah</p>
                              <p className="mt-1 font-semibold">{currency(remaining)}</p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader><CardTitle>Histori Pencairan</CardTitle></CardHeader>
                          <CardContent className="space-y-3">
                            {activeProject.wageTicketPayments.map((payment) => (
                              <article key={payment.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
                                <div>
                                  <p className="font-medium">
                                    Tiket {payment.ticketNumber} · {payment.title}
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {payment.paid
                                      ? `Dibayar ${formatProjectDate(payment.paidAt)}`
                                      : `Status ${statusLabels[payment.status] ?? payment.status}`}
                                    {" · "}Diajukan oleh {payment.requesterName}
                                  </p>
                                </div>
                                <p className="font-semibold">
                                  {payment.amount ? currency(payment.amount) : "Nominal belum ditetapkan"}
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
                )}
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
