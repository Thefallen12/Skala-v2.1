"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import {
  addVehicle,
  deleteVehicle,
  updateVehicle,
  type VehicleInput,
  type VehicleStatus,
  type VehicleSummary,
} from "@/app/actions/vehicles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeDataTable } from "@/components/ui/native-data-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GlobalModal } from "@/components/ui/global-modal";

const statusLabels: Record<VehicleStatus, string> = {
  AVAILABLE: "Tersedia",
  RESERVED: "Ditugaskan ke DO",
  IN_USE: "Sedang digunakan",
  MAINTENANCE: "Dalam perawatan",
};

const statusVariants: Record<VehicleStatus, string> = {
  AVAILABLE: "bg-green-50 text-green-700",
  RESERVED: "bg-indigo-50 text-indigo-700",
  IN_USE: "bg-blue-50 text-blue-700",
  MAINTENANCE: "bg-amber-50 text-amber-700",
};

function isVehicleStatus(value: string): value is VehicleStatus {
  return (
    value === "AVAILABLE" ||
    value === "RESERVED" ||
    value === "IN_USE" ||
    value === "MAINTENANCE"
  );
}

export default function VehicleFleetPanel({
  vehicles,
  canManage = true,
}: {
  vehicles: VehicleSummary[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleSummary | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openAddDialog = () => {
    setEditingVehicle(null);
    setMessage("");
    setDialogOpen(true);
  };

  const openEditDialog = (vehicle: VehicleSummary) => {
    setEditingVehicle(vehicle);
    setMessage("");
    setDialogOpen(true);
  };

  const submitVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const status = String(formData.get("status") ?? "AVAILABLE");
    const input: VehicleInput = {
      plateNumber: String(formData.get("plateNumber") ?? ""),
      vehicleType: String(formData.get("vehicleType") ?? ""),
      brand: String(formData.get("brand") ?? ""),
      modelName: String(formData.get("modelName") ?? ""),
      ...(!editingVehicle || !editingVehicle.odometerInitialized
        ? { initialKilometer: Number(formData.get("initialKilometer")) }
        : {}),
      ...(isVehicleStatus(status) ? { status } : {}),
    };

    setMessage("");
    startTransition(async () => {
      try {
        const result = editingVehicle
          ? await updateVehicle(editingVehicle.id, input)
          : await addVehicle(input);
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          setDialogOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Vehicle save failed:", error);
        setMessage("Kendaraan gagal disimpan. Silakan coba kembali.");
        setIsError(true);
      }
    });
  };

  const handleDelete = (vehicle: VehicleSummary) => {
    if (
      !window.confirm(
        `Hapus kendaraan ${vehicle.plateNumber} dari daftar armada?`,
      )
    ) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const result = await deleteVehicle(vehicle.id);
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Vehicle deletion failed:", error);
        setMessage("Kendaraan gagal dihapus. Silakan coba kembali.");
        setIsError(true);
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Data Kendaraan & Armada</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Kelola armada, model kendaraan, dan odometer terakhir.
            </p>
          </div>
          {canManage && (
            <Button type="button" onClick={openAddDialog}>
              <Plus className="size-4" />
              Tambah Kendaraan
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
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
          <NativeDataTable itemLabel="kendaraan">
            <table className="app-data-table w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Nomor Plat</th>
                      <th className="p-3">Jenis / Model</th>
                  <th className="p-3">Merk</th>
                      <th className="p-3">Kilometer Saat Ini</th>
                      <th className="p-3">Status Ketersediaan</th>
                      <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr className="border-b" key={vehicle.id}>
                    <td className="p-3 font-semibold">{vehicle.plateNumber}</td>
                    <td className="p-3">
                      {vehicle.vehicleType}
                      {vehicle.modelName && (
                        <span className="block text-xs text-muted-foreground">
                          {vehicle.modelName}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{vehicle.brand || "—"}</td>
                    <td className="p-3">
                      {vehicle.odometerInitialized
                        ? `${vehicle.currentKilometer} km`
                        : "Belum diatur"}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={statusVariants[vehicle.status]}
                      >
                        {statusLabels[vehicle.status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => openEditDialog(vehicle)}
                            aria-label={`Edit ${vehicle.plateNumber}`}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              isPending ||
                              vehicle.status === "IN_USE" ||
                              vehicle.status === "RESERVED"
                            }
                            onClick={() => handleDelete(vehicle)}
                            aria-label={`Hapus ${vehicle.plateNumber}`}
                          >
                            <Trash2 className="size-4" />
                            Hapus
                          </Button>
                          </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-10 text-center text-muted-foreground"
                    >
                      <Truck className="mx-auto mb-2 size-7 opacity-60" />
                      Belum ada kendaraan terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </NativeDataTable>
        </CardContent>
      </Card>

      {canManage && <GlobalModal
        isOpen={dialogOpen}
        onClose={() => {
          if (!isPending) setDialogOpen(false);
        }}
        title={editingVehicle ? "Edit Kendaraan" : "Tambah Kendaraan"}
        description="Masukkan data armada untuk digunakan pada pengiriman internal."
        className="sm:max-w-xl"
      >
          <form id="vehicle-form" className="mt-6 space-y-4" onSubmit={submitVehicle}>
            <label className="grid gap-1.5 text-sm font-medium">
              Nomor plat
              <Input
                name="plateNumber"
                required
                maxLength={20}
                placeholder="BL 1234 AB"
                defaultValue={editingVehicle?.plateNumber ?? ""}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Jenis kendaraan
              <Input
                name="vehicleType"
                required
                maxLength={80}
                placeholder="Pick-up, Truk Engkel, Dump Truck"
                defaultValue={editingVehicle?.vehicleType ?? ""}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Merk
              <Input
                name="brand"
                maxLength={80}
                placeholder="Toyota, Mitsubishi"
                defaultValue={editingVehicle?.brand ?? ""}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Model
              <Input
                name="modelName"
                maxLength={80}
                placeholder="Hilux 2.4"
                defaultValue={editingVehicle?.modelName ?? ""}
              />
            </label>
            {(!editingVehicle || !editingVehicle.odometerInitialized) && (
              <label className="grid gap-1.5 text-sm font-medium">
                {editingVehicle ? "Inisialisasi KM awal" : "KM awal"}
                <Input
                  name="initialKilometer"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={editingVehicle?.currentKilometer ?? "0"}
                />
              </label>
            )}
            {editingVehicle && (
              <label className="grid gap-1.5 text-sm font-medium">
                Status
                <select
                  className="h-10 rounded-md border bg-background px-3 font-normal"
                  name="status"
                  defaultValue={editingVehicle.status}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setDialogOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" form="vehicle-form" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
      </GlobalModal>}
    </>
  );
}
