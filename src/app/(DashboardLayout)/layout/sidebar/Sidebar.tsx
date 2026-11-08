import Link from "next/link";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import SidebarContent from "./sidebaritems";
import SimpleBar from "simplebar-react";
import { Icon } from "@iconify/react";
import FullLogo from "../shared/logo/FullLogo";
import {
  AMLogo,
  AMMenu,
  AMMenuItem,
  AMSidebar,
  AMSubmenu,
} from "tailwind-sidebar";
import "tailwind-sidebar/styles.css";
import type { SidebarCounts } from "../header/useNotificationFeed";

interface SidebarItemType {
  heading?: string;
  id?: number | string;
  name?: string;
  title?: string;
  icon?: string;
  url?: string;
  menuKey?: string;
  children?: SidebarItemType[];
  disabled?: boolean;
  isPro?: boolean;
  requiresUserManagement?: boolean;
  requiresLogistics?: boolean;
  requiresExecutive?: boolean;
  requiresFinance?: boolean;
  requiresProjects?: boolean;
  requiresDrafter?: boolean;
  requiresNonMover?: boolean;
  notificationCount?: number;
}

const subscribeToMount = () => () => {};
const getClientMountSnapshot = () => true;
const getServerMountSnapshot = () => false;

const renderSidebarItems = (
  items: SidebarItemType[],
  currentPath: string,
  sidebarCounts: SidebarCounts,
  onClose?: () => void,
  isSubItem: boolean = false,
) => {
  return items.map((item, index) => {
    const isSelected = currentPath === item?.url;
    const IconComp = item.icon || null;

    const iconElement = IconComp ? (
      <Icon icon={IconComp} height={21} width={21} />
    ) : (
      <Icon icon={"ri:checkbox-blank-circle-line"} height={9} width={9} />
    );

    // Heading
    if (item.heading) {
      return (
        <div className="mb-1" key={item.heading}>
          <AMMenu
            subHeading={item.heading}
            ClassName="hide-menu leading-21 text-sidebar-foreground dark:text-sidebar-foreground font-bold uppercase text-xs"
          />
        </div>
      );
    }

    // Submenu
    if (item.children?.length) {
      return (
        <div
          key={item.id ?? item.url ?? `${item.name ?? "submenu"}-${index}`}
          className="relative"
        >
          <AMSubmenu
            icon={iconElement}
            title={item.name}
            ClassName="mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground"
          >
            {renderSidebarItems(item.children, currentPath, sidebarCounts, onClose, true)}
          </AMSubmenu>
          {!!item.notificationCount && (
            <span className="pointer-events-none absolute right-9 top-3 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {item.notificationCount > 99 ? "99+" : item.notificationCount}
            </span>
          )}
        </div>
      );
    }

    // Regular menu item
    const link = item.url?.startsWith("http") ? "#!" : item.url;

    const itemClassNames = isSubItem
      ? `mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground !hover:bg-transparent ${
          isSelected ? "!bg-transparent !text-primary" : ""
        } !px-1.5`
      : `mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground ${
          isSelected
              ? "!bg-primary !text-primary-foreground hover:!bg-primary/90"
            : ""
        }`;

    return (
      <div onClick={onClose} key={index}>
        <AMMenuItem
          key={item.id}
          icon={iconElement}
          isSelected={isSelected}
          link={link || undefined}
          target="_self"
          badge={!!item.isPro}
          badgeColor="bg-lightsecondary"
          badgeTextColor="text-secondary"
          disabled={item.disabled}
          badgeContent={item.isPro ? "Pro" : undefined}
          component={Link}
          className={`${itemClassNames}`}
        >
          <span className="truncate flex-1">{item.title || item.name}</span>
          {!!item.notificationCount && (
            <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {item.notificationCount > 99 ? "99+" : item.notificationCount}
            </span>
          )}
        </AMMenuItem>
      </div>
    );
  });
};

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
}: {
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
}) => {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isMounted = useSyncExternalStore(
    subscribeToMount,
    getClientMountSnapshot,
    getServerMountSnapshot,
  );

  const withNotificationCount = (
    item: SidebarItemType,
  ): SidebarItemType | null => {
    if (
      (item.menuKey && allowedMenuKeys && !allowedMenuKeys.includes(item.menuKey)) ||
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

    const children = item.children
      ?.map(withNotificationCount)
      .filter((child): child is SidebarItemType => child !== null);
    const hasChildren = Boolean(children?.length);

    return {
      ...item,
      notificationCount: hasChildren
        ? 0
        : item.url === "/apps/approvals"
          ? sidebarCounts.executive
          : item.url === "/apps/logistics"
            ? sidebarCounts.logistics
            : item.url === "/apps/finance"
              ? sidebarCounts.finance
              : 0,
      ...(item.children ? { children: children ?? [] } : {}),
    };
  };
  const visibleSidebarContent = SidebarContent.map((section) => ({
    ...section,
    children: section.children
      ?.map(withNotificationCount)
      .filter((item): item is SidebarItemType => item !== null),
  })).filter((section) => section.children?.length);

  // Only allow "light" or "dark" for AMSidebar
  const sidebarMode =
    isMounted && (theme === "light" || theme === "dark") ? theme : undefined;

  return (
    <AMSidebar
      collapsible="none"
      animation={true}
      showProfile={false}
      width={"270px"}
      showTrigger={false}
      mode={sidebarMode}
      themeColor={sidebarMode === "dark" ? "#e67e22" : "#102a4d"}
      className="fixed left-0 top-0 z-10 h-screen border border-border bg-sidebar/85 backdrop-blur-xl dark:bg-sidebar/85"
    >
      {/* Logo */}
      <div className="px-6 flex items-center brand-logo overflow-hidden">
        <AMLogo component={Link} href="/" img="">
          <FullLogo />
        </AMLogo>
      </div>

      {/* Sidebar items */}

      <SimpleBar className="h-[calc(100vh-100px)]">
        <div className="px-6">
          {visibleSidebarContent.map((section, index) => (
            <div key={index}>
              {renderSidebarItems(
                [
                  ...(section.heading ? [{ heading: section.heading }] : []),
                  ...(section.children || []),
                ],
                pathname,
                sidebarCounts,
                onClose,
              )}
            </div>
          ))}
          {androidDownloadUrl && (
            <div className="mt-4 border-t border-border/70 py-4">
              <a
                href={androidDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Icon icon="tabler:download" height={18} width={18} aria-hidden="true" />
                Download APK
              </a>
            </div>
          )}
        </div>
      </SimpleBar>
    </AMSidebar>
  );
};

export default SidebarLayout;
