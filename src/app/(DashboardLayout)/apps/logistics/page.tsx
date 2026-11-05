import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import LogisticsHub from "@/app/components/apps/logistics/LogisticsHub";
import MoverWorkspace from "@/app/components/apps/logistics/MoverWorkspace";
import DocumentSignoffQueue from "@/app/components/apps/documents/DocumentSignoffQueue";
import type { TicketRow } from "../../types/ticket";
import type { Prisma } from "@prisma/client";
import {
  DODeliveryMethod,
  PaymentStatus,
  POStatus,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { projectSiteName } from "@/lib/documents/project-site-name";
import type { VehicleFuelRequestView } from "@/lib/vehicle-fuel-types";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const metadata: Metadata = {
  title: "Logistik Lapangan",
};

const logisticsRoles: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.MOVER,
  UserRole.KOORDINATOR,
  UserRole.DIRECTOR,
  UserRole.ADMINISTRATIONS,
];

export default async function LogisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; openSheet?: string }>;
}) {
  const { tab, openSheet } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!logisticsRoles.includes(session.user.role)) redirect("/apps/tickets");
  const today = new Date().toISOString().slice(0, 10);
  const invoiceDate = new Date().toLocaleDateString("id-ID");

  if (session.user.role === UserRole.KOORDINATOR) {
    const pendingDeliveryOrderAcknowledgments =
      await prisma.deliveryOrder.findMany({
        where: { signedAt: { not: null }, acknowledgedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          publicCode: true,
          doNumber: true,
          signedBy: { select: { name: true } },
          signedAt: true,
          acknowledgedBy: { select: { name: true } },
          acknowledgedAt: true,
        },
      });

    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            Konfirmasi Delivery Order
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tinjau DO yang telah ditandatangani Logistik, lalu berikan
            konfirmasi sebagai Koordinator Lapangan.
          </p>
        </div>
        <DocumentSignoffQueue
          tasks={pendingDeliveryOrderAcknowledgments.map((document) => ({
            id: document.id,
            kind: "DO" as const,
            number: document.doNumber,
            action: "acknowledge" as const,
            signedByName: document.signedBy?.name ?? null,
            signedAt: document.signedAt?.toISOString() ?? null,
            acknowledgedByName: document.acknowledgedBy?.name ?? null,
            acknowledgedAt: document.acknowledgedAt?.toISOString() ?? null,
            previewUrl: `/api/documents/transactions?kind=DO&publicCode=${encodeURIComponent(document.publicCode)}`,
          }))}
          title="DO Menunggu Konfirmasi"
          description="QR tanda tangan Logistik menunjukkan status DO dan menjadi valid setelah konfirmasi ini diselesaikan."
        />
      </main>
    );
  }

  if (session.user.role === UserRole.MOVER) {
    const assignedToMover = [
      { ticket: { is: { moverAssigneeId: session.user.id } } },
      ...(session.user.name ? [{ driverName: session.user.name }] : []),
    ];
    const [deliveryOrders, projects, equipmentMasters, equipmentLogs] =
      await Promise.all([
        prisma.deliveryOrder.findMany({
          where: {
            deliveryMethod: DODeliveryMethod.INTERNAL_MOVER,
            OR: assignedToMover,
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          select: {
            publicCode: true,
            doNumber: true,
            status: true,
            createdAt: true,
            driverName: true,
            vehiclePlate: true,
            vehicleId: true,
            vehiclePlateNumber: true,
            departureKilometer: true,
            vehicle: {
              select: { currentKilometer: true, vehicleType: true },
            },
            vehicleTripLog: {
              select: {
                kilometerStart: true,
                kilometerEnd: true,
                distanceKm: true,
                fuelLiter: true,
              },
            },
            receiverName: true,
            deliveryReceiptUrl: true,
            receiptPhotos: {
              select: { url: true },
              orderBy: { createdAt: "asc" },
            },
            fuelRequests: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                status: true,
                source: true,
                estimatedDistanceKm: true,
                exceptionDistanceKm: true,
                exceptionReason: true,
                estimatedFuelLiter: true,
                unitPrice: true,
                requestedAmount: true,
                disbursementMethod: true,
                transferDestination: true,
                transferProofUrl: true,
                beforeFillingPhotoUrl: true,
                afterFillingPhotoUrl: true,
                receiptPhotoUrl: true,
                financeNote: true,
                createdAt: true,
                disbursedAt: true,
                proofSubmittedAt: true,
                requestedBy: { select: { name: true } },
              },
            },
            ticket: {
              select: {
                ticketNumber: true,
                project: {
                  select: { kelompokTani: true, location: true },
                },
              },
            },
            items: {
              select: {
                itemName: true,
                qtyDelivered: true,
                unit: true,
              },
              orderBy: { id: "asc" },
            },
          },
        }),
        prisma.project.findMany({
          where: { isDeleted: false },
          orderBy: { name: "asc" },
          select: { id: true, title: true, kelompokTani: true },
        }),
        prisma.equipmentMaster.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            currentHM: true,
          },
        }),
        prisma.equipmentLog.findMany({
          where: { createdById: session.user.id },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 100,
          select: {
            id: true,
            equipmentName: true,
            operatorName: true,
            date: true,
            hmStart: true,
            hmEnd: true,
            effectiveHours: true,
            fuelLiter: true,
            project: { select: { title: true, kelompokTani: true } },
          },
        }),
      ]);

    return (
      <>
        <BreadcrumbComp
          title="Ruang Kerja Mover"
          items={[
            { to: "/", title: "Beranda" },
            { title: "Ruang Kerja Mover" },
          ]}
        />
        <MoverWorkspace
          userName={session.user.name ?? ""}
          today={today}
          deliveryOrders={deliveryOrders.map((order) => ({
            ...order,
            createdAt: order.createdAt.toISOString(),
            departureKilometer:
              order.departureKilometer !== null
                ? decimalStringFromScaledInteger(order.departureKilometer)
                : null,
            vehicleCurrentKilometer:
              order.vehicle
                ? decimalStringFromScaledInteger(
                    order.vehicle.currentKilometer,
                  )
                : null,
            vehicleType: order.vehicle?.vehicleType ?? null,
            vehicleTripLog: order.vehicleTripLog
              ? {
                  kilometerStart: decimalStringFromScaledInteger(
                    order.vehicleTripLog.kilometerStart,
                  ),
                  kilometerEnd: decimalStringFromScaledInteger(
                    order.vehicleTripLog.kilometerEnd,
                  ),
                  distanceKm: decimalStringFromScaledInteger(
                    order.vehicleTripLog.distanceKm,
                  ),
                  fuelLiter: decimalStringFromScaledInteger(
                    order.vehicleTripLog.fuelLiter,
                  ),
                }
              : null,
            fuelRequests: order.fuelRequests.map((request) => ({
              id: request.id,
              status: request.status,
              source: request.source,
              estimatedDistanceKm: decimalStringFromScaledInteger(
                request.estimatedDistanceKm,
              ),
              tripDistanceKm:
                order.vehicleTripLog
                  ? decimalStringFromScaledInteger(
                      order.vehicleTripLog.distanceKm,
                    )
                  : null,
              exceptionDistanceKm: decimalStringFromScaledInteger(
                request.exceptionDistanceKm,
              ),
              exceptionReason: request.exceptionReason,
              estimatedFuelLiter: decimalStringFromScaledInteger(
                request.estimatedFuelLiter,
              ),
              unitPrice: decimalStringFromScaledInteger(request.unitPrice),
              requestedAmount: decimalStringFromScaledInteger(
                request.requestedAmount,
              ),
              disbursementMethod: request.disbursementMethod,
              transferDestination: request.transferDestination,
              transferProofUrl: request.transferProofUrl,
              beforeFillingPhotoUrl: request.beforeFillingPhotoUrl,
              afterFillingPhotoUrl: request.afterFillingPhotoUrl,
              receiptPhotoUrl: request.receiptPhotoUrl,
              financeNote: request.financeNote,
              createdAt: request.createdAt.toISOString(),
              disbursedAt: request.disbursedAt?.toISOString() ?? null,
              proofSubmittedAt:
                request.proofSubmittedAt?.toISOString() ?? null,
              doNumber: order.doNumber,
              plateNumber: order.vehiclePlateNumber ?? order.vehiclePlate ?? "—",
              vehicleType: order.vehicle?.vehicleType ?? "Kendaraan",
              projectName: projectSiteName(
                order.ticket?.project?.kelompokTani,
                order.ticket?.project?.location,
              ),
              requestedByName: request.requestedBy.name,
              reviewerName: null,
            } satisfies VehicleFuelRequestView)),
            receiptPhotoUrls: Array.from(
              new Set([
                order.deliveryReceiptUrl,
                ...order.receiptPhotos.map((photo) => photo.url),
              ].filter((url): url is string => Boolean(url))),
            ),
            projectName: projectSiteName(
              order.ticket?.project?.kelompokTani,
              order.ticket?.project?.location,
            ),
            ticketNumber: order.ticket?.ticketNumber ?? null,
          }))}
          projects={projects}
          equipmentMasters={equipmentMasters.map((equipment) => ({
            ...equipment,
            currentHM: decimalStringFromScaledInteger(equipment.currentHM),
          }))}
          equipmentLogs={equipmentLogs.map((log) => ({
            ...log,
            date: log.date.toISOString().slice(0, 10),
            hmStart: decimalStringFromScaledInteger(log.hmStart),
            hmEnd: decimalStringFromScaledInteger(log.hmEnd),
            effectiveHours: decimalStringFromScaledInteger(log.effectiveHours),
            fuelLiter: decimalStringFromScaledInteger(log.fuelLiter),
            projectName: `${log.project.kelompokTani} · ${log.project.title}`,
          }))}
          initialTab={tab}
        />
      </>
    );
  }

  let where: Prisma.TicketWhereInput = { type: TicketType.MATERIAL };
  if (session.user.role === UserRole.LOGISTICS) {
    where = {
      type: TicketType.MATERIAL,
      OR: [
        {
          status: TicketStatus.DRAFT,
          requesterId: session.user.id,
        },
        {
          status: {
            in: [
              TicketStatus.PROCESSED_LOGISTIC,
              TicketStatus.ASSIGNED_TO_MOVER,
              TicketStatus.IN_TRANSIT,
              TicketStatus.COMPLETED,
            ],
          },
        },
        {
          status: TicketStatus.WAITING_FINANCE_PAYMENT,
          purchaseReceiptUrl: { not: null },
        },
      ],
    };
  }

  const [
    tickets,
    projects,
    stockItems,
    purchaseOrders,
    purchaseOrderConfirmations,
    deliveryOrders,
    unsignedOrderConfirmations,
    unsignedDeliveryOrders,
    equipmentLogs,
    equipmentMasters,
    vendors,
    directStockPurchases,
    vehicles,
    vehicleTripLogs,
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        AND: [
          where,
          ...(session.user.role === UserRole.DIRECTOR ||
          session.user.role === UserRole.FINANCE
            ? []
            : [
                {
                  OR: [
                    { requestCategory: { not: TicketRequestCategory.APH } },
                    { requestCategory: null },
                  ],
                },
              ]),
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        requester: { select: { name: true } },
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
        operationalDocuments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            documentNumber: true,
            kind: true,
            status: true,
            title: true,
            signedAt: true,
            issuedAt: true,
          },
        },
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          select: {
            publicCode: true,
            poNumber: true,
            vendorName: true,
            status: true,
            createdAt: true,
            paidAt: true,
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
            vendorInvoiceUploadedAt: true,
            vendorInvoiceUploadedBy: { select: { name: true } },
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
        stockQuantity: true,
        minimumStock: true,
        unitPrice: true,
        createdAt: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: POStatus.APPROVED },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        publicCode: true,
        poNumber: true,
        vendorName: true,
        status: true,
        createdAt: true,
        ticketId: true,
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
          },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, documentUrl: true },
        },
      },
    }),
    prisma.paymentTransaction.findMany({
      where: {
        poId: { not: null },
        status: PaymentStatus.PAID,
        confirmationOrderNumber: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        confirmationOrderNumber: true,
        paymentType: true,
        amount: true,
        transferDestination: true,
        proofOfTransferUrl: true,
        paidAt: true,
        vendorSentAt: true,
        vendorSentBy: { select: { name: true } },
        po: {
          select: {
            poNumber: true,
            vendorName: true,
            vendorInvoiceUrl: true,
            items: {
              select: { itemName: true, quantity: true, unit: true },
              orderBy: { id: "asc" },
            },
          },
        },
      },
    }),
    prisma.deliveryOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        publicCode: true,
        doNumber: true,
        status: true,
        createdAt: true,
        ticketId: true,
        po: { select: { ticketId: true, status: true } },
        ticket: { select: { isApprovedByDirector: true, projectId: true } },
        vehicleId: true,
        vehiclePlateNumber: true,
      },
    }),
    session.user.role === UserRole.LOGISTICS
      ? prisma.orderConfirmation.findMany({
          where: { signedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            koNumber: true,
            signedBy: { select: { name: true } },
            signedAt: true,
            acknowledgedBy: { select: { name: true } },
            acknowledgedAt: true,
          },
        })
      : Promise.resolve([]),
    session.user.role === UserRole.LOGISTICS
      ? prisma.deliveryOrder.findMany({
          where: { signedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            publicCode: true,
            doNumber: true,
            signedBy: { select: { name: true } },
            signedAt: true,
            acknowledgedBy: { select: { name: true } },
            acknowledgedAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.equipmentLog.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        equipmentName: true,
        operatorName: true,
        date: true,
        hmStart: true,
        hmEnd: true,
        effectiveHours: true,
        fuelLiter: true,
        notes: true,
        project: { select: { title: true, kelompokTani: true } },
      },
    }),
    prisma.equipmentMaster.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        currentHM: true,
        status: true,
      },
    }),
    prisma.vendor.findMany({
      where: { isApproved: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        address: true,
        phone: true,
        email: true,
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
        rating: true,
      },
    }),
    prisma.directStockPurchase.findMany({
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
    prisma.vehicle.findMany({
      orderBy: { plateNumber: "asc" },
      select: {
        id: true,
        plateNumber: true,
        vehicleType: true,
        brand: true,
        modelName: true,
        currentKilometer: true,
        odometerInitialized: true,
        status: true,
      },
    }),
    prisma.vehicleTripLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        kilometerStart: true,
        kilometerEnd: true,
        distanceKm: true,
        fuelLiter: true,
        vehicle: { select: { plateNumber: true, vehicleType: true } },
        deliveryOrder: { select: { doNumber: true } },
        project: { select: { title: true, kelompokTani: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

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
      ticket.totalAmount !== null
        ? decimalStringFromScaledInteger(ticket.totalAmount)
        : null,
    attachmentUrl: ticket.attachmentUrl,
    receiptUrls: ticket.receiptUrls,
    paymentProofUrl: ticket.paymentProofUrl,
    purchaseReceiptUrl: ticket.purchaseReceiptUrl,
    transferReceiptUrl: ticket.transferReceiptUrl,
    deliveryReceiptUrl: ticket.deliveryReceiptUrl,
    recipientName:
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS
        ? ticket.recipientName
        : null,
    bankName:
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS
        ? ticket.bankName
        : null,
    accountNumber:
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS
        ? ticket.accountNumber
        : null,
    createdAt: ticket.createdAt.toISOString(),
    requester: ticket.requester,
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
    auditLogs: ticket.auditLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    operationalDocuments: ticket.operationalDocuments.map((document) => ({
      ...document,
      signedAt: document.signedAt.toISOString(),
      issuedAt: document.issuedAt?.toISOString() ?? null,
    })),
    purchaseOrders: ticket.purchaseOrders.map((purchaseOrder) => ({
      ...purchaseOrder,
      createdAt: purchaseOrder.createdAt.toISOString(),
      paidAt: purchaseOrder.paidAt?.toISOString() ?? null,
    })),
    directStockPurchases: ticket.directStockPurchases.map((purchase) => ({
      ...purchase,
      totalAmount: decimalStringFromScaledInteger(purchase.totalAmount),
      createdAt: purchase.createdAt.toISOString(),
      vendorInvoiceUploadedAt:
        purchase.vendorInvoiceUploadedAt?.toISOString() ?? null,
      items: purchase.items.map((item) => ({
        ...item,
        quantity: decimalStringFromScaledInteger(item.quantity),
      })),
    })),
    deliveryOrders: ticket.deliveryOrders.map((deliveryOrder) => ({
      ...deliveryOrder,
      createdAt: deliveryOrder.createdAt.toISOString(),
    })),
  }));

  return (
    <>
      <BreadcrumbComp
        title="Logistik Lapangan"
        items={[
          { to: "/", title: "Beranda" },
          { title: "Logistik Lapangan" },
        ]}
      />
      <LogisticsHub
        key={`${tab ?? ""}:${openSheet ?? ""}`}
        today={today}
        invoiceDate={invoiceDate}
        tickets={ticketRows}
        projects={projects}
        role={session.user.role}
        vendors={vendors}
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
        purchaseOrderConfirmations={purchaseOrderConfirmations.flatMap(
          (payment) =>
            payment.confirmationOrderNumber &&
            payment.proofOfTransferUrl &&
            payment.po
              ? [{
                  id: payment.id,
                  confirmationOrderNumber: payment.confirmationOrderNumber,
                  paymentType: payment.paymentType,
                  amount: Number(payment.amount),
                  transferDestination: payment.transferDestination,
                  proofOfTransferUrl: payment.proofOfTransferUrl,
                  paidAt: payment.paidAt?.toISOString() ?? null,
                  vendorSentAt: payment.vendorSentAt?.toISOString() ?? null,
                  vendorSentBy: payment.vendorSentBy,
                  po: {
                    ...payment.po,
                    items: payment.po.items.map((item) => ({
                      ...item,
                      quantity: Number(item.quantity),
                    })),
                  },
                }]
              : [],
        )}
        documentSignoffTasks={[
          ...unsignedOrderConfirmations.map((document) => ({
            id: document.id,
            kind: "KO" as const,
            number: document.koNumber,
            action: "sign" as const,
            signedByName: document.signedBy?.name ?? null,
            signedAt: document.signedAt?.toISOString() ?? null,
            acknowledgedByName: document.acknowledgedBy?.name ?? null,
            acknowledgedAt: document.acknowledgedAt?.toISOString() ?? null,
            previewUrl: `/api/documents/transactions?kind=KO&id=${encodeURIComponent(document.id)}`,
          })),
          ...unsignedDeliveryOrders.map((document) => ({
            id: document.id,
            kind: "DO" as const,
            number: document.doNumber,
            action: "sign" as const,
            signedByName: document.signedBy?.name ?? null,
            signedAt: document.signedAt?.toISOString() ?? null,
            acknowledgedByName: document.acknowledgedBy?.name ?? null,
            acknowledgedAt: document.acknowledgedAt?.toISOString() ?? null,
            previewUrl: `/api/documents/transactions?kind=DO&publicCode=${encodeURIComponent(document.publicCode)}`,
          })),
        ]}
        initialTab={tab}
        initialOpenSheet={openSheet}
        stockItems={stockItems.map((item) => ({
          ...item,
          stockQuantity: decimalStringFromScaledInteger(item.stockQuantity),
          minimumStock: decimalStringFromScaledInteger(item.minimumStock),
          unitPrice: decimalStringFromScaledInteger(item.unitPrice),
          createdAt: item.createdAt.toISOString(),
        }))}
        purchaseOrders={purchaseOrders.map((order) => ({
          id: order.id,
          publicCode: order.publicCode,
          poNumber: order.poNumber,
          vendorName: order.vendorName,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          ticketId: order.ticketId,
          vendorInvoiceUrl:
            order.vendorInvoiceUrl ?? order.invoices[0]?.documentUrl ?? null,
          invoiceId: order.invoices[0]?.id ?? null,
          vendorPoSentAt: order.vendorPoSentAt?.toISOString() ?? null,
          includeTax: order.includeTax,
          items: order.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }))}
        deliveryOrders={deliveryOrders.map((order) => ({
          id: order.id,
          publicCode: order.publicCode,
          doNumber: order.doNumber,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          ticketId: order.ticketId ?? order.po?.ticketId ?? null,
          vehicleId: order.vehicleId,
          vehiclePlateNumber: order.vehiclePlateNumber,
          executiveApproved:
            order.po?.status === POStatus.APPROVED ||
            order.ticket?.isApprovedByDirector === true,
        }))}
        equipmentLogs={equipmentLogs.map((log) => ({
          id: log.id,
          equipmentName: log.equipmentName,
          operatorName: log.operatorName,
          date: log.date.toISOString().slice(0, 10),
          hmStart: decimalStringFromScaledInteger(log.hmStart),
          hmEnd: decimalStringFromScaledInteger(log.hmEnd),
          effectiveHours: decimalStringFromScaledInteger(log.effectiveHours),
          fuelLiter: decimalStringFromScaledInteger(log.fuelLiter),
          notes: log.notes,
          projectName: `${log.project.kelompokTani} · ${log.project.title}`,
        }))}
        equipmentMasters={equipmentMasters.map((equipment) => ({
          ...equipment,
          currentHM: decimalStringFromScaledInteger(equipment.currentHM),
        }))}
        vehicleTripLogs={vehicleTripLogs.map((log) => ({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          doNumber: log.deliveryOrder?.doNumber ?? null,
          projectName: log.project
            ? `${log.project.kelompokTani} · ${log.project.title}`
            : "Proyek tidak terhubung",
          plateNumber: log.vehicle.plateNumber,
          vehicleType: log.vehicle.vehicleType,
          kilometerStart: decimalStringFromScaledInteger(log.kilometerStart),
          kilometerEnd: decimalStringFromScaledInteger(log.kilometerEnd),
          distanceKm: decimalStringFromScaledInteger(log.distanceKm),
          fuelLiter: decimalStringFromScaledInteger(log.fuelLiter),
          createdByName: log.createdBy.name,
        }))}
        vehicles={vehicles.map((vehicle) => ({
          ...vehicle,
          currentKilometer: decimalStringFromScaledInteger(
            vehicle.currentKilometer,
          ),
          status:
            vehicle.status === "AVAILABLE" ||
            vehicle.status === "RESERVED" ||
            vehicle.status === "IN_USE" ||
            vehicle.status === "MAINTENANCE"
              ? vehicle.status
              : "MAINTENANCE",
        }))}
      />
    </>
  );
}
