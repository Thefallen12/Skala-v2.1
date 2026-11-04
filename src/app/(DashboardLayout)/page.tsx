import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";
import { getTicketPageVisibilityWhere } from "@/lib/ticket-visibility";
import { getJakartaDateKey, getJakartaDayRange, shiftDateKey } from "@/lib/habit-date";
import {
  ProjectStatus,
  TicketStatus,
  UserRole,
  WorkTaskStatus,
} from "@/generated/prisma/enums";
import ProfileWelcome from "../components/dashboard/ProfileWelcome";
import { TopCards } from "../components/dashboard/TopCards";
import SalesOverview from "../components/dashboard/SalesOverview";
import { YearlyBreakup } from "../components/dashboard/YearlyBreakup";
import { MonthlyEarning } from "../components/dashboard/MonthlyEarning";
import { RecentTransaction } from "../components/dashboard/RecentTransaction";
import { ProductPerformance } from "../components/dashboard/ProductPerformance";
import { Footer } from "../components/dashboard/Footer";

export const metadata: Metadata = {
  title: "Beranda",
};

const projectStatusLabels: Record<ProjectStatus, string> = {
  [ProjectStatus.PENDING_SETUP]: "PENDING SETUP",
  [ProjectStatus.RUNNING]: "Berjalan",
  [ProjectStatus.PENDING]: "PENDING SETUP",
  [ProjectStatus.ON_PROGRESS]: "RUNNING",
  [ProjectStatus.TERHAMBAT]: "Terhambat",
  [ProjectStatus.DONE]: "Selesai",
  [ProjectStatus.PLANNED]: "PENDING SETUP",
  [ProjectStatus.ACTIVE]: "RUNNING",
  [ProjectStatus.ON_HOLD]: "Ditunda",
  [ProjectStatus.COMPLETED]: "Selesai",
};

const ticketStatusLabels: Record<TicketStatus, string> = {
  [TicketStatus.DRAFT]: "Draf",
  [TicketStatus.PENDING_DIRECTOR]: "Menunggu persetujuan",
  [TicketStatus.APPROVED_DIR]: "Disetujui",
  [TicketStatus.PROCESSED_FINANCE]: "Diproses keuangan",
  [TicketStatus.PROCESSED_LOGISTIC]: "Diproses logistik",
  [TicketStatus.ASSIGNED_TO_MOVER]: "Dalam pengiriman",
  [TicketStatus.IN_TRANSIT]: "Dalam perjalanan (ekspedisi)",
  [TicketStatus.WAITING_FINANCE_PAYMENT]: "Menunggu pembayaran",
  [TicketStatus.COMPLETED]: "Selesai",
  [TicketStatus.REJECTED]: "Ditolak",
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const todayKey = getJakartaDateKey();
  const today = getJakartaDayRange(todayKey);
  const tomorrow = getJakartaDayRange(shiftDateKey(todayKey, 1));
  const year = Number(todayKey.slice(0, 4));
  const yearStart = new Date(`${year}-01-01T00:00:00+07:00`);
  const nextYearStart = new Date(`${year + 1}-01-01T00:00:00+07:00`);
  const monthStart = new Date(`${todayKey.slice(0, 7)}-01T00:00:00+07:00`);
  const nextMonthKey = new Date(
    Date.UTC(year, Number(todayKey.slice(5, 7)), 1),
  )
    .toISOString()
    .slice(0, 10);
  const nextMonthStart = new Date(`${nextMonthKey}T00:00:00+07:00`);
  const monthStartDate = new Date(`${todayKey.slice(0, 7)}-01T00:00:00.000Z`);
  const nextMonthDate = new Date(`${nextMonthKey}T00:00:00.000Z`);
  const tomorrowDate = new Date(`${shiftDateKey(todayKey, 1)}T00:00:00.000Z`);
  const weekStartKey = shiftDateKey(todayKey, -6);
  const weekStart = new Date(`${weekStartKey}T00:00:00.000Z`);

  const [
    user,
    projectCount,
    projectsByStatus,
    recentProjects,
    visibleActiveTicketCount,
    recentTickets,
    tasksByStatus,
    monthlyStockMovements,
    timesheetTotal,
    timesheetByDay,
    projectsCreatedThisYear,
    ticketsCreatedThisYear,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, role: true, profilePhotoUrl: true },
    }),
    prisma.project.count(),
    prisma.project.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        priority: true,
        progress: true,
        budget: true,
        fieldPic: { select: { name: true } },
      },
    }),
    prisma.ticket.count({
      where: {
        AND: [
          getTicketPageVisibilityWhere(session.user.role, session.user.id),
          {
            status: {
              notIn: [
                TicketStatus.DRAFT,
                TicketStatus.COMPLETED,
                TicketStatus.REJECTED,
              ],
            },
          },
        ],
      },
    }),
    prisma.ticket.findMany({
      where: getTicketPageVisibilityWhere(session.user.role, session.user.id),
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        type: true,
        createdAt: true,
        totalAmount: true,
        priority: true,
        requester: { select: { name: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.workTask.groupBy({
      by: ["status"],
      where: {
        startsAt: { lt: tomorrow.start },
        endsAt: { gte: today.start },
        OR: [
          { assigneeId: session.user.id },
          { creatorId: session.user.id },
          { members: { some: { userId: session.user.id } } },
        ],
      },
      _count: { _all: true },
    }),
    prisma.stockMovement.count({
      where: {
        occurredAt: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    prisma.timesheetEntry.aggregate({
      where: { workDate: { gte: monthStartDate, lt: nextMonthDate } },
      _sum: { durationMinutes: true },
    }),
    prisma.timesheetEntry.groupBy({
      by: ["workDate"],
      where: { workDate: { gte: weekStart, lt: tomorrowDate } },
      _sum: { durationMinutes: true },
    }),
    prisma.project.findMany({
      where: { createdAt: { gte: yearStart, lt: nextYearStart } },
      select: { createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: yearStart, lt: nextYearStart } },
      select: { createdAt: true },
    }),
  ]);

  if (!user) redirect("/auth/login");

  const projectCounts = new Map(
    projectsByStatus.map((entry) => [entry.status, entry._count._all]),
  );
  const taskCounts = new Map(
    tasksByStatus.map((entry) => [entry.status, entry._count._all]),
  );
  const activeTaskCount =
    (taskCounts.get(WorkTaskStatus.TODO) ?? 0) +
    (taskCounts.get(WorkTaskStatus.IN_PROGRESS) ?? 0);
  const completedTaskCount = taskCounts.get(WorkTaskStatus.DONE) ?? 0;
  const totalTaskCount = activeTaskCount + completedTaskCount;
  const activeTickets = visibleActiveTicketCount;
  const monthlyProjectCounts = Array(12).fill(0) as number[];
  const monthlyTicketCounts = Array(12).fill(0) as number[];
  for (const project of projectsCreatedThisYear) {
    const jakartaDate = new Date(project.createdAt.getTime() + 7 * 60 * 60 * 1000);
    monthlyProjectCounts[jakartaDate.getUTCMonth()] += 1;
  }
  for (const ticket of ticketsCreatedThisYear) {
    const jakartaDate = new Date(ticket.createdAt.getTime() + 7 * 60 * 60 * 1000);
    monthlyTicketCounts[jakartaDate.getUTCMonth()] += 1;
  }

  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDateKey(weekStartKey, index),
  );
  const hoursByDay = days.map((dayKey) => {
    const totalMinutes = timesheetByDay
      .filter(
        (entry) => entry.workDate.toISOString().slice(0, 10) === dayKey,
      )
      .reduce((total, entry) => total + (entry._sum.durationMinutes ?? 0), 0);
    return Math.round((totalMinutes / 60) * 10) / 10;
  });

  const cards = [
    {
      title: "Total Proyek",
      value: String(projectCount),
      caption: "Aktif & rencana",
      href: "/apps/projects?section=projects&status=ALL",
      icon: "projects",
      color: "orange",
    },
    {
      title: "Proyek Berjalan",
      value: String(
        (projectCounts.get(ProjectStatus.RUNNING) ?? 0) +
          (projectCounts.get(ProjectStatus.ON_PROGRESS) ?? 0) +
          (projectCounts.get(ProjectStatus.ACTIVE) ?? 0),
      ),
      caption: `+${monthlyProjectCounts[Number(todayKey.slice(5, 7)) - 1] ?? 0} proyek baru bulan ini`,
      href: "/apps/projects?section=projects&status=RUNNING",
      icon: "growth",
      color: "blue",
    },
    {
      title: "Tugas Saya Hari Ini",
      value: String(totalTaskCount),
      caption: `Selesai ${completedTaskCount}`,
      href: `/apps/habits?tab=tasks&date=${todayKey}`,
      icon: "tasks",
      color: "purple",
    },
    {
      title: "Tiket Aktif",
      value: String(activeTickets),
      caption: "Membutuhkan tindakan",
      href: "/apps/tickets?filter=ACTIVE#ticket-directory",
      icon: "tickets",
      color: "teal",
    },
    {
      title: "Mutasi Stok Bulan Ini",
      value: String(monthlyStockMovements),
      caption: "Transaksi bulan ini",
      href:
        user.role === UserRole.MOVER
          ? "/apps/logistics"
          : user.role === UserRole.LOGISTICS ||
              user.role === UserRole.DIRECTOR ||
              user.role === UserRole.ADMINISTRATIONS
            ? "/apps/logistics/stock"
            : user.role === UserRole.FINANCE
              ? "/apps/finance?tab=ledger#finance-ledger-tab"
              : "/apps/projects",
      icon: "stock",
      color: "indigo",
    },
    {
      title: "Jam Timesheet Bulan Ini",
      value: `${Math.round((timesheetTotal._sum.durationMinutes ?? 0) / 6) / 10} jam`,
      caption: "Total jam kerja tercatat",
      href: "/apps/habits?tab=timesheet",
      icon: "timesheet",
      color: "green",
    },
  ] as const;

  const totalProjectProgress =
    recentProjects.length > 0
      ? Math.round(
          recentProjects.reduce((sum, project) => sum + project.progress, 0) /
            recentProjects.length,
        )
      : 0;
  const completedProjects =
    (projectCounts.get(ProjectStatus.DONE) ?? 0) +
    (projectCounts.get(ProjectStatus.COMPLETED) ?? 0);

  return (
    <div className="w-full min-w-0 space-y-6">
      <ProfileWelcome
        name={user.name}
        role={user.role}
        profilePhotoUrl={user.profilePhotoUrl}
      />
      <TopCards cards={cards} />
      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <SalesOverview
            year={year}
            projectCounts={monthlyProjectCounts}
            ticketCounts={monthlyTicketCounts}
          />
        </div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <YearlyBreakup
            total={projectCount}
            completed={completedProjects}
            running={
              (projectCounts.get(ProjectStatus.RUNNING) ?? 0) +
              (projectCounts.get(ProjectStatus.ON_PROGRESS) ?? 0) +
              (projectCounts.get(ProjectStatus.ACTIVE) ?? 0)
            }
            other={Math.max(
              projectCount -
                completedProjects -
                (projectCounts.get(ProjectStatus.RUNNING) ?? 0) -
                (projectCounts.get(ProjectStatus.ON_PROGRESS) ?? 0) -
                (projectCounts.get(ProjectStatus.ACTIVE) ?? 0),
              0,
            )}
          />
          <MonthlyEarning
            hours={Math.round(
              (timesheetTotal._sum.durationMinutes ?? 0) / 6,
            ) / 10}
            dayLabels={days.map((dayKey) =>
              new Intl.DateTimeFormat("id-ID", {
                timeZone: "Asia/Jakarta",
                weekday: "short",
              }).format(new Date(`${dayKey}T12:00:00+07:00`)),
            )}
            hoursByDay={hoursByDay}
          />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0">
          <RecentTransaction
            tickets={recentTickets.map((ticket) => ({
              ...ticket,
              createdAt: dateTimeFormatter.format(ticket.createdAt),
              totalAmount: ticket.totalAmount
                ? rupiah.format(
                    decimalNumberFromScaledInteger(ticket.totalAmount),
                  )
                : "—",
              statusLabel: ticketStatusLabels[ticket.status],
              requesterName: ticket.requester?.name ?? "Pemohon",
              projectName: ticket.project?.name ?? "Umum",
            }))}
          />
        </div>
        <div className="flex min-w-0 xl:col-span-2">
          <ProductPerformance
            projects={recentProjects.map((project) => ({
              ...project,
              statusLabel: projectStatusLabels[project.status],
              budget: project.budget
                ? rupiah.format(decimalNumberFromScaledInteger(project.budget))
                : "—",
            }))}
            averageProgress={totalProjectProgress}
          />
        </div>
      </div>
      <Footer />
    </div>
  );
}
