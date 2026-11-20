import type { AssetReferenceIgnoreTarget } from "@/lib/asset-references";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import { DO_ARRIVAL_PHOTO_CLOUDINARY_FOLDER } from "@/lib/delivery-order-arrival-photo-config";
import type { AssetUploadContext } from "@/lib/file-storage";
import {
  readPrivatePhoto,
  removePrivatePhoto,
  type PrivatePhotoMimeType,
} from "@/lib/private-photos";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const photoDirectory = process.env.DO_ARRIVAL_PHOTO_UPLOAD_DIR;

type ArrivalPhotoMimeType = PrivatePhotoMimeType;

export class DeliveryOrderArrivalPhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryOrderArrivalPhotoValidationError";
  }
}

export async function saveDeliveryOrderArrivalPhoto(
  file: File,
  context?: AssetUploadContext,
): Promise<string> {
  try {
    const photo = await uploadCloudinaryPhoto(
      file,
      DO_ARRIVAL_PHOTO_CLOUDINARY_FOLDER,
      MAX_PHOTO_BYTES,
      { ...context, kind: context?.kind ?? "SJN" },
    );
    return photo.secureUrl;
  } catch (error) {
    if (error instanceof CloudinaryPhotoValidationError) {
      throw new DeliveryOrderArrivalPhotoValidationError(error.message);
    }
    throw error;
  }
}

export async function removeDeliveryOrderArrivalPhoto(
  url: string,
  options?: { ignore?: AssetReferenceIgnoreTarget },
): Promise<void> {
  if (await removeCloudinaryPhoto(url, options)) return;
  if (photoDirectory) {
    await removePrivatePhoto(
      url,
      photoDirectory,
      "/api/documents/do/arrival-photo",
    );
  }
}

export async function readDeliveryOrderArrivalPhoto(
  fileName: string,
): Promise<{ bytes: Uint8Array; contentType: ArrivalPhotoMimeType } | null> {
  return photoDirectory ? readPrivatePhoto(fileName, photoDirectory) : null;
}
