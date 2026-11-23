import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { auth } from "@/../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  type ChatAttachmentItem,
  type ChatAttachmentKind,
  type ChatMessageDocument,
  ChatMessageModel,
  type ChatRoomDocument,
  ChatRoomModel,
  type ChatRoomType,
} from "@/models/chat";

export const runtime = "nodejs";

interface ChatRoomDto {
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

interface ChatMessageDto {
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

const VALID_ATTACHMENT_KINDS = new Set<ChatAttachmentKind>([
  "DOCUMENT",
  "ATTACHMENT",
  "IMAGE",
  "FILE",
]);

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 11000 ||
    (typeof candidate.message === "string" && candidate.message.includes("E11000"))
  );
}

function serializeRoom(room: ChatRoomDocument, currentUserId: string): ChatRoomDto {
  const unreadCounts = room.unreadCounts as Record<string, number> | undefined;
  const rawUnread = Number(unreadCounts?.[currentUserId] ?? 0);
  const unreadCount = Number.isFinite(rawUnread) && rawUnread > 0 ? rawUnread : 0;

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
    unreadCount,
  };
}

function serializeMessage(msg: ChatMessageDocument): ChatMessageDto {
  return {
    id: String(msg._id),
    roomId: String(msg.roomId),
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderRole: msg.senderRole,
    senderAvatarUrl: msg.senderAvatarUrl ?? null,
    content: msg.content,
    attachments: Array.isArray(msg.attachments)
      ? msg.attachments.map((att) => ({
          id: String(att.id),
          title: att.title,
          kind: att.kind,
          docType: att.docType ?? null,
          documentNumber: att.documentNumber ?? null,
          assetCode: att.assetCode ?? null,
          url: att.url,
          downloadUrl: att.downloadUrl ?? null,
          mimeType: att.mimeType ?? null,
          sizeBytes: att.sizeBytes ?? null,
          summary: att.summary ?? null,
          documentId: att.documentId ?? null,
        }))
      : [],
    metadata:
      msg.metadata && typeof msg.metadata === "object"
        ? (msg.metadata as Record<string, unknown>)
        : null,
    createdAt: msg.createdAt
      ? new Date(msg.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

type RoomResolutionResult =
  | { ok: true; room: ChatRoomDocument }
  | { ok: false; status: number; message: string };

async function resolveAccessibleRoom(params: {
  currentUserId: string;
  roomId?: string | null;
  targetUserId?: string | null;
}): Promise<RoomResolutionResult> {
  const roomId = params.roomId?.trim() || "";
  const targetUserId = params.targetUserId?.trim() || "";

  if (!roomId && !targetUserId) {
    return {
      ok: false,
      status: 400,
      message: "Parameter roomId atau targetUserId wajib disertakan.",
    };
  }

  if (targetUserId) {
    if (targetUserId === params.currentUserId) {
      return {
        ok: false,
        status: 400,
        message: "Tidak dapat membuka chat langsung dengan akun Anda sendiri.",
      };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      return {
        ok: false,
        status: 404,
        message: "Pengguna tujuan tidak ditemukan atau sudah nonaktif.",
      };
    }

    const participants = [params.currentUserId, targetUserId].sort();
    const roomKey = `dm:${participants.join(":")}`;

    const existing = await ChatRoomModel.findOne({ roomKey }).lean<ChatRoomDocument | null>();
    if (existing) {
      return { ok: true, room: existing };
    }

    try {
      const created = await ChatRoomModel.findOneAndUpdate(
        { roomKey },
        {
          $setOnInsert: {
            _id: randomUUID(),
            type: "DIRECT",
            roomKey,
            name: "Chat Langsung",
            description: null,
            participantIds: participants,
            lastMessageText: null,
            lastMessageAt: new Date(),
            lastMessageSenderId: null,
            lastMessageSenderName: null,
            unreadCounts: {},
          },
        },
        { upsert: true, new: true },
      ).lean<ChatRoomDocument | null>();

      if (!created) {
        return {
          ok: false,
          status: 500,
          message: "Gagal menyiapkan ruang chat langsung.",
        };
      }
      return { ok: true, room: created };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await ChatRoomModel.findOne({ roomKey }).lean<ChatRoomDocument | null>();
        if (raced) {
          return { ok: true, room: raced };
        }
      }
      throw error;
    }
  }

  const room = await ChatRoomModel.findById(roomId).lean<ChatRoomDocument | null>();
  if (!room) {
    return {
      ok: false,
      status: 404,
      message: "Ruang chat tidak ditemukan.",
    };
  }

  if (room.type !== "CHANNEL" && !room.participantIds.includes(params.currentUserId)) {
    return {
      ok: false,
      status: 403,
      message: "Anda tidak memiliki akses ke ruang chat ini.",
    };
  }

  return { ok: true, room };
}

function sanitizeAttachments(raw: unknown): {
  valid: boolean;
  items: ChatAttachmentItem[];
  message?: string;
} {
  if (raw === undefined || raw === null) {
    return { valid: true, items: [] };
  }
  if (!Array.isArray(raw)) {
    return { valid: false, items: [], message: "Format lampiran tidak valid." };
  }
  if (raw.length > 10) {
    return { valid: false, items: [], message: "Maksimal 10 lampiran per pesan." };
  }

  const items: ChatAttachmentItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { valid: false, items: [], message: "Item lampiran tidak valid." };
    }
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!title || !url) {
      return {
        valid: false,
        items: [],
        message: "Setiap lampiran wajib memiliki judul dan URL.",
      };
    }

    const rawKind =
      typeof record.kind === "string"
        ? (record.kind.trim().toUpperCase() as ChatAttachmentKind)
        : "FILE";
    const kind: ChatAttachmentKind = VALID_ATTACHMENT_KINDS.has(rawKind)
      ? rawKind
      : "FILE";

    items.push({
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : randomUUID(),
      title: title.slice(0, 240),
      kind,
      docType: typeof record.docType === "string" ? record.docType.trim() || null : null,
      documentNumber:
        typeof record.documentNumber === "string"
          ? record.documentNumber.trim() || null
          : null,
      assetCode:
        typeof record.assetCode === "string" ? record.assetCode.trim() || null : null,
      url,
      downloadUrl:
        typeof record.downloadUrl === "string" ? record.downloadUrl.trim() || null : null,
      mimeType:
        typeof record.mimeType === "string" ? record.mimeType.trim() || null : null,
      sizeBytes:
        typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes)
          ? record.sizeBytes
          : null,
      summary: typeof record.summary === "string" ? record.summary.trim() || null : null,
      documentId:
        typeof record.documentId === "string" ? record.documentId.trim() || null : null,
    });
  }

  return { valid: true, items };
}

function buildMessagePreview(trimmedContent: string, attachments: ChatAttachmentItem[]): string {
  const base = trimmedContent || `📎 ${attachments[0]?.title ?? "Lampiran"}`;
  if (base.length <= 120) return base;
  return `${base.slice(0, 117)}...`;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu untuk melihat pesan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const roomId = request.nextUrl.searchParams.get("roomId");
  const targetUserId = request.nextUrl.searchParams.get("targetUserId");

  try {
    await connectToMongoDB();

    const resolution = await resolveAccessibleRoom({
      currentUserId: userId,
      roomId,
      targetUserId,
    });
    if (!resolution.ok) {
      return NextResponse.json(
        { message: resolution.message },
        { status: resolution.status },
      );
    }

    const updatedRoom = await ChatRoomModel.findByIdAndUpdate(
      resolution.room._id,
      { $set: { [`unreadCounts.${userId}`]: 0 } },
      { new: true },
    ).lean<ChatRoomDocument | null>();

    const recentMessages = await ChatMessageModel.find({
      roomId: String(resolution.room._id),
    })
      .sort({ createdAt: -1 })
      .limit(150)
      .lean<ChatMessageDocument[]>();

    recentMessages.reverse();

    return NextResponse.json({
      room: serializeRoom(updatedRoom ?? resolution.room, userId),
      messages: recentMessages.map(serializeMessage),
    });
  } catch (error) {
    console.error("[Chat Messages GET] Gagal memuat pesan:", error);
    return NextResponse.json(
      { message: "Gagal memuat riwayat percakapan. Silakan coba kembali." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu untuk mengirim pesan." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Format permintaan JSON tidak valid." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { message: "Payload pesan tidak valid." },
      { status: 400 },
    );
  }

  const payload = body as {
    roomId?: unknown;
    targetUserId?: unknown;
    content?: unknown;
    attachments?: unknown;
  };

  const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
  const targetUserId =
    typeof payload.targetUserId === "string" ? payload.targetUserId : null;
  const trimmedContent =
    typeof payload.content === "string" ? payload.content.trim() : "";

  if (trimmedContent.length > 8000) {
    return NextResponse.json(
      { message: "Pesan terlalu panjang (maksimal 8.000 karakter)." },
      { status: 400 },
    );
  }

  const attachmentValidation = sanitizeAttachments(payload.attachments);
  if (!attachmentValidation.valid) {
    return NextResponse.json(
      { message: attachmentValidation.message ?? "Lampiran tidak valid." },
      { status: 400 },
    );
  }

  const attachments = attachmentValidation.items;
  if (!trimmedContent && attachments.length === 0) {
    return NextResponse.json(
      { message: "Tulis pesan atau sertakan lampiran sebelum mengirim." },
      { status: 400 },
    );
  }

  const userId = session.user.id;

  try {
    await connectToMongoDB();

    const resolution = await resolveAccessibleRoom({
      currentUserId: userId,
      roomId,
      targetUserId,
    });
    if (!resolution.ok) {
      return NextResponse.json(
        { message: resolution.message },
        { status: resolution.status },
      );
    }

    const room = resolution.room;

    const senderRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        profilePhotoUrl: true,
      },
    });

    const senderName = senderRecord?.name ?? session.user.name ?? "Pengguna";
    const senderRole = senderRecord?.role ?? session.user.role;
    const senderAvatarUrl =
      senderRecord?.profilePhotoUrl ?? session.user.image ?? null;

    const now = new Date();
    const messageContent = trimmedContent || "[Lampiran]";
    const previewText = buildMessagePreview(trimmedContent, attachments);

    const createdMessage = await ChatMessageModel.create({
      _id: randomUUID(),
      roomId: String(room._id),
      senderId: userId,
      senderName,
      senderRole,
      senderAvatarUrl,
      content: messageContent,
      attachments,
      metadata: null,
      readByIds: [userId],
      createdAt: now,
      updatedAt: now,
    });

    let recipientIds: string[] = [];
    if (room.type === "DIRECT") {
      recipientIds = room.participantIds.filter((id) => id && id !== userId);
    } else if (room.type === "CHANNEL") {
      const otherUsers = await prisma.user.findMany({
        where: { isActive: true, id: { not: userId } },
        select: { id: true },
      });
      recipientIds = Array.from(
        new Set(otherUsers.map((u) => u.id).filter((id) => id && id !== userId)),
      );
    }

    const incFields: Record<string, number> = {};
    for (const recipientId of recipientIds) {
      incFields[`unreadCounts.${recipientId}`] = 1;
    }

    const updateQuery: {
      $set: Record<string, unknown>;
      $inc?: Record<string, number>;
    } = {
      $set: {
        lastMessageText: previewText,
        lastMessageAt: now,
        lastMessageSenderId: userId,
        lastMessageSenderName: senderName,
        [`unreadCounts.${userId}`]: 0,
      },
    };
    if (Object.keys(incFields).length > 0) {
      updateQuery.$inc = incFields;
    }

    const updatedRoom = await ChatRoomModel.findByIdAndUpdate(room._id, updateQuery, {
      new: true,
    }).lean<ChatRoomDocument | null>();

    if (room.type === "DIRECT") {
      const directRecipientId = room.participantIds.find((id) => id && id !== userId);
      if (directRecipientId) {
        try {
          await sendNotification({
            userId: directRecipientId,
            title: `Pesan Baru dari ${senderName}`.slice(0, 180),
            message: previewText,
            actionUrl: `/?openChat=${encodeURIComponent(String(room._id))}`,
            type: NotificationType.INFO,
          });
        } catch (notificationError) {
          console.error(
            "[Chat Messages POST] Gagal mengirim notifikasi DM:",
            notificationError,
          );
        }
      }
    }

    const serializedMessage = serializeMessage(
      createdMessage.toObject() as ChatMessageDocument,
    );
    const serializedRoom = serializeRoom(updatedRoom ?? room, userId);

    return NextResponse.json(
      { room: serializedRoom, message: serializedMessage },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Chat Messages POST] Gagal mengirim pesan:", error);
    return NextResponse.json(
      { message: "Gagal mengirim pesan. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
