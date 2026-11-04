import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import HabitsCommandHub from "@/app/components/apps/habits/HabitsCommandHub";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import {
  getJakartaDateKey,
  getJakartaDayRange,
  getWeekDateKeys,
  isValidDateKey,
  shiftDateKey,
} from "@/lib/habit-date";
import { canManageUsers } from "@/lib/user-access";
import { UserRole } from "@prisma/client";

export const metadata: Metadata = {
  title: "Jadwal & Habit",
};

type SearchParams = {
  tab?: string;
  date?: string;
  view?: string;
  calendarView?: string;
  taskView?: string;
  projectId?: string;
  timeframe?: string;
  memberId?: string;
  team?: string;
};

const validTabs = ["calendar", "tasks", "habits", "timesheet"] as const;
type HubTab = (typeof validTabs)[number];

function isView(value: string | undefined): value is "day" | "week" | "month" {
  return value === "day" || value === "week" || value === "month";
}

function earlierDate(first: string, second: string) {
  return first < second ? first : second;
}

function laterDate(first: string, second: string) {
  return first > second ? first : second;
}

export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const params = await searchParams;
  const today = getJakartaDateKey();
  const selectedDate =
    params.date && isValidDateKey(params.date) ? params.date : today;
  const initialTab = validTabs.includes(params.tab as HubTab)
    ? (params.tab as HubTab)
    : "calendar";
  const calendarView = isView(params.calendarView)
    ? params.calendarView
    : isView(params.view)
      ? params.view
      : "month";
  const taskView = isView(params.taskView)
    ? params.taskView
    : initialTab === "tasks" && isView(params.view)
      ? params.view
      : "day";
  const timeframe =
    params.timeframe === "14" || params.timeframe === "30"
      ? Number(params.timeframe)
      : 7;

  let calendarStartKey = selectedDate;
  let calendarEndKey = shiftDateKey(selectedDate, 1);
  if (calendarView === "week") {
    const weekday = new Date(`${selectedDate}T00:00:00.000Z`).getUTCDay();
    calendarStartKey = shiftDateKey(selectedDate, -weekday);
    calendarEndKey = shiftDateKey(calendarStartKey, 7);
  } else if (calendarView === "month") {
    const monthStartKey = `${selectedDate.slice(0, 7)}-01`;
    const [year, month] = selectedDate.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEndKey = `${selectedDate.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
    const firstWeekday = new Date(`${monthStartKey}T00:00:00.000Z`).getUTCDay();
    const lastWeekday = new Date(`${monthEndKey}T00:00:00.000Z`).getUTCDay();
    calendarStartKey = shiftDateKey(monthStartKey, -firstWeekday);
    calendarEndKey = shiftDateKey(monthEndKey, 7 - lastWeekday);
  }

  let taskStartKey = selectedDate;
  let taskEndKey = shiftDateKey(selectedDate, 1);
  if (taskView === "week") {
    const dates = getWeekDateKeys(selectedDate);
    taskStartKey = dates[0];
    taskEndKey = shiftDateKey(dates[6], 1);
  } else if (taskView === "month") {
    const [year, month] = selectedDate.split("-").map(Number);
    const monthStartKey = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEndKey = shiftDateKey(
      monthStartKey,
      new Date(Date.UTC(year, month, 0)).getUTCDate() - 1,
    );
    taskStartKey = getWeekDateKeys(monthStartKey)[0];
    taskEndKey = shiftDateKey(getWeekDateKeys(monthEndKey)[6], 1);
  }

  const calendarStart = getJakartaDayRange(calendarStartKey).start;
  const calendarEnd = getJakartaDayRange(calendarEndKey).start;
  const taskCalendarStartKey = earlierDate(calendarStartKey, taskStartKey);
  const taskCalendarEndKey = laterDate(calendarEndKey, taskEndKey);
  const taskCalendarStart = getJakartaDayRange(taskCalendarStartKey).start;
  const taskCalendarEnd = getJakartaDayRange(taskCalendarEndKey).start;

  const canViewAllTimesheets = canManageUsers(session.user.role);
  const weekStart = getWeekDateKeys(selectedDate)[0];
  const previousWeekStart = shiftDateKey(weekStart, -7);
  const nextWeekStart = shiftDateKey(weekStart, 7);
  const timesheetStartKey =
    timeframe === 7
      ? getWeekDateKeys(selectedDate)[0]
      : shiftDateKey(selectedDate, 1 - timeframe);
  const timesheetEndKey = shiftDateKey(timesheetStartKey, timeframe);
  const timesheetDataStartKey = earlierDate(
    timesheetStartKey,
    previousWeekStart,
  );
  const timesheetDataEndKey = laterDate(
    timesheetEndKey,
    shiftDateKey(weekStart, 7),
  );
  const timesheetScope = canViewAllTimesheets
    ? {}
    : { userId: session.user.id };

  const [
    habits,
    completions,
    projects,
    members,
    tasks,
    calendarRecords,
    timesheetEntries,
  ] = await Promise.all([
    prisma.habit.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        frequency: true,
      },
    }),
    prisma.habitCompletion.findMany({
      where: {
        habit: { userId: session.user.id },
        date: {
          gte: new Date(`${shiftDateKey(getWeekDateKeys(today)[0], -30)}T00:00:00.000Z`),
          lte: new Date(`${getWeekDateKeys(today)[6]}T00:00:00.000Z`),
        },
      },
      select: { habitId: true, date: true },
    }),
    prisma.project.findMany({
      where: { isDeleted: false },
      orderBy: [{ startDate: "asc" }, { name: "asc" }],
      take: 300,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.workTask.findMany({
      where: {
        startsAt: { lt: taskCalendarEnd },
        endsAt: { gte: taskCalendarStart },
      },
      orderBy: { startsAt: "asc" },
      take: 500,
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        status: true,
        color: true,
        projectId: true,
        creatorId: true,
        assigneeId: true,
        project: { select: { code: true, name: true } },
        assignee: { select: { name: true } },
        members: { select: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        startsAt: { lt: calendarEnd },
        OR: [{ endsAt: null }, { endsAt: { gte: calendarStart } }],
      },
      orderBy: { startsAt: "asc" },
      take: 500,
      select: {
        id: true,
        title: true,
        type: true,
        startsAt: true,
        endsAt: true,
        projectId: true,
        project: { select: { code: true, name: true } },
        allDay: true,
        meetingUrl: true,
        location: true,
      },
    }),
    prisma.timesheetEntry.findMany({
      where: {
        ...timesheetScope,
        workDate: {
          gte: new Date(`${timesheetDataStartKey}T00:00:00.000Z`),
          lt: new Date(`${timesheetDataEndKey}T00:00:00.000Z`),
        },
      },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
      take: 2000,
      select: {
        id: true,
        workDate: true,
        durationMinutes: true,
        note: true,
        userId: true,
        projectId: true,
        user: { select: { id: true, name: true, role: true } },
        project: { select: { code: true, name: true } },
      },
    }),
  ]);

  const selectedProjectId = projects.some(
    (project) => project.id === params.projectId,
  )
    ? params.projectId!
    : "all";
  const selectedMemberId = canViewAllTimesheets
    ? params.memberId === "all" ||
      members.some((member) => member.id === params.memberId)
      ? params.memberId ?? "all"
      : "all"
    : session.user.id;
  const selectedTeam = Object.values(UserRole).includes(params.team as UserRole)
    ? params.team!
    : "all";
  const visibleTimesheetEntries = timesheetEntries.map((entry) => ({
    ...entry,
    workDate: entry.workDate.toISOString().slice(0, 10),
  }));
  const timesheetMembers = canViewAllTimesheets
    ? members
    : members.filter((member) => member.id === session.user.id);
  const projectsForHub = projects.map((project) => ({
    ...project,
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
  }));

  return (
    <>
      <BreadcrumbComp
        title="Jadwal & Habit"
        items={[{ to: "/", title: "Beranda" }, { title: "Jadwal & Habit" }]}
      />
      <HabitsCommandHub
        initialTab={initialTab}
        today={today}
        selectedDate={selectedDate}
        calendarView={calendarView}
        taskView={taskView}
        currentUserId={session.user.id}
        habits={habits}
        completions={completions.map((completion) => ({
          habitId: completion.habitId,
          date: completion.date.toISOString().slice(0, 10),
        }))}
        projects={projectsForHub}
        members={members}
        timesheetMembers={timesheetMembers}
        tasks={tasks.map((task) => ({
          ...task,
          startsAt: task.startsAt.toISOString(),
          endsAt: task.endsAt.toISOString(),
        }))}
        calendarRecords={calendarRecords.map((record) => ({
          ...record,
          startsAt: record.startsAt.toISOString(),
          endsAt: record.endsAt?.toISOString() ?? null,
        }))}
        timesheetEntries={visibleTimesheetEntries}
        weekStart={weekStart}
        previousWeekStart={previousWeekStart}
        nextWeekStart={nextWeekStart}
        timeframe={timeframe}
        initialMemberId={selectedMemberId}
        initialTeam={selectedTeam}
        initialProjectId={selectedProjectId}
        canViewAllTimesheets={canViewAllTimesheets}
      />
    </>
  );
}
