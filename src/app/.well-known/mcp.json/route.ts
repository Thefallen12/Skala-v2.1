import { buildMcpServerCard } from "@/lib/mcp-public";

export const revalidate = 3600;

export async function GET() {
  return Response.json(buildMcpServerCard(), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
