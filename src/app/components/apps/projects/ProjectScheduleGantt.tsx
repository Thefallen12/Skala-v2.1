"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Printer,
  Flag,
  Calendar,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectActionButton from "./ProjectActionButton";
import { Input } from "@/components/ui/input";
import WorkCalendarModal from "./WorkCalendarModal";
import TaskModal, {
  type TaskModalData,
  type TaskModalSaveData,
  type TaskModalSaveOutcome,
} from "./TaskModal";
import { ProjectPrintScheduleView } from "./ProjectPrintViews";
import {
  saveProjectScheduleTask,
  uploadProjectScheduleTaskPhoto,
  deleteProjectScheduleTask,
  saveProjectMilestone,
  deleteProjectMilestone,
} from "@/app/actions/project";

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
  location: string; // phase, e.g. "A. Persiapan", "B. Lantai"
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

  // State
  const [tasks, setTasks] = useState<ScheduleTaskItem[]>(initialTasks);
  const [milestones, setMilestones] = useState<ScheduleMilestoneItem[]>(initialMilestones);
  const [viewMode, setViewMode] = useState<"gantt" | "papan">("gantt");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(true);
  const [isPrintScheduleView, setIsPrintScheduleView] = useState(false);

  // Modals state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskModalData | null>(null);

  // Handler slider realtime untuk mengubah progres task secara live
  const handleSliderChange = (taskId: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, progress: clamped } : t)),
    );
  };

  const handleSliderCommit = async (taskId: string, explicitVal?: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const finalProg = typeof explicitVal === "number" ? explicitVal : (task.progress || 0);

    try {
      await saveProjectScheduleTask(task.projectId || selectedProject.id, {
        id: task.id,
        title: task.title,
        location: task.location,
        progress: finalProg,
        plannedStartDate: task.plannedStartDate || undefined,
        targetDate: task.targetDate || undefined,
      });
      router.refresh();
    } catch (err: any) {
      console.error("Gagal menyimpan progres task:", err);
    }
  };

  // Helper status badge task (Lebih cepat, Terlambat, Sesuai rencana, Selesai)
  const getTaskBadge = (prog: number, startWeek: number, duration: number) => {
    if (prog >= 100) {
      return { label: "Selesai", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40" };
    }
    const endWeek = startWeek + duration;
    if (currentWeekIndex < startWeek && prog === 0) {
      return null;
    }
    if (currentWeekIndex >= endWeek && prog < 100) {
      return { label: "Terlambat", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300/40" };
    }
    const expected =
      currentWeekIndex <= startWeek
        ? 0
        : currentWeekIndex >= endWeek
          ? 100
          : Math.round(((currentWeekIndex - startWeek) / Math.max(1, duration)) * 100);

    if (prog >= expected + 5) {
      return { label: "Lebih cepat", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40" };
    }
    if (prog <= expected - 5) {
      return { label: "Terlambat", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300/40" };
    }
    return null;
  };

  // Drag and drop state for Kanban
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskCol, setDragOverTaskCol] = useState<"todo" | "in_progress" | "done" | null>(null);

  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(taskId);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskCol(null);
  };

  const handleTaskColDragOver = (e: React.DragEvent, col: "todo" | "in_progress" | "done") => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTaskCol !== col) {
      setDragOverTaskCol(col);
    }
  };

  const handleTaskColDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverTaskCol(null);
  };

  const handleTaskColDrop = async (e: React.DragEvent, col: "todo" | "in_progress" | "done") => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTaskCol(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;

    const taskToMove = tasks.find((t) => t.id === taskId);
    if (!taskToMove) return;

    let targetProgress = taskToMove.progress || 0;
    if (col === "todo") {
      targetProgress = 0;
    } else if (col === "done") {
      targetProgress = 100;
    } else if (col === "in_progress") {
      targetProgress = targetProgress > 0 && targetProgress < 100 ? targetProgress : 50;
    }

    const prevTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, progress: targetProgress } : t)),
    );

    try {
      await saveProjectScheduleTask(taskToMove.projectId || selectedProject.id, {
        id: taskId,
        title: taskToMove.title,
        location: taskToMove.location,
        progress: targetProgress,
        plannedStartDate: taskToMove.plannedStartDate || undefined,
        targetDate: taskToMove.targetDate || undefined,
      });
      router.refresh();
    } catch (err: any) {
      setTasks(prevTasks);
      alert(err?.message || "Gagal memindahkan task.");
    }
  };

  // New milestone state
  const [msTitle, setMsTitle] = useState("");
  const [msDate, setMsDate] = useState("");
  const [isAddingMs, setIsAddingMs] = useState(false);

  // Baseline state (in-memory snapshot or toggled)
  const [showBaseline, setShowBaseline] = useState(true);
  const [baselineUpdatedMsg, setBaselineUpdatedMsg] = useState(false);

  // Calculate project baseline dates and weeks
  const projectStart = useMemo(() => {
    if (selectedProject.startDate) return new Date(selectedProject.startDate);
    return new Date("2026-10-27T00:00:00Z");
  }, [selectedProject.startDate]);

  // Total weeks (default 8, or dynamically computed)
  const totalWeeks = 8;
  const weekList = useMemo(() => {
    return Array.from({ length: totalWeeks }, (_, i) => `M${i + 1}`);
  }, [totalWeeks]);

  // Current week calculation (Hari ini)
  const currentWeekIndex = useMemo(() => {
    const now = new Date();
    const diffTime = now.getTime() - projectStart.getTime();
    const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
    return Math.max(0, Math.min(totalWeeks - 1, diffWeeks > 0 ? diffWeeks : 1));
  }, [projectStart, totalWeeks]);

  // Helper to convert task dates to startWeek and duration
  const getTaskWeekInfo = (task: ScheduleTaskItem) => {
    if (!task.plannedStartDate) {
      // Default fallback distribution based on task order / phase
      const titleLower = task.title.toLowerCase();
      if (titleLower.includes("pembersihan") || titleLower.includes("persiapan")) {
        return { startWeek: 0, duration: 1 };
      }
      if (titleLower.includes("lantai") || titleLower.includes("keramik")) {
        return { startWeek: 1, duration: 3 };
      }
      if (titleLower.includes("dinding") || titleLower.includes("cat")) {
        return { startWeek: 3, duration: 3 };
      }
      if (titleLower.includes("listrik") || titleLower.includes("lampu")) {
        return { startWeek: 4, duration: 3 };
      }
      return { startWeek: 0, duration: 2 };
    }

    const tStart = new Date(task.plannedStartDate);
    const diffStart = Math.floor(
      (tStart.getTime() - projectStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    const startWeek = Math.max(0, diffStart);

    let duration = 1;
    if (task.targetDate) {
      const tEnd = new Date(task.targetDate);
      const diffEnd = Math.ceil(
        (tEnd.getTime() - tStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      duration = Math.max(1, diffEnd);
    }
    return { startWeek, duration };
  };

  // Group tasks by phase (location)
  const groupedTasks = useMemo(() => {
    // Filter by search
    let list = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.location && t.location.toLowerCase().includes(q))
      );
    }

    // Filter by status
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
    }

    // Filter by phase
    if (phaseFilter !== "all") {
      list = list.filter((t) => t.location === phaseFilter);
    }

    const groups: { [phase: string]: ScheduleTaskItem[] } = {};
    for (const t of list) {
      const p = t.location || "A. Persiapan";
      if (!groups[p]) groups[p] = [];
      groups[p].push(t);
    }
    return groups;
  }, [tasks, searchQuery, statusFilter, phaseFilter]);

  // Overall schedule completion calculation
  const scheduleCompletion = useMemo(() => {
    if (tasks.length === 0) return 0;
    const totalProg = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    return Math.round(totalProg / tasks.length);
  }, [tasks]);

  // Status counts for filter chips
  const counts = useMemo(() => {
    let notStarted = 0;
    let inProgress = 0;
    let done = 0;
    let constraint = 0;
    let needsCheck = 0;
    for (const t of tasks) {
      const p = t.progress || 0;
      if (p === 0) notStarted++;
      else if (p >= 100) done++;
      else inProgress++;
      if (t.hasConstraint) constraint++;
      if (t.needsCheck) needsCheck++;
    }
    return {
      all: tasks.length,
      notStarted,
      inProgress,
      done,
      constraint,
      needsCheck,
      delayed: 0,
    };
  }, [tasks]);

  // Available phases
  const allPhases = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.location) set.add(t.location);
    });
    return Array.from(set);
  }, [tasks]);

  // Handlers
  const handleProjectChange = (projectId: string) => {
    router.push(`/apps/projects/schedule?projectId=${projectId}`);
  };

  const handleOpenAddTask = (defaultStatus?: "TODO" | "IN_PROGRESS" | "DONE" | React.MouseEvent) => {
    const effectiveStatus: "TODO" | "IN_PROGRESS" | "DONE" = typeof defaultStatus === "string" ? defaultStatus : "TODO";
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
      startDate: new Date().toISOString().split("T")[0],
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
      status: task.progress >= 100 ? "DONE" : task.progress > 0 ? "IN_PROGRESS" : "TODO",
      hasConstraint: Boolean(task.hasConstraint),
      needsCheck: Boolean(task.needsCheck),
      startWeek,
      durationWeeks: duration,
      progress: task.progress || 0,
      startDate: task.plannedStartDate ? task.plannedStartDate.split("T")[0] : "",
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
        const d1 = new Date(projectStart);
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
              : t
          );
        } else {
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
        }
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
              : "Foto task gagal diunggah. Silakan coba kembali.",
        };
      }
      uploadedPhotosCount += 1;
    }

    return {
      savedTaskId: taskId,
      progressReportId,
      uploadedPhotosCount,
    };
  };

  const handleDeleteTask = async (id: string) => {
    const res = await deleteProjectScheduleTask(id);
    if (res.success) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setIsTaskModalOpen(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msTitle.trim() || !msDate) return;
    setIsAddingMs(true);
    try {
      const res = await saveProjectMilestone(selectedProject.id, msTitle, msDate);
      if (res.success) {
        setMilestones((prev) => [
          ...prev,
          {
            id: `ms_${Date.now()}`,
            title: msTitle.trim(),
            date: msDate,
          },
        ]);
        setMsTitle("");
        setMsDate("");
      }
    } finally {
      setIsAddingMs(false);
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    const res = await deleteProjectMilestone(id);
    if (res.success) {
      setMilestones((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const handleExportCSV = () => {
    const rows = [
      ["Task", "Fase", "Mulai (Minggu)", "Durasi (mgg)", "Progres (%)", "Tgl Mulai", "Tgl Selesai"],
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
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `jadwal_${selectedProject.code || "proyek"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateBaseline = () => {
    setShowBaseline(true);
    setBaselineUpdatedMsg(true);
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

  return (
    <div className="space-y-4 pb-12">
      {/* Onboarding Step 3 Banner (matching screenshot) */}
      {!embedded && showOnboardingBanner && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground block">
              Langkah 3 dari 3
            </span>
            <h3 className="text-sm font-bold text-foreground">Lihat jadwal (Gantt)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ketuk Tambah task untuk menyusun jadwal pekerjaan. Belum ditagih dan portal klien ada di halaman proyek yang sama.
            </p>
          </div>
          <ProjectActionButton
            type="button"
            label="Selesai"
            icon={<CheckCircle2 className="size-3.5" />}
            onClick={() => setShowOnboardingBanner(false)}
            className="ml-auto h-8 px-4 text-xs bg-foreground text-background hover:bg-foreground/90 font-medium shrink-0 rounded-lg"
          />
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {!embedded && (
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/apps/projects" className="transition hover:text-foreground">
          Proyek
        </Link>
        {selectedProject.id !== "all" && (
          <>
            <ChevronRight className="size-3.5" />
            <Link
              href={`/apps/projects/${selectedProject.id}`}
              className="transition hover:text-foreground line-clamp-1 max-w-[200px]"
            >
              {selectedProject.title}
            </Link>
          </>
        )}
        <ChevronRight className="size-3.5" />
        <span className="font-semibold text-foreground">Jadwal proyek</span>
      </nav>
      )}

      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Jadwal proyek
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Jadwal proyek per minggu: task, fase, progres, dan milestone
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="ml-auto grid w-fit grid-cols-3 justify-items-end gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <ProjectActionButton
            type="button"
            label="Ekspor CSV"
            icon={<Download className="size-3.5" />}
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 gap-1.5 text-xs rounded-lg"
          />

          <ProjectActionButton
            type="button"
            label="Cetak jadwal"
            icon={<Printer className="size-3.5" />}
            variant="outline"
            size="sm"
            onClick={() => setIsPrintScheduleView(true)}
            className="h-8 gap-1.5 text-xs rounded-lg"
          />

          <ProjectActionButton
            type="button"
            label={baselineUpdatedMsg ? "Baseline disimpan" : "Perbarui baseline"}
            icon={<Flag className="size-3.5" />}
            variant="outline"
            size="sm"
            onClick={handleUpdateBaseline}
            className="h-8 gap-1.5 text-xs rounded-lg"
          />

          <ProjectActionButton
            type="button"
            label="Kalender kerja"
            icon={<Calendar className="size-3.5" />}
            variant="outline"
            size="sm"
            onClick={() => setIsCalendarOpen(true)}
            className="h-8 gap-1.5 text-xs rounded-lg"
          />

          <ProjectActionButton
            type="button"
            label="Tambah task"
            icon={<Plus className="size-3.5" />}
            variant="default"
            size="sm"
            onClick={handleOpenAddTask}
            className="h-8 gap-1.5 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium"
          />
        </div>
      </div>

      {/* Project Selector & Top Stats Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Project selector */}
          <div className="w-full max-w-sm">
            <span className="text-[11px] font-medium text-muted-foreground block mb-1">Proyek</span>
            <div className="relative">
              <select
                value={selectedProject.id}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 pr-8 text-xs font-medium text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
              >
                <option value="all">Semua proyek</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            </div>
          </div>

          {/* Quick stats on the right */}
          {selectedProject.id === "all" ? (
            <div className="text-right text-xs font-medium text-muted-foreground self-start md:self-center">
              <span className="font-bold text-base text-foreground">{projects.length}</span> proyek ·{" "}
              <span className="font-bold text-base text-foreground">{tasks.length}</span> task
            </div>
          ) : (
            <div className="flex items-center gap-6 self-start md:self-center">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                  Task
                </span>
                <span className="text-lg font-bold text-foreground">{tasks.length}</span>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                  Rentang
                </span>
                <span className="text-lg font-bold text-foreground">{totalWeeks} mgg</span>
              </div>

              <div className="w-32">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Jadwal selesai
                  </span>
                  <span className="font-semibold text-foreground">{scheduleCompletion}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all duration-300"
                    style={{ width: `${scheduleCompletion}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* View Switcher: Gantt | Papan */}
        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
            <button
              type="button"
              aria-pressed={viewMode === "gantt"}
              onClick={() => setViewMode("gantt")}
              className={`min-h-11 px-4 py-1 text-xs font-medium rounded-md transition-all sm:min-h-8 sm:px-3 ${
                viewMode === "gantt"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Gantt
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "papan"}
              onClick={() => setViewMode("papan")}
              className={`min-h-11 px-4 py-1 text-xs font-medium rounded-md transition-all sm:min-h-8 sm:px-3 ${
                viewMode === "papan"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Papan
            </button>
          </div>

          <Link
            href={`/apps/projects/${selectedProject.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>Detail proyek</span>
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      {/* Filter Toolbar: Status tabs & Right filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Status Pills */}
        <div
          tabIndex={0}
          aria-label="Filter status task; geser horizontal untuk melihat semua pilihan"
          className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1 text-xs lg:flex-wrap lg:overflow-visible"
        >
          <button
            type="button"
            aria-pressed={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "all"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Semua {counts.all}
          </button>

          <button
            type="button"
            aria-pressed={statusFilter === "not_started"}
            onClick={() => setStatusFilter("not_started")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "not_started"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Belum mulai {counts.notStarted}
          </button>

          <button
            type="button"
            aria-pressed={statusFilter === "in_progress"}
            onClick={() => setStatusFilter("in_progress")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "in_progress"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Berjalan {counts.inProgress}
          </button>

          <button
            type="button"
            aria-pressed={statusFilter === "done"}
            onClick={() => setStatusFilter("done")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "done"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Selesai {counts.done}
          </button>

          <button
            type="button"
            aria-pressed={statusFilter === "constraint"}
            onClick={() => setStatusFilter("constraint")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "constraint"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Kendala {counts.constraint}
          </button>

          <button
            type="button"
            aria-pressed={statusFilter === "needs_check"}
            onClick={() => setStatusFilter("needs_check")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "needs_check"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Perlu dicek {counts.needsCheck}
          </button>

          <button
            type="button"
            aria-pressed={statusFilter === "delayed"}
            onClick={() => setStatusFilter("delayed")}
            className={`min-h-11 shrink-0 rounded-md px-3 py-1 transition-colors lg:min-h-8 lg:px-2.5 ${
              statusFilter === "delayed"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Terlambat {counts.delayed}
          </button>
        </div>

        {/* Right Search & Phase Filter */}
        <div className="flex items-center gap-2">
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground focus:outline-hidden"
          >
            <option value="all">Semua fase</option>
            {allPhases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Cari task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-36 sm:w-44 pl-7 text-xs rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Gantt Chart / Kanban on Left + Milestone Sidebar on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
        {/* Left Column (3/4 width): Gantt or Papan */}
        <div className="xl:col-span-3 rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          {viewMode === "gantt" ? (
            <div>
              {/* Gantt Table Container */}
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  {/* Table Header: Task Col + Weeks M1..M8 */}
                  <div className="grid grid-cols-12 border-b border-border/80 bg-muted/20 text-xs font-semibold text-muted-foreground">
                    <div className="col-span-4 p-3 pl-4">Task</div>
                    <div className="col-span-8 grid grid-cols-8 relative">
                      {weekList.map((week, idx) => (
                        <div
                          key={week}
                          className="p-3 text-center border-l border-border/50 text-[11px] font-medium"
                        >
                          {week}
                        </div>
                      ))}

                      {/* Current week vertical line badge */}
                      <div
                        className="absolute -top-1 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                        style={{
                          left: `${((currentWeekIndex + 0.5) / totalWeeks) * 100}%`,
                          transform: "translateX(-50%)",
                        }}
                      >
                        <span className="rounded-full bg-destructive px-1.5 py-0.2 text-[9px] font-semibold text-white tracking-wider shadow-xs">
                          Hari ini
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Gantt Rows by Phase */}
                  <div className="relative">
                    {/* Continuous Red line for Hari Ini */}
                    <div
                      className="absolute top-0 bottom-0 z-10 w-0.5 bg-destructive/80 pointer-events-none"
                      style={{
                        left: `calc(33.333% + (66.666% * ${(currentWeekIndex + 0.5) / totalWeeks}))`,
                      }}
                    />

                    {Object.keys(groupedTasks).length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        Tidak ada task yang sesuai filter.
                      </div>
                    ) : (
                      Object.entries(groupedTasks).map(([phaseName, phaseTasks], pIdx) => (
                        <div key={phaseName} className="border-b border-border/50 last:border-b-0">
                          {/* Phase Header Tag */}
                          <div className="p-2.5 pl-4 bg-muted/10 flex items-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/60 text-muted-foreground">
                              {phaseName}
                              <span className="text-[10px] opacity-70">{phaseTasks.length}</span>
                            </span>
                          </div>

                          {/* Task rows under this phase */}
                          {phaseTasks.map((t) => {
                            const { startWeek, duration } = getTaskWeekInfo(t);
                            const endWeek = startWeek + duration;
                            const leftPercent = (startWeek / totalWeeks) * 100;
                            const widthPercent = (duration / totalWeeks) * 100;
                            const prog = t.progress || 0;

                            return (
                              <div
                                key={t.id}
                                className="grid grid-cols-12 items-center hover:bg-muted/15 transition-colors py-2 border-t border-border/30"
                              >
                                {/* Left cell: Task details */}
                                <div className="col-span-4 pl-4 pr-3">
                                  <div
                                    onClick={() => handleOpenEditTask(t)}
                                    className="font-medium text-xs text-foreground cursor-pointer hover:underline line-clamp-1"
                                  >
                                    {t.title}
                                  </div>
                                  {(() => {
                                    const badge = getTaskBadge(prog, startWeek, duration);
                                    return (
                                      <>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-[11px] text-muted-foreground">
                                            M{startWeek + 1}-M{Math.min(totalWeeks, endWeek)} · {duration}{" "}
                                            mgg
                                          </span>
                                          {badge && (
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none ${badge.className}`}
                                            >
                                              {badge.label}
                                            </span>
                                          )}
                                        </div>

                                        {/* Slider Geser Progres Live */}
                                        <div className="flex items-center gap-2 mt-1.5 max-w-[200px]">
                                          <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={prog}
                                            aria-label={`Progres ${t.title}`}
                                            onChange={(e) => handleSliderChange(t.id, Number(e.target.value))}
                                            onPointerUp={() => handleSliderCommit(t.id)}
                                            onTouchEnd={() => handleSliderCommit(t.id)}
                                            onKeyUp={(e) => {
                                              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                                                handleSliderCommit(t.id);
                                              }
                                            }}
                                            className="h-1 flex-1 cursor-pointer accent-[#544e45] dark:accent-neutral-200 bg-muted rounded-lg appearance-none"
                                          />
                                          <span className="text-[11px] font-mono font-medium text-muted-foreground min-w-[34px] text-right">
                                            {prog}%
                                          </span>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>

                                {/* Right cell: 8 week columns with task bar */}
                                <div className="col-span-8 relative h-10 flex items-center">
                                  {/* Grid background lines */}
                                  <div className="absolute inset-0 grid grid-cols-8 pointer-events-none">
                                    {weekList.map((w) => (
                                      <div
                                        key={w}
                                        className="border-l border-border/30 h-full"
                                      />
                                    ))}
                                  </div>

                                  {/* Baseline dashed outline if toggled */}
                                  {showBaseline && (
                                    <div
                                      className="absolute h-6 rounded-md border border-dashed border-muted-foreground/40 pointer-events-none"
                                      style={{
                                        left: `${leftPercent}%`,
                                        width: `${widthPercent}%`,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                      }}
                                    />
                                  )}

                                  {/* Timeline Task Bar */}
                                  <div
                                    onClick={() => handleOpenEditTask(t)}
                                    title={`${t.title} (${prog}%)`}
                                    className="absolute h-6 rounded-md overflow-hidden bg-muted/60 border border-border/60 cursor-pointer shadow-xs hover:ring-2 hover:ring-primary/40 transition-all flex items-center"
                                    style={{
                                      left: `${leftPercent}%`,
                                      width: `${widthPercent}%`,
                                      zIndex: 15,
                                    }}
                                  >
                                    {/* Progress filled area (live mengikuti slider) */}
                                    <div
                                      className="h-full bg-[#544e45] dark:bg-stone-600 text-white text-[10px] font-semibold flex items-center pl-2 whitespace-nowrap transition-all duration-75"
                                      style={{ width: `${Math.max(prog, 0)}%` }}
                                    >
                                      {prog > 0 && `${prog}%`}
                                    </div>
                                    {prog === 0 && (
                                      <span className="text-[10px] font-medium text-muted-foreground pl-2">
                                        0%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Gantt Footer Legend */}
              <div className="flex flex-wrap items-center justify-between border-t border-border/80 bg-muted/10 p-3 px-4 text-xs">
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="font-semibold text-foreground">Fase:</span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-zinc-800 dark:bg-zinc-200" />
                    <span>Persiapan</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-slate-500" />
                    <span>Struktur</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-amber-600" />
                    <span>Arsitektur</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-teal-600" />
                    <span>MEP</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-indigo-600" />
                    <span>Serah Terima</span>
                  </span>
                  <span className="flex items-center gap-1 ml-2">
                    <span className="w-3 h-2 rounded-xs border border-dashed border-muted-foreground" />
                    <span>Baseline</span>
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <span className="w-0.5 h-3 bg-destructive" />
                    <span>Hari ini</span>
                  </span>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  Klik bar untuk ubah / hapus
                </div>
              </div>
            </div>
          ) : (
            /* Kanban Board (Papan) View */
            <div className="p-4 overflow-x-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-[680px]">
                {/* Belum mulai */}
                <div
                  onDragOver={(e) => handleTaskColDragOver(e, "todo")}
                  onDragLeave={handleTaskColDragLeave}
                  onDrop={(e) => handleTaskColDrop(e, "todo")}
                  className={`rounded-xl border p-3 flex flex-col justify-between transition-all duration-150 min-h-[350px] ${
                    dragOverTaskCol === "todo"
                      ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-inner"
                      : "border-border bg-muted/10"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between font-semibold text-xs text-foreground mb-3">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-muted-foreground" />
                        <span>Belum mulai</span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {counts.notStarted}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {tasks
                        .filter((t) => (t.progress || 0) === 0)
                        .map((t) => (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => handleTaskDragStart(e, t.id)}
                            onDragEnd={handleTaskDragEnd}
                            onClick={() => {
                              if (!draggedTaskId) handleOpenEditTask(t);
                            }}
                            className={`rounded-xl border bg-card p-3 shadow-xs select-none cursor-grab active:cursor-grabbing transition-all space-y-1.5 ${
                              draggedTaskId === t.id
                                ? "opacity-30 border-dashed border-primary scale-95"
                                : "border-border/80 hover:border-primary"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                              <span className="size-2 rounded-full bg-blue-600 shrink-0" />
                              <span className="truncate">{t.projectName || selectedProject.title}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-medium">
                              {t.location}
                            </div>
                            <div className="text-xs font-semibold text-foreground">
                              {t.title}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
                              <Calendar className="size-3" />
                              <span>
                                {t.plannedStartDate?.split("T")[0] || "—"} -{" "}
                                {t.targetDate?.split("T")[0] || "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                      {tasks.filter((t) => (t.progress || 0) === 0).length === 0 && (
                        <div
                          className={`flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-xs transition-colors ${
                            dragOverTaskCol === "todo"
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border/50 text-muted-foreground/70"
                          }`}
                        >
                          <span>{dragOverTaskCol === "todo" ? "Lepas task di sini" : "Belum ada task"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ProjectActionButton
                    type="button"
                    label="Tambah task belum mulai"
                    icon={<Plus className="size-3.5" />}
                    onClick={() => handleOpenAddTask("TODO")}
                    className="ml-auto mt-3 h-11 w-11 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:h-8 sm:w-full"
                  />
                </div>

                {/* Berjalan */}
                <div
                  onDragOver={(e) => handleTaskColDragOver(e, "in_progress")}
                  onDragLeave={handleTaskColDragLeave}
                  onDrop={(e) => handleTaskColDrop(e, "in_progress")}
                  className={`rounded-xl border p-3 flex flex-col justify-between transition-all duration-150 min-h-[350px] ${
                    dragOverTaskCol === "in_progress"
                      ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-inner"
                      : "border-border bg-muted/10"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between font-semibold text-xs text-foreground mb-3">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle className="size-3.5 text-amber-500" />
                        <span>Berjalan</span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {counts.inProgress}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {tasks
                        .filter((t) => (t.progress || 0) > 0 && (t.progress || 0) < 100)
                        .map((t) => (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => handleTaskDragStart(e, t.id)}
                            onDragEnd={handleTaskDragEnd}
                            onClick={() => {
                              if (!draggedTaskId) handleOpenEditTask(t);
                            }}
                            className={`rounded-xl border bg-card p-3 shadow-xs select-none cursor-grab active:cursor-grabbing transition-all space-y-1.5 ${
                              draggedTaskId === t.id
                                ? "opacity-30 border-dashed border-primary scale-95"
                                : "border-border/80 hover:border-primary"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                              <span className="size-2 rounded-full bg-blue-600 shrink-0" />
                              <span className="truncate">{t.projectName || selectedProject.title}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-medium">
                              {t.location}
                            </div>
                            <div className="text-xs font-semibold text-foreground">
                              {t.title}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                              <span className="flex items-center gap-1">
                                <Calendar className="size-3" />
                                <span>
                                  {t.plannedStartDate?.split("T")[0] || "—"} -{" "}
                                  {t.targetDate?.split("T")[0] || "—"}
                                </span>
                              </span>
                              <span className="font-bold text-amber-600 dark:text-amber-400">
                                {t.progress}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-amber-500"
                                style={{ width: `${t.progress}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      {tasks.filter((t) => (t.progress || 0) > 0 && (t.progress || 0) < 100).length === 0 && (
                        <div
                          className={`flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-xs transition-colors ${
                            dragOverTaskCol === "in_progress"
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border/50 text-muted-foreground/70"
                          }`}
                        >
                          <span>{dragOverTaskCol === "in_progress" ? "Lepas task di sini" : "Belum ada task"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ProjectActionButton
                    type="button"
                    label="Tambah task berjalan"
                    icon={<Plus className="size-3.5" />}
                    onClick={() => handleOpenAddTask("IN_PROGRESS")}
                    className="ml-auto mt-3 h-11 w-11 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:h-8 sm:w-full"
                  />
                </div>

                {/* Selesai */}
                <div
                  onDragOver={(e) => handleTaskColDragOver(e, "done")}
                  onDragLeave={handleTaskColDragLeave}
                  onDrop={(e) => handleTaskColDrop(e, "done")}
                  className={`rounded-xl border p-3 flex flex-col justify-between transition-all duration-150 min-h-[350px] ${
                    dragOverTaskCol === "done"
                      ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-inner"
                      : "border-border bg-muted/10"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between font-semibold text-xs text-foreground mb-3">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        <span>Selesai</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {counts.done}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Tambah task selesai"
                        onClick={() => handleOpenAddTask("DONE")}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground sm:size-6"
                        title="Tambah task selesai"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {tasks
                        .filter((t) => (t.progress || 0) >= 100)
                        .map((t) => (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => handleTaskDragStart(e, t.id)}
                            onDragEnd={handleTaskDragEnd}
                            onClick={() => {
                              if (!draggedTaskId) handleOpenEditTask(t);
                            }}
                            className={`rounded-xl border bg-card p-3 shadow-xs select-none cursor-grab active:cursor-grabbing transition-all space-y-1.5 ${
                              draggedTaskId === t.id
                                ? "opacity-30 border-dashed border-primary scale-95"
                                : "border-border/80 hover:border-primary"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                              <span className="size-2 rounded-full bg-blue-600 shrink-0" />
                              <span className="truncate">{t.projectName || selectedProject.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 text-[10px] font-semibold">
                                Selesai
                              </span>
                              <span className="text-[11px] text-muted-foreground font-medium">
                                {t.location}
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-foreground line-through opacity-80">
                              {t.title}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
                              <Calendar className="size-3" />
                              <span>
                                {t.plannedStartDate?.split("T")[0] || "—"} -{" "}
                                {t.targetDate?.split("T")[0] || "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                      {tasks.filter((t) => (t.progress || 0) >= 100).length === 0 && (
                        <div
                          className={`flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-xs transition-colors ${
                            dragOverTaskCol === "done"
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border/50 text-muted-foreground/70"
                          }`}
                        >
                          <span>{dragOverTaskCol === "done" ? "Lepas task di sini" : "Belum ada task"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ProjectActionButton
                    type="button"
                    label="Tambah task selesai"
                    icon={<Plus className="size-3.5" />}
                    onClick={() => handleOpenAddTask("DONE")}
                    className="ml-auto mt-3 h-11 w-11 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:h-8 sm:w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1/4 width): Milestone Sidebar Card */}
        <div className="xl:col-span-1 rounded-xl border border-border bg-card p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>🚩</span>
              <span>Milestone</span>
              <span className="text-muted-foreground font-normal">{milestones.length}</span>
            </h3>
          </div>

          {/* Add Milestone Form */}
          <form onSubmit={handleAddMilestone} className="space-y-2">
            <Input
              type="text"
              placeholder="Nama milestone"
              value={msTitle}
              onChange={(e) => setMsTitle(e.target.value)}
              className="h-8 text-xs"
              required
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={msDate}
                onChange={(e) => setMsDate(e.target.value)}
                className="h-8 text-xs flex-1"
                required
              />
              <Button
                type="submit"
                variant="default"
                size="icon"
                disabled={isAddingMs}
                aria-label="Tambah milestone"
                title="Tambah milestone"
                className="size-11 shrink-0 bg-foreground text-background hover:bg-foreground/90 sm:size-8"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </form>

          {/* Milestone List */}
          <div className="pt-2 border-t border-border/60">
            {milestones.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Belum ada milestone.
              </div>
            ) : (
              <div className="space-y-2">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start justify-between gap-2 p-2 rounded-lg border border-border/60 bg-muted/15"
                  >
                    <div>
                      <div className="text-xs font-medium text-foreground">{m.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(m.date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Hapus milestone ${m.title}`}
                      title={`Hapus milestone ${m.title}`}
                      onClick={() => handleDeleteMilestone(m.id)}
                      className="size-11 shrink-0 text-muted-foreground hover:text-destructive sm:size-8"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
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
