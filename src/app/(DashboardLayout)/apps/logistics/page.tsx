import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LogisticsHub from "@/app/components/apps/logistics/LogisticsHub";
import MoverWorkspace from "@/app/components/apps/logistics/MoverWorkspace";
import DocumentSignoffQueue from "@/app/components/apps/documents/DocumentSignoffQueue";
import { PageHeader } from "@/components/ui/page-header";
import type { TicketRow } from "../../types/ticket";
import type { Prisma } from "@prisma/client";
import {
  DODeliveryMethod,
  PaymentStatus,
  POStatus,
  TicketFulfillmentStatus,
  TicketPriority,
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
import {
  createStockPriceLookup,
  resolveTicketTotalAmount,
} from "@/lib/resolve-ticket-total-amount";
import type {
  RentalItemRow,
  RentalPaymentStatus,
  RentalPeriodType,
  RentalStatus,
  RentalType,
  RentalUsageScope,
} from "@/app/actions/rentals";
import {
  loadActiveTicketMaterialContractOptions,
  loadMaterialContractsBundle,
  loadOpenContractDeliveryTickets,
} from "@/lib/material-contracts-server";
import { mapTicketMaterialDeliveries } from "@/lib/material-contracts";
import { connectToMongoDBOptional } from "@/lib/mongoose";
import { EquipmentRental } from "@/models/finance-records";
import EquipmentTicket from "@/models/ticket";
import TicketAuditLog from "@/models/ticket-audit-log";
import User from "@/models/user";
import Project from "@/models/project";
import {
  EQUIPMENT_REQUEST_TYPE,
  EQUIPMENT_TIME_UNITS,
} from "@/lib/equipment-request";

export const metadata: Metadata = {
  title: "Logistik Lapangan",
};

const logisticsRoles: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.MOVER,
  UserRole.KOORDINATOR,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
  UserRole.FINANCE,
  UserRole.FIELD_TEAM,
];

function cleanOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toScaledBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return BigInt(0);
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return BigInt(0);
    try {
      return BigInt(trimmed);
    } catch {
      return BigInt(0);
    }
  }
  if (value && typeof value === "object" && "toString" in value) {
    try {
      return BigInt(String(value));
    } catch {
      return BigInt(0);
    }
  }
  return BigInt(0);
}

function formatDateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function formatIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

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
        <PageHeader
          title="Konfirmasi Delivery Order"
          description="Tinjau DO yang telah ditandatangani Logistik, lalu berikan konfirmasi sebagai Koordinator Lapangan."
          breadcrumbs={[
            { label: "Beranda", href: "/" },
            { label: "Konfirmasi DO" },
          ]}
        />
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
          description="QR tanda tangan Logistik menjadi valid setelah konfirmasi lapangan diselesaikan."
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
        <PageHeader
          title="Ruang Kerja Mover"
          description="Kelola pengiriman material, catat odometer, dan ajukan BBM langsung dari lapangan."
          breadcrumbs={[
            { label: "Beranda", href: "/" },
            { label: "Ruang Kerja Mover" },
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
            vehicleCurrentKilometer: order.vehicle
              ? decimalStringFromScaledInteger(order.vehicle.currentKilometer)
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
              tripDistanceKm: order.vehicleTripLog
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
              plateNumber:
                order.vehiclePlateNumber ?? order.vehiclePlate ?? "—",
              vehicleType: order.vehicle?.vehicleType ?? "Kendaraan",
              projectName: projectSiteName(
                order.ticket?.project?.kelompokTani,
                order.ticket?.project?.location,
              ),
              requestedByName: request.requestedBy.name,
              reviewerName: null,
            } satisfies VehicleFuelRequestView)),
            receiptPhotoUrls: Array.from(
              new Set(
                [
                  order.deliveryReceiptUrl,
                  ...order.receiptPhotos.map((photo) => photo.url),
                ].filter((url): url is string => Boolean(url)),
              ),
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

  let where: Prisma.TicketWhereInput = {
    OR: [
      { type: TicketType.MATERIAL },
      { requestCategory: TicketRequestCategory.SHIPPING_COST },
    ],
  };
  if (session.user.role === UserRole.LOGISTICS) {
    where = {
      OR: [
        {
          type: TicketType.MATERIAL,
          status: TicketStatus.DRAFT,
          requesterId: session.user.id,
        },
        {
          requestCategory: TicketRequestCategory.SHIPPING_COST,
          requesterId: session.user.id,
        },
        {
          AND: [
            {
              status: {
                in: [
                  TicketStatus.APPROVED_DIR,
                  TicketStatus.PROCESSED_LOGISTIC,
                  TicketStatus.PROCESSED_FINANCE,
                  TicketStatus.ASSIGNED_TO_MOVER,
                  TicketStatus.IN_TRANSIT,
                  TicketStatus.COMPLETED,
                ],
              },
            },
            {
              OR: [
                { type: TicketType.MATERIAL },
                { requestCategory: TicketRequestCategory.SHIPPING_COST },
              ],
            },
          ],
        },
        {
          status: TicketStatus.WAITING_FINANCE_PAYMENT,
          OR: [
            { purchaseReceiptUrl: { not: null } },
            { purchaseOrders: { some: { vendorInvoiceUrl: { not: null } } } },
            { directStockPurchases: { some: {} } },
            { items: { some: { doItemId: null, poItemId: null } } },
            { requestCategory: TicketRequestCategory.SHIPPING_COST },
          ],
        },
      ],
    };
  }

  const mongo = await connectToMongoDBOptional();

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
    mongoRentals,
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
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { name: true } },
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
            materialContractId: true,
            materialContract: {
              select: {
                id: true,
                contractNumber: true,
                vendorName: true,
                materialType: true,
                unit: true,
                unitPrice: true,
              },
            },
            expectedDeliveryDate: true,
            status: true,
            poItemId: true,
            doItemId: true,
          },
          orderBy: { id: "asc" },
        },
        materialDeliveries: {
          orderBy: { deliveryDate: "desc" },
          select: {
            id: true,
            contractId: true,
            deliveryDate: true,
            doNumber: true,
            vehiclePlate: true,
            driverName: true,
            quantityReceived: true,
            billingStatus: true,
            proofUrl: true,
            notes: true,
            contract: {
              select: {
                contractNumber: true,
                vendorName: true,
                materialType: true,
                unit: true,
                unitPrice: true,
              },
            },
          },
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
            invoices: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                documentUrl: true,
              },
            },
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
              select: {
                id: true,
                stockItemId: true,
                itemName: true,
                quantity: true,
                unit: true,
              },
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
      where: {
        status: {
          in: [
            POStatus.DRAFT,
            POStatus.PENDING_FINANCE_REVIEW,
            POStatus.PENDING_APPROVAL,
            POStatus.APPROVED,
            POStatus.REJECTED,
            POStatus.CANCELLED,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
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
        ticketId: true,
        vendorInvoiceUrl: true,
        vendorPoSentAt: true,
        includeTax: true,
        stockPurchases: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
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
    mongo
      ? EquipmentRental.find().sort({ startDate: -1, createdAt: -1 }).lean()
      : Promise.resolve([]),
  ]);

  // Ensure any project referenced by EquipmentRental (including deleted/legacy projects) resolves cleanly
  const projectMap = new Map(
    projects.map((p) => [p.id, { title: p.title, kelompokTani: p.kelompokTani }]),
  );
  const missingRentalProjectIds = [
    ...new Set(
      mongoRentals
        .map((r) => cleanOptionalText(r.projectId))
        .filter((id): id is string => Boolean(id))
        .filter((id) => !projectMap.has(id)),
    ),
  ];
  if (mongo && missingRentalProjectIds.length > 0) {
    const extraProjects = await Project.find({
      _id: { $in: missingRentalProjectIds },
    })
      .select({ _id: 1, title: 1, kelompokTani: 1 })
      .lean();
    for (const project of extraProjects) {
      projectMap.set(String(project._id), {
        title: String(project.title ?? "-"),
        kelompokTani: String(project.kelompokTani ?? "Proyek"),
      });
    }
  }

  const mappedRentals: RentalItemRow[] = mongoRentals.map((r) => {
    const rentalType: RentalType =
      r.type === "HOUSE"
        ? "HOUSE"
        : r.type === "VEHICLE"
          ? "VEHICLE"
          : "EQUIPMENT";
    const projectId = cleanOptionalText(r.projectId);
    const project = projectId ? projectMap.get(projectId) : undefined;
    const usageScope: RentalUsageScope =
      rentalType === "HOUSE"
        ? "PROJECT"
        : r.usageScope === "OPERATIONAL"
          ? "OPERATIONAL"
          : "PROJECT";

    return {
      id: String(r._id),
      type: rentalType,
      usageScope,
      name: String(r.name ?? ""),
      category: cleanOptionalText(r.category),
      codeOrPlate: cleanOptionalText(r.codeOrPlate),
      vendorName: String(r.vendorName ?? r.landlordName ?? ""),
      vendorPhone: cleanOptionalText(r.vendorPhone ?? r.landlordPhone),
      propertyAddress: cleanOptionalText(r.propertyAddress),
      landlordName: cleanOptionalText(r.landlordName),
      landlordPhone: cleanOptionalText(r.landlordPhone),
      occupantCount:
        typeof r.occupantCount === "number" && Number.isFinite(r.occupantCount)
          ? r.occupantCount
          : null,
      rentalPeriodType:
        r.rentalPeriodType === "WEEKLY" || r.rentalPeriodType === "MONTHLY"
          ? r.rentalPeriodType
          : "DAILY",
      startDate: formatDateOnly(r.startDate),
      endDate: formatDateOnly(r.endDate),
      duration:
        typeof r.duration === "number" && Number.isFinite(r.duration)
          ? r.duration
          : 1,
      ratePerPeriod: decimalStringFromScaledInteger(
        toScaledBigInt(r.ratePerPeriod),
      ),
      additionalCost: decimalStringFromScaledInteger(
        toScaledBigInt(r.additionalCost),
      ),
      totalCost: decimalStringFromScaledInteger(toScaledBigInt(r.totalCost)),
      status:
        r.status === "COMPLETED" ||
        r.status === "EXTENDED" ||
        r.status === "CANCELLED"
          ? (r.status as RentalStatus)
          : "ACTIVE",
      withOperator: rentalType === "HOUSE" ? false : Boolean(r.withOperator),
      operatorName:
        rentalType === "HOUSE" ? null : cleanOptionalText(r.operatorName),
      withFuel: rentalType === "HOUSE" ? false : Boolean(r.withFuel),
      projectId,
      projectName: project
        ? `${project.kelompokTani || "Proyek"} · ${project.title || "-"}`
        : null,
      sourceTicketId: cleanOptionalText(r.sourceTicketId),
      cashflowId: cleanOptionalText(r.cashflowId),
      paymentTransactionId: cleanOptionalText(r.paymentTransactionId),
      notes: cleanOptionalText(r.notes),
      createdByName: cleanOptionalText(r.createdByName),
      createdAt: formatIsoTimestamp(r.createdAt) ?? new Date().toISOString(),
      paymentStatus:
        r.paymentStatus === "PENDING_PAYMENT" || r.paymentStatus === "PAID"
          ? (r.paymentStatus as RentalPaymentStatus)
          : "UNPAID",
      billingSubmittedAt: formatIsoTimestamp(r.billingSubmittedAt),
      billingSubmittedByName: cleanOptionalText(r.billingSubmittedByName),
      paidAt: formatIsoTimestamp(r.paidAt),
      paidByName: cleanOptionalText(r.paidByName),
      proofOfPaymentUrl: cleanOptionalText(r.proofOfPaymentUrl),
      paymentBankName: cleanOptionalText(r.paymentBankName),
      paymentAccountNumber: cleanOptionalText(r.paymentAccountNumber),
      paymentAccountName: cleanOptionalText(r.paymentAccountName),
      financeNotes: cleanOptionalText(r.financeNotes),
    };
  });

  const stockPriceLookup = createStockPriceLookup(stockItems);
  const [
    materialContractsBundle,
    materialContractOptions,
    openContractTickets,
  ] = await Promise.all([
    loadMaterialContractsBundle({
      includeInvoices: true,
    }),
    loadActiveTicketMaterialContractOptions(),
    loadOpenContractDeliveryTickets(),
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
    totalAmount: resolveTicketTotalAmount(ticket, stockPriceLookup),
    attachmentUrl: ticket.attachmentUrl,
    receiptUrls: ticket.receiptUrls,
    paymentProofUrl: ticket.paymentProofUrl,
    purchaseReceiptUrl: ticket.purchaseReceiptUrl,
    transferReceiptUrl: ticket.transferReceiptUrl,
    deliveryReceiptUrl: ticket.deliveryReceiptUrl,
    recipientName:
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS
        ? ticket.recipientName
        : null,
    bankName:
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS
        ? ticket.bankName
        : null,
    accountNumber:
      session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR ||
      session.user.role === UserRole.ADMINISTRATIONS
        ? ticket.accountNumber
        : null,
    createdAt: ticket.createdAt.toISOString(),
    requester: ticket.requester,
    projectId: ticket.projectId,
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
    materialDeliveries: mapTicketMaterialDeliveries(ticket.materialDeliveries),
    auditLogs: ticket.auditLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    operationalDocuments: ticket.operationalDocuments.map((document) => ({
      ...document,
      signedAt: document.signedAt.toISOString(),
      issuedAt: document.issuedAt?.toISOString() ?? null,
    })),
    purchaseOrders: ticket.purchaseOrders.map(
      ({ invoices, ...purchaseOrder }) => ({
        ...purchaseOrder,
        createdAt: purchaseOrder.createdAt.toISOString(),
        paidAt: purchaseOrder.paidAt?.toISOString() ?? null,
        vendorInvoiceUrl:
          purchaseOrder.vendorInvoiceUrl ??
          invoices[0]?.documentUrl ??
          null,
        vendorPoSentAt: purchaseOrder.vendorPoSentAt?.toISOString() ?? null,
        invoiceId: invoices[0]?.id ?? null,
      }),
    ),
    directStockPurchases: ticket.directStockPurchases.map((purchase) => ({
      ...purchase,
      totalAmount: decimalStringFromScaledInteger(purchase.totalAmount),
      receivedAt: purchase.receivedAt?.toISOString() ?? null,
      hasFinanceProof: purchase.paymentTransactions.some((p) =>
        Boolean(p.proofOfTransferUrl),
      ),
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

  if (mongo && session.user.role === UserRole.LOGISTICS) {
    const equipmentTickets = await EquipmentTicket.find({
      ticketType: EQUIPMENT_REQUEST_TYPE,
      status: {
        $in: [
          "PENDING_LOGISTIK",
          "APPROVED_DIR",
          TicketStatus.PROCESSED_LOGISTIC,
        ],
      },
    })
      .sort({ createdAt: -1 })
      .lean();
    const equipmentTicketIds = equipmentTickets.map((ticket) =>
      String(ticket._id),
    );
    if (equipmentTicketIds.length > 0) {
      const requesterIds = [
        ...new Set(equipmentTickets.map((ticket) => ticket.requesterId)),
      ];
      const projectIds = [
        ...new Set(
          equipmentTickets
            .map((ticket) => ticket.projectId)
            .filter((projectId): projectId is string => Boolean(projectId)),
        ),
      ];
      const equipmentAuditLogs = await TicketAuditLog.find({
        ticketId: { $in: equipmentTicketIds },
      })
        .sort({ createdAt: -1 })
        .lean();
      const userIds = [
        ...new Set([
          ...requesterIds,
          ...equipmentAuditLogs.map((audit) => audit.userId),
        ]),
      ];
      const [equipmentUsers, equipmentProjects] = await Promise.all([
        User.find({ _id: { $in: userIds } })
          .select({ _id: 1, name: 1 })
          .lean(),
        Project.find({ _id: { $in: projectIds } })
          .select({ _id: 1, title: 1, kelompokTani: 1 })
          .lean(),
      ]);
      const usersById = new Map(
        equipmentUsers.map((user) => [String(user._id), user]),
      );
      const projectsById = new Map(
        equipmentProjects.map((project) => [String(project._id), project]),
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

      ticketRows.push(
        ...equipmentTickets.map((ticket): TicketRow => {
          const ticketId = String(ticket._id);
          const requester = usersById.get(String(ticket.requesterId));
          if (!requester || typeof requester.name !== "string") {
            throw new Error(
              `Pemohon tiket alat ${ticket.ticketNumber} tidak ditemukan.`,
            );
          }
          const priority = Object.values(TicketPriority).find(
            (value) => value === ticket.priority,
          );
          if (!priority) {
            throw new Error(
              `Prioritas tiket alat ${ticket.ticketNumber} tidak valid.`,
            );
          }
          const equipmentDetails = ticket.equipmentDetails;
          if (
            equipmentDetails &&
            !EQUIPMENT_TIME_UNITS.includes(equipmentDetails.timeUnit)
          ) {
            throw new Error(
              `Satuan waktu tiket alat ${ticket.ticketNumber} tidak valid.`,
            );
          }
          const project = ticket.projectId
            ? projectsById.get(String(ticket.projectId))
            : null;
          const auditLogs = auditLogsByTicketId.get(ticketId) ?? [];
          const resolvedEquipmentStatus: TicketRow["status"] =
            ticket.status === "PENDING_LOGISTIK"
              ? "PENDING_LOGISTIK"
              : Object.values(TicketStatus).find(
                  (value) => value === ticket.status,
                ) ?? TicketStatus.PROCESSED_LOGISTIC;
          const resolvedEquipmentFulfillment =
            Object.values(TicketFulfillmentStatus).find(
              (value) => value === ticket.fulfillmentStatus,
            ) ?? TicketFulfillmentStatus.PENDING;
          return {
            id: ticketId,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            description: ticket.description ?? null,
            type: TicketType.OPERATIONAL,
            ticketType: EQUIPMENT_REQUEST_TYPE,
            equipmentDetails: equipmentDetails
              ? {
                  equipmentName: equipmentDetails.equipmentName ?? null,
                  startDate:
                    equipmentDetails.startDate?.toISOString().slice(0, 10) ??
                    null,
                  duration: equipmentDetails.duration ?? null,
                  timeUnit: equipmentDetails.timeUnit,
                  fulfillmentSource:
                    equipmentDetails.fulfillmentSource ?? null,
                  vendorName: equipmentDetails.vendorName ?? null,
                  quotedCost: equipmentDetails.quotedCost ?? null,
                  processedAt:
                    equipmentDetails.processedAt?.toISOString() ?? null,
                }
              : null,
            requestCategory: TicketRequestCategory.OPS,
            fieldCategory: null,
            requestPaymentMethod: null,
            requestPaymentDescription:
              ticket.requestPaymentDescription ?? null,
            transferDestination: ticket.transferDestination ?? null,
            priority,
            status: resolvedEquipmentStatus,
            fulfillmentStatus: resolvedEquipmentFulfillment,
            canSubmit: false,
            canRequesterEdit: false,
            totalAmount:
              ticket.totalAmount?.toString() ??
              ticket.requestedAmount?.toString() ??
              null,
            paymentTransactions: [],
            attachmentUrl: ticket.attachmentUrl ?? null,
            receiptUrls: ticket.receiptUrls ?? [],
            paymentProofUrl: ticket.paymentProofUrl ?? null,
            purchaseReceiptUrl: ticket.purchaseReceiptUrl ?? null,
            transferReceiptUrl: ticket.transferReceiptUrl ?? null,
            deliveryReceiptUrl: ticket.deliveryReceiptUrl ?? null,
            recipientName: ticket.recipientName ?? null,
            bankName: ticket.bankName ?? null,
            accountNumber: ticket.accountNumber ?? null,
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
              const user = usersById.get(String(audit.userId));
              if (!user || typeof user.name !== "string") {
                throw new Error(
                  `Pengguna audit tiket ${ticket.ticketNumber} tidak ditemukan.`,
                );
              }
              return {
                id: String(audit._id),
                action: audit.action,
                notes: audit.notes ?? null,
                createdAt: audit.createdAt.toISOString(),
                user: { name: user.name },
              };
            }),
          };
        }),
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Logistik Lapangan"
        description="Kelola tiket material, stok gudang, armada, kontrak material alam, dan sewa."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Logistik Lapangan" },
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
          hasFinanceProof: purchase.paymentTransactions.some((payment) =>
            Boolean(payment.proofOfTransferUrl),
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
              ? [
                  {
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
                  },
                ]
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
          paidAt: order.paidAt?.toISOString() ?? null,
          ticketId: order.ticketId,
          vendorInvoiceUrl:
            order.vendorInvoiceUrl ?? order.invoices[0]?.documentUrl ?? null,
          invoiceId: order.invoices[0]?.id ?? null,
          receivedAt: order.stockPurchases[0]?.createdAt.toISOString() ?? null,
          vendorPoSentAt: order.vendorPoSentAt?.toISOString() ?? null,
          includeTax: order.includeTax,
          paymentMethod: order.paymentMethod,
          paymentTerms: order.paymentTerms,
          paymentBankName: order.paymentBankName,
          paymentAccountNumber: order.paymentAccountNumber,
          paymentAccountName: order.paymentAccountName,
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
        rentals={mappedRentals}
        materialContracts={materialContractsBundle.contracts}
        materialContractOptions={materialContractOptions}
        materialDeliveries={materialContractsBundle.deliveries}
        contractTickets={openContractTickets}
        vendorInvoices={materialContractsBundle.vendorInvoices}
      />
    </>
  );
}
