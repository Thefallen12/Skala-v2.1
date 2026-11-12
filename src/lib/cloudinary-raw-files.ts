import "@/lib/sanitize-env";
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import { DRAWING_DOCUMENT_CLOUDINARY_FOLDER } from "@/lib/drawing-document-config";
import { PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER } from "@/lib/purchase-order-invoice-config";
import { REQUEST_DOCUMENT_CLOUDINARY_FOLDER } from "@/lib/request-document-config";

const signatureByExtension: Record<string, (bytes: Uint8Array) => boolean> = {
  pdf: (bytes) => new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-",
  doc: (bytes) => bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0,
  xls: (bytes) => bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0,
  docx: (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
  xlsx: (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04,
  dwg: (bytes) => /^AC10\d{2}/.test(new TextDecoder().decode(bytes.subarray(0, 6))),
  dxf: (bytes) => /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\b/im.test(new TextDecoder().decode(bytes.subarray(0, 1024))),
  ifc: (bytes) => new TextDecoder().decode(bytes.subarray(0, 32)).startsWith("ISO-10303-21"),
  rvt: (bytes) => /^(?:RVT|Autodesk Revit|Revit)/i.test(new TextDecoder().decode(bytes.subarray(0, 32))),
};

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

export class CloudinaryRawFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudinaryRawFileValidationError";
  }
}

export async function uploadCloudinaryRawFile(
  file: File,
  folder: string,
  allowedExtensions: readonly string[],
  maxBytes: number,
): Promise<string> {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > maxBytes ||
    !allowedExtensions.includes(extension)
  ) {
    throw new CloudinaryRawFileValidationError(
      `File harus berformat ${allowedExtensions.join(", ").toUpperCase()} dan berukuran maksimal ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const verifySignature = signatureByExtension[extension];
  if (!verifySignature || !verifySignature(bytes)) {
    throw new CloudinaryRawFileValidationError(
      "Isi file tidak sesuai dengan format file yang dipilih.",
    );
  }

  const credentials = getCloudinaryCredentials();
  if (!credentials) {
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "");
    const fileName = `${randomUUID()}.${extension}`;
    const relativeDir = path.posix.join("uploads", safeFolder);
    const absDir = path.join(process.cwd(), "public", ...relativeDir.split("/"));
    await mkdir(absDir, { recursive: true });
    await writeFile(
      path.join(/*turbopackIgnore: true*/ absDir, fileName),
      bytes,
      { flag: "wx" },
    );
    return `/${relativeDir}/${fileName}`;
  }

  configureCloudinary();
  const publicId = `${randomUUID()}.${extension}`;
  return new Promise((resolveUpload, rejectUpload) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, overwrite: false, resource_type: "raw" },
      (error, response) => {
        if (error) {
          rejectUpload(error);
          return;
        }
        if (!response?.secure_url || !response.public_id || response.resource_type !== "raw") {
          rejectUpload(new Error("Cloudinary tidak mengembalikan file yang valid."));
          return;
        }
        resolveUpload(response.secure_url);
      },
    );
    Readable.from([bytes]).pipe(stream);
  });
}

export async function removeCloudinaryRawFile(url: string): Promise<boolean> {
  const allowedFolders = [
    DRAWING_DOCUMENT_CLOUDINARY_FOLDER,
    PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER,
    REQUEST_DOCUMENT_CLOUDINARY_FOLDER,
  ];
  if (url.startsWith("/uploads/")) {
    try {
      const pathname = new URL(url, "http://localhost").pathname;
      if (!pathname.startsWith("/uploads/")) {
        return false;
      }
      const segments = pathname
        .slice("/uploads/".length)
        .split("/")
        .map((segment) => decodeURIComponent(segment));
      const fileName = segments.at(-1) ?? "";
      const relativeFolder = segments.slice(0, -1).join("/");
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
        !allowedFolders.includes(relativeFolder) ||
        !/^[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/.test(fileName)
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
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const uploadIndex = segments.indexOf("upload");
  const cloudName = getCloudinaryCredentials()?.cloudName;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "res.cloudinary.com" ||
    parsed.search ||
    parsed.hash ||
    segments[0] !== cloudName ||
    segments[1] !== "raw" ||
    uploadIndex !== 2 ||
    uploadIndex === segments.length - 1
  ) {
    return false;
  }

  const publicId = segments
    .slice(uploadIndex + 1)
    .filter((segment) => !/^v\d+$/.test(segment))
    .join("/")
    .replace(/\.[^.]+$/, "");
  if (!allowedFolders.some((folder) => publicId.startsWith(`${folder}/`))) {
    return false;
  }

  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    invalidate: true,
    resource_type: "raw",
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary raw file deletion failed: ${result.result}`);
  }
  return true;
}
