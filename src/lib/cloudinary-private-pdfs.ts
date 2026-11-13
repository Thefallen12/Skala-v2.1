import "@/lib/sanitize-env";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  getFinancePaymentProofMimeType,
  hasPdfSignature,
} from "@/lib/finance-payment-proof-file";
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
    if (!/^[A-Za-z0-9_-]+\.pdf$/i.test(fileName)) return null;

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

  const credentials = getCloudinaryCredentials();
  if (!credentials) {
    const safeFolder = TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER.replace(/[^a-zA-Z0-9/_-]/g, "");
    const fileName = `${randomUUID()}.pdf`;
    const relativeDir = path.posix.join("uploads", safeFolder);
    const absDir = path.join(process.cwd(), "public", ...relativeDir.split("/"));
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, fileName), bytes, { flag: "wx" });
    return `/${relativeDir}/${fileName}`;
  }

  configureCloudinary();
  return new Promise((resolveUpload, rejectUpload) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        access_mode: "authenticated",
        folder: TICKET_RECEIPT_PDF_CLOUDINARY_FOLDER,
        public_id: randomUUID(),
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
        resolveUpload(response.secure_url);
      },
    );
    Readable.from([bytes]).pipe(stream);
  });
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

export async function removeCloudinaryPrivatePdf(url: string): Promise<boolean> {
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
  const asset = parsePrivatePdfUrl(url);
  if (!asset) return false;

  configureCloudinary();
  const result = await cloudinary.uploader.destroy(asset.publicId, {
    invalidate: true,
    resource_type: "raw",
    type: "authenticated",
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary PDF deletion failed: ${result.result}`);
  }
  return true;
}
