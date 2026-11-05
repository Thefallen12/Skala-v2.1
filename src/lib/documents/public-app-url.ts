function parsePublicOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isWildcardBindAddress = hostname === "0.0.0.0" || hostname === "::";
    const isLocalHost =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "::1" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      isWildcardBindAddress ||
      isLocalHost
    ) {
      return null;
    }

    return new URL(url.origin);
  } catch {
    return null;
  }
}

function parseRequestOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      hostname === "0.0.0.0" ||
      hostname === "::"
    ) {
      return null;
    }

    return new URL(url.origin);
  } catch {
    return null;
  }
}

export function getRequestOrigin(
  requestHeaders: Pick<Headers, "get">,
): string | null {
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.trim();
  if (!host) return null;

  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol || (process.env.NODE_ENV === "production" ? "https" : "http");
  const requestOrigin = parseRequestOrigin(`${protocol}://${host}`);
  if (!requestOrigin) return null;

  const originHeader = requestHeaders.get("origin");
  if (originHeader) {
    const origin = parseRequestOrigin(originHeader);
    if (!origin || origin.origin !== requestOrigin.origin) return null;
  }

  return requestOrigin.origin;
}

export function resolvePublicAppUrl(requestOrigin?: string | null): URL | null {
  if (process.env.NODE_ENV !== "production") {
    return (
      (requestOrigin ? parseRequestOrigin(requestOrigin) : null) ??
      new URL("http://localhost:3000")
    );
  }

  const configuredOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.DOMAIN,
    process.env.domain,
  ];

  for (const configuredOrigin of configuredOrigins) {
    if (!configuredOrigin?.trim()) continue;
    const parsedOrigin = parsePublicOrigin(configuredOrigin.trim());
    if (parsedOrigin) return parsedOrigin;
  }

  return null;
}
