"use client";

import imageCompression from "browser-image-compression";

const DEFAULT_MAX_SIZE_MB = 0.35;
const DEFAULT_MAX_DIMENSION = 1600;
const FAST_PATH_MAX_BYTES = 280 * 1024;
const DEFAULT_HARD_LIMIT_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
};

export interface FieldImageCompressionOptions {
  /** Target maximum file size in MB (defaults to ~0.35 MB / ~350 KB). */
  maxSizeMB?: number;
  /** Maximum pixel width or height (defaults to 1600px). */
  maxWidthOrHeight?: number;
  /** Hard upper bound in bytes expected by server validators (defaults to 5 MB). */
  hardLimitBytes?: number;
  /** When true, allows application/pdf files to pass through untouched. */
  allowPdfPassthrough?: boolean;
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > -1 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function replaceExtension(fileName: string, extension: string): string {
  const trimmed = fileName.trim() || "foto-lapangan";
  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  return `${base}.${extension}`;
}

function resolveMimeType(file: File): string {
  if (file.type && file.type.trim()) {
    const normalized = file.type.trim().toLowerCase();
    return normalized === "image/jpg" ? "image/jpeg" : normalized;
  }
  return EXT_TO_MIME[getExtension(file.name)] ?? "";
}

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    getExtension(file.name) === "pdf"
  );
}

function isSupportedImageInput(file: File): boolean {
  const mime = resolveMimeType(file);
  if (mime.startsWith("image/")) return true;
  return Boolean(EXT_TO_MIME[getExtension(file.name)]);
}

async function decodeImageFallback(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      img.src = objectUrl;
    });

    const rawWidth = image.naturalWidth || image.width;
    const rawHeight = image.naturalHeight || image.height;
    if (!rawWidth || !rawHeight) {
      throw new Error("Dimensi gambar tidak valid.");
    }

    const scale = Math.min(1, DEFAULT_MAX_DIMENSION / Math.max(rawWidth, rawHeight));
    const width = Math.max(1, Math.round(rawWidth * scale));
    const height = Math.max(1, Math.round(rawHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas tidak tersedia untuk memproses gambar.");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((out) => resolve(out), "image/jpeg", 0.8);
    });
    if (!blob) {
      throw new Error("Gagal mengonversi foto ke JPEG.");
    }

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Compress mobile/field camera photos client-side before upload so high-resolution
 * 5–10 MB camera photos shrink to ~300 KB without blocking weak-signal uploads.
 */
export async function compressFieldImageFile(
  file: File,
  options?: FieldImageCompressionOptions,
): Promise<File> {
  const allowPdf = options?.allowPdfPassthrough === true;
  const maxSizeMB = options?.maxSizeMB ?? DEFAULT_MAX_SIZE_MB;
  const maxWidthOrHeight = options?.maxWidthOrHeight ?? DEFAULT_MAX_DIMENSION;
  const hardLimitBytes = options?.hardLimitBytes ?? DEFAULT_HARD_LIMIT_BYTES;

  if (file.size < 1) {
    throw new Error(`File "${file.name}" kosong.`);
  }

  if (allowPdf && isPdfFile(file)) {
    if (file.size > hardLimitBytes) {
      const limitMb = Math.round(hardLimitBytes / (1024 * 1024));
      throw new Error(`Ukuran file PDF "${file.name}" maksimal ${limitMb} MB.`);
    }
    return file;
  }

  if (!isSupportedImageInput(file)) {
    throw new Error(
      `Format "${file.name}" tidak didukung. Pilih foto JPG, PNG, atau WEBP.`,
    );
  }

  const detectedMime = resolveMimeType(file);
  if (
    ALLOWED_IMAGE_MIMES.has(detectedMime) &&
    file.size <= FAST_PATH_MAX_BYTES
  ) {
    return file.type === detectedMime
      ? file
      : new File([file], file.name, {
          type: detectedMime,
          lastModified: file.lastModified || Date.now(),
        });
  }

  const targetMime =
    detectedMime === "image/webp" ? "image/webp" : "image/jpeg";
  const targetExtension = targetMime === "image/webp" ? "webp" : "jpg";

  let compressed: File;
  try {
    const result = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: false,
      initialQuality: 0.82,
      maxIteration: 8,
      fileType: targetMime,
    });
    const outputMime = ALLOWED_IMAGE_MIMES.has(result.type)
      ? result.type
      : targetMime;
    const outputName = replaceExtension(
      file.name,
      outputMime === "image/webp"
        ? "webp"
        : outputMime === "image/png"
          ? "png"
          : targetExtension,
    );
    compressed = new File([result], outputName, {
      type: outputMime,
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    compressed = await decodeImageFallback(file);
  }

  if (compressed.size > hardLimitBytes) {
    const limitMb = Math.round(hardLimitBytes / (1024 * 1024));
    throw new Error(
      `Ukuran foto "${file.name}" masih melebihi ${limitMb} MB setelah dikompresi.`,
    );
  }

  return compressed;
}

/** Compress multiple field photos sequentially to avoid excessive memory pressure on mobile devices. */
export async function compressFieldImageFiles(
  files: File[],
  options?: FieldImageCompressionOptions,
): Promise<File[]> {
  const compressed: File[] = [];
  for (const file of files) {
    compressed.push(await compressFieldImageFile(file, options));
  }
  return compressed;
}
