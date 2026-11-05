"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
  VEHICLE_FUEL_PRICE_PER_LITER,
} from "@/lib/vehicle-fuel";
import type { VehicleFuelRequestView } from "@/lib/vehicle-fuel-types";
import {
  photoDownloadHref,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeDataTable } from "@/components/ui/native-data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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
  PENDING: "Siap diangkut",
  IN_TRANSIT: "Dalam perjalanan",
  DELIVERED: "Selesai",
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
  const [activeTab, setActiveTab] = useState(
    initialTab === "equipment" ? "equipment" : "deliveries",
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pendingCode, setPendingCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [fuelSources, setFuelSources] = useState<
    Record<string, VehicleFuelSource>
  >({});
  const [fuelExceptionFlags, setFuelExceptionFlags] = useState<
    Record<string, boolean>
  >({});
  const startDelivery = (
    event: FormEvent<HTMLFormElement>,
    publicCode: string,
  ) => {
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

  const submitFuelRequest = (
    event: FormEvent<HTMLFormElement>,
    publicCode: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const beforePhoto = data.get("beforeFillingPhoto");
    const afterPhoto = data.get("afterFillingPhoto");
    const receipt = data.get("receiptPhoto");
    const includeExceptionAllowance =
      data.get("includeExceptionAllowance") === "on";
    if (
      !(beforePhoto instanceof File) ||
      beforePhoto.size === 0 ||
      !(afterPhoto instanceof File) ||
      afterPhoto.size === 0
    ) {
      setMessage(
        "Foto speedometer sebelum dan sesudah pengisian wajib dilampirkan.",
      );
      setIsError(true);
      return;
    }
    if (
      includeExceptionAllowance &&
      !String(data.get("exceptionReason") ?? "").trim()
    ) {
      setMessage("Alasan kondisi khusus wajib diisi untuk toleransi 10 km.");
      setIsError(true);
      return;
    }
    setPendingCode(publicCode);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createVehicleFuelRequest(
          publicCode,
          {
            source:
              data.get("source") === VehicleFuelSource.RETAIL
                ? VehicleFuelSource.RETAIL
                : VehicleFuelSource.SPBU,
            beforeFillingPhoto: beforePhoto,
            afterFillingPhoto: afterPhoto,
            ...(receipt instanceof File && receipt.size > 0
              ? { receiptPhoto: receipt }
              : {}),
            includeExceptionAllowance,
            ...(includeExceptionAllowance
              ? {
                  exceptionReason: String(
                    data.get("exceptionReason") ?? "",
                  ),
                }
              : {}),
          },
        );
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
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
        setMessage("Request dana BBM gagal dikirim. Silakan coba kembali.");
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
        const result = await submitVehicleFuelProof(
          requestId,
          afterPhoto,
          receipt instanceof File && receipt.size > 0 ? receipt : undefined,
        );
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
          router.refresh();
        }
      } catch (error) {
        console.error("Mover fuel proof submission failed:", error);
        setMessage("Bukti pengisian gagal dikirim. Silakan coba kembali.");
        setIsError(true);
      } finally {
        setPendingCode("");
      }
    });
  };

  const submitDeliveryProof = (
    event: FormEvent<HTMLFormElement>,
    publicCode: string,
  ) => {
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

    if (files.length === 0 && !completeDelivery) {
      setMessage("Pilih minimal satu foto untuk disimpan.");
      setIsError(true);
      return;
    }

    setPendingCode(publicCode);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitMoverDeliveryProofs(
          publicCode,
          files,
          completeDelivery,
          completeDelivery ? kmStart : undefined,
          completeDelivery ? kmEnd : undefined,
        );
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          form.reset();
          router.refresh();
        }
      } catch (error) {
        console.error("Mover could not complete delivery:", error);
        setMessage("Pengiriman gagal diselesaikan. Coba muat ulang halaman.");
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
          router.refresh();
        }
      } catch (error) {
        console.error("Mover equipment log submission failed:", error);
        setMessage("Log alat dan BBM gagal disimpan.");
        setIsError(true);
      }
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border bg-muted p-2">
        <TabsTrigger value="deliveries">Tugas Pengiriman</TabsTrigger>
        <TabsTrigger value="equipment">Alat Berat & BBM</TabsTrigger>
      </TabsList>

      {message && (
        <p
          className={`rounded-md border p-3 text-sm ${isError ? "border-destructive text-destructive" : "border-green-200 text-green-800"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      <TabsContent value="deliveries">
        <Card>
          <CardHeader>
            <CardTitle>Surat Jalan yang Ditugaskan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deliveryOrders.map((order) => {
              const activeFuelRequest = order.fuelRequests.find(
                (request) =>
                  request.status === "PENDING_FINANCE" ||
                  request.status === "FUNDED" ||
                  request.status === "PROOF_SUBMITTED" ||
                  request.status === "COMPLETED",
              );
              const latestFuelRequest = order.fuelRequests[0];
              const tripDistanceKm = Number(
                order.vehicleTripLog?.distanceKm ?? 0,
              );
              const includeExceptionAllowance =
                fuelExceptionFlags[order.publicCode] ?? false;
              const eligibleDistanceKm =
                tripDistanceKm + (includeExceptionAllowance ? 10 : 0);
              const fuelSource =
                fuelSources[order.publicCode] ?? VehicleFuelSource.SPBU;
              const fuelUnitPrice = VEHICLE_FUEL_PRICE_PER_LITER[fuelSource];
              const estimatedFuelLiter =
                Math.round(
                  (eligibleDistanceKm /
                    VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER) *
                    100,
                ) / 100;
              const estimatedFuelAmount = Math.round(
                (eligibleDistanceKm /
                  VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER) *
                  fuelUnitPrice,
              );
              const canRequestFuel =
                order.status === DOStatus.DELIVERED &&
                tripDistanceKm > 0 &&
                !activeFuelRequest &&
                latestFuelRequest?.status !== "COMPLETED";
              return (
              <article key={order.publicCode} className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary">{order.doNumber}</p>
                    <p className="text-sm">{order.projectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("id-ID")}
                      {order.ticketNumber ? ` · Tiket ${order.ticketNumber}` : ""}
                      {order.vehiclePlateNumber || order.vehiclePlate
                        ? ` · Kendaraan ${order.vehiclePlateNumber ?? order.vehiclePlate}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabels[order.status]}</Badge>
                </div>
                <ul className="space-y-1 text-sm">
                  {order.items.map((item, index) => (
                    <li key={`${item.itemName}-${index}`}>
                      {item.itemName} — {item.qtyDelivered} {item.unit}
                    </li>
                  ))}
                </ul>
                {order.fuelRequests.map((request) => (
                  <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm" key={request.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        Request BBM · {request.source === "SPBU" ? "SPBU" : "Eceran"} ·{" "}
                        {request.estimatedFuelLiter} L · Rp
                        {Number(request.requestedAmount).toLocaleString("id-ID")}
                      </p>
                      <Badge variant="outline">
                        {{
                          PENDING_FINANCE: "Menunggu Keuangan",
                          FUNDED: "Dana Diserahkan · Menunggu Foto",
                          REJECTED: "Ditolak",
                          PROOF_SUBMITTED: "Bukti terkirim · menunggu penutupan Finance",
                          COMPLETED: "Selesai · reimbursement disalurkan",
                        }[request.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ODO aktual: {request.tripDistanceKm ?? "—"} km
                      {Number(request.exceptionDistanceKm) > 0
                        ? ` · Toleransi kondisi khusus: +${request.exceptionDistanceKm} km`
                        : ""}
                    </p>
                    {request.exceptionReason && (
                      <p className="text-xs text-muted-foreground">
                        Alasan toleransi: {request.exceptionReason}
                      </p>
                    )}
                    {request.disbursementMethod && (
                      <p>
                        Pencairan:{" "}
                        <strong>
                          {request.disbursementMethod === "CASH" ? "Tunai" : "Transfer"}
                        </strong>
                        {" · "}
                        {request.transferDestination}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <a className="font-medium text-primary underline" href={photoDownloadHref(request.beforeFillingPhotoUrl)} target="_blank" rel="noreferrer">
                        Speedometer sebelum isi
                      </a>
                      {request.afterFillingPhotoUrl && (
                        <a className="font-medium text-primary underline" href={photoDownloadHref(request.afterFillingPhotoUrl)} target="_blank" rel="noreferrer">
                          Speedometer setelah isi
                        </a>
                      )}
                      {request.receiptPhotoUrl && (
                        <a className="font-medium text-primary underline" href={photoDownloadHref(request.receiptPhotoUrl)} target="_blank" rel="noreferrer">
                          Bon BBM
                        </a>
                      )}
                      {request.transferProofUrl && (
                        <a className="font-medium text-primary underline" href={photoDownloadHref(request.transferProofUrl)} target="_blank" rel="noreferrer">
                          Bukti transfer Keuangan
                        </a>
                      )}
                    </div>
                    {request.financeNote && (
                      <p className="text-muted-foreground">Catatan Keuangan: {request.financeNote}</p>
                    )}
                  </div>
                ))}
                {activeFuelRequest?.status === "FUNDED" && (
                  <form
                    className="grid gap-3 rounded-md border border-green-200 bg-green-50/50 p-3 sm:grid-cols-2"
                    onSubmit={(event) =>
                      submitFuelProof(event, activeFuelRequest.id, order.publicCode)
                    }
                  >
                    <p className="text-sm font-medium sm:col-span-2">
                      Dana sudah diserahkan. Isi BBM lalu kirim foto speedometer setelah pengisian.
                    </p>
                    <label className="grid gap-1 text-sm">
                      Speedometer setelah isi (wajib)
                      <Input name="afterFillingPhoto" type="file" accept="image/jpeg,image/png,image/webp" required disabled={isPending} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Bon / struk BBM (jika ada)
                      <Input name="receiptPhoto" type="file" accept="image/jpeg,image/png,image/webp" disabled={isPending} />
                    </label>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Foto JPG, PNG, atau WEBP maksimal 5 MB per file.
                    </p>
                    <Button type="submit" className="sm:col-span-2" disabled={isPending}>
                      {isPending && pendingCode === order.publicCode ? "Mengirim..." : "Kirim Bukti Pengisian"}
                    </Button>
                  </form>
                )}
                {order.status === DOStatus.DELIVERED && order.vehicleTripLog && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">Rekap ODO perjalanan kembali ke gudang</p>
                    <p className="text-muted-foreground">
                      ODO berangkat {order.vehicleTripLog.kilometerStart} km
                      {" · "}ODO kembali {order.vehicleTripLog.kilometerEnd} km
                      {" · "}Jarak aktual {tripDistanceKm.toLocaleString("id-ID")} km
                      {" · "}Estimasi konsumsi{" "}
                      {order.vehicleTripLog.fuelLiter} L pada rasio{" "}
                      {VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER} km/L.
                    </p>
                    {tripDistanceKm <= 0 && (
                      <p className="mt-1 text-amber-700">
                        Jarak ODO tidak bertambah, jadi sistem tidak menampilkan request BBM.
                      </p>
                    )}
                  </div>
                )}
                {canRequestFuel && (
                  <form
                    className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2"
                    onSubmit={(event) => submitFuelRequest(event, order.publicCode)}
                  >
                    <div className="sm:col-span-2">
                      <h3 className="font-semibold">Request Reimbursement BBM</h3>
                      <p className="text-xs text-muted-foreground">
                        Nominal tidak diinput manual. Sistem menghitung plafon dari ODO aktual (
                        {tripDistanceKm.toLocaleString("id-ID")} km), rasio{" "}
                        {VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER} km/L, dan sumber BBM.
                      </p>
                    </div>
                    <label className="grid gap-1 text-sm">
                      Sumber pembelian BBM
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
                        className="h-10 rounded-md border bg-background px-3"
                        disabled={isPending}
                      >
                        <option value={VehicleFuelSource.SPBU}>SPBU · Rp10.000/L</option>
                        <option value={VehicleFuelSource.RETAIL}>Eceran · Rp14.000/L</option>
                      </select>
                    </label>
                    <div className="rounded-md bg-muted/50 p-3 text-sm sm:col-span-2">
                      Jarak dihitung:{" "}
                      <strong>{eligibleDistanceKm.toLocaleString("id-ID")} km</strong>
                      {" · "}Estimasi BBM:{" "}
                      <strong>{estimatedFuelLiter.toLocaleString("id-ID")} L</strong>
                      {" · "}Plafon reimbursement:{" "}
                      <strong>Rp{estimatedFuelAmount.toLocaleString("id-ID")}</strong>
                      {" · "}Harga acuan:{" "}
                      <strong>Rp{fuelUnitPrice.toLocaleString("id-ID")}/L</strong>
                    </div>
                    <label className="flex items-start gap-2 text-sm sm:col-span-2">
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
                      />
                      Ada kondisi khusus (macet/kondisi jalan); tambahkan toleransi 10 km
                    </label>
                    {includeExceptionAllowance && (
                      <label className="grid gap-1 text-sm sm:col-span-2">
                        Alasan kondisi khusus (wajib)
                        <Input
                          name="exceptionReason"
                          required
                          maxLength={300}
                          disabled={isPending}
                          placeholder="Jelaskan kondisi jalan atau kemacetan"
                        />
                      </label>
                    )}
                    <label className="grid gap-1 text-sm">
                      Foto speedometer sebelum pengisian (wajib)
                      <Input
                        name="beforeFillingPhoto"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        disabled={isPending}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Foto speedometer setelah pengisian (wajib)
                      <Input
                        name="afterFillingPhoto"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        disabled={isPending}
                      />
                    </label>
                    <label className="grid gap-1 text-sm sm:col-span-2">
                      Foto bon / struk BBM (jika ada)
                      <Input
                        name="receiptPhoto"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={isPending}
                      />
                      <span className="text-xs text-muted-foreground">
                        Foto JPG, PNG, atau WEBP maksimal 5 MB per file.
                      </span>
                    </label>
                    {latestFuelRequest?.status === "REJECTED" && (
                      <p className="text-sm text-destructive sm:col-span-2">
                        Request sebelumnya ditolak. Periksa catatan Keuangan sebelum mengajukan reimbursement ulang.
                      </p>
                    )}
                    <Button type="submit" className="sm:col-span-2" disabled={isPending}>
                      {isPending && pendingCode === order.publicCode ? "Mengirim..." : "Ajukan Reimbursement ke Keuangan"}
                    </Button>
                  </form>
                )}
                {order.status === DOStatus.DELIVERED &&
                  tripDistanceKm > 0 &&
                  activeFuelRequest && (
                    <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                      Request reimbursement BBM untuk perjalanan ini sudah tercatat.
                    </p>
                  )}
                {order.status === DOStatus.PENDING && !order.vehicleId && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Menunggu Logistik menetapkan kendaraan pada DO.
                  </p>
                )}
                {order.status === DOStatus.PENDING && order.vehicleId && (
                  <form
                    className="flex flex-wrap items-end gap-3 rounded-md border p-3"
                    onSubmit={(event) => startDelivery(event, order.publicCode)}
                  >
                    <label className="grid gap-1 text-sm">
                      KM berangkat
                      <Input
                        name="kilometerStart"
                        type="number"
                        min="0"
                        step="0.001"
                        required
                        defaultValue={order.vehicleCurrentKilometer ?? ""}
                      />
                    </label>
                    <Button type="submit" disabled={isPending}>
                      {isPending && pendingCode === order.publicCode ? "Memulai..." : "Mulai Pengiriman"}
                    </Button>
                  </form>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  {order.status === DOStatus.IN_TRANSIT && (
                    <form
                      className="flex flex-wrap items-end gap-3"
                      onSubmit={(event) =>
                        submitDeliveryProof(event, order.publicCode)
                      }
                    >
                      <label className="grid gap-1 text-sm">
                        Tambah foto bukti (bisa pilih beberapa)
                        <Input
                          name="deliveryProofs"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          disabled={isPending}
                        />
                        <span className="text-xs text-muted-foreground">
                          Maksimal 5 foto per kiriman, 5 MB per foto.
                        </span>
                      </label>
                      <label className="grid gap-1 text-sm">
                        KM berangkat
                        <Input
                          name="kilometerStart"
                          type="number"
                          min="0"
                          step="0.001"
                          required
                          readOnly={Boolean(order.departureKilometer)}
                          defaultValue={
                            order.departureKilometer ??
                            order.vehicleCurrentKilometer ??
                            ""
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        ODO saat kembali ke gudang
                        <Input
                          name="kilometerEnd"
                          type="number"
                          min="0"
                          step="0.001"
                          required
                        />
                      </label>
                      <p className="basis-full text-xs text-muted-foreground">
                        Simpan bukti serah-terima saat di lokasi, lalu selesaikan DO setelah kendaraan kembali ke gudang. Sistem memakai selisih ODO untuk menghitung jarak dan estimasi BBM.
                      </p>
                      <Button
                        type="submit"
                        name="intent"
                        value="save"
                        variant="outline"
                        disabled={isPending}
                      >
                        {isPending && pendingCode === order.publicCode
                          ? "Menyimpan..."
                          : "Simpan Bukti"}
                      </Button>
                      <Button
                        type="submit"
                        name="intent"
                        value="complete"
                        disabled={isPending}
                      >
                        {isPending && pendingCode === order.publicCode
                          ? "Memproses..."
                          : "Selesaikan Pengiriman"}
                      </Button>
                    </form>
                  )}
                  {order.receiptPhotoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {order.receiptPhotoUrls.map((receiptUrl, index) => (
                        <a
                          key={receiptUrl}
                          className="text-sm font-medium text-primary underline"
                          href={photoDownloadHref(receiptUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Lihat foto bukti {index + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );})}
            {deliveryOrders.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada Surat Jalan yang ditugaskan kepada Anda.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="equipment">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Catat HM & Pemakaian BBM</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={submitEquipmentLog}>
                <label className="grid gap-1 text-sm">
                  Proyek
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    name="projectId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>Pilih proyek</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.kelompokTani} · {project.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Alat terdaftar (opsional)
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    name="equipmentMasterId"
                    defaultValue=""
                  >
                    <option value="">Catat tanpa master</option>
                    {equipmentMasters.map((equipment) => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipment.code} · {equipment.name} (HM {equipment.currentHM})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Nama alat
                  <Input name="equipmentName" maxLength={120} required />
                </label>
                <label className="grid gap-1 text-sm">
                  Operator
                  <Input name="operatorName" maxLength={120} defaultValue={userName} />
                </label>
                <label className="grid gap-1 text-sm">
                  Tanggal
                  <Input
                    name="date"
                    type="date"
                    required
                    defaultValue={today}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    HM awal
                    <Input name="hmStart" type="number" min="0" step="0.01" required />
                  </label>
                  <label className="grid gap-1 text-sm">
                    HM akhir
                    <Input name="hmEnd" type="number" min="0" step="0.01" required />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Jam efektif
                    <Input
                      name="effectiveHours"
                      type="number"
                      min="0"
                      max="24"
                      step="0.01"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    BBM (liter)
                    <Input name="fuelLiter" type="number" min="0" step="0.01" required />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Catatan
                  <textarea
                    className="min-h-20 rounded-md border bg-background p-3"
                    name="notes"
                    maxLength={2000}
                  />
                </label>
                <Button type="submit" disabled={isPending || projects.length === 0}>
                  {isPending ? "Menyimpan..." : "Simpan Log"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Riwayat Log Anda</CardTitle>
            </CardHeader>
            <CardContent>
              <NativeDataTable itemLabel="log alat">
              <table className="app-data-table w-full min-w-[620px] text-sm">
                <thead className="text-left">
                  <tr className="border-b">
                    <th className="p-2">Tanggal / Proyek</th>
                    <th className="p-2">Alat</th>
                    <th className="p-2">HM</th>
                    <th className="p-2">Jam</th>
                    <th className="p-2">BBM</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentLogs.map((log) => (
                    <tr className="border-b" key={log.id}>
                      <td className="p-2">
                        {new Date(`${log.date}T00:00:00`).toLocaleDateString("id-ID")}
                        <span className="block text-xs text-muted-foreground">
                          {log.projectName}
                        </span>
                      </td>
                      <td className="p-2">
                        {log.equipmentName}
                        <span className="block text-xs text-muted-foreground">
                          {log.operatorName ?? "Operator tidak dicatat"}
                        </span>
                      </td>
                      <td className="p-2">{log.hmStart}–{log.hmEnd}</td>
                      <td className="p-2">{log.effectiveHours} jam</td>
                      <td className="p-2">{log.fuelLiter} L</td>
                    </tr>
                  ))}
                  {equipmentLogs.length === 0 && (
                    <tr>
                      <td className="p-5 text-center text-muted-foreground" colSpan={5}>
                        Belum ada log alat dan BBM yang Anda catat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </NativeDataTable>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

    </Tabs>
  );
}
