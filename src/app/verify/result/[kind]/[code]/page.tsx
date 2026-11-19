import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SPKStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import DocumentValidationViewer, {
  type VerificationDocument,
} from "@/components/documents/DocumentValidationViewer";
import type { VerificationDocumentKind } from "@/lib/documents/verification-url";

export const metadata: Metadata = {
  title: "Sistem Validasi Data",
  robots: { index: false, follow: false },
};

type RouteParams = Promise<{ kind: string; code: string }>;

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function formatDate(value: Date | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: "Asia/Jakarta",
      }).format(value)
    : "—";
}

function formatDateTime(value: Date | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(value)
    : "—";
}

function fingerprint(kind: string, code: string): string {
  const hash = createHash("sha256")
    .update(`${kind}:${code}`)
    .digest("hex")
    .toUpperCase();
  return `#SPE-${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function createDocument(
  kind: VerificationDocumentKind,
  code: string,
  values: Omit<VerificationDocument, "kind" | "validationId" | "scannedAt">,
): VerificationDocument {
  return {
    ...values,
    kind,
    validationId: fingerprint(kind, code),
    scannedAt: formatDateTime(new Date()),
  };
}

async function loadPurchaseOrder(code: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { OR: [{ publicCode: code }, { poNumber: code }, { id: code }] },
    select: {
      publicCode: true,
      poNumber: true,
      vendorName: true,
      createdAt: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) return null;

  const isValid = Boolean(order.approvedAt && order.approvedBy);
  return createDocument("po", order.publicCode, {
    type: "PURCHASE ORDER (PO)",
    documentNumber: order.poNumber,
    issueDate: formatDate(order.approvedAt ?? order.createdAt),
    partner: order.vendorName,
    createdBy: order.createdBy?.name ?? "Logistik",
    status: isValid
      ? "Disetujui Direktur/Wakil Direktur · QR tersedia"
      : "Menunggu persetujuan Direktur/Wakil Direktur",
    isValid,
    previewUrl: `/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(order.publicCode)}`,
    details: [
      {
        label: "Disetujui Oleh",
        value: order.approvedBy?.name ?? "Belum disetujui",
      },
      {
        label: "Diperiksa Oleh · Keuangan",
        value: order.reviewedBy?.name ?? "Belum diperiksa",
      },
    ],
  });
}

async function loadDeliveryOrder(code: string) {
  const order = await prisma.deliveryOrder.findFirst({
    where: { OR: [{ publicCode: code }, { doNumber: code }, { id: code }] },
    select: {
      publicCode: true,
      doNumber: true,
      status: true,
      createdAt: true,
      signedAt: true,
      signedBy: { select: { name: true } },
      acknowledgedAt: true,
      acknowledgedBy: { select: { name: true } },
      receiverName: true,
      ticket: {
        select: {
          ticketNumber: true,
          project: { select: { vendor: true, clientName: true } },
        },
      },
      po: { select: { vendorName: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) return null;

  const isValid = Boolean(order.publicCode);
  return createDocument("do", order.publicCode, {
    type: "SURAT JALAN (DELIVERY ORDER)",
    documentNumber: order.doNumber,
    issueDate: formatDate(order.signedAt ?? order.createdAt),
    partner:
      order.receiverName ??
      order.po?.vendorName ??
      order.ticket?.project?.vendor ??
      order.ticket?.project?.clientName ??
      "—",
    createdBy: order.signedBy?.name ?? order.createdBy?.name ?? "Logistik",
    status: "Terverifikasi · QR tersedia",
    isValid,
    previewUrl: `/api/documents/transactions?kind=DO&publicCode=${encodeURIComponent(order.publicCode)}`,
    details: [
      { label: "No. Tiket", value: order.ticket?.ticketNumber ?? "—" },
      {
        label: "Diketahui Oleh",
        value: order.acknowledgedBy?.name ?? "Belum dikonfirmasi",
      },
      { label: "Status Pengiriman", value: order.status.replaceAll("_", " ") },
    ],
  });
}

async function loadMaterialDelivery(code: string) {
  const delivery = await prisma.materialDelivery.findFirst({
    where: {
      OR: [{ publicCode: code }, { id: code }, { doNumber: code }],
    },
    select: {
      id: true,
      publicCode: true,
      doNumber: true,
      deliveryDate: true,
      vehiclePlate: true,
      driverName: true,
      quantityReceived: true,
      createdAt: true,
      contract: {
        select: {
          contractNumber: true,
          vendorName: true,
          materialType: true,
          unit: true,
        },
      },
      project: {
        select: {
          kelompokTani: true,
          title: true,
        },
      },
      ticket: {
        select: { ticketNumber: true },
      },
      receivedBy: {
        select: { name: true },
      },
    },
  });
  if (!delivery) return null;

  const volumeText = `${delivery.quantityReceived.toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  })} ${delivery.contract.unit}`;
  const vendorFleetLabel =
    [delivery.vehiclePlate, delivery.driverName].filter(Boolean).join(" · ") ||
    "Armada & Mover Vendor Sendiri";
  const resolvedCode = delivery.publicCode ?? delivery.id;

  return createDocument("sj", resolvedCode, {
    type: "SURAT JALAN MATERIAL ALAM",
    documentNumber: delivery.doNumber,
    issueDate: formatDate(delivery.deliveryDate ?? delivery.createdAt),
    partner: delivery.contract.vendorName,
    createdBy: delivery.receivedBy?.name ?? "Logistik",
    status: "Terverifikasi · Kontrak Payung Material Alam",
    isValid: true,
    previewUrl: `/api/documents/transactions?kind=SJ&publicCode=${encodeURIComponent(resolvedCode)}`,
    details: [
      { label: "No. Kontrak Payung", value: delivery.contract.contractNumber },
      {
        label: "Material & Volume",
        value: `${delivery.contract.materialType} · ${volumeText}`,
      },
      {
        label: "Proyek Tujuan",
        value: delivery.project.kelompokTani || delivery.project.title || "—",
      },
      { label: "No. Tiket", value: delivery.ticket?.ticketNumber ?? "—" },
      { label: "Armada Vendor", value: vendorFleetLabel },
    ],
  });
}

async function loadInvoice(code: string) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [{ publicCode: code }, { invoiceNumber: code }, { id: code }],
    },
    select: {
      id: true,
      publicCode: true,
      invoiceNumber: true,
      vendorName: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      signedAt: true,
      signedBy: { select: { name: true } },
      acknowledgedAt: true,
      acknowledgedBy: { select: { name: true } },
    },
  });
  if (!invoice) return null;

  const isValid = Boolean(invoice.signedAt);
  const resolvedCode = invoice.publicCode ?? invoice.id;
  return createDocument("invoice", resolvedCode, {
    type: "INVOICE",
    documentNumber: invoice.invoiceNumber ?? "Tanpa Nomor",
    issueDate: formatDate(invoice.signedAt ?? invoice.createdAt),
    partner: invoice.vendorName,
    createdBy: invoice.signedBy?.name ?? "Keuangan",
    status: isValid
      ? "Terverifikasi · QR tersedia"
      : "Belum ditandatangani Keuangan",
    isValid,
    previewUrl: `/api/documents/transactions?kind=INVOICE&publicCode=${encodeURIComponent(resolvedCode)}`,
    details: [
      { label: "Status Pembayaran", value: invoice.status.replaceAll("_", " ") },
      { label: "Total Invoice", value: currency.format(invoice.grandTotal) },
      {
        label: "Diketahui Oleh",
        value: invoice.acknowledgedBy?.name ?? "Belum dikonfirmasi",
      },
    ],
  });
}

async function loadOrderConfirmation(code: string) {
  const order = await prisma.orderConfirmation.findFirst({
    where: {
      OR: [{ publicCode: code }, { koNumber: code }, { id: code }],
    },
    select: {
      id: true,
      publicCode: true,
      koNumber: true,
      paymentType: true,
      paymentAmount: true,
      paidAt: true,
      createdAt: true,
      signedAt: true,
      signedBy: { select: { name: true } },
      acknowledgedAt: true,
      acknowledgedBy: { select: { name: true } },
      po: { select: { vendorName: true, poNumber: true } },
    },
  });
  if (!order) return null;

  const isValid = Boolean(order.signedAt);
  const resolvedCode = order.publicCode ?? order.id;
  return createDocument("ko", resolvedCode, {
    type: "KONFIRMASI ORDER",
    documentNumber: order.koNumber,
    issueDate: formatDate(order.paidAt ?? order.createdAt),
    partner: order.po.vendorName,
    createdBy: order.signedBy?.name ?? "Logistik",
    status: isValid
      ? "Terverifikasi · QR tersedia"
      : "Belum ditandatangani Logistik",
    isValid,
    previewUrl: `/api/documents/transactions?kind=KO&publicCode=${encodeURIComponent(resolvedCode)}`,
    details: [
      { label: "No. PO", value: order.po.poNumber },
      {
        label: "Jenis Pembayaran",
        value: order.paymentType?.replaceAll("_", " ") ?? "—",
      },
      {
        label: "Nominal Pembayaran",
        value:
          order.paymentAmount === null
            ? "—"
            : currency.format(order.paymentAmount),
      },
      {
        label: "Diketahui Oleh",
        value: order.acknowledgedBy?.name ?? "Belum dikonfirmasi",
      },
    ],
  });
}

async function loadConstructionDocument(
  kind: "spk" | "bast",
  code: string,
) {
  if (kind === "spk") {
    const contract = await prisma.subkonContract.findFirst({
      where: {
        OR: [{ publicCode: code }, { contractNumber: code }, { id: code }],
      },
      select: {
        publicCode: true,
        contractNumber: true,
        subkonName: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        approvedBy: { select: { name: true } },
        project: { select: { kelompokTani: true, title: true } },
      },
    });
    if (!contract) return null;
    const isValid = contract.status === SPKStatus.ACTIVE;
    return createDocument("spk", contract.publicCode, {
      type: "SURAT PERINTAH KERJA (SPK)",
      documentNumber: contract.contractNumber,
      issueDate: formatDate(contract.approvedAt ?? contract.createdAt),
      partner: contract.subkonName,
      createdBy: contract.approvedBy?.name ?? "—",
      status: isValid ? "Valid" : contract.status.replaceAll("_", " "),
      isValid,
      previewUrl: `/api/documents/construction?publicCode=${encodeURIComponent(contract.publicCode)}`,
      details: [
        {
          label: "Proyek",
          value: contract.project.kelompokTani ?? contract.project.title,
        },
      ],
    });
  }

  const bast = await prisma.bASTDocument.findFirst({
    where: {
      OR: [{ publicCode: code }, { bastNumber: code }, { id: code }],
    },
    select: {
      publicCode: true,
      bastNumber: true,
      type: true,
      date: true,
      isApproved: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      project: { select: { kelompokTani: true, title: true } },
    },
  });
  if (!bast) return null;
  return createDocument("bast", bast.publicCode, {
    type: `BERITA ACARA SERAH TERIMA (${bast.type})`,
    documentNumber: bast.bastNumber,
    issueDate: formatDate(bast.approvedAt ?? bast.date),
    partner: bast.project.kelompokTani ?? bast.project.title,
    createdBy: bast.approvedBy?.name ?? "—",
    status: bast.isApproved ? "Valid" : "Belum disetujui",
    isValid: bast.isApproved,
    previewUrl: `/api/documents/construction?publicCode=${encodeURIComponent(bast.publicCode)}`,
  });
}

async function loadIssuedDocument(code: string) {
  const issued = await prisma.issuedDocument.findFirst({
    where: { OR: [{ id: code }, { documentNumber: code }] },
    select: {
      id: true,
      documentNumber: true,
      status: true,
      createdAt: true,
      relatedRecordId: true,
      template: { select: { type: true } },
      issuer: { select: { name: true } },
    },
  });
  if (!issued) return null;

  const isValid = issued.status === "VALID";
  return createDocument("issued", issued.id, {
    type: issued.template.type.replaceAll("_", " "),
    documentNumber: issued.documentNumber,
    issueDate: formatDate(issued.createdAt),
    partner: "PT Skala Prioritas Engineering",
    createdBy: issued.issuer.name,
    status: isValid ? "Valid" : "Dicabut",
    isValid,
    previewUrl: Boolean(issued.relatedRecordId)
      ? `/api/documents/issued/${encodeURIComponent(issued.id)}/pdf`
      : null,
  });
}

export default async function DocumentVerificationPage({
  params,
}: {
  params: RouteParams;
}) {
  const { kind: rawKind, code } = await params;
  const kinds: VerificationDocumentKind[] = [
    "po",
    "do",
    "sj",
    "invoice",
    "ko",
    "spk",
    "bast",
    "issued",
  ];
  let decodedCode: string;
  try {
    decodedCode = decodeURIComponent(code).trim();
  } catch {
    decodedCode = code.trim();
  }
  if (
    !kinds.includes(rawKind as VerificationDocumentKind) ||
    !decodedCode ||
    decodedCode.length > 128
  ) {
    notFound();
  }

  const kind = rawKind as VerificationDocumentKind;
  const document =
    kind === "po"
      ? await loadPurchaseOrder(decodedCode)
      : kind === "do"
        ? await loadDeliveryOrder(decodedCode)
        : kind === "sj"
          ? await loadMaterialDelivery(decodedCode)
          : kind === "invoice"
            ? await loadInvoice(decodedCode)
            : kind === "ko"
              ? await loadOrderConfirmation(decodedCode)
              : kind === "spk" || kind === "bast"
                ? await loadConstructionDocument(kind, decodedCode)
                : await loadIssuedDocument(decodedCode);

  if (!document) notFound();
  return <DocumentValidationViewer document={document} />;
}
