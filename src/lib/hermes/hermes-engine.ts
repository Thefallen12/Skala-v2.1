import { randomBytes, randomUUID } from "node:crypto";
import {
  ProjectStatus,
  TicketPriority,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { connectToMongoDB } from "@/lib/mongoose";
import {
  decimalStringFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import {
  calculateWeightedProjectProgress,
  toJakartaDateKey,
  toJakartaDayStartDate,
} from "@/lib/project-progress";
import { getJakartaDayRange } from "@/lib/habit-date";
import { sendNotification } from "@/lib/notifications";
import {
  getPaidProjectTicketRealization,
  type PaidProjectTicketRealization,
  type ProjectFundCategory,
} from "@/lib/project-realization";
import {
  createBrandedQrDataUrl,
  getDocumentHeaderLogoDataUrl,
} from "@/lib/documents/qr-code";
import { renderUniversalTransactionDocument } from "@/lib/documents/universal-transaction-print";
import { projectSiteName } from "@/lib/documents/project-site-name";
import {
  ChatGeneratedDocumentModel,
  type ChatAttachmentItem,
  type ChatDataActionResult,
  type ChatDataActionType,
  type ChatGeneratedDocumentRecord,
  type HermesDocType,
} from "@/models/chat";

export const HERMES_DOC_TYPES: readonly HermesDocType[] = [
  "SPK",
  "BAST",
  "PO",
  "DO",
  "KWITANSI",
  "LAMPIRAN_KEUANGAN",
  "LAPORAN_PROYEK",
  "SURAT_RESMI",
] as const;

export const HERMES_INSTALL_COMMANDS: string[] = [
  "curl -fsSLO https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh",
  "less install.sh",
  "bash install.sh",
  "hermes config set GEMINI_API_KEY \"$API_KEY_GEMINI\"",
  "hermes config set API_SERVER_ENABLED true",
  "hermes gateway",
];

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
const DEFAULT_HERMES_GATEWAY_URL = "http://127.0.0.1:8642";
const BLOCKED_METADATA_HOSTS = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "metadata.google.internal",
  "metadata.goog",
]);

export interface HermesGatewayStatus {
  gatewayOnline: boolean;
  gatewayUrl: string;
  model: string | null;
  engineMode: "hermes-gateway" | "hermes-builtin-erp";
  detail: string;
  installCommands: string[];
}

export interface ErpFundCategoryBreakdown {
  count: number;
  requestedAmount: number;
  requestedFormatted: string;
  paidAmount: number;
  paidFormatted: string;
}

export interface ErpProjectFundTicketItem {
  ticketNumber: string;
  title: string;
  fundCategory: ProjectFundCategory;
  fundCategoryLabel: string;
  status: string;
  paid: boolean;
  paymentStatusLabel: string;
  amount: number;
  amountFormatted: string;
  requesterName: string;
  createdAt: string;
}

export interface ErpProjectFundRecap {
  totalTicketsCount: number;
  totalRequestedAmount: number;
  totalRequestedFormatted: string;
  totalPaidAmount: number;
  totalPaidFormatted: string;
  remainingFromRequestedAmount: number;
  remainingFromRequestedFormatted: string;
  remainingFromPaidAmount: number;
  remainingFromPaidFormatted: string;
  absorptionRequestedPct: number;
  absorptionPaidPct: number;
  byCategory: {
    TUKANG: ErpFundCategoryBreakdown;
    BAHAN: ErpFundCategoryBreakdown;
    SEWA: ErpFundCategoryBreakdown;
    INVENTARIS: ErpFundCategoryBreakdown;
    OPERASIONAL: ErpFundCategoryBreakdown;
  };
  tickets: ErpProjectFundTicketItem[];
}

export interface ErpProjectSummary {
  id: string;
  code: string;
  name: string;
  title: string;
  kelompokTani: string;
  address: string;
  location: string | null;
  picName: string | null;
  progress: number;
  status: string;
  paguAmount: number;
  paguFormatted: string;
  clientName: string | null;
  vendor: string | null;
  fundRecap: ErpProjectFundRecap;
}

export interface ErpSelectedProjectDetail extends ErpProjectSummary {
  jenisPekerjaan: string | null;
  budgetAmount: number;
  budgetFormatted: string;
  startDate: string | null;
  endDate: string | null;
  workPoints: Array<{
    id: string;
    title: string;
    location: string | null;
    progress: number;
    proposedTotalWageAmount: number;
    proposedTotalWageFormatted: string;
    approvedTotalWageAmount: number | null;
    approvedTotalWageFormatted: string | null;
  }>;
  latestDailyReports: Array<{
    id: string;
    reportDate: string;
    weather: string | null;
    workersCount: number;
    progress: number | null;
    workSummary: string | null;
    notes: string | null;
  }>;
}

export interface ErpSelectedTicketDetail {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  amount: number;
  amountFormatted: string;
  recipientName: string | null;
  requesterName: string | null;
  projectName: string | null;
  items: Array<{
    itemName: string;
    quantity: number;
    unit: string;
    estimatedUnitCost: number | null;
  }>;
}

export interface HermesErpContextSummary {
  activeProjectsCount: number;
  topProjects: ErpProjectSummary[];
  matchedProjects: ErpProjectSummary[];
  selectedProject: ErpSelectedProjectDetail | null;
  selectedTicket: ErpSelectedTicketDetail | null;
  pendingTicketsCount: number;
  latestPendingTickets: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    amount: number;
    amountFormatted: string;
    requesterName: string | null;
    projectName: string | null;
    createdAt: string;
  }>;
  matchedTickets: Array<{
    ticketNumber: string;
    title: string;
    projectName: string;
    projectCode: string;
    picName: string | null;
    fundCategory: ProjectFundCategory;
    fundCategoryLabel: string;
    status: string;
    paid: boolean;
    paymentStatusLabel: string;
    amount: number;
    amountFormatted: string;
    requesterName: string;
    createdAt: string;
  }>;
  lowStockItems: Array<{
    id: string;
    sku: string;
    name: string;
    unit: string;
    stockQuantity: string;
    minimumStock: string;
    unitPriceFormatted: string;
  }>;
  totalStockItemsCount: number;
}

export interface DetectedDocumentIntent {
  isDocumentRequest: boolean;
  docType: HermesDocType | null;
  extractedAmount: number | null;
  extractedRecipient: string | null;
  extractedPurpose: string | null;
}

export interface HermesDocItemParam {
  itemCode?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  totalPrice?: number | null;
  remarks?: string | null;
}

export interface HermesDocParams {
  title?: string;
  subtitle?: string;
  recipientName?: string;
  recipientRole?: string;
  recipientAddress?: string;
  amount?: number | null;
  purpose?: string;
  description?: string;
  notes?: string;
  terms?: string[];
  vendorName?: string;
  paymentMethod?: string;
  bankInfo?: string;
  driverName?: string;
  vehiclePlate?: string;
  bastType?: "PHO" | "FHO";
  date?: string;
  items?: HermesDocItemParam[];
}

export interface CallHermesGatewayInput {
  message: string;
  erpContext: HermesErpContextSummary;
  userName?: string;
  userRole?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  customGatewayUrl?: string | null;
  customApiKey?: string | null;
  systemInstructionExtra?: string;
}

export interface GenerateHermesDocumentInput {
  docType: HermesDocType;
  prompt: string;
  projectId?: string | null;
  ticketId?: string | null;
  docParams?: HermesDocParams | null;
  user: {
    id: string;
    name: string;
    role: string;
  };
  verificationBaseUrl: URL;
  erpContext?: HermesErpContextSummary;
  gatewayStatus?: HermesGatewayStatus;
  detectedIntent?: DetectedDocumentIntent;
  customGatewayUrl?: string | null;
  customApiKey?: string | null;
}

export function isHermesDocType(value: unknown): value is HermesDocType {
  return (
    typeof value === "string" &&
    HERMES_DOC_TYPES.includes(value as HermesDocType)
  );
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatWibDate(value: Date | string | null | undefined): string {
  if (!value) {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date());
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function parseScaledAmount(value: unknown): number {
  if (typeof value === "bigint") {
    const parsed = Number(decimalStringFromScaledInteger(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatScaledQuantity(value: unknown): string {
  if (typeof value === "bigint") {
    return decimalStringFromScaledInteger(value);
  }
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return "0";
}

function toBigIntComparable(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return BigInt(0);
}

function resolveValidatedGatewayUrl(customGatewayUrl?: string | null): {
  valid: boolean;
  url: string;
  error?: string;
} {
  const raw =
    customGatewayUrl?.trim() ||
    process.env.HERMES_API_URL?.trim() ||
    DEFAULT_HERMES_GATEWAY_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false,
        url: raw,
        error: "Protokol gateway Hermes harus http:// atau https://.",
      };
    }
    if (parsed.username || parsed.password) {
      return {
        valid: false,
        url: parsed.origin,
        error: "URL gateway tidak boleh menyertakan kredensial inline.",
      };
    }
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (BLOCKED_METADATA_HOSTS.has(hostname)) {
      return {
        valid: false,
        url: raw,
        error: "Host gateway tidak diizinkan.",
      };
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const normalized =
      cleanPath && cleanPath !== "/"
        ? `${parsed.origin}${cleanPath}`
        : parsed.origin;
    return { valid: true, url: normalized };
  } catch {
    return {
      valid: false,
      url: raw,
      error: "Format URL gateway Hermes tidak valid.",
    };
  }
}

function normalizeEnvSecret(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export function resolveGeminiApiKey(customApiKey?: string | null): string {
  const custom = normalizeEnvSecret(customApiKey);
  if (custom && (/^AQ\./i.test(custom) || /^AIza/i.test(custom))) {
    return custom;
  }
  return (
    normalizeEnvSecret(process.env.API_KEY_GEMINI) ||
    normalizeEnvSecret(process.env.GEMINI_API_KEY) ||
    normalizeEnvSecret(process.env.GOOGLE_API_KEY)
  );
}

function getGeminiModelCandidates(): string[] {
  const configured = normalizeEnvSecret(process.env.GEMINI_MODEL);
  const candidates = [
    configured,
    DEFAULT_GEMINI_MODEL,
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

export async function callGeminiApi(params: {
  apiKey: string;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
}): Promise<string | null> {
  const cleanKey = normalizeEnvSecret(params.apiKey);
  const cleanMessage = params.message.trim();
  if (!cleanKey || !cleanMessage) {
    return null;
  }

  const contents = [
    ...params.history
      .map((turn) => ({
        role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: turn.content.slice(0, 2000).trim() }],
      }))
      .filter((turn) => turn.parts[0].text.length > 0),
    {
      role: "user" as const,
      parts: [{ text: cleanMessage }],
    },
  ];

  const models = getGeminiModelCandidates();
  for (const model of models) {
    try {
      const endpoint = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: params.systemPrompt }],
          },
          contents,
          generationConfig: {
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string | null }>;
          };
        }>;
      };
      const text = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
      if (text) {
        return text;
      }
    } catch {
      // Lanjut ke model fallback berikutnya bila timeout / error jaringan.
    }
  }

  return null;
}

function buildGeminiOnlineStatus(): HermesGatewayStatus {
  const model = getGeminiModelCandidates()[0] ?? DEFAULT_GEMINI_MODEL;
  return {
    gatewayOnline: true,
    gatewayUrl: GEMINI_API_BASE_URL,
    model,
    engineMode: "hermes-gateway",
    detail:
      "Bunglon Assistant (SKALA AI) terhubung ke Google Gemini API + Live Database Skala ERP.",
    installCommands: HERMES_INSTALL_COMMANDS,
  };
}

export async function checkHermesGatewayStatus(
  customGatewayUrl?: string | null,
  customApiKey?: string | null,
): Promise<HermesGatewayStatus> {
  const geminiKey = resolveGeminiApiKey(customApiKey);
  const resolved = resolveValidatedGatewayUrl(customGatewayUrl);
  if (!resolved.valid) {
    if (geminiKey) {
      return buildGeminiOnlineStatus();
    }
    return {
      gatewayOnline: false,
      gatewayUrl: resolved.url,
      model: null,
      engineMode: "hermes-builtin-erp",
      detail: `${resolved.error ?? "URL gateway tidak valid."} Menggunakan mesin bawaan Skala ERP.`,
      installCommands: HERMES_INSTALL_COMMANDS,
    };
  }

  if (resolved.url.includes("generativelanguage.googleapis.com") && geminiKey) {
    return buildGeminiOnlineStatus();
  }

  const apiKey =
    normalizeEnvSecret(customApiKey) || normalizeEnvSecret(process.env.HERMES_API_KEY);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const defaultModel = process.env.HERMES_MODEL?.trim() || "hermes-agent";

  try {
    const modelsRes = await fetch(`${resolved.url}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });

    if (modelsRes.ok) {
      let model = defaultModel;
      try {
        const json = (await modelsRes.json()) as {
          data?: Array<{ id?: string }>;
          model?: string;
        };
        model =
          json?.data?.[0]?.id?.trim() || json?.model?.trim() || defaultModel;
      } catch {
        // Gunakan model default bila endpoint tidak mengembalikan body JSON.
      }
      return {
        gatewayOnline: true,
        gatewayUrl: resolved.url,
        model,
        engineMode: "hermes-gateway",
        detail: `Hermes Gateway aktif pada ${resolved.url} (model: ${model}).`,
        installCommands: HERMES_INSTALL_COMMANDS,
      };
    }

    if (modelsRes.status === 401 || modelsRes.status === 403) {
      if (geminiKey) {
        return buildGeminiOnlineStatus();
      }
      return {
        gatewayOnline: false,
        gatewayUrl: resolved.url,
        model: null,
        engineMode: "hermes-builtin-erp",
        detail: `Gateway Hermes terdeteksi di ${resolved.url}, tetapi membutuhkan HERMES_API_KEY yang valid (HTTP ${modelsRes.status}). Menggunakan mesin bawaan Skala ERP.`,
        installCommands: HERMES_INSTALL_COMMANDS,
      };
    }

    if (modelsRes.status === 404) {
      const healthRes = await fetch(`${resolved.url}/health`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      });
      if (healthRes.ok) {
        return {
          gatewayOnline: true,
          gatewayUrl: resolved.url,
          model: defaultModel,
          engineMode: "hermes-gateway",
          detail: `Hermes Gateway aktif melalui endpoint /health pada ${resolved.url}.`,
          installCommands: HERMES_INSTALL_COMMANDS,
        };
      }
    }

    if (geminiKey) {
      return buildGeminiOnlineStatus();
    }

    return {
      gatewayOnline: false,
      gatewayUrl: resolved.url,
      model: null,
      engineMode: "hermes-builtin-erp",
      detail: `Gateway Hermes merespons HTTP ${modelsRes.status} di ${resolved.url}. Menggunakan mesin bawaan Skala ERP.`,
      installCommands: HERMES_INSTALL_COMMANDS,
    };
  } catch {
    if (geminiKey) {
      return buildGeminiOnlineStatus();
    }
    return {
      gatewayOnline: false,
      gatewayUrl: resolved.url,
      model: null,
      engineMode: "hermes-builtin-erp",
      detail: `Gateway Hermes offline / tidak terjangkau di ${resolved.url}. Mesin bawaan Skala ERP aktif untuk tanya-jawab data & pembuatan dokumen resmi.`,
      installCommands: HERMES_INSTALL_COMMANDS,
    };
  }
}

const FUND_CATEGORY_LABELS: Record<ProjectFundCategory, string> = {
  TUKANG: "Ambilan Tukang",
  BAHAN: "Pembelanjaan Bahan",
  SEWA: "Rumah & Kendaraan Sewa",
  INVENTARIS: "Barang Inventaris",
  OPERASIONAL: "Operasional & Lainnya",
};

const SEWA_RENTAL_TEXT_PATTERN =
  /rumah\s*sewa|mess\s*(tukang|pekerja|proyek)?|kontrakan|basecamp|kendaraan\s*sewa|sewa\s*(rumah|mess|kos|kendaraan|armada|alat|truk|truck|mobil|pickup|excavator|molen|genset|stamper)|\bsewa\b/i;

const QUERY_STOP_WORDS = new Set([
  "berapa",
  "sudah",
  "belum",
  "pengeluaran",
  "pemasukan",
  "anggaran",
  "realisasi",
  "cair",
  "lunas",
  "pending",
  "dana",
  "uang",
  "biaya",
  "total",
  "jumlah",
  "project",
  "proyek",
  "progres",
  "progress",
  "tiket",
  "ticket",
  "pengajuan",
  "pic",
  "nya",
  "yang",
  "untuk",
  "dengan",
  "dari",
  "saat",
  "ini",
  "sekarang",
  "tolong",
  "bunglon",
  "skala",
  "assistant",
  "hermes",
  "halo",
  "coba",
  "cek",
  "lihat",
  "data",
  "info",
  "infokan",
  "ringkas",
  "rincian",
  "detail",
  "rekap",
  "dong",
  "min",
  "pak",
  "ibu",
  "mas",
  "mbak",
  "apa",
  "saja",
  "mana",
  "bagaimana",
  "gimana",
  "kapan",
  "atas",
  "nama",
  "di",
  "ke",
  "pada",
  "dan",
  "atau",
]);

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQueryTokens(queryText?: string | null): string[] {
  if (!queryText) return [];
  const normalized = normalizeSearchText(queryText);
  if (!normalized) return [];
  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !QUERY_STOP_WORDS.has(t));
  return Array.from(new Set(tokens));
}

function cleanCatalogStockName(value: string): string {
  return value
    .toLowerCase()
    .replace(/½/g, "1/2")
    .replace(/1[,.]5/g, "1/2")
    .replace(/[\/,\-_x×]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyFundCategoryLikeTab(ticket: {
  title: string;
  type?: string | null;
  ticketType?: string | null;
  requestCategory?: string | null;
  fieldCategory?: string | null;
  fundCategory?: ProjectFundCategory | null;
  items?: Array<{ itemName: string }>;
}): ProjectFundCategory {
  const title = (ticket.title || "").toLowerCase();
  const desc = (ticket.items ?? [])
    .map((item) => item.itemName.toLowerCase())
    .join(" ");
  const text = `${title} ${desc}`;
  const reqCat = (ticket.requestCategory || "").toUpperCase();
  const fieldCat = (ticket.fieldCategory || "").toUpperCase();
  const type = (ticket.type || "").toUpperCase();
  const ticketType = (ticket.ticketType || "").toUpperCase();

  if (
    ticket.fundCategory === "SEWA" ||
    reqCat === "HOUSE_RENTAL" ||
    reqCat === "VEHICLE_RENTAL" ||
    reqCat === "EQUIPMENT_REQUEST" ||
    fieldCat === "HOUSE_RENTAL" ||
    fieldCat === "VEHICLE_RENTAL" ||
    fieldCat === "RENTAL" ||
    ticketType === "EQUIPMENT_REQUEST" ||
    ticketType === "HOUSE_RENTAL" ||
    ticketType === "VEHICLE_RENTAL" ||
    ticketType === "EQUIPMENT_RENTAL" ||
    SEWA_RENTAL_TEXT_PATTERN.test(text)
  ) {
    return "SEWA";
  }

  if (fieldCat === "HAULING" || /langsir/.test(text)) {
    return "OPERASIONAL";
  }

  if (
    ticket.fundCategory === "TUKANG" ||
    fieldCat === "LABOR" ||
    reqCat === "KASBON" ||
    /tukang|mandor|upah|kasbon|gaji|ambilan|tenaga|pekerja|borongan|ongkos/.test(
      text,
    )
  ) {
    return "TUKANG";
  }

  if (
    ticket.fundCategory === "INVENTARIS" ||
    /inventaris|alat|mesin|genset|molen|peralatan|perkakas|gerobak|scaffolding|helm|rompi|cangkul|meteran|equipment|aset/.test(
      text,
    )
  ) {
    return "INVENTARIS";
  }

  if (
    ticket.fundCategory === "BAHAN" ||
    type === "MATERIAL" ||
    reqCat === "MATERIAL" ||
    reqCat === "WAREHOUSE" ||
    reqCat === "STOCK" ||
    reqCat === "NEW_PURCHASE" ||
    reqCat === "MATERIAL_CONTRACT" ||
    fieldCat === "MATERIAL" ||
    fieldCat === "DIRECT_STORE" ||
    /bahan|material|semen|pasir|batu|besi|cat|keramik|kayu|paku|pipa|bata|toko|triplek|baut|seng/.test(
      text,
    )
  ) {
    return "BAHAN";
  }

  return "OPERASIONAL";
}

function buildProjectFundRecap(
  contractValue: number,
  realization: PaidProjectTicketRealization | undefined,
  stockCatalog: Array<{ name: string; cleanName: string; unitPrice: number }>,
): ErpProjectFundRecap {
  const buckets: Record<
    ProjectFundCategory,
    { count: number; requested: number; paid: number }
  > = {
    TUKANG: { count: 0, requested: 0, paid: 0 },
    BAHAN: { count: 0, requested: 0, paid: 0 },
    SEWA: { count: 0, requested: 0, paid: 0 },
    INVENTARIS: { count: 0, requested: 0, paid: 0 },
    OPERASIONAL: { count: 0, requested: 0, paid: 0 },
  };

  let grandRequested = 0;
  let grandPaid = 0;
  const tickets: ErpProjectFundTicketItem[] = [];

  for (const t of realization?.tickets ?? []) {
    if (String(t.status) === TicketStatus.REJECTED) continue;
    const catKey = classifyFundCategoryLikeTab(t);
    let amountNum = Number(t.amount || 0);
    if (!Number.isFinite(amountNum)) amountNum = 0;

    if (amountNum === 0 && t.items && t.items.length > 0) {
      let itemsSum = 0;
      for (const it of t.items) {
        const qty = Number(it.quantity || 0);
        const estCost = Number(it.estimatedCost || 0);
        const itemClean = cleanCatalogStockName(it.itemName || "");
        const matchedStock = stockCatalog.find((s) => {
          if (
            s.name.trim().toLowerCase() ===
            (it.itemName || "").trim().toLowerCase()
          ) {
            return true;
          }
          if (itemClean && s.cleanName === itemClean) return true;
          return (
            Boolean(itemClean) &&
            Boolean(s.cleanName) &&
            (s.cleanName.includes(itemClean) || itemClean.includes(s.cleanName))
          );
        });
        const unitPrice =
          matchedStock && matchedStock.unitPrice > 0
            ? matchedStock.unitPrice
            : estCost;
        itemsSum += qty * (Number.isFinite(unitPrice) ? unitPrice : 0);
      }
      if (itemsSum > 0) {
        amountNum = itemsSum;
      }
    }

    const roundedAmount = Math.round(amountNum);
    buckets[catKey].count += 1;
    buckets[catKey].requested += roundedAmount;
    if (t.paid) {
      buckets[catKey].paid += roundedAmount;
      grandPaid += roundedAmount;
    }
    grandRequested += roundedAmount;

    tickets.push({
      ticketNumber: t.ticketNumber,
      title: t.title,
      fundCategory: catKey,
      fundCategoryLabel: FUND_CATEGORY_LABELS[catKey],
      status: String(t.status),
      paid: Boolean(t.paid),
      paymentStatusLabel: t.paid ? "Lunas / Cair" : "Pending / Menunggu",
      amount: roundedAmount,
      amountFormatted: formatRupiah(roundedAmount),
      requesterName: t.requesterName || "Staf Proyek",
      createdAt: formatWibDate(t.createdAt),
    });
  }

  const toCategorySummary = (
    key: ProjectFundCategory,
  ): ErpFundCategoryBreakdown => ({
    count: buckets[key].count,
    requestedAmount: buckets[key].requested,
    requestedFormatted: formatRupiah(buckets[key].requested),
    paidAmount: buckets[key].paid,
    paidFormatted: formatRupiah(buckets[key].paid),
  });

  const remainingFromRequested = Math.max(0, contractValue - grandRequested);
  const remainingFromPaid = Math.max(0, contractValue - grandPaid);

  return {
    totalTicketsCount: tickets.length,
    totalRequestedAmount: grandRequested,
    totalRequestedFormatted: formatRupiah(grandRequested),
    totalPaidAmount: grandPaid,
    totalPaidFormatted: formatRupiah(grandPaid),
    remainingFromRequestedAmount: remainingFromRequested,
    remainingFromRequestedFormatted: formatRupiah(remainingFromRequested),
    remainingFromPaidAmount: remainingFromPaid,
    remainingFromPaidFormatted: formatRupiah(remainingFromPaid),
    absorptionRequestedPct:
      contractValue > 0
        ? Math.round((grandRequested / contractValue) * 1000) / 10
        : 0,
    absorptionPaidPct:
      contractValue > 0
        ? Math.round((grandPaid / contractValue) * 1000) / 10
        : 0,
    byCategory: {
      TUKANG: toCategorySummary("TUKANG"),
      BAHAN: toCategorySummary("BAHAN"),
      SEWA: toCategorySummary("SEWA"),
      INVENTARIS: toCategorySummary("INVENTARIS"),
      OPERASIONAL: toCategorySummary("OPERASIONAL"),
    },
    tickets,
  };
}

function scoreProjectAgainstQuery(
  project: {
    code: string;
    title: string;
    name: string;
    kelompokTani: string;
    address: string;
    location: string | null;
    clientName: string | null;
    vendor: string | null;
    fieldPic?: { name: string } | null;
  },
  tokens: string[],
  rawQueryLower: string,
): number {
  if (tokens.length === 0 && !rawQueryLower) return 0;

  const fieldEntries: Array<{ text: string; weight: number }> = [
    { text: project.code.toLowerCase(), weight: 14 },
    { text: project.title.toLowerCase(), weight: 11 },
    { text: (project.fieldPic?.name ?? "").toLowerCase(), weight: 11 },
    { text: project.name.toLowerCase(), weight: 9 },
    { text: project.kelompokTani.toLowerCase(), weight: 9 },
    { text: (project.address ?? "").toLowerCase(), weight: 8 },
    { text: (project.location ?? "").toLowerCase(), weight: 8 },
    { text: (project.clientName ?? "").toLowerCase(), weight: 4 },
    { text: (project.vendor ?? "").toLowerCase(), weight: 4 },
  ];

  let score = 0;
  let matchedDistinctTokens = 0;

  for (const token of tokens) {
    let tokenMatched = false;
    for (const entry of fieldEntries) {
      if (entry.text && entry.text.includes(token)) {
        score += entry.weight;
        tokenMatched = true;
      }
    }
    if (tokenMatched) {
      matchedDistinctTokens += 1;
    }
  }

  // Bonus kuat bila kode/judul/nama PIC muncul sebagai frasa utuh
  for (const phrase of [
    project.code.toLowerCase(),
    project.title.toLowerCase(),
    project.kelompokTani.toLowerCase(),
  ]) {
    if (phrase.length >= 4 && rawQueryLower.includes(phrase)) {
      score += 18;
    }
  }

  if (matchedDistinctTokens > 1) {
    score += matchedDistinctTokens * 15;
  }

  return score;
}

export async function loadErpContextSummary(
  projectId?: string | null,
  ticketId?: string | null,
  queryText?: string | null,
): Promise<HermesErpContextSummary> {
  const activeProjectWhere = {
    isDeleted: false,
    status: { notIn: [ProjectStatus.DONE, ProjectStatus.COMPLETED] },
  };
  const pendingTicketWhere = {
    status: { notIn: [TicketStatus.COMPLETED, TicketStatus.REJECTED] },
  };

  const cleanProjectId = projectId?.trim() || null;
  const cleanTicketId = ticketId?.trim() || null;
  const queryTokens = extractQueryTokens(queryText);
  const rawQueryLower = (queryText ?? "").trim().toLowerCase();

  const [
    activeProjectsCount,
    rawAllProjects,
    rawSelectedTicket,
    pendingTicketsCount,
    rawPendingTickets,
    rawStockItems,
  ] = await Promise.all([
    prisma.project.count({ where: activeProjectWhere }),
    prisma.project.findMany({
      where: { isDeleted: false },
      orderBy: [{ createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        code: true,
        name: true,
        title: true,
        kelompokTani: true,
        address: true,
        location: true,
        jenisPekerjaan: true,
        progress: true,
        status: true,
        pagu: true,
        budget: true,
        clientName: true,
        vendor: true,
        startDate: true,
        endDate: true,
        fieldPic: {
          select: { id: true, name: true },
        },
        workPoints: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            location: true,
            progress: true,
            proposedTotalWage: true,
            approvedTotalWage: true,
          },
        },
        dailyReports: {
          orderBy: { reportDate: "desc" },
          take: 5,
          select: {
            id: true,
            reportDate: true,
            weather: true,
            workersCount: true,
            progress: true,
            workSummary: true,
            notes: true,
          },
        },
      },
    }),
    cleanTicketId
      ? prisma.ticket.findUnique({
          where: { id: cleanTicketId },
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            description: true,
            type: true,
            status: true,
            priority: true,
            totalAmount: true,
            requestedAmount: true,
            recipientName: true,
            requester: { select: { name: true } },
            project: {
              select: { title: true, kelompokTani: true, location: true },
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
        })
      : Promise.resolve(null),
    prisma.ticket.count({ where: pendingTicketWhere }),
    prisma.ticket.findMany({
      where: pendingTicketWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        totalAmount: true,
        requestedAmount: true,
        createdAt: true,
        requester: { select: { name: true } },
        project: {
          select: { title: true, kelompokTani: true, location: true },
        },
      },
    }),
    prisma.stockItem.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        stockQuantity: true,
        minimumStock: true,
        unitPrice: true,
      },
    }),
  ]);

  // Pastikan proyek yang diminta eksplisit ikut dimuat walau berada di luar 80 proyek terbaru
  let allProjects = rawAllProjects;
  if (cleanProjectId && !rawAllProjects.some((p) => p.id === cleanProjectId)) {
    const explicitProj = await prisma.project.findFirst({
      where: { id: cleanProjectId, isDeleted: false },
      select: {
        id: true,
        code: true,
        name: true,
        title: true,
        kelompokTani: true,
        address: true,
        location: true,
        jenisPekerjaan: true,
        progress: true,
        status: true,
        pagu: true,
        budget: true,
        clientName: true,
        vendor: true,
        startDate: true,
        endDate: true,
        fieldPic: {
          select: { id: true, name: true },
        },
        workPoints: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            location: true,
            progress: true,
            proposedTotalWage: true,
            approvedTotalWage: true,
          },
        },
        dailyReports: {
          orderBy: { reportDate: "desc" },
          take: 5,
          select: {
            id: true,
            reportDate: true,
            weather: true,
            workersCount: true,
            progress: true,
            workSummary: true,
            notes: true,
          },
        },
      },
    });
    if (explicitProj) {
      allProjects = [explicitProj, ...rawAllProjects];
    }
  }

  let realizationMap = new Map<string, PaidProjectTicketRealization>();
  if (allProjects.length > 0) {
    try {
      realizationMap = await getPaidProjectTicketRealization(
        allProjects.map((p) => p.id),
      );
    } catch (realizationErr) {
      console.warn(
        "[Bunglon Context] Gagal memuat getPaidProjectTicketRealization:",
        realizationErr,
      );
    }
  }

  const stockCatalog = rawStockItems.map((item) => ({
    name: item.name,
    cleanName: cleanCatalogStockName(item.name),
    unitPrice: parseScaledAmount(item.unitPrice),
  }));

  const buildSummaryForProject = (
    p: (typeof allProjects)[number],
  ): ErpProjectSummary => {
    const rawPaguAmount = parseScaledAmount(p.pagu);
    const workPointsTotal = p.workPoints.reduce(
      (sum, wp) =>
        sum +
        parseScaledAmount(wp.approvedTotalWage ?? wp.proposedTotalWage),
      0,
    );
    const paguAmount = rawPaguAmount > 0 ? rawPaguAmount : workPointsTotal;
    const hasWorkPointProgress = p.workPoints.some((wp) => wp.progress > 0);
    const dynamicProgress = hasWorkPointProgress
      ? calculateWeightedProjectProgress(p.workPoints)
      : Number(p.progress ?? 0);

    const fundRecap = buildProjectFundRecap(
      paguAmount,
      realizationMap.get(p.id),
      stockCatalog,
    );

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      title: p.title,
      kelompokTani: p.kelompokTani,
      address: p.address,
      location: p.location ?? null,
      picName: p.fieldPic?.name ?? null,
      progress: dynamicProgress,
      status: String(p.status),
      paguAmount,
      paguFormatted: formatRupiah(paguAmount),
      clientName: p.clientName ?? null,
      vendor: p.vendor ?? null,
      fundRecap,
    };
  };

  const buildSelectedDetailForProject = (
    p: (typeof allProjects)[number],
    summary: ErpProjectSummary,
  ): ErpSelectedProjectDetail => ({
    ...summary,
    jenisPekerjaan: p.jenisPekerjaan ?? null,
    budgetAmount: parseScaledAmount(p.budget),
    budgetFormatted: formatRupiah(parseScaledAmount(p.budget)),
    startDate: p.startDate ? formatWibDate(p.startDate) : null,
    endDate: p.endDate ? formatWibDate(p.endDate) : null,
    workPoints: p.workPoints.map((wp) => {
      const proposed = parseScaledAmount(wp.proposedTotalWage);
      const approved =
        wp.approvedTotalWage !== null && wp.approvedTotalWage !== undefined
          ? parseScaledAmount(wp.approvedTotalWage)
          : null;
      return {
        id: wp.id,
        title: wp.title,
        location: wp.location ?? null,
        progress: Number(wp.progress ?? 0),
        proposedTotalWageAmount: proposed,
        proposedTotalWageFormatted: formatRupiah(proposed),
        approvedTotalWageAmount: approved,
        approvedTotalWageFormatted:
          approved !== null ? formatRupiah(approved) : null,
      };
    }),
    latestDailyReports: p.dailyReports.map((dr) => ({
      id: dr.id,
      reportDate: formatWibDate(dr.reportDate),
      weather: dr.weather ?? null,
      workersCount: dr.workersCount ?? 0,
      progress: dr.progress ?? null,
      workSummary: dr.workSummary ?? null,
      notes: dr.notes ?? null,
    })),
  });

  const projectRecordsWithSummary = allProjects.map((raw) => ({
    raw,
    summary: buildSummaryForProject(raw),
    score: scoreProjectAgainstQuery(raw, queryTokens, rawQueryLower),
  }));

  const topProjects = projectRecordsWithSummary
    .filter(
      (entry) =>
        entry.raw.status !== ProjectStatus.DONE &&
        entry.raw.status !== ProjectStatus.COMPLETED,
    )
    .slice(0, 8)
    .map((entry) => entry.summary);

  const matchedEntries = projectRecordsWithSummary
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const matchedProjects = matchedEntries.map((entry) => entry.summary);

  const explicitMatch = cleanProjectId
    ? projectRecordsWithSummary.find((entry) => entry.raw.id === cleanProjectId)
    : undefined;
  const chosenProjectEntry = explicitMatch ?? matchedEntries[0] ?? null;

  const selectedProject: ErpSelectedProjectDetail | null = chosenProjectEntry
    ? buildSelectedDetailForProject(
        chosenProjectEntry.raw,
        chosenProjectEntry.summary,
      )
    : null;

  // Map jumlah realisasi per ticketId / ticketNumber agar tiket stok gudang tidak tampil Rp 0
  const valuedAmountByTicketNumber = new Map<string, number>();
  for (const entry of projectRecordsWithSummary) {
    for (const t of entry.summary.fundRecap.tickets) {
      if (!valuedAmountByTicketNumber.has(t.ticketNumber)) {
        valuedAmountByTicketNumber.set(t.ticketNumber, t.amount);
      }
    }
  }

  const matchedTicketsPool: Array<{
    score: number;
    item: HermesErpContextSummary["matchedTickets"][number];
  }> = [];
  if (queryTokens.length > 0 || rawQueryLower.includes("tkt-")) {
    for (const entry of projectRecordsWithSummary) {
      const p = entry.summary;
      for (const t of p.fundRecap.tickets) {
        const ticketNumberLower = t.ticketNumber.toLowerCase();
        const combinedText = [
          ticketNumberLower,
          t.title.toLowerCase(),
          t.requesterName.toLowerCase(),
          p.title.toLowerCase(),
          p.kelompokTani.toLowerCase(),
          p.address.toLowerCase(),
          (p.picName ?? "").toLowerCase(),
        ].join(" ");
        let tScore = 0;
        if (rawQueryLower.includes(ticketNumberLower)) {
          tScore += 30;
        }
        for (const token of queryTokens) {
          if (combinedText.includes(token)) {
            tScore += 5;
          }
        }
        if (entry.score > 0) {
          tScore += Math.min(entry.score, 25);
        }
        if (tScore > 0) {
          matchedTicketsPool.push({
            score: tScore,
            item: {
              ticketNumber: t.ticketNumber,
              title: t.title,
              projectName: p.title || p.kelompokTani,
              projectCode: p.code,
              picName: p.picName,
              fundCategory: t.fundCategory,
              fundCategoryLabel: t.fundCategoryLabel,
              status: t.status,
              paid: t.paid,
              paymentStatusLabel: t.paymentStatusLabel,
              amount: t.amount,
              amountFormatted: t.amountFormatted,
              requesterName: t.requesterName,
              createdAt: t.createdAt,
            },
          });
        }
      }
    }
  }

  const matchedTickets = matchedTicketsPool
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((entry) => entry.item);

  const selectedTicket: ErpSelectedTicketDetail | null = rawSelectedTicket
    ? (() => {
        const valuedFromRecap = valuedAmountByTicketNumber.get(
          rawSelectedTicket.ticketNumber,
        );
        const rawAmount =
          rawSelectedTicket.totalAmount !== null &&
          rawSelectedTicket.totalAmount !== undefined
            ? parseScaledAmount(rawSelectedTicket.totalAmount)
            : Number(rawSelectedTicket.requestedAmount ?? 0);
        const amount =
          rawAmount > 0 ? rawAmount : (valuedFromRecap ?? 0);
        return {
          id: rawSelectedTicket.id,
          ticketNumber: rawSelectedTicket.ticketNumber,
          title: rawSelectedTicket.title,
          description: rawSelectedTicket.description ?? null,
          type: String(rawSelectedTicket.type),
          status: String(rawSelectedTicket.status),
          priority: String(rawSelectedTicket.priority),
          amount,
          amountFormatted: formatRupiah(amount),
          recipientName: rawSelectedTicket.recipientName ?? null,
          requesterName: rawSelectedTicket.requester?.name ?? null,
          projectName: rawSelectedTicket.project
            ? projectSiteName(
                rawSelectedTicket.project.kelompokTani,
                rawSelectedTicket.project.location,
              ) || rawSelectedTicket.project.title
            : null,
          items: (rawSelectedTicket.items ?? []).map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unit: item.unit,
            estimatedUnitCost:
              item.estimatedCost !== null && item.estimatedCost !== undefined
                ? parseScaledAmount(item.estimatedCost)
                : null,
          })),
        };
      })()
    : null;

  const latestPendingTickets = rawPendingTickets.map((t) => {
    const rawAmount =
      t.totalAmount !== null && t.totalAmount !== undefined
        ? parseScaledAmount(t.totalAmount)
        : Number(t.requestedAmount ?? 0);
    const amount =
      rawAmount > 0
        ? rawAmount
        : (valuedAmountByTicketNumber.get(t.ticketNumber) ?? 0);
    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      type: String(t.type),
      status: String(t.status),
      priority: String(t.priority),
      amount,
      amountFormatted: formatRupiah(amount),
      requesterName: t.requester?.name ?? null,
      projectName: t.project
        ? projectSiteName(t.project.kelompokTani, t.project.location) ||
          t.project.title
        : null,
      createdAt: formatWibDate(t.createdAt),
    };
  });

  const lowStockItems = rawStockItems
    .filter(
      (item) =>
        toBigIntComparable(item.stockQuantity) <=
        toBigIntComparable(item.minimumStock),
    )
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      stockQuantity: formatScaledQuantity(item.stockQuantity),
      minimumStock: formatScaledQuantity(item.minimumStock),
      unitPriceFormatted: formatRupiah(parseScaledAmount(item.unitPrice)),
    }));

  return {
    activeProjectsCount,
    topProjects,
    matchedProjects,
    selectedProject,
    selectedTicket,
    pendingTicketsCount,
    latestPendingTickets,
    matchedTickets,
    lowStockItems,
    totalStockItemsCount: rawStockItems.length,
  };
}

function trimFundRecapForSummaryList(
  project: ErpProjectSummary,
): Omit<ErpProjectSummary, "fundRecap"> & {
  fundRecap: Omit<ErpProjectFundRecap, "tickets">;
} {
  const { tickets: _omitted, ...recapSummary } = project.fundRecap;
  void _omitted;
  return {
    ...project,
    fundRecap: recapSummary,
  };
}

function buildCompactContextForLlm(erpContext: HermesErpContextSummary) {
  return {
    activeProjectsCount: erpContext.activeProjectsCount,
    pendingTicketsCount: erpContext.pendingTicketsCount,
    totalStockItemsCount: erpContext.totalStockItemsCount,
    selectedProject: erpContext.selectedProject
      ? {
          ...erpContext.selectedProject,
          fundRecap: {
            ...erpContext.selectedProject.fundRecap,
            tickets: erpContext.selectedProject.fundRecap.tickets.slice(0, 30),
          },
        }
      : null,
    matchedProjects: erpContext.matchedProjects.map((project, index) =>
      index === 0 && !erpContext.selectedProject
        ? {
            ...project,
            fundRecap: {
              ...project.fundRecap,
              tickets: project.fundRecap.tickets.slice(0, 30),
            },
          }
        : index < 3
          ? {
              ...project,
              fundRecap: {
                ...project.fundRecap,
                tickets: project.fundRecap.tickets.slice(0, 10),
              },
            }
          : trimFundRecapForSummaryList(project),
    ),
    matchedTickets: erpContext.matchedTickets.slice(0, 20),
    topProjects: erpContext.topProjects.map(trimFundRecapForSummaryList),
    selectedTicket: erpContext.selectedTicket,
    latestPendingTickets: erpContext.latestPendingTickets,
    lowStockItems: erpContext.lowStockItems,
  };
}

export async function callHermesGateway(
  input: CallHermesGatewayInput,
): Promise<string | null> {
  const resolved = resolveValidatedGatewayUrl(input.customGatewayUrl);
  const geminiApiKey = resolveGeminiApiKey(input.customApiKey);
  const compactContext = buildCompactContextForLlm(input.erpContext);

  const systemPrompt = [
    "Kamu adalah **Bunglon Assistant (SKALA AI)** — rekan kerja asisten AI yang hangat, natural, teliti, dan berbasis fakta database di tim **PT Skala Prioritas Engineering** (bidang konstruksi, teknik sipil, irigasi/rehabilitasi lahan, manajemen proyek, logistik material, dan keuangan).",
    "Gunakan gaya bahasa Indonesia sehari-hari kantor yang luwes dan natural seperti rekan kerja manusia (misalnya menyapa hangat, 'Siap, barusan saya cek...', menyebut nama pengguna dengan sopan), JANGAN kaku atau terdengar seperti robot.",
    "ATURAN ANTI-HALUSINASI WAJIB: Gunakan HANYA angka, status, nomor tiket, nama proyek, alamat/lokasi, dan nama PIC dari Konteks ERP Live di bawah. DILARANG keras mengarang angka, menebak pengeluaran, atau mengambil proyek dari daerah yang sama tetapi PIC berbeda.",
    "Jika beberapa proyek berada di lokasi/desa yang mirip (misalnya Lenga), wajib cocokkan menggunakan kombinasi `title`, `kelompokTani`, `address`/`location`, dan `picName` (`fieldPic`). Prioritaskan `selectedProject` atau entri paling relevan di `matchedProjects` yang cocok dengan nama proyek/lokasi/PIC dari pertanyaan.",
    "ATURAN PELAPORAN PENGELUARAN / REKAP DANA PROYEK: Ketika user menanyakan pengeluaran, biaya, kasbon, atau realisasi proyek, wajib sebutkan secara akurat angka dari `fundRecap` proyek tersebut: (1) **Nilai Kontrak / Pagu** (`paguFormatted`), (2) **Total Realisasi Cair / Lunas** (`fundRecap.totalPaidFormatted`), (3) **Total Dana Diajukan** (`fundRecap.totalRequestedFormatted`), (4) **Sisa Pagu Anggaran** (`fundRecap.remainingFromRequestedFormatted`), serta (5) rincian 5 kategori bila datanya > 0: **Ambilan Tukang** (`TUKANG`), **Pembelanjaan Bahan** (`BAHAN`), **Rumah & Kendaraan Sewa** (`SEWA`), **Barang Inventaris** (`INVENTARIS`), dan **Operasional** (`OPERASIONAL`) beserta jumlah tiket, total diajukan, dan total lunas/cairnya. Bedakan tegas antara *Total Realisasi Cair* (sudah lunas/dibayar) vs *Total Dana Diajukan* (termasuk yang masih pending). Jika tidak ada di konteks, katakan terus terang belum ditemukan di sistem.",
    "Kamu bisa membantu user: (1) diskusi & analisis data ERP live, (2) menginput Laporan Harian/Progres Proyek, Tiket Pengajuan, atau Catatan Kerja ke sistem, serta (3) menyusun 8 jenis dokumen/laporan PDF resmi ber-Kop & QR Code.",
    input.userName
      ? `Pengguna aktif saat ini: ${input.userName} (Jabatan/Peran: ${input.userRole || "Staf"}).`
      : "",
    input.systemInstructionExtra ? input.systemInstructionExtra : "",
    `Konteks ERP Live (JSON):\n${JSON.stringify(compactContext)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const historyMessages = (input.conversationHistory ?? [])
    .slice(-6)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, 2000),
    }));

  if (
    resolved.valid &&
    !resolved.url.includes("generativelanguage.googleapis.com")
  ) {
    const apiKey =
      normalizeEnvSecret(input.customApiKey) ||
      normalizeEnvSecret(process.env.HERMES_API_KEY);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const model = process.env.HERMES_MODEL?.trim() || "hermes-agent";
    try {
      const response = await fetch(`${resolved.url}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: input.message },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const reply = payload?.choices?.[0]?.message?.content?.trim();
        if (reply) {
          return reply;
        }
      }
    } catch {
      // Fallback otomatis ke Google Gemini API bila tersedia.
    }
  }

  if (geminiApiKey) {
    return callGeminiApi({
      apiKey: geminiApiKey,
      systemPrompt,
      history: historyMessages,
      message: input.message,
    });
  }

  return null;
}

const SATUAN = [
  "",
  "Satu",
  "Dua",
  "Tiga",
  "Empat",
  "Lima",
  "Enam",
  "Tujuh",
  "Delapan",
  "Sembilan",
  "Sepuluh",
  "Sebelas",
];

function terbilangInteger(n: number): string {
  if (n === 0) return "";
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilangInteger(n - 10)} Belas`;
  if (n < 100) {
    const tens = SATUAN[Math.floor(n / 10)];
    const rest = n % 10;
    return rest ? `${tens} Puluh ${terbilangInteger(rest)}` : `${tens} Puluh`;
  }
  if (n < 200) {
    const rest = n % 100;
    return rest ? `Seratus ${terbilangInteger(rest)}` : "Seratus";
  }
  if (n < 1000) {
    const hundreds = SATUAN[Math.floor(n / 100)];
    const rest = n % 100;
    return rest
      ? `${hundreds} Ratus ${terbilangInteger(rest)}`
      : `${hundreds} Ratus`;
  }
  if (n < 2000) {
    const rest = n % 1000;
    return rest ? `Seribu ${terbilangInteger(rest)}` : "Seribu";
  }
  if (n < 1_000_000) {
    const thousands = terbilangInteger(Math.floor(n / 1000));
    const rest = n % 1000;
    return rest
      ? `${thousands} Ribu ${terbilangInteger(rest)}`
      : `${thousands} Ribu`;
  }
  if (n < 1_000_000_000) {
    const millions = terbilangInteger(Math.floor(n / 1_000_000));
    const rest = n % 1_000_000;
    return rest
      ? `${millions} Juta ${terbilangInteger(rest)}`
      : `${millions} Juta`;
  }
  if (n < 1_000_000_000_000) {
    const billions = terbilangInteger(Math.floor(n / 1_000_000_000));
    const rest = n % 1_000_000_000;
    return rest
      ? `${billions} Miliar ${terbilangInteger(rest)}`
      : `${billions} Miliar`;
  }
  const trillions = terbilangInteger(Math.floor(n / 1_000_000_000_000));
  const rest = n % 1_000_000_000_000;
  return rest
    ? `${trillions} Triliun ${terbilangInteger(rest)}`
    : `${trillions} Triliun`;
}

export function terbilangRupiah(amount: number): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "Nol Rupiah";
  }
  if (amount < 0) {
    return `Minus ${terbilangRupiah(Math.abs(amount))}`;
  }
  const rounded = Math.round(amount);
  if (rounded === 0) {
    return "Nol Rupiah";
  }
  if (rounded >= 1_000_000_000_000_000) {
    return `${rounded.toLocaleString("id-ID")} Rupiah`;
  }
  return `${terbilangInteger(rounded).replace(/\s+/g, " ").trim()} Rupiah`;
}

function parseScaledSuffixNumber(rawNumber: string, suffix: string): number {
  const cleaned = rawNumber.trim();
  const hasSingleDecimalSep = /^\d+[.,]\d{1,2}$/.test(cleaned);
  const numeric = hasSingleDecimalSep
    ? Number(cleaned.replace(",", "."))
    : Number(cleaned.replace(/[.,\s]/g, ""));
  if (!Number.isFinite(numeric)) return 0;

  const lowerSuffix = suffix.toLowerCase();
  if (lowerSuffix === "k" || lowerSuffix === "rb" || lowerSuffix === "ribu") {
    return Math.round(numeric * 1_000);
  }
  if (lowerSuffix === "jt" || lowerSuffix === "juta") {
    return Math.round(numeric * 1_000_000);
  }
  if (
    lowerSuffix === "m" ||
    lowerSuffix === "miliar" ||
    lowerSuffix === "milyar"
  ) {
    return Math.round(numeric * 1_000_000_000);
  }
  return Math.round(numeric);
}

function extractAmountFromPrompt(message: string): number | null {
  const unitMatch = message.match(
    /(?:rp\.?\s*|idr\s*)?(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb|miliar|milyar|k)\b/i,
  );
  if (unitMatch) {
    const parsed = parseScaledSuffixNumber(unitMatch[1], unitMatch[2]);
    if (parsed > 0) return parsed;
  }

  const rpMatch = message.match(
    /(?:rp\.?|idr)\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/i,
  );
  if (rpMatch) {
    const raw = rpMatch[1].replace(/[.\s]/g, "");
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }

  const plainLargeMatch = message.match(/\b(\d{1,3}(?:\.\d{3}){2,})\b/);
  if (plainLargeMatch) {
    const parsed = Number(plainLargeMatch[1].replaceAll(".", ""));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }

  return null;
}

function extractRecipientFromPrompt(message: string): string | null {
  const regex =
    /\b(?:kepada|untuk|penerima|vendor|subkon(?:traktor)?|mandor|atas\s+nama|a\.?n\.?)\s+([A-Za-z0-9][A-Za-z0-9.,'&\-\s]{1,65}?)(?=\s+(?:sebesar|senilai|sejumlah|nominal|pembayaran|untuk\s+(?:pekerjaan|pembayaran|keperluan|proyek)|keperluan|pada|di\s+proyek|tanggal|rp\.?|idr|\d)|[.,;!\n]|$)/gi;
  const stopWords =
    /^(proyek|pekerjaan|pembayaran|material|pengadaan|termin|keperluan|kegiatan|biaya|klaim|reimburse|operasional|lapangan|kwitansi|kuitansi|spk|bast|po|do|surat|laporan|lampiran|bon|nota|ini|itu)$/i;

  for (const match of message.matchAll(regex)) {
    const candidate = match[1].trim().replace(/[,.;:\-]+$/, "").trim();
    if (!candidate || candidate.length < 2) continue;
    const firstWord = candidate.split(/\s+/)[0] ?? "";
    if (stopWords.test(candidate) || stopWords.test(firstWord)) continue;
    return candidate;
  }
  return null;
}

function extractPurposeFromPrompt(message: string): string | null {
  const match = message.match(
    /(?:keperluan|perihal|pembayaran|untuk\s+pekerjaan|lingkup|tentang)\s+([^.\n;]{4,160}?)(?=\s+(?:kepada|atas\s+nama|a\.?n\.?|sebesar|senilai|sejumlah|nominal|rp\.?|idr)\b|[.\n;]|$)/i,
  );
  if (!match) return null;
  return match[1].trim();
}

export function detectDocumentIntent(
  message: string,
  explicitDocType?: HermesDocType | null,
): DetectedDocumentIntent {
  const trimmed = message.trim();
  const extractedAmount = extractAmountFromPrompt(trimmed);
  const extractedRecipient = extractRecipientFromPrompt(trimmed);
  const extractedPurpose = extractPurposeFromPrompt(trimmed);

  if (explicitDocType && isHermesDocType(explicitDocType)) {
    return {
      isDocumentRequest: true,
      docType: explicitDocType,
      extractedAmount,
      extractedRecipient,
      extractedPurpose,
    };
  }

  const hasCreationVerb =
    /\b(buatkan|buat|bikinkan|bikin|bikinin|cetak|cetakkan|susun|terbitkan|generate|draft|siapkan|keluarkan|print)\b/i.test(
      trimmed,
    );
  const isInformationalQuestion =
    !hasCreationVerb &&
    /^(apa\s+itu|apa\s+arti|bagaimana\s+cara|gimana\s+cara|jelaskan|kenapa|mengapa|apakah|cara\s+install|cek\s+status|status\s+)/i.test(
      trimmed,
    );

  let detected: HermesDocType | null = null;
  if (/\b(kwitansi|kuitansi|bukti\s+bayar|tanda\s+terima\s+uang)\b/i.test(trimmed)) {
    detected = "KWITANSI";
  } else if (
    /\b(lampiran\s+keuangan|bon|nota|klaim|reimburse|reimbursement|pertanggungjawaban\s+biaya|rincian\s+biaya)\b/i.test(
      trimmed,
    )
  ) {
    detected = "LAMPIRAN_KEUANGAN";
  } else if (
    /\b(bast|berita\s+acara\s+serah\s+terima|serah\s+terima\s+pekerjaan)\b/i.test(
      trimmed,
    )
  ) {
    detected = "BAST";
  } else if (
    /\b(spk|surat\s+perintah\s+kerja|kontrak\s+subkon(?:traktor)?)\b/i.test(
      trimmed,
    )
  ) {
    detected = "SPK";
  } else if (
    /\b(surat\s+jalan|delivery\s+order|pengiriman\s+material)\b/i.test(
      trimmed,
    ) ||
    /\b(buatkan|buat|cetak|susun|terbitkan|draft|dokumen|no\.?)\s+do\b/i.test(
      trimmed,
    )
  ) {
    detected = "DO";
  } else if (
    /\b(purchase\s+order|pesanan\s+pembelian)\b/i.test(trimmed) ||
    /\b(buatkan|buat|cetak|susun|terbitkan|draft|dokumen|no\.?)\s+po\b/i.test(
      trimmed,
    ) ||
    /\bpo\s+(pembelian|pengadaan|material|vendor)\b/i.test(trimmed)
  ) {
    detected = "PO";
  } else if (
    /\b(laporan\s+proyek|laporan\s+progres|kurva\s*s|evaluasi\s+proyek|rekap\s+proyek)\b/i.test(
      trimmed,
    )
  ) {
    detected = "LAPORAN_PROYEK";
  } else if (
    /\b(surat\s+resmi|memo|surat\s+pengantar|surat\s+tugas|surat\s+keterangan|surat\s+pemberitahuan)\b/i.test(
      trimmed,
    )
  ) {
    detected = "SURAT_RESMI";
  } else if (hasCreationVerb && /\blampiran\b/i.test(trimmed)) {
    detected = "LAMPIRAN_KEUANGAN";
  } else if (hasCreationVerb && /\bsurat\b/i.test(trimmed)) {
    detected = "SURAT_RESMI";
  }

  const shouldGenerate =
    Boolean(detected) &&
    !isInformationalQuestion &&
    (hasCreationVerb ||
      extractedAmount !== null ||
      extractedRecipient !== null ||
      /^(kwitansi|kuitansi|spk|bast|surat\s+resmi|surat\s+jalan|purchase\s+order|delivery\s+order|laporan\s+proyek|lampiran\s+keuangan)\b/i.test(
        trimmed,
      ));

  return {
    isDocumentRequest: shouldGenerate,
    docType: shouldGenerate ? detected : null,
    extractedAmount,
    extractedRecipient,
    extractedPurpose,
  };
}

const DOC_PREFIX: Record<HermesDocType, string> = {
  SPK: "SPK",
  BAST: "BAST",
  PO: "PO",
  DO: "DO",
  KWITANSI: "KWT",
  LAMPIRAN_KEUANGAN: "KEU",
  LAPORAN_PROYEK: "LAP",
  SURAT_RESMI: "SRT",
};

const DOC_META: Record<
  HermesDocType,
  { title: string; subtitle: string; badge: string }
> = {
  SPK: {
    title: "SURAT PERINTAH KERJA",
    subtitle: "KONTRAK PELAKSANAAN / SUBKONTRAKTOR",
    badge: "DOKUMEN KONTRAK KERJA",
  },
  BAST: {
    title: "BERITA ACARA SERAH TERIMA",
    subtitle: "SERAH TERIMA HASIL PEKERJAAN",
    badge: "VERIFIKASI PENYELESAIAN",
  },
  PO: {
    title: "PURCHASE ORDER",
    subtitle: "PESANAN PEMBELIAN",
    badge: "PENGADAAN MATERIAL",
  },
  DO: {
    title: "DELIVERY ORDER",
    subtitle: "SURAT JALAN",
    badge: "LOGISTIK PENGIRIMAN",
  },
  KWITANSI: {
    title: "KWITANSI PEMBAYARAN",
    subtitle: "TANDA TERIMA PEMBAYARAN RESMI",
    badge: "BUKTI TRANSAKSI KEUANGAN",
  },
  LAMPIRAN_KEUANGAN: {
    title: "LAMPIRAN KEUANGAN",
    subtitle: "RINCIAN KLAIM / PERTANGGUNGJAWABAN DANA",
    badge: "ADMINISTRASI KEUANGAN",
  },
  LAPORAN_PROYEK: {
    title: "LAPORAN PROGRES PROYEK",
    subtitle: "EVALUASI PELAKSANAAN & REALISASI KONSTRUKSI",
    badge: "RINGKASAN EKSEKUTIF PROYEK",
  },
  SURAT_RESMI: {
    title: "SURAT RESMI PERUSAHAAN",
    subtitle: "KORESPONDENSI & MEMO OPERASIONAL",
    badge: "ADMINISTRASI UMUM",
  },
};

function buildDocumentNumber(docType: HermesDocType, date = new Date()): string {
  const prefix = DOC_PREFIX[docType];
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const random4 = randomBytes(2).toString("hex").toUpperCase();
  return `HERMES/${prefix}/${yyyy}/${mm}/${random4}`;
}

function renderExecutiveShell(input: {
  documentNumber: string;
  title: string;
  subtitle: string;
  badge: string;
  dateText: string;
  logoDataUrl: string;
  qrDataUrl: string;
  metaLeft: Array<{ label: string; value: string }>;
  metaRight: Array<{ label: string; value: string }>;
  bodyHtml: string;
  signatures: Array<{ heading: string; name: string; role: string; hasQr?: boolean }>;
}): string {
  const logoBlock = input.logoDataUrl
    ? `<img class="doc-logo" src="${escapeHtml(input.logoDataUrl)}" alt="PT Skala Prioritas Engineering" />`
    : `<div class="doc-logo-fallback"><strong>PT SKALA PRIORITAS ENGINEERING</strong><small>General Contractor &amp; Civil Engineering</small></div>`;

  const renderMetaRows = (rows: Array<{ label: string; value: string }>) =>
    rows
      .map(
        (r) =>
          `<div class="meta-row"><strong>${escapeHtml(r.label)}</strong><span>:</span><span>${escapeHtml(r.value || "-")}</span></div>`,
      )
      .join("");

  const signatureCols = input.signatures
    .map((sig) => {
      const qrBlock =
        sig.hasQr && input.qrDataUrl
          ? `<div class="sig-qr"><img src="${escapeHtml(input.qrDataUrl)}" alt="QR Verifikasi Dokumen" /></div>`
          : `<div class="sig-space"></div>`;
      return `
        <div class="sig-card">
          <div class="sig-heading">${escapeHtml(sig.heading)}</div>
          ${qrBlock}
          <div class="sig-name">${escapeHtml(sig.name || "........................")}</div>
          <div class="sig-role">${escapeHtml(sig.role)}</div>
        </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.documentNumber)} · ${escapeHtml(input.title)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        color: #172b45;
        font: 9.5pt "Segoe UI", Arial, sans-serif;
        line-height: 1.45;
        background: #ffffff;
      }
      @media screen {
        body {
          background: #eef2f7;
          padding: 16px 0;
        }
        .hermes-sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 12mm;
          background: #ffffff;
          box-shadow: 0 8px 30px rgba(16, 42, 77, 0.12);
        }
      }
      .hermes-sheet {
        width: 100%;
      }
      .doc-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 3px solid #102a4d;
      }
      .doc-logo {
        display: block;
        width: 46%;
        max-width: 300px;
        height: auto;
        object-fit: contain;
        object-position: left top;
      }
      .doc-logo-fallback {
        display: flex;
        flex-direction: column;
        color: #102a4d;
        font-size: 13pt;
      }
      .doc-logo-fallback small {
        color: #c9772d;
        font-size: 8.5pt;
        font-weight: 700;
      }
      .doc-heading {
        width: 54%;
        text-align: right;
        color: #102a4d;
      }
      .doc-badge {
        display: inline-block;
        padding: 2px 9px;
        border-radius: 999px;
        background: #fff7ed;
        border: 1px solid #c9772d;
        color: #c9772d;
        font-size: 7.5pt;
        font-weight: 800;
        letter-spacing: 0.6px;
      }
      .doc-heading h1 {
        margin: 5px 0 2px;
        font-size: 17pt;
        font-weight: 800;
        line-height: 1.15;
        color: #102a4d;
      }
      .doc-subtitle-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }
      .doc-rule {
        flex: 0 0 38%;
        height: 4px;
        background: linear-gradient(90deg, #c9772d 0 55%, #102a4d 55% 100%);
      }
      .doc-subtitle {
        margin: 0;
        color: #c9772d;
        font-size: 9.5pt;
        font-weight: 700;
      }
      .doc-number-box {
        display: inline-block;
        margin-top: 8px;
        padding: 5px 11px;
        border: 1.5px solid #102a4d;
        border-left: 5px solid #e67e22;
        background: #f8fafc;
        font-family: Consolas, monospace;
        font-size: 9.5pt;
        font-weight: 800;
        color: #102a4d;
      }
      .doc-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 20px;
        margin: 14px 0;
        padding: 10px 12px;
        border: 1.5px solid #102a4d;
        border-radius: 8px;
        background: #f1f5f9;
      }
      .meta-col {
        display: grid;
        align-content: start;
        gap: 4px;
      }
      .meta-row {
        display: grid;
        grid-template-columns: 118px 8px 1fr;
        gap: 4px;
        font-size: 8.8pt;
      }
      .meta-row strong {
        color: #334155;
      }
      .section-title {
        margin: 14px 0 7px;
        padding-left: 8px;
        border-left: 4px solid #e67e22;
        color: #102a4d;
        font-size: 10pt;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .terbilang-box {
        margin: 12px 0;
        padding: 12px 14px;
        border: 2px solid #102a4d;
        border-left: 6px solid #e67e22;
        border-radius: 8px;
        background: #fffbeb;
      }
      .terbilang-label {
        font-size: 7.8pt;
        font-weight: 800;
        text-transform: uppercase;
        color: #c9772d;
        letter-spacing: 0.5px;
      }
      .terbilang-text {
        margin-top: 3px;
        font-size: 11pt;
        font-weight: 800;
        font-style: italic;
        color: #102a4d;
      }
      .amount-highlight {
        display: inline-block;
        margin-top: 8px;
        padding: 8px 16px;
        border: 2px solid #102a4d;
        background: #102a4d;
        color: #ffffff;
        border-radius: 6px;
        font-size: 14pt;
        font-weight: 800;
        letter-spacing: 0.4px;
      }
      .kv-panel {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 12px 14px;
        background: #ffffff;
      }
      .kv-line {
        display: grid;
        grid-template-columns: 165px 10px 1fr;
        gap: 6px;
        padding: 5px 0;
        border-bottom: 1px dashed #e2e8f0;
      }
      .kv-line:last-child {
        border-bottom: 0;
      }
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin: 10px 0;
      }
      .kpi-card {
        border: 1px solid #cbd5e1;
        border-top: 3px solid #102a4d;
        border-radius: 6px;
        padding: 8px 10px;
        background: #f8fafc;
      }
      .kpi-label {
        font-size: 7.5pt;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
      }
      .kpi-value {
        margin-top: 3px;
        font-size: 11pt;
        font-weight: 800;
        color: #102a4d;
      }
      .kpi-sub {
        margin-top: 2px;
        font-size: 7.5pt;
        color: #475569;
      }
      table.data-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
        font-size: 8.8pt;
      }
      table.data-table th,
      table.data-table td {
        border: 1px solid #94a3b8;
        padding: 6px 7px;
        vertical-align: top;
      }
      table.data-table th {
        background: #102a4d;
        color: #ffffff;
        font-weight: 700;
        text-align: left;
      }
      table.data-table tr:nth-child(even) td {
        background: #f8fafc;
      }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .mono { font-family: Consolas, monospace; }
      .narrative-box {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 12px 14px;
        background: #ffffff;
        line-height: 1.6;
        white-space: pre-line;
      }
      .terms-list {
        margin: 6px 0 0;
        padding-left: 18px;
      }
      .terms-list li {
        margin-bottom: 4px;
      }
      .signatures {
        display: grid;
        grid-template-columns: repeat(${Math.max(1, input.signatures.length)}, 1fr);
        gap: 14px;
        margin-top: 22px;
        text-align: center;
        break-inside: avoid;
      }
      .sig-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 132px;
        padding: 8px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fcfdff;
      }
      .sig-heading {
        font-size: 8.5pt;
        font-weight: 700;
        color: #102a4d;
      }
      .sig-space {
        flex: 1;
        min-height: 58px;
      }
      .sig-qr {
        margin: 6px 0;
      }
      .sig-qr img {
        width: 72px;
        height: 72px;
        object-fit: contain;
      }
      .sig-name {
        font-weight: 800;
        color: #0f172a;
        border-top: 1px solid #94a3b8;
        padding-top: 4px;
        min-width: 130px;
      }
      .sig-role {
        font-size: 7.8pt;
        color: #64748b;
      }
      .doc-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 18px;
        color: #c9772d;
        font-size: 8.5pt;
        font-weight: 900;
        letter-spacing: 1.5px;
      }
      .doc-footer::before {
        content: "";
        height: 3.5px;
        flex: 1;
        background: linear-gradient(90deg, #102a4d, #e67e22);
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background: #ffffff;
          padding: 0;
        }
        .hermes-sheet {
          box-shadow: none;
          padding: 0;
        }
        tr, .sig-card, .terbilang-box {
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main class="hermes-sheet">
      <header class="doc-header">
        ${logoBlock}
        <div class="doc-heading">
          <span class="doc-badge">${escapeHtml(input.badge)}</span>
          <h1>${escapeHtml(input.title)}</h1>
          <div class="doc-subtitle-row">
            <span class="doc-rule"></span>
            <p class="doc-subtitle">${escapeHtml(input.subtitle)}</p>
          </div>
          <div class="doc-number-box">NO: ${escapeHtml(input.documentNumber)}</div>
        </div>
      </header>
      <section class="doc-meta">
        <div class="meta-col">${renderMetaRows(input.metaLeft)}</div>
        <div class="meta-col">${renderMetaRows([
          { label: "Tanggal", value: input.dateText },
          ...input.metaRight,
        ])}</div>
      </section>
      ${input.bodyHtml}
      <section class="signatures">${signatureCols}</section>
      <footer class="doc-footer">ADAPT, IMPROVISE AND FINISH</footer>
    </main>
  </body>
</html>`;
}

async function maybeEnrichNarrativeWithHermes(input: {
  docType: HermesDocType;
  prompt: string;
  erpContext: HermesErpContextSummary;
  gatewayStatus?: HermesGatewayStatus;
  fallbackText: string;
  customGatewayUrl?: string | null;
  customApiKey?: string | null;
}): Promise<{ text: string; usedGateway: boolean }> {
  const enrichable: HermesDocType[] = [
    "SURAT_RESMI",
    "SPK",
    "BAST",
    "LAPORAN_PROYEK",
  ];
  if (!input.gatewayStatus?.gatewayOnline || !enrichable.includes(input.docType)) {
    return { text: input.fallbackText, usedGateway: false };
  }

  const reply = await callHermesGateway({
    message: `Susun narasi ringkas dan formal untuk dokumen jenis ${input.docType} PT Skala Prioritas Engineering berdasarkan instruksi pengguna berikut (maksimal 2-3 paragraf, tanpa markdown heading atau pembuka basa-basi):\n\n"${input.prompt}"`,
    erpContext: input.erpContext,
    customGatewayUrl: input.customGatewayUrl,
    customApiKey: input.customApiKey,
    systemInstructionExtra:
      "Keluarkan hanya isi teks narasi formal dokumen dalam Bahasa Indonesia yang siap dicetak pada dokumen PDF A4.",
  });

  if (reply && reply.length >= 20) {
    return { text: reply.slice(0, 2500), usedGateway: true };
  }
  return { text: input.fallbackText, usedGateway: false };
}

export async function generateHermesDocument(
  input: GenerateHermesDocumentInput,
): Promise<{
  document: ChatGeneratedDocumentRecord;
  engineUsed: "hermes-gateway" | "hermes-builtin-erp";
}> {
  const erpContext =
    input.erpContext ??
    (await loadErpContextSummary(
      input.projectId,
      input.ticketId,
      input.prompt,
    ));
  const intent =
    input.detectedIntent ??
    detectDocumentIntent(input.prompt, input.docType);
  const params = input.docParams ?? {};
  const meta = DOC_META[input.docType];

  const now = new Date();
  const dateText = params.date?.trim() || formatWibDate(now);
  const docId = randomUUID();
  const verificationUrl = new URL(
    `/api/chat/hermes/document/${docId}?format=html`,
    input.verificationBaseUrl,
  ).toString();

  const [logoResult, qrResult] = await Promise.allSettled([
    getDocumentHeaderLogoDataUrl(),
    createBrandedQrDataUrl(verificationUrl, 240),
  ]);
  const logoDataUrl = logoResult.status === "fulfilled" ? logoResult.value : "";
  const qrDataUrl = qrResult.status === "fulfilled" ? qrResult.value : "";

  const selectedProject = erpContext.selectedProject;
  const selectedTicket = erpContext.selectedTicket;
  const projectLabel = selectedProject
    ? projectSiteName(selectedProject.kelompokTani, selectedProject.location) ||
      selectedProject.title
    : selectedTicket?.projectName || "Operasional PT Skala Prioritas Engineering";

  const resolvedAmount =
    typeof params.amount === "number" && Number.isFinite(params.amount)
      ? params.amount
      : intent.extractedAmount ??
        (selectedTicket && selectedTicket.amount > 0
          ? selectedTicket.amount
          : null);

  const resolvedRecipient =
    params.recipientName?.trim() ||
    params.vendorName?.trim() ||
    intent.extractedRecipient ||
    selectedTicket?.recipientName ||
    selectedProject?.vendor ||
    "Mitra / Penerima Terkait";

  const resolvedPurpose =
    params.purpose?.trim() ||
    params.description?.trim() ||
    intent.extractedPurpose ||
    selectedTicket?.title ||
    input.prompt.trim();

  let documentNumber = buildDocumentNumber(input.docType, now);
  let title = params.title?.trim() || meta.title;
  let subtitle = params.subtitle?.trim() || meta.subtitle;
  let usedGateway = false;
  let htmlContent = "";
  let structuredData: Record<string, unknown> = {
    docType: input.docType,
    projectId: selectedProject?.id ?? input.projectId ?? null,
    ticketId: selectedTicket?.id ?? input.ticketId ?? null,
    recipientName: resolvedRecipient,
    amount: resolvedAmount,
  };

  if (input.docType === "PO" || input.docType === "DO") {
    const fallbackItems: HermesDocItemParam[] =
      params.items && params.items.length > 0
        ? params.items
        : selectedTicket && selectedTicket.items.length > 0
          ? selectedTicket.items.map((item, idx) => ({
              itemCode: `TKT-${String(idx + 1).padStart(2, "0")}`,
              description: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.estimatedUnitCost ?? 0,
              totalPrice:
                item.estimatedUnitCost !== null
                  ? item.estimatedUnitCost * item.quantity
                  : null,
              remarks: `Referensi tiket ${selectedTicket.ticketNumber}`,
            }))
          : [
              {
                itemCode: input.docType === "PO" ? "MAT-001" : "DO-001",
                description: resolvedPurpose || input.prompt,
                quantity: 1,
                unit: "paket",
                unitPrice: resolvedAmount ?? 0,
                totalPrice: resolvedAmount ?? 0,
                remarks:
                  input.docType === "DO"
                    ? "Dikirim sesuai instruksi logistik"
                    : "Sesuai spesifikasi proyek",
              },
            ];

    const computedSubtotal = fallbackItems.reduce(
      (sum, item) =>
        sum +
        (typeof item.totalPrice === "number"
          ? item.totalPrice
          : (item.unitPrice ?? 0) * item.quantity),
      0,
    );

    if (input.docType === "PO") {
      htmlContent = renderUniversalTransactionDocument({
        kind: "PO",
        title,
        subtitle,
        number: documentNumber,
        date: dateText,
        logoDataUrl,
        qrDataUrl,
        approvalQrDataUrl: qrDataUrl,
        leftDetails: [
          { label: "Kepada / Vendor", value: resolvedRecipient },
          {
            label: "Alamat",
            value: params.recipientAddress?.trim() || selectedProject?.location || "-",
          },
          { label: "No. Tiket", value: selectedTicket?.ticketNumber ?? "-" },
        ],
        rightDetails: [
          { label: "Proyek / Site", value: projectLabel },
          {
            label: "Metode Pembayaran",
            value: params.paymentMethod?.trim() || "Transfer Bank",
          },
          {
            label: "Rekening / Info",
            value: params.bankInfo?.trim() || "Sesuai invoice resmi vendor",
          },
        ],
        items: fallbackItems,
        summary: [
          { label: "SUB TOTAL", amount: computedSubtotal },
          { label: "TOTAL", amount: computedSubtotal, emphasis: true },
        ],
        terms: params.terms?.length
          ? params.terms
          : [
              "Cantumkan nomor PO ini pada Surat Jalan (DO) dan Invoice penagihan.",
              "Material/jasa wajib memenuhi spesifikasi teknis PT Skala Prioritas Engineering.",
            ],
        notes: params.notes?.trim() || resolvedPurpose,
        signatures: [
          {
            heading: "Dibuat Oleh / Prepared By",
            name: input.user.name,
            role: "Admin / Logistik ERP",
          },
          {
            heading: "Diperiksa Oleh / Checked By",
            name: "Tim Keuangan",
            role: "Keuangan / Finance",
          },
          {
            heading: "Disetujui Oleh / Approved By",
            name: "Direktur / Wakil Direktur",
            role: "Direksi PT Skala Prioritas",
            approvalStatus: "pending",
          },
        ],
      });
    } else {
      htmlContent = renderUniversalTransactionDocument({
        kind: "DO",
        title,
        subtitle,
        number: documentNumber,
        date: dateText,
        logoDataUrl,
        qrDataUrl,
        leftDetails: [
          {
            label: "No. Referensi / Proyek",
            value: selectedProject?.code || selectedTicket?.ticketNumber || "-",
          },
          { label: "Proyek / Site", value: projectLabel },
          { label: "Tujuan / Penerima", value: resolvedRecipient },
        ],
        rightDetails: [
          { label: "Driver / Mover", value: params.driverName?.trim() || "-" },
          {
            label: "Plat Kendaraan",
            value: params.vehiclePlate?.trim() || "-",
          },
          { label: "Diterbitkan Oleh", value: input.user.name },
        ],
        items: fallbackItems,
        notes:
          params.notes?.trim() ||
          `Pengiriman material untuk ${projectLabel}. ${resolvedPurpose}`,
        signatures: [
          {
            heading: "Diterbitkan Oleh / Issued By",
            name: input.user.name,
            role: "Logistik / Pengirim",
          },
          {
            heading: "Diketahui Oleh / Acknowledged By",
            name: "Koordinator Lapangan",
            role: "Koordinator Lapangan",
          },
          {
            heading: "Diterima Oleh / Received By",
            name: resolvedRecipient,
            role: "Penerima Lapangan",
          },
        ],
      });
    }
    structuredData.items = fallbackItems;
    structuredData.subtotal = computedSubtotal;
  } else if (input.docType === "KWITANSI") {
    const nominal = resolvedAmount ?? 0;
    const terbilang = terbilangRupiah(nominal);
    const items = params.items ?? [];
    const itemsTable = items.length
      ? `<h3 class="section-title">Rincian Pembayaran</h3>
         <table class="data-table">
           <thead><tr><th>No</th><th>Uraian</th><th class="text-right">Qty</th><th>Satuan</th><th class="text-right">Harga</th><th class="text-right">Subtotal</th></tr></thead>
           <tbody>
             ${items
               .map((it, i) => {
                 const lineTotal =
                   it.totalPrice ?? (it.unitPrice ?? 0) * it.quantity;
                 return `<tr>
                   <td class="text-center">${i + 1}</td>
                   <td>${escapeHtml(it.description)}</td>
                   <td class="text-right">${escapeHtml(it.quantity)}</td>
                   <td>${escapeHtml(it.unit)}</td>
                   <td class="text-right mono">${it.unitPrice != null ? escapeHtml(formatRupiah(it.unitPrice)) : "-"}</td>
                   <td class="text-right mono">${escapeHtml(formatRupiah(lineTotal))}</td>
                 </tr>`;
               })
               .join("")}
           </tbody>
         </table>`
      : "";

    const bodyHtml = `
      <div class="kv-panel">
        <div class="kv-line"><strong>Sudah Terima Dari</strong><span>:</span><span><strong>PT Skala Prioritas Engineering</strong></span></div>
        <div class="kv-line"><strong>Diserahkan Kepada</strong><span>:</span><span><strong>${escapeHtml(resolvedRecipient)}</strong></span></div>
        <div class="kv-line"><strong>Proyek / Unit</strong><span>:</span><span>${escapeHtml(projectLabel)}</span></div>
        <div class="kv-line"><strong>Untuk Pembayaran</strong><span>:</span><span>${escapeHtml(resolvedPurpose)}</span></div>
        ${params.paymentMethod ? `<div class="kv-line"><strong>Metode Bayar</strong><span>:</span><span>${escapeHtml(params.paymentMethod)}</span></div>` : ""}
        ${params.bankInfo ? `<div class="kv-line"><strong>Rekening Tujuan</strong><span>:</span><span>${escapeHtml(params.bankInfo)}</span></div>` : ""}
      </div>
      <div class="terbilang-box">
        <div class="terbilang-label">Terbilang / Uang Sejumlah</div>
        <div class="terbilang-text"># ${escapeHtml(terbilang)} #</div>
        <div class="amount-highlight">${escapeHtml(formatRupiah(nominal))}</div>
      </div>
      ${itemsTable}
      ${params.notes ? `<div class="narrative-box" style="margin-top:10px;"><strong>Catatan:</strong> ${escapeHtml(params.notes)}</div>` : ""}
    `;

    htmlContent = renderExecutiveShell({
      documentNumber,
      title,
      subtitle,
      badge: meta.badge,
      dateText,
      logoDataUrl,
      qrDataUrl,
      metaLeft: [
        { label: "Proyek / Lokasi", value: projectLabel },
        { label: "No. Tiket Ref.", value: selectedTicket?.ticketNumber ?? "-" },
      ],
      metaRight: [
        { label: "Penerima Dana", value: resolvedRecipient },
        { label: "Dibuat Oleh", value: input.user.name },
      ],
      bodyHtml,
      signatures: [
        { heading: "Disiapkan / Keuangan", name: input.user.name, role: "Keuangan / Administrasi" },
        { heading: "Yang Menerima", name: resolvedRecipient, role: "Penerima Pembayaran" },
        { heading: "Verifikasi Dokumen", name: "QR Terverifikasi", role: "Skala ERP Audit", hasQr: true },
      ],
    });
    structuredData.terbilang = terbilang;
    structuredData.amount = nominal;
  } else if (input.docType === "LAMPIRAN_KEUANGAN") {
    const items: HermesDocItemParam[] =
      params.items && params.items.length > 0
        ? params.items
        : [
            {
              description: resolvedPurpose,
              quantity: 1,
              unit: "paket",
              unitPrice: resolvedAmount ?? 0,
              totalPrice: resolvedAmount ?? 0,
              remarks: selectedTicket?.ticketNumber
                ? `Ref ${selectedTicket.ticketNumber}`
                : "Lampiran klaim / realisasi",
            },
          ];
    const totalAmount = items.reduce(
      (sum, item) =>
        sum +
        (typeof item.totalPrice === "number"
          ? item.totalPrice
          : (item.unitPrice ?? 0) * item.quantity),
      0,
    );
    const effectiveTotal = totalAmount > 0 ? totalAmount : (resolvedAmount ?? 0);

    const bodyHtml = `
      <h3 class="section-title">Rincian Item Biaya / Klaim Keuangan</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:36px;">No</th>
            <th>Uraian Pengeluaran / Klaim</th>
            <th class="text-right" style="width:65px;">Qty</th>
            <th style="width:70px;">Satuan</th>
            <th class="text-right" style="width:120px;">Harga Satuan</th>
            <th class="text-right" style="width:130px;">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((it, idx) => {
              const qty =
                typeof it.quantity === "number" && Number.isFinite(it.quantity)
                  ? it.quantity
                  : 1;
              const lineTotal = it.totalPrice ?? (it.unitPrice ?? 0) * qty;
              return `<tr>
                <td class="text-center">${idx + 1}</td>
                <td>${escapeHtml(it.description)}${it.remarks ? `<br><small style="color:#64748b;">${escapeHtml(it.remarks)}</small>` : ""}</td>
                <td class="text-right">${escapeHtml(qty)}</td>
                <td>${escapeHtml(it.unit)}</td>
                <td class="text-right mono">${escapeHtml(formatRupiah(it.unitPrice ?? lineTotal))}</td>
                <td class="text-right mono"><strong>${escapeHtml(formatRupiah(lineTotal))}</strong></td>
              </tr>`;
            })
            .join("")}
          <tr style="background:#102a4d;color:#ffffff;font-weight:800;">
            <td colspan="5" class="text-right">TOTAL PERTANGGUNGJAWABAN / KLAIM</td>
            <td class="text-right mono">${escapeHtml(formatRupiah(effectiveTotal))}</td>
          </tr>
        </tbody>
      </table>
      <div class="terbilang-box">
        <div class="terbilang-label">Terbilang Total Lampiran Keuangan</div>
        <div class="terbilang-text">${escapeHtml(terbilangRupiah(effectiveTotal))}</div>
      </div>
      <div class="narrative-box">
        <strong>Keterangan &amp; Catatan Verifikasi:</strong><br/>
        ${escapeHtml(params.notes?.trim() || "Seluruh bukti transaksi/bon terlampir diajukan untuk proses verifikasi keuangan sesuai prosedur PT Skala Prioritas Engineering.")}
      </div>
    `;

    htmlContent = renderExecutiveShell({
      documentNumber,
      title,
      subtitle,
      badge: meta.badge,
      dateText,
      logoDataUrl,
      qrDataUrl,
      metaLeft: [
        { label: "Pemohon / Penerima", value: resolvedRecipient },
        { label: "Proyek / Pos Biaya", value: projectLabel },
      ],
      metaRight: [
        { label: "No. Tiket Ref.", value: selectedTicket?.ticketNumber ?? "-" },
        { label: "Metode Pencairan", value: params.paymentMethod ?? "Transfer / Kas" },
      ],
      bodyHtml,
      signatures: [
        { heading: "Diajukan Oleh", name: input.user.name, role: "Pemohon / Pelaksana" },
        { heading: "Diverifikasi Keuangan", name: "Tim Finance", role: "Keuangan & Akuntansi" },
        { heading: "Disetujui & QR Audit", name: "Direksi", role: "Otorisasi Perusahaan", hasQr: true },
      ],
    });
    structuredData.totalAmount = effectiveTotal;
    structuredData.items = items;
  } else if (input.docType === "SPK") {
    const contractValue = resolvedAmount ?? selectedProject?.paguAmount ?? 0;
    const defaultScope = [
      `Melaksanakan pekerjaan konstruksi untuk proyek ${projectLabel} sesuai lingkup berikut:`,
      resolvedPurpose,
      selectedProject?.workPoints?.length
        ? `Titik kerja tercatat pada sistem: ${selectedProject.workPoints.map((wp) => wp.title).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const enriched = await maybeEnrichNarrativeWithHermes({
      docType: "SPK",
      prompt: input.prompt,
      erpContext,
      gatewayStatus: input.gatewayStatus,
      fallbackText: defaultScope,
      customGatewayUrl: input.customGatewayUrl,
      customApiKey: input.customApiKey,
    });
    usedGateway = enriched.usedGateway;

    const workPointRows = selectedProject?.workPoints?.length
      ? `<h3 class="section-title">Rincian Titik Kerja Terdaftar</h3>
         <table class="data-table">
           <thead><tr><th>No</th><th>Titik Pekerjaan</th><th>Lokasi</th><th class="text-right">Progres</th><th class="text-right">Nilai RAB</th></tr></thead>
           <tbody>
             ${selectedProject.workPoints
               .map(
                 (wp, idx) => `<tr>
                   <td class="text-center">${idx + 1}</td>
                   <td>${escapeHtml(wp.title)}</td>
                   <td>${escapeHtml(wp.location ?? "-")}</td>
                   <td class="text-right">${escapeHtml(wp.progress.toFixed(1))}%</td>
                   <td class="text-right mono">${escapeHtml(wp.approvedTotalWageFormatted ?? wp.proposedTotalWageFormatted)}</td>
                 </tr>`,
               )
               .join("")}
           </tbody>
         </table>`
      : "";

    const bodyHtml = `
      <div class="kv-panel">
        <div class="kv-line"><strong>Pihak Pertama (Pemberi Kerja)</strong><span>:</span><span><strong>PT Skala Prioritas Engineering</strong></span></div>
        <div class="kv-line"><strong>Pihak Kedua (Pelaksana / Subkon)</strong><span>:</span><span><strong>${escapeHtml(resolvedRecipient)}</strong></span></div>
        <div class="kv-line"><strong>Proyek &amp; Lokasi</strong><span>:</span><span>${escapeHtml(projectLabel)}</span></div>
        <div class="kv-line"><strong>Nilai Kontrak / Borongan</strong><span>:</span><span><strong>${escapeHtml(formatRupiah(contractValue))}</strong></span></div>
      </div>
      <div class="terbilang-box">
        <div class="terbilang-label">Nilai Surat Perintah Kerja (Terbilang)</div>
        <div class="terbilang-text">${escapeHtml(terbilangRupiah(contractValue))}</div>
      </div>
      <h3 class="section-title">Lingkup Pekerjaan &amp; Instruksi Pelaksanaan</h3>
      <div class="narrative-box">${escapeHtml(enriched.text)}</div>
      ${workPointRows}
      <h3 class="section-title">Syarat &amp; Ketentuan Umum</h3>
      <ol class="terms-list">
        <li>Pihak Kedua wajib melaksanakan pekerjaan sesuai gambar teknis (DED/Shop Drawing), spesifikasi material, dan standar K3 konstruksi.</li>
        <li>Pembayaran dilakukan berdasarkan progres opname lapangan yang diverifikasi Koordinator Lapangan serta disetujui Direksi.</li>
        <li>Retensi pemeliharaan dan ketentuan keterlambatan mengikuti kesepakatan kontrak proyek PT Skala Prioritas Engineering.</li>
      </ol>
    `;

    htmlContent = renderExecutiveShell({
      documentNumber,
      title,
      subtitle,
      badge: meta.badge,
      dateText,
      logoDataUrl,
      qrDataUrl,
      metaLeft: [
        { label: "Kode Proyek", value: selectedProject?.code ?? "-" },
        { label: "Subkontraktor", value: resolvedRecipient },
      ],
      metaRight: [
        { label: "Penanggung Jawab", value: input.user.name },
        { label: "Status Dokumen", value: "Draft Resmi Hermes ERP" },
      ],
      bodyHtml,
      signatures: [
        { heading: "Pihak Pertama / Direksi", name: "Direktur / Wakil Direktur", role: "PT Skala Prioritas Engineering" },
        { heading: "Pihak Kedua / Pelaksana", name: resolvedRecipient, role: "Subkontraktor / Mandor" },
        { heading: "Verifikasi Dokumen", name: "QR Terverifikasi", role: "Skala ERP Audit", hasQr: true },
      ],
    });
    structuredData.contractValue = contractValue;
  } else if (input.docType === "BAST") {
    const bastType =
      params.bastType ??
      (/\bfho\b/i.test(input.prompt) ? "FHO" : "PHO");
    title = params.title?.trim() || `BERITA ACARA SERAH TERIMA (${bastType})`;
    const defaultBastBody = [
      `Pada hari ini tanggal ${dateText}, telah dilaksanakan pemeriksaan bersama dan serah terima pekerjaan (${bastType}) untuk proyek ${projectLabel}.`,
      `Hasil pemeriksaan menyatakan bahwa pekerjaan dengan lingkup "${resolvedPurpose}" telah dilaksanakan${selectedProject ? ` dengan capaian progres tercatat ${selectedProject.progress.toFixed(1)}%` : ""} sesuai standar mutu yang ditetapkan.`,
      `Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya untuk digunakan sebagaimana mestinya.`,
    ].join("\n\n");

    const enriched = await maybeEnrichNarrativeWithHermes({
      docType: "BAST",
      prompt: input.prompt,
      erpContext,
      gatewayStatus: input.gatewayStatus,
      fallbackText: defaultBastBody,
      customGatewayUrl: input.customGatewayUrl,
      customApiKey: input.customApiKey,
    });
    usedGateway = enriched.usedGateway;

    const bodyHtml = `
      <div class="kv-panel">
        <div class="kv-line"><strong>Jenis Serah Terima</strong><span>:</span><span><strong>${escapeHtml(bastType === "FHO" ? "FHO (Final Hand Over)" : "PHO (Provisional Hand Over)")}</strong></span></div>
        <div class="kv-line"><strong>Nama Proyek / Lokasi</strong><span>:</span><span>${escapeHtml(projectLabel)}</span></div>
        <div class="kv-line"><strong>Pihak Penyerah / Pelaksana</strong><span>:</span><span>${escapeHtml(resolvedRecipient)}</span></div>
        <div class="kv-line"><strong>Pihak Penerima</strong><span>:</span><span>PT Skala Prioritas Engineering</span></div>
        ${selectedProject ? `<div class="kv-line"><strong>Progres Fisik Tercatat</strong><span>:</span><span><strong>${escapeHtml(selectedProject.progress.toFixed(1))}%</strong> (${escapeHtml(selectedProject.status)})</span></div>` : ""}
      </div>
      <h3 class="section-title">Pernyataan &amp; Catatan Serah Terima</h3>
      <div class="narrative-box">${escapeHtml(enriched.text)}</div>
    `;

    htmlContent = renderExecutiveShell({
      documentNumber,
      title,
      subtitle,
      badge: meta.badge,
      dateText,
      logoDataUrl,
      qrDataUrl,
      metaLeft: [
        { label: "Kode Proyek", value: selectedProject?.code ?? "-" },
        { label: "Jenis BAST", value: bastType },
      ],
      metaRight: [
        { label: "Pelaksana", value: resolvedRecipient },
        { label: "Disusun Oleh", value: input.user.name },
      ],
      bodyHtml,
      signatures: [
        { heading: "Yang Menyerahkan", name: resolvedRecipient, role: "Pelaksana / Subkontraktor" },
        { heading: "Yang Menerima / Menyetujui", name: "Direktur / Koordinator", role: "PT Skala Prioritas Engineering" },
        { heading: "Verifikasi Dokumen", name: "QR Terverifikasi", role: "Skala ERP Audit", hasQr: true },
      ],
    });
    structuredData.bastType = bastType;
  } else if (input.docType === "LAPORAN_PROYEK") {
    const defaultSummary = selectedProject
      ? `Laporan evaluasi pelaksanaan proyek ${selectedProject.title} (${selectedProject.code}) di ${selectedProject.location || selectedProject.address}. Progres fisik saat ini tercatat ${selectedProject.progress.toFixed(1)}% dengan status ${selectedProject.status}.`
      : `Rekapitulasi portofolio proyek aktif PT Skala Prioritas Engineering: terdapat ${erpContext.activeProjectsCount} proyek berjalan, ${erpContext.pendingTicketsCount} tiket pengajuan aktif, dan ${erpContext.lowStockItems.length} item stok gudang pada level minimum.`;

    const enriched = await maybeEnrichNarrativeWithHermes({
      docType: "LAPORAN_PROYEK",
      prompt: input.prompt,
      erpContext,
      gatewayStatus: input.gatewayStatus,
      fallbackText: defaultSummary,
      customGatewayUrl: input.customGatewayUrl,
      customApiKey: input.customApiKey,
    });
    usedGateway = enriched.usedGateway;

    const kpiHtml = selectedProject
      ? `<div class="kpi-grid">
           <div class="kpi-card"><div class="kpi-label">Progres Fisik</div><div class="kpi-value">${escapeHtml(selectedProject.progress.toFixed(1))}%</div><div class="kpi-sub">Status: ${escapeHtml(selectedProject.status)}</div></div>
           <div class="kpi-card"><div class="kpi-label">Pagu Kontrak</div><div class="kpi-value" style="font-size:9.5pt;">${escapeHtml(selectedProject.paguFormatted)}</div><div class="kpi-sub">Budget RAP: ${escapeHtml(selectedProject.budgetFormatted)}</div></div>
           <div class="kpi-card"><div class="kpi-label">Titik Kerja</div><div class="kpi-value">${selectedProject.workPoints.length}</div><div class="kpi-sub">Item pekerjaan tercatat</div></div>
           <div class="kpi-card"><div class="kpi-label">Laporan Harian</div><div class="kpi-value">${selectedProject.latestDailyReports.length}</div><div class="kpi-sub">Log terbaru terlampir</div></div>
         </div>`
      : `<div class="kpi-grid">
           <div class="kpi-card"><div class="kpi-label">Proyek Aktif</div><div class="kpi-value">${erpContext.activeProjectsCount}</div><div class="kpi-sub">Sedang berjalan</div></div>
           <div class="kpi-card"><div class="kpi-label">Tiket Aktif</div><div class="kpi-value">${erpContext.pendingTicketsCount}</div><div class="kpi-sub">Menunggu proses/selesai</div></div>
           <div class="kpi-card"><div class="kpi-label">Stok Kritis</div><div class="kpi-value">${erpContext.lowStockItems.length}</div><div class="kpi-sub">Di bawah stok minimum</div></div>
           <div class="kpi-card"><div class="kpi-label">Katalog Gudang</div><div class="kpi-value">${erpContext.totalStockItemsCount}</div><div class="kpi-sub">Total SKU terdaftar</div></div>
         </div>`;

    const detailTableHtml = selectedProject
      ? `
        ${
          selectedProject.workPoints.length > 0
            ? `<h3 class="section-title">Progres Titik Kerja</h3>
               <table class="data-table">
                 <thead><tr><th>No</th><th>Titik Pekerjaan</th><th>Lokasi</th><th class="text-right">Progres</th><th class="text-right">Nilai Upah</th></tr></thead>
                 <tbody>
                   ${selectedProject.workPoints
                     .map(
                       (wp, idx) => `<tr>
                         <td class="text-center">${idx + 1}</td>
                         <td>${escapeHtml(wp.title)}</td>
                         <td>${escapeHtml(wp.location ?? "-")}</td>
                         <td class="text-right">${escapeHtml(wp.progress.toFixed(1))}%</td>
                         <td class="text-right mono">${escapeHtml(wp.approvedTotalWageFormatted ?? wp.proposedTotalWageFormatted)}</td>
                       </tr>`,
                     )
                     .join("")}
                 </tbody>
               </table>`
            : ""
        }
        ${
          selectedProject.latestDailyReports.length > 0
            ? `<h3 class="section-title">Log Laporan Harian Terbaru</h3>
               <table class="data-table">
                 <thead><tr><th>Tanggal</th><th>Cuaca</th><th class="text-right">Pekerja</th><th class="text-right">Progres</th><th>Ringkasan Pekerjaan</th></tr></thead>
                 <tbody>
                   ${selectedProject.latestDailyReports
                     .map(
                       (dr) => `<tr>
                         <td>${escapeHtml(dr.reportDate)}</td>
                         <td>${escapeHtml(dr.weather ?? "-")}</td>
                         <td class="text-right">${escapeHtml(dr.workersCount)}</td>
                         <td class="text-right">${dr.progress !== null ? `${escapeHtml(dr.progress.toFixed(1))}%` : "-"}</td>
                         <td>${escapeHtml(dr.workSummary ?? dr.notes ?? "-")}</td>
                       </tr>`,
                     )
                     .join("")}
                 </tbody>
               </table>`
            : ""
        }`
      : `<h3 class="section-title">Daftar Proyek Aktif Terkini</h3>
         <table class="data-table">
           <thead><tr><th>Kode</th><th>Nama Proyek &amp; Lokasi</th><th>Status</th><th class="text-right">Progres</th><th class="text-right">Pagu</th></tr></thead>
           <tbody>
             ${erpContext.topProjects
               .map(
                 (p) => `<tr>
                   <td class="mono">${escapeHtml(p.code)}</td>
                   <td><strong>${escapeHtml(p.title)}</strong><br><small style="color:#64748b;">${escapeHtml(p.kelompokTani)} · ${escapeHtml(p.location ?? "-")}</small></td>
                   <td>${escapeHtml(p.status)}</td>
                   <td class="text-right">${escapeHtml(p.progress.toFixed(1))}%</td>
                   <td class="text-right mono">${escapeHtml(p.paguFormatted)}</td>
                 </tr>`,
               )
               .join("")}
           </tbody>
         </table>`;

    const bodyHtml = `
      ${kpiHtml}
      <h3 class="section-title">Ringkasan Eksekutif &amp; Analisis</h3>
      <div class="narrative-box">${escapeHtml(enriched.text)}</div>
      ${detailTableHtml}
    `;

    htmlContent = renderExecutiveShell({
      documentNumber,
      title,
      subtitle,
      badge: meta.badge,
      dateText,
      logoDataUrl,
      qrDataUrl,
      metaLeft: [
        { label: "Proyek", value: selectedProject ? selectedProject.title : "Portofolio Proyek Aktif" },
        { label: "Kode / Klien", value: selectedProject ? `${selectedProject.code} · ${selectedProject.clientName ?? selectedProject.kelompokTani}` : "Seluruh Unit Proyek" },
      ],
      metaRight: [
        { label: "Disusun Oleh", value: input.user.name },
        { label: "Sumber Data", value: "Live Skala ERP Database" },
      ],
      bodyHtml,
      signatures: [
        { heading: "Disusun Oleh", name: input.user.name, role: "Koordinator / Admin Proyek" },
        { heading: "Diketahui Direksi", name: "Direktur / Wakil Direktur", role: "PT Skala Prioritas Engineering" },
        { heading: "Verifikasi Dokumen", name: "QR Terverifikasi", role: "Skala ERP Audit", hasQr: true },
      ],
    });
  } else {
    // SURAT_RESMI
    const perihal = params.purpose?.trim() || resolvedPurpose;
    const defaultLetterBody = [
      `Dengan hormat,`,
      `Sehubungan dengan pelaksanaan kegiatan operasional dan proyek ${projectLabel} pada PT Skala Prioritas Engineering, bersama ini kami sampaikan hal berikut:`,
      `${input.prompt.trim()}`,
      `Demikian surat resmi ini kami sampaikan untuk menjadi perhatian dan tindak lanjut bersama. Atas kerja sama dan koordinasinya, kami ucapkan terima kasih.`,
    ].join("\n\n");

    const enriched = await maybeEnrichNarrativeWithHermes({
      docType: "SURAT_RESMI",
      prompt: input.prompt,
      erpContext,
      gatewayStatus: input.gatewayStatus,
      fallbackText: defaultLetterBody,
      customGatewayUrl: input.customGatewayUrl,
      customApiKey: input.customApiKey,
    });
    usedGateway = enriched.usedGateway;

    const bodyHtml = `
      <div class="kv-panel" style="margin-bottom:12px;">
        <div class="kv-line"><strong>Perihal</strong><span>:</span><span><strong>${escapeHtml(perihal)}</strong></span></div>
        <div class="kv-line"><strong>Kepada Yth.</strong><span>:</span><span><strong>${escapeHtml(resolvedRecipient)}</strong></span></div>
        <div class="kv-line"><strong>Proyek Terkait</strong><span>:</span><span>${escapeHtml(projectLabel)}</span></div>
      </div>
      <div class="narrative-box">${escapeHtml(enriched.text)}</div>
    `;

    htmlContent = renderExecutiveShell({
      documentNumber,
      title,
      subtitle,
      badge: meta.badge,
      dateText,
      logoDataUrl,
      qrDataUrl,
      metaLeft: [
        { label: "Tujuan Surat", value: resolvedRecipient },
        { label: "Proyek / Unit", value: projectLabel },
      ],
      metaRight: [
        { label: "Penandatangan", value: input.user.name },
        { label: "Sifat", value: "Resmi / Internal & Mitra" },
      ],
      bodyHtml,
      signatures: [
        { heading: "Hormat Kami / Pengirim", name: input.user.name, role: "PT Skala Prioritas Engineering" },
        { heading: "Mengetahui / Direksi", name: "Direktur / Wakil Direktur", role: "Pimpinan Perusahaan" },
        { heading: "Verifikasi Dokumen", name: "QR Terverifikasi", role: "Skala ERP Audit", hasQr: true },
      ],
    });
  }

  const summaryText = [
    `${title} (${documentNumber})`,
    selectedProject ? `Proyek: ${projectLabel}` : null,
    resolvedRecipient ? `Pihak/Tujuan: ${resolvedRecipient}` : null,
    resolvedAmount !== null ? `Nilai: ${formatRupiah(resolvedAmount)}` : null,
    `Dibuat oleh ${input.user.name}`,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 1500);

  await connectToMongoDB();

  let savedDoc: ChatGeneratedDocumentRecord | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await ChatGeneratedDocumentModel.create({
        _id: docId,
        documentNumber,
        docType: input.docType,
        title: title.slice(0, 220),
        subtitle: subtitle.slice(0, 220),
        projectId: selectedProject?.id ?? input.projectId ?? null,
        projectName: selectedProject ? projectLabel : null,
        ticketId: selectedTicket?.id ?? input.ticketId ?? null,
        recipientName: resolvedRecipient,
        amount: resolvedAmount,
        summary: summaryText,
        htmlContent,
        structuredData,
        createdById: input.user.id,
        createdByName: input.user.name,
        createdByRole: input.user.role,
      });
      savedDoc = created.toObject() as ChatGeneratedDocumentRecord;
      break;
    } catch (err: unknown) {
      const isDuplicate =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === 11000;
      if (isDuplicate && attempt < 2) {
        const nextNumber = buildDocumentNumber(input.docType, new Date());
        htmlContent = htmlContent.replaceAll(documentNumber, nextNumber);
        documentNumber = nextNumber;
        continue;
      }
      throw err;
    }
  }

  if (!savedDoc) {
    throw new Error("Gagal menyimpan dokumen Hermes ke database.");
  }

  return {
    document: savedDoc,
    engineUsed: usedGateway ? "hermes-gateway" : "hermes-builtin-erp",
  };
}

function formatProjectFundRecapReply(p: ErpProjectSummary): string {
  const recap = p.fundRecap;
  const catLines = (
    [
      ["Ambilan Tukang", recap.byCategory.TUKANG],
      ["Pembelanjaan Bahan", recap.byCategory.BAHAN],
      ["Rumah & Kendaraan Sewa", recap.byCategory.SEWA],
      ["Barang Inventaris", recap.byCategory.INVENTARIS],
      ["Operasional & Lainnya", recap.byCategory.OPERASIONAL],
    ] as const
  )
    .filter(([, b]) => b.count > 0 || b.requestedAmount > 0 || b.paidAmount > 0)
    .map(
      ([label, b]) =>
        `- **${label}** (${b.count} tiket): Diajukan **${b.requestedFormatted}** · Lunas/Cair **${b.paidFormatted}**`,
    );

  const recentTicketLines = recap.tickets.slice(0, 6).map(
    (t) =>
      `  - \`${t.ticketNumber}\` (${t.fundCategoryLabel}) — ${t.title}: **${t.amountFormatted}** (*${t.paymentStatusLabel}*)`,
  );

  return [
    `Barusan saya cek data **Rekap Dana** live dari database untuk proyek **${p.title}** (\`${p.code}\`):`,
    `- **Lokasi / Alamat:** ${p.address || p.location || p.kelompokTani}`,
    p.picName ? `- **PIC / Manajer Proyek:** ${p.picName}` : null,
    `- **Progres Fisik / Status:** ${p.progress.toFixed(1)}% (\`${p.status}\`)`,
    `- **Nilai Kontrak / Pagu:** **${p.paguFormatted}**`,
    `- **Total Realisasi Cair (Lunas):** **${recap.totalPaidFormatted}** (${recap.absorptionPaidPct}% dari pagu)`,
    `- **Total Dana Diajukan (${recap.totalTicketsCount} tiket):** **${recap.totalRequestedFormatted}** (${recap.absorptionRequestedPct}% dari pagu)`,
    `- **Sisa Pagu Anggaran (vs Diajukan):** **${recap.remainingFromRequestedFormatted}**`,
    catLines.length > 0 ? "\n**Rincian per Kategori:**\n" + catLines.join("\n") : null,
    recentTicketLines.length > 0
      ? "\n**Beberapa Tiket Terkait Terbaru:**\n" + recentTicketLines.join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildBuiltinErpReply(
  message: string,
  erpContext: HermesErpContextSummary,
  gatewayStatus: HermesGatewayStatus,
): string {
  const lower = message.toLowerCase();

  if (/\b(install|instalasi|setup|cli|gateway|api_server|8642)\b/i.test(lower)) {
    return [
      `**Status Hermes Gateway:** ${gatewayStatus.gatewayOnline ? "Online" : "Offline"} (${gatewayStatus.gatewayUrl})`,
      "",
      "Untuk menghubungkan node lokal **NousResearch/hermes-agent**, jalankan perintah berikut di terminal:",
      "```bash",
      ...HERMES_INSTALL_COMMANDS,
      "```",
      "Atau gunakan script repo `scripts/install-hermes-agent.sh`.",
      "",
      "Selama gateway belum aktif, **Mesin Bawaan Skala ERP** tetap siap menjawab data live proyek, tiket, stok gudang, serta membuat semua 8 jenis dokumen PDF resmi.",
    ].join("\n");
  }

  const targetMatchedProject =
    erpContext.selectedProject ?? erpContext.matchedProjects[0] ?? null;
  if (
    targetMatchedProject &&
    /\b(pengeluaran|biaya|realisasi|cair|dana|rekap|kasbon|lunas|anggaran|sisa\s+pagu|habis\s+berapa|total\s+tiket)\b/i.test(
      lower,
    )
  ) {
    return formatProjectFundRecapReply(targetMatchedProject);
  }

  if (/\b(stok|gudang|material|habis|menipis|minimum|sku|inventori)\b/i.test(lower)) {
    if (erpContext.lowStockItems.length === 0) {
      return `Saat ini seluruh **${erpContext.totalStockItemsCount} SKU material** di gudang berada di atas batas stok minimum. Tidak ada peringatan stok menipis.`;
    }
    const lines = erpContext.lowStockItems
      .slice(0, 8)
      .map(
        (s) =>
          `- **${s.name}** (\`${s.sku}\`): sisa **${s.stockQuantity} ${s.unit}** (min: ${s.minimumStock} ${s.unit})`,
      );
    return [
      `Terdapat **${erpContext.lowStockItems.length} material dengan stok kritis/minimum** (dari ${erpContext.totalStockItemsCount} SKU terdaftar):`,
      ...lines,
      "",
      "Anda dapat meminta saya langsung membuat **PO** atau **Lampiran Keuangan** untuk pengadaan ulang material tersebut.",
    ].join("\n");
  }

  if (/\b(tiket|ticket|pengajuan|approval|pending|pembayaran)\b/i.test(lower)) {
    if (erpContext.matchedTickets.length > 0) {
      const lines = erpContext.matchedTickets.slice(0, 8).map(
        (t) =>
          `- **${t.ticketNumber}** (${t.projectName}) — ${t.title} | **${t.amountFormatted}** (*${t.paymentStatusLabel}*)`,
      );
      return [
        `Berikut tiket yang cocok dari database (${erpContext.matchedTickets.length} ditemukan):`,
        ...lines,
      ].join("\n");
    }
    if (erpContext.latestPendingTickets.length === 0) {
      return "Saat ini tidak ada tiket pengajuan aktif yang menunggu penyelesaian.";
    }
    const lines = erpContext.latestPendingTickets.slice(0, 5).map(
      (t) =>
        `- **${t.ticketNumber}** — ${t.title} | Status: \`${t.status}\` | Nilai: **${t.amountFormatted}**${t.projectName ? ` (${t.projectName})` : ""}`,
    );
    return [
      `Terdapat **${erpContext.pendingTicketsCount} tiket aktif/pending** di Skala ERP. Berikut 5 tiket terbaru:`,
      ...lines,
    ].join("\n");
  }

  if (
    targetMatchedProject &&
    /\b(proyek|project|progres|progress|pagu|lapangan|kurva|harian|titik\s+kerja)\b/i.test(
      lower,
    )
  ) {
    if (erpContext.selectedProject) {
      const p = erpContext.selectedProject;
      const wpSummary = p.workPoints.length
        ? `\n\n**Titik Kerja (${p.workPoints.length}):**\n` +
          p.workPoints
            .slice(0, 5)
            .map(
              (wp) =>
                `- ${wp.title}: progres **${wp.progress.toFixed(1)}%** (RAB: ${wp.approvedTotalWageFormatted ?? wp.proposedTotalWageFormatted})`,
            )
            .join("\n")
        : "";
      return [
        formatProjectFundRecapReply(p),
        wpSummary,
        "",
        `Ketik **"Buatkan laporan proyek"** atau **"Buatkan SPK / BAST"** untuk mencetak PDF resmi proyek ini.`,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  if (
    /\b(proyek|project|progres|progress|pagu|lapangan|kurva|harian|titik\s+kerja)\b/i.test(
      lower,
    )
  ) {
    const lines = erpContext.topProjects.slice(0, 6).map(
      (p) =>
        `- **${p.code} — ${p.title}** (${p.address || p.location || p.kelompokTani}${p.picName ? ` · PIC: ${p.picName}` : ""}): Progres **${p.progress.toFixed(1)}%** · Cair **${p.fundRecap.totalPaidFormatted}** / Diajukan **${p.fundRecap.totalRequestedFormatted}** · Pagu **${p.paguFormatted}**`,
    );
    return [
      `Saat ini terdapat **${erpContext.activeProjectsCount} proyek aktif** di Skala Prioritas ERP:`,
      ...(lines.length ? lines : ["- Belum ada proyek aktif tercatat."]),
    ].join("\n");
  }

  if (/\b(dokumen|cetak|buat|kwitansi|spk|bast|po|surat|lampiran)\b/i.test(lower)) {
    return [
      "Saya dapat membuat dan mencetak **8 jenis dokumen resmi PT Skala Prioritas Engineering** (format PDF A4 dengan Kop Surat & QR Verifikasi):",
      "- **Kwitansi**: *\"Buatkan kwitansi Rp 15.000.000 untuk CV Karya Mandiri pembayaran termin 1\"*",
      "- **Lampiran Keuangan**: *\"Buatkan lampiran keuangan klaim BBM lapangan Rp 850.000\"*",
      "- **SPK**: *\"Buatkan SPK subkontraktor pasangan batu untuk CV Tirta sebesar Rp 45.000.000\"*",
      "- **BAST**: *\"Buatkan BAST PHO untuk proyek aktif saat ini\"*",
      "- **PO / Delivery Order (DO)**: *\"Buatkan PO pembelian semen 100 sak untuk TB Jaya Abadi\"* atau *\"Buatkan surat jalan pengiriman besi ke Garut\"*",
      "- **Laporan Proyek**: *\"Buatkan laporan proyek evaluasi progres terkini\"*",
      "- **Surat Resmi**: *\"Buatkan surat resmi pengantar survei lapangan kepada Dinas PU\"*",
    ].join("\n");
  }

  return [
    `Halo${erpContext.selectedProject ? ` dari proyek ${erpContext.selectedProject.title}` : ""}! Saya **Bunglon Assistant (SKALA AI)** 👋 (Mode: *${gatewayStatus.gatewayOnline ? "Gemini / Gateway Aktif" : "Skala ERP Live"}*).`,
    "",
    "Saya siap jadi rekan kerja Anda di PT Skala Prioritas Engineering. Barusan saya cek kondisi live sistem:",
    `- **Proyek Aktif:** ${erpContext.activeProjectsCount} proyek berjalan`,
    `- **Tiket Pending / Proses:** ${erpContext.pendingTicketsCount} tiket`,
    `- **Stok di Bawah Batas Minimum:** ${erpContext.lowStockItems.length} item (dari ${erpContext.totalStockItemsCount} SKU)`,
    "",
    "Mau saya bantu **cek rincian proyek/pengeluaran/stok**, **menginput Laporan Harian / Tiket / Catatan**, atau **membuatkan dokumen & laporan PDF**? Tulis saja dengan bahasa santai ya!",
  ].join("\n");
}

export interface ErpDataInputPayload {
  actionType: ChatDataActionType;
  projectId?: string | null;
  title?: string | null;
  category?: string | null;
  amount?: number | null;
  progress?: number | null;
  workersCount?: number | null;
  weather?: string | null;
  notes?: string | null;
}

export interface BunglonTurnResult {
  assistantContent: string;
  attachments: ChatAttachmentItem[];
  generatedDocument: ChatGeneratedDocumentRecord | null;
  dataActionResult: ChatDataActionResult | null;
  thinkingSteps: string[];
  engineUsed: "hermes-gateway" | "hermes-builtin-erp";
  gatewayStatus: HermesGatewayStatus;
}

export function buildThinkingSteps(params: {
  intentType: "data_input" | "document" | "chat";
  actionType?: ChatDataActionType | null;
  docType?: HermesDocType | null;
  projectName?: string | null;
  usedAiModel?: boolean;
}): string[] {
  const projSuffix = params.projectName ? ` (${params.projectName})` : "";
  if (params.intentType === "data_input") {
    const actionLabel =
      params.actionType === "DAILY_REPORT"
        ? `laporan harian & progres proyek${projSuffix}`
        : params.actionType === "CREATE_TICKET"
          ? "tiket pengajuan ERP baru"
          : "catatan kerja";
    return [
      "Memahami instruksi input data dan memvalidasi parameter...",
      `Mencocokkan referensi proyek dan izin akses untuk ${actionLabel}...`,
      "Menyimpan data baru ke database MongoDB secara transaksional...",
      "Menyusun ringkasan konfirmasi yang ramah untuk Anda...",
    ];
  }

  if (params.intentType === "document") {
    return [
      `Menganalisis permintaan dokumen ${params.docType ?? "resmi"}${projSuffix}...`,
      "Mengambil data live proyek, nilai nominal, dan pihak terkait dari MongoDB...",
      "Menyusun tata letak dokumen A4 ber-Kop PT Skala Prioritas Engineering & QR Code...",
      "Menyiapkan file pratinjau HTML & PDF agar langsung bisa dicetak atau dikirim...",
    ];
  }

  return [
    "Membaca konteks percakapan dan pertanyaan Anda...",
    `Mengambil metrik proyek, tiket, dan stok gudang terbaru dari MongoDB${projSuffix}...`,
    params.usedAiModel
      ? "Memproses analisis dan merangkai jawaban natural melalui Gemini / Gateway AI..."
      : "Merangkai jawaban natural berbasis data live Skala ERP...",
  ];
}

function detectDataInputActionType(
  message: string,
  explicit?: ErpDataInputPayload | null,
): ChatDataActionType | null {
  if (
    explicit &&
    (explicit.actionType === "DAILY_REPORT" ||
      explicit.actionType === "CREATE_TICKET" ||
      explicit.actionType === "CREATE_NOTE")
  ) {
    return explicit.actionType;
  }

  const trimmed = message.trim();
  if (
    /^(apa\s+itu|bagaimana\s+cara|gimana\s+cara|apakah\s+bisa|cara\s+)/i.test(
      trimmed,
    )
  ) {
    return null;
  }

  if (
    /\b(input|catat|tambah|laporkan|update|isi|simpan)\s+(?:data\s+)?(?:laporan\s+harian|daily\s+report|progres(?:\s+harian|\s+proyek)?)\b/i.test(
      trimmed,
    ) ||
    /\bupdate\s+progres\b/i.test(trimmed)
  ) {
    return "DAILY_REPORT";
  }

  if (
    /\b(input|buat|buatkan|ajukan|tambah|bikin|bikinkan)\s+(?:data\s+)?(?:tiket|ticket|pengajuan(?:\s+(?:material|biaya|operasional|kasbon|reimburse))?)\b/i.test(
      trimmed,
    )
  ) {
    return "CREATE_TICKET";
  }

  if (
    /\b(input|buat|simpan|catat|tulis)\s+(?:catatan|note|notes|pengingat|reminder)\b/i.test(
      trimmed,
    )
  ) {
    return "CREATE_NOTE";
  }

  return null;
}

async function resolveProjectForPrompt(
  message: string,
  explicitProjectId?: string | null,
) {
  if (explicitProjectId && explicitProjectId !== "NONE") {
    const exact = await prisma.project.findFirst({
      where: { id: explicitProjectId, isDeleted: false },
      select: {
        id: true,
        code: true,
        name: true,
        title: true,
        kelompokTani: true,
        progress: true,
        status: true,
      },
    });
    if (exact) return exact;
  }

  const candidates = await prisma.project.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      code: true,
      name: true,
      title: true,
      kelompokTani: true,
      progress: true,
      status: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  const lowerMsg = message.toLowerCase();
  let bestMatch: (typeof candidates)[number] | null = null;
  let bestScore = 0;

  for (const project of candidates) {
    const terms = [project.code, project.name, project.title, project.kelompokTani]
      .filter(Boolean)
      .map((t) => t.toLowerCase().trim());
    for (const term of terms) {
      if (term.length >= 3 && lowerMsg.includes(term) && term.length > bestScore) {
        bestScore = term.length;
        bestMatch = project;
      }
    }
  }

  return bestMatch;
}

async function allocateNextTicketNumber(): Promise<string> {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `TKT-${month}-`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = await prisma.documentNumberSequence.upsert({
      where: { kind_year: { kind: prefix, year: 0 } },
      update: { value: { increment: 1 } },
      create: { kind: prefix, year: 0, value: 1 },
      select: { value: true },
    });
    const candidate = `${prefix}${String(seq.value).padStart(3, "0")}`;
    const clash = await prisma.ticket.findUnique({
      where: { ticketNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }

  return `${prefix}${Date.now().toString().slice(-4)}`;
}

async function executeErpDataInputAction(params: {
  actionType: ChatDataActionType;
  message: string;
  projectId?: string | null;
  dataInput?: ErpDataInputPayload | null;
  user: {
    id: string;
    name: string;
    role: string;
  };
}): Promise<{
  content: string;
  result: ChatDataActionResult | null;
}> {
  const { actionType, message, projectId, dataInput, user } = params;

  if (actionType === "CREATE_NOTE") {
    const rawNote =
      dataInput?.notes?.trim() ||
      dataInput?.title?.trim() ||
      message
        .replace(
          /^(?:@(?:bunglon|skala|assistant|hermes|ai)\s+)?(?:tolong\s+|bantu\s+)?(?:input|buat|simpan|catat|tulis)\s+(?:catatan|note|notes|pengingat|reminder)\s*[:\-]?\s*/i,
          "",
        )
        .trim();

    if (!rawNote || rawNote.length < 2) {
      return {
        content:
          "Boleh sebutkan isi catatan yang mau saya simpan? Contohnya: *\"Catat: besok cek pengiriman semen di proyek Ine Kreatif jam 09.00\"*.",
        result: null,
      };
    }

    await prisma.userNote.create({
      data: {
        userId: user.id,
        title: rawNote.slice(0, 1000),
        color: "primary",
      },
    });

    const summaryText = rawNote.slice(0, 220);
    return {
      content: [
        `Siap **${user.name}**, catatan kerja Anda sudah langsung saya simpan ke menu **Catatan** ya! 📝`,
        "",
        `> "${summaryText}"`,
        "",
        "Anda bisa membukanya kapan saja lewat kartu konfirmasi di bawah ini.",
      ].join("\n"),
      result: {
        actionType: "CREATE_NOTE",
        title: "Catatan Kerja Berhasil Disimpan",
        referenceCode: "CATATAN",
        summary: summaryText,
        targetUrl: "/apps/notes",
      },
    };
  }

  if (actionType === "DAILY_REPORT") {
    const allowedReportRoles = new Set<string>([
      UserRole.DIRECTOR,
      UserRole.DEPUTY_DIRECTOR,
      UserRole.ADMINISTRATIONS,
      UserRole.KOORDINATOR,
      UserRole.FIELD_TEAM,
    ]);
    if (!allowedReportRoles.has(user.role)) {
      return {
        content: `Maaf **${user.name}**, input Laporan Harian proyek saat ini hanya dibuka untuk peran Direksi, Administrasi, Koordinator Lapangan, atau Tim Lapangan.`,
        result: null,
      };
    }

    const project = await resolveProjectForPrompt(
      message,
      dataInput?.projectId ?? projectId,
    );
    if (!project) {
      const topList = await prisma.project.findMany({
        where: { isDeleted: false },
        select: { code: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      });
      const sampleNames = topList
        .map((p) => `- **${p.title}** (\`${p.code}\`)`)
        .join("\n");
      return {
        content: [
          "Siap, saya bantu catat laporan hariannya! Boleh info **nama atau kode proyeknya** yang mana ya?",
          sampleNames ? `\nBeberapa proyek aktif saat ini:\n${sampleNames}` : "",
          "\nContoh: *\"Input laporan harian proyek Ine Kreatif progres 48% 12 pekerja cerah pemasangan batu selesai\"*.",
        ]
          .filter(Boolean)
          .join("\n"),
        result: null,
      };
    }

    const progressMatch = message.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
    const parsedProgress =
      typeof dataInput?.progress === "number" && Number.isFinite(dataInput.progress)
        ? dataInput.progress
        : progressMatch
          ? Number(progressMatch[1].replace(",", "."))
          : null;
    const nextProgress =
      parsedProgress !== null && Number.isFinite(parsedProgress)
        ? Math.max(0, Math.min(100, parsedProgress))
        : Number(project.progress ?? 0);

    const workersMatch = message.match(/(\d{1,4})\s*(?:pekerja|tukang|orang)/i);
    const workersCount =
      typeof dataInput?.workersCount === "number" &&
      Number.isFinite(dataInput.workersCount)
        ? Math.max(0, Math.round(dataInput.workersCount))
        : workersMatch
          ? Math.max(0, Number(workersMatch[1]))
          : 0;

    let weather = dataInput?.weather?.trim() || "";
    if (!weather) {
      if (/\bhujan\b/i.test(message)) weather = "Hujan";
      else if (/\bberawan|mendung\b/i.test(message)) weather = "Berawan";
      else weather = "Cerah";
    }

    const cleanedSummary =
      dataInput?.notes?.trim() ||
      message
        .replace(
          /^(?:@(?:bunglon|skala|assistant|hermes|ai)\s+)?(?:tolong\s+|bantu\s+)?(?:input|catat|tambah|laporkan|update|isi)\s+(?:data\s+)?(?:laporan\s+harian|daily\s+report|progres(?:\s+harian|\s+proyek)?)\s*/i,
          "",
        )
        .trim() ||
      `Update laporan harian proyek ${project.title}`;

    const dateKey =
      toJakartaDateKey(new Date()) ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    const reportDateStart = toJakartaDayStartDate(dateKey);
    const { start, endExclusive } = getJakartaDayRange(dateKey);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyReport.findFirst({
        where: {
          projectId: project.id,
          reportDate: { gte: start, lt: endExclusive },
        },
        select: {
          id: true,
          workersCount: true,
          workSummary: true,
        },
      });

      if (existing) {
        const mergedSummary = existing.workSummary
          ? existing.workSummary.includes(cleanedSummary)
            ? existing.workSummary
            : `${existing.workSummary}\n• [Via Bunglon AI]: ${cleanedSummary}`
          : cleanedSummary;
        await tx.dailyReport.update({
          where: { id: existing.id },
          data: {
            weather,
            workersCount:
              workersCount > 0 ? workersCount : existing.workersCount,
            progress: nextProgress,
            workSummary: mergedSummary.slice(0, 4000),
          },
        });
      } else {
        await tx.dailyReport.create({
          data: {
            projectId: project.id,
            reportDate: reportDateStart,
            weather,
            workersCount,
            progress: nextProgress,
            workSummary: cleanedSummary.slice(0, 4000),
          },
        });
      }

      const nextStatus =
        project.status === ProjectStatus.PENDING_SETUP ||
        project.status === ProjectStatus.PENDING
          ? ProjectStatus.ON_PROGRESS
          : project.status;

      await tx.project.update({
        where: { id: project.id },
        data: {
          progress: nextProgress,
          status: nextStatus,
        },
      });
    });

    const summaryLine = `${project.title} · Progres ${nextProgress.toFixed(1)}% · ${workersCount} pekerja · Cuaca ${weather}`;
    return {
      content: [
        `Beres **${user.name}**! Laporan harian & progres proyek **${project.title}** (\`${project.code}\`) untuk tanggal **${dateKey}** sudah berhasil saya catat ke database 👍`,
        "",
        `- **Progres Fisik Terkini:** ${nextProgress.toFixed(1)}%`,
        workersCount > 0 ? `- **Tenaga Kerja:** ${workersCount} pekerja` : null,
        `- **Cuaca:** ${weather}`,
        `- **Ringkasan Pekerjaan:** ${cleanedSummary.slice(0, 300)}`,
        "",
        "Kalau mau sekalian dibuatkan **Laporan Proyek PDF** atau **BAST**, tinggal bilang saja ya.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
      result: {
        actionType: "DAILY_REPORT",
        title: "Laporan Harian Proyek Tersimpan",
        referenceCode: project.code,
        summary: summaryLine,
        targetUrl: "/apps/projects",
      },
    };
  }

  // CREATE_TICKET
  const project = await resolveProjectForPrompt(
    message,
    dataInput?.projectId ?? projectId,
  );
  const extractedAmount =
    typeof dataInput?.amount === "number" &&
    Number.isFinite(dataInput.amount) &&
    dataInput.amount > 0
      ? Math.round(dataInput.amount)
      : extractAmountFromPrompt(message) ?? 0;

  let ticketTitle =
    dataInput?.title?.trim() ||
    message
      .replace(
        /^(?:@(?:bunglon|skala|assistant|hermes|ai)\s+)?(?:tolong\s+|bantu\s+)?(?:input|buat|buatkan|ajukan|tambah|bikin|bikinkan)\s+(?:data\s+)?(?:tiket|ticket|pengajuan)\s*/i,
        "",
      )
      .trim();

  if (ticketTitle.length > 140) {
    ticketTitle = `${ticketTitle.slice(0, 137)}...`;
  }
  if (ticketTitle.length < 3) {
    return {
      content:
        "Boleh beri tahu **judul/keperluan pengajuan tiketnya** ya? Contoh: *\"Input tiket pengajuan pembelian 50 sak semen untuk proyek Ine Kreatif Rp 3.750.000\"*.",
      result: null,
    };
  }

  const categoryHint = (dataInput?.category || message).toLowerCase();
  const ticketType: TicketType =
    /\b(material|semen|besi|pasir|batu|bahan|pipa|kawat|bbm|alat)\b/i.test(
      categoryHint,
    )
      ? TicketType.MATERIAL
      : /\b(biaya|kasbon|reimburse|bayar|upah|sewa|dana|uang|cost)\b/i.test(
            categoryHint,
          )
        ? TicketType.COST
        : TicketType.OPERATIONAL;

  const requestCategory: TicketRequestCategory =
    ticketType === TicketType.MATERIAL
      ? TicketRequestCategory.MATERIAL
      : /\bkasbon\b/i.test(categoryHint)
        ? TicketRequestCategory.KASBON
        : /\breimburse\b/i.test(categoryHint)
          ? TicketRequestCategory.REIMBURSEMENT
          : ticketType === TicketType.COST
            ? TicketRequestCategory.OPERATING_EXPENSE
            : TicketRequestCategory.OPS;

  const priority: TicketPriority = /\b(urgent|mendesak|segera|darurat)\b/i.test(
    message,
  )
    ? TicketPriority.URGENT
    : /\b(high|penting|prioritas)\b/i.test(message)
      ? TicketPriority.HIGH
      : TicketPriority.MEDIUM;

  const ticketNumber = await allocateNextTicketNumber();
  const descriptionText =
    dataInput?.notes?.trim() ||
    `Pengajuan dibuat via Bunglon Assistant oleh ${user.name}: ${message}`;

  await prisma.ticket.create({
    data: {
      id: randomUUID(),
      ticketNumber,
      title: ticketTitle,
      description: descriptionText.slice(0, 4000),
      type: ticketType,
      requestCategory,
      priority,
      status: TicketStatus.PENDING_DIRECTOR,
      requestedAmount: extractedAmount > 0 ? extractedAmount : null,
      totalAmount:
        extractedAmount > 0
          ? scaledIntegerFromDecimal(extractedAmount.toFixed(2))
          : null,
      requesterId: user.id,
      projectId: project?.id ?? null,
      updatedAt: new Date(),
      auditLogs: {
        create: {
          id: randomUUID(),
          userId: user.id,
          action: "CREATED_VIA_BUNGLON_AI",
          notes: `Tiket diajukan melalui Bunglon Assistant (SKALA AI) oleh ${user.name}.`,
        },
      },
    },
  });

  try {
    await sendNotification({
      roleTarget: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
      title: `Tiket Baru ${ticketNumber} · Menunggu Persetujuan`,
      message: `${user.name} mengajukan ${ticketTitle}${extractedAmount > 0 ? ` (${formatRupiah(extractedAmount)})` : ""} melalui Bunglon Assistant.`,
      actionUrl: "/apps/approvals",
    });
  } catch (notifyErr) {
    console.warn("[Bunglon Ticket Notify] Notification skipped:", notifyErr);
  }

  const summaryParts = [
    ticketTitle,
    extractedAmount > 0 ? formatRupiah(extractedAmount) : null,
    project ? project.title : null,
  ].filter(Boolean);

  return {
    content: [
      `Siap **${user.name}**! Tiket pengajuan baru berhasil saya daftarkan ke sistem dengan nomor **\`${ticketNumber}\`** ✅`,
      "",
      `- **Judul:** ${ticketTitle}`,
      `- **Jenis / Prioritas:** ${ticketType} · ${priority}`,
      extractedAmount > 0
        ? `- **Estimasi Nilai:** ${formatRupiah(extractedAmount)}`
        : null,
      project ? `- **Proyek Terkait:** ${project.title} (\`${project.code}\`)` : null,
      `- **Status Saat Ini:** Menunggu persetujuan Direksi (\`PENDING_DIRECTOR\`)`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    result: {
      actionType: "CREATE_TICKET",
      title: "Tiket Pengajuan Berhasil Dibuat",
      referenceCode: ticketNumber,
      summary: summaryParts.join(" · "),
      targetUrl: "/apps/tickets",
    },
  };
}

export async function runBunglonAssistantTurn(input: {
  message: string;
  user: { id: string; name: string; role: string };
  projectId?: string | null;
  ticketId?: string | null;
  docType?: HermesDocType | null;
  docParams?: HermesDocParams | null;
  dataInput?: ErpDataInputPayload | null;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  customGatewayUrl?: string | null;
  customApiKey?: string | null;
  verificationBaseUrl: URL;
  isGroupContext?: boolean;
  groupChannelName?: string | null;
}): Promise<BunglonTurnResult> {
  const cleanedPrompt = input.message
    .replace(/^@(?:bunglon|skala|assistant|hermes|ai)\b[:,]?\s*/i, "")
    .trim();
  const promptForIntent = cleanedPrompt || input.message.trim();

  const recentUserHistory = (input.conversationHistory ?? [])
    .filter((turn) => turn.role === "user")
    .slice(-1)
    .map((turn) => turn.content)
    .join(" ");
  const queryContextText =
    extractQueryTokens(promptForIntent).length > 0
      ? promptForIntent
      : [promptForIntent, recentUserHistory].filter(Boolean).join(" ");

  const [erpContext, gatewayStatus] = await Promise.all([
    loadErpContextSummary(input.projectId, input.ticketId, queryContextText),
    checkHermesGatewayStatus(input.customGatewayUrl, input.customApiKey),
  ]);

  const dataActionType = detectDataInputActionType(
    promptForIntent,
    input.dataInput,
  );
  if (dataActionType) {
    const execResult = await executeErpDataInputAction({
      actionType: dataActionType,
      message: promptForIntent,
      projectId: input.projectId ?? input.dataInput?.projectId ?? null,
      dataInput: input.dataInput,
      user: input.user,
    });
    const thinkingSteps = buildThinkingSteps({
      intentType: "data_input",
      actionType: dataActionType,
      projectName: erpContext.selectedProject?.title ?? null,
      usedAiModel: false,
    });
    return {
      assistantContent: execResult.content,
      attachments: [],
      generatedDocument: null,
      dataActionResult: execResult.result,
      thinkingSteps,
      engineUsed: gatewayStatus.gatewayOnline
        ? "hermes-gateway"
        : "hermes-builtin-erp",
      gatewayStatus,
    };
  }

  const intent = detectDocumentIntent(promptForIntent, input.docType);
  if (intent.isDocumentRequest && intent.docType) {
    const generated = await generateHermesDocument({
      docType: intent.docType,
      prompt: promptForIntent,
      projectId: input.projectId,
      ticketId: input.ticketId,
      docParams: input.docParams,
      user: input.user,
      verificationBaseUrl: input.verificationBaseUrl,
      erpContext,
      gatewayStatus,
      detectedIntent: intent,
      customGatewayUrl: input.customGatewayUrl,
      customApiKey: input.customApiKey,
    });

    const generatedDocument = generated.document;
    const attachment: ChatAttachmentItem = {
      id: generatedDocument._id,
      title: `${generatedDocument.title} (${generatedDocument.documentNumber})`,
      kind: "DOCUMENT",
      docType: generatedDocument.docType,
      documentNumber: generatedDocument.documentNumber,
      url: `/api/chat/hermes/document/${generatedDocument._id}?format=html`,
      downloadUrl: `/api/chat/hermes/document/${generatedDocument._id}?format=pdf&download=1`,
      mimeType: "application/pdf",
      summary: generatedDocument.summary,
      documentId: generatedDocument._id,
    };

    const assistantContent = [
      `Siap **${input.user.name}**, dokumen **${generatedDocument.title}** sudah beres saya susun dengan nomor **\`${generatedDocument.documentNumber}\`** 📄`,
      generatedDocument.projectName
        ? `- **Proyek:** ${generatedDocument.projectName}`
        : null,
      generatedDocument.recipientName
        ? `- **Pihak / Tujuan:** ${generatedDocument.recipientName}`
        : null,
      generatedDocument.amount !== null
        ? `- **Nominal:** ${formatRupiah(generatedDocument.amount)}`
        : null,
      "",
      input.isGroupContext
        ? "Dokumennya langsung saya lampirkan di grup ini ya, silakan dicek atau dicetak!"
        : "Silakan buka pratinjau cetak A4 atau langsung kirim ke rekan/grup lewat tombol pada kartu di bawah.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const thinkingSteps = buildThinkingSteps({
      intentType: "document",
      docType: generatedDocument.docType,
      projectName: generatedDocument.projectName,
      usedAiModel: generated.engineUsed === "hermes-gateway",
    });

    return {
      assistantContent,
      attachments: [attachment],
      generatedDocument,
      dataActionResult: null,
      thinkingSteps,
      engineUsed: generated.engineUsed,
      gatewayStatus,
    };
  }

  const groupContextInstruction = input.isGroupContext
    ? `Konteks Grup Chat: Kamu baru saja dipanggil di kanal "${input.groupChannelName || "Grup Koordinasi"}" oleh ${input.user.name}. Ikutlah mengobrol dengan gaya bahasa alami seperti rekan kerja satu tim yang akrab, responsif, dan langsung menjawab pertanyaan atau mengirim ringkasan data ERP yang diminta.`
    : undefined;

  const gatewayReply = gatewayStatus.gatewayOnline
    ? await callHermesGateway({
        message: promptForIntent,
        erpContext,
        userName: input.user.name,
        userRole: input.user.role,
        conversationHistory: input.conversationHistory,
        customGatewayUrl: input.customGatewayUrl,
        customApiKey: input.customApiKey,
        systemInstructionExtra: groupContextInstruction,
      })
    : null;

  const engineUsed: "hermes-gateway" | "hermes-builtin-erp" = gatewayReply
    ? "hermes-gateway"
    : "hermes-builtin-erp";

  const assistantContent =
    gatewayReply ||
    buildBuiltinErpReply(promptForIntent, erpContext, gatewayStatus);

  const thinkingSteps = buildThinkingSteps({
    intentType: "chat",
    projectName: erpContext.selectedProject?.title ?? null,
    usedAiModel: Boolean(gatewayReply),
  });

  return {
    assistantContent,
    attachments: [],
    generatedDocument: null,
    dataActionResult: null,
    thinkingSteps,
    engineUsed,
    gatewayStatus,
  };
}
