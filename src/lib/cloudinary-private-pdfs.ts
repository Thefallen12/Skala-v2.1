import "@/lib/sanitize-env";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import type { AssetReferenceIgnoreTarget } from "@/lib/asset-references";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  type AssetUploadContext,
  removeManagedAssetIfUnreferenced,
  uploadManagedAsset,
} from "@/lib/file-storage";
import {
  getFinancePaymentProofMimeType,
  hasPdfSignature,
} from "@/lib/finance-payment-proof-file";
import { extractGoogleDriveFileId } from "@/lib/google-drive-storage";
import { TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER } from "@/lib/ticket-receipt-pdf-config";

const PDF_MIME_TYPE = "application/pdf";

type CloudinaryPrivatePdf = {
  publicId: string;
};

export class CloudinaryPrivatePdfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudinaryPrivatePdfValidationError";
  }
}

function configureCloudinary(): void {
  const credentials = getCloudinaryCredentials();
  if (!credentials) {
    throw new Error(
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

function parsePrivatePdfUrl(url: string): CloudinaryPrivatePdf | null {
  const cloudName = getCloudinaryCredentials()?.cloudName;
  if (!cloudName || url.length > 2048) return null;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "res.cloudinary.com" ||
      segments[0] !== cloudName ||
      segments[1] !== "raw" ||
      segments[2] !== "authenticated" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    const versionIndex = segments.findIndex(
      (segment, index) => index >= 3 && /^v\d+$/.test(segment),
    );
    if (versionIndex < 0) return null;
    const assetStart = versionIndex + 1;

    const assetSegments = segments.slice(assetStart);
    if (assetSegments.length < 2) return null;
    const fileName = assetSegments.at(-1) ?? "";
    if (!/^[A-Za-z0-9_-]+(?:\.pdf)?$/i.test(fileName)) return null;

    const publicId = assetSegments.join("/");
    if (!publicId.startsWith(`${TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER}/`)) {
      return null;
    }

    return { publicId };
  } catch {
    return null;
  }
}

export async function uploadCloudinaryPrivatePdf(
  file: File,
  maxBytes = 5 * 1024 * 1024,
  context?: AssetUploadContext,
): Promise<string> {
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > maxBytes
  ) {
    throw new CloudinaryPrivatePdfValidationError(
      `Ukuran PDF harus lebih dari 0 dan maksimal ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
    );
  }
  if (getFinancePaymentProofMimeType(file) !== PDF_MIME_TYPE) {
    throw new CloudinaryPrivatePdfValidationError("Format file harus PDF.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasPdfSignature(bytes)) {
    throw new CloudinaryPrivatePdfValidationError(
      "Isi file tidak sesuai dengan format PDF.",
    );
  }

  const uploaded = await uploadManagedAsset({
    bytes,
    mimeType: PDF_MIME_TYPE,
    extension: "pdf",
    originalFilename: file.name,
    baseFolder: TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER,
    defaultKind: context?.kind ?? "BON",
    context,
    cloudinaryUploader: ({ folder: targetFolder, publicId }) => {
      configureCloudinary();
      return new Promise((resolveUpload, rejectUpload) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            access_mode: "authenticated",
            folder: targetFolder,
            public_id: `${publicId}.pdf`,
            use_filename: false,
            unique_filename: false,
            overwrite: false,
            resource_type: "raw",
            type: "authenticated",
          },
          (error, response) => {
            if (error) {
              rejectUpload(error);
              return;
            }
            if (
              !response?.secure_url ||
              !response.public_id ||
              response.resource_type !== "raw" ||
              response.type !== "authenticated"
            ) {
              rejectUpload(
                new Error("Cloudinary tidak mengembalikan aset PDF privat yang valid."),
              );
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

  return uploaded.secureUrl;
}

export function isCloudinaryPrivateTicketReceiptPdf(url: string): boolean {
  const prefix = `/uploads/${TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER}/`;
  if (url.startsWith("/uploads/")) {
    try {
      const parsed = new URL(url, "http://localhost");
      if (!parsed.pathname.startsWith(prefix) || parsed.search || parsed.hash) {
        return false;
      }
      const fileName = decodeURIComponent(parsed.pathname.slice(prefix.length));
      return /^[A-Za-z0-9_-]+\.pdf$/i.test(fileName);
    } catch {
      return false;
    }
  }
  return parsePrivatePdfUrl(url) !== null;
}

export function createCloudinaryPrivatePdfDownloadUrl(
  url: string,
  attachment: boolean,
): string {
  if (url.startsWith("/uploads/")) {
    return url;
  }
  const asset = parsePrivatePdfUrl(url);
  if (!asset) {
    throw new Error("URL PDF privat Cloudinary tidak valid.");
  }

  configureCloudinary();
  return cloudinary.utils.private_download_url(asset.publicId, "", {
    attachment,
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    resource_type: "raw",
    type: "authenticated",
  });
}

export async function removeCloudinaryPrivatePdf(
  url: string,
  options?: { ignore?: AssetReferenceIgnoreTarget },
): Promise<boolean> {
  if (url.startsWith("/uploads/")) {
    const prefix = `/uploads/${TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER}/`;
    if (!url.startsWith(prefix)) return false;
    const pathname = new URL(url, "http://localhost").pathname;
    const fileName = decodeURIComponent(pathname.slice(prefix.length));
    if (!/^[A-Za-z0-9_-]+\.pdf$/i.test(fileName)) return false;

    const uploadsDirectory = path.resolve(
      process.cwd(),
      "public",
      "uploads",
      ...TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER.split("/"),
    );
    const localPath = path.resolve(uploadsDirectory, fileName);
    if (!localPath.startsWith(`${uploadsDirectory}${path.sep}`)) return false;
    await rm(/* turbopackIgnore: true */ localPath, { force: true });
    return true;
  }

  if (extractGoogleDriveFileId(url)) {
    const result = await removeManagedAssetIfUnreferenced({
      url,
      ignore: options?.ignore,
    });
    return result.deleted || result.skippedReason === "referenced_elsewhere";
  }

  const asset = parsePrivatePdfUrl(url);
  if (!asset) return false;

  const result = await removeManagedAssetIfUnreferenced({
    url,
    publicId: asset.publicId,
    ignore: options?.ignore,
    cloudinaryRemover: async (_targetUrl, targetPublicId) => {
      if (!targetPublicId) return;
      configureCloudinary();
      const destroyRes = await cloudinary.uploader.destroy(targetPublicId, {
        invalidate: true,
        resource_type: "raw",
        type: "authenticated",
      });
      if (destroyRes.result !== "ok" && destroyRes.result !== "not found") {
        throw new Error(`Cloudinary PDF deletion failed: ${destroyRes.result}`);
      }
    },
  });
  return result.deleted || result.skippedReason === "referenced_elsewhere";
}
