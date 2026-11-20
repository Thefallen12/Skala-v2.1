"use client";

import * as React from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cloud,
  CloudDrizzle,
  CloudRain,
  HardHat,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  WifiOff,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { addProjectProgress } from "@/app/actions/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getJakartaDateKey } from "@/lib/habit-date";
import { compressFieldImageFiles } from "@/lib/image-compression-client";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import {
  countOfflineDailyReports,
  enqueueOfflineDailyReport,
  flushOfflineDailyReports,
  registerOfflineDailyReportAutoSync,
  type OfflineDailyReportInput,
  type OfflineDailyReportSubmitFn,
} from "@/lib/offline-daily-report-queue";
import {
  formatWorkTypeBadge,
  getDailyReportFocusHints,
  isConsultancyWorkType,
} from "@/lib/project-work-types";
import { parseClientAssetCode, withLocalPhotoPreview } from "@/lib/photo-urls";
import { cn } from "@/lib/utils";
import SendProgressModal from "./SendProgressModal";

export type DailyProgressWorkPoint = {
  id: string;
  title: string;
  location?: string | null;
  progress: number;
  proposedVolume?: string | null;
  proposedUnit?: string | null;
  completedVolume?: number | null;
  progressReports?: Array<{
    id: string;
    reportDate: string;
    progress: number;
    workSummary: string | null;
  }>;
};

export type DailyProgressExistingReport = {
  id: string;
  reportDate: string;
  weather?: string | null;
  workersCount?: number;
  progress?: number | null;
  workSummary?: string | null;
  notes?: string | null;
  k3SafetyLog?: string | null;
  equipment?: unknown;
  photoUrls?: string[];
  progressPhotos?: Array<{
    url: string;
    fileUrl?: string | null;
    assetCode?: string | null;
    projectId?: string | null;
  }>;
};

export type DailyProgressProjectOption = {
  id: string;
  code: string;
  title: string;
  status: string;
  progress: number;
  jenisPekerjaan?: string | null;
  clientName?: string | null;
  fieldPicName?: string | null;
  location?: string | null;
  address?: string | null;
  kelompokTani?: string | null;
  fieldPicId?: string | null;
  workPoints: DailyProgressWorkPoint[];
  reports?: DailyProgressExistingReport[];
};

export interface DailyProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects?: DailyProgressProjectOption[];
  lockedProject?: DailyProgressProjectOption | null;
  initialProjectId?: string | null;
  initialWorkPointId?: string | null;
  initialDate?: string | null;
  currentUserId?: string;
  canIncludeFinancials?: boolean;
  onSuccess?: () => void;
  onQueueChange?: (count: number) => void;
  onOpenSendProgress?: (project: DailyProgressProjectOption) => void;
}

const STEPS = [
  { label: "Proyek & Tanggal" },
  { label: "Item Pekerjaan" },
  { label: "Kondisi & Foto" },
];

/**
 * Nilai `value` mengikuti kontrak Zod di `addProjectProgress` (`Cerah`, `Mendung`,
 * `Hujan Gerimis`, `Hujan Lebat`) dengan label antarmuka yang ringkas.
 */
const WEATHER_OPTIONS = [
  { value: "Cerah", label: "Cerah", icon: Sun },
  { value: "Mendung", label: "Berawan", icon: Cloud },
  { value: "Hujan Gerimis", label: "Hujan Ringan", icon: CloudDrizzle },
  { value: "Hujan Lebat", label: "Hujan Lebat", icon: CloudRain },
] as const;

const NO_WORK_PRESETS = [
  "Hujan Deras",
  "Hari Libur",
  "Kendala Material",
  "Kendala Akses",
] as const;

const K3_PRESETS = [
  "APD lengkap · Kondisi aman",
  "Briefing K3 pagi selesai · Nihil insiden",
] as const;

const PHYSICAL_EQUIPMENT_PRESETS = [
  "Excavator",
  "Molen Beton",
  "Dump Truck",
  "Stamper / Vibro",
  "Genset",
] as const;

const CONSULTANCY_EQUIPMENT_PRESETS = [
  "Total Station",
  "GPS RTK / Drone",
  "Alat Sondir / Bor",
  "Laptop CAD & Survey",
  "Kamera Dokumentasi",
] as const;

const MAX_PHOTOS = 5;

export function isRunningProjectStatus(status: string): boolean {
  return ["RUNNING", "ON_PROGRESS", "ACTIVE"].includes(status);
}

export function formatEquipmentText(equipment: unknown): string {
  if (!equipment) return "";
  if (typeof equipment === "string") return equipment.trim();
  if (Array.isArray(equipment)) {
    return equipment
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "name" in item) {
          const obj = item as { name?: unknown; qty?: unknown };
          const name = typeof obj.name === "string" ? obj.name.trim() : "";
          const qty =
            obj.qty !== undefined && obj.qty !== null
              ? String(obj.qty).trim()
              : "";
          return name ? (qty ? `${name} (${qty})` : name) : "";
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function formatVolumeNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 3,
  }).format(value);
}

function extractSameDayLoggedVolume(
  workPoint: DailyProgressWorkPoint,
  reportDate: string,
): number {
  const sameDay = workPoint.progressReports?.find(
    (report) => report.reportDate === reportDate,
  );
  if (!sameDay?.workSummary) return 0;
  const match = sameDay.workSummary.match(/Volume hari ini:\s*\+?(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function computeWorkPointCapacity(
  workPoint: DailyProgressWorkPoint,
  reportDate: string,
  isConsultancy = false,
) {
  const rawTarget = Number(workPoint.proposedVolume ?? 0);
  const target = rawTarget > 0 ? rawTarget : isConsultancy ? 100 : 0;
  const completed =
    workPoint.completedVolume ?? (target * (workPoint.progress ?? 0)) / 100;
  const sameDayLogged = extractSameDayLoggedVolume(workPoint, reportDate);
  const completedBeforeDate = Math.max(0, completed - sameDayLogged);
  const maxAllowed =
    target > 0
      ? Math.max(0, Math.round((target - completedBeforeDate) * 1000) / 1000)
      : 0;

  return {
    target,
    completed: Math.max(0, Math.round(completed * 1000) / 1000),
    maxAllowed,
    unit: workPoint.proposedUnit || (isConsultancy ? "%" : "unit"),
  };
}

function isOfflineOrConnectionErrorMessage(message?: string): boolean {
  if (!message) return false;
  return /koneksi|database|terputus|offline|network|timeout|fetch|econn|gagal terhubung/i.test(
    message,
  );
}

export const submitOfflineDailyReportAction: OfflineDailyReportSubmitFn = async (
  record,
  formData,
) => {
  try {
    const result = await addProjectProgress(record.projectId, formData);
    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error && error.message
          ? error.message
          : "Koneksi gagal saat mengirim antrean.",
    };
  }
};

type AttachedPhotoItem = {
  id: string;
  file: File;
  previewUrl: string;
};

function PhotoThumbnailItem({
  photo,
  index,
  disabled,
  onRemove,
}: {
  photo: AttachedPhotoItem;
  index: number;
  disabled: boolean;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.previewUrl}
        alt={`Lampiran foto ${index + 1}`}
        className="size-full object-cover"
      />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        disabled={disabled}
        aria-label={`Hapus foto ${index + 1}`}
        onClick={() => onRemove(index)}
        className="absolute right-1 top-1 size-7 rounded-full shadow-sm"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
      <span className="type-p3 absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 tabular-nums text-white">
        {Math.max(1, Math.round(photo.file.size / 1024))} KB
      </span>
    </div>
  );
}

export default function DailyProgressModal(props: DailyProgressModalProps) {
  const [fallbackSendProject, setFallbackSendProject] =
    React.useState<DailyProgressProjectOption | null>(null);

  return (
    <>
      {props.open && (
        <DailyProgressModalInner
          {...props}
          onRequestSendProgress={(project) => {
            if (props.onOpenSendProgress) {
              props.onOpenSendProgress(project);
            } else {
              setFallbackSendProject(project);
            }
          }}
        />
      )}
      {!props.onOpenSendProgress && (
        <SendProgressModal
          open={fallbackSendProject !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setFallbackSendProject(null);
          }}
          lockedProject={fallbackSendProject}
          canIncludeFinancials={props.canIncludeFinancials}
          onSuccess={() => props.onSuccess?.()}
        />
      )}
    </>
  );
}

function DailyProgressModalInner({
  open,
  onOpenChange,
  projects = [],
  lockedProject = null,
  initialProjectId = null,
  initialWorkPointId = null,
  initialDate = null,
  currentUserId,
  onSuccess,
  onQueueChange,
  onRequestSendProgress,
}: DailyProgressModalProps & {
  onRequestSendProgress: (project: DailyProgressProjectOption) => void;
}) {
  const [todayKey] = React.useState(() => getJakartaDateKey());
  const runningProjects = React.useMemo(() => {
    const source = lockedProject ? [lockedProject] : projects;
    return source.filter((project) => isRunningProjectStatus(project.status));
  }, [lockedProject, projects]);

  const initialProjId = React.useMemo(() => {
    if (lockedProject?.id) return lockedProject.id;
    if (
      initialProjectId &&
      runningProjects.some((project) => project.id === initialProjectId)
    ) {
      return initialProjectId;
    }
    return runningProjects.length === 1 ? runningProjects[0].id : "";
  }, [lockedProject, initialProjectId, runningProjects]);

  const initialTargetProject = React.useMemo(
    () =>
      lockedProject ??
      runningProjects.find((project) => project.id === initialProjId) ??
      null,
    [lockedProject, runningProjects, initialProjId],
  );

  const defaultReportDate = initialDate && initialDate <= todayKey ? initialDate : todayKey;
  const initialSameDayReport = React.useMemo(() => {
    if (!initialTargetProject?.reports || !defaultReportDate) return null;
    return (
      initialTargetProject.reports.find(
        (report) => report.reportDate === defaultReportDate,
      ) ?? null
    );
  }, [initialTargetProject, defaultReportDate]);

  const [step, setStep] = React.useState(0);
  const [selectedProjectId, setSelectedProjectId] =
    React.useState<string>(initialProjId);
  const [reportDate, setReportDate] = React.useState<string>(defaultReportDate);

  // Step 2 states
  const [isNonWork, setIsNonWork] = React.useState(false);
  const [noWorkReason, setNoWorkReason] = React.useState("Hujan Deras");
  const [selectedVolumes, setSelectedVolumes] = React.useState<
    Record<string, string>
  >(() => {
    if (
      initialWorkPointId &&
      initialTargetProject?.workPoints.some((wp) => wp.id === initialWorkPointId)
    ) {
      const wp = initialTargetProject.workPoints.find(
        (item) => item.id === initialWorkPointId,
      );
      const isCons = isConsultancyWorkType(initialTargetProject.jenisPekerjaan);
      const cap = wp
        ? computeWorkPointCapacity(wp, defaultReportDate, isCons)
        : null;
      const defaultVol =
        cap && cap.maxAllowed > 0 ? String(Math.min(1, cap.maxAllowed)) : "";
      return defaultVol ? { [initialWorkPointId]: defaultVol } : {};
    }
    return {};
  });
  const [cumulativeProgress, setCumulativeProgress] = React.useState<string>(
    () => (initialTargetProject ? String(initialTargetProject.progress ?? 0) : "0"),
  );

  // Step 3 states (auto-prefilled from existingSameDayReport)
  const [weather, setWeather] = React.useState<string>(
    () => initialSameDayReport?.weather || "Cerah",
  );
  const [workersCount, setWorkersCount] = React.useState<string>(() =>
    initialSameDayReport?.workersCount !== undefined
      ? String(initialSameDayReport.workersCount)
      : "1",
  );
  const [equipment, setEquipment] = React.useState<string>(() =>
    formatEquipmentText(initialSameDayReport?.equipment),
  );
  const [workSummary, setWorkSummary] = React.useState<string>(
    () => initialSameDayReport?.workSummary ?? "",
  );
  const [issueNotes, setIssueNotes] = React.useState<string>("");
  const [k3SafetyLog, setK3SafetyLog] = React.useState<string>(
    () => initialSameDayReport?.k3SafetyLog ?? "",
  );
  const [photos, setPhotos] = React.useState<AttachedPhotoItem[]>([]);
  const photosRef = React.useRef<AttachedPhotoItem[]>([]);
  const [isCompressingPhotos, setIsCompressingPhotos] = React.useState(false);

  // Submission & offline queue states
  const [submittingMode, setSubmittingMode] = React.useState<
    "save" | "save-and-send" | null
  >(null);
  const isSubmitting = submittingMode !== null;
  const [isFlushingQueue, setIsFlushingQueue] = React.useState(false);
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [isOnline, setIsOnline] = React.useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  const [stepError, setStepError] = React.useState("");

  const activeProject = React.useMemo(() => {
    if (lockedProject) return lockedProject;
    return (
      runningProjects.find((project) => project.id === selectedProjectId) ?? null
    );
  }, [lockedProject, runningProjects, selectedProjectId]);

  const isConsultancyProject = React.useMemo(
    () => isConsultancyWorkType(activeProject?.jenisPekerjaan),
    [activeProject?.jenisPekerjaan],
  );
  const workTypeBadge = React.useMemo(
    () =>
      activeProject
        ? formatWorkTypeBadge(activeProject.jenisPekerjaan)
        : null,
    [activeProject],
  );
  const focusHints = React.useMemo(
    () =>
      activeProject
        ? getDailyReportFocusHints(activeProject.jenisPekerjaan)
        : null,
    [activeProject],
  );

  const existingSameDayReport = React.useMemo(() => {
    if (!activeProject?.reports || !reportDate) return null;
    return (
      activeProject.reports.find((report) => report.reportDate === reportDate) ??
      null
    );
  }, [activeProject, reportDate]);

  // Auto-prefill Step 3 fields whenever activeProject or reportDate changes
  const prefillKey = `${activeProject?.id ?? ""}|${reportDate}|${existingSameDayReport?.id ?? ""}`;
  const [prevPrefillKey, setPrevPrefillKey] = React.useState(prefillKey);
  if (prefillKey !== prevPrefillKey) {
    setPrevPrefillKey(prefillKey);
    if (existingSameDayReport) {
      setWeather(existingSameDayReport.weather || "Cerah");
      setWorkersCount(
        String(
          existingSameDayReport.workersCount ??
            (isConsultancyProject ? 0 : 1),
        ),
      );
      setEquipment(formatEquipmentText(existingSameDayReport.equipment));
      setWorkSummary(existingSameDayReport.workSummary ?? "");
      setK3SafetyLog(existingSameDayReport.k3SafetyLog ?? "");
    } else {
      setWeather("Cerah");
      setWorkersCount(isConsultancyProject ? "1" : "1");
      setEquipment("");
      setWorkSummary("");
      setK3SafetyLog("");
    }
    setIssueNotes("");
  }

  const refreshQueueCount = React.useCallback(async () => {
    const count = await countOfflineDailyReports(
      currentUserId !== undefined ? { userId: currentUserId } : undefined,
    );
    setQueuedCount(count);
    onQueueChange?.(count);
  }, [currentUserId, onQueueChange]);

  const clearSelectedPhotos = React.useCallback(() => {
    for (const item of photosRef.current) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setPhotos([]);
  }, []);

  // Clear attached photos whenever selected project or reportDate changes
  const photoScopeKey = `${activeProject?.id ?? ""}|${reportDate}`;
  const prevPhotoScopeRef = React.useRef(photoScopeKey);
  React.useEffect(() => {
    if (prevPhotoScopeRef.current !== photoScopeKey) {
      prevPhotoScopeRef.current = photoScopeKey;
      clearSelectedPhotos();
    }
  }, [photoScopeKey, clearSelectedPhotos]);

  // Revoke any remaining preview object URLs on unmount
  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  React.useEffect(() => {
    return () => {
      for (const item of photosRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  // Network, initial queue count, & auto-sync registration
  React.useEffect(() => {
    let cancelled = false;
    void countOfflineDailyReports(
      currentUserId !== undefined ? { userId: currentUserId } : undefined,
    ).then((count) => {
      if (!cancelled) {
        setQueuedCount(count);
        onQueueChange?.(count);
      }
    });

    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unregisterSync = registerOfflineDailyReportAutoSync(
      submitOfflineDailyReportAction,
      {
        ...(currentUserId !== undefined ? { userId: currentUserId } : {}),
        onSynced: (result) => {
          void refreshQueueCount();
          if (result.syncedCount > 0) {
            toast.success(
              `${result.syncedCount} laporan dari antrean berhasil dikirim.`,
            );
            requestNotificationFeedRefresh();
            onSuccess?.();
          }
        },
      },
    );

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unregisterSync();
    };
  }, [currentUserId, onQueueChange, onSuccess, refreshQueueCount]);

  const projectOptions = React.useMemo<ComboboxOption[]>(
    () =>
      runningProjects.map((project) => {
        const wt = formatWorkTypeBadge(project.jenisPekerjaan);
        return {
          value: project.id,
          label: project.title,
          description: `${project.code} · ${wt.shortLabel}${project.location || project.address ? ` · ${project.location || project.address}` : ""} · ${project.progress.toFixed(0)}%`,
          keywords: [
            project.code,
            wt.label,
            project.kelompokTani ?? "",
            project.location ?? "",
          ],
        };
      }),
    [runningProjects],
  );

  const existingPhotosTodayCount = existingSameDayReport?.photoUrls?.length ?? 0;
  const maxAddablePhotos = Math.max(0, MAX_PHOTOS - existingPhotosTodayCount);

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedVolumes({});
    clearSelectedPhotos();
    setStepError("");
    const proj = runningProjects.find((item) => item.id === projectId);
    setCumulativeProgress(proj ? String(proj.progress ?? 0) : "0");
  };

  const handleToggleNonWork = (checked: boolean) => {
    setIsNonWork(checked);
    setStepError("");
    if (checked) {
      setWorkersCount("0");
      if (!noWorkReason.trim()) {
        setNoWorkReason("Hujan Deras");
      }
    } else if (workersCount === "0") {
      setWorkersCount("1");
    }
  };

  const handleToggleWorkPoint = (
    workPoint: DailyProgressWorkPoint,
    checked: boolean,
  ) => {
    setStepError("");
    setSelectedVolumes((prev) => {
      const next = { ...prev };
      if (!checked) {
        delete next[workPoint.id];
      } else {
        const cap = computeWorkPointCapacity(
          workPoint,
          reportDate,
          isConsultancyProject,
        );
        const suggested =
          cap.maxAllowed > 0 ? Math.min(1, cap.maxAllowed) : 0;
        next[workPoint.id] = suggested > 0 ? String(suggested) : "";
      }
      return next;
    });
  };

  const handleVolumeStep = (
    workPoint: DailyProgressWorkPoint,
    delta: number,
  ) => {
    const cap = computeWorkPointCapacity(
      workPoint,
      reportDate,
      isConsultancyProject,
    );
    if (cap.maxAllowed <= 0) return;

    const currentRaw = selectedVolumes[workPoint.id] ?? "";
    const current = Number.parseFloat(currentRaw);
    const base = Number.isFinite(current) ? current : 0;
    const stepSize = cap.maxAllowed < 2 ? 0.5 : 1;
    const nextValue = Math.max(
      0,
      Math.min(
        cap.maxAllowed,
        Math.round((base + delta * stepSize) * 1000) / 1000,
      ),
    );
    setSelectedVolumes((prev) => ({
      ...prev,
      [workPoint.id]: nextValue > 0 ? String(nextValue) : "",
    }));
    setStepError("");
  };

  const handleAddPhotos = async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;
    if (photos.length >= maxAddablePhotos) {
      toast.error(
        existingPhotosTodayCount > 0
          ? `Laporan tanggal ini sudah memiliki ${existingPhotosTodayCount} foto (maksimal ${MAX_PHOTOS}).`
          : `Maksimal ${MAX_PHOTOS} foto per laporan.`,
      );
      return;
    }

    const slotsLeft = Math.max(0, maxAddablePhotos - photos.length);
    const slice = incomingFiles.slice(0, slotsLeft);
    if (incomingFiles.length > slotsLeft) {
      toast.warning(`Hanya ${slotsLeft} foto tambahan yang dapat dimuat.`);
    }

    setIsCompressingPhotos(true);
    try {
      const compressed = await compressFieldImageFiles(slice);
      const nextItems: AttachedPhotoItem[] = compressed.map((file, idx) => ({
        id: `${file.name}-${file.lastModified}-${file.size}-${idx}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setPhotos((prev) => {
        const merged = [...prev, ...nextItems];
        const kept = merged.slice(0, maxAddablePhotos);
        for (const extra of merged.slice(maxAddablePhotos)) {
          URL.revokeObjectURL(extra.previewUrl);
        }
        return kept;
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memproses foto lapangan.",
      );
    } finally {
      setIsCompressingPhotos(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const validateStep = (targetStep: number): boolean => {
    setStepError("");
    if (targetStep === 0) {
      if (!activeProject) {
        setStepError("Pilih proyek yang sedang berjalan terlebih dahulu.");
        return false;
      }
      if (!isRunningProjectStatus(activeProject.status)) {
        setStepError(
          "Laporan harian hanya dapat diisi untuk proyek berstatus Berjalan.",
        );
        return false;
      }
      if (!reportDate) {
        setStepError("Pilih tanggal laporan terlebih dahulu.");
        return false;
      }
      return true;
    }

    if (targetStep === 1 && activeProject) {
      if (isNonWork) {
        if (!noWorkReason.trim()) {
          setStepError("Cantumkan alasan tidak ada pekerjaan fisik.");
          return false;
        }
        return true;
      }

      if (activeProject.workPoints.length > 0) {
        const selectedIds = Object.keys(selectedVolumes);
        // For CONSULTANCY projects (DED, Pengawas, MK, Survey), allow proceeding with
        // 0 checked items so they can still submit a daily supervision/design log.
        if (selectedIds.length === 0) {
          if (isConsultancyProject) {
            return true;
          }
          setStepError(
            "Centang minimal 1 item pekerjaan atau aktifkan mode Libur / Hujan.",
          );
          return false;
        }

        for (const wpId of selectedIds) {
          const wp = activeProject.workPoints.find((item) => item.id === wpId);
          if (!wp) continue;
          const vol = Number.parseFloat(selectedVolumes[wpId] ?? "");
          const cap = computeWorkPointCapacity(
            wp,
            reportDate,
            isConsultancyProject,
          );
          if (!Number.isFinite(vol) || vol <= 0) {
            setStepError(
              `Isi volume harian lebih dari 0 untuk "${wp.title}".`,
            );
            return false;
          }
          if (cap.target <= 0) {
            setStepError(
              `Item "${wp.title}" belum memiliki target volume RAB yang valid.`,
            );
            return false;
          }
          if (vol > cap.maxAllowed + 0.000001) {
            setStepError(
              `Volume "${wp.title}" melebihi sisa target (${formatVolumeNumber(cap.maxAllowed)} ${cap.unit}).`,
            );
            return false;
          }
        }
        return true;
      }

      // Project without work points: validate cumulative progress (optional for consultancy)
      if (isConsultancyProject && cumulativeProgress.trim() === "") {
        return true;
      }
      const parsedProg = Number.parseFloat(cumulativeProgress);
      if (
        !Number.isFinite(parsedProg) ||
        parsedProg < activeProject.progress ||
        parsedProg > 100
      ) {
        setStepError(
          `Progres kumulatif harus antara ${activeProject.progress}% hingga 100%.`,
        );
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(2, prev + 1));
  };

  const handleStepClick = (targetIndex: number) => {
    if (targetIndex < step) {
      setStepError("");
      setStep(targetIndex);
      return;
    }
    if (targetIndex === step) return;
    for (let i = step; i < targetIndex; i += 1) {
      if (!validateStep(i)) return;
    }
    setStep(targetIndex);
  };

  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    try {
      const result = await flushOfflineDailyReports(
        submitOfflineDailyReportAction,
        currentUserId !== undefined ? { userId: currentUserId } : undefined,
      );
      await refreshQueueCount();
      if (result.skippedOffline) {
        toast.warning("Perangkat masih offline. Coba lagi saat sinyal kembali.");
      } else if (result.syncedCount > 0) {
        toast.success(
          `${result.syncedCount} laporan antrean berhasil dikirim ke server.`,
        );
        requestNotificationFeedRefresh();
        onSuccess?.();
      } else if (result.failedCount > 0) {
        const firstErr = result.results.find((r) => !r.success)?.message;
        toast.error(firstErr || "Sebagian antrean belum berhasil dikirim.");
      }
    } finally {
      setIsFlushingQueue(false);
    }
  };

  const appendEquipmentPreset = (preset: string) => {
    setEquipment((prev) => {
      const parts = prev
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.some((p) => p.toLowerCase() === preset.toLowerCase())) {
        return prev;
      }
      return [...parts, preset].join(", ");
    });
  };

  const handleSubmit = async (sendAfterSave = false) => {
    if (!activeProject || isCompressingPhotos || isSubmitting) return;
    if (!validateStep(0) || !validateStep(1)) return;

    const parsedWorkers = Number.parseInt(workersCount, 10);
    if (!Number.isFinite(parsedWorkers) || parsedWorkers < 0) {
      setStepError("Jumlah pekerja / personel tidak valid.");
      return;
    }

    const hasWorkEntries =
      !isNonWork &&
      activeProject.workPoints.length > 0 &&
      Object.keys(selectedVolumes).length > 0;

    if (
      !isConsultancyProject &&
      !isNonWork &&
      (hasWorkEntries || Number(cumulativeProgress) > 0) &&
      parsedWorkers < 1
    ) {
      setStepError("Minimal 1 pekerja hadir pada hari kerja.");
      return;
    }

    if (
      !isNonWork &&
      !hasWorkEntries &&
      !workSummary.trim()
    ) {
      setStepError("Ringkasan pekerjaan / aktivitas harian wajib diisi.");
      return;
    }

    setStepError("");
    setSubmittingMode(sendAfterSave ? "save-and-send" : "save");

    const entries = hasWorkEntries
      ? Object.entries(selectedVolumes).map(([workPointId, raw]) => ({
          workPointId,
          dailyVolume: Number.parseFloat(raw),
        }))
      : [];

    const equipmentItems = equipment
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const clientRequestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `odr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const parsedCumulative = Number.parseFloat(cumulativeProgress);
    const shouldIncludeCumulativeProgress =
      !isNonWork &&
      !hasWorkEntries &&
      Number.isFinite(parsedCumulative) &&
      (activeProject.workPoints.length === 0 ||
        parsedCumulative > activeProject.progress);

    const offlineInput: OfflineDailyReportInput = {
      userId: currentUserId,
      clientRequestId,
      projectId: activeProject.id,
      reportDate,
      weather,
      workersCount: parsedWorkers,
      workSummary: workSummary.trim(),
      entries: entries.length > 0 ? entries : undefined,
      equipment: equipmentItems.length > 0 ? equipmentItems : undefined,
      progress: shouldIncludeCumulativeProgress ? parsedCumulative : undefined,
      issueNotes: issueNotes.trim() || undefined,
      k3SafetyLog: k3SafetyLog.trim() || undefined,
      noWorkReason: isNonWork ? noWorkReason.trim() : undefined,
      photos: photos.map((item) => item.file),
    };

    const formData = new FormData();
    formData.set("clientRequestId", clientRequestId);
    formData.set("reportDate", reportDate);
    formData.set("weather", weather);
    formData.set("workersCount", String(parsedWorkers));
    formData.set("workSummary", workSummary.trim());
    if (equipmentItems.length > 0) {
      formData.set("equipment", JSON.stringify(equipmentItems));
    }

    if (entries.length > 0) {
      formData.set("entries", JSON.stringify(entries));
    } else if (shouldIncludeCumulativeProgress) {
      formData.set("progress", String(parsedCumulative));
    }

    if (issueNotes.trim()) {
      formData.set("issueNotes", issueNotes.trim());
    }
    if (k3SafetyLog.trim()) {
      formData.set("k3SafetyLog", k3SafetyLog.trim());
    }
    if (isNonWork && noWorkReason.trim()) {
      formData.set("noWorkReason", noWorkReason.trim());
    }
    for (const photo of photos) {
      formData.append("photos", photo.file);
    }

    const saveToOfflineQueue = async () => {
      await enqueueOfflineDailyReport(offlineInput);
      await refreshQueueCount();
      toast.warning(
        "Tersimpan di antrean perangkat. Akan dikirim otomatis saat sinyal stabil.",
      );
      onOpenChange(false);
    };

    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await saveToOfflineQueue();
        return;
      }

      const result = await addProjectProgress(activeProject.id, formData);
      if (result.success) {
        toast.success(result.message || "Laporan progres harian tersimpan.");
        requestNotificationFeedRefresh();
        onSuccess?.();
        const projectSnapshot = activeProject;
        onOpenChange(false);
        if (sendAfterSave) {
          onRequestSendProgress(projectSnapshot);
        }
        return;
      }

      if (isOfflineOrConnectionErrorMessage(result.message)) {
        await saveToOfflineQueue();
        return;
      }

      setStepError(result.message);
      toast.error(result.message);
    } catch {
      await saveToOfflineQueue();
    } finally {
      setSubmittingMode(null);
    }
  };

  const equipmentPresets = isConsultancyProject
    ? CONSULTANCY_EQUIPMENT_PRESETS
    : PHYSICAL_EQUIPMENT_PRESETS;

  const handleGuardedOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (isCompressingPhotos || isSubmitting)) {
      toast.info("Tunggu proses kompresi atau pengiriman foto selesai.");
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => handleGuardedOpenChange(false)}
      onOpenChange={handleGuardedOpenChange}
      mobileBehavior="sheet"
      icon={<Camera className="size-4" aria-hidden="true" />}
      title="Laporan Progres Harian"
      description="Catat volume pekerjaan, cuaca, pekerja, peralatan, kendala, K3, dan foto lapangan."
      className="max-w-2xl"
      footerNote="Data progres langsung memperbarui realisasi titik kerja dan Kurva S."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting || isCompressingPhotos}
            onClick={() => {
              if (step === 0) {
                onOpenChange(false);
              } else {
                setStepError("");
                setStep((prev) => Math.max(0, prev - 1));
              }
            }}
          >
            {step === 0 ? "Batal" : "Kembali"}
          </Button>

          {step < 2 ? (
            <Button
              type="button"
              size="sm"
              disabled={runningProjects.length === 0 || isCompressingPhotos}
              onClick={handleNext}
            >
              Lanjut
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting || isCompressingPhotos || !activeProject}
                onClick={() => void handleSubmit(true)}
                className="gap-1.5"
              >
                {submittingMode === "save-and-send" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" aria-hidden="true" />
                    <span>Simpan &amp; Kirim</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting || isCompressingPhotos || !activeProject}
                onClick={() => void handleSubmit(false)}
              >
                {submittingMode === "save" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan Laporan"
                )}
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Offline / Outbox Sync Banner */}
        {(queuedCount > 0 || !isOnline) && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-center gap-2.5">
              <WifiOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="type-p2 font-semibold text-foreground">
                  {queuedCount > 0
                    ? `Menunggu Sinyal (${queuedCount} laporan)`
                    : "Mode Offline Aktif"}
                </p>
                <p className="type-p3 text-muted-foreground">
                  {queuedCount > 0
                    ? "Laporan di antrean akan dikirim otomatis saat koneksi kembali stabil."
                    : "Laporan yang dikirim sekarang akan masuk ke antrean perangkat."}
                </p>
              </div>
            </div>
            {queuedCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isFlushingQueue || !isOnline}
                onClick={() => void handleFlushQueue()}
                className="shrink-0"
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    isFlushingQueue && "animate-spin",
                  )}
                  aria-hidden="true"
                />
                Kirim Antrean Sekarang
              </Button>
            )}
          </div>
        )}

        {/* Stepper Header */}
        <Stepper
          steps={STEPS}
          currentStep={step}
          onStepClick={handleStepClick}
          className="rounded-xl border border-border bg-muted/30 p-3"
        />

        {stepError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"
          >
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="type-p3 font-medium text-destructive">{stepError}</p>
          </div>
        )}

        {/* STEP 1: Proyek & Tanggal */}
        {step === 0 && (
          <div className="space-y-4">
            {lockedProject ? (
              isRunningProjectStatus(lockedProject.status) ? (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <span className="type-p3 font-medium text-muted-foreground">
                        Proyek Terpilih
                      </span>
                      <h3 className="type-h3 text-foreground">
                        {lockedProject.title}
                      </h3>
                      <p className="type-p3 text-muted-foreground">
                        {lockedProject.code}
                        {lockedProject.location || lockedProject.address
                          ? ` · ${lockedProject.location || lockedProject.address}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {workTypeBadge && (
                        <Badge variant="outline">
                          {workTypeBadge.shortLabel}
                        </Badge>
                      )}
                      <Badge variant="outline" className="tabular-nums">
                        Progres {lockedProject.progress.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={HardHat}
                  title="Proyek Belum Berjalan"
                  description={
                    isConsultancyProject
                      ? "Laporan harian aktif setelah PIC lapangan ditunjuk dan minimal 1 deliverable atau jadwal proyek tersedia."
                      : "Laporan harian aktif setelah PIC lapangan ditunjuk dan minimal 1 titik kerja disetujui Direktur."
                  }
                />
              )
            ) : runningProjects.length === 0 ? (
              <EmptyState
                icon={HardHat}
                title="Belum Ada Proyek Berjalan"
                description="Laporan progres harian tersedia setelah ada proyek berstatus Berjalan."
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="daily-progress-project" className="type-p2 font-medium">
                  Pilih Proyek <span className="text-destructive">*</span>
                </Label>
                <Combobox
                  id="daily-progress-project"
                  options={projectOptions}
                  value={selectedProjectId}
                  onValueChange={handleProjectSelect}
                  placeholder="Pilih proyek berjalan..."
                  searchPlaceholder="Cari nama atau kode proyek..."
                  emptyText="Tidak ada proyek berjalan yang cocok."
                />
              </div>
            )}

            {activeProject && focusHints && isRunningProjectStatus(activeProject.status) && (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                  <span className="type-p3 font-semibold text-foreground">
                    Panduan Laporan ({focusHints.categoryLabel})
                  </span>
                  {focusHints.isConsultancy && (
                    <Badge variant="secondary" className="text-[10px]">
                      Mode Konsultansi
                    </Badge>
                  )}
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  {focusHints.focusHints.slice(0, 2).map((hint, idx) => (
                    <li key={idx}>• {hint}</li>
                  ))}
                </ul>
              </div>
            )}

            {(!lockedProject || isRunningProjectStatus(lockedProject.status)) &&
              runningProjects.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="daily-progress-date" className="type-p2 font-medium">
                    Tanggal Laporan (WIB) <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker
                    id="daily-progress-date"
                    value={reportDate}
                    onValueChange={(dateKey) => {
                      if (dateKey) {
                        setReportDate(dateKey);
                        setStepError("");
                      }
                    }}
                    maxDate={todayKey}
                  />
                  {existingSameDayReport && (
                    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <p className="type-p3 text-foreground">
                        Sudah ada laporan pada tanggal ini (
                        {existingSameDayReport.workersCount ?? 0} pekerja ·{" "}
                        {existingPhotosTodayCount} foto). Cuaca, jumlah pekerja,
                        peralatan, K3, dan ringkasan telah diisi otomatis untuk
                        diperbarui.
                      </p>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}

        {/* STEP 2: Item Pekerjaan */}
        {step === 1 && activeProject && (
          <div className="space-y-4">
            {/* Non-Work Day Toggle */}
            <div className="rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="non-work-toggle"
                    className="type-p2 font-semibold text-foreground"
                  >
                    Tidak ada aktivitas lapangan / libur
                  </Label>
                  <p className="type-p3 text-muted-foreground">
                    Aktifkan jika hari libur, hujan deras, atau kendala lapangan.
                  </p>
                </div>
                <Switch
                  id="non-work-toggle"
                  checked={isNonWork}
                  onCheckedChange={handleToggleNonWork}
                />
              </div>

              {isNonWork && (
                <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {NO_WORK_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={
                          noWorkReason.trim() === preset ? "default" : "outline"
                        }
                        onClick={() => {
                          setNoWorkReason(preset);
                          setStepError("");
                        }}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                  <Input
                    value={noWorkReason}
                    onChange={(event) => {
                      setNoWorkReason(event.target.value);
                      setStepError("");
                    }}
                    placeholder="Tulis alasan non-kerja (maks. 200 karakter)"
                    maxLength={200}
                  />
                </div>
              )}
            </div>

            {!isNonWork && (
              <>
                {activeProject.workPoints.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="type-p2 font-semibold text-foreground">
                        {isConsultancyProject
                          ? `Deliverable / Checklist (${Object.keys(selectedVolumes).length} dipilih)`
                          : `Checklist Titik Pekerjaan (${Object.keys(selectedVolumes).length} dipilih)`}
                      </p>
                      <span className="type-p3 text-muted-foreground">
                        {isConsultancyProject
                          ? "Opsional: pilih deliverable bila progres berubah hari ini"
                          : "Pilih item yang dikerjakan hari ini"}
                      </span>
                    </div>

                    <div className="max-h-[42dvh] space-y-2.5 overflow-y-auto pr-1">
                      {activeProject.workPoints.map((wp) => {
                        const isChecked = Object.prototype.hasOwnProperty.call(
                          selectedVolumes,
                          wp.id,
                        );
                        const cap = computeWorkPointCapacity(
                          wp,
                          reportDate,
                          isConsultancyProject,
                        );
                        const rawVol = selectedVolumes[wp.id] ?? "";
                        const parsedVol = Number.parseFloat(rawVol);
                        const validVol =
                          Number.isFinite(parsedVol) && parsedVol > 0
                            ? parsedVol
                            : 0;
                        const liveRemaining = Math.max(
                          0,
                          Math.round((cap.maxAllowed - validVol) * 1000) / 1000,
                        );
                        const isOverLimit = validVol > cap.maxAllowed + 0.000001;
                        const isDisabledItem =
                          cap.target <= 0 || cap.maxAllowed <= 0;

                        return (
                          <div
                            key={wp.id}
                            className={cn(
                              "rounded-xl border p-3.5 transition-colors",
                              isChecked
                                ? "border-primary bg-primary/5"
                                : "border-border bg-card",
                              isDisabledItem && "opacity-70",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                                <Checkbox
                                  checked={isChecked}
                                  disabled={isDisabledItem}
                                  onCheckedChange={(checked) =>
                                    handleToggleWorkPoint(wp, checked === true)
                                  }
                                  className="mt-0.5 size-5"
                                />
                                <div className="min-w-0 space-y-0.5">
                                  <p className="type-p2 font-semibold text-foreground">
                                    {wp.title}
                                  </p>
                                  <p className="type-p3 text-muted-foreground">
                                    {wp.location || "Lokasi belum dicatat"}
                                    {cap.target > 0
                                      ? ` · Terpasang ${formatVolumeNumber(cap.completed)} / ${formatVolumeNumber(cap.target)} ${cap.unit}`
                                      : ""}
                                  </p>
                                </div>
                              </label>

                              <Badge
                                variant={
                                  isOverLimit
                                    ? "destructive"
                                    : cap.maxAllowed <= 0
                                      ? "secondary"
                                      : "outline"
                                }
                                className="shrink-0 tabular-nums"
                              >
                                {cap.target <= 0
                                  ? "Tanpa Target"
                                  : cap.maxAllowed <= 0
                                    ? "Selesai 100%"
                                    : `Sisa ${formatVolumeNumber(liveRemaining)} ${cap.unit}`}
                              </Badge>
                            </div>

                            {isChecked && !isDisabledItem && (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                                <span className="type-p3 font-medium text-muted-foreground">
                                  Capaian hari ini ({cap.unit})
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-label={`Kurangi volume ${wp.title}`}
                                    onClick={() => handleVolumeStep(wp, -1)}
                                  >
                                    <Minus className="size-4" aria-hidden="true" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min="0.001"
                                    max={cap.maxAllowed}
                                    step="any"
                                    value={rawVol}
                                    onChange={(event) => {
                                      setStepError("");
                                      setSelectedVolumes((prev) => ({
                                        ...prev,
                                        [wp.id]: event.target.value,
                                      }));
                                    }}
                                    aria-label={`Volume harian ${wp.title}`}
                                    className="w-24 text-right tabular-nums"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-label={`Tambah volume ${wp.title}`}
                                    onClick={() => handleVolumeStep(wp, 1)}
                                  >
                                    <Plus className="size-4" aria-hidden="true" />
                                  </Button>
                                </div>
                                {isOverLimit && (
                                  <p className="type-p3 w-full font-medium text-destructive">
                                    Volume melebihi sisa target (maks.{" "}
                                    {formatVolumeNumber(cap.maxAllowed)}{" "}
                                    {cap.unit}).
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                    <Label
                      htmlFor="daily-cumulative-progress"
                      className="type-p2 font-semibold"
                    >
                      Progres Kumulatif Proyek (%)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Kurangi progres"
                        onClick={() => {
                          const curr = Number.parseFloat(cumulativeProgress) || 0;
                          const next = Math.max(activeProject.progress, curr - 1);
                          setCumulativeProgress(String(next));
                        }}
                      >
                        <Minus className="size-4" aria-hidden="true" />
                      </Button>
                      <Input
                        id="daily-cumulative-progress"
                        type="number"
                        min={activeProject.progress}
                        max={100}
                        step="0.1"
                        value={cumulativeProgress}
                        onChange={(event) => {
                          setCumulativeProgress(event.target.value);
                          setStepError("");
                        }}
                        className="text-right tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Tambah progres"
                        onClick={() => {
                          const curr = Number.parseFloat(cumulativeProgress) || 0;
                          const next = Math.min(100, curr + 1);
                          setCumulativeProgress(String(next));
                        }}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <p className="type-p3 text-muted-foreground">
                      Minimal sama dengan progres saat ini (
                      {activeProject.progress}%).
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 3: Kondisi & Foto */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Cuaca Chips */}
            <div className="space-y-2">
              <Label className="type-p2 font-semibold">Kondisi Cuaca</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEATHER_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = weather === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      onClick={() => setWeather(opt.value)}
                      aria-pressed={active}
                      className="min-h-11 justify-start gap-2 px-3"
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{opt.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Workers Count & Equipment */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daily-workers-count" className="type-p2 font-semibold">
                  {isConsultancyProject
                    ? "Personel / Tenaga Hadir"
                    : "Jumlah Pekerja Hadir"}
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Kurangi pekerja"
                    onClick={() => {
                      const curr = Number.parseInt(workersCount, 10) || 0;
                      const minVal = isNonWork || isConsultancyProject ? 0 : 1;
                      setWorkersCount(String(Math.max(minVal, curr - 1)));
                    }}
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <Input
                    id="daily-workers-count"
                    type="number"
                    min={isNonWork || isConsultancyProject ? 0 : 1}
                    max={100000}
                    value={workersCount}
                    onChange={(event) => {
                      setWorkersCount(event.target.value);
                      setStepError("");
                    }}
                    className="w-24 text-center tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Tambah pekerja"
                    onClick={() => {
                      const curr = Number.parseInt(workersCount, 10) || 0;
                      setWorkersCount(String(curr + 1));
                    }}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                  <span className="type-p3 text-muted-foreground">orang</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="daily-equipment"
                  className="type-p2 flex items-center gap-1.5 font-semibold"
                >
                  <Wrench className="size-3.5 text-primary" aria-hidden="true" />
                  <span>Peralatan / Alat Berat / Perangkat Survei</span>
                </Label>
                <Input
                  id="daily-equipment"
                  value={equipment}
                  maxLength={500}
                  onChange={(event) => setEquipment(event.target.value)}
                  placeholder={
                    isConsultancyProject
                      ? "Total Station, GPS RTK, Alat Sondir..."
                      : "Excavator, Molen, Dump Truck..."
                  }
                />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {equipmentPresets.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendEquipmentPreset(preset)}
                      className="h-6 px-2 text-[11px]"
                    >
                      + {preset}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Work Summary */}
            <div className="space-y-1.5">
              <Label htmlFor="daily-work-summary" className="type-p2 font-semibold">
                {isConsultancyProject
                  ? "Uraian Aktivitas / Hasil Pengawasan / Desain"
                  : "Uraian Pekerjaan"}{" "}
                {!isNonWork && Object.keys(selectedVolumes).length === 0 ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="font-normal text-muted-foreground">
                    (opsional)
                  </span>
                )}
              </Label>
              <Textarea
                id="daily-work-summary"
                rows={2}
                maxLength={2000}
                value={workSummary}
                onChange={(event) => setWorkSummary(event.target.value)}
                placeholder={
                  isConsultancyProject
                    ? "Contoh: Asistensi gambar DED struktur pondasi, verifikasi mutu besi & slump cor lapangan."
                    : "Contoh: Pemasangan batu kali saluran sekunder segmen 2."
                }
              />
            </div>

            {/* Issue Notes & K3 Log */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="daily-issue-notes" className="type-p2 font-semibold">
                  Kendala / Hambatan
                </Label>
                <Textarea
                  id="daily-issue-notes"
                  rows={2}
                  maxLength={2000}
                  value={issueNotes}
                  onChange={(event) => setIssueNotes(event.target.value)}
                  placeholder="Material terlambat, akses jalan becek, revisi desain, dll."
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="daily-k3-log"
                  className="type-p2 flex items-center gap-1.5 font-semibold"
                >
                  <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                  Catatan K3
                </Label>
                <Textarea
                  id="daily-k3-log"
                  rows={2}
                  maxLength={2000}
                  value={k3SafetyLog}
                  onChange={(event) => setK3SafetyLog(event.target.value)}
                  placeholder="APD lengkap, nihil kecelakaan kerja."
                />
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {K3_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setK3SafetyLog(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Photo Dropzone + Thumbnails */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="type-p2 font-semibold">
                  Foto Lapangan ({photos.length}/{maxAddablePhotos})
                </Label>
                {isCompressingPhotos && (
                  <span className="type-p3 inline-flex items-center gap-1.5 text-primary">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    Mengompresi foto...
                  </span>
                )}
              </div>

              <FileDropzone
                accept="image/*,.heic,.heif"
                capture="environment"
                multiple
                maxFiles={maxAddablePhotos}
                files={[]}
                disabled={
                  isSubmitting ||
                  isCompressingPhotos ||
                  photos.length >= maxAddablePhotos
                }
                onFilesChange={(incoming) => void handleAddPhotos(incoming)}
                onError={(msg) => toast.error(msg)}
                label="Ambil atau Pilih Foto Lapangan"
                hint={`Maks. ${maxAddablePhotos} foto tambahan (otomatis dikompresi agar hemat kuota).`}
              />

              {((existingSameDayReport?.progressPhotos?.length ?? 0) > 0 ||
                (existingSameDayReport?.photoUrls?.length ?? 0) > 0) && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
                  <p className="type-p3 font-medium text-muted-foreground">
                    Foto tersimpan hari ini ({existingPhotosTodayCount}/{MAX_PHOTOS})
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {(existingSameDayReport?.progressPhotos &&
                    existingSameDayReport.progressPhotos.length > 0
                      ? existingSameDayReport.progressPhotos.map((p) => ({
                          url: p.fileUrl ?? p.url,
                          assetCode:
                            p.assetCode ??
                            parseClientAssetCode(p.fileUrl ?? p.url)?.assetCode ??
                            null,
                        }))
                      : (existingSameDayReport?.photoUrls ?? []).map((url) => ({
                          url,
                          assetCode: parseClientAssetCode(url)?.assetCode ?? null,
                        }))
                    ).map((item, idx) => (
                      <div
                        key={`${item.url}-${idx}`}
                        className="relative aspect-square overflow-hidden rounded-lg border border-border bg-background"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={withLocalPhotoPreview(item.url)}
                          alt={`Foto tersimpan ${idx + 1}`}
                          className="size-full object-cover"
                        />
                        {item.assetCode && (
                          <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                            {item.assetCode}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {photos.map((photo, index) => (
                    <PhotoThumbnailItem
                      key={`${photo.id}-${index}`}
                      photo={photo}
                      index={index}
                      disabled={isSubmitting}
                      onRemove={handleRemovePhoto}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </GlobalModal>
  );
}
