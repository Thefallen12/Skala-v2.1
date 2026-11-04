import { UserRole } from "@prisma/client";

export type AppMenuKey =
  | "dashboard"
  | "master_proyek"
  | "blueprints"
  | "drafter"
  | "approvals"
  | "finance_hub"
  | "habits"
  | "tickets"
  | "logistik"
  | "documents_issued"
  | "documents"
  | "templates"
  | "notes"
  | "settings";

export type MenuDefinition = {
  key: AppMenuKey;
  name: string;
  path: string;
  icon: string;
};

export const APP_MENUS: MenuDefinition[] = [
  { key: "dashboard", name: "Beranda / Dashboard", path: "/", icon: "Home" },
  { key: "master_proyek", name: "Master Proyek", path: "/apps/projects", icon: "Folder" },
  { key: "blueprints", name: "Gambar Kerja", path: "/apps/blueprints", icon: "FolderKanban" },
  { key: "drafter", name: "Gambar Kerja (Drafter)", path: "/apps/drafter", icon: "PenTool" },
  { key: "approvals", name: "Persetujuan Eksekutif", path: "/apps/approvals", icon: "CheckCheck" },
  { key: "finance_hub", name: "Finance Hub", path: "/apps/finance", icon: "Wallet" },
  { key: "habits", name: "Jadwal & Habit", path: "/apps/habits", icon: "CalendarRange" },
  { key: "tickets", name: "Tiket & Permintaan", path: "/apps/tickets", icon: "Ticket" },
  { key: "logistik", name: "Logistik Lapangan", path: "/apps/logistics", icon: "Package" },
  { key: "documents_issued", name: "Dokumen Terbit", path: "/apps/documents/issued", icon: "FileArchive" },
  { key: "documents", name: "Dokumen PO & DO", path: "/apps/documents", icon: "FileText" },
  { key: "templates", name: "Template Dokumen", path: "/apps/templates", icon: "FileStack" },
  { key: "notes", name: "Catatan", path: "/apps/notes", icon: "NotebookText" },
  { key: "settings", name: "Pengaturan Sistem", path: "/apps/settings", icon: "Settings" },
];

export const APP_ROLES = Object.values(UserRole) as UserRole[];

export const SETTINGS_MENU_ROLES: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
];

export const REQUIRED_MENU_ACCESS_BY_ROLE: Partial<
  Record<UserRole, AppMenuKey[]>
> = {
  [UserRole.ADMINISTRATIONS]: ["drafter"],
  [UserRole.DIRECTOR]: ["drafter"],
};

export function isMenuAccessRequired(
  role: UserRole,
  menuKey: AppMenuKey,
): boolean {
  return REQUIRED_MENU_ACCESS_BY_ROLE[role]?.includes(menuKey) ?? false;
}

export const DEFAULT_MENU_ACCESS_BY_ROLE: Record<UserRole, AppMenuKey[]> = {
  [UserRole.DIRECTOR]: APP_MENUS.map((menu) => menu.key),
  [UserRole.DEPUTY_DIRECTOR]: APP_MENUS.map((menu) => menu.key),
  [UserRole.ADMINISTRATIONS]: APP_MENUS.map((menu) => menu.key),
  [UserRole.FINANCE]: [
    "dashboard",
    "finance_hub",
    "tickets",
    "documents",
    "documents_issued",
    "notes",
  ],
  [UserRole.LOGISTICS]: [
    "dashboard",
    "logistik",
    "tickets",
    "documents",
    "documents_issued",
    "notes",
  ],
  [UserRole.KOORDINATOR]: [
    "dashboard",
    "master_proyek",
    "drafter",
    "approvals",
    "tickets",
    "logistik",
    "documents",
    "documents_issued",
    "notes",
  ],
  [UserRole.FIELD_TEAM]: [
    "dashboard",
    "master_proyek",
    "drafter",
    "tickets",
    "notes",
  ],
  [UserRole.DRAFTER]: [
    "dashboard",
    "master_proyek",
    "blueprints",
    "drafter",
    "templates",
    "tickets",
    "notes",
  ],
  [UserRole.MOVER]: [
    "dashboard",
    "logistik",
    "tickets",
    "notes",
  ],
};
