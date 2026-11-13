const FINANCE_PAYMENT_PROOF_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const FINANCE_PAYMENT_PROOF_MIME_ALIASES: Record<string, string> = {
  "application/x-pdf": "application/pdf",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

const FINANCE_PAYMENT_PROOF_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function detectImageMimeFromBytes(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  const header = new TextDecoder().decode(bytes.subarray(0, 1024));
  return header.includes("%PDF-");
}

export function getFinancePaymentProofMimeType(
  file: Pick<File, "name" | "type">,
): string | null {
  const rawMimeType = file.type.split(";")[0].trim().toLowerCase();
  const mimeType = FINANCE_PAYMENT_PROOF_MIME_ALIASES[rawMimeType] ?? rawMimeType;
  if (FINANCE_PAYMENT_PROOF_MIME_TYPES.has(mimeType)) return mimeType;

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return FINANCE_PAYMENT_PROOF_EXTENSIONS[extension] ?? null;
}

export function normalizeFinancePaymentProofFile(file: File): File | null {
  const mimeType = getFinancePaymentProofMimeType(file);
  if (!mimeType) return null;
  if (file.type === mimeType) return file;

  return new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified,
  });
}
