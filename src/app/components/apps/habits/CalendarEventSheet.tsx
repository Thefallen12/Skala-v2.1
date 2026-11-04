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
import { Label } from "@/components/ui/label";
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
      setMessage("Periksa tanggal dan waktu agenda.");
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
        onOpenChange(false);
        setMessage("");
        setAllDay(false);
      }}
      title="Tambah jadwal atau rapat"
      description="Jadwal akan tampil bersama agenda proyek dan tugas pada kalender."
      className="sm:max-w-xl"
    >
        <form
          className="space-y-4 px-4 pb-4"
          onSubmit={submit}
          key={`${open}:${selectedDate}`}
        >
          <div className="space-y-2">
            <Label htmlFor="calendar-event-title">Judul</Label>
            <Input
              id="calendar-event-title"
              name="title"
              minLength={2}
              maxLength={160}
              required
              disabled={isPending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-project">Proyek</Label>
              <select
                id="calendar-event-project"
                name="projectId"
                defaultValue=""
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              >
                <option value="">Agenda pribadi</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <Label
                htmlFor="calendar-event-all-day"
                className="cursor-pointer text-sm"
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
              <Label htmlFor="calendar-event-start-date">Tanggal mulai</Label>
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
            <div className="space-y-2">
              <Label htmlFor="calendar-event-end-date">Tanggal selesai</Label>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="calendar-event-type">Jenis agenda</Label>
              <select
                id="calendar-event-type"
                name="type"
                defaultValue={CalendarEventType.MEETING}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              >
                <option value={CalendarEventType.MEETING}>Rapat</option>
                <option value={CalendarEventType.DEADLINE}>Deadline</option>
                <option value={CalendarEventType.DELIVERY}>Pengiriman</option>
                <option value={CalendarEventType.PROJECT}>Pekerjaan proyek</option>
                <option value={CalendarEventType.OTHER}>Lainnya</option>
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
            <Label htmlFor="calendar-event-format">Format</Label>
            <select
              id="calendar-event-format"
              name="format"
              defaultValue={CalendarEventFormat.HYBRID}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={isPending}
            >
              <option value={CalendarEventFormat.HYBRID}>Hybrid</option>
              <option value={CalendarEventFormat.VIRTUAL}>Virtual</option>
              <option value={CalendarEventFormat.IN_PERSON}>Tatap muka</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-location">Lokasi</Label>
            <Input
              id="calendar-event-location"
              name="location"
              maxLength={300}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-url">Tautan rapat</Label>
            <Input
              id="calendar-event-url"
              name="meetingUrl"
              type="url"
              maxLength={500}
              placeholder="https://..."
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-participants">Peserta</Label>
            <select
              id="calendar-event-participants"
              name="participantIds"
              multiple
              className="min-h-28 w-full rounded-md border border-input bg-background p-2 text-sm"
              disabled={isPending}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.email}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Gunakan Ctrl (Windows) atau Command (Mac) untuk memilih beberapa.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-event-description">Catatan</Label>
            <textarea
              id="calendar-event-description"
              name="description"
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isPending}
            />
          </div>
          {message && (
            <p
              role={message.includes("berhasil") ? "status" : "alert"}
              className="text-sm text-muted-foreground"
            >
              {message}
            </p>
          )}
          <div className="flex justify-end gap-2">
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan jadwal"}
            </Button>
          </div>
        </form>
    </GlobalModal>
  );
}
