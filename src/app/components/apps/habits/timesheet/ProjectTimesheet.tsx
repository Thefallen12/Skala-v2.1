"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import {
  createTimesheetEntry,
  deleteTimesheetEntry,
} from "@/app/actions/habit-workspace";
import CardBox from "@/app/components/shared/CardBox";
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
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePaginationControls,
  TableRow,
} from "@/components/ui/table";
import { getWeekDateKeys, shiftDateKey } from "@/lib/habit-date";

const roleLabels: Record<string, string> = {
  DIRECTOR: "Direktur",
  DEPUTY_DIRECTOR: "Wakil Direktur",
  DRAFTER: "Drafter",
  FINANCE: "Keuangan",
  LOGISTICS: "Logistik",
  KOORDINATOR: "Koordinator",
  FIELD_TEAM: "Tim Lapangan",
  MOVER: "Mover",
  ADMINISTRATIONS: "Administrasi",
};

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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [memberFilter, setMemberFilter] = useState(initialMemberId);
  const [teamFilter, setTeamFilter] = useState(initialTeam);
  const [projectFilter, setProjectFilter] = useState(initialProjectId);
  const [entryProjectId, setEntryProjectId] = useState(projects[0]?.id ?? "");
  const [entryDate, setEntryDate] = useState(selectedDate);
  const [entryHours, setEntryHours] = useState("2");
  const [entryMinutes, setEntryMinutes] = useState("0");
  const [entryNote, setEntryNote] = useState("");
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
  const onCreateEntry = () => {
    startTransition(async () => {
      const hours = Number(entryHours || 0);
      const minutes = Number(entryMinutes || 0);
      const durationMinutes = Math.round(hours * 60) + minutes;
      const result = await createTimesheetEntry({
        projectId: entryProjectId,
        date: entryDate,
        durationMinutes,
        note: entryNote,
      });
      if (result.success) {
        toast.success(result.message);
        setIsDialogOpen(false);
        setEntryHours("2");
        setEntryMinutes("0");
        setEntryNote("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };
  const confirmDeleteEntry = () => {
    if (!deleteTargetId) return;
    startTransition(async () => {
      const result = await deleteTimesheetEntry(deleteTargetId);
      if (result.success) {
        toast.success(result.message);
        setDeleteTargetId(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: `${project.code} — ${project.name}`,
  }));

  return (
    <div className="space-y-3">
      <CardBox className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="type-h2 text-foreground">Tabel Timesheet Proyek</h2>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Periode {format(new Date(`${startDate}T12:00:00`), "d MMM", { locale: id })} –{" "}
              {format(new Date(`${endDate}T12:00:00`), "d MMM yyyy", { locale: id })}
              {" · "}Total tercatat: <strong className="text-foreground">{formatDuration(totalMinutes)} jam</strong>
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEntryProjectId(projects[0]?.id ?? "");
              setEntryDate(selectedDate);
              setIsDialogOpen(true);
            }}
            disabled={!projects.length}
          >
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Catat Jam Kerja
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={memberFilter}
              onValueChange={(memberId) => {
                setMemberFilter(memberId);
                onFiltersChange({
                  memberId,
                  team: teamFilter,
                  projectId: projectFilter,
                });
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter anggota" className="w-44 bg-background">
                <SelectValue placeholder="Pilih anggota" />
              </SelectTrigger>
              <SelectContent>
                {canViewAll && <SelectItem value="all">Semua Anggota</SelectItem>}
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={teamFilter}
              onValueChange={(team) => {
                setTeamFilter(team);
                onFiltersChange({
                  memberId: memberFilter,
                  team,
                  projectId: projectFilter,
                });
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter divisi" className="w-40 bg-background">
                <SelectValue placeholder="Semua Divisi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Divisi</SelectItem>
                {[...new Set(members.map(({ role }) => role))].map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabels[role] ?? role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={projectFilter}
              onValueChange={(projectId) => {
                setProjectFilter(projectId);
                onFiltersChange({
                  memberId: memberFilter,
                  team: teamFilter,
                  projectId,
                });
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter proyek" className="w-48 bg-background">
                <SelectValue placeholder="Semua Proyek" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Proyek</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(timeframe)}
              onValueChange={changeTimeframe}
            >
              <SelectTrigger aria-label="Rentang waktu" className="w-32 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Hari</SelectItem>
                <SelectItem value="14">14 Hari</SelectItem>
                <SelectItem value="30">30 Hari</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Periode sebelumnya"
              onClick={() => navigatePeriod(-1)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(timesheetHref(today), { scroll: false })}
            >
              Hari Ini
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Periode berikutnya"
              onClick={() => navigatePeriod(1)}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        {visibleRows.length ? (
          <div className="p-3 sm:p-4">
            <Table pagination={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Proyek &amp; Personel</TableHead>
                  {dates.map((date) => (
                    <TableHead
                      key={date}
                      className="min-w-[68px] text-center"
                    >
                      {format(new Date(`${date}T12:00:00`), "EEE, d MMM", {
                        locale: id,
                      })}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-16 text-right">Total</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Tindakan</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const total = row.minutes.reduce(
                    (sum, minutes) => sum + minutes,
                    0,
                  );
                  const ownedEntry =
                    row.userId === currentUserId ? row.entryIds[0] : null;
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-52 whitespace-normal">
                        <p className="type-p2 truncate font-semibold" title={row.project.name}>
                          {row.project.name}
                        </p>
                        <p className="type-p3 truncate text-muted-foreground">
                          {canViewAll ? `${row.user.name} · ` : ""}
                          {row.project.code}
                        </p>
                        {row.notes.length > 0 && (
                          <p
                            className="type-p3 mt-0.5 truncate text-muted-foreground"
                            title={row.notes.join(" · ")}
                          >
                            {row.notes.join(" · ")}
                          </p>
                        )}
                      </TableCell>
                      {row.minutes.map((minutes, index) => (
                        <TableCell
                          key={`${row.key}-${dates[index]}`}
                          className="type-p3 whitespace-nowrap text-center"
                        >
                          {minutes ? (
                            <span className="inline-block rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                              {formatDuration(minutes)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="type-p2 whitespace-nowrap text-right font-bold tabular-nums">
                        {formatDuration(total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {ownedEntry && (
                          <ActionIconButton
                            label={`Hapus satu catatan jam kerja untuk ${row.project.name}`}
                            tooltip="Hapus satu catatan jam kerja"
                            icon={Trash2}
                            className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            disabled={isPending}
                            onClick={() => setDeleteTargetId(ownedEntry)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              variant="inline"
              title="Belum ada catatan jam kerja"
              description="Belum ada entri timesheet pada rentang waktu dan filter terpilih."
              action={
                projects.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEntryProjectId(projects[0]?.id ?? "");
                      setEntryDate(selectedDate);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1.5 size-4" aria-hidden="true" />
                    Catat Jam Kerja
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
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
              disabled={isPending || !entryProjectId}
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
            onCreateEntry();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="timesheet-project">Proyek</Label>
            <Combobox
              id="timesheet-project"
              options={projectOptions}
              value={entryProjectId}
              onValueChange={setEntryProjectId}
              placeholder="Pilih proyek"
              searchPlaceholder="Cari kode atau nama proyek..."
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <span className="type-p3 font-semibold text-muted-foreground">
              Preset Durasi Cepat:
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "1 Jam", h: "1", m: "0" },
                { label: "2 Jam", h: "2", m: "0" },
                { label: "4 Jam (½ Hari)", h: "4", m: "0" },
                { label: "8 Jam (1 Hari)", h: "8", m: "0" },
              ].map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEntryHours(preset.h);
                    setEntryMinutes(preset.m);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="timesheet-date">Tanggal Kerja</Label>
              <DatePicker
                id="timesheet-date"
                value={entryDate}
                onValueChange={setEntryDate}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timesheet-hours">Durasi (Jam)</Label>
              <Input
                id="timesheet-hours"
                type="number"
                min={0}
                max={24}
                value={entryHours}
                onChange={(event) => setEntryHours(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timesheet-minutes">Durasi (Menit)</Label>
              <Input
                id="timesheet-minutes"
                type="number"
                min={0}
                max={59}
                value={entryMinutes}
                onChange={(event) => setEntryMinutes(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timesheet-note">Deskripsi Pekerjaan / Catatan</Label>
            <Input
              id="timesheet-note"
              value={entryNote}
              onChange={(event) => setEntryNote(event.target.value)}
              placeholder="Contoh: Pengawasan pengecoran & opname lapangan"
              maxLength={500}
            />
          </div>
        </form>
      </GlobalModal>

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan jam kerja?</AlertDialogTitle>
            <AlertDialogDescription>
              Catatan jam kerja yang dipilih akan dihapus permanen dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={isPending}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmDeleteEntry();
              }}
            >
              {isPending ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
