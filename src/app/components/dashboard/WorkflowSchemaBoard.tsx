"use client";

import Link from "next/link";
import { UserRole } from "@prisma/client";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Lock,
  MapPin,
  Package,
  Plus,
  Ticket,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useDashboardMenuAccess } from "@/app/(DashboardLayout)/DashboardLayoutClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AppMenuKey } from "@/lib/config/menus";

export interface WorkflowPipelineCounts {
  totalProjects: number;
  runningProjects: number;
  drawingsCount: number;
  activeTicketsCount: number;
  stockItemsCount: number;
  pendingApprovalsCount: number;
  pendingPOsCount: number;
  issuedDocsCount: number;
}

type RouteAccessRule = {
  menuKey: AppMenuKey;
  requiresNonMover?: boolean;
  requiresLogistics?: boolean;
  requiresExecutive?: boolean;
  requiresFinance?: boolean;
  requiresProjects?: boolean;
  requiresDrafter?: boolean;
  allowedRoles?: UserRole[];
  moverOnly?: boolean;
};

type StageAction = {
  label: string;
  href: string;
  access: RouteAccessRule;
};

type WorkflowStageItem = {
  step: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  accent: string;
  badgeClass: string;
  icon: LucideIcon;
  primaryAction: StageAction;
  secondaryAction: StageAction;
};

const DOCUMENT_ROLES: UserRole[] = [
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
  UserRole.FINANCE,
  UserRole.LOGISTICS,
  UserRole.KOORDINATOR,
];

function StageActionButton({
  action,
  allowed,
  variant,
}: {
  action: StageAction;
  allowed: boolean;
  variant: "primary" | "secondary";
}) {
  if (!allowed) {
    return (
      <span
        aria-disabled="true"
        title="Tidak tersedia untuk peran Anda"
        className="type-p3 inline-flex h-8 cursor-not-allowed items-center justify-center gap-1 rounded-md border border-border bg-muted/60 px-2.5 text-center font-medium text-muted-foreground"
      >
        <Lock className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{action.label}</span>
      </span>
    );
  }

  return (
    <Button
      asChild
      size="sm"
      variant={variant === "primary" ? "default" : "outline"}
      className="w-full"
    >
      <Link href={action.href} className="truncate">
        {action.label}
      </Link>
    </Button>
  );
}

export function WorkflowStageCard({
  stage,
  hasNext,
  canAccessRule,
}: {
  stage: WorkflowStageItem;
  hasNext: boolean;
  canAccessRule: (rule: RouteAccessRule) => boolean;
}) {
  const StageIcon = stage.icon;
  const primaryAllowed = canAccessRule(stage.primaryAction.access);
  const secondaryAllowed = canAccessRule(stage.secondaryAction.access);
  const hasAnyAllowedAction = primaryAllowed || secondaryAllowed;

  return (
    <article
      className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all hover:shadow-sm ${stage.accent} ${
        hasAnyAllowedAction ? "" : "opacity-80"
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className={`font-mono ${stage.badgeClass}`}>
            TAHAP {stage.step}
          </Badge>
          <div className="flex items-center gap-1">
            <StageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            {hasNext && (
              <ArrowRight
                className="hidden size-3.5 text-muted-foreground xl:inline"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        <h3 className="type-h3 mt-2.5 text-foreground">{stage.title}</h3>
        <p className="type-p3 mt-1 leading-relaxed text-muted-foreground">
          {stage.subtitle}
        </p>
      </div>

      <div className="mt-4 space-y-3 border-t border-border/70 pt-3">
        <div className="type-p3 flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{stage.metricLabel}</span>
          <span className="font-mono font-bold tabular-nums text-foreground">
            {stage.metricValue}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StageActionButton
            action={stage.primaryAction}
            allowed={primaryAllowed}
            variant="primary"
          />
          <StageActionButton
            action={stage.secondaryAction}
            allowed={secondaryAllowed}
            variant="secondary"
          />
        </div>
      </div>
    </article>
  );
}

export function WorkflowSchemaBoard({
  counts,
  allowedMenuKeys,
}: {
  counts: WorkflowPipelineCounts;
  allowedMenuKeys?: string[];
}) {
  const menuAccess = useDashboardMenuAccess();
  const effectiveMenuKeys = allowedMenuKeys ?? menuAccess?.allowedMenuKeys;

  const canAccessRule = (rule: RouteAccessRule): boolean => {
    if (effectiveMenuKeys && !effectiveMenuKeys.includes(rule.menuKey)) {
      return false;
    }
    if (!menuAccess) {
      return !rule.moverOnly;
    }
    if (rule.moverOnly && !menuAccess.isMover) return false;
    if (rule.requiresNonMover && menuAccess.isMover) return false;
    if (rule.requiresLogistics && !menuAccess.canAccessLogistics) return false;
    if (rule.requiresExecutive && !menuAccess.canAccessExecutive) return false;
    if (rule.requiresFinance && !menuAccess.canAccessFinance) return false;
    if (rule.requiresProjects && !menuAccess.canAccessProjects) return false;
    if (rule.requiresDrafter && !menuAccess.canAccessDrafter) return false;
    if (rule.allowedRoles && !rule.allowedRoles.includes(menuAccess.userRole)) {
      return false;
    }
    return true;
  };

  const stages: WorkflowStageItem[] = [
    {
      step: "01",
      title: "1. Tiket & Progres Lapangan",
      subtitle: "Pengajuan material, data proyek berjalan, dan gambar kerja DED.",
      metricLabel: "Proyek & Tiket",
      metricValue: `${counts.runningProjects}/${counts.totalProjects} · ${counts.activeTicketsCount} Tiket`,
      accent: "border-blue-500/30 bg-blue-500/5",
      badgeClass: "border-blue-500/20 bg-blue-500/15 text-blue-700 dark:text-blue-300",
      icon: Ticket,
      primaryAction: {
        label: "Buka Tiket",
        href: "/apps/tickets",
        access: {
          menuKey: "tickets",
          requiresNonMover: true,
        },
      },
      secondaryAction: {
        label: "Master Proyek",
        href: "/apps/projects",
        access: {
          menuKey: "master_proyek",
          requiresProjects: true,
        },
      },
    },
    {
      step: "02",
      title: "2. Proses Logistik & DO",
      subtitle: "Pemenuhan material, kontrol stok gudang, dan pengiriman DO.",
      metricLabel: "Stok & PO",
      metricValue: `${counts.stockItemsCount} SKU · ${counts.pendingPOsCount} PO`,
      accent: "border-orange-500/30 bg-orange-500/5",
      badgeClass: "border-orange-500/20 bg-orange-500/15 text-orange-700 dark:text-orange-300",
      icon: Truck,
      primaryAction: {
        label: menuAccess?.isMover ? "Tugas Mover" : "Buka Logistik",
        href: "/apps/logistics",
        access: {
          menuKey: "logistik",
          requiresLogistics: true,
        },
      },
      secondaryAction: {
        label: "Stok Gudang",
        href: "/apps/logistics/stock",
        access: {
          menuKey: "logistik",
          requiresLogistics: true,
        },
      },
    },
    {
      step: "03",
      title: "3. Otorisasi & Tagihan",
      subtitle: "Verifikasi direksi atas tiket permintaan dan pesanan pembelian.",
      metricLabel: "Antrean Direksi",
      metricValue: `${counts.pendingApprovalsCount} Menunggu`,
      accent: "border-amber-500/30 bg-amber-500/5",
      badgeClass: "border-amber-500/20 bg-amber-500/15 text-amber-700 dark:text-amber-300",
      icon: ClipboardCheck,
      primaryAction: {
        label: "Approval Hub",
        href: "/apps/approvals",
        access: {
          menuKey: "approvals",
          requiresExecutive: true,
        },
      },
      secondaryAction: {
        label: "Daftar Order",
        href: "/apps/orders",
        access: {
          menuKey: "documents",
          requiresNonMover: true,
        },
      },
    },
    {
      step: "04",
      title: "4. Pembayaran Keuangan",
      subtitle: "Pencairan dana, buku kas, dan arsip dokumen resmi QR.",
      metricLabel: "Dokumen Resmi",
      metricValue: `${counts.issuedDocsCount} Dokumen`,
      accent: "border-emerald-500/30 bg-emerald-500/5",
      badgeClass: "border-emerald-500/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      icon: Wallet,
      primaryAction: {
        label: "Finance Hub",
        href: "/apps/finance",
        access: {
          menuKey: "finance_hub",
          requiresFinance: true,
        },
      },
      secondaryAction: {
        label: "Arsip Dokumen",
        href: "/apps/documents",
        access: {
          menuKey: "documents",
          requiresNonMover: true,
          allowedRoles: DOCUMENT_ROLES,
        },
      },
    },
  ];

  const quickActions: Array<{
    label: string;
    desc: string;
    href: string;
    icon: LucideIcon;
    primary: boolean;
    access: RouteAccessRule;
  }> = [
    {
      label: "Tugas Mover",
      desc: "Pengiriman material dan laporan BBM harian",
      href: "/apps/logistics",
      icon: Truck,
      primary: true,
      access: {
        menuKey: "logistik",
        requiresLogistics: true,
        moverOnly: true,
      },
    },
    {
      label: "Buat Tiket",
      desc: "Ajukan material, alat, atau dana lapangan",
      href: "/apps/tickets?create=1",
      icon: Ticket,
      primary: true,
      access: {
        menuKey: "tickets",
        requiresNonMover: true,
      },
    },
    {
      label: "Cek Stok",
      desc: "Pantau inventaris dan mutasi gudang",
      href: "/apps/logistics/stock",
      icon: Package,
      primary: false,
      access: {
        menuKey: "logistik",
        requiresLogistics: true,
      },
    },
    {
      label: "Peta Survei",
      desc: "Titik koordinat dan dokumentasi lapangan",
      href: "/apps/projects/map",
      icon: MapPin,
      primary: false,
      access: {
        menuKey: "master_proyek",
        requiresProjects: true,
      },
    },
    {
      label: "Cetak Dokumen",
      desc: "Dokumen resmi dan tanda tangan QR",
      href: "/apps/documents",
      icon: FileCheck2,
      primary: false,
      access: {
        menuKey: "documents",
        requiresNonMover: true,
        allowedRoles: DOCUMENT_ROLES,
      },
    },
  ];

  const visibleQuickActions = quickActions.filter((action) =>
    canAccessRule(action.access),
  );
  const canAccessHabits = canAccessRule({ menuKey: "habits" });

  const quickGridClass =
    visibleQuickActions.length <= 2
      ? "sm:grid-cols-2"
      : visibleQuickActions.length === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="space-y-4">
      {(visibleQuickActions.length > 0 || canAccessHabits) && (
        <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xs sm:p-5">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-2 rounded-full bg-primary" aria-hidden="true" />
                <h2 className="type-h2 text-foreground">Aksi Cepat</h2>
              </div>
              <p className="type-p3 mt-0.5 text-muted-foreground">
                Pintasan langsung ke formulir dan tindakan operasional sesuai hak akses Anda.
              </p>
            </div>
            {canAccessHabits && (
              <Button asChild size="sm" variant="outline">
                <Link href="/apps/habits">
                  <span>Jadwal Kerja</span>
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>

          {visibleQuickActions.length > 0 && (
            <div className={`grid grid-cols-1 gap-2.5 ${quickGridClass}`}>
              {visibleQuickActions.map((action) => {
                const IconComp = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className={`group flex flex-col justify-between rounded-xl border p-3.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      action.primary
                        ? "border-primary bg-primary text-primary-foreground shadow-2xs hover:bg-primary/90"
                        : "border-border bg-muted/40 text-foreground hover:border-primary/50 hover:bg-card hover:shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`flex size-8 items-center justify-center rounded-lg ${
                          action.primary
                            ? "bg-white/20 text-primary-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        <IconComp className="size-4" aria-hidden="true" />
                      </span>
                      <Plus
                        aria-hidden="true"
                        className={`size-4 transition-transform group-hover:rotate-90 ${
                          action.primary
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div className="mt-2.5">
                      <p className="type-p2 font-bold leading-snug">
                        {action.label}
                      </p>
                      <p
                        className={`type-p3 mt-0.5 line-clamp-1 ${
                          action.primary
                            ? "text-primary-foreground/85"
                            : "text-muted-foreground"
                        }`}
                      >
                        {action.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xs sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2
                className="size-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <h2 className="type-h2 text-foreground">
                Alur Operasional Terpadu
              </h2>
            </div>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Alur kerja searah dari tiket lapangan, logistik, otorisasi direksi, hingga pembayaran keuangan.
            </p>
          </div>
          <Badge variant="lightSuccess">4 Tahap Searah</Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage, idx) => (
            <WorkflowStageCard
              key={stage.step}
              stage={stage}
              hasNext={idx < stages.length - 1}
              canAccessRule={canAccessRule}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
