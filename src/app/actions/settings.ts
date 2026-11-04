"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import {
  APP_MENUS,
  APP_ROLES,
  DEFAULT_MENU_ACCESS_BY_ROLE,
  isMenuAccessRequired,
  SETTINGS_MENU_ROLES,
} from "@/lib/config/menus";
import { MAINTENANCE_PAGES } from "@/lib/config/maintenance-pages";
import type { AppMenuKey } from "@/lib/config/menus";

export type MenuAccessMatrixRow = {
  key: AppMenuKey;
  name: string;
  path: string;
  allowedByRole: Record<string, boolean>;
};

async function requireAdminAccess() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const isAdmin =
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.ADMINISTRATIONS ||
    session.user.role === UserRole.DEPUTY_DIRECTOR;

  if (!isAdmin) {
    return null;
  }

  return session.user;
}

async function ensureDefaults() {
  const existing = await prisma.menuAccess.findMany({
    select: { role: true, menuKey: true },
  });

  const keys = new Set(existing.map((entry) => `${entry.role}:${entry.menuKey}`));
  const rows = [] as Array<{
    role: string;
    menuKey: string;
    menuName: string;
    isAllowed: boolean;
  }>;

  for (const role of APP_ROLES) {
    for (const menu of APP_MENUS) {
      const compositeKey = `${role}:${menu.key}`;
      if (keys.has(compositeKey)) {
        continue;
      }

      rows.push({
        role,
        menuKey: menu.key,
        menuName: menu.name,
        isAllowed: (DEFAULT_MENU_ACCESS_BY_ROLE[role] ?? []).includes(menu.key),
      });
    }
  }

  for (const row of rows) {
    await prisma.menuAccess.upsert({
      where: { role_menuKey: { role: row.role, menuKey: row.menuKey } },
      create: row,
      update: {},
    });
  }
}

export async function getMenuAccessMatrix() {
  const session = await auth();
  if (!session?.user) {
    return [] as MenuAccessMatrixRow[];
  }

  await ensureDefaults();

  const rows = await prisma.menuAccess.findMany({
    orderBy: [{ menuKey: "asc" }],
    select: {
      role: true,
      menuKey: true,
      menuName: true,
      isAllowed: true,
    },
  });

  const accessByMenuKey = new Map<string, MenuAccessMatrixRow>();

  for (const menu of APP_MENUS) {
    accessByMenuKey.set(menu.key, {
      key: menu.key,
      name: menu.name,
      path: menu.path,
      allowedByRole: {},
    });
  }

  for (const row of rows) {
    const existingRow = accessByMenuKey.get(row.menuKey);
    if (!existingRow) {
      continue;
    }

    existingRow.allowedByRole[row.role] =
      row.menuKey === "settings" &&
      !SETTINGS_MENU_ROLES.includes(row.role as UserRole)
        ? false
        : row.isAllowed;
  }

  for (const menu of APP_MENUS) {
    const menuRow = accessByMenuKey.get(menu.key);
    if (!menuRow) {
      continue;
    }

    for (const role of APP_ROLES) {
      if (
        menu.key === "settings" &&
        !SETTINGS_MENU_ROLES.includes(role)
      ) {
        menuRow.allowedByRole[role] = false;
        continue;
      }

      if (!(role in menuRow.allowedByRole)) {
        menuRow.allowedByRole[role] = (DEFAULT_MENU_ACCESS_BY_ROLE[role] ?? []).includes(menu.key);
      }
    }
  }

  return APP_MENUS.map((menu) => accessByMenuKey.get(menu.key)!).filter(Boolean);
}

export async function toggleMenuAccess(
  role: string,
  menuKey: string,
  isAllowed: boolean,
) {
  const session = await requireAdminAccess();
  if (!session) {
    return { success: false, message: "Akses tidak diizinkan." };
  }

  const normalizedRole = Object.values(UserRole).find((value) => value === role);
  if (!normalizedRole) {
    return { success: false, message: "Role tidak valid." };
  }

  const menu = APP_MENUS.find((item) => item.key === menuKey);
  if (!menu) {
    return { success: false, message: "Menu tidak valid." };
  }
  if (
    menuKey === "settings" &&
    isAllowed &&
    !SETTINGS_MENU_ROLES.includes(normalizedRole)
  ) {
    return {
      success: false,
      message: "Pengaturan Sistem hanya tersedia untuk Direktur, Wakil Direktur, dan Administrasi.",
    };
  }
  if (isMenuAccessRequired(normalizedRole, menu.key) && !isAllowed) {
    return {
      success: false,
      message: "Menu Drafter wajib tersedia untuk Direktur dan Administrasi.",
    };
  }

  try {
    await prisma.menuAccess.upsert({
      where: {
        role_menuKey: {
          role: normalizedRole,
          menuKey,
        },
      },
      update: {
        isAllowed,
        menuName: menu.name,
      },
      create: {
        role: normalizedRole,
        menuKey,
        menuName: menu.name,
        isAllowed,
      },
    });
  } catch (error) {
    console.error("toggleMenuAccess failed:", error);
    return { success: false, message: "Gagal menyimpan pengaturan menu." };
  }

  revalidatePath("/apps/settings");
  revalidatePath("/");
  return { success: true, message: "Perubahan hak akses berhasil disimpan." };
}

export async function getPageMaintenanceSettings() {
  const session = await auth();
  if (!session?.user) {
    return { enabledKeys: [], canManage: false };
  }

  const records = await prisma.pageMaintenance.findMany({
    where: { isUnderMaintenance: true },
    select: { pageKey: true },
  });
  const canManage =
    session.user.role === UserRole.DIRECTOR ||
    session.user.role === UserRole.ADMINISTRATIONS ||
    session.user.role === UserRole.DEPUTY_DIRECTOR;

  return {
    enabledKeys: records.map((record) => record.pageKey),
    canManage,
  };
}

export async function togglePageMaintenance(
  pageKey: string,
  isUnderMaintenance: boolean,
) {
  const session = await requireAdminAccess();
  if (!session) {
    return { success: false, message: "Akses tidak diizinkan." };
  }

  const page = MAINTENANCE_PAGES.find(
    (item) => item.key === pageKey && item.manageable !== false,
  );
  if (!page) {
    return { success: false, message: "Halaman maintenance tidak valid." };
  }

  try {
    await prisma.pageMaintenance.upsert({
      where: { pageKey },
      update: {
        pageName: page.name,
        path: page.path,
        isUnderMaintenance,
      },
      create: {
        pageKey,
        pageName: page.name,
        path: page.path,
        isUnderMaintenance,
      },
    });
  } catch (error) {
    console.error("togglePageMaintenance failed:", error);
    return {
      success: false,
      message: "Gagal menyimpan status maintenance halaman.",
    };
  }

  revalidatePath("/", "layout");
  return {
    success: true,
    message: isUnderMaintenance
      ? "Halaman berhasil ditandai dalam maintenance."
      : "Status maintenance halaman berhasil dinonaktifkan.",
  };
}
