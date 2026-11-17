"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_PROFILE, PUBLIC_PAGES, SITE_URL, absoluteUrl } from "@/lib/site-config";
import type { WebMcpToolDefinition } from "@/types/webmcp";

export function WebMcpProvider() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const modelContext = navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== "function") {
      return;
    }

    const registeredNames: string[] = [];

    const tools: WebMcpToolDefinition[] = [
      {
        name: "get_skala_company_profile",
        description:
          "Get official company details, services, telephone, email, address, external profiles, and Android APK info for PT Skala Prioritas Engineering.",
        inputSchema: {
          type: "object",
          properties: {},
        },
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
        name: "list_skala_public_pages",
        description:
          "List public navigation URLs, legal pages, llms.txt, and MCP server card URLs on skala-prioritas.com.",
        inputSchema: {
          type: "object",
          properties: {
            navigateTo: {
              type: "string",
              description: "Optional path to open in the current tab (e.g. /about, /contact, /terms, /privacy, /auth/login).",
              enum: ["/", "/about", "/contact", "/terms", "/privacy", "/auth/login"],
            },
          },
        },
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
        execute: async (input) => {
          const code = typeof input.code === "string" ? input.code.trim() : "";
          if (!code) {
            return {
              content: [
                {
                  type: "text",
                  text: "Parameter 'code' tidak boleh kosong.",
                },
              ],
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
                text: JSON.stringify(
                  {
                    code,
                    path,
                    verificationUrl: absoluteUrl(path),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
    ];

    for (const tool of tools) {
      try {
        modelContext.registerTool(tool);
        registeredNames.push(tool.name);
      } catch {
        // Ignore duplicate registration errors when soft-navigating between public pages
      }
    }

    return () => {
      if (typeof modelContext.unregisterTool === "function") {
        for (const name of registeredNames) {
          try {
            modelContext.unregisterTool(name);
          } catch {
            // Safe cleanup guard
          }
        }
      }
    };
  }, [router]);

  return null;
}
