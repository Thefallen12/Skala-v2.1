import { UserRole } from "@prisma/client";

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
      return "/apps/tickets";
    case UserRole.ADMINISTRATIONS:
      return "/";
  }
}
