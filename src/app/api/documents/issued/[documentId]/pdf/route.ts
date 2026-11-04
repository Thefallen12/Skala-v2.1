import { NextRequest, NextResponse } from "next/server";
import { DocType, TicketType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateDocument,
  type DocumentLineItem,
} from "@/lib/documents/generate-document";
import { getDocumentHeaderLogoDataUrl } from "@/lib/documents/qr-code";
import { renderPdf } from "@/lib/documents/render-pdf";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const issued = await prisma.issuedDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true,
      documentNumber: true,
      templateId: true,
      relatedRecordId: true,
      issuedById: true,
      template: { select: { type: true } },
    },
  });
  if (
    !issued ||
    issued.status !== "VALID" ||
    issued.template.type !== DocType.PURCHASE_ORDER ||
    !issued.relatedRecordId
  ) {
    return NextResponse.json(
      { message: "Dokumen PDF tidak ditemukan atau sudah tidak valid." },
      { status: 404 },
    );
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: issued.relatedRecordId,
      type: TicketType.MATERIAL,
    },
    select: {
      ticketNumber: true,
      title: true,
      createdAt: true,
      totalAmount: true,
      requester: { select: { name: true } },
      project: {
        select: { title: true, vendor: true, clientName: true, location: true },
      },
      items: {
        select: {
          itemName: true,
          quantity: true,
          unit: true,
          estimatedCost: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
  const template = await prisma.documentTemplate.findUnique({
    where: { id: issued.templateId },
    select: { id: true, type: true },
  });
  if (!ticket || !template || template.type !== DocType.PURCHASE_ORDER) {
    return NextResponse.json(
      { message: "Data pembentuk Purchase Order tidak lagi tersedia." },
      { status: 404 },
    );
  }

  try {
    const headerLogoDataUrl = await getDocumentHeaderLogoDataUrl();
    const currency = (amount: number) =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(amount);
    const generated = await generateDocument(
      template.id,
      {
        nomor_request: ticket.ticketNumber,
        judul_request: ticket.title,
        nama_requester: ticket.requester.name,
        nama_proyek: ticket.project?.title ?? "—",
        nama_klien: ticket.project?.clientName ?? "—",
        total_biaya: ticket.totalAmount
          ? currency(decimalNumberFromScaledInteger(ticket.totalAmount))
          : "—",
        diskon: "—",
        pajak: "—",
        tanggal: ticket.createdAt,
        tanggal_spk: ticket.createdAt,
        due_date: "—",
        nama_vendor: ticket.project?.vendor ?? "Belum ditentukan",
        alamat_vendor: "—",
        kontak_vendor: "—",
        lokasi_pengiriman:
          ticket.project?.location ??
          ticket.project?.title ??
          "Sesuai koordinasi proyek",
        catatan: ticket.title,
        items: ticket.items.map((item): DocumentLineItem => {
          const unitPrice =
            item.estimatedCost === null
              ? 0
              : decimalNumberFromScaledInteger(item.estimatedCost);
          return {
            description: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.estimatedCost ? currency(unitPrice) : "—",
            amount: item.estimatedCost
              ? currency(unitPrice * item.quantity)
              : "—",
          };
        }),
      },
      {
        issuedById: issued.issuedById,
        relatedRecordId: issued.relatedRecordId,
        verificationBaseUrl: request.nextUrl.origin,
        existingIssuedDocumentId: issued.id,
      },
    );
    const html = `<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(issued.documentNumber)}</title>
          <style>
            @page { size: A4; margin: ${generated.pageMargins.top}mm ${generated.pageMargins.right}mm ${generated.pageMargins.bottom}mm ${generated.pageMargins.left}mm; }
            body { position: relative; padding-top: 64px; color: #1f2937; font: 11pt Arial, sans-serif; line-height: 1.6; }
            h1, h2, h3 { line-height: 1.25; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #a3a3a3; padding: 7px; text-align: left; }
            th { background: #f1f1f1; letter-spacing: .04em; text-transform: uppercase; }
            img { max-width: 100%; }
            .document-header-logo { position: absolute; top: 0; left: 0; width: 270px; max-height: 64px; object-fit: contain; object-position: left top; }
          </style>
        </head>
        <body>
          <img class="document-header-logo" src="${headerLogoDataUrl}" alt="Logo SKALA PRIORITAS ENGINEERING">
          ${generated.html}
        </body>
      </html>`;
    const pdf = await renderPdf(html);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${encodeURIComponent(issued.documentNumber)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Issued Purchase Order PDF preview failed:", error);
    return NextResponse.json(
      { message: "Pratinjau PDF PO gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
