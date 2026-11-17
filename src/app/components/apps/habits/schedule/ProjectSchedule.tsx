"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ApexOptions } from "apexcharts";
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
  AlarmClock,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Send,
  Trash2,
  Video,
} from "lucide-react";
import {
  CalendarEventFormat,
  CalendarEventType,
} from "@prisma/client";
import {
  createWorkspaceEvent,
  deleteWorkspaceEvent,
  toggleWorkspaceEventReminder,
  type WorkspaceActionResult,
} from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  dateFromKey,
  formatJakartaTime,
  getJakartaDateKey,
  getWeekDateKeys,
  isValidDateKey,
  shiftDateKey,
} from "@/lib/habit-date";
import { habitWorkspaceUrl } from "@/lib/habit-workspace-routes";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type ProjectOption = { id: string; code: string; name: string };
type MemberOption = { id: string; name: string; email: string };
type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  startsAt: string;
  endsAt: string | null;
  projectId: string | null;
  meetingUrl: string | null;
  location: string | null;
  format: CalendarEventFormat;
  allDay: boolean;
  reminderMinutes: number | null;
  createdById: string;
  project: { name: string; code: string } | null;
  User: { name: string };
  participants: { user: Pick<MemberOption, "id" | "name"> }[];
  isReminderSet: boolean;
};
type WorkHour = {
  workDate: string;
  durationMinutes: number;
  projectId: string;
  project: ProjectOption;
};

function parseJakartaDateTime(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const eventTypes: { value: CalendarEventType; label: string }[] = [
  { value: CalendarEventType.MEETING, label: "Rapat" },
  { value: CalendarEventType.DEADLINE, label: "Deadline" },
  { value: CalendarEventType.DELIVERY, label: "Pengiriman" },
  { value: CalendarEventType.PROJECT, label: "Pekerjaan proyek" },
  { value: CalendarEventType.OTHER, label: "Lainnya" },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ProjectSchedule({
  today,
  selectedDate,
  currentUserId,
  projects,
  members,
  hours,
  events,
}: {
  today: string;
  selectedDate: string;
  currentUserId: string;
  projects: ProjectOption[];
  members: MemberOption[];
  hours: WorkHour[];
  events: EventRecord[];
}) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [eventProjectId, setEventProjectId] = useState("__NONE__");
  const [eventType, setEventType] = useState<string>(CalendarEventType.MEETING);
  const [reminderMinutes, setReminderMinutes] = useState("15");
  const [eventFormat, setEventFormat] = useState<string>(CalendarEventFormat.HYBRID);
  const [startsDateValue, setStartsDateValue] = useState(selectedDate);
  const [endsDateValue, setEndsDateValue] = useState(selectedDate);
  const [message, setMessage] = useState<WorkspaceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const openCreateModal = () => {
    setMessage(null);
    setAllDay(false);
    setEventProjectId("__NONE__");
    setEventType(CalendarEventType.MEETING);
    setReminderMinutes("15");
    setEventFormat(CalendarEventFormat.HYBRID);
    setStartsDateValue(selectedDate);
    setEndsDateValue(selectedDate);
    setIsDialogOpen(true);
  };
  const selected = dateFromKey(selectedDate);
  const monthStart = startOfMonth(selected);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(selected), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDates = getWeekDateKeys(selectedDate);
  const hoursByProject = useMemo(() => {
    const rows = new Map<string, { name: string; data: number[] }>();
    for (const entry of hours) {
      const row = rows.get(entry.projectId) ?? {
        name: entry.project.name,
        data: Array(7).fill(0) as number[],
      };
      const dayIndex = weekDates.indexOf(entry.workDate);
      if (dayIndex >= 0) row.data[dayIndex] += entry.durationMinutes / 60;
      rows.set(entry.projectId, row);
    }
    return [...rows.values()];
  }, [hours, weekDates]);
  const chartOptions: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: "#8291a2",
    },
    colors: ["#102a4d", "#e67e22", "#13deb9", "#fa896b", "#6d7781"],
    stroke: { curve: "straight", width: 2 },
    markers: { size: 2 },
    dataLabels: { enabled: false },
    grid: { borderColor: "rgba(124,143,172,0.14)", strokeDashArray: 3 },
    xaxis: {
      categories: weekDates.map((date) =>
        format(new Date(`${date}T12:00:00`), "MMM d", { locale: id }),
      ),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { min: 0, labels: { formatter: (value) => `${value}j` } },
    legend: { position: "bottom" },
    tooltip: { y: { formatter: (value) => `${value.toFixed(1)} jam` } },
  };
  const onNavigateMonth = (direction: -1 | 1) => {
    const nextMonth = addMonths(selected, direction);
    router.push(
      habitWorkspaceUrl("calendar", {
        date: format(nextMonth, "yyyy-MM-01"),
      }),
      { scroll: false },
    );
  };
  const onCreateEvent = (formData: FormData) => {
    const startsDate = String(formData.get("startsDate") ?? "");
    const endsDate = String(formData.get("endsDate") ?? "");
    const startsTime = String(formData.get("startsTime") ?? "");
    const endsTime = String(formData.get("endsTime") ?? "");
    const startsAtValue = `${startsDate}T${allDay ? "00:00" : startsTime}`;
    const endsAtValue = `${endsDate}T${allDay ? "23:59" : endsTime}`;
    const startsAt = parseJakartaDateTime(startsAtValue);
    const endsAt = parseJakartaDateTime(endsAtValue);
    if (
      !isValidDateKey(startsDate) ||
      !isValidDateKey(endsDate) ||
      (!allDay && (!startsTime || !endsTime)) ||
      !startsAt ||
      !endsAt ||
      endsAt <= startsAt
    ) {
      setMessage({ success: false, message: "Periksa tanggal dan waktu agenda." });
      return;
    }
    const reminderValue = String(formData.get("reminderMinutes") ?? "");
    startTransition(async () => {
      const result = await createWorkspaceEvent({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        type: String(formData.get("type") ?? ""),
        format: String(formData.get("format") ?? ""),
        allDay,
        projectId: String(formData.get("projectId") ?? ""),
        meetingUrl: String(formData.get("meetingUrl") ?? ""),
        location: String(formData.get("location") ?? ""),
        reminderMinutes: reminderValue ? Number(reminderValue) : null,
        participantIds: formData.getAll("participantIds").map(String),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? "",
      });
      setMessage(result);
      if (result.success) {
        toast.success(result.message || "Agenda tersimpan.");
        setIsDialogOpen(false);
        setAllDay(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };
  const onSendInvite = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    const guestEmails = formData
      .getAll("participantIds")
      .map(String)
      .map((id) => members.find((member) => member.id === id)?.email)
      .filter((email): email is string => Boolean(email));
    if (!guestEmails.length) {
      setMessage({
        success: false,
        message: "Pilih minimal satu tamu yang memiliki alamat email.",
      });
      return;
    }
    const title = String(formData.get("title") ?? "").trim();
    const startDate = String(formData.get("startsDate") ?? "");
    const startTime = String(formData.get("startsTime") ?? "");
    const meetingUrl = String(formData.get("meetingUrl") ?? "").trim();
    const notes = String(formData.get("description") ?? "").trim();
    const body = [
      `Undangan: ${title || "Jadwal baru"}`,
      `Waktu: ${allDay ? startDate : `${startDate} ${startTime} WIB`}`,
      meetingUrl ? `Tautan: ${meetingUrl}` : "",
      notes ? `Catatan: ${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const query = new URLSearchParams({
      subject: `Undangan: ${title || "Jadwal baru"}`,
      body,
    });
    window.location.href = `mailto:${guestEmails.join(",")}?${query.toString()}`;
  };
  const onDeleteEvent = (eventId: string) => {
    setDeleteTargetId(eventId);
  };
  const confirmDeleteEvent = () => {
    if (!deleteTargetId) return;
    const targetId = deleteTargetId;
    setDeleteTargetId(null);
    startTransition(async () => {
      const result = await deleteWorkspaceEvent(targetId);
      setMessage(result);
      if (result.success) {
        toast.success(result.message || "Agenda dihapus.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };
  const onToggleReminder = (event: EventRecord) => {
    startTransition(async () => {
      const result = await toggleWorkspaceEventReminder(
        event.id,
        !event.isReminderSet,
      );
      setMessage(result);
      if (result.success) router.refresh();
    });
  };
  const isMeeting = (event: EventRecord) =>
    event.type === CalendarEventType.MEETING;
  const canSetReminder = (event: EventRecord) =>
    event.createdById === currentUserId ||
    event.participants.some(({ user }) => user.id === currentUserId);

  return (
    <div className="my-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="type-h1">Jadwal &amp; Rapat</h1>
          <p className="type-p2 mt-1 text-muted-foreground">
            Agenda proyek, kalender tim, dan jam kerja per proyek.
          </p>
        </div>
        <Button
          size="sm"
          onClick={openCreateModal}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Tambah Jadwal
        </Button>
      </div>
      {message && !isDialogOpen && (
        <p
          role={message.success ? "status" : "alert"}
          className={`type-p3 rounded-md border px-3 py-2 ${
            message.success
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-3 py-3">
            <h2 className="type-h2">Jadwal Mendatang</h2>
            <p className="type-p3 mt-1 text-muted-foreground">
              {events.length} agenda bulan ini
            </p>
          </div>
          <div className="max-h-[580px] space-y-0 overflow-y-auto px-3">
            {events.map((event) => (
              <article key={event.id} className="relative border-l border-border py-3 pl-4">
                <span className="absolute -left-1 top-4 size-2 rounded-full bg-primary ring-4 ring-card" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="type-p3 font-semibold">
                      {format(new Date(event.startsAt), "MMM d", { locale: id })}
                    </p>
                    <h3 className="type-h3 mt-1 break-words">{event.title}</h3>
                  </div>
                  {event.createdById === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      data-compact="true"
                      className="size-7 shrink-0"
                      aria-label={`Hapus agenda ${event.title}`}
                      disabled={isPending}
                      onClick={() => onDeleteEvent(event.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="type-p3 mt-1 text-muted-foreground">
                  {event.project?.name ?? "Agenda Pribadi"} ·{" "}
                  {event.allDay
                    ? "Seharian"
                    : `${formatJakartaTime(new Date(event.startsAt))}${
                        event.endsAt
                          ? `–${formatJakartaTime(new Date(event.endsAt))}`
                          : ""
                      }`}
                </p>
                {(event.location ||
                  event.format !== CalendarEventFormat.HYBRID ||
                  (event.reminderMinutes !== null && event.isReminderSet)) && (
                  <p className="type-p3 mt-1 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                    <span>
                      {event.format === CalendarEventFormat.VIRTUAL
                        ? "Daring"
                        : event.format === CalendarEventFormat.IN_PERSON
                          ? "Tatap Muka"
                          : "Hibrida"}
                    </span>
                    {event.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {event.location}
                      </span>
                    )}
                    {event.reminderMinutes !== null && event.isReminderSet && (
                      <span className="inline-flex items-center gap-1">
                        <AlarmClock className="size-3" />
                        {event.reminderMinutes} mnt
                      </span>
                    )}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex -space-x-1">
                    {event.participants.slice(0, 4).map(({ user }, index) => (
                      <span
                        key={user.id}
                        title={user.name}
                        className={`type-p3 grid size-6 place-items-center rounded-full border border-card font-semibold text-white ${
                          ["bg-info", "bg-primary", "bg-warning", "bg-success"][index]
                        }`}
                      >
                        {initials(user.name)}
                      </span>
                    ))}
                    {!event.participants.length && (
                      <span className="type-p3 text-muted-foreground">{event.User.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isMeeting(event) && canSetReminder(event) && (
                      <Button
                        variant={event.isReminderSet ? "secondary" : "outline"}
                        size="sm"
                        data-compact="true"
                        className="h-7 px-2 text-xs"
                        onClick={() => onToggleReminder(event)}
                        disabled={isPending}
                        aria-pressed={event.isReminderSet}
                      >
                        <AlarmClock className="size-3" />
                        {event.isReminderSet ? "Pengingat Aktif" : "Ingatkan"}
                      </Button>
                    )}
                    {isMeeting(event) && event.meetingUrl && (
                      <Button asChild size="sm" data-compact="true" className="h-7 px-2 text-xs">
                        <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                          Gabung <ArrowUpRight className="size-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!events.length && (
              <div className="py-10 text-center">
                <CalendarDays className="mx-auto size-6 text-muted-foreground" />
                <p className="type-p2 mt-2 text-muted-foreground">Belum ada jadwal bulan ini.</p>
              </div>
            )}
          </div>
        </CardBox>

        <CardBox className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="icon" data-compact="true" className="size-8" aria-label="Bulan sebelumnya" onClick={() => onNavigateMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="type-h3">{format(selected, "MMMM yyyy", { locale: id })}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" data-compact="true" className="size-8" aria-label="Bulan berikutnya" onClick={() => onNavigateMonth(1)}>
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" size="sm" data-compact="true" className="h-8 px-2.5 text-xs" onClick={() => router.push(habitWorkspaceUrl("calendar", { date: today }), { scroll: false })}>
                Hari ini
              </Button>
            </div>
          </div>
          <div className="type-p3 grid grid-cols-7 text-center font-semibold text-muted-foreground">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
              <span key={day} className="py-1.5">{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const isSelected = dateKey === selectedDate;
              const hasEvent = events.some(
                (event) => getJakartaDateKey(new Date(event.startsAt)) === dateKey,
              );
              return (
                <button
                  key={dateKey}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    router.push(habitWorkspaceUrl("calendar", { date: dateKey }), {
                      scroll: false,
                    })
                  }
                  className={`type-p3 flex min-h-10 flex-col items-center justify-center gap-1 rounded transition-colors ${
                    isSelected
                      ? "bg-warning/20 text-warning"
                      : !isSameMonth(day, selected)
                        ? "text-muted-foreground/40"
                        : "hover:bg-muted"
                  }`}
                >
                  {format(day, "d")}
                  <span className={`size-1 rounded-full ${hasEvent ? "bg-primary" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
          <div className="border-t border-border pt-3">
            <p className="type-p3 text-muted-foreground">
              Terpilih: {format(selected, "d MMMM yyyy", { locale: id })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={openCreateModal}
            >
              <Plus className="size-3.5" /> Tambah Jadwal
            </Button>
          </div>
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="type-h2">Jam Kerja per Proyek</h2>
            <p className="type-p3 mt-1 text-muted-foreground">
              Timesheet mingguan · {format(new Date(`${weekDates[0]}T12:00:00`), "d MMM", { locale: id })} –{" "}
              {format(new Date(`${weekDates[6]}T12:00:00`), "d MMM", { locale: id })}
            </p>
          </div>
          {hoursByProject.length ? (
            <div className="p-2 sm:p-3">
              <Chart
                options={chartOptions}
                series={hoursByProject}
                type="line"
                height={320}
                width="100%"
              />
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center px-5 text-center">
              <div>
                <Clock3 className="mx-auto size-7 text-muted-foreground" />
                <p className="type-p2 mt-3 font-medium">Belum ada jam kerja untuk diplot.</p>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Tambahkan catatan di Timesheet untuk melihat tren per proyek.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={habitWorkspaceUrl("timesheet", {})}>Buka Timesheet</Link>
                </Button>
              </div>
            </div>
          )}
        </CardBox>
      </div>

      <GlobalModal
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setAllDay(false);
        }}
        title="Buat Jadwal"
        description="Buat jadwal proyek atau agenda pribadi, atur peserta, dan simpan pengingat."
        className="sm:max-w-lg"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button type="submit" form="workspace-event-form" disabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        }
      >
        {message && (
          <p
            role={message.success ? "status" : "alert"}
            className={`type-p3 rounded-md border px-3 py-2 ${
              message.success
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {message.message}
          </p>
        )}
        <form
          id="workspace-event-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateEvent(new FormData(event.currentTarget));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="workspace-event-title">Judul Agenda</Label>
            <Input
              id="workspace-event-title"
              name="title"
              minLength={2}
              maxLength={160}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workspace-event-category">Kategori Proyek</Label>
              <input
                type="hidden"
                name="projectId"
                value={eventProjectId === "__NONE__" ? "" : eventProjectId}
              />
              <Select value={eventProjectId} onValueChange={setEventProjectId}>
                <SelectTrigger id="workspace-event-category">
                  <SelectValue placeholder="Pilih kategori proyek" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Agenda Pribadi</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code} — {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-between gap-2 rounded-md border border-input px-3 py-2">
              <Label htmlFor="workspace-event-all-day" className="type-p2 cursor-pointer">
                Acara Seharian
              </Label>
              <Switch
                id="workspace-event-all-day"
                aria-label="Acara sepanjang hari"
                checked={allDay}
                onCheckedChange={setAllDay}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workspace-event-start-date">Mulai</Label>
              <input type="hidden" name="startsDate" value={startsDateValue} />
              <DatePicker
                id="workspace-event-start-date"
                value={startsDateValue}
                onValueChange={(val) => setStartsDateValue(val || selectedDate)}
              />
              {!allDay && (
                <Input
                  aria-label="Waktu mulai"
                  name="startsTime"
                  type="time"
                  defaultValue="09:00"
                  required
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-event-end-date">Selesai</Label>
              <input type="hidden" name="endsDate" value={endsDateValue} />
              <DatePicker
                id="workspace-event-end-date"
                value={endsDateValue}
                onValueChange={(val) => setEndsDateValue(val || selectedDate)}
              />
              {!allDay && (
                <Input
                  aria-label="Waktu selesai"
                  name="endsTime"
                  type="time"
                  defaultValue="10:00"
                  required
                />
              )}
            </div>
          </div>

          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className="space-y-2">
              <Label htmlFor="workspace-event-type">Jenis Agenda</Label>
              <input type="hidden" name="type" value={eventType} />
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="workspace-event-type">
                  <SelectValue placeholder="Pilih jenis agenda" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-event-reminder">Pengingat</Label>
              <input
                type="hidden"
                name="reminderMinutes"
                value={reminderMinutes === "__NONE__" ? "" : reminderMinutes}
              />
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger id="workspace-event-reminder">
                  <SelectValue placeholder="Pilih pengingat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Tidak ada pengingat</SelectItem>
                  <SelectItem value="5">5 menit sebelumnya</SelectItem>
                  <SelectItem value="10">10 menit sebelumnya</SelectItem>
                  <SelectItem value="15">15 menit sebelumnya</SelectItem>
                  <SelectItem value="30">30 menit sebelumnya</SelectItem>
                  <SelectItem value="60">1 jam sebelumnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-event-format">Format Acara</Label>
            <input type="hidden" name="format" value={eventFormat} />
            <Select value={eventFormat} onValueChange={setEventFormat}>
              <SelectTrigger id="workspace-event-format">
                <SelectValue placeholder="Pilih format acara" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CalendarEventFormat.HYBRID}>Hibrida</SelectItem>
                <SelectItem value={CalendarEventFormat.VIRTUAL}>Daring</SelectItem>
                <SelectItem value={CalendarEventFormat.IN_PERSON}>Tatap Muka</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-event-url">Tautan Rapat Daring</Label>
            <div className="relative">
              <Video className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="workspace-event-url"
                name="meetingUrl"
                type="url"
                maxLength={500}
                placeholder="https://..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-event-location">Lokasi Pertemuan</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="workspace-event-location"
                name="location"
                maxLength={300}
                placeholder="Tambahkan lokasi"
                className="pl-9"
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <legend className="type-p1 font-medium">Undang Peserta</legend>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (form) onSendInvite(form);
                }}
              >
                <Send className="size-3.5" />
                Kirim Undangan
              </Button>
            </div>
            <div className="grid max-h-28 gap-2 overflow-y-auto rounded-md border border-input p-3 sm:grid-cols-2">
              {members.map((member) => (
                <FormLabel key={member.id} className="type-p3 flex min-w-0 cursor-pointer items-center gap-2">
                  <Checkbox
                    name="participantIds"
                    value={member.id}
                    className="shrink-0"
                  />
                  <span className="truncate" title={member.email}>
                    {member.name}
                  </span>
                </FormLabel>
              ))}
            </div>
            <p className="type-p3 text-muted-foreground">
              Kirim Undangan membuka email Anda untuk tamu terpilih.
            </p>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="workspace-event-description">Catatan</Label>
            <Textarea
              id="workspace-event-description"
              name="description"
              rows={3}
              maxLength={1000}
            />
          </div>
          <p className="type-p3 text-muted-foreground">
            Preferensi pengingat tersimpan bersama jadwal.
          </p>
        </form>
      </GlobalModal>

      <AlertDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Agenda ini akan dihapus permanen dari jadwal tim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteEvent}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
