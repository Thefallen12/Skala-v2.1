"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import {
  DRAWING_CATEGORIES,
  DRAWING_DOCUMENT_CLOUDINARY_FOLDER,
  DRAWING_FILE_EXTENSIONS,
} from "@/lib/drawing-document-config";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  CloudinaryRawFileValidationError,
  removeCloudinaryRawFile,
  uploadCloudinaryRawFile,
} from "@/lib/cloudinary-raw-files";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  drawingReviewRoles,
  drawingUploadRoles,
} from "@/lib/user-access";

export type DrawingActionResult = {
  success: boolean;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDrawingFileUrl(value: string): boolean {
  const cloudName = getCloudinaryCredentials()?.cloudName;
  if (!cloudName) return false;

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const [urlCloudName, resourceType] = segments;
    const uploadIndex = segments.indexOf("upload");
    const assetPath = segments
      .slice(uploadIndex + 1)
      .filter((segment) => !/^v\d+$/.test(segment));
    const fileName = assetPath.at(-1) ?? "";
    const extension = fileName.split(".").at(-1)?.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      urlCloudName === cloudName &&
      (resourceType === "image" || resourceType === "raw") &&
      uploadIndex > 0 &&
      assetPath.join("/").startsWith(`${DRAWING_DOCUMENT_CLOUDINARY_FOLDER}/`) &&
      DRAWING_FILE_EXTENSIONS.some((allowedExtension) => allowedExtension === extension)
    );
  } catch {
    return false;
  }
}

function isDrawingImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[0] === getCloudinaryCredentials()?.cloudName && segments[1] === "image";
  } catch {
    return false;
  }
}

async function uploadDrawingFile(file: File): Promise<string> {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!extension || !DRAWING_FILE_EXTENSIONS.includes(extension as (typeof DRAWING_FILE_EXTENSIONS)[number])) {
    throw new CloudinaryRawFileValidationError("Format file gambar kerja tidak didukung.");
  }
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return (
      await uploadCloudinaryPhoto(
        file,
        DRAWING_DOCUMENT_CLOUDINARY_FOLDER,
        50 * 1024 * 1024,
      )
    ).secureUrl;
  }
  return uploadCloudinaryRawFile(
    file,
    DRAWING_DOCUMENT_CLOUDINARY_FOLDER,
    DRAWING_FILE_EXTENSIONS,
    50 * 1024 * 1024,
  );
}

async function removeDrawingFile(url: string): Promise<void> {
  if (isDrawingImageUrl(url)) {
    await removeCloudinaryPhoto(url);
  } else {
    await removeCloudinaryRawFile(url);
  }
}

function revalidateDrawingRoutes(projectId?: string | null) {
  revalidatePath("/apps/drafter");
  revalidatePath("/");
  revalidatePath("/apps/projects");
  revalidatePath("/apps/approvals");
  if (projectId) {
    revalidatePath(`/apps/projects/${projectId}`);
  }
}

async function getActiveActor(roles: readonly UserRole[]) {
  const session = await auth();
  if (!session?.user?.id || !roles.includes(session.user.role)) return null;

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!actor?.isActive || !roles.includes(actor.role)) return null;
  return actor;
}

export async function createDrawingDocument(input: unknown): Promise<DrawingActionResult> {
  const actor = await getActiveActor(drawingUploadRoles);
  if (!actor) {
    return { success: false, message: "Akses upload gambar kerja tidak diizinkan." };
  }
  if (!isRecord(input)) {
    return { success: false, message: "Data gambar kerja tidak valid." };
  }

  const drawingCode =
    typeof input.drawingCode === "string"
      ? input.drawingCode.trim().toUpperCase()
      : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const category = typeof input.category === "string" ? input.category : "";
  const projectId =
    typeof input.projectId === "string" && input.projectId
      ? input.projectId
      : null;
  const file = input.file;

  if (
    !/^[A-Z0-9][A-Z0-9._-]{3,49}$/.test(drawingCode) ||
    title.length < 3 ||
    title.length > 180 ||
    !DRAWING_CATEGORIES.some((item) => item === category) ||
    !(file instanceof File)
  ) {
    return { success: false, message: "Periksa kode, judul, kategori, dan file gambar." };
  }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { id: true },
    });
    if (!project) {
      return { success: false, message: "Proyek tidak ditemukan atau tidak aktif." };
    }
  }

  let fileUrl = "";
  try {
    fileUrl = await uploadDrawingFile(file);
    if (!isDrawingFileUrl(fileUrl)) {
      throw new Error("Cloudinary mengembalikan URL gambar kerja yang tidak valid.");
    }
    await prisma.drawingDocument.create({
      data: {
        drawingCode,
        projectId,
        title,
        category,
        status: "REVIEW",
        version: 0,
        fileUrl,
        thumbnailUrl: isDrawingImageUrl(fileUrl) ? fileUrl : null,
        uploadedById: actor.id,
        logs: {
          create: {
            action: "UPLOADED",
            notes: "Dokumen gambar kerja pertama diunggah untuk ditinjau.",
            version: 0,
            fileUrl,
            createdById: actor.id,
          },
        },
      },
    });
  } catch (error) {
    if (fileUrl) {
      try {
        await removeDrawingFile(fileUrl);
      } catch (cleanupError) {
        console.error("Removing unattached drawing file failed:", cleanupError);
      }
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { success: false, message: "ID gambar sudah digunakan." };
    }
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryRawFileValidationError
    ) {
      return { success: false, message: error.message };
    }
    console.error("Creating drawing document failed:", error);
    return { success: false, message: "Gambar kerja gagal disimpan." };
  }

  revalidateDrawingRoutes(projectId);
  return { success: true, message: "Gambar kerja berhasil diunggah untuk ditinjau." };
}

export async function uploadDrawingRevision(
  drawingId: string,
  file: File,
  notes: string,
): Promise<DrawingActionResult> {
  const actor = await getActiveActor(drawingUploadRoles);
  if (!actor) {
    return { success: false, message: "Akses upload revisi tidak diizinkan." };
  }
  if (
    typeof drawingId !== "string" ||
    !drawingId ||
    !(file instanceof File) ||
    typeof notes !== "string" ||
    notes.trim().length > 2000
  ) {
    return { success: false, message: "Data revisi tidak valid." };
  }

  let fileUrl = "";
  let projectId: string | null = null;
  try {
    fileUrl = await uploadDrawingFile(file);
    if (!isDrawingFileUrl(fileUrl)) {
      throw new Error("Cloudinary mengembalikan URL gambar kerja yang tidak valid.");
    }
    projectId = await prisma.$transaction(async (transaction) => {
      const current = await transaction.drawingDocument.findUnique({
        where: { id: drawingId },
        select: { id: true, version: true, projectId: true },
      });
      if (!current) throw new Error("DRAWING_NOT_FOUND");

      const updated = await transaction.drawingDocument.update({
        where: { id: current.id },
        data: {
          version: { increment: 1 },
          fileUrl,
          thumbnailUrl: isDrawingImageUrl(fileUrl) ? fileUrl : undefined,
          status: "REVIEW",
        },
        select: { version: true },
      });
      await transaction.drawingLog.create({
        data: {
          drawingId: current.id,
          action: "REVISED",
          notes: notes.trim() || null,
          version: updated.version,
          fileUrl,
          createdById: actor.id,
        },
      });
      return current.projectId;
    });
  } catch (error) {
    if (fileUrl) {
      try {
        await removeDrawingFile(fileUrl);
      } catch (cleanupError) {
        console.error("Removing unattached drawing revision failed:", cleanupError);
      }
    }
    if (error instanceof Error && error.message === "DRAWING_NOT_FOUND") {
      return { success: false, message: "Gambar kerja tidak ditemukan." };
    }
    console.error("Uploading drawing revision failed:", error);
    return { success: false, message: "Revisi gagal disimpan." };
  }

  revalidateDrawingRoutes(projectId);
  return { success: true, message: "Revisi berhasil diunggah dan masuk antrean review." };
}

export async function reviewDrawingDocument(
  drawingId: string,
  status: "REVISION_NEEDED" | "APPROVED",
  notes: string,
): Promise<DrawingActionResult> {
  const actor = await getActiveActor(drawingReviewRoles);
  if (!actor) {
    return { success: false, message: "Akses review gambar kerja tidak diizinkan." };
  }
  if (
    typeof drawingId !== "string" ||
    !drawingId ||
    (status !== "REVISION_NEEDED" && status !== "APPROVED") ||
    typeof notes !== "string" ||
    notes.trim().length > 2000 ||
    (status === "REVISION_NEEDED" && notes.trim().length < 3)
  ) {
    return { success: false, message: "Status atau catatan review tidak valid." };
  }

  let projectId: string | null = null;
  try {
    projectId = await prisma.$transaction(async (transaction) => {
      const current = await transaction.drawingDocument.findUnique({
        where: { id: drawingId },
        select: { id: true, version: true, status: true, projectId: true },
      });
      if (!current) throw new Error("DRAWING_NOT_FOUND");
      if (current.status !== "REVIEW") throw new Error("DRAWING_NOT_IN_REVIEW");

      await transaction.drawingDocument.update({
        where: { id: current.id },
        data: { status },
      });
      await transaction.drawingLog.create({
        data: {
          drawingId: current.id,
          action: status === "APPROVED" ? "APPROVED" : "REVIEWED",
          notes: notes.trim() || null,
          version: current.version,
          createdById: actor.id,
        },
      });
      return current.projectId;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DRAWING_NOT_FOUND") {
      return { success: false, message: "Gambar kerja tidak ditemukan." };
    }
    if (error instanceof Error && error.message === "DRAWING_NOT_IN_REVIEW") {
      return { success: false, message: "Hanya gambar dalam antrean review yang dapat diproses." };
    }
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryRawFileValidationError
    ) {
      return { success: false, message: error.message };
    }
    console.error("Reviewing drawing document failed:", error);
    return { success: false, message: "Review gambar kerja gagal disimpan." };
  }

  revalidateDrawingRoutes(projectId);
  return {
    success: true,
    message:
      status === "APPROVED"
        ? "Gambar kerja disetujui."
        : "Permintaan revisi berhasil dikirim.",
  };
}
