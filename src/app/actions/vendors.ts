"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  parseVendorBankAccounts,
  type VendorBankAccountInput,
} from "@/lib/vendor-bank-accounts";

type VendorInput = {
  name: string;
  category: string;
  address?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  bankAccounts?: VendorBankAccountInput[];
};

export type VendorActionResult = {
  success: boolean;
  message: string;
  vendor?: {
    id: string;
    name: string;
    bankName: string | null;
    bankAccount: string | null;
    bankHolder: string | null;
    bankAccounts: Array<{
      id: string;
      label: string | null;
      bankName: string;
      bankAccount: string;
      bankHolder: string;
      isPrimary: boolean;
    }>;
  };
};

const failure = (message: string): VendorActionResult => ({
  success: false,
  message,
});

const validOptionalText = (value: unknown, maxLength: number) =>
  value === undefined ||
  (typeof value === "string" && value.trim().length <= maxLength);

export async function createVendor(
  input: VendorInput,
): Promise<VendorActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.ADMINISTRATIONS &&
      session.user.role !== UserRole.DIRECTOR &&
      session.user.role !== UserRole.DEPUTY_DIRECTOR)
  ) {
    return failure("Hanya Logistik, Administrasi, atau Direktur yang dapat menambahkan vendor.");
  }
  if (
    !input ||
    typeof input.name !== "string" ||
    input.name.trim().length < 2 ||
    input.name.trim().length > 180 ||
    typeof input.category !== "string" ||
    input.category.trim().length < 2 ||
    input.category.trim().length > 100 ||
    !validOptionalText(input.address, 500) ||
    !validOptionalText(input.phone, 60) ||
    !validOptionalText(input.email, 180) ||
    !validOptionalText(input.bankName, 120) ||
    !validOptionalText(input.bankAccount, 80) ||
    !validOptionalText(input.bankHolder, 180)
  ) {
    return failure("Data vendor tidak valid. Periksa kembali informasi yang diisi.");
  }
  const bankAccounts = parseVendorBankAccounts(input.bankAccounts, input);
  if (!bankAccounts) {
    return failure(
      "Setiap rekening harus memiliki nama bank, nomor rekening, dan nama pemilik yang valid.",
    );
  }
  const primaryAccount = bankAccounts.find((account) => account.isPrimary);

  let vendor: NonNullable<VendorActionResult["vendor"]>;
  try {
    vendor = await prisma.vendor.create({
      data: {
        code: `VND-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        name: input.name.trim(),
        category: input.category.trim(),
        address: input.address?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        bankName: primaryAccount?.bankName ?? null,
        bankAccount: primaryAccount?.bankAccount ?? null,
        bankHolder: primaryAccount?.bankHolder ?? null,
        bankAccounts: {
          create: bankAccounts.map((account) => ({
            ...account,
            label: account.label || null,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        bankName: true,
        bankAccount: true,
        bankHolder: true,
        bankAccounts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            label: true,
            bankName: true,
            bankAccount: true,
            bankHolder: true,
            isPrimary: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Vendor creation failed:", error);
    return failure("Vendor gagal disimpan. Periksa data lalu coba kembali.");
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/approvals");
  revalidatePath("/api/vendors");
  return {
    success: true,
    message: "Vendor baru berhasil disimpan.",
    vendor,
  };
}

export async function updateVendor(
  vendorId: string,
  input: VendorInput,
): Promise<VendorActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    (session.user.role !== UserRole.LOGISTICS &&
      session.user.role !== UserRole.ADMINISTRATIONS &&
      session.user.role !== UserRole.DIRECTOR &&
      session.user.role !== UserRole.DEPUTY_DIRECTOR)
  ) {
    return failure("Hanya Logistik, Administrasi, atau Direktur yang dapat mengubah vendor.");
  }
  if (
    typeof vendorId !== "string" ||
    vendorId.trim().length === 0 ||
    vendorId.length > 64 ||
    !input ||
    typeof input.name !== "string" ||
    input.name.trim().length < 2 ||
    input.name.trim().length > 180 ||
    typeof input.category !== "string" ||
    input.category.trim().length < 2 ||
    input.category.trim().length > 100 ||
    !validOptionalText(input.address, 500) ||
    !validOptionalText(input.phone, 60) ||
    !validOptionalText(input.email, 180) ||
    !validOptionalText(input.bankName, 120) ||
    !validOptionalText(input.bankAccount, 80) ||
    !validOptionalText(input.bankHolder, 180)
  ) {
    return failure("Data vendor tidak valid. Periksa kembali informasi yang diisi.");
  }
  const bankAccounts = parseVendorBankAccounts(input.bankAccounts, input);
  if (!bankAccounts) {
    return failure(
      "Setiap rekening harus memiliki nama bank, nomor rekening, dan nama pemilik yang valid.",
    );
  }
  const primaryAccount = bankAccounts.find((account) => account.isPrimary);

  let vendor: NonNullable<VendorActionResult["vendor"]>;
  try {
    vendor = await prisma.$transaction(async (transaction) => {
      await transaction.vendor.update({
        where: { id: vendorId },
        data: {
          name: input.name.trim(),
          category: input.category.trim(),
          address: input.address?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          bankName: primaryAccount?.bankName ?? null,
          bankAccount: primaryAccount?.bankAccount ?? null,
          bankHolder: primaryAccount?.bankHolder ?? null,
        },
      });
      await transaction.vendorBankAccount.deleteMany({ where: { vendorId } });
      if (bankAccounts.length > 0) {
        await transaction.vendorBankAccount.createMany({
          data: bankAccounts.map((account) => ({
            ...account,
            label: account.label || null,
            vendorId,
          })),
        });
      }
      const updatedVendor = await transaction.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          name: true,
          bankName: true,
          bankAccount: true,
          bankHolder: true,
          bankAccounts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              label: true,
              bankName: true,
              bankAccount: true,
              bankHolder: true,
              isPrimary: true,
            },
          },
        },
      });
      if (!updatedVendor) throw new Error("Vendor tidak ditemukan.");
      return updatedVendor;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return failure("Vendor tidak ditemukan.");
    }
    console.error("Vendor update failed:", error);
    return failure("Vendor gagal diperbarui. Periksa data lalu coba kembali.");
  }

  revalidatePath("/apps/logistics");
  revalidatePath("/apps/logistics/stock");
  revalidatePath("/apps/approvals");
  revalidatePath("/apps/finance");
  revalidatePath("/api/vendors");
  return {
    success: true,
    message: "Data vendor berhasil diperbarui.",
    vendor,
  };
}

export async function updateVendorRating(
  vendorId: string,
  rating: number,
): Promise<VendorActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.DIRECTOR) {
    return failure("Hanya Direktur yang dapat mengubah rating vendor.");
  }
  if (
    typeof vendorId !== "string" ||
    vendorId.length === 0 ||
    vendorId.length > 64 ||
    typeof rating !== "number" ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return failure("Rating vendor harus berada di antara 1 sampai 5.");
  }

  try {
    const updated = await prisma.vendor.updateMany({
      where: { id: vendorId },
      data: { rating },
    });
    if (updated.count !== 1) {
      return failure("Vendor tidak ditemukan.");
    }
  } catch (error) {
    console.error("Vendor rating update failed:", error);
    return failure("Rating vendor gagal diperbarui. Silakan coba kembali.");
  }

  revalidatePath("/apps/approvals");
  revalidatePath("/apps/logistics");
  revalidatePath("/api/vendors");
  return { success: true, message: "Rating vendor berhasil diperbarui." };
}
