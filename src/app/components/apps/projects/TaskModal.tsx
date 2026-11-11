"use client";

import React, { useState, useRef } from "react";
import { X, HelpCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TaskModalData {
  id?: string;
  title: string;
  location: string; // Fase
  status: string;
  assigneeName?: string;
  hasConstraint: boolean; // Kendala
  needsCheck: boolean; // Perlu dicek
  startWeek: number; // Mulai (minggu)
  durationWeeks: number; // Durasi (mgg)
  progress: number; // Progress (%)
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadedPhotoKeysRef = useRef(new Set<string>());

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const result = await onSave({
        ...formData,
        id: formData.id || savedTaskId || undefined,
        progressReportId: pendingProgressReportId ?? undefined,
        photos: selectedPhotos,
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
        return;
      }
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Task gagal disimpan.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 p-5 pb-4">
          <h3 className="text-base font-semibold text-foreground">
            {formData.id ? "Ubah task" : "Task baru"}
          </h3>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <HelpCircle className="size-3.5" />
              <span>Panduan</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[72vh] overflow-y-auto p-5 space-y-4">
            {/* Nama task */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Nama task <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                placeholder="mis. Struktur Lantai 1-5"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="h-9 text-xs"
              />
            </div>

            {/* Fase & Status row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Fase</label>
                <select
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                >
                  {PHASES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Penanggung jawab */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Penanggung jawab
              </label>
              <select
                value={formData.assigneeName || ""}
                onChange={(e) => setFormData({ ...formData, assigneeName: e.target.value })}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                <option value="">Tanpa penanggung jawab</option>
                {defaultAssigneeName && (
                  <option value={defaultAssigneeName}>
                    {defaultAssigneeName} (PIC Proyek)
                  </option>
                )}
                {teamMembers && teamMembers.length > 0 ? (
                  teamMembers
                    .filter((m) => m.name !== defaultAssigneeName)
                    .map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} ({m.role || "Tim Lapangan"})
                      </option>
                    ))
                ) : (
                  <>
                    <option value="Angga Okta Pratama">Angga Okta Pratama (PM)</option>
                    <option value="Bambang Gunawan">Bambang Gunawan (Koordinator)</option>
                    <option value="Athariq Virziansyah">Athariq Virziansyah (Field Team)</option>
                  </>
                )}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Dapat tugas dengan batas tanggal Selesai.
              </p>
            </div>

            {/* Kendala & Perlu Dicek checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-start gap-2.5 rounded-xl border border-border/80 p-3 bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.hasConstraint}
                  onChange={(e) =>
                    setFormData({ ...formData, hasConstraint: e.target.checked })
                  }
                  className="size-4 mt-0.5 rounded border-border text-foreground accent-foreground cursor-pointer"
                />
                <div>
                  <div className="text-xs font-medium text-foreground">Kendala</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Pekerjaan terhenti, mis. hujan atau material belum datang.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-xl border border-border/80 p-3 bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.needsCheck}
                  onChange={(e) =>
                    setFormData({ ...formData, needsCheck: e.target.checked })
                  }
                  className="size-4 mt-0.5 rounded border-border text-foreground accent-foreground cursor-pointer"
                />
                <div>
                  <div className="text-xs font-medium text-foreground">Perlu dicek</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Sudah dikerjakan, belum diperiksa.
                  </div>
                </div>
              </label>
            </div>

            {/* Numbers row (Start week, Duration, Progress) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Mulai (minggu)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={formData.startWeek}
                  onChange={(e) =>
                    setFormData({ ...formData, startWeek: parseInt(e.target.value) || 0 })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  0 = minggu 1
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Durasi (mgg)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={formData.durationWeeks}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      durationWeeks: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">min. 1</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Progress (%)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={formData.progress}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      progress: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                    })
                  }
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">0–100</span>
              </div>
            </div>

            {/* Dates row (Tanggal mulai & selesai) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tanggal mulai
                </label>
                <Input
                  type="date"
                  value={formData.startDate || ""}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">opsional</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tanggal selesai
                </label>
                <Input
                  type="date"
                  value={formData.endDate || ""}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">opsional</span>
              </div>
            </div>

            {/* Laporan harian */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Laporan harian
              </label>
              <p className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                Progres task dan foto lampiran otomatis masuk ke laporan harian proyek hari ini.
              </p>
            </div>

            {/* Lampiran (foto / bukti) */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Lampiran (foto / bukti)
              </label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  if (files.length > 0) {
                    const selectedKeys = new Set(
                      [
                        ...selectedPhotos.map(getPhotoSelectionKey),
                        ...uploadedPhotoKeysRef.current,
                      ],
                    );
                    const addedKeys = new Set<string>();
                    const uniqueFiles = files.filter((file) => {
                      const key = getPhotoSelectionKey(file);
                      if (selectedKeys.has(key) || addedKeys.has(key)) return false;
                      addedKeys.add(key);
                      return true;
                    });
                    setSelectedPhotos((current) => {
                      const currentKeys = new Set(current.map(getPhotoSelectionKey));
                      return [
                        ...current,
                        ...uniqueFiles.filter((file) => {
                          const key = getPhotoSelectionKey(file);
                          if (currentKeys.has(key)) return false;
                          currentKeys.add(key);
                          return true;
                        }),
                      ];
                    });
                    setPhotoSelectionNotice(
                      uniqueFiles.length < files.length
                        ? "Foto duplikat diabaikan dan tidak akan diunggah ulang."
                        : "",
                    );
                    setSubmitError("");
                  }
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs rounded-lg"
                disabled={isSubmitting}
                onClick={() => photoInputRef.current?.click()}
              >
                <Paperclip className="size-3.5" />
                <span>Unggah lampiran</span>
              </Button>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Jumlah foto tidak dibatasi. JPG, PNG, atau WEBP; maksimal 100 MB per foto.
              </p>
              {photoSelectionNotice && (
                <p className="mt-1 text-xs text-muted-foreground" role="status">
                  {photoSelectionNotice}
                </p>
              )}
              {selectedPhotos.length > 0 && (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {selectedPhotos.map((photo, index) => (
                    <li
                      key={`${photo.name}-${photo.lastModified}-${index}`}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="min-w-0 truncate text-muted-foreground">
                        {photo.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Hapus ${photo.name}`}
                        disabled={isSubmitting}
                        onClick={() =>
                          setSelectedPhotos((current) =>
                            current.filter((_, photoIndex) => photoIndex !== index),
                          )
                        }
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {submitError && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {submitError}
                </p>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/10 p-4">
            {formData.id && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(formData.id!)}
                className="h-9 text-xs text-destructive hover:bg-destructive/10"
              >
                Hapus task
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="h-9 px-4 text-xs rounded-lg"
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isSubmitting}
                className="h-9 px-4 text-xs rounded-lg bg-foreground text-background hover:bg-foreground/90 font-medium"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
