import { COMPANY_PROFILE, SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const card = {
    name: `${COMPANY_PROFILE.legalName} Public Agent`,
    description: COMPANY_PROFILE.description,
    version: COMPANY_PROFILE.apk.version,
    url: SITE_URL,
    provider: {
      organization: COMPANY_PROFILE.legalName,
      url: SITE_URL,
    },
    documentationUrl: absoluteUrl("/llms.txt"),
    supportedInterfaces: [
      {
        url: absoluteUrl("/api/mcp"),
        protocolBinding: "JSONRPC",
        transportProtocol: "streamable-http",
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/markdown"],
    skills: [
      {
        id: "company-profile",
        name: "Retrieve Company Profile & Contact Information",
        description:
          "Provides official address, email, telephone, services, external social profiles, and Android APK metadata for PT Skala Prioritas Engineering.",
        tags: ["company", "contact", "construction", "indonesia"],
      },
      {
        id: "service-pricing",
        name: "Inspect Service Packages & IDR Pricing",
        description:
          "Returns transparent IDR pricing tiers for QR verification portal, ERP Cloud licensing, and civil construction management contracts.",
        tags: ["pricing", "packages", "erp", "idr"],
      },
      {
        id: "qr-document-verification",
        name: "Build Official QR Document Verification URLs",
        description:
          "Generates public verification URLs for Purchase Orders, Invoices, Delivery Orders, and construction contracts issued by PT Skala Prioritas Engineering.",
        tags: ["verification", "qr", "documents", "procurement"],
      },
    ],
  };

  return Response.json(card, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
