"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { checkTemplate, type Template } from "@pdfme/common";
import {
  DocType,
  OperationalDocumentKind,
  OperationalDocumentStatus,
  POStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { canManageUsers } from "@/lib/user-access";
import {
  PrivatePhotoValidationError,
  saveDocumentTemplateImage,
} from "@/lib/document-template-images";
import { sanitizeDocumentTemplateHtml } from "@/lib/documents/sanitize-template-html";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";

export type DocumentActionResult = {
  success: boolean;
  message: string;
  documentNumber?: string;
};

export type DocumentImageUploadResult = {
  success: boolean;
  message: string;
  imageUrl?: string;
};

export type DocumentDetailResult = {
  success: boolean;
  message: string;
  signatureImage?: string;
};

export type SaveDocumentTemplateInput = {
  id?: string;
  name: string;
  type: DocType;
  contentHtml: string;
  contentJson: Template | null;
};

type DocumentTemplateInput = {
  id?: string;
  name: string;
  kind: OperationalDocumentKind;
  title: string;
  content: string;
};

type SignedDocumentInput = {
  ticketId: string;
  templateId?: string;
  kind: OperationalDocumentKind;
  title: string;
  content: string;
  signatureImage: string;
};

const failure = (message: string): DocumentActionResult => ({
  success: false,
  message,
});

export async function uploadDocumentTemplateImage(
  file: File,
): Promise<DocumentImageUploadResult> {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) {
    return {
      success: false,
      message: "Hanya Direktur atau Administrasi yang dapat mengunggah gambar template.",
    };
  }
  try {
    const imageUrl = await saveDocumentTemplateImage(file);
    return { success: true, message: "Gambar berhasil diunggah.", imageUrl };
  } catch (error) {
    if (error instanceof PrivatePhotoValidationError) {
      return { success: false, message: error.message };
    }
    console.error("Uploading document template image failed:", error);
    return {
      success: false,
      message: "Gambar gagal diunggah. Silakan coba kembali.",
    };
  }
}

function isDocumentKind(value: unknown): value is OperationalDocumentKind {
  return Object.values(OperationalDocumentKind).some((kind) => kind === value);
}

function hasValidText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export async function saveDocumentTemplate(
  input: DocumentTemplateInput,
): Promise<DocumentActionResult> {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) {
    return failure("Hanya Direktur atau Administrasi yang dapat mengelola template dokumen.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    (input.id !== undefined && (typeof input.id !== "string" || !input.id)) ||
    !hasValidText(input.name, 120) ||
    !isDocumentKind(input.kind) ||
    !hasValidText(input.title, 180) ||
    !hasValidText(input.content, 20000)
  ) {
    return failure("Periksa nama, jenis, judul, dan isi template dokumen.");
  }

  try {
    const data = {
      name: input.name.trim(),
      kind: input.kind,
      title: input.title.trim(),
      content: input.content.trim(),
    };
    if (input.id) {
      const existing = await prisma.operationalDocumentTemplate.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) return failure("Template dokumen tidak ditemukan.");
      await prisma.operationalDocumentTemplate.update({
        where: { id: input.id },
        data,
      });
    } else {
      await prisma.operationalDocumentTemplate.create({
        data: { ...data, createdById: session.user.id },
      });
    }
  } catch (error) {
    console.error("Document template save failed:", error);
    return failure("Template dokumen gagal disimpan. Silakan coba kembali.");
  }

  revalidatePath("/apps/documents");
  return { success: true, message: "Template dokumen berhasil disimpan." };
}

export async function saveRichDocumentTemplate(
  input: SaveDocumentTemplateInput,
): Promise<DocumentActionResult> {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) {
    return failure("Hanya Direktur atau Administrasi yang dapat mengelola template dokumen.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    (input.id !== undefined &&
      (typeof input.id !== "string" || !input.id.trim())) ||
    !hasValidText(input.name, 120) ||
    !Object.values(DocType).includes(input.type) ||
    !hasValidText(input.contentHtml, 6 * 1024 * 1024)
  ) {
    return failure("Nama, tipe, dan isi template wajib diisi dengan format yang valid.");
  }

  let contentJson: Prisma.InputJsonValue | null = null;
  let pdfmeVariableNames: string[] = [];
  if (input.contentJson) {
    try {
      checkTemplate(input.contentJson);
      const serialized = JSON.stringify(input.contentJson);
      if (!serialized || serialized.length > 6 * 1024 * 1024) {
        return failure("Ukuran template PDFme maksimal 6 MB.");
      }
      contentJson = JSON.parse(serialized) as Prisma.InputJsonValue;
      pdfmeVariableNames = input.contentJson.schemas
        .flatMap((page) => page.map((schema) => schema.name))
        .filter((name) => /^[a-zA-Z0-9_.-]{1,100}$/.test(name));
    } catch (error) {
      console.error("PDFme template validation failed:", error);
      return failure("Struktur template PDFme tidak valid. Periksa kembali elemen template.");
    }
  }

  const contentHtml = sanitizeDocumentTemplateHtml(input.contentHtml);
  if (!contentHtml.trim()) {
    return failure("Isi template tidak boleh kosong setelah pemeriksaan keamanan.");
  }

  const variables = [
    ...new Set(
      [
        ...Array.from(
          contentHtml.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g),
        ).map((match) => match[1]),
        ...pdfmeVariableNames,
      ],
    ),
  ].join(",");

  try {
    const data = {
      name: input.name.trim(),
      type: input.type,
      contentHtml,
      contentJson,
      variables,
    };
    if (input.id) {
      const existing = await prisma.documentTemplate.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) return failure("Template dokumen tidak ditemukan.");
      await prisma.documentTemplate.update({
        where: { id: input.id },
        data,
      });
    } else {
      await prisma.documentTemplate.create({ data });
    }
  } catch (error) {
    console.error("Rich document template creation failed:", error);
    return failure("Template gagal disimpan. Silakan coba kembali.");
  }

  revalidatePath("/apps/templates");
  revalidatePath("/dashboard/templates/new");
  revalidatePath("/apps/documents");
  return { success: true, message: "Template berhasil disimpan." };
}

export async function getRichDocumentTemplate(templateId: string) {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) {
    return {
      success: false as const,
      message: "Hanya Direktur atau Administrasi yang dapat mengelola template.",
    };
  }
  if (typeof templateId !== "string" || !templateId.trim()) {
    return { success: false as const, message: "Template tidak valid." };
  }

  const template = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      type: true,
      contentHtml: true,
      variables: true,
    },
  });
  if (!template) {
    return { success: false as const, message: "Template tidak ditemukan." };
  }
  return { success: true as const, template };
}

export async function createSignedOperationalDocument(
  input: SignedDocumentInput,
): Promise<DocumentActionResult> {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user.role)) {
    return failure("Hanya Direktur atau Administrasi yang dapat menyiapkan dan menandatangani dokumen.");
  }
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.ticketId !== "string" ||
    !input.ticketId ||
    (input.templateId !== undefined &&
      (typeof input.templateId !== "string" || !input.templateId)) ||
    !isDocumentKind(input.kind) ||
    !hasValidText(input.title, 180) ||
    !hasValidText(input.content, 20000) ||
    typeof input.signatureImage !== "string" ||
    input.signatureImage.length > 120000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
      input.signatureImage,
    )
  ) {
    return failure("Data dokumen atau tanda tangan tidak valid.");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, ticketNumber: true, type: true, status: true },
  });
  if (!ticket || ticket.type !== TicketType.MATERIAL) {
    return failure("Tiket material tidak ditemukan.");
  }
  const canPrepareForStatus =
    input.kind === OperationalDocumentKind.PURCHASE_ORDER
      ? ticket.status === TicketStatus.PROCESSED_LOGISTIC
      : [
          TicketStatus.PROCESSED_LOGISTIC,
          TicketStatus.ASSIGNED_TO_MOVER,
        ].some((status) => ticket.status === status);
  if (!canPrepareForStatus) {
    return failure("Dokumen PO/DO hanya dapat disiapkan untuk tiket yang sedang diproses Logistik atau ditugaskan ke Mover.");
  }

  if (input.templateId) {
    const template = await prisma.operationalDocumentTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true, kind: true, isActive: true },
    });
    if (!template || !template.isActive || template.kind !== input.kind) {
      return failure("Template tidak tersedia atau jenis dokumennya berbeda.");
    }
  }

  const prefix =
    input.kind === OperationalDocumentKind.PURCHASE_ORDER
      ? "PO"
      : input.kind === OperationalDocumentKind.DELIVERY_ORDER
        ? "DO"
        : "DOC";
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const documentNumber = `${prefix}-${month}-${randomUUID().slice(0, 8).toUpperCase()}`;

  try {
    await prisma.operationalDocument.create({
      data: {
        documentNumber,
        kind: input.kind,
        status: OperationalDocumentStatus.SIGNED,
        title: input.title.trim(),
        content: input.content.trim(),
        signatureImage: input.signatureImage,
        signerName: session.user.name || session.user.email || "Penandatangan",
        signerRole: session.user.role,
        preparedById: session.user.id,
        signedById: session.user.id,
        ticketId: ticket.id,
        templateId: input.templateId ?? null,
      },
    });
  } catch (error) {
    console.error("Signed document creation failed:", error);
    return failure("Dokumen gagal disimpan. Silakan muat ulang dan coba kembali.");
  }

  revalidatePath("/apps/documents");
  revalidatePath("/apps/logistics");
  return {
    success: true,
    message: `Dokumen ${documentNumber} tersimpan dengan tanda tangan dan menunggu diterbitkan Logistik.`,
    documentNumber,
  };
}

export async function issueOperationalDocument(
  documentId: string,
): Promise<DocumentActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== UserRole.LOGISTICS) {
    return failure("Hanya Logistik yang dapat menerbitkan dokumen.");
  }

  if (typeof documentId !== "string" || !documentId.trim()) {
    return failure("Dokumen yang dipilih tidak valid.");
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const document = await transaction.operationalDocument.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          documentNumber: true,
          kind: true,
          status: true,
          ticketId: true,
          ticket: {
            select: {
              type: true,
              status: true,
              isApprovedByDirector: true,
              purchaseOrders: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true, poNumber: true },
              },
            },
          },
        },
      });
      if (!document || document.ticket.type !== TicketType.MATERIAL) {
        return failure("Dokumen atau tiket material tidak ditemukan.");
      }
      if (document.status !== OperationalDocumentStatus.SIGNED) {
        return failure("Dokumen ini sudah diterbitkan atau tidak lagi tersedia.");
      }
      if (
        document.kind === OperationalDocumentKind.PURCHASE_ORDER &&
        document.ticket.status !== TicketStatus.PROCESSED_LOGISTIC
      ) {
        return failure("PO hanya dapat diterbitkan saat tiket berada di antrean Logistik.");
      }
      const relatedPurchaseOrder = document.ticket.purchaseOrders[0];
      if (
        document.kind === OperationalDocumentKind.PURCHASE_ORDER &&
        relatedPurchaseOrder?.status !== POStatus.APPROVED
      ) {
        return failure(
          "Dokumen PO hanya dapat diterbitkan setelah PO terkait disetujui Direktur/Wakil Direktur pada Persetujuan Eksekutif.",
        );
      }
      if (
        document.kind === OperationalDocumentKind.DELIVERY_ORDER &&
        ![
          TicketStatus.PROCESSED_LOGISTIC,
          TicketStatus.ASSIGNED_TO_MOVER,
        ].some((status) => document.ticket.status === status)
      ) {
        return failure("DO hanya dapat diterbitkan saat tiket sedang diproses Logistik atau Mover.");
      }
      if (
        document.kind === OperationalDocumentKind.DELIVERY_ORDER &&
        !document.ticket.isApprovedByDirector
      ) {
        return failure(
          "Dokumen DO hanya dapat diterbitkan setelah tiket mendapat Persetujuan Eksekutif.",
        );
      }
      if (
        document.kind === OperationalDocumentKind.DELIVERY_ORDER &&
        relatedPurchaseOrder &&
        relatedPurchaseOrder.status !== POStatus.APPROVED
      ) {
        return failure(
          `Dokumen DO menunggu persetujuan eksekutif untuk PO ${relatedPurchaseOrder.poNumber}.`,
        );
      }

      const updated = await transaction.operationalDocument.updateMany({
        where: {
          id: document.id,
          status: OperationalDocumentStatus.SIGNED,
        },
        data: {
          status: OperationalDocumentStatus.ISSUED,
          issuedById: session.user.id,
          issuedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        return failure("Dokumen sudah diterbitkan oleh pengguna lain.");
      }
      await transaction.ticketAuditLog.create({
        data: {
          id: randomUUID(),
          ticketId: document.ticketId,
          userId: session.user.id,
          action: "DOCUMENT_ISSUED",
          notes: `${document.kind} ${document.documentNumber} diterbitkan oleh Logistik.`,
        },
      });
      return {
        success: true,
        message: `Dokumen ${document.documentNumber} berhasil diterbitkan.`,
        documentNumber: document.documentNumber,
      };
    });

    if (result.success) {
      revalidatePath("/apps/documents");
      revalidatePath("/apps/documents/issued");
      revalidatePath("/apps/logistics");
      revalidatePath("/apps/tickets");
    }
    return result;
  } catch (error) {
    console.error("Operational document issue failed:", error);
    return failure("Dokumen gagal diterbitkan. Silakan muat ulang dan coba kembali.");
  }
}

export async function loadOperationalDocumentSignature(
  documentId: string,
): Promise<DocumentDetailResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Anda tidak memiliki akses ke dokumen ini." };
  }
  if (typeof documentId !== "string" || !documentId.trim()) {
    return { success: false, message: "Dokumen yang dipilih tidak valid." };
  }

  const document = await prisma.operationalDocument.findUnique({
    where: { id: documentId },
    select: { signatureImage: true, status: true },
  });
  if (!document) {
    return { success: false, message: "Dokumen tidak ditemukan." };
  }
  if (
    document.status !== OperationalDocumentStatus.ISSUED &&
    !canManageUsers(session.user.role)
  ) {
    return { success: false, message: "Dokumen ini belum diterbitkan." };
  }
  return {
    success: true,
    message: "Tanda tangan berhasil dimuat.",
    signatureImage: document.signatureImage,
  };
}
