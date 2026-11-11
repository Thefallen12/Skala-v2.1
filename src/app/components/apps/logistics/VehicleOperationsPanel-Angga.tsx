"use client";
import { FormLabel } from "@/components/ui/label"

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addVehicle, type VehicleInput, type VehicleSummary } from "@/app/actions/vehicles";
import { createVehicleTripLog } from "@/app/actions/vehicle-trips";
import type { VehicleTripLogRow } from "@/lib/vehicle-trip-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeDataTable } from "@/components/ui/native-data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GlobalModal } from "@/components/ui/global-modal";
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
  IN_USE: "Sedang digunakan",
  MAINTENANCE: "Dalam perawatan",
};

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
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
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
    setMessage("");
    startTransition(async () => {
      try {
        const result = await addVehicle(input);
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          setMasterOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Vehicle master registration failed:", error);
        setMessage("Kendaraan gagal didaftarkan. Silakan coba kembali.");
        setIsError(true);
      }
    });
  };

  const submitTripLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createVehicleTripLog({
          vehicleId: String(data.get("vehicleId") ?? ""),
          projectId: String(data.get("projectId") ?? ""),
          deliveryOrderId: String(data.get("deliveryOrderId") ?? "") || undefined,
          kilometerStart: Number(data.get("kilometerStart")),
          kilometerEnd: Number(data.get("kilometerEnd")),
        });
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          setLogOpen(false);
          setSelectedVehicleId("");
          router.refresh();
        }
      } catch (error) {
        console.error("Vehicle trip log submission failed:", error);
        setMessage("Log KM dan BBM gagal disimpan. Silakan coba kembali.");
        setIsError(true);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logistik, Kendaraan & BBM</CardTitle>
        <p className="text-sm text-muted-foreground">
          Estimasi BBM dihitung otomatis berdasarkan rasio 12 km per liter.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {canManageVehicles && (
            <Button type="button" onClick={() => setMasterOpen(true)}>
              + Daftarkan Kendaraan
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={availableVehicles.length === 0 || projects.length === 0}
            onClick={() => {
              setSelectedVehicleId("");
              setLogOpen(true);
            }}
          >
            + Catat Log KM & BBM
          </Button>
        </div>
        {message && (
          <p
            className={`rounded-md border p-3 text-sm ${
              isError
                ? "border-destructive text-destructive"
                : "border-green-200 text-green-800"
            }`}
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        <section className="space-y-3">
          <h3 className="font-semibold text-primary">Daftar Kendaraan Aktif</h3>
          <NativeDataTable itemLabel="kendaraan">
            <table className="app-data-table w-full min-w-[720px] text-sm">
              <thead className="bg-[#102A4D] text-left text-white">
                <tr>
                  <th className="p-3">No. Plat</th>
                  <th className="p-3">Jenis / Model</th>
                  <th className="p-3">Merk</th>
                  <th className="p-3">Kilometer Saat Ini</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr className="border-b" key={vehicle.id}>
                    <td className="p-3 font-medium">{vehicle.plateNumber}</td>
                    <td className="p-3">
                      {vehicle.vehicleType}
                      {vehicle.modelName ? ` · ${vehicle.modelName}` : ""}
                    </td>
                    <td className="p-3">{vehicle.brand ?? "—"}</td>
                    <td className="p-3">
                      {vehicle.odometerInitialized
                        ? `${vehicle.currentKilometer} km`
                        : "KM belum diinisialisasi"}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{vehicleStatusLabel[vehicle.status]}</Badge>
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td className="p-5 text-center text-muted-foreground" colSpan={5}>
                      Belum ada kendaraan terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </NativeDataTable>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold text-primary">Riwayat Log Perjalanan & BBM</h3>
          <VehicleTripLogTable logs={logs} />
        </section>
      </CardContent>

      <GlobalModal
        isOpen={masterOpen}
        onClose={() => {
          if (!isPending) setMasterOpen(false);
        }}
        title="Daftarkan Master Kendaraan"
        description="KM awal akan menjadi acuan odometer untuk log perjalanan berikutnya."
        className="sm:max-w-xl"
      >
          <form id="vehicle-master-form" className="mt-6 space-y-3" onSubmit={submitVehicle}>
            <FormLabel className="grid gap-1 text-sm">
              Nomor plat
              <Input name="plateNumber" required maxLength={20} placeholder="BL 1234 AB" />
            </FormLabel>
            <FormLabel className="grid gap-1 text-sm">
              Jenis kendaraan
              <Input name="vehicleType" required maxLength={80} placeholder="Pick-up, Truk Engkel" />
            </FormLabel>
            <FormLabel className="grid gap-1 text-sm">
              Merk
              <Input name="brand" maxLength={80} />
            </FormLabel>
            <FormLabel className="grid gap-1 text-sm">
              Model
              <Input name="modelName" maxLength={80} />
            </FormLabel>
            <FormLabel className="grid gap-1 text-sm">
              KM awal
              <Input name="initialKilometer" type="number" min="0" step="0.001" required defaultValue="0" />
            </FormLabel>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setMasterOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" form="vehicle-master-form" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Daftarkan"}
              </Button>
            </div>
          </form>
      </GlobalModal>

      <GlobalModal
        isOpen={logOpen}
        onClose={() => {
          if (!isPending) setLogOpen(false);
        }}
        title="Catat Log Perjalanan & BBM"
        description="Jarak dihitung dari odometer dan liter estimasi = jarak ÷ 15."
        className="sm:max-w-xl"
      >
          <form id="vehicle-trip-form" className="mt-6 space-y-3" onSubmit={submitTripLog}>
            <FormLabel className="grid gap-1 text-sm">
              Kendaraan
              <select
                name="vehicleId"
                required
                value={selectedVehicleId}
                onChange={(event) => setSelectedVehicleId(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              >
                <option value="">Pilih kendaraan</option>
                {availableVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} · {vehicle.vehicleType}
                  </option>
                ))}
              </select>
            </FormLabel>
            <FormLabel className="grid gap-1 text-sm">
              Tujuan proyek
              <select name="projectId" required className="h-10 rounded-md border bg-background px-3">
                <option value="">Pilih proyek</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.kelompokTani} · {project.title}
                  </option>
                ))}
              </select>
            </FormLabel>
            <FormLabel className="grid gap-1 text-sm">
              No. DO (opsional; hanya DO selesai tanpa log)
              <select name="deliveryOrderId" className="h-10 rounded-md border bg-background px-3">
                <option value="">Tidak terkait DO</option>
                {linkedOrders.map((order) => (
                  <option key={order.id} value={order.id}>{order.doNumber}</option>
                ))}
              </select>
            </FormLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormLabel className="grid gap-1 text-sm">
                KM awal
                <Input
                  name="kilometerStart"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  defaultValue={selectedVehicle?.currentKilometer ?? ""}
                  key={selectedVehicle?.id ?? "no-vehicle"}
                />
              </FormLabel>
              <FormLabel className="grid gap-1 text-sm">
                KM akhir
                <Input name="kilometerEnd" type="number" min="0" step="0.001" required />
              </FormLabel>
            </div>
            <div className="flex justify-end gap-2">
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
                disabled={isPending || !selectedVehicleId}
              >
                {isPending ? "Menyimpan..." : "Simpan Log"}
              </Button>
            </div>
          </form>
      </GlobalModal>
    </Card>
  );
}
