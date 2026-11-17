"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarEventFormat,
  CalendarEventType,
} from "@prisma/client";
import { createWorkspaceEvent } from "@/app/actions/habit-workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type ProjectOption = { id: string; code: string; name: string };
type MemberOption = { id: string; name: string; email: string };

function parseJakartaDateTime(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function CalendarEventSheet({
  open,
  onOpenChange,
  selectedDate,
  projects,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  projects: ProjectOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<string>(CalendarEventType.MEETING);
  const [projectId, setProjectId] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startsDate, setStartsDate] = useState(selectedDate);
  const [endsDate, setEndsDate] = useState(selectedDate);
  const [startsTime, setStartsTime] = useState("09:00");
  const [endsTime, setEndsTime] = useState("10:00");
  const [formatMode, setFormatMode] = useState<string>(CalendarEventFormat.HYBRID);
  const [reminderMinutes, setReminderMinutes] = useState("15");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  const resetForm = (nextDate = selectedDate) => {
    setTitle("");
    setEventType(CalendarEventType.MEETING);
    setProjectId("");
    setAllDay(false);
    setStartsDate(nextDate);
    setEndsDate(nextDate);
    setStartsTime("09:00");
    setEndsTime("10:00");
    setFormatMode(CalendarEventFormat.HYBRID);
    setReminderMinutes("15");
    setLocation("");
    setMeetingUrl("");
    setParticipantIds([]);
    setDescription("");
  };

  const toggleParticipant = (memberId: string, checked: boolean) => {
    setParticipantIds((current) =>
      checked
        ? current.includes(memberId)
          ? current
          : [...current, memberId]
        : current.filter((id) => id !== memberId),
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const effectiveStartsDate = startsDate || selectedDate;
    const effectiveEndsDate = endsDate || effectiveStartsDate;
    const startsAt = parseJakartaDateTime(
      `${effectiveStartsDate}T${allDay ? "00:00" : startsTime}`,
    );
    const endsAt = parseJakartaDateTime(
      `${effectiveEndsDate}T${allDay ? "23:59" : endsTime}`,
    );
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      toast.error("Periksa kembali tanggal dan jam mulai/selesai agenda.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createWorkspaceEvent({
          title,
          description,
          type: eventType,
          format: formatMode,
          allDay,
          projectId,
          meetingUrl,
          location,
          reminderMinutes: reminderMinutes && reminderMinutes !== "NONE" ? Number(reminderMinutes) : null,
          participantIds,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        resetForm(selectedDate);
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Calendar event creation failed:", error);
        toast.error("Agenda gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const projectOptions = [
    { value: "", label: "Umum / Non-Proyek" },
    ...projects.map((project) => ({
      value: project.id,
      label: `${project.code} — ${project.name}`,
    })),
  ];

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        if (isPending) return;
        onOpenChange(false);
        resetForm(selectedDate);
      }}
      title="Tambah Jadwal atau Rapat"
      description="Jadwal ini otomatis tersinkronisasi dengan Kalender Proyek dan Tugas Harian."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm(selectedDate);
            }}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button type="submit" form="calendar-event-form" disabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan Jadwal"}
          </Button>
        </>
      }
    >
      <form
        id="calendar-event-form"
        className="space-y-4"
        onSubmit={submit}
        key={`${open}:${selectedDate}`}
      >
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
          <p className="type-p3 font-bold uppercase tracking-wider text-primary">
            1. Informasi &amp; Proyek Terkait
          </p>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-title">Judul Agenda / Rapat</Label>
            <Input
              id="calendar-event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Contoh: Rapat Koordinasi Mingguan Lapangan"
              minLength={2}
              maxLength={160}
              required
              disabled={isPending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-type">Kategori Agenda</Label>
              <Select
                value={eventType}
                onValueChange={setEventType}
                disabled={isPending}
              >
                <SelectTrigger id="calendar-event-type" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CalendarEventType.MEETING}>Rapat Koordinasi</SelectItem>
                  <SelectItem value={CalendarEventType.PROJECT}>Pekerjaan Proyek</SelectItem>
                  <SelectItem value={CalendarEventType.DEADLINE}>Tenggat / Deadline</SelectItem>
                  <SelectItem value={CalendarEventType.DELIVERY}>Pengiriman Material</SelectItem>
                  <SelectItem value={CalendarEventType.OTHER}>Agenda Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-project">Proyek Terkait</Label>
              <Combobox
                id="calendar-event-project"
                options={projectOptions}
                value={projectId}
                onValueChange={setProjectId}
                placeholder="Umum / Non-Proyek"
                searchPlaceholder="Cari proyek..."
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-p3 font-bold uppercase tracking-wider text-primary">
              2. Waktu Pelaksanaan (WIB)
            </p>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="calendar-event-all-day"
                className="type-p3 cursor-pointer font-medium"
              >
                Sepanjang hari
              </Label>
              <Switch
                id="calendar-event-all-day"
                checked={allDay}
                onCheckedChange={setAllDay}
                disabled={isPending}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-start-date">Mulai</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px]">
                <DatePicker
                  id="calendar-event-start-date"
                  value={startsDate || selectedDate}
                  onValueChange={setStartsDate}
                  disabled={isPending}
                />
                {!allDay && (
                  <Input
                    aria-label="Waktu mulai"
                    type="time"
                    value={startsTime}
                    onChange={(event) => setStartsTime(event.target.value)}
                    required
                    disabled={isPending}
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-end-date">Selesai</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px]">
                <DatePicker
                  id="calendar-event-end-date"
                  value={endsDate || selectedDate}
                  onValueChange={setEndsDate}
                  disabled={isPending}
                />
                {!allDay && (
                  <Input
                    aria-label="Waktu selesai"
                    type="time"
                    value={endsTime}
                    onChange={(event) => setEndsTime(event.target.value)}
                    required
                    disabled={isPending}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-format">Format Pelaksanaan</Label>
              <Select
                value={formatMode}
                onValueChange={setFormatMode}
                disabled={isPending}
              >
                <SelectTrigger id="calendar-event-format" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CalendarEventFormat.IN_PERSON}>Tatap Muka / Lapangan</SelectItem>
                  <SelectItem value={CalendarEventFormat.VIRTUAL}>Virtual / Daring</SelectItem>
                  <SelectItem value={CalendarEventFormat.HYBRID}>Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-reminder">Pengingat</Label>
              <Select
                value={reminderMinutes}
                onValueChange={setReminderMinutes}
                disabled={isPending}
              >
                <SelectTrigger id="calendar-event-reminder" className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Tanpa pengingat</SelectItem>
                  <SelectItem value="5">5 menit sebelumnya</SelectItem>
                  <SelectItem value="10">10 menit sebelumnya</SelectItem>
                  <SelectItem value="15">15 menit sebelumnya</SelectItem>
                  <SelectItem value="30">30 menit sebelumnya</SelectItem>
                  <SelectItem value="60">1 jam sebelumnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
          <p className="type-p3 font-bold uppercase tracking-wider text-primary">
            3. Lokasi, Peserta &amp; Catatan
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-location">Lokasi (Opsional)</Label>
              <Input
                id="calendar-event-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Contoh: Ruang Rapat / Lokasi Proyek"
                maxLength={300}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-url">Tautan Rapat (Opsional)</Label>
              <Input
                id="calendar-event-url"
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
                type="url"
                maxLength={500}
                placeholder="https://meet.google.com/..."
                disabled={isPending}
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="type-p3 font-semibold text-foreground">
              Peserta Rapat / Anggota Terlibat
            </legend>
            <div className="grid max-h-32 gap-2 overflow-y-auto rounded-lg border border-input bg-background p-3 sm:grid-cols-2">
              {members.map((member) => {
                const checked = participantIds.includes(member.id);
                const checkboxId = `event-participant-${member.id}`;
                return (
                  <Label
                    key={member.id}
                    htmlFor={checkboxId}
                    className="type-p3 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 font-medium hover:bg-muted/60"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      disabled={isPending}
                      onCheckedChange={(value) =>
                        toggleParticipant(member.id, value === true)
                      }
                    />
                    <span className="truncate">{member.name}</span>
                  </Label>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-description">Catatan / Pokok Bahasan</Label>
            <Textarea
              id="calendar-event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tuliskan agenda atau catatan penting..."
              maxLength={1000}
              rows={2}
              className="mt-0 bg-background"
              disabled={isPending}
            />
          </div>
        </div>
      </form>
    </GlobalModal>
  );
}
