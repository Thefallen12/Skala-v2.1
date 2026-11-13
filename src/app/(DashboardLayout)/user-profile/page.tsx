import { redirect } from "next/navigation";
import UserProfile from "@/app/components/user-profile";
import type { Metadata } from "next";
import {
  ProjectStatus,
  TicketRequestCategory,
  UserRole,
  WorkTaskStatus,
} from "@prisma/client";
import { auth } from "../../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import BreadcrumbComp from "../layout/shared/breadcrumb/BreadcrumbComp";

export const metadata: Metadata = {
  title: "Profil Saya",
};

const ALLOWED_PROFILE_TABS = new Set([
  "account",
  "security",
  "billing",
  "notifications",
  "connections",
]);

export default async function UserProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const normalizedTab =
    tab && ALLOWED_PROFILE_TABS.has(tab) ? tab : "account";
  const session = await auth();
  if (!session?.user?.id) {
    const callback =
      tab && ALLOWED_PROFILE_TABS.has(tab)
        ? `/user-profile?tab=${encodeURIComponent(tab)}`
        : "/user-profile";
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const userId = session.user.id;
  const taskScope = {
    OR: [
      { creatorId: userId },
      { assigneeId: userId },
      { members: { some: { userId } } },
    ],
  };
  const projectScope = {
    OR: [
      { fieldPicId: userId },
      { timesheetEntries: { some: { userId } } },
      { workTasks: { some: taskScope } },
    ],
  };
  const [
    user,
    projects,
    taskCount,
    completedTaskCount,
    completedProjectCount,
    tasks,
    tickets,
  ] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          profilePhotoUrl: true,
          bankName: true,
          bankAccountName: true,
          bankAccountNumber: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.project.findMany({
        where: projectScope,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        take: 100,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          progress: true,
          updatedAt: true,
          fieldPic: { select: { name: true } },
        },
      }),
      prisma.workTask.count({ where: taskScope }),
      prisma.workTask.count({
        where: { ...taskScope, status: WorkTaskStatus.DONE },
      }),
      prisma.project.count({
        where: {
          ...projectScope,
          status: { in: [ProjectStatus.DONE, ProjectStatus.COMPLETED] },
        },
      }),
      prisma.workTask.findMany({
        where: taskScope,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          projectId: true,
          project: { select: { name: true } },
        },
      }),
      prisma.ticket.findMany({
        where: {
          AND: [
            { requesterId: userId },
            ...(session.user.role === UserRole.DIRECTOR ||
            session.user.role === UserRole.FINANCE
              ? []
              : [
                  {
                    OR: [
                      { requestCategory: { not: TicketRequestCategory.APH } },
                      { requestCategory: null },
                    ],
                  },
                ]),
          ],
        },
        orderBy: [{ createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          project: { select: { name: true } },
        },
      }),
    ]);

  if (!user) redirect("/auth/login");

  return (
    <>
      <BreadcrumbComp
        title="Profil Saya"
        items={[{ to: "/", title: "Home" }, { title: "Profil Saya" }]}
      />
      <UserProfile
        key={normalizedTab}
        initialTab={normalizedTab}
        profile={{
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          profilePhotoUrl: user.profilePhotoUrl,
          bankName: user.bankName,
          bankAccountName: user.bankAccountName,
          bankAccountNumber: user.bankAccountNumber,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          taskCount,
          completedTaskCount,
          completedProjectCount,
          projects: projects.map((project) => ({
            id: project.id,
            code: project.code,
            name: project.name,
            status: project.status,
            progress: project.progress,
            leader: project.fieldPic?.name ?? null,
            updatedAt: project.updatedAt.toISOString(),
          })),
          tasks: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            updatedAt: task.updatedAt.toISOString(),
            projectId: task.projectId,
            projectName: task.project.name,
          })),
          tickets: tickets.map((ticket) => ({
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            type: ticket.type,
            status: ticket.status,
            totalAmount:
              ticket.totalAmount !== null
                ? decimalStringFromScaledInteger(ticket.totalAmount)
                : null,
            createdAt: ticket.createdAt.toISOString(),
            projectName: ticket.project?.name ?? null,
          })),
        }}
      />
    </>
  );
}
