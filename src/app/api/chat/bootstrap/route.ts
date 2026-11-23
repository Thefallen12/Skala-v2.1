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
  "Halo! Saya **Hermes Assistant**, asisten AI resmi untuk operasional & administrasi **Skala Prioritas Engineering**.",
  "",
  "Saya dapat membantu Anda menyusun dan mencetak dokumen kerja otomatis langsung dari percakapan ini, antara lain:",
  "- **Kwitansi & Lampiran Bon Keuangan** (bon lapangan, kasbon, reimburse, bukti transfer)",
  "- **SPK (Surat Perintah Kerja)** & **BAST (Berita Acara Serah Terima)**",
  "- **Purchase Order (PO)** & **Surat Jalan / Delivery Order (DO)**",
  "- **Laporan Progres Proyek** & **Memo / Surat Resmi Perusahaan**",
  "",
  "Saya juga terhubung dengan gateway **NousResearch Hermes CLI** untuk analisis teks dan penyusunan draf dokumen cepat. Pilih proyek atau tiket terkait jika diperlukan, lalu tuliskan instruksi Anda!",
].join("\n");

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 11000 ||
    (typeof candidate.message === "string" && candidate.message.includes("E11000"))
  );
}

async function upsertRoomByKey(params: {
  roomKey: string;
  type: ChatRoomType;
  name: string;
  description: string | null;
  participantIds: string[];
}): Promise<{ room: ChatRoomDocument; created: boolean }> {
  const existing = await ChatRoomModel.findOne({ roomKey: params.roomKey }).lean<ChatRoomDocument | null>();
  if (existing) {
    return { room: existing, created: false };
  }

  try {
    const doc = await ChatRoomModel.findOneAndUpdate(
      { roomKey: params.roomKey },
      {
        $setOnInsert: {
          _id: randomUUID(),
          type: params.type,
          roomKey: params.roomKey,
          name: params.name,
          description: params.description,
          participantIds: params.participantIds,
          lastMessageText: null,
          lastMessageAt: new Date(),
          lastMessageSenderId: null,
          lastMessageSenderName: null,
          unreadCounts: {},
        },
      },
      { upsert: true, new: true },
    ).lean<ChatRoomDocument | null>();

    if (!doc) {
      throw new Error(`Gagal membuat ruang chat ${params.roomKey}.`);
    }
    return { room: doc, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await ChatRoomModel.findOne({ roomKey: params.roomKey }).lean<ChatRoomDocument | null>();
      if (raced) {
        return { room: raced, created: false };
      }
    }
    throw error;
  }
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

    await Promise.all(
      DEFAULT_TEAM_CHANNELS.map((channel) =>
        upsertRoomByKey({
          roomKey: channel.roomKey,
          type: "CHANNEL",
          name: channel.name,
          description: channel.description,
          participantIds: [],
        }),
      ),
    );

    const hermesRoomKey = `hermes:${userId}`;
    const { room: ensuredHermesRoom, created: hermesCreated } = await upsertRoomByKey({
      roomKey: hermesRoomKey,
      type: "HERMES",
      name: "Hermes Assistant",
      description: "Asisten AI Dokumen, Lampiran Keuangan & Operasional",
      participantIds: [userId],
    });

    if (hermesCreated) {
      const existingMessages = await ChatMessageModel.countDocuments({
        roomId: String(ensuredHermesRoom._id),
      });
      if (existingMessages === 0) {
        const welcomeTime = new Date();
        const welcomePreview =
          "Halo! Saya Hermes Assistant, siap bantu buat Kwitansi, SPK, BAST, PO, & Laporan.";
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
              senderName: "Hermes Assistant",
              senderRole: "AI_ASSISTANT",
              senderAvatarUrl: null,
              content: HERMES_WELCOME_CONTENT,
              attachments: [],
              metadata: { isWelcome: true, source: "system" },
              readByIds: [userId],
              createdAt: welcomeTime,
              updatedAt: welcomeTime,
            },
          },
          { upsert: true, new: true },
        );
        await ChatRoomModel.findOneAndUpdate(
          { _id: ensuredHermesRoom._id, lastMessageText: null },
          {
            $set: {
              lastMessageText: welcomePreview,
              lastMessageAt: welcomeTime,
              lastMessageSenderId: "hermes-assistant",
              lastMessageSenderName: "Hermes Assistant",
            },
          },
        );
      }
    }

    const [
      activeUsers,
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

    const users = activeUsers
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        profilePhotoUrl: u.profilePhotoUrl ?? null,
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      }))
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
