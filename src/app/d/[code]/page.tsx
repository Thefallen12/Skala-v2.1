import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { UserRole } from "@prisma/client";
import { auth } from "../../../../auth";
import DOEditForm from "@/components/orders/DOEditForm";
import POEditForm from "@/components/orders/POEditForm";
import { canManageUsers } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import { createBrandedQrDataUrl } from "@/lib/documents/qr-code";
import { projectSiteName } from "@/lib/documents/project-site-name";
import { isValidPublicCode } from "@/lib/documents/random-code";
import {
  getRequestOrigin,
  resolvePublicAppUrl,
} from "@/lib/documents/public-app-url";
import { documentVerificationPath } from "@/lib/documents/verification-url";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const metadata: Metadata = {
  title: "Dokumen Operasional Skala Prioritas",
  robots: { index: false, follow: false },
};

function canEditPurchaseOrder(role: UserRole): boolean {
  return role === UserRole.LOGISTICS || role === UserRole.ADMINISTRATIONS;
}

function canAccessPurchaseOrder(role: UserRole): boolean {
  return (
    canEditPurchaseOrder(role) ||
    role === UserRole.FINANCE ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.KOORDINATOR ||
    role === UserRole.FIELD_TEAM
  );
}

function canEditDeliveryOrder(role: UserRole): boolean {
  return (
    canManageUsers(role) ||
    canEditPurchaseOrder(role) ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR ||
    role === UserRole.LOGISTICS ||
    role === UserRole.FIELD_TEAM ||
    role === UserRole.KOORDINATOR ||
    role === UserRole.MOVER
  );
}

function canAccessDeliveryOrder(role: UserRole): boolean {
  return canEditDeliveryOrder(role) || role === UserRole.FINANCE;
}

function canReadConstructionDocument(
  role: UserRole,
  fieldPicId: string | null,
  currentUserId: string,
): boolean {
  const broadAccessRoles: UserRole[] = [
    UserRole.DRAFTER,
    UserRole.FINANCE,
    UserRole.LOGISTICS,
    UserRole.KOORDINATOR,
    UserRole.DIRECTOR,
    UserRole.DEPUTY_DIRECTOR,
    UserRole.ADMINISTRATIONS,
  ];
  return (
    broadAccessRoles.includes(role) ||
    (role === UserRole.FIELD_TEAM && fieldPicId === currentUserId)
  );
}

async function makeQrDataUrl(
  publicCode: string,
  path = `/d/${publicCode}`,
  requestOrigin?: string | null,
): Promise<string | null> {
  const baseUrl = resolvePublicAppUrl(requestOrigin);
  if (!baseUrl) return null;

  try {
    const url = new URL(path, baseUrl);
    return await createBrandedQrDataUrl(url.toString(), 240);
  } catch (error) {
    console.error("Order verification QR generation failed:", error);
    return null;
  }
}

export default async function OrderEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const [{ code }, query] = await Promise.all([params, searchParams]);
  if (!isValidPublicCode(code)) notFound();
  const requestOrigin = getRequestOrigin(await headers());

  const [purchaseOrder, deliveryOrder, subcontract, bast] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { publicCode: code },
      select: {
        poNumber: true,
        vendorName: true,
        vendor: {
          select: {
            name: true,
            address: true,
            phone: true,
            email: true,
            bankName: true,
            bankAccount: true,
            bankHolder: true,
          },
        },
        paymentMethod: true,
        paymentBankName: true,
        paymentAccountNumber: true,
        paymentAccountName: true,
        paymentTerms: true,
        includeTax: true,
        status: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        reviewedAt: true,
        reviewedBy: { select: { name: true } },
        approvedAt: true,
        approvedBy: { select: { name: true } },
        ticket: {
          select: {
            project: {
              select: { kelompokTani: true, location: true },
            },
          },
        },
        items: {
          select: {
            itemName: true,
            quantity: true,
            unit: true,
            unitPrice: true,
          },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.deliveryOrder.findUnique({
      where: { publicCode: code },
      select: {
        vehicleId: true,
        doNumber: true,
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            moverAssignee: { select: { name: true } },
            project: {
              select: {
                kelompokTani: true,
                vendor: true,
                location: true,
              },
            },
          },
        },
        po: { select: { poNumber: true, vendorName: true } },
        driverName: true,
        vehicleDocumentNumber: true,
        vehiclePlate: true,
        vehiclePlateNumber: true,
        driverIdentityNumber: true,
        driverPhone: true,
        deliveryMethod: true,
        receiverName: true,
        receivedAt: true,
        receivedBy: { select: { name: true } },
        arrivalPhotoUrl: true,
        status: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        items: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            qtyOrdered: true,
            qtyDelivered: true,
            unit: true,
            remarks: true,
          },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.subkonContract.findUnique({
      where: { publicCode: code },
      select: {
        contractNumber: true,
        subkonName: true,
        workScope: true,
        contractValue: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        project: {
          select: {
            kelompokTani: true,
            location: true,
            fieldPicId: true,
          },
        },
      },
    }),
    prisma.bASTDocument.findUnique({
      where: { publicCode: code },
      select: {
        bastNumber: true,
        type: true,
        date: true,
        maintenanceEndsAt: true,
        notes: true,
        isApproved: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
        project: {
          select: {
            kelompokTani: true,
            location: true,
            fieldPicId: true,
          },
        },
      },
    }),
  ]);

  if ([purchaseOrder, deliveryOrder, subcontract, bast].filter(Boolean).length !== 1) {
    notFound();
  }

  if (purchaseOrder) {
    if (!canAccessPurchaseOrder(session.user.role)) notFound();
    const vendor =
      purchaseOrder.vendor ??
      (await prisma.vendor.findFirst({
        where: { name: { equals: purchaseOrder.vendorName, mode: "insensitive" } },
        select: {
          address: true,
          phone: true,
          email: true,
          bankName: true,
          bankAccount: true,
          bankHolder: true,
        },
      }));
    return (
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
        <POEditForm
          publicCode={code}
          poNumber={purchaseOrder.poNumber}
          vendorName={purchaseOrder.vendorName}
          vendorAddress={vendor?.address}
          vendorContact={vendor?.email}
          vendorPhone={vendor?.phone}
          paymentMethod={purchaseOrder.paymentMethod}
          paymentBankName={purchaseOrder.paymentBankName ?? vendor?.bankName}
          paymentAccountNumber={
            purchaseOrder.paymentAccountNumber ?? vendor?.bankAccount
          }
          paymentAccountName={purchaseOrder.paymentAccountName ?? vendor?.bankHolder}
          paymentTerms={purchaseOrder.paymentTerms}
          includeTax={purchaseOrder.includeTax}
          projectSiteName={projectSiteName(
            purchaseOrder.ticket?.project?.kelompokTani,
            purchaseOrder.ticket?.project?.location,
          )}
          status={purchaseOrder.status}
          items={purchaseOrder.items}
          qrDataUrl={
            purchaseOrder.status === "APPROVED"
              ? await makeQrDataUrl(
                  code,
                  documentVerificationPath("po", code),
                  requestOrigin,
                )
              : null
          }
          initialPreviewOpen={query.preview === "1"}
          canEdit={canEditPurchaseOrder(session.user.role)}
          canReview={
            session.user.role === UserRole.FINANCE ||
            session.user.role === UserRole.ADMINISTRATIONS ||
            session.user.role === UserRole.DIRECTOR ||
            session.user.role === UserRole.DEPUTY_DIRECTOR
          }
          canApprove={
            session.user.role === UserRole.DIRECTOR ||
            session.user.role === UserRole.DEPUTY_DIRECTOR ||
            session.user.role === UserRole.ADMINISTRATIONS
          }
          createdAt={purchaseOrder.createdAt.toLocaleDateString("id-ID")}
          logisticsStaffName={purchaseOrder.createdBy?.name}
          financeReviewerName={purchaseOrder.reviewedBy?.name}
          financeReviewedAt={purchaseOrder.reviewedAt?.toLocaleString("id-ID")}
          approvedByName={purchaseOrder.approvedBy?.name}
          approvedAt={purchaseOrder.approvedAt?.toLocaleString("id-ID")}
        />
      </main>
    );
  }

  if (deliveryOrder) {
    if (!canAccessDeliveryOrder(session.user.role)) notFound();
    const canEdit = canEditDeliveryOrder(session.user.role);
    const canAssignVehicle =
      canEdit &&
      session.user.role === UserRole.LOGISTICS &&
      deliveryOrder.deliveryMethod === "INTERNAL_MOVER" &&
      deliveryOrder.status === "PENDING" &&
      !deliveryOrder.vehicleId;
    const availableVehicles = canAssignVehicle
      ? await prisma.vehicle.findMany({
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
      : [];
    return (
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
        <DOEditForm
          publicCode={code}
          doNumber={deliveryOrder.doNumber}
          ticketId={deliveryOrder.ticket?.id}
          ticketNumber={deliveryOrder.ticket?.ticketNumber}
          assignedMoverName={deliveryOrder.ticket?.moverAssignee?.name}
          projectName={projectSiteName(
            deliveryOrder.ticket?.project?.kelompokTani,
            deliveryOrder.ticket?.project?.location,
          )}
          projectSiteLocation={deliveryOrder.ticket?.project?.location ?? "-"}
          poNumber={deliveryOrder.po?.poNumber ?? null}
          vendorName={
            deliveryOrder.po?.vendorName ??
            deliveryOrder.ticket?.project?.vendor ??
            null
          }
          driverName={deliveryOrder.driverName}
          vehicleId={deliveryOrder.vehicleId}
          vehicleDocumentNumber={deliveryOrder.vehicleDocumentNumber}
          vehiclePlate={
            deliveryOrder.vehiclePlateNumber ?? deliveryOrder.vehiclePlate
          }
          driverIdentityNumber={deliveryOrder.driverIdentityNumber}
          driverPhone={deliveryOrder.driverPhone}
          deliveryMethod={deliveryOrder.deliveryMethod}
          receiverName={deliveryOrder.receiverName}
          receivedAt={
            deliveryOrder.receivedAt?.toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            }) ?? null
          }
          receivedByName={deliveryOrder.receivedBy?.name ?? null}
          arrivalPhotoUrl={deliveryOrder.arrivalPhotoUrl}
          canReceiveMaterial={session.user.role === UserRole.LOGISTICS}
          canEdit={canEdit}
          status={deliveryOrder.status}
          createdAt={deliveryOrder.createdAt.toLocaleDateString("id-ID")}
          logisticsStaffName={deliveryOrder.createdBy?.name}
          canAssignVehicle={canAssignVehicle}
          availableVehicles={availableVehicles.map((vehicle) => ({
            ...vehicle,
            currentKilometer: decimalStringFromScaledInteger(
              vehicle.currentKilometer,
            ),
          }))}
          items={deliveryOrder.items.map((item) => ({
            ...item,
            remarks: item.remarks ?? "",
          }))}
          qrDataUrl={await makeQrDataUrl(
            code,
            documentVerificationPath("do", code),
          )}
        />
      </main>
    );
  }

  if (subcontract) {
    if (
      !canReadConstructionDocument(
        session.user.role,
        subcontract.project.fieldPicId,
        session.user.id,
      )
    ) {
      notFound();
    }
    const pdfUrl = `/api/documents/construction?publicCode=${encodeURIComponent(code)}`;
    return (
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-secondary">DOKUMEN SPK SUBKON</p>
          <h1 className="mt-1 text-2xl font-bold text-primary">
            {subcontract.contractNumber}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {projectSiteName(
              subcontract.project.kelompokTani,
              subcontract.project.location,
            )}{" "}
            · {subcontract.subkonName} · {subcontract.status}
          </p>
          {subcontract.status === "ACTIVE" ? (
            <iframe
              title={`PDF ${subcontract.contractNumber}`}
              src={pdfUrl}
              className="mt-5 h-[75vh] w-full rounded-lg border"
            />
          ) : (
            <p className="mt-5 rounded-md border bg-slate-50 p-4 text-sm">
              Dokumen hanya tersedia setelah SPK disetujui Direktur/Wakil Direktur.
              Status saat ini: {subcontract.status}.
            </p>
          )}
        </section>
      </main>
    );
  }

  if (
    !bast ||
    !canReadConstructionDocument(
      session.user.role,
      bast.project.fieldPicId,
      session.user.id,
    )
  ) {
    notFound();
  }
  const bastPdfUrl = `/api/documents/construction?publicCode=${encodeURIComponent(code)}`;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-secondary">BERITA ACARA SERAH TERIMA</p>
        <h1 className="mt-1 text-2xl font-bold text-primary">{bast.bastNumber}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {projectSiteName(bast.project.kelompokTani, bast.project.location)} ·{" "}
          {bast.type} · {bast.isApproved ? "DISETUJUI" : "MENUNGGU PERSETUJUAN"}
        </p>
        {bast.isApproved ? (
          <iframe
            title={`PDF ${bast.bastNumber}`}
            src={bastPdfUrl}
            className="mt-5 h-[75vh] w-full rounded-lg border"
          />
        ) : (
          <p className="mt-5 rounded-md border bg-slate-50 p-4 text-sm">
            Dokumen BAST hanya tersedia setelah disetujui Direktur/Wakil Direktur.
          </p>
        )}
      </section>
    </main>
  );
}
