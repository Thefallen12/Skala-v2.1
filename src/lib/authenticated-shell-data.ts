import { UserRole } from "@prisma/client";
import { canManageUsers, drawingAccessRoles } from "@/lib/user-access";
import { prisma } from "@/lib/prisma";
import { getVisibleMenuKeysForRole } from "@/lib/menu-access";
import { getEnabledMaintenancePageKeys } from "@/lib/maintenance";
import { getPendingBellTaskReminders } from "@/lib/notification-feed";
import { ANDROID_APK } from "@/lib/apk-config";

export async function loadAuthenticatedShellProps(sessionUser: {
  id: string;
  name?: string | null;
  role: UserRole;
}) {
  const [user, notifications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { profilePhotoUrl: true },
    }),
    getPendingBellTaskReminders(sessionUser.id),
  ]);

  if (!user) return null;

  const [allowedMenuKeys, maintenancePageKeys] = await Promise.all([
    getVisibleMenuKeysForRole(sessionUser.role),
    getEnabledMaintenancePageKeys(),
  ]);

  const canAdminUsers = canManageUsers(sessionUser.role);

  return {
    canManageUsers: canAdminUsers,
    canAccessLogistics:
      sessionUser.role === UserRole.LOGISTICS ||
      sessionUser.role === UserRole.MOVER ||
      sessionUser.role === UserRole.KOORDINATOR ||
      sessionUser.role === UserRole.FINANCE ||
      sessionUser.role === UserRole.FIELD_TEAM ||
      sessionUser.role === UserRole.DEPUTY_DIRECTOR ||
      canAdminUsers,
    canAccessExecutive:
      sessionUser.role === UserRole.DIRECTOR ||
      sessionUser.role === UserRole.DEPUTY_DIRECTOR ||
      sessionUser.role === UserRole.ADMINISTRATIONS ||
      sessionUser.role === UserRole.KOORDINATOR ||
      sessionUser.role === UserRole.FINANCE,
    canAccessFinance:
      sessionUser.role === UserRole.FINANCE ||
      sessionUser.role === UserRole.ADMINISTRATIONS ||
      sessionUser.role === UserRole.DIRECTOR ||
      sessionUser.role === UserRole.DEPUTY_DIRECTOR ||
      sessionUser.role === UserRole.KOORDINATOR,
    canAccessProjects:
      sessionUser.role === UserRole.ADMINISTRATIONS ||
      sessionUser.role === UserRole.DIRECTOR ||
      sessionUser.role === UserRole.DEPUTY_DIRECTOR ||
      sessionUser.role === UserRole.KOORDINATOR ||
      sessionUser.role === UserRole.FIELD_TEAM ||
      sessionUser.role === UserRole.DRAFTER ||
      sessionUser.role === UserRole.FINANCE ||
      sessionUser.role === UserRole.LOGISTICS ||
      sessionUser.role === UserRole.MOVER,
    canAccessDrafter: drawingAccessRoles.includes(sessionUser.role),
    isMover: sessionUser.role === UserRole.MOVER,
    allowedMenuKeys,
    maintenancePageKeys,
    profilePhotoUrl: user.profilePhotoUrl,
    userId: sessionUser.id,
    userName: sessionUser.name ?? "Pengguna",
    userRole: sessionUser.role,
    notifications,
    androidDownloadUrl: ANDROID_APK.href,
  };
}
