import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import {
  getSmtpConfigurationStatus,
  sendNotificationEmailTest,
} from "@/lib/email-notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function describeSmtpError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/EAUTH|535|Authentication|Invalid login|Username and Password/i.test(message)) {
    return "Autentikasi SMTP ditolak. Periksa kembali SMTP_USER dan SMTP_PASSWORD di file .env (bungkus password dengan tanda kutip jika mengandung karakter # atau $).";
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|wrong version number/i.test(message)) {
    return "Koneksi ke server SMTP gagal. Periksa SMTP_HOST, SMTP_PORT (465 SSL atau 587 STARTTLS), dan firewall jaringan.";
  }
  if (message.includes("Konfigurasi SMTP") || message.includes("Alamat email akun")) {
    return message;
  }
  return "Email uji coba gagal dikirim. Periksa log server dan konfigurasi SMTP.";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json(
      { message: "Akun tidak ditemukan atau tidak aktif." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const status = getSmtpConfigurationStatus();
  return NextResponse.json(
    {
      ...status,
      userEmail: user.email,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, message: "Silakan masuk terlebih dahulu." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json(
      { success: false, message: "Akun tidak ditemukan atau tidak aktif." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const result = await sendNotificationEmailTest({
      name: user.name,
      email: user.email,
      role: user.role,
    });
    return NextResponse.json(
      {
        success: true,
        message: `Email uji coba berhasil dikirim ke ${result.recipientEmail} melalui port ${result.port} (${result.encryptionLabel}).`,
        ...result,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[Email Notification] Test email failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: describeSmtpError(error),
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

