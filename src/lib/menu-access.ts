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
    select: { role: true, menuKey: true, isAllowed: true },
  });

  const existingMap = new Map(
    existing.map((entry) => [`${entry.role}:${entry.menuKey}`, entry.isAllowed]),
  );

  const rowsToCreate: Array<{
    role: string;
    menuKey: string;
    menuName: string;
    isAllowed: boolean;
  }> = [];
  const rowsToRequire: Array<{ role: string; menuKey: string }> = [];

  for (const role of APP_ROLES) {
    const defaultAllowedKeys = new Set(DEFAULT_MENU_ACCESS_BY_ROLE[role] ?? []);

    for (const menu of APP_MENUS) {
      const compositeKey = `${role}:${menu.key}`;
      const required = isMenuAccessRequired(role, menu.key);
      if (existingMap.has(compositeKey)) {
        if (required && existingMap.get(compositeKey) !== true) {
          rowsToRequire.push({ role, menuKey: menu.key });
        }
        continue;
      }

      rowsToCreate.push({
        role,
        menuKey: menu.key,
        menuName: menu.name,
        isAllowed: required || defaultAllowedKeys.has(menu.key),
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

  for (const row of rowsToRequire) {
    await prisma.menuAccess.update({
      where: { role_menuKey: { role: row.role, menuKey: row.menuKey } },
      data: { isAllowed: true },
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
