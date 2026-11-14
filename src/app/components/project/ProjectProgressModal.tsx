"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addProjectProgress } from "@/app/actions/project";
import type { ProjectDashboardRow } from "@/app/(DashboardLayout)/types/project";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressFieldImageFiles } from "@/lib/image-compression-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function todayAsDateInput(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export default function ProjectProgressModal({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDashboardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [progress, setProgress] = useState(String(project?.progress ?? 0));
  const [reportDate, setReportDate] = useState(todayAsDateInput);
  const [weather, setWeather] = useState("Cerah");
  const [workersCount, setWorkersCount] = useState("0");
  const [workSummary, setWorkSummary] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [prevModalKey, setPrevModalKey] = useState("");
  const modalKey = open ? (project?.id ?? "open") : "";

  if (modalKey !== prevModalKey) {
    setPrevModalKey(modalKey);
    if (photos.length > 0) setPhotos([]);
    if (photoPreviews.length > 0) setPhotoPreviews([]);
    if (errorMessage) setErrorMessage("");
  }

  useEffect(
    () => () => photoPreviews.forEach((url) => URL.revokeObjectURL(url)),
    [photoPreviews],
  );

  const handleClose = () => {
    setPhotos([]);
    setPhotoPreviews([]);
    setErrorMessage("");
    onOpenChange(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;
    setErrorMessage("");
    if (photos.length > 5) {
      setErrorMessage("Pilih maksimal 5 foto untuk satu laporan.");
      return;
    }

    startTransition(async () => {
      try {
        const compressedPhotos =
          photos.length > 0 ? await compressFieldImageFiles(photos) : [];
        const formData = new FormData();
        formData.set("progress", progress);
        formData.set("reportDate", reportDate);
        formData.set("weather", weather);
        formData.set("workersCount", workersCount);
        formData.set("workSummary", workSummary);
        compressedPhotos.forEach((photo) => formData.append("photos", photo));

        const result = await addProjectProgress(project.id, formData);
        if (!result.success) {
          setErrorMessage(result.message);
          return;
        }
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Project progress submission failed:", error);
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "Progres proyek gagal diperbarui. Silakan coba kembali.",
        );
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={handleClose}
      title="Tambah Progres Proyek"
      description={`${project?.title ?? "Proyek"}. Progres yang disimpan menjadi nilai terkini proyek dan catatan harian pada tanggal yang dipilih.`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={handleClose}
          >
            Batal
          </Button>
          <Button type="submit" form="project-progress-form" disabled={isPending || !project}>
            {isPending ? "Menyimpan..." : "Simpan progres"}
          </Button>
        </>
      }
    >
        <form id="project-progress-form" className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="project-report-date">Tanggal laporan</Label>
            <Input
              id="project-report-date"
              type="date"
              required
              value={reportDate}
              disabled={isPending}
              onChange={(event) => setReportDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-progress-value">Progres kumulatif (%)</Label>
            <Input
              id="project-progress-value"
              type="number"
              max="100"
              step="0.1"
              required
              value={progress}
              min={project?.progress ?? 0}
              disabled={isPending}
              onChange={(event) => setProgress(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Progres sebelumnya: {project?.progress ?? 0}%. Masukkan progres
              kumulatif terbaru; nilai tidak dapat dikurangi.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-report-weather">Cuaca</Label>
              <Select value={weather} onValueChange={setWeather}>
                <SelectTrigger id="project-report-weather" disabled={isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cerah">Cerah</SelectItem>
                  <SelectItem value="Hujan Gerimis">Hujan gerimis</SelectItem>
                  <SelectItem value="Hujan Lebat">Hujan lebat</SelectItem>
                  <SelectItem value="Mendung">Mendung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-report-workers">Jumlah pekerja hadir</Label>
              <Input
                id="project-report-workers"
                type="number"
                min="0"
                max="100000"
                required
                value={workersCount}
                disabled={isPending}
                onChange={(event) => setWorkersCount(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-progress-summary">Catatan pekerjaan</Label>
            <Textarea
              id="project-progress-summary"
              maxLength={2000}
              rows={4}
              placeholder="Ringkasan pekerjaan yang dilakukan..."
              value={workSummary}
              disabled={isPending}
              onChange={(event) => setWorkSummary(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-progress-photos">
              Foto dokumentasi (opsional)
            </Label>
            <Input
              id="project-progress-photos"
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              disabled={isPending}
              onChange={(event) => {
                const selected = Array.from(event.currentTarget.files ?? []);
                if (selected.length > 5) {
                  setErrorMessage("Pilih maksimal 5 foto untuk satu laporan.");
                  event.currentTarget.value = "";
                  setPhotos([]);
                  setPhotoPreviews([]);
                  return;
                }
                setErrorMessage("");
                setPhotos(selected);
                setPhotoPreviews(
                  selected.map((photo) => URL.createObjectURL(photo)),
                );
              }}
            />
            <p className="text-xs text-muted-foreground">
              Maksimal 5 foto. Foto kamera berukuran besar otomatis dikompresi
              di perangkat sebelum diunggah.
            </p>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {photos.map((photo, index) => (
                  <div
                    key={`${photo.name}-${photo.lastModified}-${index}`}
                    className="w-24 space-y-1"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreviews[index]}
                      alt={`Pratinjau ${photo.name}`}
                      className="h-20 w-24 rounded-md border object-cover"
                    />
                    <p className="truncate text-xs text-muted-foreground">
                      {photo.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMessage && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

        </form>
    </GlobalModal>
  );
}
