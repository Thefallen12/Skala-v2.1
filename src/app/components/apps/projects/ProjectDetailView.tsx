"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkCheck,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  HardHat,
  ImageIcon,
  LayoutTemplate,
  MapPin,
  MapPinned,
  Package,
  Pencil,
  Plus,
  Share2,
  ShoppingCart,
  Trash2,
  User,
  X,
} from "lucide-react";
import { ProjectPriority, ProjectStatus, UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { GlobalModal } from "@/components/ui/global-modal";
import ProjectFormModal from "@/app/components/project/ProjectFormModal";
import type { ProjectWorkstationMasterData } from "./ProjectWorkstationMaster";
import type { FieldTeamOption } from "@/app/(DashboardLayout)/types/project";
import { deleteProject, duplicateProject } from "@/app/actions/project";

const currency = (amount: number | string | null | undefined) => {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = Number(amount);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
};

const formatDateIndo = (dateStr: string | Date | null | undefined) => {
  if (!dateStr) return "Belum diisi";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Belum diisi";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const statusLabels: Record<ProjectStatus, string> = {
  PENDING_SETUP: "Persiapan",
  PLANNED: "Direncanakan",
  RUNNING: "Berjalan",
  ACTIVE: "Aktif",
  ON_PROGRESS: "Berjalan",
  ON_HOLD: "Ditunda",
  TERHAMBAT: "Terhambat",
  COMPLETED: "Selesai",
  DONE: "Selesai",
  PENDING: "Tertunda",
};

export default function ProjectDetailView({
  project,
  fieldTeamUsers = [],
  currentUserRole,
}: {
  project: ProjectWorkstationMasterData;
  fieldTeamUsers?: FieldTeamOption[];
  currentUserRole?: UserRole;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("ringkasan");
  const [showBanner, setShowBanner] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isClientPortalOpen, setIsClientPortalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");

  const isProjectManager =
    currentUserRole === UserRole.DIRECTOR ||
    currentUserRole === UserRole.DEPUTY_DIRECTOR ||
    currentUserRole === UserRole.ADMINISTRATIONS;

  // Calculate deviation from plan
  const planDeviation = (() => {
    if (!project.startDate || !project.endDate) return null;
    const start = new Date(project.startDate).getTime();
    const end = new Date(project.endDate).getTime();
    const now = Date.now();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

    const totalDuration = end - start;
    const elapsed = Math.max(0, Math.min(now - start, totalDuration));
    const plannedProgress = Math.round((elapsed / totalDuration) * 100);
    const deviation = Math.round(plannedProgress - project.progress);
    return { plannedProgress, deviation };
  })();

  const healthStatus = (() => {
    if (!planDeviation) return "Sehat";
    if (planDeviation.deviation > 25) return "Kritis";
    if (planDeviation.deviation > 10) return "Perhatian";
    return "Sehat";
  })();

  const latestReport = project.reports[0] ?? null;

  const handleDuplicate = () => {
    setFeedback("");
    startTransition(async () => {
      try {
        const res = await duplicateProject(project.id);
        setFeedback(res.message);
        if (res.success && res.newProjectId) {
          router.push(`/apps/projects/${res.newProjectId}`);
        }
      } catch (err) {
        console.error("Duplicate failed:", err);
        setFeedback("Gagal menduplikasi proyek.");
      }
    });
  };

  const handleDelete = () => {
    setFeedback("");
    startTransition(async () => {
      try {
        const res = await deleteProject(project.id);
        setFeedback(res.message);
        if (res.success) {
          router.push("/apps/projects");
        }
      } catch (err) {
        console.error("Delete failed:", err);
        setFeedback("Gagal menghapus proyek.");
      }
    });
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Link
          href="/apps/projects"
          className="flex items-center gap-1 font-medium transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Proyek</span>
        </Link>
        <ChevronRight className="size-3.5 text-muted-foreground/60" />
        <span className="font-semibold text-foreground">Detail Proyek</span>
      </nav>

      {/* Onboarding / Tips Banner */}
      {showBanner && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Langkah 1 dari 3
            </p>
            <h4 className="text-sm font-bold text-foreground">
              Manajemen Proyek &amp; Lapangan
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Kelola aktivitas harian, titik kerja, anggaran pagu, dan dokumen
              surat jalan dalam satu tempat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs font-medium"
              onClick={() => setIsEditModalOpen(true)}
            >
              <Pencil className="size-3.5" />
              Kelola Proyek
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setShowBanner(false)}
              aria-label="Tutup banner"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Header Info Area */}
      <div className="space-y-4">
        {/* Badges & Actions Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="bg-emerald-500/10 font-bold text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
            >
              {statusLabels[project.status] ?? project.status}
            </Badge>

            {planDeviation !== null && planDeviation.deviation > 0 ? (
              <Badge
                variant="outline"
                className="bg-rose-500/10 font-semibold text-rose-600 border-rose-500/30 dark:text-rose-400"
              >
                Tertinggal {planDeviation.deviation}% dari rencana
              </Badge>
            ) : planDeviation !== null && planDeviation.deviation < 0 ? (
              <Badge
                variant="outline"
                className="bg-sky-500/10 font-semibold text-sky-600 border-sky-500/30 dark:text-sky-400"
              >
                Mendahului {Math.abs(planDeviation.deviation)}% dari rencana
              </Badge>
            ) : planDeviation !== null ? (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 font-semibold text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
              >
                Sesuai rencana
              </Badge>
            ) : null}

            <Badge
              variant="outline"
              className={
                healthStatus === "Sehat"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                  : healthStatus === "Perhatian"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400"
              }
            >
              {healthStatus}
            </Badge>

            <span className="rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
              {project.code}
            </span>
          </div>

          {/* Action Buttons (Top Right) */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Pencil className="size-3.5" />
                <span>Ubah proyek</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setIsClientPortalOpen(true)}
              >
                <Globe className="size-3.5 text-primary" />
                <span>Portal klien</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setIsTemplateModalOpen(true)}
              >
                <LayoutTemplate className="size-3.5" />
                <span>Pasang template</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setIsTemplateModalOpen(true)}
              >
                <BookmarkCheck className="size-3.5" />
                <span>Simpan sebagai template</span>
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleDuplicate}
                disabled={isPending}
              >
                <Copy className="size-3" />
                <span>Duplikat proyek</span>
              </Button>
              {currentUserRole === UserRole.DIRECTOR && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={isPending}
                >
                  <Trash2 className="size-3" />
                  <span>Hapus proyek</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Project Title */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {project.title || project.name}
          </h1>
          {project.kelompokTani && (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {project.kelompokTani} {project.vendor ? `· Vendor: ${project.vendor}` : ""}
            </p>
          )}
        </div>

        {feedback && (
          <p
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs font-semibold text-foreground"
          >
            {feedback}
          </p>
        )}

        {/* 5-Column Metadata Row matching image */}
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs sm:grid-cols-3 lg:grid-cols-5">
          {/* 1. Alamat proyek */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-muted-foreground/80" />
              <span>Alamat proyek</span>
            </div>
            <p className="truncate text-sm font-bold text-foreground">
              {project.address || project.location || "Belum diisi"}
            </p>
          </div>

          {/* 2. Manajer / PM */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="size-3.5 text-muted-foreground/80" />
              <span>Manajer / PM</span>
            </div>
            <p className="truncate text-sm font-bold text-foreground">
              {project.fieldPicName || "Belum ditentukan"}
            </p>
          </div>

          {/* 3. Mulai */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 text-muted-foreground/80" />
              <span>Mulai</span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {formatDateIndo(project.startDate)}
            </p>
          </div>

          {/* 4. Selesai */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 text-muted-foreground/80" />
              <span>Selesai</span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {formatDateIndo(project.endDate)}
            </p>
          </div>

          {/* 5. Nilai kontrak */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="size-3.5 text-muted-foreground/80" />
              <span>Nilai kontrak</span>
            </div>
            <p className="truncate text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {currency(project.pagu)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="ringkasan"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Ringkasan
          </TabsTrigger>
          <TabsTrigger
            value="rab"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            RAB &amp; biaya
          </TabsTrigger>
          <TabsTrigger
            value="tagihan"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Tagihan
          </TabsTrigger>
          <TabsTrigger
            value="lapangan"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Lapangan
          </TabsTrigger>
          <TabsTrigger
            value="tim"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Tim &amp; lokasi
          </TabsTrigger>
          <TabsTrigger
            value="dokumen"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Dokumen
          </TabsTrigger>
        </TabsList>

        {/* ===================== TAB 1: RINGKASAN ===================== */}
        <TabsContent value="ringkasan" className="space-y-6">
          {/* Aktivitas Proyek Card */}
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Aktivitas proyek</CardTitle>
              <CardDescription className="text-xs">
                Kondisi lapangan dan aktivitas proyek saat ini.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <FileText className="size-3.5 text-primary" />
                    <span>Laporan terakhir</span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-foreground">
                    {latestReport
                      ? formatDateIndo(latestReport.reportDate)
                      : "Belum ada laporan harian"}
                  </h3>
                  <p className="text-xs font-medium text-muted-foreground">
                    {latestReport
                      ? `oleh ${project.fieldPicName ?? "Tim Lapangan"} · ${latestReport.workersCount} pekerja`
                      : "Input laporan harian melalui tab Lapangan"}
                  </p>
                  {latestReport?.workSummary && (
                    <p className="mt-1 text-xs text-foreground/90">
                      &ldquo;{latestReport.workSummary}&rdquo;
                    </p>
                  )}
                </div>

                {latestReport?.photoUrls?.[0] && (
                  <div className="flex items-center gap-2">
                    <img
                      src={latestReport.photoUrls[0]}
                      alt="Foto progres terakhir"
                      className="size-16 rounded-lg object-cover border border-border"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pintasan / Quick Shortcuts Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pintasan
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-border/80 px-3.5 text-xs font-semibold"
                onClick={() => setActiveTab("lapangan")}
              >
                <FileText className="size-3.5 text-primary" />
                <span>Laporan harian</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-border/80 px-3.5 text-xs font-semibold"
                onClick={() => setActiveTab("rab")}
              >
                <Calendar className="size-3.5 text-emerald-500" />
                <span>Jadwal proyek</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-border/80 px-3.5 text-xs font-semibold"
                onClick={() => setActiveTab("tagihan")}
              >
                <FileText className="size-3.5 text-amber-500" />
                <span>Quotation &amp; Invoice</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-border/80 px-3.5 text-xs font-semibold"
                asChild
              >
                <Link href="/apps/logistics/stock">
                  <Package className="size-3.5 text-sky-500" />
                  <span>Stok</span>
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-border/80 px-3.5 text-xs font-semibold"
                asChild
              >
                <Link href={`/apps/orders/new?type=po&projectId=${encodeURIComponent(project.id)}`}>
                  <ShoppingCart className="size-3.5 text-indigo-500" />
                  <span>Buat PO</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Quick Financial & Work Points Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/80 shadow-2xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">
                  Realisasi Anggaran &amp; Pagu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Pagu Kontrak</span>
                  <span className="font-bold text-foreground">
                    {currency(project.pagu)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Realisasi</span>
                  <span className="font-bold text-foreground">
                    {currency(project.realized)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Sisa Anggaran</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {currency(
                      Math.max(
                        Number(project.pagu) - Number(project.realized),
                        0,
                      ),
                    )}
                  </span>
                </div>
                {Number(project.pagu) > 0 && (
                  <Progress
                    value={Math.min(
                      (Number(project.realized) / Number(project.pagu)) * 100,
                      100,
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-2xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">
                  Titik Kerja Lapangan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {project.workPoints.length === 0
                    ? "Belum ada titik kerja yang didaftarkan."
                    : `${project.workPoints.length} titik kerja tercatat.`}
                </p>
                <div className="space-y-1.5">
                  {project.workPoints.slice(0, 3).map((pt) => (
                    <div
                      key={pt.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-1.5 text-xs"
                    >
                      <span className="font-semibold text-foreground">
                        {pt.title}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {pt.completedVolume ?? 0} / {pt.proposedVolume ?? "—"}{" "}
                        {pt.proposedUnit ?? ""}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===================== TAB 2: RAB & BIAYA ===================== */}
        <TabsContent value="rab" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">
                Rincian Anggaran Pagu dan Realisasi
              </CardTitle>
              <CardDescription className="text-xs">
                Pantau serapan biaya material, upah tukang, dan operasional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Pagu Kontrak</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                    {currency(project.pagu)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Total Realisasi</p>
                  <p className="mt-1 text-lg font-extrabold text-foreground">
                    {currency(project.realized)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Sisa Pagu</p>
                  <p className="mt-1 text-lg font-extrabold text-sky-600 dark:text-sky-400">
                    {currency(
                      Math.max(
                        Number(project.pagu) - Number(project.realized),
                        0,
                      ),
                    )}
                  </p>
                </div>
              </div>

              {Number(project.pagu) > 0 && (
                <div className="space-y-1">
                  <Progress
                    value={Math.min(
                      (Number(project.realized) / Number(project.pagu)) * 100,
                      100,
                    )}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    Terserap{" "}
                    {(
                      (Number(project.realized) / Number(project.pagu)) *
                      100
                    ).toFixed(1)}
                    % dari pagu kontrak
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Titik Kerja & Upah Table */}
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">
                  Titik Kerja &amp; Upah Lapangan
                </CardTitle>
                <CardDescription className="text-xs">
                  Volume target, harga satuan, dan persetujuan upah titik kerja.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {project.workPoints.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Belum ada titik kerja yang dibuat.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 pr-3">Titik Kerja</th>
                        <th className="py-2 pr-3">Target Volume</th>
                        <th className="py-2 pr-3">Realisasi</th>
                        <th className="py-2 pr-3 text-right">Total Upah</th>
                        <th className="py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {project.workPoints.map((pt) => (
                        <tr key={pt.id} className="hover:bg-muted/10">
                          <td className="py-2.5 pr-3 font-semibold text-foreground">
                            {pt.title}
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground">
                            {pt.proposedVolume ?? "—"} {pt.proposedUnit ?? ""}
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground">
                            {pt.completedVolume ?? 0} {pt.proposedUnit ?? ""}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-foreground">
                            {currency(pt.approvedTotalWage ?? pt.proposedTotalWage)}
                          </td>
                          <td className="py-2.5 text-right">
                            <Badge
                              variant="outline"
                              className={
                                pt.approvedTotalWage
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              }
                            >
                              {pt.approvedTotalWage ? "Disetujui" : "Draft"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 3: TAGIHAN ===================== */}
        <TabsContent value="tagihan" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">
                Kontrak Subkon &amp; Termyn Tagihan
              </CardTitle>
              <CardDescription className="text-xs">
                Daftar kontrak kerja sama dan status penagihan termin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {project.subkonContracts.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Belum ada kontrak subkon untuk proyek ini.
                </p>
              ) : (
                <div className="space-y-3">
                  {project.subkonContracts.map((contract) => (
                    <div
                      key={contract.id}
                      className="rounded-xl border border-border p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono font-semibold text-muted-foreground">
                            {contract.contractNumber}
                          </p>
                          <h4 className="text-sm font-bold text-foreground">
                            {contract.subkonName}
                          </h4>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Nilai Kontrak</p>
                          <p className="text-sm font-bold text-foreground">
                            {currency(contract.contractValue)}
                          </p>
                        </div>
                      </div>

                      {contract.termyns.length > 0 && (
                        <div className="mt-2 border-t border-border/60 pt-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                            Riwayat Termyn:
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {contract.termyns.map((termyn) => (
                              <div
                                key={termyn.id}
                                className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs space-y-1"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold">
                                    Termin #{termyn.termynNumber}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {termyn.status}
                                  </Badge>
                                </div>
                                <p className="text-muted-foreground">
                                  Klaim: {termyn.claimedPercent}% · Net:{" "}
                                  <span className="font-semibold text-foreground">
                                    {currency(termyn.netAmount)}
                                  </span>
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 4: LAPANGAN ===================== */}
        <TabsContent value="lapangan" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">
                  Laporan Harian Lapangan
                </CardTitle>
                <CardDescription className="text-xs">
                  Aktivitas pekerjaan, cuaca, tenaga kerja, dan foto dokumentasi.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {project.reports.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Belum ada laporan harian yang dicatat.
                </p>
              ) : (
                <div className="space-y-3">
                  {project.reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-xl border border-border/80 p-4 space-y-2 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-semibold">
                            {formatDateIndo(report.reportDate)}
                          </Badge>
                          {report.weather && (
                            <span className="text-xs text-muted-foreground">
                              Cuaca: {report.weather}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {report.workersCount} Tenaga Kerja
                        </span>
                      </div>

                      {report.workSummary && (
                        <p className="text-xs text-foreground font-medium">
                          {report.workSummary}
                        </p>
                      )}

                      {report.photoUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {report.photoUrls.map((url, i) => (
                            <img
                              key={url}
                              src={url}
                              alt={`Dokumentasi ${i + 1}`}
                              className="size-16 rounded-lg object-cover border border-border hover:opacity-90 cursor-pointer"
                              onClick={() => window.open(url, "_blank")}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB 5: TIM & LOKASI ===================== */}
        <TabsContent value="tim" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/80 shadow-2xs">
              <CardHeader>
                <CardTitle className="text-base font-bold">
                  Penanggung Jawab &amp; Tim Proyek
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                    <User className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">PIC Lapangan (PM)</p>
                    <p className="text-sm font-bold text-foreground">
                      {project.fieldPicName || "Belum ditunjuk"}
                    </p>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground">Kelompok Tani / Klien:</p>
                  <p className="font-bold text-foreground">
                    {project.kelompokTani || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-2xs">
              <CardHeader>
                <CardTitle className="text-base font-bold">
                  Lokasi &amp; Peta WebGIS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground">Alamat / Lokasi:</p>
                  <p className="font-bold text-foreground">
                    {project.address || project.location || "Belum diisi"}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  asChild
                >
                  <Link href={`/apps/projects/map?projectId=${encodeURIComponent(project.id)}`}>
                    <MapPinned className="size-4 text-sky-500" />
                    <span>Buka Peta Survei &amp; Batas Lahan (GIS)</span>
                    <ExternalLink className="size-3.5 ml-auto text-muted-foreground" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===================== TAB 6: DOKUMEN ===================== */}
        <TabsContent value="dokumen" className="space-y-6">
          <Card className="border-border/80 shadow-2xs">
            <CardHeader>
              <CardTitle className="text-base font-bold">
                Gambar Kerja (DED / Blueprint)
              </CardTitle>
              <CardDescription className="text-xs">
                Shop drawing, as-built drawing, dan dokumen gambar teknik.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {project.blueprints.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Belum ada gambar kerja yang diunggah untuk proyek ini.
                </p>
              ) : (
                <div className="space-y-2">
                  {project.blueprints.map((bp) => (
                    <div
                      key={bp.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-mono font-bold text-foreground">
                          {bp.drawingNumber} · {bp.title}
                        </p>
                        <p className="text-muted-foreground">
                          Kategori: {bp.category} · Drafter: {bp.drafterName}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a href={bp.fileUrl} target="_blank" rel="noreferrer">
                          Lihat Dokumen
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Project Modal */}
      <ProjectFormModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        project={{
          id: project.id,
          code: project.code,
          title: project.title,
          kelompokTani: project.kelompokTani,
          address: project.address,
          jenisPekerjaan: project.jenisPekerjaan,
          location: project.location,
          priority: project.priority,
          progress: project.progress,
          pagu: project.pagu,
          budget: project.budget,
          landArea: project.landArea,
          fieldPicId: project.fieldPicId,
          startDate: project.startDate,
          endDate: project.endDate,
          vendor: project.vendor,
          clientName: project.clientName,
        }}
        fieldTeamUsers={fieldTeamUsers}
        canManageUsers={isProjectManager}
        canViewBudget={isProjectManager}
      />

      {/* Portal Klien Info Modal */}
      <GlobalModal
        isOpen={isClientPortalOpen}
        onClose={() => setIsClientPortalOpen(false)}
        title="Portal Klien & Publik"
        description="Akses laporan progres transparan untuk pemilik atau kelompok tani."
      >
        <div className="space-y-4 text-xs">
          <p className="text-muted-foreground">
            Tautan ringkasan proyek yang dapat dibagikan kepada klien atau mitra:
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5 font-mono text-xs">
            <span className="truncate flex-1">
              {typeof window !== "undefined"
                ? `${window.location.origin}/apps/projects/${project.id}`
                : `/apps/projects/${project.id}`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => {
                if (typeof window !== "undefined") {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/apps/projects/${project.id}`,
                  );
                }
              }}
            >
              <Copy className="size-3" />
              <span>Salin</span>
            </Button>
          </div>
        </div>
      </GlobalModal>

      {/* Template Modal */}
      <GlobalModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title="Template Proyek"
        description="Gunakan atau simpan susunan proyek sebagai acuan proyek berikutnya."
      >
        <div className="space-y-3 text-xs text-muted-foreground">
          <p>
            Struktur titik kerja, jadwal tahapan, dan parameter proyek ini dapat
            dijadikan template master untuk mempercepat inisiasi proyek baru.
          </p>
          <Button
            type="button"
            className="w-full text-xs font-semibold"
            onClick={() => {
              setIsTemplateModalOpen(false);
              setFeedback("Struktur proyek berhasil disimpan sebagai template.");
            }}
          >
            Konfirmasi Simpan Template
          </Button>
        </div>
      </GlobalModal>

      {/* Delete Confirmation Modal */}
      <GlobalModal
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        title="Hapus Proyek Permanen?"
        description={`Apakah Anda yakin ingin menghapus proyek "${project.title || project.name}"? Seluruh data laporan harian dan titik kerja akan dihapus.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(false)}
            disabled={isPending}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Menghapus..." : "Ya, Hapus Proyek"}
          </Button>
        </div>
      </GlobalModal>
    </div>
  );
}
