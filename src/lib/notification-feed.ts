import "server-only";

import {
  BlueprintStatus,
  DirectStockPurchaseStatus,
  DOStatus,
  HabitFrequency,
  NotificationType,
  POStatus,
  ProjectAddendumStatus,
  ProjectStatus,
  SPKStatus,
  SubkonTermynStatus,
  TicketFulfillmentStatus,
  TicketStatus,
  UserRole,
  VehicleFuelRequestStatus,
} from "@prisma/client";
import {
  getJakartaDateKey,
  getJakartaDayRange,
  shiftDateKey,
} from "@/lib/habit-date";
import type {
  BellTaskReminder,
  NotificationFeed,
  NotificationFeedItem,
} from "@/lib/notification-types";
import { prisma } from "@/lib/prisma";

const ticketActionLabels: Record<string, string> = {
  APPROVED_BY_DIR: "Tiket disetujui direktur",
  LOGISTICS_READY_WAREHOUSE: "Tiket siap di gudang",
  LOGISTICS_BUY_STORE: "Pembelian kebutuhan dicatat",
  FINANCE_PAYMENT_COMPLETED: "Pembayaran tiket selesai",
  MOVER_DELIVERY_COMPLETED: "Pengiriman tiket selesai",
};

const workTaskStatusLabels: Record<string, string> = {
  TODO: "Belum dimulai",
  IN_PROGRESS: "Sedang berjalan",
};

const notificationDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type RawNotificationRow = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: Date;
};

type ParsedNotificationTarget = {
  pathname: string;
  tab: string;
  openSheet: string | null;
  ticketIdParam: string | null;
  projectIdParam: string | null;
  documentCode: string | null;
  leadingCode: string | null;
  ticketNumber: string | null;
  poNumber: string | null;
  koNumber: string | null;
  purchaseNumber: string | null;
  doNumber: string | null;
  invoiceNumber: string | null;
  addendumNumber: string | null;
  bastNumber: string | null;
  subkonTermyn: { termynNumber: number; contractNumber: string } | null;
};

function parseActionUrl(actionUrl: string | null): URL | null {
  if (!actionUrl) return null;
  try {
    return new URL(actionUrl, "http://internal.local");
  } catch {
    return null;
  }
}

function parseNotificationTarget(
  notification: Pick<RawNotificationRow, "message" | "actionUrl">,
): ParsedNotificationTarget {
  const parsed = parseActionUrl(notification.actionUrl);
  const pathname = parsed?.pathname ?? "";
  const tab = parsed?.searchParams.get("tab") ?? "";
  const openSheet = parsed?.searchParams.get("openSheet") ?? null;
  const ticketIdParam = parsed?.searchParams.get("ticketId") ?? null;
  const projectIdParam = parsed?.searchParams.get("projectId") ?? null;
  const documentCode = pathname.match(/^\/d\/([^/]+)$/)?.[1] ?? null;

  const message = notification.message;
  const leadingCode = message.match(/^([^\s·]+)\s*·/)?.[1] ?? null;
  const ticketNumber =
    message.match(/\b(TKT-\d{4,8}-\d+)\b/i)?.[1] ?? null;
  const poNumber =
    message.match(/\bPO\s*#\s*(\S+?)(?=[,;)]|\.(?:\s|$)|\s|$)/i)?.[1] ?? null;
  const koNumber =
    message.match(/\bKO\s+(\S+?)(?=[,;)]|\.(?:\s|$)|\s|$)/i)?.[1] ?? null;
  const purchaseNumber =
    message.match(
      /\bpembelian\s+(\S+?)(?=\s+(?:disetujui|telah|dari)\b|[.,;)]|$)/i,
    )?.[1] ?? null;
  const doNumber =
    message.match(/\bDO\s+#?([^\s(),;]+)/i)?.[1] ??
    message.match(
      /\buntuk\s+(\S+?)(?=\s+(?:telah\s+(?:ditinjau|disalurkan)|adalah)\b|\.(?:\s|$)|$)/i,
    )?.[1] ??
    (leadingCode && !/^TKT-/i.test(leadingCode) ? leadingCode : null);
  const invoiceNumber =
    message.match(/\bInvoice\s+(\S+?)(?=\s+telah\b|[.,;)]|$)/i)?.[1] ?? null;
  const addendumNumber =
    message.match(/\bCCO\s+(\S+?)(?=\s+(?:menunggu|telah)\b|[.,;)]|$)/i)?.[1] ??
    null;
  const bastNumber =
    message.match(/\b(SPE-\d+\/BAST-[A-Z]+\/\d{4})\b/i)?.[1] ?? null;

  const subkonMatch = message.match(
    /\bTermin\s+(\d+)\s+(?:untuk|·)\s+(?:SPK\s+)?(\S+?)(?=\s+\(|$)/i,
  );
  const parsedTermynNumber = subkonMatch ? Number(subkonMatch[1]) : NaN;
  const subkonTermyn =
    subkonMatch && Number.isInteger(parsedTermynNumber) && parsedTermynNumber > 0
      ? {
          termynNumber: parsedTermynNumber,
          contractNumber: subkonMatch[2],
        }
      : null;

  return {
    pathname,
    tab,
    openSheet,
    ticketIdParam,
    projectIdParam,
    documentCode,
    leadingCode,
    ticketNumber,
    poNumber,
    koNumber,
    purchaseNumber,
    doNumber,
    invoiceNumber,
    addendumNumber,
    bastNumber,
    subkonTermyn,
  };
}

function addIfPresent(set: Set<string>, value: string | null | undefined) {
  if (value) set.add(value);
}

type TicketLookupRecord = {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  fulfillmentStatus: TicketFulfillmentStatus;
  deliveryOrders: { id: string }[];
  purchaseOrders: {
    id: string;
    publicCode: string;
    poNumber: string;
    status: POStatus;
    paidAt: Date | null;
    vendorInvoiceUrl: string | null;
    stockPurchases: { id: string }[];
  }[];
};

type PurchaseOrderLookupRecord = {
  id: string;
  publicCode: string;
  poNumber: string;
  status: POStatus;
  paidAt: Date | null;
  vendorInvoiceUrl: string | null;
  vendorPoSentAt: Date | null;
  ticket: {
    id: string;
    ticketNumber: string;
    status: TicketStatus;
    fulfillmentStatus: TicketFulfillmentStatus;
  } | null;
  stockPurchases: { id: string }[];
};

type DirectPurchaseLookupRecord = {
  id: string;
  purchaseNumber: string;
  status: DirectStockPurchaseStatus;
  isApprovedByDirector: boolean;
  vendorInvoiceUrl: string | null;
  paidAt: Date | null;
};

type WorkPointLookupRecord = {
  id: string;
  wageApprovedAt: Date | null;
};

type ProjectLookupRecord = {
  id: string;
  status: ProjectStatus;
  isDeleted: boolean;
};

type FuelRequestLookupRecord = {
  status: VehicleFuelRequestStatus;
  requestedById: string;
  deliveryOrder: { doNumber: string };
};

type SubkonTermynLookupRecord = {
  id: string;
  termynNumber: number;
  status: SubkonTermynStatus;
  subkonContract: { contractNumber: string };
};

type SubkonContractLookupRecord = {
  publicCode: string;
  contractNumber: string;
  status: SPKStatus;
};

type AddendumLookupRecord = {
  id: string;
  addendumNumber: string;
  status: ProjectAddendumStatus;
};

type BastLookupRecord = {
  id: string;
  bastNumber: string;
  isApproved: boolean;
};

type BlueprintLookupRecord = {
  projectId: string;
  drawingNumber: string;
  status: BlueprintStatus;
};

type DrawingLookupRecord = {
  projectId: string | null;
  drawingCode: string;
  status: string;
};

type RentalLookupRecord = {
  name: string;
  vendorName: string;
  paymentStatus: string;
};

type InvoiceLookupRecord = {
  invoiceNumber: string | null;
  acknowledgedAt: Date | null;
};

type DeliveryOrderLookupRecord = {
  doNumber: string;
  status: DOStatus;
  acknowledgedAt: Date | null;
};

type NotificationResolutionContext = {
  userId: string;
  ticketsByRef: Map<string, TicketLookupRecord>;
  purchaseOrdersByRef: Map<string, PurchaseOrderLookupRecord>;
  directPurchasesByRef: Map<string, DirectPurchaseLookupRecord>;
  workPointsById: Map<string, WorkPointLookupRecord>;
  projectsById: Map<string, ProjectLookupRecord>;
  sentKoNumbers: Set<string>;
  knownKoNumbers: Set<string>;
  acknowledgedKoNumbers: Set<string>;
  subkonTermynByKey: Map<string, SubkonTermynLookupRecord>;
  subkonTermynsById: Map<string, SubkonTermynLookupRecord>;
  subkonContractsByRef: Map<string, SubkonContractLookupRecord>;
  addendumsByRef: Map<string, AddendumLookupRecord>;
  bastsByRef: Map<string, BastLookupRecord>;
  blueprintsByRef: Map<string, BlueprintLookupRecord>;
  drawingsByRef: Map<string, DrawingLookupRecord>;
  rentalsList: RentalLookupRecord[];
  invoicesByNumber: Map<string, InvoiceLookupRecord>;
  deliveryOrdersByNumber: Map<string, DeliveryOrderLookupRecord>;
  fuelRequestsByDo: Map<string, FuelRequestLookupRecord[]>;
};

async function buildNotificationResolutionContext(
  userId: string,
  parsedEntries: Array<{ row: RawNotificationRow; target: ParsedNotificationTarget }>,
): Promise<NotificationResolutionContext> {
  const ticketIdsOrNumbers = new Set<string>();
  const poCodes = new Set<string>();
  const poNumbers = new Set<string>();
  const directPurchaseIds = new Set<string>();
  const directPurchaseNumbers = new Set<string>();
  const wageOpenSheetIds = new Set<string>();
  const projectIds = new Set<string>();
  const koNumbers = new Set<string>();
  const doNumbers = new Set<string>();
  const subkonContracts = new Set<string>();
  const addendumNumbers = new Set<string>();
  const bastNumbers = new Set<string>();
  const drafterCodes = new Set<string>();
  const invoiceNumbers = new Set<string>();
  let needsRentalsLookup = false;

  for (const { target } of parsedEntries) {
    addIfPresent(ticketIdsOrNumbers, target.openSheet);
    addIfPresent(ticketIdsOrNumbers, target.ticketIdParam);
    addIfPresent(ticketIdsOrNumbers, target.ticketNumber);

    addIfPresent(poCodes, target.openSheet);
    addIfPresent(poCodes, target.documentCode);
    addIfPresent(poNumbers, target.poNumber);

    if (
      target.openSheet &&
      (target.tab === "direct-purchase" || target.tab === "payments")
    ) {
      directPurchaseIds.add(target.openSheet);
    }
    addIfPresent(directPurchaseNumbers, target.purchaseNumber);

    if (target.openSheet && target.tab === "wages") {
      wageOpenSheetIds.add(target.openSheet);
    }
    addIfPresent(projectIds, target.projectIdParam);
    addIfPresent(koNumbers, target.koNumber);
    addIfPresent(doNumbers, target.doNumber);
    addIfPresent(addendumNumbers, target.addendumNumber);
    addIfPresent(bastNumbers, target.bastNumber);
    addIfPresent(invoiceNumbers, target.invoiceNumber);
    if (target.pathname === "/apps/drafter" && target.leadingCode) {
      drafterCodes.add(target.leadingCode);
    }
    if (target.pathname === "/apps/finance" && target.tab === "rentals") {
      needsRentalsLookup = true;
    }
    if (target.subkonTermyn) {
      subkonContracts.add(target.subkonTermyn.contractNumber);
    }
  }

  const [
    tickets,
    purchaseOrders,
    directPurchases,
    workPoints,
    projects,
    orderConfirmations,
    paymentConfirmations,
    subkonTermyns,
    subkonContractsRows,
    addendumsRows,
    bastsRows,
    blueprintsRows,
    drawingsRows,
    rentalsRows,
    invoicesRows,
    deliveryOrdersRows,
    fuelRequests,
  ] = await Promise.all([
    ticketIdsOrNumbers.size > 0
      ? prisma.ticket.findMany({
          where: {
            OR: [
              { id: { in: [...ticketIdsOrNumbers] } },
              { ticketNumber: { in: [...ticketIdsOrNumbers] } },
            ],
          },
          select: {
            id: true,
            ticketNumber: true,
            status: true,
            fulfillmentStatus: true,
            deliveryOrders: { select: { id: true }, take: 1 },
            purchaseOrders: {
              select: {
                id: true,
                publicCode: true,
                poNumber: true,
                status: true,
                paidAt: true,
                vendorInvoiceUrl: true,
                stockPurchases: { select: { id: true }, take: 1 },
              },
            },
          },
        })
      : [],
    poCodes.size > 0 || poNumbers.size > 0
      ? prisma.purchaseOrder.findMany({
          where: {
            OR: [
              ...(poCodes.size > 0
                ? [{ publicCode: { in: [...poCodes] } }]
                : []),
              ...(poNumbers.size > 0
                ? [{ poNumber: { in: [...poNumbers] } }]
                : []),
            ],
          },
          select: {
            id: true,
            publicCode: true,
            poNumber: true,
            status: true,
            paidAt: true,
            vendorInvoiceUrl: true,
            vendorPoSentAt: true,
            ticket: {
              select: {
                id: true,
                ticketNumber: true,
                status: true,
                fulfillmentStatus: true,
              },
            },
            stockPurchases: { select: { id: true }, take: 1 },
          },
        })
      : [],
    directPurchaseIds.size > 0 || directPurchaseNumbers.size > 0
      ? prisma.directStockPurchase.findMany({
          where: {
            OR: [
              ...(directPurchaseIds.size > 0
                ? [{ id: { in: [...directPurchaseIds] } }]
                : []),
              ...(directPurchaseNumbers.size > 0
                ? [{ purchaseNumber: { in: [...directPurchaseNumbers] } }]
                : []),
            ],
          },
          select: {
            id: true,
            purchaseNumber: true,
            status: true,
            isApprovedByDirector: true,
            vendorInvoiceUrl: true,
            paidAt: true,
          },
        })
      : [],
    wageOpenSheetIds.size > 0
      ? prisma.projectWorkPoint.findMany({
          where: { id: { in: [...wageOpenSheetIds] } },
          select: { id: true, wageApprovedAt: true },
        })
      : [],
    projectIds.size > 0
      ? prisma.project.findMany({
          where: { id: { in: [...projectIds] } },
          select: { id: true, status: true, isDeleted: true },
        })
      : [],
    koNumbers.size > 0
      ? prisma.orderConfirmation.findMany({
          where: { koNumber: { in: [...koNumbers] } },
          select: { koNumber: true, vendorSentAt: true, acknowledgedAt: true },
        })
      : [],
    koNumbers.size > 0
      ? prisma.paymentTransaction.findMany({
          where: { confirmationOrderNumber: { in: [...koNumbers] } },
          select: { confirmationOrderNumber: true, vendorSentAt: true },
        })
      : [],
    subkonContracts.size > 0 || wageOpenSheetIds.size > 0
      ? prisma.subkonTermyn.findMany({
          where: {
            OR: [
              ...(subkonContracts.size > 0
                ? [{ subkonContract: { contractNumber: { in: [...subkonContracts] } } }]
                : []),
              ...(wageOpenSheetIds.size > 0
                ? [{ id: { in: [...wageOpenSheetIds] } }]
                : []),
            ],
          },
          select: {
            id: true,
            termynNumber: true,
            status: true,
            subkonContract: { select: { contractNumber: true } },
          },
        })
      : [],
    wageOpenSheetIds.size > 0 || subkonContracts.size > 0
      ? prisma.subkonContract.findMany({
          where: {
            OR: [
              ...(wageOpenSheetIds.size > 0
                ? [{ publicCode: { in: [...wageOpenSheetIds] } }]
                : []),
              ...(subkonContracts.size > 0
                ? [{ contractNumber: { in: [...subkonContracts] } }]
                : []),
            ],
          },
          select: { publicCode: true, contractNumber: true, status: true },
        })
      : [],
    wageOpenSheetIds.size > 0 || addendumNumbers.size > 0
      ? prisma.projectAddendum.findMany({
          where: {
            OR: [
              ...(wageOpenSheetIds.size > 0
                ? [{ id: { in: [...wageOpenSheetIds] } }]
                : []),
              ...(addendumNumbers.size > 0
                ? [{ addendumNumber: { in: [...addendumNumbers] } }]
                : []),
            ],
          },
          select: { id: true, addendumNumber: true, status: true },
        })
      : [],
    wageOpenSheetIds.size > 0 || bastNumbers.size > 0
      ? prisma.bASTDocument.findMany({
          where: {
            OR: [
              ...(wageOpenSheetIds.size > 0
                ? [{ id: { in: [...wageOpenSheetIds] } }]
                : []),
              ...(bastNumbers.size > 0
                ? [{ bastNumber: { in: [...bastNumbers] } }]
                : []),
            ],
          },
          select: { id: true, bastNumber: true, isApproved: true },
        })
      : [],
    drafterCodes.size > 0
      ? prisma.blueprint.findMany({
          where: { drawingNumber: { in: [...drafterCodes] } },
          select: { projectId: true, drawingNumber: true, status: true },
        })
      : [],
    drafterCodes.size > 0
      ? prisma.drawingDocument.findMany({
          where: { drawingCode: { in: [...drafterCodes] } },
          select: { projectId: true, drawingCode: true, status: true },
        })
      : [],
    needsRentalsLookup
      ? prisma.equipmentRental.findMany({
          where: { paymentStatus: { in: ["PENDING_PAYMENT", "PAID"] } },
          select: { name: true, vendorName: true, paymentStatus: true },
        })
      : [],
    invoiceNumbers.size > 0
      ? prisma.invoice.findMany({
          where: { invoiceNumber: { in: [...invoiceNumbers] } },
          select: { invoiceNumber: true, acknowledgedAt: true },
        })
      : [],
    doNumbers.size > 0
      ? prisma.deliveryOrder.findMany({
          where: { doNumber: { in: [...doNumbers] } },
          select: { doNumber: true, status: true, acknowledgedAt: true },
        })
      : [],
    doNumbers.size > 0
      ? prisma.vehicleFuelRequest.findMany({
          where: {
            deliveryOrder: { doNumber: { in: [...doNumbers] } },
          },
          select: {
            status: true,
            requestedById: true,
            deliveryOrder: { select: { doNumber: true } },
          },
        })
      : [],
  ]);

  const ticketsByRef = new Map<string, TicketLookupRecord>();
  for (const ticket of tickets) {
    ticketsByRef.set(ticket.id, ticket);
    ticketsByRef.set(ticket.ticketNumber.toLowerCase(), ticket);
  }

  const purchaseOrdersByRef = new Map<string, PurchaseOrderLookupRecord>();
  for (const order of purchaseOrders) {
    purchaseOrdersByRef.set(order.publicCode, order);
    purchaseOrdersByRef.set(order.poNumber.toLowerCase(), order);
  }

  const directPurchasesByRef = new Map<string, DirectPurchaseLookupRecord>();
  for (const purchase of directPurchases) {
    directPurchasesByRef.set(purchase.id, purchase);
    directPurchasesByRef.set(purchase.purchaseNumber.toLowerCase(), purchase);
  }

  const workPointsById = new Map<string, WorkPointLookupRecord>();
  for (const workPoint of workPoints) {
    workPointsById.set(workPoint.id, workPoint);
  }

  const projectsById = new Map<string, ProjectLookupRecord>();
  for (const project of projects) {
    projectsById.set(project.id, project);
  }

  const sentKoNumbers = new Set<string>();
  const knownKoNumbers = new Set<string>();
  const acknowledgedKoNumbers = new Set<string>();
  for (const conf of orderConfirmations) {
    const key = conf.koNumber.toLowerCase();
    knownKoNumbers.add(key);
    if (conf.vendorSentAt) sentKoNumbers.add(key);
    if (conf.acknowledgedAt) acknowledgedKoNumbers.add(key);
  }
  for (const payment of paymentConfirmations) {
    if (!payment.confirmationOrderNumber) continue;
    const key = payment.confirmationOrderNumber.toLowerCase();
    knownKoNumbers.add(key);
    if (payment.vendorSentAt) sentKoNumbers.add(key);
  }

  const subkonTermynByKey = new Map<string, SubkonTermynLookupRecord>();
  const subkonTermynsById = new Map<string, SubkonTermynLookupRecord>();
  for (const termyn of subkonTermyns) {
    const key = `${termyn.subkonContract.contractNumber.toLowerCase()}::${termyn.termynNumber}`;
    subkonTermynByKey.set(key, termyn);
    subkonTermynsById.set(termyn.id, termyn);
  }

  const subkonContractsByRef = new Map<string, SubkonContractLookupRecord>();
  for (const contract of subkonContractsRows) {
    subkonContractsByRef.set(contract.publicCode, contract);
    subkonContractsByRef.set(contract.contractNumber.toLowerCase(), contract);
  }

  const addendumsByRef = new Map<string, AddendumLookupRecord>();
  for (const addendum of addendumsRows) {
    addendumsByRef.set(addendum.id, addendum);
    addendumsByRef.set(addendum.addendumNumber.toLowerCase(), addendum);
  }

  const bastsByRef = new Map<string, BastLookupRecord>();
  for (const bast of bastsRows) {
    bastsByRef.set(bast.id, bast);
    bastsByRef.set(bast.bastNumber.toLowerCase(), bast);
  }

  const blueprintsByRef = new Map<string, BlueprintLookupRecord>();
  for (const bp of blueprintsRows) {
    blueprintsByRef.set(
      `${bp.projectId}::${bp.drawingNumber.toLowerCase()}`,
      bp,
    );
    blueprintsByRef.set(bp.drawingNumber.toLowerCase(), bp);
  }

  const drawingsByRef = new Map<string, DrawingLookupRecord>();
  for (const drawing of drawingsRows) {
    if (drawing.projectId) {
      drawingsByRef.set(
        `${drawing.projectId}::${drawing.drawingCode.toLowerCase()}`,
        drawing,
      );
    }
    drawingsByRef.set(drawing.drawingCode.toLowerCase(), drawing);
  }

  const invoicesByNumber = new Map<string, InvoiceLookupRecord>();
  for (const inv of invoicesRows) {
    if (inv.invoiceNumber) {
      invoicesByNumber.set(inv.invoiceNumber.toLowerCase(), inv);
    }
  }

  const deliveryOrdersByNumber = new Map<string, DeliveryOrderLookupRecord>();
  for (const order of deliveryOrdersRows) {
    deliveryOrdersByNumber.set(order.doNumber.toLowerCase(), order);
  }

  const fuelRequestsByDo = new Map<string, FuelRequestLookupRecord[]>();
  for (const request of fuelRequests) {
    const key = request.deliveryOrder.doNumber.toLowerCase();
    const list = fuelRequestsByDo.get(key) ?? [];
    list.push(request);
    fuelRequestsByDo.set(key, list);
  }

  return {
    userId,
    ticketsByRef,
    purchaseOrdersByRef,
    directPurchasesByRef,
    workPointsById,
    projectsById,
    sentKoNumbers,
    knownKoNumbers,
    acknowledgedKoNumbers,
    subkonTermynByKey,
    subkonTermynsById,
    subkonContractsByRef,
    addendumsByRef,
    bastsByRef,
    blueprintsByRef,
    drawingsByRef,
    rentalsList: rentalsRows,
    invoicesByNumber,
    deliveryOrdersByNumber,
    fuelRequestsByDo,
  };
}

function isPurchaseOrderTerminalOrPaid(order: {
  status: POStatus;
  paidAt: Date | null;
}): boolean {
  return (
    order.paidAt !== null ||
    order.status === POStatus.REJECTED ||
    order.status === POStatus.CANCELLED
  );
}

function resolveNotificationCompleted(
  notification: RawNotificationRow,
  target: ParsedNotificationTarget,
  ctx: NotificationResolutionContext,
): boolean {
  const titleLower = notification.title.toLowerCase();
  const ticketRef =
    target.openSheet ??
    target.ticketIdParam ??
    target.ticketNumber?.toLowerCase() ??
    null;
  const ticket = ticketRef
    ? ctx.ticketsByRef.get(ticketRef) ??
      ctx.ticketsByRef.get(ticketRef.toLowerCase()) ??
      null
    : null;
  const po =
    (target.openSheet && ctx.purchaseOrdersByRef.get(target.openSheet)) ||
    (target.documentCode && ctx.purchaseOrdersByRef.get(target.documentCode)) ||
    (target.poNumber &&
      ctx.purchaseOrdersByRef.get(target.poNumber.toLowerCase())) ||
    null;
  const directPurchase =
    (target.openSheet && ctx.directPurchasesByRef.get(target.openSheet)) ||
    (target.purchaseNumber &&
      ctx.directPurchasesByRef.get(target.purchaseNumber.toLowerCase())) ||
    null;

  const subkonTermyn =
    (target.subkonTermyn &&
      ctx.subkonTermynByKey.get(
        `${target.subkonTermyn.contractNumber.toLowerCase()}::${target.subkonTermyn.termynNumber}`,
      )) ||
    (target.openSheet && ctx.subkonTermynsById.get(target.openSheet)) ||
    null;

  if (target.pathname === "/apps/approvals") {
    if (target.tab === "wages") {
      if (target.openSheet) {
        const workPoint = ctx.workPointsById.get(target.openSheet);
        if (workPoint) return workPoint.wageApprovedAt !== null;

        const contract = ctx.subkonContractsByRef.get(target.openSheet);
        if (contract) return contract.status !== SPKStatus.PENDING_APPROVAL;

        const addendum = ctx.addendumsByRef.get(target.openSheet);
        if (addendum) {
          return addendum.status !== ProjectAddendumStatus.PENDING_APPROVAL;
        }

        const bast = ctx.bastsByRef.get(target.openSheet);
        if (bast) return bast.isApproved;
      }

      if (subkonTermyn) {
        return subkonTermyn.status !== SubkonTermynStatus.FINANCE_CHECKED;
      }
      if (target.addendumNumber) {
        const addendum = ctx.addendumsByRef.get(
          target.addendumNumber.toLowerCase(),
        );
        if (addendum) {
          return addendum.status !== ProjectAddendumStatus.PENDING_APPROVAL;
        }
      }
      if (target.bastNumber) {
        const bast = ctx.bastsByRef.get(target.bastNumber.toLowerCase());
        if (bast) return bast.isApproved;
      }
      return true;
    }
    if (target.tab === "po") {
      return !po || po.status !== POStatus.PENDING_APPROVAL;
    }
    if (target.tab === "direct-purchase") {
      if (directPurchase) {
        return (
          directPurchase.isApprovedByDirector ||
          directPurchase.status === DirectStockPurchaseStatus.RECEIVED
        );
      }
      if (ticket) {
        return ticket.status !== TicketStatus.PENDING_DIRECTOR;
      }
      return Boolean(target.openSheet);
    }
  }

  if (target.pathname === "/apps/finance") {
    if (target.tab === "check") {
      return (
        !po ||
        (po.status !== POStatus.DRAFT &&
          po.status !== POStatus.PENDING_FINANCE_REVIEW)
      );
    }
    if (target.tab === "payments") {
      if (directPurchase) {
        return (
          directPurchase.paidAt !== null ||
          directPurchase.status === DirectStockPurchaseStatus.RECEIVED
        );
      }
      if (po) {
        return isPurchaseOrderTerminalOrPaid(po);
      }
      if (ticket) {
        if (
          ticket.status === TicketStatus.COMPLETED ||
          ticket.status === TicketStatus.REJECTED
        ) {
          return true;
        }
        if (titleLower.includes("po disetujui")) {
          if (
            ticket.purchaseOrders.length > 0 &&
            ticket.purchaseOrders.every((linkedPo) =>
              isPurchaseOrderTerminalOrPaid(linkedPo),
            )
          ) {
            return true;
          }
          return (
            ticket.status !== TicketStatus.PROCESSED_LOGISTIC &&
            ticket.status !== TicketStatus.WAITING_FINANCE_PAYMENT
          );
        }
        return ticket.status !== TicketStatus.WAITING_FINANCE_PAYMENT;
      }
      return Boolean(target.openSheet);
    }
    if (target.tab === "subcontract") {
      if (titleLower.includes("bast")) {
        return notification.isRead;
      }
      if (target.subkonTermyn) {
        const key = `${target.subkonTermyn.contractNumber.toLowerCase()}::${target.subkonTermyn.termynNumber}`;
        const termyn = ctx.subkonTermynByKey.get(key);
        if (
          !termyn ||
          termyn.status === SubkonTermynStatus.PAID ||
          termyn.status === SubkonTermynStatus.REJECTED
        ) {
          return true;
        }
        if (titleLower.includes("terverifikasi lapangan")) {
          return termyn.status !== SubkonTermynStatus.FIELD_VERIFIED;
        }
        if (titleLower.includes("siap dibayar")) {
          return termyn.status !== SubkonTermynStatus.APPROVED;
        }
        return false;
      }
    }
    if (target.tab === "rentals") {
      const matchingRentals = ctx.rentalsList.filter(
        (rental) =>
          notification.message.includes(rental.name) &&
          notification.message.includes(rental.vendorName),
      );
      if (matchingRentals.length > 0) {
        return !matchingRentals.some(
          (rental) => rental.paymentStatus === "PENDING_PAYMENT",
        );
      }
      return ctx.rentalsList.every(
        (rental) => rental.paymentStatus !== "PENDING_PAYMENT",
      );
    }
    if (target.tab === "") {
      if (target.invoiceNumber) {
        const invoice = ctx.invoicesByNumber.get(
          target.invoiceNumber.toLowerCase(),
        );
        return !invoice || invoice.acknowledgedAt !== null;
      }
      if (target.koNumber) {
        const key = target.koNumber.toLowerCase();
        return (
          !ctx.knownKoNumbers.has(key) || ctx.acknowledgedKoNumbers.has(key)
        );
      }
    }
    if (target.tab === "fuel-requests" && target.doNumber) {
      const requests =
        ctx.fuelRequestsByDo.get(target.doNumber.toLowerCase()) ?? [];
      if (titleLower.includes("reimbursement")) {
        return !requests.some(
          (req) => req.status === VehicleFuelRequestStatus.PENDING_FINANCE,
        );
      }
      if (titleLower.includes("bukti pengisian")) {
        return !requests.some(
          (req) => req.status === VehicleFuelRequestStatus.PROOF_SUBMITTED,
        );
      }
      return notification.isRead;
    }
  }

  if (target.pathname === "/apps/orders/new") {
    return (
      !ticket ||
      ticket.deliveryOrders.length > 0 ||
      (ticket.status !== TicketStatus.PROCESSED_FINANCE &&
        ticket.status !== TicketStatus.PROCESSED_LOGISTIC)
    );
  }

  if (target.pathname === "/apps/logistics") {
    if (target.tab === "tickets") {
      if (titleLower.includes("pengiriman do mover selesai")) {
        return notification.isRead;
      }
      return (
        !ticket ||
        ticket.fulfillmentStatus === TicketFulfillmentStatus.COMPLETED ||
        (ticket.status !== TicketStatus.DRAFT &&
          ticket.status !== TicketStatus.PENDING_DIRECTOR &&
          ticket.status !== TicketStatus.APPROVED_DIR &&
          ticket.status !== TicketStatus.PROCESSED_LOGISTIC)
      );
    }
    if (target.tab === "equipment") {
      return notification.isRead;
    }
    if (target.tab === "stock") {
      if (target.purchaseNumber || directPurchase) {
        if (!directPurchase) return true;
        if (titleLower.includes("lampirkan invoice")) {
          return (
            Boolean(directPurchase.vendorInvoiceUrl) ||
            directPurchase.status === DirectStockPurchaseStatus.RECEIVED
          );
        }
        if (titleLower.includes("lunas")) {
          return (
            notification.isRead ||
            directPurchase.status === DirectStockPurchaseStatus.RECEIVED
          );
        }
        return directPurchase.status === DirectStockPurchaseStatus.RECEIVED;
      }
      if (target.poNumber || po) {
        if (!po) return true;
        return (
          Boolean(po.vendorInvoiceUrl) ||
          po.paidAt !== null ||
          po.stockPurchases.length > 0 ||
          po.status === POStatus.REJECTED ||
          po.status === POStatus.CANCELLED
        );
      }
    }
    if (target.tab === "documents") {
      if (target.koNumber) {
        const key = target.koNumber.toLowerCase();
        return !ctx.knownKoNumbers.has(key) || ctx.sentKoNumbers.has(key);
      }
      if (target.poNumber || po) {
        return (
          !po ||
          po.stockPurchases.length > 0 ||
          po.status === POStatus.REJECTED ||
          po.status === POStatus.CANCELLED
        );
      }
    }
    if (target.tab === "" && titleLower.includes("tugas pengiriman do baru")) {
      const deliveryOrder = target.doNumber
        ? ctx.deliveryOrdersByNumber.get(target.doNumber.toLowerCase())
        : null;
      if (!deliveryOrder) return true;
      if (
        deliveryOrder.status === DOStatus.DELIVERED ||
        deliveryOrder.status === DOStatus.RETURNED
      ) {
        return true;
      }
      if (
        ticket &&
        (ticket.status === TicketStatus.COMPLETED ||
          ticket.status === TicketStatus.REJECTED)
      ) {
        return true;
      }
      return false;
    }
    if (
      target.tab === "" &&
      titleLower.includes("do menunggu konfirmasi") &&
      target.doNumber
    ) {
      const deliveryOrder = ctx.deliveryOrdersByNumber.get(
        target.doNumber.toLowerCase(),
      );
      return !deliveryOrder || deliveryOrder.acknowledgedAt !== null;
    }
    if (target.tab === "" && titleLower.includes("dana bbm disetujui")) {
      if (target.doNumber) {
        const requests =
          ctx.fuelRequestsByDo.get(target.doNumber.toLowerCase()) ?? [];
        const stillNeedsProof = requests.some(
          (req) =>
            req.requestedById === ctx.userId &&
            req.status === VehicleFuelRequestStatus.FUNDED,
        );
        return !stillNeedsProof;
      }
    }
    if (
      titleLower.includes("bbm ditolak") ||
      titleLower.includes("rekonsiliasi bbm selesai")
    ) {
      return notification.isRead;
    }
    if (titleLower.includes("material tiba di gudang")) {
      return notification.isRead;
    }
  }

  if (target.pathname === "/apps/drafter") {
    if (
      titleLower.includes("menunggu review") ||
      titleLower.includes("siap ditinjau")
    ) {
      const code = target.leadingCode?.toLowerCase();
      if (!code) return notification.isRead;
      const scopedKey = target.projectIdParam
        ? `${target.projectIdParam}::${code}`
        : code;
      const blueprint =
        ctx.blueprintsByRef.get(scopedKey) ?? ctx.blueprintsByRef.get(code);
      if (blueprint) {
        return blueprint.status !== BlueprintStatus.FOR_APPROVAL;
      }
      const drawing =
        ctx.drawingsByRef.get(scopedKey) ?? ctx.drawingsByRef.get(code);
      if (drawing) {
        return drawing.status !== "REVIEW";
      }
      return true;
    }
    return notification.isRead;
  }

  if (target.pathname === "/apps/tickets") {
    if (titleLower.includes("revisi")) {
      return !ticket || ticket.status !== TicketStatus.DRAFT;
    }
    if (titleLower.includes("permintaan material baru")) {
      return (
        !ticket ||
        (ticket.status !== TicketStatus.DRAFT &&
          ticket.status !== TicketStatus.PENDING_DIRECTOR &&
          ticket.status !== TicketStatus.APPROVED_DIR &&
          ticket.status !== TicketStatus.PROCESSED_LOGISTIC)
      );
    }
    if (
      notification.type === NotificationType.WARNING ||
      notification.type === NotificationType.SUCCESS ||
      titleLower.includes("ditolak") ||
      titleLower.includes("selesai") ||
      titleLower.includes("dibayar") ||
      titleLower.includes("lunas") ||
      titleLower.includes("tiba di gudang") ||
      titleLower.includes("disetujui") ||
      titleLower.includes("diterbitkan")
    ) {
      return notification.isRead;
    }
    if (!ticket || ticket.status === TicketStatus.COMPLETED) {
      return true;
    }
    return notification.isRead;
  }

  if (target.pathname === "/apps/projects") {
    if (titleLower.includes("klaim termin subkon baru")) {
      return !subkonTermyn || subkonTermyn.status !== SubkonTermynStatus.SUBMITTED;
    }
    if (target.projectIdParam) {
      const project = ctx.projectsById.get(target.projectIdParam);
      if (!project || project.isDeleted) return true;
      if (
        titleLower.includes("bast") ||
        titleLower.includes("retensi") ||
        titleLower.includes("pembayaran termin")
      ) {
        return notification.isRead;
      }
      return project.status === ProjectStatus.COMPLETED || notification.isRead;
    }
  }

  if (target.pathname.startsWith("/d/")) {
    if (!po) return true;
    if (
      po.status === POStatus.REJECTED ||
      po.status === POStatus.CANCELLED ||
      (po.ticket &&
        (po.ticket.status === TicketStatus.COMPLETED ||
          po.ticket.status === TicketStatus.REJECTED))
    ) {
      return true;
    }
  }

  if (
    !notification.actionUrl ||
    target.pathname.startsWith("/user-profile")
  ) {
    return notification.isRead;
  }

  const isOutcomeNotice =
    notification.type === NotificationType.SUCCESS ||
    notification.type === NotificationType.WARNING ||
    titleLower.includes("selesai") ||
    titleLower.includes("ditolak") ||
    titleLower.includes("lunas") ||
    titleLower.includes("dibayar") ||
    titleLower.includes("tiba di gudang");

  if (isOutcomeNotice) {
    return notification.isRead;
  }

  if (
    ticket &&
    (ticket.status === TicketStatus.COMPLETED ||
      ticket.status === TicketStatus.REJECTED)
  ) {
    return true;
  }

  return false;
}

/**
 * Fetches active daily habits, today's incomplete work tasks, and open ticket
 * status updates shown as bell reminders for the current user.
 */
export async function getPendingBellTaskReminders(
  userId: string,
): Promise<BellTaskReminder[]> {
  const todayKey = getJakartaDateKey();
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
  const tomorrowDate = new Date(`${shiftDateKey(todayKey, 1)}T00:00:00.000Z`);
  const { start: todayStart, endExclusive: tomorrowStart } =
    getJakartaDayRange(todayKey);
  const weekday = new Date(`${todayKey}T00:00:00.000Z`).getUTCDay();
  const scheduledFrequencies: HabitFrequency[] =
    weekday >= 1 && weekday <= 5
      ? [HabitFrequency.DAILY, HabitFrequency.WEEKDAYS]
      : [HabitFrequency.DAILY, HabitFrequency.WEEKENDS];

  const [recentTicketUpdates, pendingHabits, todayWorkTasks] = await Promise.all([
    prisma.ticketAuditLog.findMany({
      where: {
        userId: { not: userId },
        ticket: {
          requesterId: userId,
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
        userId,
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
          { assigneeId: userId },
          { creatorId: userId },
          { members: { some: { userId } } },
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

  return [
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
}

/**
 * Returns the live notification bell feed after filtering out items whose
 * underlying operational task has already been completed.
 */
export async function getNotificationFeedForUser({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}): Promise<NotificationFeed> {
  const [unreadRows, recentRows, taskReminders] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, isRead: false },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    getPendingBellTaskReminders(userId),
  ]);

  const combinedById = new Map<string, RawNotificationRow>();
  for (const row of unreadRows) {
    combinedById.set(row.id, row);
  }
  for (const row of recentRows) {
    if (!combinedById.has(row.id)) {
      combinedById.set(row.id, row);
    }
  }
  const allRows = Array.from(combinedById.values()).sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );

  const parsedEntries = allRows.map((row) => ({
    row,
    target: parseNotificationTarget(row),
  }));
  const ctx = await buildNotificationResolutionContext(userId, parsedEntries);

  const completedUnreadIds: string[] = [];
  const activeRows: RawNotificationRow[] = [];

  for (const { row, target } of parsedEntries) {
    if (resolveNotificationCompleted(row, target, ctx)) {
      if (!row.isRead) {
        completedUnreadIds.push(row.id);
      }
      continue;
    }
    activeRows.push(row);
  }

  if (completedUnreadIds.length > 0) {
    await prisma.notification
      .updateMany({
        where: { id: { in: completedUnreadIds }, userId, isRead: false },
        data: { isRead: true },
      })
      .catch((error: unknown) => {
        console.error(
          "[Notification] Failed to mark completed notifications as read:",
          error,
        );
      });
  }

  const activeUnread = activeRows.filter((row) => !row.isRead);
  const startsWith = (url: string | null, prefix: string) =>
    Boolean(url?.startsWith(prefix));

  const executiveCount = activeUnread.filter((row) =>
    startsWith(row.actionUrl, "/apps/approvals"),
  ).length;
  const logisticsCount = activeUnread.filter(
    (row) =>
      startsWith(row.actionUrl, "/apps/logistics") ||
      startsWith(row.actionUrl, "/apps/orders/new") ||
      (role === UserRole.LOGISTICS && startsWith(row.actionUrl, "/d/")),
  ).length;
  const financeCount = activeUnread.filter(
    (row) =>
      startsWith(row.actionUrl, "/apps/finance") ||
      (role === UserRole.FINANCE && startsWith(row.actionUrl, "/d/")),
  ).length;

  const visibleNotifications: NotificationFeedItem[] = activeRows
    .slice(0, 25)
    .map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      isRead: row.isRead,
      actionUrl: row.actionUrl,
      createdAt: row.createdAt.toISOString(),
    }));

  return {
    unreadCount: activeUnread.length,
    notifications: visibleNotifications,
    taskReminders,
    sidebarCounts: {
      executive: executiveCount,
      logistics: logisticsCount,
      finance: financeCount,
    },
  };
}
