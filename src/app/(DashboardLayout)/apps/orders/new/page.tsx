import { redirect } from "next/navigation";
import type { Metadata } from "next";
import BreadcrumbComp from "../../../layout/shared/breadcrumb/BreadcrumbComp";
import DOEditForm from "@/components/orders/DOEditForm";
import POEditForm from "@/components/orders/POEditForm";
import {
  DOStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../../auth";
import { canManageUsers } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { projectSiteName } from "@/lib/documents/project-site-name";

export const metadata: Metadata = {
  title: "Buat PO / DO",
  robots: { index: false, follow: false },
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ticketId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const { type, ticketId } = await searchParams;
  const isDeliveryOrder = type === "do";
  const canManagePurchaseOrders =
    session.user.role === UserRole.LOGISTICS ||
    session.user.role === UserRole.ADMINISTRATIONS;
  const canManageDeliveryOrders =
    canManageUsers(session.user.role) ||
    session.user.role === UserRole.LOGISTICS ||
    session.user.role === UserRole.FIELD_TEAM ||
    session.user.role === UserRole.KOORDINATOR;

  if (
    (isDeliveryOrder && !canManageDeliveryOrders) ||
    (!isDeliveryOrder && !canManagePurchaseOrders)
  ) {
    redirect("/apps/orders");
  }

  const [ticketOptions, availableVehicles] = isDeliveryOrder
    ? await Promise.all([
        prisma.ticket.findMany({
          where: {
            type: TicketType.MATERIAL,
            status: {
              in: [
                TicketStatus.PROCESSED_LOGISTIC,
                TicketStatus.ASSIGNED_TO_MOVER,
                TicketStatus.IN_TRANSIT,
                TicketStatus.WAITING_FINANCE_PAYMENT,
                TicketStatus.COMPLETED,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            requester: { select: { name: true } },
            moverAssignee: { select: { name: true } },
            project: {
              select: {
                kelompokTani: true,
                vendor: true,
                location: true,
              },
            },
            items: {
              select: { itemName: true, quantity: true, unit: true },
              orderBy: { id: "asc" },
            },
          },
        }),
        session.user.role === UserRole.LOGISTICS
          ? prisma.vehicle.findMany({
              where: {
                status: "AVAILABLE",
                odometerInitialized: true,
                deliveryOrders: {
                  none: { status: { in: ["PENDING", "IN_TRANSIT"] } },
                },
              },
              orderBy: { plateNumber: "asc" },
              select: {
                id: true,
                plateNumber: true,
                vehicleType: true,
                brand: true,
                modelName: true,
                currentKilometer: true,
              },
            })
          : Promise.resolve([]),
      ])
    : [[], []];

  return (
    <>
      <BreadcrumbComp
        title={isDeliveryOrder ? "Buat Delivery Order" : "Buat Purchase Order"}
        items={[
          { to: "/", title: "Beranda" },
          { to: "/apps/orders", title: "PO & Surat Jalan" },
          { title: isDeliveryOrder ? "DO Baru" : "PO Baru" },
        ]}
      />
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">
        {isDeliveryOrder ? (
          <DOEditForm
            status={DOStatus.PENDING}
            createdAt={new Date().toLocaleDateString("id-ID")}
            availableVehicles={availableVehicles.map((vehicle) => ({
              ...vehicle,
              currentKilometer: decimalStringFromScaledInteger(
                vehicle.currentKilometer,
              ),
            }))}
            canCreateInternalDelivery={
              session.user.role === UserRole.LOGISTICS
            }
            ticketId={ticketId}
            ticketOptions={ticketOptions.map((ticket) => ({
              id: ticket.id,
              ticketNumber: ticket.ticketNumber,
              title: ticket.title,
              projectName: projectSiteName(
                ticket.project?.kelompokTani,
                ticket.project?.location,
              ),
              projectLocation: ticket.project?.location ?? "",
              vendorName: ticket.project?.vendor ?? "",
              requesterName: ticket.requester.name,
              moverName: ticket.moverAssignee?.name ?? "",
              items: ticket.items.map((item) => ({
                itemName: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
              })),
            }))}
          />
        ) : (
          <POEditForm createdAt={new Date().toLocaleDateString("id-ID")} />
        )}
      </main>
    </>
  );
}
