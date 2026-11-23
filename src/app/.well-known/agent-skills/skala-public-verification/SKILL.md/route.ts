import { SKALA_PUBLIC_SKILL_MD } from "@/lib/agent-skill-md";

export const revalidate = 3600;

export async function GET() {
  return new Response(SKALA_PUBLIC_SKILL_MD, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
