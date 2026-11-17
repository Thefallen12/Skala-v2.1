import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import {
  DOStatus,
  OperationalDocumentStatus,
  POStatus,
  UserRole,
} from "@prisma/client";
import { canManageUsers } from "@/lib/user-access";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Eye, FileCheck2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CardBox from "@/app/components/shared/CardBox";
import DocumentWorkspace from "@/app/components/apps/documents/DocumentWorkspace";

export const metadata: Metadata = {
  title: "Dokumen Terbit",
};

const poStatusLabels: Record<POStatus, string> = {
  DRAFT: "Draf",
  PENDING_FINANCE_REVIEW: "Pemeriksaan Keuangan",
  PENDING_APPROVAL: "Menunggu Direksi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

const doStatusLabels: Record<DOStatus, string> = {
  PENDING: "Menunggu",
  IN_TRANSIT: "Dalam Perjalanan",
  DELIVERED: "Terkirim",
  RETURNED: "Dikembalikan",
};

export default async function IssuedDocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const role = session.user.role;
  const canViewPO =
    role === UserRole.LOGISTICS ||
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.FINANCE ||
    role === UserRole.DIRECTOR ||
    role === UserRole.DEPUTY_DIRECTOR;
  const canViewDO =
    canManageUsers(role) ||
    role === UserRole.LOGISTICS ||
    role === UserRole.FIELD_TEAM ||
    role === UserRole.KOORDINATOR;

  const [documents, purchaseOrders, deliveryOrders] = await Promise.all([
    prisma.operationalDocument.findMany({
      where: {
        status: OperationalDocumentStatus.ISSUED,
        OR: [
          { kind: "CUSTOM" },
          {
            kind: "PURCHASE_ORDER",
            ticket: {
              is: {
                purchaseOrders: { some: { status: POStatus.APPROVED } },
              },
            },
          },
          {
            kind: "DELIVERY_ORDER",
            ticket: { is: { isApprovedByDirector: true } },
          },
        ],
      },
      orderBy: { issuedAt: "desc" },
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
    canViewPO
      ? prisma.purchaseOrder.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            publicCode: true,
            poNumber: true,
            vendorName: true,
            status: true,
            updatedAt: true,
            approvedAt: true,
            approvedBy: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    canViewDO
      ? prisma.deliveryOrder.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            publicCode: true,
            doNumber: true,
            status: true,
            createdAt: true,
            ticket: {
              select: {
                ticketNumber: true,
                isApprovedByDirector: true,
                auditLogs: {
                  where: { action: "APPROVED_BY_DIR" },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    createdAt: true,
                    user: { select: { name: true } },
                  },
                },
              },
            },
            po: {
              select: {
                poNumber: true,
                status: true,
                approvedAt: true,
                approvedBy: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dokumen Terbit"
        description="Arsip dokumen resmi terbit beserta daftar Purchase Order dan Delivery Order yang dapat diakses."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Dokumen Terbit" },
        ]}
      />
      <DocumentWorkspace
        templates={[]}
        tickets={[]}
        documents={documents.map((document) => ({
          ...document,
          signedAt: document.signedAt.toISOString(),
          issuedAt: document.issuedAt?.toISOString() ?? null,
          createdAt: document.createdAt.toISOString(),
        }))}
        readOnly
      />
      {canViewPO && (
        <CardBox>
          <div className="mb-4">
            <h2 className="type-h2 text-foreground">
              Purchase Order &amp; Verifikasi QR
            </h2>
            <p className="type-p2 mt-1 text-muted-foreground">
              Daftar Purchase Order sesuai hak akses Anda.
            </p>
          </div>
          {purchaseOrders.length ? (
            <>
              <div className="space-y-2.5 md:hidden">
                {purchaseOrders.map((order) => (
                  <div
                    key={order.publicCode}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="type-p2 font-semibold text-foreground">
                        {order.poNumber}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {order.vendorName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge
                          variant={
                            order.status === POStatus.APPROVED
                              ? "lightSuccess"
                              : "outline"
                          }
                        >
                          {poStatusLabels[order.status]}
                        </Badge>
                        {order.approvedAt && (
                          <span className="type-p3 text-muted-foreground">
                            {new Intl.DateTimeFormat("id-ID", {
                              dateStyle: "medium",
                            }).format(order.approvedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ActionIconButton
                      label={`Buka PO ${order.poNumber}`}
                      tooltip={
                        order.status === POStatus.DRAFT
                          ? "Buka Draf"
                          : "Buka PO"
                      }
                      icon={Eye}
                      href={`/d/${order.publicCode}`}
                    />
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor PO</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Persetujuan</TableHead>
                      <TableHead>Tanggal disetujui</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map((order) => (
                      <TableRow key={order.publicCode}>
                        <TableCell className="type-p2 font-medium">
                          {order.poNumber}
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.vendorName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.status === POStatus.APPROVED
                                ? "lightSuccess"
                                : "outline"
                            }
                          >
                            {poStatusLabels[order.status]}
                          </Badge>
                          {order.status !== POStatus.APPROVED && (
                            <p className="type-p3 mt-1 text-muted-foreground">
                              QR aktif setelah PO disetujui.
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.approvedBy?.name ?? "—"}
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.approvedAt
                            ? new Intl.DateTimeFormat("id-ID", {
                                dateStyle: "medium",
                              }).format(order.approvedAt)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <ActionIconButton
                            label={
                              order.status === POStatus.DRAFT
                                ? `Buka draf PO ${order.poNumber}`
                                : `Buka PO ${order.poNumber}`
                            }
                            tooltip={
                              order.status === POStatus.DRAFT
                                ? "Buka Draf"
                                : "Buka PO"
                            }
                            icon={Eye}
                            href={`/d/${order.publicCode}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              variant="inline"
              icon={FileCheck2}
              title="Belum ada Purchase Order"
              description="Purchase Order yang diterbitkan akan tampil di sini."
            />
          )}
        </CardBox>
      )}
      {canViewDO && (
        <CardBox>
          <div className="mb-4">
            <h2 className="type-h2 text-foreground">
              Delivery Order / Surat Jalan
            </h2>
            <p className="type-p2 mt-1 text-muted-foreground">
              Daftar Delivery Order beserta status dan dokumen sumbernya.
            </p>
          </div>
          {deliveryOrders.length ? (
            <>
              <div className="space-y-2.5 md:hidden">
                {deliveryOrders.map((order) => {
                  const approvedByPo = order.po?.status === POStatus.APPROVED;
                  const ticketApproved =
                    order.ticket?.isApprovedByDirector === true;
                  const isApproved = approvedByPo || ticketApproved;
                  return (
                    <div
                      key={order.publicCode}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="type-p2 font-semibold text-foreground">
                          {order.doNumber}
                        </p>
                        <p className="type-p3 text-muted-foreground">
                          {order.po
                            ? `PO ${order.po.poNumber}`
                            : order.ticket?.ticketNumber
                              ? `Tiket ${order.ticket.ticketNumber}`
                              : "—"}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Badge variant="outline">
                            {doStatusLabels[order.status]}
                          </Badge>
                          <Badge
                            variant={isApproved ? "lightSuccess" : "outline"}
                          >
                            {isApproved ? "Disetujui" : "Menunggu persetujuan"}
                          </Badge>
                        </div>
                      </div>
                      <ActionIconButton
                        label={`Buka DO ${order.doNumber}`}
                        tooltip="Buka DO"
                        icon={Eye}
                        href={`/d/${order.publicCode}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor DO</TableHead>
                      <TableHead>Status DO</TableHead>
                      <TableHead>Dokumen sumber / persetujuan</TableHead>
                      <TableHead>Status persetujuan</TableHead>
                      <TableHead>Disetujui pada</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryOrders.map((order) => {
                      const approvedByPo =
                        order.po?.status === POStatus.APPROVED;
                      const ticketApproval = order.ticket?.auditLogs[0];
                      const ticketApproved =
                        order.ticket?.isApprovedByDirector === true;
                      const isApproved = approvedByPo || ticketApproved;
                      const approvalName = approvedByPo
                        ? order.po?.approvedBy?.name ?? "Direksi"
                        : ticketApproved
                          ? ticketApproval?.user.name ?? "Direksi"
                          : "Belum disetujui";
                      const approvalDate = approvedByPo
                        ? order.po?.approvedAt
                        : ticketApproved
                          ? ticketApproval?.createdAt
                          : null;
                      return (
                        <TableRow key={order.publicCode}>
                          <TableCell className="type-p2 font-medium">
                            {order.doNumber}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {doStatusLabels[order.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="type-p2 font-medium">
                              {approvalName}
                            </div>
                            <div className="type-p3 text-muted-foreground">
                              {order.po
                                ? `PO ${order.po.poNumber}`
                                : order.ticket?.ticketNumber
                                  ? `Tiket ${order.ticket.ticketNumber}`
                                  : "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isApproved ? "lightSuccess" : "outline"}
                            >
                              {isApproved
                                ? "Disetujui"
                                : "Menunggu persetujuan"}
                            </Badge>
                          </TableCell>
                          <TableCell className="type-p2">
                            {approvalDate
                              ? new Intl.DateTimeFormat("id-ID", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: "Asia/Jakarta",
                                }).format(approvalDate)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <ActionIconButton
                              label={`Buka DO ${order.doNumber}`}
                              tooltip="Buka DO"
                              icon={Eye}
                              href={`/d/${order.publicCode}`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              variant="inline"
              icon={FileCheck2}
              title="Belum ada Delivery Order"
              description="Surat Jalan yang terbit akan tampil di sini."
            />
          )}
        </CardBox>
      )}
    </div>
  );
}
