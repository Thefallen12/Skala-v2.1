"use server";

import { revalidatePath } from "next/cache";
import { NotificationType, UserRole } from "@prisma/client";
import { auth } from "../../../auth";
import { generateAvailablePublicCode } from "@/lib/documents/random-code";
import { documentVerificationPath } from "@/lib/documents/verification-url";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export type TransactionDocumentKind = "INVOICE" | "KO" | "DO";
export type TransactionDocumentAction = "sign" | "acknowledge";

export async function updateTransactionDocumentSignature(
  kind: TransactionDocumentKind,
  id: string,
  action: TransactionDocumentAction,
): Promise<{ success: boolean; message: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menandatangani dokumen." };
  }
  if (
    !id ||
    id.length > 100 ||
    !["INVOICE", "KO", "DO"].includes(kind) ||
    !["sign", "acknowledge"].includes(action)
  ) {
    return { success: false, message: "Permintaan tanda tangan dokumen tidak valid." };
  }

  const requiredRole =
    action === "sign"
      ? kind === "INVOICE"
        ? UserRole.FINANCE
        : UserRole.LOGISTICS
      : kind === "INVOICE"
        ? UserRole.DIRECTOR
        : kind === "DO"
          ? UserRole.KOORDINATOR
          : UserRole.FINANCE;
  if (session.user.role !== requiredRole) {
    return {
      success: false,
      message: `Aksi ini hanya dapat dilakukan oleh ${
        requiredRole === UserRole.FINANCE
          ? "Keuangan"
          : requiredRole === UserRole.LOGISTICS
            ? "Logistik"
            : requiredRole === UserRole.KOORDINATOR
              ? "Koordinator Lapangan"
              : "Direktur"
      }.`,
    };
  }

  let publicCode: string | null = null;
  try {
    await prisma.$transaction(async (transaction) => {
      if (kind === "INVOICE") {
        const document = await transaction.invoice.findUnique({
          where: { id },
          select: {
            invoiceNumber: true,
            publicCode: true,
            signedAt: true,
            acknowledgedAt: true,
          },
        });
        if (!document) throw new Error("Invoice tidak ditemukan.");
        if (action === "sign") {
          if (document.signedAt) throw new Error("Invoice sudah ditandatangani.");
          publicCode =
            document.publicCode ??
            (await generateAvailablePublicCode(transaction));
          const result = await transaction.invoice.updateMany({
            where: { id, signedAt: null },
            data: {
              publicCode,
              signedById: session.user.id,
              signedAt: new Date(),
            },
          });
          if (result.count !== 1) throw new Error("Invoice baru saja ditandatangani.");
          await sendNotification({
            roleTarget: UserRole.DIRECTOR,
            title: "Invoice Menunggu Pengesahan Direktur",
            message: `Invoice ${document.invoiceNumber ?? id} telah ditandatangani Keuangan dan siap diketahui Direktur.`,
            actionUrl: "/apps/finance",
            type: NotificationType.APPROVAL,
            database: transaction,
          });
        } else {
          if (!document.signedAt) {
            throw new Error("Invoice harus ditandatangani Keuangan terlebih dahulu.");
          }
          if (document.acknowledgedAt) {
            throw new Error("Invoice sudah dikonfirmasi Direktur.");
          }
          publicCode = document.publicCode;
          const result = await transaction.invoice.updateMany({
            where: { id, signedAt: { not: null }, acknowledgedAt: null },
            data: {
              acknowledgedById: session.user.id,
              acknowledgedAt: new Date(),
            },
          });
          if (result.count !== 1) {
            throw new Error("Invoice baru saja dikonfirmasi.");
          }
        }
      } else if (kind === "KO") {
        const document = await transaction.orderConfirmation.findUnique({
          where: { id },
          select: {
            koNumber: true,
            publicCode: true,
            signedAt: true,
            acknowledgedAt: true,
          },
        });
        if (!document) throw new Error("Konfirmasi Order tidak ditemukan.");
        if (action === "sign") {
          if (document.signedAt) throw new Error("KO sudah ditandatangani.");
          publicCode =
            document.publicCode ??
            (await generateAvailablePublicCode(transaction));
          const result = await transaction.orderConfirmation.updateMany({
            where: { id, signedAt: null },
            data: {
              publicCode,
              signedById: session.user.id,
              signedAt: new Date(),
            },
          });
          if (result.count !== 1) throw new Error("KO baru saja ditandatangani.");
          await sendNotification({
            roleTarget: UserRole.FINANCE,
            title: "KO Menunggu Konfirmasi Keuangan",
            message: `KO ${document.koNumber} telah ditandatangani Logistik dan siap diketahui Keuangan.`,
            actionUrl: "/apps/finance",
            type: NotificationType.APPROVAL,
            database: transaction,
          });
        } else {
          if (!document.signedAt) {
            throw new Error("KO harus ditandatangani Logistik terlebih dahulu.");
          }
          if (document.acknowledgedAt) {
            throw new Error("KO sudah dikonfirmasi Keuangan.");
          }
          publicCode = document.publicCode;
          const result = await transaction.orderConfirmation.updateMany({
            where: { id, signedAt: { not: null }, acknowledgedAt: null },
            data: {
              acknowledgedById: session.user.id,
              acknowledgedAt: new Date(),
            },
          });
          if (result.count !== 1) throw new Error("KO baru saja dikonfirmasi.");
        }
      } else {
        const document = await transaction.deliveryOrder.findUnique({
          where: { id },
          select: {
            doNumber: true,
            publicCode: true,
            signedAt: true,
            acknowledgedAt: true,
          },
        });
        if (!document) throw new Error("Delivery Order tidak ditemukan.");
        publicCode = document.publicCode;
        if (action === "sign") {
          if (document.signedAt) throw new Error("DO sudah ditandatangani.");
          const result = await transaction.deliveryOrder.updateMany({
            where: { id, signedAt: null },
            data: {
              signedById: session.user.id,
              signedAt: new Date(),
            },
          });
          if (result.count !== 1) throw new Error("DO baru saja ditandatangani.");
          await sendNotification({
            roleTarget: UserRole.KOORDINATOR,
            title: "DO Menunggu Konfirmasi Koordinator Lapangan",
            message: `DO ${document.doNumber} telah ditandatangani Logistik dan siap dikonfirmasi Koordinator.`,
            actionUrl: "/apps/logistics",
            type: NotificationType.APPROVAL,
            database: transaction,
          });
        } else {
          if (!document.signedAt) {
            throw new Error("DO harus ditandatangani Logistik terlebih dahulu.");
          }
          if (document.acknowledgedAt) {
            throw new Error("DO sudah dikonfirmasi Koordinator Lapangan.");
          }
          const result = await transaction.deliveryOrder.updateMany({
            where: { id, signedAt: { not: null }, acknowledgedAt: null },
            data: {
              acknowledgedById: session.user.id,
              acknowledgedAt: new Date(),
            },
          });
          if (result.count !== 1) throw new Error("DO baru saja dikonfirmasi.");
        }
      }
    });
  } catch (error) {
    console.error("Transaction document sign-off failed:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Tanda tangan dokumen gagal disimpan. Silakan coba kembali.",
    };
  }

  revalidatePath("/apps/finance");
  revalidatePath("/apps/logistics");
  if (publicCode) {
    revalidatePath(
      documentVerificationPath(
        kind.toLowerCase() as "invoice" | "ko" | "do",
        publicCode,
      ),
    );
  }
  return {
    success: true,
    message:
      action === "sign"
        ? "Tanda tangan dokumen berhasil disimpan."
        : "Konfirmasi dokumen berhasil disimpan.",
  };
}
