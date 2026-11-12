"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addProjectWorkPointProgress, approveProjectWorkPointWage, createProjectWorkPoint, editApprovedProjectWorkPointWage } from "@/app/actions/project";
import type { ProjectDashboardRow } from "@/app/(DashboardLayout)/types/project";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  photoDownloadLabel,
  photoDownloadLinkProps,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";

const formatCurrency = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));

function todayAsDateInput(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export default function ProjectWorkPointsModal({
  project,
  open,
  onOpenChange,
  currentUserId,
  currentUserRole,
}: {
  project: ProjectDashboardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [proposedVolume, setProposedVolume] = useState("");
  const [proposedUnit, setProposedUnit] = useState("");
  const [proposedUnitPrice, setProposedUnitPrice] = useState("");
  const [proposedTotalWage, setProposedTotalWage] = useState("");
  const [wageValues, setWageValues] = useState<Record<string, string>>({});
  const [wageReasons, setWageReasons] = useState<Record<string, string>>({});
  const [progressPointId, setProgressPointId] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(todayAsDateInput);
  const [progress, setProgress] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isAssignedPic =
    (currentUserRole === UserRole.FIELD_TEAM ||
      currentUserRole === UserRole.KOORDINATOR) &&
    project?.fieldPicId === currentUserId;
  const canManagePoints = isAssignedPic;
  const isDirector = currentUserRole === UserRole.DIRECTOR;

  useEffect(
    () => () => photoPreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl)),
    [photoPreviews],
  );

  const createPoint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createProjectWorkPoint(project.id, {
          title,
          location,
          proposedVolume,
          proposedUnit,
          proposedUnitPrice,
          proposedTotalWage,
        });
        setMessage(result.message);
        if (result.success) {
          setTitle("");
          setLocation("");
          setProposedVolume("");
          setProposedUnit("");
          setProposedUnitPrice("");
          setProposedTotalWage("");
          router.refresh();
        }
      } catch (error) {
        console.error("Creating work point failed:", error);
        setMessage("Usulan titik pekerjaan gagal dikirim.");
      }
    });
  };

  const saveWage = (pointId: string, isApproved: boolean) => {
    const amount = wageValues[pointId];
    if (!amount) {
      setMessage("Masukkan total upah terlebih dahulu.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const result =
          isApproved
            ? await editApprovedProjectWorkPointWage(
                pointId,
                amount,
                wageReasons[pointId] ?? "",
              )
            : isDirector
              ? await approveProjectWorkPointWage(
                  pointId,
                  amount,
                  wageReasons[pointId] || "Persetujuan awal atas nilai usulan.",
                )
              : { success: false as const, message: "Aksi tidak diizinkan." };
        setMessage(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Saving work point wage failed:", error);
        setMessage("Total upah gagal disimpan.");
      }
    });
  };

  const saveProgress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!progressPointId) return;
    if (!progress || Number(progress) < 0 || Number(progress) > 100) {
      setMessage("Progres titik harus di antara 0 sampai 100%.");
      return;
    }
    if (photos.length > 5 || photos.some((photo) => photo.size > 5 * 1024 * 1024)) {
      setMessage("Maksimal 5 foto dan ukuran setiap foto maksimal 5 MB.");
      return;
    }

    const formData = new FormData();
    formData.set("reportDate", reportDate);
    formData.set("progress", progress);
    formData.set("workSummary", workSummary);
    photos.forEach((photo) => formData.append("photos", photo));
    setMessage("");
    startTransition(async () => {
      try {
        const result = await addProjectWorkPointProgress(progressPointId, formData);
        setMessage(result.message);
        if (result.success) {
          setProgressPointId(null);
          setProgress("");
          setWorkSummary("");
          setPhotos([]);
          setPhotoPreviews([]);
          router.refresh();
        }
      } catch (error) {
        console.error("Saving work point progress failed:", error);
        setMessage("Progres titik gagal disimpan.");
      }
    });
  };

  return (
    <>
      <GlobalModal
        isOpen={open}
        onClose={() => {
          setProgressPointId(null);
          setPhotos([]);
          setPhotoPreviews([]);
          setMessage("");
          onOpenChange(false);
        }}
        title="Titik Pekerjaan & Upah Tukang"
        description={`${project?.title ?? "Proyek"}. PIC Team Lapangan mengelola tugas per titik, mengirim foto progres, dan mengajukan total upah hasil negosiasi. Direktur menyetujui nilai total.`}
        className="sm:max-w-4xl"
      >

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <span className="font-medium">PIC Team Lapangan: </span>
            {project?.fieldPicName ?? "Belum ditentukan"}
          </div>
          {project && project.workPoints.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  Total usulan upah seluruh titik
                </p>
                <p className="mt-1 font-semibold">
                  {formatCurrency(project.proposedWorkPointWages)}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  Total upah yang disetujui
                </p>
                <p className="mt-1 font-semibold">
                  {formatCurrency(project.approvedWorkPointWages)}
                </p>
              </div>
            </div>
          )}

          {canManagePoints && (
            <form className="space-y-3 rounded-lg border p-4" onSubmit={createPoint}>
              <h3 className="font-semibold">Ajukan titik/tugas dan total upah</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="work-point-title">Titik / jenis tugas</Label>
                  <Input
                    id="work-point-title"
                    required
                    maxLength={180}
                    value={title}
                    disabled={isPending}
                    placeholder="Contoh: Pasangan batu titik saluran 1"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-point-location">Lokasi titik</Label>
                  <Input
                    id="work-point-location"
                    maxLength={240}
                    value={location}
                    disabled={isPending}
                    placeholder="Patokan lokasi pekerjaan"
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-point-volume">Volume pekerjaan</Label>
                  <Input
                    id="work-point-volume"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={proposedVolume}
                    disabled={isPending}
                    onChange={(event) => setProposedVolume(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-point-unit">Satuan volume</Label>
                  <Input
                    id="work-point-unit"
                    maxLength={40}
                    required
                    value={proposedUnit}
                    disabled={isPending}
                    placeholder="m, m², m³, unit"
                    onChange={(event) => setProposedUnit(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-point-unit-price">Harga satuan (Rp)</Label>
                  <Input
                    id="work-point-unit-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="9999999999999999.99"
                    step="0.01"
                    required
                    value={proposedUnitPrice}
                    disabled={isPending}
                    onChange={(event) =>
                      setProposedUnitPrice(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="work-point-wage">Usulan total upah (Rp)</Label>
                  <Input
                    id="work-point-wage"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="9999999999999999.99"
                    step="0.01"
                    required
                    value={proposedTotalWage}
                    disabled={isPending}
                    onChange={(event) => setProposedTotalWage(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Total harus sama dengan volume × harga satuan. Nilai menjadi
                    disetujui setelah Direktur memeriksa dan menyetujuinya.
                  </p>
                </div>
              </div>
              <Button type="submit" disabled={isPending || !project?.fieldPicId}>
                {isPending ? "Mengirim..." : "Kirim usulan titik"}
              </Button>
              {!project?.fieldPicId && (
                <p className="text-sm text-destructive">
                  Tetapkan PIC Team Lapangan pada Edit proyek sebelum mengajukan
                  titik pekerjaan.
                </p>
              )}
            </form>
          )}

          {project?.workPoints.length ? (
            <div className="space-y-4">
              {project.workPoints.map((point) => {
                const isApproved = point.approvedTotalWage !== null;
                const currentWage = isApproved
                  ? point.approvedTotalWage!
                  : point.proposedTotalWage;
                const canEditWage =
                  isDirector || (currentUserRole === UserRole.ADMINISTRATIONS && isApproved);
                return (
                  <section key={point.id} className="space-y-4 rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{point.title}</h3>
                        {point.location && (
                          <p className="text-sm text-muted-foreground">{point.location}</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Usulan dari: {point.proposedByName}
                        </p>
                        {point.approvedByName && (
                          <p className="text-xs text-muted-foreground">
                            Disetujui/diubah oleh: {point.approvedByName}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          isApproved
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {isApproved ? "Disetujui Direktur" : "Menunggu persetujuan"}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Usulan PIC</p>
                        <p className="font-medium">{formatCurrency(point.proposedTotalWage)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total disetujui</p>
                        <p className="font-medium">
                          {point.approvedTotalWage
                            ? formatCurrency(point.approvedTotalWage)
                            : "Belum disetujui"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Progres titik</p>
                        <p className="font-medium">{point.progress}%</p>
                      </div>
                    </div>

                    {canEditWage && (
                      <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/30 p-3">
                        <div className="min-w-52 flex-1 space-y-2">
                          <Label htmlFor={`wage-${point.id}`}>
                            {isApproved ? "Nilai upah disetujui (Rp)" : "Nilai yang disetujui (Rp)"}
                          </Label>
                          <Input
                            id={`wage-${point.id}`}
                            type="number"
                            min="0"
                            max="9999999999999999.99"
                            step="0.01"
                            value={wageValues[point.id] ?? currentWage}
                            disabled={isPending}
                            onChange={(event) =>
                              setWageValues((current) => ({
                                ...current,
                                [point.id]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        {isApproved && (
                          <div className="min-w-52 flex-1 space-y-2">
                            <Label htmlFor={`wage-reason-${point.id}`}>
                              Alasan perubahan wajib diisi
                            </Label>
                            <Input
                              id={`wage-reason-${point.id}`}
                              value={wageReasons[point.id] ?? ""}
                              maxLength={2000}
                              disabled={isPending}
                              onChange={(event) =>
                                setWageReasons((current) => ({
                                  ...current,
                                  [point.id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        )}
                        <Button
                          type="button"
                          disabled={isPending}
                          onClick={() => saveWage(point.id, isApproved)}
                        >
                          {isApproved ? "Simpan perubahan" : "Setujui total"}
                        </Button>
                      </div>
                    )}

                    {canManagePoints && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setMessage("");
                          setPhotos([]);
                          setPhotoPreviews([]);
                          setProgressPointId(
                            progressPointId === point.id ? null : point.id,
                          );
                          setProgress(String(point.progress));
                        }}
                      >
                        {progressPointId === point.id
                          ? "Tutup form progres"
                          : "Kirim progres & foto titik"}
                      </Button>
                    )}

                    {progressPointId === point.id && canManagePoints && (
                      <form className="space-y-3 rounded-md border p-3" onSubmit={saveProgress}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`point-date-${point.id}`}>Tanggal progres</Label>
                            <Input
                              id={`point-date-${point.id}`}
                              type="date"
                              required
                              value={reportDate}
                              disabled={isPending}
                              onChange={(event) => setReportDate(event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`point-progress-${point.id}`}>
                              Progres kumulatif (%)
                            </Label>
                            <Input
                              id={`point-progress-${point.id}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              required
                              value={progress}
                              disabled={isPending}
                              onChange={(event) => setProgress(event.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`point-summary-${point.id}`}>Catatan pekerjaan</Label>
                          <Textarea
                            id={`point-summary-${point.id}`}
                            maxLength={2000}
                            rows={3}
                            value={workSummary}
                            disabled={isPending}
                            onChange={(event) => setWorkSummary(event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`point-photos-${point.id}`}>
                            Foto progres titik (opsional)
                          </Label>
                          <Input
                            id={`point-photos-${point.id}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            disabled={isPending}
                            onChange={(event) => {
                              const selected = Array.from(event.currentTarget.files ?? []);
                              if (
                                selected.length > 5 ||
                                selected.some((photo) => photo.size > 5 * 1024 * 1024)
                              ) {
                                setMessage("Maksimal 5 foto dan ukuran setiap foto maksimal 5 MB.");
                                event.currentTarget.value = "";
                                setPhotos([]);
                                setPhotoPreviews([]);
                                return;
                              }
                              if (
                                selected.some(
                                  (photo) =>
                                    !["image/jpeg", "image/png", "image/webp"].includes(
                                      photo.type,
                                    ),
                                )
                              ) {
                                setMessage("Format foto harus JPG, PNG, atau WEBP.");
                                event.currentTarget.value = "";
                                setPhotos([]);
                                setPhotoPreviews([]);
                                return;
                              }
                              setMessage("");
                              setPhotos(selected);
                              setPhotoPreviews(
                                selected.map((photo) => URL.createObjectURL(photo)),
                              );
                            }}
                          />
                          {photoPreviews.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {photoPreviews.map((previewUrl, index) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={`${previewUrl}-${index}`}
                                  src={previewUrl}
                                  alt={`Pratinjau foto progres ${index + 1}`}
                                  className="size-16 rounded border object-cover"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <Button type="submit" disabled={isPending}>
                          {isPending ? "Mengirim..." : "Simpan progres titik"}
                        </Button>
                      </form>
                    )}

                    {point.progressReports.length > 0 && (
                      <div className="space-y-3 border-t pt-3">
                        <h4 className="text-sm font-semibold">Riwayat progres</h4>
                        {point.progressReports.map((report) => (
                          <div key={report.id} className="space-y-2">
                            <p className="text-sm">
                              {new Date(`${report.reportDate}T00:00:00`).toLocaleDateString(
                                "id-ID",
                                { day: "numeric", month: "long", year: "numeric" },
                              )}{" "}
                              · {report.progress}%
                            </p>
                            {report.workSummary && (
                              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                {report.workSummary}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {report.photoUrls.map((photoUrl) => (
                                <button
                                  key={photoUrl}
                                  type="button"
                                  className="overflow-hidden rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                  onClick={() => setSelectedPhoto(photoUrl)}
                                  aria-label="Buka foto progres titik"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={withLocalPhotoPreview(photoUrl)}
                                    alt={`Foto progres ${point.title} ${report.reportDate}`}
                                    className="size-20 object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              Belum ada titik pekerjaan yang diajukan.
            </p>
          )}

          {message && (
            <p
              className={`rounded-md border p-3 text-sm ${
                message.includes("gagal") || message.includes("tidak")
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-primary/20 bg-primary/5"
              }`}
              role="status"
            >
              {message}
            </p>
          )}
      </GlobalModal>

      <GlobalModal
        isOpen={selectedPhoto !== null}
        onClose={() => setSelectedPhoto(null)}
        title="Foto progres titik pekerjaan"
        description="Bukti progres privat yang diunggah PIC Team Lapangan."
        className="max-w-5xl"
      >
          {selectedPhoto && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={selectedPhoto}
                src={withLocalPhotoPreview(selectedPhoto)}
                alt={`Foto progres titik proyek ${project?.title}`}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <Button asChild variant="outline">
                <a
                  href={selectedPhoto}
                  {...photoDownloadLinkProps(selectedPhoto)}
                >
                  {photoDownloadLabel(selectedPhoto)}
                </a>
              </Button>
            </div>
          )}
      </GlobalModal>
    </>
  );
}
