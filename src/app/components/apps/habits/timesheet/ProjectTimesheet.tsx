"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import {
  createTimesheetEntry,
  deleteTimesheetEntry,
  type WorkspaceActionResult,
} from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import { TablePaginationControls } from "@/components/ui/table";
import { getWeekDateKeys, shiftDateKey } from "@/lib/habit-date";

type ProjectOption = { id: string; code: string; name: string };
type MemberOption = { id: string; name: string; role: string };
type EntryRecord = {
  id: string;
  workDate: string;
  durationMinutes: number;
  note: string | null;
  userId: string;
  projectId: string;
  user: MemberOption;
  project: Pick<ProjectOption, "name" | "code">;
};
type EntryRow = {
  key: string;
  userId: string;
  user: MemberOption;
  project: Pick<ProjectOption, "name" | "code">;
  minutes: number[];
  entryIds: string[];
  notes: string[];
};

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
}

export default function ProjectTimesheet({
  today,
  selectedDate,
  timeframe,
  initialMemberId,
  initialTeam,
  initialProjectId,
  currentUserId,
  canViewAll,
  projects,
  members,
  entries,
  onFiltersChange,
}: {
  today: string;
  selectedDate: string;
  timeframe: number;
  initialMemberId: string;
  initialTeam: string;
  initialProjectId: string;
  currentUserId: string;
  canViewAll: boolean;
  projects: ProjectOption[];
  members: MemberOption[];
  entries: EntryRecord[];
  onFiltersChange: (filters: {
    memberId: string;
    team: string;
    projectId: string;
  }) => void;
}) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [message, setMessage] = useState<WorkspaceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [memberFilter, setMemberFilter] = useState(initialMemberId);
  const [teamFilter, setTeamFilter] = useState(initialTeam);
  const [projectFilter, setProjectFilter] = useState(initialProjectId);
  const dates = useMemo(() => {
    const startDate =
      timeframe === 7
        ? getWeekDateKeys(selectedDate)[0]
        : shiftDateKey(selectedDate, 1 - timeframe);
    return Array.from({ length: timeframe }, (_, index) =>
      shiftDateKey(startDate, index),
    );
  }, [selectedDate, timeframe]);
  const filteredEntries = entries.filter(
    (entry) =>
      (memberFilter === "all" || entry.userId === memberFilter) &&
      (teamFilter === "all" || entry.user.role === teamFilter) &&
      (projectFilter === "all" || entry.projectId === projectFilter),
  );
  const grouped = useMemo(() => {
    const rows = new Map<string, EntryRow>();
    for (const entry of filteredEntries) {
      const key = `${entry.projectId}:${entry.userId}`;
      const row = rows.get(key) ?? {
        key,
        userId: entry.userId,
        user: entry.user,
        project: entry.project,
        minutes: Array(timeframe).fill(0) as number[],
        entryIds: [],
        notes: [],
      };
      const dayIndex = dates.indexOf(entry.workDate);
      if (dayIndex >= 0) row.minutes[dayIndex] += entry.durationMinutes;
      row.entryIds.push(entry.id);
      if (entry.note) row.notes.push(entry.note);
      rows.set(key, row);
    }
    return [...rows.values()].sort(
      (left, right) =>
        right.minutes.reduce((total, item) => total + item, 0) -
        left.minutes.reduce((total, item) => total + item, 0),
    );
  }, [dates, filteredEntries, timeframe]);
  const rowsPerPage = 5;
  const visibleRows = grouped.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const totalMinutes = filteredEntries.reduce(
    (total, entry) => total + entry.durationMinutes,
    0,
  );
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const currentFilters = new URLSearchParams({
    tab: "timesheet",
    date: selectedDate,
    timeframe: String(timeframe),
    memberId: memberFilter,
    team: teamFilter,
    projectId: projectFilter,
  });
  const summaryHref = `/apps/habits?${currentFilters.toString()}`;
  const timesheetHref = (date: string, range = timeframe) => {
    const params = new URLSearchParams({
      tab: "timesheet",
      date,
      timeframe: String(range),
      memberId: memberFilter,
      team: teamFilter,
      projectId: projectFilter,
    });
    return `/apps/habits?${params.toString()}`;
  };

  const navigatePeriod = (offset: -1 | 1) => {
    setPage(1);
    router.push(
      timesheetHref(shiftDateKey(selectedDate, offset * timeframe)),
      { scroll: false },
    );
  };
  const changeTimeframe = (value: string) => {
    setPage(1);
    router.push(timesheetHref(selectedDate, Number(value)), { scroll: false });
  };
  const onCreateEntry = (formData: FormData) => {
    startTransition(async () => {
      const hours = Number(formData.get("hours") ?? 0);
      const minutes = Number(formData.get("minutes") ?? 0);
      const durationMinutes = Math.round(hours * 60) + minutes;
      const result = await createTimesheetEntry({
        projectId: String(formData.get("projectId") ?? ""),
        date: String(formData.get("workDate") ?? ""),
        durationMinutes,
        note: String(formData.get("note") ?? ""),
      });
      setMessage(result);
      if (result.success) {
        setIsDialogOpen(false);
        router.refresh();
      }
    });
  };
  const onDeleteEntry = (entryId: string) => {
    if (!window.confirm("Hapus catatan jam kerja ini?")) return;
    startTransition(async () => {
      const result = await deleteTimesheetEntry(entryId);
      setMessage(result);
      if (result.success) router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {message && (
        <p
          role={message.success ? "status" : "alert"}
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            message.success
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}
      <CardBox className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold">Tabel Timesheet Proyek</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Periode {format(new Date(`${startDate}T12:00:00`), "d MMM", { locale: id })} –{" "}
              {format(new Date(`${endDate}T12:00:00`), "d MMM yyyy", { locale: id })}
              {" · "}Total tercatat: <strong className="text-foreground">{formatDuration(totalMinutes)} jam</strong>
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            disabled={!projects.length}
          >
            <Plus className="mr-1.5 size-4" />
            Catat Jam Kerja
          </Button>
        </div>

        {/* Filter Bar & Navigasi Periode */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter anggota"
              value={memberFilter}
              onChange={(event) => {
                const memberId = event.target.value;
                setMemberFilter(memberId);
                onFiltersChange({
                  memberId,
                  team: teamFilter,
                  projectId: projectFilter,
                });
                setPage(1);
              }}
              className="h-9 max-w-44 rounded-lg border border-input bg-background px-2.5 text-xs"
            >
              {canViewAll && <option value="all">Semua Anggota</option>}
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter divisi"
              value={teamFilter}
              onChange={(event) => {
                const team = event.target.value;
                setTeamFilter(team);
                onFiltersChange({
                  memberId: memberFilter,
                  team,
                  projectId: projectFilter,
                });
                setPage(1);
              }}
              className="h-9 max-w-40 rounded-lg border border-input bg-background px-2.5 text-xs"
            >
              <option value="all">Semua Divisi</option>
              {[...new Set(members.map(({ role }) => role))].map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter proyek"
              value={projectFilter}
              onChange={(event) => {
                const projectId = event.target.value;
                setProjectFilter(projectId);
                onFiltersChange({
                  memberId: memberFilter,
                  team: teamFilter,
                  projectId,
                });
                setPage(1);
              }}
              className="h-9 max-w-48 rounded-lg border border-input bg-background px-2.5 text-xs"
            >
              <option value="all">Semua Proyek</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Rentang waktu"
              value={String(timeframe)}
              onChange={(event) => changeTimeframe(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs"
            >
              <option value="7">7 Hari</option>
              <option value="14">14 Hari</option>
              <option value="30">30 Hari</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Periode sebelumnya"
              className="size-8"
              onClick={() => navigatePeriod(-1)}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => router.push(timesheetHref(today), { scroll: false })}
            >
              Hari Ini
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Periode berikutnya"
              className="size-8"
              onClick={() => navigatePeriod(1)}
            >
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="app-data-table min-w-[850px] text-xs">
            <thead>
              <tr className="bg-muted/30 text-left">
                <th className="min-w-44 px-3 py-2.5 font-semibold">Proyek &amp; Personel</th>
                {dates.map((date) => (
                  <th
                    key={date}
                    className="min-w-[68px] px-1.5 py-2.5 text-center font-medium"
                  >
                    {format(new Date(`${date}T12:00:00`), "EEE, d MMM", {
                      locale: id,
                    })}
                  </th>
                ))}
                <th className="min-w-16 px-3 py-2.5 text-right font-semibold">Total</th>
                <th className="w-10 px-2 py-2.5" aria-label="Tindakan" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const total = row.minutes.reduce(
                  (sum, minutes) => sum + minutes,
                  0,
                );
                const ownedEntry =
                  row.userId === currentUserId ? row.entryIds[0] : null;
                return (
                  <tr key={row.key} className="border-t border-border">
                    <td className="max-w-52 px-3 py-2.5">
                      <p className="truncate font-semibold" title={row.project.name}>
                        {row.project.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {canViewAll ? `${row.user.name} · ` : ""}
                        {row.project.code}
                      </p>
                      {row.notes.length > 0 && (
                        <p
                          className="mt-0.5 truncate text-[11px] text-muted-foreground"
                          title={row.notes.join(" · ")}
                        >
                          {row.notes.join(" · ")}
                        </p>
                      )}
                    </td>
                    {row.minutes.map((minutes, index) => (
                      <td
                        key={`${row.key}-${dates[index]}`}
                        className="whitespace-nowrap px-1.5 py-2.5 text-center"
                      >
                        {minutes ? (
                          <span className="inline-block rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                            {formatDuration(minutes)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold">
                      {formatDuration(total)}
                    </td>
                    <td className="px-2 py-1.5">
                      {ownedEntry && (
                        <ActionIconButton
                          label={`Hapus satu catatan jam kerja untuk ${row.project.name}`}
                          tooltip="Hapus satu catatan jam kerja"
                          icon={Trash2}
                          className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          disabled={isPending}
                          onClick={() => onDeleteEntry(ownedEntry)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {!visibleRows.length && (
                <tr>
                  <td
                    colSpan={dates.length + 3}
                    className="p-10 text-center text-muted-foreground"
                  >
                    Belum ada catatan jam kerja pada rentang waktu ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePaginationControls
          count={grouped.length}
          pageSize={rowsPerPage}
          page={page}
          itemLabel="baris"
          onPageChange={setPage}
        />
      </CardBox>

      <GlobalModal
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Catat Jam Kerja (Timesheet)"
        description="Catat realisasi durasi kerja harian Anda pada proyek terkait."
        className="sm:max-w-lg"
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
              form="timesheet-entry-form"
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Simpan Jam Kerja"}
            </Button>
          </>
        }
      >
        <form
          id="timesheet-entry-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateEntry(new FormData(event.currentTarget));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="timesheet-project">Proyek</Label>
            <select
              id="timesheet-project"
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
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Preset Durasi Cepat:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "1 Jam", h: 1, m: 0 },
                { label: "2 Jam", h: 2, m: 0 },
                { label: "4 Jam (½ Hari)", h: 4, m: 0 },
                { label: "8 Jam (1 Hari)", h: 8, m: 0 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const hInput = document.getElementById(
                      "timesheet-hours",
                    ) as HTMLInputElement | null;
                    const mInput = document.getElementById(
                      "timesheet-minutes",
                    ) as HTMLInputElement | null;
                    if (hInput) hInput.value = String(preset.h);
                    if (mInput) mInput.value = String(preset.m);
                  }}
                  className="rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-center text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="timesheet-date">Tanggal Kerja</Label>
              <Input
                id="timesheet-date"
                name="workDate"
                type="date"
                defaultValue={selectedDate}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timesheet-hours">Durasi (Jam)</Label>
              <Input
                id="timesheet-hours"
                name="hours"
                type="number"
                min={0}
                max={24}
                defaultValue={2}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timesheet-minutes">Durasi (Menit)</Label>
              <Input
                id="timesheet-minutes"
                name="minutes"
                type="number"
                min={0}
                max={59}
                defaultValue={0}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timesheet-note">Deskripsi Pekerjaan / Catatan</Label>
            <Input
              id="timesheet-note"
              name="note"
              placeholder="Contoh: Pengawasan pengecoran & opname lapangan"
              maxLength={500}
            />
          </div>
        </form>
      </GlobalModal>
    </div>
  );
}
