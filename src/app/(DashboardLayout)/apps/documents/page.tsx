import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { canManageUsers } from "@/lib/user-access";
import { TicketStatus, TicketType } from "@prisma/client";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import DocumentWorkspace from "@/app/components/apps/documents/DocumentWorkspace";

export const metadata: Metadata = {
  title: "Dokumen PO & DO",
};

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  if (!canManageUsers(session.user.role)) redirect("/apps/logistics");

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

  return (
    <>
      <BreadcrumbComp
        title="Dokumen PO & DO"
        items={[
          { to: "/", title: "Beranda" },
          { title: "Dokumen PO & DO" },
        ]}
      />
      <DocumentWorkspace
        templates={templates.map((template) => ({
          ...template,
          updatedAt: template.updatedAt.toISOString(),
        }))}
        tickets={tickets.map((ticket) => ({
          ...ticket,
          totalAmount:
            ticket.totalAmount !== null
              ? decimalStringFromScaledInteger(ticket.totalAmount)
              : null,
          items: ticket.items.map((item) => ({
            ...item,
            estimatedCost:
              item.estimatedCost !== null
                ? decimalStringFromScaledInteger(item.estimatedCost)
                : null,
          })),
        }))}
        documents={documents.map((document) => ({
          ...document,
          signedAt: document.signedAt.toISOString(),
          issuedAt: document.issuedAt?.toISOString() ?? null,
          createdAt: document.createdAt.toISOString(),
        }))}
      />
    </>
  );
}