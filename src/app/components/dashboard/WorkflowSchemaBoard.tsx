import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  MapPin,
  Package,
  Plus,
  Ruler,
  Ticket,
  Truck,
  Wallet,
} from "lucide-react";

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

export function WorkflowSchemaBoard({
  counts,
}: {
  counts: WorkflowPipelineCounts;
}) {
  const stages = [
    {
      step: "01",
      title: "Perencanaan & Master Proyek",
      subtitle: "Data Proyek, Rab/Pagu, Lokasi GIS & Kurva S",
      metricLabel: "Proyek Berjalan",
      metricValue: `${counts.runningProjects} / ${counts.totalProjects}`,
      statusText: "Tahap Inisiasi & Monitoring",
      accent: "border-blue-500/30 bg-blue-500/5",
      badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      icon: Building2,
      primaryAction: {
        label: "Buka Master Proyek",
        href: "/apps/projects",
      },
      secondaryAction: {
        label: "Peta GIS Survei",
        href: "/apps/projects/map",
      },
    },
    {
      step: "02",
      title: "Enjiniring & Gambar Kerja (DED)",
      subtitle: "Shop Drawing, As-Built & Dokumen Teknis",
      metricLabel: "Dokumen Gambar",
      metricValue: `${counts.drawingsCount} Berkas`,
      statusText: "Tahap Desain & Revisi Teknis",
      accent: "border-indigo-500/30 bg-indigo-500/5",
      badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
      icon: Ruler,
      primaryAction: {
        label: "Workspace Drafter",
        href: "/apps/drafter",
      },
      secondaryAction: {
        label: "Gambar Proyek",
        href: "/apps/projects",
      },
    },
    {
      step: "03",
      title: "Tiket, Pengadaan & Logistik",
      subtitle: "Permintaan Material, Stok Gudang, PO & DO",
      metricLabel: "Tiket & Stok",
      metricValue: `${counts.activeTicketsCount} Tiket · ${counts.stockItemsCount} SKU`,
      statusText: "Tahap Permintaan & Distribusi",
      accent: "border-orange-500/30 bg-orange-500/5",
      badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
      icon: Truck,
      primaryAction: {
        label: "Tiket & Permintaan",
        href: "/apps/tickets",
      },
      secondaryAction: {
        label: "Gudang & Stok",
        href: "/apps/logistics/stock",
      },
    },
    {
      step: "04",
      title: "Otorisasi & Persetujuan Direksi",
      subtitle: "Verifikasi Tiket, Purchase Order, SPK & BAST",
      metricLabel: "Antrean Otorisasi",
      metricValue: `${counts.pendingApprovalsCount} Menunggu`,
      statusText:
        counts.pendingApprovalsCount > 0
          ? "Membutuhkan Persetujuan"
          : "Semua Terverifikasi",
      accent: "border-amber-500/30 bg-amber-500/5",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      icon: ClipboardCheck,
      primaryAction: {
        label: "Buka Approval Hub",
        href: "/apps/approvals",
      },
      secondaryAction: {
        label: "Kelola PO & DO",
        href: "/apps/orders",
      },
    },
    {
      step: "05",
      title: "Keuangan & Dokumen Resmi QR",
      subtitle: "Pencairan Dana, Buku Kas, Kwitansi & Arsip PO/DO",
      metricLabel: "Dokumen & PO",
      metricValue: `${counts.issuedDocsCount} Dokumen`,
      statusText: "Tahap Pencairan & Arsip",
      accent: "border-emerald-500/30 bg-emerald-500/5",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      icon: Wallet,
      primaryAction: {
        label: "Buka Finance Hub",
        href: "/apps/finance",
      },
      secondaryAction: {
        label: "Dokumen Terbit",
        href: "/apps/documents/issued",
      },
    },
  ];

  const quickActions = [
    {
      label: "Buat Tiket Permintaan",
      desc: "Ajukan material, alat, atau dana lapangan",
      href: "/apps/tickets?create=1",
      icon: Ticket,
      primary: true,
    },
    {
      label: "Buat Purchase Order (PO)",
      desc: "Terbitkan pesanan pembelian ke vendor",
      href: "/apps/orders/new?type=po",
      icon: FilePlus2,
      primary: false,
    },
    {
      label: "Buat Surat Jalan (DO)",
      desc: "Kirim material gudang ke lokasi proyek",
      href: "/apps/orders/new?type=do",
      icon: Truck,
      primary: false,
    },
    {
      label: "Cek & Beli Stok Gudang",
      desc: "Kelola inventaris & pembelian langsung",
      href: "/apps/logistics/stock",
      icon: Package,
      primary: false,
    },
    {
      label: "Peta GIS & Survei",
      desc: "Input titik koordinat & foto lapangan",
      href: "/apps/projects/map",
      icon: MapPin,
      primary: false,
    },
    {
      label: "Cetak & Tanda Tangan QR",
      desc: "Generator dokumen resmi perusahaan",
      href: "/apps/documents",
      icon: FileCheck2,
      primary: false,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Quick Action Command Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-[#F26522]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Pusat Aksi Cepat (Quick Actions)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Pintasan langsung ke seluruh formulir dan tindakan operasional utama
            </p>
          </div>
          <Link
            href="/apps/habits"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <span>Jadwal &amp; Timesheet Hari Ini</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {quickActions.map((action) => {
            const IconComp = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`group flex flex-col justify-between rounded-xl border p-3 transition-all ${
                  action.primary
                    ? "border-[#F26522] bg-[#F26522] text-white shadow-xs hover:bg-[#e05616]"
                    : "border-slate-200/90 bg-slate-50/60 text-slate-900 hover:border-primary/50 hover:bg-white hover:shadow-xs dark:border-slate-800 dark:bg-slate-800/50 dark:text-white dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`flex size-8 items-center justify-center rounded-lg ${
                      action.primary
                        ? "bg-white/20 text-white"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <IconComp className="size-4" />
                  </span>
                  <Plus
                    className={`size-4 transition-transform group-hover:rotate-90 ${
                      action.primary ? "text-white/80" : "text-slate-400"
                    }`}
                  />
                </div>
                <div className="mt-2.5">
                  <p className="text-xs font-bold leading-snug">
                    {action.label}
                  </p>
                  <p
                    className={`mt-0.5 line-clamp-1 text-[11px] ${
                      action.primary
                        ? "text-white/85"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {action.desc}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 5-Stage Integrated Workflow Schema */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Alur Skema Operasional Terpadu (End-to-End Schema)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Urutan kerja sistematis dari perencanaan proyek, gambar kerja, pengadaan logistik, persetujuan direksi, hingga pencairan keuangan
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            5 Tahap Terintegrasi
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {stages.map((stage, idx) => {
            const StageIcon = stage.icon;
            return (
              <div
                key={stage.step}
                className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all hover:shadow-sm ${stage.accent}`}
              >
                <div>
                  {/* Step Header */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${stage.badgeClass}`}
                    >
                      TAHAP {stage.step}
                    </span>
                    <div className="flex items-center gap-1">
                      <StageIcon className="size-4 text-slate-600 dark:text-slate-300" />
                      {idx < stages.length - 1 && (
                        <ArrowRight className="hidden size-3.5 text-slate-400 xl:inline" />
                      )}
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="mt-2.5 text-sm font-bold leading-snug text-slate-900 dark:text-white">
                    {stage.title}
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    {stage.subtitle}
                  </p>
                </div>

                {/* Live Metric Box & Action Buttons */}
                <div className="mt-3.5 space-y-2.5 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {stage.metricLabel}
                    </span>
                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {stage.metricValue}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <Link
                      href={stage.primaryAction.href}
                      className="flex items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] font-semibold text-white transition hover:bg-slate-800 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                    >
                      {stage.primaryAction.label}
                    </Link>
                    <Link
                      href={stage.secondaryAction.href}
                      className="flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-center text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {stage.secondaryAction.label}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
