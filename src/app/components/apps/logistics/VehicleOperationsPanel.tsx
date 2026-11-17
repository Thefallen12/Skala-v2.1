"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  addVehicle,
  type VehicleInput,
  type VehicleSummary,
} from "@/app/actions/vehicles";
import { createVehicleTripLog } from "@/app/actions/vehicle-trips";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import VehicleTripLogTable from "@/app/components/apps/logistics/VehicleTripLogTable";

type ProjectOption = { id: string; title: string; kelompokTani: string };
type DeliveryOrderOption = {
  id: string;
  doNumber: string;
  status: string;
  vehicleId: string | null;
  vehiclePlateNumber: string | null;
};

const vehicleStatusLabel: Record<VehicleSummary["status"], string> = {
  AVAILABLE: "Tersedia",
  RESERVED: "Ditugaskan ke DO",
  IN_USE: "Sedang Digunakan",
  MAINTENANCE: "Perawatan",
};

const vehicleStatusBadge: Record<
  VehicleSummary["status"],
  "lightSuccess" | "lightInfo" | "lightPrimary" | "lightWarning"
> = {
  AVAILABLE: "lightSuccess",
  RESERVED: "lightInfo",
  IN_USE: "lightPrimary",
  MAINTENANCE: "lightWarning",
};

function VehicleOperationMobileCard({ vehicle }: { vehicle: VehicleSummary }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="min-w-0">
        <p className="type-p1 font-mono font-bold text-foreground">
          {vehicle.plateNumber}
        </p>
        <p className="type-p3 text-muted-foreground">
          {vehicle.vehicleType}
          {vehicle.modelName ? ` · ${vehicle.modelName}` : ""}
          {vehicle.brand ? ` (${vehicle.brand})` : ""}
        </p>
        <p className="type-p3 tabular-nums text-muted-foreground">
          {vehicle.odometerInitialized
            ? `${vehicle.currentKilometer} km`
            : "KM belum diinisialisasi"}
        </p>
      </div>
      <Badge variant={vehicleStatusBadge[vehicle.status]} className="shrink-0">
        {vehicleStatusLabel[vehicle.status]}
      </Badge>
    </div>
  );
}

export default function VehicleOperationsPanel({
  vehicles,
  logs,
  projects,
  deliveryOrders,
  canManageVehicles,
}: {
  vehicles: VehicleSummary[];
  logs: VehicleTripLogRow[];
  projects: ProjectOption[];
  deliveryOrders: DeliveryOrderOption[];
  canManageVehicles: boolean;
}) {
  const router = useRouter();
  const [masterOpen, setMasterOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedDoId, setSelectedDoId] = useState("__NONE__");
  const [isPending, startTransition] = useTransition();

  const availableVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "AVAILABLE",
  );
  const selectedVehicle = vehicles.find(
    (vehicle) => vehicle.id === selectedVehicleId,
  );
  const linkedOrders = deliveryOrders.filter(
    (order) =>
      order.status === "DELIVERED" &&
      (order.vehicleId === selectedVehicleId ||
        (selectedVehicle &&
          !order.vehicleId &&
          order.vehiclePlateNumber === selectedVehicle.plateNumber)) &&
      !logs.some((log) => log.doNumber === order.doNumber),
  );

  const projectOptions = useMemo<ComboboxOption[]>(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: `${project.kelompokTani} · ${project.title}`,
        keywords: [project.kelompokTani, project.title],
      })),
    [projects],
  );

  const submitVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: VehicleInput = {
      plateNumber: String(data.get("plateNumber") ?? ""),
      vehicleType: String(data.get("vehicleType") ?? ""),
      brand: String(data.get("brand") ?? ""),
      modelName: String(data.get("modelName") ?? ""),
      initialKilometer: Number(data.get("initialKilometer")),
    };
    startTransition(async () => {
      try {
        const result = await addVehicle(input);
        if (result.success) {
          toast.success(result.message);
          setMasterOpen(false);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Vehicle master registration failed:", error);
        toast.error("Kendaraan gagal didaftarkan. Silakan coba kembali.");
      }
    });
  };

  const submitTripLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedVehicleId || !selectedProjectId) {
      toast.error("Pilih kendaraan dan proyek tujuan terlebih dahulu.");
      return;
    }
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await createVehicleTripLog({
          vehicleId: selectedVehicleId,
          projectId: selectedProjectId,
          deliveryOrderId:
            selectedDoId && selectedDoId !== "__NONE__"
              ? selectedDoId
              : undefined,
          kilometerStart: Number(data.get("kilometerStart")),
          kilometerEnd: Number(data.get("kilometerEnd")),
        });
        if (result.success) {
          toast.success(result.message);
          setLogOpen(false);
          setSelectedVehicleId("");
          setSelectedProjectId("");
          setSelectedDoId("__NONE__");
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Vehicle trip log submission failed:", error);
        toast.error("Log KM dan BBM gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="type-h2">Operasional Kendaraan &amp; BBM</CardTitle>
          <p className="type-p2 mt-1 text-muted-foreground">
            Estimasi BBM dihitung otomatis berdasarkan rasio 12 km per liter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageVehicles && (
            <Button type="button" onClick={() => setMasterOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              + Kendaraan
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={availableVehicles.length === 0 || projects.length === 0}
            onClick={() => {
              setSelectedVehicleId("");
              setSelectedProjectId("");
              setSelectedDoId("__NONE__");
              setLogOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            + Log KM
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="type-h3 text-foreground">Daftar Kendaraan Aktif</h3>
          {vehicles.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Belum Ada Kendaraan"
              description="Daftarkan kendaraan armada terlebih dahulu sebelum mencatat log perjalanan."
            />
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {vehicles.map((vehicle) => (
                  <VehicleOperationMobileCard
                    key={vehicle.id}
                    vehicle={vehicle}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                <Table itemLabel="kendaraan">
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. Plat</TableHead>
                      <TableHead>Jenis / Model</TableHead>
                      <TableHead>Merk</TableHead>
                      <TableHead>Kilometer</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((vehicle) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="type-p2 font-mono font-semibold">
                          {vehicle.plateNumber}
                        </TableCell>
                        <TableCell className="type-p2 whitespace-normal">
                          {vehicle.vehicleType}
                          {vehicle.modelName ? ` · ${vehicle.modelName}` : ""}
                        </TableCell>
                        <TableCell className="type-p2">
                          {vehicle.brand ?? "—"}
                        </TableCell>
                        <TableCell className="type-p2 tabular-nums">
                          {vehicle.odometerInitialized
                            ? `${vehicle.currentKilometer} km`
                            : "Belum diatur"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={vehicleStatusBadge[vehicle.status]}>
                            {vehicleStatusLabel[vehicle.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="type-h3 text-foreground">Riwayat Perjalanan &amp; BBM</h3>
          <VehicleTripLogTable logs={logs} />
        </section>
      </CardContent>

      <GlobalModal
        isOpen={masterOpen}
        onClose={() => {
          if (!isPending) setMasterOpen(false);
        }}
        title="Daftarkan Kendaraan"
        description="KM awal akan menjadi acuan odometer untuk log perjalanan berikutnya."
        className="sm:max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setMasterOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" form="vehicle-master-form" disabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <form
          id="vehicle-master-form"
          className="space-y-3.5"
          onSubmit={submitVehicle}
        >
          <div className="space-y-1.5">
            <Label htmlFor="vo-plate" className="type-p2 font-medium">
              Nomor Plat <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vo-plate"
              name="plateNumber"
              required
              maxLength={20}
              placeholder="BL 1234 AB"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vo-type" className="type-p2 font-medium">
              Jenis Kendaraan <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vo-type"
              name="vehicleType"
              required
              maxLength={80}
              placeholder="Pick-up, Truk Engkel"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vo-brand" className="type-p2 font-medium">
                Merk
              </Label>
              <Input id="vo-brand" name="brand" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vo-model" className="type-p2 font-medium">
                Model
              </Label>
              <Input id="vo-model" name="modelName" maxLength={80} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vo-km" className="type-p2 font-medium">
              KM Awal <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vo-km"
              name="initialKilometer"
              type="number"
              min="0"
              step="0.001"
              required
              defaultValue="0"
            />
          </div>
        </form>
      </GlobalModal>

      <GlobalModal
        isOpen={logOpen}
        onClose={() => {
          if (!isPending) setLogOpen(false);
        }}
        title="Catat Log Perjalanan & BBM"
        description="Jarak dihitung dari odometer dan estimasi BBM otomatis."
        className="sm:max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setLogOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="vehicle-trip-form"
              disabled={isPending || !selectedVehicleId || !selectedProjectId}
            >
              {isPending ? "Menyimpan..." : "Simpan Log"}
            </Button>
          </>
        }
      >
        <form
          id="vehicle-trip-form"
          className="space-y-3.5"
          onSubmit={submitTripLog}
        >
          <div className="space-y-1.5">
            <Label htmlFor="vtf-vehicle" className="type-p2 font-medium">
              Kendaraan <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedVehicleId}
              onValueChange={(value) => {
                setSelectedVehicleId(value);
                setSelectedDoId("__NONE__");
              }}
            >
              <SelectTrigger id="vtf-vehicle" className="w-full">
                <SelectValue placeholder="Pilih kendaraan..." />
              </SelectTrigger>
              <SelectContent>
                {availableVehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} · {vehicle.vehicleType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vtf-project" className="type-p2 font-medium">
              Tujuan Proyek <span className="text-destructive">*</span>
            </Label>
            <Combobox
              id="vtf-project"
              options={projectOptions}
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              placeholder="Pilih proyek..."
              searchPlaceholder="Cari nama proyek atau kelompok tani..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vtf-do" className="type-p2 font-medium">
              No. DO (Opsional)
            </Label>
            <Select value={selectedDoId} onValueChange={setSelectedDoId}>
              <SelectTrigger id="vtf-do" className="w-full">
                <SelectValue placeholder="Tidak terkait DO" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__NONE__">Tidak terkait DO</SelectItem>
                {linkedOrders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.doNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vtf-km-start" className="type-p2 font-medium">
                KM Awal <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vtf-km-start"
                name="kilometerStart"
                type="number"
                min="0"
                step="0.001"
                required
                defaultValue={selectedVehicle?.currentKilometer ?? ""}
                key={selectedVehicle?.id ?? "no-vehicle"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vtf-km-end" className="type-p2 font-medium">
                KM Akhir <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vtf-km-end"
                name="kilometerEnd"
                type="number"
                min="0"
                step="0.001"
                required
              />
            </div>
          </div>
        </form>
      </GlobalModal>
    </Card>
  );
}
