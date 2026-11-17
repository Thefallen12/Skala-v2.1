"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Building2,
  Menu,
  Moon,
  Plus,
  Search as SearchIcon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { UserRole } from "@prisma/client";

import Profile from "./Profile";
import NotificationBell from "./NotificationBell";
import SidebarLayout from "../sidebar/Sidebar";
import FullLogo from "../shared/logo/FullLogo";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import Search from "./Search";
import type { DashboardNotification } from "./Notifications";
import type { NotificationFeed, SidebarCounts } from "./useNotificationFeed";

const MODULE_LABELS: Array<{ prefix: string; title: string; stage: string }> = [
  { prefix: "/apps/projects/schedule", title: "Jadwal Proyek", stage: "02 · Proyek" },
  { prefix: "/apps/projects/reports", title: "Laporan Proyek", stage: "02 · Proyek" },
  { prefix: "/apps/projects", title: "Proyek", stage: "02 · Proyek" },
  { prefix: "/apps/drafter", title: "Gambar DED", stage: "02 · Proyek" },
  { prefix: "/apps/tickets", title: "Tiket", stage: "03 · Logistik" },
  { prefix: "/apps/logistics/stock", title: "Stok Gudang", stage: "03 · Logistik" },
  { prefix: "/apps/logistics", title: "Logistik", stage: "03 · Logistik" },
  { prefix: "/apps/approvals", title: "Persetujuan", stage: "04 · Keuangan" },
  { prefix: "/apps/finance", title: "Keuangan", stage: "04 · Keuangan" },
  { prefix: "/apps/documents", title: "Dokumen", stage: "05 · Sistem" },
  { prefix: "/apps/templates", title: "Template", stage: "05 · Sistem" },
  { prefix: "/apps/habits", title: "Progres", stage: "01 · Ringkasan" },
  { prefix: "/apps/settings", title: "Pengaturan", stage: "05 · Sistem" },
  { prefix: "/user-profile", title: "Profil", stage: "Akun" },
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
  const router = useRouter();
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
    title: "Beranda",
    stage: "01 · Ringkasan",
  };

  const isSubPage = pathname !== "/";
  const executivePendingCount = sidebarCounts.executive ?? 0;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const hasMenuKey = (key: string) => allowedMenuKeys.includes(key);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-20 border-b border-border bg-background/90 pt-[env(safe-area-inset-top,0px)] text-foreground backdrop-blur-xl md:sticky md:inset-x-auto md:pt-0 ${
          isSticky ? "shadow-sm" : ""
        }`}
      >
        <nav className="flex min-h-16 min-w-0 items-center justify-between gap-1.5 px-2.5 py-2 sm:gap-4 sm:px-6 sm:py-2.5">
          {/* Left: Mobile/Tablet Menu + Back Button + Brand + Module Title + Search */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Buka menu navigasi"
              aria-expanded={isOpen}
              onClick={() => setIsOpen(true)}
              className="shrink-0 border-border bg-card text-foreground hover:bg-accent hover:text-foreground xl:hidden"
            >
              <Menu className="size-4" aria-hidden="true" />
            </Button>

            {isSubPage && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleBack}
                aria-label="Kembali ke halaman sebelumnya"
                title="Kembali"
                className="shrink-0 border-border bg-card text-foreground hover:bg-accent hover:text-foreground xl:hidden"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
            )}

            {isSubPage ? (
              <Link
                href="/"
                className="hidden shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex xl:hidden"
              >
                <BrandLogo
                  alt="Beranda Skala Prioritas"
                  width={36}
                  height={32}
                  className="h-8 w-9 shrink-0 rounded-md object-contain dark:bg-white dark:p-0.5"
                />
              </Link>
            ) : (
              <Link
                href="/"
                className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
              >
                <FullLogo />
              </Link>
            )}

            {/* Current Module Indicator across Mobile, Tablet & Desktop */}
            <div className="flex min-w-0 flex-col xl:shrink-0">
              <span className="type-p3 hidden truncate font-semibold uppercase tracking-wider text-primary sm:block">
                {activeModule.stage}
              </span>
              <h2 className="type-h2 truncate text-foreground">
                {activeModule.title}
              </h2>
            </div>

            <div className="hidden h-6 w-px shrink-0 bg-border lg:block" />

            {/* Search Bar on lg+ (Mobile/Tablet uses trigger button & modal) */}
            <div className="hidden min-w-[200px] max-w-sm flex-1 lg:block">
              <Search
                canManageUsers={canManageUsers}
                canAccessLogistics={canAccessLogistics}
                canAccessExecutive={canAccessExecutive}
                canAccessFinance={canAccessFinance}
                canAccessProjects={canAccessProjects}
                canAccessDrafter={canAccessDrafter}
                isMover={isMover}
                allowedMenuKeys={allowedMenuKeys}
              />
            </div>
          </div>

          {/* Right: Search Trigger (<lg) + Quick Action Shortcuts + Theme + Notifications + Profile */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => window.dispatchEvent(new Event("skala:open-search"))}
              aria-label="Cari modul dan halaman (Ctrl+K)"
              title="Cari modul (Ctrl+K)"
              className="shrink-0 border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            >
              <SearchIcon className="size-4" aria-hidden="true" />
            </Button>

            {/* Quick Action Buttons on Tablet & Desktop */}
            <div className="hidden items-center gap-1.5 md:flex">
              {canAccessProjects && hasMenuKey("master_proyek") && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="hidden border-border bg-card text-foreground hover:bg-accent hover:text-foreground 2xl:inline-flex"
                >
                  <Link href="/apps/projects">
                    <Building2
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                    <span>Proyek</span>
                  </Link>
                </Button>
              )}

              {!isMover && hasMenuKey("tickets") && (
                <Button asChild size="sm">
                  <Link href="/apps/tickets?create=1">
                    <Plus className="size-4" aria-hidden="true" />
                    <span>Buat Tiket</span>
                  </Link>
                </Button>
              )}

              {canAccessExecutive && hasMenuKey("approvals") && (
                <Button
                  asChild
                  variant="lightwarning"
                  size="sm"
                  className="border border-amber-500/30"
                >
                  <Link
                    href="/apps/approvals"
                    title={
                      executivePendingCount > 0
                        ? `${executivePendingCount} persetujuan direksi menunggu`
                        : "Persetujuan Direksi"
                    }
                    aria-label={
                      executivePendingCount > 0
                        ? `Persetujuan (${executivePendingCount} menunggu)`
                        : "Persetujuan"
                    }
                  >
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    <span>Persetujuan</span>
                    {executivePendingCount > 0 && (
                      <span className="type-p3 rounded-full bg-amber-600 px-1.5 py-0.5 font-bold leading-none text-white tabular-nums">
                        {executivePendingCount > 99
                          ? "99+"
                          : executivePendingCount}
                      </span>
                    )}
                  </Link>
                </Button>
              )}
            </div>

            <div className="hidden h-5 w-px bg-border md:block" />

            {/* Dark/Light Mode Toggle */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleMode}
              aria-label="Ubah tema tampilan"
              className="border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {theme === "light" ? (
                <Moon className="size-4" aria-hidden="true" />
              ) : (
                <Sun className="size-4" aria-hidden="true" />
              )}
            </Button>

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
              allowedMenuKeys={allowedMenuKeys}
              androidDownloadUrl={androidDownloadUrl}
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
            userRole={userRole}
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
