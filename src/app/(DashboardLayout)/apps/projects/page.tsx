import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ProjectWorkstationMaster, {
  type ProjectWorkstationMasterData,
} from "@/app/components/apps/projects/ProjectWorkstationMaster";
import type {
  FieldSurveySummary,
  SurveyProjectOption,
} from "@/app/components/apps/gis/SurveySidebar";
import {
  TicketFieldCategory,
  TicketRequestCategory,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const metadata: Metadata = {
  title: "Project Workstation",
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

export default async function ProjectsWorkstationPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    projectId?: string;
  }>;
}) {
  const { section, projectId: requestedProjectId } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!projectRoles.includes(session.user.role)) redirect("/");

  const isFieldRole =
    session.user.role === UserRole.FIELD_TEAM ||
    session.user.role === UserRole.KOORDINATOR;
  const isDirector = session.user.role === UserRole.DIRECTOR;
  const projectWhere =
    isFieldRole
      ? { fieldPicId: session.user.id, isDeleted: false }
      : { isDeleted: false };
  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      address: true,
      title: true,
      name: true,
      kelompokTani: true,
      jenisPekerjaan: true,
      location: true,
      status: true,
      progress: true,
      pagu: true,
      landArea: true,
      priority: true,
      vendor: true,
      clientName: true,
      budget: true,
      startDate: true,
      endDate: true,
      fieldPicId: true,
      fieldPic: { select: { name: true, profilePhotoUrl: true } },
      dailyReports: {
        orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          reportDate: true,
          weather: true,
          workersCount: true,
          progress: true,
          workPointId: true,
          dailyVolume: true,
          workSummary: true,
          notes: true,
          progressPhotos: {
            orderBy: { createdAt: "asc" },
            select: { url: true, fileUrl: true },
          },
        },
      },
      workPoints: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          location: true,
          plannedStartDate: true,
          targetDate: true,
          progress: true,
          proposedVolume: true,
          proposedUnit: true,
          proposedUnitPrice: true,
          completedVolume: true,
          proposedTotalWage: true,
          approvedTotalWage: true,
          wageAuditLogs: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              oldWage: true,
              newWage: true,
              reason: true,
              createdAt: true,
              changedBy: { select: { name: true } },
            },
          },
          progressReports: {
            orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
            take: 50,
            select: {
              id: true,
              reportDate: true,
              progress: true,
              workSummary: true,
              photos: {
                orderBy: { createdAt: "asc" },
                select: { url: true, fileUrl: true },
              },
            },
          },
        },
      },
      blueprints: {
        orderBy: [{ drawingNumber: "asc" }, { revision: "desc" }],
        select: {
          id: true,
          publicCode: true,
          drawingNumber: true,
          title: true,
          category: true,
          revision: true,
          fileUrl: true,
          status: true,
          drafter: { select: { name: true } },
        },
      },
      subkonContracts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          publicCode: true,
          contractNumber: true,
          subkonName: true,
          contractValue: true,
          status: true,
          termyns: {
            orderBy: { termynNumber: "asc" },
            select: {
              id: true,
              termynNumber: true,
              claimedPercent: true,
              grossAmount: true,
              retentionAmount: true,
              netAmount: true,
              status: true,
            },
          },
        },
      },
      bastDocuments: {
        orderBy: { date: "desc" },
        select: {
          publicCode: true,
          bastNumber: true,
          type: true,
          date: true,
          isApproved: true,
        },
      },
      tickets: {
        where: {
          requestCategory: TicketRequestCategory.FIELD,
          fieldCategory: TicketFieldCategory.LABOR,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          transferReceiptUrl: true,
          requester: { select: { name: true } },
          auditLogs: {
            where: { action: "FINANCE_PAYMENT_COMPLETED" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });
  const surveyProjects: SurveyProjectOption[] = projects.map((project) => ({
    id: project.id,
    code: project.code,
    title: project.title || project.name,
    vendor: project.vendor ?? "",
    status: project.status,
  }));
  const projectIds = projects.map((project) => project.id);
  const savedSurveys = await prisma.fieldSurvey.findMany({
    where: {
      OR: [
        { projectId: { in: projectIds } },
        {
          projectId: null,
          ...(isFieldRole ? { surveyorId: session.user.id } : {}),
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      projectId: true,
      projectName: true,
      locationName: true,
      responsibleName: true,
      surveyor: { select: { name: true } },
      surveyName: true,
      projectCode: true,
      objectCategory: true,
      vegetationType: true,
      topography: true,
      landOwnership: true,
      documentationUrls: true,
      areaSqm: true,
      lengthM: true,
      perimeterM: true,
      notes: true,
      createdAt: true,
      surveyType: true,
      features: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          featureCategory: true,
          name: true,
          description: true,
          geometryType: true,
          geoJsonData: true,
          areaSqm: true,
          lengthM: true,
          photoUrls: true,
        },
      },
    },
  });
  const surveys: FieldSurveySummary[] = savedSurveys.map((survey) => ({
    id: survey.id,
    projectId: survey.projectId,
    projectName: survey.projectName,
    locationName: survey.locationName,
    responsibleName: survey.responsibleName,
    surveyorName: survey.surveyor?.name ?? survey.responsibleName ?? "Tim Lapangan",
    surveyName: survey.surveyName,
    projectCode: survey.projectCode,
    objectCategory: survey.objectCategory,
    vegetationType: survey.vegetationType,
    topography: survey.topography,
    landOwnership: survey.landOwnership,
    documentationUrls: survey.documentationUrls,
    areaSqm: survey.areaSqm,
    lengthM: survey.lengthM,
    perimeterM: survey.perimeterM,
    notes: survey.notes,
    createdAt: survey.createdAt
      ? typeof survey.createdAt === "string"
        ? survey.createdAt
        : survey.createdAt.toISOString()
      : new Date().toISOString(),
    surveyType: survey.surveyType,
    features: (survey.features || []).map((feature) => ({
      ...feature,
      geoJsonData: feature.geoJsonData as unknown as NonNullable<FieldSurveySummary["features"]>[number]["geoJsonData"],
    })),
  }));
  const fieldTeamUsers =
    isDirector || session.user.role === UserRole.ADMINISTRATIONS
      ? await prisma.user.findMany({
          where: {
            role: { in: [UserRole.FIELD_TEAM, UserRole.KOORDINATOR] },
            isActive: true,
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, profilePhotoUrl: true },
        })
    : [];
  const realizedMap = isDirector
    ? await getPaidProjectTicketRealization(projectIds)
    : null;

  const projectRows: ProjectWorkstationMasterData[] = projects.map((project) => ({
    id: project.id,
    code: project.code,
    address: project.address,
    title: project.title,
    name: project.name,
    kelompokTani: project.kelompokTani,
    jenisPekerjaan: project.jenisPekerjaan,
    location: project.location,
    fieldPicId: project.fieldPicId,
    fieldPicName: project.fieldPic?.name ?? null,
    fieldPicPhotoUrl: project.fieldPic?.profilePhotoUrl ?? null,
    status: project.status,
    progress: project.progress,
    pagu: project.pagu
      ? decimalStringFromScaledInteger(project.pagu)
      : "0",
    landArea:
      project.landArea !== null
        ? decimalStringFromScaledInteger(project.landArea)
        : null,
    priority: project.priority,
    vendor: project.vendor,
    clientName: project.clientName,
    budget:
      project.budget !== null
        ? decimalStringFromScaledInteger(project.budget)
        : null,
    startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: project.endDate?.toISOString().slice(0, 10) ?? null,
    realized: realizedMap?.get(project.id)?.total.toString() ?? "0",
    reports: project.dailyReports.map((report) => ({
      id: report.id,
      reportDate: report.reportDate
        ? typeof report.reportDate === "string"
          ? (report.reportDate as string).slice(0, 10)
          : report.reportDate.toISOString().slice(0, 10)
        : "",
      weather: report.weather,
      workersCount: report.workersCount,
      progress: report.progress,
      workPointId: report.workPointId,
      dailyVolume: report.dailyVolume,
      workSummary: report.workSummary,
      notes: report.notes,
      photoUrls: report.progressPhotos.map((photo) => photo.fileUrl ?? photo.url),
    })),
    workPoints: project.workPoints.map((point) => ({
      id: point.id,
      title: point.title,
      location: point.location,
      plannedStartDate: point.plannedStartDate
        ? typeof point.plannedStartDate === "string"
          ? (point.plannedStartDate as string).slice(0, 10)
          : point.plannedStartDate.toISOString().slice(0, 10)
        : null,
      targetDate: point.targetDate
        ? typeof point.targetDate === "string"
          ? (point.targetDate as string).slice(0, 10)
          : point.targetDate.toISOString().slice(0, 10)
        : null,
      progress: point.progress,
      proposedVolume:
        point.proposedVolume !== null
          ? decimalStringFromScaledInteger(point.proposedVolume)
          : null,
      proposedUnit: point.proposedUnit,
      proposedUnitPrice:
        point.proposedUnitPrice !== null
          ? decimalStringFromScaledInteger(point.proposedUnitPrice)
          : null,
      completedVolume: point.completedVolume,
      proposedTotalWage: decimalStringFromScaledInteger(
        point.proposedTotalWage,
      ),
      approvedTotalWage: point.approvedTotalWage !== null
        ? decimalStringFromScaledInteger(point.approvedTotalWage)
        : null,
      wageAuditLogs: point.wageAuditLogs.map((log) => ({
        id: log.id,
        oldWage: decimalStringFromScaledInteger(log.oldWage),
        newWage: decimalStringFromScaledInteger(log.newWage),
        reason: log.reason,
        createdAt: log.createdAt
          ? typeof log.createdAt === "string"
            ? log.createdAt
            : log.createdAt.toISOString()
          : new Date().toISOString(),
        changedByName: log.changedBy?.name ?? "Admin",
      })),
      progressReports: [
        ...point.progressReports.map((report) => ({
          id: report.id,
          reportDate: report.reportDate
            ? typeof report.reportDate === "string"
              ? (report.reportDate as string).slice(0, 10)
              : report.reportDate.toISOString().slice(0, 10)
            : "",
          progress: report.progress,
          workSummary: report.workSummary,
          photoUrls: report.photos.map((photo) => photo.fileUrl ?? photo.url),
        })),
        ...project.dailyReports
          .filter(
            (report) =>
              report.workPointId === point.id && report.progress !== null,
          )
          .map((report) => ({
            id: report.id,
            reportDate: report.reportDate
              ? typeof report.reportDate === "string"
                ? (report.reportDate as string).slice(0, 10)
                : report.reportDate.toISOString().slice(0, 10)
              : "",
            progress: report.progress!,
            workSummary: report.workSummary,
            photoUrls: report.progressPhotos.map(
              (photo) => photo.fileUrl ?? photo.url,
            ),
          })),
      ],
    })),
    blueprints: isFieldRole ? [] : project.blueprints.map((blueprint) => ({
      id: blueprint.id,
      publicCode: blueprint.publicCode,
      drawingNumber: blueprint.drawingNumber,
      title: blueprint.title,
      category: blueprint.category,
      revision: blueprint.revision,
      fileUrl: blueprint.fileUrl,
      status: blueprint.status,
      drafterName: blueprint.drafter?.name ?? "Drafter",
    })),
    subkonContracts: isFieldRole ? [] : project.subkonContracts.map((contract) => ({
      id: contract.id,
      publicCode: contract.publicCode,
      contractNumber: contract.contractNumber,
      subkonName: contract.subkonName,
      contractValue: decimalStringFromScaledInteger(contract.contractValue),
      status: contract.status,
      termyns: contract.termyns.map((termyn) => ({
        id: termyn.id,
        termynNumber: termyn.termynNumber,
        claimedPercent: decimalStringFromScaledInteger(termyn.claimedPercent),
        grossAmount: decimalStringFromScaledInteger(termyn.grossAmount),
        retentionAmount: decimalStringFromScaledInteger(termyn.retentionAmount),
        netAmount: decimalStringFromScaledInteger(termyn.netAmount),
        status: termyn.status,
      })),
    })),
    bastDocuments: isFieldRole ? [] : project.bastDocuments.map((bast) => ({
      publicCode: bast.publicCode,
      bastNumber: bast.bastNumber,
      type: bast.type,
      date: bast.date
        ? typeof bast.date === "string"
          ? (bast.date as string).slice(0, 10)
          : bast.date.toISOString().slice(0, 10)
        : "",
      isApproved: bast.isApproved,
    })),
    wageTicketPayments: project.tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      amount:
        ticket.totalAmount !== null
          ? decimalStringFromScaledInteger(ticket.totalAmount)
          : null,
      paid: ticket.transferReceiptUrl !== null,
      paidAt: ticket.auditLogs[0]?.createdAt
        ? typeof ticket.auditLogs[0].createdAt === "string"
          ? (ticket.auditLogs[0].createdAt as string).slice(0, 10)
          : ticket.auditLogs[0].createdAt.toISOString().slice(0, 10)
        : null,
      requesterName: ticket.requester?.name ?? "Pemohon",
    })),
  }));

  return (
    <ProjectWorkstationMaster
      projects={projectRows}
      fieldTeamUsers={fieldTeamUsers}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
      surveyProjects={surveyProjects}
      surveys={surveys}
      surveyorName={session.user.name ?? "Pengguna"}
      captureTime={
        new Date().toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
          dateStyle: "medium",
          timeStyle: "short",
        }) + " WIB"
      }
      initialSurveyProjectId={
        requestedProjectId === "none"
          ? ""
          : surveyProjects.some((project) => project.id === requestedProjectId)
          ? requestedProjectId ?? null
          : section === "surveys"
            ? surveyProjects[0]?.id ?? ""
            : null
      }
    />
  );
}
