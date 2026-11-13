import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { getNotificationFeedForUser } from "@/lib/notification-feed";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu." },
      { status: 401 },
    );
  }

  const feed = await getNotificationFeedForUser({
    userId: session.user.id,
    role: session.user.role,
  });

  return NextResponse.json(feed);
}
