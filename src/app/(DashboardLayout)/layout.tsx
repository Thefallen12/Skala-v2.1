import { auth } from "../../../auth";
import { canManageUsers, drawingAccessRoles } from "@/lib/user-access";
import { TicketStatus, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getVisibleMenuKeysForRole } from "@/lib/menu-access";
import { getEnabledMaintenancePageKeys } from "@/lib/maintenance";
import { HabitFrequency } from "@prisma/client";
import {
  getJakartaDateKey,
  getJakartaDayRange,
  shiftDateKey,
} from "@/lib/habit-date";
import DashboardLayoutClient from "./DashboardLayoutClient";

const ticketActionLabels: Record<string, string> = {
  APPROVED_BY_DIR: "Tiket disetujui direktur",
  LOGISTICS_READY_WAREHOUSE: "Tiket siap di gudang",
  LOGISTICS_BUY_STORE: "Pembelian kebutuhan dicatat",
  FINANCE_PAYMENT_COMPLETED: "Pembayaran tiket selesai",
  MOVER_DELIVERY_COMPLETED: "Pengiriman tiket selesai",
};

const notificationDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const workTaskStatusLabels: Record<string, string> = {
  TODO: "Belum dimulai",
  IN_PROGRESS: "Sedang berjalan",
};

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }
  const todayKey = getJakartaDateKey();
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
  const tomorrowDate = new Date(
    `${shiftDateKey(todayKey, 1)}T00:00:00.000Z`,
  );
  const { start: todayStart, endExclusive: tomorrowStart } =
    getJakartaDayRange(todayKey);
  const weekday = new Date(`${todayKey}T00:00:00.000Z`).getUTCDay();
  const scheduledFrequencies: HabitFrequency[] =
    weekday >= 1 && weekday <= 5
      ? [HabitFrequency.DAILY, HabitFrequency.WEEKDAYS]
      : [HabitFrequency.DAILY, HabitFrequency.WEEKENDS];

  const [user, recentTicketUpdates, pendingHabits, todayWorkTasks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { profilePhotoUrl: true },
    }),
    prisma.ticketAuditLog.findMany({
      where: {
        userId: { not: session.user.id },
        ticket: {
          requesterId: session.user.id,
          status: {
            notIn: [TicketStatus.COMPLETED, TicketStatus.REJECTED],
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        createdAt: true,
        ticket: {
          select: {
            ticketNumber: true,
            title: true,
          },
        },
      },
    }),
    prisma.habit.findMany({
      where: {
        userId: session.user.id,
        frequency: { in: scheduledFrequencies },
        completions: {
          none: {
            date: { gte: todayDate, lt: tomorrowDate },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
      },
    }),
    prisma.workTask.findMany({
      where: {
        status: { not: "DONE" },
        startsAt: { lt: tomorrowStart },
        endsAt: { gte: todayStart },
        OR: [
          { assigneeId: session.user.id },
          { creatorId: session.user.id },
          { members: { some: { userId: session.user.id } } },
        ],
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        projectId: true,
        project: { select: { name: true } },
      },
    }),
  ]);
  if (!user) redirect("/auth/login");

  const [allowedMenuKeys, maintenancePageKeys] = await Promise.all([
    getVisibleMenuKeysForRole(session.user.role),
    getEnabledMaintenancePageKeys(),
  ]);

  const notifications = [
    ...pendingHabits.map((habit) => ({
      id: `habit-${habit.id}`,
      title: habit.title,
      description: "Kebiasaan terjadwal belum diselesaikan hari ini",
      time: "Habit hari ini",
      href: `/apps/habits?tab=habits&date=${todayKey}`,
      category: "habit" as const,
    })),
    ...todayWorkTasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      description: `${workTaskStatusLabels[task.status] ?? "Tugas aktif"} · ${task.project.name}`,
      time: notificationDateFormatter.format(task.startsAt),
      href: `/apps/habits?tab=tasks&date=${todayKey}&projectId=${task.projectId}`,
      category: "task" as const,
    })),
    ...recentTicketUpdates.map((update) => ({
      id: `ticket-${update.id}`,
      title: update.ticket.title,
      description: `${ticketActionLabels[update.action] ?? "Status tiket diperbarui"} · ${update.ticket.ticketNumber}`,
      time: notificationDateFormatter.format(update.createdAt),
      href: "/apps/tickets",
      category: "ticket" as const,
    })),
  ];

  return (
    <DashboardLayoutClient
      canManageUsers={canManageUsers(session.user.role)}
      canAccessLogistics={
        session.user.role === UserRole.LOGISTICS ||
        session.user.role === UserRole.MOVER ||
        session.user.role === UserRole.KOORDINATOR ||
        canManageUsers(session.user.role)
      }
      canAccessExecutive={
        session.user.role === UserRole.DIRECTOR ||
        session.user.role === UserRole.DEPUTY_DIRECTOR
      }
      canAccessFinance={
        session.user.role === UserRole.FINANCE ||
        session.user.role === UserRole.ADMINISTRATIONS ||
        session.user.role === UserRole.DIRECTOR ||
        session.user.role === UserRole.DEPUTY_DIRECTOR
      }
      canAccessProjects={
        session.user.role === UserRole.ADMINISTRATIONS ||
        session.user.role === UserRole.DIRECTOR ||
        session.user.role === UserRole.DEPUTY_DIRECTOR ||
        session.user.role === UserRole.KOORDINATOR ||
        session.user.role === UserRole.FIELD_TEAM ||
        session.user.role === UserRole.DRAFTER
      }
      canAccessDrafter={drawingAccessRoles.includes(session.user.role)}
      isMover={session.user.role === UserRole.MOVER}
      allowedMenuKeys={allowedMenuKeys}
      maintenancePageKeys={maintenancePageKeys}
      profilePhotoUrl={user.profilePhotoUrl}
      userName={session.user.name ?? "Pengguna"}
      userRole={session.user.role}
      notifications={notifications}
    >
      {children}
    </DashboardLayoutClient>
  );
}
