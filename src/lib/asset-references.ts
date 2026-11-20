import { connectToMongoDB } from "@/lib/mongoose";
import { prisma } from "@/lib/prisma";
import { AssetRecordModel } from "@/models/asset-record";

export interface AssetReferenceIgnoreTarget {
  model:
    | "user"
    | "fieldSurvey"
    | "surveyFeature"
    | "surveyPhoto"
    | "projectProgressPhoto"
    | "projectWorkPointProgressPhoto"
    | "blueprint"
    | "drawingDocument"
    | "drawingLog"
    | "directStockPurchase"
    | "subkonContract"
    | "subkonTermyn"
    | "equipmentRental"
    | "ticket"
    | "purchaseOrder"
    | "paymentTransaction"
    | "deliveryOrder"
    | "deliveryOrderProof"
    | "vehicleFuelRequest"
    | "invoice"
    | "cashflow"
    | "officeExpense"
    | "orderConfirmation"
    | "materialDelivery"
    | "vendorInvoicePayment";
  id: string;
}

function idFilter(ignore: AssetReferenceIgnoreTarget | undefined, model: AssetReferenceIgnoreTarget["model"]) {
  return ignore?.model === model ? { NOT: { id: ignore.id } } : {};
}

export async function isAssetUrlReferencedInDb(
  rawUrl?: string | null,
  options?: {
    ignore?: AssetReferenceIgnoreTarget;
    publicId?: string | null;
  },
): Promise<boolean> {
  const url = rawUrl?.trim();
  if (!url) return false;

  const ignore = options?.ignore;

  const counts = await Promise.all([
    prisma.user.count({
      where: { profilePhotoUrl: url, ...idFilter(ignore, "user") },
      take: 1,
    }),
    prisma.fieldSurvey.count({
      where: { documentationUrls: { has: url }, ...idFilter(ignore, "fieldSurvey") },
      take: 1,
    }),
    prisma.surveyFeature.count({
      where: { photoUrls: { has: url }, ...idFilter(ignore, "surveyFeature") },
      take: 1,
    }),
    prisma.surveyPhoto.count({
      where: { url, ...idFilter(ignore, "surveyPhoto") },
      take: 1,
    }),
    prisma.projectProgressPhoto.count({
      where: {
        OR: [{ url }, { fileUrl: url }],
        ...idFilter(ignore, "projectProgressPhoto"),
      },
      take: 1,
    }),
    prisma.projectWorkPointProgressPhoto.count({
      where: {
        OR: [{ url }, { fileUrl: url }],
        ...idFilter(ignore, "projectWorkPointProgressPhoto"),
      },
      take: 1,
    }),
    prisma.blueprint.count({
      where: { fileUrl: url, ...idFilter(ignore, "blueprint") },
      take: 1,
    }),
    prisma.drawingDocument.count({
      where: {
        OR: [{ fileUrl: url }, { thumbnailUrl: url }],
        ...idFilter(ignore, "drawingDocument"),
      },
      take: 1,
    }),
    prisma.drawingLog.count({
      where: { fileUrl: url, ...idFilter(ignore, "drawingLog") },
      take: 1,
    }),
    prisma.directStockPurchase.count({
      where: {
        OR: [
          { vendorInvoiceUrl: url },
          { arrivalPhotoUrl: url },
          { receivedPhotos: { has: url } },
        ],
        ...idFilter(ignore, "directStockPurchase"),
      },
      take: 1,
    }),
    prisma.subkonContract.count({
      where: { retentionReleaseProofUrl: url, ...idFilter(ignore, "subkonContract") },
      take: 1,
    }),
    prisma.subkonTermyn.count({
      where: { paymentProofUrl: url, ...idFilter(ignore, "subkonTermyn") },
      take: 1,
    }),
    prisma.equipmentRental.count({
      where: { proofOfPaymentUrl: url, ...idFilter(ignore, "equipmentRental") },
      take: 1,
    }),
    prisma.ticket.count({
      where: {
        OR: [
          { attachmentUrl: url },
          { receiptUrls: { has: url } },
          { paymentProofUrl: url },
          { purchaseReceiptUrl: url },
          { transferReceiptUrl: url },
          { deliveryReceiptUrl: url },
          { deliveryOrderReceiptUrl: url },
        ],
        ...idFilter(ignore, "ticket"),
      },
      take: 1,
    }),
    prisma.purchaseOrder.count({
      where: {
        OR: [{ paymentReceiptUrl: url }, { vendorInvoiceUrl: url }],
        ...idFilter(ignore, "purchaseOrder"),
      },
      take: 1,
    }),
    prisma.paymentTransaction.count({
      where: {
        OR: [{ proofOfTransferUrl: url }, { additionalProofUrls: { has: url } }],
        ...idFilter(ignore, "paymentTransaction"),
      },
      take: 1,
    }),
    prisma.deliveryOrder.count({
      where: {
        OR: [{ arrivalPhotoUrl: url }, { deliveryReceiptUrl: url }],
        ...idFilter(ignore, "deliveryOrder"),
      },
      take: 1,
    }),
    prisma.deliveryOrderProof.count({
      where: { url, ...idFilter(ignore, "deliveryOrderProof") },
      take: 1,
    }),
    prisma.vehicleFuelRequest.count({
      where: {
        OR: [
          { transferProofUrl: url },
          { beforeFillingPhotoUrl: url },
          { afterFillingPhotoUrl: url },
          { receiptPhotoUrl: url },
        ],
        ...idFilter(ignore, "vehicleFuelRequest"),
      },
      take: 1,
    }),
    prisma.invoice.count({
      where: { documentUrl: url, ...idFilter(ignore, "invoice") },
      take: 1,
    }),
    prisma.cashflow.count({
      where: { proofUrl: url, ...idFilter(ignore, "cashflow") },
      take: 1,
    }),
    prisma.officeExpense.count({
      where: { proofUrls: { has: url }, ...idFilter(ignore, "officeExpense") },
      take: 1,
    }),
    prisma.orderConfirmation.count({
      where: { proofOfTransferUrl: url, ...idFilter(ignore, "orderConfirmation") },
      take: 1,
    }),
    prisma.materialDelivery.count({
      where: { proofUrl: url, ...idFilter(ignore, "materialDelivery") },
      take: 1,
    }),
    prisma.vendorInvoicePayment.count({
      where: { proofOfTransferUrl: url, ...idFilter(ignore, "vendorInvoicePayment") },
      take: 1,
    }),
  ]);

  if (counts.some((count) => count > 0)) {
    return true;
  }

  // Legacy safeguard: older uploads created duplicate URL versions under generic `.../file` publicId.
  // Before calling provider destroy on a `publicId`, verify no other live AssetRecord or photo table uses that publicId.
  const publicId = options?.publicId?.trim();
  if (publicId) {
    const [progressByPublicId, workPointByPublicId] = await Promise.all([
      prisma.projectProgressPhoto.count({
        where: { publicId, ...idFilter(ignore, "projectProgressPhoto") },
        take: 1,
      }),
      prisma.projectWorkPointProgressPhoto.count({
        where: { publicId, ...idFilter(ignore, "projectWorkPointProgressPhoto") },
        take: 1,
      }),
    ]);
    if (progressByPublicId > 0 || workPointByPublicId > 0) {
      return true;
    }

    await connectToMongoDB();
    const siblingAsset = await AssetRecordModel.findOne({
      publicId,
      deletedAt: null,
      url: { $ne: url },
    })
      .select("_id")
      .lean();
    if (siblingAsset) {
      return true;
    }
  }

  return false;
}
