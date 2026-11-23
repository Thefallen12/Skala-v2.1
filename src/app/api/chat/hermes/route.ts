import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { connectToMongoDB, isMongoConnectionError } from "@/lib/mongoose";
import {
  getRequestOrigin,
  resolvePublicAppUrl,
} from "@/lib/documents/public-app-url";
import {
  isHermesDocType,
  runBunglonAssistantTurn,
  type ErpDataInputPayload,
  type HermesDocParams,
} from "@/lib/hermes/hermes-engine";
import {
  ChatMessageModel,
  ChatRoomModel,
  type ChatAttachmentItem,
  type ChatAttachmentKind,
  type ChatDataActionType,
  type ChatGeneratedDocumentRecord,
  type ChatMessageDocument,
  type ChatRoomDocument,
  type HermesDocType,
} from "@/models/chat";

export const runtime = "nodejs";

function serializeRoomDto(room: ChatRoomDocument, currentUserId: string) {
  const unreadCounts = room.unreadCounts as Record<string, number> | undefined;
  const rawUnread = Number(unreadCounts?.[currentUserId] ?? 0);
  return {
    id: String(room._id),
    type: room.type,
    roomKey: room.roomKey,
    name: room.name,
    description: room.description ?? null,
    participantIds: Array.isArray(room.participantIds) ? room.participantIds : [],
    lastMessageText: room.lastMessageText ?? null,
    lastMessageAt: room.lastMessageAt
      ? new Date(room.lastMessageAt).toISOString()
      : new Date().toISOString(),
    lastMessageSenderId: room.lastMessageSenderId ?? null,
    lastMessageSenderName: room.lastMessageSenderName ?? null,
    unreadCount: Number.isFinite(rawUnread) && rawUnread > 0 ? rawUnread : 0,
  };
}

function serializeMessageDto(msg: ChatMessageDocument) {
  return {
    id: String(msg._id),
    roomId: String(msg.roomId),
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderRole: msg.senderRole,
    senderAvatarUrl: msg.senderAvatarUrl ?? null,
    content: msg.content,
    attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
    metadata:
      msg.metadata && typeof msg.metadata === "object"
        ? (msg.metadata as Record<string, unknown>)
        : null,
    createdAt: msg.createdAt
      ? new Date(msg.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

function serializeGeneratedDocumentDto(doc: ChatGeneratedDocumentRecord) {
  const id = String(doc._id);
  return {
    id,
    documentNumber: doc.documentNumber,
    docType: doc.docType,
    title: doc.title,
    subtitle: doc.subtitle,
    projectId: doc.projectId ?? null,
    projectName: doc.projectName ?? null,
    ticketId: doc.ticketId ?? null,
    recipientName: doc.recipientName ?? null,
    amount: doc.amount ?? null,
    summary: doc.summary,
    createdAt: doc.createdAt
      ? new Date(doc.createdAt).toISOString()
      : new Date().toISOString(),
    previewUrl: `/api/chat/hermes/document/${id}?format=html`,
    downloadUrl: `/api/chat/hermes/document/${id}?format=pdf&download=1`,
  };
}

interface HermesChatRequestBody {
  message?: unknown;
  projectId?: unknown;
  ticketId?: unknown;
  docType?: unknown;
  docParams?: unknown;
  dataInput?: unknown;
  attachments?: unknown;
  customGatewayUrl?: unknown;
  customApiKey?: unknown;
}

const VALID_HERMES_ATTACHMENT_KINDS = new Set<ChatAttachmentKind>([
  "DOCUMENT",
  "ATTACHMENT",
  "IMAGE",
  "FILE",
]);

function sanitizeHermesAttachments(raw: unknown): ChatAttachmentItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ChatAttachmentItem[] = [];
  for (const entry of raw.slice(0, 10)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!title || !url) continue;

    const rawKind =
      typeof record.kind === "string"
        ? (record.kind.trim().toUpperCase() as ChatAttachmentKind)
        : "FILE";
    const kind: ChatAttachmentKind = VALID_HERMES_ATTACHMENT_KINDS.has(rawKind)
      ? rawKind
      : "FILE";

    items.push({
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : randomUUID(),
      title: title.slice(0, 240),
      kind,
      docType:
        typeof record.docType === "string" ? record.docType.trim() || null : null,
      documentNumber:
        typeof record.documentNumber === "string"
          ? record.documentNumber.trim() || null
          : null,
      assetCode:
        typeof record.assetCode === "string"
          ? record.assetCode.trim() || null
          : null,
      url,
      downloadUrl:
        typeof record.downloadUrl === "string"
          ? record.downloadUrl.trim() || null
          : null,
      mimeType:
        typeof record.mimeType === "string" ? record.mimeType.trim() || null : null,
      sizeBytes:
        typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes)
          ? record.sizeBytes
          : null,
      summary:
        typeof record.summary === "string" ? record.summary.trim() || null : null,
      documentId:
        typeof record.documentId === "string"
          ? record.documentId.trim() || null
          : null,
    });
  }
  return items;
}

const VALID_DATA_ACTION_TYPES = new Set<ChatDataActionType>([
  "DAILY_REPORT",
  "CREATE_TICKET",
  "CREATE_NOTE",
]);

function parseDataInputPayload(raw: unknown): ErpDataInputPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const rawAction =
    typeof record.actionType === "string"
      ? (record.actionType.trim().toUpperCase() as ChatDataActionType)
      : null;
  if (!rawAction || !VALID_DATA_ACTION_TYPES.has(rawAction)) {
    return null;
  }
  return {
    actionType: rawAction,
    projectId:
      typeof record.projectId === "string" ? record.projectId.trim() || null : null,
    title: typeof record.title === "string" ? record.title.trim() || null : null,
    category:
      typeof record.category === "string" ? record.category.trim() || null : null,
    amount:
      typeof record.amount === "number" && Number.isFinite(record.amount)
        ? record.amount
        : null,
    progress:
      typeof record.progress === "number" && Number.isFinite(record.progress)
        ? record.progress
        : null,
    workersCount:
      typeof record.workersCount === "number" && Number.isFinite(record.workersCount)
        ? record.workersCount
        : null,
    weather:
      typeof record.weather === "string" ? record.weather.trim() || null : null,
    notes: typeof record.notes === "string" ? record.notes.trim() || null : null,
  };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk untuk menggunakan Hermes Assistant." },
      { status: 401 },
    );
  }

  let body: HermesChatRequestBody;
  try {
    body = (await request.json()) as HermesChatRequestBody;
  } catch {
    return NextResponse.json(
      { message: "Payload JSON tidak valid." },
      { status: 400 },
    );
  }

  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  const rawDocType = body.docType;
  let explicitDocType: HermesDocType | null = null;
  if (rawDocType !== undefined && rawDocType !== null && rawDocType !== "") {
    if (!isHermesDocType(rawDocType)) {
      return NextResponse.json(
        { message: "Jenis dokumen Hermes tidak dikenali." },
        { status: 400 },
      );
    }
    explicitDocType = rawDocType;
  }

  const dataInput = parseDataInputPayload(body.dataInput);
  const userAttachments = sanitizeHermesAttachments(body.attachments);

  const message =
    rawMessage ||
    (explicitDocType
      ? `Buatkan dokumen ${explicitDocType}`
      : dataInput
        ? `Input data ${dataInput.actionType}${dataInput.title ? `: ${dataInput.title}` : ""}`
        : userAttachments.length > 0
          ? `Saya melampirkan ${userAttachments.map((a) => a.title).join(", ")}. Tolong bantu cek lampiran ini.`
          : "");

  if (!message && userAttachments.length === 0) {
    return NextResponse.json(
      { message: "Pesan atau lampiran tidak boleh kosong." },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { message: "Pesan terlalu panjang (maksimal 4000 karakter)." },
      { status: 400 },
    );
  }

  const projectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : null;
  const ticketId =
    typeof body.ticketId === "string" && body.ticketId.trim()
      ? body.ticketId.trim()
      : null;
  const customGatewayUrl =
    typeof body.customGatewayUrl === "string" ? body.customGatewayUrl.trim() : null;
  const customApiKey =
    typeof body.customApiKey === "string" ? body.customApiKey.trim() : null;
  const docParams =
    body.docParams && typeof body.docParams === "object" && !Array.isArray(body.docParams)
      ? (body.docParams as HermesDocParams)
      : null;

  try {
    await connectToMongoDB();
  } catch (error) {
    console.error("Hermes chat MongoDB connection failed:", error);
    return NextResponse.json(
      {
        message: isMongoConnectionError(error)
          ? "Koneksi MongoDB untuk penyimpanan chat tidak tersedia."
          : "Gagal terhubung ke database chat.",
      },
      { status: 503 },
    );
  }

  const userId = session.user.id;
  const userName = session.user.name || "Pengguna Skala";
  const userRole = String(session.user.role);
  const roomKey = `hermes:${userId}`;

  const roomDoc = await ChatRoomModel.findOneAndUpdate(
    { roomKey },
    {
      $setOnInsert: {
        _id: randomUUID(),
        type: "HERMES",
        roomKey,
        name: "Bunglon Assistant (SKALA AI)",
        description: "Asisten Cerdas Input Data, Dokumen & Koordinasi Tim ERP",
        participantIds: [userId],
        unreadCounts: {},
        lastMessageAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  const recentMessages = await ChatMessageModel.find({ roomId: roomDoc._id })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  const conversationHistory = recentMessages
    .reverse()
    .map((m) => ({
      role: (m.senderId === userId ? "user" : "assistant") as "user" | "assistant",
      content: String(m.content ?? ""),
    }))
    .filter((m) => m.content.length > 0);

  const userMessageDoc = await ChatMessageModel.create({
    _id: randomUUID(),
    roomId: roomDoc._id,
    senderId: userId,
    senderName: userName.slice(0, 160),
    senderRole: userRole.slice(0, 64),
    senderAvatarUrl: session.user.image ?? null,
    content: message.slice(0, 8000),
    attachments: userAttachments,
    metadata: {
      projectId,
      ticketId,
      docType: explicitDocType,
      dataActionType: dataInput?.actionType ?? null,
    },
    readByIds: [userId],
  });

  const verificationBaseUrl =
    resolvePublicAppUrl(getRequestOrigin(request.headers)) ??
    new URL(request.nextUrl.origin);

  const turn = await runBunglonAssistantTurn({
    message,
    user: { id: userId, name: userName, role: userRole },
    projectId,
    ticketId,
    docType: explicitDocType,
    docParams,
    dataInput,
    conversationHistory,
    customGatewayUrl,
    customApiKey,
    verificationBaseUrl,
  });

  const {
    assistantContent,
    attachments,
    generatedDocument,
    dataActionResult,
    thinkingSteps,
    engineUsed,
    gatewayStatus,
  } = turn;

  const assistantMessageDoc = await ChatMessageModel.create({
    _id: randomUUID(),
    roomId: roomDoc._id,
    senderId: "hermes-assistant",
    senderName: "Bunglon Assistant (SKALA AI)",
    senderRole: "BUNGLON_AI",
    senderAvatarUrl: null,
    content: assistantContent.slice(0, 8000),
    attachments,
    metadata: {
      engineUsed,
      gatewayOnline: gatewayStatus.gatewayOnline,
      gatewayUrl: gatewayStatus.gatewayUrl,
      thinkingSteps,
      dataActionResult,
      docType: generatedDocument?.docType ?? null,
      documentId: generatedDocument?._id ?? null,
      documentNumber: generatedDocument?.documentNumber ?? null,
    },
    readByIds: [userId],
  });

  const updatedRoomDoc = await ChatRoomModel.findByIdAndUpdate(
    roomDoc._id,
    {
      $set: {
        lastMessageText: assistantContent.replace(/\s+/g, " ").trim().slice(0, 490),
        lastMessageAt: assistantMessageDoc.createdAt ?? new Date(),
        lastMessageSenderId: "hermes-assistant",
        lastMessageSenderName: "Bunglon Assistant (SKALA AI)",
      },
    },
    { returnDocument: "after" },
  );

  const resolvedRoom = (updatedRoomDoc
    ? updatedRoomDoc.toObject()
    : roomDoc.toObject()) as ChatRoomDocument;

  return NextResponse.json({
    room: serializeRoomDto(resolvedRoom, userId),
    userMessage: serializeMessageDto(
      userMessageDoc.toObject() as ChatMessageDocument,
    ),
    assistantMessage: serializeMessageDto(
      assistantMessageDoc.toObject() as ChatMessageDocument,
    ),
    generatedDocument: generatedDocument
      ? serializeGeneratedDocumentDto(generatedDocument)
      : null,
    dataActionResult,
    thinkingSteps,
    engineUsed,
  });
}
