import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { documentVerificationPath } from "@/lib/documents/verification-url";

export default async function VerifyDocumentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  let decodedCode: string;
  try {
    decodedCode = decodeURIComponent(code).trim();
  } catch {
    decodedCode = code.trim();
  }
  if (!decodedCode || decodedCode.length > 128) {
    redirect("/verify");
  }

  const [
    purchaseOrder,
    deliveryOrder,
    materialDelivery,
    invoice,
    orderConfirmation,
    subkonContract,
    bastDocument,
    issuedDocument,
    progressSubmission,
    project,
  ] = await Promise.all([
    prisma.purchaseOrder.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { poNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true },
    }),
    prisma.deliveryOrder.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { doNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true },
    }),
    prisma.materialDelivery.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { doNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true, id: true },
    }),
    prisma.invoice.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { invoiceNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true, id: true },
    }),
    prisma.orderConfirmation.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { koNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true, id: true },
    }),
    prisma.subkonContract.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { contractNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true },
    }),
    prisma.bASTDocument.findFirst({
      where: {
        OR: [
          { publicCode: decodedCode },
          { bastNumber: decodedCode },
          { id: decodedCode },
        ],
      },
      select: { publicCode: true },
    }),
    prisma.issuedDocument.findFirst({
      where: {
        OR: [{ id: decodedCode }, { documentNumber: decodedCode }],
      },
      select: { id: true },
    }),
    prisma.projectProgressSubmission.findUnique({
      where: { portalCode: decodedCode },
      select: { portalCode: true },
    }),
    prisma.project.findFirst({
      where: { code: decodedCode, isDeleted: false },
      select: { code: true },
    }),
  ]);

  if (purchaseOrder) {
    redirect(documentVerificationPath("po", purchaseOrder.publicCode));
  }
  if (deliveryOrder) {
    redirect(documentVerificationPath("do", deliveryOrder.publicCode));
  }
  if (materialDelivery) {
    redirect(
      documentVerificationPath(
        "sj",
        materialDelivery.publicCode ?? materialDelivery.id,
      ),
    );
  }
  if (invoice) {
    redirect(documentVerificationPath("invoice", invoice.publicCode ?? invoice.id));
  }
  if (orderConfirmation) {
    redirect(
      documentVerificationPath(
        "ko",
        orderConfirmation.publicCode ?? orderConfirmation.id,
      ),
    );
  }
  if (subkonContract) {
    redirect(documentVerificationPath("spk", subkonContract.publicCode));
  }
  if (bastDocument) {
    redirect(documentVerificationPath("bast", bastDocument.publicCode));
  }
  if (issuedDocument) {
    redirect(documentVerificationPath("issued", issuedDocument.id));
  }
  if (progressSubmission) {
    redirect(`/portal/projects/${encodeURIComponent(progressSubmission.portalCode)}`);
  }
  if (project) {
    redirect(`/portal/projects/${encodeURIComponent(project.code)}`);
  }

  redirect(documentVerificationPath("issued", decodedCode));
}
