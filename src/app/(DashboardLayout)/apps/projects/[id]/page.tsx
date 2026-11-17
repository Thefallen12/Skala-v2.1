import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import {
  decimalNumberFromScaledInteger,
  decimalStringFromScaledInteger,
} from "@/lib/scaled-decimal";
import { getJakartaDateKey } from "@/lib/habit-date";
import {
  calculateWeightedProjectProgress,
  clampProjectProgress,
  toJakartaDateKey,
} from "@/lib/project-progress";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import ProjectDetailView from "@/app/components/apps/projects/ProjectDetailView";
import type { ProjectWorkstationMasterData } from "@/app/components/apps/projects/ProjectWorkstationMaster";
import type { StockItemOption } from "@/app/components/apps/projects/MaterialPlanModal";
import {
  loadMaterialContractsBundle,
  loadOpenContractDeliveryTickets,
} from "@/lib/material-contracts-server";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await auth();
  if (!session?.user || !projectRoles.includes(session.user.role)) {
    return { title: "Detail | Proyek" };
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id }, { code: id }],
      isDeleted: false,
      ...(isFieldPicOnlyRole(session.user.role)
        ? { fieldPicId: session.user.id }
        : {}),
    },
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
  if (!projectRoles.includes(session.user.role)) redirect("/");

  const isFieldRole = isFieldPicOnlyRole(session.user.role);

  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id }, { code: id }],
      isDeleted: false,
      ...(isFieldRole ? { fieldPicId: session.user.id } : {}),
    },
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

  const todayJakartaKey = getJakartaDateKey();
  const initialMilestones = rawMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    date: toJakartaDateKey(m.startsAt) ?? todayJakartaKey,
  }));

  const [realizationMap, materialContractsBundle, openContractTickets] =
    await Promise.all([
      getPaidProjectTicketRealization([project.id]),
      loadMaterialContractsBundle({
        projectId: project.id,
        includeInvoices: false,
      }),
      loadOpenContractDeliveryTickets({
        projectId: project.id,
      }),
    ]);
  const realization = realizationMap.get(project.id);

  const dateKey = (date: Date | string | null | undefined) =>
    toJakartaDateKey(date) ?? "";
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
    const pointProgresses = project.workPoints.map((point) => {
      const latestReport = point.progressReports.find(
        (progressReport) => dateKey(progressReport.reportDate) <= reportDateKey,
      );
      return {
        progress: latestReport?.progress ?? 0,
        proposedTotalWage: point.proposedTotalWage,
        approvedTotalWage: point.approvedTotalWage,
      };
    });
    const weightedAtDate =
      pointProgresses.length > 0
        ? calculateWeightedProjectProgress(pointProgresses)
        : 0;
    const clampedFallback = clampProjectProgress(fallbackProgress ?? 0);
    return Math.max(weightedAtDate, clampedFallback);
  };

  const hasWorkPointProgress = project.workPoints.some(
    (wp) => wp.progress > 0,
  );
  const dynamicProjectProgress = hasWorkPointProgress
    ? calculateWeightedProjectProgress(project.workPoints)
    : clampProjectProgress(project.progress);
  const computedWorkPointsWage = project.workPoints.reduce(
    (sum, pt) => sum + (pt.approvedTotalWage ?? pt.proposedTotalWage),
    BigInt(0),
  );
  const effectivePaguScaled =
    project.pagu && project.pagu > BigInt(0)
      ? project.pagu
      : computedWorkPointsWage;

  const serializedReports = project.dailyReports.map((report) => {
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
      k3SafetyLog: report.k3SafetyLog ?? null,
      photoUrls: [
        ...new Set([
          ...report.progressPhotos.map(
            (photo) => photo.fileUrl ?? photo.url,
          ),
          ...workPointPhotos,
        ]),
      ],
    };
  });

  const serializedWorkPoints = project.workPoints.map((point) => {
    const seenDates = new Set<string>();
    const progressReports = point.progressReports
      .map((report) => ({
        id: report.id,
        reportDate: dateKey(report.reportDate),
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
    requestedTotal: realization ? realization.requestedTotal.toString() : "0",
    laborRealized: realization ? realization.labor.toString() : "0",
    laborRequested: realization ? realization.requestedLabor.toString() : "0",
    materialRealized: realization ? realization.material.toString() : "0",
    materialRequested: realization
      ? realization.requestedMaterial.toString()
      : "0",
    operationalRealized: realization
      ? realization.operational.plus(realization.transport).toString()
      : "0",
    operationalRequested: realization
      ? realization.requestedOperational.toString()
      : "0",
    startDate: toJakartaDateKey(project.startDate),
    endDate: toJakartaDateKey(project.endDate),
    reports: serializedReports,
    workPoints: serializedWorkPoints,
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
      date: toJakartaDateKey(bast.date) ?? "",
      isApproved: bast.isApproved,
    })),
    wageTicketPayments: (realization?.tickets ?? []).map((ticket) => {
      const cleanStr = (s: string) =>
        s
          .toLowerCase()
          .replace(/½/g, "1/2")
          .replace(/[\/,\-_]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      let ticketTotal = ticket.amount ? Number(ticket.amount) : 0;

      if (ticketTotal === 0 && ticket.items && ticket.items.length > 0) {
        let itemsSum = 0;
        for (const it of ticket.items) {
          const qty = Number(it.quantity || 0);
          const estCost = it.estimatedCost ? Number(it.estimatedCost) : 0;
          const targetClean = cleanStr(it.itemName);

          const matchedStock = stockItems.find((s) => {
            if (
              s.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()
            )
              return true;
            if (cleanStr(s.name) === targetClean) return true;
            const sClean = cleanStr(s.name);
            return sClean.includes(targetClean) || targetClean.includes(sClean);
          });

          const stockPrice = matchedStock?.unitPrice
            ? Number(matchedStock.unitPrice)
            : 0;
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
        fundCategory: ticket.fundCategory,
        createdAt: toJakartaDateKey(ticket.createdAt) ?? "",
        status: ticket.status,
        amount: ticketTotal > 0 ? String(ticketTotal) : "0",
        paid: ticket.paid,
        paidAt: toJakartaDateKey(ticket.paidAt),
        requesterName: ticket.requesterName || "Pemohon",
        items: ticket.items.map((it) => {
          const estCostNum = it.estimatedCost ? Number(it.estimatedCost) : 0;
          let calculatedEstCost = estCostNum;
          if (calculatedEstCost === 0) {
            const targetClean = cleanStr(it.itemName);
            const matchedStock = stockItems.find((s) => {
              if (
                s.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()
              )
                return true;
              if (cleanStr(s.name) === targetClean) return true;
              const sClean = cleanStr(s.name);
              return (
                sClean.includes(targetClean) || targetClean.includes(sClean)
              );
            });
            const stockPrice = matchedStock?.unitPrice
              ? Number(matchedStock.unitPrice)
              : 0;
            if (stockPrice > 0) {
              calculatedEstCost = stockPrice;
            }
          }
          return {
            itemName: it.itemName,
            quantity: it.quantity,
            unit: it.unit,
            estimatedCost:
              calculatedEstCost > 0 ? String(calculatedEstCost) : null,
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
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
      initialMilestones={initialMilestones}
      materialContracts={materialContractsBundle.contracts}
      materialDeliveries={materialContractsBundle.deliveries}
      contractTickets={openContractTickets}
    />
  );
}
