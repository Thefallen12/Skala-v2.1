"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  decimalStringFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";

const allowedRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.LOGISTICS,
  UserRole.KOORDINATOR,
  UserRole.FINANCE,
  UserRole.FIELD_TEAM,
];

export type RentalPeriodType = "DAILY" | "WEEKLY" | "MONTHLY";
export type RentalType = "EQUIPMENT" | "VEHICLE";
export type RentalStatus = "ACTIVE" | "COMPLETED" | "EXTENDED" | "CANCELLED";

export type RentalItemRow = {
  id: string;
  type: RentalType;
  name: string;
  category: string | null;
  codeOrPlate: string | null;
  vendorName: string;
  vendorPhone: string | null;
  rentalPeriodType: RentalPeriodType;
  startDate: string;
  endDate: string;
  duration: number;
  ratePerPeriod: string;
  additionalCost: string;
  totalCost: string;
  status: RentalStatus;
  withOperator: boolean;
  operatorName: string | null;
  withFuel: boolean;
  projectId: string | null;
  projectName: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
};

const rentalInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["EQUIPMENT", "VEHICLE"]),
  name: z.string().trim().min(1, "Nama alat / kendaraan wajib diisi."),
  category: z.string().trim().optional().nullable(),
  codeOrPlate: z.string().trim().optional().nullable(),
  vendorName: z.string().trim().min(1, "Nama vendor / pemilik sewa wajib diisi."),
  vendorPhone: z.string().trim().optional().nullable(),
  rentalPeriodType: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  startDate: z.string().min(10, "Tanggal mulai sewa wajib diisi."),
  endDate: z.string().min(10, "Tanggal selesai sewa wajib diisi."),
  duration: z.coerce.number().positive("Durasi harus lebih dari 0."),
  ratePerPeriod: z.coerce.number().min(0, "Biaya sewa tidak boleh negatif."),
  additionalCost: z.coerce.number().min(0).default(0),
  totalCost: z.coerce.number().min(0),
  status: z.enum(["ACTIVE", "COMPLETED", "EXTENDED", "CANCELLED"]).default("ACTIVE"),
  withOperator: z.boolean().default(false),
  operatorName: z.string().trim().optional().nullable(),
  withFuel: z.boolean().default(false),
  projectId: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type RentalInput = z.infer<typeof rentalInputSchema>;

export type RentalActionResult = {
  success: boolean;
  message: string;
  id?: string;
};

export async function getRentals(filters?: {
  type?: RentalType;
  status?: RentalStatus;
  projectId?: string;
}): Promise<RentalItemRow[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const where: Record<string, unknown> = {};
  if (filters?.type) where.type = filters.type;
  if (filters?.status) where.status = filters.status;
  if (filters?.projectId) where.projectId = filters.projectId;

  const rentals = await prisma.equipmentRental.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          kelompokTani: true,
        },
      },
    },
  });

  return rentals.map((r) => ({
    id: r.id,
    type: r.type as RentalType,
    name: r.name,
    category: r.category,
    codeOrPlate: r.codeOrPlate,
    vendorName: r.vendorName,
    vendorPhone: r.vendorPhone,
    rentalPeriodType: r.rentalPeriodType as RentalPeriodType,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    duration: r.duration,
    ratePerPeriod: decimalStringFromScaledInteger(r.ratePerPeriod),
    additionalCost: decimalStringFromScaledInteger(r.additionalCost),
    totalCost: decimalStringFromScaledInteger(r.totalCost),
    status: r.status as RentalStatus,
    withOperator: r.withOperator,
    operatorName: r.operatorName,
    withFuel: r.withFuel,
    projectId: r.projectId,
    projectName: r.project
      ? `${r.project.kelompokTani} · ${r.project.title}`
      : null,
    notes: r.notes,
    createdByName: r.createdByName,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveRental(
  rawInput: unknown,
): Promise<RentalActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }

  if (!allowedRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin untuk mengelola data sewa.",
    };
  }

  const parsed = rentalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Data sewa tidak valid.";
    return { success: false, message: firstIssue };
  }

  const data = parsed.data;

  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, message: "Format tanggal tidak valid." };
  }

  if (end < start) {
    return {
      success: false,
      message: "Tanggal selesai sewa tidak boleh mendahului tanggal mulai sewa.",
    };
  }

  const ratePerPeriodScaled = scaledIntegerFromDecimal(data.ratePerPeriod);
  const additionalCostScaled = scaledIntegerFromDecimal(data.additionalCost);
  const totalCostScaled = scaledIntegerFromDecimal(data.totalCost);

  try {
    if (data.id) {
      const existing = await prisma.equipmentRental.findUnique({
        where: { id: data.id },
      });
      if (!existing) {
        return { success: false, message: "Data sewa tidak ditemukan." };
      }

      const updated = await prisma.equipmentRental.update({
        where: { id: data.id },
        data: {
          type: data.type,
          name: data.name,
          category: data.category || null,
          codeOrPlate: data.codeOrPlate || null,
          vendorName: data.vendorName,
          vendorPhone: data.vendorPhone || null,
          rentalPeriodType: data.rentalPeriodType,
          startDate: start,
          endDate: end,
          duration: data.duration,
          ratePerPeriod: ratePerPeriodScaled,
          additionalCost: additionalCostScaled,
          totalCost: totalCostScaled,
          status: data.status,
          withOperator: data.withOperator,
          operatorName: data.operatorName || null,
          withFuel: data.withFuel,
          projectId: data.projectId || null,
          notes: data.notes || null,
        },
      });

      revalidatePath("/apps/logistics");
      return {
        success: true,
        message: "Data sewa berhasil diperbarui.",
        id: updated.id,
      };
    } else {
      const created = await prisma.equipmentRental.create({
        data: {
          type: data.type,
          name: data.name,
          category: data.category || null,
          codeOrPlate: data.codeOrPlate || null,
          vendorName: data.vendorName,
          vendorPhone: data.vendorPhone || null,
          rentalPeriodType: data.rentalPeriodType,
          startDate: start,
          endDate: end,
          duration: data.duration,
          ratePerPeriod: ratePerPeriodScaled,
          additionalCost: additionalCostScaled,
          totalCost: totalCostScaled,
          status: data.status,
          withOperator: data.withOperator,
          operatorName: data.operatorName || null,
          withFuel: data.withFuel,
          projectId: data.projectId || null,
          notes: data.notes || null,
          createdById: session.user.id,
          createdByName: session.user.name || null,
        },
      });

      revalidatePath("/apps/logistics");
      return {
        success: true,
        message: "Pencatatan sewa berhasil disimpan.",
        id: created.id,
      };
    }
  } catch (error) {
    console.error("Save rental error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal menyimpan data sewa.",
    };
  }
}

export async function deleteRental(id: string): Promise<RentalActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan login terlebih dahulu." };
  }

  const deleteRoles: UserRole[] = [
    UserRole.ADMINISTRATIONS,
    UserRole.DIRECTOR,
    UserRole.DEPUTY_DIRECTOR,
    UserRole.LOGISTICS,
  ];

  if (!deleteRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak memiliki izin untuk menghapus data sewa.",
    };
  }

  try {
    await prisma.equipmentRental.delete({
      where: { id },
    });
    revalidatePath("/apps/logistics");
    return { success: true, message: "Data sewa berhasil dihapus." };
  } catch (error) {
    console.error("Delete rental error:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal menghapus data sewa.",
    };
  }
}
