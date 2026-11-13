import "server-only";

import dns from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import { NotificationType, UserRole } from "@prisma/client";
import { resolvePublicAppUrl } from "@/lib/documents/public-app-url";

const DEFAULT_FROM_ADDRESS =
  '"Notifikasi Skala Prioritas" <notifikasi@skala-prioritas.com>';
const DEFAULT_PUBLIC_URL = "https://skala-prioritas.com";
const LOGO_CID = "skala-logo@skala-prioritas.com";

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const DISALLOWED_EMAIL_HOSTS = new Set(["localhost", "example.com"]);

const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  [UserRole.DIRECTOR]: "Direktur",
  [UserRole.DEPUTY_DIRECTOR]: "Wakil Direktur",
  [UserRole.DRAFTER]: "Drafter Teknik",
  [UserRole.FINANCE]: "Bagian Keuangan",
  [UserRole.LOGISTICS]: "Koordinator Logistik",
  [UserRole.KOORDINATOR]: "Koordinator Lapangan",
  [UserRole.FIELD_TEAM]: "Tim Lapangan",
  [UserRole.MOVER]: "Petugas Mover",
  [UserRole.ADMINISTRATIONS]: "Administrator Sistem",
};

type CategoryTheme = {
  label: string;
  accentHex: string;
  badgeBgHex: string;
  badgeTextHex: string;
  badgeBorderHex: string;
  cardTintHex: string;
  iconSymbol: string;
  ctaLabel: string;
};

const CATEGORY_THEMES: Record<
  "approval" | "finance" | "logistics" | "warning" | "success" | "info",
  CategoryTheme
> = {
  approval: {
    label: "Otorisasi & Persetujuan",
    accentHex: "#F26522",
    badgeBgHex: "#FFE8D6",
    badgeTextHex: "#9A3412",
    badgeBorderHex: "#FED7AA",
    cardTintHex: "#EFF5FC",
    iconSymbol: "&#9733;",
    ctaLabel: "Tinjau & Beri Persetujuan",
  },
  finance: {
    label: "Bagian Keuangan",
    accentHex: "#1D4ED8",
    badgeBgHex: "#DBEAFE",
    badgeTextHex: "#1E40AF",
    badgeBorderHex: "#BFDBFE",
    cardTintHex: "#EFF5FC",
    iconSymbol: "&#9670;",
    ctaLabel: "Buka Antrean Keuangan",
  },
  logistics: {
    label: "Logistik & Pengadaan",
    accentHex: "#059669",
    badgeBgHex: "#D1FAE5",
    badgeTextHex: "#065F46",
    badgeBorderHex: "#A7F3D0",
    cardTintHex: "#ECFDF5",
    iconSymbol: "&#9654;",
    ctaLabel: "Proses di Modul Logistik",
  },
  warning: {
    label: "Perlu Perhatian",
    accentHex: "#E11D48",
    badgeBgHex: "#FFE4E6",
    badgeTextHex: "#9F1239",
    badgeBorderHex: "#FECDD3",
    cardTintHex: "#FFF1F2",
    iconSymbol: "&#9888;",
    ctaLabel: "Periksa Rincian Sekarang",
  },
  success: {
    label: "Selesai / Disetujui",
    accentHex: "#059669",
    badgeBgHex: "#D1FAE5",
    badgeTextHex: "#065F46",
    badgeBorderHex: "#A7F3D0",
    cardTintHex: "#ECFDF5",
    iconSymbol: "&#10003;",
    ctaLabel: "Lihat Status Dokumen",
  },
  info: {
    label: "Notifikasi Sistem",
    accentHex: "#0284C7",
    badgeBgHex: "#E0F2FE",
    badgeTextHex: "#075985",
    badgeBorderHex: "#BAE6FD",
    cardTintHex: "#EFF5FC",
    iconSymbol: "&#9679;",
    ctaLabel: "Buka Halaman Terkait",
  },
};

export type EmailNotificationRecipient = {
  id?: string;
  name: string;
  email: string;
  role?: UserRole | null;
};

export type SmtpConfigurationStatus = {
  configured: boolean;
  port: number;
  secure: boolean;
  encryptionLabel: string;
  fromAddress: string;
};

type ResolvedSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  encryptionLabel: string;
  user: string;
  pass: string;
  fromAddress: string;
};

type CachedTransporterState = {
  signature: string;
  transporter: Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options>;
};

type CachedDnsResolution = {
  host: string;
  connectHost: string;
  servername?: string;
  expiresAt: number;
};

const DNS_CACHE_TTL_MS = 5 * 60 * 1000;

const globalForSmtp = globalThis as typeof globalThis & {
  __skalaSmtpTransporter?: CachedTransporterState;
  __skalaSmtpDnsCache?: CachedDnsResolution;
  __skalaEmailLogoBuffer?: Buffer | null;
  __skalaMissingSmtpLogged?: boolean;
};

function firstNonEmptyEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return undefined;
}

function parsePortValue(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function resolveEncryptionFlags(port: number): {
  secure: boolean;
  requireTLS: boolean;
  encryptionLabel: string;
} {
  const explicitSecure = firstNonEmptyEnv("SMTP_SECURE")?.toLowerCase();
  if (explicitSecure === "true") {
    return { secure: true, requireTLS: false, encryptionLabel: "SSL/TLS" };
  }
  if (explicitSecure === "false") {
    return { secure: false, requireTLS: true, encryptionLabel: "STARTTLS" };
  }

  const encryptionHint = firstNonEmptyEnv(
    "SMTP_ENCRYPTION",
    "Encryption",
  )?.toLowerCase();
  if (port === 465) {
    return { secure: true, requireTLS: false, encryptionLabel: "SSL/TLS" };
  }
  if (encryptionHint?.includes("starttls") || port === 587) {
    return { secure: false, requireTLS: true, encryptionLabel: "TLS / STARTTLS" };
  }
  if (encryptionHint?.includes("ssl")) {
    return { secure: true, requireTLS: false, encryptionLabel: "SSL/TLS" };
  }
  return { secure: true, requireTLS: false, encryptionLabel: "SSL/TLS" };
}

function resolveSmtpConfig(): ResolvedSmtpConfig | null {
  const host = firstNonEmptyEnv("SMTP_HOST", "SMTP host");
  const port = parsePortValue(firstNonEmptyEnv("SMTP_PORT", "Port"), 465);
  const user = firstNonEmptyEnv("SMTP_USER", "SMTP_USERNAME", "Username");
  const pass =
    process.env.SMTP_PASSWORD ??
    process.env.SMTP_PASS ??
    process.env.Password ??
    "";
  const fromAddress = firstNonEmptyEnv("SMTP_FROM") || DEFAULT_FROM_ADDRESS;
  const { secure, requireTLS, encryptionLabel } = resolveEncryptionFlags(port);

  if (!host || !user || !pass.trim()) {
    return null;
  }

  return {
    host,
    port,
    secure,
    requireTLS,
    encryptionLabel,
    user,
    pass,
    fromAddress,
  };
}

/**
 * Reports safe, secret-free SMTP status for diagnostics and profile settings UI.
 */
export function getSmtpConfigurationStatus(): SmtpConfigurationStatus {
  const config = resolveSmtpConfig();
  if (config) {
    return {
      configured: true,
      port: config.port,
      secure: config.secure,
      encryptionLabel: config.encryptionLabel,
      fromAddress: config.fromAddress,
    };
  }

  const port = parsePortValue(firstNonEmptyEnv("SMTP_PORT", "Port"), 465);
  const { secure, encryptionLabel } = resolveEncryptionFlags(port);
  return {
    configured: false,
    port,
    secure,
    encryptionLabel,
    fromAddress: firstNonEmptyEnv("SMTP_FROM") || DEFAULT_FROM_ADDRESS,
  };
}

async function resolveSmtpConnectTarget(host: string): Promise<{
  connectHost: string;
  servername?: string;
}> {
  if (net.isIP(host) !== 0) {
    return { connectHost: host };
  }

  const cached = globalForSmtp.__skalaSmtpDnsCache;
  if (cached && cached.host === host && cached.expiresAt > Date.now()) {
    return {
      connectHost: cached.connectHost,
      servername: cached.servername,
    };
  }

  try {
    // Prefer OS IPv4 DNS resolution to bypass nodemailer's c-ares IPv6 lookup stalls on Windows.
    const { address } = await dns.lookup(host, { family: 4 });
    globalForSmtp.__skalaSmtpDnsCache = {
      host,
      connectHost: address,
      servername: host,
      expiresAt: Date.now() + DNS_CACHE_TTL_MS,
    };
    return { connectHost: address, servername: host };
  } catch {
    return { connectHost: host, servername: host };
  }
}

async function getOrCreateTransporter(
  config: ResolvedSmtpConfig,
): Promise<Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options>> {
  const target = await resolveSmtpConnectTarget(config.host);
  const signature = `${target.connectHost}:${target.servername ?? ""}:${config.port}:${config.secure}:${config.requireTLS}:${config.user}:${config.pass.length}`;
  const existing = globalForSmtp.__skalaSmtpTransporter;
  if (existing?.signature === signature) {
    return existing.transporter;
  }

  const transporter = nodemailer.createTransport({
    host: target.connectHost,
    port: config.port,
    secure: config.secure,
    ...(config.requireTLS ? { requireTLS: true } : {}),
    ...(target.servername ? { tls: { servername: target.servername } } : {}),
    auth: {
      user: config.user,
      pass: config.pass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  globalForSmtp.__skalaSmtpTransporter = { signature, transporter };
  return transporter;
}

function getInlineBrandLogo(): Buffer | null {
  if (globalForSmtp.__skalaEmailLogoBuffer !== undefined) {
    return globalForSmtp.__skalaEmailLogoBuffer;
  }

  try {
    const logoPath = path.join(process.cwd(), "public", "icons", "icon-192.png");
    if (!existsSync(logoPath)) {
      globalForSmtp.__skalaEmailLogoBuffer = null;
      return null;
    }
    const buffer = readFileSync(logoPath);
    globalForSmtp.__skalaEmailLogoBuffer = buffer;
    return buffer;
  } catch {
    globalForSmtp.__skalaEmailLogoBuffer = null;
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRoutableEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_FORMAT_REGEX.test(normalized)) return false;
  const domain = normalized.split("@")[1] ?? "";
  if (
    DISALLOWED_EMAIL_HOSTS.has(domain) ||
    domain.endsWith(".local") ||
    domain.endsWith(".invalid")
  ) {
    return false;
  }
  return true;
}

function selectCategoryTheme(
  type: NotificationType,
  actionUrl?: string | null,
): CategoryTheme {
  const url = actionUrl ?? "";
  if (type === NotificationType.WARNING) {
    return CATEGORY_THEMES.warning;
  }
  if (url.startsWith("/apps/finance")) {
    return CATEGORY_THEMES.finance;
  }
  if (url.startsWith("/apps/approvals") || type === NotificationType.APPROVAL) {
    return CATEGORY_THEMES.approval;
  }
  if (url.startsWith("/apps/logistics") || url.startsWith("/apps/orders")) {
    return CATEGORY_THEMES.logistics;
  }
  if (type === NotificationType.SUCCESS) {
    return CATEGORY_THEMES.success;
  }
  return CATEGORY_THEMES.info;
}

function extractDocumentMetadata(
  title: string,
  message: string,
): { referenceCode: string | null; amountLabel: string | null } {
  const combined = `${title} ${message}`;
  const referenceMatch = combined.match(
    /\b(?:TKT-\d{4,8}-\d+|SPE-[A-Z0-9/-]+|PO\s*#?\s*[A-Z0-9/-]+|DO\s*#?\s*[A-Z0-9/-]+|KO\s*#?\s*[A-Z0-9/-]+|SPK\s+[A-Z0-9/-]+|CCO\s+[A-Z0-9/-]+|INV-[A-Z0-9/-]+)\b/i,
  );
  const amountMatch = combined.match(/\bRp\s?[\d.,]+(?:\s*(?:rb|jt|m))?\b/i);

  return {
    referenceCode: referenceMatch ? referenceMatch[0].replace(/\s+/g, " ").trim() : null,
    amountLabel: amountMatch ? amountMatch[0].replace(/\s+/g, " ").trim() : null,
  };
}

function normalizeEmailBaseUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isLoopbackHostUrl(urlString: string): boolean {
  try {
    const { hostname } = new URL(urlString);
    return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(
      hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

function resolveEmailPublicBaseUrl(): string {
  const explicitEmailUrl = normalizeEmailBaseUrl(process.env.EMAIL_PUBLIC_URL);
  if (explicitEmailUrl) return explicitEmailUrl;

  const configuredUrls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ];
  for (const candidate of configuredUrls) {
    const normalized = normalizeEmailBaseUrl(candidate);
    if (normalized && !isLoopbackHostUrl(normalized)) {
      return normalized;
    }
  }

  const runtimeAppUrl = resolvePublicAppUrl()?.toString().replace(/\/$/, "");
  if (runtimeAppUrl && !isLoopbackHostUrl(runtimeAppUrl)) {
    return runtimeAppUrl;
  }

  return DEFAULT_PUBLIC_URL;
}

function resolveNotificationTargetUrl(actionUrl?: string | null): string {
  const base = resolveEmailPublicBaseUrl();
  if (!actionUrl || !actionUrl.startsWith("/") || actionUrl.startsWith("//")) {
    return base;
  }
  return new URL(actionUrl, base).toString();
}

function resolveActionCtaLabel(
  theme: CategoryTheme,
  type: NotificationType,
  actionUrl?: string | null,
): string {
  const url = actionUrl ?? "";
  if (type === NotificationType.APPROVAL) {
    if (url.startsWith("/apps/finance?tab=payments")) {
      return "Tinjau & Proses Pembayaran";
    }
    if (url.startsWith("/apps/finance?tab=rentals")) {
      return "Tinjau & Bayar Tagihan Sewa";
    }
    if (url.startsWith("/apps/finance?tab=subcontract")) {
      return "Tinjau & Proses Termin Subkon";
    }
    if (url.startsWith("/apps/finance?tab=check")) {
      return "Tinjau PO & Dokumen";
    }
    if (url === "/apps/finance") {
      return "Tinjau & Sahkan Dokumen";
    }
    if (url.startsWith("/apps/drafter")) {
      return "Tinjau Gambar Kerja";
    }
    if (url.startsWith("/apps/projects")) {
      return "Verifikasi Lapangan Sekarang";
    }
    if (url === "/apps/logistics") {
      return "Lihat Tugas & Dokumen Logistik";
    }
    return theme.ctaLabel;
  }
  if (url.startsWith("/apps/finance?tab=payments")) {
    return "Buka Antrean Pembayaran";
  }
  if (url.startsWith("/apps/finance?tab=rentals")) {
    return "Buka Antrean Tagihan Sewa";
  }
  if (url.startsWith("/apps/finance?tab=subcontract")) {
    return "Buka Administrasi Subkon";
  }
  if (url.startsWith("/apps/finance?tab=check")) {
    return "Periksa Dokumen PO";
  }
  if (url.startsWith("/apps/finance")) {
    return "Buka Finance Hub";
  }
  if (url.startsWith("/apps/drafter")) {
    return "Lihat Gambar Kerja";
  }
  if (url.startsWith("/apps/projects")) {
    return "Lihat Detail Proyek";
  }
  if (url.startsWith("/apps/orders/new")) {
    return "Buat & Terbitkan Surat Jalan";
  }
  if (url.startsWith("/apps/logistics?tab=equipment")) {
    return "Lihat Status Sewa & Aset";
  }
  if (url.startsWith("/apps/logistics?tab=tickets")) {
    return "Buka Tiket di Logistik";
  }
  if (url.startsWith("/apps/logistics")) {
    return "Buka Portal Logistik";
  }
  if (url.startsWith("/apps/tickets")) {
    return "Buka Detail Tiket";
  }
  if (url.startsWith("/user-profile?tab=notifications")) {
    return "Buka Pengaturan Notifikasi";
  }
  return theme.ctaLabel;
}

function formatWibTimestamp(date: Date): string {
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
  return `${formatted} WIB`;
}

/**
 * Renders the HTML, plain-text, and inline logo attachment for a notification email.
 */
export function buildNotificationEmailContent({
  recipient,
  title,
  message,
  actionUrl,
  type = NotificationType.INFO,
  createdAt = new Date(),
  includeLogoCid = true,
}: {
  recipient: EmailNotificationRecipient;
  title: string;
  message: string;
  actionUrl?: string | null;
  type?: NotificationType;
  createdAt?: Date;
  includeLogoCid?: boolean;
}): {
  subject: string;
  html: string;
  text: string;
  attachments: Mail.Attachment[];
} {
  const theme = selectCategoryTheme(type, actionUrl);
  const roleLabel = recipient.role
    ? ROLE_DISPLAY_NAMES[recipient.role]
    : "Tim Operasional";
  const targetUrl = resolveNotificationTargetUrl(actionUrl);
  const ctaLabel = resolveActionCtaLabel(theme, type, actionUrl);
  const timestampWib = formatWibTimestamp(createdAt);
  const { referenceCode, amountLabel } = extractDocumentMetadata(title, message);

  const safeName = escapeHtml(recipient.name.trim() || "Rekan Tim");
  const safeRole = escapeHtml(roleLabel);
  const safeTitle = escapeHtml(title.trim());
  const safeMessage = escapeHtml(message.trim()).replace(/\r?\n/g, "<br />");
  const safePreheader = escapeHtml(`${theme.label}: ${message.trim()}`);
  const safeUrl = escapeHtml(targetUrl);
  const safeRecipientEmail = escapeHtml(recipient.email.trim());

  const logoBuffer = includeLogoCid ? getInlineBrandLogo() : null;
  const attachments: Mail.Attachment[] = logoBuffer
    ? [
        {
          filename: "skala-prioritas-logo.png",
          content: logoBuffer,
          cid: LOGO_CID,
          contentDisposition: "inline",
        },
      ]
    : [];

  const logoBlock = logoBuffer
    ? `<img src="cid:${LOGO_CID}" alt="SPE" width="38" height="38" style="display:block;width:38px;height:38px;border-radius:8px;object-fit:contain;" />`
    : `<span style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;font-weight:800;font-size:13px;color:#0F2C59;">SPE</span>`;

  const metadataRows = [
    { label: "Bagian / Penerima", value: `${safeName} (${safeRole})` },
    { label: "Waktu Notifikasi", value: escapeHtml(timestampWib) },
    ...(referenceCode
      ? [{ label: "Referensi Dokumen", value: escapeHtml(referenceCode) }]
      : []),
    ...(amountLabel
      ? [{ label: "Nilai / Nominal", value: escapeHtml(amountLabel) }]
      : []),
  ];

  const metadataRowsHtml = metadataRows
    .map(
      (row, index) => `
      <tr class="sp-meta-row">
        <td class="sp-meta-label" style="padding:12px 18px;font-size:13px;color:#475569;width:38%;vertical-align:top;${
          index < metadataRows.length - 1
            ? "border-bottom:1px solid #E2E8F0;"
            : ""
        }">${row.label}</td>
        <td class="sp-meta-value" style="padding:12px 18px;font-size:13.5px;font-weight:700;color:#0F172A;vertical-align:top;word-break:break-word;overflow-wrap:break-word;${
          index < metadataRows.length - 1
            ? "border-bottom:1px solid #E2E8F0;"
            : ""
        }">${row.value}</td>
      </tr>`,
    )
    .join("");

  const subject = `[Skala Prioritas] ${title.trim()}`;
  const preheaderFiller = "&nbsp;&zwnj;".repeat(40);

  const html = `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${safeTitle}</title>
  <style type="text/css">
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      border-collapse: collapse !important;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    a[x-apple-data-detectors],
    u + #sp-body a,
    #MessageViewBody a {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    @media only screen and (max-width: 600px) {
      .sp-outer-td {
        padding: 12px 8px !important;
      }
      .sp-card {
        border-radius: 12px !important;
      }
      .sp-header-pad {
        padding: 16px 16px 14px 16px !important;
      }
      .sp-body-pad {
        padding: 20px 16px 20px 16px !important;
      }
      .sp-footer-pad {
        padding: 16px 16px !important;
      }
      .sp-badge-wrap {
        max-width: 100% !important;
        padding-top: 10px !important;
        text-align: left !important;
      }
      .sp-h1 {
        font-size: 20px !important;
        line-height: 1.3 !important;
        margin-bottom: 16px !important;
      }
      .sp-msg-td {
        padding: 14px 14px !important;
        font-size: 14px !important;
        line-height: 1.6 !important;
      }
      .sp-meta-row,
      .sp-meta-label,
      .sp-meta-value {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .sp-meta-label {
        padding: 11px 14px 2px 14px !important;
        border-bottom: none !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.4px !important;
        color: #64748B !important;
      }
      .sp-meta-value {
        padding: 0 14px 11px 14px !important;
        font-size: 13.5px !important;
      }
      .sp-cta-wrap {
        width: 100% !important;
      }
      .sp-cta-btn {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 14px 16px !important;
        font-size: 15px !important;
        text-align: center !important;
      }
      .sp-link-td {
        padding: 12px 14px !important;
      }
    }
  </style>
</head>
<body id="sp-body" style="margin:0;padding:0;width:100%;background-color:#EEF2F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0F172A;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
    ${safePreheader}${preheaderFiller}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#EEF2F6;table-layout:fixed;">
    <tr>
      <td align="center" class="sp-outer-td" style="padding:24px 12px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="sp-card" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #D5DEE8;box-shadow:0 6px 20px rgba(15,23,42,0.06);table-layout:fixed;">
          <!-- White Brand Header (Fluid-Hybrid Desktop + Mobile) -->
          <tr>
            <td class="sp-header-pad" style="background-color:#FFFFFF;padding:20px 26px 16px 26px;font-size:0;text-align:left;">
              <!--[if mso]>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
              <td valign="middle" width="315">
              <![endif]-->
              <div style="display:inline-block;width:100%;max-width:308px;vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background-color:#FFFFFF;border:2px solid #0F2C59;border-radius:10px;padding:3px;vertical-align:middle;">
                      ${logoBlock}
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <div style="font-size:15.5px;font-weight:800;letter-spacing:0.4px;color:#0F172A;line-height:1.2;">
                        SKALA PRIORITAS
                      </div>
                      <div style="font-size:10px;font-weight:600;letter-spacing:0.8px;color:#64748B;text-transform:uppercase;margin-top:2px;line-height:1.3;">
                        ENGINEERING &bull; SISTEM OPERASIONAL
                      </div>
                    </td>
                  </tr>
                </table>
              </div>
              <!--[if mso]>
              </td>
              <td valign="middle" align="right" width="233">
              <![endif]-->
              <div class="sp-badge-wrap" style="display:inline-block;width:100%;max-width:230px;vertical-align:middle;text-align:right;padding-top:6px;">
                <span style="display:inline-block;background-color:${theme.badgeBgHex};color:${theme.badgeTextHex};border:1px solid ${theme.badgeBorderHex};border-radius:999px;padding:6px 13px;font-size:11.5px;font-weight:700;letter-spacing:0.2px;line-height:1.2;white-space:nowrap;">
                  ${theme.iconSymbol}&nbsp;${escapeHtml(theme.label)}
                </span>
              </div>
              <!--[if mso]>
              </td>
              </tr>
              </table>
              <![endif]-->
            </td>
          </tr>
          <!-- Dual Accent Rule -->
          <tr>
            <td style="background-color:#0F2C59;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:#F26522;height:2px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td class="sp-body-pad" style="padding:26px 26px 24px 26px;background-color:#FFFFFF;">
              <p style="margin:0 0 10px 0;font-size:14px;color:#1E293B;line-height:1.6;">
                Halo <strong style="color:#0F172A;">${safeName}</strong>,
                <span style="display:inline-block;margin:2px 0 2px 6px;background-color:#E2E8F0;color:#475569;border-radius:6px;padding:3px 9px;font-size:11.5px;font-weight:600;vertical-align:middle;line-height:1.3;">
                  ${safeRole}
                </span>
              </p>

              <h1 class="sp-h1" style="margin:0 0 18px 0;font-size:23px;font-weight:800;line-height:1.25;letter-spacing:-0.3px;color:#0F2C59;word-break:break-word;overflow-wrap:break-word;">
                ${safeTitle}
              </h1>

              <!-- Message Highlight Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-bottom:18px;background-color:${theme.cardTintHex};border:1px solid #CBD5E1;border-left:5px solid ${theme.accentHex};border-radius:10px;table-layout:fixed;">
                <tr>
                  <td class="sp-msg-td" style="padding:16px 18px;font-size:14.5px;line-height:1.65;color:#1E293B;word-break:break-word;overflow-wrap:break-word;">
                    ${safeMessage}
                  </td>
                </tr>
              </table>

              <!-- Summary Details Table -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-bottom:22px;background-color:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;overflow:hidden;table-layout:fixed;">
                ${metadataRowsHtml}
              </table>

              <!-- Primary CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                <tr>
                  <td align="center" style="padding:2px 0 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="sp-cta-wrap" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="border-radius:10px;background-color:#0F2C59;">
                          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="sp-cta-btn" style="display:inline-block;background-color:#0F2C59;color:#FFFFFF;font-size:14.5px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 28px;border-radius:10px;border-bottom:3px solid #F26522;">
                            ${escapeHtml(ctaLabel)} &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#EFF5FC;border:1px solid #DBE6F2;border-radius:10px;table-layout:fixed;">
                <tr>
                  <td class="sp-link-td" style="padding:13px 16px;font-size:12px;line-height:1.55;color:#64748B;word-break:break-all;overflow-wrap:anywhere;">
                    <div style="margin-bottom:3px;font-weight:600;word-break:normal;overflow-wrap:normal;">Tautan langsung:</div>
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#0F2C59;font-weight:500;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">
                      ${safeUrl}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Dark Charcoal Footer Band -->
          <tr>
            <td class="sp-footer-pad" style="background-color:#474D57;padding:20px 26px;">
              <p style="margin:0 0 8px 0;font-size:11.5px;line-height:1.6;color:#E2E8F0;word-break:break-word;overflow-wrap:break-word;">
                Email ini dikirim otomatis oleh sistem <strong style="color:#FFFFFF;">PT. Skala Prioritas Engineering</strong>
                (notifikasi@skala-prioritas.com) agar setiap tiket, persetujuan, dan antrean pembayaran langsung tertangani tanpa perlu screenshot manual.
              </p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#CBD5E1;word-break:break-word;overflow-wrap:break-word;">
                Dikirim ke <span style="color:#F8FAFC;">${safeRecipientEmail}</span> &bull; Mohon tidak membalas langsung email otomatis ini.
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    "SKALA PRIORITAS ENGINEERING - NOTIFIKASI SISTEM",
    `Kategori: ${theme.label}`,
    `Halo ${recipient.name.trim() || "Rekan Tim"} (${roleLabel}),`,
    "",
    title.trim(),
    message.trim(),
    "",
    ...(referenceCode ? [`Referensi: ${referenceCode}`] : []),
    ...(amountLabel ? [`Nominal: ${amountLabel}`] : []),
    `Waktu: ${timestampWib}`,
    `Buka di aplikasi: ${targetUrl}`,
    "",
    "--",
    "Dikirim otomatis oleh Notifikasi Skala Prioritas <notifikasi@skala-prioritas.com>.",
  ];

  return {
    subject,
    html,
    text: textLines.join("\n"),
    attachments,
  };
}

/**
 * Dispatches notification emails to all active recipients with valid emails.
 * Never throws so callers remain resilient if SMTP is unavailable.
 */
export async function sendNotificationEmails({
  recipients,
  title,
  message,
  actionUrl,
  type = NotificationType.INFO,
}: {
  recipients: EmailNotificationRecipient[];
  title: string;
  message: string;
  actionUrl?: string | null;
  type?: NotificationType;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  const uniqueRecipients: EmailNotificationRecipient[] = [];
  const seenEmails = new Set<string>();
  let skipped = 0;

  for (const recipient of recipients) {
    const email = recipient.email?.trim() ?? "";
    if (!isRoutableEmail(email)) {
      skipped += 1;
      continue;
    }
    const normalized = email.toLowerCase();
    if (seenEmails.has(normalized)) {
      continue;
    }
    seenEmails.add(normalized);
    uniqueRecipients.push({ ...recipient, email });
  }

  if (uniqueRecipients.length === 0) {
    return { sent: 0, skipped, failed: 0 };
  }

  const config = resolveSmtpConfig();
  if (!config) {
    if (!globalForSmtp.__skalaMissingSmtpLogged) {
      globalForSmtp.__skalaMissingSmtpLogged = true;
      console.warn(
        "[Email Notification] SMTP credentials incomplete; skipping email delivery.",
      );
    }
    return { sent: 0, skipped: skipped + uniqueRecipients.length, failed: 0 };
  }

  const transporter = await getOrCreateTransporter(config);
  const createdAt = new Date();

  const results = await Promise.allSettled(
    uniqueRecipients.map(async (recipient) => {
      const rendered = buildNotificationEmailContent({
        recipient,
        title,
        message,
        actionUrl,
        type,
        createdAt,
      });
      await transporter.sendMail({
        from: config.fromAddress,
        to: recipient.name.trim()
          ? `"${recipient.name.replace(/"/g, "")}" <${recipient.email}>`
          : recipient.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        attachments: rendered.attachments,
      });
    }),
  );

  let sent = 0;
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sent += 1;
      return;
    }
    failed += 1;
    console.error(
      `[Email Notification] Delivery failed for ${uniqueRecipients[index]?.email}:`,
      result.reason,
    );
  });

  return { sent, skipped, failed };
}

/**
 * Verifies SMTP configuration and delivers a synchronous test email for diagnostics.
 */
export async function sendNotificationEmailTest(recipient: {
  name: string;
  email: string;
  role?: UserRole | null;
}): Promise<{ recipientEmail: string; fromAddress: string; port: number; encryptionLabel: string }> {
  const email = recipient.email.trim();
  if (!isRoutableEmail(email)) {
    throw new Error(
      `Alamat email akun (${email || "kosong"}) tidak valid untuk menerima email.`,
    );
  }

  const config = resolveSmtpConfig();
  if (!config) {
    throw new Error(
      "Konfigurasi SMTP di .env belum lengkap (butuh SMTP_HOST, SMTP_PORT, SMTP_USER, dan SMTP_PASSWORD).",
    );
  }

  const transporter = await getOrCreateTransporter(config);
  await transporter.verify();

  const rendered = buildNotificationEmailContent({
    recipient: {
      name: recipient.name,
      email,
      role: recipient.role,
    },
    title: "Uji Coba Notifikasi Email Skala Prioritas",
    message:
      "TKT-202611-TEST · Pengaturan SMTP berhasil terhubung dengan baik. Mulai sekarang setiap tiket, persetujuan Direksi, PO, dan antrean pembayaran Keuangan akan dikirim otomatis ke email ini.",
    actionUrl: "/user-profile?tab=notifications",
    type: NotificationType.APPROVAL,
  });

  await transporter.sendMail({
    from: config.fromAddress,
    to: recipient.name.trim()
      ? `"${recipient.name.replace(/"/g, "")}" <${email}>`
      : email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    attachments: rendered.attachments,
  });

  return {
    recipientEmail: email,
    fromAddress: config.fromAddress,
    port: config.port,
    encryptionLabel: config.encryptionLabel,
  };
}

