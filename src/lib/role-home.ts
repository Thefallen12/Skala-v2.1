import { UserRole } from "@prisma/client";

export function sanitizeCallbackUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return null;
  }
  try {
    const parsed = new URL(trimmed, "https://skala.local");
    if (parsed.origin !== "https://skala.local") return null;
    if (
      parsed.pathname === "/login" ||
      parsed.pathname === "/auth/login" ||
      parsed.pathname.startsWith("/api/")
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function getRoleHomePath(role: UserRole): string {
  switch (role) {
    case UserRole.DIRECTOR:
    case UserRole.DEPUTY_DIRECTOR:
      return "/apps/approvals";
    case UserRole.FINANCE:
      return "/apps/finance";
    case UserRole.LOGISTICS:
      return "/apps/logistics";
    case UserRole.FIELD_TEAM:
    case UserRole.KOORDINATOR:
    case UserRole.DRAFTER:
      return "/apps/projects";
    case UserRole.MOVER:
      return "/apps/logistics";
    case UserRole.ADMINISTRATIONS:
      return "/";
  }
}
