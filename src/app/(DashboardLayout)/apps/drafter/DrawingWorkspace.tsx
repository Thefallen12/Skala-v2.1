"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileImage,
  FilePlus2,
  FileText,
  FolderOpen,
  History,
  LoaderCircle,
  MapPinned,
  MoreHorizontal,
  PenTool,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import {
  createDrawingDocument,
  reviewDrawingDocument,
  uploadDrawingRevision,
  type DrawingActionResult,
} from "@/app/actions/drawings";
import {
  DRAWING_CATEGORIES,
  DRAWING_FILE_EXTENSIONS,
} from "@/lib/drawing-document-config";
import type {
  DrawingProjectOption,
  DrawingProjectSurveySummary,
  DrawingWorkspaceItem,
} from "@/lib/drawing-types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const categoryLabels = [...DRAWING_CATEGORIES];

const statusDetails: Record<
  string,
  { label: string; className: string; icon: typeof Clock3 }
> = {
  DRAFT: {
    label: "Draft",
    className: "border-border bg-muted text-muted-foreground",
    icon: FileText,
  },
  REVIEW: {
    label: "Dalam Review",
    className: "border-warning/30 bg-lightwarning text-warning",
    icon: Clock3,
  },
  REVISION_NEEDED: {
    label: "Butuh Revisi",
    className: "border-error/30 bg-lighterror text-error",
    icon: RotateCcw,
  },
  APPROVED: {
    label: "Disetujui / Approved",
    className: "border-success/30 bg-lightsuccess text-success",
    icon: CheckCircle2,
  },
};

const logActionLabels: Record<string, string> = {
  UPLOADED: "Dokumen diunggah",
  REVIEWED: "Review selesai",
  REVISED: "Revisi diunggah",
  APPROVED: "Dokumen disetujui",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function getFileExtension(value: File | string | null) {
  const fileName = value instanceof File ? value.name : value;
  return fileName?.split(/[?#]/)[0].split(".").at(-1)?.toUpperCase() ?? "FILE";
}

function StatusBadge({ status }: { status: string }) {
  const detail = statusDetails[status] ?? statusDetails.DRAFT;
  const StatusIcon = detail.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] ${detail.className}`}
    >
      <StatusIcon className="size-3" aria-hidden="true" />
      {detail.label}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "primary" | "error" | "warning" | "success";
  icon: typeof FileImage;
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    error: "bg-lighterror text-error",
    warning: "bg-lightwarning text-warning",
    success: "bg-lightsuccess text-success",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all ${
        active
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-muted/30"
      }`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-xl font-bold leading-none text-card-foreground">
          {value}{" "}
          <span className="text-xs font-medium text-muted-foreground">
            {detail}
          </span>
        </p>
      </div>
    </button>
  );
}

export default function DrawingWorkspace({
  initialDrawings,
  projects,
  projectSurveys = [],
  initialProjectId = "ALL",
  canUpload,
  canReview,
}: {
  initialDrawings: DrawingWorkspaceItem[];
  projects: DrawingProjectOption[];
  projectSurveys?: DrawingProjectSurveySummary[];
  initialProjectId?: string;
  canUpload: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [drawings] = useState(initialDrawings);
  const [selectedId, setSelectedId] = useState(() =>
    initialProjectId !== "ALL"
      ? (initialDrawings.find((d) => d.projectId === initialProjectId)?.id ?? "")
      : (initialDrawings[0]?.id ?? ""),
  );
  const [projectFilter, setProjectFilter] = useState(initialProjectId);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "REVISION_NEEDED" | "REVIEW" | "APPROVED"
  >("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] =
    useState<DrawingActionResult | null>(null);
  const [uploadError, setUploadError] = useState("");

  const selectedDrawing = drawings.find((drawing) => drawing.id === selectedId);
  const activeSurvey = useMemo(() => {
    const targetProjectId =
      selectedDrawing?.projectId ??
      (projectFilter !== "ALL" ? projectFilter : null);
    if (!targetProjectId) return null;
    return (
      projectSurveys.find((survey) => survey.projectId === targetProjectId) ??
      null
    );
  }, [projectFilter, projectSurveys, selectedDrawing]);

  const filteredDrawings = useMemo(
    () =>
      drawings.filter(
        (drawing) =>
          (projectFilter === "ALL" || drawing.projectId === projectFilter) &&
          (categoryFilter === "ALL" || drawing.category === categoryFilter) &&
          (statusFilter === "ALL" || drawing.status === statusFilter),
      ),
    [categoryFilter, drawings, projectFilter, statusFilter],
  );
  const stats = {
    total: drawings.length,
    revision: drawings.filter((drawing) => drawing.status === "REVISION_NEEDED")
      .length,
    review: drawings.filter((drawing) => drawing.status === "REVIEW").length,
    approved: drawings.filter((drawing) => drawing.status === "APPROVED").length,
  };

  const openDrawingDetail = (drawingId: string) => {
    setSelectedId(drawingId);
    setUploadError("");
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setMobilePreviewOpen(true);
    }
  };

  const openCreateDialog = () => {
    setUploadError("");
    setNewFile(null);
    setCreateOpen(true);
  };

  const refreshAfterAction = (result: DrawingActionResult) => {
    setActionMessage(result);
    if (result.success) {
      setCreateOpen(false);
      setMobilePreviewOpen(false);
      setNewFile(null);
      setRevisionFile(null);
      setRevisionNotes("");
      setReviewNotes("");
      setUploadError("");
      router.refresh();
    }
  };

  const handleCreate = async (formData: FormData) => {
    if (!newFile) {
      setUploadError("Unggah file gambar terlebih dahulu.");
      return;
    }
    setIsSaving(true);
    setUploadError("");
    try {
      const result = await createDrawingDocument({
        drawingCode: String(formData.get("drawingCode") ?? ""),
        title: String(formData.get("title") ?? ""),
        category: String(formData.get("category") ?? ""),
        projectId:
          String(formData.get("projectId") ?? "") === "NONE"
            ? ""
            : String(formData.get("projectId") ?? ""),
        file: newFile,
      });
      refreshAfterAction(result);
    } catch (error) {
      console.error("Saving new drawing document failed:", error);
      setUploadError("Gambar kerja gagal disimpan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevision = async () => {
    if (!selectedDrawing || !revisionFile) {
      setUploadError("Pilih file revisi terlebih dahulu.");
      return;
    }
    setIsSaving(true);
    setUploadError("");
    try {
      const result = await uploadDrawingRevision(
        selectedDrawing.id,
        revisionFile,
        revisionNotes,
      );
      refreshAfterAction(result);
    } catch (error) {
      console.error("Saving drawing revision failed:", error);
      setUploadError("Revisi gagal disimpan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReview = async (status: "REVISION_NEEDED" | "APPROVED") => {
    if (!selectedDrawing) return;
    setIsSaving(true);
    setUploadError("");
    try {
      const result = await reviewDrawingDocument(
        selectedDrawing.id,
        status,
        reviewNotes,
      );
      refreshAfterAction(result);
    } catch (error) {
      console.error("Saving drawing review failed:", error);
      setUploadError("Review gagal disimpan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderPreviewPanel = () => {
    if (!selectedDrawing) return null;
    const surveyLinkProjectId =
      selectedDrawing.projectId ??
      (projectFilter !== "ALL" ? projectFilter : null);
    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Pratinjau Desain
              </h2>
              <p className="mt-1 truncate font-mono text-xs font-semibold text-card-foreground">
                {selectedDrawing.drawingCode}
              </p>
            </div>
            <StatusBadge status={selectedDrawing.status} />
          </div>
          <div className="p-3">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {selectedDrawing.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedDrawing.thumbnailUrl}
                  alt={`Pratinjau ${selectedDrawing.title}`}
                  className="h-full w-full object-contain"
                />
              ) : selectedDrawing.fileUrl &&
                getFileExtension(selectedDrawing.fileUrl) === "PDF" ? (
                <iframe
                  title={`Pratinjau ${selectedDrawing.title}`}
                  src={`${selectedDrawing.fileUrl}#toolbar=0&navpanes=0`}
                  className="h-full w-full"
                />
              ) : (
                <div className="px-5 text-center">
                  <FileImage className="mx-auto size-10 text-muted-foreground" />
                  <p className="mt-2 text-xs font-medium text-card-foreground">
                    Pratinjau belum tersedia
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    File {getFileExtension(selectedDrawing.fileUrl)}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-3 line-clamp-2 text-sm font-semibold text-card-foreground">
              {selectedDrawing.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedDrawing.projectName ?? "Tanpa proyek"} ·{" "}
              {selectedDrawing.category} · Rev {selectedDrawing.version}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selectedDrawing.fileUrl && (
                <>
                  <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                    <a
                      href={selectedDrawing.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      Buka File
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                    <a
                      href={selectedDrawing.fileUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      Unduh File
                    </a>
                  </Button>
                </>
              )}
              {selectedDrawing.projectId && (
                <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                  <Link href={`/apps/projects/${selectedDrawing.projectId}`}>
                    <FolderOpen className="size-3.5" aria-hidden="true" />
                    Detail Proyek
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        {(activeSurvey || surveyLinkProjectId) && (
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground">
                <MapPinned className="size-4 text-primary" aria-hidden="true" />
                Data Ukur &amp; Survei GIS
              </div>
              {surveyLinkProjectId && (
                <Link
                  href={`/apps/projects?section=surveys&projectId=${encodeURIComponent(surveyLinkProjectId)}`}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Buka Peta Survei
                </Link>
              )}
            </div>
            {activeSurvey ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <p>
                  Lokasi:{" "}
                  <span className="font-medium text-foreground">
                    {activeSurvey.locationName}
                  </span>
                </p>
                <p>
                  Luas:{" "}
                  <span className="font-medium text-foreground">
                    {activeSurvey.areaSqm
                      ? `${(activeSurvey.areaSqm / 10000).toFixed(2)} Ha`
                      : "—"}
                  </span>
                </p>
                <p>
                  Surveyor:{" "}
                  <span className="font-medium text-foreground">
                    {activeSurvey.surveyorName}
                  </span>
                </p>
                <p>
                  Tanggal:{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(activeSurvey.createdAt)}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Belum ada poligon/data survei tersimpan untuk proyek ini.
              </p>
            )}
          </section>
        )}

        {canUpload && (
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-card-foreground">
                Unggah Revisi Baru (Rev {selectedDrawing.version + 1})
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                File baru akan menaikkan versi dan masuk antrean review.
              </p>
            </div>
            <div className="space-y-3">
              {revisionFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-lightsuccess p-3 text-xs text-success">
                  <span className="min-w-0 truncate">
                    File revisi siap · {getFileExtension(revisionFile)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevisionFile(null)}
                  >
                    Ganti
                  </Button>
                </div>
              ) : (
                <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                  <UploadCloud className="size-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    DWG, PDF, RVT, DXF, IFC, JPG, PNG atau WEBP · Maks 50 MB
                  </p>
                  <Input
                    type="file"
                    accept={DRAWING_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
                    disabled={isSaving}
                    onChange={(event) => {
                      setRevisionFile(event.currentTarget.files?.[0] ?? null);
                      setUploadError("");
                    }}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="revision-notes">Catatan revisi</Label>
                <textarea
                  id="revision-notes"
                  value={revisionNotes}
                  onChange={(event) => setRevisionNotes(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Jelaskan perubahan pada revisi ini..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={!revisionFile || isSaving}
                onClick={() => void handleRevision()}
              >
                {isSaving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <UploadCloud className="size-4" />
                )}
                Simpan Revisi
              </Button>
            </div>
          </section>
        )}

        {canReview && selectedDrawing.status === "REVIEW" && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">
                Tinjau Gambar
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Catatan wajib diisi jika meminta revisi.
              </p>
            </div>
            <textarea
              aria-label="Catatan review"
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Catatan review atau koreksi..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || reviewNotes.trim().length < 3}
                onClick={() => void handleReview("REVISION_NEEDED")}
              >
                <RotateCcw className="size-4" />
                Minta Revisi
              </Button>
              <Button
                type="button"
                variant="success"
                disabled={isSaving}
                onClick={() => void handleReview("APPROVED")}
              >
                <Check className="size-4" />
                Setujui
              </Button>
            </div>
          </section>
        )}

        {uploadError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error/30 bg-lighterror px-3 py-2 text-xs text-error"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {uploadError}
          </p>
        )}

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-card-foreground">
              Catatan Revisi &amp; Log
            </h2>
          </div>
          {selectedDrawing.logs.length > 0 ? (
            <ol className="space-y-4">
              {selectedDrawing.logs.map((log, index) => (
                <li key={log.id} className="relative flex gap-3">
                  {index < selectedDrawing.logs.length - 1 && (
                    <span className="absolute bottom-[-14px] left-3 top-7 w-px bg-border" />
                  )}
                  <Avatar className="size-7 shrink-0 border border-border">
                    <AvatarFallback className="text-[9px]">
                      {log.createdBy.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-card-foreground">
                      {log.createdBy.name}
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {log.createdBy.role}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-primary">
                      {logActionLabels[log.action] ?? log.action} · Rev{" "}
                      {log.version}
                    </p>
                    {log.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {log.notes}
                      </p>
                    )}
                    <time
                      dateTime={log.createdAt}
                      className="mt-1 block text-[10px] text-muted-foreground"
                    >
                      {formatDate(log.createdAt)}
                    </time>
                    {log.fileUrl && (
                      <a
                        href={log.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-[10px] font-medium text-primary hover:underline"
                      >
                        Buka file Rev {log.version}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">
              Belum ada catatan riwayat.
            </p>
          )}
        </section>
      </div>
    );
  };

  return (
    <main className="space-y-5 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <PenTool className="size-4" aria-hidden="true" />
            DESAIN &amp; ENGINEERING
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Gambar Kerja &amp; Desain Drafter (DED)
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Kelola, tinjau, dan unggah draf gambar teknis (AutoCAD, Revit, PDF)
            untuk seluruh proyek berjalan.
          </p>
        </div>
        {canUpload && (
          <Button
            type="button"
            className="shrink-0 self-start bg-amber-500 text-white hover:bg-amber-600 sm:self-center"
            onClick={openCreateDialog}
          >
            <FilePlus2 className="size-4" aria-hidden="true" />
            Unggah Gambar Baru
          </Button>
        )}
      </header>

      {actionMessage && (
        <p
          role={actionMessage.success ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            actionMessage.success
              ? "border-success/30 bg-lightsuccess text-success"
              : "border-error/30 bg-lighterror text-error"
          }`}
        >
          {actionMessage.message}
        </p>
      )}

      <section
        aria-label="Statistik gambar kerja"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Total Gambar Teknis"
          value={stats.total}
          detail="file"
          tone="primary"
          icon={FileImage}
          active={statusFilter === "ALL"}
          onClick={() => setStatusFilter("ALL")}
        />
        <StatCard
          label="Butuh Revisi"
          value={stats.revision}
          detail="file"
          tone="error"
          icon={RotateCcw}
          active={statusFilter === "REVISION_NEEDED"}
          onClick={() =>
            setStatusFilter((prev) =>
              prev === "REVISION_NEEDED" ? "ALL" : "REVISION_NEEDED",
            )
          }
        />
        <StatCard
          label="Dalam Antrean Review"
          value={stats.review}
          detail="file"
          tone="warning"
          icon={Clock3}
          active={statusFilter === "REVIEW"}
          onClick={() =>
            setStatusFilter((prev) => (prev === "REVIEW" ? "ALL" : "REVIEW"))
          }
        />
        <StatCard
          label="Selesai / Approved"
          value={stats.approved}
          detail="file"
          tone="success"
          icon={CheckCircle2}
          active={statusFilter === "APPROVED"}
          onClick={() =>
            setStatusFilter((prev) => (prev === "APPROVED" ? "ALL" : "APPROVED"))
          }
        />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label className="mb-1.5 text-xs text-muted-foreground">
              Pilih Proyek
            </Label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger aria-label="Pilih proyek" className="w-full">
                <SelectValue placeholder="Semua proyek" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua proyek</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} · {project.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="mb-1.5 text-xs text-muted-foreground">
              Kategori
            </Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger aria-label="Pilih kategori" className="w-full">
                <SelectValue placeholder="Semua kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Gambar</SelectItem>
                {categoryLabels.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {statusFilter !== "ALL" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStatusFilter("ALL")}
          >
            Reset Filter Status
          </Button>
        )}
      </section>

      <section className="grid min-w-0 gap-5 lg:grid-cols-3">
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-card-foreground">
                Daftar Gambar &amp; Revisi
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredDrawings.length} dari {drawings.length} gambar
              </p>
            </div>
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">No &amp; ID</TableHead>
                <TableHead>Nama Gambar &amp; Kategori</TableHead>
                <TableHead className="w-20">Versi</TableHead>
                <TableHead className="w-40">Status &amp; Update</TableHead>
                <TableHead className="w-20 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDrawings.map((drawing, index) => (
                <TableRow
                  key={drawing.id}
                  data-state={selectedId === drawing.id ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => openDrawingDetail(drawing.id)}
                >
                  <TableCell className="align-top whitespace-normal">
                    <span className="block text-[10px] font-medium text-muted-foreground">
                      #{index + 1}
                    </span>
                    <span className="font-mono text-xs font-semibold text-card-foreground">
                      {drawing.drawingCode}
                    </span>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <p className="line-clamp-2 text-xs font-semibold text-card-foreground">
                      {drawing.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="rounded px-1.5 py-0 text-[10px] font-medium"
                      >
                        {drawing.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {drawing.projectName ?? "Tanpa proyek"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-xs font-semibold">
                    Rev {drawing.version}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <StatusBadge status={drawing.status} />
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {formatDate(drawing.updatedAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                      <ActionIconButton
                        type="button"
                        label={`Lihat gambar ${drawing.drawingCode}`}
                        tooltip={`Lihat gambar ${drawing.drawingCode}`}
                        icon={Eye}
                        onClick={(event) => {
                          event.stopPropagation();
                          openDrawingDetail(drawing.id);
                        }}
                      />
                      <Tooltip>
                        <DropdownMenu>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="size-9"
                                aria-label={`Aksi ${drawing.drawingCode}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal
                                  className="size-4"
                                  aria-hidden="true"
                                />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => openDrawingDetail(drawing.id)}
                            >
                              <Eye className="size-4" aria-hidden="true" />
                              Tampilkan pratinjau
                            </DropdownMenuItem>
                            {drawing.fileUrl && (
                              <DropdownMenuItem asChild>
                                <a
                                  href={drawing.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileText
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                  Buka file sumber
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <TooltipContent>Aksi gambar {drawing.drawingCode}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDrawings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-44 whitespace-normal text-center"
                  >
                    <FileImage className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium text-card-foreground">
                      Belum ada gambar kerja
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Unggah gambar baru atau ubah filter proyek dan kategori.
                    </p>
                    {canUpload && (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3 bg-amber-500 text-white hover:bg-amber-600"
                        onClick={openCreateDialog}
                      >
                        <FilePlus2 className="size-4" aria-hidden="true" />
                        Unggah Gambar Pertama
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <aside className="hidden min-w-0 lg:block">
          {selectedDrawing ? (
            renderPreviewPanel()
          ) : (
            <section className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileImage className="size-6" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-sm font-semibold text-card-foreground">
                Pilih gambar untuk ditinjau
              </h2>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Detail desain, pratinjau, unggahan revisi, dan riwayat akan
                tampil di panel ini.
              </p>
            </section>
          )}
        </aside>
      </section>

      <GlobalModal
        isOpen={mobilePreviewOpen && selectedDrawing !== undefined}
        onClose={() => setMobilePreviewOpen(false)}
        title={selectedDrawing?.drawingCode ?? "Detail Gambar Kerja"}
        description={selectedDrawing?.title ?? "Pratinjau & tinjauan gambar"}
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
      >
        {renderPreviewPanel()}
      </GlobalModal>

      <GlobalModal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setUploadError("");
        }}
        title="Unggah Gambar Kerja Baru"
        description="Lengkapi identitas gambar dan unggah file teknis untuk antrean review."
        className="sm:max-w-2xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => setCreateOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="new-drawing-form"
              disabled={isSaving || !newFile}
            >
              {isSaving && <LoaderCircle className="size-4 animate-spin" />}
              Simpan Gambar
            </Button>
          </>
        }
      >
        <form
          id="new-drawing-form"
          key={`new-drawing-${projectFilter}-${createOpen}`}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate(new FormData(event.currentTarget));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="drawing-code">ID Gambar</Label>
              <Input
                id="drawing-code"
                name="drawingCode"
                required
                minLength={4}
                maxLength={50}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{3,49}"
                placeholder="DWG-SPE-001-A-01"
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawing-project">Proyek</Label>
              <Select
                name="projectId"
                defaultValue={projectFilter !== "ALL" ? projectFilter : "NONE"}
              >
                <SelectTrigger id="drawing-project" className="w-full">
                  <SelectValue placeholder="Pilih proyek" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Tanpa proyek</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} · {project.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-title">Nama Gambar / Desain</Label>
            <Input
              id="drawing-title"
              name="title"
              required
              minLength={3}
              maxLength={180}
              placeholder="Contoh: Site Plan & Layout Plan Lantai 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drawing-category">Kategori</Label>
            <Select name="category" defaultValue={DRAWING_CATEGORIES[0]}>
              <SelectTrigger id="drawing-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryLabels.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
            {newFile ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <span className="truncate">
                    File lokal siap disimpan · {newFile.name}
                  </span>
                </div>
                <Button type="button" variant="outline" disabled={isSaving} onClick={() => setNewFile(null)}>
                  Ganti file
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <UploadCloud className="size-7 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  DWG, PDF, RVT, DXF, IFC, JPG, PNG atau WEBP · Maks 50 MB
                </p>
                <Input
                  type="file"
                  accept={DRAWING_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
                  disabled={isSaving}
                  onChange={(event) => {
                    setNewFile(event.currentTarget.files?.[0] ?? null);
                    setUploadError("");
                  }}
                />
              </div>
            )}
          </div>
          {uploadError && (
            <p role="alert" className="text-xs text-error">
              {uploadError}
            </p>
          )}
        </form>
      </GlobalModal>
    </main>
  );
}
