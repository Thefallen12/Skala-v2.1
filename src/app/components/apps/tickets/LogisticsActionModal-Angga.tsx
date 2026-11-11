"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { POStatus } from "@prisma/client";
import type { VehicleSummary } from "@/app/actions/vehicles";
import {
  processLogisticsMaterial,
} from "@/app/actions/tickets";
import CreatePOForm from "@/app/components/forms/CreatePOForm";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import InvoiceDetailsFields, {
  type InvoiceDraft,
} from "@/app/components/apps/logistics/InvoiceDetailsFields";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";

function createInvoiceDraft(
  items: NonNullable<
    NonNullable<TicketRow["purchaseOrders"]>[number]["items"]
  > = [],
  includeTax = false,
): InvoiceDraft {
  const invoiceItems = items.map((item) => ({
    itemCode: item.itemCode ?? "",
    description: item.itemName,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
  }));
  return {
    invoiceNumber: "",
    periodOrDate: new Date().toLocaleDateString("id-ID"),
    tax: includeTax
      ? Math.round(
          invoiceItems.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice,
            0,
          ) * 0.11,
        )
      : 0,
    deduction: 0,
    items: invoiceItems,
  };
}

export default function LogisticsActionModal({
  open,
  ticket,
  vendors,
  stockItems,
  vehicles,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  ticket: TicketRow;
  vendors: {
    id: string;
    name: string;
    bankName: string | null;
    bankAccount: string | null;
    bankHolder: string | null;
  }[];
  stockItems: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    unitPrice: string;
  }[];
  vehicles: VehicleSummary[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [actionType, setActionType] = useState<
    "READY_WAREHOUSE" | "BUY_STORE"
  >("READY_WAREHOUSE");
  const [invoiceFileState, setInvoiceFileState] = useState<{
    orderCode: string | null;
    file: File | null;
  }>({ orderCode: null, file: null });
  const [invoiceDraftState, setInvoiceDraftState] = useState<{
    orderCode: string | null;
    draft: InvoiceDraft;
  } | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [externalDelivery, setExternalDelivery] = useState({
    vehicleDocumentNumber: "",
    vehiclePlate: "",
    driverName: "",
    driverIdentityNumber: "",
    driverPhone: "",
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const latestPurchaseOrder = ticket.purchaseOrders?.[0];
  const invoiceDraft =
    invoiceDraftState?.orderCode === (latestPurchaseOrder?.publicCode ?? null)
      ? invoiceDraftState.draft
      : createInvoiceDraft(
          latestPurchaseOrder?.items,
          latestPurchaseOrder?.includeTax,
        );
  const invoiceFile =
    invoiceFileState.orderCode === (latestPurchaseOrder?.publicCode ?? null)
      ? invoiceFileState.file
      : null;
  const existingDeliveryOrder = ticket.deliveryOrders?.[0];
  const purchaseOrderApproved =
    latestPurchaseOrder?.status === POStatus.APPROVED;
  const purchaseOrderPaid = Boolean(latestPurchaseOrder?.paidAt);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionType === "BUY_STORE" && !latestPurchaseOrder) return;
    if (actionType === "BUY_STORE" && purchaseOrderPaid) {
      setMessage(
        "PO sudah dibayar dan masuk ke stok gudang. Lanjutkan melalui opsi stok gudang.",
      );
      return;
    }
    if (actionType === "BUY_STORE" && !purchaseOrderApproved) return;
    if (
      actionType === "BUY_STORE" &&
      purchaseOrderApproved &&
      !purchaseOrderPaid &&
      !invoiceFile
    ) {
      setMessage("Unggah dokumen invoice/bon melalui Cloudinary.");
      return;
    }
    if (
      actionType === "READY_WAREHOUSE" &&
      purchaseOrderPaid &&
      (!externalDelivery.vehicleDocumentNumber.trim() ||
        !/^[A-Za-z0-9./ -]{3,40}$/.test(externalDelivery.vehiclePlate.trim()) ||
        externalDelivery.driverName.trim().length < 2 ||
        !/^\d{16}$/.test(externalDelivery.driverIdentityNumber.trim()) ||
        !/^[+()\d\s.-]{8,32}$/.test(externalDelivery.driverPhone.trim()))
    ) {
      setMessage(
        "Lengkapi No. STK, plat nomor, nama driver, NIK 16 digit, dan nomor HP ekspedisi.",
      );
      return;
    }
    if (
      actionType === "READY_WAREHOUSE" &&
      !purchaseOrderPaid &&
      !existingDeliveryOrder &&
      !selectedVehicleId
    ) {
      setMessage("Pilih kendaraan master sebelum menerbitkan DO.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const result = await processLogisticsMaterial(
          ticket.id,
          actionType,
          actionType === "BUY_STORE" ? invoiceFile ?? undefined : undefined,
          actionType === "READY_WAREHOUSE" && purchaseOrderPaid
            ? externalDelivery
            : undefined,
          actionType === "READY_WAREHOUSE" && !purchaseOrderPaid
            ? selectedVehicleId
            : undefined,
          actionType === "BUY_STORE" ? invoiceDraft : undefined,
        );
        setMessage(result.message);
        if (result.success) {
          setInvoiceFileState({ orderCode: null, file: null });
          setSelectedVehicleId("");
          setExternalDelivery({
            vehicleDocumentNumber: "",
            vehiclePlate: "",
            driverName: "",
            driverIdentityNumber: "",
            driverPhone: "",
          });
          onOpenChange(false);
          onSuccess();
          if (actionType === "READY_WAREHOUSE" && result.publicCode) {
            router.push(`/d/${result.publicCode}`);
          }
        }
      } catch (error) {
        console.error("Logistics ticket action failed:", error);
        setMessage("Proses logistik gagal. Silakan coba kembali.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        setInvoiceFileState({ orderCode: null, file: null });
        setSelectedVehicleId("");
        setMessage("");
        setExternalDelivery({
          vehicleDocumentNumber: "",
          vehiclePlate: "",
          driverName: "",
          driverIdentityNumber: "",
          driverPhone: "",
        });
        setActionType("READY_WAREHOUSE");
        onOpenChange(false);
      }}
      title="Proses Material"
      description={
        existingDeliveryOrder
          ? "Tiket ini sudah memiliki Surat Jalan. Lanjutkan dengan dokumen yang ada tanpa menerbitkan DO atau mengurangi stok lagi."
          : "Pilih sumber material sekali. Jika stok tersedia, sistem membuat DO dan mencadangkan stok. Jika stok kurang, buat PO lalu kirim invoice ke Keuangan setelah PO disetujui."
      }
    >
        <form className="space-y-4" onSubmit={submit}>
          {existingDeliveryOrder ? (
            <section className="space-y-3 rounded-md border p-3">
              <div>
                <h3 className="font-medium">
                  DO {existingDeliveryOrder.doNumber} sudah tersedia
                </h3>
                <p className="text-sm text-muted-foreground">
                  Sistem akan melanjutkan menggunakan Surat Jalan ini. DO baru
                  tidak dibuat dan stok tidak dikurangi kembali.
                </p>
              </div>
              <ActionIconButton
                type="button"
                label={`Lihat Surat Jalan ${existingDeliveryOrder.doNumber}`}
                tooltip="Lihat Surat Jalan"
                icon={FileText}
                href={`/d/${existingDeliveryOrder.publicCode}`}
              />
            </section>
          ) : (
            <>
          <RadioGroup
            value={actionType}
            onValueChange={(value) => {
              if (value === "READY_WAREHOUSE" || value === "BUY_STORE") {
                if (value === "BUY_STORE" && purchaseOrderPaid) return;
                setActionType(value);
              }
            }}
            className="gap-3"
          >
            <FormLabel className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="READY_WAREHOUSE" />
              <span>
                {purchaseOrderPaid
                  ? "DO Ekspedisi / Mover eksternal"
                  : "Stok Tersedia di Gudang (Kirim via Mover)"}
              </span>
            </FormLabel>
            {!purchaseOrderPaid && (
              <FormLabel className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
                <RadioGroupItem value="BUY_STORE" />
                <span>
                  Stok kurang — buat PO, lalu kirim invoice ke Keuangan
                </span>
              </FormLabel>
            )}
          </RadioGroup>
          {actionType === "READY_WAREHOUSE" && (
            <p className="text-xs text-muted-foreground">
              {purchaseOrderPaid
                ? "Barang PO yang lunas akan dikirim melalui ekspedisi. Isi data kendaraan dan driver; stok dicadangkan saat DO dibuat."
                : "Sistem mencocokkan nama barang dan satuan secara persis, lalu mengurangi stok saat DO dibuat. Jika ada barang kurang, pilih proses PO."}
            </p>
          )}
          {actionType === "READY_WAREHOUSE" && purchaseOrderPaid && (
            <section className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="external-vehicle-document">No. STK</Label>
                <Input
                  id="external-vehicle-document"
                  value={externalDelivery.vehicleDocumentNumber}
                  maxLength={80}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      vehicleDocumentNumber: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-vehicle-plate">Plat nomor</Label>
                <Input
                  id="external-vehicle-plate"
                  value={externalDelivery.vehiclePlate}
                  maxLength={40}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      vehiclePlate: event.target.value.toUpperCase(),
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-driver-name">Nama driver</Label>
                <Input
                  id="external-driver-name"
                  value={externalDelivery.driverName}
                  maxLength={180}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      driverName: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external-driver-nik">NIK driver (16 digit)</Label>
                <Input
                  id="external-driver-nik"
                  inputMode="numeric"
                  value={externalDelivery.driverIdentityNumber}
                  maxLength={16}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      driverIdentityNumber: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="external-driver-phone">Nomor HP driver</Label>
                <Input
                  id="external-driver-phone"
                  type="tel"
                  value={externalDelivery.driverPhone}
                  maxLength={32}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      driverPhone: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </section>
          )}
          {actionType === "READY_WAREHOUSE" &&
            !purchaseOrderPaid &&
            !existingDeliveryOrder && (
              <section className="space-y-2 rounded-md border p-3">
                <Label htmlFor="internal-vehicle">Kendaraan master untuk DO</Label>
                <select
                  id="internal-vehicle"
                  value={selectedVehicleId}
                  onChange={(event) => setSelectedVehicleId(event.target.value)}
                  disabled={isPending || vehicles.filter(
                    (vehicle) =>
                      vehicle.status === "AVAILABLE" &&
                      vehicle.odometerInitialized,
                  ).length === 0}
                  className="h-10 w-full rounded-md border bg-background px-3"
                  required
                >
                  <option value="">Pilih kendaraan</option>
                  {vehicles
                    .filter(
                      (vehicle) =>
                        vehicle.status === "AVAILABLE" &&
                        vehicle.odometerInitialized,
                    )
                    .map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.plateNumber} · {vehicle.vehicleType}
                        {vehicle.brand ? ` · ${vehicle.brand}` : ""}
                        {vehicle.modelName ? ` · ${vehicle.modelName}` : ""}
                        {` · ${vehicle.currentKilometer} km`}
                      </option>
                    ))}
                </select>
                {vehicles.filter(
                  (vehicle) =>
                    vehicle.status === "AVAILABLE" &&
                    vehicle.odometerInitialized,
                ).length === 0 && (
                  <p className="text-xs text-destructive" role="alert">
                    Belum ada kendaraan tersedia dengan KM awal yang sudah disiapkan.
                  </p>
                )}
              </section>
            )}
          {actionType === "BUY_STORE" && !latestPurchaseOrder && (
            <CreatePOForm
              key={ticket.id}
              vendors={vendors}
              stockItems={stockItems}
              ticketId={ticket.id}
              projectSiteName={
                ticket.project
                  ? `${ticket.project.kelompokTani} · ${ticket.project.title}`
                  : "Gudang (tanpa proyek)"
              }
              ticketItems={ticket.items.map((item) => ({
                ticketItemId: item.id,
                itemName: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.estimatedCost,
              }))}
              onCreated={(publicCode) => {
                onOpenChange(false);
                router.push(`/d/${publicCode}`);
              }}
              onCancel={() => setActionType("READY_WAREHOUSE")}
            />
          )}
          {actionType === "BUY_STORE" && latestPurchaseOrder && (
            <section className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">
                    PO {latestPurchaseOrder.poNumber}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {latestPurchaseOrder.vendorName}
                  </p>
                </div>
                <Badge
                  variant={
                    purchaseOrderApproved ? "lightSuccess" : "lightWarning"
                  }
                >
                  {purchaseOrderPaid
                    ? "Lunas · masuk stok gudang"
                    : purchaseOrderApproved
                      ? "Disetujui"
                    : latestPurchaseOrder.status === POStatus.PENDING_APPROVAL
                      ? "Menunggu Direktur"
                      : latestPurchaseOrder.status === POStatus.REJECTED
                        ? "Ditolak"
                        : latestPurchaseOrder.status === POStatus.CANCELLED
                          ? "Dibatalkan"
                          : "Menunggu Finance"}
                </Badge>
              </div>
              <ActionIconButton
                type="button"
                label={`Buka / cetak PO ${latestPurchaseOrder.poNumber}`}
                tooltip="Buka / cetak PO"
                icon={FileText}
                href={`/d/${latestPurchaseOrder.publicCode}`}
              />
              {purchaseOrderPaid ? (
                <p className="text-sm text-muted-foreground">
                  Pembayaran tercatat dan barang sudah masuk stok gudang.
                  Gunakan opsi stok gudang untuk menerbitkan DO.
                </p>
              ) : !purchaseOrderApproved ? (
                <p className="text-sm text-muted-foreground">
                  Invoice dapat dikirim ke Keuangan setelah PO disetujui.
                </p>
              ) : (
                <div className="space-y-4">
                  {latestPurchaseOrder.invoiceId && (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(latestPurchaseOrder.invoiceId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                        Cetak Invoice Vendor
                      </a>
                    </Button>
                  )}
                  {!latestPurchaseOrder.vendorInvoiceUrl && (
                    <>
                      <InvoiceDetailsFields
                        idPrefix={`ticket-invoice-${ticket.id}`}
                        value={invoiceDraft}
                        paymentMethod={latestPurchaseOrder.paymentMethod ?? null}
                        paymentTerms={latestPurchaseOrder.paymentTerms ?? null}
                        bankName={latestPurchaseOrder.paymentBankName ?? null}
                        bankAccount={
                          latestPurchaseOrder.paymentAccountNumber ?? null
                        }
                        bankHolder={
                          latestPurchaseOrder.paymentAccountName ?? null
                        }
                        onChange={(draft) =>
                          setInvoiceDraftState({
                            orderCode: latestPurchaseOrder?.publicCode ?? null,
                            draft,
                          })
                        }
                      />
                      <Input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        disabled={isPending}
                        onChange={(event) =>
                          setInvoiceFileState({
                            orderCode: latestPurchaseOrder?.publicCode ?? null,
                            file: event.currentTarget.files?.[0] ?? null,
                          })
                        }
                      />
                      {invoiceFile && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-all text-xs text-muted-foreground">
                            File lokal siap dikirim: {invoiceFile.name}
                          </p>
                          <InvoiceFilePreview file={invoiceFile} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
            </>
          )}
          {message && (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Tutup
              </Button>
            </DialogClose>
            {actionType === "READY_WAREHOUSE" ||
            (actionType === "BUY_STORE" &&
              purchaseOrderApproved &&
              !purchaseOrderPaid) ? (
              <Button
                type="submit"
                disabled={
                  isPending ||
                  (actionType === "BUY_STORE" &&
                    purchaseOrderApproved &&
                    !purchaseOrderPaid &&
                    !invoiceFile)
                }
              >
                {isPending
                  ? "Memproses..."
                  : existingDeliveryOrder
                    ? "Lanjutkan dengan DO yang Ada"
                    : actionType === "READY_WAREHOUSE"
                    ? "Terbitkan DO & Cadangkan Stok"
                    : purchaseOrderApproved
                      ? "Kirim Invoice ke Keuangan"
                      : "Buat PO"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
    </GlobalModal>
  );
}
