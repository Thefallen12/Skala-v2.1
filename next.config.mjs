import { existsSync, readFileSync } from "node:fs";
import { withSentryConfig } from "@sentry/nextjs/config";

if (
    process.env.CLOUDINARY_URL &&
    (process.env.CLOUDINARY_URL.includes("<") ||
        !process.env.CLOUDINARY_URL.startsWith("cloudinary://"))
) {
    delete process.env.CLOUDINARY_URL;
}

const deploymentIdPath = new URL("./.deployment-id", import.meta.url);
const generatedDeploymentId = existsSync(deploymentIdPath)
    ? readFileSync(deploymentIdPath, "utf8").trim()
    : undefined;
const deploymentIdSource =
    generatedDeploymentId || process.env.NEXT_DEPLOYMENT_ID || process.env.DEPLOYMENT_VERSION;
const deploymentId = deploymentIdSource
    ?.trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

const AGENT_DISCOVERY_LINK_HEADER = [
    '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
    '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
    '</llms.txt>; rel="service-doc"; type="text/plain"',
    '</llms.txt>; rel="describedby"; type="text/plain"',
    '</api/markdown?path=/>; rel="alternate"; type="text/markdown"',
    '</sitemap.xml>; rel="sitemap"; type="application/xml"',
].join(", ");

const PUBLIC_AGENT_HEADERS = [
    {
        key: "Link",
        value: AGENT_DISCOVERY_LINK_HEADER,
    },
    {
        key: "Content-Signal",
        value: "search=yes, ai-input=yes, ai-train=no",
    },
    {
        key: "Vary",
        value: "Accept",
    },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    deploymentId: deploymentId || undefined,
    htmlLimitedBots: /.*/,
    env: {
        NEXT_PUBLIC_APP_BUILD_ID: deploymentId || "2.1.2",
    },
    reactStrictMode: false,
    serverExternalPackages: ["@prisma/client", "puppeteer-core", "@sparticuz/chromium", "nodemailer"],
    outputFileTracingIncludes: {
        "/**": ["./node_modules/@sentry/**/*"],
    },
    images: {
        unoptimized: true,
        remotePatterns: [
            { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" }
        ]
    },
    async headers() {
        return [
            {
                source: "/",
                headers: PUBLIC_AGENT_HEADERS,
            },
            {
                source: "/:path(about|pricing|contact|terms|privacy|verify)",
                headers: PUBLIC_AGENT_HEADERS,
            },
        ];
    },
    experimental: {
        cpus: 2,
        turbopackPluginRuntimeStrategy: "workerThreads",
        serverActions: {
            bodySizeLimit: "110mb"
        }
    }
};

const hasSentryAuth = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG?.trim() || "skala-prioritas",
    project: process.env.SENTRY_PROJECT?.trim() || "skala-v21",
    authToken: process.env.SENTRY_AUTH_TOKEN?.trim() || undefined,
    silent: !process.env.CI,
    telemetry: false,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    sourcemaps: {
        disable: !hasSentryAuth,
    },
    release: {
        create: hasSentryAuth,
    },
});
