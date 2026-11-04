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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  dateFromKey,
  formatJakartaTime,
  getJakartaDateKey,
  getWeekDateKeys,
  isValidDateKey,
  shiftDateKey,
} from "@/lib/habit-date";

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
  const [allDay, setAllDay] = useState(false);
  const [message, setMessage] = useState<WorkspaceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
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
      `/apps/habits/schedule?date=${format(nextMonth, "yyyy-MM-01")}`,
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
        setIsDialogOpen(false);
        setAllDay(false);
        router.refresh();
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
    if (!window.confirm("Hapus agenda ini?")) return;
    startTransition(async () => {
      const result = await deleteWorkspaceEvent(eventId);
      setMessage(result);
      if (result.success) router.refresh();
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
          <h1 className="text-xl font-semibold">Schedule & meetings</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Agenda proyek, kalender tim, dan jam kerja per proyek.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setMessage(null);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
          Add schedule
        </Button>
      </div>
      {message && !isDialogOpen && (
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-3 py-3">
            <h2 className="text-sm font-semibold">Upcoming schedule</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {events.length} agenda bulan ini
            </p>
          </div>
          <div className="max-h-[580px] space-y-0 overflow-y-auto px-3">
            {events.map((event) => (
              <article key={event.id} className="relative border-l border-border py-3 pl-4">
                <span className="absolute -left-1 top-4 size-2 rounded-full bg-primary ring-4 ring-card" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold">
                      {format(new Date(event.startsAt), "MMM d", { locale: id })}
                    </p>
                    <h3 className="mt-1 break-words text-xs font-medium">{event.title}</h3>
                  </div>
                  {event.createdById === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label={`Hapus agenda ${event.title}`}
                      disabled={isPending}
                      onClick={() => onDeleteEvent(event.id)}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {event.project?.name ?? "My Events"} ·{" "}
                  {event.allDay
                    ? "All day"
                    : `${formatJakartaTime(new Date(event.startsAt))}${
                        event.endsAt
                          ? `–${formatJakartaTime(new Date(event.endsAt))}`
                          : ""
                      }`}
                </p>
                {(event.location ||
                  event.format !== CalendarEventFormat.HYBRID ||
                  (event.reminderMinutes !== null && event.isReminderSet)) && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                    <span>
                      {event.format === CalendarEventFormat.VIRTUAL
                        ? "Virtual"
                        : event.format === CalendarEventFormat.IN_PERSON
                          ? "Physical"
                          : "Hybrid"}
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
                        {event.reminderMinutes} min
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
                        className={`grid size-5 place-items-center rounded-full border border-card text-[7px] text-white ${
                          ["bg-info", "bg-primary", "bg-warning", "bg-success"][index]
                        }`}
                      >
                        {initials(user.name)}
                      </span>
                    ))}
                    {!event.participants.length && (
                      <span className="text-[9px] text-muted-foreground">{event.User.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isMeeting(event) && canSetReminder(event) && (
                      <Button
                        variant={event.isReminderSet ? "secondary" : "outline"}
                        size="sm"
                        className="h-6 px-1.5 text-[9px]"
                        onClick={() => onToggleReminder(event)}
                        disabled={isPending}
                        aria-pressed={event.isReminderSet}
                      >
                        <AlarmClock className="mr-1 size-3" />
                        {event.isReminderSet ? "Reminder on" : "Notify"}
                      </Button>
                    )}
                    {isMeeting(event) && event.meetingUrl && (
                      <Button asChild size="sm" className="h-6 px-1.5 text-[9px]">
                        <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                          Join <ArrowUpRight className="ml-1 size-3" />
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
                <p className="mt-2 text-xs text-muted-foreground">Belum ada jadwal bulan ini.</p>
              </div>
            )}
          </div>
        </CardBox>

        <CardBox className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="icon" className="size-7" aria-label="Bulan sebelumnya" onClick={() => onNavigateMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="text-xs font-semibold">{format(selected, "MMMM yyyy", { locale: id })}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7" aria-label="Bulan berikutnya" onClick={() => onNavigateMonth(1)}>
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => router.push(`/apps/habits/schedule?date=${today}`, { scroll: false })}>
                Hari ini
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
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
                    router.push(`/apps/habits/schedule?date=${dateKey}`, {
                      scroll: false,
                    })
                  }
                  className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded text-xs transition-colors ${
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
            <p className="text-[10px] text-muted-foreground">
              Terpilih: {format(selected, "d MMMM yyyy", { locale: id })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 w-full text-[10px]"
              onClick={() => {
                setMessage(null);
                setIsDialogOpen(true);
              }}
            >
              <Plus className="mr-1 size-3" /> Add schedule
            </Button>
          </div>
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Hours completed by projects</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
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
                <p className="mt-3 text-xs font-medium">Belum ada jam kerja untuk diplot.</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Tambahkan catatan di Timesheet untuk melihat tren per proyek.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/apps/habits/timesheet">Buka timesheet</Link>
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
        title="Create schedule"
        description="Buat jadwal proyek atau agenda pribadi, atur peserta, dan simpan preferensi pengingat."
        className="sm:max-w-lg"
      >
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
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onCreateEvent(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="workspace-event-title">Title</Label>
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
                <Label htmlFor="workspace-event-category">Category</Label>
                <select
                  id="workspace-event-category"
                  name="projectId"
                  defaultValue=""
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">My Events</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} — {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-between gap-2 rounded-md border border-input px-3 py-2">
                <Label htmlFor="workspace-event-all-day" className="cursor-pointer text-xs">
                  All day event
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
                <Label htmlFor="workspace-event-start-date">Starts at</Label>
                <Input
                  id="workspace-event-start-date"
                  name="startsDate"
                  type="date"
                  defaultValue={selectedDate}
                  required
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
                <Label htmlFor="workspace-event-end-date">Ends at</Label>
                <Input
                  id="workspace-event-end-date"
                  name="endsDate"
                  type="date"
                  defaultValue={selectedDate}
                  required
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
                <Label htmlFor="workspace-event-type">Jenis agenda</Label>
                <select
                  id="workspace-event-type"
                  name="type"
                  defaultValue={CalendarEventType.MEETING}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {eventTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-event-reminder">Notification</Label>
                <select
                  id="workspace-event-reminder"
                  name="reminderMinutes"
                  defaultValue="15"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Tidak ada pengingat</option>
                  <option value="5">5 menit sebelumnya</option>
                  <option value="10">10 menit sebelumnya</option>
                  <option value="15">15 menit sebelumnya</option>
                  <option value="30">30 menit sebelumnya</option>
                  <option value="60">1 jam sebelumnya</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-event-format">Event type</Label>
              <select
                id="workspace-event-format"
                name="format"
                defaultValue={CalendarEventFormat.HYBRID}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={CalendarEventFormat.HYBRID}>Hybrid</option>
                <option value={CalendarEventFormat.VIRTUAL}>Virtual</option>
                <option value={CalendarEventFormat.IN_PERSON}>Physical</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-event-url">Virtual · meeting link</Label>
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
              <Label htmlFor="workspace-event-location">Physical · location</Label>
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
                <legend className="text-sm font-medium">Add guests</legend>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form) onSendInvite(form);
                  }}
                >
                  <Send className="mr-1.5 size-3.5" />
                  Send E-vite
                </Button>
              </div>
              <div className="grid max-h-28 gap-2 overflow-y-auto rounded-md border border-input p-3 sm:grid-cols-2">
                {members.map((member) => (
                  <label key={member.id} className="flex min-w-0 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="participantIds"
                      value={member.id}
                      className="size-3.5 shrink-0 accent-primary"
                    />
                    <span className="truncate" title={member.email}>
                      {member.name}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Send E-vite membuka email baru untuk tamu terpilih. Pengiriman dilakukan dari aplikasi email Anda.
              </p>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="workspace-event-description">Add notes</Label>
              <textarea
                id="workspace-event-description"
                name="description"
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Preferensi pengingat tersimpan bersama jadwal; notifikasi otomatis belum dikirim aplikasi.
            </p>
            <DialogFooter className="border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                Discard
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
      </GlobalModal>
    </div>
  );
}
