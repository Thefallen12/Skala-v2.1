import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  CloudinaryPhotoValidationError,
  removeCloudinaryPhoto,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  removeCloudinaryPrivatePdf,
  uploadCloudinaryPrivatePdf,
} from "@/lib/cloudinary-private-pdfs";
import { normalizeFinancePaymentProofFile } from "@/lib/finance-payment-proof-file";
import {
  readPrivatePhoto,
  removePrivatePhoto,
} from "@/lib/private-photos";
import { TICKET_RECEIPT_PHOTO_CLOUDINARY_FOLDER } from "@/lib/ticket-receipt-photo-config";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const receiptDirectory = process.env.TICKET_UPLOAD_DIR
  ? resolve(process.env.TICKET_UPLOAD_DIR)
  : join(process.cwd(), ".private-data", "ticket-receipts");

const mimeExtensions = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type ReceiptMimeType = keyof typeof mimeExtensions;

function isReceiptMimeType(value: string): value is ReceiptMimeType {
  return Object.hasOwn(mimeExtensions, value);
}

function receiptPath(fileName: string): string | null {
  if (!/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.test(fileName)) {
    return null;
  }
  return join(receiptDirectory, fileName);
}

export async function saveTicketReceipt(file: File): Promise<string> {
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_RECEIPT_BYTES) {
    throw new Error("Ukuran file bukti harus lebih dari 0 dan maksimal 5 MB.");
  }
  const normalizedFile = normalizeFinancePaymentProofFile(file);
  if (!normalizedFile || !isReceiptMimeType(normalizedFile.type)) {
    throw new Error("Format file bukti harus PDF, JPG, PNG, atau WEBP.");
  }

  if (normalizedFile.type !== "application/pdf") {
    try {
      const photo = await uploadCloudinaryPhoto(
        normalizedFile,
        TICKET_RECEIPT_PHOTO_CLOUDINARY_FOLDER,
        MAX_RECEIPT_BYTES,
      );
      return photo.secureUrl;
    } catch (error) {
      if (error instanceof CloudinaryPhotoValidationError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  return uploadCloudinaryPrivatePdf(normalizedFile, MAX_RECEIPT_BYTES);
}

export async function removeTicketReceipt(url: string): Promise<void> {
  if (await removeCloudinaryPhoto(url)) return;
  if (await removeCloudinaryPrivatePdf(url)) return;
  if (
    await removePrivatePhoto(
      url,
      receiptDirectory,
      "/api/tickets/receipts",
    )
  ) {
    return;
  }
  const fileName = url.split("/").at(-1) ?? "";
  const path = receiptPath(fileName);
  if (!path) return;
  await rm(path, { force: true });
}

export async function readTicketReceipt(fileName: string): Promise<{
  bytes: Uint8Array;
  contentType: ReceiptMimeType;
} | null> {
  const extension = fileName.split(".").at(-1);
  if (extension !== "pdf") {
    return readPrivatePhoto(fileName, receiptDirectory);
  }
  const path = receiptPath(fileName);
  if (!path) return null;
  const contentType = "application/pdf";

  try {
    return {
      bytes: new Uint8Array(await readFile(/* turbopackIgnore: true */ path)),
      contentType,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}
