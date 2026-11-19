import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateDocument,
  type DocumentData,
  type DocumentLineItem,
} from "@/lib/documents/generate-document";
import {
  getRequestOrigin,
  resolvePublicAppUrl,
} from "@/lib/documents/public-app-url";
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
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
      createdAt: true,
      template: { select: { id: true, name: true, type: true } },
    },
  });
  if (!issued || issued.status !== "VALID") {
    return NextResponse.json(
      { message: "Dokumen tidak ditemukan atau sudah dicabut." },
      { status: 404 },
    );
  }

  let documentData: DocumentData | null = null;
  if (issued.relatedRecordId) {
    const [purchaseOrder, deliveryOrder, ticket] = await Promise.all([
      prisma.purchaseOrder.findUnique({
        where: { id: issued.relatedRecordId },
        select: {
          poNumber: true,
          vendorName: true,
          paymentTerms: true,
          createdAt: true,
          vendor: { select: { name: true, address: true, phone: true, email: true } },
          project: { select: { title: true, clientName: true, vendor: true, location: true } },
          ticket: {
            select: {
              ticketNumber: true,
              title: true,
              createdAt: true,
              requester: { select: { name: true } },
              project: { select: { title: true, clientName: true, vendor: true, location: true } },
            },
          },
          items: {
            orderBy: { id: "asc" },
            select: {
              itemName: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
      }),
      prisma.deliveryOrder.findUnique({
        where: { id: issued.relatedRecordId },
        select: {
          doNumber: true,
          deliveryMethod: true,
          vehicleDocumentNumber: true,
          vehiclePlate: true,
          vehiclePlateNumber: true,
          driverName: true,
          receiverName: true,
          receivedAt: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          ticket: {
            select: {
              ticketNumber: true,
              title: true,
              requester: { select: { name: true } },
              project: { select: { title: true, clientName: true, vendor: true, location: true } },
            },
          },
          po: {
            select: {
              poNumber: true,
              vendorName: true,
              vendor: { select: { name: true, address: true, phone: true } },
            },
          },
          items: {
            orderBy: { id: "asc" },
            select: {
              itemCode: true,
              itemName: true,
              qtyOrdered: true,
              qtyDelivered: true,
              unit: true,
              remarks: true,
            },
          },
        },
      }),
      prisma.ticket.findUnique({
        where: { id: issued.relatedRecordId },
        select: {
          ticketNumber: true,
          title: true,
          description: true,
          createdAt: true,
          totalAmount: true,
          requestedAmount: true,
          recipientName: true,
          requester: { select: { name: true } },
          project: { select: { title: true, vendor: true, clientName: true, location: true } },
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
      }),
    ]);

    if (purchaseOrder) {
      const total = purchaseOrder.items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );
      const site = purchaseOrder.ticket?.project ?? purchaseOrder.project;
      documentData = {
        nomor_request: purchaseOrder.ticket?.ticketNumber ?? purchaseOrder.poNumber,
        judul_request: purchaseOrder.ticket?.title ?? purchaseOrder.poNumber,
        nama_requester: purchaseOrder.ticket?.requester.name ?? "—",
        nama_proyek: site?.title ?? "—",
        nama_klien: site?.clientName ?? "—",
        total_biaya: formatCurrency(total),
        diskon: "—",
        pajak: "—",
        tanggal: purchaseOrder.createdAt,
        tanggal_spk: purchaseOrder.ticket?.createdAt ?? purchaseOrder.createdAt,
        due_date: purchaseOrder.paymentTerms ?? "—",
        nama_vendor:
          purchaseOrder.vendor?.name ?? site?.vendor ?? purchaseOrder.vendorName,
        alamat_vendor: purchaseOrder.vendor?.address ?? "—",
        kontak_vendor:
          purchaseOrder.vendor?.phone ?? purchaseOrder.vendor?.email ?? "—",
        lokasi_pengiriman: site?.location ?? "—",
        catatan: purchaseOrder.ticket?.title ?? purchaseOrder.poNumber,
        items: purchaseOrder.items.map(
          (item): DocumentLineItem => ({
            description: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: formatCurrency(item.unitPrice),
            amount: formatCurrency(item.totalPrice),
          }),
        ),
      };
    } else if (deliveryOrder) {
      documentData = {
        nomor_surat_jalan: deliveryOrder.doNumber,
        nomor_request:
          deliveryOrder.ticket?.ticketNumber ??
          deliveryOrder.po?.poNumber ??
          deliveryOrder.doNumber,
        judul_request: deliveryOrder.ticket?.title ?? deliveryOrder.doNumber,
        tanggal: deliveryOrder.createdAt,
        tanggal_pengiriman: deliveryOrder.receivedAt ?? deliveryOrder.createdAt,
        nama_pengirim: deliveryOrder.createdBy?.name ?? "Logistik",
        nama_penerima:
          deliveryOrder.receiverName ??
          deliveryOrder.ticket?.requester.name ??
          "—",
        nama_vendor:
          deliveryOrder.po?.vendor?.name ??
          deliveryOrder.po?.vendorName ??
          deliveryOrder.ticket?.project?.vendor ??
          "—",
        alamat_vendor: deliveryOrder.po?.vendor?.address ?? "—",
        kontak_vendor: deliveryOrder.po?.vendor?.phone ?? "—",
        nama_proyek: deliveryOrder.ticket?.project?.title ?? "—",
        nama_klien: deliveryOrder.ticket?.project?.clientName ?? "—",
        lokasi_pengiriman: deliveryOrder.ticket?.project?.location ?? "—",
        catatan: [
          deliveryOrder.deliveryMethod,
          deliveryOrder.vehiclePlateNumber ?? deliveryOrder.vehiclePlate
            ? `Kendaraan: ${deliveryOrder.vehiclePlateNumber ?? deliveryOrder.vehiclePlate}`
            : "",
          deliveryOrder.driverName ? `Pengemudi: ${deliveryOrder.driverName}` : "",
          deliveryOrder.vehicleDocumentNumber
            ? `No. dokumen kendaraan: ${deliveryOrder.vehicleDocumentNumber}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        items: deliveryOrder.items.map(
          (item): DocumentLineItem => ({
            itemCode: item.itemCode,
            description: item.itemName,
            quantity: item.qtyDelivered || item.qtyOrdered,
            unit: item.unit,
            notes: item.remarks ?? "",
            unitPrice: "—",
            amount: "—",
          }),
        ),
      };
    } else if (ticket) {
      const total =
        ticket.totalAmount !== null
          ? decimalNumberFromScaledInteger(ticket.totalAmount)
          : ticket.requestedAmount ?? 0;
      documentData = {
        nomor_request: ticket.ticketNumber,
        judul_request: ticket.title,
        nama_requester: ticket.requester.name,
        nama_proyek: ticket.project?.title ?? "—",
        nama_klien: ticket.project?.clientName ?? "—",
        total_biaya: total > 0 ? formatCurrency(total) : "—",
        diskon: "—",
        pajak: "—",
        tanggal: ticket.createdAt,
        tanggal_spk: ticket.createdAt,
        due_date: "—",
        nama_vendor: ticket.project?.vendor ?? ticket.recipientName ?? "—",
        alamat_vendor: "—",
        kontak_vendor: "—",
        lokasi_pengiriman:
          ticket.project?.location ??
          ticket.project?.title ??
          "Sesuai koordinasi proyek",
        catatan: ticket.description ?? ticket.title,
        nama_penerima: ticket.recipientName ?? "—",
        items: ticket.items.map((item): DocumentLineItem => {
          const unitPrice =
            item.estimatedCost === null
              ? 0
              : decimalNumberFromScaledInteger(item.estimatedCost);
          return {
            description: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.estimatedCost !== null ? formatCurrency(unitPrice) : "—",
            amount:
              item.estimatedCost !== null
                ? formatCurrency(unitPrice * item.quantity)
                : "—",
          };
        }),
      };
    }
  }

  if (!documentData) {
    return NextResponse.json(
      { message: "Data pembentuk dokumen terbit tidak lagi tersedia." },
      { status: 404 },
    );
  }

  try {
    const headerLogoDataUrl = await getDocumentHeaderLogoDataUrl();
    const verificationBaseUrl = (
      resolvePublicAppUrl(getRequestOrigin(request.headers)) ??
      new URL(request.nextUrl.origin)
    ).toString();
    const generated = await generateDocument(
      issued.template.id,
      documentData,
      {
        issuedById: issued.issuedById,
        relatedRecordId: issued.relatedRecordId ?? undefined,
        verificationBaseUrl,
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

    const htmlPreview = request.nextUrl.searchParams.get("format") === "html";
    const wantDownload = request.nextUrl.searchParams.get("download") === "1";
    const printableHtml = wantDownload
      ? html.replace(
          /<\/body>/i,
          `<script>window.addEventListener("load",function(){try{window.print();}catch(_e){}});</script></body>`,
        )
      : html;

    if (htmlPreview) {
      return new NextResponse(printableHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    try {
      const pdf = await renderPdf(html);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${wantDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(issued.documentNumber)}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (pdfError) {
      console.error("Issued document PDF rendering failed, falling back to HTML:", pdfError);
      return new NextResponse(printableHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch (error) {
    console.error("Issued document preview failed:", error);
    return NextResponse.json(
      { message: "Pratinjau dokumen gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
