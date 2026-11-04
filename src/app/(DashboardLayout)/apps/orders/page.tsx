import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DOStatus, UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import BreadcrumbComp from "../../layout/shared/breadcrumb/BreadcrumbComp";
import CardBox from "@/app/components/shared/CardBox";
import { Button } from "@/components/ui/button";
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
    session.user.role === UserRole.ADMINISTRATIONS;
  const canViewPO =
    canEditPO ||
    session.user.role === UserRole.FINANCE ||
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.DEPUTY_DIRECTOR;
  const canEditDO =
    canManageUsers(session.user.role) ||
    session.user.role === UserRole.LOGISTICS ||
    session.user.role === UserRole.FIELD_TEAM ||
    session.user.role === UserRole.KOORDINATOR;
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
    <>
      <BreadcrumbComp
        title="Purchase Order & Surat Jalan"
        items={[
          { to: "/", title: "Beranda" },
          { title: "PO & Surat Jalan" },
        ]}
      />
      <div className="space-y-6">
        <CardBox className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h1 className="text-xl font-semibold">Purchase Order &amp; DO</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kelola data order melalui tautan acak tanpa menampilkan ID database.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditPO && (
              <Button asChild>
                <Link href="/apps/orders/new?type=po">Buat PO</Link>
              </Button>
            )}
            {canEditDO && (
              <Button variant="outline" asChild>
                <Link href="/apps/orders/new?type=do">Buat DO / Surat Jalan</Link>
              </Button>
            )}
          </div>
        </CardBox>

        {canViewPO && (
          <CardBox className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Purchase Orders</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomor PO</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Diperbarui</TableHead>
                    <TableHead><span className="sr-only">Aksi</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((order) => (
                    <TableRow key={order.publicCode}>
                      <TableCell className="font-medium">{order.poNumber}</TableCell>
                      <TableCell>{order.vendorName}</TableCell>
                      <TableCell>{order.status.replaceAll("_", " ")}</TableCell>
                      <TableCell>{order.updatedAt.toLocaleDateString("id-ID")}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/d/${order.publicCode}`}>
                            {canEditPO && order.status === "DRAFT" ? "Edit" : "Review"}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {purchaseOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Belum ada Purchase Order.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardBox>
        )}

        {canEditDO && (
          <CardBox className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Delivery Orders / Surat Jalan</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomor DO</TableHead>
                    <TableHead>No. Tiket</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Diperbarui</TableHead>
                    <TableHead><span className="sr-only">Aksi</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryOrders.map((order) => (
                    <TableRow key={order.publicCode}>
                      <TableCell className="font-medium">{order.doNumber}</TableCell>
                      <TableCell>{order.ticket?.ticketNumber ?? "—"}</TableCell>
                      <TableCell>{order.receiverName || "—"}</TableCell>
                      <TableCell>{doStatusLabels[order.status]}</TableCell>
                      <TableCell>{order.updatedAt.toLocaleDateString("id-ID")}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/d/${order.publicCode}`}>Edit</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {deliveryOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Belum ada Delivery Order.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardBox>
        )}
      </div>
    </>
  );
}
