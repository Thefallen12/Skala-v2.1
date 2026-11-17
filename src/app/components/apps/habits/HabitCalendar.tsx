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
  ExternalLink,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  createWorkspaceTask,
  deleteWorkspaceEvent,
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

function getCalendarRecordId(item: CalendarItem) {
  return item.id.startsWith("event-") ? item.id.slice("event-".length) : null;
}

function isProjectScheduleItem(item: CalendarItem) {
  return Boolean(
    item.projectId &&
      (item.id === `${item.projectId}-mulai` ||
        item.id === `${item.projectId}-target`),
  );
}

function itemHref(item: CalendarItem, activeDate = item.date) {
  if (item.kind === "task" && item.projectId) {
    return `/apps/habits?tab=tasks&date=${activeDate}&projectId=${item.projectId}`;
  }
  if (isProjectScheduleItem(item) && item.projectId) {
    return `/apps/projects/${item.projectId}`;
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
  return `${String(hour).padStart(2, "0")}.00`;
}

function CalendarEventPill({
  item,
  compact = false,
  activeDate = item.date,
  onOpenEvent,
}: {
  item: CalendarItem;
  compact?: boolean;
  activeDate?: string;
  onOpenEvent: (recordId: string) => void;
}) {
  const className = `type-p3 block w-full truncate rounded px-1.5 py-1 text-left font-medium leading-tight text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${item.color}`;
  const title = `${item.title}${item.projectName ? ` · ${item.projectName}` : ""}`;
  const content = (
    <>
      {!compact && item.time && (
        <span className="mr-1 opacity-85">{item.time}</span>
      )}
      {item.title}
    </>
  );
  const recordId = getCalendarRecordId(item);
  if (recordId) {
    return (
      <button
        type="button"
        title={title}
        onClick={() => onOpenEvent(recordId)}
        className={className}
      >
        {content}
      </button>
    );
  }
  return (
    <Link
      href={itemHref(item, activeDate)}
      scroll={false}
      title={title}
      className={className}
    >
      {content}
    </Link>
  );
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
  const [slotTitle, setSlotTitle] = useState("");
  const [slotProjectId, setSlotProjectId] = useState(projects[0]?.id ?? "");
  const [slotAssigneeId, setSlotAssigneeId] = useState(currentUserId || "none");
  const [slotStartDate, setSlotStartDate] = useState(selectedDate);
  const [slotStartTime, setSlotStartTime] = useState("09:00");
  const [slotEndDate, setSlotEndDate] = useState(selectedDate);
  const [slotEndTime, setSlotEndTime] = useState("10:00");
  const [slotMemberIds, setSlotMemberIds] = useState<string[]>(
    currentUserId ? [currentUserId] : [],
  );
  const [slotColor, setSlotColor] = useState<string>(
    habitTaskColors[0]?.value ?? "",
  );
  const [slotDescription, setSlotDescription] = useState("");
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [isSavingTask, startSavingTask] = useTransition();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isDeletingEvent, startDeletingEvent] = useTransition();
  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      })),
    [projects],
  );
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
  const upcomingAnchor = selectedDate > today ? selectedDate : today;
  const upcomingItems = visibleItems
    .filter((item) => item.endDate >= upcomingAnchor)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 8);
  const selectedEvent = useMemo(
    () =>
      selectedEventId
        ? items.find((item) => item.id === `event-${selectedEventId}`) ?? null
        : null,
    [items, selectedEventId],
  );

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
  const openTaskSlot = (date: string, hour: number) => {
    const endDateValue = hour === 23 ? shiftDateKey(date, 1) : date;
    const endHourValue =
      hour === 23 ? "00:00" : `${String(hour + 1).padStart(2, "0")}:00`;
    setTaskFormError(null);
    setSlotTitle("");
    setSlotProjectId(projects[0]?.id ?? "");
    setSlotAssigneeId(currentUserId || "none");
    setSlotStartDate(date);
    setSlotStartTime(`${String(hour).padStart(2, "0")}:00`);
    setSlotEndDate(endDateValue);
    setSlotEndTime(endHourValue);
    setSlotMemberIds(currentUserId ? [currentUserId] : []);
    setSlotColor(habitTaskColors[0]?.value ?? "");
    setSlotDescription("");
    setTaskSlot({ date, hour });
  };

  const toggleSlotMember = (memberId: string, checked: boolean) => {
    setSlotMemberIds((prev) =>
      checked
        ? [...new Set([...prev, memberId])]
        : prev.filter((idValue) => idValue !== memberId),
    );
  };

  const openEventDetail = (recordId: string) => {
    setSelectedEventId(recordId);
  };

  const saveTask = () => {
    if (!taskSlot) return;
    if (!slotProjectId) {
      setTaskFormError("Pilih proyek terlebih dahulu.");
      return;
    }
    const startsAt = new Date(`${slotStartDate}T${slotStartTime}:00+07:00`);
    const endsAt = new Date(`${slotEndDate}T${slotEndTime}:00+07:00`);
    if (
      !slotStartDate ||
      !slotStartTime ||
      !slotEndDate ||
      !slotEndTime ||
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      setTaskFormError("Periksa jadwal mulai dan selesai.");
      return;
    }
    setTaskFormError(null);
    startSavingTask(async () => {
      const result = await createWorkspaceTask({
        title: slotTitle,
        description: slotDescription,
        projectId: slotProjectId,
        assigneeId: slotAssigneeId === "none" ? "" : slotAssigneeId,
        memberIds: slotMemberIds,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        color: slotColor,
      });
      if (result.success) {
        toast.success(result.message);
        setTaskSlot(null);
        router.refresh();
      } else {
        setTaskFormError(result.message);
        toast.error(result.message);
      }
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    startDeletingEvent(async () => {
      try {
        const result = await deleteWorkspaceEvent(eventId);
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setSelectedEventId(null);
        router.refresh();
      } catch {
        toast.error("Agenda gagal dihapus. Silakan coba kembali.");
      }
    });
  };

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
        <div className="type-p3 border-r border-border px-2 py-3 text-muted-foreground">
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
                  className={`type-p3 block font-semibold ${
                    holidayName || isSunday ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {view === "day"
                    ? format(date, "EEEE", { locale: id })
                    : format(date, "EEE", { locale: id })}
                </span>
                <span
                  className={`type-p3 mt-0.5 block font-semibold ${
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
                  <span className="type-p3 mt-0.5 block truncate font-medium text-red-600 dark:text-red-400">
                    {holidayName}
                  </span>
                )}
              </span>
              <Badge variant="secondary" className="shrink-0">
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
          <div className="type-p3 flex h-10 items-center px-2 font-medium text-muted-foreground">
            Sepanjang hari
          </div>
          {Array.from({ length: 18 }, (_, index) => index + 6).map((hour) => (
            <div
              key={hour}
              className="type-p3 h-14 border-t border-border px-2 pt-1 text-muted-foreground"
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
                {allDayItems.slice(0, 3).map((item) => (
                  <CalendarEventPill
                    key={item.id}
                    item={item}
                    compact
                    activeDate={dateKey}
                    onOpenEvent={openEventDetail}
                  />
                ))}
                {allDayItems.length > 3 && (
                  <span className="type-p3 block px-1 text-muted-foreground">
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
                      onClick={() => openTaskSlot(dateKey, hour)}
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
                  const recordId = getCalendarRecordId(item);
                  const sharedClassName = `type-p3 absolute z-10 overflow-hidden rounded px-1.5 py-1 text-left font-semibold leading-tight text-white shadow-sm hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${item.color}`;
                  const sharedStyle = {
                    top: position.top,
                    height: position.height,
                    left: isSplit && index % 2 ? "calc(50% + 1px)" : 3,
                    right: isSplit
                      ? index % 2
                        ? 3
                        : "calc(50% + 1px)"
                      : 3,
                  };
                  const sharedTitle = `${item.title}${item.projectName ? ` · ${item.projectName}` : ""}`;
                  const inner = (
                    <>
                      <span className="block opacity-90">
                        {itemTime(item, dateKey)}
                      </span>
                      <span className="line-clamp-2 block">{item.title}</span>
                    </>
                  );
                  if (recordId) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={sharedTitle}
                        onClick={() => openEventDetail(recordId)}
                        className={sharedClassName}
                        style={sharedStyle}
                      >
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={item.id}
                      href={itemHref(item, dateKey)}
                      scroll={false}
                      title={sharedTitle}
                      className={sharedClassName}
                      style={sharedStyle}
                    >
                      {inner}
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
          <h2 className="type-h2">Kalender Proyek &amp; Operasional</h2>
          <p className="type-p2 text-muted-foreground">
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
            onClick={() => openTaskSlot(selectedDate, 9)}
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
              <h3 className="type-h3">Kalender</h3>
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
                aria-label="Bulan mini sebelumnya"
                onClick={() => navigate(addMonths(selected, -1), "month")}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <p className="type-h3 capitalize">
                {format(selected, "MMMM yyyy", { locale: id })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
                  className="type-p3 py-1 font-semibold text-muted-foreground"
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
                    className={`type-p3 relative mx-auto grid size-7 place-items-center rounded transition-colors ${
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
            <h3 className="type-h3">Kategori agenda</h3>
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
                    className={`type-p3 flex w-full items-center justify-between rounded px-2 py-2 text-left transition-colors ${
                      active
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground opacity-60 hover:bg-muted"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-sm ${category.color}`} />
                      {category.label}
                    </span>
                    <Badge variant="secondary">
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </CardBox>

          <CardBox className="space-y-3 p-4">
            <h3 className="type-h3">Agenda mendatang</h3>
            {upcomingItems.length ? (
              <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
                {upcomingItems.map((item) => {
                  const recordId = getCalendarRecordId(item);
                  const isProjectItem = isProjectScheduleItem(item);
                  return (
                    <div
                      key={item.id}
                      className="rounded border border-border border-l-2 p-2"
                      style={{
                        borderLeftColor: eventBorderColors[item.kind],
                      }}
                    >
                      {recordId ? (
                        <button
                          type="button"
                          onClick={() => openEventDetail(recordId)}
                          className="type-p3 line-clamp-2 text-left font-semibold hover:text-primary"
                        >
                          {item.title}
                        </button>
                      ) : (
                        <Link
                          href={itemHref(item)}
                          scroll={false}
                          className="type-p3 line-clamp-2 font-semibold hover:text-primary"
                        >
                          {item.title}
                        </Link>
                      )}
                      <p className="type-p3 mt-1 flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
                        <span>
                          {format(dateFromKey(item.date), "d MMM yyyy", {
                            locale: id,
                          })}
                          {item.endDate > item.date
                            ? ` – ${format(dateFromKey(item.endDate), "d MMM yyyy", { locale: id })}`
                            : null}
                        </span>
                        {item.time && (
                          <>
                            <Clock3 className="ml-1 size-3 shrink-0" aria-hidden="true" />
                            {itemTime(item)}
                          </>
                        )}
                      </p>
                      {item.projectName && (
                        <p className="type-p3 mt-1 truncate text-muted-foreground">
                          {item.projectName}
                        </p>
                      )}
                      <div className="type-p3 mt-2 flex flex-wrap gap-x-2 gap-y-1 font-medium">
                        {item.kind === "task" && item.projectId ? (
                          <Link
                            href={itemHref(item)}
                            scroll={false}
                            className="text-primary hover:underline"
                          >
                            Tugas harian
                          </Link>
                        ) : isProjectItem && item.projectId ? (
                          <Link
                            href={itemHref(item)}
                            className="text-primary hover:underline"
                          >
                            Buka proyek
                          </Link>
                        ) : recordId ? (
                          <button
                            type="button"
                            onClick={() => openEventDetail(recordId)}
                            className="text-primary hover:underline"
                          >
                            Lihat detail agenda
                          </button>
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
                  );
                })}
              </div>
            ) : (
              <EmptyState
                variant="inline"
                icon={CalendarDays}
                title="Belum ada agenda"
                description="Tidak ada agenda pada periode ini."
              />
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
                aria-label="Periode berikutnya"
                onClick={() => changePeriod(1)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <h3 className="type-h3 ml-1 capitalize">
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
                  onClick={() => navigate(selected, period)}
                >
                  {period === "day" ? (
                    <Clock3 className="mr-1.5 size-3.5" aria-hidden="true" />
                  ) : (
                    <CalendarDays className="mr-1.5 size-3.5" aria-hidden="true" />
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
                    className="type-p3 bg-primary px-2 py-2 text-center font-semibold text-primary-foreground"
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
                        className={`type-p3 grid size-7 place-items-center rounded-full font-semibold ${
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
                        {isToday && <Badge>Hari ini</Badge>}
                        <button
                          type="button"
                          onClick={() => onAddSchedule(dateKey)}
                          title={`Tambah agenda pada ${format(date, "d MMM yyyy", { locale: id })}`}
                          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-primary/15 hover:text-primary"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    {holidayName && visibleCategories.has("holiday") && (
                      <p
                        className="type-p3 mb-1 line-clamp-2 font-semibold leading-tight text-red-600 dark:text-red-400"
                        title={holidayName}
                      >
                        {holidayName}
                      </p>
                    )}
                    <div className="space-y-1">
                      {dayItems
                        .filter((item) => item.kind !== "holiday")
                        .slice(0, 3)
                        .map((item) => (
                          <CalendarEventPill
                            key={item.id}
                            item={item}
                            compact
                            activeDate={dateKey}
                            onOpenEvent={openEventDetail}
                          />
                        ))}
                      {dayItems.filter((item) => item.kind !== "holiday").length > 3 && (
                        <p className="type-p3 px-1 text-muted-foreground">
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
                className="type-p3 flex items-center gap-1.5 text-muted-foreground"
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
          setTaskFormError(null);
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
              size="sm"
              onClick={() => setTaskSlot(null)}
              disabled={isSavingTask}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="calendar-task-form"
              size="sm"
              disabled={isSavingTask || projects.length === 0}
            >
              {isSavingTask ? "Menyimpan..." : "Simpan Tugas"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {taskFormError && (
            <p
              role="alert"
              className="type-p3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-medium text-destructive"
            >
              {taskFormError}
            </p>
          )}
          <form
            id="calendar-task-form"
            key={`${taskSlot?.date ?? ""}-${taskSlot?.hour ?? ""}`}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveTask();
            }}
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="calendar-task-title">Nama Tugas Pekerjaan</Label>
              <Input
                id="calendar-task-title"
                value={slotTitle}
                onChange={(event) => setSlotTitle(event.target.value)}
                placeholder="Contoh: Pengecoran pondasi / Inspeksi lapangan"
                minLength={2}
                maxLength={160}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Proyek</Label>
              <Combobox
                options={projectOptions}
                value={slotProjectId}
                onValueChange={setSlotProjectId}
                placeholder="Pilih proyek"
                searchPlaceholder="Cari proyek..."
                emptyText="Proyek tidak ditemukan."
              />
            </div>
            <div className="space-y-2">
              <Label>Penanggung Jawab (Lead)</Label>
              <Select value={slotAssigneeId} onValueChange={setSlotAssigneeId}>
                <SelectTrigger aria-label="Penanggung Jawab (Lead)">
                  <SelectValue placeholder="Pilih lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa lead</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-task-start-date">Mulai (WIB)</Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <DatePicker
                    id="calendar-task-start-date"
                    value={slotStartDate}
                    onValueChange={setSlotStartDate}
                    placeholder="Tanggal mulai"
                  />
                </div>
                <Input
                  aria-label="Jam mulai (WIB)"
                  type="time"
                  value={slotStartTime}
                  onChange={(event) => setSlotStartTime(event.target.value)}
                  className="w-28 shrink-0"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-task-end-date">Selesai (WIB)</Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <DatePicker
                    id="calendar-task-end-date"
                    value={slotEndDate}
                    onValueChange={setSlotEndDate}
                    placeholder="Tanggal selesai"
                  />
                </div>
                <Input
                  aria-label="Jam selesai (WIB)"
                  type="time"
                  value={slotEndTime}
                  onChange={(event) => setSlotEndTime(event.target.value)}
                  className="w-28 shrink-0"
                  required
                />
              </div>
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="type-p3 font-semibold">Anggota Tim Terlibat</legend>
              <div className="grid max-h-28 gap-2 overflow-y-auto rounded-lg border border-input bg-muted/20 p-3 sm:grid-cols-2">
                {members.map((member) => {
                  const checkboxId = `calendar-member-${member.id}`;
                  return (
                    <div key={member.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={slotMemberIds.includes(member.id)}
                        onCheckedChange={(checked) =>
                          toggleSlotMember(member.id, checked === true)
                        }
                      />
                      <Label
                        htmlFor={checkboxId}
                        className="type-p3 cursor-pointer truncate font-normal"
                      >
                        {member.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="type-p3 font-semibold">Warna Label Tugas</legend>
              <RadioGroup
                value={slotColor}
                onValueChange={setSlotColor}
                className="flex flex-wrap gap-2"
              >
                {habitTaskColors.map((color) => {
                  const radioId = `calendar-task-color-${color.value}`;
                  const isSelected = slotColor === color.value;
                  return (
                    <div key={color.value} className="flex items-center">
                      <RadioGroupItem
                        id={radioId}
                        value={color.value}
                        aria-label={`Warna ${color.label}`}
                        className="sr-only"
                      />
                      <Label
                        htmlFor={radioId}
                        title={color.label}
                        className={`block size-7 cursor-pointer rounded-full ring-offset-2 transition ${color.className} ${
                          isSelected ? "ring-2 ring-primary" : ""
                        }`}
                      />
                    </div>
                  );
                })}
              </RadioGroup>
            </fieldset>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="calendar-task-description">Catatan (Opsional)</Label>
              <Textarea
                id="calendar-task-description"
                value={slotDescription}
                onChange={(event) => setSlotDescription(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Instruksi atau detail pekerjaan..."
                className="mt-0"
              />
            </div>
          </form>
        </div>
      </GlobalModal>
      <GlobalModal
        isOpen={selectedEvent !== null}
        onClose={() => {
          if (isDeletingEvent) return;
          setSelectedEventId(null);
        }}
        title={selectedEvent?.title ?? "Detail Agenda"}
        description={
          selectedEvent
            ? `${format(dateFromKey(selectedEvent.date), "EEEE, d MMMM yyyy", { locale: id })}${selectedEvent.endDate > selectedEvent.date ? ` – ${format(dateFromKey(selectedEvent.endDate), "EEEE, d MMMM yyyy", { locale: id })}` : ""} · ${selectedEvent.allDay ? "Sepanjang hari" : itemTime(selectedEvent)}`
            : undefined
        }
        className="sm:max-w-md"
        footer={
          selectedEvent ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedEventId(null)}
                disabled={isDeletingEvent}
              >
                Tutup
              </Button>
              {getCalendarRecordId(selectedEvent) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isDeletingEvent}
                  onClick={() => {
                    const recordId = getCalendarRecordId(selectedEvent);
                    if (recordId) handleDeleteEvent(recordId);
                  }}
                >
                  <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                  {isDeletingEvent ? "Menghapus..." : "Hapus Agenda"}
                </Button>
              )}
            </>
          ) : null
        }
      >
        {selectedEvent && (
          <div className="type-p2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${selectedEvent.color} text-white`}>
                {categories.find((c) => c.kind === selectedEvent.kind)?.label ??
                  "Agenda"}
              </Badge>
              {selectedEvent.projectId && selectedEvent.projectName && (
                <Link
                  href={`/apps/projects/${selectedEvent.projectId}`}
                  className="type-p3 inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium text-primary hover:bg-muted"
                >
                  {selectedEvent.projectCode
                    ? `${selectedEvent.projectCode} · `
                    : ""}
                  {selectedEvent.projectName}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </Link>
              )}
            </div>
            {selectedEvent.location && (
              <p className="type-p3 flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{selectedEvent.location}</span>
              </p>
            )}
            {selectedEvent.meetingUrl &&
              /^https?:\/\//i.test(selectedEvent.meetingUrl) && (
                <a
                  href={selectedEvent.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="type-p3 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Buka tautan rapat
                </a>
              )}
          </div>
        )}
      </GlobalModal>
    </div>
  );
}
