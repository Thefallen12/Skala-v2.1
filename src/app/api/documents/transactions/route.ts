import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import { renderUniversalTransactionDocument } from "@/lib/documents/universal-transaction-print";
import type {
  UniversalDocumentData,
  UniversalDocumentItem,
} from "@/lib/documents/universal-transaction-print";
import { prisma } from "@/lib/prisma";
import {
  createBrandedQrDataUrl,
  getDocumentHeaderLogoDataUrl,
} from "@/lib/documents/qr-code";
import { resolvePublicAppUrl } from "@/lib/documents/public-app-url";
import { projectSiteName } from "@/lib/documents/project-site-name";
import { renderPdf } from "@/lib/documents/render-pdf";
import { isValidPublicCode } from "@/lib/documents/random-code";
import { documentVerificationPath } from "@/lib/documents/verification-url";

export const runtime = "nodejs";

type DocumentKind = UniversalDocumentData["kind"];

const allowedPrivateRoles: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.FINANCE,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
];
const allowedPreviewRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
];

const formatDate = (date: Date | null | undefined) =>
  date?.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";

const formatDateTime = (date: Date | null | undefined) =>
  date?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";

const summary = (subtotal: number, tax: number, deduction = 0) => [
  { label: "SUB TOTAL", amount: subtotal },
  { label: "PPN / TAX", amount: tax },
  ...(deduction ? [{ label: "POTONGAN / DEDUCTION", amount: -deduction }] : []),
  { label: "TOTAL", amount: subtotal + tax - deduction, emphasis: true },
];

function sampleDocument(kind: DocumentKind): UniversalDocumentData {
  const examples = {
    PO: {
      title: "PURCHASE ORDER",
      subtitle: "PESANAN PEMBELIAN",
      number: "PO-CONTOH-2026",
      leftDetails: [
        { label: "Kepada / Vendor", value: "CV Contoh Material" },
        { label: "Alamat", value: "Jl. Contoh No. 10, Takengon" },
        { label: "Kontak", value: "vendor@contoh.co.id" },
        { label: "No. Telepon", value: "0642 123456" },
      ],
      rightDetails: [
        { label: "Proyek / Site", value: "Pembangunan Gedung Contoh" },
        { label: "Metode Pembayaran", value: "Transfer" },
        { label: "Syarat Pembayaran", value: "Pembayaran setelah invoice diterima" },
      ],
      items: [
        { itemCode: "MAT-001", description: "Semen Portland 50 kg", quantity: 40, unit: "sak", unitPrice: 75000, totalPrice: 3000000 },
        { itemCode: "MAT-002", description: "Besi beton ulir 10 mm", quantity: 25, unit: "batang", unitPrice: 98000, totalPrice: 2450000 },
        { itemCode: "MAT-003", description: "Pasir pasang", quantity: 5, unit: "m³", unitPrice: 325000, totalPrice: 1625000 },
      ],
      summary: summary(7075000, 0),
      terms: [
        "Harap cantumkan nomor PO ini pada semua dokumen pengiriman dan invoice.",
        "Barang harus dikirim sesuai spesifikasi dan tanggal yang disepakati.",
      ],
      notes: undefined,
      signatures: [
        { heading: "Dibuat Oleh / Prepared By", name: "Fachri Maulana Hattami", role: "Koordinator Logistik" },
        { heading: "Diperiksa Oleh / Checked By", name: "Siti Rahmawati", role: "Keuangan" },
        { heading: "Disetujui Oleh / Approved By", name: "Direktur", role: "Direksi" },
      ],
    },
    INVOICE: {
      title: "INVOICE PEMBAYARAN",
      subtitle: "TAGIHAN VENDOR",
      number: "INV-CONTOH-2026",
      leftDetails: [
        { label: "Nama Toko / Mandor", value: "CV Contoh Material" },
        { label: "Proyek / Site", value: "Pembangunan Gedung Contoh" },
        { label: "No. PO / SPK", value: "PO-CONTOH-2026" },
      ],
      rightDetails: [
        { label: "Metode Pembayaran", value: "Transfer" },
        { label: "No. Rekening / Bank", value: "1234567890 · Bank Contoh" },
        { label: "Periode / Tanggal", value: "2 November 2026" },
      ],
      items: [
        { itemCode: "MAT-001", description: "Semen Portland 50 kg", quantity: 40, unit: "sak", unitPrice: 75000, totalPrice: 3000000 },
        { itemCode: "MAT-002", description: "Besi beton ulir 10 mm", quantity: 25, unit: "batang", unitPrice: 98000, totalPrice: 2450000 },
      ],
      summary: summary(5450000, 599500, 50000),
      terms: undefined,
      notes: "Pembayaran sesuai rincian invoice dan purchase order terlampir.",
      signatures: [
        { heading: "Ditandatangani Oleh / Signed By", name: "Siti Rahmawati", role: "Keuangan" },
        { heading: "Diketahui Oleh / Acknowledged By", name: "Direktur", role: "Direktur" },
        { heading: "Diterima Oleh / Vendor", name: "CV Contoh Material", role: "Vendor" },
      ],
    },
    KO: {
      title: "ORDER CONFIRMATION",
      subtitle: "KONFIRMASI ORDER",
      number: "KO-CONTOH-2026",
      leftDetails: [
        { label: "Kepada / Vendor", value: "CV Contoh Material" },
        { label: "No. PO Pelanggan", value: "PO-CONTOH-2026" },
        { label: "Jenis Pembayaran", value: "Uang Muka (DP)" },
      ],
      rightDetails: [
        { label: "Syarat Pembayaran", value: "DP 30%, pelunasan setelah barang diterima" },
        { label: "Nominal Dibayar", value: "Rp 1.800.000" },
        { label: "Tujuan Transfer", value: "Bank Contoh · 1234567890" },
      ],
      items: [
        { itemCode: "MAT-001", description: "Semen Portland 50 kg", quantity: 40, unit: "sak", unitPrice: 75000, totalPrice: 3000000 },
        { itemCode: "MAT-002", description: "Besi beton ulir 10 mm", quantity: 25, unit: "batang", unitPrice: 98000, totalPrice: 2450000 },
      ],
      summary: summary(5450000, 599500),
      terms: undefined,
      notes: "Nominal pembayaran transaksi ini: Rp 1.800.000.",
      signatures: [
        { heading: "Ditandatangani Oleh / Signed By", name: "Siti Rahmawati", role: "Keuangan" },
        { heading: "Diketahui Oleh / Acknowledged By", name: "Direktur", role: "Direktur" },
        { heading: "Diterima Oleh / Vendor", name: "CV Contoh Material", role: "Vendor" },
      ],
    },
    DO: {
      title: "DELIVERY ORDER",
      subtitle: "SURAT JALAN",
      number: "DO-CONTOH-2026",
      leftDetails: [
        { label: "No. PO / Kontrak", value: "PO-CONTOH-2026" },
        { label: "Proyek / Site", value: "Pembangunan Gedung Contoh" },
        { label: "Vendor / Tujuan", value: "CV Contoh Material" },
        { label: "No. Tiket", value: "TKT-2026-001" },
      ],
      rightDetails: [
        { label: "Driver / Mover", value: "Andi Saputra" },
        { label: "Plat Kendaraan", value: "BL 1234 AB" },
        { label: "No. HP Driver", value: "0812 3456 7890" },
        { label: "Penerima", value: "Fachri Maulana Hattami" },
        { label: "Persetujuan Eksekutif", value: "PO disetujui Direksi" },
      ],
      items: [
        { itemCode: "MAT-001", description: "Semen Portland 50 kg", quantity: 40, unit: "sak", remarks: "Kemasan utuh" },
        { itemCode: "MAT-002", description: "Besi beton ulir 10 mm", quantity: 25, unit: "batang", remarks: "Dikirim sesuai pesanan" },
      ],
      summary: undefined,
      terms: undefined,
      notes: "Material diterima dalam kondisi baik.",
      signatures: [
        { heading: "Ditandatangani Oleh / Signed By", name: "Fachri Maulana Hattami", role: "Koordinator Logistik / Logistics Coordinator" },
        { heading: "Diketahui Oleh / Acknowledged By", name: "Siti Rahmawati", role: "Keuangan / Finance" },
        { heading: "Diterima Oleh / Received By", name: "Penerima Proyek", role: "Penerima / Recipient" },
      ],
    },
  } satisfies Record<
    DocumentKind,
    Omit<UniversalDocumentData, "kind" | "date" | "logoDataUrl">
  >;

  return {
    ...examples[kind],
    kind,
    date: "2 November 2026",
    logoDataUrl: "",
  };
}

function documentItems(items: {
  itemCode?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  totalPrice?: number | null;
  remarks?: string | null;
}[]): UniversalDocumentItem[] {
  return items.map((item) => ({
    itemCode: item.itemCode,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    remarks: item.remarks,
  }));
}

async function loadDocument(
  kind: DocumentKind,
  recordId: string,
  publicCode: string,
): Promise<UniversalDocumentData | null> {
  if (kind === "PO") {
    const order = await prisma.purchaseOrder.findUnique({
      where: { publicCode },
      select: {
        poNumber: true,
        vendorName: true,
        paymentMethod: true,
        paymentTerms: true,
        paymentBankName: true,
        paymentAccountNumber: true,
        paymentAccountName: true,
        includeTax: true,
        createdAt: true,
        approvedAt: true,
        reviewedAt: true,
        createdBy: { select: { name: true, role: true } },
        reviewedBy: { select: { name: true } },
        approvedBy: { select: { name: true, role: true } },
        vendor: {
          select: { address: true, phone: true, email: true },
        },
        project: { select: { kelompokTani: true, location: true } },
        ticket: {
          select: {
            project: { select: { kelompokTani: true, location: true } },
          },
        },
        items: {
          orderBy: { id: "asc" },
          select: {
            itemCode: true,
            itemName: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
    });
    if (!order) return null;
    const subtotal = order.items.reduce((total, item) => total + item.totalPrice, 0);
    const tax = order.includeTax ? Math.round(subtotal * 0.11 * 100) / 100 : 0;
    return {
      kind,
      title: "PURCHASE ORDER",
      subtitle: "PESANAN PEMBELIAN",
      number: order.poNumber,
      date: formatDate(order.createdAt),
      leftDetails: [
        { label: "Kepada / Vendor", value: order.vendorName },
        { label: "Alamat", value: order.vendor?.address ?? "-" },
        { label: "Kontak", value: order.vendor?.email ?? "-" },
        { label: "No. Telepon", value: order.vendor?.phone ?? "-" },
      ],
      rightDetails: [
        { label: "Proyek / Site", value: projectSiteName(
          order.project?.kelompokTani ?? order.ticket?.project?.kelompokTani,
          order.project?.location ?? order.ticket?.project?.location,
        ) },
        { label: "Metode Pembayaran", value: order.paymentMethod },
        ...(order.paymentMethod === "TRANSFER"
          ? [
              { label: "Bank Tujuan", value: order.paymentBankName ?? "-" },
              { label: "No. Rekening", value: order.paymentAccountNumber ?? "-" },
              { label: "Nama Rekening", value: order.paymentAccountName ?? "-" },
            ]
          : []),
        { label: "Syarat Pembayaran", value: order.paymentTerms ?? "-" },
      ],
      items: documentItems(order.items.map((item) => ({
        ...item,
        description: item.itemName,
      }))),
      summary: summary(subtotal, tax),
      terms: [
        "Harap cantumkan nomor PO ini pada semua dokumen pengiriman dan invoice.",
        "Barang harus dikirim sesuai spesifikasi dan tanggal yang disepakati.",
        "Invoice harus disertai Surat Jalan (DO) dan salinan PO ini.",
      ],
      signatures: [
        { heading: "Dibuat Oleh / Prepared By", name: order.createdBy?.name ?? undefined, role: order.createdBy?.role === UserRole.LOGISTICS ? "Koordinator Logistik / Logistics Coordinator" : "Logistik / Logistics" },
        {
          heading: "Persetujuan Keuangan / Finance Approval",
          name: order.reviewedBy?.name ?? undefined,
          role: "Keuangan / Finance",
          approvalStatus:
            order.reviewedBy && order.reviewedAt ? "approved" : "pending",
          approvalDate: order.reviewedAt
            ? formatDateTime(order.reviewedAt)
            : undefined,
        },
        {
          heading: "Disetujui Oleh / Approved By",
          name: order.approvedAt ? order.approvedBy?.name ?? undefined : undefined,
          role:
            order.approvedBy?.role === UserRole.DEPUTY_DIRECTOR
              ? "Wakil Direktur / Deputy Director"
              : "Direktur / Director",
        },
      ],
      logoDataUrl: "",
    };
  }

  if (kind === "DO") {
    const order = await prisma.deliveryOrder.findUnique({
      where: { publicCode },
      select: {
        doNumber: true,
        driverName: true,
        vehicleDocumentNumber: true,
        vehiclePlate: true,
        vehiclePlateNumber: true,
        driverIdentityNumber: true,
        driverPhone: true,
        receiverName: true,
        receivedAt: true,
        createdAt: true,
        createdBy: { select: { name: true, role: true } },
        receivedBy: { select: { name: true } },
        publicCode: true,
        signedAt: true,
        signedBy: { select: { name: true, role: true } },
        acknowledgedAt: true,
        acknowledgedBy: { select: { name: true, role: true } },
        po: {
          select: {
            publicCode: true,
            poNumber: true,
            vendorName: true,
            status: true,
            approvedAt: true,
            approvedBy: { select: { name: true } },
            project: {
              select: {
                code: true,
                fieldPic: {
                  select: { name: true, role: true, isActive: true },
                },
                subkonContracts: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { contractNumber: true },
                },
              },
            },
          },
        },
        ticket: {
          select: {
            ticketNumber: true,
            title: true,
            isApprovedByDirector: true,
            auditLogs: {
              where: { action: "APPROVED_BY_DIR" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                createdAt: true,
                user: { select: { name: true } },
              },
            },
            project: {
              select: {
                code: true,
                kelompokTani: true,
                location: true,
                vendor: true,
                fieldPic: {
                  select: { name: true, role: true, isActive: true },
                },
                subkonContracts: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { contractNumber: true },
                },
              },
            },
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
            ticketItems: {
              select: {
                poItem: {
                  select: {
                    itemCode: true,
                    stockItem: { select: { sku: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order) return null;
    const activeCoordinator = await prisma.user.findFirst({
      where: { role: UserRole.KOORDINATOR, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { name: true },
    });
    const stockItems = await prisma.stockItem.findMany({
      where: {
        OR: order.items.map((item) => ({
          name: item.itemName,
          unit: item.unit,
        })),
      },
      select: { sku: true, name: true, unit: true },
    });
    const normalizeStockItem = (value: string) =>
      value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
    const stockSkusByItem = new Map<string, string[]>();
    for (const stockItem of stockItems) {
      const key = `${normalizeStockItem(stockItem.name)}|${normalizeStockItem(stockItem.unit)}`;
      const skus = stockSkusByItem.get(key) ?? [];
      skus.push(stockItem.sku);
      stockSkusByItem.set(key, skus);
    }
    const approvalLog = order.ticket?.auditLogs[0];
    const approvalLabel =
      order.po?.status === "APPROVED"
        ? `PO ${order.po.poNumber} disetujui ${order.po.approvedBy?.name ?? "Direksi"} pada ${formatDateTime(order.po.approvedAt)}`
        : order.ticket?.isApprovedByDirector
          ? `Tiket disetujui ${approvalLog?.user.name ?? "Direktur/Wakil Direktur"} pada ${formatDateTime(approvalLog?.createdAt)}`
          : "Persetujuan eksekutif belum tercatat";
    const projectFieldPic =
      order.ticket?.project?.fieldPic ?? order.po?.project?.fieldPic;
    const fieldCoordinatorName =
      (order.acknowledgedBy?.role === UserRole.KOORDINATOR
        ? order.acknowledgedBy.name
        : null) ??
      (projectFieldPic?.role === UserRole.KOORDINATOR &&
      projectFieldPic.isActive
        ? projectFieldPic.name
        : null) ??
      activeCoordinator?.name;
    return {
      kind,
      title: "DELIVERY ORDER",
      subtitle: "SURAT JALAN",
      number: order.doNumber,
      date: formatDate(order.createdAt),
      leftDetails: [
        {
          label: "No. SPK / Work Order",
          value: (() => {
            const project = order.ticket?.project ?? order.po?.project;
            return (
              project?.code ??
              project?.subkonContracts[0]?.contractNumber ??
              "-"
            );
          })(),
        },
        { label: "Proyek / Site", value: projectSiteName(
          order.ticket?.project?.kelompokTani,
          order.ticket?.project?.location,
        ) },
        { label: "No. Tiket", value: order.ticket?.ticketNumber ?? "-" },
      ],
      rightDetails: [
        { label: "Driver / Mover", value: order.driverName ?? "-" },
        { label: "Plat Kendaraan", value: order.vehiclePlateNumber ?? order.vehiclePlate ?? "-" },
        { label: "No. HP Driver", value: order.driverPhone ?? "-" },
        { label: "Penerima", value: order.receivedBy?.name ?? order.receiverName ?? "-" },
        { label: "Persetujuan Eksekutif", value: approvalLabel },
      ],
      items: documentItems(order.items.map((item) => ({
        itemCode:
          item.itemCode ||
          item.ticketItems
            .map(
              (ticketItem) =>
                ticketItem.poItem?.stockItem?.sku ??
                ticketItem.poItem?.itemCode,
            )
            .find((code) => Boolean(code)) ||
          (() => {
            const skus = stockSkusByItem.get(
              `${normalizeStockItem(item.itemName)}|${normalizeStockItem(item.unit)}`,
            );
            return skus?.length === 1 ? skus[0] : null;
          })() ||
          null,
        description: item.itemName,
        quantity: item.qtyDelivered || item.qtyOrdered,
        unit: item.unit,
        remarks: item.remarks,
      }))),
      notes: [
        order.ticket?.ticketNumber
          ? `Pengiriman material untuk Tiket ${order.ticket.ticketNumber}.`
          : "Pengiriman material sesuai rincian pada dokumen ini.",
        `Status persetujuan: ${approvalLabel}`,
        "QR Tampilan Dokumen DO / DO Document Preview QR",
      ]
        .filter(Boolean)
        .join("\n"),
      approvalPublicCode: order.po?.publicCode,
      verificationPublicCode: order.publicCode,
      signatures: [
        {
          heading: order.signedAt
            ? "Ditandatangani Oleh / Signed By"
            : "Diterbitkan Oleh / Issued By",
          name: order.signedBy?.name ?? order.createdBy?.name ?? undefined,
          role:
            order.signedBy?.role === UserRole.LOGISTICS ||
            order.createdBy?.role === UserRole.LOGISTICS
              ? "Koordinator Logistik / Logistics Coordinator"
              : "Logistik / Logistics",
        },
        {
          heading: "Diketahui Oleh / Acknowledged By",
          name: fieldCoordinatorName ?? undefined,
          role:
            order.acknowledgedBy?.role === UserRole.FINANCE
              ? "Keuangan / Finance"
              : "Koordinator Lapangan / Field Coordinator",
        },
        { heading: "Diterima Oleh / Received By", role: "Penerima / Recipient" },
      ],
      logoDataUrl: "",
    };
  }

  if (kind === "INVOICE") {
    const invoice = await prisma.invoice.findUnique({
      where: publicCode ? { publicCode } : { id: recordId },
      select: {
        invoiceNumber: true,
        vendorName: true,
        periodOrDate: true,
        paymentMethod: true,
        bankAccount: true,
        subTotal: true,
        tax: true,
        deduction: true,
        grandTotal: true,
        documentUrl: true,
        createdAt: true,
        publicCode: true,
        signedAt: true,
        signedBy: { select: { name: true, role: true } },
        acknowledgedAt: true,
        acknowledgedBy: { select: { name: true } },
        project: { select: { kelompokTani: true, location: true } },
        po: { select: { poNumber: true, paymentTerms: true } },
        subkonTermyn: {
          select: {
            termynNumber: true,
            claimedPercent: true,
            subkonContract: {
              select: {
                contractNumber: true,
                project: { select: { kelompokTani: true, location: true } },
              },
            },
          },
        },
        items: {
          orderBy: { id: "asc" },
          select: {
            itemCode: true,
            description: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
    });
    if (!invoice) return null;
    const project = invoice.project ??
      (invoice.subkonTermyn
        ? invoice.subkonTermyn.subkonContract.project
        : null);
    return {
      kind,
      title: "INVOICE PEMBAYARAN",
      subtitle: invoice.subkonTermyn ? "UPAH TUKANG & LANSIR" : "TAGIHAN VENDOR",
      number: invoice.invoiceNumber,
      date: invoice.periodOrDate ?? formatDate(invoice.createdAt),
      verificationPublicCode: invoice.signedAt ? invoice.publicCode : null,
      leftDetails: [
        { label: "Nama Toko / Mandor", value: invoice.vendorName },
        { label: "Proyek / Site", value: projectSiteName(project?.kelompokTani, project?.location) },
        { label: "No. PO / SPK", value: invoice.po?.poNumber ?? invoice.subkonTermyn?.subkonContract.contractNumber ?? "-" },
      ],
      rightDetails: [
        { label: "Metode Pembayaran", value: invoice.paymentMethod ?? "-" },
        { label: "No. Rekening / Bank", value: invoice.bankAccount ?? "-" },
        { label: "Periode / Tanggal", value: invoice.periodOrDate ?? formatDate(invoice.createdAt) },
      ],
      items: documentItems(invoice.items),
      summary: summary(invoice.subTotal, invoice.tax ?? 0, invoice.deduction ?? 0),
      notes: invoice.documentUrl ? `Dokumen invoice vendor: ${invoice.documentUrl}` : undefined,
      signatures: [
        { heading: "Ditandatangani Oleh / Signed By", name: invoice.signedBy?.name ?? undefined, role: "Keuangan / Finance" },
        { heading: "Diketahui Oleh / Acknowledged By", name: invoice.acknowledgedBy?.name ?? undefined, role: "Direktur / Director" },
        { heading: "Diterima Oleh / Received By", role: "Vendor / Mandor" },
      ],
      logoDataUrl: "",
    };
  }

  const confirmation = await prisma.orderConfirmation.findFirst({
    where: {
      OR: [
        ...(recordId
          ? [{ id: recordId }, { paymentTransactionId: recordId }]
          : []),
        ...(publicCode ? [{ publicCode }] : []),
      ],
    },
    select: {
      id: true,
      koNumber: true,
      publicCode: true,
      signedAt: true,
      signedBy: { select: { name: true, role: true } },
      acknowledgedAt: true,
      acknowledgedBy: { select: { name: true } },
      paymentType: true,
      paymentAmount: true,
      transferDestination: true,
      proofOfTransferUrl: true,
      paidAt: true,
      subTotal: true,
      tax: true,
      grandTotal: true,
      paymentTerms: true,
      paymentTransaction: {
        select: {
          id: true,
          confirmationOrderNumber: true,
          paymentType: true,
          amount: true,
          transferDestination: true,
          proofOfTransferUrl: true,
          paidAt: true,
          po: {
            select: {
              poNumber: true,
              vendorName: true,
              paymentTerms: true,
              items: {
                orderBy: { id: "asc" },
                select: {
                  itemCode: true,
                  itemName: true,
                  quantity: true,
                  unit: true,
                  unitPrice: true,
                  totalPrice: true,
                },
              },
            },
          },
        },
      },
      po: {
        select: {
          poNumber: true,
          vendorName: true,
          paymentTerms: true,
          items: {
            orderBy: { id: "asc" },
            select: {
              itemCode: true,
              itemName: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
      },
      items: {
        orderBy: { id: "asc" },
        select: {
          itemCode: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalPrice: true,
        },
      },
    },
  });

  if (confirmation) {
    const payment = confirmation.paymentTransaction;
    const po = confirmation.po ?? payment?.po;
    if (!po) return null;
    const paymentType = confirmation.paymentType ?? payment?.paymentType ?? "-";
    const paymentAmount = confirmation.paymentAmount ?? payment?.amount ?? 0;
    const subtotal = confirmation.subTotal;
    const tax = confirmation.tax ?? 0;
    return {
      kind,
      title: "ORDER CONFIRMATION",
      subtitle: "KONFIRMASI ORDER",
      number: confirmation.koNumber,
      date: formatDateTime(confirmation.paidAt ?? payment?.paidAt),
      verificationPublicCode: confirmation.signedAt
        ? confirmation.publicCode
        : null,
      leftDetails: [
        { label: "Kepada / Vendor", value: po.vendorName },
        { label: "No. PO Pelanggan", value: po.poNumber },
        { label: "Jenis Pembayaran", value: paymentType },
      ],
      rightDetails: [
        { label: "Syarat Pembayaran", value: confirmation.paymentTerms ?? po.paymentTerms ?? "-" },
        { label: "Nominal Dibayar", value: new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(paymentAmount) },
        { label: "Tujuan Transfer", value: confirmation.transferDestination ?? payment?.transferDestination ?? "-" },
      ],
      items: documentItems(confirmation.items.length > 0
        ? confirmation.items
        : po.items.map((item) => ({ ...item, description: item.itemName }))),
      summary: summary(subtotal, tax),
      notes: `Nominal pembayaran transaksi ini: Rp ${paymentAmount.toLocaleString("id-ID")}.`,
      signatures: [
        { heading: "Ditandatangani Oleh / Signed By", name: confirmation.signedBy?.name ?? undefined, role: "Koordinator Logistik / Logistics Coordinator" },
        { heading: "Diketahui Oleh / Acknowledged By", name: confirmation.acknowledgedBy?.name ?? undefined, role: "Keuangan / Finance" },
        { heading: "Diterima Oleh / Vendor", role: "Vendor" },
      ],
      logoDataUrl: "",
    };
  }

  const legacyPayment = await prisma.paymentTransaction.findUnique({
    where: { id: recordId },
    select: {
      confirmationOrderNumber: true,
      paymentType: true,
      amount: true,
      transferDestination: true,
      proofOfTransferUrl: true,
      paidAt: true,
      status: true,
      po: {
        select: {
          poNumber: true,
          vendorName: true,
          paymentTerms: true,
          includeTax: true,
          items: {
            orderBy: { id: "asc" },
            select: {
              itemCode: true,
              itemName: true,
              quantity: true,
              unit: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
      },
    },
  });
  if (
    !legacyPayment ||
    legacyPayment.status !== PaymentStatus.PAID ||
    !legacyPayment.confirmationOrderNumber ||
    !legacyPayment.po
  ) {
    return null;
  }
  const subtotal = legacyPayment.po.items.reduce(
    (total, item) => total + item.totalPrice,
    0,
  );
  const tax = legacyPayment.po.includeTax ? subtotal * 0.11 : 0;
  return {
    kind,
    title: "ORDER CONFIRMATION",
    subtitle: "KONFIRMASI ORDER",
    number: legacyPayment.confirmationOrderNumber,
    date: formatDateTime(legacyPayment.paidAt),
    leftDetails: [
      { label: "Kepada / Vendor", value: legacyPayment.po.vendorName },
      { label: "No. PO Pelanggan", value: legacyPayment.po.poNumber },
      { label: "Jenis Pembayaran", value: legacyPayment.paymentType },
    ],
    rightDetails: [
      { label: "Syarat Pembayaran", value: legacyPayment.po.paymentTerms ?? "-" },
      { label: "Nominal Dibayar", value: `Rp ${legacyPayment.amount.toLocaleString("id-ID")}` },
      { label: "Tujuan Transfer", value: legacyPayment.transferDestination },
    ],
    items: documentItems(legacyPayment.po.items.map((item) => ({
      ...item,
      description: item.itemName,
    }))),
    summary: summary(subtotal, tax),
    notes: `Nominal pembayaran transaksi ini: Rp ${legacyPayment.amount.toLocaleString("id-ID")}.`,
    signatures: [
      { heading: "Ditandatangani Oleh / Signed By", role: "Logistik" },
      { heading: "Diketahui Oleh / Acknowledged By", role: "Keuangan" },
      { heading: "Diterima Oleh / Vendor", role: "Vendor" },
    ],
    logoDataUrl: "",
  };
}

export async function GET(request: NextRequest) {
  const kindParam = request.nextUrl.searchParams.get("kind") ?? "";
  const kind = ["PO", "INVOICE", "KO", "DO"].includes(kindParam)
    ? (kindParam as DocumentKind)
    : null;
  const recordId = request.nextUrl.searchParams.get("id") ?? "";
  const publicCode = request.nextUrl.searchParams.get("publicCode") ?? "";
  const previewOnly = request.nextUrl.searchParams.get("preview") === "1";
  const htmlPreview = request.nextUrl.searchParams.get("format") === "html";
  if (
    !kind ||
    (!previewOnly &&
      (kind === "PO" || kind === "DO"
        ? !publicCode
        : !recordId &&
          (!publicCode ||
            !["INVOICE", "KO"].includes(kind) ||
            !isValidPublicCode(publicCode))))
  ) {
    return NextResponse.json({ message: "Jenis atau nomor dokumen tidak valid." }, { status: 400 });
  }

  let publicSignedDocument = false;
  if (
    !previewOnly &&
    !recordId &&
    publicCode &&
    (kind === "INVOICE" || kind === "KO")
  ) {
    const signedRecord =
      kind === "INVOICE"
        ? await prisma.invoice.findUnique({
            where: { publicCode },
            select: { signedAt: true, acknowledgedAt: true },
          })
        : await prisma.orderConfirmation.findUnique({
            where: { publicCode },
            select: { signedAt: true, acknowledgedAt: true },
          });
    if (!signedRecord?.signedAt || !signedRecord.acknowledgedAt) {
      return NextResponse.json(
        { message: "Dokumen belum ditandatangani lengkap atau tidak ditemukan." },
        { status: 404 },
      );
    }
    publicSignedDocument = true;
  }

  if (
    previewOnly ||
    ((kind === "INVOICE" || kind === "KO") && !publicSignedDocument)
  ) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Silakan masuk untuk mencetak dokumen." }, { status: 401 });
    }
    if (
      previewOnly
        ? !allowedPreviewRoles.includes(session.user.role)
        : !allowedPrivateRoles.includes(session.user.role)
    ) {
      return NextResponse.json({ message: "Anda tidak memiliki akses mencetak dokumen ini." }, { status: 403 });
    }
  }

  try {
    const document = previewOnly
      ? sampleDocument(kind)
      : await loadDocument(kind, recordId, publicCode);
    if (!document) {
      return NextResponse.json({ message: "Dokumen tidak ditemukan." }, { status: 404 });
    }
    const verificationCode =
      kind === "PO" ? null : document.verificationPublicCode;
    const verificationPath = verificationCode
      ? documentVerificationPath(
          kind.toLowerCase() as "po" | "do" | "invoice" | "ko",
          verificationCode,
        )
      : null;
    const publicAppUrl =
      resolvePublicAppUrl() ?? new URL(request.url).origin;
    const [logoResult, qrResult, approvalQrResult] = await Promise.allSettled([
      getDocumentHeaderLogoDataUrl(),
      verificationPath
        ? createBrandedQrDataUrl(
            new URL(verificationPath, publicAppUrl).toString(),
            260,
          )
        : Promise.resolve(null),
      kind === "PO" && document.signatures[2]?.name
        ? createBrandedQrDataUrl(
            new URL(
              documentVerificationPath("po", publicCode),
              publicAppUrl,
            ).toString(),
            240,
          )
        : kind === "DO" && document.approvalPublicCode
        ? createBrandedQrDataUrl(
            new URL(
              documentVerificationPath("po", document.approvalPublicCode),
              publicAppUrl,
            ).toString(),
            240,
          )
        : Promise.resolve(null),
    ]);
    if (logoResult.status === "rejected") {
      console.error("Document logo asset failed, using hosted fallback:", logoResult.reason);
    }
    if (qrResult.status === "rejected") {
      console.error("Document verification QR failed, continuing without QR:", qrResult.reason);
    }
    if (approvalQrResult.status === "rejected") {
      console.error("Document approval QR failed, continuing without QR:", approvalQrResult.reason);
    }
    document.logoDataUrl =
      logoResult.status === "fulfilled"
        ? logoResult.value
        : "/images/logos/cop-surat.png";
    document.qrDataUrl =
      qrResult.status === "fulfilled" ? qrResult.value : null;
    document.approvalQrDataUrl =
      approvalQrResult.status === "fulfilled" ? approvalQrResult.value : null;
    delete document.approvalPublicCode;
    const documentHtml = renderUniversalTransactionDocument(document);
    if (previewOnly || htmlPreview) {
      return new NextResponse(documentHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const pdf = await renderPdf(documentHtml);
    const disposition =
      request.nextUrl.searchParams.get("download") === "1"
        ? "attachment"
        : "inline";
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(document.number)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Universal transaction document rendering failed:", error);
    return NextResponse.json(
      { message: "Dokumen gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
