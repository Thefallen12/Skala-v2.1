import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import {
  APP_MENUS,
  APP_ROLES,
  DEFAULT_MENU_ACCESS_BY_ROLE,
  isMenuAccessRequired,
  SETTINGS_MENU_ROLES,
} from "@/lib/config/menus";

export async function ensureMenuAccessDefaults() {
  const existing = await prisma.menuAccess.findMany({
    select: { role: true, menuKey: true },
  });

  const existingSet = new Set(
    existing.map((entry) => `${entry.role}:${entry.menuKey}`),
  );

  const rowsToCreate: Array<{
    role: string;
    menuKey: string;
    menuName: string;
    isAllowed: boolean;
  }> = [];

  for (const role of APP_ROLES) {
    const defaultAllowedKeys = new Set(DEFAULT_MENU_ACCESS_BY_ROLE[role] ?? []);

    for (const menu of APP_MENUS) {
      const compositeKey = `${role}:${menu.key}`;
      if (existingSet.has(compositeKey)) {
        continue;
      }

      rowsToCreate.push({
        role,
        menuKey: menu.key,
        menuName: menu.name,
        isAllowed: defaultAllowedKeys.has(menu.key),
      });
    }
  }

  for (const row of rowsToCreate) {
    await prisma.menuAccess.upsert({
      where: { role_menuKey: { role: row.role, menuKey: row.menuKey } },
      create: row,
      update: {},
    });
  }
}

export async function getVisibleMenuKeysForRole(role: UserRole): Promise<string[]> {
  await ensureMenuAccessDefaults();

  const records = await prisma.menuAccess.findMany({
    where: { role },
    select: { menuKey: true, isAllowed: true },
  });

  const allowedSet = new Set(
    records.filter((record) => record.isAllowed).map((record) => record.menuKey),
  );

  const fallbackKeys = DEFAULT_MENU_ACCESS_BY_ROLE[role] ?? [];
  return APP_MENUS.filter((menu) => {
    if (role === UserRole.MOVER && menu.key === "drafter") {
      return false;
    }

    if (isMenuAccessRequired(role, menu.key)) {
      return true;
    }

    if (
      menu.key === "settings" &&
      !SETTINGS_MENU_ROLES.includes(role)
    ) {
      return false;
    }

    if (allowedSet.has(menu.key)) {
      return true;
    }

    if (records.some((record) => record.menuKey === menu.key)) {
      return false;
    }

    return fallbackKeys.includes(menu.key);
  }).map((menu) => menu.key);
}
