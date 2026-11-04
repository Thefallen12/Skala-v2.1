import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BreadcrumbComp from "../../../layout/shared/breadcrumb/BreadcrumbComp";
import LogisticsWorkspace from "@/app/components/apps/tickets/LogisticsWorkspace";
import {
  PaymentStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from "@/generated/prisma/enums";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const metadata: Metadata = {
  title: "Stok Logistik",
};

const logisticsRoles: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.DIRECTOR,
  UserRole.ADMINISTRATIONS,
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
        status: { not: TicketStatus.REJECTED },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, ticketNumber: true, title: true },
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
        purchaseTickets={purchaseTickets}
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
