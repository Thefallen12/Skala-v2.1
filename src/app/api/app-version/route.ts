import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { ANDROID_APK } from "@/lib/apk-config";

export const dynamic = "force-dynamic";

function resolveCurrentWebBuildId(): string {
  const deploymentFile = resolve(process.cwd(), ".deployment-id");
  if (existsSync(deploymentFile)) {
    const value = readFileSync(deploymentFile, "utf8").trim();
    if (value) return value;
  }

  return (
    process.env.NEXT_PUBLIC_APP_BUILD_ID?.trim() ||
    process.env.NEXT_DEPLOYMENT_ID?.trim() ||
    process.env.DEPLOYMENT_VERSION?.trim() ||
    ANDROID_APK.version
  );
}

export async function GET() {
  const webBuildId = resolveCurrentWebBuildId();

  return NextResponse.json(
    {
      webBuildId,
      apk: {
        version: ANDROID_APK.version,
        versionCode: ANDROID_APK.versionCode,
        downloadUrl: ANDROID_APK.href,
        fileName: ANDROID_APK.fileName,
        label: ANDROID_APK.label,
        releaseNotes: ANDROID_APK.releaseNotes,
      },
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}

