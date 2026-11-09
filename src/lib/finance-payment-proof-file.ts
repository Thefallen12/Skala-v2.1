const FINANCE_PAYMENT_PROOF_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const FINANCE_PAYMENT_PROOF_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function getFinancePaymentProofMimeType(
  file: Pick<File, "name" | "type">,
): string | null {
  const mimeType = file.type.split(";")[0].trim().toLowerCase();
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
