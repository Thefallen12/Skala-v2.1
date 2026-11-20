import { join, resolve } from "node:path";
import type { AssetReferenceIgnoreTarget } from "@/lib/asset-references";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import type { AssetUploadContext } from "@/lib/file-storage";
import {
  PROJECT_PROGRESS_PHOTO_CLOUDINARY_FOLDER,
  PROJECT_WORK_POINT_PHOTO_CLOUDINARY_FOLDER,
} from "@/lib/project-progress-photo-config";
import {
  PrivatePhotoValidationError,
  readPrivatePhoto,
  removePrivatePhoto,
  type PrivatePhotoMimeType,
} from "@/lib/private-photos";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const photoDirectory = process.env.PROJECT_PROGRESS_UPLOAD_DIR
  ? resolve(process.env.PROJECT_PROGRESS_UPLOAD_DIR)
  : join(process.cwd(), ".private-data", "project-progress-photos");

type ProgressPhotoMimeType = PrivatePhotoMimeType;

export type StoredProjectProgressPhoto = {
  url: string;
  fileUrl: string;
  publicId: string | null;
  assetCode?: string | null;
};

async function saveProjectProgressPhotoToCloudinary(
  file: File,
  folder: string,
  maxBytes = MAX_PHOTO_BYTES,
  context?: AssetUploadContext,
): Promise<StoredProjectProgressPhoto> {
  try {
    const photo = await uploadCloudinaryPhoto(file, folder, maxBytes, context);
    return {
      url: photo.secureUrl,
      fileUrl: photo.secureUrl,
      publicId: photo.publicId,
      assetCode: photo.assetCode ?? null,
    };
  } catch (error) {
    if (error instanceof CloudinaryPhotoValidationError) {
      throw new PrivatePhotoValidationError(error.message);
    }
    throw error;
  }
}

export async function saveProjectProgressPhoto(
  file: File,
  context?: AssetUploadContext,
): Promise<StoredProjectProgressPhoto> {
  return saveProjectProgressPhotoToCloudinary(
    file,
    PROJECT_PROGRESS_PHOTO_CLOUDINARY_FOLDER,
    MAX_PHOTO_BYTES,
    { ...context, kind: context?.kind ?? "FTO" },
  );
}

export async function saveProjectWorkPointPhoto(
  file: File,
  maxBytes = MAX_PHOTO_BYTES,
  context?: AssetUploadContext,
): Promise<StoredProjectProgressPhoto> {
  return saveProjectProgressPhotoToCloudinary(
    file,
    PROJECT_WORK_POINT_PHOTO_CLOUDINARY_FOLDER,
    maxBytes,
    { ...context, kind: context?.kind ?? "TTK" },
  );
}

export async function removeProjectProgressPhoto(
  photo: string | { url: string; publicId?: string | null },
): Promise<void> {
  return removeProjectProgressPhotoWithOptions(photo);
}

export async function removeProjectProgressPhotoWithOptions(
  photo: string | { url: string; publicId?: string | null },
  options?: { ignore?: AssetReferenceIgnoreTarget },
): Promise<void> {
  const url = typeof photo === "string" ? photo : photo.url;
  const publicId = typeof photo === "string" ? null : photo.publicId;

  if (
    await removeCloudinaryPhoto(url, {
      publicId,
      ignore: options?.ignore,
    })
  ) {
    return;
  }

  if (
    await removePrivatePhoto(
      url,
      photoDirectory,
      "/api/projects/progress-photos",
    )
  ) {
    return;
  }
  await removePrivatePhoto(
    url,
    photoDirectory,
    "/api/projects/work-point-photos",
  );
}

export async function readProjectProgressPhoto(
  fileName: string,
): Promise<{ bytes: Uint8Array; contentType: ProgressPhotoMimeType } | null> {
  return readPrivatePhoto(fileName, photoDirectory);
}
