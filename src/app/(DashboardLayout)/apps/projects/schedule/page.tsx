import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import ProjectScheduleGantt, {
  ScheduleProjectOption,
  ScheduleTaskItem,
  ScheduleMilestoneItem,
} from "@/app/components/apps/projects/ProjectScheduleGantt";

type ProjectSchedulePageProps = {
  searchParams?: Promise<{ projectId?: string }>;
};

export async function generateMetadata({
  searchParams,
}: ProjectSchedulePageProps): Promise<Metadata> {
  const projectId = searchParams ? (await searchParams).projectId : undefined;

  if (projectId === "all") {
    return { title: "Project | Semua proyek" };
  }

  const project = await prisma.project.findFirst({
    where: {
      isDeleted: false,
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

  const sp = searchParams ? await searchParams : undefined;
  const requestedProjectId = sp?.projectId;

  const rawProjects = await prisma.project.findMany({
    where: { isDeleted: false },
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
        Belum ada proyek yang dibuat. Silakan buat proyek terlebih dahulu di Master Proyek.
      </div>
    );
  }

  const projects: ScheduleProjectOption[] = rawProjects.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title || p.name,
    name: p.name,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    endDate: p.endDate ? p.endDate.toISOString() : null,
    progress: p.progress,
  }));

  const isAllProjects = requestedProjectId === "all";

  const selectedProject: ScheduleProjectOption = isAllProjects
    ? {
        id: "all",
        code: "ALL",
        title: "Semua proyek",
        name: "Semua proyek",
        startDate: "2026-10-27T00:00:00.000Z",
        endDate: "2026-12-26T00:00:00.000Z",
        progress: 0,
      }
    : projects.find((p) => p.id === requestedProjectId || p.code === requestedProjectId) ||
      projects[0];

  // Fetch work points (tasks) from DB
  const rawWorkPoints = await prisma.projectWorkPoint.findMany({
    where: isAllProjects ? {} : { projectId: selectedProject.id },
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

  let tasks: ScheduleTaskItem[] = rawWorkPoints.map((wp) => ({
    id: wp.id,
    title: wp.title,
    location: wp.location || "A. Persiapan",
    plannedStartDate: wp.plannedStartDate ? wp.plannedStartDate.toISOString() : null,
    targetDate: wp.targetDate ? wp.targetDate.toISOString() : null,
    progress: wp.progress,
    projectId: wp.projectId,
    projectName: wp.project?.title || "Proyek",
  }));

  if (tasks.length === 0) {
    tasks = [
      {
        id: "demo_1",
        title: "Pembersihan dan bongkaran",
        location: "A. Persiapan",
        plannedStartDate: "2026-10-27T00:00:00Z",
        targetDate: "2026-11-02T00:00:00Z",
        progress: 100,
        projectId: selectedProject.id,
        projectName: selectedProject.title,
      },
      {
        id: "demo_2",
        title: "Pasang keramik 60×60",
        location: "B. Lantai",
        plannedStartDate: "2026-11-03T00:00:00Z",
        targetDate: "2026-11-20T00:00:00Z",
        progress: 40,
        projectId: selectedProject.id,
        projectName: selectedProject.title,
      },
      {
        id: "demo_3",
        title: "Cat dinding 2 lapis",
        location: "C. Dinding",
        plannedStartDate: "2026-11-18T00:00:00Z",
        targetDate: "2026-12-05T00:00:00Z",
        progress: 0,
        projectId: selectedProject.id,
        projectName: selectedProject.title,
      },
      {
        id: "demo_4",
        title: "Titik lampu dan stopkontak",
        location: "D. Listrik",
        plannedStartDate: "2026-11-30T00:00:00Z",
        targetDate: "2026-12-20T00:00:00Z",
        progress: 0,
        projectId: selectedProject.id,
        projectName: selectedProject.title,
      },
    ];
  }

  // Fetch milestones from DB
  const rawMilestones = await prisma.calendarEvent.findMany({
    where: isAllProjects
      ? { type: "DEADLINE" }
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

  const milestones: ScheduleMilestoneItem[] = rawMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.startsAt.toISOString(),
  }));

  return (
    <ProjectScheduleGantt
      projects={projects}
      selectedProject={selectedProject}
      initialTasks={tasks}
      initialMilestones={milestones}
    />
  );
}
