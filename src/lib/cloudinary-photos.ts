import "@/lib/sanitize-env";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  detectImageMimeFromBytes,
  getFinancePaymentProofMimeType,
} from "@/lib/finance-payment-proof-file";

const extByMime = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

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
): Promise<{ secureUrl: string; publicId: string }> {
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

  const credentials = getCloudinaryCredentials();
  if (!credentials) {
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "");
    const ext = extByMime[actualMime] ?? "jpg";
    const fileName = `${randomUUID()}.${ext}`;
    const relativeDir = path.posix.join("uploads", safeFolder);
    const absDir = path.join(process.cwd(), "public", ...relativeDir.split("/"));
    await mkdir(absDir, { recursive: true });
    await writeFile(
      path.join(/*turbopackIgnore: true*/ absDir, fileName),
      bytes,
      { flag: "wx" },
    );
    const localUrl = `/${relativeDir}/${fileName}`;
    return {
      secureUrl: localUrl,
      publicId: `${safeFolder}/${fileName.replace(/\.[^.]+$/, "")}`,
    };
  }

  configureCloudinary();
  return new Promise((resolveUpload, rejectUpload) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: randomUUID(),
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

export async function removeCloudinaryPhoto(url: string): Promise<boolean> {
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
  const publicId = getCloudinaryPublicId(url);
  if (!publicId) return false;
  await deleteCloudinaryPhoto(publicId);
  return true;
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
  return getCloudinaryPublicId(url) !== null;
}
