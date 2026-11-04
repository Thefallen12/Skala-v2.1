import { UserRole } from "@prisma/client";

const projectRoles = new Set<UserRole>([
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
]);

export function canAccessProject(
  role: UserRole,
  userId: string,
  fieldPicId: string | null,
): boolean {
  if (!projectRoles.has(role)) return false;
  if (role === UserRole.FIELD_TEAM || role === UserRole.KOORDINATOR) {
    return fieldPicId === userId;
  }
  return true;
}
