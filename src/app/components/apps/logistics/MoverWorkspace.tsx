"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  startMoverDeliveryOrder,
  submitMoverDeliveryProofs,
} from "@/app/actions/orders";
import {
  createVehicleFuelRequest,
  submitVehicleFuelProof,
} from "@/app/actions/vehicle-fuel";
import { createEquipmentLog } from "@/app/actions/construction";
import { DOStatus, VehicleFuelSource } from "@prisma/client";
import {
  ExternalLink,
  Truck,
  Fuel,
  CheckCircle2,
  Clock,
  Navigation,
  Camera,
  Image as ImageIcon,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
} from "lucide-react";
import {
  VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
  VEHICLE_FUEL_PRICE_PER_LITER,
} from "@/lib/vehicle-fuel";
import type { VehicleFuelRequestView } from "@/lib/vehicle-fuel-types";
import { photoDownloadHref, withLocalPhotoPreview } from "@/lib/photo-urls";
import {
  compressFieldImageFile,
  compressFieldImageFiles,
} from "@/lib/image-compression-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/label";
import { NativeDataTable } from "@/components/ui/native-data-table";

type MoverDeliveryOrder = {
  publicCode: string;
  doNumber: string;
  status: DOStatus;
  createdAt: string;
  driverName: string | null;
  vehiclePlate: string | null;
  vehiclePlateNumber: string | null;
  vehicleId: string | null;
  vehicleType: string | null;
  departureKilometer: string | null;
  vehicleCurrentKilometer: string | null;
  vehicleTripLog: {
    kilometerStart: string;
    kilometerEnd: string;
    distanceKm: string;
    fuelLiter: string;
  } | null;
  fuelRequests: VehicleFuelRequestView[];
  receiverName: string | null;
  receiptPhotoUrls: string[];
  ticketNumber: string | null;
  projectName: string;
  items: { itemName: string; qtyDelivered: number; unit: string }[];
};

type EquipmentLogRow = {
  id: string;
  equipmentName: string;
  operatorName: string | null;
  date: string;
  hmStart: string;
  hmEnd: string;
  effectiveHours: string;
  fuelLiter: string;
  projectName: string;
};

type ProjectOption = { id: string; title: string; kelompokTani: string };
type EquipmentOption = {
  id: string;
  code: string;
  name: string;
  currentHM: string;
};

const statusLabels: Record<DOStatus, string> = {
  PENDING: "Siap Dikirim",
  IN_TRANSIT: "Dalam Perjalanan",
  DELIVERED: "Selesai Dikirim",
  RETURNED: "Dikembalikan",
};

export default function MoverWorkspace({
  userName,
  today,
  deliveryOrders,
  projects,
  equipmentMasters,
  equipmentLogs,
  initialTab,
}: {
  userName: string;
  today: string;
  deliveryOrders: MoverDeliveryOrder[];
  projects: ProjectOption[];
  equipmentMasters: EquipmentOption[];
  equipmentLogs: EquipmentLogRow[];
  initialTab?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"deliveries" | "equipment">(
    initialTab === "equipment" ? "equipment" : "deliveries",
  );
  const [deliveryFilter, setDeliveryFilter] = useState<"ALL" | "ACTIVE" | "DELIVERED">("ALL");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [openFuelFormCode, setOpenFuelFormCode] = useState<string | null>(null);

  const [fuelSources, setFuelSources] = useState<Record<string, VehicleFuelSource>>({});
  const [fuelExceptionFlags, setFuelExceptionFlags] = useState<Record<string, boolean>>({});

  const startDelivery = (event: FormEvent<HTMLFormElement>, publicCode: string) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const kilometerStart = Number(formData.get("kilometerStart"));
    if (!Number.isFinite(kilometerStart)) return;
    setPendingCode(publicCode);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await startMoverDeliveryOrder(publicCode, kilometerStart);
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          router.refresh();
        }
      } catch (error) {
        console.error("Mover could not start delivery:", error);
        setMessage("Pengiriman gagal dimulai. Coba muat ulang halaman.");
        setIsError(true);
      } finally {
        setPendingCode("");
      }
    });
  };

  const submitFuelRequest = (event: FormEvent<HTMLFormElement>, publicCode: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const beforePhoto = data.get("beforeFillingPhoto");
    const afterPhoto = data.get("afterFillingPhoto");
    const receipt = data.get("receiptPhoto");
    const includeExceptionAllowance = data.get("includeExceptionAllowance") === "on";

    if (
      !(beforePhoto instanceof File) ||
      beforePhoto.size === 0 ||
      !(afterPhoto instanceof File) ||
      afterPhoto.size === 0
    ) {
      setMessage("Foto speedometer sebelum dan sesudah pengisian wajib dilampirkan.");
      setIsError(true);
      return;
    }
    if (includeExceptionAllowance && !String(data.get("exceptionReason") ?? "").trim()) {
      setMessage("Alasan kondisi khusus wajib diisi untuk toleransi 10 km.");
      setIsError(true);
      return;
    }

    setPendingCode(publicCode);
    setMessage("");
    startTransition(async () => {
      try {
        const compressedBefore = await compressFieldImageFile(beforePhoto);
        const compressedAfter = await compressFieldImageFile(afterPhoto);
        const compressedReceipt =
          receipt instanceof File && receipt.size > 0
            ? await compressFieldImageFile(receipt)
            : undefined;
        const result = await createVehicleFuelRequest(publicCode, {
          source:
            data.get("source") === VehicleFuelSource.RETAIL
              ? VehicleFuelSource.RETAIL
              : VehicleFuelSource.SPBU,
          beforeFillingPhoto: compressedBefore,
          afterFillingPhoto: compressedAfter,
          ...(compressedReceipt ? { receiptPhoto: compressedReceipt } : {}),
          includeExceptionAllowance,
          ...(includeExceptionAllowance
            ? { exceptionReason: String(data.get("exceptionReason") ?? "") }
            : {}),
        });
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
          setOpenFuelFormCode(null);
          setFuelSources((current) => ({
            ...current,
            [publicCode]: VehicleFuelSource.SPBU,
          }));
          setFuelExceptionFlags((current) => ({
            ...current,
            [publicCode]: false,
          }));
          router.refresh();
        }
      } catch (error) {
        console.error("Mover fuel request failed:", error);
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "Request dana BBM gagal dikirim. Silakan coba kembali.",
        );
        setIsError(true);
      } finally {
        setPendingCode("");
      }
    });
  };

  const submitFuelProof = (
    event: FormEvent<HTMLFormElement>,
    requestId: string,
    publicCode: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const afterPhoto = data.get("afterFillingPhoto");
    const receipt = data.get("receiptPhoto");
    if (!(afterPhoto instanceof File) || afterPhoto.size === 0) {
      setMessage("Foto speedometer setelah pengisian wajib dilampirkan.");
      setIsError(true);
      return;
    }
    setPendingCode(publicCode);
    setMessage("");
    startTransition(async () => {
      try {
        const compressedAfter = await compressFieldImageFile(afterPhoto);
        const compressedReceipt =
          receipt instanceof File && receipt.size > 0
            ? await compressFieldImageFile(receipt)
            : undefined;
        const result = await submitVehicleFuelProof(
          requestId,
          compressedAfter,
          compressedReceipt,
        );
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Mover fuel proof submission failed:", error);
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "Bukti pengisian gagal dikirim. Silakan coba kembali.",
        );
        setIsError(true);
      } finally {
        setPendingCode("");
      }
    });
  };

  const submitDeliveryProof = (event: FormEvent<HTMLFormElement>, publicCode: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = formData
      .getAll("deliveryProofs")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const completeDelivery =
      submitter instanceof HTMLButtonElement && submitter.value === "complete";
    const kmStart = Number(formData.get("kilometerStart"));
    const kmEnd = Number(formData.get("kilometerEnd"));

    const existingCount = deliveryOrders.find((o) => o.publicCode === publicCode)?.receiptPhotoUrls.length ?? 0;
    if (completeDelivery && files.length === 0 && existingCount === 0) {
      setMessage("Unggah minimal satu foto bukti sebelum menyelesaikan DO.");
      setIsError(true);
      return;
    }
    if (!completeDelivery && files.length === 0) {
      setMessage("Pilih minimal satu foto bukti serah-terima untuk disimpan.");
      setIsError(true);
      return;
    }

    setPendingCode(publicCode);
    setMessage("");
    startTransition(async () => {
      try {
        const compressedFiles =
          files.length > 0 ? await compressFieldImageFiles(files) : [];
        const result = await submitMoverDeliveryProofs(
          publicCode,
          compressedFiles,
          completeDelivery,
          completeDelivery ? kmStart : undefined,
          completeDelivery ? kmEnd : undefined,
        );
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Mover could not complete delivery:", error);
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "Pengiriman gagal diselesaikan. Coba muat ulang halaman.",
        );
        setIsError(true);
      } finally {
        setPendingCode("");
      }
    });
  };

  const submitEquipmentLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createEquipmentLog({
          projectId: String(data.get("projectId") ?? ""),
          equipmentMasterId: String(data.get("equipmentMasterId") ?? ""),
          equipmentName: String(data.get("equipmentName") ?? ""),
          operatorName: String(data.get("operatorName") ?? ""),
          date: String(data.get("date") ?? ""),
          hmStart: Number(data.get("hmStart")),
          hmEnd: Number(data.get("hmEnd")),
          effectiveHours: Number(data.get("effectiveHours")),
          fuelLiter: Number(data.get("fuelLiter")),
          notes: String(data.get("notes") ?? ""),
        });
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
          requestNotificationFeedRefresh();
          router.refresh();
        }
      } catch (error) {
        console.error("Mover equipment log submission failed:", error);
        setMessage("Log alat dan BBM gagal disimpan.");
        setIsError(true);
      }
    });
  };

  const inTransitCount = deliveryOrders.filter((d) => d.status === DOStatus.IN_TRANSIT).length;
  const pendingStartCount = deliveryOrders.filter((d) => d.status === DOStatus.PENDING).length;
  const deliveredCount = deliveryOrders.filter((d) => d.status === DOStatus.DELIVERED).length;

  const filteredOrders = deliveryOrders.filter((order) => {
    if (deliveryFilter === "ACTIVE") {
      return order.status === DOStatus.IN_TRANSIT || order.status === DOStatus.PENDING;
    }
    if (deliveryFilter === "DELIVERED") {
      return order.status === DOStatus.DELIVERED;
    }
    return true;
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto px-1 sm:px-0">
      {/* Header Ringkas Mobile-Friendly */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="size-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Ruang Kerja Mover &amp; Armada
              </span>
            </div>
            <h1 className="mt-1 text-lg font-bold text-foreground sm:text-xl">
              Tugas Pengiriman &amp; Request BBM
            </h1>
            <p className="text-xs text-muted-foreground">
              Selamat bertugas, <strong>{userName}</strong>. Kelola pengiriman material ke lokasi proyek, catat KM, dan ajukan BBM langsung dari HP.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 sm:pt-0">
            <div className="rounded-xl border border-border/80 bg-muted/40 p-2 text-center">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Berjalan</span>
              <p className="text-base font-bold text-amber-500">{inTransitCount}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 p-2 text-center">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Antrean</span>
              <p className="text-base font-bold text-foreground">{pendingStartCount}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 p-2 text-center">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Selesai</span>
              <p className="text-base font-bold text-emerald-500">{deliveredCount}</p>
            </div>
          </div>
        </div>

        {/* Tab Pilihan Utama */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab("deliveries")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all sm:text-sm ${
              activeTab === "deliveries"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Truck className="size-4" />
            <span>Pengiriman ({deliveryOrders.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("equipment")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all sm:text-sm ${
              activeTab === "equipment"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Fuel className="size-4" />
            <span>Alat Berat &amp; BBM ({equipmentLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Pesan Aksi */}
      {message && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border p-3.5 text-xs font-medium sm:text-sm ${
            isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          }`}
          role={isError ? "alert" : "status"}
        >
          <div className="flex items-center gap-2">
            {isError ? <Clock className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            <span>{message}</span>
          </div>
          <button
            type="button"
            className="text-xs underline hover:opacity-80"
            onClick={() => setMessage("")}
          >
            Tutup
          </button>
        </div>
      )}

      {/* KONTEN TAB 1: PENGIRIMAN */}
      {activeTab === "deliveries" && (
        <div className="space-y-3">
          {/* Sub-filter sederhana */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <Button
              type="button"
              size="sm"
              variant={deliveryFilter === "ALL" ? "default" : "outline"}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => setDeliveryFilter("ALL")}
            >
              Semua ({deliveryOrders.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={deliveryFilter === "ACTIVE" ? "default" : "outline"}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => setDeliveryFilter("ACTIVE")}
            >
              Aktif / Berjalan ({inTransitCount + pendingStartCount})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={deliveryFilter === "DELIVERED" ? "default" : "outline"}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => setDeliveryFilter("DELIVERED")}
            >
              Sudah Sampai ({deliveredCount})
            </Button>
          </div>

          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <Truck className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                <p className="font-semibold text-foreground">Tidak Ada Surat Jalan</p>
                <p className="text-xs">Tidak ada DO yang sesuai dengan filter yang dipilih.</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => {
              const activeFuelRequest = order.fuelRequests.find(
                (request) =>
                  request.status === "PENDING_FINANCE" ||
                  request.status === "FUNDED" ||
                  request.status === "PROOF_SUBMITTED" ||
                  request.status === "COMPLETED",
              );
              const latestFuelRequest = order.fuelRequests[0];
              const tripDistanceKm = Number(order.vehicleTripLog?.distanceKm ?? 0);
              const includeExceptionAllowance = fuelExceptionFlags[order.publicCode] ?? false;
              const eligibleDistanceKm = tripDistanceKm + (includeExceptionAllowance ? 10 : 0);
              const fuelSource = fuelSources[order.publicCode] ?? VehicleFuelSource.SPBU;
              const fuelUnitPrice = VEHICLE_FUEL_PRICE_PER_LITER[fuelSource];
              const estimatedFuelLiter =
                Math.round(
                  (eligibleDistanceKm / VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER) * 100,
                ) / 100;
              const estimatedFuelAmount = Math.round(
                (eligibleDistanceKm / VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER) * fuelUnitPrice,
              );
              const canRequestFuel =
                order.status === DOStatus.DELIVERED &&
                tripDistanceKm > 0 &&
                !activeFuelRequest &&
                latestFuelRequest?.status !== "COMPLETED";

              const isFuelFormOpen = openFuelFormCode === order.publicCode;

              return (
                <Card
                  key={order.publicCode}
                  className={`overflow-hidden transition-all ${
                    order.status === DOStatus.IN_TRANSIT
                      ? "border-amber-500/50 shadow-sm"
                      : "border-border"
                  }`}
                >
                  <CardHeader className="bg-muted/30 p-3.5 sm:p-4 border-b border-border/70">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-sm font-bold text-primary">
                            {order.doNumber}
                          </span>
                          <Badge
                            variant={
                              order.status === DOStatus.DELIVERED
                                ? "default"
                                : order.status === DOStatus.IN_TRANSIT
                                  ? "lightWarning"
                                  : "outline"
                            }
                            className="text-[11px]"
                          >
                            {statusLabels[order.status]}
                          </Badge>
                          {order.ticketNumber && (
                            <Badge variant="outline" className="text-[10px]">
                              Tiket {order.ticketNumber}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                          <MapPin className="size-3.5 text-primary shrink-0" />
                          <span>{order.projectName}</span>
                        </p>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <div className="flex items-center gap-1 justify-end">
                          <Calendar className="size-3" />
                          <span>{new Date(order.createdAt).toLocaleDateString("id-ID")}</span>
                        </div>
                        {order.vehiclePlateNumber || order.vehiclePlate ? (
                          <span className="font-medium text-foreground">
                            {order.vehiclePlateNumber ?? order.vehiclePlate}
                            {order.vehicleType ? ` (${order.vehicleType})` : ""}
                          </span>
                        ) : (
                          <span className="text-amber-600">Belum ada armada</span>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-3.5 sm:p-4 space-y-3.5">
                    {/* Ringkasan Muatan Material */}
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Muatan Material ({order.items.length} Item)
                      </p>
                      <ul className="divide-y divide-border/50 text-xs">
                        {order.items.map((item, idx) => (
                          <li
                            key={`${item.itemName}-${idx}`}
                            className="flex items-center justify-between py-1.5"
                          >
                            <span className="font-medium text-foreground">{item.itemName}</span>
                            <Badge variant="secondary" className="text-[11px]">
                              {item.qtyDelivered} {item.unit}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* FASE 1: Belum Berangkat (PENDING) */}
                    {order.status === DOStatus.PENDING && (
                      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Navigation className="size-3.5 text-primary" />
                          <span>Mulai Perjalanan Pengiriman</span>
                        </p>
                        {!order.vehicleId ? (
                          <p className="text-xs text-amber-700 bg-amber-500/10 rounded-lg p-2.5">
                            Menunggu bagian Logistik menetapkan kendaraan untuk surat jalan ini.
                          </p>
                        ) : (
                          <form
                            className="grid gap-2 sm:grid-cols-2"
                            onSubmit={(event) => startDelivery(event, order.publicCode)}
                          >
                            <FormLabel className="grid gap-1 text-xs">
                              KM Speedometer Berangkat
                              <Input
                                name="kilometerStart"
                                type="number"
                                min="0"
                                step="0.001"
                                required
                                defaultValue={order.vehicleCurrentKilometer ?? ""}
                                placeholder="Contoh: 188293"
                                className="h-9 text-xs"
                              />
                            </FormLabel>
                            <div className="flex items-end">
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isPending}
                                className="w-full h-9 text-xs font-semibold gap-1.5"
                              >
                                <Navigation className="size-3.5" />
                                {isPending && pendingCode === order.publicCode
                                  ? "Memulai..."
                                  : "Mulai Pengiriman"}
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {/* FASE 2: Dalam Perjalanan (IN_TRANSIT) */}
                    {order.status === DOStatus.IN_TRANSIT && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 space-y-3">
                        <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Truck className="size-4 animate-pulse" />
                            Status: Sedang Dalam Perjalanan
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            KM Berangkat: {order.departureKilometer ?? order.vehicleCurrentKilometer}
                          </span>
                        </div>

                        <form
                          key={order.publicCode}
                          className="space-y-3"
                          onSubmit={(event) => submitDeliveryProof(event, order.publicCode)}
                        >
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            <FormLabel className="grid gap-1 text-xs">
                              <span className="font-semibold flex items-center gap-1">
                                <Camera className="size-3.5 text-primary" />
                                Foto Serah Terima di Lokasi (1–5 Foto)
                              </span>
                              <Input
                                name="deliveryProofs"
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                disabled={isPending}
                                className="h-9 text-xs file:text-xs"
                              />
                            </FormLabel>

                            <FormLabel className="grid gap-1 text-xs">
                              <span className="font-semibold">ODO Speedometer Saat Kembali (KM)</span>
                              <Input
                                name="kilometerEnd"
                                type="number"
                                min="0"
                                step="0.001"
                                required
                                placeholder="Masukkan ODO saat tiba di gudang"
                                className="h-9 text-xs font-mono"
                              />
                            </FormLabel>
                          </div>

                          <input
                            type="hidden"
                            name="kilometerStart"
                            value={
                              order.departureKilometer ?? order.vehicleCurrentKilometer ?? "0"
                            }
                          />

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              type="submit"
                              name="intent"
                              value="save"
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              className="flex-1 h-9 text-xs"
                            >
                              <Camera className="mr-1.5 size-3.5" />
                              {isPending && pendingCode === order.publicCode
                                ? "Menyimpan..."
                                : "Simpan Foto Saja"}
                            </Button>
                            <Button
                              type="submit"
                              name="intent"
                              value="complete"
                              size="sm"
                              disabled={isPending}
                              className="flex-1 h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Check className="mr-1.5 size-4" />
                              {isPending && pendingCode === order.publicCode
                                ? "Memproses..."
                                : "Selesaikan Pengiriman"}
                            </Button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Foto Bukti yang Sudah Diunggah */}
                    {order.receiptPhotoUrls.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          Bukti Serah Terima ({order.receiptPhotoUrls.length} Foto)
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {order.receiptPhotoUrls.map((url, idx) => (
                            <a
                              key={`${url}-${idx}`}
                              href={withLocalPhotoPreview(url)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                            >
                              <ImageIcon className="size-3 text-primary" />
                              <span>Foto Bukti #{idx + 1}</span>
                              <ExternalLink className="size-3 text-muted-foreground" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* FASE 3: Selesai Dikirim & REKAP ODO */}
                    {order.status === DOStatus.DELIVERED && order.vehicleTripLog && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-400">
                          <span>✓ Pengiriman Telah Selesai</span>
                          <span>Jarak: {tripDistanceKm.toLocaleString("id-ID")} KM</span>
                        </div>
                        <p className="text-muted-foreground">
                          ODO Berangkat: {order.vehicleTripLog.kilometerStart} km · ODO Kembali:{" "}
                          {order.vehicleTripLog.kilometerEnd} km · Estimasi konsumsi:{" "}
                          <strong>{order.vehicleTripLog.fuelLiter} Liter</strong>.
                        </p>
                      </div>
                    )}

                    {/* DAFTAR REQUEST BBM YANG SUDAH DIAJUKAN */}
                    {order.fuelRequests.map((request) => (
                      <div
                        key={request.id}
                        className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <Fuel className="size-3.5 text-primary" />
                            Request BBM ({request.source === "SPBU" ? "SPBU" : "Eceran"}) ·{" "}
                            {request.estimatedFuelLiter} L
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {{
                              PENDING_FINANCE: "Menunggu Keuangan",
                              FUNDED: "Dana Diserahkan · Menunggu Foto",
                              REJECTED: "Ditolak",
                              PROOF_SUBMITTED: "Bukti Terkirim (Menunggu Verifikasi)",
                              COMPLETED: "Selesai Disalurkan",
                            }[request.status]}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between border-t border-border/50 pt-1.5">
                          <span className="text-muted-foreground">Plafon Diajukan:</span>
                          <span className="font-bold text-primary text-sm">
                            Rp{Number(request.requestedAmount).toLocaleString("id-ID")}
                          </span>
                        </div>

                        {/* Jika dana sudah diserahkan oleh Keuangan, mover upload bukti pengisian */}
                        {request.status === "FUNDED" && (
                          <form
                            className="space-y-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3"
                            onSubmit={(event) =>
                              submitFuelProof(event, request.id, order.publicCode)
                            }
                          >
                            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                              Dana diserahkan. Silakan isi BBM lalu kirim foto bukti:
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <FormLabel className="grid gap-1 text-[11px]">
                                Speedometer Setelah Isi (Wajib)
                                <Input
                                  name="afterFillingPhoto"
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  required
                                  disabled={isPending}
                                  className="h-8 text-xs file:text-xs"
                                />
                              </FormLabel>
                              <FormLabel className="grid gap-1 text-[11px]">
                                Struk / Bon BBM (Opsional)
                                <Input
                                  name="receiptPhoto"
                                  type="file"
                                  accept="image/*,.heic,.heif"
                                  disabled={isPending}
                                  className="h-8 text-xs file:text-xs"
                                />
                              </FormLabel>
                            </div>
                            <Button
                              type="submit"
                              size="sm"
                              className="w-full h-8 text-xs font-semibold"
                              disabled={isPending}
                            >
                              {isPending && pendingCode === order.publicCode
                                ? "Mengirim..."
                                : "Kirim Bukti Pengisian BBM"}
                            </Button>
                          </form>
                        )}
                      </div>
                    ))}

                    {/* AKSI BUKA FORM REQUEST BBM */}
                    {canRequestFuel && (
                      <div className="space-y-2 pt-1">
                        {!isFuelFormOpen ? (
                          <Button
                            type="button"
                            onClick={() => setOpenFuelFormCode(order.publicCode)}
                            className="w-full h-10 gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                          >
                            <Fuel className="size-4" />
                            <span>Ajukan Request Reimbursement BBM</span>
                            <ChevronDown className="size-4 ml-auto" />
                          </Button>
                        ) : (
                          <form
                            className="rounded-xl border border-primary/40 bg-card p-3.5 space-y-3"
                            onSubmit={(event) => submitFuelRequest(event, order.publicCode)}
                          >
                            <div className="flex items-center justify-between border-b pb-2">
                              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                                <Fuel className="size-4" />
                                Form Pengajuan Dana BBM
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setOpenFuelFormCode(null)}
                                className="h-7 px-2 text-xs text-muted-foreground"
                              >
                                <ChevronUp className="size-3.5 mr-1" />
                                Tutup
                              </Button>
                            </div>

                            <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                              <FormLabel className="grid gap-1">
                                Sumber Pembelian BBM
                                <select
                                  name="source"
                                  value={fuelSource}
                                  onChange={(event) =>
                                    setFuelSources((current) => ({
                                      ...current,
                                      [order.publicCode]:
                                        event.target.value === VehicleFuelSource.RETAIL
                                          ? VehicleFuelSource.RETAIL
                                          : VehicleFuelSource.SPBU,
                                    }))
                                  }
                                  className="h-9 rounded-md border bg-background px-3 text-xs"
                                  disabled={isPending}
                                >
                                  <option value={VehicleFuelSource.SPBU}>SPBU · Rp10.000/L</option>
                                  <option value={VehicleFuelSource.RETAIL}>Eceran · Rp14.000/L</option>
                                </select>
                              </FormLabel>

                              <div className="rounded-lg bg-primary/10 p-2.5 space-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Plafon Dihitung:</span>
                                  <span className="font-bold text-primary">
                                    Rp{estimatedFuelAmount.toLocaleString("id-ID")}
                                  </span>
                                </div>
                                <div className="flex justify-between text-[11px] text-muted-foreground">
                                  <span>Jarak ODO:</span>
                                  <span>{eligibleDistanceKm} km ({estimatedFuelLiter} L)</span>
                                </div>
                              </div>
                            </div>

                            <FormLabel className="flex items-center gap-2 text-xs">
                              <input
                                name="includeExceptionAllowance"
                                type="checkbox"
                                checked={includeExceptionAllowance}
                                onChange={(event) =>
                                  setFuelExceptionFlags((current) => ({
                                    ...current,
                                    [order.publicCode]: event.target.checked,
                                  }))
                                }
                                disabled={isPending}
                                className="rounded"
                              />
                              <span>Kondisi jalan macet/rusak (toleransi +10 km)</span>
                            </FormLabel>

                            {includeExceptionAllowance && (
                              <FormLabel className="grid gap-1 text-xs">
                                Alasan Kondisi Khusus (Wajib diisi)
                                <Input
                                  name="exceptionReason"
                                  required
                                  maxLength={300}
                                  disabled={isPending}
                                  placeholder="Contoh: Macet total / memutar jalur perbaikan"
                                  className="h-9 text-xs"
                                />
                              </FormLabel>
                            )}

                            <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                              <FormLabel className="grid gap-1">
                                Speedometer Sebelum Pengisian (Wajib)
                                <Input
                                  name="beforeFillingPhoto"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  required
                                  disabled={isPending}
                                  className="h-8 text-xs file:text-xs"
                                />
                              </FormLabel>

                              <FormLabel className="grid gap-1">
                                Speedometer Setelah Pengisian (Wajib)
                                <Input
                                  name="afterFillingPhoto"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  required
                                  disabled={isPending}
                                  className="h-8 text-xs file:text-xs"
                                />
                              </FormLabel>
                            </div>

                            <FormLabel className="grid gap-1 text-xs">
                              Foto Bon / Struk BBM (Opsional)
                              <Input
                                name="receiptPhoto"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={isPending}
                                className="h-8 text-xs file:text-xs"
                              />
                            </FormLabel>

                            <Button
                              type="submit"
                              size="sm"
                              className="w-full h-9 text-xs font-semibold gap-1.5"
                              disabled={isPending}
                            >
                              <Fuel className="size-3.5" />
                              {isPending && pendingCode === order.publicCode
                                ? "Mengirim Request..."
                                : "Kirim Pengajuan Reimbursement ke Keuangan"}
                            </Button>
                          </form>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* KONTEN TAB 2: ALAT BERAT & BBM OPERASIONAL */}
      {activeTab === "equipment" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Form Pencatatan Alat */}
          <Card>
            <CardHeader className="p-3.5 sm:p-4 border-b">
              <CardTitle className="text-sm sm:text-base font-bold">
                Catat HM &amp; Pemakaian BBM Alat
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-4">
              <form className="space-y-3 text-xs" onSubmit={submitEquipmentLog}>
                <FormLabel className="grid gap-1">
                  Pilih Proyek
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-xs"
                    name="projectId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>Pilih proyek tujuan</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.kelompokTani} · {project.title}
                      </option>
                    ))}
                  </select>
                </FormLabel>

                <FormLabel className="grid gap-1">
                  Alat Terdaftar (Opsional)
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-xs"
                    name="equipmentMasterId"
                    defaultValue=""
                  >
                    <option value="">Catat manual tanpa master alat</option>
                    {equipmentMasters.map((equipment) => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipment.code} · {equipment.name} (HM {equipment.currentHM})
                      </option>
                    ))}
                  </select>
                </FormLabel>

                <div className="grid gap-2 sm:grid-cols-2">
                  <FormLabel className="grid gap-1">
                    Nama Alat
                    <Input name="equipmentName" maxLength={120} required className="h-9 text-xs" />
                  </FormLabel>
                  <FormLabel className="grid gap-1">
                    Operator
                    <Input name="operatorName" maxLength={120} defaultValue={userName} className="h-9 text-xs" />
                  </FormLabel>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormLabel className="grid gap-1">
                    HM Awal
                    <Input name="hmStart" type="number" min="0" step="0.01" required className="h-9 text-xs font-mono" />
                  </FormLabel>
                  <FormLabel className="grid gap-1">
                    HM Akhir
                    <Input name="hmEnd" type="number" min="0" step="0.01" required className="h-9 text-xs font-mono" />
                  </FormLabel>
                  <FormLabel className="grid gap-1">
                    Jam Efektif
                    <Input name="effectiveHours" type="number" min="0" max="24" step="0.01" required className="h-9 text-xs font-mono" />
                  </FormLabel>
                  <FormLabel className="grid gap-1">
                    BBM (Liter)
                    <Input name="fuelLiter" type="number" min="0" step="0.01" required className="h-9 text-xs font-mono" />
                  </FormLabel>
                </div>

                <FormLabel className="grid gap-1">
                  Tanggal Pencatatan
                  <Input name="date" type="date" required defaultValue={today} className="h-9 text-xs" />
                </FormLabel>

                <FormLabel className="grid gap-1">
                  Catatan Pekerjaan
                  <textarea
                    className="min-h-16 rounded-md border bg-background p-2 text-xs"
                    name="notes"
                    maxLength={2000}
                    placeholder="Catatan kendala lapangan atau kondisi alat..."
                  />
                </FormLabel>

                <Button
                  type="submit"
                  size="sm"
                  className="w-full h-9 text-xs font-semibold"
                  disabled={isPending || projects.length === 0}
                >
                  {isPending ? "Menyimpan..." : "Simpan Log Alat & BBM"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Riwayat Log Alat */}
          <Card>
            <CardHeader className="p-3.5 sm:p-4 border-b">
              <CardTitle className="text-sm sm:text-base font-bold">
                Riwayat Log Alat ({equipmentLogs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {equipmentLogs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Belum ada log alat yang tercatat.
                </p>
              ) : (
                <div className="divide-y text-xs">
                  {equipmentLogs.slice(0, 10).map((log) => (
                    <div key={log.id} className="p-3 space-y-1">
                      <div className="flex justify-between items-start font-semibold text-foreground">
                        <span>{log.equipmentName}</span>
                        <span className="text-primary font-mono">{log.fuelLiter} L</span>
                      </div>
                      <p className="text-muted-foreground text-[11px]">{log.projectName}</p>
                      <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span>HM: {log.hmStart} – {log.hmEnd} ({log.effectiveHours} jam)</span>
                        <span>{new Date(`${log.date}T00:00:00`).toLocaleDateString("id-ID")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
