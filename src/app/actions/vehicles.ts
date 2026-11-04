"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  decimalStringFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";

export type VehicleStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "IN_USE"
  | "MAINTENANCE";

export type VehicleInput = {
  plateNumber: string;
  vehicleType: string;
  brand?: string;
  modelName?: string;
  initialKilometer?: number;
  status?: VehicleStatus;
};

export type VehicleSummary = {
  id: string;
  plateNumber: string;
  vehicleType: string;
  brand: string | null;
  modelName: string | null;
  currentKilometer: string;
  odometerInitialized: boolean;
  status: VehicleStatus;
};

export type VehicleActionResult = {
  success: boolean;
  message: string;
  vehicles?: VehicleSummary[];
};

const vehicleStatuses: VehicleStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "IN_USE",
  "MAINTENANCE",
];

function isVehicleStatus(status: string): status is VehicleStatus {
  return vehicleStatuses.some((candidate) => candidate === status);
}

function isVehicleManager(role: UserRole) {
  return role === UserRole.LOGISTICS || role === UserRole.ADMINISTRATIONS;
}

function validateVehicleInput(input: VehicleInput) {
  return (
    typeof input.plateNumber === "string" &&
    /^[A-Z0-9][A-Z0-9 .-]{1,19}$/.test(input.plateNumber.trim().toUpperCase()) &&
    typeof input.vehicleType === "string" &&
    input.vehicleType.trim().length > 0 &&
    input.vehicleType.trim().length <= 80 &&
    (input.brand === undefined ||
      (typeof input.brand === "string" && input.brand.trim().length <= 80)) &&
    (input.modelName === undefined ||
      (typeof input.modelName === "string" &&
        input.modelName.trim().length <= 80)) &&
    (input.initialKilometer === undefined ||
      (typeof input.initialKilometer === "number" &&
        Number.isFinite(input.initialKilometer) &&
        input.initialKilometer >= 0 &&
        input.initialKilometer <= 9_999_999_999 &&
        Number(input.initialKilometer.toFixed(2)) === input.initialKilometer)) &&
    (input.status === undefined || vehicleStatuses.includes(input.status))
  );
}

function toVehicleSummary(vehicle: {
  id: string;
  plateNumber: string;
  vehicleType: string;
  brand: string | null;
  modelName: string | null;
  currentKilometer: bigint;
  odometerInitialized: boolean;
  status: string;
}): VehicleSummary {
  return {
    ...vehicle,
    currentKilometer: decimalStringFromScaledInteger(
      vehicle.currentKilometer,
    ),
    status: isVehicleStatus(vehicle.status) ? vehicle.status : "MAINTENANCE",
  };
}

export async function getAvailableVehicles(): Promise<VehicleActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== UserRole.MOVER) {
    return { success: false, message: "Akses hanya tersedia untuk Mover." };
  }

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { status: "AVAILABLE", odometerInitialized: true },
      orderBy: { plateNumber: "asc" },
      select: {
        id: true,
        plateNumber: true,
        vehicleType: true,
        brand: true,
        modelName: true,
        currentKilometer: true,
        odometerInitialized: true,
        status: true,
      },
    });
    return {
      success: true,
      message: "Daftar kendaraan tersedia.",
      vehicles: vehicles.map(toVehicleSummary),
    };
  } catch (error) {
    console.error("Load available vehicles failed:", error);
    return {
      success: false,
      message: "Daftar kendaraan gagal dimuat. Silakan coba kembali.",
    };
  }
}

export async function addVehicle(
  input: VehicleInput,
): Promise<VehicleActionResult> {
  const session = await auth();
  if (!session?.user || !isVehicleManager(session.user.role)) {
    return {
      success: false,
      message: "Anda tidak memiliki akses untuk mengelola armada.",
    };
  }
  if (!input || !validateVehicleInput(input)) {
    return { success: false, message: "Data kendaraan tidak valid." };
  }

  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: input.plateNumber.trim().toUpperCase(),
        vehicleType: input.vehicleType.trim(),
        brand: input.brand?.trim() || null,
        modelName: input.modelName?.trim() || null,
        currentKilometer: scaledIntegerFromDecimal(
          input.initialKilometer ?? 0,
        ),
        odometerInitialized: true,
        status: input.status ?? "AVAILABLE",
      },
      select: {
        id: true,
        plateNumber: true,
        vehicleType: true,
        brand: true,
        modelName: true,
        currentKilometer: true,
        odometerInitialized: true,
        status: true,
      },
    });
    revalidatePath("/apps/logistics");
    return {
      success: true,
      message: "Kendaraan berhasil ditambahkan.",
      vehicles: [toVehicleSummary(vehicle)],
    };
  } catch (error) {
    console.error("Create vehicle failed:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { success: false, message: "Nomor plat tersebut sudah terdaftar." };
    }
    return {
      success: false,
      message: "Kendaraan gagal ditambahkan. Silakan coba kembali.",
    };
  }
}

export async function updateVehicle(
  id: string,
  input: VehicleInput,
): Promise<VehicleActionResult> {
  const session = await auth();
  if (!session?.user || !isVehicleManager(session.user.role)) {
    return {
      success: false,
      message: "Anda tidak memiliki akses untuk mengelola armada.",
    };
  }
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > 64 ||
    !input ||
    !validateVehicleInput(input)
  ) {
    return { success: false, message: "Data kendaraan tidak valid." };
  }

  try {
    const updated = await prisma.$transaction(
      async (transaction) => {
        const inTransitOrder = await transaction.deliveryOrder.findFirst({
            where: {
              vehicleId: id,
              status: { in: ["PENDING", "IN_TRANSIT"] },
            },
            select: { id: true },
          });
          if (inTransitOrder) {
            throw new Error(
              "Data kendaraan tidak dapat diubah selama terikat pada DO aktif.",
          );
        }

        let initialKilometerUpdate = {};
        if (input.initialKilometer !== undefined) {
          const existingVehicle = await transaction.vehicle.findUnique({
            where: { id },
            select: {
              odometerInitialized: true,
              tripLogs: { select: { id: true }, take: 1 },
            },
          });
          if (!existingVehicle) return { count: 0 };
          if (
            existingVehicle.odometerInitialized ||
            existingVehicle.tripLogs.length > 0 ||
            inTransitOrder ||
            (input.status ?? "AVAILABLE") !== "AVAILABLE"
          ) {
            throw new Error(
              "Odometer awal hanya dapat diatur sebelum kendaraan memiliki log perjalanan.",
            );
          }
          initialKilometerUpdate = {
            currentKilometer: input.initialKilometer.toString(),
            odometerInitialized: true,
          };
        }

        return transaction.vehicle.updateMany({
          where: { id },
          data: {
            plateNumber: input.plateNumber.trim().toUpperCase(),
            vehicleType: input.vehicleType.trim(),
            brand: input.brand?.trim() || null,
            modelName: input.modelName?.trim() || null,
            ...initialKilometerUpdate,
            status: input.status ?? "AVAILABLE",
          },
        });
      },
    );
    if (updated.count !== 1) {
      return { success: false, message: "Kendaraan tidak ditemukan." };
    }
    revalidatePath("/apps/logistics");
    return { success: true, message: "Data kendaraan berhasil diperbarui." };
  } catch (error) {
    console.error("Update vehicle failed:", error);
    if (
      error instanceof Error &&
      (error.message.startsWith("Data kendaraan tidak dapat diubah") ||
        error.message.startsWith("Odometer awal"))
    ) {
      return { success: false, message: error.message };
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { success: false, message: "Nomor plat tersebut sudah terdaftar." };
    }
    return {
      success: false,
      message: "Data kendaraan gagal diperbarui. Silakan coba kembali.",
    };
  }
}

export async function deleteVehicle(
  id: string,
): Promise<VehicleActionResult> {
  const session = await auth();
  if (!session?.user || !isVehicleManager(session.user.role)) {
    return {
      success: false,
      message: "Anda tidak memiliki akses untuk mengelola armada.",
    };
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    return { success: false, message: "ID kendaraan tidak valid." };
  }

  try {
    const deleted = await prisma.vehicle.deleteMany({
      where: {
        id,
        status: { notIn: ["IN_USE", "RESERVED"] },
        deliveryOrders: { none: { status: { in: ["PENDING", "IN_TRANSIT"] } } },
        tripLogs: { none: {} },
      },
    });
    if (deleted.count !== 1) {
      return {
        success: false,
        message:
          "Kendaraan tidak ditemukan, terikat DO aktif, sedang digunakan, atau memiliki riwayat perjalanan.",
      };
    }
    revalidatePath("/apps/logistics");
    return { success: true, message: "Kendaraan berhasil dihapus." };
  } catch (error) {
    console.error("Delete vehicle failed:", error);
    return {
      success: false,
      message: "Kendaraan gagal dihapus. Silakan coba kembali.",
    };
  }
}
