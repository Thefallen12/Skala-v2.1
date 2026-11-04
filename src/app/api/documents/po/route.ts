import { NextRequest, NextResponse } from "next/server";
import { DocType, TicketType, UserRole } from "@/generated/prisma/enums";
import { auth } from "../../../../../auth";
import { canManageUsers } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import {
  generateDocument,
  type DocumentLineItem,
} from "@/lib/documents/generate-document";
import {
  createBrandedQrDataUrl,
  getDocumentHeaderLogoDataUrl,
} from "@/lib/documents/qr-code";
import { resolvePublicAppUrl } from "@/lib/documents/public-app-url";
import { projectSiteName } from "@/lib/documents/project-site-name";
import {
  renderUniversalTransactionDocument,
  type UniversalDocumentData,
} from "@/lib/documents/universal-transaction-print";
import { renderPdf } from "@/lib/documents/render-pdf";
import { isValidPublicCode } from "@/lib/documents/random-code";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";

export const runtime = "nodejs";

const formatDate = (date: Date) =>
  date.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

export async function GET(request: NextRequest) {
  const publicCode = request.nextUrl.searchParams.get("publicCode") ?? "";
  if (!isValidPublicCode(publicCode)) {
    return NextResponse.json(
      { message: "Kode Purchase Order tidak valid." },
      { status: 400 },
    );
  }

  const destination = new URL("/api/documents/transactions", request.url);
  destination.searchParams.set("kind", "PO");
  destination.searchParams.set("publicCode", publicCode);
  if (request.nextUrl.searchParams.get("download") === "1") {
    destination.searchParams.set("download", "1");
  }
  return NextResponse.redirect(destination, 307);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  if (role !== UserRole.LOGISTICS && !canManageUsers(role)) {
    return NextResponse.json(
      { message: "Hanya Logistik, Direktur, atau Administrasi yang dapat mencetak PO." },
      { status: 403 },
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Isi permintaan cetak PO tidak valid." },
      { status: 400 },
    );
  }
  const ticketId =
    typeof requestBody === "object" &&
    requestBody !== null &&
    "ticketId" in requestBody &&
    typeof requestBody.ticketId === "string"
      ? requestBody.ticketId
      : "";
  if (!ticketId) {
    return NextResponse.json(
      { message: "ID request material wajib diberikan." },
      { status: 400 },
    );
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, type: TicketType.MATERIAL },
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
      },
    },
  });
  if (!ticket) {
    return NextResponse.json(
      { message: "Request material tidak ditemukan." },
      { status: 404 },
    );
  }

  const template = await prisma.documentTemplate.findFirst({
    where: { type: DocType.PURCHASE_ORDER },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json(
      { message: "Template Purchase Order belum tersedia. Buat template terlebih dahulu." },
      { status: 404 },
    );
  }

  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL;
  const verificationBaseUrl =
    configuredBaseUrl ??
    (process.env.NODE_ENV === "development"
      ? request.nextUrl.origin
      : undefined);
  if (!verificationBaseUrl) {
    return NextResponse.json(
      {
        message:
          "Atur NEXT_PUBLIC_APP_URL pada environment produksi untuk membuat tautan verifikasi dokumen.",
      },
      { status: 500 },
    );
  }

  let issuedDocumentId: string | undefined;
  try {
    const currency = (amount: number) =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(amount);
    const lineItems = ticket.items.map((item): DocumentLineItem => {
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
    });
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
        items: lineItems,
      },
      {
        issuedById: session.user.id,
        relatedRecordId: ticketId,
        verificationBaseUrl,
      },
    );
    issuedDocumentId = generated.issuedDocumentId;

    const subtotal = ticket.items.reduce(
      (total, item) =>
        total +
          (item.estimatedCost === null
            ? 0
            : decimalNumberFromScaledInteger(item.estimatedCost)) *
            item.quantity,
      0,
    );
    const [logoDataUrl, qrDataUrl] = await Promise.all([
      getDocumentHeaderLogoDataUrl(),
      createBrandedQrDataUrl(generated.verificationUrl, 260),
    ]);
    const document: UniversalDocumentData = {
      kind: "PO",
      title: "PURCHASE ORDER",
      subtitle: "PESANAN PEMBELIAN",
      number: generated.documentNumber,
      date: formatDate(ticket.createdAt),
      leftDetails: [
        { label: "Kepada / Vendor", value: ticket.project?.vendor ?? "Belum ditentukan" },
        { label: "Alamat", value: "-" },
        { label: "Kontak", value: ticket.project?.clientName ?? "-" },
        { label: "No. Request", value: ticket.ticketNumber },
      ],
      rightDetails: [
        {
          label: "Proyek / Site",
          value: projectSiteName(ticket.project?.title, ticket.project?.location),
        },
        { label: "Requester", value: ticket.requester.name },
        { label: "Syarat Pembayaran", value: "-" },
      ],
      items: ticket.items.map((item) => {
        const unitPrice =
          item.estimatedCost === null
            ? null
            : decimalNumberFromScaledInteger(item.estimatedCost);
        return {
          description: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice,
          totalPrice:
            unitPrice === null ? null : unitPrice * item.quantity,
        };
      }),
      summary: [
        { label: "SUB TOTAL", amount: subtotal },
        { label: "PPN / TAX", amount: 0 },
        { label: "TOTAL", amount: subtotal, emphasis: true },
      ],
      terms: [
        "Harap cantumkan nomor PO ini pada semua dokumen pengiriman dan invoice.",
        "Barang harus dikirim sesuai spesifikasi dan tanggal yang disepakati.",
        "Invoice harus disertai Surat Jalan (DO) dan salinan PO ini.",
      ],
      notes: ticket.title,
      signatures: [
        { heading: "Dibuat Oleh / Prepared By", name: session.user.name ?? undefined, role: "Logistik" },
        { heading: "Diperiksa Oleh / Checked By", role: "Keuangan" },
        { heading: "Disetujui Oleh / Approved By", role: "Direktur" },
      ],
      logoDataUrl,
      qrDataUrl,
    };
    const pdf = await renderPdf(renderUniversalTransactionDocument(document));
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(generated.documentNumber)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Purchase order PDF generation failed:", error);
    if (issuedDocumentId) {
      try {
        await prisma.issuedDocument.update({
          where: { id: issuedDocumentId },
          data: { status: "REVOKED" },
        });
      } catch (revocationError) {
        console.error(
          "Failed to revoke issued document after PDF generation failure:",
          revocationError,
        );
      }
    }
    return NextResponse.json(
      { message: "PDF PO gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
