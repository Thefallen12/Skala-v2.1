"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Flag,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteProjectMilestone,
  deleteProjectScheduleTask,
  saveProjectMilestone,
  saveProjectScheduleTask,
  uploadProjectScheduleTaskPhoto,
} from "@/app/actions/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getJakartaDateKey } from "@/lib/habit-date";
import { cn } from "@/lib/utils";
import ProjectActionButton from "./ProjectActionButton";
import { ProjectPrintScheduleView } from "./ProjectPrintViews";
import TaskModal, {
  type TaskModalData,
  type TaskModalSaveData,
  type TaskModalSaveOutcome,
} from "./TaskModal";
import WorkCalendarModal from "./WorkCalendarModal";

export interface ScheduleProjectOption {
  id: string;
  code: string;
  title: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
}

export interface ScheduleTaskItem {
  id: string;
  title: string;
  location: string;
  plannedStartDate: string | null;
  targetDate: string | null;
  progress: number;
  hasConstraint?: boolean;
  needsCheck?: boolean;
  projectId?: string;
  projectName?: string;
}

export interface ScheduleMilestoneItem {
  id: string;
  title: string;
  date: string;
}

interface ProjectScheduleGanttProps {
  projects?: ScheduleProjectOption[];
  selectedProject: ScheduleProjectOption;
  initialTasks: ScheduleTaskItem[];
  initialMilestones: ScheduleMilestoneItem[];
  embedded?: boolean;
  defaultAssigneeName?: string | null;
  teamMembers?: Array<{ id: string; name: string; role?: string }>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ProjectScheduleGantt({
  projects = [],
  selectedProject,
  initialTasks,
  initialMilestones,
  embedded = false,
  defaultAssigneeName,
  teamMembers,
}: ProjectScheduleGanttProps) {
  const router = useRouter();

  const [tasks, setTasks] = useState<ScheduleTaskItem[]>(initialTasks);
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setTasks(initialTasks);
  }

  const [milestones, setMilestones] =
    useState<ScheduleMilestoneItem[]>(initialMilestones);
  const [prevInitialMilestones, setPrevInitialMilestones] =
    useState(initialMilestones);
  if (initialMilestones !== prevInitialMilestones) {
    setPrevInitialMilestones(initialMilestones);
    setMilestones(initialMilestones);
  }

  const [viewMode, setViewMode] = useState<"gantt" | "papan">("gantt");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isPrintScheduleView, setIsPrintScheduleView] = useState(false);

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskModalData | null>(null);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskCol, setDragOverTaskCol] = useState<
    "todo" | "in_progress" | "done" | null
  >(null);

  const [msTitle, setMsTitle] = useState("");
  const [msDate, setMsDate] = useState("");
  const [isAddingMs, setIsAddingMs] = useState(false);

  const [showBaseline, setShowBaseline] = useState(true);
  const [baselineUpdatedMsg, setBaselineUpdatedMsg] = useState(false);

  const [nowMs] = useState(() => Date.now());
  const parsedProjectStartMs = selectedProject.startDate
    ? Date.parse(selectedProject.startDate)
    : Number.NaN;
  const parsedProjectEndMs = selectedProject.endDate
    ? Date.parse(selectedProject.endDate)
    : Number.NaN;

  const { timelineStartMs, totalWeeks } = useMemo(() => {
    const taskStartTimes = tasks
      .map((t) =>
        t.plannedStartDate ? Date.parse(t.plannedStartDate) : Number.NaN,
      )
      .filter((ms) => Number.isFinite(ms));
    const taskEndTimes = tasks
      .map((t) => (t.targetDate ? Date.parse(t.targetDate) : Number.NaN))
      .filter((ms) => Number.isFinite(ms));

    const earliestTaskStart =
      taskStartTimes.length > 0 ? Math.min(...taskStartTimes) : null;
    const latestTaskEnd =
      taskEndTimes.length > 0 ? Math.max(...taskEndTimes) : null;

    let startMs = Number.isFinite(parsedProjectStartMs)
      ? parsedProjectStartMs
      : (earliestTaskStart ?? nowMs);

    if (selectedProject.id === "all" && earliestTaskStart !== null) {
      startMs = earliestTaskStart;
    } else if (
      earliestTaskStart !== null &&
      (earliestTaskStart < startMs ||
        earliestTaskStart - startMs > 4 * WEEK_MS)
    ) {
      startMs = earliestTaskStart;
    }

    const maxEndMs = Math.max(
      Number.isFinite(parsedProjectEndMs) ? parsedProjectEndMs : startMs,
      latestTaskEnd ?? startMs,
    );
    const computedWeeks = Math.ceil((maxEndMs - startMs) / WEEK_MS);
    const weeks = Math.max(
      8,
      Math.min(52, computedWeeks > 0 ? computedWeeks : 8),
    );
    return { timelineStartMs: startMs, totalWeeks: weeks };
  }, [
    nowMs,
    parsedProjectEndMs,
    parsedProjectStartMs,
    selectedProject.id,
    tasks,
  ]);

  const projectStartMs = timelineStartMs;

  const weekList = useMemo(
    () => Array.from({ length: totalWeeks }, (_, i) => `M${i + 1}`),
    [totalWeeks],
  );

  const rawDiffWeeks = Math.floor((nowMs - timelineStartMs) / WEEK_MS);
  const todayInRange = rawDiffWeeks >= 0 && rawDiffWeeks < totalWeeks;
  const currentWeekIndex = Math.max(0, Math.min(totalWeeks - 1, rawDiffWeeks));

  const getTaskWeekInfo = (task: ScheduleTaskItem) => {
    if (!task.plannedStartDate) {
      return { startWeek: 0, duration: 1 };
    }

    const tStartMs = Date.parse(task.plannedStartDate);
    if (!Number.isFinite(tStartMs)) {
      return { startWeek: 0, duration: 1 };
    }
    const diffStart = Math.floor((tStartMs - timelineStartMs) / WEEK_MS);
    const startWeek = Math.max(0, Math.min(totalWeeks - 1, diffStart));

    let duration = 1;
    if (task.targetDate) {
      const tEndMs = Date.parse(task.targetDate);
      if (Number.isFinite(tEndMs) && tEndMs > tStartMs) {
        duration = Math.max(1, Math.ceil((tEndMs - tStartMs) / WEEK_MS));
      }
    }
    return { startWeek, duration };
  };

  const isTaskDelayed = (task: ScheduleTaskItem) => {
    if ((task.progress || 0) >= 100) return false;
    if (task.targetDate) {
      const endMs = Date.parse(task.targetDate);
      if (Number.isFinite(endMs) && endMs < nowMs) return true;
    }
    const { startWeek, duration } = getTaskWeekInfo(task);
    return todayInRange && currentWeekIndex >= startWeek + duration;
  };

  const getTaskBadge = (prog: number, startWeek: number, duration: number) => {
    if (prog >= 100) {
      return {
        label: "Selesai",
        className:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40",
      };
    }
    const endWeek = startWeek + duration;
    if (currentWeekIndex < startWeek && prog === 0) return null;
    if (currentWeekIndex >= endWeek && prog < 100) {
      return {
        label: "Terlambat",
        className:
          "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300/40",
      };
    }
    const expected =
      currentWeekIndex <= startWeek
        ? 0
        : currentWeekIndex >= endWeek
          ? 100
          : Math.round(
              ((currentWeekIndex - startWeek) / Math.max(1, duration)) * 100,
            );

    if (prog >= expected + 5) {
      return {
        label: "Lebih cepat",
        className:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40",
      };
    }
    if (prog <= expected - 5) {
      return {
        label: "Terlambat",
        className:
          "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300/40",
      };
    }
    return null;
  };

  const handleTaskDragStart = (e: DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(taskId);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskCol(null);
  };

  const handleTaskColDragOver = (
    e: DragEvent,
    col: "todo" | "in_progress" | "done",
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTaskCol !== col) setDragOverTaskCol(col);
  };

  const handleTaskColDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverTaskCol(null);
  };

  const handleTaskColDrop = async (
    e: DragEvent,
    col: "todo" | "in_progress" | "done",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTaskCol(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;

    const taskToMove = tasks.find((t) => t.id === taskId);
    if (!taskToMove) return;

    let targetProgress = taskToMove.progress || 0;
    if (col === "todo") targetProgress = 0;
    else if (col === "done") targetProgress = 100;
    else if (col === "in_progress") {
      targetProgress =
        targetProgress > 0 && targetProgress < 100 ? targetProgress : 50;
    }

    const prevTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, progress: targetProgress } : t,
      ),
    );

    try {
      await saveProjectScheduleTask(
        taskToMove.projectId || selectedProject.id,
        {
          id: taskId,
          title: taskToMove.title,
          location: taskToMove.location,
          progress: targetProgress,
          plannedStartDate: taskToMove.plannedStartDate || undefined,
          targetDate: taskToMove.targetDate || undefined,
        },
      );
      toast.success("Status task diperbarui.");
      router.refresh();
    } catch (err) {
      setTasks(prevTasks);
      toast.error(
        err instanceof Error ? err.message : "Gagal memindahkan task.",
      );
    }
  };

  const groupedTasks = useMemo(() => {
    let list = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.location && t.location.toLowerCase().includes(q)),
      );
    }

    if (statusFilter === "not_started") {
      list = list.filter((t) => (t.progress || 0) === 0);
    } else if (statusFilter === "in_progress") {
      list = list.filter((t) => (t.progress || 0) > 0 && (t.progress || 0) < 100);
    } else if (statusFilter === "done") {
      list = list.filter((t) => (t.progress || 0) >= 100);
    } else if (statusFilter === "constraint") {
      list = list.filter((t) => Boolean(t.hasConstraint));
    } else if (statusFilter === "needs_check") {
      list = list.filter((t) => Boolean(t.needsCheck));
    } else if (statusFilter === "delayed") {
      list = list.filter((t) => isTaskDelayed(t));
    }

    if (phaseFilter !== "all") {
      list = list.filter((t) => t.location === phaseFilter);
    }

    const groups: Record<string, ScheduleTaskItem[]> = {};
    for (const t of list) {
      const p = t.location || "A. Persiapan";
      if (!groups[p]) groups[p] = [];
      groups[p].push(t);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, searchQuery, statusFilter, phaseFilter]);

  const scheduleCompletion = useMemo(() => {
    if (tasks.length === 0) return Math.round(selectedProject.progress || 0);
    const totalProg = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    return Math.round(totalProg / tasks.length);
  }, [selectedProject.progress, tasks]);

  const counts = useMemo(() => {
    let notStarted = 0;
    let inProgress = 0;
    let done = 0;
    let constraint = 0;
    let needsCheck = 0;
    let delayed = 0;
    for (const t of tasks) {
      const p = t.progress || 0;
      if (p === 0) notStarted++;
      else if (p >= 100) done++;
      else inProgress++;
      if (t.hasConstraint) constraint++;
      if (t.needsCheck) needsCheck++;
      if (isTaskDelayed(t)) delayed++;
    }
    return {
      all: tasks.length,
      notStarted,
      inProgress,
      done,
      constraint,
      needsCheck,
      delayed,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const allPhases = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.location) set.add(t.location);
    });
    return Array.from(set);
  }, [tasks]);

  const projectComboOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "all", label: "Semua proyek" },
      ...projects.map((p) => ({
        value: p.id,
        label: p.title || p.name,
        description: p.code,
      })),
    ],
    [projects],
  );

  const handleProjectChange = (projectId: string) => {
    if (!projectId) return;
    router.push(`/apps/projects/schedule?projectId=${projectId}`);
  };

  const handleOpenAddTask = (
    defaultStatus?: "TODO" | "IN_PROGRESS" | "DONE" | React.MouseEvent,
  ) => {
    if (selectedProject.id === "all") return;
    const effectiveStatus: "TODO" | "IN_PROGRESS" | "DONE" =
      typeof defaultStatus === "string" ? defaultStatus : "TODO";
    let initialProg = 0;
    if (effectiveStatus === "IN_PROGRESS") initialProg = 50;
    else if (effectiveStatus === "DONE") initialProg = 100;

    setEditingTask({
      id: "",
      title: "",
      location: "A. Persiapan",
      status: effectiveStatus,
      hasConstraint: false,
      needsCheck: false,
      startWeek: currentWeekIndex,
      durationWeeks: 2,
      progress: initialProg,
      startDate: getJakartaDateKey(),
      endDate: "",
    });
    setIsTaskModalOpen(true);
  };

  const handleOpenEditTask = (task: ScheduleTaskItem) => {
    const { startWeek, duration } = getTaskWeekInfo(task);
    setEditingTask({
      id: task.id,
      title: task.title,
      location: task.location || "A. Persiapan",
      status:
        task.progress >= 100
          ? "DONE"
          : task.progress > 0
            ? "IN_PROGRESS"
            : "TODO",
      hasConstraint: Boolean(task.hasConstraint),
      needsCheck: Boolean(task.needsCheck),
      startWeek,
      durationWeeks: duration,
      progress: task.progress || 0,
      startDate: task.plannedStartDate
        ? task.plannedStartDate.split("T")[0]
        : "",
      endDate: task.targetDate ? task.targetDate.split("T")[0] : "",
    });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (
    data: TaskModalSaveData,
  ): Promise<TaskModalSaveOutcome> => {
    let taskId = data.id ?? "";
    let progressReportId = data.progressReportId ?? "";

    if (!progressReportId) {
      let sDate = data.startDate;
      let eDate = data.endDate;
      if (!sDate) {
        const d1 = new Date(projectStartMs);
        d1.setDate(d1.getDate() + data.startWeek * 7);
        sDate = d1.toISOString().split("T")[0];
      }
      if (!eDate) {
        const d2 = new Date(sDate);
        d2.setDate(d2.getDate() + data.durationWeeks * 7);
        eDate = d2.toISOString().split("T")[0];
      }

      const result = await saveProjectScheduleTask(selectedProject.id, {
        id: data.id,
        title: data.title,
        location: data.location,
        plannedStartDate: sDate,
        targetDate: eDate,
        progress: data.progress,
        kendala: data.hasConstraint,
        perluDicek: data.needsCheck,
      });
      if (!result.success) return { error: result.message };

      taskId = result.workPointId;
      progressReportId = result.progressReportId;
      setTasks((prev) => {
        if (data.id) {
          return prev.map((t) =>
            t.id === data.id
              ? {
                  ...t,
                  title: data.title,
                  location: data.location,
                  progress: data.progress,
                  plannedStartDate: sDate || null,
                  targetDate: eDate || null,
                  hasConstraint: data.hasConstraint,
                  needsCheck: data.needsCheck,
                }
              : t,
          );
        }
        return [
          ...prev,
          {
            id: taskId,
            title: data.title,
            location: data.location,
            progress: data.progress,
            plannedStartDate: sDate || null,
            targetDate: eDate || null,
            hasConstraint: data.hasConstraint,
            needsCheck: data.needsCheck,
            projectId: selectedProject.id,
            projectName: selectedProject.name,
          },
        ];
      });
    }

    if (!taskId || !progressReportId) {
      return { error: "Task belum tersimpan untuk menerima lampiran." };
    }

    let uploadedPhotosCount = 0;
    for (const photo of data.photos) {
      const photoData = new FormData();
      photoData.append("progressReportId", progressReportId);
      photoData.append("photo", photo);
      try {
        const result = await uploadProjectScheduleTaskPhoto(photoData);
        if (!result.success) {
          return {
            savedTaskId: taskId,
            progressReportId,
            uploadedPhotosCount,
            error: result.message,
          };
        }
      } catch (error) {
        return {
          savedTaskId: taskId,
          progressReportId,
          uploadedPhotosCount,
          error:
            error instanceof Error
              ? error.message
              : "Foto task gagal diunggah.",
        };
      }
      uploadedPhotosCount += 1;
    }

    router.refresh();
    return { savedTaskId: taskId, progressReportId, uploadedPhotosCount };
  };

  const handleDeleteTask = async (id: string) => {
    const res = await deleteProjectScheduleTask(id);
    if (res.success) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setIsTaskModalOpen(false);
      toast.success("Task jadwal dihapus.");
      router.refresh();
    } else {
      toast.error(res.message || "Gagal menghapus task.");
    }
  };

  const handleAddMilestone = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedProject.id === "all") {
      toast.error("Pilih proyek spesifik untuk menambahkan milestone.");
      return;
    }
    if (!msTitle.trim() || !msDate) {
      toast.error("Nama dan tanggal milestone wajib diisi.");
      return;
    }
    setIsAddingMs(true);
    try {
      const res = await saveProjectMilestone(
        selectedProject.id,
        msTitle,
        msDate,
      );
      if (res.success) {
        setMsTitle("");
        setMsDate("");
        toast.success("Milestone ditambahkan.");
        router.refresh();
      } else {
        toast.error(res.message || "Gagal menyimpan milestone.");
      }
    } catch {
      toast.error("Gagal menyimpan milestone.");
    } finally {
      setIsAddingMs(false);
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    const res = await deleteProjectMilestone(id);
    if (res.success) {
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      toast.success("Milestone dihapus.");
    } else {
      toast.error(res.message || "Gagal menghapus milestone.");
    }
  };

  const handleExportCSV = () => {
    const rows = [
      [
        "Task",
        "Fase",
        "Mulai (Minggu)",
        "Durasi (mgg)",
        "Progres (%)",
        "Tgl Mulai",
        "Tgl Selesai",
      ],
      ...tasks.map((t) => {
        const { startWeek, duration } = getTaskWeekInfo(t);
        return [
          `"${t.title.replace(/"/g, '""')}"`,
          `"${(t.location || "").replace(/"/g, '""')}"`,
          `M${startWeek + 1}`,
          `${duration} mgg`,
          `${t.progress || 0}%`,
          t.plannedStartDate?.split("T")[0] || "",
          t.targetDate?.split("T")[0] || "",
        ];
      }),
    ];
    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `jadwal_${selectedProject.code || "proyek"}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateBaseline = () => {
    setShowBaseline(true);
    setBaselineUpdatedMsg(true);
    toast.success("Baseline jadwal diperbarui.");
    setTimeout(() => setBaselineUpdatedMsg(false), 2500);
  };

  if (isPrintScheduleView) {
    return (
      <ProjectPrintScheduleView
        project={{
          id: selectedProject.id,
          title: selectedProject.title,
          code: selectedProject.code,
          startDate: selectedProject.startDate,
          endDate: selectedProject.endDate,
          progress: selectedProject.progress,
        }}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          location: t.location,
          plannedStartDate: t.plannedStartDate,
          targetDate: t.targetDate,
          progress: t.progress,
        }))}
        totalWeeks={totalWeeks}
        onBack={() => setIsPrintScheduleView(false)}
      />
    );
  }

  const toolbarActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ProjectActionButton
        type="button"
        label="Ekspor CSV"
        icon={<Download className="size-3.5" aria-hidden="true" />}
        variant="outline"
        size="sm"
        onClick={handleExportCSV}
      />
      <ProjectActionButton
        type="button"
        label="Cetak Jadwal"
        icon={<Printer className="size-3.5" aria-hidden="true" />}
        variant="outline"
        size="sm"
        onClick={() => setIsPrintScheduleView(true)}
      />
      <ProjectActionButton
        type="button"
        label={baselineUpdatedMsg ? "Baseline Tersimpan" : "Perbarui Baseline"}
        icon={<Flag className="size-3.5" aria-hidden="true" />}
        variant="outline"
        size="sm"
        onClick={handleUpdateBaseline}
      />
      <ProjectActionButton
        type="button"
        label="Kalender Kerja"
        icon={<Calendar className="size-3.5" aria-hidden="true" />}
        variant="outline"
        size="sm"
        onClick={() => setIsCalendarOpen(true)}
      />
      <ProjectActionButton
        type="button"
        label="Tambah Task"
        icon={<Plus className="size-3.5" aria-hidden="true" />}
        variant="default"
        size="sm"
        disabled={selectedProject.id === "all"}
        onClick={handleOpenAddTask}
      />
    </div>
  );

  return (
    <div className="space-y-4 pb-20 sm:pb-12">
      {!embedded ? (
        <PageHeader
          title="Jadwal Proyek"
          description="Jadwal pekerjaan per minggu, fase, progres item, dan milestone."
          breadcrumbs={[
            { label: "Proyek", href: "/apps/projects" },
            ...(selectedProject.id !== "all"
              ? [
                  {
                    label: selectedProject.title,
                    href: `/apps/projects/${selectedProject.id}`,
                  },
                ]
              : []),
            { label: "Jadwal Proyek" },
          ]}
          actions={toolbarActions}
        />
      ) : (
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="type-h2 text-foreground">Jadwal Proyek</h2>
            <p className="type-p3 text-muted-foreground">
              Klik judul atau bar task untuk mengubah jadwal dan progres.
            </p>
          </div>
          {toolbarActions}
        </div>
      )}

      {/* Project Selector & Top Stats Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="w-full max-w-sm space-y-1">
            <span className="type-p3 block font-medium text-muted-foreground">
              Proyek
            </span>
            <Combobox
              options={projectComboOptions}
              value={selectedProject.id}
              onValueChange={handleProjectChange}
              placeholder="Pilih proyek..."
              searchPlaceholder="Cari nama atau kode proyek..."
            />
          </div>

          {selectedProject.id === "all" ? (
            <div className="type-p2 self-start font-medium text-muted-foreground tabular-nums md:self-center">
              <strong className="type-h3 text-foreground">
                {projects.length}
              </strong>{" "}
              proyek ·{" "}
              <strong className="type-h3 text-foreground">
                {tasks.length}
              </strong>{" "}
              task
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-6 self-start md:self-center">
              <div>
                <span className="type-p3 block uppercase tracking-wider text-muted-foreground">
                  Task
                </span>
                <span className="type-kpi text-foreground">{tasks.length}</span>
              </div>

              <div>
                <span className="type-p3 block uppercase tracking-wider text-muted-foreground">
                  Rentang
                </span>
                <span className="type-kpi text-foreground">
                  {totalWeeks} mgg
                </span>
              </div>

              <div>
                <span className="type-p3 block uppercase tracking-wider text-muted-foreground">
                  Progres Proyek
                </span>
                <span className="type-kpi text-foreground">
                  {Math.round(selectedProject.progress || 0)}%
                </span>
              </div>

              <div className="w-40">
                <div className="type-p3 mb-1 flex items-center justify-between tabular-nums">
                  <span className="uppercase tracking-wider text-muted-foreground">
                    {tasks.length > 0 ? "Progres Task" : "Jadwal"}
                  </span>
                  <span className="font-semibold text-foreground">
                    {scheduleCompletion}%
                  </span>
                </div>
                <Progress value={scheduleCompletion} className="h-2" />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "gantt" ? "secondary" : "ghost"}
              aria-pressed={viewMode === "gantt"}
              onClick={() => setViewMode("gantt")}
            >
              Gantt
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "papan" ? "secondary" : "ghost"}
              aria-pressed={viewMode === "papan"}
              onClick={() => setViewMode("papan")}
            >
              Papan
            </Button>
          </div>

          <Link
            href={`/apps/projects/${selectedProject.id}`}
            className="type-p3 inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
          >
            <span>Detail proyek</span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
          {[
            { key: "all", label: `Semua ${counts.all}` },
            { key: "not_started", label: `Belum mulai ${counts.notStarted}` },
            { key: "in_progress", label: `Berjalan ${counts.inProgress}` },
            { key: "done", label: `Selesai ${counts.done}` },
            { key: "constraint", label: `Kendala ${counts.constraint}` },
            { key: "needs_check", label: `Perlu dicek ${counts.needsCheck}` },
            { key: "delayed", label: `Terlambat ${counts.delayed}` },
          ].map((pill) => (
            <Button
              key={pill.key}
              type="button"
              size="sm"
              variant={statusFilter === pill.key ? "default" : "ghost"}
              aria-pressed={statusFilter === pill.key}
              onClick={() => setStatusFilter(pill.key)}
              className="shrink-0"
            >
              {pill.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Semua fase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua fase</SelectItem>
              {allPhases.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 sm:w-44">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="text"
              placeholder="Cari task..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Gantt / Papan + Milestone */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs xl:col-span-3">
          {viewMode === "gantt" ? (
            <div>
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${280 + totalWeeks * 56}px` }}>
                  <div className="type-p3 flex border-b border-border bg-muted/20 font-semibold text-muted-foreground">
                    <div className="sticky left-0 z-30 flex w-[240px] shrink-0 items-end border-r border-border bg-card px-4 py-3 sm:w-[290px]">
                      Task
                    </div>
                    <div
                      className="relative grid flex-1 pt-5"
                      style={{
                        gridTemplateColumns: `repeat(${totalWeeks}, minmax(52px, 1fr))`,
                      }}
                    >
                      {weekList.map((week) => (
                        <div
                          key={week}
                          className="border-l border-border/50 px-2 py-2.5 text-center font-medium tabular-nums first:border-l-0"
                        >
                          {week}
                        </div>
                      ))}

                      {todayInRange && (
                        <div
                          className="pointer-events-none absolute top-0.5 bottom-0 z-20 flex flex-col items-center"
                          style={{
                            left: `${((currentWeekIndex + 0.5) / totalWeeks) * 100}%`,
                            transform: "translateX(-50%)",
                          }}
                        >
                          <Badge
                            variant="destructive"
                            className="whitespace-nowrap"
                          >
                            Hari ini
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    {Object.keys(groupedTasks).length === 0 ? (
                      <EmptyState
                        variant="inline"
                        title={
                          tasks.length === 0
                            ? "Belum ada task jadwal"
                            : "Tidak ada task yang sesuai filter"
                        }
                        description={
                          tasks.length === 0
                            ? selectedProject.id === "all"
                              ? "Belum ada item jadwal di seluruh proyek."
                              : 'Klik "Tambah Task" untuk mulai menyusun jadwal.'
                            : "Ubah filter status atau pencarian."
                        }
                      />
                    ) : (
                      <div className="relative">
                        {todayInRange && (
                          <div className="pointer-events-none absolute inset-y-0 left-[240px] right-0 z-10 sm:left-[290px]">
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-destructive/80"
                              style={{
                                left: `${((currentWeekIndex + 0.5) / totalWeeks) * 100}%`,
                                transform: "translateX(-50%)",
                              }}
                            />
                          </div>
                        )}

                        {Object.entries(groupedTasks).map(
                          ([phaseName, phaseTasks]) => (
                            <div
                              key={phaseName}
                              className="border-b border-border/50 last:border-b-0"
                            >
                              <div className="flex bg-muted/10">
                                <div className="sticky left-0 z-20 flex w-[240px] shrink-0 items-center border-r border-border bg-card/95 p-2.5 pl-4 backdrop-blur-xs sm:w-[290px]">
                                  <Badge variant="secondary" className="gap-1.5">
                                    <span>{phaseName}</span>
                                    <span className="tabular-nums opacity-80">
                                      {phaseTasks.length}
                                    </span>
                                  </Badge>
                                </div>
                                <div className="flex-1" />
                              </div>

                              {phaseTasks.map((t) => {
                                const { startWeek, duration } =
                                  getTaskWeekInfo(t);
                                const endWeek = startWeek + duration;
                                const barEnd = Math.min(totalWeeks, endWeek);
                                const visibleDuration = Math.max(
                                  1,
                                  barEnd - startWeek,
                                );
                                const leftPercent =
                                  (startWeek / totalWeeks) * 100;
                                const widthPercent =
                                  (visibleDuration / totalWeeks) * 100;
                                const prog = t.progress || 0;
                                const badge = getTaskBadge(
                                  prog,
                                  startWeek,
                                  duration,
                                );

                                return (
                                  <div
                                    key={t.id}
                                    className="flex items-stretch border-t border-border/40 transition-colors hover:bg-muted/15"
                                  >
                                    <div className="sticky left-0 z-20 w-[240px] shrink-0 border-r border-border bg-card py-2.5 pl-4 pr-3 sm:w-[290px]">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditTask(t)}
                                        className="type-p2 line-clamp-1 text-left font-medium text-foreground hover:underline"
                                      >
                                        {t.title}
                                      </button>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="type-p3 text-muted-foreground tabular-nums">
                                          M{startWeek + 1}–M{endWeek} ·{" "}
                                          {duration} mgg
                                        </span>
                                        {badge && (
                                          <Badge
                                            variant="outline"
                                            className={badge.className}
                                          >
                                            {badge.label}
                                          </Badge>
                                        )}
                                      </div>

                                      {/* Read-only Progress Bar — edit melalui TaskModal untuk mencegah konflik swipe APK */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditTask(t)}
                                        aria-label={`Ubah progres ${t.title} (${prog}%)`}
                                        className="mt-2 flex w-full max-w-[200px] items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        <Progress
                                          value={prog}
                                          className="h-1.5 flex-1"
                                        />
                                        <span className="type-p3 min-w-[38px] text-right font-mono font-semibold text-foreground tabular-nums">
                                          {prog}%
                                        </span>
                                      </button>
                                    </div>

                                    <div className="relative flex flex-1 items-center py-2">
                                      <div
                                        className="pointer-events-none absolute inset-0 grid"
                                        style={{
                                          gridTemplateColumns: `repeat(${totalWeeks}, minmax(52px, 1fr))`,
                                        }}
                                      >
                                        {weekList.map((w) => (
                                          <div
                                            key={w}
                                            className="h-full border-l border-border/30 first:border-l-0"
                                          />
                                        ))}
                                      </div>

                                      {showBaseline && (
                                        <div
                                          className="pointer-events-none absolute top-1/2 h-6 -translate-y-1/2 rounded-md border border-dashed border-muted-foreground/40"
                                          style={{
                                            left: `${leftPercent}%`,
                                            width: `${widthPercent}%`,
                                          }}
                                        />
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditTask(t)}
                                        title={`${t.title} (${prog}%) · M${startWeek + 1}–M${endWeek}`}
                                        className="relative z-15 flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-border/60 bg-muted/60 shadow-xs transition-all hover:ring-2 hover:ring-primary/40"
                                        style={{
                                          marginLeft: `${leftPercent}%`,
                                          width: `${widthPercent}%`,
                                        }}
                                      >
                                        <div
                                          className="type-p3 flex h-full items-center whitespace-nowrap bg-primary pl-2 font-semibold text-primary-foreground transition-all duration-75 tabular-nums"
                                          style={{
                                            width: `${Math.max(prog, 0)}%`,
                                          }}
                                        >
                                          {prog > 0 && `${prog}%`}
                                        </div>
                                        {prog === 0 && (
                                          <span className="type-p3 pl-2 font-medium text-muted-foreground tabular-nums">
                                            0%
                                          </span>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="type-p3 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/10 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  {allPhases.length > 0 && (
                    <>
                      <span className="font-semibold text-foreground">
                        Fase:
                      </span>
                      {allPhases.map((phase) => (
                        <Badge key={phase} variant="secondary">
                          {phase}
                        </Badge>
                      ))}
                    </>
                  )}
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded-xs border border-dashed border-muted-foreground" />
                    <span>Baseline</span>
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <span className="h-3 w-0.5 bg-destructive" />
                    <span>Hari ini</span>
                  </span>
                </div>
                <span className="text-muted-foreground">
                  Ketuk baris atau bar untuk ubah progres &amp; lampiran
                </span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[680px] grid-cols-1 gap-4 md:grid-cols-3">
                {(
                  [
                    {
                      key: "todo",
                      title: "Belum mulai",
                      count: counts.notStarted,
                      icon: Clock,
                      iconClass: "text-muted-foreground",
                      filter: (t: ScheduleTaskItem) => (t.progress || 0) === 0,
                      status: "TODO" as const,
                    },
                    {
                      key: "in_progress",
                      title: "Berjalan",
                      count: counts.inProgress,
                      icon: AlertCircle,
                      iconClass: "text-warning",
                      filter: (t: ScheduleTaskItem) =>
                        (t.progress || 0) > 0 && (t.progress || 0) < 100,
                      status: "IN_PROGRESS" as const,
                    },
                    {
                      key: "done",
                      title: "Selesai",
                      count: counts.done,
                      icon: CheckCircle2,
                      iconClass: "text-success",
                      filter: (t: ScheduleTaskItem) => (t.progress || 0) >= 100,
                      status: "DONE" as const,
                    },
                  ] as const
                ).map((col) => {
                  const Icon = col.icon;
                  const colTasks = tasks.filter(col.filter);
                  const isOver = dragOverTaskCol === col.key;

                  return (
                    <div
                      key={col.key}
                      onDragOver={(e) => handleTaskColDragOver(e, col.key)}
                      onDragLeave={handleTaskColDragLeave}
                      onDrop={(e) => void handleTaskColDrop(e, col.key)}
                      className={cn(
                        "flex min-h-[350px] flex-col justify-between rounded-xl border p-3 transition-all",
                        isOver
                          ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                          : "border-border bg-muted/10",
                      )}
                    >
                      <div>
                        <div className="type-p2 mb-3 flex items-center justify-between font-semibold text-foreground">
                          <span className="flex items-center gap-1.5">
                            <Icon
                              className={cn("size-4", col.iconClass)}
                              aria-hidden="true"
                            />
                            <span>{col.title}</span>
                          </span>
                          <Badge variant="secondary" className="tabular-nums">
                            {col.count}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          {colTasks.map((t) => (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => handleTaskDragStart(e, t.id)}
                              onDragEnd={handleTaskDragEnd}
                              onClick={() => {
                                if (!draggedTaskId) handleOpenEditTask(t);
                              }}
                              className={cn(
                                "cursor-grab space-y-1.5 rounded-xl border bg-card p-3 shadow-xs transition-all select-none active:cursor-grabbing",
                                draggedTaskId === t.id
                                  ? "scale-95 border-dashed border-primary opacity-30"
                                  : "border-border hover:border-primary",
                              )}
                            >
                              <div className="type-p3 flex items-center gap-1.5 font-semibold text-foreground">
                                <span className="size-2 shrink-0 rounded-full bg-primary" />
                                <span className="truncate">
                                  {t.projectName || selectedProject.title}
                                </span>
                              </div>
                              <p className="type-p3 text-muted-foreground">
                                {t.location}
                              </p>
                              <p
                                className={cn(
                                  "type-p2 font-semibold text-foreground",
                                  col.key === "done" &&
                                    "line-through opacity-80",
                                )}
                              >
                                {t.title}
                              </p>
                              <div className="type-p3 flex items-center justify-between pt-0.5 text-muted-foreground tabular-nums">
                                <span className="flex items-center gap-1">
                                  <Calendar
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {t.plannedStartDate?.split("T")[0] || "—"} –{" "}
                                    {t.targetDate?.split("T")[0] || "—"}
                                  </span>
                                </span>
                                {col.key === "in_progress" && (
                                  <strong className="text-warning">
                                    {t.progress}%
                                  </strong>
                                )}
                              </div>
                              {col.key === "in_progress" && (
                                <Progress
                                  value={t.progress}
                                  className="h-1.5"
                                />
                              )}
                            </div>
                          ))}

                          {colTasks.length === 0 && (
                            <div
                              className={cn(
                                "type-p3 flex h-24 items-center justify-center rounded-lg border border-dashed text-center",
                                isOver
                                  ? "border-primary bg-primary/10 font-semibold text-primary"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {isOver
                                ? "Lepas task di sini"
                                : "Belum ada task"}
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selectedProject.id === "all"}
                        onClick={() => handleOpenAddTask(col.status)}
                        className="mt-3 w-full gap-1.5 border-dashed"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        Tambah Task
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Milestone Sidebar Card */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs xl:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="type-h3 flex items-center gap-1.5 text-foreground">
              <Flag className="size-4 text-primary" aria-hidden="true" />
              <span>Milestone</span>
            </h3>
            <Badge variant="secondary" className="tabular-nums">
              {milestones.length}
            </Badge>
          </div>

          <form onSubmit={handleAddMilestone} className="space-y-2.5">
            <Input
              type="text"
              placeholder="Nama milestone"
              value={msTitle}
              onChange={(event) => setMsTitle(event.target.value)}
              disabled={selectedProject.id === "all" || isAddingMs}
              required
            />
            <DatePicker
              value={msDate}
              onValueChange={setMsDate}
              disabled={selectedProject.id === "all" || isAddingMs}
              placeholder="Tanggal milestone"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isAddingMs || selectedProject.id === "all"}
              className="w-full gap-1.5"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>{isAddingMs ? "Menyimpan..." : "Simpan Milestone"}</span>
            </Button>
          </form>

          <div className="border-t border-border pt-3">
            {milestones.length === 0 ? (
              <EmptyState
                variant="inline"
                title="Belum ada milestone"
                description="Tambahkan tonggak target proyek di atas."
              />
            ) : (
              <div className="space-y-2">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="type-p2 font-medium text-foreground">
                        {m.title}
                      </p>
                      <p className="type-p3 mt-0.5 text-muted-foreground">
                        {new Date(m.date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Hapus milestone ${m.title}`}
                      onClick={() => void handleDeleteMilestone(m.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <WorkCalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
      />

      {isTaskModalOpen && (
        <TaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          initialData={editingTask}
          projectStartDate={selectedProject.startDate || undefined}
          defaultAssigneeName={defaultAssigneeName || selectedProject.name}
          teamMembers={teamMembers}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
