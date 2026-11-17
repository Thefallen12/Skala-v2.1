import { NextRequest } from "next/server";
import { createMarkdownResponse } from "@/lib/public-markdown";

export async function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path") || "/";
  const response = createMarkdownResponse(requestedPath);

  if (!response) {
    return new Response("# 404 Not Found\n\nHalaman publik tidak ditemukan.\n", {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        Vary: "Accept",
      },
    });
  }

  return response;
}
