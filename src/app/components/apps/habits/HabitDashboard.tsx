"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import { Progress } from "@/components/ui/progress";
import {
  createHabit,
  deleteHabit,
  getHabitCompletions,
  toggleHabitCompletion,
  type HabitActionResult,
} from "@/app/actions/habits";
import {
  dateFromKey,
  getWeekDateKeys,
  shiftDateKey,
} from "@/lib/habit-date";

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
  const [message, setMessage] = useState<HabitActionResult | null>(null);
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
    setMessage(null);
    const result = await getHabitCompletions(nextDate);
    if (result.success) {
      setCompletions(result.completions);
    } else {
      setMessage({
        success: false,
        message: result.message ?? "Data progres gagal dimuat.",
      });
    }
  };

  const handleCreateHabit = async (formData: FormData) => {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await createHabit({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        frequency: String(formData.get("frequency") ?? ""),
      });
      setMessage(result);
      if (result.success) {
        setIsDialogOpen(false);
        router.refresh();
      }
    } catch (error) {
      console.error("Habit creation request failed:", error);
      setMessage({ success: false, message: "Kebiasaan gagal ditambahkan." });
    } finally {
      setIsPending(false);
    }
  };

  const handleToggleCompletion = async (habit: HabitItem) => {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await toggleHabitCompletion(habit.id, selectedDate);
      if (!result.success || result.completed === undefined) {
        setMessage({ success: false, message: result.message });
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
      setMessage({ success: true, message: result.message });
    } catch (error) {
      console.error("Habit completion request failed:", error);
      setMessage({
        success: false,
        message: "Status kebiasaan gagal diperbarui.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteHabit = async () => {
    if (!deleteTarget) return;
    setIsPending(true);
    setMessage(null);
    try {
      const result = await deleteHabit(deleteTarget.id);
      setMessage(result);
      if (result.success) {
        setDeleteTarget(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Habit deletion request failed:", error);
      setMessage({ success: false, message: "Kebiasaan gagal dihapus." });
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
    <div className="my-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Kebiasaan saya</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Selesaikan rutinitas harian dan lihat konsistensi Anda bertumbuh.
          </p>
        </div>
        <Button type="button" onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Tambah kebiasaan
        </Button>
      </div>

      {message && (
        <p
          role={message.success ? "status" : "alert"}
          className={`rounded-md border px-4 py-3 text-sm ${
            message.success
              ? "border-success/30 bg-lightsuccess text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.message}
        </p>
      )}

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
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-xl font-semibold leading-tight">{value}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
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
                      setMessage({
                        success: false,
                        message:
                          result.message ?? "Data progres gagal dimuat.",
                      });
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
          <p className="text-sm font-semibold">
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
                <span className="text-[10px] uppercase sm:text-xs">
                  {format(date, "EEE", { locale: id })}
                </span>
                <span className="text-sm font-semibold sm:text-base">
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
            <h3 className="text-lg font-semibold">
              {isSameDay(dateFromKey(selectedDate), dateFromKey(today))
                ? "Agenda hari ini"
                : format(dateFromKey(selectedDate), "EEEE, d MMMM yyyy", {
                    locale: id,
                  })}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
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
                    className={`break-words font-medium ${
                      isCompleted ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {habit.title}
                  </p>
                  {habit.description && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {habit.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="gray">{frequencyLabels[habit.frequency]}</Badge>
                    {streak > 0 && (
                      <span className="flex items-center gap-1 text-xs text-warning">
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
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
              <Target
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium">
                {habits.length ? "Tidak ada kebiasaan terjadwal hari ini" : "Belum ada kebiasaan"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {habits.length
                  ? "Belum ada rutinitas yang dijadwalkan untuk hari ini."
                  : "Tambahkan kebiasaan pertama untuk mulai membangun rutinitas."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="mr-2 size-4" aria-hidden="true" />
                Tambah kebiasaan
              </Button>
            </div>
          )}
        </div>
      </CardBox>

      <GlobalModal
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Tambah kebiasaan"
        description="Buat target yang ingin Anda lakukan secara konsisten."
        className="sm:max-w-lg"
      >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateHabit(new FormData(event.currentTarget));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="habit-title">Nama kebiasaan</Label>
              <Input
                id="habit-title"
                name="title"
                placeholder="Contoh: Membaca 10 halaman"
                minLength={2}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="habit-description">Catatan (opsional)</Label>
              <textarea
                id="habit-description"
                name="description"
                rows={3}
                maxLength={500}
                placeholder="Tambahkan target atau catatan singkat..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="habit-frequency">Jadwal</Label>
              <select
                id="habit-frequency"
                name="frequency"
                defaultValue={HabitFrequency.DAILY}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={HabitFrequency.DAILY}>Setiap hari</option>
                <option value={HabitFrequency.WEEKDAYS}>
                  Hari kerja (Senin–Jumat)
                </option>
                <option value={HabitFrequency.WEEKENDS}>
                  Akhir pekan (Sabtu–Minggu)
                </option>
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan kebiasaan"}
              </Button>
            </DialogFooter>
          </form>
      </GlobalModal>

      <GlobalModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Hapus kebiasaan?"
        description={`“${deleteTarget?.title ?? ""}” dan riwayat centangnya akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        className="sm:max-w-md"
        footerNote="Tindakan ini tidak dapat dibatalkan."
      >
          <DialogFooter>
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
              {isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
      </GlobalModal>
    </div>
  );
}
