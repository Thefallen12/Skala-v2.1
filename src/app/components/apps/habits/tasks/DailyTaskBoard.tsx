"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMonths, format } from "date-fns";
import { id } from "date-fns/locale";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  ListTodo,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { WorkTaskStatus } from "@prisma/client";
import {
  createTimesheetEntry,
  createWorkspaceTask,
  deleteWorkspaceTask,
  updateWorkspaceTaskColor,
  updateWorkspaceTaskStatus,
  type WorkspaceActionResult,
} from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
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
import {
  getHabitTaskColorClass,
  habitTaskColors,
} from "@/lib/habit-task-colors";

type ProjectOption = { id: string; code: string; name: string };
type MemberOption = { id: string; name: string; role: string };
type TaskView = "day" | "week" | "month";
type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: WorkTaskStatus;
  color: string;
  projectId: string;
  creatorId: string;
  assigneeId: string | null;
  project: { name: string; code: string };
  assignee: { name: string } | null;
  members: { user: { id: string; name: string } }[];
};

function getTaskMembers(task: TaskRecord) {
  const members = task.members.map(({ user }) => user);
  if (task.assignee && task.assigneeId) {
    members.push({ id: task.assigneeId, name: task.assignee.name });
  }
  return [...new Map(members.map((member) => [member.id, member])).values()];
}

const statuses: { value: WorkTaskStatus; label: string }[] = [
  { value: WorkTaskStatus.TODO, label: "Belum mulai" },
  { value: WorkTaskStatus.IN_PROGRESS, label: "Berjalan" },
  { value: WorkTaskStatus.DONE, label: "Selesai" },
];

function toLocalInput(dateKey: string, hour: string) {
  return `${dateKey}T${hour}`;
}

function parseJakartaDateTime(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function getMonthViewDateKeys(dateKey: string) {
  const selected = dateFromKey(dateKey);
  const monthStart = format(new Date(selected.getFullYear(), selected.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(selected.getFullYear(), selected.getMonth() + 1, 0), "yyyy-MM-dd");
  const firstDate = getWeekDateKeys(monthStart)[0];
  const lastDate = getWeekDateKeys(monthEnd)[6];
  const days =
    Math.round(
      (dateFromKey(lastDate).getTime() - dateFromKey(firstDate).getTime()) /
        86_400_000,
    ) + 1;
  return Array.from({ length: days }, (_, index) =>
    shiftDateKey(firstDate, index),
  );
}

function taskStatusLabel(status: WorkTaskStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function TaskPeriodCalendar({
  view,
  dates,
  selectedDate,
  tasks,
  onSelectDate,
}: {
  view: Exclude<TaskView, "day">;
  dates: string[];
  selectedDate: string;
  tasks: TaskRecord[];
  onSelectDate: (dateKey: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-medium text-muted-foreground">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => (
            <span key={day} className="border-r border-border/70 py-2 last:border-r-0">
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dates.map((dateKey) => {
            const dayTasks = tasks.filter(
              (task) =>
                getJakartaDateKey(new Date(task.startsAt)) <= dateKey &&
                getJakartaDateKey(new Date(task.endsAt)) >= dateKey,
            );
            const isSelected = dateKey === selectedDate;
            const isInSelectedMonth =
              dateFromKey(dateKey).getMonth() ===
              dateFromKey(selectedDate).getMonth();
            return (
              <div
                key={dateKey}
                className={`min-h-28 border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-32 sm:p-2 ${
                  view === "month" && !isInSelectedMonth ? "bg-muted/20" : ""
                } ${isSelected ? "bg-primary/5" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Pilih ${format(dateFromKey(dateKey), "EEEE, d MMMM yyyy", { locale: id })}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectDate(dateKey)}
                  className={`mb-1 grid size-7 place-items-center rounded-full text-xs ${
                    isSelected
                      ? "bg-primary font-semibold text-white"
                      : "text-foreground hover:bg-muted"
                  } ${view === "month" && !isInSelectedMonth ? "text-muted-foreground" : ""}`}
                >
                  {format(dateFromKey(dateKey), "d")}
                </button>
                <div className="space-y-1">
                  {dayTasks.slice(0, view === "week" ? 5 : 3).map((task) => (
                    <div
                      key={`${dateKey}:${task.id}`}
                      className={`overflow-hidden rounded px-1.5 py-1 text-[10px] leading-tight text-white ${getHabitTaskColorClass(task.color)}`}
                      title={`${task.title} · ${task.project.name} · ${formatJakartaTime(new Date(task.startsAt))}–${formatJakartaTime(new Date(task.endsAt))}`}
                    >
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="truncate opacity-80">
                        {formatJakartaTime(new Date(task.startsAt))} · {task.project.name}
                      </p>
                    </div>
                  ))}
                  {dayTasks.length > (view === "week" ? 5 : 3) && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{dayTasks.length - (view === "week" ? 5 : 3)} tugas lainnya
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DailyTaskTimeline({
  selectedDate,
  tasks,
}: {
  selectedDate: string;
  tasks: TaskRecord[];
}) {
  const visibleStart = new Date(`${selectedDate}T08:00:00+07:00`).getTime();
  const visibleEnd = new Date(`${selectedDate}T20:00:00+07:00`).getTime();

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-[180px_repeat(12,minmax(42px,1fr))] border-b border-border bg-muted/30 text-center text-[10px] text-muted-foreground">
          <span className="p-2 text-left font-semibold">Anggota / waktu</span>
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} className="border-l border-border p-2">
              {`${String(index + 8).padStart(2, "0")}:00`}
            </span>
          ))}
        </div>
        {tasks.map((task) => {
          const start = new Date(task.startsAt);
          const end = new Date(task.endsAt);
          const taskMembers = getTaskMembers(task);
          const left = Math.max(
            0,
            Math.min(
              100,
              ((Math.max(start.getTime(), visibleStart) - visibleStart) /
                (visibleEnd - visibleStart)) *
                100,
            ),
          );
          const right = Math.max(
            0,
            Math.min(
              100,
              ((Math.min(end.getTime(), visibleEnd) - visibleStart) /
                (visibleEnd - visibleStart)) *
                100,
            ),
          );
          return (
            <div
              key={task.id}
              className="grid grid-cols-[180px_minmax(504px,1fr)] border-b border-border last:border-0"
            >
              <div className="min-w-0 border-r border-border p-3">
                <p className="truncate text-sm font-medium">
                  {task.assignee?.name ?? "Belum ditugaskan"}
                </p>
                <div className="mt-1 flex items-center -space-x-1">
                  {taskMembers.slice(0, 4).map((member, index) => (
                    <span
                      key={member.id}
                      title={member.name}
                      className={`grid size-5 place-items-center rounded-full border border-card text-[7px] text-white ${
                        ["bg-info", "bg-primary", "bg-warning", "bg-success"][index]
                      }`}
                    >
                      {member.name
                        .split(/\s+/)
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                  ))}
                  {taskMembers.length > 4 && (
                    <span className="grid size-5 place-items-center rounded-full border border-card bg-muted text-[7px]">
                      +{taskMembers.length - 4}
                    </span>
                  )}
                </div>
              </div>
              <div className="relative min-h-16 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px)] bg-[length:8.333%_100%]">
                <div
                  className={`absolute top-3 min-w-20 overflow-hidden rounded-md px-3 py-2 text-xs text-white ${getHabitTaskColorClass(task.color)}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(5, right - left)}%`,
                  }}
                  title={`${task.title} • ${taskStatusLabel(task.status)} • ${formatJakartaTime(start)}–${formatJakartaTime(end)}`}
                >
                  <span className="block truncate font-medium">{task.title}</span>
                  <span className="block truncate opacity-80">{task.project.name}</span>
                </div>
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Tidak ada tugas untuk filter dan tanggal ini.
          </p>
        )}
      </div>
    </div>
  );
}

export default function DailyTaskBoard({
  selectedDate,
  view,
  initialProjectId,
  currentUserId,
  projects,
  members,
  tasks,
}: {
  selectedDate: string;
  view: TaskView;
  initialProjectId: string | null;
  currentUserId: string;
  projects: ProjectOption[];
  members: MemberOption[];
  tasks: TaskRecord[];
}) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState(
    initialProjectId && projects.some((project) => project.id === initialProjectId)
      ? initialProjectId
      : "all",
  );
  const [message, setMessage] = useState<WorkspaceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const filteredTasks = tasks.filter((task) => {
    const taskMembers = getTaskMembers(task);
    const searchMatch = `${task.title} ${task.project.name} ${taskMembers.map(({ name }) => name).join(" ")}`
      .toLocaleLowerCase("id-ID")
      .includes(search.toLocaleLowerCase("id-ID"));
    const memberMatch =
      memberFilter === "all" ||
      task.assigneeId === memberFilter ||
      task.creatorId === memberFilter ||
      task.members.some(({ user }) => user.id === memberFilter);
    const projectMatch =
      projectFilter === "all" || task.projectId === projectFilter;
    return searchMatch && memberMatch && projectMatch;
  });
  const taskStats = [
    {
      label: "Total tugas",
      value: filteredTasks.length,
      icon: ListTodo,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      label: "Belum mulai",
      value: filteredTasks.filter((task) => task.status === WorkTaskStatus.TODO)
        .length,
      icon: CircleDashed,
      iconClass: "bg-muted text-muted-foreground",
    },
    {
      label: "Sedang berjalan",
      value: filteredTasks.filter(
        (task) => task.status === WorkTaskStatus.IN_PROGRESS,
      ).length,
      icon: Clock3,
      iconClass: "bg-warning/10 text-warning",
    },
    {
      label: "Selesai",
      value: filteredTasks.filter((task) => task.status === WorkTaskStatus.DONE)
        .length,
      icon: CheckCircle2,
      iconClass: "bg-success/10 text-success",
    },
  ];

  const updateUrl = (nextDate: string, nextView = view) => {
    const params = new URLSearchParams({
      tab: "tasks",
      date: nextDate,
      taskView: nextView,
    });
    if (projectFilter !== "all") params.set("projectId", projectFilter);
    router.push(`/apps/habits?${params.toString()}`, { scroll: false });
  };
  const navigatePeriod = (offset: number) => {
    if (view === "day") {
      updateUrl(shiftDateKey(selectedDate, offset));
      return;
    }
    if (view === "week") {
      updateUrl(shiftDateKey(selectedDate, offset * 7));
      return;
    }
    const selected = dateFromKey(selectedDate);
    updateUrl(format(addMonths(selected, offset), "yyyy-MM-dd"));
  };
  const selected = dateFromKey(selectedDate);
  const selectedWeek = getWeekDateKeys(selectedDate);
  const selectedMonthDays = getMonthViewDateKeys(selectedDate);
  const periodLabel =
    view === "day"
      ? format(selected, "EEEE, d MMMM yyyy", { locale: id })
      : view === "week"
        ? `${format(dateFromKey(selectedWeek[0]), "d MMM", { locale: id })} – ${format(dateFromKey(selectedWeek[6]), "d MMM yyyy", { locale: id })}`
        : format(selected, "MMMM yyyy", { locale: id });
  const viewOptions: { id: TaskView; label: string }[] = [
    { id: "day", label: "Harian" },
    { id: "week", label: "Mingguan" },
    { id: "month", label: "Bulanan" },
  ];

  const onCreateTask = (formData: FormData) => {
    const startsAtValue = String(formData.get("startsAt") ?? "");
    const endsAtValue = String(formData.get("endsAt") ?? "");
    const startsAt = parseJakartaDateTime(startsAtValue);
    const endsAt = parseJakartaDateTime(endsAtValue);
    if (
      !startsAtValue ||
      !endsAtValue ||
      !startsAt ||
      !endsAt
    ) {
      setMessage({ success: false, message: "Periksa jadwal mulai dan selesai." });
      return;
    }
    startTransition(async () => {
      const result = await createWorkspaceTask({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        projectId: String(formData.get("projectId") ?? ""),
        assigneeId: String(formData.get("assigneeId") ?? ""),
        memberIds: formData.getAll("memberIds").map(String),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        color: String(formData.get("color") ?? ""),
      });
      setMessage(result);
      if (result.success) {
        setIsDialogOpen(false);
        router.refresh();
      }
    });
  };

  const onStatusChange = (taskId: string, status: string) => {
    startTransition(async () => {
      const result = await updateWorkspaceTaskStatus(taskId, status);
      setMessage(result);
      if (result.success) router.refresh();
    });
  };

  const onColorChange = (taskId: string, color: string) => {
    startTransition(async () => {
      const result = await updateWorkspaceTaskColor(taskId, color);
      setMessage(result);
      if (result.success) router.refresh();
    });
  };

  const onDelete = (taskId: string) => {
    if (!window.confirm("Hapus tugas ini?")) return;
    startTransition(async () => {
      const result = await deleteWorkspaceTask(taskId);
      setMessage(result);
      if (result.success) router.refresh();
    });
  };

  const onLogToTimesheet = (task: TaskRecord) => {
    const startMs = new Date(task.startsAt).getTime();
    const endMs = new Date(task.endsAt).getTime();
    const diffMinutes = Math.max(30, Math.round((endMs - startMs) / 60_000));
    const workDate = getJakartaDateKey(new Date(task.startsAt));
    startTransition(async () => {
      const result = await createTimesheetEntry({
        projectId: task.projectId,
        date: workDate,
        durationMinutes: Math.min(1440, diffMinutes),
        note: `Tugas: ${task.title}`,
      });
      setMessage(result);
      if (result.success) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Papan Tugas Harian &amp; Proyek</h2>
          <p className="text-xs text-muted-foreground">
            Atur jadwal pekerjaan tim, perbarui status eksekusi, dan kirim realisasi jam kerja langsung ke Timesheet.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setMessage(null);
            setIsDialogOpen(true);
          }}
          disabled={!projects.length}
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          Tambah Tugas Proyek
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {taskStats.map(({ label, value, icon: Icon, iconClass }) => (
          <CardBox
            key={label}
            className="flex items-center gap-3 p-3.5"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-xl font-bold leading-none">{value}</p>
            </div>
          </CardBox>
        ))}
      </div>

      {message && !isDialogOpen && (
        <p
          role={message.success ? "status" : "alert"}
          className={`rounded-md border px-4 py-3 text-sm ${
            message.success
              ? "border-success/30 bg-lightsuccess text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}

      <CardBox className="space-y-5 rounded-2xl p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={`${view === "day" ? "Hari" : view === "week" ? "Minggu" : "Bulan"} sebelumnya`}
              onClick={() => navigatePeriod(-1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              onClick={() => updateUrl(getJakartaDateKey())}
            >
              Hari ini
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={`${view === "day" ? "Hari" : view === "week" ? "Minggu" : "Bulan"} berikutnya`}
              onClick={() => navigatePeriod(1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
            <span className="ml-1 inline-flex min-w-0 items-center gap-2 text-sm font-semibold capitalize">
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              {periodLabel}
            </span>
          </div>
          <div
            role="group"
            aria-label="Tampilan periode tugas"
            className="inline-flex rounded-md border border-border bg-muted/30 p-1"
          >
            {viewOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={view === option.id ? "default" : "ghost"}
                aria-pressed={view === option.id}
                onClick={() => updateUrl(selectedDate, option.id)}
                className="h-8 px-3"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari tugas, proyek, atau anggota"
                aria-label="Cari tugas, proyek, atau anggota"
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filter anggota"
              value={memberFilter}
              onChange={(event) => setMemberFilter(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Semua anggota</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
            <select
              aria-label="Filter proyek"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Semua proyek</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
        </div>

        {view === "day" ? (
          <DailyTaskTimeline
            selectedDate={selectedDate}
            tasks={filteredTasks}
          />
        ) : (
          <TaskPeriodCalendar
            view={view}
            dates={view === "week" ? selectedWeek : selectedMonthDays}
            selectedDate={selectedDate}
            tasks={filteredTasks}
            onSelectDate={(dateKey) => updateUrl(dateKey)}
          />
        )}
      </CardBox>

      <CardBox className="overflow-hidden rounded-2xl p-0 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Daftar tugas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {filteredTasks.length} tugas ditampilkan. Status dapat diubah oleh pembuat atau anggota yang ditugaskan.
          </p>
          </div>
          {(search || memberFilter !== "all" || projectFilter !== "all") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setMemberFilter("all");
                setProjectFilter("all");
              }}
            >
              Hapus filter
            </Button>
          )}
        </div>
        <div className="divide-y divide-border">
          {filteredTasks.map((task) => {
            const canEdit =
              task.creatorId === currentUserId ||
              task.assigneeId === currentUserId ||
              task.members.some(({ user }) => user.id === currentUserId);
            const memberNames = [
              ...new Set([
                ...getTaskMembers(task).map(({ name }) => name),
              ]),
            ];
            return (
              <div key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/20 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.project.name} · {memberNames.join(", ") || "Belum ditugaskan"} ·{" "}
                    {view !== "day" && (
                      <>
                        {format(
                          dateFromKey(getJakartaDateKey(new Date(task.startsAt))),
                          "d MMM",
                          { locale: id },
                        )}{" "}
                      </>
                    )}
                    {formatJakartaTime(new Date(task.startsAt))}–{formatJakartaTime(new Date(task.endsAt))}
                  </p>
                  {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}
                </div>
                {canEdit ? (
                  <select
                    aria-label={`Status ${task.title}`}
                    value={task.status}
                    disabled={isPending}
                    onChange={(event) => onStatusChange(task.id, event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                ) : (
                  <Badge variant="gray">{statuses.find((status) => status.value === task.status)?.label}</Badge>
                )}
                {canEdit && (
                  <select
                    aria-label={`Warna bar ${task.title}`}
                    value={task.color}
                    disabled={isPending}
                    onChange={(event) => onColorChange(task.id, event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {habitTaskColors.map((color) => (
                      <option key={color.value} value={color.value}>
                        Warna: {color.label}
                      </option>
                    ))}
                  </select>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onLogToTimesheet(task)}
                    title="Catat durasi tugas ini langsung ke Timesheet proyek"
                    className="h-9 gap-1.5 text-xs"
                  >
                    <Clock3 className="size-3.5 text-primary" />
                    <span>+ Timesheet</span>
                  </Button>
                )}
                {canEdit && (
                  <ActionIconButton
                    label={`Hapus tugas ${task.title}`}
                    tooltip={`Hapus tugas ${task.title}`}
                    icon={Trash2}
                    disabled={isPending}
                    onClick={() => onDelete(task.id)}
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    variant="ghost"
                  />
                )}
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <div className="px-4 py-12 text-center sm:px-6">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ListTodo className="size-6" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-semibold">
                {tasks.length === 0
                  ? "Belum ada tugas pada periode ini"
                  : "Tugas tidak ditemukan"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {tasks.length === 0
                  ? "Buat tugas pertama untuk mulai menyusun pekerjaan tim."
                  : "Coba ubah kata kunci atau filter anggota dan proyek."}
              </p>
              {tasks.length === 0 ? (
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => {
                    setMessage(null);
                    setIsDialogOpen(true);
                  }}
                  disabled={!projects.length}
                >
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  Tambah tugas
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearch("");
                    setMemberFilter("all");
                    setProjectFilter("all");
                  }}
                >
                  Hapus filter
                </Button>
              )}
            </div>
          )}
        </div>
      </CardBox>

      <GlobalModal
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Tambah Tugas Proyek"
        description="Jadwalkan pekerjaan, tentukan proyek, dan tugaskan ke anggota tim aktif."
        className="sm:max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="workspace-task-form"
              disabled={isPending || !projects.length}
            >
              {isPending ? "Menyimpan..." : "Simpan Tugas"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {message && (
            <p
              role={message.success ? "status" : "alert"}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                message.success
                  ? "border-success/30 bg-lightsuccess text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {message.message}
            </p>
          )}
          <form
            id="workspace-task-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              onCreateTask(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="workspace-task-title">Nama Tugas Pekerjaan</Label>
              <Input
                id="workspace-task-title"
                name="title"
                placeholder="Contoh: Pemasangan bekisting / Pengecekan struktur"
                required
                minLength={2}
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-task-project">Proyek</Label>
              <select
                id="workspace-task-project"
                name="projectId"
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-task-assignee">Penanggung Jawab (Lead)</Label>
              <select
                id="workspace-task-assignee"
                name="assigneeId"
                defaultValue={currentUserId}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Tanpa lead</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-task-start">Mulai (WIB)</Label>
              <Input
                id="workspace-task-start"
                name="startsAt"
                type="datetime-local"
                defaultValue={toLocalInput(selectedDate, "09:00")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-task-end">Selesai (WIB)</Label>
              <Input
                id="workspace-task-end"
                name="endsAt"
                type="datetime-local"
                defaultValue={toLocalInput(selectedDate, "11:00")}
                required
              />
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-xs font-semibold">Anggota Tim Terlibat</legend>
              <div className="grid max-h-28 gap-2 overflow-y-auto rounded-lg border border-input bg-muted/20 p-3 sm:grid-cols-2">
                {members.map((member) => (
                  <FormLabel
                    key={member.id}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="memberIds"
                      value={member.id}
                      defaultChecked={member.id === currentUserId}
                      className="size-3.5 accent-primary"
                    />
                    <span className="truncate">{member.name}</span>
                  </FormLabel>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-xs font-semibold">Warna Label Tugas</legend>
              <div className="flex flex-wrap gap-2">
                {habitTaskColors.map((color, index) => (
                  <FormLabel
                    key={color.value}
                    title={color.label}
                    className="cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="color"
                      value={color.value}
                      defaultChecked={index === 0}
                      aria-label={`Warna ${color.label}`}
                      className="peer sr-only"
                    />
                    <span
                      className={`block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-primary ${color.className}`}
                    />
                  </FormLabel>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="workspace-task-description">Catatan (Opsional)</Label>
              <textarea
                id="workspace-task-description"
                name="description"
                rows={2}
                maxLength={1000}
                placeholder="Detail instruksi atau target capaian..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </form>
        </div>
      </GlobalModal>
    </div>
  );
}
