import { UserRole } from "@prisma/client";

export function canManageUsers(role: UserRole): boolean {
  return (
    role === UserRole.ADMINISTRATIONS ||
    role === UserRole.DIRECTOR
  );
}

export const userManagerRoles = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
] as const;

export const drawingAccessRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.DRAFTER,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
];

export const drawingUploadRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DRAFTER,
];

export const drawingReviewRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
];
