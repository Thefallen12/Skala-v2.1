"use client";

import { useRef, useState, useTransition } from "react";
import type { PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths, format } from "date-fns";
import { id } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock3,
} from "lucide-react";
import {
  ProjectStatus,
  WorkTaskStatus,
} from "@prisma/client";
import {
  updateWorkspaceTaskSchedule,
  type WorkspaceActionResult,
} from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  formatJakartaTime,
  getJakartaDateKey,
  getWeekDateKeys,
  shiftDateKey,
} from "@/lib/habit-date";
import { getIndonesiaHolidayName } from "@/lib/indonesia-holidays";
import { getHabitTaskColorClass } from "@/lib/habit-task-colors";

type ProjectRecord = {
  id: string;
  code: string;
  name: string;
  progress: number;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
};
type TaskRecord = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: WorkTaskStatus;
  color: string;
  projectId: string;
  projectName: string;
  canEditSchedule: boolean;
};

type DragMode = "move" | "start" | "end";
type TimelineView = "day" | "week" | "month";
type DragOrigin = {
  task: TaskRecord;
  mode: DragMode;
  unit: "hour" | "day";
  pointerId: number;
  startX: number;
  unitWidth: number;
};

function dateOffset(dateKey: string, rangeStartKey: string) {
  return Math.round(
    (new Date(`${dateKey.slice(0, 10)}T00:00:00Z`).getTime() -
      new Date(`${rangeStartKey}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function isProjectComplete(project: ProjectRecord) {
  return (
    project.status === ProjectStatus.DONE ||
    project.status === ProjectStatus.COMPLETED
  );
}

function isSunday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 0;
}

function getJakartaMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function TaskTimelineBar({
  task,
  today,
  view,
  rangeStartKey,
  rangeEndKey,
  dayCount,
  laneIndex,
  onActionResult,
  onSelectTask,
}: {
  task: TaskRecord;
  today: string;
  view: TimelineView;
  rangeStartKey: string;
  rangeEndKey: string;
  dayCount: number;
  laneIndex: number;
  onActionResult: (result: WorkspaceActionResult) => void;
  onSelectTask: (task: TaskRecord) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dragPreview, setDragPreview] = useState<{
    deltaUnits: number;
    mode: DragMode;
  } | null>(null);
  const dragOrigin = useRef<DragOrigin | null>(null);
  const lastDraggedAt = useRef(0);
  const originalStartAt = new Date(task.startsAt).getTime();
  const originalEndAt = new Date(task.endsAt).getTime();
  const unitMilliseconds = view === "day" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const startDelta =
    dragPreview && dragPreview.mode !== "end"
      ? dragPreview.deltaUnits * unitMilliseconds
      : 0;
  const endDelta =
    dragPreview && dragPreview.mode !== "start"
      ? dragPreview.deltaUnits * unitMilliseconds
      : 0;
  const previewStart = new Date(originalStartAt + startDelta);
  const previewEnd = new Date(originalEndAt + endDelta);
  const previewStartKey = getJakartaDateKey(previewStart);
  const previewEndKey = getJakartaDateKey(previewEnd);
  const visible =
    view === "day"
      ? previewEnd.getTime() > new Date(`${rangeStartKey}T00:00:00+07:00`).getTime() &&
        previewStart.getTime() < new Date(`${shiftDateKey(rangeEndKey, 1)}T00:00:00+07:00`).getTime()
      : previewEndKey >= rangeStartKey && previewStartKey <= rangeEndKey;
  const startAt =
    view === "day"
      ? Math.max(0, Math.min(1440, getJakartaMinutes(previewStart))) / 1440
      : Math.max(
          0,
          Math.min(
            dayCount - 1,
            dateOffset(previewStartKey, rangeStartKey),
          ),
        );
  const endAt =
    view === "day"
      ? (previewEndKey > rangeStartKey
          ? 1440
          : Math.max(0, Math.min(1440, getJakartaMinutes(previewEnd))) ) / 1440
      : Math.max(
          0,
          Math.min(dayCount - 1, dateOffset(previewEndKey, rangeStartKey)),
        );
  const left = view === "day" ? startAt : startAt / dayCount;
  const width =
    view === "day"
      ? Math.max(0.008, endAt - startAt)
      : Math.max(1, endAt - startAt + 1) / dayCount;
  const late = task.status !== WorkTaskStatus.DONE && previewEndKey < today;
  const color = getHabitTaskColorClass(task.color);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!task.canEditSchedule || isPending || event.button !== 0) return;
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const resizeMode = (event.target as HTMLElement)
      .closest<HTMLElement>("[data-resize]")?.dataset.resize;
    const mode: DragMode =
      resizeMode === "start" || resizeMode === "end" ? resizeMode : "move";
    dragOrigin.current = {
      task,
      mode,
      unit: view === "day" ? "hour" : "day",
      pointerId: event.pointerId,
      startX: event.clientX,
      unitWidth:
        track.getBoundingClientRect().width /
        (view === "day" ? 24 : dayCount),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPreview({ deltaUnits: 0, mode });
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    setDragPreview({
      deltaUnits: Math.round(
        (event.clientX - origin.startX) / origin.unitWidth,
      ),
      mode: origin.mode,
    });
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const origin = dragOrigin.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const deltaUnits = Math.round(
      (event.clientX - origin.startX) / origin.unitWidth,
    );
    dragOrigin.current = null;
    setDragPreview(null);
    if (!deltaUnits) return;
    lastDraggedAt.current = Date.now();

    const deltaMilliseconds = deltaUnits * unitMilliseconds;
    const startsAt = new Date(
      originalStartAt +
        (origin.mode === "end" ? 0 : deltaMilliseconds),
    ).toISOString();
    const endsAt = new Date(
      originalEndAt +
        (origin.mode === "start" ? 0 : deltaMilliseconds),
    ).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      onActionResult({
        success: false,
        message: "Waktu mulai harus lebih awal dari waktu selesai.",
      });
      return;
    }
    startTransition(async () => {
      const result = await updateWorkspaceTaskSchedule({
        taskId: task.id,
        startsAt,
        endsAt,
      });
      onActionResult(result);
      if (result.success) router.refresh();
    });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label={`Detail tugas ${task.title} pada proyek ${task.projectName}`}
      className={`absolute z-10 flex h-6 touch-none select-none items-center overflow-hidden rounded border-0 p-0 text-left text-[9px] leading-6 text-white transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        color
      } ${task.canEditSchedule ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
        isPending ? "opacity-60" : ""
      }`}
      style={{
        left: `${left * 100}%`,
        top: `${36 + laneIndex * 28}px`,
        width: `${width * 100}%`,
      }}
      title={
        view === "day"
          ? `${task.title}: ${formatJakartaTime(previewStart)}–${formatJakartaTime(previewEnd)}${late ? " · Terlambat" : ""}. Klik untuk detail.`
          : `${task.title}: ${previewStartKey} – ${previewEndKey}${late ? " · Terlambat" : ""}. Klik untuk detail.`
      }
      onClick={() => {
        if (Date.now() - lastDraggedAt.current < 500) return;
        onSelectTask(task);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={() => {
        dragOrigin.current = null;
        setDragPreview(null);
      }}
    >
      {task.canEditSchedule && (
        <span
          data-resize="start"
          aria-label={view === "day" ? "Ubah jam mulai" : "Ubah tanggal mulai"}
          title={view === "day" ? "Tarik untuk mengubah jam mulai" : "Tarik untuk mengubah tanggal mulai"}
            className="h-full w-2 shrink-0 cursor-ew-resize bg-foreground/20"
        />
      )}
      <span className="min-w-0 flex-1 truncate px-1.5">{task.title}</span>
      {task.canEditSchedule && (
        <span
          data-resize="end"
          aria-label={view === "day" ? "Ubah jam selesai" : "Ubah tanggal selesai"}
          title={view === "day" ? "Tarik untuk mengubah jam selesai" : "Tarik untuk mengubah tanggal selesai"}
          className="h-full w-2 shrink-0 cursor-ew-resize bg-foreground/20"
        />
      )}
    </button>
  );
}

export default function ProjectWorkspace({
  today,
  currentTime,
  selectedDate,
  view,
  projects,
  tasks,
}: {
  today: string;
  currentTime: string;
  selectedDate: string;
  view: TimelineView;
  projects: ProjectRecord[];
  tasks: TaskRecord[];
}) {
  const [message, setMessage] = useState<WorkspaceActionResult | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.ceil(projects.length / pageSize);
  const visiblePage = Math.min(currentPage, Math.max(pageCount, 1));
  const firstProjectIndex = (visiblePage - 1) * pageSize;
  const paginatedProjects = projects.slice(
    firstProjectIndex,
    firstProjectIndex + pageSize,
  );
  const firstResult = projects.length ? firstProjectIndex + 1 : 0;
  const lastResult = Math.min(firstProjectIndex + pageSize, projects.length);
  const firstVisiblePage = Math.max(
    1,
    Math.min(visiblePage - 2, pageCount - 4),
  );
  const pageNumbers = Array.from(
    { length: Math.min(pageCount, 5) },
    (_, index) => firstVisiblePage + index,
  );
  const selectedDay = new Date(`${selectedDate}T12:00:00`);
  const year = selectedDay.getFullYear();
  const month = selectedDay.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStartKey = format(monthStart, "yyyy-MM-dd");
  const axisDates =
    view === "day"
      ? [selectedDate]
      : view === "week"
        ? getWeekDateKeys(selectedDate)
        : Array.from({ length: daysInMonth }, (_, index) =>
            shiftDateKey(monthStartKey, index),
          );
  const rangeStartKey = axisDates[0];
  const rangeEndKey = axisDates[axisDates.length - 1];
  const dayCount = axisDates.length;
  const currentMinutes = getJakartaMinutes(new Date(currentTime));
  const currentHour = Math.floor(currentMinutes / 60);
  const todayIsVisible =
    view === "day" ? selectedDate === today : axisDates.includes(today);
  const todayMarkerPosition =
    view === "day"
      ? (currentMinutes / 1440) * 100
      : (dateOffset(today, rangeStartKey) / dayCount) * 100;
  const selectedHolidayName = getIndonesiaHolidayName(selectedDate);
  const selectedDayLabel =
    selectedHolidayName ?? (isSunday(selectedDate) ? "Hari Minggu" : undefined);
  const complete = projects.filter(isProjectComplete).length;
  const running = projects.filter(
    (project) =>
      project.status === ProjectStatus.ON_PROGRESS ||
      project.status === ProjectStatus.ACTIVE,
  ).length;
  const pending = projects.filter(
    (project) => project.status === ProjectStatus.PENDING,
  ).length;
  const deadlinesSoon = projects.filter((project) => {
    if (!project.endDate || project.progress >= 100 || isProjectComplete(project)) {
      return false;
    }
    const days = Math.ceil(
      (new Date(`${project.endDate.slice(0, 10)}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000,
    );
    return days >= 0 && days <= 30;
  }).length;
  const overdue = projects.filter(
    (project) =>
      project.endDate &&
      project.endDate.slice(0, 10) < today &&
      project.progress < 100 &&
      !isProjectComplete(project),
  ).length;
  const projectsWithEndDate = projects.filter(
    (project) => project.endDate,
  ).length;
  const completionPercent = projects.length
    ? Math.round((complete / projects.length) * 100)
    : 0;
  const periodLabel =
    view === "day"
      ? format(selectedDay, "EEEE, d MMMM yyyy", { locale: id })
      : view === "week"
        ? `${format(new Date(`${rangeStartKey}T12:00:00`), "d MMM", { locale: id })} – ${format(new Date(`${rangeEndKey}T12:00:00`), "d MMM yyyy", { locale: id })}`
        : format(selectedDay, "MMMM yyyy", { locale: id });
  const viewOptions: { id: TimelineView; label: string }[] = [
    { id: "day", label: "Harian" },
    { id: "week", label: "Mingguan" },
    { id: "month", label: "Bulanan" },
  ];
  const navigatePeriod = (offset: number) => {
    const nextDate =
      view === "day"
        ? shiftDateKey(selectedDate, offset)
        : view === "week"
          ? shiftDateKey(selectedDate, offset * 7)
          : format(addMonths(selectedDay, offset), "yyyy-MM-dd");
    return `/apps/habits/projects?date=${nextDate}&view=${view}`;
  };
  const summary = [
    {
      label: "Running",
      value: running,
      note: `${projects.length} total projects`,
      icon: Clock3,
      color: "text-info",
    },
    {
      label: "Completed",
      value: complete,
      note: "Based on project status",
      icon: CircleCheck,
      color: "text-success",
    },
    {
      label: "Due soon",
      value: deadlinesSoon,
      note:
        projectsWithEndDate === 0
          ? "Set project end dates to track deadlines"
          : overdue
            ? `${overdue} overdue`
            : "No overdue projects",
      icon: AlertTriangle,
      color: overdue ? "text-warning" : "text-muted-foreground",
    },
  ];

  return (
    <div className="my-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Project timeline</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Status of completion for all projects
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/apps/project"
            className="text-xs font-medium text-primary hover:underline"
          >
            Kelola status &amp; tanggal proyek
            <ArrowRight className="ml-1 inline size-3.5" />
          </Link>
          <Link
            href="/apps/habits/roadmap"
            className="text-xs font-medium text-primary hover:underline"
          >
            Buka product roadmap
            <ArrowRight className="ml-1 inline size-3.5" />
          </Link>
        </div>
      </div>
      {message && (
        <p
          role={message.success ? "status" : "alert"}
          className={`rounded-md border px-3 py-2 text-xs ${
            message.success
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}

      <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
        {summary.map(({ label, value, note, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-3 bg-card px-4 py-3">
            <span className={`rounded-md bg-muted p-2 ${color}`}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs">
                {label}: <strong>{value}</strong>
              </p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {note}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(220px,1fr)]">
        <div className="min-w-0 space-y-4">
        <CardBox className="min-w-0 gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Project timeline</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Rentang proyek dan {tasks.length} tugas terjadwal · {periodLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={navigatePeriod(-1)}
                scroll={false}
                aria-label={`${view === "day" ? "Hari" : view === "week" ? "Minggu" : "Bulan"} sebelumnya`}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
              </Link>
              <div
                role="group"
                aria-label="Tampilan periode project timeline"
                className="inline-flex rounded-md border border-border bg-muted/30 p-1"
              >
                {viewOptions.map((option) => (
                  <Link
                    key={option.id}
                    href={`/apps/habits/projects?date=${selectedDate}&view=${option.id}`}
                    scroll={false}
                    aria-current={view === option.id ? "page" : undefined}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      view === option.id
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
              <Link
                href={navigatePeriod(1)}
                scroll={false}
                aria-label={`${view === "day" ? "Hari" : view === "week" ? "Minggu" : "Bulan"} berikutnya`}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted"
              >
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <Badge variant="gray">{projects.length} proyek</Badge>
            </div>
          </div>
          <div key={`${view}:${selectedDate}`} className="overflow-x-auto">
            <div className="min-w-max">
              <div
                className={`grid border-b border-border bg-muted ${
                  view === "day"
                    ? "grid-cols-[200px_minmax(960px,1fr)]"
                    : "grid-cols-[200px_minmax(700px,1fr)]"
                }`}
              >
                <div className="sticky left-0 z-[1] flex items-center bg-muted p-2.5 text-xs font-semibold">
                  <span>
                    Projects & milestones
                    {view === "day" && selectedDayLabel && (
                      <span className="mt-1 block text-[9px] font-medium text-destructive">
                        {selectedDayLabel}
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className="relative grid text-center text-[9px] font-medium text-muted-foreground"
                  style={{
                    gridTemplateColumns: `repeat(${view === "day" ? 24 : dayCount}, minmax(0, 1fr))`,
                  }}
                >
                  {(view === "day"
                    ? Array.from({ length: 24 }, (_, hour) => hour)
                    : axisDates
                  ).map((item) => {
                    const isTodayCell =
                      view === "day"
                        ? today === selectedDate && item === currentHour
                        : item === today;
                    const dateKey =
                      view === "day"
                        ? selectedDate
                        : typeof item === "string"
                          ? item
                          : selectedDate;
                    const holidayName =
                      view === "day"
                        ? undefined
                        : getIndonesiaHolidayName(dateKey);
                    const isRedDate =
                      !!holidayName || (view !== "day" && isSunday(dateKey));
                    const dayLabel = format(
                      new Date(`${dateKey}T12:00:00`),
                      view === "week" ? "EEE d" : "d",
                      { locale: id },
                    );
                    return (
                      <span
                        key={item}
                        title={holidayName ?? (isSunday(dateKey) ? "Hari Minggu" : undefined)}
                        className={`border-l border-border pb-2 pt-5 ${
                          isRedDate
                            ? "bg-destructive/10 font-semibold text-destructive"
                            : isTodayCell
                              ? "bg-primary/10 font-semibold text-primary"
                              : ""
                        }`}
                      >
                        {view === "day"
                          ? `${String(item).padStart(2, "0")}:00`
                          : dayLabel}
                        {holidayName && (
                          <span className="hidden truncate px-0.5 text-[8px] font-medium leading-tight text-destructive sm:block">
                            {holidayName}
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {todayIsVisible && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
                      style={{ left: `${todayMarkerPosition}%` }}
                    >
                      <span className="absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[8px] font-semibold leading-none text-primary-foreground">
                        {view === "day" ? "Sekarang" : "Hari ini"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {paginatedProjects.map((project) => {
                const projectTasks = tasks.filter(
                  (task) => task.projectId === project.id,
                );
                const rowHeight = Math.max(48, 36 + projectTasks.length * 28);
                const startKey = project.startDate?.slice(0, 10);
                const endKey = project.endDate?.slice(0, 10);
                const visible =
                  !!startKey &&
                  !!endKey &&
                  (view === "day"
                    ? startKey <= selectedDate && endKey >= selectedDate
                    : endKey >= rangeStartKey && startKey <= rangeEndKey);
                const clippedStartKey =
                  startKey && startKey < rangeStartKey ? rangeStartKey : startKey;
                const clippedEndKey =
                  endKey && endKey > rangeEndKey ? rangeEndKey : endKey;
                const startAt = clippedStartKey
                  ? dateOffset(clippedStartKey, rangeStartKey)
                  : 0;
                const endAt = clippedEndKey
                  ? dateOffset(clippedEndKey, rangeStartKey)
                  : 0;
                const width = Math.max(1, endAt - startAt + 1);
                const isComplete = isProjectComplete(project);
                const isLate =
                  !!endKey && endKey < today && project.progress < 100;
                return (
                  <div key={`project:${project.id}`} className="relative z-0 border-b border-border last:border-0">
                    <div
                      className={`grid ${
                        view === "day"
                          ? "grid-cols-[200px_minmax(960px,1fr)]"
                          : "grid-cols-[200px_minmax(700px,1fr)]"
                      }`}
                    >
                      <div
                        className="sticky left-0 z-[1] min-w-0 border-l-2 border-primary bg-card p-2.5"
                        style={{ minHeight: rowHeight }}
                      >
                        <p className="truncate text-xs font-medium" title={project.name}>
                          {project.name}
                        </p>
                        <p className="truncate text-[9px] text-muted-foreground">
                          {project.code}
                        </p>
                        <div className="mt-1 flex gap-2 text-[9px]">
                          <Link
                            href={`/apps/habits/roadmap?projectId=${encodeURIComponent(project.id)}`}
                            className="text-primary hover:underline"
                          >
                            Roadmap
                          </Link>
                          <Link
                            href={`/apps/habits/tasks?projectId=${encodeURIComponent(project.id)}`}
                            className="text-primary hover:underline"
                          >
                            Tugas
                          </Link>
                        </div>
                      </div>
                      <div
                        className="relative grid items-start"
                        style={{
                          gridTemplateColumns: `repeat(${view === "day" ? 24 : dayCount}, minmax(0, 1fr))`,
                          minHeight: rowHeight,
                        }}
                      >
                        {(view === "day"
                          ? Array.from({ length: 24 }, (_, hour) => hour)
                          : axisDates
                        ).map((item) => {
                          const dateKey =
                            typeof item === "string" ? item : selectedDate;
                          const holidayName =
                            view === "day"
                              ? selectedHolidayName
                              : getIndonesiaHolidayName(dateKey);
                          return (
                            <span
                              key={item}
                              title={
                                holidayName ??
                                (isSunday(dateKey) ? "Hari Minggu" : undefined)
                              }
                              className={`h-full min-h-12 border-l border-border/60 ${
                                holidayName || isSunday(dateKey)
                                  ? "bg-destructive/5"
                                  : view !== "day" && dateKey === today
                                    ? "bg-primary/5"
                                    : ""
                              }`}
                            />
                          );
                        })}
                        {todayIsVisible && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
                            style={{ left: `${todayMarkerPosition}%` }}
                          />
                        )}
                        {visible && (
                          <div
                            className={`absolute h-6 overflow-hidden rounded px-2 text-[9px] leading-6 text-white ${
                              isComplete
                                ? "bg-success/75"
                                : isLate
                                  ? "bg-warning/75"
                                  : "bg-primary/75"
                            }`}
                            style={{
                              left: `${view === "day" ? 0 : (startAt / dayCount) * 100}%`,
                              width: `${view === "day" ? 100 : (width / dayCount) * 100}%`,
                              top: 8,
                            }}
                            title={`${project.name}: ${startKey} – ${endKey}`}
                          >
                            {project.name}
                          </div>
                        )}
                        {projectTasks.map((task, laneIndex) => (
                          <TaskTimelineBar
                            key={task.id}
                            task={task}
                            today={today}
                            view={view}
                            rangeStartKey={rangeStartKey}
                            rangeEndKey={rangeEndKey}
                            dayCount={dayCount}
                            laneIndex={laneIndex}
                            onActionResult={setMessage}
                            onSelectTask={setSelectedTask}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && tasks.length === 0 && (
                <p className="p-8 text-center text-xs text-muted-foreground">
                  Belum ada proyek atau tugas terjadwal untuk ditampilkan.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Menampilkan {firstResult}–{lastResult} dari {projects.length} proyek
            </p>
            <nav
              aria-label="Pagination project timeline"
              className="flex flex-wrap items-center justify-end gap-1"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={visiblePage <= 1}
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
              >
                Previous
              </Button>
              {pageNumbers.map((page) => (
                <Button
                  key={page}
                  type="button"
                  variant={page === visiblePage ? "default" : "outline"}
                  size="sm"
                  aria-label={`Halaman ${page}`}
                  aria-current={page === visiblePage ? "page" : undefined}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={visiblePage >= pageCount}
                onClick={() =>
                  setCurrentPage((page) => Math.min(pageCount, page + 1))
                }
              >
                Next
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 text-[10px] text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {view === "day"
              ? "Tampilan harian memakai sumbu jam 00.00–23.00. Seret bar untuk menggeser jadwal per jam, atau tarik ujungnya untuk mengubah jam mulai/selesai."
              : "Tampilan mingguan/bulanan memakai sumbu tanggal. Seret bar untuk memindahkan rentang hari, atau tarik ujungnya untuk mengubah tanggal mulai/selesai."}{" "}
            Geser tabel ke samping untuk melihat waktu atau tanggal lainnya.
          </div>
          <div className="flex justify-end px-4 pb-3">
            <Link
              href="/apps/habits/tasks"
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Kelola tugas harian <ArrowRight className="ml-1 inline size-3" />
            </Link>
          </div>
        </CardBox>
        </div>

        <CardBox className="space-y-4 p-4">
          <div>
            <h2 className="text-sm font-semibold">Project deadlines</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Status penyelesaian proyek
            </p>
          </div>
          <div
            role="img"
            aria-label={`${complete} dari ${projects.length} proyek selesai`}
            className="mx-auto grid size-32 place-items-center rounded-full p-2"
            style={{
              background: `conic-gradient(var(--success) ${completionPercent}%, var(--muted) ${completionPercent}% 100%)`,
            }}
          >
            <div className="grid size-full place-items-center rounded-full bg-card">
              <div className="text-center">
                <p className="text-2xl font-semibold">{projects.length}</p>
                <p className="text-[10px] text-muted-foreground">projects</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Selesai", value: complete, color: "border-success" },
              { label: "Berjalan", value: running, color: "border-info" },
              { label: "Belum mulai", value: pending, color: "border-muted-foreground" },
              { label: "Tenggat terlewati", value: overdue, color: "border-warning" },
              { label: "Tenggat 30 hari", value: deadlinesSoon, color: "border-primary" },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between rounded border-l-2 bg-muted/30 px-3 py-2 ${item.color}`}
              >
                <span className="text-[10px] text-muted-foreground">{item.label}</span>
                <span className="text-xs font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
          <Link
            href="/apps/habits/roadmap"
            className="block text-[10px] font-medium text-primary hover:underline"
          >
            Lihat roadmap pekerjaan <ArrowRight className="ml-1 inline size-3" />
          </Link>
        </CardBox>
      </div>
      <GlobalModal
        isOpen={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title ?? "Detail tugas"}
        description="Informasi jadwal tugas pada proyek terkait."
        className="sm:max-w-md"
      >
          {selectedTask && (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">
                  {selectedTask.projectName}
                </p>
                <Badge variant="gray">
                  {selectedTask.status === WorkTaskStatus.DONE
                    ? "Selesai"
                    : selectedTask.status === WorkTaskStatus.IN_PROGRESS
                      ? "Berjalan"
                      : "Belum mulai"}
                </Badge>
              </div>
              <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Mulai</p>
                  <p className="mt-1 font-medium">
                    {format(
                      new Date(
                        `${getJakartaDateKey(new Date(selectedTask.startsAt))}T12:00:00`,
                      ),
                      "d MMM yyyy",
                      { locale: id },
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatJakartaTime(new Date(selectedTask.startsAt))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Selesai</p>
                  <p className="mt-1 font-medium">
                    {format(
                      new Date(
                        `${getJakartaDateKey(new Date(selectedTask.endsAt))}T12:00:00`,
                      ),
                      "d MMM yyyy",
                      { locale: id },
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatJakartaTime(new Date(selectedTask.endsAt))}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button asChild>
                  <Link
                    href={`/apps/habits/tasks?projectId=${encodeURIComponent(selectedTask.projectId)}&date=${getJakartaDateKey(new Date(selectedTask.startsAt))}`}
                    scroll={false}
                  >
                    Buka Tugas Harian <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
      </GlobalModal>
    </div>
  );
}
