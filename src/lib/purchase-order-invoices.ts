import { PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER } from "@/lib/purchase-order-invoice-config";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";

export function isPurchaseOrderInvoiceUrl(url: string): boolean {
  if (
    url.startsWith(`/uploads/${PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER}/`) &&
    /\.(pdf|jpe?g|png|webp)$/i.test(url)
  ) {
    return true;
  }
  const cloudName = getCloudinaryCredentials()?.cloudName;
  if (!cloudName || url.length > 2048) return false;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.indexOf("upload");
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "res.cloudinary.com" ||
      parsed.search ||
      parsed.hash ||
      segments[0] !== cloudName ||
      !["image", "raw"].includes(segments[1] ?? "") ||
      uploadIndex !== 2
    ) {
      return false;
    }

    const versionIndex = segments.findIndex(
      (segment, index) => index > uploadIndex && /^v\d+$/.test(segment),
    );
    const assetStart = versionIndex >= 0 ? versionIndex + 1 : uploadIndex + 1;
    const publicId = segments.slice(assetStart).join("/");
    return (
      publicId.startsWith(`${PURCHASE_ORDER_INVOICE_CLOUDINARY_FOLDER}/`) &&
      /\.(pdf|jpe?g|png|webp)$/i.test(publicId)
    );
  } catch {
    return false;
  }
}
