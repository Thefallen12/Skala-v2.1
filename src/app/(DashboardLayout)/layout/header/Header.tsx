"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Icon } from "@iconify/react";
import Profile from "./Profile";
import NotificationBell from "./NotificationBell";
import SidebarLayout from "../sidebar/Sidebar";
import FullLogo from "../shared/logo/FullLogo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Search from "./Search";
import type { DashboardNotification } from "./Notifications";
import type { NotificationFeed, SidebarCounts } from "./useNotificationFeed";
import type { UserRole } from "@prisma/client";

const MODULE_LABELS: Array<{ prefix: string; title: string; stage: string }> = [
  { prefix: "/apps/projects/map", title: "Peta Survei & WebGIS", stage: "Tahap 02 · Proyek & Teknik" },
  { prefix: "/apps/projects", title: "Master Proyek & Kurva S", stage: "Tahap 02 · Proyek & Teknik" },
  { prefix: "/apps/drafter", title: "Gambar Kerja (DED)", stage: "Tahap 02 · Proyek & Teknik" },
  { prefix: "/apps/blueprints", title: "Katalog Gambar Kerja", stage: "Tahap 02 · Proyek & Teknik" },
  { prefix: "/apps/tickets", title: "Tiket & Permintaan", stage: "Tahap 03 · Pengadaan & Logistik" },
  { prefix: "/apps/logistics/stock", title: "Gudang & Stok Material", stage: "Tahap 03 · Pengadaan & Logistik" },
  { prefix: "/apps/logistics", title: "Logistik & Pengiriman", stage: "Tahap 03 · Pengadaan & Logistik" },
  { prefix: "/apps/orders", title: "Order PO & Surat Jalan", stage: "Tahap 03 · Pengadaan & Logistik" },
  { prefix: "/apps/approvals", title: "Persetujuan Direksi", stage: "Tahap 04 · Otorisasi & Keuangan" },
  { prefix: "/apps/finance", title: "Finance & Kas Proyek", stage: "Tahap 04 · Otorisasi & Keuangan" },
  { prefix: "/apps/documents/issued", title: "Arsip Dokumen Terbit", stage: "Tahap 05 · Dokumen & Sistem" },
  { prefix: "/apps/documents", title: "Generator Dokumen PO & DO", stage: "Tahap 05 · Dokumen & Sistem" },
  { prefix: "/apps/templates", title: "Editor Template Dokumen", stage: "Tahap 05 · Dokumen & Sistem" },
  { prefix: "/apps/habits", title: "Jadwal, Tugas & Timesheet", stage: "Tahap 01 · Komando & Jadwal" },
  { prefix: "/apps/notes", title: "Catatan Operasional", stage: "Tahap 01 · Komando & Jadwal" },
  { prefix: "/apps/settings", title: "Pengaturan Sistem & Pengguna", stage: "Tahap 05 · Dokumen & Sistem" },
];

const Header = ({
  canManageUsers,
  canAccessLogistics,
  canAccessExecutive,
  canAccessFinance,
  canAccessProjects,
  canAccessDrafter,
  isMover,
  allowedMenuKeys,
  profilePhotoUrl,
  userName,
  userRole,
  notifications,
  androidDownloadUrl,
  sidebarCounts,
  notificationFeed,
  notificationLoadFailed,
  refreshNotifications,
}: {
  canManageUsers: boolean;
  canAccessLogistics: boolean;
  canAccessExecutive: boolean;
  canAccessFinance: boolean;
  canAccessProjects: boolean;
  canAccessDrafter: boolean;
  isMover: boolean;
  allowedMenuKeys: string[];
  profilePhotoUrl: string | null;
  userName: string;
  userRole: UserRole;
  notifications: DashboardNotification[];
  androidDownloadUrl: string | null;
  sidebarCounts: SidebarCounts;
  notificationFeed: NotificationFeed | null;
  notificationLoadFailed: boolean;
  refreshNotifications: () => Promise<unknown>;
}) => {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [isSticky, setIsSticky] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 24);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const toggleMode = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const activeModule = MODULE_LABELS.find((m) =>
    pathname.startsWith(m.prefix),
  ) ?? {
    title: "Command Center",
    stage: "Tahap 01 · Komando & Ringkasan",
  };

  const totalPendingActions =
    (sidebarCounts.executive ?? 0) +
    (sidebarCounts.logistics ?? 0) +
    (sidebarCounts.finance ?? 0);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-20 border-b border-border bg-background/90 text-foreground backdrop-blur-xl md:sticky md:inset-x-auto ${
          isSticky ? "shadow-sm" : ""
        }`}
      >
        <nav className="flex min-h-16 min-w-0 items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6">
          {/* Left: Mobile Menu Button + Module Title + Search */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label="Buka menu navigasi"
              onClick={() => setIsOpen(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-accent xl:hidden"
            >
              <Icon icon="tabler:menu-2" height={19} width={19} />
            </button>

            <div className="min-w-0 xl:hidden">
              <FullLogo />
            </div>

            {/* Current Module Indicator on Desktop */}
            <div className="hidden shrink-0 flex-col xl:flex">
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-primary">
                {activeModule.stage}
              </span>
              <h2 className="whitespace-nowrap text-sm font-bold text-foreground">
                {activeModule.title}
              </h2>
            </div>

            <div className="hidden h-6 w-px shrink-0 bg-border xl:block" />

            {/* Search Bar */}
            <div className="hidden min-w-[200px] max-w-sm flex-1 lg:block">
              <Search />
            </div>
          </div>

          {/* Right: Quick Action Shortcuts + Theme + Notifications + Profile */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Quick Action Buttons on Desktop */}
            <div className="hidden items-center gap-1.5 md:flex">
              {canAccessProjects && (
                <Link
                  href="/apps/projects"
                  className="hidden h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent 2xl:inline-flex"
                >
                  <Icon
                    icon="solar:buildings-2-bold-duotone"
                    width={15}
                    height={15}
                    className="text-primary"
                  />
                  <span>Proyek</span>
                </Link>
              )}

              {!isMover && (
                <Link
                  href="/apps/tickets?create=1"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-2xs transition hover:bg-primary/90"
                >
                  <Icon icon="solar:add-circle-bold" width={15} height={15} />
                  <span>+ Permintaan</span>
                </Link>
              )}

              {canAccessExecutive && (
                <Link
                  href="/apps/approvals"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
                >
                  <Icon
                    icon="solar:shield-check-bold-duotone"
                    width={15}
                    height={15}
                  />
                  <span>Otorisasi</span>
                  {totalPendingActions > 0 && (
                    <span className="rounded-full bg-amber-600 px-1.5 py-0.2 text-[10px] font-bold text-white tabular-nums">
                      {totalPendingActions}
                    </span>
                  )}
                </Link>
              )}
            </div>

            <div className="hidden h-5 w-px bg-border md:block" />

            {/* Dark/Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleMode}
              aria-label="Ubah tema tampilan"
              className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {theme === "light" ? (
                <Icon icon="tabler:moon" width={18} height={18} />
              ) : (
                <Icon icon="solar:sun-bold-duotone" width={18} height={18} />
              )}
            </button>

            {/* Notification Bell */}
            <NotificationBell
              fallbackNotifications={notifications}
              feed={notificationFeed}
              loadFailed={notificationLoadFailed}
              refreshNotifications={refreshNotifications}
            />

            {/* Profile & Quick Role Switcher */}
            <Profile
              canManageUsers={canManageUsers}
              profilePhotoUrl={profilePhotoUrl}
              userName={userName}
              userRole={userRole}
            />
          </div>
        </nav>
      </header>

      {/* Mobile Sidebar */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="w-[272px] p-0">
          <VisuallyHidden>
            <SheetTitle>Navigasi Sistem</SheetTitle>
          </VisuallyHidden>
          <SidebarLayout
            canManageUsers={canManageUsers}
            canAccessLogistics={canAccessLogistics}
            canAccessExecutive={canAccessExecutive}
            canAccessFinance={canAccessFinance}
            canAccessProjects={canAccessProjects}
            canAccessDrafter={canAccessDrafter}
            isMover={isMover}
            allowedMenuKeys={allowedMenuKeys}
            sidebarCounts={sidebarCounts}
            androidDownloadUrl={androidDownloadUrl}
            onClose={() => setIsOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Header;
