"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePaginationControls,
  TableRow,
} from "@/components/ui/table";
import { getJakartaDateKey } from "@/lib/habit-date";
import { photoDownloadHref, withLocalPhotoPreview } from "@/lib/photo-urls";
import {
  PROJECT_WORK_TYPE_GROUPS,
  formatWorkTypeBadge,
  resolveProjectWorkType,
} from "@/lib/project-work-types";
import { cn } from "@/lib/utils";
import {
  formatEquipmentText,
  isRunningProjectStatus,
} from "./DailyProgressModal";

export type DailyHubReportItem = {
  id: string;
  reportDate: string;
  weather: string | null;
  workersCount: number;
  progress: number | null;
  workPointId: string | null;
  dailyVolume: number | null;
  workSummary: string | null;
  notes: string | null;
  k3SafetyLog?: string | null;
  equipment?: unknown;
  equipmentList?: string[];
  photoUrls: string[];
};

export type DailyHubProgressSubmission = {
  id: string;
  periodType: string;
  periodLabel: string;
  portalCode: string;
  actualProgress: number;
  plannedProgress: number;
  deviation: number;
  submittedAt: string;
  submittedByName?: string | null;
};

export type DailyHubProjectItem = {
  id: string;
  code: string;
  title: string;
  status: string;
  progress: number;
  jenisPekerjaan: string | null;
  fieldPicId: string | null;
  fieldPicName: string | null;
  location: string | null;
  address: string;
  reports: DailyHubReportItem[];
  progressSubmissions?: DailyHubProgressSubmission[];
};

export interface DailyReportsHubPanelProps {
  projects: DailyHubProjectItem[];
  currentUserId: string;
  isFieldTeam: boolean;
  canSubmitProgress: boolean;
  onOpenDailyProgress: (
    project: DailyHubProjectItem | null,
    options?: { date?: string },
  ) => void;
  onOpenSendProgress: (project: DailyHubProjectItem | null) => void;
}

type FlattenedDailyReport = DailyHubReportItem & {
  project: DailyHubProjectItem;
  workTypeLabel: string;
  workTypeShort: string;
  workTypeGroup: "CONSULTANCY" | "PHYSICAL";
  workTypeId: string;
  hasConstraint: boolean;
  equipmentText: string;
};

const REPORTS_PER_PAGE = 10;

function formatIndoDate(dateKey: string): string {
  if (!dateKey) return "—";
  try {
    const parsed = new Date(`${dateKey}T00:00:00+07:00`);
    if (Number.isNaN(parsed.getTime())) return dateKey;
    return parsed.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return dateKey;
  }
}

export default function DailyReportsHubPanel({
  projects,
  currentUserId,
  isFieldTeam,
  canSubmitProgress,
  onOpenDailyProgress,
  onOpenSendProgress,
}: DailyReportsHubPanelProps) {
  const [todayKey] = React.useState(() => getJakartaDateKey());
  const [search, setSearch] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState("");
  const [selectedProjectId, setSelectedProjectId] = React.useState("ALL");
  const [selectedWorkType, setSelectedWorkType] = React.useState("ALL");
  const [selectedPic, setSelectedPic] = React.useState("ALL");
  const [onlyConstraints, setOnlyConstraints] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [downloadingKey, setDownloadingKey] = React.useState<string | null>(
    null,
  );
  const [lightboxMedia, setLightboxMedia] = React.useState<{
    url: string;
    title: string;
    allPhotos?: string[];
    index?: number;
  } | null>(null);

  const canReportForProject = React.useCallback(
    (project: DailyHubProjectItem) => {
      if (!canSubmitProgress || !isRunningProjectStatus(project.status)) {
        return false;
      }
      if (!isFieldTeam) return true;
      return project.fieldPicId === currentUserId;
    },
    [canSubmitProgress, currentUserId, isFieldTeam],
  );

  // Active running projects compliance for today
  const { activeProjects, reportedTodayProjects, missingTodayProjects } =
    React.useMemo(() => {
      const running = projects.filter((p) => isRunningProjectStatus(p.status));
      const reported: Array<{
        project: DailyHubProjectItem;
        report: DailyHubReportItem;
      }> = [];
      const missing: DailyHubProjectItem[] = [];

      for (const proj of running) {
        const todayReport = proj.reports.find(
          (r) => r.reportDate === todayKey,
        );
        if (todayReport) {
          reported.push({ project: proj, report: todayReport });
        } else {
          missing.push(proj);
        }
      }

      return {
        activeProjects: running,
        reportedTodayProjects: reported,
        missingTodayProjects: missing,
      };
    }, [projects, todayKey]);

  const compliancePercent =
    activeProjects.length > 0
      ? Math.round((reportedTodayProjects.length / activeProjects.length) * 100)
      : 0;

  // Flatten all daily reports across projects
  const allReports = React.useMemo<FlattenedDailyReport[]>(() => {
    const items: FlattenedDailyReport[] = [];
    for (const project of projects) {
      const wt = resolveProjectWorkType(project.jenisPekerjaan);
      const wtBadge = formatWorkTypeBadge(project.jenisPekerjaan);

      for (const report of project.reports) {
        const equipmentText =
          report.equipmentList && report.equipmentList.length > 0
            ? report.equipmentList.join(", ")
            : formatEquipmentText(report.equipment);
        const notesTrimmed = report.notes?.trim() ?? "";
        const hasConstraint =
          notesTrimmed.length > 0 ||
          /kendala|terlambat|hujan|libur|hambatan/i.test(
            `${report.workSummary ?? ""} ${notesTrimmed}`,
          );

        items.push({
          ...report,
          project,
          workTypeLabel: wtBadge.label,
          workTypeShort: wtBadge.shortLabel,
          workTypeGroup: wtBadge.group,
          workTypeId: wt.id,
          hasConstraint,
          equipmentText,
        });
      }
    }

    return items.sort(
      (a, b) =>
        b.reportDate.localeCompare(a.reportDate) ||
        a.project.title.localeCompare(b.project.title, "id-ID"),
    );
  }, [projects]);

  const picOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      if (p.fieldPicName) {
        map.set(p.fieldPicName, p.fieldPicName);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "id-ID"));
  }, [projects]);

  const filteredReports = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReports.filter((item) => {
      if (selectedDate && item.reportDate !== selectedDate) return false;
      if (
        selectedProjectId !== "ALL" &&
        item.project.id !== selectedProjectId
      ) {
        return false;
      }
      if (selectedWorkType !== "ALL") {
        if (selectedWorkType === "CONSULTANCY") {
          if (item.workTypeGroup !== "CONSULTANCY") return false;
        } else if (selectedWorkType === "PHYSICAL") {
          if (item.workTypeGroup !== "PHYSICAL") return false;
        } else if (
          item.workTypeId !== selectedWorkType &&
          item.workTypeLabel !== selectedWorkType
        ) {
          return false;
        }
      }
      if (selectedPic !== "ALL") {
        if ((item.project.fieldPicName ?? "") !== selectedPic) return false;
      }
      if (onlyConstraints && !item.hasConstraint) return false;
      if (q) {
        const haystack = [
          item.project.title,
          item.project.code,
          item.project.fieldPicName ?? "",
          item.workTypeLabel,
          item.workSummary ?? "",
          item.notes ?? "",
          item.equipmentText,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    allReports,
    selectedDate,
    selectedProjectId,
    selectedWorkType,
    selectedPic,
    onlyConstraints,
    search,
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredReports.length / REPORTS_PER_PAGE),
  );
  const currentPage = Math.min(page, pageCount);
  const visibleReports = filteredReports.slice(
    (currentPage - 1) * REPORTS_PER_PAGE,
    currentPage * REPORTS_PER_PAGE,
  );

  // Recent progress submissions across all projects
  const recentSubmissions = React.useMemo(() => {
    const list: Array<
      DailyHubProgressSubmission & { projectTitle: string; projectCode: string }
    > = [];
    for (const p of projects) {
      for (const sub of p.progressSubmissions ?? []) {
        list.push({
          ...sub,
          projectTitle: p.title,
          projectCode: p.code,
        });
      }
    }
    return list
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 6);
  }, [projects]);

  const handleDownloadDailyPdf = async (
    projectId: string,
    projectCode: string,
    date: string,
    format: "pdf" | "xlsx" = "pdf",
  ) => {
    const key = `${projectId}-${date}-${format}`;
    setDownloadingKey(key);
    try {
      const url = `/api/projects/${encodeURIComponent(projectId)}/reports?type=daily&format=${format}&date=${encodeURIComponent(date)}`;
      const res = await fetch(url);
      if (!res.ok) {
        let message = "Gagal membuat dokumen laporan harian.";
        try {
          const payload = (await res.json()) as { message?: string };
          if (payload?.message) message = payload.message;
        } catch {
          // ignore
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = objUrl;
        link.download = `Laporan-Harian-${projectCode}-${date}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    } catch {
      toast.error("Gagal mengunduh laporan harian. Periksa koneksi Anda.");
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Action & Summary Strip */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-primary/30 bg-primary/5 lg:col-span-1">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="bg-background/80">
                  Kepatuhan Lapor · {formatIndoDate(todayKey)}
                </Badge>
                <span className="type-h3 font-bold text-primary tabular-nums">
                  {compliancePercent}%
                </span>
              </div>
              <h3 className="type-h3 text-foreground">
                Pusat Laporan Harian Proyek
              </h3>
              <p className="type-p3 text-muted-foreground">
                {reportedTodayProjects.length} dari {activeProjects.length} proyek
                aktif sudah mengirim laporan hari ini.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSubmitProgress && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onOpenDailyProgress(null)}
                  className="gap-1.5"
                >
                  <Camera className="size-3.5" aria-hidden="true" />
                  <span>Input Daily Report</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenSendProgress(null)}
                className="gap-1.5"
              >
                <Send className="size-3.5" aria-hidden="true" />
                <span>Kirim Progres</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Cards: Sudah Lapor vs Belum Lapor Hari Ini */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2.5">
            <CardTitle className="type-h3 flex items-center justify-between gap-2">
              <span>Status Pelaporan Hari Ini (Proyek Berjalan)</span>
              <span className="type-p3 font-normal text-muted-foreground tabular-nums">
                {reportedTodayProjects.length} sudah · {missingTodayProjects.length}{" "}
                belum
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {/* Belum Lapor Hari Ini */}
            <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="type-p2 flex items-center gap-1.5 font-bold text-warning">
                  <Clock className="size-4 shrink-0" aria-hidden="true" />
                  Belum Lapor Hari Ini ({missingTodayProjects.length})
                </span>
              </div>
              {missingTodayProjects.length === 0 ? (
                <p className="type-p3 text-muted-foreground">
                  Semua proyek berjalan sudah melapor hari ini.
                </p>
              ) : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {missingTodayProjects.map((proj) => {
                    const wt = formatWorkTypeBadge(proj.jenisPekerjaan);
                    const allowed = canReportForProject(proj);
                    return (
                      <div
                        key={proj.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/apps/projects/${proj.id}`}
                            className="type-p3 block truncate font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {proj.title}
                          </Link>
                          <p className="type-p3 truncate text-[11px] text-muted-foreground">
                            {wt.shortLabel} · PIC:{" "}
                            {proj.fieldPicName || "Belum ditentukan"}
                          </p>
                        </div>
                        {allowed && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              onOpenDailyProgress(proj, { date: todayKey })
                            }
                            className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                          >
                            <Camera className="size-3" aria-hidden="true" />
                            <span>Input</span>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sudah Lapor Hari Ini */}
            <div className="space-y-2 rounded-xl border border-success/40 bg-success/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="type-p2 flex items-center gap-1.5 font-bold text-success">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  Sudah Lapor Hari Ini ({reportedTodayProjects.length})
                </span>
              </div>
              {reportedTodayProjects.length === 0 ? (
                <p className="type-p3 text-muted-foreground">
                  Belum ada laporan masuk untuk hari ini.
                </p>
              ) : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {reportedTodayProjects.map(({ project: proj, report }) => {
                    const dlKey = `${proj.id}-${todayKey}-pdf`;
                    return (
                      <div
                        key={proj.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/apps/projects/${proj.id}`}
                            className="type-p3 block truncate font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {proj.title}
                          </Link>
                          <p className="type-p3 truncate text-[11px] text-muted-foreground">
                            {report.weather || "Cerah"} · {report.workersCount}{" "}
                            pekerja · {proj.progress.toFixed(0)}%
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={downloadingKey === dlKey}
                            onClick={() =>
                              void handleDownloadDailyPdf(
                                proj.id,
                                proj.code,
                                todayKey,
                                "pdf",
                              )
                            }
                            className="h-7 gap-1 px-2 text-[11px]"
                            title="Unduh PDF Laporan Harian"
                          >
                            {downloadingKey === dlKey ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <FileText className="size-3" aria-hidden="true" />
                            )}
                            <span>PDF</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenSendProgress(proj)}
                            className="h-7 gap-1 px-2 text-[11px]"
                            title="Kirim Progres ke Pimpinan / Klien"
                          >
                            <Send className="size-3" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Progress Submissions Strip */}
      {recentSubmissions.length > 0 && (
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="type-p2 font-bold text-foreground">
              Riwayat Paket Kirim Progres Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {recentSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="min-w-[230px] shrink-0 rounded-lg border border-border bg-muted/20 p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-p3 truncate font-semibold text-foreground">
                      {sub.projectTitle}
                    </span>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {sub.actualProgress.toFixed(1)}%
                    </Badge>
                  </div>
                  <p className="type-p3 mt-0.5 text-[11px] text-muted-foreground">
                    {sub.periodLabel} · {sub.submittedByName || "Tim Proyek"}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {sub.portalCode}
                    </span>
                    <Link
                      href={`/portal/projects/${encodeURIComponent(sub.portalCode)}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <span>Portal</span>
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2.5 p-3.5">
          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari uraian, kendala, alat..."
              className="pl-8"
            />
          </div>

          <div className="w-40">
            <DatePicker
              clearable
              value={selectedDate}
              onValueChange={(val) => {
                setSelectedDate(val);
                setPage(1);
              }}
              maxDate={todayKey}
              placeholder="Semua tanggal"
            />
          </div>

          <Select
            value={selectedProjectId}
            onValueChange={(val) => {
              setSelectedProjectId(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filter proyek">
              <SelectValue placeholder="Semua Proyek" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Proyek</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} · {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedWorkType}
            onValueChange={(val) => {
              setSelectedWorkType(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48" aria-label="Filter jenis pekerjaan">
              <Filter className="mr-1 size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Semua Jenis Pekerjaan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Jenis Pekerjaan</SelectItem>
              <SelectItem value="CONSULTANCY">
                Semua Jasa Konsultansi
              </SelectItem>
              <SelectItem value="PHYSICAL">Semua Konstruksi Fisik</SelectItem>
              {PROJECT_WORK_TYPE_GROUPS.map((group) => (
                <SelectGroup key={group.group}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedPic}
            onValueChange={(val) => {
              setSelectedPic(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40" aria-label="Filter PIC lapangan">
              <SelectValue placeholder="Semua PIC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua PIC</SelectItem>
              {picOptions.map((pic) => (
                <SelectItem key={pic} value={pic}>
                  {pic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground">
            <Checkbox
              checked={onlyConstraints}
              onCheckedChange={(checked) => {
                setOnlyConstraints(checked === true);
                setPage(1);
              }}
            />
            <span>Ada Kendala</span>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {(selectedDate ||
              selectedProjectId !== "ALL" ||
              selectedWorkType !== "ALL" ||
              selectedPic !== "ALL" ||
              onlyConstraints ||
              search) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedDate("");
                  setSelectedProjectId("ALL");
                  setSelectedWorkType("ALL");
                  setSelectedPic("ALL");
                  setOnlyConstraints(false);
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
            <span className="type-p3 text-muted-foreground tabular-nums">
              {filteredReports.length} laporan
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Cross-Project Daily Reports History Table */}
      <Card>
        <CardContent className="p-0 sm:p-4">
          {visibleReports.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Camera}
                title="Belum ada laporan harian yang cocok"
                description="Coba ubah filter tanggal, jenis pekerjaan, atau catat laporan harian baru."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Tanggal</TableHead>
                    <TableHead className="min-w-[200px]">
                      Proyek &amp; Jenis Pekerjaan
                    </TableHead>
                    <TableHead className="w-40">PIC &amp; Sumber Daya</TableHead>
                    <TableHead className="min-w-[240px]">
                      Ringkasan, K3 &amp; Kendala
                    </TableHead>
                    <TableHead className="w-36">Foto</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReports.map((item) => {
                    const pdfKey = `${item.project.id}-${item.reportDate}-pdf`;
                    return (
                      <TableRow key={`${item.project.id}-${item.id}`}>
                        <TableCell className="align-top whitespace-nowrap">
                          <p className="type-p2 font-semibold text-foreground">
                            {formatIndoDate(item.reportDate)}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {item.weather || "Cerah"}
                          </p>
                          {item.progress !== null && (
                            <Badge
                              variant="outline"
                              className="mt-1 font-mono text-[11px] tabular-nums"
                            >
                              {item.progress.toFixed(1)}%
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="max-w-[240px] whitespace-normal align-top">
                          <Link
                            href={`/apps/projects/${item.project.id}`}
                            className="type-p2 block font-bold text-foreground hover:text-primary hover:underline"
                          >
                            {item.project.title}
                          </Link>
                          <p className="type-p3 font-mono text-muted-foreground">
                            {item.project.code}
                          </p>
                          <Badge
                            variant={
                              item.workTypeGroup === "CONSULTANCY"
                                ? "secondary"
                                : "outline"
                            }
                            className="mt-1 text-[10px]"
                          >
                            {item.workTypeShort}
                          </Badge>
                        </TableCell>

                        <TableCell className="whitespace-normal align-top">
                          <p className="type-p2 font-medium text-foreground">
                            {item.project.fieldPicName || "Belum ditunjuk"}
                          </p>
                          <p className="type-p3 text-muted-foreground tabular-nums">
                            {item.workersCount} pekerja
                          </p>
                          {item.equipmentText && (
                            <p className="type-p3 mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                              <Wrench
                                className="mt-0.5 size-3 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                              <span>{item.equipmentText}</span>
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="max-w-[300px] whitespace-normal align-top">
                          {item.workSummary ? (
                            <p className="type-p3 whitespace-pre-line text-foreground">
                              {item.workSummary}
                            </p>
                          ) : (
                            <p className="type-p3 text-muted-foreground">
                              Tanpa uraian tertulis
                            </p>
                          )}
                          {item.notes && (
                            <p className="type-p3 mt-1 flex items-start gap-1 text-warning">
                              <AlertTriangle
                                className="mt-0.5 size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{item.notes}</span>
                            </p>
                          )}
                          {item.k3SafetyLog && (
                            <p className="type-p3 mt-1 flex items-start gap-1 text-success">
                              <ShieldCheck
                                className="mt-0.5 size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{item.k3SafetyLog}</span>
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          {item.photoUrls.length === 0 ? (
                            <span className="type-p3 text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {item.photoUrls.slice(0, 3).map((url, idx) => (
                                <button
                                  key={`${url}-${idx}`}
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      url: withLocalPhotoPreview(url),
                                      title: `${item.project.title} · ${formatIndoDate(item.reportDate)} (#${idx + 1})`,
                                      allPhotos: item.photoUrls,
                                      index: idx,
                                    })
                                  }
                                  className="group relative size-11 overflow-hidden rounded-md border border-border bg-muted/30"
                                  aria-label={`Lihat foto laporan ${idx + 1}`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={withLocalPhotoPreview(url)}
                                    alt={`Foto ${idx + 1}`}
                                    className="size-full object-cover transition group-hover:scale-105"
                                  />
                                </button>
                              ))}
                              {item.photoUrls.length > 3 && (
                                <span className="type-p3 flex size-11 items-center justify-center rounded-md border border-border bg-muted/40 font-semibold text-muted-foreground">
                                  +{item.photoUrls.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={downloadingKey === pdfKey}
                              onClick={() =>
                                void handleDownloadDailyPdf(
                                  item.project.id,
                                  item.project.code,
                                  item.reportDate,
                                  "pdf",
                                )
                              }
                              className="h-8 gap-1 px-2.5 text-xs"
                            >
                              {downloadingKey === pdfKey ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <FileText className="size-3.5" aria-hidden="true" />
                              )}
                              <span>PDF Harian</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenSendProgress(item.project)}
                              className="h-8 gap-1 px-2.5 text-xs"
                            >
                              <Send className="size-3.5" aria-hidden="true" />
                              <span>Kirim Progres</span>
                            </Button>
                            {canReportForProject(item.project) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  onOpenDailyProgress(item.project, {
                                    date: item.reportDate,
                                  })
                                }
                                className="h-8 px-2 text-xs"
                              >
                                Perbarui
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <TablePaginationControls
                count={filteredReports.length}
                pageSize={REPORTS_PER_PAGE}
                page={currentPage}
                itemLabel="laporan harian"
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* In-App Photo Lightbox Modal (zero target="_blank") */}
      <GlobalModal
        isOpen={lightboxMedia !== null}
        onClose={() => setLightboxMedia(null)}
        mobileBehavior="dialog"
        icon={<ImageIcon className="size-4" aria-hidden="true" />}
        title={lightboxMedia?.title ?? "Pratinjau Foto Lapangan"}
        className="max-w-3xl"
        footer={
          lightboxMedia ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {lightboxMedia.allPhotos &&
                  lightboxMedia.allPhotos.length > 1 &&
                  lightboxMedia.allPhotos.map((u, idx) => (
                    <Button
                      key={`${u}-${idx}`}
                      type="button"
                      size="sm"
                      variant={
                        lightboxMedia.index === idx ? "default" : "outline"
                      }
                      onClick={() =>
                        setLightboxMedia({
                          ...lightboxMedia,
                          url: withLocalPhotoPreview(u),
                          index: idx,
                        })
                      }
                      className="h-7 px-2.5 text-xs"
                    >
                      #{idx + 1}
                    </Button>
                  ))}
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={photoDownloadHref(lightboxMedia.url)} download>
                    <Download className="size-3.5" aria-hidden="true" />
                    <span>Unduh Foto</span>
                  </a>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setLightboxMedia(null)}
                >
                  Tutup
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {lightboxMedia && (
          <div className="flex max-h-[70dvh] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.title}
              className="max-h-[65dvh] w-auto rounded-lg object-contain"
            />
          </div>
        )}
      </GlobalModal>
    </div>
  );
}
