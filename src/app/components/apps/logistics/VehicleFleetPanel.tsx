"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  addVehicle,
  deleteVehicle,
  updateVehicle,
  updateVehicleKilometer,
  type VehicleInput,
  type VehicleStatus,
  type VehicleSummary,
} from "@/app/actions/vehicles";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const statusLabels: Record<VehicleStatus, string> = {
  AVAILABLE: "Tersedia",
  RESERVED: "Ditugaskan ke DO",
  IN_USE: "Sedang Digunakan",
  MAINTENANCE: "Perawatan",
};

const statusBadgeVariant: Record<
  VehicleStatus,
  "lightSuccess" | "lightInfo" | "lightPrimary" | "lightWarning"
> = {
  AVAILABLE: "lightSuccess",
  RESERVED: "lightInfo",
  IN_USE: "lightPrimary",
  MAINTENANCE: "lightWarning",
};

function isVehicleStatus(value: string): value is VehicleStatus {
  return (
    value === "AVAILABLE" ||
    value === "RESERVED" ||
    value === "IN_USE" ||
    value === "MAINTENANCE"
  );
}

function VehicleMobileCard({
  vehicle,
  canManage,
  isPending,
  onEdit,
  onEditKilometer,
  onDelete,
}: {
  vehicle: VehicleSummary;
  canManage: boolean;
  isPending: boolean;
  onEdit: (vehicle: VehicleSummary) => void;
  onEditKilometer: (vehicle: VehicleSummary) => void;
  onDelete: (vehicle: VehicleSummary) => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-p1 font-mono font-bold text-foreground">
            {vehicle.plateNumber}
          </p>
          <p className="type-p3 text-muted-foreground">
            {vehicle.vehicleType}
            {vehicle.modelName ? ` · ${vehicle.modelName}` : ""}
            {vehicle.brand ? ` · ${vehicle.brand}` : ""}
          </p>
        </div>
        <Badge variant={statusBadgeVariant[vehicle.status]} className="shrink-0">
          {statusLabels[vehicle.status]}
        </Badge>
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-2">
        <span className="type-p3 tabular-nums text-muted-foreground">
          KM:{" "}
          {vehicle.odometerInitialized
            ? `${vehicle.currentKilometer} km`
            : "Belum diatur"}
        </span>
        {canManage ? (
          <div className="flex items-center gap-1.5">
            <ActionIconButton
              type="button"
              label={`Edit kendaraan ${vehicle.plateNumber}`}
              tooltip="Edit Kendaraan"
              icon={Pencil}
              disabled={isPending}
              onClick={() => onEdit(vehicle)}
            />
            <ActionIconButton
              type="button"
              label={`Edit KM ${vehicle.plateNumber}`}
              tooltip="Edit Kilometer"
              icon={Gauge}
              disabled={isPending}
              onClick={() => onEditKilometer(vehicle)}
            />
            <ActionIconButton
              type="button"
              label={`Hapus kendaraan ${vehicle.plateNumber}`}
              tooltip="Hapus Kendaraan"
              icon={Trash2}
              className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={
                isPending ||
                vehicle.status === "IN_USE" ||
                vehicle.status === "RESERVED"
              }
              onClick={() => onDelete(vehicle)}
            />
          </div>
        ) : null}
      </div>
    </div>
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
  const [formStatus, setFormStatus] = useState<VehicleStatus>("AVAILABLE");
  const [kilometerVehicle, setKilometerVehicle] =
    useState<VehicleSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const openAddDialog = () => {
    setEditingVehicle(null);
    setFormStatus("AVAILABLE");
    setDialogOpen(true);
  };

  const openEditDialog = (vehicle: VehicleSummary) => {
    setEditingVehicle(vehicle);
    setFormStatus(vehicle.status);
    setDialogOpen(true);
  };

  const openKilometerDialog = (vehicle: VehicleSummary) => {
    setKilometerVehicle(vehicle);
  };

  const submitKilometer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kilometerVehicle) return;

    const formData = new FormData(event.currentTarget);
    const kilometer = Number(formData.get("kilometer"));
    startTransition(async () => {
      try {
        const result = await updateVehicleKilometer(
          kilometerVehicle.id,
          kilometer,
        );
        if (result.success) {
          toast.success(result.message);
          setKilometerVehicle(null);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Vehicle kilometer save failed:", error);
        toast.error("Kilometer gagal diperbarui. Silakan coba kembali.");
      }
    });
  };

  const submitVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: VehicleInput = {
      plateNumber: String(formData.get("plateNumber") ?? ""),
      vehicleType: String(formData.get("vehicleType") ?? ""),
      brand: String(formData.get("brand") ?? ""),
      modelName: String(formData.get("modelName") ?? ""),
      ...(!editingVehicle || !editingVehicle.odometerInitialized
        ? { initialKilometer: Number(formData.get("initialKilometer")) }
        : {}),
      ...(editingVehicle && isVehicleStatus(formStatus)
        ? { status: formStatus }
        : {}),
    };

    startTransition(async () => {
      try {
        const result = editingVehicle
          ? await updateVehicle(editingVehicle.id, input)
          : await addVehicle(input);
        if (result.success) {
          toast.success(result.message);
          setDialogOpen(false);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Vehicle save failed:", error);
        toast.error("Kendaraan gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const confirmDeleteVehicle = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        const result = await deleteVehicle(deleteTarget.id);
        if (result.success) {
          toast.success(result.message);
          setDeleteTarget(null);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Vehicle deletion failed:", error);
        toast.error("Kendaraan gagal dihapus. Silakan coba kembali.");
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="type-h2">Data Armada</CardTitle>
            <p className="type-p2 mt-1 text-muted-foreground">
              Kelola daftar kendaraan, model, status ketersediaan, dan odometer terakhir.
            </p>
          </div>
          {canManage && (
            <Button type="button" onClick={openAddDialog}>
              <Plus className="size-4" aria-hidden="true" />
              + Kendaraan
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {vehicles.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Belum Ada Armada"
              description="Tambahkan kendaraan operasional untuk penugasan pengiriman logistik."
              action={
                canManage ? (
                  <Button type="button" onClick={openAddDialog}>
                    <Plus className="size-4" aria-hidden="true" />
                    + Kendaraan
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="space-y-2.5 md:hidden">
                {vehicles.map((vehicle) => (
                  <VehicleMobileCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    canManage={canManage}
                    isPending={isPending}
                    onEdit={openEditDialog}
                    onEditKilometer={openKilometerDialog}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                <Table itemLabel="kendaraan">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor Plat</TableHead>
                      <TableHead>Jenis / Model</TableHead>
                      <TableHead>Merk</TableHead>
                      <TableHead>Kilometer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((vehicle) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="type-p2 font-mono font-semibold">
                          {vehicle.plateNumber}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="type-p2 font-medium text-foreground">
                            {vehicle.vehicleType}
                          </span>
                          {vehicle.modelName && (
                            <span className="type-p3 block text-muted-foreground">
                              {vehicle.modelName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="type-p2">
                          {vehicle.brand || "—"}
                        </TableCell>
                        <TableCell className="type-p2 tabular-nums">
                          {vehicle.odometerInitialized
                            ? `${vehicle.currentKilometer} km`
                            : "Belum diatur"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant[vehicle.status]}>
                            {statusLabels[vehicle.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage ? (
                            <div className="flex justify-end gap-1.5">
                              <ActionIconButton
                                type="button"
                                label={`Edit kendaraan ${vehicle.plateNumber}`}
                                tooltip="Edit Kendaraan"
                                icon={Pencil}
                                disabled={isPending}
                                onClick={() => openEditDialog(vehicle)}
                              />
                              <ActionIconButton
                                type="button"
                                label={`Edit KM ${vehicle.plateNumber}`}
                                tooltip="Edit Kilometer"
                                icon={Gauge}
                                disabled={isPending}
                                onClick={() => openKilometerDialog(vehicle)}
                              />
                              <ActionIconButton
                                type="button"
                                label={`Hapus kendaraan ${vehicle.plateNumber}`}
                                tooltip="Hapus Kendaraan"
                                icon={Trash2}
                                className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                disabled={
                                  isPending ||
                                  vehicle.status === "IN_USE" ||
                                  vehicle.status === "RESERVED"
                                }
                                onClick={() => setDeleteTarget(vehicle)}
                              />
                            </div>
                          ) : (
                            <span className="type-p2 text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <GlobalModal
          isOpen={dialogOpen}
          onClose={() => {
            if (!isPending) setDialogOpen(false);
          }}
          title={editingVehicle ? "Edit Kendaraan" : "Tambah Kendaraan"}
          description="Masukkan data armada untuk digunakan pada pengiriman internal."
          className="sm:max-w-xl"
          footer={
            <>
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
            </>
          }
        >
          <form
            key={editingVehicle?.id ?? "new-vehicle"}
            id="vehicle-form"
            className="space-y-4"
            onSubmit={submitVehicle}
          >
            <div className="space-y-1.5">
              <Label htmlFor="vf-plate" className="type-p2 font-medium">
                Nomor Plat <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vf-plate"
                name="plateNumber"
                required
                maxLength={20}
                placeholder="BL 1234 AB"
                defaultValue={editingVehicle?.plateNumber ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vf-type" className="type-p2 font-medium">
                Jenis Kendaraan <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vf-type"
                name="vehicleType"
                required
                maxLength={80}
                placeholder="Pick-up, Truk Engkel, Dump Truck"
                defaultValue={editingVehicle?.vehicleType ?? ""}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vf-brand" className="type-p2 font-medium">
                  Merk
                </Label>
                <Input
                  id="vf-brand"
                  name="brand"
                  maxLength={80}
                  placeholder="Toyota, Mitsubishi"
                  defaultValue={editingVehicle?.brand ?? ""}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vf-model" className="type-p2 font-medium">
                  Model
                </Label>
                <Input
                  id="vf-model"
                  name="modelName"
                  maxLength={80}
                  placeholder="Hilux 2.4"
                  defaultValue={editingVehicle?.modelName ?? ""}
                />
              </div>
            </div>

            {(!editingVehicle || !editingVehicle.odometerInitialized) && (
              <div className="space-y-1.5">
                <Label htmlFor="vf-km" className="type-p2 font-medium">
                  {editingVehicle ? "Inisialisasi KM Awal" : "KM Awal"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="vf-km"
                  name="initialKilometer"
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  defaultValue={editingVehicle?.currentKilometer ?? "0"}
                />
              </div>
            )}

            {editingVehicle && (
              <div className="space-y-1.5">
                <Label htmlFor="vf-status" className="type-p2 font-medium">
                  Status Ketersediaan
                </Label>
                <Select
                  value={formStatus}
                  onValueChange={(value) => {
                    if (isVehicleStatus(value)) setFormStatus(value);
                  }}
                >
                  <SelectTrigger id="vf-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>
        </GlobalModal>
      )}

      {canManage && (
        <GlobalModal
          isOpen={kilometerVehicle !== null}
          onClose={() => {
            if (!isPending) setKilometerVehicle(null);
          }}
          title="Edit Kilometer Kendaraan"
          description={
            kilometerVehicle
              ? `Perbarui odometer terakhir untuk ${kilometerVehicle.plateNumber}.`
              : undefined
          }
          className="sm:max-w-lg"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setKilometerVehicle(null)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                form="vehicle-kilometer-form"
                disabled={isPending}
              >
                {isPending ? "Menyimpan..." : "Simpan KM"}
              </Button>
            </>
          }
        >
          <form
            key={kilometerVehicle?.id ?? "km-form"}
            id="vehicle-kilometer-form"
            className="space-y-4"
            onSubmit={submitKilometer}
          >
            <div className="space-y-1.5">
              <Label htmlFor="vk-km" className="type-p2 font-medium">
                Kilometer Saat Ini
              </Label>
              <Input
                id="vk-km"
                name="kilometer"
                type="number"
                min="0"
                max="9999999999"
                step="0.001"
                required
                autoFocus
                defaultValue={kilometerVehicle?.currentKilometer ?? "0"}
              />
              <p className="type-p3 text-muted-foreground">
                Gunakan titik untuk nilai desimal, contoh: 18790.4 km.
              </p>
            </div>
            <p className="type-p3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
              Nilai ini menjadi acuan KM untuk pencatatan perjalanan berikutnya.
              Kendaraan yang terikat DO aktif tidak dapat diubah.
            </p>
          </form>
        </GlobalModal>
      )}

      {canManage && (
        <GlobalModal
          isOpen={deleteTarget !== null}
          onClose={() => {
            if (!isPending) setDeleteTarget(null);
          }}
          title="Hapus Kendaraan?"
          description={
            deleteTarget
              ? `Kendaraan ${deleteTarget.plateNumber} (${deleteTarget.vehicleType}) akan dihapus dari daftar armada.`
              : undefined
          }
          className="sm:max-w-md"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={confirmDeleteVehicle}
              >
                {isPending ? "Menghapus..." : "Hapus"}
              </Button>
            </>
          }
        >
          <p className="type-p2 text-muted-foreground">
            Pastikan kendaraan ini tidak memiliki tugas DO aktif.
          </p>
        </GlobalModal>
      )}
    </>
  );
}
