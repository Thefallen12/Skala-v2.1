"use server";

import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { canManageUsers } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import {
  isManagedUserProfilePhotoUrl,
  ProfilePhotoValidationError,
  removeUserProfilePhoto,
  saveUserProfilePhoto,
  type SavedUserProfilePhoto,
} from "@/lib/user-profile-photos";
import { auth } from "../../../../auth";

export type RegisterState = {
  status: "idle" | "error" | "success";
  message: string;
};

function isUserRole(value: string): value is UserRole {
  return Object.values(UserRole).some((role) => role === value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function createAccount(
  _previousState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const session = await auth();
  if (!session?.user || !canManageUsers(session.user.role)) {
    return {
      status: "error",
      message: "Hanya administrator atau Direktur yang dapat membuat akun.",
    };
  }

  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const role = formData.get("role");
  const phoneValue = formData.get("phone");
  const profilePhotoValue = formData.get("profilePhotoUrl");
  const profilePhotoFileValue = formData.get("profilePhotoFile");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof role !== "string" ||
    (profilePhotoValue !== null && typeof profilePhotoValue !== "string") ||
    (profilePhotoFileValue !== null &&
      !(profilePhotoFileValue instanceof File))
  ) {
    return { status: "error", message: "Data formulir tidak valid." };
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedName.length < 2 || normalizedName.length > 120) {
    return {
      status: "error",
      message: "Nama harus terdiri dari 2 sampai 120 karakter.",
    };
  }

  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    return { status: "error", message: "Masukkan alamat email yang valid." };
  }

  if (password.length < 12 || password.length > 128) {
    return {
      status: "error",
      message: "Password harus terdiri dari 12 sampai 128 karakter.",
    };
  }

  if (!isUserRole(role)) {
    return { status: "error", message: "Role yang dipilih tidak valid." };
  }
  const phone =
    typeof phoneValue === "string" ? phoneValue.trim() : "";
  if (
    phone.length > 32 ||
    (phone.length > 0 && !/^[+()\d\s.-]+$/.test(phone))
  ) {
    return { status: "error", message: "Nomor telepon tidak valid." };
  }
  const profilePhotoUrl =
    typeof profilePhotoValue === "string" ? profilePhotoValue.trim() : "";
  const profilePhotoFile =
    profilePhotoFileValue instanceof File && profilePhotoFileValue.size > 0
      ? profilePhotoFileValue
      : null;
  if (
    profilePhotoUrl.length > 2048 ||
    (profilePhotoUrl && !isManagedUserProfilePhotoUrl(profilePhotoUrl))
  ) {
    return { status: "error", message: "Foto profil Cloudinary tidak valid." };
  }

  let newPhoto: SavedUserProfilePhoto | null = null;
  try {
    if (profilePhotoFile) {
      newPhoto = await saveUserProfilePhoto(profilePhotoFile);
    }
    await prisma.user.create({
      data: {
        id: randomUUID(),
        name: normalizedName,
        email: normalizedEmail,
        phone: phone || null,
        profilePhotoUrl: newPhoto?.url ?? (profilePhotoUrl || null),
        passwordHash: await hash(password, 12),
        role,
        isActive: formData.get("isActive") === "false" ? false : true,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    if (newPhoto) {
      try {
        await removeUserProfilePhoto(newPhoto.url);
      } catch (cleanupError) {
        console.error("Removing unattached new account photo failed:", cleanupError);
      }
    }
    if (error instanceof ProfilePhotoValidationError) {
      return { status: "error", message: error.message };
    }
    if (isUniqueConstraintError(error)) {
      return {
        status: "error",
        message: "Email tersebut sudah terdaftar.",
      };
    }

    console.error("Account creation failed:", error);
    return {
      status: "error",
      message: "Akun gagal dibuat. Silakan coba lagi.",
    };
  }

  revalidatePath("/auth/register");
  revalidatePath("/apps/settings");
  revalidatePath("/(DashboardLayout)", "layout");
  return {
    status: "success",
    message: `Akun ${normalizedEmail} berhasil dibuat dengan role ${role}.`,
  };
}
