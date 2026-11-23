"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Bot,
  Brain,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Forward,
  Hash,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  MessagesSquare,
  Minimize2,
  Minus,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { UserRole } from "@prisma/client";
import type {
  ChatAttachmentItem,
  ChatDataActionResult,
  ChatDataActionType,
  ChatRoomType,
  HermesDocType,
} from "@/models/chat";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface ChatUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  profilePhotoUrl: string | null;
  lastLoginAt: string | null;
  lastSeenAt?: string | null;
  isOnline?: boolean;
  typingInRoomId?: string | null;
}

export interface TypingUserDto {
  userId: string;
  userName: string;
  userRole: string;
}

export interface ChatRoomDto {
  id: string;
  type: ChatRoomType;
  roomKey: string;
  name: string;
  description: string | null;
  participantIds: string[];
  lastMessageText: string | null;
  lastMessageAt: string;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
}

export interface ProjectSummaryDto {
  id: string;
  code: string;
  name: string;
  title: string;
  kelompokTani: string;
  location: string | null;
  progress: number;
  paguFormatted: string;
}

export interface TicketSummaryDto {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  projectId: string | null;
}

export interface GeneratedDocDto {
  id: string;
  documentNumber: string;
  docType: HermesDocType;
  title: string;
  subtitle: string;
  projectId: string | null;
  projectName: string | null;
  recipientName: string | null;
  amount: number | null;
  summary: string;
  createdAt: string;
  previewUrl: string;
  downloadUrl: string;
}

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatarUrl: string | null;
  content: string;
  attachments: ChatAttachmentItem[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ChatBootstrapResponse {
  currentUser: {
    id: string;
    name: string;
    role: string;
    profilePhotoUrl: string | null;
  };
  users: ChatUserDto[];
  channels: ChatRoomDto[];
  directRooms: ChatRoomDto[];
  hermesRoom: ChatRoomDto;
  totalUnread: number;
  projects: ProjectSummaryDto[];
  tickets: TicketSummaryDto[];
  recentDocuments: GeneratedDocDto[];
}

interface ChatMessagesResponse {
  room: ChatRoomDto;
  messages: ChatMessageDto[];
  typingUsers?: TypingUserDto[];
}

interface PostMessageResponse {
  room: ChatRoomDto;
  message: ChatMessageDto;
  assistantMessage?: ChatMessageDto | null;
}

interface UploadAttachmentResponse {
  attachment: ChatAttachmentItem;
}

interface HermesStatusResponse {
  gatewayOnline: boolean;
  gatewayUrl: string;
  model: string | null;
  engineMode: "hermes-gateway" | "hermes-builtin-erp";
  detail: string;
  installCommands: string[];
}

interface HermesGenerateResponse {
  room: ChatRoomDto;
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
  generatedDocument: GeneratedDocDto | null;
  dataActionResult?: ChatDataActionResult | null;
  thinkingSteps?: string[];
  engineUsed: "hermes-gateway" | "hermes-builtin-erp";
}

type UploadKind = "BON" | "KWT" | "BKT" | "FTO" | "DRW";
type ActiveTab = "team" | "hermes";
type SelectedTarget =
  | { kind: "room"; roomId: string }
  | { kind: "user"; userId: string }
  | null;

interface FloatingChatWidgetProps {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: UserRole;
}

const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8642";
const STORAGE_GATEWAY_URL_KEY = "skala_hermes_gateway_url";
const STORAGE_API_KEY_KEY = "skala_hermes_api_key";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const DEFAULT_HERMES_INSTALL_COMMANDS = [
  "curl -fsSLO https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh",
  "less install.sh",
  "bash install.sh",
  "hermes config set API_SERVER_ENABLED true",
  "hermes gateway",
];

const ROLE_LABELS: Record<string, string> = {
  DIRECTOR: "Direktur",
  DEPUTY_DIRECTOR: "Wakil Direktur",
  DRAFTER: "Drafter",
  FINANCE: "Keuangan",
  LOGISTICS: "Koordinator Logistik",
  KOORDINATOR: "Koordinator Lapangan",
  FIELD_TEAM: "Tim Lapangan",
  MOVER: "Mover",
  ADMINISTRATIONS: "Administrasi",
  BUNGLON_AI: "SKALA Assistant",
  AI_ASSISTANT: "SKALA Assistant",
};

const BUNGLON_THINKING_MESSAGES = [
  "Bunglon lagi membaca pertanyaan Anda...",
  "Lagi mengecek data proyek, tiket, & stok di MongoDB...",
  "Sedang merangkai jawaban natural & menyiapkan lampiran...",
];

const DATA_ACTION_OPTIONS: ReadonlyArray<{
  value: ChatDataActionType;
  label: string;
}> = [
  { value: "DAILY_REPORT", label: "Laporan Harian & Progres Proyek" },
  { value: "CREATE_TICKET", label: "Tiket Pengajuan Material / Biaya" },
  { value: "CREATE_NOTE", label: "Catatan Kerja Baru" },
];

const UPLOAD_KIND_OPTIONS: ReadonlyArray<{
  value: UploadKind;
  label: string;
}> = [
  { value: "FTO", label: "Foto" },
  { value: "BON", label: "Bon" },
  { value: "KWT", label: "Kwitansi" },
  { value: "BKT", label: "Bukti Transfer" },
  { value: "DRW", label: "Gambar Kerja" },
];

const HERMES_DOC_TYPE_OPTIONS: ReadonlyArray<{
  value: HermesDocType;
  label: string;
  shortLabel: string;
  supportsAmount: boolean;
}> = [
  {
    value: "KWITANSI",
    label: "Kwitansi Pembayaran",
    shortLabel: "Kwitansi",
    supportsAmount: true,
  },
  {
    value: "LAMPIRAN_KEUANGAN",
    label: "Lampiran Bon / Reimbursement",
    shortLabel: "Lampiran Keuangan",
    supportsAmount: true,
  },
  {
    value: "SPK",
    label: "Surat Perintah Kerja (SPK)",
    shortLabel: "SPK",
    supportsAmount: true,
  },
  {
    value: "BAST",
    label: "Berita Acara Serah Terima (BAST)",
    shortLabel: "BAST",
    supportsAmount: false,
  },
  {
    value: "PO",
    label: "Purchase Order (PO)",
    shortLabel: "PO",
    supportsAmount: true,
  },
  {
    value: "DO",
    label: "Surat Jalan / Delivery Order (DO)",
    shortLabel: "Surat Jalan (DO)",
    supportsAmount: false,
  },
  {
    value: "LAPORAN_PROYEK",
    label: "Laporan Progres Proyek",
    shortLabel: "Laporan Proyek",
    supportsAmount: false,
  },
  {
    value: "SURAT_RESMI",
    label: "Surat / Memo Resmi",
    shortLabel: "Surat Resmi",
    supportsAmount: false,
  },
];

const HERMES_QUICK_PROMPTS: ReadonlyArray<{
  label: string;
  prompt: string;
  openDocForm?: HermesDocType;
  openDataForm?: ChatDataActionType;
}> = [
  {
    label: "Ringkas Proyek",
    prompt: "Bunglon, tolong ringkas progres proyek aktif dan tiket terbuka saat ini ya.",
  },
  {
    label: "Input Laporan",
    prompt: "",
    openDataForm: "DAILY_REPORT",
  },
  {
    label: "Ajukan Tiket",
    prompt: "",
    openDataForm: "CREATE_TICKET",
  },
  {
    label: "Kwitansi Cepat",
    prompt: "",
    openDocForm: "KWITANSI",
  },
  {
    label: "Lampiran Bon",
    prompt: "",
    openDocForm: "LAMPIRAN_KEUANGAN",
  },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errorObj =
      parsed && typeof parsed === "object"
        ? (parsed as { error?: unknown; message?: unknown })
        : null;
    const message =
      (typeof errorObj?.error === "string" && errorObj.error) ||
      (typeof errorObj?.message === "string" && errorObj.message) ||
      `Permintaan gagal (HTTP ${response.status}).`;
    throw new Error(message);
  }

  return parsed as T;
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) return "Anggota Tim";
  return ROLE_LABELS[role] ?? role;
}

function getDocTypeLabel(docType: string | null | undefined): string {
  if (!docType) return "Dokumen";
  const found = HERMES_DOC_TYPE_OPTIONS.find((item) => item.value === docType);
  return found?.shortLabel ?? docType.replace(/_/g, " ");
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "SP";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getJakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatWibTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const nowKey = getJakartaDateKey(new Date());
  const dateKey = getJakartaDateKey(date);

  const timePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (nowKey === dateKey) {
    return `${timePart} WIB`;
  }

  const dayPart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  }).format(date);
  return `${dayPart}, ${timePart} WIB`;
}

function formatShortRoomTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const nowKey = getJakartaDateKey(new Date());
  const dateKey = getJakartaDateKey(date);
  if (nowKey === dateKey) {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatLastSeen(
  lastSeenAt?: string | null,
  isOnline?: boolean,
): string {
  if (isOnline) return "Online sekarang";
  if (!lastSeenAt) return "Offline · Belum aktif";
  const date = new Date(lastSeenAt);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "Offline";

  const diffMs = Math.max(0, Date.now() - ms);
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2) return "Offline · Baru saja";
  if (diffMins < 60) return `Offline · ${diffMins} mnt lalu`;

  const diffHours = Math.floor(diffMins / 60);
  const nowKey = getJakartaDateKey(new Date());
  const seenKey = getJakartaDateKey(date);
  const timeStr = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (nowKey === seenKey) {
    if (diffHours <= 6) return `Offline · ${diffHours} jam lalu`;
    return `Offline · Hari ini ${timeStr}`;
  }

  const yesterdayDate = new Date(Date.now() - 86_400_000);
  if (getJakartaDateKey(yesterdayDate) === seenKey) {
    return `Offline · Kemarin ${timeStr}`;
  }

  const datePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  }).format(date);
  return `Offline · ${datePart}, ${timeStr}`;
}

function parseDataActionResult(
  metadata: Record<string, unknown> | null | undefined,
): ChatDataActionResult | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata.dataActionResult;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (
    typeof rec.title !== "string" ||
    typeof rec.referenceCode !== "string" ||
    typeof rec.summary !== "string" ||
    typeof rec.targetUrl !== "string"
  ) {
    return null;
  }
  return {
    actionType:
      rec.actionType === "DAILY_REPORT" ||
      rec.actionType === "CREATE_TICKET" ||
      rec.actionType === "CREATE_NOTE"
        ? rec.actionType
        : "CREATE_NOTE",
    title: rec.title,
    referenceCode: rec.referenceCode,
    summary: rec.summary,
    targetUrl: rec.targetUrl,
  };
}

function parseThinkingSteps(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = metadata.thinkingSteps;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFileSize(sizeBytes?: number | null): string | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generatedDocToAttachment(doc: GeneratedDocDto): ChatAttachmentItem {
  return {
    id: doc.id,
    title: doc.title,
    kind: "DOCUMENT",
    docType: doc.docType,
    documentNumber: doc.documentNumber,
    assetCode: null,
    url: doc.previewUrl,
    downloadUrl: doc.downloadUrl,
    mimeType: "application/pdf",
    sizeBytes: null,
    summary: doc.summary,
    documentId: doc.id,
  };
}

function resolveAttachmentUrls(attachment: ChatAttachmentItem): {
  previewUrl: string;
  downloadUrl: string;
} {
  const docFallbackPreview = attachment.documentId
    ? `/api/chat/hermes/document/${encodeURIComponent(attachment.documentId)}?format=html`
    : "";
  const docFallbackDownload = attachment.documentId
    ? `/api/chat/hermes/document/${encodeURIComponent(attachment.documentId)}?format=pdf&download=1`
    : "";

  const previewUrl = attachment.url || docFallbackPreview;
  const downloadUrl = attachment.downloadUrl || docFallbackDownload || previewUrl;
  return { previewUrl, downloadUrl };
}

function isImageAttachment(attachment: ChatAttachmentItem): boolean {
  if (attachment.kind === "IMAGE") return true;
  if (attachment.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(attachment.url);
}

function isHermesDocumentAttachment(attachment: ChatAttachmentItem): boolean {
  return (
    attachment.kind === "DOCUMENT" ||
    Boolean(attachment.documentNumber) ||
    Boolean(attachment.documentId)
  );
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderContentWithMentions(
  content: string,
  knownNames: string[],
  isOwnMessage: boolean,
) {
  if (!content) return null;
  const normalizedNames = Array.from(
    new Set(
      knownNames
        .map((n) => n.trim())
        .filter((n) => n.length >= 2),
    ),
  ).sort((a, b) => b.length - a.length);

  const nameAlternation = normalizedNames.map(escapeRegexLiteral).join("|");
  const patternBody = nameAlternation
    ? `(?:^|(?<=\\s))@(?:${nameAlternation}|bunglon|skala|semua|all|[a-zA-Z0-9_.-]{2,30})(?=$|[\\s.,!?;:)])`
    : `(?:^|(?<=\\s))@(?:bunglon|skala|semua|all|[a-zA-Z0-9_.-]{2,30})(?=$|[\\s.,!?;:)])`;
  const regex = new RegExp(`(${patternBody})`, "gi");
  const segments = content.split(regex);

  if (segments.length <= 1) return content;

  return segments.map((segment, index) => {
    if (index % 2 === 1 && segment.startsWith("@")) {
      return (
        <span
          key={index}
          className={cn(
            "inline-block rounded px-1 font-semibold",
            isOwnMessage
              ? "bg-amber-400/25 text-amber-200"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {segment}
        </span>
      );
    }
    return segment;
  });
}

interface DocumentForwardPopoverProps {
  attachment: ChatAttachmentItem;
  channels: ChatRoomDto[];
  users: ChatUserDto[];
  directRoomByUserId: Map<string, ChatRoomDto>;
  onForwardSuccess: (targetName: string) => void;
}

function DocumentForwardPopover({
  attachment,
  channels,
  users,
  directRoomByUserId,
  onForwardSuccess,
}: DocumentForwardPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sendingTargetKey, setSendingTargetKey] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredChannels = useMemo(() => {
    if (!normalizedQuery) return channels;
    return channels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(normalizedQuery) ||
        (channel.description ?? "").toLowerCase().includes(normalizedQuery),
    );
  }, [channels, normalizedQuery]);

  const filteredUsers = useMemo(() => {
    if (!normalizedQuery) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(normalizedQuery) ||
        getRoleLabel(user.role).toLowerCase().includes(normalizedQuery),
    );
  }, [users, normalizedQuery]);

  const handleForward = async (
    targetKey: string,
    targetLabel: string,
    payload: { roomId?: string; targetUserId?: string },
  ) => {
    setSendingTargetKey(targetKey);
    try {
      const docCode = attachment.documentNumber
        ? ` (${attachment.documentNumber})`
        : "";
      const prefix = isImageAttachment(attachment)
        ? "Mengirim foto"
        : isHermesDocumentAttachment(attachment)
          ? "Mengirim dokumen resmi Bunglon"
          : "Mengirim dokumen";
      await fetchJson<PostMessageResponse>("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          content: `${prefix}: ${attachment.title}${docCode}`,
          attachments: [attachment],
        }),
      });
      toast.success(`Lampiran dikirim ke ${targetLabel}`);
      setOpen(false);
      setQuery("");
      onForwardSuccess(targetLabel);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal mengirim lampiran ke rekan/grup.",
      );
    } finally {
      setSendingTargetKey(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="lightprimary"
          className="h-7 gap-1 px-2 text-[11px] font-semibold"
        >
          <Forward className="size-3" aria-hidden="true" />
          <span>Kirim ke Rekan/Grup</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 border border-border p-0 shadow-xl"
      >
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-bold text-foreground">
            Teruskan Lampiran ke Rekan / Kanal
          </p>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari kanal atau rekan tim..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {filteredChannels.length > 0 && (
            <div className="mb-1.5">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Kanal Divisi
              </p>
              {filteredChannels.map((channel) => {
                const targetKey = `channel:${channel.id}`;
                const isBusy = sendingTargetKey === targetKey;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    disabled={sendingTargetKey !== null}
                    onClick={() =>
                      void handleForward(targetKey, `#${channel.name}`, {
                        roomId: channel.id,
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#0f2b4d]/10 text-[#0f2b4d] dark:bg-sky-500/15 dark:text-sky-300">
                      <Hash className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {channel.name}
                    </span>
                    {isBusy && (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filteredUsers.length > 0 && (
            <div>
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Anggota Tim
              </p>
              {filteredUsers.map((user) => {
                const existingRoom = directRoomByUserId.get(user.id);
                const targetKey = `user:${user.id}`;
                const isBusy = sendingTargetKey === targetKey;
                return (
                  <button
                    key={user.id}
                    type="button"
                    disabled={sendingTargetKey !== null}
                    onClick={() =>
                      void handleForward(
                        targetKey,
                        user.name,
                        existingRoom
                          ? { roomId: existingRoom.id }
                          : { targetUserId: user.id },
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <Avatar className="size-6 shrink-0">
                      {user.profilePhotoUrl && (
                        <AvatarImage
                          src={user.profilePhotoUrl}
                          alt={user.name}
                        />
                      )}
                      <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {user.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {getRoleLabel(user.role)}
                      </p>
                    </div>
                    {isBusy && (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filteredChannels.length === 0 && filteredUsers.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Tidak ada penerima yang cocok.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ChatAttachmentCardProps {
  attachment: ChatAttachmentItem;
  isOwnMessage: boolean;
  allowForward?: boolean;
  channels: ChatRoomDto[];
  users: ChatUserDto[];
  directRoomByUserId: Map<string, ChatRoomDto>;
  onForwardSuccess: () => void;
}

function ChatAttachmentCard({
  attachment,
  isOwnMessage,
  allowForward = false,
  channels,
  users,
  directRoomByUserId,
  onForwardSuccess,
}: ChatAttachmentCardProps) {
  const { previewUrl, downloadUrl } = resolveAttachmentUrls(attachment);
  const isImage = isImageAttachment(attachment);
  const isHermesDoc = isHermesDocumentAttachment(attachment);
  const isSpreadsheet =
    attachment.mimeType?.includes("sheet") ||
    attachment.mimeType?.includes("excel") ||
    /\.xlsx?$/i.test(attachment.title);
  const sizeLabel = formatFileSize(attachment.sizeBytes);

  if (isImage) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border",
          isOwnMessage
            ? "border-white/20 bg-white/10 text-white"
            : "border-border bg-background text-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
          className="group relative block w-full overflow-hidden bg-black/5 text-left"
          title="Buka gambar di tab baru"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={attachment.title}
            className="max-h-44 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
          {attachment.assetCode && (
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-xs">
              {attachment.assetCode}
            </span>
          )}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
          <span className="min-w-0 truncate font-medium">
            {attachment.title}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={attachment.title}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline",
                isOwnMessage ? "text-amber-300" : "text-primary",
              )}
            >
              <Download className="size-3" aria-hidden="true" />
              <span>Unduh</span>
            </a>
            {allowForward && (
              <DocumentForwardPopover
                attachment={attachment}
                channels={channels}
                users={users}
                directRoomByUserId={directRoomByUserId}
                onForwardSuccess={onForwardSuccess}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-2.5 text-left shadow-xs",
        isOwnMessage
          ? "border-white/20 bg-white/10 text-white"
          : "border-border bg-card text-card-foreground",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            isOwnMessage
              ? "bg-amber-400/20 text-amber-200"
              : isHermesDoc
                ? "bg-[#0f2b4d]/10 text-[#0f2b4d] dark:bg-amber-500/15 dark:text-amber-300"
                : "bg-primary/10 text-primary",
          )}
        >
          {isSpreadsheet ? (
            <FileSpreadsheet className="size-4" aria-hidden="true" />
          ) : (
            <FileText className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {attachment.docType && (
              <Badge
                variant={isOwnMessage ? "warning" : "lightPrimary"}
                className="px-1.5 py-0 text-[10px]"
              >
                {getDocTypeLabel(attachment.docType)}
              </Badge>
            )}
            {attachment.documentNumber && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                  isOwnMessage
                    ? "bg-white/15 text-amber-200"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {attachment.documentNumber}
              </span>
            )}
            {attachment.assetCode && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                  isOwnMessage
                    ? "bg-white/15 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {attachment.assetCode}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-bold leading-snug">
            {attachment.title}
          </p>
          {attachment.summary && (
            <p
              className={cn(
                "mt-0.5 line-clamp-3 text-[11px] leading-relaxed",
                isOwnMessage ? "text-white/80" : "text-muted-foreground",
              )}
            >
              {attachment.summary}
            </p>
          )}
          {sizeLabel && (
            <p
              className={cn(
                "mt-0.5 text-[10px]",
                isOwnMessage ? "text-white/70" : "text-muted-foreground",
              )}
            >
              {sizeLabel}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {previewUrl && (
          <Button
            type="button"
            size="xs"
            variant={isOwnMessage ? "secondary" : "outline"}
            onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
            <span>{isHermesDoc ? "Buka & Cetak PDF" : "Buka / Cetak"}</span>
          </Button>
        )}
        {downloadUrl && (
          <Button
            type="button"
            size="xs"
            variant={isOwnMessage ? "ghost" : "ghostprimary"}
            onClick={() =>
              window.open(downloadUrl, "_blank", "noopener,noreferrer")
            }
            className={cn(
              "h-7 gap-1 px-2 text-[11px]",
              isOwnMessage && "text-white hover:bg-white/15 hover:text-white",
            )}
          >
            <Download className="size-3" aria-hidden="true" />
            <span>{isHermesDoc ? "Unduh" : "Unduh PDF"}</span>
          </Button>
        )}
        {allowForward && (
          <DocumentForwardPopover
            attachment={attachment}
            channels={channels}
            users={users}
            directRoomByUserId={directRoomByUserId}
            onForwardSuccess={onForwardSuccess}
          />
        )}
      </div>
    </div>
  );
}

function BunglonThinkingBubble({ statusText }: { statusText: string }) {
  return (
    <div className="flex justify-start gap-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-[#0f2b4d] text-white shadow-xs">
        <Brain className="size-3.5 animate-pulse" aria-hidden="true" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-emerald-500/25 bg-card px-3 py-2.5 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-foreground">
            Bunglon Assistant
          </span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground italic">{statusText}</p>
      </div>
    </div>
  );
}

function BunglonMessageExtras({
  thinkingSteps,
  dataActionResult,
}: {
  thinkingSteps: string[];
  dataActionResult: ChatDataActionResult | null;
}) {
  if (thinkingSteps.length === 0 && !dataActionResult) return null;

  return (
    <>
      {thinkingSteps.length > 0 && (
        <details className="group rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <Brain className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Proses berpikir Bunglon ({thinkingSteps.length} langkah)</span>
            </span>
            <ChevronDown
              className="size-3 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
            {thinkingSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </details>
      )}

      {dataActionResult && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <CheckCircle2
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="truncate text-xs font-bold text-foreground">
                {dataActionResult.title}
              </span>
            </div>
            <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
              {dataActionResult.referenceCode}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {dataActionResult.summary}
          </p>
          <div className="mt-2 flex justify-end">
            <Link
              href={dataActionResult.targetUrl}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <span>Buka Menu</span>
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

export default function FloatingChatWidget({
  currentUserId,
  currentUserName,
  currentUserRole,
}: FloatingChatWidgetProps) {
  const searchParams = useSearchParams();
  const openChatParam = searchParams.get("openChat");
  const lastHandledOpenChatRef = useRef<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("team");
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Team composer & upload state
  const [teamInput, setTeamInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    ChatAttachmentItem[]
  >([]);
  const [selectedMentions, setSelectedMentions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [dismissedMentionText, setDismissedMentionText] = useState<
    string | null
  >(null);
  const [sendingTeam, setSendingTeam] = useState(false);
  const [teamThinking, setTeamThinking] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadKind, setUploadKind] = useState<UploadKind>("DRW");
  const [uploadProjectId, setUploadProjectId] = useState<string>("NONE");
  const [attachPopoverOpen, setAttachPopoverOpen] = useState(false);
  const [hermesPickerOpen, setHermesPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const teamPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const teamTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Clear conversation & message deletion state
  const [clearTeamPopoverOpen, setClearTeamPopoverOpen] = useState(false);
  const [clearHermesPopoverOpen, setClearHermesPopoverOpen] = useState(false);
  const [clearingChatTarget, setClearingChatTarget] = useState<
    "team" | "hermes" | null
  >(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );

  // Bunglon Assistant (SKALA AI / Hermes compatible) state
  const [hermesInput, setHermesInput] = useState("");
  const [pendingHermesAttachments, setPendingHermesAttachments] = useState<
    ChatAttachmentItem[]
  >([]);
  const [pendingHermesPrompt, setPendingHermesPrompt] = useState<string | null>(
    null,
  );
  const [sendingHermes, setSendingHermes] = useState(false);
  const [showHermesSetup, setShowHermesSetup] = useState(false);
  const [showHermesDocForm, setShowHermesDocForm] = useState(false);
  const [showDataInputForm, setShowDataInputForm] = useState(false);
  const [gatewayUrlInput, setGatewayUrlInput] = useState(DEFAULT_GATEWAY_URL);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savedGatewayUrl, setSavedGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [savedApiKey, setSavedApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);
  const hermesPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const hermesDocInputRef = useRef<HTMLInputElement | null>(null);

  // Thinking & natural progressive typing reveal state
  const [thinkingTickIdx, setThinkingTickIdx] = useState(0);
  const [typingReveal, setTypingReveal] = useState<{
    messageId: string;
    fullText: string;
    shownLength: number;
  } | null>(null);

  // Quick ERP data input state
  const [dataActionType, setDataActionType] =
    useState<ChatDataActionType>("DAILY_REPORT");
  const [dataProjectId, setDataProjectId] = useState<string>("NONE");
  const [dataTitle, setDataTitle] = useState("");
  const [dataCategory, setDataCategory] = useState("MATERIAL");
  const [dataAmount, setDataAmount] = useState("");
  const [dataProgress, setDataProgress] = useState("");
  const [dataWorkersCount, setDataWorkersCount] = useState("");
  const [dataWeather, setDataWeather] = useState("Cerah");
  const [dataNotes, setDataNotes] = useState("");

  // Hermes quick document generator state
  const [docType, setDocType] = useState<HermesDocType>("KWITANSI");
  const [docProjectId, setDocProjectId] = useState<string>("NONE");
  const [docTicketId, setDocTicketId] = useState<string>("NONE");
  const [docRecipient, setDocRecipient] = useState("");
  const [docAmount, setDocAmount] = useState("");
  const [docDescription, setDocDescription] = useState("");

  const teamMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const hermesMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastTypingPingRef = useRef<{ roomId: string | null; at: number }>({
    roomId: null,
    at: 0,
  });

  // Hydrate Hermes Gateway settings safely from localStorage on client mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    let storedUrl = DEFAULT_GATEWAY_URL;
    let storedKey = "";
    try {
      storedUrl =
        window.localStorage.getItem(STORAGE_GATEWAY_URL_KEY)?.trim() ||
        DEFAULT_GATEWAY_URL;
      storedKey =
        window.localStorage.getItem(STORAGE_API_KEY_KEY)?.trim() || "";
    } catch {
      // Ignore storage access restrictions
    }
    Promise.resolve().then(() => {
      setGatewayUrlInput(storedUrl);
      setSavedGatewayUrl(storedUrl);
      setApiKeyInput(storedKey);
      setSavedApiKey(storedKey);
    });
  }, []);

  // Deep link handler: ?openChat=<roomId>
  useEffect(() => {
    if (!openChatParam) {
      lastHandledOpenChatRef.current = null;
      return;
    }
    if (lastHandledOpenChatRef.current === openChatParam) return;
    lastHandledOpenChatRef.current = openChatParam;

    Promise.resolve().then(() => {
      setIsOpen(true);
      setActiveTab("team");
      setSelectedTarget({ kind: "room", roomId: openChatParam });
    });
  }, [openChatParam]);

  const {
    data: bootstrap,
    error: bootstrapError,
    isLoading: bootstrapLoading,
    mutate: mutateBootstrap,
  } = useSWR<ChatBootstrapResponse>("/api/chat/bootstrap", fetchJson, {
    refreshInterval: isOpen ? 8_000 : 20_000,
    revalidateOnFocus: true,
  });

  const effectiveUserId = bootstrap?.currentUser.id || currentUserId;
  const effectiveUserName = bootstrap?.currentUser.name || currentUserName;
  const effectiveUserRole = bootstrap?.currentUser.role || currentUserRole;

  const teamMessagesKey =
    isOpen && activeTab === "team" && selectedTarget
      ? selectedTarget.kind === "room"
        ? `/api/chat/messages?roomId=${encodeURIComponent(selectedTarget.roomId)}`
        : `/api/chat/messages?targetUserId=${encodeURIComponent(selectedTarget.userId)}`
      : null;

  const {
    data: teamMessagesData,
    error: teamMessagesError,
    isLoading: teamMessagesLoading,
    mutate: mutateTeamMessages,
  } = useSWR<ChatMessagesResponse>(teamMessagesKey, fetchJson, {
    refreshInterval: 4_000,
    revalidateOnFocus: true,
    onSuccess: (data) => {
      if (selectedTarget?.kind === "user" && data.room?.id) {
        setSelectedTarget({ kind: "room", roomId: data.room.id });
        void mutateBootstrap();
        return;
      }
      const matchingRoom =
        bootstrap?.channels.find((room) => room.id === data.room?.id) ??
        bootstrap?.directRooms.find((room) => room.id === data.room?.id);
      if (matchingRoom && matchingRoom.unreadCount > 0) {
        void mutateBootstrap();
      }
    },
  });

  const hermesRoomId = bootstrap?.hermesRoom?.id ?? null;
  const hermesMessagesKey =
    isOpen && activeTab === "hermes" && hermesRoomId
      ? `/api/chat/messages?roomId=${encodeURIComponent(hermesRoomId)}`
      : null;

  const {
    data: hermesMessagesData,
    error: hermesMessagesError,
    isLoading: hermesMessagesLoading,
    mutate: mutateHermesMessages,
  } = useSWR<ChatMessagesResponse>(hermesMessagesKey, fetchJson, {
    refreshInterval: 4_000,
    revalidateOnFocus: true,
  });

  const hermesStatusUrl = `/api/chat/hermes/status?gatewayUrl=${encodeURIComponent(
    savedGatewayUrl || DEFAULT_GATEWAY_URL,
  )}`;

  const {
    data: hermesStatus,
    isValidating: hermesStatusValidating,
    mutate: mutateHermesStatus,
  } = useSWR<HermesStatusResponse>(
    isOpen ? hermesStatusUrl : null,
    fetchJson,
    {
      refreshInterval: isOpen && activeTab === "hermes" ? 30_000 : 0,
      revalidateOnFocus: false,
    },
  );

  const startTypingReveal = useCallback((msg?: ChatMessageDto | null) => {
    if (!msg || !msg.id || !msg.content) return;
    setTypingReveal({
      messageId: msg.id,
      fullText: msg.content,
      shownLength: Math.min(msg.content.length, 4),
    });
  }, []);

  const pingPresence = useCallback(
    async (roomId: string | null, isTyping: boolean) => {
      try {
        await fetch("/api/chat/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, isTyping }),
        });
      } catch {
        // Ignore transient presence heartbeat errors
      }
    },
    [],
  );

  // Keep user online presence alive via periodic heartbeat
  useEffect(() => {
    void pingPresence(null, false);
    const interval = window.setInterval(() => {
      void pingPresence(null, false);
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [pingPresence]);

  // Cycle Bunglon thinking narration while processing
  const isBunglonThinking = sendingHermes || teamThinking;
  useEffect(() => {
    if (!isBunglonThinking) return;
    const timer = window.setInterval(() => {
      setThinkingTickIdx((prev) => prev + 1);
    }, 950);
    return () => window.clearInterval(timer);
  }, [isBunglonThinking]);

  // Progressive natural typing animation for Bunglon responses
  const activeRevealId = typingReveal?.messageId ?? null;
  const activeRevealDone = typingReveal
    ? typingReveal.shownLength >= typingReveal.fullText.length
    : true;
  useEffect(() => {
    if (!activeRevealId || activeRevealDone) return;
    const timer = window.setInterval(() => {
      setTypingReveal((prev) => {
        if (!prev || prev.messageId !== activeRevealId) return null;
        if (prev.shownLength >= prev.fullText.length) return null;
        const step =
          prev.fullText.length > 520
            ? 8
            : prev.fullText.length > 220
              ? 5
              : 3;
        const nextLen = Math.min(prev.fullText.length, prev.shownLength + step);
        if (nextLen >= prev.fullText.length) return null;
        return { ...prev, shownLength: nextLen };
      });
    }, 20);
    return () => window.clearInterval(timer);
  }, [activeRevealId, activeRevealDone]);

  // Auto-scroll team messages
  const teamMessageCount = teamMessagesData?.messages.length ?? 0;
  const lastTeamMessageId =
    teamMessagesData?.messages[teamMessageCount - 1]?.id ?? null;
  useEffect(() => {
    if (!isOpen || activeTab !== "team" || !selectedTarget) return;
    teamMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    isOpen,
    activeTab,
    selectedTarget,
    teamMessageCount,
    lastTeamMessageId,
    teamThinking,
    typingReveal?.shownLength,
  ]);

  // Auto-scroll Bunglon / Hermes messages
  const hermesMessageCount = hermesMessagesData?.messages.length ?? 0;
  const lastHermesMessageId =
    hermesMessagesData?.messages[hermesMessageCount - 1]?.id ?? null;
  useEffect(() => {
    if (!isOpen || activeTab !== "hermes") return;
    hermesMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    isOpen,
    activeTab,
    hermesMessageCount,
    lastHermesMessageId,
    sendingHermes,
    typingReveal?.shownLength,
  ]);

  const directRoomByUserId = useMemo(() => {
    const map = new Map<string, ChatRoomDto>();
    if (!bootstrap) return map;
    for (const room of bootstrap.directRooms) {
      const otherId = room.participantIds.find(
        (participantId) => participantId !== effectiveUserId,
      );
      if (otherId) {
        map.set(otherId, room);
      }
    }
    return map;
  }, [bootstrap, effectiveUserId]);

  const teamUsers = useMemo(() => {
    if (!bootstrap) return [];
    const others = bootstrap.users.filter((user) => user.id !== effectiveUserId);
    return [...others].sort((a, b) => {
      const roomA = directRoomByUserId.get(a.id);
      const roomB = directRoomByUserId.get(b.id);
      const unreadDiff = (roomB?.unreadCount ?? 0) - (roomA?.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      const timeA = roomA ? Date.parse(roomA.lastMessageAt) : 0;
      const timeB = roomB ? Date.parse(roomB.lastMessageAt) : 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name, "id");
    });
  }, [bootstrap, effectiveUserId, directRoomByUserId]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredChannels = useMemo(() => {
    const list = bootstrap?.channels ?? [];
    if (!normalizedSearch) return list;
    return list.filter(
      (channel) =>
        channel.name.toLowerCase().includes(normalizedSearch) ||
        (channel.description ?? "").toLowerCase().includes(normalizedSearch),
    );
  }, [bootstrap?.channels, normalizedSearch]);

  const filteredUsers = useMemo(() => {
    if (!normalizedSearch) return teamUsers;
    return teamUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        getRoleLabel(user.role).toLowerCase().includes(normalizedSearch),
    );
  }, [teamUsers, normalizedSearch]);

  const activeTeamRoom = useMemo(() => {
    if (teamMessagesData?.room) return teamMessagesData.room;
    if (!bootstrap || !selectedTarget) return null;
    if (selectedTarget.kind === "room") {
      return (
        bootstrap.channels.find((room) => room.id === selectedTarget.roomId) ??
        bootstrap.directRooms.find((room) => room.id === selectedTarget.roomId) ??
        null
      );
    }
    return directRoomByUserId.get(selectedTarget.userId) ?? null;
  }, [teamMessagesData, bootstrap, selectedTarget, directRoomByUserId]);

  const activeTeamRoomId =
    activeTeamRoom?.id ??
    (selectedTarget?.kind === "room" ? selectedTarget.roomId : null);

  useEffect(() => {
    if (!isOpen || activeTab !== "team" || !activeTeamRoomId) return;
    const isTyping = teamInput.trim().length > 0;
    const now = Date.now();
    if (!isTyping) {
      if (lastTypingPingRef.current.roomId) {
        lastTypingPingRef.current = { roomId: null, at: 0 };
        void pingPresence(null, false);
      }
      return;
    }

    if (
      lastTypingPingRef.current.roomId !== activeTeamRoomId ||
      now - lastTypingPingRef.current.at > 4_000
    ) {
      lastTypingPingRef.current = { roomId: activeTeamRoomId, at: now };
      void pingPresence(activeTeamRoomId, true);
    }

    const idleTimer = window.setTimeout(() => {
      lastTypingPingRef.current = { roomId: null, at: 0 };
      void pingPresence(null, false);
    }, 4_000);

    return () => window.clearTimeout(idleTimer);
  }, [isOpen, activeTab, activeTeamRoomId, teamInput, pingPresence]);

  const activeDirectPartner = useMemo(() => {
    if (!bootstrap || !selectedTarget) return null;
    if (selectedTarget.kind === "user") {
      return bootstrap.users.find((u) => u.id === selectedTarget.userId) ?? null;
    }
    if (activeTeamRoom?.type === "DIRECT") {
      const otherId = activeTeamRoom.participantIds.find(
        (id) => id !== effectiveUserId,
      );
      if (otherId) {
        return bootstrap.users.find((u) => u.id === otherId) ?? null;
      }
    }
    return null;
  }, [bootstrap, selectedTarget, activeTeamRoom, effectiveUserId]);

  const totalUnread = bootstrap?.totalUnread ?? 0;
  const gatewayOnline = hermesStatus?.gatewayOnline ?? false;
  const isGeminiGateway = Boolean(
    gatewayOnline &&
      hermesStatus?.gatewayUrl?.includes("generativelanguage.googleapis.com"),
  );
  const cliInstallCommands =
    hermesStatus?.installCommands?.length
      ? hermesStatus.installCommands
      : DEFAULT_HERMES_INSTALL_COMMANDS;

  const selectedDocMeta = useMemo(
    () =>
      HERMES_DOC_TYPE_OPTIONS.find((item) => item.value === docType) ??
      HERMES_DOC_TYPE_OPTIONS[0],
    [docType],
  );

  const handleSelectChannel = (channel: ChatRoomDto) => {
    setSelectedTarget({ kind: "room", roomId: channel.id });
  };

  const handleSelectUser = (user: ChatUserDto) => {
    const existingRoom = directRoomByUserId.get(user.id);
    if (existingRoom) {
      setSelectedTarget({ kind: "room", roomId: existingRoom.id });
    } else {
      setSelectedTarget({ kind: "user", userId: user.id });
    }
  };

  const knownMentionNames = useMemo(() => {
    const names = (bootstrap?.users ?? []).map((u) => u.name);
    if (effectiveUserName) names.push(effectiveUserName);
    return names;
  }, [bootstrap?.users, effectiveUserName]);

  const activeMentionMatch = useMemo(() => {
    const match = teamInput.match(/(?:^|\s)@([a-zA-Z0-9_.\-\s]{0,28})$/);
    if (!match) return null;
    const rawToken = `@${match[1]}`;
    const query = match[1].toLowerCase().trimStart();
    const startIndex = teamInput.length - rawToken.length;
    return {
      rawToken,
      query,
      startIndex,
    };
  }, [teamInput]);

  type MentionCandidate =
    | {
        kind: "assistant";
        key: string;
        label: string;
        subtitle: string;
        insertText: string;
      }
    | {
        kind: "all";
        key: string;
        label: string;
        subtitle: string;
        insertText: string;
      }
    | {
        kind: "user";
        key: string;
        user: ChatUserDto;
        label: string;
        subtitle: string;
        insertText: string;
      };

  const mentionCandidates = useMemo((): MentionCandidate[] => {
    if (!activeMentionMatch) return [];
    const q = activeMentionMatch.query;
    const isChannel = activeTeamRoom?.type === "CHANNEL";
    const candidates: MentionCandidate[] = [];

    if (
      !q ||
      "bunglon assistant skala ai".includes(q) ||
      "bunglon".startsWith(q)
    ) {
      candidates.push({
        kind: "assistant",
        key: "assistant:bunglon",
        label: "Bunglon Assistant",
        subtitle: "SKALA AI · Asisten ERP, Input Data & Dokumen",
        insertText: "@bunglon ",
      });
    }

    if (
      isChannel &&
      (!q || "semua all everyone grup".includes(q) || "semua".startsWith(q))
    ) {
      candidates.push({
        kind: "all",
        key: "group:semua",
        label: "semua",
        subtitle: `Tag semua anggota di ${activeTeamRoom?.name ?? "grup"}`,
        insertText: "@semua ",
      });
    }

    for (const user of teamUsers) {
      const nameLower = user.name.toLowerCase();
      const roleLower = getRoleLabel(user.role).toLowerCase();
      if (!q || nameLower.includes(q) || roleLower.includes(q)) {
        candidates.push({
          kind: "user",
          key: `user:${user.id}`,
          user,
          label: user.name,
          subtitle: getRoleLabel(user.role),
          insertText: `@${user.name} `,
        });
      }
    }

    return candidates.slice(0, 8);
  }, [activeMentionMatch, activeTeamRoom, teamUsers]);

  const isMentionMenuOpen = Boolean(
    activeMentionMatch &&
      mentionCandidates.length > 0 &&
      dismissedMentionText !== activeMentionMatch.rawToken,
  );

  const handleSelectMentionCandidate = useCallback(
    (candidate: MentionCandidate) => {
      if (!activeMentionMatch) return;
      const prefix = teamInput.slice(0, activeMentionMatch.startIndex);
      setTeamInput(`${prefix}${candidate.insertText}`);
      setDismissedMentionText(null);
      setMentionActiveIndex(0);

      if (candidate.kind === "user") {
        setSelectedMentions((prev) =>
          prev.some((item) => item.id === candidate.user.id)
            ? prev
            : [...prev, { id: candidate.user.id, name: candidate.user.name }],
        );
      }
    },
    [activeMentionMatch, teamInput],
  );

  const uploadFilesToChat = useCallback(
    async (
      fileList: FileList | File[],
      options: { target: "team" | "hermes"; forcedKind?: UploadKind },
    ) => {
      const files = Array.from(fileList).slice(0, 5);
      if (files.length === 0) return;

      const validFiles: File[] = [];
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`Ukuran "${file.name}" melebihi batas maksimal 10 MB.`);
          continue;
        }
        if (file.size < 1) continue;
        validFiles.push(file);
      }
      if (validFiles.length === 0) return;

      setUploadingFile(true);
      try {
        const uploadedItems: ChatAttachmentItem[] = [];
        const selectedProjId =
          options.target === "hermes" ? docProjectId : uploadProjectId;

        for (const file of validFiles) {
          const isImageFile =
            file.type.startsWith("image/") ||
            /\.(jpg|jpeg|png|webp)$/i.test(file.name);
          const resolvedKind: UploadKind = options.forcedKind
            ? options.forcedKind
            : isImageFile
              ? "FTO"
              : uploadKind === "FTO"
                ? "DRW"
                : uploadKind;

          const formData = new FormData();
          formData.append("file", file);
          formData.append("kind", resolvedKind);
          if (selectedProjId && selectedProjId !== "NONE") {
            formData.append("projectId", selectedProjId);
          }

          const result = await fetchJson<UploadAttachmentResponse>(
            "/api/chat/upload",
            {
              method: "POST",
              body: formData,
            },
          );
          uploadedItems.push(result.attachment);
        }

        if (uploadedItems.length > 0) {
          if (options.target === "hermes") {
            setPendingHermesAttachments((prev) => [...prev, ...uploadedItems]);
          } else {
            setPendingAttachments((prev) => [...prev, ...uploadedItems]);
          }
          setAttachPopoverOpen(false);
          toast.success(
            uploadedItems.length === 1
              ? `Lampiran "${uploadedItems[0].title}" siap dikirim`
              : `${uploadedItems.length} lampiran siap dikirim`,
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Gagal mengunggah lampiran.",
        );
      } finally {
        setUploadingFile(false);
      }
    },
    [docProjectId, uploadKind, uploadProjectId],
  );

  const handleUploadFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
    options: { target: "team" | "hermes"; forcedKind?: UploadKind },
  ) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) return;
    await uploadFilesToChat(files, options);
  };

  const handlePasteAttachment = (
    event: ClipboardEvent<HTMLTextAreaElement>,
    target: "team" | "hermes",
  ) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const pastedImages: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) pastedImages.push(file);
      }
    }
    if (pastedImages.length > 0) {
      event.preventDefault();
      void uploadFilesToChat(pastedImages, { target, forcedKind: "FTO" });
    }
  };

  const handleAttachHermesDoc = (doc: GeneratedDocDto) => {
    const item = generatedDocToAttachment(doc);
    setPendingAttachments((prev) => {
      if (prev.some((existing) => existing.id === item.id)) {
        return prev;
      }
      return [...prev, item];
    });
    setHermesPickerOpen(false);
    toast.success(`Dokumen ${doc.documentNumber} dilampirkan`);
  };

  const handleSendTeamMessage = useCallback(async () => {
    if (!selectedTarget || sendingTeam) return;
    const trimmed = teamInput.trim();
    if (!trimmed && pendingAttachments.length === 0) return;

    const finalContent =
      trimmed ||
      `Melampirkan ${pendingAttachments.map((att) => att.title).join(", ")}`;
    const mentionsBunglon =
      /@(?:bunglon|skala|assistant|ai)\b/i.test(finalContent);
    const activeMentionedIds = selectedMentions
      .filter((item) =>
        finalContent.toLowerCase().includes(`@${item.name.toLowerCase()}`),
      )
      .map((item) => item.id);

    setSendingTeam(true);
    if (mentionsBunglon) {
      setThinkingTickIdx(0);
      setTeamThinking(true);
    }
    lastTypingPingRef.current = { roomId: null, at: 0 };

    try {
      const payload =
        selectedTarget.kind === "room"
          ? {
              roomId: selectedTarget.roomId,
              content: finalContent,
              attachments: pendingAttachments,
              mentionedUserIds: activeMentionedIds,
              invokeAssistant: mentionsBunglon,
              projectId:
                uploadProjectId && uploadProjectId !== "NONE"
                  ? uploadProjectId
                  : undefined,
              customGatewayUrl: savedGatewayUrl || undefined,
              customApiKey: savedApiKey || undefined,
            }
          : {
              targetUserId: selectedTarget.userId,
              content: finalContent,
              attachments: pendingAttachments,
              mentionedUserIds: activeMentionedIds,
              invokeAssistant: mentionsBunglon,
              projectId:
                uploadProjectId && uploadProjectId !== "NONE"
                  ? uploadProjectId
                  : undefined,
              customGatewayUrl: savedGatewayUrl || undefined,
              customApiKey: savedApiKey || undefined,
            };

      const result = await fetchJson<PostMessageResponse>("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setTeamInput("");
      setPendingAttachments([]);
      setSelectedMentions([]);
      setDismissedMentionText(null);
      if (selectedTarget.kind === "user" && result.room?.id) {
        setSelectedTarget({ kind: "room", roomId: result.room.id });
      }
      await Promise.all([mutateTeamMessages(), mutateBootstrap()]);
      if (result.assistantMessage) {
        startTypingReveal(result.assistantMessage);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengirim pesan.",
      );
    } finally {
      setTeamThinking(false);
      setSendingTeam(false);
    }
  }, [
    selectedTarget,
    sendingTeam,
    teamInput,
    pendingAttachments,
    selectedMentions,
    uploadProjectId,
    savedGatewayUrl,
    savedApiKey,
    mutateTeamMessages,
    mutateBootstrap,
    startTypingReveal,
  ]);

  const handleTeamTextareaKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (isMentionMenuOpen && mentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionActiveIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionActiveIndex(
          (prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length,
        );
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        const candidate =
          mentionCandidates[mentionActiveIndex] ?? mentionCandidates[0];
        if (candidate) {
          handleSelectMentionCandidate(candidate);
        }
        return;
      }
      if (event.key === "Escape" && activeMentionMatch) {
        event.preventDefault();
        setDismissedMentionText(activeMentionMatch.rawToken);
        return;
      }
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSendTeamMessage();
    }
  };

  const handleClearConversation = async (target: "team" | "hermes") => {
    if (clearingChatTarget) return;

    if (target === "team") {
      if (!activeTeamRoomId) {
        setClearTeamPopoverOpen(false);
        setTeamInput("");
        setPendingAttachments([]);
        toast.info("Belum ada riwayat pesan di ruang ini.");
        return;
      }
      setClearingChatTarget("team");
      try {
        await fetchJson<{ ok: boolean; deletedCount: number }>(
          `/api/chat/messages?roomId=${encodeURIComponent(activeTeamRoomId)}`,
          { method: "DELETE" },
        );
        setClearTeamPopoverOpen(false);
        setTypingReveal(null);
        await Promise.all([mutateTeamMessages(), mutateBootstrap()]);
        toast.success("Obrolan di ruang ini berhasil dihapus.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Gagal menghapus obrolan.",
        );
      } finally {
        setClearingChatTarget(null);
      }
      return;
    }

    setClearingChatTarget("hermes");
    try {
      await fetchJson<{ ok: boolean; deletedCount: number }>(
        "/api/chat/messages?mode=hermes",
        { method: "DELETE" },
      );
      setClearHermesPopoverOpen(false);
      setTypingReveal(null);
      await Promise.all([mutateHermesMessages(), mutateBootstrap()]);
      toast.success("Riwayat obrolan Bunglon AI berhasil dihapus.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menghapus riwayat obrolan Bunglon AI.",
      );
    } finally {
      setClearingChatTarget(null);
    }
  };

  const handleDeleteSingleMessage = async (
    messageId: string,
    target: "team" | "hermes",
  ) => {
    if (deletingMessageId) return;
    setDeletingMessageId(messageId);
    try {
      const url =
        target === "hermes"
          ? `/api/chat/messages?mode=hermes&messageId=${encodeURIComponent(messageId)}`
          : `/api/chat/messages?roomId=${encodeURIComponent(activeTeamRoomId ?? "")}&messageId=${encodeURIComponent(messageId)}`;
      await fetchJson<{ ok: boolean }>(url, { method: "DELETE" });
      if (target === "hermes") {
        await Promise.all([mutateHermesMessages(), mutateBootstrap()]);
      } else {
        await Promise.all([mutateTeamMessages(), mutateBootstrap()]);
      }
      toast.success("Pesan dihapus");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus pesan.",
      );
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleSaveAndTestGateway = async () => {
    const cleanedUrl = gatewayUrlInput.trim() || DEFAULT_GATEWAY_URL;
    const cleanedKey = apiKeyInput.trim();

    try {
      window.localStorage.setItem(STORAGE_GATEWAY_URL_KEY, cleanedUrl);
      if (cleanedKey) {
        window.localStorage.setItem(STORAGE_API_KEY_KEY, cleanedKey);
      } else {
        window.localStorage.removeItem(STORAGE_API_KEY_KEY);
      }
    } catch {
      // Ignore storage error
    }

    setSavedGatewayUrl(cleanedUrl);
    setSavedApiKey(cleanedKey);
    setTestingGateway(true);

    try {
      const headers: Record<string, string> = {};
      if (cleanedKey) {
        headers["x-hermes-api-key"] = cleanedKey;
      }
      const status = await fetchJson<HermesStatusResponse>(
        `/api/chat/hermes/status?gatewayUrl=${encodeURIComponent(cleanedUrl)}`,
        { headers },
      );
      await mutateHermesStatus(status, false);
      if (status.gatewayOnline) {
        const isGemini = status.gatewayUrl.includes(
          "generativelanguage.googleapis.com",
        );
        toast.success(
          isGemini
            ? `Terhubung ke Gemini API (${status.model ?? "Aktif"})`
            : `Terhubung ke Hermes Gateway (${status.model ?? "Aktif"})`,
        );
      } else {
        toast.info(
          "Gateway CLI lokal & Gemini API belum aktif — Built-in Hermes ERP Engine siap digunakan.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memeriksa status Hermes Gateway.",
      );
    } finally {
      setTestingGateway(false);
    }
  };

  const handleCopyInstallCommands = async () => {
    const text = cliInstallCommands.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCli(true);
      toast.success("Perintah instalasi Hermes CLI disalin");
      window.setTimeout(() => setCopiedCli(false), 2000);
    } catch {
      toast.error("Gagal menyalin ke clipboard.");
    }
  };

  const handleSendHermesPrompt = async (customMessage?: string) => {
    if (sendingHermes) return;
    const rawContent = (customMessage ?? hermesInput).trim();
    const attachmentsToSend = customMessage ? [] : pendingHermesAttachments;
    if (!rawContent && attachmentsToSend.length === 0) return;

    const content =
      rawContent ||
      `Saya melampirkan ${attachmentsToSend.map((att) => att.title).join(", ")}. Tolong bantu cek ya.`;

    if (!customMessage) {
      setHermesInput("");
      setPendingHermesAttachments([]);
    }
    setPendingHermesPrompt(content);
    setThinkingTickIdx(0);
    setSendingHermes(true);
    try {
      const result = await fetchJson<HermesGenerateResponse>(
        "/api/chat/hermes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            attachments: attachmentsToSend,
            projectId:
              docProjectId && docProjectId !== "NONE" ? docProjectId : undefined,
            ticketId:
              docTicketId && docTicketId !== "NONE" ? docTicketId : undefined,
            customGatewayUrl: savedGatewayUrl || undefined,
            customApiKey: savedApiKey || undefined,
          }),
        },
      );

      await Promise.all([mutateHermesMessages(), mutateBootstrap()]);
      startTypingReveal(result.assistantMessage);
      if (result.generatedDocument) {
        toast.success(
          `Dokumen ${result.generatedDocument.documentNumber} berhasil dibuat`,
        );
      } else if (result.dataActionResult) {
        toast.success(`${result.dataActionResult.title} (${result.dataActionResult.referenceCode})`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Bunglon Assistant gagal memproses permintaan.",
      );
    } finally {
      setPendingHermesPrompt(null);
      setSendingHermes(false);
    }
  };

  const handleSubmitDataInput = async () => {
    if (sendingHermes) return;

    const projectId =
      dataProjectId && dataProjectId !== "NONE" ? dataProjectId : undefined;
    const trimmedTitle = dataTitle.trim();
    const trimmedNotes = dataNotes.trim();
    const numericAmount = dataAmount
      ? Number(dataAmount.replace(/[^0-9.]/g, ""))
      : undefined;
    const validAmount =
      numericAmount !== undefined &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0
        ? numericAmount
        : undefined;
    const numericProgress =
      dataProgress.trim() !== "" ? Number(dataProgress) : undefined;
    const validProgress =
      numericProgress !== undefined && Number.isFinite(numericProgress)
        ? Math.max(0, Math.min(100, numericProgress))
        : undefined;
    const numericWorkers =
      dataWorkersCount.trim() !== "" ? Number(dataWorkersCount) : undefined;
    const validWorkers =
      numericWorkers !== undefined && Number.isFinite(numericWorkers)
        ? Math.max(0, Math.round(numericWorkers))
        : undefined;

    if (dataActionType === "DAILY_REPORT" && !projectId) {
      toast.error("Pilih proyek terlebih dahulu untuk Laporan Harian.");
      return;
    }
    if (dataActionType === "CREATE_TICKET" && trimmedTitle.length < 3) {
      toast.error("Isi judul/keperluan tiket minimal 3 karakter.");
      return;
    }
    if (dataActionType === "CREATE_NOTE" && (trimmedNotes || trimmedTitle).length < 2) {
      toast.error("Isi catatan kerja terlebih dahulu.");
      return;
    }

    const actionMeta =
      DATA_ACTION_OPTIONS.find((item) => item.value === dataActionType)?.label ??
      dataActionType;
    const promptSummary =
      dataActionType === "DAILY_REPORT"
        ? `Input laporan harian (${validProgress ?? "-"}%, cuaca ${dataWeather}${trimmedNotes ? `: ${trimmedNotes}` : ""})`
        : dataActionType === "CREATE_TICKET"
          ? `Ajukan tiket ${dataCategory}: ${trimmedTitle}${validAmount ? ` (${formatRupiah(validAmount)})` : ""}`
          : `Simpan catatan: ${trimmedNotes || trimmedTitle}`;

    setPendingHermesPrompt(promptSummary);
    setThinkingTickIdx(0);
    setSendingHermes(true);
    try {
      const result = await fetchJson<HermesGenerateResponse>(
        "/api/chat/hermes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: promptSummary,
            projectId,
            dataInput: {
              actionType: dataActionType,
              projectId,
              title: trimmedTitle || undefined,
              category: dataActionType === "CREATE_TICKET" ? dataCategory : undefined,
              amount: validAmount,
              progress: validProgress,
              workersCount: validWorkers,
              weather: dataActionType === "DAILY_REPORT" ? dataWeather : undefined,
              notes: trimmedNotes || undefined,
            },
            customGatewayUrl: savedGatewayUrl || undefined,
            customApiKey: savedApiKey || undefined,
          }),
        },
      );

      setDataTitle("");
      setDataAmount("");
      setDataProgress("");
      setDataWorkersCount("");
      setDataNotes("");
      setShowDataInputForm(false);
      await Promise.all([mutateHermesMessages(), mutateBootstrap()]);
      startTypingReveal(result.assistantMessage);
      toast.success(
        result.dataActionResult
          ? `${result.dataActionResult.title} (${result.dataActionResult.referenceCode})`
          : `${actionMeta} diproses oleh Bunglon Assistant`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menginput data ERP lewat Bunglon Assistant.",
      );
    } finally {
      setPendingHermesPrompt(null);
      setSendingHermes(false);
    }
  };

  const handleCreateHermesDocument = async () => {
    if (sendingHermes) return;
    const trimmedDesc = docDescription.trim();
    const trimmedRecipient = docRecipient.trim();
    const numericAmount = docAmount
      ? Number(docAmount.replace(/[^0-9.]/g, ""))
      : undefined;
    const validAmount =
      numericAmount !== undefined &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0
        ? numericAmount
        : undefined;

    if (!trimmedDesc && !trimmedRecipient) {
      toast.error("Isi keterangan atau nama penerima dokumen terlebih dahulu.");
      return;
    }

    const docLabel = selectedDocMeta.label;
    const amountText = validAmount ? ` senilai ${formatRupiah(validAmount)}` : "";
    const recipientText = trimmedRecipient
      ? ` untuk ${trimmedRecipient}`
      : "";
    const messageParts = [
      `Buatkan dokumen ${docLabel}${recipientText}${amountText}.`,
      trimmedDesc ? `Rincian: ${trimmedDesc}` : "",
    ].filter(Boolean);
    const composedPrompt = messageParts.join(" ");

    setPendingHermesPrompt(composedPrompt);
    setThinkingTickIdx(0);
    setSendingHermes(true);
    try {
      const result = await fetchJson<HermesGenerateResponse>(
        "/api/chat/hermes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: composedPrompt,
            projectId:
              docProjectId && docProjectId !== "NONE" ? docProjectId : undefined,
            ticketId:
              docTicketId && docTicketId !== "NONE" ? docTicketId : undefined,
            docType,
            docParams: {
              recipientName: trimmedRecipient || undefined,
              amount: validAmount,
              purpose: trimmedDesc || undefined,
              description: trimmedDesc || undefined,
            },
            customGatewayUrl: savedGatewayUrl || undefined,
            customApiKey: savedApiKey || undefined,
          }),
        },
      );

      setDocRecipient("");
      setDocAmount("");
      setDocDescription("");
      setShowHermesDocForm(false);
      await Promise.all([mutateHermesMessages(), mutateBootstrap()]);
      startTypingReveal(result.assistantMessage);
      toast.success(
        result.generatedDocument
          ? `Dokumen ${result.generatedDocument.documentNumber} berhasil dibuat`
          : `${docLabel} berhasil dibuat oleh Bunglon AI`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal membuat dokumen Bunglon Assistant.",
      );
    } finally {
      setPendingHermesPrompt(null);
      setSendingHermes(false);
    }
  };

  const handleHermesTextareaKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSendHermesPrompt();
    }
  };

  const renderTeamListPane = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border bg-muted/25 p-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cari anggota tim atau kanal..."
            className="h-8 bg-background pl-8 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-3">
        {bootstrapLoading && !bootstrap ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>Memuat percakapan tim...</span>
          </div>
        ) : bootstrapError && !bootstrap ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-xs text-destructive">
            <p>Gagal memuat daftar chat tim.</p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void mutateBootstrap()}
              className="mt-2"
            >
              Coba Lagi
            </Button>
          </div>
        ) : (
          <>
            <div>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Kanal Koordinasi ({filteredChannels.length})
              </p>
              <div className="space-y-0.5">
                {filteredChannels.map((channel) => {
                  const isActive =
                    selectedTarget?.kind === "room" &&
                    selectedTarget.roomId === channel.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => handleSelectChannel(channel)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                        isActive
                          ? "bg-[#0f2b4d] text-white dark:bg-primary dark:text-primary-foreground"
                          : "hover:bg-accent/70",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          isActive
                            ? "bg-white/15 text-amber-300"
                            : "bg-[#0f2b4d]/10 text-[#0f2b4d] dark:bg-sky-500/15 dark:text-sky-300",
                        )}
                      >
                        <Hash className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-xs font-bold">
                            {channel.name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px] tabular-nums",
                              isActive
                                ? "text-white/75"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatShortRoomTime(channel.lastMessageAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-1.5">
                          <span
                            className={cn(
                              "truncate text-[11px]",
                              isActive
                                ? "text-white/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {channel.lastMessageText ||
                              channel.description ||
                              "Kanal koordinasi divisi"}
                          </span>
                          {channel.unreadCount > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950 tabular-nums">
                              {channel.unreadCount > 99
                                ? "99+"
                                : channel.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Anggota Tim ({filteredUsers.length})
              </p>
              <div className="space-y-0.5">
                {filteredUsers.map((user) => {
                  const directRoom = directRoomByUserId.get(user.id);
                  const isActive =
                    (selectedTarget?.kind === "user" &&
                      selectedTarget.userId === user.id) ||
                    (selectedTarget?.kind === "room" &&
                      directRoom?.id === selectedTarget.roomId);

                  const isTypingAnywhere = Boolean(user.typingInRoomId);
                  const presenceText = isTypingAnywhere
                    ? "✍️ Sedang mengetik..."
                    : formatLastSeen(user.lastSeenAt, user.isOnline);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                        isActive
                          ? "bg-[#0f2b4d] text-white dark:bg-primary dark:text-primary-foreground"
                          : "hover:bg-accent/70",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="size-8 border border-border/60">
                          {user.profilePhotoUrl && (
                            <AvatarImage
                              src={user.profilePhotoUrl}
                              alt={user.name}
                            />
                          )}
                          <AvatarFallback
                            className={cn(
                              "text-[11px] font-bold",
                              isActive
                                ? "bg-white/15 text-amber-200"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          aria-label={user.isOnline ? "Online" : "Offline"}
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2",
                            isActive ? "border-[#0f2b4d]" : "border-card",
                            user.isOnline ? "bg-emerald-500" : "bg-slate-400",
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-xs font-bold">
                            {user.name}
                          </span>
                          {directRoom && (
                            <span
                              className={cn(
                                "shrink-0 text-[10px] tabular-nums",
                                isActive
                                  ? "text-white/75"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatShortRoomTime(directRoom.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-1.5">
                          <span
                            className={cn(
                              "inline-flex min-w-0 items-center gap-1 truncate text-[11px]",
                              isTypingAnywhere
                                ? isActive
                                  ? "font-semibold text-amber-200"
                                  : "font-semibold text-emerald-600 dark:text-emerald-400"
                                : user.isOnline
                                  ? isActive
                                    ? "font-medium text-emerald-200"
                                    : "font-medium text-emerald-600 dark:text-emerald-400"
                                  : isActive
                                    ? "text-white/75"
                                    : "text-muted-foreground",
                            )}
                          >
                            {!isTypingAnywhere && (
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  user.isOnline
                                    ? "bg-emerald-500"
                                    : "bg-slate-400",
                                )}
                              />
                            )}
                            <span className="truncate">{presenceText}</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                                isActive
                                  ? "bg-white/15 text-amber-200"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {getRoleLabel(user.role)}
                            </span>
                            {directRoom && directRoom.unreadCount > 0 && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950 tabular-nums">
                                {directRoom.unreadCount > 99
                                  ? "99+"
                                  : directRoom.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        {directRoom?.lastMessageText && (
                          <p
                            className={cn(
                              "mt-0.5 truncate text-[10px]",
                              isActive
                                ? "text-white/70"
                                : "text-muted-foreground/80",
                            )}
                          >
                            {directRoom.lastMessageText}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredChannels.length === 0 && filteredUsers.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Tidak ada kanal atau anggota tim yang cocok.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderTeamConversationPane = () => {
    if (!selectedTarget) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[#0f2b4d]/10 text-[#0f2b4d] dark:bg-sky-500/15 dark:text-sky-300">
            <Users className="size-6" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-bold text-foreground">
            Pilih Kanal atau Rekan Tim
          </p>
          <p className="mt-1 max-w-[260px] text-xs leading-relaxed">
            Kirim pesan langsung, foto lapangan, panggil @bunglon di grup, atau
            lampirkan dokumen resmi dari Bunglon AI.
          </p>
        </div>
      );
    }

    const conversationTitle =
      activeDirectPartner?.name ?? activeTeamRoom?.name ?? "Percakapan Tim";
    const partnerPresenceLabel = activeDirectPartner
      ? activeDirectPartner.typingInRoomId === activeTeamRoom?.id
        ? "✍️ Sedang mengetik..."
        : formatLastSeen(
            activeDirectPartner.lastSeenAt,
            activeDirectPartner.isOnline,
          )
      : null;
    const conversationSubtitle = activeDirectPartner
      ? `${getRoleLabel(activeDirectPartner.role)} · ${partnerPresenceLabel}`
      : activeTeamRoom?.description ?? "Kanal koordinasi internal (ketik @bunglon untuk panggil AI)";
    const isChannel = activeTeamRoom?.type === "CHANNEL";
    const activeTypingUsers = (teamMessagesData?.typingUsers ?? []).filter(
      (item) => item.userId !== effectiveUserId,
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Conversation sub-header */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Kembali ke daftar chat"
              onClick={() => setSelectedTarget(null)}
              className={cn(
                "size-7 shrink-0",
                isMaximized && "sm:hidden",
              )}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>

            {isChannel ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0f2b4d]/10 text-[#0f2b4d] dark:bg-sky-500/15 dark:text-sky-300">
                <Hash className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <div className="relative shrink-0">
                <Avatar className="size-8 border border-border">
                  {activeDirectPartner?.profilePhotoUrl && (
                    <AvatarImage
                      src={activeDirectPartner.profilePhotoUrl}
                      alt={conversationTitle}
                    />
                  )}
                  <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                    {getInitials(conversationTitle)}
                  </AvatarFallback>
                </Avatar>
                {activeDirectPartner && (
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card",
                      activeDirectPartner.isOnline
                        ? "bg-emerald-500"
                        : "bg-slate-400",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-foreground">
                {conversationTitle}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {conversationSubtitle}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Muat ulang pesan"
              onClick={() => void mutateTeamMessages()}
              className="size-7 shrink-0"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </Button>

            <Popover
              open={clearTeamPopoverOpen}
              onOpenChange={setClearTeamPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Hapus obrolan"
                  title="Hapus semua obrolan di ruang ini"
                  disabled={!activeTeamRoomId || (teamMessagesData?.messages.length ?? 0) === 0}
                  className="h-7 gap-1 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Hapus Obrolan</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-64 border border-border p-3 shadow-xl"
              >
                <p className="text-xs font-bold text-foreground">
                  Hapus Obrolan Ini?
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Seluruh riwayat pesan &amp; lampiran di{" "}
                  <strong>{conversationTitle}</strong> akan dihapus permanen.
                </p>
                <div className="mt-2.5 flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setClearTeamPopoverOpen(false)}
                    className="h-7 px-2 text-[11px]"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={clearingChatTarget === "team"}
                    onClick={() => void handleClearConversation("team")}
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    {clearingChatTarget === "team" && (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    )}
                    <span>Ya, Hapus</span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Message stream */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-3 space-y-3 dark:bg-slate-950/35">
          {teamMessagesLoading && !teamMessagesData ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Memuat pesan...</span>
            </div>
          ) : teamMessagesError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-xs text-destructive">
              Gagal memuat pesan percakapan.
            </div>
          ) : (teamMessagesData?.messages.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Belum ada pesan. Mulai koordinasi tim atau ketik @bunglon untuk
              bantuan AI.
            </div>
          ) : (
            teamMessagesData?.messages.map((message) => {
              const isOwn = message.senderId === effectiveUserId;
              const isAssistantMessage =
                message.senderId === "hermes-assistant" ||
                message.senderRole === "BUNGLON_AI" ||
                message.senderRole === "AI_ASSISTANT";
              const isTypingThisMessage = typingReveal?.messageId === message.id;
              const displayedContent = isTypingThisMessage
                ? typingReveal.fullText.slice(0, typingReveal.shownLength)
                : message.content;
              const thinkingSteps = isAssistantMessage
                ? parseThinkingSteps(message.metadata)
                : [];
              const dataActionResult = isAssistantMessage
                ? parseDataActionResult(message.metadata)
                : null;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2",
                    isOwn ? "justify-end" : "justify-start",
                  )}
                >
                  {!isOwn &&
                    (isAssistantMessage ? (
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-[#0f2b4d] text-white shadow-xs">
                        <Bot className="size-4" aria-hidden="true" />
                      </span>
                    ) : (
                      <Avatar className="mt-0.5 size-7 shrink-0 border border-border">
                        {message.senderAvatarUrl && (
                          <AvatarImage
                            src={message.senderAvatarUrl}
                            alt={message.senderName}
                          />
                        )}
                        <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                          {getInitials(message.senderName)}
                        </AvatarFallback>
                      </Avatar>
                    ))}

                  <div
                    className={cn(
                      "max-w-[85%] space-y-1.5 rounded-2xl px-3 py-2 shadow-xs",
                      isOwn
                        ? "rounded-br-sm bg-[#0f2b4d] text-white dark:bg-primary dark:text-primary-foreground"
                        : isAssistantMessage
                          ? "rounded-bl-sm border border-emerald-500/30 bg-card text-card-foreground"
                          : "rounded-bl-sm border border-border bg-card text-card-foreground",
                    )}
                  >
                    {!isOwn && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-foreground">
                          {isAssistantMessage
                            ? "Bunglon Assistant (SKALA AI)"
                            : message.senderName}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                            isAssistantMessage
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {getRoleLabel(message.senderRole)}
                        </span>
                      </div>
                    )}

                    {!isTypingThisMessage && thinkingSteps.length > 0 && (
                      <BunglonMessageExtras
                        thinkingSteps={thinkingSteps}
                        dataActionResult={null}
                      />
                    )}

                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {isTypingThisMessage
                        ? displayedContent
                        : renderContentWithMentions(
                            displayedContent,
                            knownMentionNames,
                            isOwn,
                          )}
                      {isTypingThisMessage && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-emerald-500 align-middle"
                        />
                      )}
                    </p>

                    {isTypingThisMessage ? (
                      <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <span className="font-medium italic">
                          ✍️ Bunglon sedang mengetik...
                        </span>
                        <button
                          type="button"
                          onClick={() => setTypingReveal(null)}
                          className="underline hover:text-foreground"
                        >
                          Tampilkan penuh
                        </button>
                      </div>
                    ) : (
                      <>
                        {dataActionResult && (
                          <BunglonMessageExtras
                            thinkingSteps={[]}
                            dataActionResult={dataActionResult}
                          />
                        )}

                        {message.attachments.length > 0 && (
                          <div className="space-y-1.5 pt-0.5">
                            {message.attachments.map((att) => (
                              <ChatAttachmentCard
                                key={att.id}
                                attachment={att}
                                isOwnMessage={isOwn}
                                allowForward
                                channels={bootstrap?.channels ?? []}
                                users={teamUsers}
                                directRoomByUserId={directRoomByUserId}
                                onForwardSuccess={() => void mutateBootstrap()}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      {(isOwn ||
                        isAssistantMessage ||
                        effectiveUserRole === "DIRECTOR" ||
                        effectiveUserRole === "DEPUTY_DIRECTOR" ||
                        effectiveUserRole === "ADMINISTRATIONS") && (
                        <button
                          type="button"
                          aria-label="Hapus pesan"
                          title="Hapus pesan ini"
                          disabled={deletingMessageId === message.id}
                          onClick={() =>
                            void handleDeleteSingleMessage(message.id, "team")
                          }
                          className={cn(
                            "rounded p-0.5 transition-colors disabled:opacity-50",
                            isOwn
                              ? "text-white/60 hover:bg-white/15 hover:text-white"
                              : "text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive",
                          )}
                        >
                          {deletingMessageId === message.id ? (
                            <Loader2
                              className="size-3 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 className="size-3" aria-hidden="true" />
                          )}
                        </button>
                      )}
                      <p
                        className={cn(
                          "text-right text-[10px] tabular-nums",
                          isOwn ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {formatWibTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {teamThinking && (
            <BunglonThinkingBubble
              statusText={
                BUNGLON_THINKING_MESSAGES[
                  thinkingTickIdx % BUNGLON_THINKING_MESSAGES.length
                ]
              }
            />
          )}
          <div ref={teamMessagesEndRef} />
        </div>

        {/* Live teammate typing indicator */}
        {activeTypingUsers.length > 0 && (
          <div className="flex items-center gap-1.5 border-t border-border/60 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>
              ✍️{" "}
              {activeTypingUsers
                .map((u) => u.userName.split(" ")[0] || u.userName)
                .join(", ")}{" "}
              sedang mengetik...
            </span>
          </div>
        )}

        {/* Pending staged attachments */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border bg-muted/30 px-3 py-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="flex max-w-full items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-foreground"
              >
                {isImageAttachment(att) ? (
                  <ImageIcon
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <FileText
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                )}
                <span className="max-w-[160px] truncate">{att.title}</span>
                {att.documentNumber && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {att.documentNumber}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Hapus lampiran ${att.title}`}
                  onClick={() =>
                    setPendingAttachments((prev) =>
                      prev.filter((item) => item.id !== att.id),
                    )
                  }
                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Composer + WhatsApp-style @mention autocomplete */}
        <div className="relative border-t border-border bg-card p-2.5">
          {isMentionMenuOpen && (
            <div
              role="listbox"
              aria-label="Tag anggota atau Bunglon"
              className="absolute inset-x-2.5 bottom-full z-30 mb-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-2xl"
            >
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Tag Anggota / Bunglon</span>
                <span>Enter / Klik untuk pilih</span>
              </div>
              {mentionCandidates.map((candidate, index) => {
                const isSelected = index === mentionActiveIndex;
                return (
                  <button
                    key={candidate.key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelectMentionCandidate(candidate);
                      window.requestAnimationFrame(() => {
                        teamTextareaRef.current?.focus();
                      });
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-[#0f2b4d] text-white dark:bg-primary dark:text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {candidate.kind === "assistant" ? (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-[#0f2b4d] text-white">
                        <Bot className="size-3.5" aria-hidden="true" />
                      </span>
                    ) : candidate.kind === "all" ? (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300">
                        <Users className="size-3.5" aria-hidden="true" />
                      </span>
                    ) : (
                      <Avatar className="size-7 shrink-0 border border-border/60">
                        {candidate.user.profilePhotoUrl && (
                          <AvatarImage
                            src={candidate.user.profilePhotoUrl}
                            alt={candidate.label}
                          />
                        )}
                        <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                          {getInitials(candidate.label)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">@{candidate.label}</p>
                      <p
                        className={cn(
                          "truncate text-[10px]",
                          isSelected ? "text-white/80" : "text-muted-foreground",
                        )}
                      >
                        {candidate.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <input
            ref={teamPhotoInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(event) =>
              void handleUploadFileChange(event, {
                target: "team",
                forcedKind: "FTO",
              })
            }
            className="sr-only"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) =>
              void handleUploadFileChange(event, { target: "team" })
            }
            className="sr-only"
          />

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {/* 1-click Foto upload */}
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={uploadingFile}
              onClick={() => teamPhotoInputRef.current?.click()}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              {uploadingFile ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="size-3.5" aria-hidden="true" />
              )}
              <span>Foto</span>
            </Button>

            {/* Upload Dokumen / File Operasional popover */}
            <Popover open={attachPopoverOpen} onOpenChange={setAttachPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={uploadingFile}
                  className="h-7 gap-1 px-2 text-[11px]"
                >
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  <span>Dokumen / File</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-72 border border-border p-3 shadow-xl"
              >
                <p className="text-xs font-bold text-foreground">
                  Unggah Foto / Dokumen Operasional
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  JPG, PNG, WEBP, PDF, DOC/DOCX, atau XLS/XLSX (maks 10 MB).
                </p>

                <div className="mt-2.5">
                  <p className="text-[11px] font-semibold text-foreground">
                    Kategori Lampiran
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {UPLOAD_KIND_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setUploadKind(option.value)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                          uploadKind === option.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-foreground hover:bg-accent",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(bootstrap?.projects.length ?? 0) > 0 && (
                  <div className="mt-2.5">
                    <label
                      htmlFor="chat-upload-project"
                      className="mb-1 block text-[11px] font-semibold text-foreground"
                    >
                      Tautkan Proyek (Opsional)
                    </label>
                    <select
                      id="chat-upload-project"
                      value={uploadProjectId}
                      onChange={(event) => setUploadProjectId(event.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary"
                    >
                      <option value="NONE">Tanpa proyek spesifik</option>
                      {bootstrap?.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} — {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 w-full gap-1.5 text-xs"
                >
                  <Upload className="size-3.5" aria-hidden="true" />
                  <span>Pilih Dokumen / Foto dari Perangkat</span>
                </Button>
              </PopoverContent>
            </Popover>

            {/* Quick Bunglon document picker */}
            <Popover open={hermesPickerOpen} onOpenChange={setHermesPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="lightprimary"
                  className="h-7 gap-1 px-2 text-[11px]"
                >
                  <FileCheck2 className="size-3.5" aria-hidden="true" />
                  <span>Dokumen Bunglon</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-80 border border-border p-0 shadow-xl"
              >
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-bold text-foreground">
                    Dokumen Bunglon Terbaru
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pilih dokumen resmi untuk langsung dilampirkan ke chat.
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {(bootstrap?.recentDocuments.length ?? 0) === 0 ? (
                    <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                      <p>Belum ada dokumen Bunglon.</p>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setHermesPickerOpen(false);
                          setActiveTab("hermes");
                          setShowHermesDocForm(true);
                        }}
                        className="mt-2"
                      >
                        Buat di Tab Bunglon AI
                      </Button>
                    </div>
                  ) : (
                    bootstrap?.recentDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleAttachHermesDoc(doc)}
                        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <FileText
                          className="mt-0.5 size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                              {getDocTypeLabel(doc.docType)}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {doc.documentNumber}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs font-semibold text-foreground">
                            {doc.title}
                          </p>
                          {doc.projectName && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {doc.projectName}
                            </p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                setDismissedMentionText(null);
                setMentionActiveIndex(0);
                setTeamInput((prev) =>
                  /(?:^|\s)@$/.test(prev)
                    ? prev
                    : prev.trimEnd()
                      ? `${prev.trimEnd()} @`
                      : "@",
                );
                window.requestAnimationFrame(() => {
                  teamTextareaRef.current?.focus();
                });
              }}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              <AtSign className="size-3.5" aria-hidden="true" />
              <span>Tag</span>
            </Button>

            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                setTeamInput((prev) =>
                  /@bunglon\b/i.test(prev)
                    ? prev
                    : prev.trim()
                      ? `@bunglon ${prev}`
                      : "@bunglon ",
                )
              }
              className="h-7 gap-1 border-emerald-500/35 bg-emerald-500/10 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              <Bot className="size-3.5" aria-hidden="true" />
              <span>@Bunglon</span>
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              ref={teamTextareaRef}
              value={teamInput}
              onChange={(event) => {
                setTeamInput(event.target.value);
                setDismissedMentionText(null);
                setMentionActiveIndex(0);
              }}
              onKeyDown={handleTeamTextareaKeyDown}
              onPaste={(event) => handlePasteAttachment(event, "team")}
              placeholder="Ketik pesan, @ untuk tag rekan/@bunglon, atau tempel foto..."
              rows={2}
              className="mt-0 min-h-10 max-h-28 resize-none text-xs"
            />
            <Button
              type="button"
              size="icon"
              aria-label="Kirim pesan"
              disabled={
                sendingTeam ||
                (!teamInput.trim() && pendingAttachments.length === 0)
              }
              onClick={() => void handleSendTeamMessage()}
              className="size-10 shrink-0 rounded-xl bg-[#0f2b4d] text-white hover:bg-[#173d6c] dark:bg-primary dark:text-primary-foreground"
            >
              {sendingTeam ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderHermesTab = () => {
    const messages = hermesMessagesData?.messages ?? [];

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Status & controls bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/35 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                gatewayOnline
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                  : "bg-amber-500",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-foreground">
                {isGeminiGateway
                  ? `Bunglon AI · Gemini API${hermesStatus?.model ? ` (${hermesStatus.model})` : ""}`
                  : gatewayOnline
                    ? `Bunglon AI · Gateway CLI${hermesStatus?.model ? ` (${hermesStatus.model})` : ""}`
                    : "Bunglon ERP Engine Aktif"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {hermesStatus?.detail ||
                  "Asisten input data ERP, analisis progres, & pembuat laporan PDF"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant={showDataInputForm ? "default" : "outline"}
              onClick={() => {
                setShowDataInputForm((prev) => !prev);
                setShowHermesDocForm(false);
              }}
              className={cn(
                "h-7 gap-1 px-2 text-[11px]",
                !showDataInputForm &&
                  "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
              )}
            >
              <Zap className="size-3.5" aria-hidden="true" />
              <span>Input Data</span>
            </Button>

            <Button
              type="button"
              size="xs"
              variant={showHermesDocForm ? "default" : "lightprimary"}
              onClick={() => {
                setShowHermesDocForm((prev) => !prev);
                setShowDataInputForm(false);
              }}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              <FilePlus2 className="size-3.5" aria-hidden="true" />
              <span>Buat Dokumen</span>
              {showHermesDocForm ? (
                <ChevronUp className="size-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3" aria-hidden="true" />
              )}
            </Button>

            <Button
              type="button"
              size="xs"
              variant={showHermesSetup ? "secondary" : "outline"}
              onClick={() => setShowHermesSetup((prev) => !prev)}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Setup CLI</span>
              <span className="sm:hidden">CLI</span>
            </Button>

            <Popover
              open={clearHermesPopoverOpen}
              onOpenChange={setClearHermesPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Hapus obrolan Bunglon AI"
                  title="Hapus semua riwayat obrolan Bunglon AI"
                  disabled={messages.length === 0}
                  className="h-7 gap-1 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Hapus Obrolan</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-64 border border-border p-3 shadow-xl"
              >
                <p className="text-xs font-bold text-foreground">
                  Hapus Obrolan Bunglon AI?
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Seluruh riwayat percakapan Anda dengan{" "}
                  <strong>Bunglon Assistant</strong> akan dibersihkan.
                </p>
                <div className="mt-2.5 flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setClearHermesPopoverOpen(false)}
                    className="h-7 px-2 text-[11px]"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={clearingChatTarget === "hermes"}
                    onClick={() => void handleClearConversation("hermes")}
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    {clearingChatTarget === "hermes" && (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    )}
                    <span>Ya, Hapus</span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Collapsible Setup Hermes Agent CLI Drawer */}
        {showHermesSetup && (
          <div className="max-h-72 overflow-y-auto border-b border-border bg-slate-50/90 p-3 text-xs dark:bg-slate-900/70 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Terminal
                  className="size-4 shrink-0 text-[#0f2b4d] dark:text-amber-400"
                  aria-hidden="true"
                />
                <span className="font-bold text-foreground">
                  Koneksi NousResearch Hermes Agent CLI
                </span>
              </div>
              <Badge
                variant={gatewayOnline ? "lightSuccess" : "lightWarning"}
                className="px-2 py-0.5 text-[10px]"
              >
                {isGeminiGateway
                  ? "Gemini API Aktif"
                  : gatewayOnline
                    ? "Gateway Terhubung"
                    : "Mode Fallback ERP"}
              </Badge>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveAndTestGateway();
              }}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <div>
                <label
                  htmlFor="hermes-gateway-url"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Gateway URL
                </label>
                <Input
                  id="hermes-gateway-url"
                  value={gatewayUrlInput}
                  onChange={(event) => setGatewayUrlInput(event.target.value)}
                  placeholder="http://127.0.0.1:8642"
                  className="h-8 bg-background font-mono text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="hermes-api-key"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  API Key (Opsional)
                </label>
                <div className="relative">
                  <Input
                    id="hermes-api-key"
                    type={showApiKey ? "text" : "password"}
                    autoComplete="off"
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    placeholder="Bearer / Hermes / Gemini API key"
                    className="h-8 bg-background pr-8 font-mono text-xs"
                  />
                  <button
                    type="button"
                    aria-label={
                      showApiKey
                        ? "Sembunyikan API Key"
                        : "Tampilkan API Key"
                    }
                    onClick={() => setShowApiKey((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Saat CLI lokal tidak aktif,{" "}
                <strong className="text-foreground">
                  Built-in Hermes ERP Engine
                </strong>{" "}
                tetap aktif otomatis membuat dokumen &amp; lampiran resmi PT
                Skala Prioritas Engineering dari MongoDB.
              </p>
              <Button
                type="button"
                size="xs"
                disabled={testingGateway || hermesStatusValidating}
                onClick={() => void handleSaveAndTestGateway()}
                className="gap-1.5"
              >
                {testingGateway || hermesStatusValidating ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                )}
                <span>Uji Koneksi</span>
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950 text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-800 px-2.5 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Perintah Instalasi Hermes Agent CLI
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void handleCopyInstallCommands()}
                  className="h-6 gap-1 px-2 text-[10px] text-amber-300 hover:bg-slate-800 hover:text-amber-200"
                >
                  {copiedCli ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3" aria-hidden="true" />
                  )}
                  <span>{copiedCli ? "Disalin" : "Salin Semua"}</span>
                </Button>
              </div>
              <pre className="overflow-x-auto p-2.5 font-mono text-[11px] leading-relaxed text-emerald-300">
                {cliInstallCommands.join("\n")}
              </pre>
            </div>
          </div>
        )}

        {/* Collapsible Buat Dokumen / Lampiran Cepat Card */}
        {showHermesDocForm && (
          <div className="max-h-72 overflow-y-auto border-b border-border bg-amber-500/5 p-3 text-xs dark:bg-amber-500/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-foreground">
                Buat Dokumen / Lampiran Resmi Cepat
              </p>
              <button
                type="button"
                aria-label="Tutup form dokumen cepat"
                onClick={() => setShowHermesDocForm(false)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="hermes-doc-type"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Jenis Dokumen
                </label>
                <Select
                  value={docType}
                  onValueChange={(value) => setDocType(value as HermesDocType)}
                >
                  <SelectTrigger
                    id="hermes-doc-type"
                    size="sm"
                    className="w-full bg-background text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border border-border">
                    {HERMES_DOC_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="hermes-doc-project"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Proyek Terkait (Opsional)
                </label>
                <Select value={docProjectId} onValueChange={setDocProjectId}>
                  <SelectTrigger
                    id="hermes-doc-project"
                    size="sm"
                    className="w-full bg-background text-xs"
                  >
                    <SelectValue placeholder="Pilih proyek" />
                  </SelectTrigger>
                  <SelectContent className="border border-border">
                    <SelectItem value="NONE">Tanpa proyek spesifik</SelectItem>
                    {bootstrap?.projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} — {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="hermes-doc-recipient"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Penerima / Vendor / Pihak Terkait
                </label>
                <Input
                  id="hermes-doc-recipient"
                  value={docRecipient}
                  onChange={(event) => setDocRecipient(event.target.value)}
                  placeholder="Contoh: CV Mandiri Jaya / Tim Lapangan"
                  className="h-8 bg-background text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="hermes-doc-amount"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Nominal (Rp){" "}
                  {!selectedDocMeta.supportsAmount && "(Opsional)"}
                </label>
                <Input
                  id="hermes-doc-amount"
                  type="number"
                  min={0}
                  step="1000"
                  value={docAmount}
                  onChange={(event) => setDocAmount(event.target.value)}
                  placeholder="Contoh: 2500000"
                  className="h-8 bg-background text-xs tabular-nums"
                />
              </div>
            </div>

            {(bootstrap?.tickets.length ?? 0) > 0 && (
              <div>
                <label
                  htmlFor="hermes-doc-ticket"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Tiket Terkait (Opsional)
                </label>
                <Select value={docTicketId} onValueChange={setDocTicketId}>
                  <SelectTrigger
                    id="hermes-doc-ticket"
                    size="sm"
                    className="w-full bg-background text-xs"
                  >
                    <SelectValue placeholder="Tanpa tiket spesifik" />
                  </SelectTrigger>
                  <SelectContent className="border border-border">
                    <SelectItem value="NONE">Tanpa tiket spesifik</SelectItem>
                    {bootstrap?.tickets.map((ticket) => (
                      <SelectItem key={ticket.id} value={ticket.id}>
                        {ticket.ticketNumber} — {ticket.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label
                htmlFor="hermes-doc-description"
                className="mb-1 block text-[11px] font-semibold text-foreground"
              >
                Keterangan / Keperluan / Rincian
              </label>
              <Textarea
                id="hermes-doc-description"
                value={docDescription}
                onChange={(event) => setDocDescription(event.target.value)}
                rows={2}
                placeholder="Uraikan keperluan, daftar item, atau rincian pekerjaan..."
                className="mt-0 min-h-14 bg-background text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={sendingHermes}
                onClick={() => void handleCreateHermesDocument()}
                className="gap-1.5 bg-[#0f2b4d] text-white hover:bg-[#173d6c] dark:bg-primary dark:text-primary-foreground"
              >
                {sendingHermes ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden="true" />
                )}
                <span>Buat Dokumen Sekarang</span>
              </Button>
            </div>
          </div>
        )}

        {/* Collapsible Input Data ERP Cepat Card */}
        {showDataInputForm && (
          <div className="max-h-80 overflow-y-auto border-b border-border bg-emerald-500/5 p-3 text-xs dark:bg-emerald-500/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-foreground">
                Input Data ERP Cepat via Bunglon Assistant
              </p>
              <button
                type="button"
                aria-label="Tutup form input data"
                onClick={() => setShowDataInputForm(false)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="bunglon-data-action-type"
                  className="mb-1 block text-[11px] font-semibold text-foreground"
                >
                  Jenis Input Data
                </label>
                <Select
                  value={dataActionType}
                  onValueChange={(value) =>
                    setDataActionType(value as ChatDataActionType)
                  }
                >
                  <SelectTrigger
                    id="bunglon-data-action-type"
                    size="sm"
                    className="w-full bg-background text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border border-border">
                    {DATA_ACTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(bootstrap?.projects.length ?? 0) > 0 && (
                <div>
                  <label
                    htmlFor="bunglon-data-project"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    {dataActionType === "DAILY_REPORT"
                      ? "Pilih Proyek (Wajib)"
                      : "Tautkan Proyek (Opsional)"}
                  </label>
                  <Select
                    value={dataProjectId}
                    onValueChange={setDataProjectId}
                  >
                    <SelectTrigger
                      id="bunglon-data-project"
                      size="sm"
                      className="w-full bg-background text-xs"
                    >
                      <SelectValue placeholder="Pilih proyek" />
                    </SelectTrigger>
                    <SelectContent className="border border-border">
                      <SelectItem value="NONE">Tanpa proyek spesifik</SelectItem>
                      {bootstrap?.projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.code} — {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {dataActionType === "DAILY_REPORT" && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label
                    htmlFor="bunglon-data-progress"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    Progres (%)
                  </label>
                  <Input
                    id="bunglon-data-progress"
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={dataProgress}
                    onChange={(event) => setDataProgress(event.target.value)}
                    placeholder="cth: 65"
                    className="h-8 bg-background text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="bunglon-data-workers"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    Jml Pekerja
                  </label>
                  <Input
                    id="bunglon-data-workers"
                    type="number"
                    min={0}
                    value={dataWorkersCount}
                    onChange={(event) =>
                      setDataWorkersCount(event.target.value)
                    }
                    placeholder="cth: 12"
                    className="h-8 bg-background text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="bunglon-data-weather"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    Cuaca
                  </label>
                  <Input
                    id="bunglon-data-weather"
                    value={dataWeather}
                    onChange={(event) => setDataWeather(event.target.value)}
                    placeholder="Cerah"
                    className="h-8 bg-background text-xs"
                  />
                </div>
              </div>
            )}

            {dataActionType === "CREATE_TICKET" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="bunglon-data-title"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    Judul / Keperluan Tiket
                  </label>
                  <Input
                    id="bunglon-data-title"
                    value={dataTitle}
                    onChange={(event) => setDataTitle(event.target.value)}
                    placeholder="cth: Pembelian 50 sak semen"
                    className="h-8 bg-background text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="bunglon-data-category"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    Kategori
                  </label>
                  <Select value={dataCategory} onValueChange={setDataCategory}>
                    <SelectTrigger
                      id="bunglon-data-category"
                      size="sm"
                      className="w-full bg-background text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border border-border">
                      <SelectItem value="MATERIAL">Material</SelectItem>
                      <SelectItem value="KASBON">Kasbon</SelectItem>
                      <SelectItem value="REIMBURSE">Reimburse</SelectItem>
                      <SelectItem value="BIAYA_OPERASIONAL">
                        Biaya Operasional
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="bunglon-data-amount"
                    className="mb-1 block text-[11px] font-semibold text-foreground"
                  >
                    Estimasi Nominal (Rp)
                  </label>
                  <Input
                    id="bunglon-data-amount"
                    inputMode="numeric"
                    value={dataAmount}
                    onChange={(event) => setDataAmount(event.target.value)}
                    placeholder="cth: 3500000"
                    className="h-8 bg-background text-xs"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="bunglon-data-notes"
                className="mb-1 block text-[11px] font-semibold text-foreground"
              >
                {dataActionType === "CREATE_NOTE"
                  ? "Isi Catatan Kerja"
                  : "Ringkasan Pekerjaan / Catatan"}
              </label>
              <Textarea
                id="bunglon-data-notes"
                value={dataNotes}
                onChange={(event) => setDataNotes(event.target.value)}
                rows={2}
                placeholder={
                  dataActionType === "DAILY_REPORT"
                    ? "Tuliskan pekerjaan hari ini atau kendala lapangan..."
                    : dataActionType === "CREATE_TICKET"
                      ? "Rincian kebutuhan item, lokasi pengiriman, atau urgensi..."
                      : "Tuliskan catatan atau pengingat penting Anda..."
                }
                className="mt-0 min-h-14 bg-background text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={sendingHermes}
                onClick={() => void handleSubmitDataInput()}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {sendingHermes ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Zap className="size-3.5" aria-hidden="true" />
                )}
                <span>Simpan Data ERP</span>
              </Button>
            </div>
          </div>
        )}

        {/* Bunglon Conversation Feed */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-3 space-y-3 dark:bg-slate-950/35">
          {(bootstrapLoading && !bootstrap) ||
          (hermesMessagesLoading && !hermesMessagesData) ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Menyiapkan Bunglon Assistant...</span>
            </div>
          ) : hermesMessagesError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-xs text-destructive">
              Gagal memuat riwayat Bunglon Assistant.
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-xs">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-[#0f2b4d] text-white">
                <Bot className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-2.5 text-sm font-bold text-foreground">
                Bunglon Assistant (SKALA AI)
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Rekan asisten AI yang siap ngobrol natural, bantu input laporan
                harian/tiket/catatan, analisis data proyek, serta cetak PDF
                Kwitansi, SPK, BAST, PO, &amp; Surat Jalan.
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.senderId === effectiveUserId;
              const engineMeta =
                typeof message.metadata?.engineUsed === "string"
                  ? message.metadata.engineUsed
                  : null;
              const msgIsGemini =
                typeof message.metadata?.gatewayUrl === "string" &&
                message.metadata.gatewayUrl.includes(
                  "generativelanguage.googleapis.com",
                );
              const isTypingThisMessage = typingReveal?.messageId === message.id;
              const displayedContent = isTypingThisMessage
                ? typingReveal.fullText.slice(0, typingReveal.shownLength)
                : message.content;
              const thinkingSteps = !isUser
                ? parseThinkingSteps(message.metadata)
                : [];
              const dataActionResult = !isUser
                ? parseDataActionResult(message.metadata)
                : null;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  {!isUser && (
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-[#0f2b4d] text-white shadow-xs">
                      <Bot className="size-4" aria-hidden="true" />
                    </span>
                  )}

                  <div
                    className={cn(
                      "max-w-[88%] space-y-2 rounded-2xl px-3 py-2.5 shadow-xs",
                      isUser
                        ? "rounded-br-sm bg-[#0f2b4d] text-white dark:bg-primary dark:text-primary-foreground"
                        : "rounded-bl-sm border border-border bg-card text-card-foreground",
                    )}
                  >
                    {!isUser && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-foreground">
                          {message.senderName || "Bunglon Assistant (SKALA AI)"}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                            engineMeta === "hermes-gateway"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {engineMeta === "hermes-gateway"
                            ? msgIsGemini
                              ? "Gemini AI"
                              : "Gateway CLI"
                            : "SKALA Engine"}
                        </span>
                      </div>
                    )}

                    {!isUser && !isTypingThisMessage && thinkingSteps.length > 0 && (
                      <BunglonMessageExtras
                        thinkingSteps={thinkingSteps}
                        dataActionResult={null}
                      />
                    )}

                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {displayedContent}
                      {isTypingThisMessage && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-emerald-500 align-middle"
                        />
                      )}
                    </p>

                    {isTypingThisMessage ? (
                      <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <span className="font-medium italic">
                          ✍️ Bunglon sedang mengetik...
                        </span>
                        <button
                          type="button"
                          onClick={() => setTypingReveal(null)}
                          className="underline hover:text-foreground"
                        >
                          Tampilkan penuh
                        </button>
                      </div>
                    ) : (
                      <>
                        {dataActionResult && (
                          <BunglonMessageExtras
                            thinkingSteps={[]}
                            dataActionResult={dataActionResult}
                          />
                        )}

                        {message.attachments.length > 0 && (
                          <div className="space-y-2 pt-0.5">
                            {message.attachments.map((att) => (
                              <ChatAttachmentCard
                                key={att.id}
                                attachment={att}
                                isOwnMessage={isUser}
                                allowForward
                                channels={bootstrap?.channels ?? []}
                                users={teamUsers}
                                directRoomByUserId={directRoomByUserId}
                                onForwardSuccess={() => void mutateBootstrap()}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        aria-label="Hapus pesan"
                        title="Hapus pesan ini"
                        disabled={deletingMessageId === message.id}
                        onClick={() =>
                          void handleDeleteSingleMessage(message.id, "hermes")
                        }
                        className={cn(
                          "rounded p-0.5 transition-colors disabled:opacity-50",
                          isUser
                            ? "text-white/60 hover:bg-white/15 hover:text-white"
                            : "text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive",
                        )}
                      >
                        {deletingMessageId === message.id ? (
                          <Loader2
                            className="size-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 className="size-3" aria-hidden="true" />
                        )}
                      </button>
                      <p
                        className={cn(
                          "text-right text-[10px] tabular-nums",
                          isUser ? "text-white/70" : "text-muted-foreground",
                        )}
                      >
                        {formatWibTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {sendingHermes && pendingHermesPrompt && (
            <div className="flex justify-end gap-2">
              <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-[#0f2b4d] px-3 py-2.5 text-white shadow-xs dark:bg-primary dark:text-primary-foreground">
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                  {pendingHermesPrompt}
                </p>
              </div>
            </div>
          )}
          {sendingHermes && (
            <BunglonThinkingBubble
              statusText={
                BUNGLON_THINKING_MESSAGES[
                  thinkingTickIdx % BUNGLON_THINKING_MESSAGES.length
                ]
              }
            />
          )}
          <div ref={hermesMessagesEndRef} />
        </div>

        {/* Pending staged attachments for Bunglon AI */}
        {pendingHermesAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border bg-muted/30 px-3 py-2">
            {pendingHermesAttachments.map((att) => (
              <div
                key={att.id}
                className="flex max-w-full items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-foreground"
              >
                {isImageAttachment(att) ? (
                  <ImageIcon
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <FileText
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                )}
                <span className="max-w-[160px] truncate">{att.title}</span>
                <button
                  type="button"
                  aria-label={`Hapus lampiran ${att.title}`}
                  onClick={() =>
                    setPendingHermesAttachments((prev) =>
                      prev.filter((item) => item.id !== att.id),
                    )
                  }
                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quick prompt chips + Bunglon Composer */}
        <div className="border-t border-border bg-card p-2.5 space-y-2">
          <input
            ref={hermesPhotoInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(event) =>
              void handleUploadFileChange(event, {
                target: "hermes",
                forcedKind: "FTO",
              })
            }
            className="sr-only"
          />
          <input
            ref={hermesDocInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) =>
              void handleUploadFileChange(event, {
                target: "hermes",
                forcedKind: "DRW",
              })
            }
            className="sr-only"
          />

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              type="button"
              disabled={uploadingFile}
              onClick={() => hermesPhotoInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
            >
              <Camera className="size-3" aria-hidden="true" />
              <span>Foto</span>
            </button>
            <button
              type="button"
              disabled={uploadingFile}
              onClick={() => hermesDocInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <Paperclip className="size-3" aria-hidden="true" />
              <span>Dokumen</span>
            </button>

            {HERMES_QUICK_PROMPTS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  if (chip.openDataForm) {
                    setDataActionType(chip.openDataForm);
                    setShowDataInputForm(true);
                    setShowHermesDocForm(false);
                  } else if (chip.openDocForm) {
                    setDocType(chip.openDocForm);
                    setShowHermesDocForm(true);
                    setShowDataInputForm(false);
                  } else {
                    setHermesInput(chip.prompt);
                  }
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Sparkles className="size-3 text-amber-500" aria-hidden="true" />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              value={hermesInput}
              onChange={(event) => setHermesInput(event.target.value)}
              onKeyDown={handleHermesTextareaKeyDown}
              onPaste={(event) => handlePasteAttachment(event, "hermes")}
              placeholder="Tanya Bunglon, input laporan/tiket, tempel foto, atau buat PDF..."
              rows={2}
              className="mt-0 min-h-10 max-h-28 resize-none text-xs"
            />
            <Button
              type="button"
              size="icon"
              aria-label="Kirim ke Bunglon AI"
              disabled={
                sendingHermes ||
                (!hermesInput.trim() && pendingHermesAttachments.length === 0)
              }
              onClick={() => void handleSendHermesPrompt()}
              className="size-10 shrink-0 rounded-xl bg-[#0f2b4d] text-amber-400 hover:bg-[#173d6c]"
            >
              {sendingHermes ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-3.5 md:bottom-6 md:right-6 z-40 print:hidden">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Buka Chat Tim dan Bunglon AI"
          className="group relative inline-flex h-12 items-center gap-2.5 rounded-full border border-white/15 bg-[#0f2b4d] px-3.5 text-white shadow-[0_14px_34px_-8px_rgba(15,43,77,0.6)] transition-all hover:scale-[1.03] hover:bg-[#143763] active:scale-[0.98] dark:border-amber-400/30"
        >
          <span className="relative flex size-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
            <MessagesSquare className="size-4" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#0f2b4d] bg-emerald-400"
            />
          </span>
          <span className="hidden text-xs font-bold tracking-wide sm:inline">
            Chat &amp; Bunglon
          </span>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-extrabold text-slate-950 tabular-nums shadow-xs">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      ) : (
        <section
          aria-label="Widget Chat Tim & Bunglon AI"
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_24px_60px_-15px_rgba(15,43,77,0.45)] transition-[width,height] duration-200 dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)]",
            isMaximized
              ? "w-[calc(100vw-1.5rem)] sm:w-[760px] h-[min(85dvh,720px)] max-h-[calc(100dvh-9.25rem)] md:max-h-[calc(100dvh-3rem)]"
              : "w-[calc(100vw-1.5rem)] sm:w-[440px] h-[min(78dvh,640px)] max-h-[calc(100dvh-9.25rem)] md:max-h-[calc(100dvh-3rem)]",
          )}
        >
          {/* Header */}
          <header className="shrink-0 border-b border-white/10 bg-gradient-to-r from-[#0f2b4d] via-[#13355f] to-[#0f2b4d] px-3.5 pt-3 pb-2.5 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                  <MessagesSquare className="size-4" aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#0f2b4d] bg-emerald-400"
                  />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-extrabold tracking-wide text-white sm:text-sm">
                    Skala Hub &amp; Bunglon AI
                  </h2>
                  <p className="truncate text-[10px] text-slate-300">
                    {effectiveUserName} · {getRoleLabel(effectiveUserRole)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsMaximized((prev) => !prev)}
                  title={isMaximized ? "Perkecil tampilan" : "Perbesar tampilan"}
                  aria-label={
                    isMaximized ? "Perkecil tampilan" : "Perbesar tampilan"
                  }
                  className="hidden sm:flex size-7 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/15 hover:text-white"
                >
                  {isMaximized ? (
                    <Minimize2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="size-3.5" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Minimalkan chat"
                  aria-label="Minimalkan chat"
                  className="flex size-7 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setIsMaximized(false);
                  }}
                  title="Tutup chat"
                  aria-label="Tutup chat"
                  className="flex size-7 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl bg-black/25 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                  activeTab === "team"
                    ? "bg-white text-[#0f2b4d] shadow-xs"
                    : "text-slate-200 hover:bg-white/10 hover:text-white",
                )}
              >
                <MessageCircle className="size-3.5" aria-hidden="true" />
                <span>Chat Tim</span>
                {totalUnread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-extrabold text-slate-950 tabular-nums">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("hermes")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all",
                  activeTab === "hermes"
                    ? "bg-white text-[#0f2b4d] shadow-xs"
                    : "text-slate-200 hover:bg-white/10 hover:text-white",
                )}
              >
                <Sparkles
                  className={cn(
                    "size-3.5",
                    activeTab === "hermes"
                      ? "text-emerald-600"
                      : "text-emerald-300",
                  )}
                  aria-hidden="true"
                />
                <span>Bunglon AI</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                    gatewayOnline
                      ? activeTab === "hermes"
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-emerald-400/20 text-emerald-200"
                      : activeTab === "hermes"
                        ? "bg-[#0f2b4d]/10 text-[#0f2b4d]"
                        : "bg-white/15 text-amber-200",
                  )}
                >
                  {isGeminiGateway
                    ? "Gemini AI"
                    : gatewayOnline
                      ? "Gateway CLI"
                      : "SKALA Engine"}
                </span>
              </button>
            </div>
          </header>

          {/* Body */}
          {activeTab === "team" ? (
            isMaximized ? (
              <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[260px_1fr]">
                <div
                  className={cn(
                    "min-h-0 flex-col border-border sm:flex sm:border-r",
                    selectedTarget ? "hidden" : "flex",
                  )}
                >
                  {renderTeamListPane()}
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-col sm:flex",
                    selectedTarget ? "flex" : "hidden",
                  )}
                >
                  {renderTeamConversationPane()}
                </div>
              </div>
            ) : selectedTarget ? (
              renderTeamConversationPane()
            ) : (
              renderTeamListPane()
            )
          ) : (
            renderHermesTab()
          )}
        </section>
      )}
    </div>
  );
}
