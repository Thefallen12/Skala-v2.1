"use client";
import { FormLabel } from "@/components/ui/label"

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  Pencil,
  Plus,
  Printer,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  FieldSurveySummary,
  SurveyProjectOption,
} from "@/app/components/apps/gis/SurveySidebar";
import { printUrlInFrame } from "@/lib/print-url";
import { compressFieldImageFile } from "@/lib/image-compression-client";

const ReadOnlyMap = dynamic(() => import("@/components/gis/ReadOnlyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-[12px] border border-slate-700 bg-[#0d1a2d] text-[12px] text-slate-300">
      Memuat peta...
    </div>
  ),
});

function formatStatus(status?: string | null) {
  const normalized = (status ?? "").toUpperCase();
  return ["RUNNING", "ACTIVE", "ON_PROGRESS", "PENDING"].includes(normalized)
    ? "Aktif"
    : "Tidak Aktif";
}

function getSurveyProjectId(survey: FieldSurveySummary | null) {
  return survey?.projectCode ?? survey?.projectId ?? "—";
}

function getPhotoUrls(survey: FieldSurveySummary | null) {
  if (!survey) return [] as string[];

  const explicitPhotos = survey.documentationUrls ?? [];
  if (explicitPhotos.length > 0) return explicitPhotos.slice(0, 5);

  const featurePhotos =
    survey.features?.flatMap((feature) => feature.photoUrls ?? []) ?? [];
  return featurePhotos.filter(Boolean).slice(0, 5);
}

function getPhotoEntries(survey: FieldSurveySummary | null) {
  const savedPhotoEntries = survey?.photos?.filter((photo) => photo.url).map((photo, index) => ({
    url: photo.url,
    label: photo.caption?.trim() || `Foto ${index + 1}`,
  })) ?? [];

  if (savedPhotoEntries.length > 0) {
    return savedPhotoEntries.slice(0, 5);
  }

  const urls = getPhotoUrls(survey);
  return urls.map((url, index) => ({
    url,
    label: `Foto ${index + 1}`,
  }));
}

export default function SurveyDetailModal({
  open,
  survey,
  project,
  onClose,
  onEditData,
  onAddInformation,
  onAddPhoto: _onAddPhoto,
  savePhotoToDatabase,
}: {
  open: boolean;
  survey: FieldSurveySummary | null;
  project?: SurveyProjectOption | null;
  onClose: () => void;
  onEditData?: () => void;
  onAddInformation?: () => void;
  onAddPhoto?: () => void;
  savePhotoToDatabase?: (
    surveyId: string,
    photos: Array<{ url?: string; file?: File; label: string }>,
  ) => Promise<{
    success: boolean;
    message: string;
    photos?: Array<{ url: string; label: string }>;
  }>;
}) {
  const projectCode = useMemo(
    () => project?.code ?? survey?.projectCode ?? getSurveyProjectId(survey),
    [project, survey],
  );

  const statusText = project ? formatStatus(project.status) : "Aktif";
  const badgeText =
    statusText === "Aktif" ? "Aktif / Active" : "Tidak Aktif / Inactive";
  const subtitle = project?.title ?? survey?.projectName ?? "Nama Proyek";

  const buildPhotoSlots = (items: { url: string; label: string }[]) =>
    Array.from({ length: 5 }, (_, index) => {
      const existing = items[index];
      return existing ?? { url: "", label: `Foto ${index + 1}` };
    });

  const [photos, setPhotos] = useState<
    { url: string; label: string; file?: File }[]
  >(() =>
    buildPhotoSlots(getPhotoEntries(survey)),
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [printMessage, setPrintMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showPhotoNameDialog, setShowPhotoNameDialog] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{
    index: number;
    url: string;
    file: File;
  } | null>(null);
  const [photoNameDraft, setPhotoNameDraft] = useState("");
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const localPhotoUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const localPhotoUrls = localPhotoUrlsRef.current;
    return () => {
      localPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
      localPhotoUrls.clear();
    };
  }, []);

  const PhotoSlotCard = ({
    index,
    photo,
    onSelectPhoto,
    onRemove,
    onLabelChange,
  }: {
    index: number;
    photo: { url: string; label: string };
    onSelectPhoto: (slotIndex: number) => void;
    onRemove: (slotIndex: number) => void;
    onLabelChange: (slotIndex: number, value: string) => void;
  }) => {
    const hasImage = Boolean(photo.url);

    return (
      <div className="min-w-0">
        {hasImage ? (
          <div className="relative overflow-hidden rounded-[12px] border border-slate-700 bg-[#0f1b2d] shadow-sm">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[12px]">
              <Image
                src={photo.url}
                alt={photo.label}
                fill
                unoptimized
                className="h-full w-full object-cover object-center"
                style={{ objectPosition: "center" }}
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <button
                type="button"
                aria-label={`Hapus ${photo.label}`}
                onClick={() => onRemove(index)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-950/80 text-slate-200 shadow-sm transition hover:bg-slate-700 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={(element) => {
                fileInputRefs.current[index] = element;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                event.preventDefault();
                handleLocalPhotoUpload(index, event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectPhoto(index);
              }}
              className="group flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-slate-600 bg-slate-900/20 transition-colors hover:border-orange-500 hover:bg-slate-800/40"
            >
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-700/70 text-slate-200 transition-colors group-hover:bg-orange-500/20 group-hover:text-orange-500">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-slate-400 transition-colors group-hover:text-orange-500">
                Tambah Foto
              </span>
            </button>
          </>
        )}

        <div className="mt-2 text-center">
          <input
            value={photo.label}
            onChange={(event) => onLabelChange(index, event.target.value)}
            placeholder="Nama foto"
            aria-label={`Nama foto ${index + 1}`}
            className="w-full border-none bg-transparent text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
    );
  };

  const resetPhotosFromSurvey = () => {
    localPhotoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPhotoUrlsRef.current.clear();
    if (pendingPhoto?.url.startsWith("blob:")) {
      URL.revokeObjectURL(pendingPhoto.url);
    }
    setPhotos(buildPhotoSlots(getPhotoEntries(survey)));
    setPendingPhoto(null);
    setHasUnsavedChanges(false);
    setSaveError("");
  };

  const getDefaultPhotoLabel = (index: number) => `Foto ${index + 1}`;

  const sanitizePhotoLabel = (index: number, value: string) => {
    const trimmed = value.trim();
    return trimmed || getDefaultPhotoLabel(index);
  };

  const updateLabel = (index: number, newLabel: string) => {
    setPhotos((previous) => {
      const next = [...previous];
      next[index] = { ...next[index], label: sanitizePhotoLabel(index, newLabel) };
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const triggerPhotoInput = (index: number) => {
    const target = fileInputRefs.current[index];
    if (!target) return;
    target.click();
  };

  const handleLocalPhotoUpload = (index: number, file: File | null) => {
    if (!file) return;

    const nextUrl = URL.createObjectURL(file);
    localPhotoUrlsRef.current.add(nextUrl);
    setPendingPhoto({ index, url: nextUrl, file });
    setPhotoNameDraft("");
    setShowPhotoNameDialog(true);
  };

  const confirmPendingPhoto = () => {
    if (!pendingPhoto) return;

    const finalLabel = sanitizePhotoLabel(pendingPhoto.index, photoNameDraft);
    setPhotos((previous) => {
      const next = [...previous];
      const existingUrl = next[pendingPhoto.index]?.url;
      if (existingUrl?.startsWith("blob:") && existingUrl !== pendingPhoto.url) {
        URL.revokeObjectURL(existingUrl);
        localPhotoUrlsRef.current.delete(existingUrl);
      }
      next[pendingPhoto.index] = {
        url: pendingPhoto.url,
        label: finalLabel,
        file: pendingPhoto.file,
      };
      return next;
    });

    setHasUnsavedChanges(true);
    setPendingPhoto(null);
    setPhotoNameDraft("");
    setShowPhotoNameDialog(false);
  };

  const cancelPendingPhoto = () => {
    if (pendingPhoto?.url.startsWith("blob:")) {
      URL.revokeObjectURL(pendingPhoto.url);
      localPhotoUrlsRef.current.delete(pendingPhoto.url);
    }
    setPendingPhoto(null);
    setPhotoNameDraft("");
    setShowPhotoNameDialog(false);
  };

  const removePhoto = (index: number) => {
    setPhotos((previous) => {
      const next = [...previous];
      const currentUrl = next[index]?.url;
      if (currentUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrl);
        localPhotoUrlsRef.current.delete(currentUrl);
      }
      next[index] = { url: "", label: `Foto ${index + 1}` };
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges) {
      setShowWarning(true);
      return;
    }
    setShowWarning(false);
    onClose();
  };

  const handleSaveData = async () => {
    setSaveError("");
    setIsSaving(true);
    try {
      if (!survey?.id || !savePhotoToDatabase) {
        throw new Error("Survei atau aksi penyimpanan foto tidak tersedia.");
      }

      const selectedPhotos = await Promise.all(
        photos
          .filter((photo) => photo.url)
          .map(async (photo, index) => ({
            ...(photo.file
              ? { file: await compressFieldImageFile(photo.file) }
              : { url: photo.url }),
            label: sanitizePhotoLabel(index, photo.label),
          })),
      );
      const result = await savePhotoToDatabase(survey.id, selectedPhotos);
      if (!result.success) throw new Error(result.message);

      const savedPhotos = result.photos ?? [];
      localPhotoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localPhotoUrlsRef.current.clear();
      setPhotos(buildPhotoSlots(savedPhotos));

      setShowWarning(false);
      setHasUnsavedChanges(false);
      onClose();
    } catch (error) {
      console.error("Failed to persist survey photo uploads:", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Foto survei gagal disimpan. Silakan coba kembali.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openReport = () => {
    if (!survey?.id) return;
    window.open(
      `/apps/projects/map/report/${encodeURIComponent(survey.id)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const printReport = async () => {
    if (!survey?.id) return;
    setPrintMessage("");
    try {
      await printUrlInFrame(
        `/apps/projects/map/report/${encodeURIComponent(survey.id)}`,
      );
    } catch (error) {
      console.error("Survey report print failed:", error);
      setPrintMessage("Laporan survei gagal disiapkan untuk dicetak.");
    }
  };

  return (
    <>
      <GlobalModal
        isOpen={open}
        onClose={handleCloseAttempt}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            resetPhotosFromSurvey();
            return;
          }
          handleCloseAttempt();
        }}
        title=""
        hideHeader
        className="z-[2100] max-w-[1180px] overflow-hidden rounded-[18px] border border-slate-700 bg-[#0f172a] p-0 shadow-[0_24px_80px_rgba(15,23,42,0.85)]"
        overlayClassName="z-[2099] bg-slate-950/75"
        bodyClassName="bg-[#0f172a] p-0"
        footerNote="* Pastikan data yang dimasukkan telah sesuai."
        footer={
          <>
            <Button
              type="button"
              className="h-10 bg-orange-500 text-[11px] font-semibold text-white hover:bg-orange-600"
              onClick={openReport}
            >
              <FileText className="mr-1.5 size-3.5" />
              Tampilkan PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-slate-700 bg-slate-900/80 text-[11px] font-semibold text-slate-100 hover:bg-slate-800"
              onClick={openReport}
            >
              <Download className="mr-1.5 size-3.5" />
              Unduh PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-slate-700 bg-slate-900/80 text-[11px] font-semibold text-slate-100 hover:bg-slate-800"
              onClick={printReport}
            >
              <Printer className="mr-1.5 size-3.5" />
              Cetak / Print
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-slate-700 bg-slate-900/80 text-[11px] font-semibold text-slate-100 hover:bg-slate-800"
              onClick={handleCloseAttempt}
            >
              Tutup
            </Button>
            {printMessage && (
              <p className="w-full text-xs text-red-400" role="alert">
                {printMessage}
              </p>
            )}
          </>
        }
      >
        <div className="bg-[#0f172a]">
          <div className="border-b border-slate-700 bg-[#101d2f] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
                  <FileText className="size-5" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[14px] font-black uppercase tracking-[0.14em] text-white md:text-[18px]">
                      DETAIL & REKAP SURVEI PROYEK: {projectCode}
                    </h2>
                    <Badge className="border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                      {badgeText}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800"
                        onClick={onEditData}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Edit Data & Keterangan</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  type="button"
                  className="h-9 bg-orange-500 px-4 text-[11px] font-semibold text-white hover:bg-orange-600"
                  onClick={onAddInformation}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Tambah Informasi / Add Data
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[14px] border border-slate-700 bg-[#101d2f] p-3">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-700 pb-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                    <Layers3 className="size-3.5 text-orange-300" />
                    Data Spasial & Peta Polygon
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-slate-100 hover:bg-slate-800"
                    onClick={onAddInformation}
                  >
                    + Tambah Titik/Koordinat
                  </button>
                </div>

                <ReadOnlyMap
                  data={survey?.geoJsonData}
                  className="w-full"
                  onAddPoint={onAddInformation}
                />
              </div>

              <div className="rounded-[14px] border border-slate-700 bg-[#101d2f] p-0">
                <div className="border-b border-slate-700 px-4 py-3">
                  <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-300">
                    Informasi Proyek & Hasil Survei
                  </h3>
                </div>

                <div className="space-y-0">
                  {[
                    ["ID Proyek / SPK", survey?.projectCode ?? projectCode ?? "—"],
                    ["Nama Proyek", survey?.projectName ?? subtitle],
                    ["Kategori Objek", survey?.objectCategory ?? "Batas Area Proyek (Polygon)"],
                    ["Lokasi", survey?.locationName ?? "—"],
                    ["Tanggal", survey?.createdAt ? new Date(survey.createdAt).toLocaleDateString("id-ID") : "—"],
                    ["Jenis Vegetasi", survey?.vegetationType ?? "Semak Belukar"],
                    ["Kondisi Topografi", survey?.topography ?? "Datar"],
                    ["Status Kepemilikan Lahan", survey?.landOwnership ?? "Masyarakat"],
                    ["Catatan Lapangan", survey?.notes ?? "Belum ada catatan tambahan."],
                  ].map(([label, value], index, items) => (
                    <div
                      key={`${label}-${index}`}
                      className={`grid grid-cols-[180px_1fr] gap-4 px-4 py-3 text-left ${index < items.length - 1 ? "border-b border-slate-700" : ""}`}
                    >
                      <div className="text-[12px] font-medium text-slate-300">{label}</div>
                      <div className="text-[12px] font-semibold text-white">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 px-4 py-3">
                  <button
                    type="button"
                    className="h-9 rounded-xl border border-dashed border-slate-600 bg-transparent px-3 text-[11px] font-semibold text-slate-200 hover:bg-slate-800/60"
                    onClick={onAddInformation}
                  >
                    + Tambah Informasi Baru / Add Custom Field
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[14px] border border-slate-700 bg-[#101d2f] p-0">
              <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
                <ImageIcon className="size-4 text-orange-300" />
                <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-200">
                  FOTO DOKUMENTASI LAPANGAN (MAKS. 5 FOTO)
                </h3>
              </div>

              <div className="p-4">
                <div className="rounded-[10px] border border-dashed border-slate-700 bg-[#0d1a2d] p-3">
                  <div className="grid grid-cols-5 gap-4">
                    {Array.from({ length: 5 }, (_, index) => {
                      const photo = photos[index] ?? { url: "", label: `Foto ${index + 1}` };

                      return (
                        <PhotoSlotCard
                          key={`photo-slot-${index}`}
                          index={index}
                          photo={photo}
                          onSelectPhoto={triggerPhotoInput}
                          onRemove={removePhoto}
                          onLabelChange={updateLabel}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlobalModal>

      <AlertDialog
        open={showPhotoNameDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            cancelPendingPhoto();
          }
        }}
      >
        <AlertDialogContent className="border-slate-700 bg-slate-900 text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-500">
              Verifikasi Foto Baru
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Berikan nama untuk foto ini sebelum ditambahkan ke galeri.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {pendingPhoto ? (
              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70">
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  <Image
                    src={pendingPhoto.url}
                    alt="Preview foto baru"
                    fill
                    unoptimized
                    className="object-cover object-center"
                    sizes="(max-width: 768px) 100vw, 480px"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <FormLabel className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Nama Foto
              </FormLabel>
              <input
                autoFocus
                value={photoNameDraft}
                onChange={(event) => setPhotoNameDraft(event.target.value)}
                placeholder={`Foto ${pendingPhoto ? pendingPhoto.index + 1 : 1}`}
                className="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-orange-500"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={cancelPendingPhoto}
            >
              Batalkan
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-orange-500 text-white hover:bg-orange-600"
              onClick={confirmPendingPhoto}
            >
              Tambahkan Foto
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent className="border-slate-700 bg-slate-900 text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-500">
              <AlertTriangle className="h-5 w-5" />
              Data Belum Disimpan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Anda memiliki perubahan data atau foto yang belum disimpan ke sistem. Jika Anda membatalkan sekarang, perubahan tersebut akan hilang. Apakah Anda ingin menyimpannya?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {saveError && (
              <p className="w-full text-sm text-red-400" role="alert">
                {saveError}
              </p>
            )}
            <AlertDialogCancel
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={isSaving}
              onClick={() => {
                setSaveError("");
                setShowWarning(false);
              }}
            >
              Kembali ke Form
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={isSaving}
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSaveData}
            >
              {isSaving ? "Menyimpan..." : "Simpan Data"}
            </Button>
            <AlertDialogAction
              disabled={isSaving}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setShowWarning(false);
                setHasUnsavedChanges(false);
                onClose();
              }}
            >
              Batalkan & Buang Perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
