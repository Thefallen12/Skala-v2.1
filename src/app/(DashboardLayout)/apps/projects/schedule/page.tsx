import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getJakartaDateKey } from "@/lib/habit-date";
import { toJakartaDateKey } from "@/lib/project-progress";
import ProjectScheduleGantt, {
  ScheduleProjectOption,
  ScheduleTaskItem,
  ScheduleMilestoneItem,
} from "@/app/components/apps/projects/ProjectScheduleGantt";

type ProjectSchedulePageProps = {
  searchParams?: Promise<{ projectId?: string }>;
};

const projectRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
  UserRole.FINANCE,
  UserRole.LOGISTICS,
  UserRole.MOVER,
];

function isFieldPicOnlyRole(role: UserRole): boolean {
  return role === UserRole.FIELD_TEAM || role === UserRole.KOORDINATOR;
}

function toWibScheduleDate(
  date: Date | string | null | undefined,
): string | null {
  const key = toJakartaDateKey(date);
  return key ? `${key}T00:00:00+07:00` : null;
}

export async function generateMetadata({
  searchParams,
}: ProjectSchedulePageProps): Promise<Metadata> {
  const session = await auth();
  if (!session?.user || !projectRoles.includes(session.user.role)) {
    return { title: "Project | Jadwal Proyek (Gantt)" };
  }
  const projectId = searchParams ? (await searchParams).projectId : undefined;

  if (projectId === "all") {
    return { title: "Project | Semua proyek" };
  }

  const project = await prisma.project.findFirst({
    where: {
      isDeleted: false,
      ...(isFieldPicOnlyRole(session.user.role)
        ? { fieldPicId: session.user.id }
        : {}),
      ...(projectId
        ? { OR: [{ id: projectId }, { code: projectId }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { title: true, name: true },
  });

  return {
    title: `Project | ${project?.title || project?.name || "Jadwal Proyek (Gantt)"}`,
  };
}

export default async function ProjectSchedulePage({
  searchParams,
}: ProjectSchedulePageProps) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!projectRoles.includes(session.user.role)) redirect("/");

  const sp = searchParams ? await searchParams : undefined;
  const requestedProjectId = sp?.projectId;
  const isFieldRole = isFieldPicOnlyRole(session.user.role);

  const rawProjects = await prisma.project.findMany({
    where: {
      isDeleted: false,
      ...(isFieldRole ? { fieldPicId: session.user.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      title: true,
      name: true,
      startDate: true,
      endDate: true,
      progress: true,
    },
  });

  if (rawProjects.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {isFieldRole
          ? "Belum ada proyek yang ditugaskan kepada Anda."
          : "Belum ada proyek yang dibuat. Silakan buat proyek terlebih dahulu di Master Proyek."}
      </div>
    );
  }

  const projects: ScheduleProjectOption[] = rawProjects.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title || p.name,
    name: p.name,
    startDate: toWibScheduleDate(p.startDate),
    endDate: toWibScheduleDate(p.endDate),
    progress: p.progress,
  }));

  const isAllProjects = requestedProjectId === "all";
  const visibleProjectIds = rawProjects.map((p) => p.id);

  const selectedProject: ScheduleProjectOption = isAllProjects
    ? {
        id: "all",
        code: "ALL",
        title: "Semua proyek",
        name: "Semua proyek",
        startDate: "2026-10-27T00:00:00+07:00",
        endDate: "2026-12-26T00:00:00+07:00",
        progress: 0,
      }
    : projects.find((p) => p.id === requestedProjectId || p.code === requestedProjectId) ||
      projects[0];

  // Fetch work points (tasks) from DB scoped to accessible projects
  const rawWorkPoints = await prisma.projectWorkPoint.findMany({
    where: isAllProjects
      ? { projectId: { in: visibleProjectIds } }
      : { projectId: selectedProject.id },
    orderBy: [{ location: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      location: true,
      plannedStartDate: true,
      targetDate: true,
      progress: true,
      projectId: true,
      project: { select: { title: true, code: true } },
    },
  });

  const tasks: ScheduleTaskItem[] = rawWorkPoints.map((wp) => ({
    id: wp.id,
    title: wp.title,
    location: wp.location || "A. Persiapan",
    plannedStartDate: toWibScheduleDate(wp.plannedStartDate),
    targetDate: toWibScheduleDate(wp.targetDate),
    progress: wp.progress,
    projectId: wp.projectId,
    projectName: wp.project?.title || "Proyek",
  }));

  // Fetch milestones from DB scoped to accessible projects
  const rawMilestones = await prisma.calendarEvent.findMany({
    where: isAllProjects
      ? { projectId: { in: visibleProjectIds }, type: "DEADLINE" }
      : {
          projectId: selectedProject.id,
          type: "DEADLINE",
        },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
    },
  });

  const todayWibIso = `${getJakartaDateKey()}T00:00:00+07:00`;
  const milestones: ScheduleMilestoneItem[] = rawMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    date: toWibScheduleDate(m.startsAt) ?? todayWibIso,
  }));

  return (
    <ProjectScheduleGantt
      key={selectedProject.id}
      projects={projects}
      selectedProject={selectedProject}
      initialTasks={tasks}
      initialMilestones={milestones}
    />
  );
}
