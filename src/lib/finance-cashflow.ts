import { getCloudinaryPublicId } from "@/lib/cloudinary-photos";
import { isCloudinaryPrivateTicketReceiptPdf } from "@/lib/cloudinary-private-pdfs";
import { FINANCE_CASHFLOW_CLOUDINARY_FOLDER } from "@/lib/finance-cashflow-config";
import { FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER } from "@/lib/finance-payment-proof-config";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import { extractGoogleDriveFileId } from "@/lib/google-drive-storage";

export type CashflowPaymentMethod = "TRANSFER" | "CASH" | "DEPOSIT";

export function isFinanceCashflowProofUrl(url: string): boolean {
  if (isCloudinaryPrivateTicketReceiptPdf(url)) return true;
  if (extractGoogleDriveFileId(url)) return true;
  if (/^\/api\/tickets\/receipts\/[^/?#]+(?:\?[^#]*)?$/i.test(url)) return true;

  try {
    const parsed = new URL(url);
    const cloudName = getCloudinaryCredentials()?.cloudName;
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = pathSegments.indexOf("upload");
    const publicId = getCloudinaryPublicId(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      Boolean(cloudName) &&
      pathSegments[0] === cloudName &&
      uploadIndex > 0 &&
      (pathSegments[uploadIndex - 1] === "image" ||
        pathSegments[uploadIndex - 1] === "raw") &&
      Boolean(
        publicId &&
          (publicId.startsWith(`${FINANCE_CASHFLOW_CLOUDINARY_FOLDER}/`) ||
            publicId.startsWith(`${FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER}/`)),
      )
    );
  } catch {
    return false;
  }
}

export function isCashflowPaymentMethod(
  value: string,
): value is CashflowPaymentMethod {
  return value === "TRANSFER" || value === "CASH" || value === "DEPOSIT";
}
