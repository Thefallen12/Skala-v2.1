import { getAllPublicMarkdownCombined } from "@/lib/public-markdown";
import { COMPANY_PROFILE, SITE_URL } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const header = [
    `# ${COMPANY_PROFILE.legalName} — Full Public Documentation`,
    "",
    `Source: ${SITE_URL}/`,
    `Content-Signal: search=yes, ai-input=yes, ai-train=no`,
    "",
    "---",
    "",
  ].join("\n");

  return new Response(`${header}${getAllPublicMarkdownCombined()}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
