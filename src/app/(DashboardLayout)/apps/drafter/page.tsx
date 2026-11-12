import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import {
  drawingAccessRoles,
  drawingReviewRoles,
  drawingUploadRoles,
} from "@/lib/user-access";
import type {
  DrawingProjectOption,
  DrawingProjectSurveySummary,
  DrawingWorkspaceItem,
} from "@/lib/drawing-types";
import DrawingWorkspace from "./DrawingWorkspace";

export const metadata: Metadata = {
  title: "Gambar Kerja & Desain Drafter (DED)",
};

export default async function DrafterPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId: requestedProjectId } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!drawingAccessRoles.includes(session.user.role)) redirect("/");

  const isFieldOnly = session.user.role === UserRole.FIELD_TEAM;
  const isFieldScoped =
    isFieldOnly || session.user.role === UserRole.KOORDINATOR;
  const projectWhere = isFieldScoped
    ? { isDeleted: false, fieldPicId: session.user.id }
    : { isDeleted: false };

  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
  const projectIds = projects.map((project) => project.id);

  const [drawingRecords, surveyRecords] = await Promise.all([
    prisma.drawingDocument.findMany({
      where: isFieldOnly
        ? { projectId: { in: projectIds }, status: "APPROVED" }
        : isFieldScoped
          ? { projectId: { in: projectIds } }
          : undefined,
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { name: true } },
        uploadedBy: { select: { name: true } },
        logs: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { name: true, role: true } } },
        },
      },
    }),
    projectIds.length > 0
      ? prisma.fieldSurvey.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: { createdAt: "desc" },
          select: {
            projectId: true,
            locationName: true,
            areaSqm: true,
            responsibleName: true,
            surveyor: { select: { name: true } },
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const seenSurveyProjects = new Set<string>();
  const projectSurveys: DrawingProjectSurveySummary[] = [];
  for (const survey of surveyRecords) {
    if (!survey.projectId || seenSurveyProjects.has(survey.projectId)) continue;
    seenSurveyProjects.add(survey.projectId);
    projectSurveys.push({
      projectId: survey.projectId,
      locationName: survey.locationName,
      areaSqm: survey.areaSqm,
      surveyorName: survey.surveyor?.name ?? survey.responsibleName,
      createdAt:
        typeof survey.createdAt === "string"
          ? survey.createdAt
          : survey.createdAt.toISOString(),
    });
  }

  const drawings: DrawingWorkspaceItem[] = drawingRecords.map((drawing) => ({
    id: drawing.id,
    drawingCode: drawing.drawingCode,
    projectId: drawing.projectId,
    projectName: drawing.project?.name ?? null,
    title: drawing.title,
    category: drawing.category,
    version: drawing.version,
    status: drawing.status,
    fileUrl: drawing.fileUrl,
    thumbnailUrl: drawing.thumbnailUrl,
    uploadedBy: { name: drawing.uploadedBy.name },
    createdAt: drawing.createdAt.toISOString(),
    updatedAt: drawing.updatedAt.toISOString(),
    logs: drawing.logs.map((log) => ({
      id: log.id,
      action: log.action,
      notes: log.notes,
      version: log.version,
      fileUrl: log.fileUrl,
      createdAt: log.createdAt.toISOString(),
      createdBy: {
        name: log.createdBy.name,
        role: log.createdBy.role,
      },
    })),
  }));
  const projectOptions: DrawingProjectOption[] = projects;
  const initialProjectId =
    requestedProjectId && projectIds.includes(requestedProjectId)
      ? requestedProjectId
      : "ALL";
  const drawingSnapshotKey = [
    initialProjectId,
    ...drawings.map((drawing) => `${drawing.id}:${drawing.updatedAt}`),
  ].join("|");

  return (
    <DrawingWorkspace
      key={drawingSnapshotKey}
      initialDrawings={drawings}
      projects={projectOptions}
      projectSurveys={projectSurveys}
      initialProjectId={initialProjectId}
      canUpload={drawingUploadRoles.includes(session.user.role)}
      canReview={drawingReviewRoles.includes(session.user.role)}
    />
  );
}
