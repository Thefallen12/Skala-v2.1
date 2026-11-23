import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import { ChatPresenceModel } from "@/models/chat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk untuk memperbarui status kehadiran." },
      { status: 401 },
    );
  }

  let body: { roomId?: unknown; isTyping?: unknown } = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object") {
      body = parsed as { roomId?: unknown; isTyping?: unknown };
    }
  } catch {
    // Heartbeat boleh tanpa payload
  }

  const userId = session.user.id;
  const userName = session.user.name || "Pengguna";
  const userRole = String(session.user.role || "FIELD_TEAM");
  const roomId =
    typeof body.roomId === "string" && body.roomId.trim()
      ? body.roomId.trim().slice(0, 128)
      : null;
  const isTyping = body.isTyping === true && Boolean(roomId);
  const now = new Date();

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
          userName: userName.slice(0, 160),
          userRole: userRole.slice(0, 64),
          lastActiveAt: now,
          typingInRoomId: isTyping ? roomId : null,
          typingUpdatedAt: isTyping ? now : null,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    return NextResponse.json({
      ok: true,
      lastActiveAt: now.toISOString(),
    });
  } catch (error) {
    console.error("[Chat Presence POST] Gagal update status:", error);
    return NextResponse.json(
      { message: "Gagal memperbarui status kehadiran." },
      { status: 500 },
    );
  }
}
