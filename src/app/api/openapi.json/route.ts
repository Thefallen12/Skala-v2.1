import { COMPANY_PROFILE, SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${COMPANY_PROFILE.legalName} Public Agent & Verification API`,
      version: COMPANY_PROFILE.apk.version,
      summary: "Public company metadata, Markdown negotiation, health, and MCP JSON-RPC endpoints.",
      description: COMPANY_PROFILE.description,
      contact: {
        name: COMPANY_PROFILE.legalName,
        email: COMPANY_PROFILE.email,
        url: absoluteUrl("/contact"),
      },
    },
    servers: [{ url: SITE_URL, description: "Production Server" }],
    paths: {
      "/api/health": {
        get: {
          operationId: "getHealthStatus",
          summary: "Check public API health status",
          responses: {
            "200": {
              description: "Service operational status",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/markdown": {
        get: {
          operationId: "getPublicPageMarkdown",
          summary: "Fetch lightweight Markdown for any public route",
          parameters: [
            {
              name: "path",
              in: "query",
              required: false,
              schema: { type: "string", default: "/" },
            },
          ],
          responses: {
            "200": {
              description: "Markdown representation",
              content: { "text/markdown": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/api/mcp": {
        get: {
          operationId: "getMcpServerMetadata",
          summary: "Get MCP Server Card metadata",
          responses: {
            "200": {
              description: "MCP Server Card JSON",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
        post: {
          operationId: "callPublicMcpJsonRpc",
          summary: "Invoke read-only MCP JSON-RPC 2.0 methods",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": {
              description: "JSON-RPC 2.0 response",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/app-version": {
        get: {
          operationId: "getAndroidAppVersion",
          summary: "Retrieve latest Android APK version metadata",
          responses: {
            "200": {
              description: "Version metadata JSON",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
    },
  };

  return Response.json(spec, {
    status: 200,
    headers: {
      "Content-Type": "application/openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
