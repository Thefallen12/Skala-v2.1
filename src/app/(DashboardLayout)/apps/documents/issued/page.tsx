import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import {
  OperationalDocumentStatus,
  POStatus,
  UserRole,
} from "@prisma/client";
import { canManageUsers } from "@/lib/user-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CardBox from "@/app/components/shared/CardBox";
import BreadcrumbComp from "../../../layout/shared/breadcrumb/BreadcrumbComp";
import DocumentWorkspace from "@/app/components/apps/documents/DocumentWorkspace";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dokumen Terbit",
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
    <>
      <BreadcrumbComp
        title="Dokumen Terbit"
        items={[
          { to: "/", title: "Beranda" },
          { title: "Dokumen Terbit" },
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
      {canViewPO && <CardBox>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Dokumen Digital &amp; Verifikasi QR</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua Purchase Order yang dapat Anda akses, termasuk yang masih diproses.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor PO</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Persetujuan</TableHead>
                <TableHead>Tanggal disetujui</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders.map((order) => (
                <TableRow key={order.publicCode}>
                  <TableCell className="font-medium">{order.poNumber}</TableCell>
                  <TableCell>{order.vendorName}</TableCell>
                  <TableCell>
                    <Badge variant={order.status === POStatus.APPROVED ? "lightSuccess" : "outline"}>
                      {order.status.replaceAll("_", " ")}
                    </Badge>
                    {order.status !== POStatus.APPROVED && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        QR aktif setelah PO disetujui.
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{order.approvedBy?.name ?? "—"}</TableCell>
                  <TableCell>
                    {order.approvedAt
                      ? new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                        }).format(order.approvedAt)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/d/${order.publicCode}`}>
                        {order.status === POStatus.DRAFT ? "Buka Draft" : "Buka PO"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {purchaseOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Belum ada Purchase Order.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardBox>}
      {canViewDO && <CardBox>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Semua Delivery Order / Surat Jalan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua DO yang dapat Anda akses, beserta status dan dokumen sumbernya.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor DO</TableHead>
                <TableHead>Status DO</TableHead>
                <TableHead>Dokumen sumber / persetujuan</TableHead>
                <TableHead>Status persetujuan</TableHead>
                <TableHead>Disetujui pada</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryOrders.map((order) => {
                const approvedByPo = order.po?.status === POStatus.APPROVED;
                const ticketApproval = order.ticket?.auditLogs[0];
                const ticketApproved = order.ticket?.isApprovedByDirector === true;
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
                    <TableCell className="font-medium">{order.doNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{approvalName}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.po
                          ? `PO ${order.po.poNumber}`
                          : order.ticket?.ticketNumber
                            ? `Tiket ${order.ticket.ticketNumber}`
                            : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isApproved ? "lightSuccess" : "outline"}>
                        {isApproved ? "Disetujui" : "Menunggu persetujuan"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {approvalDate
                        ? new Intl.DateTimeFormat("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(approvalDate)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/d/${order.publicCode}`}>Buka DO</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {deliveryOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Belum ada Delivery Order.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardBox>}
    </>
  );
}
