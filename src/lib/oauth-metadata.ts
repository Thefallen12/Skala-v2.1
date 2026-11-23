import { SITE_URL, absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export function buildOAuthMetadata() {
  return {
    issuer: SITE_URL,
    authorization_endpoint: absoluteUrl("/auth/login"),
    token_endpoint: absoluteUrl("/api/auth/callback/credentials"),
    service_documentation: absoluteUrl("/auth.md"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    scopes_supported: ["openid", "profile", "email", "public:read", "verify:read"],
    agent_auth: {
      auth_md: absoluteUrl("/auth.md"),
      register_uri: absoluteUrl("/contact"),
      supported_identity_types: ["organization", "partner-agent"],
      credential_types: ["session", "public-read-only"],
      claim_url: absoluteUrl("/contact"),
      revocation_url: absoluteUrl("/contact"),
    },
  };
}
