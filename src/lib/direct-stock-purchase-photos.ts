import type { AssetReferenceIgnoreTarget } from "@/lib/asset-references";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  getCloudinaryPublicId,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import { DIRECT_STOCK_PURCHASE_PHOTO_CLOUDINARY_FOLDER } from "@/lib/direct-stock-purchase-photo-config";
import type { AssetUploadContext } from "@/lib/file-storage";
import { extractGoogleDriveFileId } from "@/lib/google-drive-storage";
import {
  readPrivatePhoto,
  removePrivatePhoto,
  type PrivatePhotoMimeType,
} from "@/lib/private-photos";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const photoDirectory = process.env.DIRECT_STOCK_PURCHASE_PHOTO_UPLOAD_DIR;

type PhotoMimeType = PrivatePhotoMimeType;

export class DirectStockPurchasePhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectStockPurchasePhotoValidationError";
  }
}

export async function saveDirectStockPurchasePhoto(
  file: File,
  context?: AssetUploadContext,
): Promise<string> {
  try {
    const photo = await uploadCloudinaryPhoto(
      file,
      DIRECT_STOCK_PURCHASE_PHOTO_CLOUDINARY_FOLDER,
      MAX_PHOTO_BYTES,
      { ...context, kind: context?.kind ?? "BLJ" },
    );
    return photo.secureUrl;
  } catch (error) {
    if (error instanceof CloudinaryPhotoValidationError) {
      throw new DirectStockPurchasePhotoValidationError(error.message);
    }
    throw error;
  }
}

export async function removeDirectStockPurchasePhoto(
  url: string,
  options?: { ignore?: AssetReferenceIgnoreTarget },
): Promise<void> {
  if (await removeCloudinaryPhoto(url, options)) return;
  if (photoDirectory) {
    await removePrivatePhoto(
      url,
      photoDirectory,
      "/api/logistics/direct-stock-purchase-photo",
    );
  }
}

export function isDirectStockPurchaseCloudinaryPhotoUrl(url: string): boolean {
  if (extractGoogleDriveFileId(url)) return true;
  try {
    const parsed = new URL(url);
    const publicId = getCloudinaryPublicId(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      Boolean(
        publicId?.startsWith(
          `${DIRECT_STOCK_PURCHASE_PHOTO_CLOUDINARY_FOLDER}/`,
        ),
      )
    );
  } catch {
    return false;
  }
}

export async function readDirectStockPurchasePhoto(
  fileName: string,
): Promise<{ bytes: Uint8Array; contentType: PhotoMimeType } | null> {
  return photoDirectory ? readPrivatePhoto(fileName, photoDirectory) : null;
}
