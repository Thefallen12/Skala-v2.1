"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SidebarContent, { type ChildItem } from "./sidebaritems";
import { Icon } from "@iconify/react";
import FullLogo from "../shared/logo/FullLogo";
import type { SidebarCounts } from "../header/useNotificationFeed";
import { ANDROID_APK } from "@/lib/apk-config";

interface SidebarProps {
  onClose?: () => void;
  canManageUsers: boolean;
  canAccessLogistics: boolean;
  canAccessExecutive: boolean;
  canAccessFinance: boolean;
  canAccessProjects: boolean;
  canAccessDrafter: boolean;
  isMover: boolean;
  allowedMenuKeys?: string[];
  sidebarCounts: SidebarCounts;
  androidDownloadUrl: string | null;
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
  allowedMenuKeys,
  sidebarCounts,
  androidDownloadUrl,
}: SidebarProps) => {
  const pathname = usePathname();

  const filterItem = (
    item: ChildItem,
  ): (ChildItem & { notificationCount: number }) | null => {
    if (
      (item.menuKey &&
        allowedMenuKeys &&
        !allowedMenuKeys.includes(item.menuKey)) ||
      (item.requiresUserManagement && !canManageUsers) ||
      (item.requiresLogistics && !canAccessLogistics) ||
      (item.requiresExecutive && !canAccessExecutive) ||
      (item.requiresFinance && !canAccessFinance) ||
      (item.requiresProjects && !canAccessProjects) ||
      (item.requiresDrafter && !canAccessDrafter) ||
      (item.requiresNonMover && isMover)
    ) {
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
  };

  const visibleSections = SidebarContent.map((section) => ({
    ...section,
    items: (section.children ?? [])
      .map(filterItem)
      .filter(
        (item): item is ChildItem & { notificationCount: number } =>
          item !== null,
      ),
  })).filter((section) => section.items.length > 0);

  const isPathActive = (url?: string) => {
    if (!url) return false;
    if (url === "/") return pathname === "/";
    if (url === "/apps/projects" && pathname.startsWith("/apps/projects/map")) {
      return false;
    }
    if (
      url === "/apps/logistics" &&
      pathname.startsWith("/apps/logistics/stock")
    ) {
      return false;
    }
    if (
      url === "/apps/documents" &&
      pathname.startsWith("/apps/documents/issued")
    ) {
      return false;
    }
    return pathname === url || pathname.startsWith(`${url}/`);
  };

  return (
    <aside className="flex h-screen w-[272px] flex-col border-r border-border bg-sidebar text-sidebar-foreground select-none xl:fixed xl:left-0 xl:top-0 xl:z-30">
      {/* Top Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 px-5">
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-2.5 focus:outline-none"
        >
          <FullLogo />
        </Link>
        <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          v2.1 ERP
        </span>
      </div>

      {/* Quick Action Button in Sidebar */}
      <div className="border-b border-border/60 px-4 py-3">
        {isMover ? (
          <Link
            href="/apps/logistics"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
          >
            <Icon icon="solar:delivery-bold" width={16} height={16} />
            <span>Tugas Pengiriman</span>
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/apps/tickets?create=1"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
            >
              <Icon icon="solar:add-circle-bold" width={15} height={15} />
              <span>Buat Tiket</span>
            </Link>
            <Link
              href="/apps/orders/new?type=po"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/40 hover:bg-accent"
            >
              <Icon icon="solar:document-add-bold-duotone" width={15} height={15} className="text-primary" />
              <span>Buat PO/DO</span>
            </Link>
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-5 pb-6">
          {visibleSections.map((section, sIdx) => (
            <div key={section.heading ?? sIdx} className="space-y-1">
              {section.heading && (
                <div className="flex items-center gap-2 px-2.5 pb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/85">
                    {section.heading}
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isPathActive(item.url);
                  return (
                    <Link
                      key={item.id ?? item.url ?? item.name}
                      href={item.url ?? "/"}
                      onClick={onClose}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm font-semibold"
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
                          <span className="truncate text-[13px] leading-tight">
                            {item.name}
                          </span>
                          {item.notificationCount > 0 && (
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                                active
                                  ? "bg-white text-primary"
                                  : "bg-red-600 text-white"
                              }`}
                            >
                              {item.notificationCount > 99
                                ? "99+"
                                : item.notificationCount}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p
                            className={`mt-0.5 truncate text-[11px] leading-tight ${
                              active
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
                            }`}
                          >
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {androidDownloadUrl && (
            <div className="border-t border-border/70 px-2 pt-3">
              <a
                href={androidDownloadUrl}
                download={ANDROID_APK.fileName}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Icon icon="tabler:download" height={16} width={16} />
                <span>Unduh Aplikasi Android</span>
                <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold">
                  {ANDROID_APK.label}
                </span>
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* Footer Workflow Status */}
      <div className="border-t border-border/80 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-emerald-500" />
            Sistem Operasional Aktif
          </span>
          <Link
            href="/apps/settings"
            onClick={onClose}
            className="font-semibold text-primary hover:underline"
          >
            Bantuan
          </Link>
        </div>
      </div>
    </aside>
  );
};

export default SidebarLayout;
