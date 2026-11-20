import { join, resolve } from "node:path";
import {
  getCloudinaryPublicId,
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import type { AssetUploadContext } from "@/lib/file-storage";
import { extractGoogleDriveFileId } from "@/lib/google-drive-storage";
import {
  readPrivatePhoto,
  removePrivatePhoto,
  type PrivatePhotoMimeType,
} from "@/lib/private-photos";
import { USER_PROFILE_PHOTO_CLOUDINARY_FOLDER } from "@/lib/user-profile-photo-config";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const photoDirectory = process.env.USER_PROFILE_UPLOAD_DIR
  ? resolve(process.env.USER_PROFILE_UPLOAD_DIR)
  : join(process.cwd(), ".private-data", "user-profile-photos");

type ProfilePhotoMimeType = PrivatePhotoMimeType;

export class ProfilePhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfilePhotoValidationError";
  }
}

export type SavedUserProfilePhoto = {
  url: string;
};

async function uploadProfileSourceToCloudinary(
  file: File,
  context?: AssetUploadContext,
): Promise<{ url: string; publicId: string }> {
  const uploaded = await uploadCloudinaryPhoto(
    file,
    USER_PROFILE_PHOTO_CLOUDINARY_FOLDER,
    MAX_PHOTO_BYTES,
    { ...context, kind: "USR", fallbackScope: context?.fallbackScope ?? "USER" },
  );
  return { url: uploaded.secureUrl, publicId: uploaded.publicId };
}

export function isManagedUserProfilePhotoUrl(value: string): boolean {
  if (extractGoogleDriveFileId(value)) return true;
  const cloudName = getCloudinaryCredentials()?.cloudName;
  const publicId = getCloudinaryPublicId(value);
  if (!cloudName || !publicId) return false;

  try {
    const parsed = new URL(value);
    const [urlCloudName, resourceType, deliveryType] = parsed.pathname
      .split("/")
      .filter(Boolean);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      urlCloudName === cloudName &&
      resourceType === "image" &&
      deliveryType === "upload" &&
      publicId.startsWith(`${USER_PROFILE_PHOTO_CLOUDINARY_FOLDER}/`)
    );
  } catch {
    return false;
  }
}

export async function saveUserProfilePhoto(
  file: File,
  context?: AssetUploadContext,
): Promise<SavedUserProfilePhoto> {
  try {
    const uploaded = await uploadProfileSourceToCloudinary(file, context);
    return { url: uploaded.url };
  } catch (error) {
    if (error instanceof CloudinaryPhotoValidationError) {
      throw new ProfilePhotoValidationError(error.message);
    }
    throw error;
  }
}

export async function removeUserProfilePhoto(
  url: string,
  sourceUrl?: string,
): Promise<void> {
  if (await removeCloudinaryPhoto(url)) {
    if (sourceUrl) {
      await removePrivatePhoto(
        sourceUrl,
        photoDirectory,
        "/api/users/profile-photo",
      );
    }
    return;
  }
  await removePrivatePhoto(url, photoDirectory, "/api/users/profile-photo");
}

export async function migrateUserProfilePhotoToCloudinary(
  url: string,
): Promise<{ url: string; publicId: string } | null> {
  let fileName: string;
  try {
    const pathname = new URL(url, "http://localhost").pathname;
    const prefix = "/api/users/profile-photo/";
    if (!pathname.startsWith(prefix)) return null;
    fileName = pathname.slice(prefix.length);
  } catch {
    return null;
  }

  const photo = await readPrivatePhoto(fileName, photoDirectory);
  if (!photo) return null;
  const bytes = new Uint8Array(photo.bytes.byteLength);
  bytes.set(photo.bytes);
  const file = new File([bytes.buffer], fileName, { type: photo.contentType });
  return uploadProfileSourceToCloudinary(file);
}

export async function readUserProfilePhoto(
  fileName: string,
): Promise<{ bytes: Uint8Array; contentType: ProfilePhotoMimeType } | null> {
  return readPrivatePhoto(fileName, photoDirectory);
}
