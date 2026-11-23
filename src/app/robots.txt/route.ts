import { SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

const ALLOW_LINES = [
  "Allow: /",
  "Allow: /about",
  "Allow: /pricing",
  "Allow: /contact",
  "Allow: /terms",
  "Allow: /privacy",
  "Allow: /verify",
  "Allow: /llms.txt",
  "Allow: /llms-full.txt",
  "Allow: /auth.md",
  "Allow: /.well-known/",
  "Allow: /api/mcp",
  "Allow: /api/markdown",
  "Allow: /api/openapi.json",
  "Allow: /api/health",
];

const DISALLOW_LINES = [
  "Disallow: /apps/",
  "Disallow: /dashboard/",
  "Disallow: /user-profile/",
  "Disallow: /utilities/",
  "Disallow: /sample-page",
  "Disallow: /auth/",
  "Disallow: /login",
  "Disallow: /api/",
  "Disallow: /monitoring",
];

const AI_CRAWLER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "Meta-ExternalAgent",
  "FacebookBot",
  "Cohere-ai",
  "Diffbot",
  "Bytespider",
] as const;

function buildRuleBlock(userAgent: string): string {
  return [
    `User-agent: ${userAgent}`,
    ...ALLOW_LINES,
    ...DISALLOW_LINES,
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
  ].join("\n");
}

export async function GET() {
  const blocks = [
    buildRuleBlock("*"),
    ...AI_CRAWLER_AGENTS.map((agent) => buildRuleBlock(agent)),
    [
      `Agentmap: ${absoluteUrl("/.well-known/ai-catalog.json")}`,
      `Sitemap: ${SITE_URL}/sitemap.xml`,
    ].join("\n"),
  ];

  const body = `${blocks.join("\n\n")}\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
