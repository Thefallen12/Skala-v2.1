import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { canManageUsers } from "@/lib/user-access";
import {
  TicketCategoryHint,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import DocumentWorkspace from "@/app/components/apps/documents/DocumentWorkspace";

export const metadata: Metadata = {
  title: "Dokumen PO & DO",
};

const documentRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.LOGISTICS,
  UserRole.FINANCE,
  UserRole.KOORDINATOR,
];

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!documentRoles.includes(session.user.role) && !canManageUsers(session.user.role)) {
    redirect("/apps/documents/issued");
  }

  const [templates, tickets, documents] = await Promise.all([
    prisma.operationalDocumentTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        title: true,
        content: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        type: TicketType.MATERIAL,
        status: {
          in: [
            TicketStatus.PROCESSED_LOGISTIC,
            TicketStatus.ASSIGNED_TO_MOVER,
            TicketStatus.IN_TRANSIT,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        totalAmount: true,
        requester: { select: { name: true } },
        project: { select: { title: true } },
        items: {
          select: {
            itemName: true,
            quantity: true,
            unit: true,
            estimatedCost: true,
            categoryHint: true,
          },
        },
      },
    }),
    prisma.operationalDocument.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        documentNumber: true,
        kind: true,
        status: true,
        title: true,
        content: true,
        signerName: true,
        signedAt: true,
        issuedAt: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
          },
        },
        signedBy: { select: { name: true } },
        issuedBy: { select: { name: true } },
      },
    }),
  ]);

  const regularMaterialTickets = tickets.flatMap((ticket) => {
    const nonContractItems = ticket.items.filter(
      (item) => item.categoryHint !== TicketCategoryHint.CONTRACT,
    );
    if (ticket.items.length > 0 && nonContractItems.length === 0) {
      return [];
    }
    return [
      {
        ...ticket,
        totalAmount:
          ticket.totalAmount !== null
            ? decimalStringFromScaledInteger(ticket.totalAmount)
            : null,
        items: nonContractItems.map((item) => ({
          itemName: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          estimatedCost:
            item.estimatedCost !== null
              ? decimalStringFromScaledInteger(item.estimatedCost)
              : null,
        })),
      },
    ];
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dokumen PO & DO"
        description="Buat, bubuhkan tanda tangan, dan pantau penerbitan dokumen PO & DO reguler secara searah (Surat Jalan Material Alam Kontrak Payung diterbitkan dari menu Logistik)."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Dokumen PO & DO" },
        ]}
      />
      <DocumentWorkspace
        templates={templates.map((template) => ({
          ...template,
          updatedAt: template.updatedAt.toISOString(),
        }))}
        tickets={regularMaterialTickets}
        documents={documents.map((document) => ({
          ...document,
          signedAt: document.signedAt.toISOString(),
          issuedAt: document.issuedAt?.toISOString() ?? null,
          createdAt: document.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}