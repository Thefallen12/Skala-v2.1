import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import ProjectDetailView from "@/app/components/apps/projects/ProjectDetailView";
import type { ProjectWorkstationMasterData } from "@/app/components/apps/projects/ProjectWorkstationMaster";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { code: id }], isDeleted: false },
    select: { title: true, code: true },
  });
  return {
    title: project ? `${project.title} (${project.code})` : "Detail Proyek",
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { code: id }], isDeleted: false },
    include: {
      fieldPic: { select: { id: true, name: true, profilePhotoUrl: true } },
      dailyReports: {
        orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
        include: {
          progressPhotos: {
            orderBy: { createdAt: "asc" },
            select: { url: true, fileUrl: true },
          },
        },
      },
      workPoints: {
        orderBy: { createdAt: "asc" },
        include: {
          wageAuditLogs: {
            orderBy: { createdAt: "desc" },
            include: { changedBy: { select: { name: true } } },
          },
          progressReports: {
            orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
            include: {
              photos: {
                orderBy: { createdAt: "asc" },
                select: { url: true, fileUrl: true },
              },
            },
          },
        },
      },
      blueprints: {
        orderBy: { createdAt: "desc" },
        include: { drafter: { select: { name: true } } },
      },
      subkonContracts: {
        orderBy: { createdAt: "desc" },
        include: { termyns: { orderBy: { termynNumber: "asc" } } },
      },
      bastDocuments: {
        orderBy: { createdAt: "desc" },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        include: {
          requester: { select: { name: true } },
          auditLogs: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });

  if (!project) notFound();

  const fieldTeamUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.FIELD_TEAM, UserRole.KOORDINATOR] },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      profilePhotoUrl: true,
    },
  });

  const realizationMap = await getPaidProjectTicketRealization([project.id]);
  const realization = realizationMap.get(project.id);

  const formattedProject: ProjectWorkstationMasterData = {
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
    pagu: decimalStringFromScaledInteger(project.pagu),
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
    realized: realization ? realization.total.toString() : "0",
    startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: project.endDate?.toISOString().slice(0, 10) ?? null,
    reports: project.dailyReports.map((report) => ({
      id: report.id,
      reportDate: report.reportDate.toISOString().slice(0, 10),
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
      plannedStartDate:
        point.plannedStartDate?.toISOString().slice(0, 10) ?? null,
      targetDate: point.targetDate?.toISOString().slice(0, 10) ?? null,
      progress: point.progress,
      proposedVolume:
        point.proposedVolume !== null
          ? decimalStringFromScaledInteger(point.proposedVolume)
          : null,
      proposedUnit: point.proposedUnit,
      completedVolume: point.completedVolume,
      proposedTotalWage: decimalStringFromScaledInteger(
        point.proposedTotalWage,
      ),
      approvedTotalWage:
        point.approvedTotalWage !== null
          ? decimalStringFromScaledInteger(point.approvedTotalWage)
          : null,
      wageAuditLogs: point.wageAuditLogs.map((log) => ({
        id: log.id,
        oldWage: decimalStringFromScaledInteger(log.oldWage),
        newWage: decimalStringFromScaledInteger(log.newWage),
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
        changedByName: log.changedBy.name,
      })),
      progressReports: [
        ...point.progressReports.map((report) => ({
          id: report.id,
          reportDate: report.reportDate.toISOString().slice(0, 10),
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
            reportDate: report.reportDate.toISOString().slice(0, 10),
            progress: report.progress!,
            workSummary: report.workSummary,
            photoUrls: report.progressPhotos.map(
              (photo) => photo.fileUrl ?? photo.url,
            ),
          })),
      ],
    })),
    blueprints: project.blueprints.map((blueprint) => ({
      id: blueprint.id,
      publicCode: blueprint.publicCode,
      drawingNumber: blueprint.drawingNumber,
      title: blueprint.title,
      category: blueprint.category,
      revision: blueprint.revision,
      fileUrl: blueprint.fileUrl,
      status: blueprint.status,
      drafterName: blueprint.drafter.name,
    })),
    subkonContracts: project.subkonContracts.map((contract) => ({
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
    bastDocuments: project.bastDocuments.map((bast) => ({
      publicCode: bast.publicCode,
      bastNumber: bast.bastNumber,
      type: bast.type,
      date: bast.date.toISOString().slice(0, 10),
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
      paidAt:
        ticket.auditLogs[0]?.createdAt.toISOString().slice(0, 10) ?? null,
      requesterName: ticket.requester.name,
    })),
  };

  return (
    <ProjectDetailView
      project={formattedProject}
      fieldTeamUsers={fieldTeamUsers}
      currentUserRole={session.user.role}
    />
  );
}
