"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Repeat2,
} from "lucide-react";
import type {
  HabitFrequency,
  WorkTaskStatus,
} from "@prisma/client";
import HabitCalendar from "@/app/components/apps/habits/HabitCalendar";
import HabitDashboard from "@/app/components/apps/habits/HabitDashboard";
import DailyTaskBoard from "@/app/components/apps/habits/tasks/DailyTaskBoard";
import ProjectTimesheet from "@/app/components/apps/habits/timesheet/ProjectTimesheet";
import WeeklySummary from "@/app/components/apps/habits/analytics/WeeklySummary";
import CalendarEventSheet from "@/app/components/apps/habits/CalendarEventSheet";
import { Badge } from "@/components/ui/badge";
import { Stepper } from "@/components/ui/stepper";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type ProjectOption = { id: string; code: string; name: string };
type ProjectRecord = ProjectOption & {
  status: string;
  startDate: string | null;
  endDate: string | null;
};
type MemberOption = { id: string; name: string; role: string };
type CalendarMember = MemberOption & { email: string };
type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: WorkTaskStatus;
  color: string;
  projectId: string;
  creatorId: string;
  assigneeId: string | null;
  project: { name: string; code: string };
  assignee: { name: string } | null;
  members: { user: { id: string; name: string } }[];
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
type HabitRecord = {
  id: string;
  title: string;
  description: string | null;
  frequency: HabitFrequency;
};
type TimesheetEntry = {
  id: string;
  workDate: string;
  durationMinutes: number;
  note: string | null;
  userId: string;
  projectId: string;
  user: MemberOption;
  project: Pick<ProjectOption, "name" | "code">;
};
type TabValue = "calendar" | "tasks" | "habits" | "timesheet";

const tabLabels: {
  value: TabValue;
  step: string;
  label: string;
  subtitle: string;
  icon: typeof CalendarDays;
}[] = [
  {
    value: "calendar",
    step: "Tahap 01",
    label: "Kalender & Agenda",
    subtitle: "Rapat, tenggat & jadwal proyek",
    icon: CalendarDays,
  },
  {
    value: "tasks",
    step: "Tahap 02",
    label: "Tugas Proyek Harian",
    subtitle: "Delegasi & progres kerja tim",
    icon: CheckSquare,
  },
  {
    value: "habits",
    step: "Tahap 03",
    label: "Rutinitas & SOP",
    subtitle: "Checklist disiplin harian",
    icon: Repeat2,
  },
  {
    value: "timesheet",
    step: "Tahap 04",
    label: "Timesheet & Evaluasi",
    subtitle: "Rekap jam kerja & produktivitas",
    icon: Clock3,
  },
];

export default function HabitsCommandHub({
  initialTab,
  today,
  selectedDate,
  calendarRange,
  calendarView,
  taskView,
  currentUserId,
  habits,
  completions,
  projects,
  members,
  timesheetMembers,
  tasks,
  calendarRecords,
  timesheetEntries,
  weekStart,
  previousWeekStart,
  nextWeekStart,
  timeframe,
  initialMemberId,
  initialTeam,
  initialProjectId,
  canViewAllTimesheets,
}: {
  initialTab: TabValue;
  today: string;
  selectedDate: string;
  calendarRange: { start: string; end: string };
  calendarView: "day" | "week" | "month";
  taskView: "day" | "week" | "month";
  currentUserId: string;
  habits: HabitRecord[];
  completions: { habitId: string; date: string }[];
  projects: ProjectRecord[];
  members: CalendarMember[];
  timesheetMembers: MemberOption[];
  tasks: TaskRecord[];
  calendarRecords: CalendarRecord[];
  timesheetEntries: TimesheetEntry[];
  weekStart: string;
  previousWeekStart: string;
  nextWeekStart: string;
  timeframe: number;
  initialMemberId: string;
  initialTeam: string;
  initialProjectId: string;
  canViewAllTimesheets: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = tabLabels.some((tab) => tab.value === requestedTab)
    ? (requestedTab as TabValue)
    : initialTab;
  const requestedMember = searchParams.get("memberId");
  const summaryMemberId =
    requestedMember === "all" ||
    timesheetMembers.some((member) => member.id === requestedMember)
      ? requestedMember ?? initialMemberId
      : initialMemberId;
  const requestedTeam = searchParams.get("team");
  const summaryTeam =
    requestedTeam === "all" ||
    timesheetMembers.some((member) => member.role === requestedTeam)
      ? requestedTeam ?? initialTeam
      : initialTeam;
  const requestedProject = searchParams.get("projectId");
  const summaryProjectId =
    requestedProject === "all" ||
    projects.some((project) => project.id === requestedProject)
      ? requestedProject ?? initialProjectId
      : initialProjectId;
  const [scheduleDate, setScheduleDate] = useState(selectedDate);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);

  const weeklyEntries = useMemo(
    () =>
      timesheetEntries.filter(
        (entry) =>
          entry.workDate >= weekStart &&
          entry.workDate < nextWeekStart &&
          (summaryMemberId === "all" || entry.userId === summaryMemberId) &&
          (summaryTeam === "all" || entry.user.role === summaryTeam) &&
          (summaryProjectId === "all" ||
            entry.projectId === summaryProjectId),
      ),
    [
      nextWeekStart,
      summaryMemberId,
      summaryProjectId,
      summaryTeam,
      timesheetEntries,
      weekStart,
    ],
  );
  const previousWeeklyEntries = useMemo(
    () =>
      timesheetEntries.filter(
        (entry) =>
          entry.workDate >= previousWeekStart &&
          entry.workDate < weekStart &&
          (summaryMemberId === "all" || entry.userId === summaryMemberId) &&
          (summaryTeam === "all" || entry.user.role === summaryTeam) &&
          (summaryProjectId === "all" ||
            entry.projectId === summaryProjectId),
      ),
    [
      previousWeekStart,
      summaryMemberId,
      summaryProjectId,
      summaryTeam,
      timesheetEntries,
      weekStart,
    ],
  );

  const onTabChange = (value: string) => {
    if (!tabLabels.some((tab) => tab.value === value)) return;
    const nextTab = value as TabValue;
    if (nextTab === activeTab) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    router.push(`/apps/habits?${params.toString()}`, { scroll: false });
  };

  const openScheduleSheet = (date: string) => {
    setScheduleDate(date);
    setScheduleSheetOpen(true);
  };

  const todayHabitsCompleted = useMemo(
    () => completions.filter((c) => c.date === today).length,
    [completions, today],
  );
  const weeklyHoursTotal = useMemo(() => {
    const mins = weeklyEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
    return `${Math.floor(mins / 60)}j ${mins % 60}m`;
  }, [weeklyEntries]);

  const calendarAgendaCount = useMemo(() => {
    const projectScheduleCount = projects.reduce((count, project) => {
      let matches = 0;
      const startKey = project.startDate?.slice(0, 10);
      const endKey = project.endDate?.slice(0, 10);
      if (
        startKey &&
        startKey >= calendarRange.start &&
        startKey < calendarRange.end
      ) {
        matches += 1;
      }
      if (
        endKey &&
        endKey >= calendarRange.start &&
        endKey < calendarRange.end
      ) {
        matches += 1;
      }
      return count + matches;
    }, 0);
    return calendarRecords.length + projectScheduleCount;
  }, [
    calendarRange.end,
    calendarRange.start,
    calendarRecords.length,
    projects,
  ]);

  const tabBadges: Record<TabValue, string> = {
    calendar: `${calendarAgendaCount} agenda`,
    tasks: `${tasks.length} tugas`,
    habits: `${todayHabitsCompleted}/${habits.length} selesai`,
    timesheet: weeklyHoursTotal,
  };

  const activeStepIndex = Math.max(
    0,
    tabLabels.findIndex((tab) => tab.value === activeTab),
  );

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-2xs sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="lightPrimary">Alur Kerja Tim</Badge>
              <span className="type-p3 text-muted-foreground">
                Agenda, eksekusi tugas, rutinitas SOP, hingga pencatatan jam kerja.
              </span>
            </div>
          </div>

          <Stepper
            steps={tabLabels.map(({ label, subtitle }) => ({
              label,
              description: subtitle,
            }))}
            currentStep={activeStepIndex}
            onStepClick={(stepIndex) => {
              const target = tabLabels[stepIndex];
              if (target) onTabChange(target.value);
            }}
            className="hidden md:flex"
          />

          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-muted/60 p-1 sm:grid-cols-2 xl:grid-cols-4">
            {tabLabels.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="type-p2 truncate font-semibold">{label}</span>
                </span>
                <Badge
                  variant={activeTab === value ? "secondary" : "gray"}
                  className="shrink-0"
                >
                  {tabBadges[value]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="calendar" className="mt-0">
          <HabitCalendar
            today={today}
            selectedDate={selectedDate}
            view={calendarView}
            currentUserId={currentUserId}
            projects={projects}
            members={members}
            tasks={tasks}
            calendarRecords={calendarRecords}
            onAddSchedule={openScheduleSheet}
          />
        </TabsContent>

        <TabsContent value="tasks" className="mt-0">
          <DailyTaskBoard
            key={`${initialProjectId}:${selectedDate}:${taskView}`}
            selectedDate={selectedDate}
            view={taskView}
            initialProjectId={initialProjectId}
            currentUserId={currentUserId}
            projects={projects}
            members={members}
            tasks={tasks}
          />
        </TabsContent>

        <TabsContent value="habits" className="mt-0">
          <HabitDashboard
            habits={habits}
            initialDate={today}
            initialCompletions={completions}
          />
        </TabsContent>

        <TabsContent value="timesheet" className="mt-0 space-y-4">
          <WeeklySummary
            weekStart={weekStart}
            previousStart={previousWeekStart}
            nextWeekStart={nextWeekStart}
            today={today}
            memberId={summaryMemberId}
            team={summaryTeam}
            projectId={summaryProjectId}
            entries={weeklyEntries}
            previousEntries={previousWeeklyEntries}
          />
          <ProjectTimesheet
            key={`${initialMemberId}:${initialTeam}:${initialProjectId}:${selectedDate}:${timeframe}`}
            today={today}
            selectedDate={selectedDate}
            timeframe={timeframe}
            initialMemberId={initialMemberId}
            initialTeam={initialTeam}
            initialProjectId={initialProjectId}
            currentUserId={currentUserId}
            canViewAll={canViewAllTimesheets}
            projects={projects}
            members={timesheetMembers}
            entries={timesheetEntries}
            onFiltersChange={({ memberId, team, projectId }) => {
              const params = new URLSearchParams(window.location.search);
              params.set("memberId", memberId);
              params.set("team", team);
              params.set("projectId", projectId);
              router.replace(`/apps/habits?${params.toString()}`, {
                scroll: false,
              });
            }}
          />
        </TabsContent>
      </Tabs>

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
