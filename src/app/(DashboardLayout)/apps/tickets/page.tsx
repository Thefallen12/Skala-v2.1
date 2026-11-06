import TicketsApp from "@/app/components/apps/tickets";
import CreateTicketModal from "@/app/components/apps/tickets/CreateTicketModal";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import type { Metadata } from "next";
import { PaymentStatus, UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getTicketPageVisibilityWhere } from "@/lib/ticket-visibility";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import type { TicketRow } from "../../types/ticket";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
  title: "Ticket App",
};

const BCrumb = [
  {
    to: "/",
    title: "Home",
  },
  {
    title: "Tickets",
  },
];
const Tickets = async ({
  searchParams,
}: {
  searchParams: Promise<{ openSheet?: string; filter?: string }>;
}) => {
  const { openSheet, filter } = await searchParams;
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
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
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
            createdAt: true,
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

  const canViewPaymentDetails =
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.ADMINISTRATIONS;
  const canViewTicketPaymentDetails = (requesterId: string) =>
    canViewPaymentDetails || requesterId === session.user.id;
  const ticketRows: TicketRow[] = tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
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
    totalAmount:
      ticket.purchaseOrders[0]?.items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      ).toString() ??
      (ticket.totalAmount !== null
        ? decimalStringFromScaledInteger(ticket.totalAmount)
        : null) ??
      null,
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
        purchaseOrder.invoices[0]?.documentUrl ??
        null,
      vendorPoSentAt: purchaseOrder.vendorPoSentAt?.toISOString() ?? null,
      invoiceId: purchaseOrder.invoices[0]?.id ?? null,
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
      createdAt: purchase.createdAt.toISOString(),
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

  return (
    <>
      <div className="tickets-page-brand">
        <BreadcrumbComp
          title="Tickets App"
          items={BCrumb}
          action={
            <CreateTicketModal
              projects={projects}
              requesterRole={session.user.role}
              movers={movers}
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
