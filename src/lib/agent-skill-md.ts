import { createHash } from "node:crypto";
import { COMPANY_PROFILE, SITE_URL, absoluteUrl } from "@/lib/site-config";

export const SKALA_PUBLIC_SKILL_NAME = "skala-public-verification";
export const SKALA_PUBLIC_SKILL_DESCRIPTION =
  "Interact with PT Skala Prioritas Engineering public endpoints to inspect company details, IDR service pricing, Markdown docs, MCP tools, and QR document verification links.";

export const SKALA_PUBLIC_SKILL_MD = `${[
  "---",
  `name: ${SKALA_PUBLIC_SKILL_NAME}`,
  `description: ${SKALA_PUBLIC_SKILL_DESCRIPTION}`,
  "---",
  "",
  `# ${COMPANY_PROFILE.legalName} — Public Verification & Discovery Skill`,
  "",
  `Use the endpoints below on \`${SITE_URL}\` without authentication:`,
  "",
  "## Endpoints",
  "",
  `- **MCP Server Card**: ${absoluteUrl("/.well-known/mcp/server-card.json")}`,
  `- **MCP JSON-RPC Endpoint**: ${absoluteUrl("/api/mcp")}`,
  `- **API Catalog (RFC 9727)**: ${absoluteUrl("/.well-known/api-catalog")}`,
  `- **Pricing Page (IDR)**: ${absoluteUrl("/pricing")}`,
  `- **QR Document Verification**: \`${SITE_URL}/verify/{code}\``,
  `- **Markdown Content Negotiation**: Send \`Accept: text/markdown\` to \`/\`, \`/about\`, \`/pricing\`, \`/contact\`, \`/terms\`, or \`/privacy\`.`,
].join("\n")}\n`;

export function getSkalaPublicSkillSha256(): string {
  return `sha256:${createHash("sha256").update(SKALA_PUBLIC_SKILL_MD, "utf8").digest("hex")}`;
}
