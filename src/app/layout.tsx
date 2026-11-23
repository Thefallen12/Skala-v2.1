import React from "react";
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./css/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import ServiceWorkerRegister from "@/app/components/service-worker/ServiceWorkerRegister";
import InAppUpdateManager from "@/app/components/pwa/InAppUpdateManager";
import ApkBackButtonHandler from "@/app/components/apk/ApkBackButtonHandler";
import PageTransition from "@/app/components/layout/PageTransition";
import {
  COMPANY_PROFILE,
  SERVICE_PACKAGES,
  SITE_URL,
  absoluteUrl,
  getPublicPageMeta,
} from "@/lib/site-config";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const HOME_META = getPublicPageMeta("/");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_META.title,
    template: "%s | Skala Prioritas",
  },
  description: HOME_META.description,
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: `${SITE_URL}/`,
    siteName: COMPANY_PROFILE.legalName,
    title: HOME_META.title,
    description: HOME_META.description,
  },
  alternates: {
    canonical: absoluteUrl("/"),
    types: {
      "application/mcp+json": "/.well-known/mcp/server-card.json",
      "text/plain": "/llms.txt",
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const WEBMCP_HEAD_BOOTSTRAP_SCRIPT = `
(function(){
  try {
    var targets = [];
    if (typeof document !== "undefined" && document.modelContext && typeof document.modelContext.registerTool === "function") {
      targets.push(document.modelContext);
    }
    if (typeof navigator !== "undefined" && navigator.modelContext && typeof navigator.modelContext.registerTool === "function" && targets.indexOf(navigator.modelContext) === -1) {
      targets.push(navigator.modelContext);
    }
    if (!targets.length) return;
    var tools = [
      {
        name: "verify_document_lookup",
        description: "Verifikasi keaslian dokumen resmi PT Skala Prioritas Engineering (Purchase Order, Invoice, Surat Jalan, atau Kontrak) menggunakan kode QR dokumen.",
        inputSchema: { type: "object", properties: { code: { type: "string", description: "Kode verifikasi alfanumerik dokumen QR." } }, required: ["code"] },
        annotations: { readOnlyHint: true },
        execute: async function(args) {
          var code = args && typeof args.code === "string" ? args.code.trim() : "";
          if (!code) return { error: "Missing required parameter: code" };
          return { content: [{ type: "text", text: JSON.stringify({ code: code, verificationUrl: ${JSON.stringify(SITE_URL)} + "/verify/" + encodeURIComponent(code) }) }] };
        }
      },
      {
        name: "get_company_profile",
        description: "Get official identity, contact details, address, external links, and APK download metadata for PT Skala Prioritas Engineering.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async function() {
          return { content: [{ type: "text", text: JSON.stringify(${JSON.stringify({ name: COMPANY_PROFILE.legalName, email: COMPANY_PROFILE.email, telephone: COMPANY_PROFILE.telephone, address: COMPANY_PROFILE.addressDisplay, website: SITE_URL, sameAs: COMPANY_PROFILE.sameAs })}) }] };
        }
      },
      {
        name: "get_service_pricing",
        description: "Get transparent service packages and pricing in IDR for PT Skala Prioritas Engineering.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async function() {
          return { content: [{ type: "text", text: JSON.stringify(${JSON.stringify({ currency: "IDR", pricingUrl: absoluteUrl("/pricing"), packages: SERVICE_PACKAGES })}) }] };
        }
      },
      {
        name: "get_public_page_markdown",
        description: "Retrieve clean Markdown representation for public pages on skala-prioritas.com.",
        inputSchema: { type: "object", properties: { path: { type: "string", description: "Public path like /, /about, /pricing, /contact, /terms, /privacy" } } },
        annotations: { readOnlyHint: true },
        execute: async function(args) {
          var path = args && typeof args.path === "string" && args.path.charAt(0) === "/" ? args.path : "/";
          var res = await fetch("/api/markdown?path=" + encodeURIComponent(path));
          return { content: [{ type: "text", text: await res.text() }] };
        }
      }
    ];
    for (var i = 0; i < targets.length; i++) {
      for (var j = 0; j < tools.length; j++) {
        try {
          Promise.resolve(targets[i].registerTool(tools[j])).catch(function(){});
        } catch (e) {}
      }
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={dmSans.variable}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <link
          rel="icon"
          href="/images/logos/icont%20logo%201.svg"
          type="image/svg+xml"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="ai-catalog" href="/.well-known/ai-catalog.json" />
        <link rel="api-catalog" href="/.well-known/api-catalog" />
        <link rel="service-desc" href="/.well-known/mcp/server-card.json" />
        <meta name="theme-color" content="#102A4D" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script dangerouslySetInnerHTML={{ __html: WEBMCP_HEAD_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ServiceWorkerRegister />
          <InAppUpdateManager />
          <ApkBackButtonHandler />
          <PageTransition>{children}</PageTransition>
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
