import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DOStatus, POStatus, UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import CardBox from "@/app/components/shared/CardBox";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Eye, FilePlus2, Pencil, Truck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canManageUsers } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Purchase Order & Surat Jalan",
  robots: { index: false, follow: false },
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
  IN_TRANSIT: "Dalam perjalanan",
  DELIVERED: "Terkirim",
  RETURNED: "Dikembalikan",
};

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const canEditPO =
    session.user.role === UserRole.LOGISTICS ||
    session.user.role === UserRole.ADMINISTRATIONS ||
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.DEPUTY_DIRECTOR ||
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.KOORDINATOR;
  const canViewPO =
    canEditPO ||
    session.user.role === UserRole.FIELD_TEAM;
  const canEditDO =
    canManageUsers(session.user.role) ||
    session.user.role === UserRole.DEPUTY_DIRECTOR ||
    session.user.role === UserRole.LOGISTICS ||
    session.user.role === UserRole.FIELD_TEAM ||
    session.user.role === UserRole.KOORDINATOR ||
    session.user.role === UserRole.MOVER;
  if (!canEditDO && !canViewPO) redirect("/apps/documents/issued");

  const [purchaseOrders, deliveryOrders] = await Promise.all([
    canViewPO
      ? prisma.purchaseOrder.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            publicCode: true,
            poNumber: true,
            vendorName: true,
            status: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    canEditDO
      ? prisma.deliveryOrder.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            publicCode: true,
            doNumber: true,
            ticket: { select: { ticketNumber: true } },
            receiverName: true,
            status: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase Order & Surat Jalan"
        description="Kelola data Purchase Order dan Delivery Order melalui tautan dokumen resmi."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "PO & Surat Jalan" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEditPO && (
              <Button size="sm" asChild>
                <Link href="/apps/orders/new?type=po">
                  <FilePlus2 className="mr-1.5 size-4" aria-hidden="true" />
                  Buat PO
                </Link>
              </Button>
            )}
            {canEditDO && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/apps/orders/new?type=do">
                  <Truck className="mr-1.5 size-4" aria-hidden="true" />
                  Buat DO
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {canViewPO && (
        <CardBox className="p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="type-h2 text-foreground">Purchase Order</h2>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Daftar Purchase Order dan status persetujuan.
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
                        <span className="type-p3 text-muted-foreground">
                          {order.updatedAt.toLocaleDateString("id-ID")}
                        </span>
                      </div>
                    </div>
                    <ActionIconButton
                      label={
                        canEditPO && order.status === "DRAFT"
                          ? `Edit PO ${order.poNumber}`
                          : `Tinjau PO ${order.poNumber}`
                      }
                      tooltip={
                        canEditPO && order.status === "DRAFT"
                          ? "Edit PO"
                          : "Tinjau PO"
                      }
                      icon={
                        canEditPO && order.status === "DRAFT" ? Pencil : Eye
                      }
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
                      <TableHead>Diperbarui</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Aksi</span>
                      </TableHead>
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
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.updatedAt.toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right">
                          <ActionIconButton
                            label={
                              canEditPO && order.status === "DRAFT"
                                ? `Edit PO ${order.poNumber}`
                                : `Tinjau PO ${order.poNumber}`
                            }
                            tooltip={
                              canEditPO && order.status === "DRAFT"
                                ? "Edit PO"
                                : "Tinjau PO"
                            }
                            icon={
                              canEditPO && order.status === "DRAFT"
                                ? Pencil
                                : Eye
                            }
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
              icon={FilePlus2}
              title="Belum ada Purchase Order"
              description="Purchase Order yang dibuat akan tampil di daftar ini."
            />
          )}
        </CardBox>
      )}

      {canEditDO && (
        <CardBox className="p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="type-h2 text-foreground">
              Delivery Order / Surat Jalan
            </h2>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Daftar surat jalan pengiriman material ke proyek atau gudang.
            </p>
          </div>
          {deliveryOrders.length ? (
            <>
              <div className="space-y-2.5 md:hidden">
                {deliveryOrders.map((order) => (
                  <div
                    key={order.publicCode}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="type-p2 font-semibold text-foreground">
                        {order.doNumber}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {order.ticket?.ticketNumber ?? "Tanpa tiket"} ·{" "}
                        {order.receiverName || "Belum ada penerima"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant="outline">
                          {doStatusLabels[order.status]}
                        </Badge>
                        <span className="type-p3 text-muted-foreground">
                          {order.updatedAt.toLocaleDateString("id-ID")}
                        </span>
                      </div>
                    </div>
                    <ActionIconButton
                      label={`Edit DO ${order.doNumber}`}
                      tooltip="Edit DO"
                      icon={Pencil}
                      href={`/d/${order.publicCode}`}
                    />
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor DO</TableHead>
                      <TableHead>No. Tiket</TableHead>
                      <TableHead>Penerima</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Diperbarui</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Aksi</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryOrders.map((order) => (
                      <TableRow key={order.publicCode}>
                        <TableCell className="type-p2 font-medium">
                          {order.doNumber}
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.ticket?.ticketNumber ?? "—"}
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.receiverName || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {doStatusLabels[order.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="type-p2">
                          {order.updatedAt.toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right">
                          <ActionIconButton
                            label={`Edit DO ${order.doNumber}`}
                            tooltip="Edit DO"
                            icon={Pencil}
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
              icon={Truck}
              title="Belum ada Delivery Order"
              description="Delivery Order / Surat Jalan yang dibuat akan tampil di sini."
            />
          )}
        </CardBox>
      )}
    </div>
  );
}
