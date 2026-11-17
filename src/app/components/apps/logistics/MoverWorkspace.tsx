"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  Fuel,
  Image as ImageIcon,
  MapPin,
  Navigation,
  Truck,
} from "lucide-react";
import { DOStatus, VehicleFuelSource } from "@prisma/client";
import { toast } from "sonner";
import {
  startMoverDeliveryOrder,
  submitMoverDeliveryProofs,
} from "@/app/actions/orders";
import {
  createVehicleFuelRequest,
  submitVehicleFuelProof,
} from "@/app/actions/vehicle-fuel";
import { createEquipmentLog } from "@/app/actions/construction";
import {
  VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
  VEHICLE_FUEL_PRICE_PER_LITER,
} from "@/lib/vehicle-fuel";
import type { VehicleFuelRequestView } from "@/lib/vehicle-fuel-types";
import { withLocalPhotoPreview } from "@/lib/photo-urls";
import {
  compressFieldImageFile,
  compressFieldImageFiles,
} from "@/lib/image-compression-client";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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

type MoverActionMode =
  | "start"
  | "complete"
  | "fuel_request"
  | "fuel_proof"
  | "detail";

type MoverActiveAction = {
  mode: MoverActionMode;
  order: MoverDeliveryOrder;
  fuelRequestId?: string;
} | null;

const statusLabels: Record<DOStatus, string> = {
  PENDING: "Siap Antar",
  IN_TRANSIT: "Dalam Perjalanan",
  DELIVERED: "Tiba / Selesai",
  RETURNED: "Dikembalikan",
};

const statusBadgeVariant: Record<
  DOStatus,
  "outline" | "lightWarning" | "lightSuccess" | "lightError"
> = {
  PENDING: "outline",
  IN_TRANSIT: "lightWarning",
  DELIVERED: "lightSuccess",
  RETURNED: "lightError",
};

const fuelStatusLabels: Record<string, string> = {
  PENDING_FINANCE: "BBM: Menunggu Keuangan",
  FUNDED: "BBM: Dana Cair",
  REJECTED: "BBM: Ditolak",
  PROOF_SUBMITTED: "BBM: Verifikasi",
  COMPLETED: "BBM: Selesai",
};

function MoverDeliveryCard({
  order,
  onOpenAction,
}: {
  order: MoverDeliveryOrder;
  onOpenAction: (action: NonNullable<MoverActiveAction>) => void;
}) {
  const activeFuelRequest = order.fuelRequests.find(
    (request) =>
      request.status === "PENDING_FINANCE" ||
      request.status === "FUNDED" ||
      request.status === "PROOF_SUBMITTED" ||
      request.status === "COMPLETED",
  );
  const latestFuelRequest = order.fuelRequests[0];
  const fundedFuelRequest = order.fuelRequests.find(
    (request) => request.status === "FUNDED",
  );
  const tripDistanceKm = Number(order.vehicleTripLog?.distanceKm ?? 0);
  const canRequestFuel =
    order.status === DOStatus.DELIVERED &&
    tripDistanceKm > 0 &&
    !activeFuelRequest &&
    latestFuelRequest?.status !== "COMPLETED";

  const plateDisplay = order.vehiclePlateNumber ?? order.vehiclePlate;
  const primaryAction = (() => {
    if (order.status === DOStatus.PENDING) {
      return {
        label: "Mulai Antar",
        mode: "start" as const,
        disabled: !order.vehicleId,
        icon: Navigation,
      };
    }
    if (order.status === DOStatus.IN_TRANSIT) {
      return {
        label: "Laporkan Tiba",
        mode: "complete" as const,
        disabled: false,
        icon: Camera,
      };
    }
    if (fundedFuelRequest) {
      return {
        label: "Bukti BBM",
        mode: "fuel_proof" as const,
        disabled: false,
        icon: Fuel,
        fuelRequestId: fundedFuelRequest.id,
      };
    }
    if (canRequestFuel) {
      return {
        label: "Ajukan BBM",
        mode: "fuel_request" as const,
        disabled: false,
        icon: Fuel,
      };
    }
    return {
      label: "Detail",
      mode: "detail" as const,
      disabled: false,
      icon: Eye,
    };
  })();

  const ActionIcon = primaryAction.icon;

  return (
    <Card
      className={
        order.status === DOStatus.IN_TRANSIT
          ? "border-amber-500/60 shadow-sm"
          : "border-border"
      }
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-h3 font-mono text-primary">
                {order.doNumber}
              </span>
              <Badge variant={statusBadgeVariant[order.status]}>
                {statusLabels[order.status]}
              </Badge>
              {order.ticketNumber && (
                <Badge variant="outline">{order.ticketNumber}</Badge>
              )}
            </div>
            <p className="type-p1 flex items-center gap-1.5 font-semibold text-foreground">
              <MapPin
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="truncate">{order.projectName}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="type-p3 flex items-center justify-end gap-1 text-muted-foreground">
              <Calendar className="size-3.5" aria-hidden="true" />
              {new Date(order.createdAt).toLocaleDateString("id-ID")}
            </p>
            <p className="type-p3 font-medium text-foreground">
              {plateDisplay ?? "Tanpa armada"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <span className="type-p3 text-muted-foreground">
            {order.items.length} item muatan
            {order.vehicleTripLog
              ? ` · ${tripDistanceKm.toLocaleString("id-ID")} km (${order.vehicleTripLog.fuelLiter} L)`
              : ""}
          </span>
          {latestFuelRequest && (
            <Badge variant="outline">
              {fuelStatusLabels[latestFuelRequest.status] ??
                latestFuelRequest.status}
            </Badge>
          )}
        </div>

        {order.status === DOStatus.PENDING && !order.vehicleId && (
          <p className="type-p3 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
            Menunggu Logistik menetapkan armada kendaraan untuk DO ini.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          {primaryAction.mode !== "detail" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenAction({ mode: "detail", order })}
            >
              Detail
            </Button>
          ) : (
            <span className="type-p3 text-muted-foreground">
              {order.receiptPhotoUrls.length} foto bukti
            </span>
          )}

          <Button
            type="button"
            size="sm"
            disabled={primaryAction.disabled}
            variant={
              primaryAction.mode === "complete" ? "success" : "default"
            }
            onClick={() =>
              onOpenAction({
                mode: primaryAction.mode,
                order,
                fuelRequestId: primaryAction.fuelRequestId,
              })
            }
          >
            <ActionIcon className="size-4" aria-hidden="true" />
            {primaryAction.label}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [deliveryFilter, setDeliveryFilter] = useState<
    "ALL" | "ACTIVE" | "DELIVERED"
  >("ALL");
  const [activeAction, setActiveAction] = useState<MoverActiveAction>(null);
  const [isPending, startTransition] = useTransition();

  // Equipment log tab states (controlled shadcn fields)
  const [eqProjectId, setEqProjectId] = useState("");
  const [eqMasterId, setEqMasterId] = useState("__NONE__");
  const [eqDate, setEqDate] = useState(today);
  const [eqName, setEqName] = useState("");
  const [eqOperator, setEqOperator] = useState(userName);
  const [eqHmStart, setEqHmStart] = useState("");
  const [eqHmEnd, setEqHmEnd] = useState("");
  const [eqHours, setEqHours] = useState("");
  const [eqFuel, setEqFuel] = useState("");
  const [eqNotes, setEqNotes] = useState("");

  const inTransitCount = deliveryOrders.filter(
    (d) => d.status === DOStatus.IN_TRANSIT,
  ).length;
  const pendingStartCount = deliveryOrders.filter(
    (d) => d.status === DOStatus.PENDING,
  ).length;
  const deliveredCount = deliveryOrders.filter(
    (d) => d.status === DOStatus.DELIVERED,
  ).length;

  const filteredOrders = deliveryOrders.filter((order) => {
    if (deliveryFilter === "ACTIVE") {
      return (
        order.status === DOStatus.IN_TRANSIT ||
        order.status === DOStatus.PENDING
      );
    }
    if (deliveryFilter === "DELIVERED") {
      return order.status === DOStatus.DELIVERED;
    }
    return true;
  });

  const projectOptions = useMemo<ComboboxOption[]>(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.kelompokTani} · ${p.title}`,
        keywords: [p.kelompokTani, p.title],
      })),
    [projects],
  );

  const submitEquipmentLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eqProjectId) {
      toast.error("Pilih proyek tujuan terlebih dahulu.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createEquipmentLog({
          projectId: eqProjectId,
          equipmentMasterId: eqMasterId === "__NONE__" ? "" : eqMasterId,
          equipmentName: eqName,
          operatorName: eqOperator,
          date: eqDate,
          hmStart: Number(eqHmStart),
          hmEnd: Number(eqHmEnd),
          effectiveHours: Number(eqHours),
          fuelLiter: Number(eqFuel),
          notes: eqNotes,
        });
        if (result.success) {
          toast.success(result.message);
          setEqName("");
          setEqHmStart("");
          setEqHmEnd("");
          setEqHours("");
          setEqFuel("");
          setEqNotes("");
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Mover equipment log submission failed:", error);
        toast.error("Log alat dan BBM gagal disimpan.");
      }
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="type-h2 text-foreground">
              Tugas Pengiriman &amp; BBM
            </h2>
            <p className="type-p2 text-muted-foreground">
              Selamat bertugas, <strong>{userName}</strong>.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2 text-center">
              <span className="type-p3 font-medium text-muted-foreground">
                Berjalan
              </span>
              <p className="type-kpi text-amber-600">{inTransitCount}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2 text-center">
              <span className="type-p3 font-medium text-muted-foreground">
                Antrean
              </span>
              <p className="type-kpi text-foreground">{pendingStartCount}</p>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2 text-center">
              <span className="type-p3 font-medium text-muted-foreground">
                Selesai
              </span>
              <p className="type-kpi text-emerald-600">{deliveredCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "deliveries" | "equipment")
        }
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/60 p-1.5">
          <TabsTrigger value="deliveries" className="gap-2 py-2">
            <Truck className="size-4" aria-hidden="true" />
            <span>Pengiriman ({deliveryOrders.length})</span>
          </TabsTrigger>
          <TabsTrigger value="equipment" className="gap-2 py-2">
            <Fuel className="size-4" aria-hidden="true" />
            <span>Alat Berat ({equipmentLogs.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(
              [
                { key: "ALL", label: `Semua (${deliveryOrders.length})` },
                {
                  key: "ACTIVE",
                  label: `Aktif (${inTransitCount + pendingStartCount})`,
                },
                { key: "DELIVERED", label: `Selesai (${deliveredCount})` },
              ] as const
            ).map((filter) => (
              <Button
                key={filter.key}
                type="button"
                size="sm"
                variant={deliveryFilter === filter.key ? "default" : "outline"}
                onClick={() => setDeliveryFilter(filter.key)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Belum Ada Surat Jalan"
              description="Tidak ada DO yang sesuai dengan filter yang dipilih."
            />
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <MoverDeliveryCard
                  key={order.publicCode}
                  order={order}
                  onOpenAction={setActiveAction}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="equipment">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="border-b p-4">
                <CardTitle className="type-h3">
                  Catat HM &amp; BBM Alat
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <form className="space-y-3.5" onSubmit={submitEquipmentLog}>
                  <div className="space-y-1.5">
                    <Label htmlFor="me-project" className="type-p2 font-medium">
                      Proyek Tujuan <span className="text-destructive">*</span>
                    </Label>
                    <Combobox
                      id="me-project"
                      options={projectOptions}
                      value={eqProjectId}
                      onValueChange={setEqProjectId}
                      placeholder="Pilih proyek tujuan..."
                      searchPlaceholder="Cari nama proyek..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="me-master" className="type-p2 font-medium">
                      Master Alat (Opsional)
                    </Label>
                    <Select
                      value={eqMasterId}
                      onValueChange={(value) => {
                        setEqMasterId(value);
                        if (value !== "__NONE__") {
                          const found = equipmentMasters.find(
                            (m) => m.id === value,
                          );
                          if (found) {
                            setEqName(found.name);
                            setEqHmStart(found.currentHM);
                          }
                        }
                      }}
                    >
                      <SelectTrigger id="me-master" className="w-full">
                        <SelectValue placeholder="Pilih master alat" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">
                          Catat manual tanpa master alat
                        </SelectItem>
                        {equipmentMasters.map((equipment) => (
                          <SelectItem key={equipment.id} value={equipment.id}>
                            {equipment.code} · {equipment.name} (HM{" "}
                            {equipment.currentHM})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="me-name" className="type-p2 font-medium">
                        Nama Alat <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="me-name"
                        value={eqName}
                        onChange={(e) => setEqName(e.target.value)}
                        maxLength={120}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="me-operator"
                        className="type-p2 font-medium"
                      >
                        Operator
                      </Label>
                      <Input
                        id="me-operator"
                        value={eqOperator}
                        onChange={(e) => setEqOperator(e.target.value)}
                        maxLength={120}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="me-hm-start"
                        className="type-p2 font-medium"
                      >
                        HM Awal <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="me-hm-start"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={eqHmStart}
                        onChange={(e) => setEqHmStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="me-hm-end"
                        className="type-p2 font-medium"
                      >
                        HM Akhir <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="me-hm-end"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={eqHmEnd}
                        onChange={(e) => setEqHmEnd(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-hours" className="type-p2 font-medium">
                        Jam Efektif <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="me-hours"
                        type="number"
                        min="0"
                        max="24"
                        step="0.01"
                        required
                        value={eqHours}
                        onChange={(e) => setEqHours(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-fuel" className="type-p2 font-medium">
                        BBM (Liter) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="me-fuel"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={eqFuel}
                        onChange={(e) => setEqFuel(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="me-date" className="type-p2 font-medium">
                      Tanggal Pencatatan <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      id="me-date"
                      value={eqDate}
                      onValueChange={setEqDate}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="me-notes" className="type-p2 font-medium">
                      Catatan Pekerjaan
                    </Label>
                    <Textarea
                      id="me-notes"
                      rows={2}
                      maxLength={2000}
                      placeholder="Catatan kendala lapangan atau kondisi alat..."
                      value={eqNotes}
                      onChange={(e) => setEqNotes(e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending || projects.length === 0}
                  >
                    {isPending ? "Menyimpan..." : "Simpan Log Alat"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b p-4">
                <CardTitle className="type-h3">
                  Riwayat Log Alat ({equipmentLogs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {equipmentLogs.length === 0 ? (
                  <EmptyState
                    icon={Fuel}
                    title="Belum Ada Log Alat"
                    description="Riwayat pemakaian jam kerja dan BBM alat akan tampil di sini."
                  />
                ) : (
                  <div className="divide-y">
                    {equipmentLogs.slice(0, 10).map((log) => (
                      <div key={log.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className="type-p2 font-semibold text-foreground">
                            {log.equipmentName}
                          </span>
                          <span className="type-p2 font-mono font-semibold text-primary">
                            {log.fuelLiter} L
                          </span>
                        </div>
                        <p className="type-p3 text-muted-foreground">
                          {log.projectName}
                        </p>
                        <div className="type-p3 flex justify-between text-muted-foreground">
                          <span>
                            HM: {log.hmStart} – {log.hmEnd} ({log.effectiveHours}{" "}
                            jam)
                          </span>
                          <span>
                            {new Date(`${log.date}T00:00:00`).toLocaleDateString(
                              "id-ID",
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* SINGLE HOISTED ACTION MODAL / SHEET FOR ALL MOVER DO FLOWS */}
      <MoverDoActionModal
        action={activeAction}
        onClose={() => setActiveAction(null)}
        onSuccess={() => {
          setActiveAction(null);
          requestNotificationFeedRefresh();
          router.refresh();
        }}
      />
    </div>
  );
}

function MoverDoActionModal({
  action,
  onClose,
  onSuccess,
}: {
  action: MoverActiveAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const modalKey = action
    ? `${action.mode}:${action.order.publicCode}:${action.fuelRequestId ?? ""}`
    : "closed";

  const titleByMode: Record<MoverActionMode, string> = {
    start: "Mulai Pengiriman",
    complete: "Laporkan Tiba & Selesai",
    fuel_request: "Ajukan Klaim BBM",
    fuel_proof: "Kirim Bukti Pengisian BBM",
    detail: "Detail Pengiriman",
  };

  return (
    <GlobalModal
      isOpen={action !== null}
      onClose={onClose}
      mobileBehavior="sheet"
      title={action ? `${titleByMode[action.mode]} · ${action.order.doNumber}` : "Aksi DO"}
      description={action?.order.projectName}
      className="sm:max-w-lg"
    >
      {action ? (
        <MoverDoActionBody
          key={modalKey}
          action={action}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </GlobalModal>
  );
}

function MoverDoActionBody({
  action,
  onClose,
  onSuccess,
}: {
  action: NonNullable<MoverActiveAction>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { mode, order, fuelRequestId } = action;

  // Start Delivery state
  const [kmStart, setKmStart] = useState(
    order.departureKilometer ?? order.vehicleCurrentKilometer ?? "",
  );

  // Complete Delivery Wizard state (Step 0 = Photos, Step 1 = ODO End)
  const [completeStep, setCompleteStep] = useState(0);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [kmEnd, setKmEnd] = useState("");

  // Fuel Request Wizard state (Step 0 = Source & Condition, Step 1 = Photos)
  const [fuelStep, setFuelStep] = useState(0);
  const [fuelSource, setFuelSource] = useState<VehicleFuelSource>(
    VehicleFuelSource.SPBU,
  );
  const [includeException, setIncludeException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);
  const [receiptPhotos, setReceiptPhotos] = useState<File[]>([]);

  const handleStartDelivery = (event: FormEvent) => {
    event.preventDefault();
    const numericKm = Number(kmStart);
    if (!Number.isFinite(numericKm) || numericKm < 0) {
      toast.error("Masukkan angka ODO speedometer berangkat yang valid.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await startMoverDeliveryOrder(
          order.publicCode,
          numericKm,
        );
        if (result.success) {
          toast.success(result.message);
          onSuccess();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Start delivery failed:", error);
        toast.error("Pengiriman gagal dimulai. Silakan coba lagi.");
      }
    });
  };

  const handleSavePhotosOnly = () => {
    if (proofFiles.length === 0) {
      toast.error("Pilih minimal 1 foto bukti serah-terima untuk disimpan.");
      return;
    }
    startTransition(async () => {
      try {
        const compressed = await compressFieldImageFiles(proofFiles);
        const result = await submitMoverDeliveryProofs(
          order.publicCode,
          compressed,
          false,
        );
        if (result.success) {
          toast.success(result.message);
          setProofFiles([]);
          onSuccess();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Save delivery proofs failed:", error);
        toast.error("Foto bukti gagal disimpan.");
      }
    });
  };

  const handleCompleteDelivery = (event: FormEvent) => {
    event.preventDefault();
    if (proofFiles.length === 0 && order.receiptPhotoUrls.length === 0) {
      toast.error("Unggah minimal 1 foto bukti sebelum menyelesaikan DO.");
      setCompleteStep(0);
      return;
    }
    const startNum = Number(kmStart || 0);
    const endNum = Number(kmEnd);
    if (!Number.isFinite(endNum) || endNum <= startNum) {
      toast.error(
        "ODO speedometer kembali harus lebih besar dari KM berangkat.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const compressed =
          proofFiles.length > 0
            ? await compressFieldImageFiles(proofFiles)
            : [];
        const result = await submitMoverDeliveryProofs(
          order.publicCode,
          compressed,
          true,
          startNum,
          endNum,
        );
        if (result.success) {
          toast.success(result.message);
          onSuccess();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Complete delivery failed:", error);
        toast.error("Pengiriman gagal diselesaikan. Silakan coba lagi.");
      }
    });
  };

  const handleSubmitFuelRequest = (event: FormEvent) => {
    event.preventDefault();
    const beforeFile = beforePhotos[0];
    const afterFile = afterPhotos[0];
    if (!beforeFile || !afterFile) {
      toast.error(
        "Foto speedometer sebelum dan sesudah pengisian wajib dilampirkan.",
      );
      return;
    }
    if (includeException && !exceptionReason.trim()) {
      toast.error("Alasan kondisi khusus wajib diisi untuk toleransi +10 km.");
      setFuelStep(0);
      return;
    }
    startTransition(async () => {
      try {
        const compressedBefore = await compressFieldImageFile(beforeFile);
        const compressedAfter = await compressFieldImageFile(afterFile);
        const compressedReceipt = receiptPhotos[0]
          ? await compressFieldImageFile(receiptPhotos[0])
          : undefined;
        const result = await createVehicleFuelRequest(order.publicCode, {
          source: fuelSource,
          beforeFillingPhoto: compressedBefore,
          afterFillingPhoto: compressedAfter,
          ...(compressedReceipt ? { receiptPhoto: compressedReceipt } : {}),
          includeExceptionAllowance: includeException,
          ...(includeException ? { exceptionReason } : {}),
        });
        if (result.success) {
          toast.success(result.message);
          onSuccess();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Fuel request failed:", error);
        toast.error("Pengajuan BBM gagal dikirim.");
      }
    });
  };

  const handleSubmitFuelProof = (event: FormEvent) => {
    event.preventDefault();
    if (!fuelRequestId) return;
    const afterFile = afterPhotos[0];
    if (!afterFile) {
      toast.error("Foto speedometer setelah pengisian wajib dilampirkan.");
      return;
    }
    startTransition(async () => {
      try {
        const compressedAfter = await compressFieldImageFile(afterFile);
        const compressedReceipt = receiptPhotos[0]
          ? await compressFieldImageFile(receiptPhotos[0])
          : undefined;
        const result = await submitVehicleFuelProof(
          fuelRequestId,
          compressedAfter,
          compressedReceipt,
        );
        if (result.success) {
          toast.success(result.message);
          onSuccess();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Fuel proof submission failed:", error);
        toast.error("Bukti pengisian gagal dikirim.");
      }
    });
  };

  if (mode === "start") {
    return (
      <form onSubmit={handleStartDelivery} className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="type-p3 text-muted-foreground">Armada Terpilih</p>
          <p className="type-p1 font-semibold text-foreground">
            {order.vehiclePlateNumber ?? order.vehiclePlate ?? "—"}
            {order.vehicleType ? ` (${order.vehicleType})` : ""}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="md-km-start" className="type-p2 font-semibold">
            KM Speedometer Berangkat <span className="text-destructive">*</span>
          </Label>
          <Input
            id="md-km-start"
            type="number"
            min="0"
            step="0.001"
            required
            value={kmStart}
            onChange={(e) => setKmStart(e.target.value)}
            placeholder="Contoh: 188293"
            className="font-mono"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button type="submit" disabled={isPending}>
            <Navigation className="size-4" aria-hidden="true" />
            {isPending ? "Memulai..." : "Mulai Antar"}
          </Button>
        </div>
      </form>
    );
  }

  if (mode === "complete") {
    const startNum = Number(kmStart || 0);
    const endNum = Number(kmEnd || 0);
    const previewDist =
      Number.isFinite(endNum) && endNum > startNum ? endNum - startNum : 0;

    return (
      <form onSubmit={handleCompleteDelivery} className="space-y-4">
        <Stepper
          steps={[
            { label: "Foto Bukti", description: "1–5 foto serah terima" },
            { label: "Odometer", description: "Input KM kembali" },
          ]}
          currentStep={completeStep}
          onStepClick={(idx) => setCompleteStep(idx)}
        />

        {completeStep === 0 ? (
          <div className="space-y-3">
            <FileDropzone
              accept="image/*,.heic,.heif"
              multiple
              maxFiles={5}
              capture="environment"
              files={proofFiles}
              disabled={isPending}
              label="Foto Serah Terima Lokasi"
              hint="Ambil foto dari kamera atau pilih hingga 5 gambar."
              onFilesChange={setProofFiles}
              onError={(err) => toast.error(err)}
            />

            {order.receiptPhotoUrls.length > 0 && (
              <p className="type-p3 text-emerald-700 dark:text-emerald-300">
                Sudah tersimpan {order.receiptPhotoUrls.length} foto bukti sebelumnya.
              </p>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending || proofFiles.length === 0}
                onClick={handleSavePhotosOnly}
              >
                <Camera className="size-4" aria-hidden="true" />
                Simpan Foto
              </Button>
              <Button
                type="button"
                disabled={
                  proofFiles.length === 0 && order.receiptPhotoUrls.length === 0
                }
                onClick={() => setCompleteStep(1)}
              >
                Lanjut Odometer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
              <span className="type-p3 text-muted-foreground">
                KM Berangkat
              </span>
              <span className="type-p2 font-mono font-bold">
                {startNum.toLocaleString("id-ID")} km
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="md-km-end" className="type-p2 font-semibold">
                KM Speedometer Kembali{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="md-km-end"
                type="number"
                min="0"
                step="0.001"
                required
                autoFocus
                value={kmEnd}
                onChange={(e) => setKmEnd(e.target.value)}
                placeholder="Masukkan ODO saat tiba di gudang"
                className="font-mono"
              />
            </div>

            {previewDist > 0 && (
              <div className="type-p2 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 dark:text-emerald-200">
                <span>Estimasi Jarak Tempuh</span>
                <span className="font-mono font-bold">
                  {previewDist.toLocaleString("id-ID")} km
                </span>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompleteStep(0)}
                disabled={isPending}
              >
                Kembali
              </Button>
              <Button type="submit" variant="success" disabled={isPending}>
                <Check className="size-4" aria-hidden="true" />
                {isPending ? "Memproses..." : "Selesaikan DO"}
              </Button>
            </div>
          </div>
        )}
      </form>
    );
  }

  if (mode === "fuel_request") {
    const tripDistanceKm = Number(order.vehicleTripLog?.distanceKm ?? 0);
    const eligibleDistanceKm = tripDistanceKm + (includeException ? 10 : 0);
    const fuelUnitPrice = VEHICLE_FUEL_PRICE_PER_LITER[fuelSource];
    const estimatedFuelLiter =
      Math.round(
        (eligibleDistanceKm / VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER) * 100,
      ) / 100;
    const estimatedFuelAmount = Math.round(
      (eligibleDistanceKm / VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER) *
        fuelUnitPrice,
    );

    return (
      <form onSubmit={handleSubmitFuelRequest} className="space-y-4">
        <Stepper
          steps={[
            { label: "Sumber BBM", description: "SPBU / Eceran & Plafon" },
            { label: "Foto Bukti", description: "Speedometer & Struk" },
          ]}
          currentStep={fuelStep}
          onStepClick={(idx) => setFuelStep(idx)}
        />

        {fuelStep === 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="type-p2 font-semibold">
                Sumber Pembelian BBM
              </Label>
              <RadioGroup
                value={fuelSource}
                onValueChange={(value) =>
                  setFuelSource(value as VehicleFuelSource)
                }
                className="grid grid-cols-2 gap-2"
              >
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${
                    fuelSource === VehicleFuelSource.SPBU
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background"
                  }`}
                >
                  <RadioGroupItem value={VehicleFuelSource.SPBU} />
                  <div>
                    <p className="type-p2 font-semibold">SPBU</p>
                    <p className="type-p3 text-muted-foreground">Rp10.000/L</p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 ${
                    fuelSource === VehicleFuelSource.RETAIL
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background"
                  }`}
                >
                  <RadioGroupItem value={VehicleFuelSource.RETAIL} />
                  <div>
                    <p className="type-p2 font-semibold">Eceran</p>
                    <p className="type-p3 text-muted-foreground">Rp14.000/L</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1">
              <div className="flex justify-between">
                <span className="type-p3 text-muted-foreground">
                  Plafon Dihitung
                </span>
                <span className="type-h3 font-bold tabular-nums text-primary">
                  Rp{estimatedFuelAmount.toLocaleString("id-ID")}
                </span>
              </div>
              <div className="type-p3 flex justify-between text-muted-foreground">
                <span>Jarak ODO</span>
                <span>
                  {eligibleDistanceKm} km ({estimatedFuelLiter} L)
                </span>
              </div>
            </div>

            <label className="type-p2 flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={includeException}
                onCheckedChange={(checked) =>
                  setIncludeException(checked === true)
                }
              />
              <span>Kondisi macet/rusak (toleransi +10 km)</span>
            </label>

            {includeException && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="mf-reason"
                  className="type-p2 font-medium"
                >
                  Alasan Kondisi Khusus{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="mf-reason"
                  rows={2}
                  required
                  maxLength={300}
                  placeholder="Contoh: Macet total / memutar jalur perbaikan"
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (includeException && !exceptionReason.trim()) {
                    toast.error("Alasan kondisi khusus wajib diisi.");
                    return;
                  }
                  setFuelStep(1);
                }}
              >
                Lanjut Foto
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="type-p2 font-medium">
                Foto Speedometer Sebelum <span className="text-destructive">*</span>
              </Label>
              <FileDropzone
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                maxFiles={1}
                files={beforePhotos}
                disabled={isPending}
                label="Ambil / Pilih Foto Sebelum"
                onFilesChange={setBeforePhotos}
                onError={(err) => toast.error(err)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="type-p2 font-medium">
                Foto Speedometer Sesudah <span className="text-destructive">*</span>
              </Label>
              <FileDropzone
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                maxFiles={1}
                files={afterPhotos}
                disabled={isPending}
                label="Ambil / Pilih Foto Sesudah"
                onFilesChange={setAfterPhotos}
                onError={(err) => toast.error(err)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="type-p2 font-medium">
                Foto Struk / Bon BBM (Opsional)
              </Label>
              <FileDropzone
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                maxFiles={1}
                files={receiptPhotos}
                disabled={isPending}
                label="Ambil / Pilih Foto Struk"
                onFilesChange={setReceiptPhotos}
                onError={(err) => toast.error(err)}
              />
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFuelStep(0)}
                disabled={isPending}
              >
                Kembali
              </Button>
              <Button
                type="submit"
                disabled={
                  isPending ||
                  beforePhotos.length === 0 ||
                  afterPhotos.length === 0
                }
              >
                <Fuel className="size-4" aria-hidden="true" />
                {isPending ? "Mengirim..." : "Kirim Pengajuan"}
              </Button>
            </div>
          </div>
        )}
      </form>
    );
  }

  if (mode === "fuel_proof") {
    return (
      <form onSubmit={handleSubmitFuelProof} className="space-y-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="type-p2 font-medium text-emerald-800 dark:text-emerald-200">
            Dana BBM sudah cair. Unggah foto speedometer setelah pengisian.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="type-p2 font-medium">
            Speedometer Setelah Isi <span className="text-destructive">*</span>
          </Label>
          <FileDropzone
            accept="image/*,.heic,.heif"
            capture="environment"
            maxFiles={1}
            files={afterPhotos}
            disabled={isPending}
            label="Foto Speedometer"
            onFilesChange={setAfterPhotos}
            onError={(err) => toast.error(err)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="type-p2 font-medium">
            Struk / Bon BBM (Opsional)
          </Label>
          <FileDropzone
            accept="image/*,.heic,.heif"
            capture="environment"
            maxFiles={1}
            files={receiptPhotos}
            disabled={isPending}
            label="Foto Struk BBM"
            onFilesChange={setReceiptPhotos}
            onError={(err) => toast.error(err)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button
            type="submit"
            disabled={isPending || afterPhotos.length === 0}
          >
            {isPending ? "Mengirim..." : "Kirim Bukti BBM"}
          </Button>
        </div>
      </form>
    );
  }

  // Detail mode
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
          Muatan Material ({order.items.length} Item)
        </p>
        <ul className="mt-2 divide-y divide-border/50">
          {order.items.map((item, idx) => (
            <li
              key={`${item.itemName}-${idx}`}
              className="type-p2 flex items-center justify-between py-1.5"
            >
              <span className="font-medium text-foreground">
                {item.itemName}
              </span>
              <Badge variant="secondary">
                {item.qtyDelivered} {item.unit}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {order.vehicleTripLog && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="type-p2 flex items-center justify-between font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Rekap Perjalanan
            </span>
            <span>
              {Number(order.vehicleTripLog.distanceKm).toLocaleString("id-ID")}{" "}
              KM
            </span>
          </div>
          <p className="type-p3 mt-1 text-muted-foreground">
            ODO {order.vehicleTripLog.kilometerStart} –{" "}
            {order.vehicleTripLog.kilometerEnd} km · Estimasi{" "}
            {order.vehicleTripLog.fuelLiter} L
          </p>
        </div>
      )}

      {order.receiptPhotoUrls.length > 0 && (
        <div className="space-y-2">
          <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
            Bukti Serah Terima ({order.receiptPhotoUrls.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {order.receiptPhotoUrls.map((url, idx) => (
              <Button key={`${url}-${idx}`} size="sm" variant="outline" asChild>
                <a
                  href={withLocalPhotoPreview(url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ImageIcon className="size-3.5" aria-hidden="true" />
                  Foto #{idx + 1}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      )}

      {order.fuelRequests.length > 0 && (
        <div className="space-y-2">
          <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
            Riwayat Request BBM
          </p>
          {order.fuelRequests.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <div>
                <p className="type-p2 font-semibold">
                  {req.source === "SPBU" ? "SPBU" : "Eceran"} ·{" "}
                  {req.estimatedFuelLiter} L
                </p>
                <p className="type-p3 text-muted-foreground">
                  Rp{Number(req.requestedAmount).toLocaleString("id-ID")}
                </p>
              </div>
              <Badge variant="outline">
                {fuelStatusLabels[req.status] ?? req.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
