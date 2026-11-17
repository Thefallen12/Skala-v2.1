"use client";

import { useRef, useState, type FormEvent } from "react";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { FileDropzone } from "@/components/ui/file-dropzone";
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
import { compressFieldImageFiles } from "@/lib/image-compression-client";

export interface TaskModalData {
  id?: string;
  title: string;
  location: string;
  status: string;
  assigneeName?: string;
  hasConstraint: boolean;
  needsCheck: boolean;
  startWeek: number;
  durationWeeks: number;
  progress: number;
  startDate?: string;
  endDate?: string;
}

export interface TaskModalSaveData extends TaskModalData {
  photos: File[];
  progressReportId?: string;
}

export interface TaskModalSaveOutcome {
  savedTaskId?: string;
  progressReportId?: string;
  uploadedPhotosCount?: number;
  error?: string;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: TaskModalData | null;
  projectStartDate?: string;
  defaultAssigneeName?: string | null;
  teamMembers?: Array<{ id: string; name: string; role?: string }>;
  onSave: (
    data: TaskModalSaveData,
  ) => Promise<TaskModalSaveOutcome | void> | TaskModalSaveOutcome | void;
  onDelete?: (id: string) => Promise<void> | void;
}

const PHASES = [
  "A. Persiapan",
  "B. Lantai",
  "C. Dinding",
  "D. Listrik",
  "Struktur",
  "Arsitektur",
  "MEP",
  "Serah Terima",
];

const STATUS_OPTIONS = [
  { value: "auto", label: "Otomatis (dari progress)" },
  { value: "TODO", label: "Belum mulai" },
  { value: "IN_PROGRESS", label: "Berjalan" },
  { value: "DONE", label: "Selesai" },
  { value: "ISSUE", label: "Kendala" },
  { value: "REVIEW", label: "Perlu dicek" },
  { value: "DELAYED", label: "Terlambat" },
];

const NO_ASSIGNEE_VALUE = "__NONE__";

function getPhotoSelectionKey(photo: File): string {
  return `${photo.name}\u0000${photo.size}\u0000${photo.lastModified}\u0000${photo.type}`;
}

export default function TaskModal({
  isOpen,
  onClose,
  initialData,
  defaultAssigneeName,
  teamMembers,
  onSave,
  onDelete,
}: TaskModalProps) {
  const [formData, setFormData] = useState<TaskModalData>(() => ({
    id: initialData?.id,
    title: initialData?.title ?? "",
    location: initialData?.location ?? "A. Persiapan",
    status: initialData?.status ?? "auto",
    assigneeName: initialData?.assigneeName || defaultAssigneeName || "",
    hasConstraint: initialData?.hasConstraint ?? false,
    needsCheck: initialData?.needsCheck ?? false,
    startWeek: initialData?.startWeek ?? 0,
    durationWeeks: initialData?.durationWeeks ?? 1,
    progress: initialData?.progress ?? 0,
    startDate: initialData?.startDate ?? "",
    endDate: initialData?.endDate ?? "",
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoSelectionNotice, setPhotoSelectionNotice] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [savedTaskId, setSavedTaskId] = useState<string | null>(
    initialData?.id ?? null,
  );
  const [pendingProgressReportId, setPendingProgressReportId] = useState<
    string | null
  >(null);
  const uploadedPhotoKeysRef = useRef(new Set<string>());

  const handleFilesChange = (incomingFiles: File[]) => {
    // Mendeteksi penghapusan file maupun penambahan baru dari FileDropzone
    if (incomingFiles.length < selectedPhotos.length) {
      setSelectedPhotos(incomingFiles);
      setPhotoSelectionNotice("");
      return;
    }

    const uploadedKeys = uploadedPhotoKeysRef.current;
    const seenKeys = new Set<string>();
    const deduped: File[] = [];
    let skippedCount = 0;

    for (const file of incomingFiles) {
      const key = getPhotoSelectionKey(file);
      if (uploadedKeys.has(key) || seenKeys.has(key)) {
        skippedCount += 1;
        continue;
      }
      seenKeys.add(key);
      deduped.push(file);
    }

    setSelectedPhotos(deduped);
    setPhotoSelectionNotice(
      skippedCount > 0
        ? "Foto duplikat diabaikan dan tidak akan diunggah ulang."
        : "",
    );
    setSubmitError("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Nama task wajib diisi.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const compressedPhotos =
        selectedPhotos.length > 0
          ? await compressFieldImageFiles(selectedPhotos)
          : [];

      const result = await onSave({
        ...formData,
        id: formData.id || savedTaskId || undefined,
        progressReportId: pendingProgressReportId ?? undefined,
        photos: compressedPhotos,
      });

      if (result?.savedTaskId) setSavedTaskId(result.savedTaskId);
      if (result?.progressReportId) {
        setPendingProgressReportId(result.progressReportId);
      }
      if (result?.uploadedPhotosCount) {
        selectedPhotos
          .slice(0, result.uploadedPhotosCount)
          .forEach((photo) =>
            uploadedPhotoKeysRef.current.add(getPhotoSelectionKey(photo)),
          );
        setSelectedPhotos((current) =>
          current.slice(result.uploadedPhotosCount),
        );
        setPhotoSelectionNotice("");
      }
      if (result?.error) {
        setSubmitError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Task jadwal berhasil disimpan.");
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Task gagal disimpan.";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlobalModal
      isOpen={isOpen}
      onClose={onClose}
      mobileBehavior="sheet"
      icon={<CalendarDays className="size-4" aria-hidden="true" />}
      title={formData.id ? "Ubah Task" : "Task Baru"}
      description="Progres task dan foto lampiran otomatis tercatat ke laporan harian proyek."
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div>
            {formData.id && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSubmitting}
                onClick={() => void onDelete(formData.id!)}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Hapus Task
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="project-task-modal-form"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Menyimpan...
                </>
              ) : (
                "Simpan"
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="project-task-modal-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="task-title" className="type-p2 font-medium">
            Nama Task <span className="text-destructive">*</span>
          </Label>
          <Input
            id="task-title"
            type="text"
            placeholder="mis. Struktur Lantai 1-5"
            value={formData.title}
            onChange={(event) =>
              setFormData({ ...formData, title: event.target.value })
            }
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-phase" className="type-p2 font-medium">
              Fase
            </Label>
            <Select
              value={formData.location}
              onValueChange={(value) =>
                setFormData({ ...formData, location: value })
              }
            >
              <SelectTrigger id="task-phase" className="w-full">
                <SelectValue placeholder="Pilih fase" />
              </SelectTrigger>
              <SelectContent>
                {!PHASES.includes(formData.location) && formData.location ? (
                  <SelectItem value={formData.location}>
                    {formData.location}
                  </SelectItem>
                ) : null}
                {PHASES.map((phase) => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-status" className="type-p2 font-medium">
              Status
            </Label>
            <Select
              value={formData.status}
              onValueChange={(value) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger id="task-status" className="w-full">
                <SelectValue placeholder="Pilih status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-assignee" className="type-p2 font-medium">
            Penanggung Jawab
          </Label>
          <Select
            value={formData.assigneeName || NO_ASSIGNEE_VALUE}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                assigneeName: value === NO_ASSIGNEE_VALUE ? "" : value,
              })
            }
          >
            <SelectTrigger id="task-assignee" className="w-full">
              <SelectValue placeholder="Pilih penanggung jawab" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ASSIGNEE_VALUE}>
                Tanpa penanggung jawab
              </SelectItem>
              {defaultAssigneeName && (
                <SelectItem value={defaultAssigneeName}>
                  {defaultAssigneeName} (PIC Proyek)
                </SelectItem>
              )}
              {teamMembers && teamMembers.length > 0 ? (
                teamMembers
                  .filter((member) => member.name !== defaultAssigneeName)
                  .map((member) => (
                    <SelectItem key={member.id} value={member.name}>
                      {member.name} ({member.role || "Tim Lapangan"})
                    </SelectItem>
                  ))
              ) : (
                <>
                  <SelectItem value="Angga Okta Pratama">
                    Angga Okta Pratama (PM)
                  </SelectItem>
                  <SelectItem value="Bambang Gunawan">
                    Bambang Gunawan (Koordinator)
                  </SelectItem>
                  <SelectItem value="Athariq Virziansyah">
                    Athariq Virziansyah (Field Team)
                  </SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label
            htmlFor="task-constraint"
            className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/20 p-3"
          >
            <Checkbox
              id="task-constraint"
              checked={formData.hasConstraint}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, hasConstraint: checked === true })
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <span className="type-p2 block font-semibold text-foreground">
                Kendala
              </span>
              <span className="type-p3 block font-normal text-muted-foreground">
                Terhenti karena cuaca atau material.
              </span>
            </div>
          </Label>

          <Label
            htmlFor="task-needs-check"
            className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/20 p-3"
          >
            <Checkbox
              id="task-needs-check"
              checked={formData.needsCheck}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, needsCheck: checked === true })
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <span className="type-p2 block font-semibold text-foreground">
                Perlu Dicek
              </span>
              <span className="type-p3 block font-normal text-muted-foreground">
                Sudah dikerjakan, menunggu verifikasi.
              </span>
            </div>
          </Label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="task-start-week" className="type-p2 font-medium">
              Mulai (mgg)
            </Label>
            <Input
              id="task-start-week"
              type="number"
              min={0}
              value={formData.startWeek}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  startWeek: Number.parseInt(event.target.value, 10) || 0,
                })
              }
              className="tabular-nums"
            />
            <span className="type-p3 block text-muted-foreground">
              0 = minggu 1
            </span>
          </div>

          <div className="space-y-1">
            <Label htmlFor="task-duration" className="type-p2 font-medium">
              Durasi (mgg)
            </Label>
            <Input
              id="task-duration"
              type="number"
              min={1}
              value={formData.durationWeeks}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  durationWeeks: Math.max(
                    1,
                    Number.parseInt(event.target.value, 10) || 1,
                  ),
                })
              }
              className="tabular-nums"
            />
            <span className="type-p3 block text-muted-foreground">min. 1</span>
          </div>

          <div className="space-y-1">
            <Label htmlFor="task-progress" className="type-p2 font-medium">
              Progress (%)
            </Label>
            <Input
              id="task-progress"
              type="number"
              min={0}
              max={100}
              value={formData.progress}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  progress: Math.max(
                    0,
                    Math.min(100, Number.parseInt(event.target.value, 10) || 0),
                  ),
                })
              }
              className="tabular-nums"
            />
            <span className="type-p3 block text-muted-foreground">0–100%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="type-p2 font-medium">Tanggal Mulai</Label>
            <DatePicker
              clearable
              value={formData.startDate || ""}
              onValueChange={(dateKey) =>
                setFormData({ ...formData, startDate: dateKey })
              }
              placeholder="Opsional"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="type-p2 font-medium">Tanggal Selesai</Label>
            <DatePicker
              clearable
              value={formData.endDate || ""}
              onValueChange={(dateKey) =>
                setFormData({ ...formData, endDate: dateKey })
              }
              placeholder="Opsional"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="type-p2 font-medium">
            Lampiran Foto Progres
          </Label>
          <FileDropzone
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            files={selectedPhotos}
            disabled={isSubmitting}
            onFilesChange={handleFilesChange}
            onError={(msg) => toast.error(msg)}
            label="Unggah Foto Lampiran"
            hint="JPG, PNG, atau WEBP (otomatis dikompresi saat disimpan)."
          />
          {photoSelectionNotice && (
            <p className="type-p3 text-muted-foreground" role="status">
              {photoSelectionNotice}
            </p>
          )}
          {submitError && (
            <p className="type-p3 text-destructive" role="alert">
              {submitError}
            </p>
          )}
        </div>
      </form>
    </GlobalModal>
  );
}
