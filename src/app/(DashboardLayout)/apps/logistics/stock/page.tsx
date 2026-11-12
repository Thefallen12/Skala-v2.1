import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BreadcrumbComp from "../../../layout/shared/breadcrumb/BreadcrumbComp";
import LogisticsWorkspace from "@/app/components/apps/tickets/LogisticsWorkspace";
import {
  DirectStockPurchaseStatus,
  FulfillmentStatus,
  PaymentStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const metadata: Metadata = {
  title: "Stok Logistik",
};

const logisticsRoles: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
  UserRole.KOORDINATOR,
  UserRole.FINANCE,
  UserRole.FIELD_TEAM,
  UserRole.MOVER,
];

export default async function LogisticsStockPage({
  searchParams,
}: {
  searchParams: Promise<{ createTicket?: string; purchaseStock?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!logisticsRoles.includes(session.user.role)) redirect("/apps/tickets");
  const query = await searchParams;
  const initialAction =
    query.createTicket === "1"
      ? "ticket"
      : query.purchaseStock === "1"
        ? "stock-purchase"
        : undefined;

  const [
    stockItems,
    projects,
    vendors,
    directStockPurchases,
    purchaseTickets,
  ] = await Promise.all([
    prisma.stockItem.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, title: true, kelompokTani: true },
    }),
    prisma.vendor.findMany({
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
    }),
    session.user.role === UserRole.MOVER
      ? Promise.resolve([])
      : prisma.directStockPurchase.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            purchaseNumber: true,
            vendorName: true,
            status: true,
            isApprovedByDirector: true,
            vendorInvoiceUrl: true,
            vendorInvoiceUploadedAt: true,
            vendorInvoiceUploadedBy: { select: { name: true } },
            totalAmount: true,
            createdAt: true,
            receivedAt: true,
            arrivalPhotoUrl: true,
            receivedPhotos: true,
            paymentTransactions: {
              where: { status: PaymentStatus.PAID },
              select: { proofOfTransferUrl: true },
            },
            items: {
              select: { id: true, itemName: true, quantity: true, unit: true },
            },
            receivedBy: { select: { name: true } },
            ticket: {
              select: { id: true, ticketNumber: true, title: true },
            },
          },
        }),
    prisma.ticket.findMany({
      where: {
        type: TicketType.MATERIAL,
        status: TicketStatus.PROCESSED_LOGISTIC,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        directStockPurchases: {
          where: { status: DirectStockPurchaseStatus.PENDING_RECEIPT },
          select: {
            items: {
              select: {
                stockItemId: true,
                itemName: true,
                unit: true,
              },
            },
          },
        },
        items: {
          where: { status: FulfillmentStatus.PENDING },
          select: {
            id: true,
            stockItemId: true,
            itemName: true,
            quantity: true,
            unit: true,
            estimatedCost: true,
            poItemId: true,
            doItemId: true,
          },
        },
      },
    }),
  ]);

  return (
    <>
      <BreadcrumbComp
        title="Stok Logistik"
        items={[
          { to: "/", title: "Beranda" },
          { to: "/apps/logistics", title: "Logistik Lapangan" },
          { title: "Stok Logistik" },
        ]}
      />
      <LogisticsWorkspace
        tickets={[]}
        projects={projects}
        role={session.user.role}
        mode="stock"
        initialAction={initialAction}
        purchaseTickets={purchaseTickets
          .map((ticket) => {
            const activeStockIds = new Set(
              ticket.directStockPurchases.flatMap((purchase) =>
                purchase.items
                  .map((purchaseItem) => purchaseItem.stockItemId)
                  .filter((id): id is string => Boolean(id))
              )
            );
            const activeNameUnits = new Set(
              ticket.directStockPurchases.flatMap((purchase) =>
                purchase.items.map(
                  (purchaseItem) =>
                    `${purchaseItem.itemName.trim().toLowerCase()}::${purchaseItem.unit.trim().toLowerCase()}`
                )
              )
            );
            const eligibleItems = ticket.items
              .filter((item) => {
                if (item.poItemId || item.doItemId) {
                  return false;
                }
                if (item.stockItemId && activeStockIds.has(item.stockItemId)) {
                  return false;
                }
                const key = `${item.itemName.trim().toLowerCase()}::${item.unit.trim().toLowerCase()}`;
                return !activeNameUnits.has(key);
              })
              .map((item) => ({
                ticketItemId: item.id,
                stockItemId: item.stockItemId,
                itemName: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
                estimatedCost:
                  item.estimatedCost !== null
                    ? decimalStringFromScaledInteger(item.estimatedCost)
                    : null,
              }));
            return {
              id: ticket.id,
              ticketNumber: ticket.ticketNumber,
              title: ticket.title,
              items: eligibleItems,
            };
          })
          .filter((ticket) => ticket.items.length > 0)}
        vendors={vendors}
        stockItems={stockItems.map((item) => ({
          ...item,
          stockQuantity: decimalStringFromScaledInteger(item.stockQuantity),
          minimumStock: decimalStringFromScaledInteger(item.minimumStock),
          unitPrice: decimalStringFromScaledInteger(item.unitPrice),
          createdAt: item.createdAt.toISOString(),
        }))}
        stockPurchases={directStockPurchases.map((purchase) => ({
          ...purchase,
          totalAmount: decimalStringFromScaledInteger(purchase.totalAmount),
          hasFinanceProof: purchase.paymentTransactions.some(
            (payment) => Boolean(payment.proofOfTransferUrl),
          ),
          createdAt: purchase.createdAt.toISOString(),
          receivedAt: purchase.receivedAt?.toISOString() ?? null,
          vendorInvoiceUploadedAt:
            purchase.vendorInvoiceUploadedAt?.toISOString() ?? null,
          items: purchase.items.map((item) => ({
            ...item,
            quantity: decimalStringFromScaledInteger(item.quantity),
          })),
        }))}
      />
    </>
  );
}
