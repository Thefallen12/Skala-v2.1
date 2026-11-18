import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Info, Layers, Ticket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DOEditForm from "@/components/orders/DOEditForm";
import POEditForm from "@/components/orders/POEditForm";
import {
  DirectStockPurchaseStatus,
  DOStatus,
  FulfillmentStatus,
  POStatus,
  TicketCategoryHint,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { auth } from "../../../../../../auth";
import {
  canIssuePurchaseOrders,
  canOperateLogisticsActions,
} from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { projectSiteName } from "@/lib/documents/project-site-name";
import {
  buildActiveDirectPurchaseLookup,
  findActiveDirectPurchaseNumber,
} from "@/lib/ticket-utils";

export const metadata: Metadata = {
  title: "Buat PO / DO",
  robots: { index: false, follow: false },
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ticketId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const { type, ticketId } = await searchParams;
  const isDeliveryOrder = type === "do";
  const canManagePurchaseOrders = canIssuePurchaseOrders(session.user.role);
  const canManageDeliveryOrders =
    canOperateLogisticsActions(session.user.role) ||
    session.user.role === UserRole.FIELD_TEAM ||
    session.user.role === UserRole.KOORDINATOR ||
    session.user.role === UserRole.MOVER;

  if (
    (isDeliveryOrder && !canManageDeliveryOrders) ||
    (!isDeliveryOrder && !canManagePurchaseOrders)
  ) {
    redirect("/apps/orders");
  }

  const [ticketOptions, availableVehicles] = isDeliveryOrder
    ? await Promise.all([
        prisma.ticket.findMany({
          where: {
            OR: [
              { type: TicketType.MATERIAL },
              { requestCategory: TicketRequestCategory.SHIPPING_COST },
            ],
            status: {
              in: [
                TicketStatus.PROCESSED_LOGISTIC,
                TicketStatus.PROCESSED_FINANCE,
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
            requestCategory: true,
            relatedPoIds: true,
            requester: { select: { name: true } },
            moverAssignee: { select: { name: true } },
            project: {
              select: {
                title: true,
                kelompokTani: true,
                vendor: true,
                location: true,
              },
            },
            directStockPurchases: {
              where: { status: DirectStockPurchaseStatus.PENDING_RECEIPT },
              select: {
                purchaseNumber: true,
                items: {
                  select: {
                    stockItemId: true,
                    itemName: true,
                    unit: true,
                  },
                },
              },
            },
            items: {
              select: {
                stockItemId: true,
                itemName: true,
                quantity: true,
                unit: true,
                categoryHint: true,
                status: true,
                doItemId: true,
                poItem: {
                  select: {
                    po: {
                      select: { status: true, paidAt: true },
                    },
                  },
                },
              },
              orderBy: { id: "asc" },
            },
          },
        }),
        canOperateLogisticsActions(session.user.role)
          ? prisma.vehicle.findMany({
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
          : Promise.resolve([]),
      ])
    : [[], []];

  const allRelatedPoIds = [
    ...new Set(
      ticketOptions.flatMap((ticket) =>
        ticket.requestCategory === TicketRequestCategory.SHIPPING_COST
          ? ticket.relatedPoIds || []
          : [],
      ),
    ),
  ];
  const relatedPurchaseOrders =
    allRelatedPoIds.length > 0
      ? await prisma.purchaseOrder.findMany({
          where: { id: { in: allRelatedPoIds } },
          select: {
            id: true,
            poNumber: true,
            vendorName: true,
            items: {
              select: { itemName: true, quantity: true, unit: true },
              orderBy: { id: "asc" },
            },
          },
        })
      : [];
  const poMap = new Map(relatedPurchaseOrders.map((po) => [po.id, po]));

  const mappedTicketOptions = isDeliveryOrder
    ? ticketOptions.map((ticket) => {
        const activePurchaseLookup = buildActiveDirectPurchaseLookup(
          ticket.directStockPurchases,
        );
        const poItems =
          ticket.requestCategory === TicketRequestCategory.SHIPPING_COST
            ? (ticket.relatedPoIds || []).flatMap((poId) =>
                (poMap.get(poId)?.items ?? []).map((item) => ({
                  itemName: item.itemName,
                  quantity: item.quantity,
                  unit: item.unit,
                })),
              )
            : [];
        const deliverableTicketItems = ticket.items
          .filter((item) => {
            if (
              item.categoryHint === TicketCategoryHint.CONTRACT ||
              item.doItemId !== null ||
              item.status === FulfillmentStatus.PROCESSED_TO_DO
            ) {
              return false;
            }
            if (item.status === FulfillmentStatus.PROCESSED_TO_PO) {
              const itemPo = item.poItem?.po;
              return (
                itemPo?.status === POStatus.APPROVED &&
                itemPo.paidAt !== null
              );
            }
            if (item.status !== FulfillmentStatus.PENDING) {
              return false;
            }
            return !findActiveDirectPurchaseNumber(
              activePurchaseLookup,
              item,
            );
          })
          .map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
          }));
        const effectiveItems =
          ticket.items.length > 0 ? deliverableTicketItems : poItems;
        const poVendors =
          ticket.requestCategory === TicketRequestCategory.SHIPPING_COST
            ? (ticket.relatedPoIds || [])
                .map((poId) => poMap.get(poId)?.vendorName)
                .filter(Boolean)
                .join(", ")
            : "";
        return {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          projectName:
            projectSiteName(
              ticket.project?.kelompokTani,
              ticket.project?.location,
            ) ||
            (poVendors ? `Vendor: ${poVendors}` : ticket.title),
          projectLocation: ticket.project?.location ?? "",
          vendorName: ticket.project?.vendor ?? poVendors,
          requesterName: ticket.requester.name,
          moverName: ticket.moverAssignee?.name ?? "",
          hasContractItems: ticket.items.some(
            (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
          ),
          items: effectiveItems,
        };
      })
    : [];

  const deliverableTicketOptions = mappedTicketOptions.filter(
    (option) => option.items.length > 0,
  );

  const requestedTicketHasDeliverables = Boolean(
    ticketId &&
      deliverableTicketOptions.some((option) => option.id === ticketId),
  );

  let contractOnlyTicket: {
    id: string;
    ticketNumber: string;
    title: string;
    projectLabel: string;
    contractItems: Array<{ itemName: string; quantity: number; unit: string }>;
  } | null = null;

  if (isDeliveryOrder && ticketId && !requestedTicketHasDeliverables) {
    const matchedFromLoaded = ticketOptions.find((t) => t.id === ticketId);
    if (matchedFromLoaded) {
      const contractItems = matchedFromLoaded.items.filter(
        (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
      );
      if (contractItems.length > 0) {
        contractOnlyTicket = {
          id: matchedFromLoaded.id,
          ticketNumber: matchedFromLoaded.ticketNumber,
          title: matchedFromLoaded.title,
          projectLabel:
            projectSiteName(
              matchedFromLoaded.project?.kelompokTani,
              matchedFromLoaded.project?.location,
            ) ||
            matchedFromLoaded.project?.title ||
            "Proyek Terkait",
          contractItems: contractItems.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
          })),
        };
      }
    } else {
      const fallbackTicket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          project: {
            select: {
              title: true,
              kelompokTani: true,
              location: true,
            },
          },
          items: {
            select: {
              itemName: true,
              quantity: true,
              unit: true,
              categoryHint: true,
            },
            orderBy: { id: "asc" },
          },
        },
      });
      if (fallbackTicket) {
        const contractItems = fallbackTicket.items.filter(
          (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
        );
        if (contractItems.length > 0) {
          contractOnlyTicket = {
            id: fallbackTicket.id,
            ticketNumber: fallbackTicket.ticketNumber,
            title: fallbackTicket.title,
            projectLabel:
              projectSiteName(
                fallbackTicket.project?.kelompokTani,
                fallbackTicket.project?.location,
              ) ||
              fallbackTicket.project?.title ||
              "Proyek Terkait",
            contractItems: contractItems.map((item) => ({
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
            })),
          };
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          contractOnlyTicket
            ? "Penerbitan Surat Jalan Material Alam"
            : isDeliveryOrder
              ? "Buat Delivery Order"
              : "Buat Purchase Order"
        }
        description={
          contractOnlyTicket
            ? "Kontrak Payung Material Alam menggunakan armada & mover vendor sendiri."
            : isDeliveryOrder
              ? "Lengkapi referensi tiket, kendaraan atau ekspedisi, serta daftar barang pengiriman."
              : "Lengkapi data vendor, metode pembayaran, dan rincian material pengadaan."
        }
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Logistik (PO, KO & DO)", href: "/apps/logistics?tab=documents" },
          {
            label: contractOnlyTicket
              ? "Surat Jalan Material Alam"
              : isDeliveryOrder
                ? "DO Baru"
                : "PO Baru",
          },
        ]}
      />
      <main className="w-full">
        {contractOnlyTicket ? (
          <Card className="mx-auto max-w-2xl border-sky-500/30">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="lightInfo">Kontrak Payung Material Alam</Badge>
                <Badge variant="outline" className="font-mono">
                  {contractOnlyTicket.ticketNumber}
                </Badge>
              </div>
              <CardTitle className="type-h2">
                {contractOnlyTicket.title}
              </CardTitle>
              <CardDescription className="type-p2">
                Proyek: {contractOnlyTicket.projectLabel}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert
                variant="lightinfo"
                className="border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-100"
              >
                <Info className="size-4" aria-hidden="true" />
                <AlertTitle>
                  Tidak Menggunakan Kendaraan Master / DO Armada Internal
                </AlertTitle>
                <AlertDescription className="mt-1 space-y-1 text-sky-900/90 dark:text-sky-100/90">
                  <p>
                    Kontrak Payung Material Alam (batu, pasir, sirtu, tanah urug)
                    menggunakan <strong>armada &amp; mover dari vendor sendiri</strong>.
                    Tugas kita hanya menerbitkan <strong>Surat Jalan Material Alam</strong>{" "}
                    resmi — tanpa perlu menginisialisasi Kendaraan Master atau KM awal.
                  </p>
                </AlertDescription>
              </Alert>

              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3.5">
                <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
                  Item Material Alam pada Tiket
                </p>
                <ul className="space-y-1.5">
                  {contractOnlyTicket.contractItems.map((item, idx) => (
                    <li
                      key={`${item.itemName}-${idx}`}
                      className="type-p2 flex items-center justify-between gap-2"
                    >
                      <span className="font-medium text-foreground">
                        {item.itemName}
                      </span>
                      <span className="font-semibold tabular-nums text-primary">
                        {item.quantity} {item.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button asChild>
                  <Link
                    href={`/apps/logistics?tab=bulk-contracts&openSheet=${encodeURIComponent(contractOnlyTicket.id)}`}
                  >
                    <Layers className="mr-2 size-4" aria-hidden="true" />
                    Terbitkan Surat Jalan Material Alam
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link
                    href={`/apps/tickets?openSheet=${encodeURIComponent(contractOnlyTicket.id)}`}
                  >
                    <Ticket className="mr-2 size-4" aria-hidden="true" />
                    Buka Detail Tiket
                  </Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/apps/orders/new?type=do">
                    Buat DO Reguler Lainnya
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : isDeliveryOrder ? (
          <DOEditForm
            status={DOStatus.PENDING}
            createdAt={new Date().toLocaleDateString("id-ID")}
            availableVehicles={availableVehicles.map((vehicle) => ({
              ...vehicle,
              currentKilometer: decimalStringFromScaledInteger(
                vehicle.currentKilometer,
              ),
            }))}
            canCreateInternalDelivery={canOperateLogisticsActions(
              session.user.role,
            )}
            ticketId={requestedTicketHasDeliverables ? ticketId : undefined}
            ticketOptions={deliverableTicketOptions}
          />
        ) : (
          <POEditForm createdAt={new Date().toLocaleDateString("id-ID")} />
        )}
      </main>
    </div>
  );
}
