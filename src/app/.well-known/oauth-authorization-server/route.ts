import { buildOAuthMetadata } from "@/lib/oauth-metadata";

export const revalidate = 3600;

export async function GET() {
  return Response.json(buildOAuthMetadata(), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
