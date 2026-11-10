"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { id } from "date-fns/locale";
import {
  ArrowDownToLine,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
} from "lucide-react";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  createWorkspaceTask,
  type WorkspaceActionResult,
} from "@/app/actions/habit-workspace";
import {
  getHabitTaskColorClass,
  habitTaskColors,
} from "@/lib/habit-task-colors";
import { getIndonesiaHolidayName } from "@/lib/indonesia-holidays";
import {
  dateFromKey,
  formatJakartaTime,
  getJakartaDateKey,
  shiftDateKey,
} from "@/lib/habit-date";

type ProjectRecord = {
  id: string;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
};

type TaskRecord = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  color: string;
  projectId: string;
  project: { code: string; name: string };
};

type CalendarRecord = {
  id: string;
  title: string;
  type: string;
  startsAt: string;
  endsAt: string | null;
  projectId: string | null;
  project: { code: string; name: string } | null;
  allDay: boolean;
  meetingUrl: string | null;
  location: string | null;
};

type CalendarItem = {
  id: string;
  title: string;
  date: string;
  endDate: string;
  kind:
    | "project"
    | "task"
    | "meeting"
    | "deadline"
    | "delivery"
    | "holiday"
    | "other";
  time: string | null;
  endTime: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  status: string | null;
  color: string;
  location: string | null;
  meetingUrl: string | null;
};

const categories: {
  kind: CalendarItem["kind"];
  label: string;
  color: string;
}[] = [
  { kind: "project", label: "Proyek", color: "bg-primary" },
  { kind: "task", label: "Tugas & roadmap", color: "bg-emerald-500" },
  { kind: "meeting", label: "Rapat", color: "bg-green-500" },
  { kind: "deadline", label: "Deadline", color: "bg-rose-500" },
  { kind: "delivery", label: "Pengiriman", color: "bg-amber-500" },
  { kind: "holiday", label: "Hari libur nasional", color: "bg-red-600" },
  { kind: "other", label: "Agenda lainnya", color: "bg-violet-500" },
];

const eventColors: Record<CalendarItem["kind"], string> = {
  project: "bg-primary",
  task: "bg-emerald-600",
  meeting: "bg-green-600",
  deadline: "bg-rose-600",
  delivery: "bg-amber-600",
  holiday: "bg-red-600",
  other: "bg-violet-600",
};

const eventBorderColors: Record<CalendarItem["kind"], string> = {
  project: "#2563eb",
  task: "#059669",
  meeting: "#16a34a",
  deadline: "#e11d48",
  delivery: "#d97706",
  holiday: "#dc2626",
  other: "#7c3aed",
};

function itemHref(item: CalendarItem, activeDate = item.date) {
  if (item.kind === "task" && item.projectId) {
    return `/apps/habits?tab=tasks&date=${activeDate}&projectId=${item.projectId}`;
  }
  return `/apps/habits?tab=calendar&date=${activeDate}`;
}

function getEventKind(type: string): CalendarItem["kind"] {
  switch (type) {
    case "MEETING":
      return "meeting";
    case "DEADLINE":
      return "deadline";
    case "DELIVERY":
      return "delivery";
    case "PROJECT":
      return "project";
    default:
      return "other";
  }
}

function monthDateRange(date: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 0 }),
  });
}

function itemTime(item: CalendarItem, dateKey = item.date) {
  if (item.allDay || !item.time) return "Sepanjang hari";
  if (item.startsAt && item.endsAt) {
    const startDate = getJakartaDateKey(new Date(item.startsAt));
    const endDate = getJakartaDateKey(new Date(item.endsAt));
    if (startDate < dateKey && endDate > dateKey) return "Sepanjang hari";
    if (startDate < dateKey) return `00.00–${item.endTime ?? "24.00"}`;
    if (endDate > dateKey) return `${item.time}–24.00`;
  }
  return item.endTime ? `${item.time}–${item.endTime}` : item.time;
}

function getJakartaMinutesAt(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return (
    Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  );
}

function getTimeGridPosition(item: CalendarItem, dateKey: string) {
  if (!item.startsAt || !item.endsAt) return null;
  const startsAt = new Date(item.startsAt);
  const endsAt = new Date(item.endsAt);
  const startDateKey = getJakartaDateKey(startsAt);
  const endDateKey = getJakartaDateKey(endsAt);
  if (startDateKey > dateKey || endDateKey < dateKey) return null;
  const startMinute =
    startDateKey < dateKey ? 0 : getJakartaMinutesAt(startsAt);
  const endMinute = endDateKey > dateKey ? 24 * 60 : getJakartaMinutesAt(endsAt);
  const gridStartMinute = 6 * 60;
  const visibleStart = Math.max(startMinute, gridStartMinute);
  const visibleEnd = Math.min(endMinute, 24 * 60);
  if (visibleEnd <= visibleStart) return null;
  return {
    top: ((visibleStart - gridStartMinute) / 60) * 56,
    height: Math.max(28, ((visibleEnd - visibleStart) / 60) * 56),
  };
}

function formatGridHour(hour: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hour)));
}

function exportCalendar(items: CalendarItem[]) {
  const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ["Tanggal", "Mulai", "Selesai", "Kategori", "Judul", "Proyek", "Status"],
    ...items.map((item) => [
      item.date,
      item.time ?? "",
      item.endTime ?? "",
      categories.find((category) => category.kind === item.kind)?.label ?? "",
      item.title,
      item.projectName ?? "",
      item.status ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const objectUrl = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "kalender-habit-harian.csv";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export default function HabitCalendar({
  today,
  selectedDate,
  view,
  currentUserId,
  projects,
  members,
  tasks,
  calendarRecords,
  onAddSchedule,
}: {
  today: string;
  selectedDate: string;
  view: "day" | "week" | "month";
  currentUserId: string;
  projects: ProjectRecord[];
  members: { id: string; name: string }[];
  tasks: TaskRecord[];
  calendarRecords: CalendarRecord[];
  onAddSchedule: (dateKey: string) => void;
}) {
  const router = useRouter();
  const selected = dateFromKey(selectedDate);
  const calendarDays = useMemo(
    () =>
      view === "month"
        ? monthDateRange(selected)
        : view === "week"
          ? eachDayOfInterval({
              start: startOfWeek(selected, { weekStartsOn: 0 }),
              end: endOfWeek(selected, { weekStartsOn: 0 }),
            })
          : [selected],
    [selected, view],
  );
  const miniCalendarDays = useMemo(
    () => monthDateRange(selected),
    [selected],
  );
  const [visibleCategories, setVisibleCategories] = useState<
    Set<CalendarItem["kind"]>
  >(() => new Set(categories.map(({ kind }) => kind)));
  const [taskSlot, setTaskSlot] = useState<{ date: string; hour: number } | null>(
    null,
  );
  const [taskMessage, setTaskMessage] =
    useState<WorkspaceActionResult | null>(null);
  const [isSavingTask, startSavingTask] = useTransition();
  const items = useMemo<CalendarItem[]>(() => {
    const projectItems: CalendarItem[] = projects.flatMap((project) => {
      const itemsForProject: CalendarItem[] = [];
      const projectDates = [
        {
          date: project.startDate,
          label: `Mulai: ${project.name}`,
          suffix: "mulai",
        },
        {
          date: project.endDate,
          label: `Target selesai: ${project.name}`,
          suffix: "target",
        },
      ];
      for (const entry of projectDates) {
        const date = entry.date?.slice(0, 10);
        if (!date) continue;
        itemsForProject.push({
          id: `${project.id}-${entry.suffix}`,
          title: entry.label,
          date,
          endDate: date,
          kind: entry.suffix === "target" ? "deadline" : "project",
          time: null,
          endTime: null,
          startsAt: null,
          endsAt: null,
          allDay: true,
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          status: project.status,
          color: eventColors[entry.suffix === "target" ? "deadline" : "project"],
          location: null,
          meetingUrl: null,
        });
      }
      return itemsForProject;
    });

    const taskItems: CalendarItem[] = tasks.map((task) => {
      const startsAt = new Date(task.startsAt);
      const endsAt = new Date(task.endsAt);
      return {
        id: `task-${task.id}`,
        title: task.title,
        date: getJakartaDateKey(startsAt),
        endDate: getJakartaDateKey(endsAt),
        kind: "task",
        time: formatJakartaTime(startsAt),
        endTime: formatJakartaTime(endsAt),
        startsAt: task.startsAt,
        endsAt: task.endsAt,
        allDay: false,
        projectId: task.projectId,
        projectName: task.project.name,
        projectCode: task.project.code,
        status: task.status,
        color: getHabitTaskColorClass(task.color),
        location: null,
        meetingUrl: null,
      };
    });

    const scheduleItems: CalendarItem[] = calendarRecords.map((record) => {
      const startsAt = new Date(record.startsAt);
      const endsAt = record.endsAt ? new Date(record.endsAt) : null;
      const kind = getEventKind(record.type);
      return {
        id: `event-${record.id}`,
        title: record.title,
        date: getJakartaDateKey(startsAt),
        endDate: endsAt ? getJakartaDateKey(endsAt) : getJakartaDateKey(startsAt),
        kind,
        time: record.allDay ? null : formatJakartaTime(startsAt),
        endTime: record.allDay || !endsAt ? null : formatJakartaTime(endsAt),
        startsAt: record.startsAt,
        endsAt: endsAt
          ? record.endsAt
          : new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
        allDay: record.allDay,
        projectId: record.projectId,
        projectName: record.project?.name ?? null,
        projectCode: record.project?.code ?? null,
        status: null,
        color: eventColors[kind],
        location: record.location,
        meetingUrl: record.meetingUrl,
      };
    });

    const holidays: CalendarItem[] = calendarDays.flatMap((date) => {
      const dateKey = format(date, "yyyy-MM-dd");
      const name = getIndonesiaHolidayName(dateKey);
      if (!name) return [];
      return [
        {
          id: `holiday-${dateKey}`,
          title: name,
          date: dateKey,
          endDate: dateKey,
          kind: "holiday",
          time: null,
          endTime: null,
          startsAt: null,
          endsAt: null,
          allDay: true,
          projectId: null,
          projectName: null,
          projectCode: null,
          status: null,
          color: eventColors.holiday,
          location: null,
          meetingUrl: null,
        },
      ];
    });
    const kindPriority: Record<CalendarItem["kind"], number> = {
      holiday: 0,
      deadline: 1,
      meeting: 2,
      delivery: 3,
      project: 4,
      task: 5,
      other: 6,
    };
    return [...holidays, ...projectItems, ...taskItems, ...scheduleItems].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        kindPriority[left.kind] - kindPriority[right.kind] ||
        (left.time ?? "").localeCompare(right.time ?? "") ||
        left.title.localeCompare(right.title),
    );
  }, [calendarDays, calendarRecords, projects, tasks]);
  const dateKeyFor = (date: Date) => format(date, "yyyy-MM-dd");
  const rangeItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.date <= dateKeyFor(calendarDays[calendarDays.length - 1]) &&
          item.endDate >= dateKeyFor(calendarDays[0]),
      ),
    [calendarDays, items],
  );
  const visibleItems = useMemo(
    () => rangeItems.filter((item) => visibleCategories.has(item.kind)),
    [rangeItems, visibleCategories],
  );
  const getItemsForDay = (dateKey: string) =>
    visibleItems.filter((item) => item.date <= dateKey && item.endDate >= dateKey);
  const upcomingItems = visibleItems
    .filter((item) => item.endDate >= selectedDate)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 8);

  const navigate = (date: Date, nextView = view) => {
    router.push(
      `/apps/habits?tab=calendar&date=${format(date, "yyyy-MM-dd")}&calendarView=${nextView}`,
      { scroll: false },
    );
  };
  const changePeriod = (direction: -1 | 1) => {
    if (view === "day") {
      navigate(dateFromKey(shiftDateKey(selectedDate, direction)));
      return;
    }
    if (view === "week") {
      navigate(dateFromKey(shiftDateKey(selectedDate, direction * 7)));
      return;
    }
    navigate(addMonths(selected, direction));
  };
  const saveTask = (form: HTMLFormElement) => {
    if (!taskSlot) return;
    const formData = new FormData(form);
    const startsAtValue = String(formData.get("startsAt") ?? "");
    const endsAtValue = String(formData.get("endsAt") ?? "");
    const startsAt = new Date(`${startsAtValue}:00+07:00`);
    const endsAt = new Date(`${endsAtValue}:00+07:00`);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      setTaskMessage({
        success: false,
        message: "Periksa jadwal mulai dan selesai.",
      });
      return;
    }
    setTaskMessage(null);
    startSavingTask(async () => {
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
      setTaskMessage(result);
      if (result.success) {
        setTaskSlot(null);
        router.refresh();
      }
    });
  };

  const renderItem = (
    item: CalendarItem,
    compact = false,
    activeDate = item.date,
  ) => (
    <Link
      key={item.id}
      href={itemHref(item, activeDate)}
      scroll={false}
      title={`${item.title}${item.projectName ? ` · ${item.projectName}` : ""}`}
      className={`block truncate rounded px-1.5 py-1 text-left text-[10px] font-medium leading-tight text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${item.color} ${
        compact ? "" : "sm:text-[11px]"
      }`}
    >
      {!compact && item.time && (
        <span className="mr-1 opacity-80">{item.time}</span>
      )}
      {item.title}
    </Link>
  );
  const timeGrid = (
    <div className="max-h-[70vh] min-h-[420px] overflow-auto">
      <div
        className={`sticky top-0 z-20 grid border-b border-border bg-card ${
          view === "day" ? "min-w-[620px]" : "min-w-[1040px]"
        }`}
        style={{
          gridTemplateColumns: `72px repeat(${calendarDays.length}, minmax(${view === "day" ? "0" : "128px"}, 1fr))`,
        }}
      >
        <div className="border-r border-border px-2 py-3 text-[9px] text-muted-foreground">
          WIB
        </div>
        {calendarDays.map((date) => {
          const dateKey = dateKeyFor(date);
          const isToday = dateKey === today;
          const isSelected = dateKey === selectedDate;
          const holidayName = getIndonesiaHolidayName(dateKey);
          const isSunday = date.getDay() === 0;
          const dayItems = getItemsForDay(dateKey);
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => {
                navigate(date);
                onAddSchedule(dateKey);
              }}
              aria-pressed={isSelected}
              title={holidayName ?? (isSunday ? "Hari Minggu" : undefined)}
              className={`flex min-w-0 items-center justify-between gap-2 border-r border-border px-2 py-2 text-left hover:bg-muted/40 ${
                holidayName || isSunday
                  ? "bg-red-500/10"
                  : isSelected || isToday
                    ? "bg-primary/10"
                    : ""
              }`}
            >
              <span className="min-w-0">
                <span
                  className={`block text-[10px] font-semibold ${
                    holidayName || isSunday ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {view === "day"
                    ? format(date, "EEEE", { locale: id })
                    : format(date, "EEE", { locale: id })}
                </span>
                <span
                  className={`mt-0.5 block text-xs font-semibold ${
                    holidayName || isSunday
                      ? "text-red-600 dark:text-red-400"
                      : isToday
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {format(date, "d MMMM yyyy", { locale: id })}
                  {isToday ? " · Hari ini" : ""}
                </span>
                {holidayName && (
                  <span className="mt-0.5 block truncate text-[9px] font-medium text-red-600 dark:text-red-400">
                    {holidayName}
                  </span>
                )}
              </span>
              <Badge variant="secondary" className="shrink-0 text-[9px]">
                {dayItems.length}
              </Badge>
            </button>
          );
        })}
      </div>
      <div
        className={`grid ${
          view === "day" ? "min-w-[620px]" : "min-w-[1040px]"
        }`}
        style={{
          gridTemplateColumns: `72px repeat(${calendarDays.length}, minmax(${view === "day" ? "0" : "128px"}, 1fr))`,
        }}
      >
        <div className="border-r border-border bg-muted/20">
          <div className="flex h-10 items-center px-2 text-[9px] font-medium text-muted-foreground">
            Sepanjang hari
          </div>
          {Array.from({ length: 18 }, (_, index) => index + 6).map((hour) => (
            <div
              key={hour}
              className="h-14 border-t border-border px-2 pt-1 text-[9px] text-muted-foreground"
            >
              {formatGridHour(hour)}
            </div>
          ))}
        </div>
        {calendarDays.map((date) => {
          const dateKey = dateKeyFor(date);
          const dayItems = getItemsForDay(dateKey);
          const allDayItems = dayItems.filter((item) => item.allDay);
          const timedItems = dayItems
            .filter((item) => !item.allDay)
            .map((item) => ({
              item,
              position: getTimeGridPosition(item, dateKey),
            }))
            .filter(
              (
                entry,
              ): entry is {
                item: CalendarItem;
                position: { top: number; height: number };
              } => entry.position !== null,
            );
          return (
            <div
              key={dateKey}
              aria-label={format(date, "EEEE, d MMMM yyyy", { locale: id })}
              className={`group relative border-r border-border ${
                getIndonesiaHolidayName(dateKey) || date.getDay() === 0
                  ? "bg-red-500/[0.035]"
                  : dateKey === today
                    ? "bg-primary/[0.025]"
                    : ""
              }`}
            >
              <div className="h-10 space-y-0.5 overflow-hidden border-b border-border p-1">
                {allDayItems.slice(0, 3).map((item) =>
                  renderItem(item, true, dateKey),
                )}
                {allDayItems.length > 3 && (
                  <span className="block px-1 text-[8px] text-muted-foreground">
                    +{allDayItems.length - 3} lainnya
                  </span>
                )}
              </div>
              <div
                className="relative h-[1008px]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 55px, var(--border) 55px, var(--border) 56px)",
                }}
              >
                {Array.from({ length: 18 }, (_, index) => {
                  const hour = index + 6;
                  return (
                    <button
                      key={hour}
                      type="button"
                      aria-label={`Tambah tugas ${format(date, "EEEE d MMMM", { locale: id })} pukul ${String(hour).padStart(2, "0")}.00`}
                      title={`Tambah tugas pukul ${String(hour).padStart(2, "0")}.00`}
                      onClick={() => {
                        setTaskMessage(null);
                        setTaskSlot({ date: dateKey, hour });
                      }}
                      className="group/slot absolute inset-x-0 z-0 flex h-14 items-center justify-center border-b border-transparent text-primary transition-colors hover:border-primary/30 hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none"
                      style={{ top: index * 56 }}
                    >
                      <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition-opacity group-hover/slot:opacity-100 group-focus-within/slot:opacity-100">
                        <Plus className="size-3.5" aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
                {timedItems.map(({ item, position }, index) => {
                  const isSplit = timedItems.length > 1;
                  return (
                    <Link
                      key={item.id}
                      href={itemHref(item, dateKey)}
                      scroll={false}
                      title={`${item.title}${item.projectName ? ` · ${item.projectName}` : ""}`}
                      className={`absolute z-10 overflow-hidden rounded px-1.5 py-1 text-left text-[9px] font-semibold leading-tight text-white shadow-sm hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-[10px] ${item.color}`}
                      style={{
                        top: position.top,
                        height: position.height,
                        left: isSplit && index % 2 ? "calc(50% + 1px)" : 3,
                        right: isSplit
                          ? index % 2
                            ? 3
                            : "calc(50% + 1px)"
                          : 3,
                      }}
                    >
                      <span className="block opacity-90">
                        {itemTime(item, dateKey)}
                      </span>
                      <span className="line-clamp-2 block">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Kalender Proyek &amp; Operasional</h2>
          <p className="text-xs text-muted-foreground">
            Jadwal proyek, rapat koordinasi, pengiriman material, dan tugas harian terpadu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportCalendar(visibleItems)}
          >
            <ArrowDownToLine className="mr-1.5 size-3.5" aria-hidden="true" />
            Ekspor CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTaskMessage(null);
              setTaskSlot({ date: selectedDate, hour: 9 });
            }}
          >
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Jadwalkan Tugas
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onAddSchedule(selectedDate)}
          >
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Tambah Agenda / Rapat
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CardBox className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Kalender</h3>
              <ActionIconButton
                label="Tambah agenda"
                tooltip="Tambah agenda"
                icon={Plus}
                onClick={() => onAddSchedule(selectedDate)}
                variant="outline"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Bulan mini sebelumnya"
                onClick={() => navigate(addMonths(selected, -1), "month")}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <p className="text-xs font-semibold capitalize">
                {format(selected, "MMMM yyyy", { locale: id })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Bulan mini berikutnya"
                onClick={() => navigate(addMonths(selected, 1), "month")}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="grid grid-cols-7 text-center">
              {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
                <span
                  key={day}
                  className="py-1 text-[9px] font-semibold text-muted-foreground"
                >
                  {day}
                </span>
              ))}
              {miniCalendarDays.map((date) => {
                const dateKey = dateKeyFor(date);
                const isSelected = dateKey === selectedDate;
                const holidayName = getIndonesiaHolidayName(dateKey);
                const isSunday = date.getDay() === 0;
                const hasItems = getItemsForDay(dateKey).length > 0;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    aria-label={format(date, "EEEE, d MMMM yyyy", { locale: id })}
                    title={holidayName ?? (isSunday ? "Hari Minggu" : undefined)}
                    aria-pressed={isSelected}
                    onClick={() => navigate(date)}
                    className={`relative mx-auto grid size-7 place-items-center rounded text-[10px] transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : holidayName || isSunday
                          ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                        : isSameMonth(date, selected)
                          ? "text-foreground hover:bg-muted"
                          : "text-muted-foreground/50 hover:bg-muted"
                    } ${dateKey === today && !isSelected ? "ring-1 ring-primary" : ""}`}
                  >
                    {format(date, "d")}
                    {(hasItems || holidayName) && !isSelected && (
                      <span
                        className={`absolute bottom-0.5 size-1 rounded-full ${
                          holidayName ? "bg-red-600" : "bg-warning"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </CardBox>

          <CardBox className="space-y-3 p-4">
            <h3 className="text-xs font-semibold">Kategori agenda</h3>
            <div className="space-y-1">
              {categories.map((category) => {
                const count = rangeItems.filter(
                  (item) => item.kind === category.kind,
                ).length;
                const active = visibleCategories.has(category.kind);
                return (
                  <button
                    key={category.kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setVisibleCategories((current) => {
                        const next = new Set(current);
                        if (next.has(category.kind)) next.delete(category.kind);
                        else next.add(category.kind);
                        return next;
                      })
                    }
                    className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs transition-colors ${
                      active
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground opacity-60 hover:bg-muted"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-sm ${category.color}`} />
                      {category.label}
                    </span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </CardBox>

          <CardBox className="space-y-3 p-4">
            <h3 className="text-xs font-semibold">Agenda mendatang</h3>
            {upcomingItems.length ? (
              <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
                {upcomingItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded border border-border border-l-2 p-2"
                    style={{
                      borderLeftColor: eventBorderColors[item.kind],
                    }}
                  >
                    <Link
                      href={itemHref(item)}
                      scroll={false}
                      className="line-clamp-2 text-[11px] font-semibold hover:text-primary"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <CalendarDays className="size-3" aria-hidden="true" />
                      {format(dateFromKey(item.date), "d MMM yyyy", { locale: id })}
                      {item.time && (
                        <>
                          <Clock3 className="ml-1 size-3" aria-hidden="true" />
                          {itemTime(item)}
                        </>
                      )}
                    </p>
                    {item.projectName && (
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        {item.projectName}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[9px] font-medium">
                      {item.kind === "task" && item.projectId ? (
                        <>
                          <Link
                            href={itemHref(item)}
                            scroll={false}
                            className="text-primary hover:underline"
                          >
                            Tugas harian
                          </Link>
                        </>
                      ) : item.kind === "project" || item.kind === "deadline" ? (
                        <span className="text-muted-foreground">
                          Kalender proyek
                        </span>
                      ) : (
                        <Link
                          href={itemHref(item)}
                          scroll={false}
                          className="text-primary hover:underline"
                        >
                          Buka jadwal
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Tidak ada agenda pada periode ini.
              </p>
            )}
          </CardBox>
        </aside>

        <CardBox className="min-w-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Periode sebelumnya"
                onClick={() => changePeriod(-1)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate(dateFromKey(today))}
                disabled={selectedDate === today && view === "day"}
              >
                Hari ini
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Periode berikutnya"
                onClick={() => changePeriod(1)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <h3 className="ml-1 text-sm font-semibold capitalize">
                {view === "day"
                  ? format(selected, "EEEE, d MMMM yyyy", { locale: id })
                  : view === "week"
                    ? `${format(calendarDays[0], "d MMM", { locale: id })} – ${format(calendarDays[6], "d MMM yyyy", { locale: id })}`
                    : format(selected, "MMMM yyyy", { locale: id })}
              </h3>
            </div>
            <div
              role="group"
              aria-label="Tampilan kalender"
              className="inline-flex rounded-md border border-border p-0.5"
            >
              {(["month", "week", "day"] as const).map((period) => (
                <Button
                  key={period}
                  type="button"
                  variant={view === period ? "default" : "ghost"}
                  size="sm"
                  aria-pressed={view === period}
                  className="h-7 px-2 text-[10px]"
                  onClick={() => navigate(selected, period)}
                >
                  {period === "day" ? (
                    <Clock3 className="mr-1 size-3" aria-hidden="true" />
                  ) : (
                    <CalendarDays className="mr-1 size-3" aria-hidden="true" />
                  )}
                  {period === "month"
                    ? "Bulanan"
                    : period === "week"
                      ? "Mingguan"
                      : "Harian"}
                </Button>
              ))}
            </div>
          </div>
          {view !== "month" ? (
            timeGrid
          ) : (
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[690px] grid-cols-7"
            >
              {["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map(
                (day) => (
                  <div
                    key={day}
                    className="bg-primary px-2 py-2 text-center text-[10px] font-semibold text-primary-foreground"
                  >
                    {day}
                  </div>
                ),
              )}
              {calendarDays.map((date) => {
                const dateKey = dateKeyFor(date);
                const isToday = dateKey === today;
                const holidayName = getIndonesiaHolidayName(dateKey);
                const isSunday = date.getDay() === 0;
                const dayItems = getItemsForDay(dateKey);
                const isCurrentMonth = isSameMonth(date, selected);
                return (
                  <section
                    key={dateKey}
                    aria-label={format(date, "EEEE, d MMMM yyyy", { locale: id })}
                    className={`min-h-32 border-b border-r border-border p-1.5 transition-colors sm:min-h-36 sm:p-2 ${
                      isCurrentMonth
                        ? "bg-card"
                        : "bg-muted/50 text-muted-foreground"
                    } ${
                      holidayName || isSunday
                        ? "bg-red-500/[0.07]"
                        : isToday
                          ? "bg-primary/5"
                          : ""
                    }`}
                    title={holidayName ?? (isSunday ? "Hari Minggu" : undefined)}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => navigate(date)}
                        className={`grid size-6 place-items-center rounded-full text-[10px] font-semibold ${
                          holidayName || isSunday
                            ? "bg-red-600 text-white"
                            : isToday
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        {format(date, "d")}
                      </button>
                      <div className="flex items-center gap-1">
                        {isToday && (
                          <Badge className="px-1.5 py-0 text-[8px]">Hari ini</Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => onAddSchedule(dateKey)}
                          title={`Tambah agenda pada ${format(date, "d MMM yyyy", { locale: id })}`}
                          className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-primary/15 hover:text-primary"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>
                    {holidayName && visibleCategories.has("holiday") && (
                      <p
                        className="mb-1 line-clamp-2 text-[9px] font-semibold leading-tight text-red-600 dark:text-red-400"
                        title={holidayName}
                      >
                        {holidayName}
                      </p>
                    )}
                    <div className="space-y-1">
                      {dayItems
                        .filter((item) => item.kind !== "holiday")
                        .slice(0, 3)
                        .map((item) => renderItem(item, true, dateKey))}
                      {dayItems.filter((item) => item.kind !== "holiday").length > 3 && (
                        <p className="px-1 text-[9px] text-muted-foreground">
                          +{dayItems.filter((item) => item.kind !== "holiday").length - 3} agenda lainnya
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          )}
          <div className="flex flex-wrap gap-3 border-t border-border px-3 py-2.5 sm:px-4">
            {categories.map((category) => (
              <span
                key={category.kind}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
              >
                <span className={`size-2 rounded-full ${category.color}`} />
                {category.label}
              </span>
            ))}
          </div>
        </CardBox>
      </div>
      <GlobalModal
        isOpen={taskSlot !== null}
        onClose={() => {
          if (isSavingTask) return;
          setTaskSlot(null);
          setTaskMessage(null);
        }}
        title="Jadwalkan Tugas Proyek"
        description={
          taskSlot
            ? `${format(dateFromKey(taskSlot.date), "EEEE, d MMMM yyyy", { locale: id })} · Mulai pukul ${String(taskSlot.hour).padStart(2, "0")}.00 WIB`
            : "Isi detail tugas proyek yang akan dijadwalkan."
        }
        className="sm:max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaskSlot(null)}
              disabled={isSavingTask}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="calendar-task-form"
              disabled={isSavingTask || projects.length === 0}
            >
              {isSavingTask ? "Menyimpan..." : "Simpan Tugas"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {taskMessage && (
            <p
              role={taskMessage.success ? "status" : "alert"}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                taskMessage.success
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {taskMessage.message}
            </p>
          )}
          <form
            id="calendar-task-form"
            key={`${taskSlot?.date ?? ""}-${taskSlot?.hour ?? ""}`}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveTask(event.currentTarget);
            }}
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="calendar-task-title">Nama Tugas Pekerjaan</Label>
              <Input
                id="calendar-task-title"
                name="title"
                placeholder="Contoh: Pengecoran pondasi / Inspeksi lapangan"
                minLength={2}
                maxLength={160}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-task-project">Proyek</Label>
              <select
                id="calendar-task-project"
                name="projectId"
                required
                defaultValue=""
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Pilih proyek
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-task-lead">Penanggung Jawab (Lead)</Label>
              <select
                id="calendar-task-lead"
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
              <Label htmlFor="calendar-task-start">Mulai (WIB)</Label>
              <Input
                id="calendar-task-start"
                name="startsAt"
                type="datetime-local"
                defaultValue={
                  taskSlot
                    ? `${taskSlot.date}T${String(taskSlot.hour).padStart(2, "0")}:00`
                    : ""
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-task-end">Selesai (WIB)</Label>
              <Input
                id="calendar-task-end"
                name="endsAt"
                type="datetime-local"
                defaultValue={
                  taskSlot
                    ? taskSlot.hour === 23
                      ? `${shiftDateKey(taskSlot.date, 1)}T00:00`
                      : `${taskSlot.date}T${String(taskSlot.hour + 1).padStart(2, "0")}:00`
                    : ""
                }
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
              <Label htmlFor="calendar-task-description">Catatan (Opsional)</Label>
              <textarea
                id="calendar-task-description"
                name="description"
                rows={2}
                maxLength={1000}
                placeholder="Instruksi atau detail pekerjaan..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </form>
        </div>
      </GlobalModal>
    </div>
  );
}
