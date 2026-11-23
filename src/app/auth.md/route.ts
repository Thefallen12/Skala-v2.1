import { COMPANY_PROFILE, SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const content = [
    `# Authentication & Agent Access Guide — ${COMPANY_PROFILE.legalName}`,
    "",
    `Domain: \`${SITE_URL}\``,
    "",
    "## Public Unauthenticated Access",
    "",
    "No API key or login is required for:",
    `- Company metadata & pricing pages (\`/\`, \`/about\`, \`/pricing\`, \`/contact\`, \`/terms\`, \`/privacy\`)`,
    `- Markdown content negotiation (\`Accept: text/markdown\`)`,
    `- QR document verification (\`${SITE_URL}/verify/{code}\`)`,
    `- Public read-only MCP endpoint (\`${absoluteUrl("/api/mcp")}\`)`,
    `- Discovery manifests (\`/llms.txt\`, \`/.well-known/api-catalog\`, \`/.well-known/mcp/server-card.json\`, \`/.well-known/agent-card.json\`)`,
    "",
    "## Internal ERP Portal Authentication",
    "",
    "- Internal ERP routes (`/apps/*`, `/dashboard/*`, `/api/*` operational APIs) are restricted to authorized PT Skala Prioritas Engineering staff.",
    `- Staff authentication endpoint: ${absoluteUrl("/auth/login")}`,
    `- OAuth Protected Resource metadata: ${absoluteUrl("/.well-known/oauth-protected-resource")}`,
    `- OAuth Authorization Server metadata: ${absoluteUrl("/.well-known/oauth-authorization-server")}`,
    "",
    "## Contact for Partner Integration",
    "",
    `- Email: [${COMPANY_PROFILE.email}](mailto:${COMPANY_PROFILE.email})`,
    `- Telephone: [${COMPANY_PROFILE.telephoneDisplay}](tel:${COMPANY_PROFILE.telephone})`,
  ].join("\n");

  return new Response(`${content}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
