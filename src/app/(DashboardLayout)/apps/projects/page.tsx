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
import {
  calculateWeightedProjectProgress,
  toJakartaDateKey,
} from "@/lib/project-progress";
import {
  decimalNumberFromScaledInteger,
  decimalStringFromScaledInteger,
} from "@/lib/scaled-decimal";
import { loadActiveTicketMaterialContractOptions } from "@/lib/material-contracts-server";

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
  const isDirector =
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.DEPUTY_DIRECTOR;
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
        take: 200,
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
          k3SafetyLog: true,
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
            take: 200,
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
      drawingDocuments: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          drawingCode: true,
          title: true,
          category: true,
          version: true,
          fileUrl: true,
          status: true,
          uploadedBy: { select: { name: true } },
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
    location: project.location,
    fieldPicName: project.fieldPic?.name ?? null,
    landArea:
      project.landArea !== null
        ? decimalStringFromScaledInteger(project.landArea)
        : null,
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
    isDirector ||
    session.user.role === UserRole.DEPUTY_DIRECTOR ||
    session.user.role === UserRole.ADMINISTRATIONS
      ? await prisma.user.findMany({
          where: {
            role: { in: [UserRole.FIELD_TEAM, UserRole.KOORDINATOR] },
            isActive: true,
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, profilePhotoUrl: true },
        })
    : [];
  const realizedMap = await getPaidProjectTicketRealization(projectIds);

  const projectRows: ProjectWorkstationMasterData[] = projects.map((project) => {
    const realizedEntry = realizedMap?.get(project.id);
    const hasWorkPointProgress = project.workPoints.some(
      (wp) => wp.progress > 0,
    );
    const dynamicProjectProgress = hasWorkPointProgress
      ? calculateWeightedProjectProgress(project.workPoints)
      : project.progress;
    const computedWorkPointsWage = project.workPoints.reduce(
      (sum, pt) => sum + (pt.approvedTotalWage ?? pt.proposedTotalWage),
      BigInt(0),
    );
    const effectivePaguScaled =
      project.pagu && project.pagu > BigInt(0)
        ? project.pagu
        : computedWorkPointsWage;

    const serializedReports = project.dailyReports.map((report) => ({
      id: report.id,
      reportDate: toJakartaDateKey(report.reportDate) ?? "",
      weather: report.weather,
      workersCount: report.workersCount,
      progress: report.progress,
      workPointId: report.workPointId,
      dailyVolume: report.dailyVolume,
      workSummary: report.workSummary,
      notes: report.notes,
      k3SafetyLog: report.k3SafetyLog ?? null,
      photoUrls: report.progressPhotos.map(
        (photo) => photo.fileUrl ?? photo.url,
      ),
    }));

    const serializedWorkPoints = project.workPoints.map((point) => {
      const seenDates = new Set<string>();
      const progressReports = point.progressReports
        .map((report) => ({
          id: report.id,
          reportDate: toJakartaDateKey(report.reportDate) ?? "",
          progress: report.progress,
          workSummary: report.workSummary,
          photoUrls: report.photos.map((photo) => photo.fileUrl ?? photo.url),
        }))
        .filter((report) => {
          if (!report.reportDate || seenDates.has(report.reportDate)) return false;
          seenDates.add(report.reportDate);
          return true;
        });

      const approvedWageNum =
        point.approvedTotalWage !== null
          ? decimalNumberFromScaledInteger(point.approvedTotalWage)
          : 0;
      const proposedWageNum = decimalNumberFromScaledInteger(
        point.proposedTotalWage,
      );
      const volumeNum =
        point.proposedVolume !== null
          ? decimalNumberFromScaledInteger(point.proposedVolume)
          : 0;
      const unitPriceNum =
        point.proposedUnitPrice !== null
          ? decimalNumberFromScaledInteger(point.proposedUnitPrice)
          : 0;
      const totalPrice =
        approvedWageNum > 0
          ? approvedWageNum
          : proposedWageNum > 0
            ? proposedWageNum
            : Math.round(volumeNum * unitPriceNum * 100) / 100;

      return {
        id: point.id,
        title: point.title,
        location: point.location,
        plannedStartDate: toJakartaDateKey(point.plannedStartDate),
        targetDate: toJakartaDateKey(point.targetDate),
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
        approvedTotalWage:
          point.approvedTotalWage !== null
            ? decimalStringFromScaledInteger(point.approvedTotalWage)
            : null,
        totalPrice,
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
        progressReports,
      };
    });

    return {
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
      progress: dynamicProjectProgress,
      pagu:
        effectivePaguScaled > BigInt(0)
          ? decimalStringFromScaledInteger(effectivePaguScaled)
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
      startDate: toJakartaDateKey(project.startDate),
      endDate: toJakartaDateKey(project.endDate),
      realized: realizedEntry?.total.toString() ?? "0",
      requestedTotal: realizedEntry?.requestedTotal.toString() ?? "0",
      laborRealized: realizedEntry?.labor.toString() ?? "0",
      laborRequested: realizedEntry?.requestedLabor.toString() ?? "0",
      materialRealized: realizedEntry?.material.toString() ?? "0",
      materialRequested: realizedEntry?.requestedMaterial.toString() ?? "0",
      operationalRealized: realizedEntry
        ? realizedEntry.operational.plus(realizedEntry.transport).toString()
        : "0",
      operationalRequested:
        realizedEntry?.requestedOperational.toString() ?? "0",
      reports: serializedReports,
      workPoints: serializedWorkPoints,
      blueprints: [
        ...project.blueprints
          .filter(
            (blueprint) =>
              !isFieldRole || blueprint.status === "APPROVED_FOR_CONSTRUCTION",
          )
          .map((blueprint) => ({
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
        ...(project.drawingDocuments ?? [])
          .filter((doc) => !isFieldRole || doc.status === "APPROVED")
          .map((doc) => ({
            id: doc.id,
            publicCode: doc.drawingCode,
            drawingNumber: doc.drawingCode,
            title: doc.title,
            category: doc.category,
            revision: `Rev ${doc.version ?? 0}`,
            fileUrl: doc.fileUrl || "/documents/sample.pdf",
            status: doc.status || "REVIEW",
            drafterName: doc.uploadedBy?.name ?? "Drafter",
          })),
      ],
      subkonContracts: isFieldRole
        ? []
        : project.subkonContracts.map((contract) => ({
            id: contract.id,
            publicCode: contract.publicCode,
            contractNumber: contract.contractNumber,
            subkonName: contract.subkonName,
            contractValue: decimalStringFromScaledInteger(
              contract.contractValue,
            ),
            status: contract.status,
            termyns: contract.termyns.map((termyn) => ({
              id: termyn.id,
              termynNumber: termyn.termynNumber,
              claimedPercent: decimalStringFromScaledInteger(
                termyn.claimedPercent,
              ),
              grossAmount: decimalStringFromScaledInteger(termyn.grossAmount),
              retentionAmount: decimalStringFromScaledInteger(
                termyn.retentionAmount,
              ),
              netAmount: decimalStringFromScaledInteger(termyn.netAmount),
              status: termyn.status,
            })),
          })),
      bastDocuments: isFieldRole
        ? []
        : project.bastDocuments.map((bast) => ({
            publicCode: bast.publicCode,
            bastNumber: bast.bastNumber,
            type: bast.type,
            date: toJakartaDateKey(bast.date) ?? "",
            isApproved: bast.isApproved,
          })),
      wageTicketPayments: realizedEntry
        ? realizedEntry.tickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticketNumber,
            title: t.title,
            status: t.status,
            amount: t.amount,
            paid: t.paid,
            paidAt: toJakartaDateKey(t.paidAt),
            requesterName: t.requesterName,
            type: t.type,
            requestCategory: t.requestCategory,
            fieldCategory: t.fieldCategory,
            fundCategory: t.fundCategory,
            createdAt: toJakartaDateKey(t.createdAt),
            items: t.items,
          }))
        : project.tickets.map((ticket) => ({
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            status: ticket.status,
            amount:
              ticket.totalAmount !== null
                ? decimalStringFromScaledInteger(ticket.totalAmount)
                : null,
            paid: ticket.transferReceiptUrl !== null,
            paidAt: toJakartaDateKey(ticket.auditLogs[0]?.createdAt),
            requesterName: ticket.requester?.name ?? "Pemohon",
            fundCategory: "TUKANG" as const,
          })),
    };
  });

  const materialContractOptions =
    await loadActiveTicketMaterialContractOptions();

  return (
    <ProjectWorkstationMaster
      key={section === "surveys" ? "surveys" : (requestedProjectId ?? "list")}
      projects={projectRows}
      materialContracts={materialContractOptions}
      fieldTeamUsers={fieldTeamUsers}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
      surveyProjects={surveyProjects}
      surveys={surveys}
      surveyorName={session.user.name ?? "Pengguna"}
      currentTimeMs={new Date().getTime()}
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
            ? surveyProjects.find((project) =>
                surveys.some((survey) => survey.projectId === project.id),
              )?.id ??
              surveyProjects.find((project) =>
                ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(project.status),
              )?.id ??
              surveyProjects[0]?.id ??
              ""
            : null
      }
    />
  );
}
