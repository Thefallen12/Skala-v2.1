"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Layers, Plus, Trash2, Truck } from "lucide-react";
import { UserRole } from "@prisma/client";
import { deleteUnbilledMaterialDelivery } from "@/app/actions/material-contracts";
import {
  canRecordMaterialDeliveries,
  formatMaterialVolume,
  type MaterialContractRow,
  type MaterialDeliveryRow,
} from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MaterialDeliveryModal, {
  type DeliveryProjectOption,
} from "@/app/components/apps/material-contracts/MaterialDeliveryModal";
import MaterialDeliveryProofModal from "@/app/components/apps/material-contracts/MaterialDeliveryProofModal";

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
  currentUserRole,
}: {
  project: DeliveryProjectOption;
  contracts: MaterialContractRow[];
  deliveries: MaterialDeliveryRow[];
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
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

  const handleDelete = (delivery: MaterialDeliveryRow) => {
    if (
      !window.confirm(
        `Hapus Surat Jalan ${delivery.doNumber} (${formatMaterialVolume(delivery.quantityReceived, delivery.unit)})?`,
      )
    ) {
      return;
    }

    setMessage("");
    setIsError(false);
    startTransition(async () => {
      const result = await deleteUnbilledMaterialDelivery(delivery.id);
      setMessage(result.message);
      setIsError(!result.success);
      if (result.success) {
        requestNotificationFeedRefresh();
        router.refresh();
      }
    });
  };

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Layers className="size-4 text-primary" />
            Penerimaan Material Curah (Kontrak Payung / Surat Jalan DO)
          </CardTitle>
          <CardDescription className="text-xs">
            Catat kedatangan truk pasir, batu, sirtu, atau tanah urug di lokasi
            proyek ini berdasarkan Kontrak Payung vendor.
          </CardDescription>
        </div>
        {canRecord && (
          <Button
            type="button"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Plus className="size-4" />
            Catat Surat Jalan (DO)
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Total DO Masuk ke Proyek
            </p>
            <p className="mt-0.5 text-lg font-bold">{deliveries.length} DO</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Status Penagihan Vendor
            </p>
            <p className="mt-0.5 text-sm font-bold">
              {unbilledCount} Unbilled · {billedCount} Billed
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              Akumulasi Nilai Kontrak
            </p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {currency(totalEstimated)}
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              isError
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {message}
          </div>
        )}

        {deliveries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-10 text-center">
            <Truck className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              Belum ada pengiriman material curah tercatat
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tim lapangan atau Logistik dapat mencatat setiap kedatangan truk
              pasir/batu beserta foto Surat Jalan fisik.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/80">
            <Table>
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
                    <TableCell className="whitespace-nowrap text-xs">
                      {delivery.deliveryDate}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold">{delivery.doNumber}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {delivery.vehiclePlate || "-"}
                        {delivery.driverName ? ` · ${delivery.driverName}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Badge variant="outline" className="text-[10px]">
                          {delivery.materialType}
                        </Badge>
                        <span>{delivery.vendorName}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {delivery.contractNumber}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs font-semibold">
                      {formatMaterialVolume(
                        delivery.quantityReceived,
                        delivery.unit,
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                      {currency(delivery.estimatedAmount)}
                    </TableCell>
                    <TableCell>
                      {delivery.billingStatus === "BILLED" ? (
                        <div className="space-y-0.5">
                          <Badge variant="success" className="text-[10px]">
                            BILLED
                          </Badge>
                          {delivery.vendorInvoiceNumber && (
                            <p className="text-[10px] font-medium text-muted-foreground">
                              {delivery.vendorInvoiceNumber}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="warning" className="text-[10px]">
                          UNBILLED
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {delivery.proofUrl && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title="Lihat Bukti Surat Jalan"
                            onClick={() =>
                              setPreview({
                                title: `Surat Jalan ${delivery.doNumber}`,
                                url: delivery.proofUrl!,
                              })
                            }
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        )}
                        {canRecord && delivery.billingStatus === "UNBILLED" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={isPending}
                            title="Hapus DO belum ditagih"
                            onClick={() => handleDelete(delivery)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <MaterialDeliveryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        contracts={contracts}
        projects={[project]}
        lockedProjectId={project.id}
      />

      <MaterialDeliveryProofModal
        preview={preview}
        onClose={() => setPreview(null)}
      />
    </Card>
  );
}
