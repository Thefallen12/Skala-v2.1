"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { DOStatus, UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import { VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER } from "@/lib/vehicle-fuel";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";

export type VehicleTripLogInput = {
  vehicleId: string;
  projectId: string;
  deliveryOrderId?: string;
  kilometerStart: number;
  kilometerEnd: number;
};

export type VehicleTripActionResult = {
  success: boolean;
  message: string;
};

const fail = (message: string): VehicleTripActionResult => ({
  success: false,
  message,
});

function isValidKilometer(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 9_999_999_999 &&
    Number(value.toFixed(3)) === value
  );
}

export async function createVehicleTripLog(
  input: VehicleTripLogInput,
): Promise<VehicleTripActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.MOVER &&
      session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.ADMINISTRATIONS)
  ) {
    return fail("Anda tidak memiliki akses untuk mencatat perjalanan kendaraan.");
  }
  if (
    !input ||
    typeof input.vehicleId !== "string" ||
    input.vehicleId.length === 0 ||
    input.vehicleId.length > 64 ||
    typeof input.projectId !== "string" ||
    input.projectId.length === 0 ||
    input.projectId.length > 64 ||
    (input.deliveryOrderId !== undefined &&
      (typeof input.deliveryOrderId !== "string" ||
        input.deliveryOrderId.length > 64)) ||
    !isValidKilometer(input.kilometerStart) ||
    !isValidKilometer(input.kilometerEnd) ||
    input.kilometerEnd < input.kilometerStart
  ) {
    return fail("Data perjalanan tidak valid. Periksa kendaraan, proyek, dan KM.");
  }

  const kilometerStart = new Prisma.Decimal(input.kilometerStart.toString());
  const kilometerEnd = new Prisma.Decimal(input.kilometerEnd.toString());
  const distanceKm = kilometerEnd.minus(kilometerStart);
  const fuelLiter = distanceKm
    .div(VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  try {
    await prisma.$transaction(
      async (transaction) => {
        const vehicle = await transaction.vehicle.findUnique({
          where: { id: input.vehicleId },
          select: {
            id: true,
            plateNumber: true,
            status: true,
            currentKilometer: true,
            odometerInitialized: true,
          },
        });
        if (!vehicle) throw new Error("Kendaraan tidak ditemukan.");
        if (!vehicle.odometerInitialized) {
          throw new Error("KM awal kendaraan belum diinisialisasi oleh Logistik.");
        }
        if (vehicle.status !== "AVAILABLE") {
          throw new Error("Kendaraan harus berstatus tersedia untuk mencatat log.");
        }
        if (
          !decimalFromScaledInteger(vehicle.currentKilometer).equals(
            kilometerStart,
          )
        ) {
          throw new Error(
            `KM awal harus sama dengan odometer terakhir (${decimalStringFromScaledInteger(vehicle.currentKilometer)} km).`,
          );
        }

        if (input.deliveryOrderId) {
          const order = await transaction.deliveryOrder.findUnique({
            where: { id: input.deliveryOrderId },
            select: {
              id: true,
              status: true,
              vehicleId: true,
              vehiclePlateNumber: true,
              vehicleTripLog: { select: { id: true } },
              ticket: { select: { projectId: true } },
              po: { select: { ticket: { select: { projectId: true } } } },
            },
          });
          if (!order || order.status !== DOStatus.DELIVERED) {
            throw new Error("DO terkait harus sudah berstatus selesai.");
          }
          if (
            (order.vehicleId && order.vehicleId !== vehicle.id) ||
            (!order.vehicleId &&
              order.vehiclePlateNumber !== vehicle.plateNumber)
          ) {
            throw new Error("Kendaraan tidak sesuai dengan kendaraan pada DO.");
          }
          const orderProjectId =
            order.ticket?.projectId ?? order.po?.ticket?.projectId;
          if (orderProjectId && orderProjectId !== input.projectId) {
            throw new Error("Proyek harus sesuai dengan proyek pada DO.");
          }
          if (order.vehicleTripLog) {
            throw new Error("DO tersebut sudah memiliki log perjalanan.");
          }
        }

        const updatedVehicle = await transaction.vehicle.updateMany({
          where: {
            id: vehicle.id,
            status: "AVAILABLE",
            currentKilometer: scaledIntegerFromDecimal(kilometerStart),
          },
          data: {
            currentKilometer: scaledIntegerFromDecimal(kilometerEnd),
          },
        });
        if (updatedVehicle.count !== 1) {
          throw new Error("Odometer berubah. Muat ulang halaman dan coba kembali.");
        }

        await transaction.vehicleTripLog.create({
          data: {
            vehicleId: vehicle.id,
            deliveryOrderId: input.deliveryOrderId || null,
            projectId: input.projectId,
            kilometerStart: scaledIntegerFromDecimal(kilometerStart),
            kilometerEnd: scaledIntegerFromDecimal(kilometerEnd),
            distanceKm: scaledIntegerFromDecimal(distanceKm),
            fuelLiter: scaledIntegerFromDecimal(fuelLiter),
            fuelEfficiencyKmPerL: scaledIntegerFromDecimal(
              VEHICLE_FUEL_EFFICIENCY_KM_PER_LITER,
            ),
            createdById: session.user.id,
          },
        });
      },
    );
  } catch (error) {
    console.error("Vehicle trip log creation failed:", error);
    if (
      error instanceof Error &&
      (error.message.startsWith("Kendaraan") ||
        error.message.startsWith("KM awal") ||
        error.message.startsWith("DO terkait") ||
        error.message.startsWith("Proyek harus") ||
        error.message.startsWith("Odometer berubah"))
    ) {
      return fail(error.message);
    }
    return fail("Log perjalanan gagal disimpan. Silakan coba kembali.");
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  return {
    success: true,
    message: `Log perjalanan tersimpan: ${distanceKm.toString()} km, estimasi BBM ${fuelLiter.toString()} liter.`,
  };
}
