"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Icon } from "@iconify/react";
import { Download } from "lucide-react";

import { useDashboardMenuAccess } from "../../DashboardLayoutClient";
import SidebarContent, {
  isMenuItemAllowed,
  type ChildItem,
} from "./sidebaritems";
import FullLogo from "../shared/logo/FullLogo";
import type { SidebarCounts } from "../header/useNotificationFeed";
import { Button } from "@/components/ui/button";
import { ANDROID_APK } from "@/lib/apk-config";
import { handleApkLinkClick } from "@/lib/apk-update-client";

interface SidebarProps {
  onClose?: () => void;
  canManageUsers: boolean;
  canAccessLogistics: boolean;
  canAccessExecutive: boolean;
  canAccessFinance: boolean;
  canAccessProjects: boolean;
  canAccessDrafter: boolean;
  isMover: boolean;
  userRole?: UserRole;
  allowedMenuKeys?: string[];
  sidebarCounts: SidebarCounts;
  androidDownloadUrl: string | null;
}

interface SidebarQuickAction {
  label: string;
  href: string;
  icon: string;
  primary: boolean;
}

type VisibleSidebarItem = ChildItem & { notificationCount: number };

function SidebarNavItem({
  item,
  active,
  onClose,
}: {
  item: VisibleSidebarItem;
  active: boolean;
  onClose?: () => void;
}) {
  return (
    <Link
      href={item.url ?? "/"}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-primary font-semibold text-primary-foreground shadow-sm"
          : "text-sidebar-foreground/85 hover:bg-accent hover:text-foreground"
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          active
            ? "bg-white/15 text-primary-foreground"
            : "bg-muted/70 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
        }`}
      >
        <Icon
          icon={item.icon ?? "solar:widget-2-linear"}
          width={18}
          height={18}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className="type-p2 truncate leading-tight font-medium">
            {item.name}
          </span>
          {item.notificationCount > 0 && (
            <span
              className={`type-p3 shrink-0 rounded-full px-1.5 py-0.5 font-bold leading-none tabular-nums ${
                active
                  ? "bg-white text-primary"
                  : "bg-red-600 text-white"
              }`}
            >
              {item.notificationCount > 99 ? "99+" : item.notificationCount}
            </span>
          )}
        </div>
        {item.subtitle ? (
          <p
            className={`type-p3 mt-0.5 truncate leading-tight ${
              active
                ? "text-primary-foreground/85"
                : "text-muted-foreground"
            }`}
          >
            {item.subtitle}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

const SidebarLayout = ({
  onClose,
  canManageUsers,
  canAccessLogistics,
  canAccessExecutive,
  canAccessFinance,
  canAccessProjects,
  canAccessDrafter,
  isMover,
  userRole: propUserRole,
  allowedMenuKeys,
  sidebarCounts,
  androidDownloadUrl,
}: SidebarProps) => {
  const pathname = usePathname();
  const menuAccess = useDashboardMenuAccess();
  const effectiveRole = propUserRole ?? menuAccess?.userRole;

  const accessFlags = {
    canManageUsers,
    canAccessLogistics,
    canAccessExecutive,
    canAccessFinance,
    canAccessProjects,
    canAccessDrafter,
    isMover,
    allowedMenuKeys,
  };

  const hasMenuKey = (key: string) =>
    !allowedMenuKeys || allowedMenuKeys.includes(key);

  const visibleSections = SidebarContent.map((section) => ({
    ...section,
    items: (section.children ?? [])
      .map((item): VisibleSidebarItem | null => {
        if (!isMenuItemAllowed(item, accessFlags)) {
          return null;
        }

        const notificationCount =
          item.url === "/apps/approvals"
            ? sidebarCounts.executive
            : item.url === "/apps/logistics"
              ? sidebarCounts.logistics
              : item.url === "/apps/finance"
                ? sidebarCounts.finance
                : 0;

        return {
          ...item,
          notificationCount,
        };
      })
      .filter((item): item is VisibleSidebarItem => item !== null),
  })).filter((section) => section.items.length > 0);

  const activeUrl = (() => {
    const urls = visibleSections.flatMap((section) =>
      section.items
        .map((item) => item.url)
        .filter((url): url is string => Boolean(url)),
    );
    if (pathname === "/") {
      return urls.includes("/") ? "/" : undefined;
    }
    let bestMatch: string | undefined;
    for (const url of urls) {
      if (url === "/") continue;
      if (pathname === url || pathname.startsWith(`${url}/`)) {
        if (!bestMatch || url.length > bestMatch.length) {
          bestMatch = url;
        }
      }
    }
    return bestMatch;
  })();

  const isFieldOrCoordinator =
    effectiveRole === UserRole.FIELD_TEAM ||
    effectiveRole === UserRole.KOORDINATOR;

  const quickActionCandidates: SidebarQuickAction[] = [];

  if (isMover) {
    if (canAccessLogistics && hasMenuKey("logistik")) {
      quickActionCandidates.push({
        label: "Logistik",
        href: "/apps/logistics",
        icon: "solar:delivery-bold",
        primary: true,
      });
    }
  } else {
    if (hasMenuKey("tickets")) {
      quickActionCandidates.push({
        label: "Buat Tiket",
        href: "/apps/tickets?create=1",
        icon: "solar:add-circle-bold",
        primary: true,
      });
    }
    if (isFieldOrCoordinator && canAccessProjects && hasMenuKey("master_proyek")) {
      quickActionCandidates.push({
        label: "Laporan Harian",
        href: "/apps/projects?action=daily-report",
        icon: "solar:clipboard-check-bold-duotone",
        primary: false,
      });
    } else if (hasMenuKey("documents")) {
      quickActionCandidates.push({
        label: "Dokumen",
        href: "/apps/documents",
        icon: "solar:document-add-bold-duotone",
        primary: false,
      });
    } else if (canAccessDrafter && hasMenuKey("drafter")) {
      quickActionCandidates.push({
        label: "Gambar DED",
        href: "/apps/drafter",
        icon: "solar:ruler-pen-bold-duotone",
        primary: false,
      });
    } else if (canAccessLogistics && hasMenuKey("logistik")) {
      quickActionCandidates.push({
        label: "Stok Gudang",
        href: "/apps/logistics/stock",
        icon: "solar:box-bold-duotone",
        primary: false,
      });
    }
  }

  const seenQuickActionHrefs = new Set<string>();
  const quickActions = quickActionCandidates.filter((action) => {
    if (seenQuickActionHrefs.has(action.href)) return false;
    seenQuickActionHrefs.add(action.href);
    return true;
  });

  return (
    <aside className="flex h-dvh w-[272px] flex-col border-r border-border bg-sidebar text-sidebar-foreground select-none xl:fixed xl:left-0 xl:top-0 xl:z-30">
      {/* Top Brand Header */}
      <div
        className={`flex h-16 shrink-0 items-center justify-between border-b border-border/80 px-5 ${
          onClose ? "pr-12" : ""
        }`}
      >
        <Link
          href="/"
          onClick={onClose}
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FullLogo />
        </Link>
        {!onClose && (
          <span className="type-p3 shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-bold uppercase tracking-wider text-primary">
            v2.1
          </span>
        )}
      </div>

      {/* Quick Action Buttons */}
      {quickActions.length > 0 && (
        <div className="border-b border-border/60 px-4 py-3">
          <div
            className={`grid gap-2 ${
              quickActions.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {quickActions.map((action) => (
              <Button
                key={action.href}
                asChild
                size="sm"
                variant={action.primary ? "default" : "outline"}
                className={
                  action.primary
                    ? "w-full justify-center px-2.5"
                    : "w-full justify-center border-border bg-card px-2.5 text-foreground hover:bg-accent hover:text-foreground"
                }
              >
                <Link href={action.href} onClick={onClose}>
                  <Icon
                    icon={action.icon}
                    width={15}
                    height={15}
                    className={action.primary ? undefined : "text-primary"}
                  />
                  <span className="truncate">{action.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Sections */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-5 pb-6">
          {visibleSections.map((section, sIdx) => (
            <div key={section.heading ?? sIdx} className="space-y-1">
              {section.heading && (
                <div className="flex items-center gap-2 px-2.5 pb-1">
                  <span className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
                    {section.heading}
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.id ?? item.url ?? item.name}
                    item={item}
                    active={Boolean(item.url && item.url === activeUrl)}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          ))}

          {androidDownloadUrl && (
            <div className="border-t border-border/70 px-2 pt-3">
              <Button
                asChild
                variant="lightprimary"
                size="default"
                className="w-full justify-center border border-primary/30"
              >
                <a
                  href={androidDownloadUrl}
                  download={ANDROID_APK.fileName}
                  onClick={(event) => {
                    if (handleApkLinkClick(event, androidDownloadUrl)) {
                      onClose?.();
                    }
                  }}
                >
                  <Download className="size-4 shrink-0" aria-hidden="true" />
                  <span>Unduh APK</span>
                  <span className="type-p3 rounded bg-primary/15 px-1.5 py-0.5 font-bold">
                    {ANDROID_APK.label}
                  </span>
                </a>
              </Button>
            </div>
          )}
        </div>
      </nav>

      {/* Footer Workflow Status */}
      <div className="border-t border-border/80 bg-muted/30 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] xl:pb-2.5">
        <div className="type-p3 flex items-center justify-between text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className="size-2 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            Sistem Aktif
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-compact="true"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new Event("skala:check-update"));
                }
                onClose?.();
              }}
              className="h-7 px-1.5 font-semibold text-foreground/80 hover:text-primary"
            >
              Cek Update
            </Button>
            <Button
              asChild
              variant="link"
              size="sm"
              data-compact="true"
              className="h-7 px-1.5 font-semibold"
            >
              <Link
                href={hasMenuKey("settings") ? "/apps/settings" : "/user-profile"}
                onClick={onClose}
              >
                {hasMenuKey("settings") ? "Pengaturan" : "Profil"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default SidebarLayout;
