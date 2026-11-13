import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import {
  calculateWeightedProjectProgress,
  clampProjectProgress,
} from "@/lib/project-progress";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import ProjectDetailView from "@/app/components/apps/projects/ProjectDetailView";
import type { ProjectWorkstationMasterData } from "@/app/components/apps/projects/ProjectWorkstationMaster";
import type { StockItemOption } from "@/app/components/apps/projects/MaterialPlanModal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { code: id }], isDeleted: false },
    select: { title: true, name: true },
  });
  return {
    title: `Detail | ${project?.title || project?.name || "Proyek"}`,
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
      drawingDocuments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      subkonContracts: {
        orderBy: { createdAt: "desc" },
        include: { termyns: { orderBy: { termynNumber: "asc" } } },
      },
      bastDocuments: {
        orderBy: { createdAt: "desc" },
      },
      materialPlans: {
        orderBy: { createdAt: "asc" },
      },
      laborPlans: {
        orderBy: { createdAt: "asc" },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        include: {
          requester: { select: { name: true } },
          auditLogs: { orderBy: { createdAt: "asc" }, take: 1 },
          items: {
            select: {
              itemName: true,
              quantity: true,
              unit: true,
              estimatedCost: true,
            },
          },
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

  const rawStockItems = await prisma.stockItem.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      category: true,
      stockQuantity: true,
      unitPrice: true,
    },
  });

  const stockItems: StockItemOption[] = rawStockItems.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    category: item.category,
    stockQuantity: decimalStringFromScaledInteger(item.stockQuantity),
    unitPrice:
      item.unitPrice !== null
        ? decimalStringFromScaledInteger(item.unitPrice)
        : "0",
  }));

  const rawMilestones = await prisma.calendarEvent.findMany({
    where: {
      projectId: project.id,
      type: "DEADLINE",
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
    },
  });

  const initialMilestones = rawMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.startsAt
      ? typeof m.startsAt === "string"
        ? (m.startsAt as string).slice(0, 10)
        : m.startsAt.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  }));

  const realizationMap = await getPaidProjectTicketRealization([project.id]);
  const realization = realizationMap.get(project.id);

  const dateKey = (date: Date | string | null | undefined) =>
    !date ? "" : typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const workPointPhotosByDate = new Map<string, string[]>();
  for (const point of project.workPoints) {
    for (const progressReport of point.progressReports) {
      const key = dateKey(progressReport.reportDate);
      if (!key || progressReport.photos.length === 0) continue;
      const photos = progressReport.photos.map(
        (photo) => photo.fileUrl ?? photo.url,
      );
      workPointPhotosByDate.set(key, [
        ...(workPointPhotosByDate.get(key) ?? []),
        ...photos,
      ]);
    }
  }

  const getCumulativeProgressAtDate = (
    reportDate: Date | string,
    fallbackProgress: number | null,
  ) => {
    const reportDateKey = dateKey(reportDate);
    const pointsAtDate = project.workPoints.filter(
      (point) => dateKey(point.createdAt) <= reportDateKey,
    );
    const pointProgresses = pointsAtDate.map((point) => {
      const latestReport = point.progressReports.find(
        (progressReport) => dateKey(progressReport.reportDate) <= reportDateKey,
      );
      return {
        progress: latestReport?.progress ?? 0,
        proposedTotalWage: point.proposedTotalWage,
      };
    });
    if (pointProgresses.length === 0) {
      return clampProjectProgress(fallbackProgress ?? project.progress);
    }

    return calculateWeightedProjectProgress(pointProgresses);
  };

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
    progress: clampProjectProgress(project.progress),
    pagu: project.pagu ? decimalStringFromScaledInteger(project.pagu) : "0",
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
    rapMaterialPlans: project.materialPlans.map((plan) => ({
      id: plan.id,
      stockItemId: plan.stockItemId,
      materialName: plan.materialName,
      unit: plan.unit,
      plannedQuantity: plan.plannedQuantity,
      actualQuantity: plan.actualQuantity,
      unitPrice: decimalStringFromScaledInteger(plan.unitPrice),
      totalPrice: decimalStringFromScaledInteger(plan.totalPrice),
      scope: plan.scope,
      notes: plan.notes,
    })),
    rapLaborPlans: project.laborPlans.map((plan) => ({
      id: plan.id,
      jobName: plan.jobName,
      volume: plan.volume,
      unit: plan.unit,
      boronganRate: decimalStringFromScaledInteger(plan.boronganRate),
      totalBorongan: decimalStringFromScaledInteger(plan.totalBorongan),
      subkonName: plan.subkonName,
      notes: plan.notes,
    })),
    realized: realization ? realization.total.toString() : "0",
    startDate: project.startDate
      ? typeof project.startDate === "string"
        ? (project.startDate as string).slice(0, 10)
        : project.startDate.toISOString().slice(0, 10)
      : null,
    endDate: project.endDate
      ? typeof project.endDate === "string"
        ? (project.endDate as string).slice(0, 10)
        : project.endDate.toISOString().slice(0, 10)
      : null,
    reports: project.dailyReports.map((report) => {
      const key = dateKey(report.reportDate);
      const workPointPhotos = workPointPhotosByDate.get(key) ?? [];
      return {
        id: report.id,
        reportDate: key,
        weather: report.weather,
        workersCount: report.workersCount,
        progress: report.workPointId
          ? getCumulativeProgressAtDate(report.reportDate, report.progress)
          : report.progress === null
            ? null
            : clampProjectProgress(report.progress),
        workPointId: report.workPointId,
        dailyVolume: report.dailyVolume,
        workSummary: report.workSummary,
        notes: report.notes,
        photoUrls: [
          ...new Set([
            ...report.progressPhotos.map(
              (photo) => photo.fileUrl ?? photo.url,
            ),
            ...workPointPhotos,
          ]),
        ],
      };
    }),
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
      approvedTotalWage:
        point.approvedTotalWage !== null
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
    blueprints: [
      ...project.blueprints
        .filter(
          (blueprint) =>
            session.user.role !== UserRole.FIELD_TEAM ||
            blueprint.status === "APPROVED_FOR_CONSTRUCTION",
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
        .filter(
          (doc) =>
            session.user.role !== UserRole.FIELD_TEAM ||
            doc.status === "APPROVED",
        )
        .map((doc) => ({
          id: doc.id,
          publicCode: doc.drawingCode,
          drawingNumber: doc.drawingCode,
          title: doc.title,
          category: doc.category,
          revision: `Rev ${doc.version ?? 0}`,
          fileUrl: doc.fileUrl || "/documents/sample.pdf",
          status: doc.status || "APPROVED",
          drafterName: doc.uploadedBy?.name ?? "Tim Dokumen",
        })),
    ],
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
      date: bast.date
        ? typeof bast.date === "string"
          ? (bast.date as string).slice(0, 10)
          : bast.date.toISOString().slice(0, 10)
        : "",
      isApproved: bast.isApproved,
    })),
    wageTicketPayments: project.tickets.map((ticket) => {
      let ticketTotal =
        ticket.totalAmount !== null && Number(ticket.totalAmount) > 0
          ? Number(decimalStringFromScaledInteger(ticket.totalAmount))
          : 0;

      const cleanStr = (s: string) =>
        s
          .toLowerCase()
          .replace(/½/g, "1/2")
          .replace(/[\/,\-_]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      // Compute total from items * stock catalog unit price if ticket total is 0
      if (ticketTotal === 0 && ticket.items && ticket.items.length > 0) {
        let itemsSum = 0;
        for (const it of ticket.items) {
          const qty = Number(it.quantity || 0);
          const estCost =
            it.estimatedCost !== null
              ? Number(decimalStringFromScaledInteger(it.estimatedCost))
              : 0;
          const targetClean = cleanStr(it.itemName);

          const matchedStock = stockItems.find((s) => {
            if (s.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()) return true;
            if (cleanStr(s.name) === targetClean) return true;
            const sClean = cleanStr(s.name);
            return sClean.includes(targetClean) || targetClean.includes(sClean);
          });

          const stockPrice = matchedStock?.unitPrice ? Number(matchedStock.unitPrice) : 0;
          const unitPrice = stockPrice > 0 ? stockPrice : estCost;
          itemsSum += qty * unitPrice;
        }
        if (itemsSum > 0) {
          ticketTotal = itemsSum;
        }
      }

      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        type: ticket.type,
        requestCategory: ticket.requestCategory,
        fieldCategory: ticket.fieldCategory,
        createdAt: ticket.createdAt
          ? typeof ticket.createdAt === "string"
            ? (ticket.createdAt as string).slice(0, 10)
            : ticket.createdAt.toISOString().slice(0, 10)
          : "",
        status: ticket.status,
        amount:
          ticketTotal > 0
            ? String(ticketTotal)
            : ticket.totalAmount !== null
              ? decimalStringFromScaledInteger(ticket.totalAmount)
              : "0",
        paid: ticket.transferReceiptUrl !== null,
        paidAt: ticket.auditLogs?.[0]?.createdAt
          ? typeof ticket.auditLogs?.[0].createdAt === "string"
            ? (ticket.auditLogs?.[0].createdAt as string).slice(0, 10)
            : ticket.auditLogs?.[0].createdAt.toISOString().slice(0, 10)
          : null,
        requesterName: ticket.requester?.name ?? "Pemohon",
        items: ticket.items.map((it) => {
          const estCostNum =
            it.estimatedCost !== null
              ? Number(decimalStringFromScaledInteger(it.estimatedCost))
              : 0;
          let calculatedEstCost = estCostNum;
          if (calculatedEstCost === 0) {
            const targetClean = cleanStr(it.itemName);
            const matchedStock = stockItems.find((s) => {
              if (s.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()) return true;
              if (cleanStr(s.name) === targetClean) return true;
              const sClean = cleanStr(s.name);
              return sClean.includes(targetClean) || targetClean.includes(sClean);
            });
            const stockPrice = matchedStock?.unitPrice ? Number(matchedStock.unitPrice) : 0;
            if (stockPrice > 0) {
              calculatedEstCost = stockPrice * Number(it.quantity || 0);
            }
          }
          return {
            itemName: it.itemName,
            quantity: it.quantity,
            unit: it.unit,
            estimatedCost: calculatedEstCost > 0 ? String(calculatedEstCost) : null,
          };
        }),
      };
    }),
  };

  return (
    <ProjectDetailView
      project={formattedProject}
      fieldTeamUsers={fieldTeamUsers}
      stockItems={stockItems}
      currentUserRole={session.user.role}
      initialMilestones={initialMilestones}
    />
  );
}
