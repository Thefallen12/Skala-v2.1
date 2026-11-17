"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Repeat2,
  type LucideIcon,
} from "lucide-react";

import {
  habitWorkspaceUrl,
  type HabitWorkspaceTab,
} from "@/lib/habit-workspace-routes";

const sections: Array<{
  tab: HabitWorkspaceTab;
  label: string;
  icon: LucideIcon;
}> = [
  { tab: "calendar", label: "Kalender", icon: CalendarDays },
  { tab: "tasks", label: "Tugas Harian", icon: CheckSquare },
  { tab: "habits", label: "Rutinitas", icon: Repeat2 },
  { tab: "timesheet", label: "Timesheet", icon: Clock3 },
];

export default function HabitWorkspaceNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab") ?? "calendar";

  return (
    <nav
      aria-label="Modul Progres dan Produktivitas"
      className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {sections.map(({ tab, label, icon: Icon }) => {
        const href = habitWorkspaceUrl(tab, {});
        const active = pathname === "/apps/habits" && activeTabParam === tab;
        return (
          <Link
            key={tab}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`type-p2 flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
