"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
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
  RotateCcw,
} from "lucide-react";
import {
  createDrawingDocument,
  reviewDrawingDocument,
  uploadDrawingRevision,
} from "@/app/actions/drawings";
import {
  DRAWING_CATEGORIES,
  DRAWING_FILE_EXTENSIONS,
} from "@/lib/drawing-document-config";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import type {
  DrawingProjectOption,
  DrawingProjectSurveySummary,
  DrawingWorkspaceItem,
} from "@/lib/drawing-types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      className={`gap-1 whitespace-nowrap rounded-md px-2 py-0.5 ${detail.className}`}
    >
      <StatusIcon className="size-3.5" aria-hidden="true" />
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
      className={`flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-2xs transition-all ${
        active
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:bg-muted/30"
      }`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="type-p3 truncate font-medium text-muted-foreground">
          {label}
        </p>
        <p className="type-kpi mt-1 text-card-foreground">
          {value}{" "}
          <span className="type-p3 font-medium text-muted-foreground">
            {detail}
          </span>
        </p>
      </div>
    </button>
  );
}

function DrawingPreviewPanel({
  drawing,
  projectFilter,
  activeSurvey,
  canUpload,
  canReview,
  revisionFile,
  revisionNotes,
  reviewNotes,
  isSaving,
  acceptedExtensions,
  onRevisionFileChange,
  onRevisionNotesChange,
  onReviewNotesChange,
  onSubmitRevision,
  onSubmitReview,
}: {
  drawing: DrawingWorkspaceItem;
  projectFilter: string;
  activeSurvey: DrawingProjectSurveySummary | null;
  canUpload: boolean;
  canReview: boolean;
  revisionFile: File | null;
  revisionNotes: string;
  reviewNotes: string;
  isSaving: boolean;
  acceptedExtensions: string;
  onRevisionFileChange: (file: File | null) => void;
  onRevisionNotesChange: (value: string) => void;
  onReviewNotesChange: (value: string) => void;
  onSubmitRevision: () => void;
  onSubmitReview: (status: "REVISION_NEEDED" | "APPROVED") => void;
}) {
  const surveyLinkProjectId =
    drawing.projectId ?? (projectFilter !== "ALL" ? projectFilter : null);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <div className="min-w-0">
            <h2 className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
              Pratinjau Desain
            </h2>
            <p className="type-p2 mt-0.5 truncate font-mono font-semibold text-card-foreground">
              {drawing.drawingCode}
            </p>
          </div>
          <StatusBadge status={drawing.status} />
        </div>
        <div className="p-3.5">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {drawing.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={drawing.thumbnailUrl}
                alt={`Pratinjau ${drawing.title}`}
                className="h-full w-full object-contain"
              />
            ) : drawing.fileUrl &&
              getFileExtension(drawing.fileUrl) === "PDF" ? (
              <iframe
                title={`Pratinjau ${drawing.title}`}
                src={`${drawing.fileUrl}#toolbar=0&navpanes=0`}
                className="h-full w-full"
              />
            ) : (
              <div className="px-5 text-center">
                <FileImage className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
                <p className="type-p2 mt-2 font-medium text-card-foreground">
                  Pratinjau belum tersedia
                </p>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Berkas {getFileExtension(drawing.fileUrl)}
                </p>
              </div>
            )}
          </div>
          <p className="type-h3 mt-3 line-clamp-2 text-card-foreground">
            {drawing.title}
          </p>
          <p className="type-p3 mt-1 text-muted-foreground">
            {drawing.projectName ?? "Tanpa proyek"} · {drawing.category} · Rev{" "}
            {drawing.version}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {drawing.fileUrl && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={drawing.fileUrl} target="_blank" rel="noreferrer">
                    <Eye className="size-3.5" aria-hidden="true" />
                    Buka Berkas
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={drawing.fileUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    Unduh
                  </a>
                </Button>
              </>
            )}
            {drawing.projectId && (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/apps/projects/${drawing.projectId}`}>
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  Detail Proyek
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {(activeSurvey || surveyLinkProjectId) && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <h3 className="type-p3 flex items-center gap-2 font-bold uppercase tracking-wide text-foreground">
              <MapPinned className="size-4 text-primary" aria-hidden="true" />
              Data Ukur &amp; Survei GIS
            </h3>
            {surveyLinkProjectId && (
              <Link
                href={`/apps/projects?section=surveys&projectId=${encodeURIComponent(surveyLinkProjectId)}`}
                className="type-p3 font-semibold text-primary hover:underline"
              >
                Peta Survei
              </Link>
            )}
          </div>
          {activeSurvey ? (
            <div className="type-p3 mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
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
            <p className="type-p3 mt-2 text-muted-foreground">
              Belum ada data survei tersimpan untuk proyek ini.
            </p>
          )}
        </section>
      )}

      {canUpload && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="mb-3">
            <h3 className="type-h3 text-card-foreground">
              Unggah Revisi Baru (Rev {drawing.version + 1})
            </h3>
            <p className="type-p3 mt-1 text-muted-foreground">
              Berkas baru akan menaikkan versi dan masuk antrean review.
            </p>
          </div>
          <div className="space-y-3">
            <FileDropzone
              accept={acceptedExtensions}
              maxSizeMb={50}
              files={revisionFile ? [revisionFile] : []}
              onFilesChange={(files) => onRevisionFileChange(files[0] ?? null)}
              onError={(errorMessage) => toast.error(errorMessage)}
              label="Pilih Berkas Revisi"
              hint="DWG, PDF, RVT, DXF, IFC, JPG, PNG, atau WEBP (maks. 50 MB)"
              disabled={isSaving}
            />
            <div className="space-y-1.5">
              <Label htmlFor="revision-notes">Catatan revisi</Label>
              <Textarea
                id="revision-notes"
                value={revisionNotes}
                onChange={(event) => onRevisionNotesChange(event.target.value)}
                maxLength={2000}
                rows={3}
                className="mt-0"
                placeholder="Jelaskan perubahan pada revisi ini..."
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!revisionFile || isSaving}
              onClick={onSubmitRevision}
            >
              {isSaving && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              )}
              Simpan Revisi
            </Button>
          </div>
        </section>
      )}

      {canReview && drawing.status === "REVIEW" && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div>
            <h3 className="type-h3 text-card-foreground">Tinjau Gambar</h3>
            <p className="type-p3 mt-1 text-muted-foreground">
              Catatan wajib diisi jika meminta revisi.
            </p>
          </div>
          <Textarea
            aria-label="Catatan review"
            value={reviewNotes}
            onChange={(event) => onReviewNotesChange(event.target.value)}
            maxLength={2000}
            rows={2}
            className="mt-0"
            placeholder="Catatan review atau koreksi..."
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || reviewNotes.trim().length < 3}
              onClick={() => onSubmitReview("REVISION_NEEDED")}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Minta Revisi
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={isSaving}
              onClick={() => onSubmitReview("APPROVED")}
            >
              <Check className="size-4" aria-hidden="true" />
              Setujui
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div className="mb-4 flex items-center gap-2">
          <History className="size-4 text-primary" aria-hidden="true" />
          <h3 className="type-h3 text-card-foreground">
            Catatan Revisi &amp; Log
          </h3>
        </div>
        {drawing.logs.length > 0 ? (
          <ol className="space-y-4">
            {drawing.logs.map((log, index) => (
              <li key={log.id} className="relative flex gap-3">
                {index < drawing.logs.length - 1 && (
                  <span className="absolute bottom-[-14px] left-3 top-7 w-px bg-border" />
                )}
                <Avatar className="size-7 shrink-0 border border-border">
                  <AvatarFallback className="type-p3">
                    {log.createdBy.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="type-p3 font-semibold text-card-foreground">
                    {log.createdBy.name}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {log.createdBy.role}
                    </span>
                  </p>
                  <p className="type-p3 mt-0.5 text-primary">
                    {logActionLabels[log.action] ?? log.action} · Rev{" "}
                    {log.version}
                  </p>
                  {log.notes && (
                    <p className="type-p3 mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                      {log.notes}
                    </p>
                  )}
                  <time
                    dateTime={log.createdAt}
                    className="type-p3 mt-1 block text-muted-foreground"
                  >
                    {formatDate(log.createdAt)}
                  </time>
                  {log.fileUrl && (
                    <a
                      href={log.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="type-p3 mt-1 inline-flex font-medium text-primary hover:underline"
                    >
                      Buka berkas Rev {log.version}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="type-p3 text-muted-foreground">
            Belum ada catatan riwayat.
          </p>
        )}
      </section>
    </div>
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

  const acceptedExtensions = useMemo(
    () => DRAWING_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(","),
    [],
  );

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
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setMobilePreviewOpen(true);
    }
  };

  const openCreateDialog = () => {
    setNewFile(null);
    setCreateOpen(true);
  };

  const handleActionOutcome = (result: { success: boolean; message: string }) => {
    if (result.success) {
      toast.success(result.message);
      setCreateOpen(false);
      setMobilePreviewOpen(false);
      setNewFile(null);
      setRevisionFile(null);
      setRevisionNotes("");
      setReviewNotes("");
      requestNotificationFeedRefresh();
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  const handleCreate = async (formData: FormData) => {
    if (!newFile) {
      toast.error("Unggah berkas gambar terlebih dahulu.");
      return;
    }
    setIsSaving(true);
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
      handleActionOutcome(result);
    } catch (error) {
      console.error("Saving new drawing document failed:", error);
      toast.error("Gambar kerja gagal disimpan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevision = async () => {
    if (!selectedDrawing || !revisionFile) {
      toast.error("Pilih berkas revisi terlebih dahulu.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await uploadDrawingRevision(
        selectedDrawing.id,
        revisionFile,
        revisionNotes,
      );
      handleActionOutcome(result);
    } catch (error) {
      console.error("Saving drawing revision failed:", error);
      toast.error("Revisi gagal disimpan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReview = async (status: "REVISION_NEEDED" | "APPROVED") => {
    if (!selectedDrawing) return;
    setIsSaving(true);
    try {
      const result = await reviewDrawingDocument(
        selectedDrawing.id,
        status,
        reviewNotes,
      );
      handleActionOutcome(result);
    } catch (error) {
      console.error("Saving drawing review failed:", error);
      toast.error("Review gagal disimpan. Silakan coba kembali.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="space-y-5 pb-8">
      <PageHeader
        title="Gambar Kerja & Desain Drafter (DED)"
        description="Kelola, tinjau, dan unggah draf gambar teknis (AutoCAD, Revit, PDF) untuk seluruh proyek berjalan."
        breadcrumbs={[
          { label: "Beranda", href: "/" },
          { label: "Drafter (DED)" },
        ]}
        actions={
          canUpload ? (
            <Button type="button" onClick={openCreateDialog}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              Unggah Gambar Baru
            </Button>
          ) : undefined
        }
      />

      <section
        aria-label="Statistik gambar kerja"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Total Gambar Teknis"
          value={stats.total}
          detail="berkas"
          tone="primary"
          icon={FileImage}
          active={statusFilter === "ALL"}
          onClick={() => setStatusFilter("ALL")}
        />
        <StatCard
          label="Butuh Revisi"
          value={stats.revision}
          detail="berkas"
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
          detail="berkas"
          tone="warning"
          icon={Clock3}
          active={statusFilter === "REVIEW"}
          onClick={() =>
            setStatusFilter((prev) => (prev === "REVIEW" ? "ALL" : "REVIEW"))
          }
        />
        <StatCard
          label="Selesai / Disetujui"
          value={stats.approved}
          detail="berkas"
          tone="success"
          icon={CheckCircle2}
          active={statusFilter === "APPROVED"}
          onClick={() =>
            setStatusFilter((prev) => (prev === "APPROVED" ? "ALL" : "APPROVED"))
          }
        />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label className="type-p3 mb-1.5 text-muted-foreground">
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
            <Label className="type-p3 mb-1.5 text-muted-foreground">
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
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
            <div>
              <h2 className="type-h3 uppercase tracking-wide text-card-foreground">
                Daftar Gambar &amp; Revisi
              </h2>
              <p className="type-p3 mt-0.5 text-muted-foreground">
                {filteredDrawings.length} dari {drawings.length} gambar
              </p>
            </div>
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          {filteredDrawings.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">No &amp; ID</TableHead>
                  <TableHead>Nama Gambar &amp; Kategori</TableHead>
                  <TableHead className="w-20">Versi</TableHead>
                  <TableHead className="w-40">Status &amp; Update</TableHead>
                  <TableHead className="w-24 text-right">Aksi</TableHead>
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
                      <span className="type-p3 block font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="type-p3 font-mono font-semibold text-card-foreground">
                        {drawing.drawingCode}
                      </span>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <p className="type-p2 line-clamp-2 font-semibold text-card-foreground">
                        {drawing.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">
                          {drawing.category}
                        </Badge>
                        <span className="type-p3 text-muted-foreground">
                          {drawing.projectName ?? "Tanpa proyek"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="type-p3 align-top font-semibold">
                      Rev {drawing.version}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <StatusBadge status={drawing.status} />
                      <span className="type-p3 mt-1 block text-muted-foreground">
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-10"
                              aria-label={`Aksi ${drawing.drawingCode}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontal
                                className="size-4"
                                aria-hidden="true"
                              />
                            </Button>
                          </DropdownMenuTrigger>
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
                                  Buka berkas sumber
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-5">
              <EmptyState
                variant="inline"
                icon={FileImage}
                title="Belum ada gambar kerja"
                description="Unggah gambar baru atau ubah filter proyek dan kategori."
                action={
                  canUpload ? (
                    <Button type="button" size="sm" onClick={openCreateDialog}>
                      <FilePlus2 className="size-4" aria-hidden="true" />
                      Unggah Gambar Pertama
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </div>

        <aside className="hidden min-w-0 lg:block">
          {selectedDrawing ? (
            <DrawingPreviewPanel
              drawing={selectedDrawing}
              projectFilter={projectFilter}
              activeSurvey={activeSurvey}
              canUpload={canUpload}
              canReview={canReview}
              revisionFile={revisionFile}
              revisionNotes={revisionNotes}
              reviewNotes={reviewNotes}
              isSaving={isSaving}
              acceptedExtensions={acceptedExtensions}
              onRevisionFileChange={setRevisionFile}
              onRevisionNotesChange={setRevisionNotes}
              onReviewNotesChange={setReviewNotes}
              onSubmitRevision={() => void handleRevision()}
              onSubmitReview={(status) => void handleReview(status)}
            />
          ) : (
            <EmptyState
              icon={FileImage}
              title="Pilih gambar untuk ditinjau"
              description="Detail desain, pratinjau, unggahan revisi, dan riwayat akan tampil di panel ini."
            />
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
        {selectedDrawing ? (
          <DrawingPreviewPanel
            drawing={selectedDrawing}
            projectFilter={projectFilter}
            activeSurvey={activeSurvey}
            canUpload={canUpload}
            canReview={canReview}
            revisionFile={revisionFile}
            revisionNotes={revisionNotes}
            reviewNotes={reviewNotes}
            isSaving={isSaving}
            acceptedExtensions={acceptedExtensions}
            onRevisionFileChange={setRevisionFile}
            onRevisionNotesChange={setRevisionNotes}
            onReviewNotesChange={setReviewNotes}
            onSubmitRevision={() => void handleRevision()}
            onSubmitReview={(status) => void handleReview(status)}
          />
        ) : null}
      </GlobalModal>

      <GlobalModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Unggah Gambar Kerja Baru"
        description="Lengkapi identitas gambar dan unggah berkas teknis untuk antrean review."
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
              {isSaving && (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              )}
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
          <FileDropzone
            accept={acceptedExtensions}
            maxSizeMb={50}
            files={newFile ? [newFile] : []}
            onFilesChange={(files) => setNewFile(files[0] ?? null)}
            onError={(errorMessage) => toast.error(errorMessage)}
            label="Unggah Berkas Gambar"
            hint="DWG, PDF, RVT, DXF, IFC, JPG, PNG, atau WEBP (maks. 50 MB)"
            disabled={isSaving}
          />
        </form>
      </GlobalModal>
    </main>
  );
}
