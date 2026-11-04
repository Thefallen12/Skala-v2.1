"use client";

import { useState } from "react";
import { CalendarDays, CheckSquare } from "lucide-react";
import HabitCalendar from "@/app/components/apps/habits/HabitCalendar";
import HabitDashboard from "@/app/components/apps/habits/HabitDashboard";
import CalendarEventSheet from "@/app/components/apps/habits/CalendarEventSheet";
import { Button } from "@/components/ui/button";
import type { HabitFrequency } from "@prisma/client";

type HabitItem = {
  id: string;
  title: string;
  description: string | null;
  frequency: HabitFrequency;
};

type Completion = { habitId: string; date: string };

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

export default function HabitHome({
  habits,
  initialDate,
  initialCompletions,
  currentUserId,
  selectedDate,
  view,
  projects,
  members,
  tasks,
  calendarRecords,
}: {
  habits: HabitItem[];
  initialDate: string;
  initialCompletions: Completion[];
  currentUserId: string;
  selectedDate: string;
  view: "day" | "week" | "month";
  projects: ProjectRecord[];
  members: { id: string; name: string; email: string }[];
  tasks: TaskRecord[];
  calendarRecords: CalendarRecord[];
}) {
  const [activeView, setActiveView] = useState<"calendar" | "habits">("calendar");
  const [scheduleDate, setScheduleDate] = useState(selectedDate);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);

  return (
    <div className="my-4 space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.07] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Ruang kerja personal
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
            Atur agenda, bangun konsistensi
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau kegiatan proyek dan kebiasaan harian dalam satu tempat.
          </p>
        </div>
        <div
          role="group"
          aria-label="Pilih tampilan Habit Harian"
          className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-background/80 p-1 sm:w-auto"
        >
          <Button
            type="button"
            size="default"
            variant={activeView === "calendar" ? "default" : "ghost"}
            aria-pressed={activeView === "calendar"}
            onClick={() => setActiveView("calendar")}
            className="w-full"
          >
            <CalendarDays className="mr-2 size-4" aria-hidden="true" />
            Agenda
          </Button>
          <Button
            type="button"
            size="default"
            variant={activeView === "habits" ? "default" : "ghost"}
            aria-pressed={activeView === "habits"}
            onClick={() => setActiveView("habits")}
            className="w-full"
          >
            <CheckSquare className="mr-2 size-4" aria-hidden="true" />
            Kebiasaan
          </Button>
        </div>
      </section>
      {activeView === "calendar" ? (
        <HabitCalendar
          today={initialDate}
          selectedDate={selectedDate}
          view={view}
          currentUserId={currentUserId}
          projects={projects}
          members={members}
          tasks={tasks}
          calendarRecords={calendarRecords}
          onAddSchedule={(date) => {
            setScheduleDate(date);
            setScheduleSheetOpen(true);
          }}
        />
      ) : (
        <HabitDashboard
          habits={habits}
          initialDate={initialDate}
          initialCompletions={initialCompletions}
        />
      )}
      <CalendarEventSheet
        open={scheduleSheetOpen}
        onOpenChange={setScheduleSheetOpen}
        selectedDate={scheduleDate}
        projects={projects}
        members={members}
      />
    </div>
  );
}
