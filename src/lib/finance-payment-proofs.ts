import { getCloudinaryPublicId } from "@/lib/cloudinary-photos";
import { isCloudinaryPrivateTicketReceiptPdf } from "@/lib/cloudinary-private-pdfs";
import { FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER } from "@/lib/finance-payment-proof-config";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";

export function isFinancePaymentProofUrl(url: string): boolean {
  if (isCloudinaryPrivateTicketReceiptPdf(url)) return true;
  if (url.startsWith(`/uploads/${FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER}/`)) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const publicId = getCloudinaryPublicId(url);
    const cloudName = getCloudinaryCredentials()?.cloudName;
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = pathSegments.indexOf("upload");
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      Boolean(cloudName) &&
      pathSegments[0] === cloudName &&
      uploadIndex > 0 &&
      pathSegments[uploadIndex - 1] === "image" &&
      Boolean(
        publicId?.startsWith(`${FINANCE_PAYMENT_PROOF_CLOUDINARY_FOLDER}/`),
      )
    );
  } catch {
    return false;
  }
}
