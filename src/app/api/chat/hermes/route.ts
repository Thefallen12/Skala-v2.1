import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { connectToMongoDB, isMongoConnectionError } from "@/lib/mongoose";
import {
  getRequestOrigin,
  resolvePublicAppUrl,
} from "@/lib/documents/public-app-url";
import {
  buildBuiltinErpReply,
  callHermesGateway,
  checkHermesGatewayStatus,
  detectDocumentIntent,
  generateHermesDocument,
  isHermesDocType,
  loadErpContextSummary,
  type HermesDocParams,
} from "@/lib/hermes/hermes-engine";
import {
  ChatMessageModel,
  ChatRoomModel,
  type ChatAttachmentItem,
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
  customGatewayUrl?: unknown;
  customApiKey?: unknown;
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

  const message =
    rawMessage ||
    (explicitDocType ? `Buatkan dokumen ${explicitDocType}` : "");

  if (!message) {
    return NextResponse.json(
      { message: "Pesan tidak boleh kosong." },
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
        name: "Hermes Assistant",
        description: "Asisten AI Dokumen, Lampiran Keuangan & Operasional",
        participantIds: [userId],
        unreadCounts: {},
        lastMessageAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
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
    attachments: [],
    metadata: {
      projectId,
      ticketId,
      docType: explicitDocType,
    },
    readByIds: [userId],
  });

  const [erpContext, gatewayStatus] = await Promise.all([
    loadErpContextSummary(projectId, ticketId),
    checkHermesGatewayStatus(customGatewayUrl, customApiKey),
  ]);

  const intent = detectDocumentIntent(message, explicitDocType);

  let assistantContent = "";
  let attachments: ChatAttachmentItem[] = [];
  let generatedDocument: ChatGeneratedDocumentRecord | null = null;
  let engineUsed: "hermes-gateway" | "hermes-builtin-erp" = "hermes-builtin-erp";

  if (intent.isDocumentRequest && intent.docType) {
    const verificationBaseUrl =
      resolvePublicAppUrl(getRequestOrigin(request.headers)) ??
      new URL(request.nextUrl.origin);

    const generated = await generateHermesDocument({
      docType: intent.docType,
      prompt: message,
      projectId,
      ticketId,
      docParams,
      user: { id: userId, name: userName, role: userRole },
      verificationBaseUrl,
      erpContext,
      gatewayStatus,
      detectedIntent: intent,
      customGatewayUrl,
      customApiKey,
    });

    generatedDocument = generated.document;
    engineUsed = generated.engineUsed;

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
    attachments = [attachment];

    assistantContent = [
      `Dokumen **${generatedDocument.title}** telah berhasil disusun dengan nomor **\`${generatedDocument.documentNumber}\`**.`,
      generatedDocument.projectName
        ? `- **Proyek:** ${generatedDocument.projectName}`
        : null,
      generatedDocument.recipientName
        ? `- **Pihak / Tujuan:** ${generatedDocument.recipientName}`
        : null,
      generatedDocument.amount !== null
        ? `- **Nominal:** ${new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0,
          }).format(generatedDocument.amount)}`
        : null,
      "",
      "Silakan buka pratinjau HTML atau unduh PDF A4 siap cetak melalui lampiran dokumen di bawah ini.",
    ]
      .filter((line) => line !== null)
      .join("\n");
  } else {
    const gatewayReply = gatewayStatus.gatewayOnline
      ? await callHermesGateway({
          message,
          erpContext,
          userName,
          userRole,
          conversationHistory,
          customGatewayUrl,
          customApiKey,
        })
      : null;

    if (gatewayReply) {
      assistantContent = gatewayReply;
      engineUsed = "hermes-gateway";
    } else {
      assistantContent = buildBuiltinErpReply(message, erpContext, gatewayStatus);
      engineUsed = "hermes-builtin-erp";
    }
  }

  const assistantMessageDoc = await ChatMessageModel.create({
    _id: randomUUID(),
    roomId: roomDoc._id,
    senderId: "hermes-assistant",
    senderName: "Hermes Assistant",
    senderRole: "AI_ASSISTANT",
    senderAvatarUrl: null,
    content: assistantContent.slice(0, 8000),
    attachments,
    metadata: {
      engineUsed,
      gatewayOnline: gatewayStatus.gatewayOnline,
      gatewayUrl: gatewayStatus.gatewayUrl,
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
        lastMessageSenderName: "Hermes Assistant",
      },
    },
    { new: true },
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
    engineUsed,
  });
}
