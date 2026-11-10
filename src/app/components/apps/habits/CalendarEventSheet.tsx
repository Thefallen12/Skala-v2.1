"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarEventFormat,
  CalendarEventType,
} from "@prisma/client";
import { createWorkspaceEvent } from "@/app/actions/habit-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [allDay, setAllDay] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsDate = String(data.get("startsDate") ?? "");
    const endsDate = String(data.get("endsDate") ?? "");
    const startsTime = String(data.get("startsTime") ?? "");
    const endsTime = String(data.get("endsTime") ?? "");
    const startsAt = parseJakartaDateTime(
      `${startsDate}T${allDay ? "00:00" : startsTime}`,
    );
    const endsAt = parseJakartaDateTime(
      `${endsDate}T${allDay ? "23:59" : endsTime}`,
    );
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      setMessage("Periksa kembali tanggal dan jam mulai/selesai agenda.");
      return;
    }

    const reminderValue = String(data.get("reminderMinutes") ?? "");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createWorkspaceEvent({
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          type: String(data.get("type") ?? ""),
          format: String(data.get("format") ?? ""),
          allDay,
          projectId: String(data.get("projectId") ?? ""),
          meetingUrl: String(data.get("meetingUrl") ?? ""),
          location: String(data.get("location") ?? ""),
          reminderMinutes: reminderValue ? Number(reminderValue) : null,
          participantIds: data.getAll("participantIds").map(String),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
        setMessage(result.message);
        if (!result.success) return;
        form.reset();
        setAllDay(false);
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Calendar event creation failed:", error);
        setMessage("Agenda gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        if (isPending) return;
        onOpenChange(false);
        setMessage("");
        setAllDay(false);
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
              setMessage("");
              setAllDay(false);
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
        {message && (
          <p
            role={message.includes("berhasil") ? "status" : "alert"}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              message.includes("berhasil")
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {message}
          </p>
        )}

        {/* Bagian 1: Identitas & Jenis Agenda */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            1. Informasi &amp; Proyek Terkait
          </p>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-title">Judul Agenda / Rapat</Label>
            <Input
              id="calendar-event-title"
              name="title"
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
              <select
                id="calendar-event-type"
                name="type"
                defaultValue={CalendarEventType.MEETING}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              >
                <option value={CalendarEventType.MEETING}>Rapat Koordinasi</option>
                <option value={CalendarEventType.PROJECT}>Pekerjaan Proyek</option>
                <option value={CalendarEventType.DEADLINE}>Deadline / Tenggat</option>
                <option value={CalendarEventType.DELIVERY}>Pengiriman Material</option>
                <option value={CalendarEventType.OTHER}>Agenda Lainnya</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-project">Proyek Terkait</Label>
              <select
                id="calendar-event-project"
                name="projectId"
                defaultValue=""
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              >
                <option value="">Umum / Non-Proyek</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bagian 2: Waktu & Pengingat */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              2. Waktu Pelaksanaan (WIB)
            </p>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="calendar-event-all-day"
                className="cursor-pointer text-xs font-medium"
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
                <Input
                  id="calendar-event-start-date"
                  name="startsDate"
                  type="date"
                  defaultValue={selectedDate}
                  required
                  disabled={isPending}
                />
                {!allDay && (
                  <Input
                    aria-label="Waktu mulai"
                    name="startsTime"
                    type="time"
                    defaultValue="09:00"
                    required
                    disabled={isPending}
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-end-date">Selesai</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px]">
                <Input
                  id="calendar-event-end-date"
                  name="endsDate"
                  type="date"
                  defaultValue={selectedDate}
                  required
                  disabled={isPending}
                />
                {!allDay && (
                  <Input
                    aria-label="Waktu selesai"
                    name="endsTime"
                    type="time"
                    defaultValue="10:00"
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
              <select
                id="calendar-event-format"
                name="format"
                defaultValue={CalendarEventFormat.HYBRID}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              >
                <option value={CalendarEventFormat.IN_PERSON}>Tatap Muka / Lapangan</option>
                <option value={CalendarEventFormat.VIRTUAL}>Virtual / Online</option>
                <option value={CalendarEventFormat.HYBRID}>Hybrid</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-reminder">Pengingat</Label>
              <select
                id="calendar-event-reminder"
                name="reminderMinutes"
                defaultValue="15"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              >
                <option value="">Tanpa pengingat</option>
                <option value="5">5 menit sebelumnya</option>
                <option value="10">10 menit sebelumnya</option>
                <option value="15">15 menit sebelumnya</option>
                <option value="30">30 menit sebelumnya</option>
                <option value="60">1 jam sebelumnya</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bagian 3: Lokasi, Tautan & Peserta */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            3. Lokasi, Peserta &amp; Catatan
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-location">Lokasi (Opsional)</Label>
              <Input
                id="calendar-event-location"
                name="location"
                placeholder="Contoh: Ruang Rapat / Site Proyek"
                maxLength={300}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-event-url">Tautan Rapat (Opsional)</Label>
              <Input
                id="calendar-event-url"
                name="meetingUrl"
                type="url"
                maxLength={500}
                placeholder="https://meet.google.com/..."
                disabled={isPending}
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-foreground">
              Peserta Rapat / Anggota Terlibat
            </legend>
            <div className="grid max-h-32 gap-2 overflow-y-auto rounded-lg border border-input bg-background p-3 sm:grid-cols-2">
              {members.map((member) => (
                <FormLabel
                  key={member.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    name="participantIds"
                    value={member.id}
                    disabled={isPending}
                    className="size-3.5 accent-primary"
                  />
                  <span className="truncate font-medium">{member.name}</span>
                </FormLabel>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-description">Catatan / Pokok Bahasan</Label>
            <textarea
              id="calendar-event-description"
              name="description"
              placeholder="Tuliskan agenda atau catatan penting..."
              maxLength={1000}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isPending}
            />
          </div>
        </div>
      </form>
    </GlobalModal>
  );
}
