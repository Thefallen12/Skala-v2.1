import {
  COMPANY_PROFILE,
  PUBLIC_PAGES,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site-config";
import { getPublicMarkdownForPath } from "@/lib/public-markdown";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const MCP_SERVER_INFO = {
  name: "com.skala-prioritas/public-mcp",
  title: `${COMPANY_PROFILE.legalName} MCP Server`,
  version: COMPANY_PROFILE.apk.version,
} as const;

export const MCP_PUBLIC_TOOLS = [
  {
    name: "get_company_profile",
    description:
      "Retrieve official profile, location, email, telephone, services, and external links for PT Skala Prioritas Engineering.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_public_pages",
    description:
      "List all public pages, discovery endpoints, and Markdown/sitemap/llms.txt URLs for skala-prioritas.com.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "build_document_verification_url",
    description:
      "Build the official QR verification URL on skala-prioritas.com for a Purchase Order, Invoice, Delivery Order, or construction contract code.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Public document verification code or reference number.",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
] as const;

export const MCP_PUBLIC_RESOURCES = [
  {
    uri: "skala://company/profile",
    name: "PT Skala Prioritas Engineering Profile",
    description: "Structured JSON metadata for PT Skala Prioritas Engineering.",
    mimeType: "application/json",
  },
  {
    uri: "skala://public/overview",
    name: "Skala Prioritas Homepage Markdown",
    description: "Markdown overview of skala-prioritas.com services and links.",
    mimeType: "text/markdown",
  },
] as const;

export function buildMcpServerCard() {
  return {
    $schema: "https://modelcontextprotocol.io/schemas/server-card/v1.json",
    version: "1.0",
    protocolVersion: MCP_PROTOCOL_VERSION,
    name: MCP_SERVER_INFO.name,
    title: MCP_SERVER_INFO.title,
    description:
      "Public Model Context Protocol server for PT Skala Prioritas Engineering company metadata, public navigation discovery, and QR document verification links.",
    endpoint: absoluteUrl("/api/mcp"),
    serverInfo: {
      name: MCP_SERVER_INFO.name,
      title: MCP_SERVER_INFO.title,
      version: MCP_SERVER_INFO.version,
    },
    transport: {
      type: "streamable-http",
      endpoint: "/api/mcp",
    },
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
    tools: MCP_PUBLIC_TOOLS,
    resources: MCP_PUBLIC_RESOURCES,
    documentationUrl: absoluteUrl("/llms.txt"),
    authentication: {
      required: false,
      notes:
        "Public discovery and verification URL tools require no authentication. Internal ERP operational modules require authenticated staff credentials.",
    },
  };
}

export function executePublicMcpTool(
  name: string,
  args: Record<string, unknown> | undefined,
) {
  switch (name) {
    case "get_company_profile":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                name: COMPANY_PROFILE.legalName,
                shortName: COMPANY_PROFILE.shortName,
                tagline: COMPANY_PROFILE.tagline,
                description: COMPANY_PROFILE.description,
                email: COMPANY_PROFILE.email,
                telephone: COMPANY_PROFILE.telephone,
                address: COMPANY_PROFILE.addressDisplay,
                openingHours: COMPANY_PROFILE.openingHours,
                website: SITE_URL,
                sameAs: COMPANY_PROFILE.sameAs,
                androidApk: {
                  version: COMPANY_PROFILE.apk.version,
                  url: absoluteUrl(COMPANY_PROFILE.apk.href),
                },
              },
              null,
              2,
            ),
          },
        ],
      };

    case "list_public_pages":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pages: PUBLIC_PAGES.map((page) => ({
                  ...page,
                  url: absoluteUrl(page.path),
                })),
                discovery: {
                  robots: absoluteUrl("/robots.txt"),
                  sitemap: absoluteUrl("/sitemap.xml"),
                  llms: absoluteUrl("/llms.txt"),
                  mcpServerCard: absoluteUrl("/.well-known/mcp/server-card.json"),
                  mcpEndpoint: absoluteUrl("/api/mcp"),
                  login: absoluteUrl("/auth/login"),
                },
              },
              null,
              2,
            ),
          },
        ],
      };

    case "build_document_verification_url": {
      const code =
        typeof args?.code === "string" ? args.code.trim() : "";
      if (!code || code.length > 120) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Invalid parameter: 'code' must be a non-empty verification code string (max 120 characters).",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                code,
                verificationUrl: `${SITE_URL}/verify/${encodeURIComponent(code)}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    default:
      return null;
  }
}

export function readPublicMcpResource(uri: string) {
  if (uri === "skala://company/profile") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(COMPANY_PROFILE, null, 2),
        },
      ],
    };
  }

  if (uri === "skala://public/overview") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: getPublicMarkdownForPath("/") ?? "",
        },
      ],
    };
  }

  return null;
}
