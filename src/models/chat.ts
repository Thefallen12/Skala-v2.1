import { randomUUID } from "node:crypto";
import { model, models, Schema } from "mongoose";

export type ChatRoomType = "DIRECT" | "CHANNEL" | "HERMES";

export type ChatAttachmentKind = "DOCUMENT" | "ATTACHMENT" | "IMAGE" | "FILE";

export type HermesDocType =
  | "SPK"
  | "BAST"
  | "PO"
  | "DO"
  | "KWITANSI"
  | "LAMPIRAN_KEUANGAN"
  | "LAPORAN_PROYEK"
  | "SURAT_RESMI";

export type ChatDataActionType =
  | "DAILY_REPORT"
  | "CREATE_TICKET"
  | "CREATE_NOTE";

export interface ChatDataActionResult {
  actionType: ChatDataActionType;
  title: string;
  referenceCode: string;
  summary: string;
  targetUrl: string;
}

export interface ChatPresenceDocument {
  _id: string;
  userId: string;
  userName: string;
  userRole: string;
  lastActiveAt: Date;
  typingInRoomId: string | null;
  typingUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatAttachmentItem {
  id: string;
  title: string;
  kind: ChatAttachmentKind;
  docType?: string | null;
  documentNumber?: string | null;
  assetCode?: string | null;
  url: string;
  downloadUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  summary?: string | null;
  documentId?: string | null;
}

export interface ChatRoomDocument {
  _id: string;
  type: ChatRoomType;
  roomKey: string;
  name: string;
  description: string | null;
  participantIds: string[];
  lastMessageText: string | null;
  lastMessageAt: Date;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  unreadCounts: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageDocument {
  _id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatarUrl: string | null;
  content: string;
  attachments: ChatAttachmentItem[];
  metadata: Record<string, unknown> | null;
  readByIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatGeneratedDocumentRecord {
  _id: string;
  documentNumber: string;
  docType: HermesDocType;
  title: string;
  subtitle: string;
  projectId: string | null;
  projectName: string | null;
  ticketId: string | null;
  recipientName: string | null;
  amount: number | null;
  summary: string;
  htmlContent: string;
  structuredData: Record<string, unknown> | null;
  createdById: string;
  createdByName: string;
  createdByRole: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatAttachmentSchema = new Schema<ChatAttachmentItem>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    kind: {
      type: String,
      required: true,
      enum: ["DOCUMENT", "ATTACHMENT", "IMAGE", "FILE"],
      default: "FILE",
    },
    docType: { type: String, default: null },
    documentNumber: { type: String, default: null },
    assetCode: { type: String, default: null },
    url: { type: String, required: true },
    downloadUrl: { type: String, default: null },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    summary: { type: String, default: null },
    documentId: { type: String, default: null },
  },
  { _id: false },
);

const chatRoomSchema = new Schema<ChatRoomDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    type: {
      type: String,
      required: true,
      enum: ["DIRECT", "CHANNEL", "HERMES"],
      default: "DIRECT",
    },
    roomKey: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 300 },
    participantIds: { type: [String], default: [] },
    lastMessageText: { type: String, default: null, maxlength: 500 },
    lastMessageAt: { type: Date, default: () => new Date() },
    lastMessageSenderId: { type: String, default: null },
    lastMessageSenderName: { type: String, default: null },
    unreadCounts: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: "ChatRoom",
    timestamps: true,
    versionKey: false,
  },
);

chatRoomSchema.index({ roomKey: 1 }, { unique: true });
chatRoomSchema.index({ participantIds: 1, lastMessageAt: -1 });
chatRoomSchema.index({ type: 1, lastMessageAt: -1 });

const chatMessageSchema = new Schema<ChatMessageDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    roomId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true, maxlength: 160 },
    senderRole: { type: String, required: true, maxlength: 64 },
    senderAvatarUrl: { type: String, default: null },
    content: { type: String, required: true, maxlength: 8000 },
    attachments: { type: [chatAttachmentSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: null },
    readByIds: { type: [String], default: [] },
  },
  {
    collection: "ChatMessage",
    timestamps: true,
    versionKey: false,
  },
);

chatMessageSchema.index({ roomId: 1, createdAt: 1 });
chatMessageSchema.index({ senderId: 1, createdAt: -1 });

const chatGeneratedDocumentSchema = new Schema<ChatGeneratedDocumentRecord>(
  {
    _id: { type: String, default: () => randomUUID() },
    documentNumber: { type: String, required: true, trim: true },
    docType: {
      type: String,
      required: true,
      enum: [
        "SPK",
        "BAST",
        "PO",
        "DO",
        "KWITANSI",
        "LAMPIRAN_KEUANGAN",
        "LAPORAN_PROYEK",
        "SURAT_RESMI",
      ],
    },
    title: { type: String, required: true, maxlength: 220 },
    subtitle: { type: String, required: true, maxlength: 220 },
    projectId: { type: String, default: null },
    projectName: { type: String, default: null },
    ticketId: { type: String, default: null },
    recipientName: { type: String, default: null },
    amount: { type: Number, default: null },
    summary: { type: String, required: true, maxlength: 1500 },
    htmlContent: { type: String, required: true },
    structuredData: { type: Schema.Types.Mixed, default: null },
    createdById: { type: String, required: true },
    createdByName: { type: String, required: true },
    createdByRole: { type: String, required: true },
  },
  {
    collection: "ChatGeneratedDocument",
    timestamps: true,
    versionKey: false,
  },
);

chatGeneratedDocumentSchema.index({ documentNumber: 1 }, { unique: true });
chatGeneratedDocumentSchema.index({ createdById: 1, createdAt: -1 });
chatGeneratedDocumentSchema.index({ projectId: 1, createdAt: -1 });

const chatPresenceSchema = new Schema<ChatPresenceDocument>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, trim: true },
    userName: { type: String, required: true, maxlength: 160 },
    userRole: { type: String, required: true, maxlength: 64 },
    lastActiveAt: { type: Date, default: () => new Date() },
    typingInRoomId: { type: String, default: null },
    typingUpdatedAt: { type: Date, default: null },
  },
  {
    collection: "ChatPresence",
    timestamps: true,
    versionKey: false,
  },
);

chatPresenceSchema.index({ userId: 1 }, { unique: true });
chatPresenceSchema.index({ lastActiveAt: -1 });
chatPresenceSchema.index({ typingInRoomId: 1, typingUpdatedAt: -1 });

export const ChatPresenceModel =
  models.ChatPresence ||
  model<ChatPresenceDocument>("ChatPresence", chatPresenceSchema);

export const ChatRoomModel =
  models.ChatRoom || model<ChatRoomDocument>("ChatRoom", chatRoomSchema);

export const ChatMessageModel =
  models.ChatMessage ||
  model<ChatMessageDocument>("ChatMessage", chatMessageSchema);

export const ChatGeneratedDocumentModel =
  models.ChatGeneratedDocument ||
  model<ChatGeneratedDocumentRecord>(
    "ChatGeneratedDocument",
    chatGeneratedDocumentSchema,
  );
