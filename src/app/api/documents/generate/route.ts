import { NextRequest, NextResponse } from "next/server";
import { DocType, UserRole } from "@/generated/prisma/enums";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import {
  generateDocumentPdf,
} from "@/lib/documents/generate-document-pdf";
import type {
  DocumentData,
  DocumentLineItem,
} from "@/lib/documents/generate-document";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";

export const runtime = "nodejs";

type GenerateRequest = {
  templateId: string;
  recordType: "PO" | "DO" | "TICKET";
  recordId: string;
};

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.templateId === "string" &&
    request.templateId.length > 0 &&
    typeof request.recordId === "string" &&
    request.recordId.length > 0 &&
    (request.recordType === "PO" ||
      request.recordType === "DO" ||
      request.recordType === "TICKET")
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function responseError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return responseError("Silakan masuk untuk mencetak dokumen.", 401);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return responseError("Permintaan cetak tidak valid.", 400);
  }
  if (!isGenerateRequest(input)) {
    return responseError("Pilih template dan dokumen yang valid.", 400);
  }

  const allowed: UserRole[] =
    input.recordType === "PO"
      ? [
          UserRole.LOGISTICS,
          UserRole.FINANCE,
          UserRole.DIRECTOR,
          UserRole.ADMINISTRATIONS,
        ]
      : input.recordType === "DO"
        ? [
            UserRole.LOGISTICS,
            UserRole.MOVER,
            UserRole.DIRECTOR,
            UserRole.ADMINISTRATIONS,
          ]
        : [
            UserRole.LOGISTICS,
            UserRole.FINANCE,
            UserRole.DIRECTOR,
            UserRole.ADMINISTRATIONS,
          ];
  if (!allowed.includes(session.user.role)) {
    return responseError("Anda tidak memiliki akses untuk mencetak dokumen ini.", 403);
  }

  const expectedTypes: DocType[] =
    input.recordType === "PO"
      ? [DocType.PURCHASE_ORDER]
      : input.recordType === "DO"
        ? [DocType.DO, DocType.SURAT_JALAN]
        : [
            DocType.INVOICE,
            DocType.SPK,
            DocType.BAST,
            DocType.PURCHASE_ORDER,
            DocType.DO,
            DocType.SURAT_JALAN,
          ];
  const template = await prisma.documentTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, type: true },
  });
  if (!template || !expectedTypes.includes(template.type)) {
    return responseError("Template tidak sesuai dengan jenis dokumen.", 400);
  }

  try {
    let relatedRecordId: string;
    let documentData: DocumentData;
    if (input.recordType === "PO") {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: input.recordId },
        select: {
          id: true,
          poNumber: true,
          vendorName: true,
          paymentTerms: true,
          createdAt: true,
          vendor: {
            select: { name: true, address: true, phone: true, email: true },
          },
          ticket: {
            select: {
              ticketNumber: true,
              title: true,
              createdAt: true,
              requester: { select: { name: true } },
              project: {
                select: {
                  title: true,
                  clientName: true,
                  vendor: true,
                  location: true,
                },
              },
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
      });
      if (!purchaseOrder) {
        return responseError("Purchase Order tidak ditemukan.", 404);
      }

      const total = purchaseOrder.items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );
      relatedRecordId = purchaseOrder.id;
      documentData = {
        nomor_request: purchaseOrder.ticket?.ticketNumber ?? purchaseOrder.poNumber,
        judul_request: purchaseOrder.ticket?.title ?? purchaseOrder.poNumber,
        nama_requester: purchaseOrder.ticket?.requester.name ?? "—",
        nama_proyek: purchaseOrder.ticket?.project?.title ?? "—",
        nama_klien: purchaseOrder.ticket?.project?.clientName ?? "—",
        total_biaya: formatCurrency(total),
        diskon: "—",
        pajak: "—",
        tanggal: purchaseOrder.createdAt,
        tanggal_spk: purchaseOrder.ticket?.createdAt ?? purchaseOrder.createdAt,
        due_date: purchaseOrder.paymentTerms ?? "—",
        nama_vendor:
          purchaseOrder.vendor?.name ??
          purchaseOrder.ticket?.project?.vendor ??
          purchaseOrder.vendorName,
        alamat_vendor: purchaseOrder.vendor?.address ?? "—",
        kontak_vendor:
          purchaseOrder.vendor?.phone ??
          purchaseOrder.vendor?.email ??
          "—",
        lokasi_pengiriman: purchaseOrder.ticket?.project?.location ?? "—",
        catatan: purchaseOrder.ticket?.title ?? "—",
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
    } else if (input.recordType === "DO") {
      const deliveryOrder = await prisma.deliveryOrder.findUnique({
        where: { id: input.recordId },
        select: {
          id: true,
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
              project: {
                select: {
                  title: true,
                  clientName: true,
                  vendor: true,
                  location: true,
                },
              },
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
              itemName: true,
              qtyOrdered: true,
              qtyDelivered: true,
              unit: true,
              remarks: true,
            },
          },
        },
      });
      if (!deliveryOrder) {
        return responseError("Delivery Order tidak ditemukan.", 404);
      }

      relatedRecordId = deliveryOrder.id;
      documentData = {
        nomor_surat_jalan: deliveryOrder.doNumber,
        nomor_request: deliveryOrder.ticket?.ticketNumber ?? deliveryOrder.po?.poNumber ?? "—",
        judul_request: deliveryOrder.ticket?.title ?? "—",
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
            description: item.itemName,
            quantity: item.qtyDelivered || item.qtyOrdered,
            unit: item.unit,
            notes: item.remarks ?? "",
            unitPrice: "—",
            amount: "—",
          }),
        ),
      };
    } else {
      const ticket = await prisma.ticket.findUnique({
        where: { id: input.recordId },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          description: true,
          createdAt: true,
          totalAmount: true,
          requestedAmount: true,
          recipientName: true,
          requester: { select: { name: true } },
          project: {
            select: {
              title: true,
              clientName: true,
              vendor: true,
              location: true,
            },
          },
          items: {
            orderBy: { id: "asc" },
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
        return responseError("Tiket tidak ditemukan.", 404);
      }

      const total =
        ticket.totalAmount !== null
          ? decimalNumberFromScaledInteger(ticket.totalAmount)
          : ticket.requestedAmount ?? 0;
      relatedRecordId = ticket.id;
      documentData = {
        nomor_request: ticket.ticketNumber,
        judul_request: ticket.title,
        nama_requester: ticket.requester.name,
        nama_proyek: ticket.project?.title ?? "—",
        nama_klien: ticket.project?.clientName ?? "—",
        total_biaya: formatCurrency(total),
        diskon: "—",
        pajak: "—",
        tanggal: ticket.createdAt,
        tanggal_spk: ticket.createdAt,
        due_date: "—",
        nama_vendor:
          ticket.project?.vendor ?? ticket.recipientName ?? "—",
        alamat_vendor: "—",
        kontak_vendor: "—",
        lokasi_pengiriman: ticket.project?.location ?? "—",
        catatan: ticket.description ?? ticket.title,
        nama_penerima: ticket.recipientName ?? "—",
        items: ticket.items.map(
          (item): DocumentLineItem => {
            const unitPrice =
              item.estimatedCost === null
                ? 0
                : decimalNumberFromScaledInteger(item.estimatedCost);
            return {
              description: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice              : item.estimatedCost !== null
                ? formatCurrency(unitPrice)
                : "—",
              amount: item.estimatedCost !== null
                ? formatCurrency(unitPrice * item.quantity)
                : "—",
            };
          },
        ),
      };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXTAUTH_URL?.trim() ||
      request.nextUrl.origin;
    const generated = await generateDocumentPdf(
      template.id,
      documentData,
      {
        issuedById: session.user.id,
        relatedRecordId,
        verificationBaseUrl: baseUrl,
      },
    );
    return new NextResponse(generated.pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(generated.documentNumber)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Document PDF generation failed:", error);
    return responseError(
      "PDF gagal dibuat. Pastikan browser PDF tersedia lalu coba kembali.",
      500,
    );
  }
}
