"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Home,
  Package,
  PenTool,
  Ticket,
  Truck,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { UserRole } from "@prisma/client";
import type { SidebarCounts } from "../header/useNotificationFeed";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badgeCount?: number;
  visible: boolean;
};

export function MobileBottomNav({
  userRole,
  allowedMenuKeys,
  canAccessLogistics,
  canAccessExecutive,
  canAccessFinance,
  canAccessProjects,
  canAccessDrafter,
  sidebarCounts,
}: {
  userRole: UserRole;
  allowedMenuKeys?: string[];
  canAccessLogistics?: boolean;
  canAccessExecutive?: boolean;
  canAccessFinance?: boolean;
  canAccessProjects?: boolean;
  canAccessDrafter?: boolean;
  sidebarCounts?: SidebarCounts;
}) {
  const pathname = usePathname();

  const isMover = userRole === UserRole.MOVER;
  const isExecutive =
    userRole === UserRole.DIRECTOR || userRole === UserRole.DEPUTY_DIRECTOR;
  const isFinance = userRole === UserRole.FINANCE;
  const isDrafter = userRole === UserRole.DRAFTER;
  const isFieldOrCoordinator =
    userRole === UserRole.FIELD_TEAM || userRole === UserRole.KOORDINATOR;

  const hasMenu = (key: string) =>
    !allowedMenuKeys || allowedMenuKeys.includes(key);

  const allowLogistics = canAccessLogistics ?? !isDrafter;
  const allowExecutive =
    canAccessExecutive ??
    (isExecutive ||
      userRole === UserRole.ADMINISTRATIONS ||
      userRole === UserRole.KOORDINATOR ||
      isFinance);
  const allowFinance =
    canAccessFinance ??
    (isFinance ||
      isExecutive ||
      userRole === UserRole.ADMINISTRATIONS ||
      userRole === UserRole.KOORDINATOR);
  const allowProjects = canAccessProjects ?? true;
  const allowDrafter =
    canAccessDrafter ??
    (isDrafter ||
      isExecutive ||
      userRole === UserRole.ADMINISTRATIONS ||
      userRole === UserRole.KOORDINATOR ||
      userRole === UserRole.FIELD_TEAM);

  const candidates: NavItem[] = [
    {
      label: "Beranda",
      href: "/",
      icon: Home,
      visible: hasMenu("dashboard"),
    },
    {
      label: "Proyek",
      href: "/apps/projects",
      icon: Building2,
      visible: !isMover && allowProjects && hasMenu("master_proyek"),
    },
    ...(isMover
      ? [
          {
            label: "Logistik",
            href: "/apps/logistics",
            icon: Truck,
            badgeCount: sidebarCounts?.logistics ?? 0,
            visible: allowLogistics && hasMenu("logistik"),
          },
          {
            label: "Stok",
            href: "/apps/logistics/stock",
            icon: Package,
            visible: allowLogistics && hasMenu("logistik"),
          },
        ]
      : [
          {
            label: "Tiket",
            href: "/apps/tickets",
            icon: Ticket,
            visible: hasMenu("tickets"),
          },
          ...(isFieldOrCoordinator
            ? [
                {
                  label: "Laporan Harian",
                  href: "/apps/projects?action=daily-report",
                  icon: ClipboardList,
                  visible: allowProjects && hasMenu("master_proyek"),
                },
              ]
            : isExecutive
              ? [
                  {
                    label: "Persetujuan",
                    href: "/apps/approvals",
                    icon: ClipboardCheck,
                    badgeCount: sidebarCounts?.executive ?? 0,
                    visible: allowExecutive && hasMenu("approvals"),
                  },
                ]
              : isFinance
                ? [
                    {
                      label: "Keuangan",
                      href: "/apps/finance",
                      icon: Wallet,
                      badgeCount: sidebarCounts?.finance ?? 0,
                      visible: allowFinance && hasMenu("finance_hub"),
                    },
                  ]
                : isDrafter
                  ? [
                      {
                        label: "Gambar",
                        href: "/apps/drafter",
                        icon: PenTool,
                        visible: allowDrafter && hasMenu("drafter"),
                      },
                    ]
                  : [
                      {
                        label: "Logistik",
                        href: "/apps/logistics",
                        icon: Truck,
                        badgeCount: sidebarCounts?.logistics ?? 0,
                        visible: allowLogistics && hasMenu("logistik"),
                      },
                    ]),
        ]),
    {
      label: "Progres",
      href: "/apps/habits",
      icon: CalendarCheck2,
      visible: hasMenu("habits"),
    },
    {
      label: "Dokumen",
      href: "/apps/documents",
      icon: FileText,
      visible: !isMover && hasMenu("documents"),
    },
    {
      label: "Profil",
      href: "/user-profile",
      icon: UserRound,
      visible: true,
    },
  ];

  const seenHrefs = new Set<string>();
  const items = candidates
    .filter((item) => {
      if (!item.visible || seenHrefs.has(item.href)) return false;
      seenHrefs.add(item.href);
      return true;
    })
    .slice(0, 5);

  const activeHref = (() => {
    if (pathname === "/") {
      return items.some((item) => item.href === "/") ? "/" : undefined;
    }
    let bestMatch: string | undefined;
    for (const item of items) {
      const basePath = item.href.split("?")[0];
      if (basePath === "/") continue;
      if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
        if (!bestMatch || basePath.length > bestMatch.split("?")[0].length) {
          bestMatch = item.href;
        }
      }
    }
    return bestMatch;
  })();

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-14 sm:min-h-16 items-center justify-around border-t border-border bg-background/95 px-1 backdrop-blur-lg md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        const badgeCount = item.badgeCount ?? 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-14 sm:h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10.5px] sm:text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`relative flex h-6 w-10 sm:h-7 sm:w-11 items-center justify-center rounded-full transition-colors ${
                active ? "bg-primary/15 text-primary" : ""
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {badgeCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums"
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-0.5">{item.label}</span>
            {badgeCount > 0 && <span className="sr-only">({badgeCount} menunggu)</span>}
          </Link>
        );
      })}
    </nav>
  );
}
