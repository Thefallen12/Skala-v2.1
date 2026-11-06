import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocType, SPKStatus } from "@prisma/client";
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
  const order = await prisma.purchaseOrder.findUnique({
    where: { publicCode: code },
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
  return createDocument("po", code, {
    type: "PURCHASE ORDER (PO)",
    documentNumber: order.poNumber,
    issueDate: formatDate(order.approvedAt ?? order.createdAt),
    partner: order.vendorName,
    createdBy: order.createdBy?.name ?? "Logistik",
    status: isValid
      ? "Disetujui Direktur/Wakil Direktur · QR tersedia"
      : "Menunggu persetujuan Direktur/Wakil Direktur",
    isValid,
    previewUrl: `/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(code)}`,
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
  const order = await prisma.deliveryOrder.findUnique({
    where: { publicCode: code },
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
  return createDocument("do", code, {
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
    previewUrl: `/api/documents/transactions?kind=DO&publicCode=${encodeURIComponent(code)}`,
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

async function loadInvoice(code: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { publicCode: code },
    select: {
      id: true,
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
  return createDocument("invoice", code, {
    type: "INVOICE",
    documentNumber: invoice.invoiceNumber ?? "Tanpa Nomor",
    issueDate: formatDate(invoice.signedAt ?? invoice.createdAt),
    partner: invoice.vendorName,
    createdBy: invoice.signedBy?.name ?? "Keuangan",
    status: isValid
      ? "Terverifikasi · QR tersedia"
      : "QR verifikasi belum tersedia",
    isValid,
    previewUrl: isValid && invoice.acknowledgedAt
      ? `/api/documents/transactions?kind=INVOICE&publicCode=${encodeURIComponent(code)}`
      : null,
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
  const order = await prisma.orderConfirmation.findUnique({
    where: { publicCode: code },
    select: {
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
  return createDocument("ko", code, {
    type: "KONFIRMASI ORDER",
    documentNumber: order.koNumber,
    issueDate: formatDate(order.paidAt ?? order.createdAt),
    partner: order.po.vendorName,
    createdBy: order.signedBy?.name ?? "Logistik",
    status: isValid
      ? "Terverifikasi · QR tersedia"
      : "QR verifikasi belum tersedia",
    isValid,
    previewUrl: isValid && order.acknowledgedAt
      ? `/api/documents/transactions?kind=KO&publicCode=${encodeURIComponent(code)}`
      : null,
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
    const contract = await prisma.subkonContract.findUnique({
      where: { publicCode: code },
      select: {
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
    return createDocument("spk", code, {
      type: "SURAT PERINTAH KERJA (SPK)",
      documentNumber: contract.contractNumber,
      issueDate: formatDate(contract.approvedAt ?? contract.createdAt),
      partner: contract.subkonName,
      createdBy: contract.approvedBy?.name ?? "—",
      status: isValid ? "Valid" : contract.status.replaceAll("_", " "),
      isValid,
      previewUrl: isValid
        ? `/api/documents/construction?publicCode=${encodeURIComponent(code)}`
        : null,
      details: [
        {
          label: "Proyek",
          value: contract.project.kelompokTani ?? contract.project.title,
        },
      ],
    });
  }

  const bast = await prisma.bASTDocument.findUnique({
    where: { publicCode: code },
    select: {
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
  return createDocument("bast", code, {
    type: `BERITA ACARA SERAH TERIMA (${bast.type})`,
    documentNumber: bast.bastNumber,
    issueDate: formatDate(bast.approvedAt ?? bast.date),
    partner: bast.project.kelompokTani ?? bast.project.title,
    createdBy: bast.approvedBy?.name ?? "—",
    status: bast.isApproved ? "Valid" : "Belum disetujui",
    isValid: bast.isApproved,
    previewUrl: bast.isApproved
      ? `/api/documents/construction?publicCode=${encodeURIComponent(code)}`
      : null,
  });
}

async function loadIssuedDocument(code: string) {
  const issued = await prisma.issuedDocument.findUnique({
    where: { id: code },
    select: {
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
  const isPdfAvailable =
    issued.template.type === DocType.PURCHASE_ORDER &&
    Boolean(issued.relatedRecordId);
  return createDocument("issued", code, {
    type: issued.template.type.replaceAll("_", " "),
    documentNumber: issued.documentNumber,
    issueDate: formatDate(issued.createdAt),
    partner: "PT Skala Prioritas Engineering",
    createdBy: issued.issuer.name,
    status: isValid ? "Valid" : "Dicabut",
    isValid,
    previewUrl: isValid && isPdfAvailable
      ? `/api/documents/issued/${encodeURIComponent(code)}/pdf`
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
    "invoice",
    "ko",
    "spk",
    "bast",
    "issued",
  ];
  if (
    !kinds.includes(rawKind as VerificationDocumentKind) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(code)
  ) {
    notFound();
  }

  const kind = rawKind as VerificationDocumentKind;
  const document =
    kind === "po"
      ? await loadPurchaseOrder(code)
      : kind === "do"
        ? await loadDeliveryOrder(code)
        : kind === "invoice"
          ? await loadInvoice(code)
          : kind === "ko"
            ? await loadOrderConfirmation(code)
            : kind === "spk" || kind === "bast"
              ? await loadConstructionDocument(kind, code)
              : await loadIssuedDocument(code);

  if (!document) notFound();
  return <DocumentValidationViewer document={document} />;
}
