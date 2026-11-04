"use client";

import { useState, useEffect } from "react";
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
  sidebarCounts: SidebarCounts;
  notificationFeed: NotificationFeed | null;
  notificationLoadFailed: boolean;
  refreshNotifications: () => Promise<unknown>;
}) => {
  const { theme, setTheme } = useTheme();
  const [isSticky, setIsSticky] = useState(false);
  const [mobileMenu, setMobileMenu] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsSticky(true);
      } else {
        setIsSticky(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const toggleMode = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  return (
    <>
      <header
        className={`sticky top-0 z-20 border-b border-border bg-background/75 text-foreground backdrop-blur-xl ${
          isSticky ? "shadow-md" : "shadow-sm"
        }`}
      >
        <nav
          className="flex min-h-16 min-w-0 max-w-full! items-center justify-between gap-1 rounded-none bg-transparent px-2 py-3 sm:gap-3 sm:px-6 sm:pe-10"
        >
          {/* Mobile Toggle Icon */}
          <div
            onClick={() => {
              setIsOpen(true);
            }}
            className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-full px-2 text-muted-foreground after:absolute after:size-10 after:rounded-full after:bg-transparent hover:after:bg-accent hover:text-accent-foreground sm:px-[15px] xl:hidden"
          >
            <Icon icon="tabler:menu-2" height={20} width={20} />
          </div>

          <div className="min-w-0 flex-1 xl:hidden">
            <FullLogo />
          </div>

          <div className="flex shrink-0 items-center xl:hidden">
            <div
              className="group relative flex cursor-pointer items-center justify-center rounded-full px-2 text-muted-foreground hover:text-foreground md:px-4"
              onClick={toggleMode}
            >
              <span className="relative flex items-center justify-center after:absolute after:size-10 after:rounded-full group-hover:after:bg-accent">
                {theme === "light" ? (
                  <Icon icon="tabler:moon" width="20" className="text-muted-foreground group-hover:text-foreground" />
                ) : (
                  <Icon
                    icon="solar:sun-bold-duotone"
                    width="20"
                    className="text-muted-foreground group-hover:text-foreground"
                  />
                )}
              </span>
            </div>

            <div className="xl:hidden">
              <div className="flex gap-0 items-center relative">
                {/* Chat */}
                <NotificationBell
                  fallbackNotifications={notifications}
                  feed={notificationFeed}
                  loadFailed={notificationLoadFailed}
                  refreshNotifications={refreshNotifications}
                />
              </div>
            </div>

            {/* Profile Dropdown */}
            <Profile
              canManageUsers={canManageUsers}
              profilePhotoUrl={profilePhotoUrl}
              userName={userName}
              userRole={userRole}
            />
          </div>

          <div className="hidden xl:flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {/* Search Icon */}              
              <div className="relative">
                <Search />
              </div>
            </div>
            <div className="flex w-full justify-end items-end">
              <div className="flex gap-0 items-center ">
                {/* ✅ Dark/Light Toggle */}
                <div
                  className="group relative flex cursor-pointer items-center justify-center rounded-full px-4 text-muted-foreground hover:text-foreground"
                  onClick={toggleMode}
                >
                  <span className="relative flex items-center justify-center after:absolute after:size-10 after:rounded-full group-hover:after:bg-accent">
                    {theme === "light" ? (
                      <Icon icon="tabler:moon" width="20" className="text-muted-foreground group-hover:text-foreground" />
                    ) : (
                      <Icon
                        icon="solar:sun-bold-duotone"
                        width="20"
                        className="text-muted-foreground group-hover:text-foreground"
                      />
                    )}
                  </span>
                </div>

                <div className="xl:block ">
                  <div className="flex gap-0 items-center relative">
                    {/* Chat */}
                    <NotificationBell
                      fallbackNotifications={notifications}
                      feed={notificationFeed}
                      loadFailed={notificationLoadFailed}
                      refreshNotifications={refreshNotifications}
                    />
                  </div>
                </div>

                {/* Profile Dropdown */}
                <Profile
                  canManageUsers={canManageUsers}
                  profilePhotoUrl={profilePhotoUrl}
                  userName={userName}
                  userRole={userRole}
                />
              </div>
            </div>
          </div>
        </nav>
      </header>

      {/* Mobile Sidebar */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <VisuallyHidden>
            <SheetTitle>sidebar</SheetTitle>
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
            onClose={() => setIsOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Header;
