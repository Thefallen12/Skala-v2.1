import "@/lib/sanitize-env";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import type { AssetKind } from "@/lib/asset-codes";
import type { AssetReferenceIgnoreTarget } from "@/lib/asset-references";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  type AssetUploadContext,
  removeManagedAssetIfUnreferenced,
  uploadManagedAsset,
} from "@/lib/file-storage";
import { extractGoogleDriveFileId } from "@/lib/google-drive-storage";
import {
  detectImageMimeFromBytes,
  getFinancePaymentProofMimeType,
} from "@/lib/finance-payment-proof-file";

const extByMime = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function inferPhotoAssetKind(folder: string): AssetKind {
  const lower = folder.toLowerCase();
  if (lower.includes("work_point")) return "TTK";
  if (lower.includes("progress")) return "FTO";
  if (lower.includes("survey")) return "SRV";
  if (lower.includes("arrival")) return "SJN";
  if (lower.includes("direct_stock")) return "BLJ";
  if (lower.includes("fuel")) return "BBM";
  if (lower.includes("drawing")) return "DRW";
  if (lower.includes("profile")) return "USR";
  if (lower.includes("template")) return "TPL";
  if (lower.includes("cashflow")) return "BKT";
  if (lower.includes("payment")) return "BKT";
  if (lower.includes("ticket") || lower.includes("receipt") || lower.includes("request")) {
    return "BON";
  }
  return "FTO";
}

export class CloudinaryPhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudinaryPhotoValidationError";
  }
}

export class CloudinaryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudinaryConfigurationError";
  }
}

function configureCloudinary(): void {
  const credentials = getCloudinaryCredentials();
  if (!credentials) {
    throw new CloudinaryConfigurationError(
      "Konfigurasi Cloudinary belum lengkap. Isi CLOUDINARY_URL atau CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET.",
    );
  }
  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });
}

export async function uploadCloudinaryPhoto(
  file: File,
  folder: string,
  maxBytes = 5 * 1024 * 1024,
  context?: AssetUploadContext,
): Promise<{
  secureUrl: string;
  publicId: string;
  assetCode?: string;
  provider?: "cloudinary" | "gdrive" | "local_private";
}> {
  if (!(file instanceof File) || file.size < 1 || file.size > maxBytes) {
    throw new CloudinaryPhotoValidationError(
      `Ukuran foto harus lebih dari 0 dan maksimal ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
    );
  }
  const declaredMime = getFinancePaymentProofMimeType(file);
  if (!declaredMime || declaredMime === "application/pdf") {
    throw new CloudinaryPhotoValidationError(
      "Format foto harus JPG, PNG, atau WEBP.",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Detect actual image signature so Safari files whose filename/MIME says JPG but bytes are PNG/WEBP still upload cleanly.
  const actualMime = detectImageMimeFromBytes(bytes);
  if (!actualMime) {
    throw new CloudinaryPhotoValidationError(
      "Isi file tidak sesuai dengan format foto yang dipilih.",
    );
  }

  const ext = extByMime[actualMime] ?? "jpg";
  const defaultKind = inferPhotoAssetKind(folder);
  const uploaded = await uploadManagedAsset({
    bytes,
    mimeType: actualMime,
    extension: ext,
    originalFilename: file.name,
    baseFolder: folder,
    defaultKind,
    context,
    cloudinaryUploader: ({ folder: targetFolder, publicId }) => {
      configureCloudinary();
      return new Promise((resolveUpload, rejectUpload) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: targetFolder,
            public_id: publicId,
            use_filename: false,
            unique_filename: false,
            overwrite: false,
            resource_type: "image",
          },
          (error, response) => {
            if (error) {
              rejectUpload(error);
              return;
            }
            if (!response?.secure_url || !response.public_id) {
              rejectUpload(new Error("Cloudinary tidak mengembalikan data foto."));
              return;
            }
            resolveUpload({
              secureUrl: response.secure_url,
              publicId: response.public_id,
            });
          },
        );
        Readable.from([bytes]).pipe(stream);
      });
    },
  });

  return {
    secureUrl: uploaded.secureUrl,
    publicId: uploaded.publicId,
    assetCode: uploaded.assetCode,
    provider: uploaded.provider,
  };
}

export function getCloudinaryPublicId(url: string): string | null {
  if (url.startsWith("/uploads/")) {
    try {
      const parsed = new URL(url, "http://localhost");
      if (!parsed.pathname.startsWith("/uploads/") || parsed.search || parsed.hash) {
        return null;
      }
      const segments = parsed.pathname
        .slice("/uploads/".length)
        .split("/")
        .map((segment) => decodeURIComponent(segment));
      const fileName = segments.at(-1) ?? "";
      if (
        segments.length < 2 ||
        segments.some(
          (segment) =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            segment.includes("/") ||
            segment.includes("\\"),
        ) ||
        !/\.(?:jpe?g|png|webp)$/i.test(fileName)
      ) {
        return null;
      }
      return segments.join("/").replace(/\.[^.]+$/, "");
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.indexOf("upload");
    if (uploadIndex < 0 || segments.length <= uploadIndex + 1) return null;
    const assetPath = segments
      .slice(uploadIndex + 1)
      .filter((segment) => !/^v\d+$/.test(segment));
    const lastSegment = assetPath.at(-1);
    if (!lastSegment) return null;
    assetPath[assetPath.length - 1] = lastSegment.replace(/\.[^.]+$/, "");
    return assetPath.length > 0 ? assetPath.join("/") : null;
  } catch {
    return null;
  }
}

export async function removeCloudinaryPhoto(
  url: string,
  options?: { ignore?: AssetReferenceIgnoreTarget; publicId?: string | null },
): Promise<boolean> {
  if (url.startsWith("/uploads/")) {
    try {
      const pathname = new URL(url, "http://localhost").pathname;
      const segments = pathname
        .slice("/uploads/".length)
        .split("/")
        .map((segment) => decodeURIComponent(segment));
      const fileName = segments.at(-1) ?? "";
      if (
        !pathname.startsWith("/uploads/") ||
        segments.length < 2 ||
        segments.some(
          (segment) =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            segment.includes("/") ||
            segment.includes("\\"),
        ) ||
        !/\.(?:jpe?g|png|webp)$/i.test(fileName)
      ) {
        return false;
      }

      const uploadsDirectory = path.resolve(process.cwd(), "public", "uploads");
      const localPath = path.resolve(uploadsDirectory, ...segments);
      if (!localPath.startsWith(`${uploadsDirectory}${path.sep}`)) {
        return false;
      }
      await rm(/*turbopackIgnore: true*/ localPath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  if (extractGoogleDriveFileId(url)) {
    const result = await removeManagedAssetIfUnreferenced({
      url,
      ignore: options?.ignore,
    });
    return result.deleted || result.skippedReason === "referenced_elsewhere";
  }

  const publicId = options?.publicId || getCloudinaryPublicId(url);
  if (!publicId) return false;
  const result = await removeManagedAssetIfUnreferenced({
    url,
    publicId,
    ignore: options?.ignore,
    cloudinaryRemover: async (_targetUrl, targetPublicId) => {
      if (targetPublicId) {
        await deleteCloudinaryPhoto(targetPublicId);
      }
    },
  });
  return result.deleted || result.skippedReason === "referenced_elsewhere";
}

export async function deleteCloudinaryPhoto(publicId: string): Promise<void> {
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary photo deletion failed: ${result.result}`);
  }
}

export function isCloudinaryPhotoUrl(url: string): boolean {
  return getCloudinaryPublicId(url) !== null || extractGoogleDriveFileId(url) !== null;
}
