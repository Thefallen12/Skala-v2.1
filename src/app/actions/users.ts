"use server";

import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { canManageUsers, userManagerRoles } from "@/lib/user-access";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  isManagedUserProfilePhotoUrl,
  removeUserProfilePhoto,
  saveUserProfilePhoto,
  ProfilePhotoValidationError,
  type SavedUserProfilePhoto,
} from "@/lib/user-profile-photos";

export type AccountActionResult = {
  success: boolean;
  message: string;
};

function isUserRole(value: string): value is UserRole {
  return Object.values(UserRole).some((role) => role === value);
}

async function requireUserManager() {
  const session = await auth();
  if (!session?.user || !canManageUsers(session.user.role)) {
    return null;
  }

  const manager = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true },
  });
  if (
    !manager ||
    !canManageUsers(manager.role) ||
    !manager.isActive
  ) {
    return null;
  }
  return manager;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function updateUserRole(
  userId: string,
  value: string,
): Promise<AccountActionResult> {
  const manager = await requireUserManager();
  if (!manager) {
    return { success: false, message: "Akses administrator atau Direktur diperlukan." };
  }
  if (!userId || !isUserRole(value)) {
    return { success: false, message: "Data pengguna atau role tidak valid." };
  }
  if (userId === manager.id) {
    return {
      success: false,
      message: "Role akun yang sedang digunakan tidak dapat diubah.",
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) {
    return { success: false, message: "Akun tidak ditemukan." };
  }
  if (
    target.isActive &&
    canManageUsers(target.role) &&
    !canManageUsers(value)
  ) {
    const otherActiveManagers = await prisma.user.count({
      where: {
        id: { not: target.id },
        role: { in: [...userManagerRoles] },
        isActive: true,
      },
    });
    if (otherActiveManagers === 0) {
      return {
        success: false,
        message: "Role administrator/Direktur aktif terakhir tidak dapat dihapus.",
      };
    }
  }

  try {
    await prisma.user.update({
      where: { id: target.id },
      data: { role: value },
    });
  } catch (error) {
    console.error("User role update failed:", error);
    return { success: false, message: "Role akun gagal diperbarui." };
  }

  revalidatePath("/apps/settings");
  return { success: true, message: "Role akun berhasil diperbarui." };
}

export async function updateUserDetails(
  userId: string,
  details: {
    name: string;
    email: string;
    phone: string;
    profilePhotoUrl: string;
    role: string;
    isActive: boolean;
    profilePhotoFile?: File | null;
  },
): Promise<AccountActionResult> {
  const manager = await requireUserManager();
  if (!manager) {
    return { success: false, message: "Akses administrator atau Direktur diperlukan." };
  }
  if (
    typeof userId !== "string" ||
    !details ||
    typeof details !== "object" ||
    typeof details.name !== "string" ||
    typeof details.email !== "string" ||
    typeof details.phone !== "string" ||
    typeof details.profilePhotoUrl !== "string" ||
    typeof details.role !== "string" ||
    typeof details.isActive !== "boolean" ||
    (details.profilePhotoFile != null &&
      !(details.profilePhotoFile instanceof File))
  ) {
    return { success: false, message: "Data akun tidak valid." };
  }
  const name = details.name.trim();
  const email = details.email.trim().toLowerCase();
  const phone = details.phone.trim();
  const profilePhotoUrl = details.profilePhotoUrl.trim() || null;
  if (
    !userId ||
    name.length < 2 ||
    name.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.length > 32 ||
    (phone.length > 0 && !/^[+()\d\s.-]+$/.test(phone)) ||
    (profilePhotoUrl !== null && profilePhotoUrl.length > 2048) ||
    !isUserRole(details.role)
  ) {
    return { success: false, message: "Data akun tidak valid." };
  }
  if (userId === manager.id && (!details.isActive || details.role !== manager.role)) {
    return {
      success: false,
      message: "Status atau role akun yang sedang digunakan tidak dapat diubah.",
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      profilePhotoUrl: true,
    },
  });
  if (!target) {
    return { success: false, message: "Akun tidak ditemukan." };
  }
  const photoFile =
    details.profilePhotoFile instanceof File && details.profilePhotoFile.size > 0
      ? details.profilePhotoFile
      : null;
  let newPhoto: SavedUserProfilePhoto | null = null;
  let savedProfilePhotoUrl = profilePhotoUrl;
  if (
    target.isActive &&
    canManageUsers(target.role) &&
    (!details.isActive || !canManageUsers(details.role))
  ) {
    const otherActiveManagers = await prisma.user.count({
      where: {
        id: { not: target.id },
        role: { in: [...userManagerRoles] },
        isActive: true,
      },
    });
    if (otherActiveManagers === 0) {
      return {
        success: false,
        message: "Administrator/Direktur aktif terakhir tidak dapat dinonaktifkan atau diturunkan role.",
      };
    }
  }

  if (photoFile) {
    try {
      newPhoto = await saveUserProfilePhoto(photoFile);
      savedProfilePhotoUrl = newPhoto.url;
    } catch (error) {
      if (error instanceof ProfilePhotoValidationError) {
        return { success: false, message: error.message };
      }
      console.error("Uploading managed user profile photo failed:", error);
      return { success: false, message: "Foto profil gagal diunggah." };
    }
  }
  const profilePhotoChanged = savedProfilePhotoUrl !== target.profilePhotoUrl;
  if (
    profilePhotoChanged &&
    savedProfilePhotoUrl &&
    !isManagedUserProfilePhotoUrl(savedProfilePhotoUrl)
  ) {
    if (newPhoto) await removeUserProfilePhoto(newPhoto.url);
    return { success: false, message: "Foto profil Cloudinary tidak valid." };
  }

  try {
    await prisma.user.update({
      where: { id: target.id },
      data: {
        name,
        email,
        phone: phone || null,
        role: details.role,
        isActive: details.isActive,
        profilePhotoUrl: savedProfilePhotoUrl,
      },
    });
  } catch (error) {
    if (newPhoto) {
      try {
        await removeUserProfilePhoto(newPhoto.url);
      } catch (cleanupError) {
        console.error("Removing unattached managed user photo failed:", cleanupError);
      }
    }
    if (error instanceof ProfilePhotoValidationError) {
      return { success: false, message: error.message };
    }
    if (isUniqueConstraintError(error)) {
      return { success: false, message: "Email tersebut sudah digunakan akun lain." };
    }
    console.error("User details update failed:", error);
    return { success: false, message: "Data akun gagal diperbarui." };
  }

  let successMessage = "Data akun berhasil diperbarui.";
  if (profilePhotoChanged && target.profilePhotoUrl) {
    try {
      await removeUserProfilePhoto(target.profilePhotoUrl);
    } catch (error) {
      console.error("Previous managed user photo cleanup failed:", error);
      successMessage =
        "Data akun diperbarui, tetapi foto profil lama gagal dibersihkan.";
    }
  }

  revalidatePath("/apps/settings");
  revalidatePath("/(DashboardLayout)", "layout");
  return { success: true, message: successMessage };
}

export async function deleteUser(
  userId: string,
): Promise<AccountActionResult> {
  const manager = await requireUserManager();
  if (!manager) {
    return { success: false, message: "Akses administrator atau Direktur diperlukan." };
  }
  if (typeof userId !== "string" || !userId || userId === manager.id) {
    return {
      success: false,
      message: "Akun yang sedang digunakan tidak dapat dihapus.",
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) {
    return { success: false, message: "Akun tidak ditemukan." };
  }
  if (target.isActive && canManageUsers(target.role)) {
    const otherActiveManagers = await prisma.user.count({
      where: {
        id: { not: target.id },
        role: { in: [...userManagerRoles] },
        isActive: true,
      },
    });
    if (otherActiveManagers === 0) {
      return {
        success: false,
        message: "Administrator/Direktur aktif terakhir tidak dapat dihapus.",
      };
    }
  }

  const linkedData = await prisma.user.findUnique({
    where: { id: target.id },
    select: {
      _count: {
        select: {
          CalendarEvent: true,
          MaterialRequest_MaterialRequest_approverIdToUser: true,
          MaterialRequest_MaterialRequest_requesterIdToUser: true,
          Session: true,
          tickets: true,
          ticketAuditLogs: true,
          assignedProjects: true,
          proposedWorkPointWages: true,
          approvedWorkPointWages: true,
          habits: true,
        },
      },
    },
  });
  if (linkedData && Object.values(linkedData._count).some((count) => count > 0)) {
    return {
      success: false,
      message:
        "Akun masih terkait dengan data operasional. Nonaktifkan akun agar riwayat tetap tersimpan.",
    };
  }

  try {
    await prisma.user.delete({ where: { id: target.id } });
  } catch (error) {
    console.error("User deletion failed:", error);
    return {
      success: false,
      message:
        "Akun tidak dapat dihapus karena masih terkait dengan data operasional. Nonaktifkan akun sebagai gantinya.",
    };
  }

  revalidatePath("/apps/settings");
  return { success: true, message: "Akun berhasil dihapus." };
}

export async function updateUserStatus(
  userId: string,
  isActive: boolean,
): Promise<AccountActionResult> {
  const manager = await requireUserManager();
  if (!manager) {
    return { success: false, message: "Akses administrator atau Direktur diperlukan." };
  }
  if (!userId || typeof isActive !== "boolean") {
    return { success: false, message: "Data status akun tidak valid." };
  }
  if (userId === manager.id && !isActive) {
    return {
      success: false,
      message: "Akun pengelola yang sedang digunakan tidak dapat dinonaktifkan.",
    };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) {
    return { success: false, message: "Akun tidak ditemukan." };
  }
  if (target.isActive === isActive) {
    return { success: true, message: "Status akun sudah sesuai." };
  }

  if (
    !isActive &&
    canManageUsers(target.role) &&
    (await prisma.user.count({
      where: {
        id: { not: target.id },
        role: { in: [...userManagerRoles] },
        isActive: true,
      },
    })) === 0
  ) {
    return {
      success: false,
      message: "Administrator/Direktur aktif terakhir tidak dapat dinonaktifkan.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: target.id },
      data: { isActive },
    });
  } catch (error) {
    console.error("User status update failed:", error);
    return { success: false, message: "Status akun gagal diperbarui." };
  }

  revalidatePath("/apps/settings");
  return {
    success: true,
    message: `Akun berhasil ${isActive ? "diaktifkan" : "dinonaktifkan"}.`,
  };
}

function parseCsvRow(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) {
    throw new Error("Format CSV memiliki tanda kutip yang tidak berpasangan.");
  }
  values.push(value.trim());
  return values;
}

export async function importUsersCsv(
  csv: string,
): Promise<AccountActionResult> {
  const manager = await requireUserManager();
  if (!manager) {
    return { success: false, message: "Akses administrator atau Direktur diperlukan." };
  }
  if (csv.length > 1_000_000) {
    return { success: false, message: "Ukuran CSV maksimal 1 MB." };
  }

  let rows: string[][];
  try {
    rows = csv
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map(parseCsvRow);
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Format CSV tidak valid.",
    };
  }
  if (rows.length < 2) {
    return { success: false, message: "CSV belum berisi data pengguna." };
  }
  if (rows.length > 101) {
    return {
      success: false,
      message: "Maksimal 100 akun dapat diimpor sekaligus.",
    };
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const requiredHeaders = ["name", "email", "role", "password"];
  if (
    requiredHeaders.some((header) => !headers.includes(header)) ||
    new Set(headers).size !== headers.length
  ) {
    return {
      success: false,
      message: "Kolom CSV wajib: name,email,role,password.",
    };
  }

  const columnIndexes = Object.fromEntries(
    requiredHeaders.map((header) => [header, headers.indexOf(header)]),
  );
  const emails = new Set<string>();
  const accounts: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    passwordHash: string;
    isActive: boolean;
    updatedAt: Date;
  }[] = [];

  for (const [index, row] of rows.slice(1).entries()) {
    if (row.length !== headers.length) {
      return {
        success: false,
        message: `Jumlah kolom pada baris ${index + 2} tidak sesuai header.`,
      };
    }

    const name = row[columnIndexes.name].trim();
    const email = row[columnIndexes.email].trim().toLowerCase();
    const role = row[columnIndexes.role].trim().toUpperCase();
    const password = row[columnIndexes.password];
    if (name.length < 2 || name.length > 120) {
      return {
        success: false,
        message: `Nama pada baris ${index + 2} harus terdiri dari 2 sampai 120 karakter.`,
      };
    }
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      emails.has(email)
    ) {
      return {
        success: false,
        message: `Email pada baris ${index + 2} tidak valid atau duplikat.`,
      };
    }
    if (password.length < 12 || password.length > 128) {
      return {
        success: false,
        message: `Password pada baris ${index + 2} harus terdiri dari 12 sampai 128 karakter.`,
      };
    }
    if (!isUserRole(role)) {
      return {
        success: false,
        message: `Role pada baris ${index + 2} tidak valid. Gunakan salah satu role sistem.`,
      };
    }

    emails.add(email);
    accounts.push({
      id: randomUUID(),
      name,
      email,
      role,
      passwordHash: await hash(password, 12),
      isActive: true,
      updatedAt: new Date(),
    });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const existingUsers = await transaction.user.findMany({
        where: { email: { in: accounts.map((account) => account.email) } },
        select: { email: true },
      });
      if (existingUsers.length > 0) {
        throw new Error(
          `Email sudah terdaftar: ${existingUsers.map((user) => user.email).join(", ")}`,
        );
      }
      await transaction.user.createMany({ data: accounts });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        success: false,
        message: "Salah satu email baru saja terdaftar. Tidak ada akun yang diimpor.",
      };
    }
    if (error instanceof Error && error.message.startsWith("Email sudah terdaftar:")) {
      return { success: false, message: error.message };
    }
    console.error("User CSV import failed:", error);
    return {
      success: false,
      message: "Impor akun gagal. Tidak ada akun yang diimpor.",
    };
  }

  revalidatePath("/apps/settings");
  return {
    success: true,
    message: `${accounts.length} akun berhasil diimpor.`,
  };
}
