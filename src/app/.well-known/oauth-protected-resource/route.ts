import { SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  return Response.json(
    {
      resource: SITE_URL,
      authorization_servers: [SITE_URL],
      bearer_methods_supported: ["header"],
      scopes_supported: ["public:read", "verify:read"],
      resource_documentation: absoluteUrl("/auth.md"),
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
