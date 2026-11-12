"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Printer, QrCode, Save, Trash2 } from "lucide-react";
import { DODeliveryMethod, DOStatus } from "@prisma/client";
import type { VehicleSummary } from "@/app/actions/vehicles";
import { createDeliveryOrder, updateDeliveryOrder } from "@/app/actions/orders";
import type { DeliveryOrderItemInput } from "@/app/actions/orders";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { withLocalPhotoPreview } from "@/lib/photo-urls";

type DeliveryTicketOption = {
  id: string;
  ticketNumber: string;
  title: string;
  projectName: string;
  projectLocation: string;
  vendorName: string;
  requesterName: string;
  moverName: string;
  items: Array<{
    itemName: string;
    quantity: number;
    unit: string;
  }>;
};

type DOFormValues = {
  doNumber: string;
  ticketId: string;
  deliveryMethod: DODeliveryMethod;
  vehicleId: string;
  vehicleDocumentNumber: string;
  driverName: string;
  vehiclePlate: string;
  driverIdentityNumber: string;
  driverPhone: string;
  receiverName: string;
  status: DOStatus;
  items: DeliveryOrderItemInput[];
};

const statusLabels: Record<DOStatus, string> = {
  PENDING: "Menunggu",
  IN_TRANSIT: "Dalam perjalanan",
  DELIVERED: "Terkirim",
  RETURNED: "Dikembalikan",
};

export default function DOEditForm({
  publicCode,
  doNumber,
  poNumber,
  ticketNumber,
  ticketId,
  ticketOptions = [],
  projectName,
  projectSiteLocation,
  vendorName,
  driverName,
  deliveryMethod,
  vehicleDocumentNumber,
  assignedMoverName,
  vehiclePlate,
  vehicleId,
  driverIdentityNumber,
  driverPhone,
  receiverName,
  status,
  arrivalPhotoUrl,
  receivedAt,
  receivedByName,
  canReceiveMaterial = false,
  items,
  qrDataUrl,
  createdAt,
  logisticsStaffName,
  availableVehicles = [],
  canAssignVehicle = false,
  canCreateInternalDelivery = true,
}: {
  publicCode?: string;
  doNumber?: string;
  poNumber?: string | null;
  ticketNumber?: string | null;
  ticketId?: string | null;
  ticketOptions?: DeliveryTicketOption[];
  projectName?: string | null;
  projectSiteLocation?: string | null;
  vendorName?: string | null;
  driverName?: string | null;
  deliveryMethod?: DODeliveryMethod;
  vehicleDocumentNumber?: string | null;
  assignedMoverName?: string | null;
  vehiclePlate?: string | null;
  vehicleId?: string | null;
  driverIdentityNumber?: string | null;
  driverPhone?: string | null;
  receiverName?: string | null;
  status?: DOStatus;
  arrivalPhotoUrl?: string | null;
  receivedAt?: string | null;
  receivedByName?: string | null;
  canReceiveMaterial?: boolean;
  items?: DeliveryOrderItemInput[];
  qrDataUrl?: string | null;
  createdAt?: string;
  logisticsStaffName?: string | null;
  availableVehicles?: Pick<
    VehicleSummary,
    "id" | "plateNumber" | "vehicleType" | "brand" | "modelName" | "currentKilometer"
  >[];
  canAssignVehicle?: boolean;
  canCreateInternalDelivery?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [showQr, setShowQr] = useState(Boolean(publicCode));
  const [arrivalPhotoFile, setArrivalPhotoFile] = useState<File | null>(null);
  const initialTicket = ticketOptions.find((ticket) => ticket.id === ticketId);
  const initialMoverName = assignedMoverName ?? initialTicket?.moverName;
  const form = useForm<DOFormValues>({
    defaultValues: {
      doNumber: doNumber ?? "",
      ticketId: ticketId ?? "",
      deliveryMethod:
        deliveryMethod ??
        (canCreateInternalDelivery
          ? DODeliveryMethod.INTERNAL_MOVER
          : DODeliveryMethod.EXPEDITION),
      vehicleId: vehicleId ?? "",
      vehicleDocumentNumber: vehicleDocumentNumber ?? "",
      driverName:
        (deliveryMethod ?? DODeliveryMethod.INTERNAL_MOVER) ===
        DODeliveryMethod.EXPEDITION
          ? driverName ?? ""
          : initialMoverName || driverName || "",
      vehiclePlate: vehiclePlate ?? "",
      driverIdentityNumber: driverIdentityNumber ?? "",
      driverPhone: driverPhone ?? "",
      receiverName: receiverName ?? "",
      status: status ?? DOStatus.PENDING,
      items: items?.length
        ? items
        : ticketOptions.find((ticket) => ticket.id === ticketId)?.items.map((item) => ({
            itemName: item.itemName,
            qtyOrdered: item.quantity,
            qtyDelivered: 0,
            unit: item.unit,
            remarks: "",
          })) ?? [
            { itemName: "", qtyOrdered: 1, qtyDelivered: 0, unit: "pcs", remarks: "" },
          ],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
    keyName: "fieldId",
  });
  const watchedItems = useWatch({ control: form.control, name: "items" }) ?? [];
  const watchedForm = useWatch({ control: form.control });
  const selectedTicket = ticketOptions.find(
    (ticket) => ticket.id === watchedForm.ticketId,
  );
  const effectiveProjectName = selectedTicket?.projectName ?? projectName;
  const effectiveProjectSite =
    selectedTicket?.projectLocation || projectSiteLocation;
  const effectiveMoverName =
    watchedForm.deliveryMethod === DODeliveryMethod.INTERNAL_MOVER
      ? selectedTicket?.moverName || assignedMoverName
      : null;
  const getStatusLabel = (value: DOStatus) =>
    watchedForm.deliveryMethod === DODeliveryMethod.EXPEDITION &&
    value === DOStatus.DELIVERED
      ? "Material tiba di gudang"
      : statusLabels[value];

  const submit = form.handleSubmit(
    async (values) => {
      setMessage("");
      setIsSaving(true);
      try {
        const isInternal =
          values.deliveryMethod === DODeliveryMethod.INTERNAL_MOVER;
        const payload = {
          ...values,
          ticketId: values.ticketId?.trim() || undefined,
          vehicleId:
            isInternal && values.vehicleId?.trim()
              ? values.vehicleId.trim()
              : undefined,
          vehicleDocumentNumber:
            values.vehicleDocumentNumber?.trim() || undefined,
          driverIdentityNumber: values.driverIdentityNumber?.trim() || undefined,
          driverName: values.driverName?.trim() || "",
          vehiclePlate: values.vehiclePlate?.trim() || "",
          driverPhone: values.driverPhone?.trim() || "",
          receiverName: values.receiverName?.trim() || undefined,
          items: values.items.map((item) => ({
            ...item,
            id: item.id?.trim() ? item.id.trim() : undefined,
            itemName: item.itemName.trim(),
            unit: item.unit.trim(),
            qtyOrdered: Number(item.qtyOrdered),
            qtyDelivered: Number(item.qtyDelivered),
            remarks: item.remarks?.trim() || undefined,
          })),
        };
        const result = publicCode
          ? await updateDeliveryOrder(
              publicCode,
              payload,
              arrivalPhotoFile ?? undefined,
            )
          : await createDeliveryOrder(payload);
        setIsError(!result.success);
        setMessage(result.message);
        if (result.success) {
          if (publicCode) router.back();
          else if (result.publicCode) router.replace(`/d/${result.publicCode}`);
          else router.refresh();
        }
      } catch (error) {
        console.error("Delivery Order edit failed:", error);
        setIsError(true);
        setMessage("DO gagal disimpan. Periksa koneksi lalu coba kembali.");
      } finally {
        setIsSaving(false);
      }
    },
    (errors) => {
      console.warn("Delivery Order client validation failed:", errors);
      setIsError(true);
      const firstError = Object.values(errors)[0];
      const errorMsg =
        typeof firstError?.message === "string" && firstError.message
          ? firstError.message
          : "Mohon lengkapi seluruh data wajib sebelum menyimpan.";
      setMessage(errorMsg);
    },
  );

  return (
    <form onSubmit={submit} className="order-editor-print-area space-y-6">
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {publicCode ? `Delivery Order · ${doNumber}` : "1. Informasi Pengiriman & Kendaraan"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {ticketNumber
                ? `Referensi tiket ${ticketNumber}`
                : poNumber
                  ? `Terkait PO ${poNumber}`
                  : "Pilih referensi tiket material, metode pengiriman, serta data pengemudi."}
            </p>
          </div>
          <Badge variant={status === DOStatus.DELIVERED ? "default" : "secondary"}>
            {getStatusLabel(status ?? DOStatus.PENDING)}
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="do-number">Nomor DO / Surat Jalan</Label>
            {publicCode ? (
              <Input
                id="do-number"
                {...form.register("doNumber", {
                  required: "Nomor DO wajib diisi.",
                  maxLength: 80,
                })}
              />
            ) : (
              <Input
                id="do-number"
                value="Terbit otomatis setelah DO disimpan"
                readOnly
                aria-describedby="do-number-hint"
              />
            )}
            {!publicCode && (
              <p id="do-number-hint" className="text-xs text-muted-foreground">
                Format nomor: SPE-urutan/DO/tahun.
              </p>
            )}
          </div>
          {publicCode ? (
            ticketNumber && (
              <div className="space-y-2">
                <Label>Referensi tiket logistik</Label>
                <Input value={ticketNumber} readOnly />
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Label htmlFor="do-ticket">Referensi tiket logistik</Label>
              <Controller
                control={form.control}
                name="ticketId"
                rules={{ required: "Pilih tiket material sebagai referensi DO." }}
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(value) => {
                      field.onChange(value);
                      const selected = ticketOptions.find(
                        (ticket) => ticket.id === value,
                      );
                      if (selected) {
                        replace(
                          selected.items.map((item) => ({
                            itemName: item.itemName,
                            qtyOrdered: item.quantity,
                            qtyDelivered: 0,
                            unit: item.unit,
                            remarks: "",
                          })),
                        );
                        form.setValue("receiverName", selected.requesterName);
                        if (selected.moverName) {
                          form.setValue("driverName", selected.moverName);
                        }
                      }
                    }}
                  >
                    <SelectTrigger id="do-ticket">
                      <SelectValue placeholder="Pilih nomor tiket" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketOptions.map((ticket) => (
                        <SelectItem key={ticket.id} value={ticket.id}>
                          {ticket.ticketNumber} — {ticket.projectName || ticket.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.ticketId?.message && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.ticketId.message}
                </p>
              )}
            </div>
          )}
          {(selectedTicket || projectName) && (
            <div className="space-y-2">
              <Label>Nama proyek</Label>
              <Input
                value={
                  selectedTicket?.projectName ??
                  projectName ??
                  "Gudang (tanpa proyek)"
                }
                readOnly
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="do-delivery-method">Jenis pengiriman</Label>
            <Controller
              control={form.control}
              name="deliveryMethod"
              render={({ field }) => (
                <Select
                  value={field.value}
                  disabled={Boolean(publicCode)}
                  onValueChange={(value) => {
                    if (
                      value === DODeliveryMethod.INTERNAL_MOVER ||
                      value === DODeliveryMethod.EXPEDITION
                    ) {
                      field.onChange(value);
                      if (value === DODeliveryMethod.EXPEDITION) {
                        form.setValue("vehicleId", "");
                        form.clearErrors("vehicleId");
                      }
                    }
                  }}
                >
                  <SelectTrigger id="do-delivery-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value={DODeliveryMethod.INTERNAL_MOVER}
                      disabled={!canCreateInternalDelivery}
                    >
                      Mover internal
                    </SelectItem>
                    <SelectItem value={DODeliveryMethod.EXPEDITION}>
                      Ekspedisi / Mover eksternal
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="do-status">Status pengiriman</Label>
            {watchedForm.deliveryMethod === DODeliveryMethod.INTERNAL_MOVER ? (
              <Input
                id="do-status"
                value={getStatusLabel(
                  watchedForm.status ?? status ?? DOStatus.PENDING,
                )}
                readOnly
              />
            ) : (
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="do-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.values(DOStatus).map((value) => (
                        <SelectItem
                          key={value}
                          value={value}
                          disabled={
                            value === DOStatus.DELIVERED &&
                            !canReceiveMaterial &&
                            status !== DOStatus.DELIVERED
                          }
                        >
                          {getStatusLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="do-driver">Nama driver / Mover</Label>
            <Input
              id="do-driver"
              maxLength={180}
              required={watchedForm.deliveryMethod === DODeliveryMethod.EXPEDITION}
              readOnly={Boolean(effectiveMoverName)}
              {...form.register("driverName")}
            />
            {effectiveMoverName && (
              <p className="text-xs text-muted-foreground">
                Diisi otomatis dari penugasan Mover pada tiket.
              </p>
            )}
          </div>
          {watchedForm.deliveryMethod === DODeliveryMethod.INTERNAL_MOVER ? (
            <div className="space-y-2">
              <Label htmlFor="do-vehicle">Kendaraan master (ditetapkan Logistik)</Label>
              {publicCode && (vehicleId || !canAssignVehicle) ? (
                <Input
                  id="do-vehicle"
                  value={vehiclePlate ?? "Belum ditetapkan"}
                  readOnly
                />
              ) : (
                <Controller
                  control={form.control}
                  name="vehicleId"
                  rules={{
                    validate: (selectedId) => {
                      if (
                        form.getValues("deliveryMethod") ===
                          DODeliveryMethod.INTERNAL_MOVER &&
                        !selectedId?.trim()
                      ) {
                        return "Pilih kendaraan master untuk DO internal.";
                      }
                      return true;
                    },
                  }}
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(selectedVehicleId) => {
                        field.onChange(selectedVehicleId);
                        form.setValue(
                          "vehiclePlate",
                          availableVehicles.find(
                            (vehicle) => vehicle.id === selectedVehicleId,
                          )?.plateNumber ?? "",
                        );
                      }}
                    >
                      <SelectTrigger id="do-vehicle">
                        <SelectValue placeholder="Pilih kendaraan tersedia" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.plateNumber} · {vehicle.vehicleType}
                            {vehicle.brand ? ` · ${vehicle.brand}` : ""}
                            {vehicle.modelName ? ` ${vehicle.modelName}` : ""}
                            {` · ${vehicle.currentKilometer} km`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              {availableVehicles.length === 0 && !publicCode && (
                <p className="text-sm text-destructive">
                  Belum ada kendaraan tersedia dengan KM awal yang sudah diinisialisasi.
                </p>
              )}
              {publicCode && canAssignVehicle && !vehicleId && availableVehicles.length === 0 && (
                <p className="text-sm text-destructive">
                  Belum ada kendaraan tersedia dengan KM awal yang sudah diinisialisasi.
                </p>
              )}
              {form.formState.errors.vehicleId?.message && (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.vehicleId.message}
                </p>
              )}
              {(!publicCode || (canAssignVehicle && !vehicleId)) && (
                <p className="text-xs text-muted-foreground">
                  Kendaraan akan direservasi untuk DO ini setelah disimpan.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="do-plate">Plat nomor kendaraan</Label>
              <Input
                id="do-plate"
                maxLength={40}
                required
                {...form.register("vehiclePlate")}
              />
            </div>
          )}
          {watchedForm.deliveryMethod === DODeliveryMethod.EXPEDITION && (
            <>
              <div className="space-y-2">
                <Label htmlFor="do-vehicle-document">No. STNK / Dokumen Kendaraan (opsional)</Label>
                <Input
                  id="do-vehicle-document"
                  maxLength={80}
                  placeholder="Contoh: No. STNK (opsional)"
                  {...form.register("vehicleDocumentNumber")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="do-driver-nik">NIK driver (16 digit, opsional)</Label>
                <Input
                  id="do-driver-nik"
                  inputMode="numeric"
                  maxLength={16}
                  placeholder="Contoh: 1101010101010001 (opsional)"
                  {...form.register("driverIdentityNumber", {
                    onChange: (event) => {
                      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 16);
                    },
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="do-driver-phone">Nomor HP driver (opsional)</Label>
                <Input
                  id="do-driver-phone"
                  type="tel"
                  maxLength={32}
                  placeholder="Contoh: 081234567890 (opsional)"
                  {...form.register("driverPhone")}
                />
              </div>
            </>
          )}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="do-receiver">
              {watchedForm.deliveryMethod === DODeliveryMethod.EXPEDITION
                ? "Penerima material di gudang"
                : "Nama penerima / tim lapangan"}
            </Label>
            {watchedForm.deliveryMethod === DODeliveryMethod.EXPEDITION ? (
              <Input
                id="do-receiver"
                value={
                  receivedByName ||
                  (receivedAt
                    ? receiverName || "Tim Logistik"
                    : "Diisi otomatis oleh Logistik saat material diterima")
                }
                readOnly
              />
            ) : (
              <Input
                id="do-receiver"
                maxLength={180}
                {...form.register("receiverName")}
              />
            )}
          </div>
          {watchedForm.deliveryMethod === DODeliveryMethod.EXPEDITION &&
            publicCode && (
              <div className="space-y-3 rounded-md border p-4 md:col-span-2">
                <div>
                  <Label htmlFor="do-arrival-photo">
                    Foto material tiba di gudang
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Penerimaan dicatat oleh Logistik. Foto JPG, PNG, atau WEBP,
                    maksimal 5 MB, wajib diunggah saat status diubah menjadi
                    Material tiba di gudang.
                  </p>
                </div>
                {!arrivalPhotoUrl && canReceiveMaterial && (
                  <Input
                    id="do-arrival-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    required={
                      canReceiveMaterial &&
                      watchedForm.status === DOStatus.DELIVERED
                    }
                    onChange={(event) =>
                      setArrivalPhotoFile(event.target.files?.[0] ?? null)
                    }
                  />
                )}
                {arrivalPhotoFile && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      Foto dipilih: {arrivalPhotoFile.name}
                    </p>
                    <InvoiceFilePreview
                      file={arrivalPhotoFile}
                      title="Pratinjau Foto Material Tiba"
                      label="Pratinjau foto material tiba"
                      tooltip="Pratinjau foto material tiba"
                    />
                  </div>
                )}
                {arrivalPhotoUrl && (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-start">
                    <Image
                      key={arrivalPhotoUrl}
                      src={withLocalPhotoPreview(arrivalPhotoUrl)}
                      alt="Bukti foto material tiba di gudang"
                      width={640}
                      height={480}
                      unoptimized
                      className="h-auto max-h-72 w-full rounded-md border object-contain"
                    />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">
                        Material diterima oleh {receivedByName || receiverName || "Tim Logistik"}
                      </p>
                      <p className="text-muted-foreground">
                        Waktu tiba: {receivedAt || "Belum tercatat"}
                      </p>
                    </div>
                  </div>
                )}
                {!canReceiveMaterial && !arrivalPhotoUrl && (
                  <p className="text-sm text-muted-foreground">
                    Hanya pengguna role Logistik yang dapat mencatat penerimaan
                    material dan mengunggah bukti.
                  </p>
                )}
              </div>
            )}
        </div>
        {publicCode && (
          <p className="text-xs text-muted-foreground">URL samaran: /d/{publicCode}</p>
        )}
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">2. Item Pengiriman</h2>
            <p className="text-xs text-muted-foreground">
              Jumlah terkirim tidak dapat melebihi jumlah yang dipesan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              append({ itemName: "", qtyOrdered: 1, qtyDelivered: 0, unit: "pcs", remarks: "" })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Tambah item
          </Button>
        </div>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Nama barang</TableHead>
                <TableHead className="w-36 min-w-[110px]">Qty dipesan</TableHead>
                <TableHead className="w-36 min-w-[110px]">Qty dikirim</TableHead>
                <TableHead className="w-24 min-w-[90px]">Satuan</TableHead>
                <TableHead className="min-w-[160px]">Catatan kondisi</TableHead>
                <TableHead className="w-16"><span className="sr-only">Aksi</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.fieldId}>
                  <TableCell>
                    <input
                      type="hidden"
                      {...form.register(`items.${index}.id`)}
                    />
                    <Input
                      aria-label={`Nama barang baris ${index + 1}`}
                      readOnly={!publicCode && Boolean(selectedTicket)}
                      {...form.register(`items.${index}.itemName`, {
                        required: "Nama barang wajib diisi.",
                        maxLength: 180,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      readOnly={!publicCode && Boolean(selectedTicket)}
                      aria-label={`Qty dipesan baris ${index + 1}`}
                      {...form.register(`items.${index}.qtyOrdered`, {
                        valueAsNumber: true,
                        required: true,
                        min: 0.01,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max={watchedItems[index]?.qtyOrdered ?? undefined}
                      step="any"
                      aria-label={`Qty dikirim baris ${index + 1}`}
                      {...form.register(`items.${index}.qtyDelivered`, {
                        valueAsNumber: true,
                        required: true,
                        min: 0,
                        validate: (value) =>
                          value <= Number(watchedItems[index]?.qtyOrdered) ||
                          "Qty dikirim tidak boleh melebihi qty dipesan.",
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Satuan barang baris ${index + 1}`}
                      readOnly={!publicCode && Boolean(selectedTicket)}
                      {...form.register(`items.${index}.unit`, {
                        required: "Satuan wajib diisi.",
                        maxLength: 40,
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Catatan kondisi baris ${index + 1}`}
                      placeholder="Kondisi barang saat diterima"
                      {...form.register(`items.${index}.remarks`, { maxLength: 1000 })}
                    />
                  </TableCell>
                  <TableCell>
                    <ActionIconButton
                      type="button"
                      label={`Hapus item baris ${index + 1}`}
                      tooltip={`Hapus item baris ${index + 1}`}
                      icon={Trash2}
                      className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {showQr && (
        <Card className="flex flex-col items-center gap-3 p-5 text-center">
          <h2 className="font-semibold">QR Dokumen Delivery Order</h2>
          {qrDataUrl ? (
            <Image
              src={qrDataUrl}
              alt="QR code unik untuk verifikasi Delivery Order"
              width={180}
              height={180}
              unoptimized
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {!publicCode
                ? "Simpan DO untuk membuat URL samaran dan QR code."
                : "URL publik aplikasi belum dikonfigurasi. Atur NEXT_PUBLIC_APP_URL untuk membuat QR yang dapat dipindai."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Pindai QR untuk membuka tampilan dokumen Delivery Order.
          </p>
          {publicCode && (
            <a
              className="text-xs font-medium text-primary underline underline-offset-4"
              href={`/api/documents/transactions?kind=DO&publicCode=${encodeURIComponent(publicCode)}&format=html`}
              rel="noreferrer"
              target="_blank"
            >
              Buka tampilan dokumen DO
            </a>
          )}
        </Card>
      )}

      {message && (
        <p
          className={`text-sm ${isError ? "text-destructive" : "text-emerald-700"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <div className="order-editor-actions sticky bottom-16 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur xl:bottom-4">
        <Button type="submit" disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving
            ? "Menyimpan..."
            : publicCode
              ? "Simpan Perubahan"
              : "Buat Delivery Order"}
        </Button>
        {publicCode && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPdfPreviewOpen(true)}
            >
              <Printer className="mr-2 h-4 w-4" /> Pratinjau / Cetak PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowQr((visible) => !visible)}
            >
              <QrCode className="mr-2 h-4 w-4" />
              {showQr ? "Sembunyikan QR" : "Tampilkan QR verifikasi"}
            </Button>
          </>
        )}
      </div>
      {publicCode && (
        <GlobalModal
          isOpen={isPdfPreviewOpen}
          onClose={() => setIsPdfPreviewOpen(false)}
          title={`Pratinjau DO ${doNumber}`}
          description="Pratinjau dokumen Delivery Order / Surat Jalan sesuai format cetak."
          className="max-w-6xl"
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
          footerNote=""
          footer={
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPdfPreviewOpen(false)}
            >
              Tutup
            </Button>
          }
        >
          <UniversalDocumentPreview
            title={`Delivery Order ${doNumber ?? "DO"}`}
            documentNumber={doNumber ?? "DO"}
            src={`/api/documents/transactions?kind=DO&publicCode=${encodeURIComponent(publicCode)}`}
          />
        </GlobalModal>
      )}
    </form>
  );
}
