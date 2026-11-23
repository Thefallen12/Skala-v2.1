"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_PROFILE,
  PUBLIC_PAGES,
  SERVICE_PACKAGES,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site-config";
import type { WebMcpModelContext, WebMcpToolDefinition } from "@/types/webmcp";

function resolveModelContextTargets(): WebMcpModelContext[] {
  const targets: WebMcpModelContext[] = [];
  if (
    typeof navigator !== "undefined" &&
    navigator.modelContext &&
    typeof navigator.modelContext.registerTool === "function"
  ) {
    targets.push(navigator.modelContext);
  }
  const docContext = (document as unknown as { modelContext?: WebMcpModelContext }).modelContext;
  if (
    typeof document !== "undefined" &&
    docContext &&
    typeof docContext.registerTool === "function" &&
    !targets.includes(docContext)
  ) {
    targets.push(docContext);
  }
  return targets;
}

export function WebMcpProvider() {
  const router = useRouter();

  useEffect(() => {
    const targets = resolveModelContextTargets();
    if (targets.length === 0) return;

    const registeredPairs: Array<{ target: WebMcpModelContext; name: string }> = [];

    const tools: WebMcpToolDefinition[] = [
      {
        name: "get_company_profile",
        description:
          "Get official company details, services, telephone, email, address, external profiles, and Android APK info for PT Skala Prioritas Engineering.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => ({
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
        }),
      },
      {
        name: "get_service_pricing",
        description:
          "Get transparent IDR pricing packages for QR partner verification portal, ERP Cloud license, and project management contracts.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  currency: "IDR",
                  pricingUrl: absoluteUrl("/pricing"),
                  packages: SERVICE_PACKAGES,
                },
                null,
                2,
              ),
            },
          ],
        }),
      },
      {
        name: "get_public_page_markdown",
        description:
          "Fetch lightweight token-efficient Markdown for a public page on skala-prioritas.com.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Public page path such as /, /about, /pricing, /contact, /terms, /privacy, or /verify.",
            },
          },
        },
        annotations: { readOnlyHint: true },
        execute: async (input) => {
          const path = typeof input.path === "string" && input.path.startsWith("/") ? input.path : "/";
          const res = await fetch(`/api/markdown?path=${encodeURIComponent(path)}`);
          const markdown = await res.text();
          return {
            content: [{ type: "text", text: markdown }],
          };
        },
      },
      {
        name: "list_skala_public_pages",
        description:
          "List public navigation URLs, pricing page, legal pages, llms.txt, API catalog, and MCP server card URLs on skala-prioritas.com.",
        inputSchema: {
          type: "object",
          properties: {
            navigateTo: {
              type: "string",
              description: "Optional path to open in the current tab.",
              enum: ["/", "/about", "/pricing", "/contact", "/terms", "/privacy", "/verify", "/auth/login"],
            },
          },
        },
        annotations: { readOnlyHint: true },
        execute: async (input) => {
          const navigateTo =
            typeof input.navigateTo === "string" ? input.navigateTo : "";
          if (navigateTo.startsWith("/")) {
            router.push(navigateTo);
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    navigatedTo: navigateTo || null,
                    pages: PUBLIC_PAGES.map((page) => ({
                      path: page.path,
                      url: absoluteUrl(page.path),
                      title: page.title,
                    })),
                    llmsTxt: absoluteUrl("/llms.txt"),
                    mcpServerCard: absoluteUrl("/.well-known/mcp/server-card.json"),
                    apiCatalog: absoluteUrl("/.well-known/api-catalog"),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
      {
        name: "verify_skala_document",
        description:
          "Verify an official PT Skala Prioritas Engineering document (Purchase Order, Invoice, Delivery Order, or Contract) by opening its QR verification route.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Document verification code printed beside the QR code.",
            },
            navigate: {
              type: "boolean",
              description: "Set true to navigate directly to the verification page in the browser.",
            },
          },
          required: ["code"],
        },
        annotations: { readOnlyHint: true },
        execute: async (input) => {
          const code = typeof input.code === "string" ? input.code.trim() : "";
          if (!code) {
            return {
              content: [{ type: "text", text: "Parameter 'code' tidak boleh kosong." }],
            };
          }
          const path = `/verify/${encodeURIComponent(code)}`;
          if (input.navigate === true) {
            router.push(path);
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ code, path, verificationUrl: absoluteUrl(path) }, null, 2),
              },
            ],
          };
        },
      },
    ];

    for (const target of targets) {
      for (const tool of tools) {
        try {
          target.registerTool(tool);
          registeredPairs.push({ target, name: tool.name });
        } catch {
          // Ignore duplicate tool registrations across head bootstrap & route transitions
        }
      }
    }

    return () => {
      for (const pair of registeredPairs) {
        if (typeof pair.target.unregisterTool === "function") {
          try {
            pair.target.unregisterTool(pair.name);
          } catch {
            // Safe cleanup guard
          }
        }
      }
    };
  }, [router]);

  return null;
}
