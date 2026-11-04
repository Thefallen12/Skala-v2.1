"use client";

import type {
  ProjectDashboardSummary,
  ProjectDashboardRow,
  ProjectProgressPoint,
  FieldTeamOption,
} from "@/app/(DashboardLayout)/types/project";
import type { UserRole } from "@prisma/client";
import { AlertTriangle, BriefcaseBusiness, CircleDollarSign, Construction } from "lucide-react";
import CardBox from "@/app/components/shared/CardBox";
import ProjectMainTable from "@/app/components/project/ProjectMainTable";
import ProjectProgressChart from "@/app/components/project/ProjectProgressChart";
import VendorProjectTable from "@/app/components/project/VendorProjectTable";

const formatCurrency = (amount: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount));

export default function ProjectDashboard({
  projects,
  fieldTeamUsers,
  progressTimeline,
  summary,
  canManageProjects,
  canUpdateProjectProgress,
  currentUserId,
  currentUserRole,
}: {
  projects: ProjectDashboardRow[];
  fieldTeamUsers: FieldTeamOption[];
  progressTimeline: ProjectProgressPoint[];
  summary: ProjectDashboardSummary;
  canManageProjects: boolean;
  canUpdateProjectProgress: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const summaryCards = [
    {
      title: "Total Proyek",
      value: summary.totalProjects.toLocaleString("id-ID"),
      icon: BriefcaseBusiness,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      title: "Sedang Berjalan",
      value: summary.activeProjects.toLocaleString("id-ID"),
      icon: Construction,
      iconClass: "bg-info/10 text-info",
    },
    {
      title: "Terhambat",
      value: summary.delayedProjects.toLocaleString("id-ID"),
      icon: AlertTriangle,
      iconClass: "bg-warning/10 text-warning",
    },
    {
      title: "Total Pagu",
      value: formatCurrency(summary.totalBudget),
      icon: CircleDollarSign,
      iconClass: "bg-success/10 text-success",
    },
  ];

  return (
    <div className="grid grid-cols-12 gap-6">
      {summaryCards.map(({ title, value, icon: Icon, iconClass }) => (
        <div className="col-span-12 sm:col-span-6 xl:col-span-3" key={title}>
          <CardBox className="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center">
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 max-w-full">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="mt-1 break-words text-xl font-semibold leading-tight">
                {value}
              </p>
            </div>
          </CardBox>
        </div>
      ))}
      <div className="col-span-12">
        <ProjectProgressChart data={progressTimeline} />
      </div>
      <div className="col-span-12">
        <ProjectMainTable
          projects={projects}
          fieldTeamUsers={fieldTeamUsers}
          canManageProjects={canManageProjects}
          canUpdateProjectProgress={canUpdateProjectProgress}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      </div>
      <div className="col-span-12">
        <VendorProjectTable projects={projects} />
      </div>
    </div>
  );
}
