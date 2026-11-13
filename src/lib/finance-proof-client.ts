import {
  detectImageMimeFromBytes,
  getFinancePaymentProofMimeType,
  hasPdfSignature,
} from "@/lib/finance-payment-proof-file";

export const FINANCE_PROOF_MAX_BYTES = 5 * 1024 * 1024;
const FAST_PATH_MAX_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;

export const FINANCE_PROOF_ACCEPT_ALL =
  "image/*,.heic,.heif,.pdf,application/pdf";
export const FINANCE_PROOF_ACCEPT_IMAGES = "image/*,.heic,.heif";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
  "avif",
  "bmp",
  "gif",
  "tif",
  "tiff",
]);

function ensureExtension(name: string, ext: string): string {
  const trimmed = name.trim() || "bukti-transaksi";
  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;
  return `${base}.${ext}`;
}

async function decodeImageElement(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToJpegBlob(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function transcodeToJpegFile(
  fileName: string,
  buffer: ArrayBuffer,
  mimeType: string,
  maxBytes: number,
): Promise<File> {
  const sourceBlob = new Blob([buffer], { type: mimeType || "image/jpeg" });
  let bitmap: ImageBitmap | null = null;
  let imageEl: HTMLImageElement | null = null;

  try {
    // Try createImageBitmap first, falling back to <img> which natively decodes HEIC on Safari.
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(sourceBlob);
      } catch {
        bitmap = null;
      }
    }
    if (!bitmap) {
      imageEl = await decodeImageElement(sourceBlob);
    }

    const source = bitmap ?? imageEl!;
    const rawWidth =
      bitmap ? bitmap.width : imageEl!.naturalWidth || imageEl!.width;
    const rawHeight =
      bitmap ? bitmap.height : imageEl!.naturalHeight || imageEl!.height;

    if (!rawWidth || !rawHeight) {
      throw new Error("Ukuran foto tidak valid.");
    }

    for (const maxDim of [MAX_IMAGE_DIMENSION, 1280]) {
      const scale = Math.min(1, maxDim / Math.max(rawWidth, rawHeight));
      const width = rawWidth * scale;
      const height = rawHeight * scale;
      for (const quality of [0.86, 0.72, 0.56, 0.42]) {
        const blob = await canvasToJpegBlob(source, width, height, quality);
        if (blob && blob.size > 0 && blob.size <= maxBytes) {
          const outBuffer = await blob.arrayBuffer();
          return new File([outBuffer], ensureExtension(fileName, "jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }
    }

    throw new Error(
      `Foto terlalu besar untuk dikompres di bawah ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "IMAGE_DECODE_FAILED"
    ) {
      throw new Error(
        "Format foto ini belum didukung browser Anda. Gunakan JPG/PNG/WEBP/PDF atau unggah lewat Safari iPhone/Mac.",
      );
    }
    throw error;
  } finally {
    bitmap?.close?.();
  }
}

export async function prepareFinanceProofFile(
  file: File,
  options?: { allowPdf?: boolean; maxBytes?: number },
): Promise<File> {
  const allowPdf = options?.allowPdf ?? true;
  const maxBytes = options?.maxBytes ?? FINANCE_PROOF_MAX_BYTES;

  if (file.size < 1) {
    throw new Error("File kosong atau belum selesai diunduh.");
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error(
      "File tidak dapat dibaca oleh browser. Silakan pilih ulang file tersebut.",
    );
  }
  if (buffer.byteLength < 1) {
    throw new Error("File kosong atau belum selesai diunduh.");
  }

  const bytes = new Uint8Array(buffer);
  const declaredMime = getFinancePaymentProofMimeType(file);
  const looksLikePdf =
    declaredMime === "application/pdf" || hasPdfSignature(bytes);

  if (looksLikePdf) {
    if (!allowPdf) {
      throw new Error("Foto pengganti harus berformat gambar (JPG, PNG, WEBP, atau HEIC).");
    }
    if (!hasPdfSignature(bytes)) {
      throw new Error("Isi file PDF tidak valid atau rusak.");
    }
    if (buffer.byteLength > maxBytes) {
      throw new Error(
        `Ukuran file PDF maksimal ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
      );
    }
    return new File([buffer], ensureExtension(file.name, "pdf"), {
      type: "application/pdf",
      lastModified: file.lastModified,
    });
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const rawType = file.type.split(";")[0].trim().toLowerCase();
  const detectedImageMime = detectImageMimeFromBytes(bytes);
  const looksLikeImage =
    rawType.startsWith("image/") ||
    IMAGE_EXTENSIONS.has(extension) ||
    detectedImageMime !== null;

  if (!looksLikeImage) {
    throw new Error(
      allowPdf
        ? "Format file harus PDF, JPG, PNG, WEBP, atau HEIC."
        : "Format foto harus JPG, PNG, WEBP, atau HEIC.",
    );
  }

  // Keep valid small JPG/PNG/WEBP bytes directly in RAM to avoid Safari file-handle eviction.
  if (detectedImageMime && buffer.byteLength <= FAST_PATH_MAX_BYTES) {
    const ext =
      detectedImageMime === "image/png"
        ? "png"
        : detectedImageMime === "image/webp"
          ? "webp"
          : "jpg";
    return new File([buffer], ensureExtension(file.name, ext), {
      type: detectedImageMime,
      lastModified: file.lastModified,
    });
  }

  return transcodeToJpegFile(file.name, buffer, rawType, maxBytes);
}

export async function prepareFinanceProofFiles(
  files: File[],
  options?: { allowPdf?: boolean; maxBytes?: number },
): Promise<{ prepared: File[]; error: string }> {
  const prepared: File[] = [];
  let firstError = "";

  for (const file of files) {
    try {
      prepared.push(await prepareFinanceProofFile(file, options));
    } catch (error) {
      if (!firstError) {
        firstError =
          error instanceof Error
            ? error.message
            : "Salah satu file bukti tidak valid.";
      }
    }
  }

  return { prepared, error: firstError };
}

