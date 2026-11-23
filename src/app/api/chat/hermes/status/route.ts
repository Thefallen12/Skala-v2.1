import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { checkHermesGatewayStatus } from "@/lib/hermes/hermes-engine";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk untuk memeriksa status Hermes Assistant." },
      { status: 401 },
    );
  }

  const gatewayUrl = request.nextUrl.searchParams.get("gatewayUrl");
  const customApiKey = request.headers.get("x-hermes-api-key");
  const status = await checkHermesGatewayStatus(gatewayUrl, customApiKey);

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
