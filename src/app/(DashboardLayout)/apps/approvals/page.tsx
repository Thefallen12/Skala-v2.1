import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ExecutiveApprovalHub from "@/app/components/apps/approvals/ExecutiveApprovalHub";
import {
  DirectStockPurchaseStatus,
  POStatus,
  ProjectAddendumStatus,
  SPKStatus,
  SubkonTermynStatus,
  TicketStatus,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const metadata: Metadata = {
  title: "Executive Approval Hub",
};

const executiveRoles: UserRole[] = [
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; openSheet?: string }>;
}) {
  const { tab, openSheet } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!executiveRoles.includes(session.user.role)) redirect("/");

  const [
    orders,
    tickets,
    ticketHistory,
    approvedOrders,
    approvedDirectPurchases,
    approvedWages,
    approvedTermyns,
    approvedContracts,
    approvedAddendums,
    approvedBastDocuments,
    directPurchases,
    workPoints,
    termyns,
    contracts,
    addendums,
    bastDocuments,
    vendors,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        status: POStatus.PENDING_APPROVAL,
      },
      orderBy: { createdAt: "asc" },
      select: {
        publicCode: true,
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
        createdAt: true,
        reviewedAt: true,
        reviewedBy: { select: { name: true } },
        ticket: {
          select: {
            ticketNumber: true,
            project: { select: { kelompokTani: true, location: true } },
          },
        },
        items: {
          select: {
            itemName: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
    }),
    (session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR)
      ? prisma.ticket.findMany({
          where: {
            status: TicketStatus.PENDING_DIRECTOR,
          },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            type: true,
            totalAmount: true,
            requestedAmount: true,
            recipientName: true,
            bankName: true,
            accountNumber: true,
            createdAt: true,
            requester: {
              select: {
                name: true,
                bankName: true,
                bankAccountName: true,
                bankAccountNumber: true,
              },
            },
            project: { select: { title: true, kelompokTani: true } },
            items: { select: { itemName: true, quantity: true, unit: true } },
          },
        })
      : Promise.resolve([]),
    prisma.ticketAuditLog.findMany({
      where: {
        action: {
          in: [
            "APPROVED_BY_DIR",
            "REJECTED_BY_DIR",
            "REVISION_REQUESTED_BY_DIR",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        notes: true,
        createdAt: true,
        user: { select: { name: true } },
        ticket: {
          select: {
            ticketNumber: true,
            title: true,
          },
        },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: POStatus.APPROVED, approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: {
        id: true,
        poNumber: true,
        vendorName: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.directStockPurchase.findMany({
      where: { isApprovedByDirector: true, approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: {
        id: true,
        purchaseNumber: true,
        vendorName: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.projectWorkPoint.findMany({
      where: { approvedTotalWage: { not: null }, wageApprovedAt: { not: null } },
      orderBy: { wageApprovedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        wageApprovedAt: true,
        wageApprovedBy: { select: { name: true } },
      },
    }),
    prisma.subkonTermyn.findMany({
      where: {
        status: { in: [SubkonTermynStatus.APPROVED, SubkonTermynStatus.PAID] },
        approvedAt: { not: null },
      },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: {
        id: true,
        termynNumber: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
        subkonContract: { select: { contractNumber: true, subkonName: true } },
      },
    }),
    prisma.subkonContract.findMany({
      where: {
        status: { in: [SPKStatus.ACTIVE, SPKStatus.COMPLETED] },
        approvedAt: { not: null },
      },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: {
        id: true,
        contractNumber: true,
        subkonName: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.projectAddendum.findMany({
      where: { status: ProjectAddendumStatus.APPROVED, approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: {
        id: true,
        addendumNumber: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.bASTDocument.findMany({
      where: { isApproved: true, approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 50,
      select: {
        id: true,
        bastNumber: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
      },
    }),
    (session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR)
      ? prisma.directStockPurchase.findMany({
          where: {
            isApprovedByDirector: false,
            status: DirectStockPurchaseStatus.PENDING_RECEIPT,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            purchaseNumber: true,
            vendorName: true,
            totalAmount: true,
            createdAt: true,
            createdBy: { select: { name: true } },
            items: {
              select: { itemName: true, quantity: true, unit: true },
            },
          },
        })
      : Promise.resolve([]),
    (session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR)
      ? prisma.projectWorkPoint.findMany({
          where: {
            approvedTotalWage: null,
            project: { isDeleted: false },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            location: true,
            proposedVolume: true,
            proposedUnit: true,
            proposedUnitPrice: true,
            proposedTotalWage: true,
            approvedTotalWage: true,
            proposedBy: { select: { name: true } },
            project: { select: { title: true, kelompokTani: true } },
          },
        })
      : Promise.resolve([]),
    (session.user.role === UserRole.DIRECTOR ||
      session.user.role === UserRole.DEPUTY_DIRECTOR)
      ? prisma.subkonTermyn.findMany({
          where: { status: SubkonTermynStatus.FINANCE_CHECKED },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            termynNumber: true,
            claimedPercent: true,
            grossAmount: true,
            retentionAmount: true,
            netAmount: true,
            createdAt: true,
            createdBy: { select: { name: true } },
            subkonContract: {
              select: {
                contractNumber: true,
                subkonName: true,
                project: { select: { title: true, kelompokTani: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.subkonContract.findMany({
      where: { status: SPKStatus.PENDING_APPROVAL },
      orderBy: { createdAt: "asc" },
      select: {
        publicCode: true,
        contractNumber: true,
        subkonName: true,
        workScope: true,
        contractValue: true,
        createdById: true,
        project: { select: { title: true, kelompokTani: true } },
      },
    }),
    prisma.projectAddendum.findMany({
      where: { status: ProjectAddendumStatus.PENDING_APPROVAL },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        addendumNumber: true,
        budgetChange: true,
        timeExtension: true,
        reason: true,
        project: { select: { title: true, kelompokTani: true } },
      },
    }),
    prisma.bASTDocument.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        bastNumber: true,
        type: true,
        date: true,
        maintenanceEndsAt: true,
        notes: true,
        project: { select: { title: true, kelompokTani: true } },
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
        email: true,
        bankName: true,
        bankAccount: true,
        bankHolder: true,
        phone: true,
        rating: true,
      },
    }),
  ]);

  const approvalHistory = [
    ...ticketHistory.map((entry) => ({
      id: `ticket:${entry.id}`,
      category: "Tiket",
      reference: `${entry.ticket.ticketNumber} · ${entry.ticket.title}`,
      action: entry.action,
      actorName: entry.user.name,
      createdAt: entry.createdAt.toISOString(),
      notes: entry.notes,
    })),
    ...approvedOrders.map((entry) => ({
      id: `po:${entry.id}`,
      category: "Purchase Order",
      reference: `${entry.poNumber} · ${entry.vendorName}`,
      action: "APPROVED",
      actorName: entry.approvedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.approvedAt!.toISOString(),
      notes: null,
    })),
    ...approvedDirectPurchases.map((entry) => ({
      id: `purchase:${entry.id}`,
      category: "Pembelian Langsung",
      reference: `${entry.purchaseNumber} · ${entry.vendorName}`,
      action: "APPROVED",
      actorName: entry.approvedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.approvedAt!.toISOString(),
      notes: null,
    })),
    ...approvedWages.map((entry) => ({
      id: `wage:${entry.id}`,
      category: "Usulan Upah",
      reference: entry.title,
      action: "APPROVED",
      actorName: entry.wageApprovedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.wageApprovedAt!.toISOString(),
      notes: null,
    })),
    ...approvedTermyns.map((entry) => ({
      id: `termyn:${entry.id}`,
      category: "Termin Subkon",
      reference: `${entry.subkonContract.contractNumber} · Termin ${entry.termynNumber} · ${entry.subkonContract.subkonName}`,
      action: "APPROVED",
      actorName: entry.approvedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.approvedAt!.toISOString(),
      notes: null,
    })),
    ...approvedContracts.map((entry) => ({
      id: `contract:${entry.id}`,
      category: "SPK Subkon",
      reference: `${entry.contractNumber} · ${entry.subkonName}`,
      action: "APPROVED",
      actorName: entry.approvedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.approvedAt!.toISOString(),
      notes: null,
    })),
    ...approvedAddendums.map((entry) => ({
      id: `addendum:${entry.id}`,
      category: "Addendum Proyek",
      reference: entry.addendumNumber,
      action: "APPROVED",
      actorName: entry.approvedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.approvedAt!.toISOString(),
      notes: null,
    })),
    ...approvedBastDocuments.map((entry) => ({
      id: `bast:${entry.id}`,
      category: "BAST",
      reference: entry.bastNumber,
      action: "APPROVED",
      actorName: entry.approvedBy?.name ?? "Pengguna tidak tersedia",
      createdAt: entry.approvedAt!.toISOString(),
      notes: null,
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 100);

  return (
    <>
      <ExecutiveApprovalHub
        role={session.user.role}
        currentUserId={session.user.id}
        purchaseOrders={orders.map((order) => ({
          publicCode: order.publicCode,
          poNumber: order.poNumber,
          vendorName: order.vendorName,
          vendorAddress:
            order.vendor?.address ??
            vendors.find(
              (vendor) =>
                vendor.name.trim().toLocaleLowerCase("id-ID") ===
                order.vendorName.trim().toLocaleLowerCase("id-ID"),
            )?.address ??
            null,
          vendorContact:
            order.vendor?.email ??
            vendors.find(
              (vendor) =>
                vendor.name.trim().toLocaleLowerCase("id-ID") ===
                order.vendorName.trim().toLocaleLowerCase("id-ID"),
            )?.email ??
            null,
          vendorPhone:
            order.vendor?.phone ??
            vendors.find(
              (vendor) =>
                vendor.name.trim().toLocaleLowerCase("id-ID") ===
                order.vendorName.trim().toLocaleLowerCase("id-ID"),
            )?.phone ??
            null,
          createdAt: order.createdAt.toISOString(),
          paymentMethod: order.paymentMethod,
          paymentBankName:
            order.paymentBankName ??
            order.vendor?.bankName ??
            vendors.find(
              (vendor) =>
                vendor.name.trim().toLocaleLowerCase("id-ID") ===
                order.vendorName.trim().toLocaleLowerCase("id-ID"),
            )?.bankName ??
            null,
          paymentAccountNumber:
            order.paymentAccountNumber ??
            order.vendor?.bankAccount ??
            vendors.find(
              (vendor) =>
                vendor.name.trim().toLocaleLowerCase("id-ID") ===
                order.vendorName.trim().toLocaleLowerCase("id-ID"),
            )?.bankAccount ??
            null,
          paymentAccountName:
            order.paymentAccountName ??
            order.vendor?.bankHolder ??
            vendors.find(
              (vendor) =>
                vendor.name.trim().toLocaleLowerCase("id-ID") ===
                order.vendorName.trim().toLocaleLowerCase("id-ID"),
            )?.bankHolder ??
            null,
          paymentTerms: order.paymentTerms,
          includeTax: order.includeTax,
          financeReviewerName: order.reviewedBy?.name ?? null,
          financeReviewedAt: order.reviewedAt?.toLocaleString("id-ID") ?? null,
          projectSiteName: order.ticket?.project
            ? `${order.ticket.project.kelompokTani} · ${order.ticket.project.location ?? ""}`.trim()
            : "Gudang (tanpa proyek)",
          ticketNumber: order.ticket?.ticketNumber ?? null,
          items: order.items,
        }))}
        initialTab={tab}
        initialOpenSheet={openSheet}
        directPurchases={directPurchases.map((purchase) => ({
          id: purchase.id,
          purchaseNumber: purchase.purchaseNumber,
          vendorName: purchase.vendorName,
          totalAmount: decimalStringFromScaledInteger(purchase.totalAmount),
          createdAt: purchase.createdAt.toISOString(),
          createdByName: purchase.createdBy.name,
          items: purchase.items.map((item) => ({
            ...item,
            quantity: decimalStringFromScaledInteger(item.quantity),
          })),
        }))}
        tickets={tickets.map((ticket) => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          type: ticket.type,
          totalAmount:
            (ticket.totalAmount !== null
              ? decimalStringFromScaledInteger(ticket.totalAmount)
              : null) ??
            ticket.requestedAmount?.toString() ??
            null,
          recipientName:
            ticket.recipientName ?? ticket.requester.bankAccountName,
          bankName: ticket.bankName ?? ticket.requester.bankName,
          accountNumber:
            ticket.accountNumber ?? ticket.requester.bankAccountNumber,
          createdAt: ticket.createdAt.toISOString(),
          requesterName: ticket.requester.name,
          projectName: ticket.project
            ? `${ticket.project.kelompokTani} · ${ticket.project.title}`
            : null,
          items: ticket.items,
        }))}
        approvalHistory={approvalHistory}
        wages={workPoints.map((workPoint) => ({
          id: workPoint.id,
          title: workPoint.title,
          location: workPoint.location,
          proposedVolume:
            workPoint.proposedVolume !== null
              ? decimalStringFromScaledInteger(workPoint.proposedVolume)
              : null,
          proposedUnit: workPoint.proposedUnit,
          proposedUnitPrice:
            workPoint.proposedUnitPrice !== null
              ? decimalStringFromScaledInteger(workPoint.proposedUnitPrice)
              : null,
          projectName: `${workPoint.project.kelompokTani} · ${workPoint.project.title}`,
          proposedTotalWage: decimalStringFromScaledInteger(
            workPoint.proposedTotalWage,
          ),
          approvedTotalWage:
            workPoint.approvedTotalWage !== null
              ? decimalStringFromScaledInteger(workPoint.approvedTotalWage)
              : null,
          proposedByName: workPoint.proposedBy.name,
        }))}
        termyns={termyns.map((termyn) => ({
          id: termyn.id,
          termynNumber: termyn.termynNumber,
          claimedPercent: decimalStringFromScaledInteger(termyn.claimedPercent),
          grossAmount: decimalStringFromScaledInteger(termyn.grossAmount),
          retentionAmount: decimalStringFromScaledInteger(termyn.retentionAmount),
          netAmount: decimalStringFromScaledInteger(termyn.netAmount),
          createdAt: termyn.createdAt.toISOString(),
          createdByName: termyn.createdBy.name,
          contractNumber: termyn.subkonContract.contractNumber,
          subkonName: termyn.subkonContract.subkonName,
          projectName: `${termyn.subkonContract.project.kelompokTani} · ${termyn.subkonContract.project.title}`,
        }))}
        contracts={contracts.map((contract) => ({
          publicCode: contract.publicCode,
          contractNumber: contract.contractNumber,
          subkonName: contract.subkonName,
          workScope: contract.workScope,
          contractValue: decimalStringFromScaledInteger(contract.contractValue),
          createdById: contract.createdById,
          projectName: `${contract.project.kelompokTani} · ${contract.project.title}`,
        }))}
        addendums={addendums.map((addendum) => ({
          id: addendum.id,
          addendumNumber: addendum.addendumNumber,
          budgetChange: decimalStringFromScaledInteger(addendum.budgetChange),
          timeExtension: addendum.timeExtension,
          reason: addendum.reason,
          projectName: `${addendum.project.kelompokTani} · ${addendum.project.title}`,
        }))}
        bastDocuments={bastDocuments.map((bast) => ({
          id: bast.id,
          bastNumber: bast.bastNumber,
          type: bast.type,
          date: bast.date.toISOString().slice(0, 10),
          maintenanceEndsAt:
            bast.maintenanceEndsAt?.toISOString().slice(0, 10) ?? null,
          notes: bast.notes,
          projectName: `${bast.project.kelompokTani} · ${bast.project.title}`,
        }))}
      />
    </>
  );
}
