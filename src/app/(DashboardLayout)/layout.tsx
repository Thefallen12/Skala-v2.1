import { auth } from "../../../auth";
import { canManageUsers, drawingAccessRoles } from "@/lib/user-access";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getVisibleMenuKeysForRole } from "@/lib/menu-access";
import { getEnabledMaintenancePageKeys } from "@/lib/maintenance";
import { getPendingBellTaskReminders } from "@/lib/notification-feed";
import DashboardLayoutClient from "./DashboardLayoutClient";
import { ANDROID_APK } from "@/lib/apk-config";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }

  const [user, notifications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { profilePhotoUrl: true },
    }),
    getPendingBellTaskReminders(session.user.id),
  ]);
  if (!user) redirect("/auth/login");

  const [allowedMenuKeys, maintenancePageKeys] = await Promise.all([
    getVisibleMenuKeysForRole(session.user.role),
    getEnabledMaintenancePageKeys(),
  ]);

  return (
    <DashboardLayoutClient
      canManageUsers={canManageUsers(session.user.role)}
      canAccessLogistics={
        session.user.role === UserRole.LOGISTICS ||
        session.user.role === UserRole.MOVER ||
        session.user.role === UserRole.KOORDINATOR ||
        session.user.role === UserRole.FINANCE ||
        session.user.role === UserRole.FIELD_TEAM ||
        session.user.role === UserRole.DEPUTY_DIRECTOR ||
        canManageUsers(session.user.role)
      }
      canAccessExecutive={
        session.user.role === UserRole.DIRECTOR ||
        session.user.role === UserRole.DEPUTY_DIRECTOR ||
        session.user.role === UserRole.ADMINISTRATIONS ||
        session.user.role === UserRole.KOORDINATOR ||
        session.user.role === UserRole.FINANCE
      }
      canAccessFinance={
        session.user.role === UserRole.FINANCE ||
        session.user.role === UserRole.ADMINISTRATIONS ||
        session.user.role === UserRole.DIRECTOR ||
        session.user.role === UserRole.DEPUTY_DIRECTOR ||
        session.user.role === UserRole.KOORDINATOR
      }
      canAccessProjects={
        session.user.role === UserRole.ADMINISTRATIONS ||
        session.user.role === UserRole.DIRECTOR ||
        session.user.role === UserRole.DEPUTY_DIRECTOR ||
        session.user.role === UserRole.KOORDINATOR ||
        session.user.role === UserRole.FIELD_TEAM ||
        session.user.role === UserRole.DRAFTER ||
        session.user.role === UserRole.FINANCE ||
        session.user.role === UserRole.LOGISTICS ||
        session.user.role === UserRole.MOVER
      }
      canAccessDrafter={drawingAccessRoles.includes(session.user.role)}
      isMover={session.user.role === UserRole.MOVER}
      allowedMenuKeys={allowedMenuKeys}
      maintenancePageKeys={maintenancePageKeys}
      profilePhotoUrl={user.profilePhotoUrl}
      userName={session.user.name ?? "Pengguna"}
      userRole={session.user.role}
      notifications={notifications}
      androidDownloadUrl={ANDROID_APK.href}
    >
      {children}
    </DashboardLayoutClient>
  );
}
