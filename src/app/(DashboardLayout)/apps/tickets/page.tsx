import TicketsApp from "@/app/components/apps/tickets";
import CreateTicketModal from "@/app/components/apps/tickets/CreateTicketModal";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import type { Metadata } from "next";
import {
  PaymentStatus,
  TicketFulfillmentStatus,
  TicketPriority,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getTicketPageVisibilityWhere } from "@/lib/ticket-visibility";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { connectToMongoDB } from "@/lib/mongoose";
import EquipmentTicket from "@/models/ticket";
import TicketAuditLog from "@/models/ticket-audit-log";
import User from "@/models/user";
import Project from "@/models/project";
import {
  EQUIPMENT_TIME_UNITS,
  EQUIPMENT_REQUEST_TYPE,
} from "@/lib/equipment-request";
import {
  createStockPriceLookup,
  resolveTicketTotalAmount,
} from "@/lib/resolve-ticket-total-amount";
import type { TicketRow } from "../../types/ticket";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
  title: "Tiket & Permintaan",
};

const BCrumb = [
  {
    to: "/",
    title: "Beranda",
  },
  {
    title: "Tiket & Permintaan",
  },
];

function getEquipmentTicketVisibilityFilter(role: UserRole, userId: string) {
  const requester = { requesterId: userId };
  switch (role) {
    case UserRole.DIRECTOR:
    case UserRole.DEPUTY_DIRECTOR:
      return { $or: [{ status: { $ne: TicketStatus.DRAFT } }, requester] };
    case UserRole.KOORDINATOR:
      return {
        $or: [{ status: TicketStatus.PENDING_DIRECTOR }, requester],
      };
    case UserRole.FINANCE:
      return {
        $or: [
          {
            status: {
              $in: [
                TicketStatus.WAITING_FINANCE_PAYMENT,
                TicketStatus.PROCESSED_FINANCE,
                TicketStatus.PROCESSED_LOGISTIC,
                TicketStatus.COMPLETED,
              ],
            },
          },
          requester,
        ],
      };
    case UserRole.LOGISTICS:
      return {
        $or: [
          {
            status: {
              $in: [
                "PENDING_LOGISTIK",
                TicketStatus.PROCESSED_LOGISTIC,
                TicketStatus.PROCESSED_FINANCE,
                TicketStatus.ASSIGNED_TO_MOVER,
                TicketStatus.IN_TRANSIT,
              ],
            },
          },
          requester,
        ],
      };
    case UserRole.ADMINISTRATIONS:
      return {};
    default:
      return requester;
  }
}

function requireTicketEnumValue<T extends string>(
  values: readonly T[],
  value: string,
  fieldName: string,
): T {
  const match = values.find((candidate) => candidate === value);
  if (!match) {
    throw new Error(`Tiket alat memiliki nilai ${fieldName} yang tidak valid.`);
  }
  return match;
}

const Tickets = async ({
  searchParams,
}: {
  searchParams: Promise<{ openSheet?: string; filter?: string; create?: string }>;
}) => {
  const { openSheet, filter, create } = await searchParams;
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }
  if (session.user.role === UserRole.MOVER) {
    redirect("/apps/logistics");
  }

  const where = getTicketPageVisibilityWhere(
    session.user.role,
    session.user.id,
  );

  const [tickets, projects, stockItems, vendors, movers] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        requester: {
          select: {
            name: true,
            bankName: true,
            bankAccountName: true,
            bankAccountNumber: true,
          },
        },
        project: { select: { title: true, kelompokTani: true } },
        items: {
          select: {
            id: true,
            stockItemId: true,
            itemName: true,
            quantity: true,
            unit: true,
            estimatedCost: true,
            categoryHint: true,
            expectedDeliveryDate: true,
            status: true,
            poItemId: true,
            doItemId: true,
          },
          orderBy: { id: "asc" },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true } } },
        },
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          select: {
            publicCode: true,
            poNumber: true,
            vendorName: true,
            paymentMethod: true,
            paymentTerms: true,
            paymentBankName: true,
            paymentAccountNumber: true,
            paymentAccountName: true,
            status: true,
            createdAt: true,
            paidAt: true,
            vendorInvoiceUrl: true,
            vendorPoSentAt: true,
            includeTax: true,
            items: {
              orderBy: { id: "asc" },
              select: {
                itemCode: true,
                itemName: true,
                quantity: true,
                unit: true,
                unitPrice: true,
                totalPrice: true,
              },
            },
            invoices: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, documentUrl: true },
            },
            paymentTransactions: {
              where: { status: PaymentStatus.PAID },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                paymentType: true,
                amount: true,
                transferDestination: true,
                proofOfTransferUrl: true,
                paidAt: true,
              },
            },
          },
        },
        directStockPurchases: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            purchaseNumber: true,
            vendorName: true,
            totalAmount: true,
            status: true,
            isApprovedByDirector: true,
            vendorInvoiceUrl: true,
            arrivalPhotoUrl: true,
            receivedPhotos: true,
            receivedAt: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                stockItemId: true,
                itemName: true,
                quantity: true,
                unit: true,
              },
            },
            paymentTransactions: {
              where: { status: PaymentStatus.PAID },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                paymentType: true,
                amount: true,
                transferDestination: true,
                proofOfTransferUrl: true,
                paidAt: true,
              },
            },
          },
        },
        paymentTransactions: {
          where: { status: PaymentStatus.PAID },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            paymentType: true,
            amount: true,
            transferDestination: true,
            proofOfTransferUrl: true,
            paidAt: true,
          },
        },
        deliveryOrders: {
          orderBy: { createdAt: "desc" },
          select: {
            publicCode: true,
            doNumber: true,
            status: true,
            arrivalPhotoUrl: true,
            deliveryReceiptUrl: true,
            receiptPhotos: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                url: true,
              },
            },
            createdAt: true,
          },
        },
      },
    }),
    prisma.project.findMany({
      where: {
        isDeleted: false,
        ...(session.user.role === UserRole.FIELD_TEAM ||
        session.user.role === UserRole.KOORDINATOR
          ? { fieldPicId: session.user.id }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, title: true, kelompokTani: true },
    }),
    prisma.stockItem.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        unitPrice: true,
        stockQuantity: true,
      },
    }),
    session.user.role === UserRole.LOGISTICS ||
    session.user.role === UserRole.ADMINISTRATIONS
      ? prisma.vendor.findMany({
          where: { isApproved: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            bankName: true,
            bankAccount: true,
            bankHolder: true,
            bankAccounts: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                id: true,
                label: true,
                bankName: true,
                bankAccount: true,
                bankHolder: true,
                isPrimary: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    Promise.resolve([]),
  ]);

  await connectToMongoDB();
  const equipmentTickets = await EquipmentTicket.find({
    ticketType: EQUIPMENT_REQUEST_TYPE,
    ...getEquipmentTicketVisibilityFilter(session.user.role, session.user.id),
  })
    .sort({ createdAt: -1 })
    .lean();
  const equipmentTicketIds = equipmentTickets.map((ticket) =>
    String(ticket._id),
  );
  const [equipmentRequesters, equipmentProjects, equipmentAuditLogs] =
    equipmentTicketIds.length > 0
      ? await Promise.all([
          User.find({
            _id: {
              $in: [
                ...new Set(equipmentTickets.map((ticket) => ticket.requesterId)),
              ],
            },
          })
            .select({
              _id: 1,
              name: 1,
              bankName: 1,
              bankAccountName: 1,
              bankAccountNumber: 1,
            })
            .lean(),
          Project.find({
            _id: {
              $in: [
                ...new Set(
                  equipmentTickets
                    .map((ticket) => ticket.projectId)
                    .filter((projectId): projectId is string =>
                      Boolean(projectId),
                    ),
                ),
              ],
            },
          })
            .select({ _id: 1, title: 1, kelompokTani: 1 })
            .lean(),
          TicketAuditLog.find({ ticketId: { $in: equipmentTicketIds } })
            .sort({ createdAt: -1 })
            .lean(),
        ])
      : [[], [], []];
  const auditUserIds = [
    ...new Set(equipmentAuditLogs.map((audit) => audit.userId)),
  ];
  const auditUsers =
    auditUserIds.length > 0
      ? await User.find({ _id: { $in: auditUserIds } })
          .select({ _id: 1, name: 1 })
          .lean()
      : [];
  const requestersById = new Map(
    equipmentRequesters.map((requester) => [String(requester._id), requester]),
  );
  const projectsById = new Map(
    equipmentProjects.map((project) => [String(project._id), project]),
  );
  const auditUsersById = new Map(
    auditUsers.map((user) => [String(user._id), user]),
  );
  const auditLogsByTicketId = new Map<
    string,
    (typeof equipmentAuditLogs)[number][]
  >();
  for (const audit of equipmentAuditLogs) {
    const logs = auditLogsByTicketId.get(audit.ticketId) ?? [];
    logs.push(audit);
    auditLogsByTicketId.set(audit.ticketId, logs);
  }

  const canViewPaymentDetails =
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.ADMINISTRATIONS;
  const canViewTicketPaymentDetails = (requesterId: string) =>
    canViewPaymentDetails || requesterId === session.user.id;
  const stockPriceLookup = createStockPriceLookup(stockItems);

  const equipmentTicketRows: TicketRow[] = equipmentTickets.map((ticket) => {
    const ticketId = String(ticket._id);
    const requesterId = String(ticket.requesterId);
    const requester = requestersById.get(requesterId);
    if (!requester || typeof requester.name !== "string") {
      throw new Error(`Pemohon tiket alat ${ticket.ticketNumber} tidak ditemukan.`);
    }
    const project = ticket.projectId
      ? projectsById.get(String(ticket.projectId))
      : null;
    const auditLogs = auditLogsByTicketId.get(ticketId) ?? [];
    const ticketPriority = requireTicketEnumValue(
      Object.values(TicketPriority),
      ticket.priority,
      "prioritas",
    );
    const ticketStatus =
      ticket.status === "PENDING_LOGISTIK"
        ? "PENDING_LOGISTIK"
        : requireTicketEnumValue(
            Object.values(TicketStatus),
            ticket.status,
            "status",
          );
    const ticketFulfillmentStatus = requireTicketEnumValue(
      Object.values(TicketFulfillmentStatus),
      ticket.fulfillmentStatus,
      "status pemenuhan",
    );
    const canViewPaymentDetails =
      session.user.role === UserRole.FINANCE ||
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS ||
      requesterId === session.user.id;

    return {
      id: ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description ?? null,
      type: TicketType.OPERATIONAL,
      ticketType: EQUIPMENT_REQUEST_TYPE,
      equipmentDetails: ticket.equipmentDetails
        ? {
            equipmentName: ticket.equipmentDetails.equipmentName ?? null,
            startDate:
              ticket.equipmentDetails.startDate?.toISOString().slice(0, 10) ??
              null,
            duration: ticket.equipmentDetails.duration ?? null,
            timeUnit: requireTicketEnumValue(
              EQUIPMENT_TIME_UNITS,
              ticket.equipmentDetails.timeUnit,
              "satuan waktu",
            ),
            fulfillmentSource:
              ticket.equipmentDetails.fulfillmentSource ?? null,
            vendorName: ticket.equipmentDetails.vendorName ?? null,
            quotedCost: ticket.equipmentDetails.quotedCost ?? null,
            processedAt:
              ticket.equipmentDetails.processedAt?.toISOString() ?? null,
          }
        : null,
      requestCategory: TicketRequestCategory.OPS,
      fieldCategory: null,
      requestPaymentMethod: null,
      requestPaymentDescription: ticket.requestPaymentDescription ?? null,
      transferDestination: ticket.transferDestination ?? null,
      priority: ticketPriority,
      status: ticketStatus,
      fulfillmentStatus: ticketFulfillmentStatus,
      canSubmit: requesterId === session.user.id,
      canRequesterEdit: !auditLogs.some(
        (audit) =>
          audit.userId === requesterId &&
          (audit.action === "UPDATED" || audit.action === "REQUESTER_EDITED"),
      ),
      totalAmount:
        ticket.totalAmount === null || ticket.totalAmount === undefined
          ? ticket.requestedAmount?.toString() ?? null
          : ticket.totalAmount.toString(),
      paymentTransactions: [],
      attachmentUrl: ticket.attachmentUrl ?? null,
      receiptUrls: ticket.receiptUrls ?? [],
      paymentProofUrl: ticket.paymentProofUrl ?? null,
      purchaseReceiptUrl: ticket.purchaseReceiptUrl ?? null,
      transferReceiptUrl: ticket.transferReceiptUrl ?? null,
      deliveryReceiptUrl: ticket.deliveryReceiptUrl ?? null,
      recipientName: canViewPaymentDetails
        ? ticket.recipientName ?? requester.bankAccountName ?? null
        : null,
      bankName: canViewPaymentDetails
        ? ticket.bankName ?? requester.bankName ?? null
        : null,
      accountNumber: canViewPaymentDetails
        ? ticket.accountNumber ?? requester.bankAccountNumber ?? null
        : null,
      createdAt: ticket.createdAt.toISOString(),
      requester: { name: requester.name },
      project: project
        ? {
            title: project.title,
            kelompokTani: project.kelompokTani,
          }
        : null,
      items: [],
      auditLogs: auditLogs.map((audit) => {
        const user = auditUsersById.get(String(audit.userId));
        if (!user || typeof user.name !== "string") {
          throw new Error(`Pengguna audit tiket ${ticket.ticketNumber} tidak ditemukan.`);
        }
        return {
          id: String(audit._id),
          action: audit.action,
          notes: audit.notes ?? null,
          createdAt: audit.createdAt.toISOString(),
          user: { name: user.name },
        };
      }),
      purchaseOrders: [],
      directStockPurchases: [],
      deliveryOrders: [],
    };
  });
  const equipmentTicketIdSet = new Set(equipmentTicketIds);
  const legacyTicketRows: TicketRow[] = tickets
    .filter((ticket) => !equipmentTicketIdSet.has(ticket.id))
    .map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    ticketType: null,
    equipmentDetails: null,
    requestCategory: ticket.requestCategory,
    fieldCategory: ticket.fieldCategory,
    requestPaymentMethod: ticket.requestPaymentMethod,
    requestPaymentDescription: ticket.requestPaymentDescription,
    transferDestination: ticket.transferDestination,
    priority: ticket.priority,
    status: ticket.status,
    fulfillmentStatus: ticket.fulfillmentStatus,
    canSubmit: ticket.requesterId === session.user.id,
    canRequesterEdit: !ticket.auditLogs.some(
      (audit) =>
        audit.userId === ticket.requesterId &&
        (audit.action === "UPDATED" || audit.action === "REQUESTER_EDITED"),
    ),
    totalAmount: resolveTicketTotalAmount(ticket, stockPriceLookup),
    attachmentUrl: ticket.attachmentUrl,
    receiptUrls: ticket.receiptUrls,
    paymentProofUrl: ticket.paymentProofUrl,
    purchaseReceiptUrl: ticket.purchaseReceiptUrl,
    transferReceiptUrl: ticket.transferReceiptUrl,
    deliveryReceiptUrl: ticket.deliveryReceiptUrl,
    recipientName: canViewTicketPaymentDetails(ticket.requesterId)
      ? ticket.recipientName ?? ticket.requester.bankAccountName
      : null,
    bankName: canViewTicketPaymentDetails(ticket.requesterId)
      ? ticket.bankName ?? ticket.requester.bankName
      : null,
    accountNumber: canViewTicketPaymentDetails(ticket.requesterId)
      ? ticket.accountNumber ?? ticket.requester.bankAccountNumber
      : null,
    createdAt: ticket.createdAt.toISOString(),
    requester: { name: ticket.requester.name },
    project: ticket.project,
    items: ticket.items.map((item) => ({
      ...item,
      estimatedCost:
        item.estimatedCost !== null
          ? decimalStringFromScaledInteger(item.estimatedCost)
          : null,
      expectedDeliveryDate:
        item.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    })),
    auditLogs: ticket.auditLogs.map((audit) => ({
      ...audit,
      createdAt: audit.createdAt.toISOString(),
    })),
    purchaseOrders: ticket.purchaseOrders.map((purchaseOrder) => ({
      publicCode: purchaseOrder.publicCode,
      poNumber: purchaseOrder.poNumber,
      vendorName: purchaseOrder.vendorName,
      paymentMethod: purchaseOrder.paymentMethod,
      paymentTerms: purchaseOrder.paymentTerms,
      paymentBankName: purchaseOrder.paymentBankName,
      paymentAccountNumber: purchaseOrder.paymentAccountNumber,
      paymentAccountName: purchaseOrder.paymentAccountName,
      status: purchaseOrder.status,
      createdAt: purchaseOrder.createdAt.toISOString(),
      paidAt: purchaseOrder.paidAt?.toISOString() ?? null,
      vendorInvoiceUrl:
        purchaseOrder.vendorInvoiceUrl ??
        purchaseOrder.invoices?.[0]?.documentUrl ??
        null,
      vendorPoSentAt: purchaseOrder.vendorPoSentAt?.toISOString() ?? null,
      invoiceId: purchaseOrder.invoices?.[0]?.id ?? null,
      includeTax: purchaseOrder.includeTax,
      items: purchaseOrder.items.map((item) => ({
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
      })),
    })),
    directStockPurchases: ticket.directStockPurchases.map((purchase) => ({
      ...purchase,
      totalAmount: decimalStringFromScaledInteger(purchase.totalAmount),
      receivedAt: purchase.receivedAt?.toISOString() ?? null,
      hasFinanceProof: purchase.paymentTransactions.some((p) =>
        Boolean(p.proofOfTransferUrl)
      ),
      createdAt: purchase.createdAt.toISOString(),
      items: purchase.items.map((item) => ({
        ...item,
        quantity: decimalStringFromScaledInteger(item.quantity),
      })),
    })),
    paymentTransactions:
      session.user.role === UserRole.FINANCE ||
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS ||
      ticket.requesterId === session.user.id
        ? [
            ...ticket.paymentTransactions.map((payment) => ({
              ...payment,
              reference: ticket.ticketNumber,
            })),
            ...ticket.purchaseOrders.flatMap(
              (purchaseOrder) =>
                purchaseOrder.paymentTransactions.map((payment) => ({
                  ...payment,
                  reference: purchaseOrder.poNumber,
                })),
            ),
            ...ticket.directStockPurchases.flatMap((purchase) =>
              purchase.paymentTransactions.map((payment) => ({
                ...payment,
                reference: purchase.purchaseNumber,
              })),
            ),
          ]
            .sort(
              (a, b) =>
                (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0),
            )
            .map((payment) => ({
              ...payment,
              paidAt: payment.paidAt?.toISOString() ?? null,
            }))
        : [],
    deliveryOrders: ticket.deliveryOrders.map((deliveryOrder) => ({
      ...deliveryOrder,
      createdAt: deliveryOrder.createdAt.toISOString(),
    })),
    }));
  const ticketRows = [...equipmentTicketRows, ...legacyTicketRows].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return (
    <>
      <div>
        <BreadcrumbComp
          title="Tiket & Permintaan Lapangan"
          items={BCrumb}
          action={
            <CreateTicketModal
              projects={projects}
              requesterRole={session.user.role}
              movers={movers}
              defaultOpen={create === "1"}
              stockItems={stockItems.map((item) => ({
                ...item,
                unitPrice: decimalStringFromScaledInteger(item.unitPrice),
                stockQuantity: decimalStringFromScaledInteger(item.stockQuantity),
              }))}
            />
          }
        />
      </div>
      <TicketsApp
        tickets={ticketRows}
        projects={projects}
        vendors={vendors}
        stockItems={stockItems.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          unitPrice: decimalStringFromScaledInteger(item.unitPrice),
        }))}
        role={session.user.role}
        initialOpenSheet={openSheet}
        initialFilter={filter}
      />
    </>
  );
};

export default Tickets;
