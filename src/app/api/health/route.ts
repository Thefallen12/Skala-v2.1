import { COMPANY_PROFILE } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "skala-prioritas-erp",
      company: COMPANY_PROFILE.legalName,
      version: COMPANY_PROFILE.apk.version,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
