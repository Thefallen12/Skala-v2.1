import { existsSync, readFileSync } from "node:fs";

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

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    deploymentId: deploymentId || undefined,
    env: {
        NEXT_PUBLIC_APP_BUILD_ID: deploymentId || "2.1.2",
    },
    reactStrictMode: false,
    serverExternalPackages: ["@prisma/client", "puppeteer-core", "@sparticuz/chromium"],
    images: {
        unoptimized: true,
        remotePatterns: [
            { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" }
        ]
    },
    experimental: {
        cpus: 2,
        turbopackPluginRuntimeStrategy: "workerThreads",
        serverActions: {
            bodySizeLimit: "110mb"
        }
    }
};

export default nextConfig;
