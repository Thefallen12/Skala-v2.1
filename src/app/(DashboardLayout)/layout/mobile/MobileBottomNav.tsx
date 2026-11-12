"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  Home,
  Ticket,
  Truck,
  Wallet,
} from "lucide-react";
import { UserRole } from "@prisma/client";

export function MobileBottomNav({ userRole }: { userRole: UserRole }) {
  const pathname = usePathname();

  const isExecutiveOrFinance =
    userRole === UserRole.DIRECTOR ||
    userRole === UserRole.DEPUTY_DIRECTOR ||
    userRole === UserRole.FINANCE;

  const isMover = userRole === UserRole.MOVER;

  const items = [
    {
      label: "Beranda",
      href: "/",
      icon: Home,
      active: pathname === "/",
    },
    {
      label: "Proyek",
      href: "/apps/projects",
      icon: Building2,
      active: pathname.startsWith("/apps/projects"),
    },
    isMover
      ? {
          label: "Pengiriman",
          href: "/apps/logistics",
          icon: Truck,
          active: pathname.startsWith("/apps/logistics"),
        }
      : {
          label: "Tiket",
          href: "/apps/tickets",
          icon: Ticket,
          active: pathname.startsWith("/apps/tickets"),
        },
    isExecutiveOrFinance
      ? {
          label: userRole === UserRole.FINANCE ? "Keuangan" : "Otorisasi",
          href:
            userRole === UserRole.FINANCE ? "/apps/finance" : "/apps/approvals",
          icon: userRole === UserRole.FINANCE ? Wallet : ClipboardCheck,
          active:
            pathname.startsWith("/apps/approvals") ||
            pathname.startsWith("/apps/finance"),
        }
      : {
          label: "Logistik",
          href: "/apps/logistics",
          icon: Truck,
          active: pathname.startsWith("/apps/logistics"),
        },
    {
      label: "Jadwal",
      href: "/apps/habits",
      icon: CalendarCheck2,
      active: pathname.startsWith("/apps/habits"),
    },
  ];

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-background/95 px-1 backdrop-blur-lg md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-semibold transition-colors ${
              item.active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
                item.active ? "bg-primary/15 text-primary" : ""
              }`}
            >
              <Icon className="size-4" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
