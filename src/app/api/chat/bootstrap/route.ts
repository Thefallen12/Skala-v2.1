import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import { prisma } from "@/lib/prisma";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";
import {
  ChatGeneratedDocumentModel,
  type ChatGeneratedDocumentRecord,
  ChatMessageModel,
  type ChatPresenceDocument,
  ChatPresenceModel,
  ChatRoomModel,
  type ChatRoomDocument,
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

const DEFAULT_TEAM_CHANNELS = [
  {
    roomKey: "channel:general",
    name: "Ruang Koordinasi Umum",
    description: "Komunikasi lintas divisi & pengumuman tim",
  },
  {
    roomKey: "channel:lapangan",
    name: "Tim Lapangan & Proyek",
    description: "Koordinasi progres fisik, kurva-S, & survey",
  },
  {
    roomKey: "channel:logistik",
    name: "Logistik, Gudang & Armada",
    description: "Koordinasi PO, DO, material alam, & armada",
  },
  {
    roomKey: "channel:keuangan",
    name: "Keuangan & Otorisasi Direksi",
    description: "Koordinasi bon, kwitansi, kas, & persetujuan",
  },
] as const;

const HERMES_WELCOME_CONTENT = [
  "Halo! Saya **Bunglon Assistant (SKALA AI)** — rekan kerja asisten cerdas Anda di **PT Skala Prioritas Engineering** 👋",
  "",
  "Saya siap ngobrol santai sekaligus membantu pekerjaan Anda, antara lain:",
  "- **Menjawab & mengecek data real-time** proyek, progres Kurva-S, tiket pengajuan, dan stok gudang",
  "- **Membantu menginput data ke ERP**, seperti Laporan Harian Proyek, Pengajuan Tiket Baru, dan Catatan Kerja",
  "- **Membuat & mencetak dokumen resmi PDF A4** (Kwitansi, Lampiran Bon, SPK, BAST, PO, Surat Jalan, Laporan Proyek, & Surat Resmi)",
  "- **Ikut berdiskusi di grup chat tim** — cukup ketik **`@bunglon`** atau **`@skala`** di dalam kanal divisi!",
  "",
  "Silakan tulis kebutuhan Anda di bawah atau pilih tombol cepat yang tersedia ya.",
].join("\n");

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 11000 ||
    (typeof candidate.message === "string" && candidate.message.includes("E11000"))
  );
}

interface RoomSpec {
  roomKey: string;
  type: ChatRoomType;
  name: string;
  description: string | null;
  participantIds: string[];
}

/**
 * Ensures every room in `specs` exists using a constant number of queries:
 * one `$in` lookup, plus (only when rooms are missing) one bulk upsert and
 * one `$in` re-fetch. Replaces per-room findOne/findOneAndUpdate calls.
 */
async function ensureRoomsByKey(
  specs: RoomSpec[],
): Promise<Map<string, { room: ChatRoomDocument; created: boolean }>> {
  const keys = specs.map((spec) => spec.roomKey);
  const result = new Map<string, { room: ChatRoomDocument; created: boolean }>();

  const existing = await ChatRoomModel.find({ roomKey: { $in: keys } }).lean<ChatRoomDocument[]>();
  for (const room of existing) {
    result.set(room.roomKey, { room, created: false });
  }

  const missing = specs.filter((spec) => !result.has(spec.roomKey));
  if (missing.length === 0) {
    return result;
  }

  const now = new Date();
  let upsertedKeys = new Set<string>();
  try {
    const bulkResult = await ChatRoomModel.bulkWrite(
      missing.map((spec) => ({
        updateOne: {
          filter: { roomKey: spec.roomKey },
          update: {
            $setOnInsert: {
              _id: randomUUID(),
              type: spec.type,
              roomKey: spec.roomKey,
              name: spec.name,
              description: spec.description,
              participantIds: spec.participantIds,
              lastMessageText: null,
              lastMessageAt: now,
              lastMessageSenderId: null,
              lastMessageSenderName: null,
              unreadCounts: {},
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    const upsertedIndexes = Object.keys(bulkResult.upsertedIds ?? {}).map(Number);
    upsertedKeys = new Set(
      upsertedIndexes
        .map((index) => missing[index]?.roomKey)
        .filter((key): key is string => typeof key === "string"),
    );
  } catch (error) {
    // A concurrent request may have created the same room (unique roomKey index).
    // Those rooms are picked up by the re-fetch below; anything else is a real failure.
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const created = await ChatRoomModel.find({
    roomKey: { $in: missing.map((spec) => spec.roomKey) },
  }).lean<ChatRoomDocument[]>();
  for (const room of created) {
    result.set(room.roomKey, { room, created: upsertedKeys.has(room.roomKey) });
  }

  const stillMissing = missing.filter((spec) => !result.has(spec.roomKey));
  if (stillMissing.length > 0) {
    throw new Error(
      `Gagal membuat ruang chat ${stillMissing.map((spec) => spec.roomKey).join(", ")}.`,
    );
  }

  return result;
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

function formatPaguSafely(rawPagu: unknown): { pagu: string; paguFormatted: string } {
  let decimalStr = "0";
  let numericValue = 0;

  if (typeof rawPagu === "bigint") {
    decimalStr = decimalStringFromScaledInteger(rawPagu);
    numericValue = Number(decimalStr);
  } else if (typeof rawPagu === "number" && Number.isFinite(rawPagu)) {
    decimalStr = String(rawPagu);
    numericValue = rawPagu;
  } else if (typeof rawPagu === "string" && rawPagu.trim()) {
    const parsed = Number(rawPagu.trim());
    if (Number.isFinite(parsed)) {
      decimalStr = String(parsed);
      numericValue = parsed;
    }
  }

  const safeNumber = Number.isFinite(numericValue) ? numericValue : 0;
  const paguFormatted = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(safeNumber);

  return { pagu: decimalStr, paguFormatted };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu untuk mengakses ruang chat." },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  try {
    await connectToMongoDB();

    await ChatPresenceModel.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          _id: userId,
          userId,
        },
        $set: {
          userName: (session.user.name ?? "Pengguna").slice(0, 160),
          userRole: String(session.user.role || "FIELD_TEAM").slice(0, 64),
          lastActiveAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    const hermesRoomKey = `hermes:${userId}`;
    const ensuredRooms = await ensureRoomsByKey([
      ...DEFAULT_TEAM_CHANNELS.map((channel) => ({
        roomKey: channel.roomKey,
        type: "CHANNEL" as const,
        name: channel.name,
        description: channel.description,
        participantIds: [],
      })),
      {
        roomKey: hermesRoomKey,
        type: "HERMES",
        name: "Bunglon Assistant (SKALA AI)",
        description: "Asisten Cerdas Input Data, Dokumen & Koordinasi Tim ERP",
        participantIds: [userId],
      },
    ]);
    const ensuredHermes = ensuredRooms.get(hermesRoomKey);
    if (!ensuredHermes) {
      throw new Error(`Gagal membuat ruang chat ${hermesRoomKey}.`);
    }
    const { room: ensuredHermesRoom, created: hermesCreated } = ensuredHermes;

    if (!hermesCreated && ensuredHermesRoom.name === "Hermes Assistant") {
      await ChatRoomModel.updateOne(
        { _id: ensuredHermesRoom._id },
        {
          $set: {
            name: "Bunglon Assistant (SKALA AI)",
            description: "Asisten Cerdas Input Data, Dokumen & Koordinasi Tim ERP",
          },
        },
      );
    }

    if (hermesCreated) {
      const existingMessages = await ChatMessageModel.countDocuments({
        roomId: String(ensuredHermesRoom._id),
      });
      if (existingMessages === 0) {
        const welcomePreview =
          "Halo! Saya Bunglon Assistant (SKALA AI), siap bantu input data, jawab pertanyaan, & buat laporan PDF.";
        await ChatMessageModel.findOneAndUpdate(
          {
            roomId: String(ensuredHermesRoom._id),
            "metadata.isWelcome": true,
          },
          {
            $setOnInsert: {
              _id: randomUUID(),
              roomId: String(ensuredHermesRoom._id),
              senderId: "hermes-assistant",
              senderName: "Bunglon Assistant (SKALA AI)",
              senderRole: "BUNGLON_AI",
              senderAvatarUrl: null,
              content: HERMES_WELCOME_CONTENT,
              attachments: [],
              metadata: { isWelcome: true, source: "system" },
              readByIds: [userId],
            },
          },
          { upsert: true, returnDocument: "after" },
        );
        await ChatRoomModel.findOneAndUpdate(
          { _id: ensuredHermesRoom._id, lastMessageText: null },
          {
            $set: {
              lastMessageText: welcomePreview,
              lastMessageAt: new Date(),
              lastMessageSenderId: "hermes-assistant",
              lastMessageSenderName: "Bunglon Assistant (SKALA AI)",
            },
          },
        );
      }
    }

    const [
      activeUsers,
      presenceDocs,
      channelDocs,
      directDocs,
      hermesDoc,
      rawProjects,
      rawTickets,
      rawDocuments,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profilePhotoUrl: true,
          lastLoginAt: true,
        },
        orderBy: { name: "asc" },
      }),
      ChatPresenceModel.find().lean<ChatPresenceDocument[]>(),
      ChatRoomModel.find({ type: "CHANNEL" })
        .sort({ lastMessageAt: -1 })
        .lean<ChatRoomDocument[]>(),
      ChatRoomModel.find({ type: "DIRECT", participantIds: userId })
        .sort({ lastMessageAt: -1 })
        .lean<ChatRoomDocument[]>(),
      ChatRoomModel.findOne({ roomKey: hermesRoomKey }).lean<ChatRoomDocument | null>(),
      prisma.project.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          code: true,
          name: true,
          title: true,
          kelompokTani: true,
          location: true,
          progress: true,
          pagu: true,
        },
        take: 50,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.ticket.findMany({
        take: 25,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          projectId: true,
        },
      }),
      ChatGeneratedDocumentModel.find({ createdById: userId })
        .select("-htmlContent")
        .sort({ createdAt: -1 })
        .limit(15)
        .lean<Omit<ChatGeneratedDocumentRecord, "htmlContent">[]>(),
    ]);

    const ONLINE_THRESHOLD_MS = 120_000;
    const TYPING_THRESHOLD_MS = 8_000;
    const nowMs = Date.now();
    const presenceByUserId = new Map<string, ChatPresenceDocument>();
    for (const doc of presenceDocs) {
      presenceByUserId.set(doc.userId, doc);
    }

    const users = activeUsers
      .map((u) => {
        const presence = presenceByUserId.get(u.id);
        const loginMs = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0;
        const activeMs = presence?.lastActiveAt
          ? new Date(presence.lastActiveAt).getTime()
          : 0;
        const bestMs = Math.max(loginMs, activeMs, u.id === userId ? nowMs : 0);
        const lastSeenAt = bestMs > 0 ? new Date(bestMs).toISOString() : null;
        const isOnline =
          u.id === userId || (bestMs > 0 && nowMs - bestMs <= ONLINE_THRESHOLD_MS);
        const typingUpdatedMs = presence?.typingUpdatedAt
          ? new Date(presence.typingUpdatedAt).getTime()
          : 0;
        const typingInRoomId =
          presence?.typingInRoomId &&
          typingUpdatedMs > 0 &&
          nowMs - typingUpdatedMs <= TYPING_THRESHOLD_MS
            ? presence.typingInRoomId
            : null;

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          profilePhotoUrl: u.profilePhotoUrl ?? null,
          lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
          lastSeenAt,
          isOnline,
          typingInRoomId,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "id"));

    const currentUserRecord = users.find((u) => u.id === userId);
    const currentUser = {
      id: userId,
      name: currentUserRecord?.name ?? session.user.name ?? "Pengguna",
      role: currentUserRecord?.role ?? session.user.role,
      profilePhotoUrl: currentUserRecord?.profilePhotoUrl ?? session.user.image ?? null,
    };

    const channels = channelDocs.map((room) => serializeRoom(room, userId));
    const directRooms = directDocs.map((room) => serializeRoom(room, userId));
    const hermesRoom = hermesDoc
      ? serializeRoom(hermesDoc, userId)
      : serializeRoom(ensuredHermesRoom, userId);

    const totalUnread = [...channels, ...directRooms].reduce(
      (sum, room) => sum + room.unreadCount,
      0,
    );

    const projects = rawProjects.map((project) => {
      const { pagu, paguFormatted } = formatPaguSafely(project.pagu);
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        title: project.title,
        kelompokTani: project.kelompokTani,
        location: project.location ?? null,
        progress: Number.isFinite(Number(project.progress)) ? Number(project.progress) : 0,
        pagu,
        paguFormatted,
      };
    });

    const tickets = rawTickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      projectId: ticket.projectId ?? null,
    }));

    const recentDocuments = rawDocuments.map((doc) => ({
      id: String(doc._id),
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
      structuredData: doc.structuredData ?? null,
      createdById: doc.createdById,
      createdByName: doc.createdByName,
      createdByRole: doc.createdByRole,
      createdAt: doc.createdAt
        ? new Date(doc.createdAt).toISOString()
        : new Date().toISOString(),
      previewUrl: `/api/chat/hermes/document/${doc._id}?format=html`,
      downloadUrl: `/api/chat/hermes/document/${doc._id}?format=pdf&download=1`,
    }));

    return NextResponse.json({
      currentUser,
      users,
      channels,
      directRooms,
      hermesRoom,
      totalUnread,
      projects,
      tickets,
      recentDocuments,
    });
  } catch (error) {
    console.error("[Chat Bootstrap] Gagal memuat data awal chat:", error);
    return NextResponse.json(
      { message: "Gagal memuat ruang chat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
