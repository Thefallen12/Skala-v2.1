"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { format, isSameDay } from "date-fns";
import { id } from "date-fns/locale";
import { HabitFrequency } from "@prisma/client";
import CardBox from "@/app/components/shared/CardBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createHabit,
  deleteHabit,
  getHabitCompletions,
  toggleHabitCompletion,
} from "@/app/actions/habits";
import {
  dateFromKey,
  getWeekDateKeys,
  shiftDateKey,
} from "@/lib/habit-date";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";

type HabitItem = {
  id: string;
  title: string;
  description: string | null;
  frequency: HabitFrequency;
};

type Completion = { habitId: string; date: string };

const frequencyLabels: Record<HabitFrequency, string> = {
  DAILY: "Setiap hari",
  WEEKDAYS: "Hari kerja",
  WEEKENDS: "Akhir pekan",
};

function isScheduledOn(habit: HabitItem, dateKey: string): boolean {
  const day = dateFromKey(dateKey).getDay();
  if (habit.frequency === HabitFrequency.WEEKDAYS) return day >= 1 && day <= 5;
  if (habit.frequency === HabitFrequency.WEEKENDS) return day === 0 || day === 6;
  return true;
}

function getCurrentStreak(
  habit: HabitItem,
  completions: Completion[],
  today: string,
): number {
  const completedDates = new Set(
    completions
      .filter((completion) => completion.habitId === habit.id)
      .map((completion) => completion.date),
  );
  let streak = 0;
  let date = today;

  for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
    if (isScheduledOn(habit, date)) {
      if (!completedDates.has(date)) break;
      streak += 1;
    }
    date = shiftDateKey(date, -1);
  }
  return streak;
}

export default function HabitDashboard({
  habits,
  initialDate,
  initialCompletions,
}: {
  habits: HabitItem[];
  initialDate: string;
  initialCompletions: Completion[];
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [completions, setCompletions] = useState(initialCompletions);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HabitItem | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFrequency, setNewFrequency] = useState<HabitFrequency>(HabitFrequency.WEEKDAYS);
  const [newDescription, setNewDescription] = useState("");
  const weekDates = useMemo(
    () => getWeekDateKeys(selectedDate),
    [selectedDate],
  );
  const selectedDayHabits = habits.filter((habit) =>
    isScheduledOn(habit, selectedDate),
  );
  const completedIds = new Set(
    completions
      .filter((completion) => completion.date === selectedDate)
      .map((completion) => completion.habitId),
  );
  const completedCount = selectedDayHabits.filter((habit) =>
    completedIds.has(habit.id),
  ).length;
  const completionRate = selectedDayHabits.length
    ? Math.round((completedCount / selectedDayHabits.length) * 100)
    : 0;
  const weekCompletionCount = habits.reduce(
    (count, habit) =>
      count +
      completions.filter(
        (completion) =>
          completion.habitId === habit.id &&
          weekDates.includes(completion.date),
      ).length,
    0,
  );
  const orderedDayHabits = [...selectedDayHabits].sort(
    (first, second) =>
      Number(completedIds.has(first.id)) - Number(completedIds.has(second.id)),
  );

  const changeWeek = async (direction: -1 | 1) => {
    const nextDate = shiftDateKey(selectedDate, direction * 7);
    setSelectedDate(nextDate);
    const result = await getHabitCompletions(nextDate);
    if (result.success) {
      setCompletions(result.completions);
    } else {
      toast.error(result.message ?? "Data progres gagal dimuat.");
    }
  };

  const handleCreateHabit = async () => {
    setIsPending(true);
    try {
      const result = await createHabit({
        title: newTitle,
        description: newDescription,
        frequency: newFrequency,
      });
      if (result.success) {
        toast.success(result.message);
        setIsDialogOpen(false);
        setNewTitle("");
        setNewFrequency(HabitFrequency.WEEKDAYS);
        setNewDescription("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Habit creation request failed:", error);
      toast.error("Kebiasaan gagal ditambahkan.");
    } finally {
      setIsPending(false);
    }
  };

  const handleToggleCompletion = async (habit: HabitItem) => {
    setIsPending(true);
    try {
      const result = await toggleHabitCompletion(habit.id, selectedDate);
      if (!result.success || result.completed === undefined) {
        toast.error(result.message);
        return;
      }
      setCompletions((existing) =>
        result.completed
          ? [...existing, { habitId: habit.id, date: selectedDate }]
          : existing.filter(
              (completion) =>
                completion.habitId !== habit.id ||
                completion.date !== selectedDate,
            ),
      );
      toast.success(result.message);
      requestNotificationFeedRefresh();
      router.refresh();
    } catch (error) {
      console.error("Habit completion request failed:", error);
      toast.error("Status kebiasaan gagal diperbarui.");
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteHabit = async () => {
    if (!deleteTarget) return;
    setIsPending(true);
    try {
      const result = await deleteHabit(deleteTarget.id);
      if (result.success) {
        toast.success(result.message);
        setDeleteTarget(null);
        requestNotificationFeedRefresh();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Habit deletion request failed:", error);
      toast.error("Kebiasaan gagal dihapus.");
    } finally {
      setIsPending(false);
    }
  };

  const today = initialDate;
  const stats = [
    {
      label: "Kebiasaan aktif",
      value: habits.length,
      hint: "Total kebiasaan yang dicatat",
      icon: Target,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      label: "Selesai hari ini",
      value: `${completedCount}/${selectedDayHabits.length}`,
      hint: "Target pada tanggal terpilih",
      icon: CheckCircle2,
      iconClass: "bg-success/10 text-success",
    },
    {
      label: "Konsistensi hari ini",
      value: `${completionRate}%`,
      hint: "Kebiasaan yang sudah selesai",
      icon: Activity,
      iconClass: "bg-info/10 text-info",
    },
    {
      label: "Selesai minggu ini",
      value: weekCompletionCount,
      hint: "Total centang minggu terpilih",
      icon: Flame,
      iconClass: "bg-warning/10 text-warning",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="type-h2 text-foreground">Rutinitas &amp; Checklist SOP Harian</h2>
          <p className="type-p3 text-muted-foreground">
            Jaga konsistensi standar operasional harian dan pantau capaian Anda setiap minggu.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          Tambah Rutinitas
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, iconClass }) => (
          <CardBox
            key={label}
            className="flex min-h-24 items-center gap-3 p-3 text-left sm:p-4"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="type-p3 font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="type-kpi mt-1 text-foreground">{value}</p>
              <p className="type-p3 mt-0.5 truncate text-muted-foreground">
                {hint}
              </p>
            </div>
          </CardBox>
        ))}
      </div>

      <CardBox className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Minggu sebelumnya"
              onClick={() => void changeWeek(-1)}
              disabled={isPending}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (getWeekDateKeys(selectedDate).includes(today)) {
                  setSelectedDate(today);
                } else {
                  void (async () => {
                    const result = await getHabitCompletions(today);
                    if (result.success) {
                      setCompletions(result.completions);
                      setSelectedDate(today);
                    } else {
                      toast.error(result.message ?? "Data progres gagal dimuat.");
                    }
                  })();
                }
              }}
              disabled={selectedDate === today}
            >
              Hari ini
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Minggu berikutnya"
              onClick={() => void changeWeek(1)}
              disabled={isPending}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p className="type-p2 font-semibold">
            {format(dateFromKey(weekDates[0]), "d MMM", { locale: id })} –{" "}
            {format(dateFromKey(weekDates[6]), "d MMM yyyy", { locale: id })}
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDates.map((dateKey) => {
            const date = dateFromKey(dateKey);
            const isSelected = dateKey === selectedDate;
            const isToday = dateKey === today;
            const completedThatDay = habits.filter(
              (habit) =>
                isScheduledOn(habit, dateKey) &&
                completions.some(
                  (completion) =>
                    completion.habitId === habit.id &&
                    completion.date === dateKey,
                ),
            ).length;
            return (
              <Button
                key={dateKey}
                type="button"
                variant={isSelected ? "default" : "outline"}
                className="h-auto min-w-0 flex-col gap-1 px-1 py-2 sm:py-3"
                aria-pressed={isSelected}
                onClick={() => setSelectedDate(dateKey)}
              >
                <span className="type-p3 uppercase">
                  {format(date, "EEE", { locale: id })}
                </span>
                <span className="type-h3 font-semibold">
                  {format(date, "d")}
                </span>
                <span
                  className={`size-1.5 rounded-full ${
                    isToday
                      ? "bg-warning"
                      : completedThatDay
                        ? "bg-success"
                        : "bg-transparent"
                  }`}
                  aria-hidden="true"
                />
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
          <div>
            <h3 className="type-h2 text-foreground">
              {isSameDay(dateFromKey(selectedDate), dateFromKey(today))
                ? "Agenda hari ini"
                : format(dateFromKey(selectedDate), "EEEE, d MMMM yyyy", {
                    locale: id,
                  })}
            </h3>
            <p className="type-p2 mt-1 text-muted-foreground">
              {completedCount} dari {selectedDayHabits.length} kebiasaan selesai
            </p>
          </div>
          <div className="w-full sm:w-52">
            <Progress value={completionRate} className="h-2" />
          </div>
        </div>

        <div className="space-y-3">
          {orderedDayHabits.map((habit) => {
            const isCompleted = completedIds.has(habit.id);
            const streak = getCurrentStreak(habit, completions, today);
            return (
              <div
                key={habit.id}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors sm:items-center sm:p-4 ${
                  isCompleted
                    ? "border-success/30 bg-success/5"
                    : "border-border bg-card"
                }`}
              >
                <ActionIconButton
                  label={`${isCompleted ? "Batalkan" : "Tandai"} ${habit.title}`}
                  tooltip={`${isCompleted ? "Batalkan" : "Tandai"} ${habit.title}`}
                  icon={isCompleted ? CheckCircle2 : Circle}
                  aria-pressed={isCompleted}
                  disabled={isPending}
                  className="mt-0.5 shrink-0 sm:mt-0"
                  onClick={() => void handleToggleCompletion(habit)}
                  variant="ghost"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`type-p1 break-words font-medium ${
                      isCompleted ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {habit.title}
                  </p>
                  {habit.description && (
                    <p className="type-p2 mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                      {habit.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="gray">{frequencyLabels[habit.frequency]}</Badge>
                    {streak > 0 && (
                      <span className="type-p3 flex items-center gap-1 text-warning">
                        <Flame className="size-3.5" aria-hidden="true" />
                        {streak} hari
                      </span>
                    )}
                  </div>
                </div>
                {isCompleted && (
                  <Check
                    className="hidden size-5 shrink-0 text-success sm:block"
                    aria-hidden="true"
                  />
                )}
                <ActionIconButton
                  label={`Hapus kebiasaan ${habit.title}`}
                  tooltip={`Hapus kebiasaan ${habit.title}`}
                  icon={Trash2}
                  disabled={isPending}
                  onClick={() => setDeleteTarget(habit)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  variant="ghost"
                />
              </div>
            );
          })}
          {selectedDayHabits.length === 0 && (
            <EmptyState
              variant="inline"
              icon={Target}
              title={
                habits.length
                  ? "Tidak ada rutinitas terjadwal hari ini"
                  : "Belum ada rutinitas"
              }
              description={
                habits.length
                  ? "Belum ada rutinitas yang dijadwalkan untuk hari ini."
                  : "Tambahkan rutinitas pertama untuk mulai membangun konsistensi."
              }
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Plus className="mr-1.5 size-4" aria-hidden="true" />
                  Tambah Rutinitas
                </Button>
              }
            />
          )}
        </div>
      </CardBox>

      <GlobalModal
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Tambah Rutinitas / Checklist Harian"
        description="Buat target standar operasional atau kebiasaan kerja yang dilakukan secara konsisten."
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
            <Button type="submit" form="create-habit-form" disabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan Rutinitas"}
            </Button>
          </>
        }
      >
        <form
          id="create-habit-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateHabit();
          }}
        >
          <div className="space-y-1.5">
            <span className="type-p3 font-semibold text-muted-foreground">
              Template Cepat Operasional:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Briefing K3 & Cek APD Pagi",
                "Update Laporan Progres Harian",
                "Inspeksi Stok Material & Alat",
                "Rekap Jam Kerja (Timesheet)",
              ].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setNewTitle(preset)}
                >
                  + {preset}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="habit-title">Nama Rutinitas / Checklist</Label>
            <Input
              id="habit-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Contoh: Briefing K3 & Cek APD Pagi"
              minLength={2}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="habit-frequency">Frekuensi Pelaksanaan</Label>
            <Select
              value={newFrequency}
              onValueChange={(value) => setNewFrequency(value as HabitFrequency)}
            >
              <SelectTrigger id="habit-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HabitFrequency.WEEKDAYS}>
                  Hari Kerja (Senin–Jumat)
                </SelectItem>
                <SelectItem value={HabitFrequency.DAILY}>
                  Setiap Hari (Senin–Minggu)
                </SelectItem>
                <SelectItem value={HabitFrequency.WEEKENDS}>
                  Akhir Pekan (Sabtu–Minggu)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="habit-description">Catatan / Kriteria Selesai (Opsional)</Label>
            <Textarea
              id="habit-description"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              rows={3}
              maxLength={500}
              className="mt-0"
              placeholder="Tambahkan target atau rincian standar operasional..."
            />
          </div>
        </form>
      </GlobalModal>

      <GlobalModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Rutinitas?"
        description={`“${deleteTarget?.title ?? ""}” beserta riwayat capaiannya akan dihapus permanen.`}
        className="sm:max-w-md"
        footerNote="Tindakan ini tidak dapat dibatalkan."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteHabit()}
              disabled={isPending}
            >
              {isPending ? "Menghapus..." : "Ya, Hapus"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Pastikan rutinitas ini sudah tidak lagi digunakan dalam checklist harian Anda.
        </p>
      </GlobalModal>
    </div>
  );
}
