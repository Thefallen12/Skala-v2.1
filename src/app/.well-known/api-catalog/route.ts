import { absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const catalog = {
    linkset: [
      {
        anchor: absoluteUrl("/api"),
        "service-desc": [
          {
            href: absoluteUrl("/api/openapi.json"),
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: absoluteUrl("/llms.txt"),
            type: "text/plain",
          },
        ],
        status: [
          {
            href: absoluteUrl("/api/health"),
            type: "application/json",
          },
        ],
      },
      {
        anchor: absoluteUrl("/api/mcp"),
        "service-desc": [
          {
            href: absoluteUrl("/.well-known/mcp/server-card.json"),
            type: "application/json",
          },
        ],
        "service-doc": [
          {
            href: absoluteUrl("/llms.txt"),
            type: "text/plain",
          },
        ],
        status: [
          {
            href: absoluteUrl("/api/health"),
            type: "application/json",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
