"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Layers, Plus, Trash2, Truck } from "lucide-react";
import { UserRole } from "@prisma/client";
import { toast } from "sonner";
import { deleteUnbilledMaterialDelivery } from "@/app/actions/material-contracts";
import MaterialDeliveryModal, {
  type DeliveryProjectOption,
} from "@/app/components/apps/material-contracts/MaterialDeliveryModal";
import MaterialDeliveryProofModal from "@/app/components/apps/material-contracts/MaterialDeliveryProofModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  canRecordMaterialDeliveries,
  formatMaterialVolume,
  type ContractTicketDeliveryOption,
  type MaterialContractRow,
  type MaterialDeliveryRow,
} from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";

function currency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProjectMaterialDeliveriesCard({
  project,
  contracts,
  deliveries,
  contractTickets = [],
  currentUserRole,
}: {
  project: DeliveryProjectOption;
  contracts: MaterialContractRow[];
  deliveries: MaterialDeliveryRow[];
  contractTickets?: ContractTicketDeliveryOption[];
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(
    null,
  );
  const [pendingDeleteDelivery, setPendingDeleteDelivery] =
    useState<MaterialDeliveryRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const canRecord = canRecordMaterialDeliveries(currentUserRole);
  const unbilledCount = deliveries.filter(
    (delivery) => delivery.billingStatus === "UNBILLED",
  ).length;
  const billedCount = deliveries.length - unbilledCount;
  const totalEstimated = deliveries.reduce(
    (sum, delivery) => sum + delivery.estimatedAmount,
    0,
  );

  const confirmDelete = () => {
    if (!pendingDeleteDelivery) return;
    const deliveryId = pendingDeleteDelivery.id;
    startTransition(async () => {
      const result = await deleteUnbilledMaterialDelivery(deliveryId);
      if (result.success) {
        toast.success(result.message || "Surat jalan berhasil dihapus.");
        setPendingDeleteDelivery(null);
        requestNotificationFeedRefresh();
        router.refresh();
      } else {
        toast.error(result.message || "Gagal menghapus surat jalan.");
      }
    });
  };

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="type-h2 flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden="true" />
            Penerimaan Material Curah (Surat Jalan DO)
          </CardTitle>
          <CardDescription className="type-p3">
            Catat kedatangan truk pasir, batu, sirtu, atau tanah urug berdasarkan
            Kontrak Payung vendor.
          </CardDescription>
        </div>
        {canRecord && (
          <Button
            type="button"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Plus className="size-4" aria-hidden="true" />
            Catat Surat Jalan
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <p className="type-p3 font-medium text-muted-foreground">
              Total DO Masuk
            </p>
            <p className="type-kpi mt-0.5 text-foreground">
              {deliveries.length} DO
            </p>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
            <p className="type-p3 font-medium text-warning">
              Status Penagihan Vendor
            </p>
            <p className="type-p1 mt-1 font-bold text-foreground tabular-nums">
              {unbilledCount} Unbilled · {billedCount} Billed
            </p>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2.5">
            <p className="type-p3 font-medium text-success">
              Akumulasi Nilai Kontrak
            </p>
            <p className="type-kpi mt-0.5 text-success">
              {currency(totalEstimated)}
            </p>
          </div>
        </div>

        {deliveries.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Belum ada pengiriman material curah"
            description="Tim lapangan atau Logistik dapat mencatat setiap kedatangan truk pasir/batu beserta foto Surat Jalan fisik."
          />
        ) : (
          <>
            {/* Mobile Card View (< 768px) */}
            <div className="space-y-2.5 md:hidden">
              {deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="space-y-2.5 rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="type-p2 font-mono font-bold text-primary">
                          {delivery.doNumber}
                        </span>
                        {delivery.ticketNumber && (
                          <Badge variant="outline">{delivery.ticketNumber}</Badge>
                        )}
                      </div>
                      <p className="type-p2 mt-0.5 font-medium text-foreground">
                        {delivery.materialType} · {delivery.vendorName}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {delivery.deliveryDate} · {delivery.vehiclePlate || "-"}
                        {delivery.driverName ? ` (${delivery.driverName})` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        delivery.billingStatus === "BILLED"
                          ? "success"
                          : "warning"
                      }
                      className="shrink-0"
                    >
                      {delivery.billingStatus}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="type-p2 font-semibold text-foreground tabular-nums">
                      {formatMaterialVolume(
                        delivery.quantityReceived,
                        delivery.unit,
                      )}
                    </span>
                    <span className="type-p2 font-mono font-bold text-foreground tabular-nums">
                      {currency(delivery.estimatedAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    {delivery.proofUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          setPreview({
                            title: `Surat Jalan ${delivery.doNumber}`,
                            url: delivery.proofUrl!,
                          })
                        }
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        Surat Jalan
                      </Button>
                    )}
                    {canRecord && delivery.billingStatus === "UNBILLED" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setPendingDeleteDelivery(delivery)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Hapus
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block">
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No. DO &amp; Truk</TableHead>
                    <TableHead>Kontrak &amp; Vendor</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Nilai Kontrak</TableHead>
                    <TableHead>Penagihan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="type-p3 whitespace-nowrap tabular-nums">
                        {delivery.deliveryDate}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="type-p2 flex flex-wrap items-center gap-1.5 font-semibold">
                          <span>{delivery.doNumber}</span>
                          {delivery.ticketNumber && (
                            <Badge variant="outline">
                              {delivery.ticketNumber}
                            </Badge>
                          )}
                        </div>
                        <p className="type-p3 text-muted-foreground">
                          {delivery.vehiclePlate || "-"}
                          {delivery.driverName
                            ? ` · ${delivery.driverName}`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="type-p2 flex items-center gap-1.5 font-medium">
                          <Badge variant="outline">{delivery.materialType}</Badge>
                          <span>{delivery.vendorName}</span>
                        </div>
                        <p className="type-p3 text-muted-foreground">
                          {delivery.contractNumber}
                        </p>
                      </TableCell>
                      <TableCell className="type-p2 whitespace-nowrap text-right font-semibold tabular-nums">
                        {formatMaterialVolume(
                          delivery.quantityReceived,
                          delivery.unit,
                        )}
                      </TableCell>
                      <TableCell className="type-p2 whitespace-nowrap text-right font-medium tabular-nums">
                        {currency(delivery.estimatedAmount)}
                      </TableCell>
                      <TableCell>
                        {delivery.billingStatus === "BILLED" ? (
                          <div className="space-y-0.5">
                            <Badge variant="success">BILLED</Badge>
                            {delivery.vendorInvoiceNumber && (
                              <p className="type-p3 font-medium text-muted-foreground">
                                {delivery.vendorInvoiceNumber}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="warning">UNBILLED</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {delivery.proofUrl && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              aria-label="Lihat bukti surat jalan"
                              title="Lihat Bukti Surat Jalan"
                              onClick={() =>
                                setPreview({
                                  title: `Surat Jalan ${delivery.doNumber}`,
                                  url: delivery.proofUrl!,
                                })
                              }
                            >
                              <Eye className="size-4" aria-hidden="true" />
                            </Button>
                          )}
                          {canRecord &&
                            delivery.billingStatus === "UNBILLED" && (
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={isPending}
                                aria-label="Hapus DO belum ditagih"
                                title="Hapus DO belum ditagih"
                                onClick={() =>
                                  setPendingDeleteDelivery(delivery)
                                }
                              >
                                <Trash2
                                  className="size-4 text-destructive"
                                  aria-hidden="true"
                                />
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <MaterialDeliveryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        contracts={contracts}
        projects={[project]}
        contractTickets={contractTickets}
        lockedProjectId={project.id}
      />

      <MaterialDeliveryProofModal
        preview={preview}
        onClose={() => setPreview(null)}
      />

      <AlertDialog
        open={pendingDeleteDelivery !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setPendingDeleteDelivery(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Surat Jalan (DO)?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteDelivery
                ? `Hapus Surat Jalan ${pendingDeleteDelivery.doNumber} (${formatMaterialVolume(pendingDeleteDelivery.quantityReceived, pendingDeleteDelivery.unit)})? Tindakan ini tidak dapat dibatalkan.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {isPending ? "Menghapus..." : "Ya, Hapus DO"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
