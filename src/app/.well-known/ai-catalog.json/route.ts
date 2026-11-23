import { COMPANY_PROFILE, PUBLIC_PAGES, SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  return Response.json(
    {
      version: "1.0",
      name: COMPANY_PROFILE.legalName,
      url: SITE_URL,
      description: COMPANY_PROFILE.description,
      capabilities: [
        {
          name: "qr_document_verification",
          description:
            "Public verification of official Purchase Orders, Delivery Orders, Invoices, and Construction Contracts.",
          urlTemplate: `${SITE_URL}/verify/{code}`,
        },
        {
          name: "public_mcp_server",
          description:
            "Streamable HTTP JSON-RPC 2.0 MCP endpoint for company metadata, pricing catalog, and QR links.",
          endpoint: absoluteUrl("/api/mcp"),
          serverCard: absoluteUrl("/.well-known/mcp/server-card.json"),
        },
        {
          name: "markdown_pages",
          description:
            "Markdown versions of all public informational pages via Accept: text/markdown or /api/markdown.",
          endpoint: absoluteUrl("/api/markdown"),
        },
      ],
      pages: PUBLIC_PAGES.map((page) => ({
        url: absoluteUrl(page.path),
        title: page.title,
        description: page.description,
      })),
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
