"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Landmark,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Printer,
  RotateCcw,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DINAS_PROJECTS_DATA,
  DINAS_REPORT_METADATA,
  type DinasProjectRecord,
  doesProjectDesaMatch,
  isProjectPoktanCompatible,
  normalizePoktanKey,
} from "@/lib/dinas-report-data";
import {
  doesClientAssetMatchProject,
  parseClientAssetCode,
  photoDownloadHref,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";
import {
  calculatePlannedSCurveProgress,
  toJakartaDateKey,
} from "@/lib/project-progress";
import {
  formatWorkTypeBadge,
  PROJECT_WORK_TYPE_GROUPS,
  resolveProjectWorkType,
  type WorkTypeBadgeTone,
} from "@/lib/project-work-types";
import { cn } from "@/lib/utils";

type ReportViewMode = "portfolio_live" | "dinas_preset";
type DinasTabType = "rekapitulasi" | "rincian_sid" | "database_spk";

export type PhotoStageKey = "0%" | "50%" | "100%" | "Prasasti";
export type PhotoAutoAdaptMode =
  | "smart_chronological"
  | "distribute_all_4"
  | "strict_threshold";

export const PHOTO_STAGE_META: ReadonlyArray<{
  key: PhotoStageKey;
  shortLabel: string;
  fullLabel: string;
  desc: string;
}> = [
  {
    key: "0%",
    shortLabel: "0%",
    fullLabel: "Kondisi Titik Nol (0%)",
    desc: "Kondisi awal / sebelum pekerjaan fisik",
  },
  {
    key: "50%",
    shortLabel: "50%",
    fullLabel: "Kondisi Pelaksanaan (50%)",
    desc: "Sedang dikerjakan di lapangan",
  },
  {
    key: "100%",
    shortLabel: "100%",
    fullLabel: "Kondisi Akhir Selesai (100%)",
    desc: "Fisik selesai penuh 100%",
  },
  {
    key: "Prasasti",
    shortLabel: "Prasasti",
    fullLabel: "Batu Prasasti / BAST",
    desc: "Foto batu prasasti & serah terima",
  },
];

const PHOTO_ADJUSTMENTS_STORAGE_KEY =
  "skala_dinas_sid_photo_adjustments_v2";
const LEGACY_PHOTO_ADJUSTMENTS_STORAGE_KEY =
  "skala_dinas_sid_photo_adjustments_v1";
const PHOTO_AUTO_MODE_STORAGE_KEY = "skala_dinas_sid_photo_auto_mode_v1";
const PHOTO_SETTINGS_EVENT = "skala:dinas-photo-settings-updated";

const EMPTY_ADJUSTMENTS_STORE: PhotoAdjustmentsStore = {};

function notifyPhotoSettingsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PHOTO_SETTINGS_EVENT));
  }
}

function subscribePhotoSettings(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === null ||
      e.key === PHOTO_ADJUSTMENTS_STORAGE_KEY ||
      e.key === PHOTO_AUTO_MODE_STORAGE_KEY
    ) {
      listener();
    }
  };
  const onCustom = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(PHOTO_SETTINGS_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PHOTO_SETTINGS_EVENT, onCustom);
  };
}

function parseAdjustmentsStoreRaw(raw: string | null): PhotoAdjustmentsStore {
  if (!raw) return EMPTY_ADJUSTMENTS_STORE;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY_ADJUSTMENTS_STORE;
    }
    const clean: PhotoAdjustmentsStore = {};
    for (const [key, val] of Object.entries(parsed)) {
      // Only keep v2 namespaced keys (e.g. "<nomorSpk>::<poktanKey>[::projectId]")
      if (!key.includes("::") || !val || typeof val !== "object") continue;
      clean[key] = val as PoktanPhotoAdjustment;
    }
    return clean;
  } catch {
    return EMPTY_ADJUSTMENTS_STORE;
  }
}

function readAdjustmentsStoreFromStorage(): PhotoAdjustmentsStore {
  if (typeof window === "undefined") return EMPTY_ADJUSTMENTS_STORE;
  try {
    return parseAdjustmentsStoreRaw(
      window.localStorage.getItem(PHOTO_ADJUSTMENTS_STORAGE_KEY),
    );
  } catch {
    return EMPTY_ADJUSTMENTS_STORE;
  }
}

function getAdjustmentsRawSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PHOTO_ADJUSTMENTS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function getAdjustmentsRawServerSnapshot(): string {
  return "";
}

function parseAutoModeRaw(raw: string | null): PhotoAutoAdaptMode {
  if (
    raw === "smart_chronological" ||
    raw === "distribute_all_4" ||
    raw === "strict_threshold"
  ) {
    return raw;
  }
  return "smart_chronological";
}

function getAutoModeSnapshot(): PhotoAutoAdaptMode {
  if (typeof window === "undefined") return "smart_chronological";
  try {
    return parseAutoModeRaw(
      window.localStorage.getItem(PHOTO_AUTO_MODE_STORAGE_KEY),
    );
  } catch {
    return "smart_chronological";
  }
}

function getAutoModeServerSnapshot(): PhotoAutoAdaptMode {
  return "smart_chronological";
}

function persistAutoMode(mode: PhotoAutoAdaptMode) {
  try {
    window.localStorage.setItem(PHOTO_AUTO_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
  notifyPhotoSettingsChanged();
}

function persistPhotoAdjustments(next: PhotoAdjustmentsStore) {
  try {
    window.localStorage.setItem(
      PHOTO_ADJUSTMENTS_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // ignore storage errors
  }
  notifyPhotoSettingsChanged();
}

function buildDinasAdjustmentGroupKey(
  record: Pick<DinasProjectRecord, "nomorSpk" | "poktan">,
): string {
  return `${record.nomorSpk.trim()}::${normalizePoktanKey(record.poktan)}`;
}

function buildDinasAdjustmentStorageKey(
  record: Pick<DinasProjectRecord, "nomorSpk" | "poktan">,
  projectId?: string | null,
): string {
  const groupKey = buildDinasAdjustmentGroupKey(record);
  const cleanId = projectId?.trim();
  return cleanId ? `${groupKey}::${cleanId}` : groupKey;
}

export type PhotoVisualSettings = {
  rotation?: number;
  fit?: "cover" | "contain";
};

export type PoktanPhotoAdjustment = {
  groupKey?: string;
  projectId?: string;
  linkedProjectId?: string;
  stageOverrides?: Partial<Record<PhotoStageKey, string[]>>;
  photoStageMap?: Record<string, PhotoStageKey[]>;
  photoWorkItemMap?: Record<string, string>;
  photoVisualMap?: Record<string, PhotoVisualSettings>;
};

export type PhotoAdjustmentsStore = Record<string, PoktanPhotoAdjustment>;

export type DinasProjectProgressSource = {
  id?: string;
  code?: string;
  kelompokTani: string;
  name: string;
  title: string;
  progress: number;
  jenisPekerjaan?: string | null;
  status?: string | null;
  pagu?: string | number | bigint | null;
  realized?: string | number | bigint | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  fieldPicName?: string | null;
  fieldPic?: { name: string } | null;
  location?: string | null;
  address?: string | null;
  clientName?: string | null;
  vendor?: string | null;
  reports?: Array<{
    id?: string;
    reportDate: string | Date;
    progress?: number | null;
    workSummary?: string | null;
    weather?: string | null;
    workersCount?: number | null;
    notes?: string | null;
    workPointId?: string | null;
    photoUrls?: string[];
    progressPhotos?: Array<{
      url?: string | null;
      fileUrl?: string | null;
      publicId?: string | null;
      assetCode?: string | null;
      projectId?: string | null;
    }>;
  }>;
  dailyReports?: Array<{
    id?: string;
    reportDate: string | Date;
    progress?: number | null;
    workSummary?: string | null;
    weather?: string | null;
    workersCount?: number | null;
    notes?: string | null;
    workPointId?: string | null;
    k3SafetyLog?: string | null;
    progressPhotos?: Array<{
      url?: string | null;
      fileUrl?: string | null;
      publicId?: string | null;
      assetCode?: string | null;
      projectId?: string | null;
    }>;
  }>;
  workPoints?: Array<{
    id?: string;
    title?: string;
    proposedVolume?: string | number | bigint | null;
    completedVolume?: string | number | bigint | null;
    proposedUnit?: string | null;
    proposedUnitPrice?: string | number | bigint | null;
    progress?: number;
    progressReports?: Array<{
      id?: string;
      reportDate: string | Date;
      progress?: number | null;
      workSummary?: string | null;
      photoUrls?: string[];
      photos?: Array<{
        url?: string | null;
        fileUrl?: string | null;
        publicId?: string | null;
        assetCode?: string | null;
        projectId?: string | null;
      }>;
    }>;
  }>;
  progressSubmissions?: Array<{
    id: string;
    periodType: string;
    periodLabel: string;
    actualProgress: number;
    plannedProgress: number;
    deviation: number;
    submittedAt: string | Date;
  }>;
};

export type ClassifiedPhotoItem = {
  url: string;
  rawUrl: string;
  photoKey: string;
  assetCode?: string | null;
  publicId?: string | null;
  projectId?: string | null;
  workPointId?: string | null;
  workPointTitle?: string | null;
  reportDate: string;
  reportDateRaw?: string | Date;
  reportTimestamp: number;
  progress: number;
  workSummary?: string;
  weather?: string;
  workersCount?: number;
  notes?: string;
  sourceLabel?: string;
  workItemName?: string;
  rotation?: number;
  fit?: "cover" | "contain";
  stage: PhotoStageKey;
  stageLabel: string;
  poktan: string;
  desa: string;
  kecamatan: string;
};

export type PoktanPhotoClassification = {
  photos0: ClassifiedPhotoItem[];
  photos50: ClassifiedPhotoItem[];
  photos100: ClassifiedPhotoItem[];
  photosPrasasti: ClassifiedPhotoItem[];
  allPhotos: ClassifiedPhotoItem[];
  rawPhotos: ClassifiedPhotoItem[];
  totalPhotosCount: number;
  dailyReportsCount: number;
  latestReportDate: string | null;
  latestProgress: number;
  latestWeeklySubmission: {
    periodLabel: string;
    actualProgress: number;
    submittedAt: string;
  } | null;
  isManuallyAdjusted: boolean;
  filteredForeignPhotosCount: number;
};

export type LightboxState = {
  photo: ClassifiedPhotoItem;
  photoList: ClassifiedPhotoItem[];
  currentIndex: number;
  poktanNo?: number;
};

export type PhotoAssistantTarget = {
  poktanNo: number;
  focusStage?: PhotoStageKey;
  focusPhotoKey?: string;
} | null;

const WORK_TYPE_TONE_CLASSES: Record<WorkTypeBadgeTone, string> = {
  indigo:
    "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  teal: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  slate: "border-border bg-muted/60 text-foreground",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  RUNNING: "Berjalan",
  PENDING_SETUP: "Persiapan",
  HOLD: "Tertahan",
  DONE: "Selesai",
};

function parseAmountSafe(
  value: string | number | bigint | null | undefined,
): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCompactRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function parseDownloadFilename(
  disposition: string | null,
  fallback: string,
): string {
  if (!disposition) return fallback;
  const utfMatch = /filename\*=UTF-8''([^;\s]+)/i.exec(disposition);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const quotedMatch = /filename="?([^";]+)"?/i.exec(disposition);
  return quotedMatch?.[1] || fallback;
}

function resolvePhotoAssetCode(photo: {
  assetCode?: string | null;
  publicId?: string | null;
  fileUrl?: string | null;
  url?: string | null;
}): string | null {
  return (
    photo.assetCode?.trim() ||
    parseClientAssetCode(photo.publicId)?.assetCode ||
    parseClientAssetCode(photo.fileUrl)?.assetCode ||
    parseClientAssetCode(photo.url)?.assetCode ||
    null
  );
}

function isAssetOwnedByGroup(
  asset: {
    assetCode?: string | null;
    url?: string | null;
    publicId?: string | null;
    projectId?: string | null;
  },
  record: Pick<DinasProjectRecord, "poktan" | "poktanAliases" | "nomorSpk">,
  linkedProject?: Pick<
    DinasProjectProgressSource,
    "id" | "code" | "name" | "title" | "kelompokTani"
  >,
): boolean {
  const resolvedAssetCode =
    asset.assetCode?.trim() ||
    parseClientAssetCode(asset.publicId)?.assetCode ||
    parseClientAssetCode(asset.url)?.assetCode ||
    null;

  const candidatePoktanNames = Array.from(
    new Set(
      [
        linkedProject?.kelompokTani,
        record.poktan,
        ...(record.poktanAliases ?? []),
      ].filter((v): v is string => Boolean(v && v.trim())),
    ),
  );

  if (candidatePoktanNames.length === 0) {
    return doesClientAssetMatchProject(
      { ...asset, assetCode: resolvedAssetCode },
      {
        projectId: linkedProject?.id,
        projectName: linkedProject?.name,
        projectTitle: linkedProject?.title,
        projectCode: linkedProject?.code || record.nomorSpk,
      },
    );
  }

  return candidatePoktanNames.some((poktanName) =>
    doesClientAssetMatchProject(
      { ...asset, assetCode: resolvedAssetCode },
      {
        projectId: linkedProject?.id,
        projectName: linkedProject?.name,
        projectTitle: linkedProject?.title,
        poktanName,
        projectCode: linkedProject?.code || record.nomorSpk,
      },
    ),
  );
}

function normalizeSpkCode(code?: string | null): string {
  return (code ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function findAutoLinkedProject(
  record: DinasProjectRecord,
  projects: DinasProjectProgressSource[],
): DinasProjectProgressSource | undefined {
  const compatible = projects.filter((project) =>
    isProjectPoktanCompatible(project, record),
  );
  if (compatible.length === 0) return undefined;

  const targetSpk = normalizeSpkCode(record.nomorSpk);

  // Tier 1: Compatible Poktan + matching Desa (prefer exact SPK code if multiple)
  const desaMatches = compatible.filter((project) =>
    doesProjectDesaMatch(project, record),
  );
  if (desaMatches.length > 0) {
    const exactSpkInDesa = desaMatches.find(
      (project) => targetSpk && normalizeSpkCode(project.code) === targetSpk,
    );
    return exactSpkInDesa ?? desaMatches[0];
  }

  // Tier 2: Compatible Poktan + matching SPK code
  if (targetSpk) {
    const spkMatch = compatible.find(
      (project) => normalizeSpkCode(project.code) === targetSpk,
    );
    if (spkMatch) return spkMatch;
  }

  // Tier 3: Compatible Poktan without conflicting SPK code from another Dinas group
  const otherDinasSpks = new Set(
    DINAS_PROJECTS_DATA.filter((item) => item.no !== record.no).map((item) =>
      normalizeSpkCode(item.nomorSpk),
    ),
  );
  return compatible.find((project) => {
    const projectSpk = normalizeSpkCode(project.code);
    return !projectSpk || !otherDinasSpks.has(projectSpk);
  });
}

function calculateRealizedArea(
  areaHa: number,
  progressPercent: number,
): number {
  return (areaHa * progressPercent) / 100;
}

function formatDateIndo(value?: string | Date | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toTimestampMs(value?: string | Date | null): number {
  if (!value) return 0;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function normalizePhotoKey(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("/api/")) {
      const parsed = new URL(trimmed, "http://localhost");
      parsed.searchParams.delete("preview");
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // ignore malformed URL
  }
  return trimmed;
}

function stageLabelFromKey(stage: PhotoStageKey, progress: number): string {
  if (stage === "Prasasti") return "Batu Prasasti / BAST Fisik";
  if (stage === "0%") return "Kondisi Titik Nol (0%)";
  if (stage === "100%") return "Kondisi Akhir Selesai (100%)";
  return Number.isFinite(progress) && progress > 0 && progress < 100
    ? `Kondisi Pelaksanaan (${progress.toFixed(1)}%)`
    : "Kondisi Pelaksanaan (50%)";
}

function detectStrictStage(
  progress: number,
  workSummary?: string,
  notes?: string,
): PhotoStageKey {
  const combined = `${workSummary || ""} ${notes || ""}`;
  if (/prasasti|batu\s*prasasti|serah\s*terima|\bbast\b/i.test(combined)) {
    return "Prasasti";
  }
  if (
    /\b0\s*%|titik\s*nol|sebelum\s*kerja|awal\s*kegiatan|dokumentasi\s*awal/i.test(
      combined,
    )
  ) {
    return "0%";
  }
  if (
    /\b100\s*%|selesai\s*fisik|finishing|kondisi\s*akhir/i.test(combined)
  ) {
    return "100%";
  }
  if (/\b50\s*%|sedang\s*berjalan|pelaksanaan/i.test(combined)) {
    return "50%";
  }
  if (progress >= 95) return "Prasasti";
  if (progress <= 15) return "0%";
  if (progress > 75) return "100%";
  return "50%";
}

function computeAutoStageMap(
  rawPhotos: ClassifiedPhotoItem[],
  overallProgress: number,
  mode: PhotoAutoAdaptMode,
): Record<string, PhotoStageKey[]> {
  const stageMap: Record<string, PhotoStageKey[]> = {};
  if (rawPhotos.length === 0) return stageMap;

  const sorted = [...rawPhotos].sort(
    (a, b) => a.reportTimestamp - b.reportTimestamp,
  );

  if (mode === "distribute_all_4") {
    const n = sorted.length;
    sorted.forEach((photo, idx) => {
      let stage: PhotoStageKey = "50%";
      if (n === 1) {
        stage = detectStrictStage(
          photo.progress,
          photo.workSummary,
          photo.notes,
        );
      } else if (n === 2) {
        stage = idx === 0 ? "0%" : overallProgress >= 75 ? "100%" : "50%";
      } else if (n === 3) {
        stage = idx === 0 ? "0%" : idx === 1 ? "50%" : "100%";
      } else {
        const stages: PhotoStageKey[] = ["0%", "50%", "100%", "Prasasti"];
        const bucket = Math.min(3, Math.floor((idx * 4) / n));
        stage = stages[bucket];
      }
      stageMap[photo.photoKey] = [stage];
    });
    return stageMap;
  }

  // strict_threshold or smart_chronological
  const initialStages = sorted.map((photo) =>
    detectStrictStage(photo.progress, photo.workSummary, photo.notes),
  );

  if (mode === "smart_chronological" && sorted.length >= 2) {
    const hasStage0 = initialStages.some((s) => s === "0%");
    const hasStage50 = initialStages.some((s) => s === "50%");
    const hasStage100 = initialStages.some((s) => s === "100%");
    const hasPrasasti = initialStages.some((s) => s === "Prasasti");

    // Promote earliest uploaded photo to 0% if none is tagged 0%
    if (!hasStage0) {
      initialStages[0] = "0%";
    }
    // Promote latest uploaded photos when overall project progress is already high
    if (sorted.length >= 3 && overallProgress >= 75 && !hasStage100) {
      initialStages[sorted.length - 1] = "100%";
    }
    if (sorted.length >= 4 && overallProgress >= 95 && !hasPrasasti) {
      initialStages[sorted.length - 1] = "Prasasti";
      if (!hasStage100 && sorted.length >= 3) {
        initialStages[sorted.length - 2] = "100%";
      }
    }
    // Ensure execution photos (50%) exist if progress > 15 and everything landed in 0%
    if (
      overallProgress > 15 &&
      !hasStage50 &&
      sorted.length >= 2 &&
      initialStages[1] === "0%"
    ) {
      initialStages[1] = "50%";
    }
  }

  sorted.forEach((photo, idx) => {
    stageMap[photo.photoKey] = [initialStages[idx]];
  });
  return stageMap;
}

function extractRawDailyReportPhotos(
  record: Pick<
    DinasProjectRecord,
    "poktan" | "poktanAliases" | "desa" | "kecamatan" | "nomorSpk"
  >,
  linkedProject?: DinasProjectProgressSource,
): {
  rawPhotos: ClassifiedPhotoItem[];
  dailyReportsCount: number;
  latestReportDate: string | null;
  latestProgress: number;
  filteredForeignPhotosCount: number;
} {
  const { poktan, desa, kecamatan } = record;
  const byKey = new Map<string, ClassifiedPhotoItem>();
  const reportDateKeys = new Set<string>();
  const latestProgress = linkedProject?.progress ?? 0;
  let latestReportDate: string | null = null;
  let latestTs = 0;
  let filteredForeignPhotosCount = 0;

  const workPointTitleById = new Map<string, string>();
  for (const wp of linkedProject?.workPoints ?? []) {
    if (wp.id && wp.title) {
      workPointTitleById.set(wp.id, wp.title);
    }
  }

  const pushPhoto = (
    rawUrlInput: string | null | undefined,
    meta: {
      reportDate: string | Date;
      progress?: number | null;
      workSummary?: string | null;
      weather?: string | null;
      workersCount?: number | null;
      notes?: string | null;
      sourceLabel?: string;
      workPointId?: string | null;
      workPointTitle?: string | null;
      publicId?: string | null;
      assetCode?: string | null;
      projectId?: string | null;
    },
  ) => {
    if (!rawUrlInput) return;
    const rawUrl = rawUrlInput.trim();
    const photoKey = normalizePhotoKey(rawUrl);
    if (!photoKey) return;

    const resolvedAssetCode = resolvePhotoAssetCode({
      assetCode: meta.assetCode,
      publicId: meta.publicId,
      url: rawUrl,
    });
    const resolvedProjectId = meta.projectId ?? linkedProject?.id ?? null;

    if (
      !isAssetOwnedByGroup(
        {
          assetCode: resolvedAssetCode,
          url: rawUrl,
          publicId: meta.publicId,
          projectId: resolvedProjectId,
        },
        record,
        linkedProject,
      )
    ) {
      filteredForeignPhotosCount += 1;
      return;
    }

    const ts = toTimestampMs(meta.reportDate);
    const reportDateStr = formatDateIndo(meta.reportDate);
    const reportProg =
      typeof meta.progress === "number" && !isNaN(meta.progress)
        ? meta.progress
        : latestProgress;
    const summary = meta.workSummary || "";
    const notes = meta.notes || "";
    const strictStage = detectStrictStage(reportProg, summary, notes);

    const existing = byKey.get(photoKey);
    if (existing) {
      if (!existing.weather && meta.weather) existing.weather = meta.weather;
      if (!existing.workersCount && meta.workersCount) {
        existing.workersCount = meta.workersCount;
      }
      if (!existing.notes && notes) existing.notes = notes;
      if (!existing.workSummary && summary) existing.workSummary = summary;
      if (!existing.assetCode && resolvedAssetCode) {
        existing.assetCode = resolvedAssetCode;
      }
      if (!existing.workPointId && meta.workPointId) {
        existing.workPointId = meta.workPointId;
      }
      if (!existing.workPointTitle && meta.workPointTitle) {
        existing.workPointTitle = meta.workPointTitle;
      }
      return;
    }

    byKey.set(photoKey, {
      url: withLocalPhotoPreview(rawUrl),
      rawUrl,
      photoKey,
      assetCode: resolvedAssetCode,
      publicId: meta.publicId ?? null,
      projectId: resolvedProjectId,
      workPointId: meta.workPointId ?? null,
      workPointTitle: meta.workPointTitle ?? null,
      reportDate: reportDateStr,
      reportDateRaw: meta.reportDate,
      reportTimestamp: ts,
      progress: reportProg,
      workSummary: summary,
      weather: meta.weather || undefined,
      workersCount: meta.workersCount || undefined,
      notes: notes || undefined,
      sourceLabel: meta.sourceLabel || "Lap. Harian",
      stage: strictStage,
      stageLabel: stageLabelFromKey(strictStage, reportProg),
      poktan,
      desa,
      kecamatan,
    });
  };

  const trackDate = (reportDate: string | Date, id?: string) => {
    const ts = toTimestampMs(reportDate);
    if (ts > latestTs) {
      latestTs = ts;
      latestReportDate = formatDateIndo(reportDate);
    }
    const key = toJakartaDateKey(reportDate) || id || String(reportDate);
    if (key) reportDateKeys.add(`dr:${key}`);
  };

  // Source 1: Prisma dailyReports (from /apps/projects/reports/dinas)
  for (const dr of linkedProject?.dailyReports ?? []) {
    trackDate(dr.reportDate, dr.id);
    const wpTitle = dr.workPointId
      ? workPointTitleById.get(dr.workPointId)
      : undefined;
    const sourceLabel = wpTitle
      ? `Lap. Harian (${wpTitle})`
      : "Lap. Harian";
    for (const p of dr.progressPhotos ?? []) {
      pushPhoto(p.fileUrl || p.url, {
        reportDate: dr.reportDate,
        progress: dr.progress,
        workSummary: dr.workSummary,
        weather: dr.weather,
        workersCount: dr.workersCount,
        notes: dr.notes,
        sourceLabel,
        workPointId: dr.workPointId,
        workPointTitle: wpTitle,
        publicId: p.publicId,
        assetCode: p.assetCode,
        projectId: p.projectId,
      });
    }
  }

  // Source 2: Serialized reports (from Master Proyek ProjectWorkstationMaster)
  for (const rep of linkedProject?.reports ?? []) {
    trackDate(rep.reportDate, rep.id);
    const wpTitle = rep.workPointId
      ? workPointTitleById.get(rep.workPointId)
      : undefined;
    const sourceLabel = wpTitle
      ? `Lap. Harian (${wpTitle})`
      : "Lap. Harian";
    for (const url of rep.photoUrls ?? []) {
      pushPhoto(url, {
        reportDate: rep.reportDate,
        progress: rep.progress,
        workSummary: rep.workSummary,
        weather: rep.weather,
        workersCount: rep.workersCount,
        notes: rep.notes,
        sourceLabel,
        workPointId: rep.workPointId,
        workPointTitle: wpTitle,
      });
    }
    for (const p of rep.progressPhotos ?? []) {
      pushPhoto(p.fileUrl || p.url, {
        reportDate: rep.reportDate,
        progress: rep.progress,
        workSummary: rep.workSummary,
        weather: rep.weather,
        workersCount: rep.workersCount,
        notes: rep.notes,
        sourceLabel,
        workPointId: rep.workPointId,
        workPointTitle: wpTitle,
        publicId: p.publicId,
        assetCode: p.assetCode,
        projectId: p.projectId,
      });
    }
  }

  // Source 3: WorkPoint progressReports (both Master & DB routes)
  for (const wp of linkedProject?.workPoints ?? []) {
    for (const pr of wp.progressReports ?? []) {
      const ts = toTimestampMs(pr.reportDate);
      if (ts > latestTs) {
        latestTs = ts;
        latestReportDate = formatDateIndo(pr.reportDate);
      }
      if (reportDateKeys.size === 0) {
        const key = toJakartaDateKey(pr.reportDate) || pr.id;
        if (key) reportDateKeys.add(`wp:${key}`);
      }
      const sourceLabel = wp.title
        ? `Progres Item (${wp.title})`
        : "Progres Item";
      for (const url of pr.photoUrls ?? []) {
        pushPhoto(url, {
          reportDate: pr.reportDate,
          progress: pr.progress,
          workSummary: pr.workSummary,
          sourceLabel,
          workPointId: wp.id,
          workPointTitle: wp.title,
        });
      }
      for (const p of pr.photos ?? []) {
        pushPhoto(p.fileUrl || p.url, {
          reportDate: pr.reportDate,
          progress: pr.progress,
          workSummary: pr.workSummary,
          sourceLabel,
          workPointId: wp.id,
          workPointTitle: wp.title,
          publicId: p.publicId,
          assetCode: p.assetCode,
          projectId: p.projectId,
        });
      }
    }
  }

  const rawPhotos = Array.from(byKey.values()).sort(
    (a, b) => a.reportTimestamp - b.reportTimestamp,
  );

  return {
    rawPhotos,
    dailyReportsCount: reportDateKeys.size,
    latestReportDate,
    latestProgress,
    filteredForeignPhotosCount,
  };
}

function classifyProjectPhotos(
  record: Pick<
    DinasProjectRecord,
    "poktan" | "poktanAliases" | "desa" | "kecamatan" | "nomorSpk"
  >,
  linkedProject?: DinasProjectProgressSource,
  adjustment?: PoktanPhotoAdjustment,
  autoAdaptMode: PhotoAutoAdaptMode = "smart_chronological",
): PoktanPhotoClassification {
  const {
    rawPhotos,
    dailyReportsCount,
    latestReportDate,
    latestProgress,
    filteredForeignPhotosCount,
  } = extractRawDailyReportPhotos(record, linkedProject);

  // Strict provenance isolation: ONLY index photos belonging to this matched project
  const photoByKey = new Map<string, ClassifiedPhotoItem>();
  for (const photo of rawPhotos) {
    photoByKey.set(photo.photoKey, photo);
  }

  const expectedGroupKey = buildDinasAdjustmentGroupKey(record);
  const validAdjustment =
    adjustment &&
    (!adjustment.groupKey || adjustment.groupKey === expectedGroupKey) &&
    (!adjustment.projectId ||
      !linkedProject?.id ||
      adjustment.projectId === linkedProject.id)
      ? adjustment
      : undefined;

  const allSourcePhotos = Array.from(photoByKey.values()).sort(
    (a, b) => a.reportTimestamp - b.reportTimestamp,
  );

  const hasManualMap = Boolean(
    validAdjustment?.photoStageMap &&
      Object.keys(validAdjustment.photoStageMap).some((key) =>
        photoByKey.has(normalizePhotoKey(key)),
      ),
  );
  const hasStageOverrides = Boolean(
    validAdjustment?.stageOverrides &&
      Object.values(validAdjustment.stageOverrides).some((arr) =>
        (arr ?? []).some((url) => photoByKey.has(normalizePhotoKey(url))),
      ),
  );
  const isManuallyAdjusted = hasManualMap || hasStageOverrides;

  const autoStageMap = computeAutoStageMap(
    allSourcePhotos,
    latestProgress,
    autoAdaptMode,
  );

  const photos0: ClassifiedPhotoItem[] = [];
  const photos50: ClassifiedPhotoItem[] = [];
  const photos100: ClassifiedPhotoItem[] = [];
  const photosPrasasti: ClassifiedPhotoItem[] = [];

  const pushToStage = (photo: ClassifiedPhotoItem, stage: PhotoStageKey) => {
    const visual = validAdjustment?.photoVisualMap?.[photo.photoKey];
    const workItemName = validAdjustment?.photoWorkItemMap?.[photo.photoKey];
    const resolved: ClassifiedPhotoItem = {
      ...photo,
      stage,
      stageLabel: stageLabelFromKey(stage, photo.progress),
      workItemName: workItemName || photo.workItemName,
      rotation: visual?.rotation ?? 0,
      fit: visual?.fit ?? "cover",
    };
    if (stage === "0%") photos0.push(resolved);
    else if (stage === "50%") photos50.push(resolved);
    else if (stage === "100%") photos100.push(resolved);
    else photosPrasasti.push(resolved);
  };

  if (hasStageOverrides && validAdjustment?.stageOverrides) {
    const stages: PhotoStageKey[] = ["0%", "50%", "100%", "Prasasti"];
    for (const stage of stages) {
      for (const rawUrl of validAdjustment.stageOverrides[stage] ?? []) {
        const photo = photoByKey.get(normalizePhotoKey(rawUrl));
        if (photo) pushToStage(photo, stage);
      }
    }
  } else {
    for (const photo of allSourcePhotos) {
      const stages = hasManualMap
        ? validAdjustment?.photoStageMap?.[photo.photoKey] ?? []
        : autoStageMap[photo.photoKey] ?? [photo.stage];
      for (const stage of stages) {
        pushToStage(photo, stage);
      }
    }
  }

  const uniqueClassifiedByKey = new Map<string, ClassifiedPhotoItem>();
  for (const item of [...photos0, ...photos50, ...photos100, ...photosPrasasti]) {
    if (!uniqueClassifiedByKey.has(item.photoKey)) {
      uniqueClassifiedByKey.set(item.photoKey, item);
    }
  }
  const allPhotos = Array.from(uniqueClassifiedByKey.values());

  const decoratedRawPhotos = allSourcePhotos.map((photo) => {
    const visual = validAdjustment?.photoVisualMap?.[photo.photoKey];
    const workItemName = validAdjustment?.photoWorkItemMap?.[photo.photoKey];
    const assignedStages = hasManualMap
      ? validAdjustment?.photoStageMap?.[photo.photoKey] ?? []
      : autoStageMap[photo.photoKey] ?? [photo.stage];
    const primaryStage = assignedStages[0] || photo.stage;
    return {
      ...photo,
      stage: primaryStage,
      stageLabel: stageLabelFromKey(primaryStage, photo.progress),
      workItemName: workItemName || photo.workItemName,
      rotation: visual?.rotation ?? 0,
      fit: visual?.fit ?? "cover",
    };
  });

  const submissions = linkedProject?.progressSubmissions || [];
  const latestSub = submissions.length > 0 ? submissions[0] : null;
  const latestWeeklySubmission = latestSub
    ? {
        periodLabel: latestSub.periodLabel,
        actualProgress: latestSub.actualProgress,
        submittedAt: formatDateIndo(latestSub.submittedAt),
      }
    : null;

  return {
    photos0,
    photos50,
    photos100,
    photosPrasasti,
    allPhotos,
    rawPhotos: decoratedRawPhotos,
    totalPhotosCount: allPhotos.length,
    dailyReportsCount,
    latestReportDate,
    latestProgress,
    latestWeeklySubmission,
    isManuallyAdjusted,
    filteredForeignPhotosCount,
  };
}

function normalizeWorkItemPhrase(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^(pekerjaan|peningkatan|rehabilitasi|rehab\.?)\s+/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholeWordToken(text: string, token: string): boolean {
  return new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(text);
}

function getWorkItemStagePhotos(
  stagePhotos: ClassifiedPhotoItem[],
  itemName: string,
  expectedProjectId?: string,
): ClassifiedPhotoItem[] {
  const scopedPhotos = expectedProjectId
    ? stagePhotos.filter(
        (p) => !p.projectId || p.projectId === expectedProjectId,
      )
    : stagePhotos;

  const normalizedItem = itemName.trim().toLowerCase();
  const explicit = scopedPhotos.filter(
    (p) => p.workItemName?.trim().toLowerCase() === normalizedItem,
  );
  if (explicit.length > 0) return explicit;

  const coreItem = normalizeWorkItemPhrase(itemName);
  if (!coreItem || coreItem === "lainnya") return [];

  const coreTokens = coreItem
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        !["pekerjaan", "lainnya", "pas", "pasangan", "batu", "beton"].includes(
          w,
        ),
    );
  if (coreTokens.length === 0) return [];

  return scopedPhotos.filter((p) => {
    if (p.workPointTitle) {
      const normalizedWp = p.workPointTitle.trim().toLowerCase();
      const coreWp = normalizeWorkItemPhrase(p.workPointTitle);
      if (normalizedWp === normalizedItem || coreWp === coreItem) {
        return true;
      }
      return coreTokens.every((tok) => hasWholeWordToken(coreWp, tok));
    }

    const summaryText = (p.workSummary || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!summaryText) return false;
    return coreTokens.every((tok) => hasWholeWordToken(summaryText, tok));
  });
}

function PhotoThumbnailSlot({
  photos,
  stageName,
  stageTitle,
  onOpenLightbox,
  onAdjustEmpty,
  compact = false,
}: {
  photos: ClassifiedPhotoItem[];
  stageName: string;
  stageTitle: string;
  onOpenLightbox: (
    photo: ClassifiedPhotoItem,
    photoList: ClassifiedPhotoItem[],
    currentIndex: number,
  ) => void;
  onAdjustEmpty?: () => void;
  compact?: boolean;
}) {
  const sizeClass = compact
    ? "h-10 min-w-[54px] max-w-[72px]"
    : "h-14 min-w-[62px] max-w-[82px]";

  if (photos.length === 0) {
    if (onAdjustEmpty) {
      return (
        <button
          type="button"
          onClick={onAdjustEmpty}
          title={`Klik untuk menyesuaikan foto ${stageTitle} dari Laporan Harian`}
          className={cn(
            "group mx-auto flex w-full flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/10 p-1 text-center text-muted-foreground transition hover:border-primary/60 hover:bg-primary/5 hover:text-primary",
            sizeClass,
          )}
        >
          <ImageIcon
            className={cn(
              "opacity-35 group-hover:opacity-80",
              compact ? "size-3" : "mb-0.5 size-3.5",
            )}
            aria-hidden="true"
          />
          <span className="text-[9px] font-medium leading-tight group-hover:font-semibold">
            {compact ? "—" : "+ Sesuaikan"}
          </span>
          {!compact && (
            <span className="text-[8px] text-muted-foreground/60 group-hover:text-primary/80">
              {stageName}
            </span>
          )}
        </button>
      );
    }

    return (
      <div
        className={cn(
          "mx-auto flex w-full flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/10 p-1 text-center text-muted-foreground",
          sizeClass,
        )}
      >
        <ImageIcon
          className={cn("opacity-30", compact ? "size-3" : "mb-0.5 size-3.5")}
          aria-hidden="true"
        />
        <span className="text-[10px] font-medium leading-tight">Nihil</span>
        {!compact && (
          <span className="text-[9px] text-muted-foreground/60">
            {stageName}
          </span>
        )}
      </div>
    );
  }

  const firstPhoto = photos[0];
  const count = photos.length;
  const rotation = firstPhoto.rotation ?? 0;
  const fitClass =
    firstPhoto.fit === "contain"
      ? "object-contain bg-black/80"
      : "object-cover";
  const assetCode = resolvePhotoAssetCode(firstPhoto);

  return (
    <button
      type="button"
      onClick={() => onOpenLightbox(firstPhoto, photos, 0)}
      className={cn(
        "group relative mx-auto flex w-full overflow-hidden rounded-md border border-border/80 bg-muted/30 shadow-2xs transition hover:border-primary hover:shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary",
        sizeClass,
      )}
      title={`${assetCode ? `[${assetCode}] ` : ""}${stageTitle} (${firstPhoto.reportDate}) - Klik untuk pratinjau (${count} foto)`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={firstPhoto.url}
        alt={`${stageTitle} - ${firstPhoto.poktan}${assetCode ? ` (${assetCode})` : ""}`}
        style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
        className={cn(
          "h-full w-full transition-transform duration-300 group-hover:scale-105",
          fitClass,
        )}
        loading="lazy"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent opacity-85 transition-opacity group-hover:opacity-95" />
      {assetCode && (
        <span
          className={cn(
            "absolute left-0.5 top-0.5 truncate rounded bg-black/75 px-1 font-mono font-semibold text-amber-200 shadow-2xs",
            compact
              ? "max-w-[calc(100%-16px)] text-[6px] leading-tight"
              : "max-w-[calc(100%-20px)] text-[7px] leading-tight",
          )}
        >
          {assetCode}
        </span>
      )}
      <span className="absolute bottom-0.5 left-1 text-[9px] font-bold tracking-tight text-white drop-shadow-xs">
        {stageName}
      </span>
      {count > 1 && (
        <span className="absolute right-1 top-1 rounded-full bg-primary/95 px-1 py-0.2 text-[8px] font-extrabold text-white shadow-xs">
          +{count - 1}
        </span>
      )}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="size-3.5 text-white drop-shadow-md" />
      </div>
    </button>
  );
}

function A4PhotoCell({
  photos,
  stageName,
  compact = false,
}: {
  photos: ClassifiedPhotoItem[];
  stageName: string;
  compact?: boolean;
}) {
  if (photos.length === 0) {
    return <span className="text-[7px] text-slate-400">—</span>;
  }

  const firstPhoto = photos[0];
  const extraCount = photos.length - 1;
  const rotation = firstPhoto.rotation ?? 0;
  const fitClass =
    firstPhoto.fit === "contain"
      ? "object-contain bg-white"
      : "object-cover";
  const assetCode = resolvePhotoAssetCode(firstPhoto);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={cn(
          "relative mx-auto overflow-hidden border border-slate-400 bg-white",
          compact ? "h-[22px] w-[32px]" : "h-[28px] w-[40px]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={firstPhoto.url}
          alt={`${stageName} - ${firstPhoto.poktan}${assetCode ? ` (${assetCode})` : ""}`}
          style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
          className={cn("h-full w-full", fitClass)}
          loading="eager"
        />
        {extraCount > 0 && (
          <span className="absolute bottom-0 right-0 bg-slate-900/85 px-0.5 text-[6px] font-bold leading-tight text-white">
            +{extraCount}
          </span>
        )}
      </div>
      {assetCode && (
        <span className="block w-full break-all text-center font-mono text-[5.2px] font-bold leading-[1.05] text-slate-800">
          {assetCode}
        </span>
      )}
      {!compact && firstPhoto.reportDate && firstPhoto.reportDate !== "-" && (
        <span className="block max-w-full truncate text-[6px] leading-none text-slate-600 tabular-nums">
          {firstPhoto.reportDate}
        </span>
      )}
    </div>
  );
}

interface A4PortfolioRowData {
  key: string;
  code: string;
  title: string;
  workTypeBadge: {
    shortLabel: string;
    groupShortLabel: string;
  };
  clientLabel: string;
  locationLabel: string;
  fieldPicName: string;
  statusLabel: string;
  actualProgress: number;
  plannedProgress: number | null;
  deviation: number | null;
  reportsCount: number;
  latestReportDate: string | null;
  paguValue: number;
  realizedValue: number;
}

interface A4PortfolioSummaryData {
  count: number;
  avgProgress: number;
  avgPlanned: number | null;
  consultancyCount: number;
  physicalCount: number;
  totalPagu: number;
  totalRealized: number;
  realizationPercent: number;
  totalReports: number;
}

interface A4PoktanRowData {
  no: number;
  kecamatan: string;
  desa: string;
  poktan: string;
  luasLahanHa: number;
  totalBiayaKonstruksi: number;
  biayaDigunakanKonstruksi: number;
  realisasiHaKonstruksi: number;
  progresFisikKonstruksiPercent: number;
  bastTeknisUpkk?: string;
  bastUpkkPpk?: string;
  bastPpkKpa?: string;
  bastKpaPoktan?: string;
  totalBiayaOlahLahan: number;
  biayaDigunakanOlahLahan: number;
  progresFisikOlahLahanPercent: number;
  realisasiHaOlahLahan: number;
  nomorSpk: string;
  tglSpk: string;
  tglMulai: string;
  tglSelesai: string;
  namaBank: string;
  noRekening: string;
  ketuaPoktan: string;
  nikKetua: string;
  jumlahAnggota: number;
  ketuaUpkk: string;
  sp2d1Jumlah: number;
  sp2d1NoTgl: string;
  sp2d2Jumlah: number;
  sp2d2NoTgl?: string;
  pekerjaanListWithBobot: Array<{
    namaPekerjaan: string;
    volume?: number | string | null;
    satuan?: string | null;
    biaya: number;
    bobotPercent: number;
    realisasiBiaya: number;
    realisasiVolumeCalc: number | string | null;
    realisasiSatuan?: string | null;
  }>;
  photoClassification: PoktanPhotoClassification;
  linkedProjectId?: string;
}

interface A4DinasAggregatesData {
  totalLuas: number;
  totalBiayaKonstruksi: number;
  totalBiayaDigunakanKonstruksi: number;
  totalRealisasiHaKonstruksi: number;
  totalBiayaOlahLahan: number;
  totalBiayaDigunakanOlahLahan: number;
  totalSp2d1: number;
  totalSp2d2: number;
  totalPenyaluran: number;
  totalPhotosCount: number;
  poktanWithPhotosCount: number;
  totalDailyReportsCount: number;
  avgProgressPercent: number;
}

function DinasA4CleanDocumentSheet({
  isPreviewVisible,
  reportMode,
  activeTab,
  filteredData,
  aggregates,
  filteredPortfolioRows,
  portfolioSummary,
  canViewFinancials,
  printShowSubItems,
  filterSummaryText,
  printedDateLabel,
}: {
  isPreviewVisible: boolean;
  reportMode: ReportViewMode;
  activeTab: DinasTabType;
  filteredData: A4PoktanRowData[];
  aggregates: A4DinasAggregatesData;
  filteredPortfolioRows: A4PortfolioRowData[];
  portfolioSummary: A4PortfolioSummaryData;
  canViewFinancials: boolean;
  printShowSubItems: boolean;
  filterSummaryText: string;
  printedDateLabel: string;
}) {
  const isPortfolio = reportMode === "portfolio_live";
  const docTitle = isPortfolio
    ? "REKAPITULASI PORTOFOLIO PROYEK & KURVA-S (LIVE DATABASE)"
    : activeTab === "rincian_sid"
      ? "REKAPITULASI HASIL SID, REALISASI FISIK & DOKUMENTASI FOTO LAPANGAN"
      : activeTab === "database_spk"
        ? "DATABASE KONTRAK (SPK), PENGURUS POKTAN/UPKK & PENYALURAN SP2D"
        : "REKAPITULASI REALISASI FISIK KEGIATAN KONSTRUKSI DAN OLAH LAHAN";

  const docSubtitle = isPortfolio
    ? "PT Skala Prioritas Engineering · Laporan Portofolio Lintas Jenis Pekerjaan"
    : `${DINAS_REPORT_METADATA.kegiatan} · Kabupaten Aceh Tengah`;

  return (
    <div
      className={cn(
        "dinas-a4-print-sheet bg-white text-slate-900 antialiased",
        isPreviewVisible
          ? "mx-auto w-[210mm] max-w-full border border-slate-300 p-[8mm] shadow-xl print:w-full print:border-0 print:p-0 print:shadow-none"
          : "hidden print:block",
      )}
    >
      {/* Clean Formal A4 Letterhead / Document Title Block */}
      <div className="mb-2.5 border-b-2 border-slate-900 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[7.5px] font-bold uppercase tracking-wider text-slate-600">
              {isPortfolio
                ? "SISTEM MANAJEMEN PROYEK · SKALA PRIORITAS ENGINEERING"
                : `${DINAS_REPORT_METADATA.satker} · TAHUN ANGGARAN 2026`}
            </p>
            <h1 className="mt-0.5 text-[11.5px] font-extrabold uppercase leading-snug tracking-tight text-slate-950">
              {docTitle}
            </h1>
            <p className="mt-0.5 text-[8px] text-slate-700">
              {docSubtitle}
              {filterSummaryText ? ` · Filter: ${filterSummaryText}` : ""}
            </p>
          </div>
          <div className="shrink-0 border border-slate-700 bg-slate-50 px-2 py-1 text-right">
            <p className="text-[7px] font-bold uppercase tracking-wider text-slate-600">
              Format Kertas A4
            </p>
            <p className="font-mono text-[8px] font-bold text-slate-900">
              {printedDateLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Compact Clean Summary Table */}
      {isPortfolio ? (
        <table
          className="mb-2.5 w-full border-collapse border border-slate-600 text-[7.5px] text-slate-900"
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-slate-100 text-left font-bold uppercase text-slate-700">
              <th className="border border-slate-500 px-1.5 py-1">Total Proyek</th>
              <th className="border border-slate-500 px-1.5 py-1">Komposisi</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Rata-rata Aktual</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Rata-rata Rencana</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Lap. Harian</th>
              {canViewFinancials && (
                <th className="border border-slate-500 px-1.5 py-1 text-right">Pagu &amp; Realisasi</th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white font-semibold">
              <td className="border border-slate-500 px-1.5 py-1 tabular-nums">
                {portfolioSummary.count} Proyek
              </td>
              <td className="border border-slate-500 px-1.5 py-1">
                {portfolioSummary.consultancyCount} Konsultansi · {portfolioSummary.physicalCount} Fisik
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                {portfolioSummary.avgProgress.toFixed(1)}%
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                {portfolioSummary.avgPlanned !== null
                  ? `${portfolioSummary.avgPlanned.toFixed(1)}%`
                  : "—"}
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                {portfolioSummary.totalReports}x
              </td>
              {canViewFinancials && (
                <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                  Rp {portfolioSummary.totalRealized.toLocaleString("id-ID")} / Rp{" "}
                  {portfolioSummary.totalPagu.toLocaleString("id-ID")}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      ) : (
        <table
          className="mb-2.5 w-full border-collapse border border-slate-600 text-[7.5px] text-slate-900"
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-slate-100 text-left font-bold uppercase text-slate-700">
              <th className="border border-slate-500 px-1.5 py-1">Jumlah Poktan</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Luas SID (Ha)</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Pagu Konstruksi (Rp)</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Realisasi Fisik (Rp)</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Rata-rata Progres</th>
              <th className="border border-slate-500 px-1.5 py-1 text-right">Foto &amp; Lap. Harian</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white font-semibold">
              <td className="border border-slate-500 px-1.5 py-1 tabular-nums">
                {filteredData.length} Poktan
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                {aggregates.totalLuas.toFixed(2)} Ha
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                Rp {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                Rp {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                {aggregates.avgProgressPercent.toFixed(1)}%
              </td>
              <td className="border border-slate-500 px-1.5 py-1 text-right font-mono tabular-nums">
                {aggregates.totalPhotosCount} Foto · {aggregates.totalDailyReportsCount} Lap.
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* MAIN CLEAN A4 DATA TABLE */}
      {isPortfolio ? (
        <table
          className="w-full border-collapse border border-slate-700 text-[7.5px] leading-[1.3] text-slate-900"
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-slate-200 font-bold uppercase text-slate-900">
              <th className="w-[4%] border border-slate-600 px-1 py-1.5 text-center">No</th>
              <th className="w-[24%] border border-slate-600 px-1.5 py-1.5 text-left">
                Kode &amp; Nama Proyek
              </th>
              <th className="w-[14%] border border-slate-600 px-1.5 py-1.5 text-left">
                Jenis Pekerjaan
              </th>
              <th className="w-[15%] border border-slate-600 px-1.5 py-1.5 text-left">
                Mitra / Klien &amp; PIC
              </th>
              <th className="w-[8%] border border-slate-600 px-1 py-1.5 text-center">
                Status
              </th>
              <th className="w-[6%] border border-slate-600 px-1 py-1.5 text-right">
                Aktual
              </th>
              <th className="w-[6%] border border-slate-600 px-1 py-1.5 text-right">
                Rencana
              </th>
              <th className="w-[6%] border border-slate-600 px-1 py-1.5 text-right">
                Deviasi
              </th>
              <th className="w-[5%] border border-slate-600 px-1 py-1.5 text-center">
                Lap.
              </th>
              {canViewFinancials && (
                <>
                  <th className="w-[6%] border border-slate-600 px-1 py-1.5 text-right">
                    Pagu (Rp)
                  </th>
                  <th className="w-[6%] border border-slate-600 px-1 py-1.5 text-right">
                    Realisasi
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredPortfolioRows.map((row, idx) => (
              <tr key={row.key} className="bg-white">
                <td className="border border-slate-500 px-1 py-1 text-center font-mono tabular-nums">
                  {idx + 1}
                </td>
                <td className="border border-slate-500 px-1.5 py-1 align-top break-words">
                  <span className="font-mono text-[6.5px] text-slate-600">
                    {row.code}
                  </span>
                  <div className="font-bold text-slate-950">{row.title}</div>
                  {row.locationLabel !== "-" && (
                    <div className="text-[6.5px] text-slate-600">
                      {row.locationLabel}
                    </div>
                  )}
                </td>
                <td className="border border-slate-500 px-1.5 py-1 align-top break-words">
                  <div className="font-semibold">{row.workTypeBadge.shortLabel}</div>
                  <div className="text-[6.5px] text-slate-600">
                    {row.workTypeBadge.groupShortLabel}
                  </div>
                </td>
                <td className="border border-slate-500 px-1.5 py-1 align-top break-words">
                  <div className="font-medium">{row.clientLabel}</div>
                  <div className="text-[6.5px] text-slate-600">
                    PIC: {row.fieldPicName}
                  </div>
                </td>
                <td className="border border-slate-500 px-1 py-1 text-center align-top">
                  {row.statusLabel}
                </td>
                <td className="border border-slate-500 px-1 py-1 text-right font-mono font-bold tabular-nums">
                  {row.actualProgress.toFixed(1)}%
                </td>
                <td className="border border-slate-500 px-1 py-1 text-right font-mono tabular-nums text-slate-700">
                  {row.plannedProgress !== null
                    ? `${row.plannedProgress.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="border border-slate-500 px-1 py-1 text-right font-mono tabular-nums">
                  {row.deviation !== null
                    ? `${row.deviation >= 0 ? "+" : ""}${row.deviation.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="border border-slate-500 px-1 py-1 text-center font-mono tabular-nums">
                  {row.reportsCount}x
                </td>
                {canViewFinancials && (
                  <>
                    <td className="border border-slate-500 px-1 py-1 text-right font-mono tabular-nums">
                      {row.paguValue.toLocaleString("id-ID")}
                    </td>
                    <td className="border border-slate-500 px-1 py-1 text-right font-mono tabular-nums">
                      {row.realizedValue.toLocaleString("id-ID")}
                    </td>
                  </>
                )}
              </tr>
            ))}
            <tr className="bg-slate-200 font-bold text-slate-950">
              <td colSpan={5} className="border border-slate-700 px-1.5 py-1.5 text-center">
                TOTAL / RATA-RATA ({filteredPortfolioRows.length} PROYEK)
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {portfolioSummary.avgProgress.toFixed(1)}%
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {portfolioSummary.avgPlanned !== null
                  ? `${portfolioSummary.avgPlanned.toFixed(1)}%`
                  : "—"}
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {portfolioSummary.avgPlanned !== null
                  ? `${portfolioSummary.avgProgress - portfolioSummary.avgPlanned >= 0 ? "+" : ""}${(portfolioSummary.avgProgress - portfolioSummary.avgPlanned).toFixed(1)}%`
                  : "—"}
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-center font-mono tabular-nums">
                {portfolioSummary.totalReports}x
              </td>
              {canViewFinancials && (
                <>
                  <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                    {portfolioSummary.totalPagu.toLocaleString("id-ID")}
                  </td>
                  <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                    {portfolioSummary.totalRealized.toLocaleString("id-ID")}
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      ) : activeTab === "rincian_sid" ? (
        <table
          className="w-full border-collapse border border-slate-700 text-[7px] leading-[1.22] text-slate-900"
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-slate-200 font-bold uppercase text-slate-950">
              <th
                rowSpan={2}
                className="w-[3.5%] border border-slate-600 px-0.5 py-1 text-center"
              >
                No
              </th>
              <th
                rowSpan={2}
                className="w-[13.5%] border border-slate-600 px-1 py-1 text-left"
              >
                Kelompok Tani, Lokasi &amp; SPK
              </th>
              <th
                rowSpan={2}
                className="w-[4.5%] border border-slate-600 px-0.5 py-1 text-right"
              >
                Luas (Ha)
              </th>
              <th
                colSpan={4}
                className="border border-slate-600 bg-slate-100 px-1 py-1 text-center"
              >
                HASIL SID (RENCANA DESAIN)
              </th>
              <th
                colSpan={3}
                className="border border-slate-600 bg-slate-100 px-1 py-1 text-center"
              >
                HASIL FISIK &amp; LAPORAN
              </th>
              <th
                colSpan={4}
                className="border border-slate-600 bg-slate-100 px-1 py-1 text-center"
              >
                DOKUMENTASI FOTO LAPANGAN
              </th>
            </tr>
            <tr className="bg-slate-100 text-[6.5px] font-bold uppercase text-slate-800">
              <th className="w-[13.5%] border border-slate-600 px-1 py-1 text-left">
                Uraian Pekerjaan SID
              </th>
              <th className="w-[6%] border border-slate-600 px-0.5 py-1 text-right">
                Vol / Sat
              </th>
              <th className="w-[8.5%] border border-slate-600 px-1 py-1 text-right">
                Biaya SID (Rp)
              </th>
              <th className="w-[5%] border border-slate-600 px-0.5 py-1 text-right">
                Bobot (%)
              </th>
              <th className="w-[6%] border border-slate-600 px-0.5 py-1 text-right">
                Real. Vol
              </th>
              <th className="w-[8.5%] border border-slate-600 px-1 py-1 text-right">
                Real. Biaya (Rp)
              </th>
              <th className="w-[7%] border border-slate-600 px-0.5 py-1 text-center">
                Prog. / Lap.
              </th>
              <th className="w-[6%] border border-slate-600 px-0.5 py-1 text-center">
                Foto 0%
              </th>
              <th className="w-[6%] border border-slate-600 px-0.5 py-1 text-center">
                Foto 50%
              </th>
              <th className="w-[6%] border border-slate-600 px-0.5 py-1 text-center">
                Foto 100%
              </th>
              <th className="w-[6%] border border-slate-600 px-0.5 py-1 text-center">
                Prasasti
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((p) => {
              const photos = p.photoClassification;
              return (
                <Fragment key={`a4-poktan-${p.no}`}>
                  <tr className="bg-slate-100 font-semibold text-slate-950">
                    <td className="border border-slate-600 px-0.5 py-1 text-center align-top font-mono">
                      {p.no}
                    </td>
                    <td className="border border-slate-600 px-1 py-1 align-top break-words">
                      <div className="font-bold">{p.poktan}</div>
                      <div className="text-[6.5px] font-normal text-slate-700">
                        Ds. {p.desa}, Kec. {p.kecamatan}
                      </div>
                      <div className="font-mono text-[6px] font-normal text-slate-600">
                        SPK: {p.nomorSpk || "—"}
                      </div>
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-right align-top font-mono tabular-nums">
                      {p.luasLahanHa.toFixed(2)}
                    </td>
                    <td className="border border-slate-600 px-1 py-1 align-top">
                      Total Konstruksi ({p.pekerjaanListWithBobot.length} Item)
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-right align-top text-slate-500">
                      —
                    </td>
                    <td className="border border-slate-600 px-1 py-1 text-right align-top font-mono tabular-nums">
                      {p.totalBiayaKonstruksi.toLocaleString("id-ID")}
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-right align-top font-mono tabular-nums">
                      100,0%
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-right align-top text-slate-500">
                      —
                    </td>
                    <td className="border border-slate-600 px-1 py-1 text-right align-top font-mono tabular-nums">
                      {p.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-center align-top font-mono tabular-nums">
                      <div className="font-bold">
                        {p.progresFisikKonstruksiPercent.toFixed(1)}%
                      </div>
                      <div className="text-[6px] font-normal text-slate-700">
                        {photos.dailyReportsCount > 0
                          ? `${photos.dailyReportsCount} Lap.`
                          : "Belum ada"}
                      </div>
                      {photos.latestWeeklySubmission && (
                        <div className="text-[5.8px] font-normal text-slate-600">
                          {photos.latestWeeklySubmission.periodLabel}:{" "}
                          {photos.latestWeeklySubmission.actualProgress}%
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-center align-middle">
                      <A4PhotoCell photos={photos.photos0} stageName="0%" />
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-center align-middle">
                      <A4PhotoCell photos={photos.photos50} stageName="50%" />
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-center align-middle">
                      <A4PhotoCell photos={photos.photos100} stageName="100%" />
                    </td>
                    <td className="border border-slate-600 px-0.5 py-1 text-center align-middle">
                      <A4PhotoCell
                        photos={photos.photosPrasasti}
                        stageName="Prasasti"
                      />
                    </td>
                  </tr>

                  {printShowSubItems &&
                    p.pekerjaanListWithBobot.map((item, idx) => {
                      const item0 = getWorkItemStagePhotos(
                        photos.photos0,
                        item.namaPekerjaan,
                        p.linkedProjectId,
                      );
                      const item50 = getWorkItemStagePhotos(
                        photos.photos50,
                        item.namaPekerjaan,
                        p.linkedProjectId,
                      );
                      const item100 = getWorkItemStagePhotos(
                        photos.photos100,
                        item.namaPekerjaan,
                        p.linkedProjectId,
                      );
                      const itemPrasasti = getWorkItemStagePhotos(
                        photos.photosPrasasti,
                        item.namaPekerjaan,
                        p.linkedProjectId,
                      );

                      return (
                        <tr
                          key={`a4-item-${p.no}-${idx}`}
                          className="bg-white text-[6.8px] text-slate-800"
                        >
                          <td className="border border-slate-400 px-0.5 py-0.5 text-center font-mono text-slate-500">
                            {p.no}.{idx + 1}
                          </td>
                          <td
                            colSpan={2}
                            className="border border-slate-400 px-1 py-0.5 pl-2.5 text-slate-700 break-words"
                          >
                            ↳ {item.namaPekerjaan}
                          </td>
                          <td className="border border-slate-400 px-1 py-0.5 break-words">
                            {item.namaPekerjaan}
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-right font-mono tabular-nums">
                            {item.volume !== null && item.volume !== undefined
                              ? `${item.volume} ${item.satuan ?? ""}`.trim()
                              : "—"}
                          </td>
                          <td className="border border-slate-400 px-1 py-0.5 text-right font-mono tabular-nums">
                            {item.biaya > 0
                              ? item.biaya.toLocaleString("id-ID")
                              : "—"}
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-right font-mono tabular-nums">
                            {item.bobotPercent.toFixed(2)}%
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-right font-mono tabular-nums">
                            {item.realisasiVolumeCalc !== null &&
                            item.realisasiVolumeCalc !== undefined &&
                            item.realisasiVolumeCalc !== "-"
                              ? `${item.realisasiVolumeCalc} ${item.realisasiSatuan || item.satuan || ""}`.trim()
                              : "—"}
                          </td>
                          <td className="border border-slate-400 px-1 py-0.5 text-right font-mono tabular-nums">
                            {item.realisasiBiaya > 0
                              ? item.realisasiBiaya.toLocaleString("id-ID")
                              : "—"}
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-center font-mono tabular-nums text-slate-600">
                            {item.biaya > 0
                              ? `${p.progresFisikKonstruksiPercent.toFixed(1)}%`
                              : "Opsional"}
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-center align-middle">
                            <A4PhotoCell photos={item0} stageName="0%" compact />
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-center align-middle">
                            <A4PhotoCell photos={item50} stageName="50%" compact />
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-center align-middle">
                            <A4PhotoCell
                              photos={item100}
                              stageName="100%"
                              compact
                            />
                          </td>
                          <td className="border border-slate-400 px-0.5 py-0.5 text-center align-middle">
                            <A4PhotoCell
                              photos={itemPrasasti}
                              stageName="Prasasti"
                              compact
                            />
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}

            {/* Final Grand Total Row */}
            <tr className="bg-slate-200 font-bold text-slate-950">
              <td
                colSpan={2}
                className="border border-slate-700 px-1.5 py-1.5 text-center"
              >
                TOTAL KESELURUHAN ({filteredData.length} POKTAN)
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalLuas.toFixed(2)}
              </td>
              <td
                colSpan={2}
                className="border border-slate-700 px-1 py-1.5 text-right"
              >
                Total Anggaran SID:
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                100,0%
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right">
                Real:
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-center font-mono tabular-nums">
                <div>{aggregates.avgProgressPercent.toFixed(1)}%</div>
                <div className="text-[6px] font-normal">
                  {aggregates.totalDailyReportsCount} Lap.
                </div>
              </td>
              <td
                colSpan={4}
                className="border border-slate-700 px-1 py-1.5 text-center"
              >
                Total: {aggregates.totalPhotosCount} Foto (
                {aggregates.poktanWithPhotosCount} Poktan)
              </td>
            </tr>
          </tbody>
        </table>
      ) : activeTab === "database_spk" ? (
        <table
          className="w-full border-collapse border border-slate-700 text-[7px] leading-[1.25] text-slate-900"
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-slate-200 font-bold uppercase text-slate-950">
              <th className="w-[3.5%] border border-slate-600 px-0.5 py-1 text-center">No</th>
              <th className="w-[11%] border border-slate-600 px-1 py-1 text-left">Kec. / Desa</th>
              <th className="w-[14%] border border-slate-600 px-1 py-1 text-left">Poktan &amp; Luas</th>
              <th className="w-[13%] border border-slate-600 px-1 py-1 text-left">Nomor &amp; Tgl SPK</th>
              <th className="w-[10%] border border-slate-600 px-1 py-1 text-left">Jangka Waktu</th>
              <th className="w-[11.5%] border border-slate-600 px-1 py-1 text-left">Bank &amp; Rekening</th>
              <th className="w-[13%] border border-slate-600 px-1 py-1 text-left">Pengurus</th>
              <th className="w-[8%] border border-slate-600 px-1 py-1 text-right">SP2D 1 (Rp)</th>
              <th className="w-[8%] border border-slate-600 px-1 py-1 text-right">SP2D 2 (Rp)</th>
              <th className="w-[8%] border border-slate-600 px-1 py-1 text-right">Total Tersalur</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((d) => {
              const totalTersalur = d.sp2d1Jumlah + d.sp2d2Jumlah;
              return (
                <tr key={`a4-spk-${d.no}`} className="bg-white">
                  <td className="border border-slate-500 px-0.5 py-1 text-center font-mono">
                    {d.no}
                  </td>
                  <td className="border border-slate-500 px-1 py-1 align-top break-words">
                    <div className="font-semibold">Kec. {d.kecamatan}</div>
                    <div className="text-[6.5px] text-slate-600">Desa {d.desa}</div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 align-top break-words">
                    <div className="font-bold">{d.poktan}</div>
                    <div className="text-[6.5px] text-slate-600">
                      {d.luasLahanHa} Ha ({d.jumlahAnggota} Angg.)
                    </div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 align-top font-mono break-words">
                    <div>{d.nomorSpk}</div>
                    <div className="text-[6px] text-slate-600">Tgl: {d.tglSpk}</div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 align-top tabular-nums">
                    <div>{d.tglMulai} s/d</div>
                    <div className="text-slate-600">{d.tglSelesai}</div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 align-top break-words">
                    <div className="font-medium">{d.namaBank}</div>
                    <div className="font-mono text-[6.5px] text-slate-600">
                      {d.noRekening}
                    </div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 align-top break-words">
                    <div>
                      Ketua: <span className="font-semibold">{d.ketuaPoktan}</span>
                    </div>
                    <div className="font-mono text-[6px] text-slate-600">
                      NIK: {d.nikKetua}
                    </div>
                    <div>
                      UPKK: <span className="font-semibold">{d.ketuaUpkk}</span>
                    </div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 text-right align-top font-mono tabular-nums">
                    <div>{d.sp2d1Jumlah.toLocaleString("id-ID")}</div>
                    <div className="text-[5.8px] text-slate-600">{d.sp2d1NoTgl}</div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 text-right align-top font-mono tabular-nums">
                    <div>{d.sp2d2Jumlah.toLocaleString("id-ID")}</div>
                    <div className="text-[5.8px] text-slate-600">
                      {d.sp2d2NoTgl || "—"}
                    </div>
                  </td>
                  <td className="border border-slate-500 px-1 py-1 text-right align-top font-mono font-bold tabular-nums">
                    {totalTersalur.toLocaleString("id-ID")}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-200 font-bold text-slate-950">
              <td colSpan={7} className="border border-slate-700 px-1.5 py-1.5 text-center">
                TOTAL PENYALURAN SP2D ({filteredData.length} POKTAN)
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalSp2d1.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalSp2d2.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-1 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalPenyaluran.toLocaleString("id-ID")}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table
          className="w-full border-collapse border border-slate-700 text-[6.8px] leading-[1.2] text-slate-900"
          style={{ tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-slate-200 font-bold uppercase text-slate-950">
              <th rowSpan={2} className="w-[3%] border border-slate-600 px-0.5 py-1 text-center">
                No
              </th>
              <th rowSpan={2} className="w-[10%] border border-slate-600 px-1 py-1 text-left">
                Kecamatan &amp; Desa
              </th>
              <th rowSpan={2} className="w-[12%] border border-slate-600 px-1 py-1 text-left">
                Nama Poktan
              </th>
              <th rowSpan={2} className="w-[4.5%] border border-slate-600 px-0.5 py-1 text-right">
                Luas (Ha)
              </th>
              <th colSpan={4} className="border border-slate-600 bg-slate-100 px-1 py-1 text-center">
                Konstruksi
              </th>
              <th colSpan={4} className="border border-slate-600 bg-slate-100 px-1 py-1 text-center">
                BAST Fisik
              </th>
              <th colSpan={4} className="border border-slate-600 bg-slate-100 px-1 py-1 text-center">
                Olah Lahan
              </th>
            </tr>
            <tr className="bg-slate-100 text-[6px] font-bold uppercase text-slate-800">
              <th className="w-[7%] border border-slate-600 px-0.5 py-1 text-right">Biaya</th>
              <th className="w-[7%] border border-slate-600 px-0.5 py-1 text-right">Digunakan</th>
              <th className="w-[5.5%] border border-slate-600 px-0.5 py-1 text-right">Real Ha</th>
              <th className="w-[4.5%] border border-slate-600 px-0.5 py-1 text-center">%</th>
              <th className="w-[5.5%] border border-slate-600 px-0.5 py-1 text-center">UPKK</th>
              <th className="w-[5.5%] border border-slate-600 px-0.5 py-1 text-center">UPKK-PPK</th>
              <th className="w-[5.5%] border border-slate-600 px-0.5 py-1 text-center">PPK-KPA</th>
              <th className="w-[5.5%] border border-slate-600 px-0.5 py-1 text-center">KPA-Pkt</th>
              <th className="w-[7%] border border-slate-600 px-0.5 py-1 text-right">Biaya</th>
              <th className="w-[7%] border border-slate-600 px-0.5 py-1 text-right">Digunakan</th>
              <th className="w-[4.5%] border border-slate-600 px-0.5 py-1 text-center">%</th>
              <th className="w-[5.5%] border border-slate-600 px-0.5 py-1 text-right">Real Ha</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((d) => (
              <tr key={`a4-rekap-${d.no}`} className="bg-white">
                <td className="border border-slate-500 px-0.5 py-1 text-center font-mono">
                  {d.no}
                </td>
                <td className="border border-slate-500 px-1 py-1 break-words">
                  <div className="font-semibold">{d.kecamatan}</div>
                  <div className="text-[6px] text-slate-600">Ds. {d.desa}</div>
                </td>
                <td className="border border-slate-500 px-1 py-1 font-bold break-words">
                  {d.poktan}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.luasLahanHa}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.totalBiayaKonstruksi.toLocaleString("id-ID")}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.realisasiHaKonstruksi.toLocaleString("id-ID", {
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-center font-mono tabular-nums">
                  {d.progresFisikKonstruksiPercent}%
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-center break-words">
                  {d.bastTeknisUpkk || "—"}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-center break-words">
                  {d.bastUpkkPpk || "—"}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-center break-words">
                  {d.bastPpkKpa || "—"}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-center break-words">
                  {d.bastKpaPoktan || "—"}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.totalBiayaOlahLahan.toLocaleString("id-ID")}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.biayaDigunakanOlahLahan.toLocaleString("id-ID")}
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-center font-mono tabular-nums">
                  {d.progresFisikOlahLahanPercent}%
                </td>
                <td className="border border-slate-500 px-0.5 py-1 text-right font-mono tabular-nums">
                  {d.realisasiHaOlahLahan}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-200 font-bold text-slate-950">
              <td colSpan={3} className="border border-slate-700 px-1 py-1.5 text-center">
                TOTAL ({filteredData.length} POKTAN)
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalLuas.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalRealisasiHaKonstruksi.toLocaleString("id-ID", {
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-center font-mono">
                {aggregates.avgProgressPercent}%
              </td>
              <td colSpan={4} className="border border-slate-700 px-0.5 py-1.5 text-center">
                BAST Lengkap
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalBiayaOlahLahan.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalBiayaDigunakanOlahLahan.toLocaleString("id-ID")}
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-center">
                100%
              </td>
              <td className="border border-slate-700 px-0.5 py-1.5 text-right font-mono tabular-nums">
                {aggregates.totalLuas.toLocaleString("id-ID")}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Formal Sign-Off Block on A4 Sheet */}
      <div className="mt-5 break-inside-avoid border-t border-slate-400 pt-3">
        <div className="grid grid-cols-3 gap-6 text-center text-[8px] leading-snug text-slate-900">
          <div>
            <p>Mengetahui,</p>
            <p className="font-bold">Kuasa Pengguna Anggaran (KPA)</p>
            <div className="h-14" />
            <p className="font-bold underline">NAMA KPA LENGKAP, M.Si</p>
            <p className="text-slate-600">NIP. 19780101 200501 1 001</p>
          </div>
          <div>
            <p>Disetujui Oleh,</p>
            <p className="font-bold">Pejabat Pembuat Komitmen (PPK)</p>
            <div className="h-14" />
            <p className="font-bold underline">NAMA PPK LENGKAP, ST</p>
            <p className="text-slate-600">NIP. 19820315 200801 1 002</p>
          </div>
          <div>
            <p>Takengon, {printedDateLabel}</p>
            <p className="font-bold">
              Pejabat Pelaksana Teknis Kegiatan (PPTK)
            </p>
            <div className="h-14" />
            <p className="font-bold underline">NAMA PPTK LENGKAP, SP</p>
            <p className="text-slate-600">NIP. 19850720 201001 1 003</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DinasProjectReportPage({
  projects,
  canViewFinancials = true,
}: {
  projects: DinasProjectProgressSource[];
  canViewFinancials?: boolean;
}) {
  const hasLiveDbMetadata = useMemo(
    () => projects.some((project) => Boolean(project.id)),
    [projects],
  );
  const [reportMode, setReportMode] = useState<ReportViewMode>(() =>
    projects.some((project) => Boolean(project.id))
      ? "portfolio_live"
      : "dinas_preset",
  );
  const [referenceNowMs] = useState<number>(() => Date.now());
  const [portfolioSearch, setPortfolioSearch] = useState<string>("");
  const [portfolioWorkTypeFilter, setPortfolioWorkTypeFilter] =
    useState<string>("ALL");
  const [portfolioStatusFilter, setPortfolioStatusFilter] =
    useState<string>("ALL");
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DinasTabType>("rekapitulasi");
  const [selectedKecamatan, setSelectedKecamatan] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Controls for Tab 2: Hasil SID & Foto Master
  const [photoFilter, setPhotoFilter] = useState<
    "ALL" | "WITH_PHOTOS" | "FULL_4_STAGES" | "NO_PHOTOS"
  >("ALL");
  const [reportFilter, setReportFilter] = useState<
    "ALL" | "HAS_DAILY" | "HAS_WEEKLY"
  >("ALL");
  const [showAllItems, setShowAllItems] = useState<boolean>(true);
  const [expandedPoktanNos, setExpandedPoktanNos] = useState<Set<number>>(
    () => new Set(),
  );
  const [sidViewMode, setSidViewMode] = useState<"excel_table" | "mobile_cards">(
    "excel_table",
  );
  const [lightboxData, setLightboxData] = useState<LightboxState | null>(null);
  const [photoAssistantTarget, setPhotoAssistantTarget] =
    useState<PhotoAssistantTarget>(null);
  const [isA4PrintViewOpen, setIsA4PrintViewOpen] = useState<boolean>(false);
  const [printShowSubItems, setPrintShowSubItems] = useState<boolean>(true);

  const printedDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date(referenceNowMs)),
    [referenceNowMs],
  );

  const handleOpenA4PrintView = () => {
    setPrintShowSubItems(showAllItems);
    setIsA4PrintViewOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const projectByIdMap = useMemo(() => {
    const byId = new Map<string, DinasProjectProgressSource>();
    for (const project of projects) {
      if (project.id) byId.set(project.id, project);
    }
    return byId;
  }, [projects]);

  const autoLinkedProjectByNo = useMemo(() => {
    const map = new Map<number, DinasProjectProgressSource | undefined>();
    for (const record of DINAS_PROJECTS_DATA) {
      map.set(record.no, findAutoLinkedProject(record, projects));
    }
    return map;
  }, [projects]);

  // Synced persistence for Auto Adaptation Mode & Namespaced Per-Poktan/Project Adjustments (v2)
  const autoAdaptMode = useSyncExternalStore(
    subscribePhotoSettings,
    getAutoModeSnapshot,
    getAutoModeServerSnapshot,
  );
  const adjustmentsRaw = useSyncExternalStore(
    subscribePhotoSettings,
    getAdjustmentsRawSnapshot,
    getAdjustmentsRawServerSnapshot,
  );
  const photoAdjustments = useMemo(
    () => parseAdjustmentsStoreRaw(adjustmentsRaw),
    [adjustmentsRaw],
  );

  // Migrate legacy v1 entries ONLY if verified against this project's own assets, then clear v1 key
  useEffect(() => {
    if (typeof window === "undefined" || projects.length === 0) return;
    let legacyRaw: string | null = null;
    try {
      legacyRaw = window.localStorage.getItem(
        LEGACY_PHOTO_ADJUSTMENTS_STORAGE_KEY,
      );
    } catch {
      return;
    }
    if (!legacyRaw) return;

    try {
      const legacyParsed = JSON.parse(legacyRaw) as Record<string, unknown>;
      if (legacyParsed && typeof legacyParsed === "object") {
        const existingV2 = readAdjustmentsStoreFromStorage();
        const nextV2: PhotoAdjustmentsStore = { ...existingV2 };
        let changed = false;

        for (const [noKey, rawEntry] of Object.entries(legacyParsed)) {
          const poktanNo = Number(noKey);
          if (
            !Number.isFinite(poktanNo) ||
            !rawEntry ||
            typeof rawEntry !== "object"
          ) {
            continue;
          }
          const record = DINAS_PROJECTS_DATA.find((r) => r.no === poktanNo);
          if (!record) continue;

          const entry = rawEntry as {
            linkedProjectId?: string;
            stageOverrides?: Partial<Record<PhotoStageKey, string[]>>;
            photoStageMap?: Record<string, PhotoStageKey[]>;
            photoWorkItemMap?: Record<string, string>;
            photoVisualMap?: Record<string, PhotoVisualSettings>;
          };

          const autoProj = autoLinkedProjectByNo.get(record.no);
          const manualProj = entry.linkedProjectId
            ? projectByIdMap.get(entry.linkedProjectId)
            : undefined;
          const validLinkedProj =
            manualProj && isProjectPoktanCompatible(manualProj, record)
              ? manualProj
              : autoProj;

          if (!validLinkedProj) continue;

          const { rawPhotos } = extractRawDailyReportPhotos(
            record,
            validLinkedProj,
          );
          const validPhotoKeys = new Set(rawPhotos.map((p) => p.photoKey));

          const isOwnedPhotoKey = (rawUrl: string) => {
            const key = normalizePhotoKey(rawUrl);
            if (!key || !validPhotoKeys.has(key)) return false;
            const parsedCode = parseClientAssetCode(rawUrl);
            return isAssetOwnedByGroup(
              {
                assetCode: parsedCode?.assetCode,
                url: rawUrl,
                projectId: validLinkedProj.id,
              },
              record,
              validLinkedProj,
            );
          };

          const migrated: PoktanPhotoAdjustment = {
            groupKey: buildDinasAdjustmentGroupKey(record),
            projectId: validLinkedProj.id,
          };

          if (manualProj && isProjectPoktanCompatible(manualProj, record)) {
            migrated.linkedProjectId = manualProj.id;
          }

          if (entry.photoStageMap) {
            const cleanMap: Record<string, PhotoStageKey[]> = {};
            for (const [k, stages] of Object.entries(entry.photoStageMap)) {
              if (isOwnedPhotoKey(k) && Array.isArray(stages)) {
                cleanMap[normalizePhotoKey(k)] = stages;
              }
            }
            if (Object.keys(cleanMap).length > 0) {
              migrated.photoStageMap = cleanMap;
            }
          }

          if (entry.stageOverrides) {
            const cleanOverrides: Partial<Record<PhotoStageKey, string[]>> = {};
            for (const [st, urls] of Object.entries(entry.stageOverrides)) {
              const filtered = (urls ?? []).filter(isOwnedPhotoKey);
              if (filtered.length > 0) {
                cleanOverrides[st as PhotoStageKey] = filtered;
              }
            }
            if (Object.keys(cleanOverrides).length > 0) {
              migrated.stageOverrides = cleanOverrides;
            }
          }

          if (entry.photoWorkItemMap) {
            const cleanWork: Record<string, string> = {};
            for (const [k, v] of Object.entries(entry.photoWorkItemMap)) {
              if (isOwnedPhotoKey(k) && typeof v === "string" && v.trim()) {
                cleanWork[normalizePhotoKey(k)] = v;
              }
            }
            if (Object.keys(cleanWork).length > 0) {
              migrated.photoWorkItemMap = cleanWork;
            }
          }

          if (entry.photoVisualMap) {
            const cleanVisual: Record<string, PhotoVisualSettings> = {};
            for (const [k, v] of Object.entries(entry.photoVisualMap)) {
              if (isOwnedPhotoKey(k) && v && typeof v === "object") {
                cleanVisual[normalizePhotoKey(k)] = v;
              }
            }
            if (Object.keys(cleanVisual).length > 0) {
              migrated.photoVisualMap = cleanVisual;
            }
          }

          const hasUsefulData = Boolean(
            migrated.linkedProjectId ||
              migrated.photoStageMap ||
              migrated.stageOverrides ||
              migrated.photoWorkItemMap ||
              migrated.photoVisualMap,
          );
          if (hasUsefulData) {
            const storageKey = buildDinasAdjustmentStorageKey(
              record,
              validLinkedProj.id,
            );
            if (!nextV2[storageKey]) {
              nextV2[storageKey] = migrated;
              changed = true;
            }
          }
        }

        if (changed) {
          persistPhotoAdjustments(nextV2);
        }
      }
      window.localStorage.removeItem(LEGACY_PHOTO_ADJUSTMENTS_STORAGE_KEY);
    } catch {
      try {
        window.localStorage.removeItem(LEGACY_PHOTO_ADJUSTMENTS_STORAGE_KEY);
      } catch {
        // ignore storage cleanup errors
      }
    }

    // Purge any stale or invalid v2 adjustment entries where linkedProjectId is incompatible
    try {
      const existingV2 = readAdjustmentsStoreFromStorage();
      const sanitizedV2: PhotoAdjustmentsStore = {};
      let v2Changed = false;
      for (const [key, entry] of Object.entries(existingV2)) {
        if (!entry || typeof entry !== "object") {
          v2Changed = true;
          continue;
        }
        const matchingRecord = DINAS_PROJECTS_DATA.find(
          (r) => buildDinasAdjustmentGroupKey(r) === entry.groupKey,
        );
        if (!matchingRecord) {
          v2Changed = true;
          continue;
        }
        if (entry.linkedProjectId) {
          const linked = projectByIdMap.get(entry.linkedProjectId);
          if (!linked || !isProjectPoktanCompatible(linked, matchingRecord)) {
            v2Changed = true;
            continue;
          }
        }
        if (entry.projectId) {
          const linked = projectByIdMap.get(entry.projectId);
          if (!linked || !isProjectPoktanCompatible(linked, matchingRecord)) {
            v2Changed = true;
            continue;
          }
        }
        sanitizedV2[key] = entry;
      }
      if (v2Changed) {
        persistPhotoAdjustments(sanitizedV2);
      }
    } catch {
      // ignore storage cleanup errors
    }
  }, [projects, projectByIdMap, autoLinkedProjectByNo]);

  const resolveAdjustmentForRecord = useCallback(
    (
      record: DinasProjectRecord,
      autoLinked?: DinasProjectProgressSource,
    ): PoktanPhotoAdjustment | undefined => {
      const groupKey = buildDinasAdjustmentGroupKey(record);

      if (autoLinked?.id) {
        const direct =
          photoAdjustments[
            buildDinasAdjustmentStorageKey(record, autoLinked.id)
          ];
        if (
          direct &&
          (!direct.groupKey || direct.groupKey === groupKey) &&
          (!direct.projectId || direct.projectId === autoLinked.id)
        ) {
          if (
            !direct.linkedProjectId ||
            (() => {
              const linked = projectByIdMap.get(direct.linkedProjectId);
              return Boolean(linked && isProjectPoktanCompatible(linked, record));
            })()
          ) {
            return direct;
          }
        }
      }

      for (const entry of Object.values(photoAdjustments)) {
        if (!entry || entry.groupKey !== groupKey) continue;
        if (entry.projectId) {
          const entryProj = projectByIdMap.get(entry.projectId);
          if (!entryProj || !isProjectPoktanCompatible(entryProj, record)) {
            continue;
          }
          if (
            autoLinked?.id &&
            entry.projectId !== autoLinked.id &&
            entry.linkedProjectId !== entry.projectId
          ) {
            continue;
          }
        }
        if (entry.linkedProjectId) {
          const linked = projectByIdMap.get(entry.linkedProjectId);
          if (!linked || !isProjectPoktanCompatible(linked, record)) {
            continue;
          }
        }
        return entry;
      }

      return undefined;
    },
    [photoAdjustments, projectByIdMap],
  );

  const handleChangeAutoAdaptMode = (mode: PhotoAutoAdaptMode) => {
    persistAutoMode(mode);
    const labelMap: Record<PhotoAutoAdaptMode, string> = {
      smart_chronological: "Otomatis Cerdas Kronologis (0% → 50% → 100%)",
      distribute_all_4: "Sebar Merata ke 4 Tahap (0%, 50%, 100%, Prasasti)",
      strict_threshold: "Ketat Berdasarkan % Progres Laporan Harian",
    };
    toast.success(`Mode penyesuaian foto: ${labelMap[mode]}`);
  };

  const updatePoktanAdjustment = (
    poktanNo: number,
    updater: (prev: PoktanPhotoAdjustment) => PoktanPhotoAdjustment,
    overrideProjectId?: string | null,
  ) => {
    const record = DINAS_PROJECTS_DATA.find((r) => r.no === poktanNo);
    if (!record) return;
    const prevAll = readAdjustmentsStoreFromStorage();
    const autoLinked = autoLinkedProjectByNo.get(poktanNo);
    const current = resolveAdjustmentForRecord(record, autoLinked) ?? {};
    const updated = updater(current);
    const groupKey = buildDinasAdjustmentGroupKey(record);

    const candidateLinkedId =
      overrideProjectId !== undefined
        ? overrideProjectId
        : updated.linkedProjectId ?? autoLinked?.id;
    const resolvedProject = candidateLinkedId
      ? projectByIdMap.get(candidateLinkedId)
      : undefined;
    const targetProjectId =
      resolvedProject && isProjectPoktanCompatible(resolvedProject, record)
        ? resolvedProject.id
        : autoLinked?.id;

    const storageKey = buildDinasAdjustmentStorageKey(record, targetProjectId);
    persistPhotoAdjustments({
      ...prevAll,
      [storageKey]: {
        ...updated,
        groupKey,
        projectId: targetProjectId ?? undefined,
      },
    });
  };

  const resetPoktanAdjustment = (poktanNo: number) => {
    const record = DINAS_PROJECTS_DATA.find((r) => r.no === poktanNo);
    if (!record) return;
    const groupKey = buildDinasAdjustmentGroupKey(record);
    const prevAll = readAdjustmentsStoreFromStorage();
    const next: PhotoAdjustmentsStore = {};
    for (const [k, v] of Object.entries(prevAll)) {
      if (k === groupKey || k.startsWith(`${groupKey}::`) || v?.groupKey === groupKey) {
        continue;
      }
      next[k] = v;
    }
    persistPhotoAdjustments(next);
    toast.success("Penyesuaian foto Poktan dikembalikan ke otomatis.");
  };

  const togglePoktan = (no: number) => {
    setExpandedPoktanNos((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const handleOpenLightbox = (
    photo: ClassifiedPhotoItem,
    photoList: ClassifiedPhotoItem[],
    currentIndex: number,
    poktanNo?: number,
  ) => {
    setLightboxData({
      photo,
      photoList,
      currentIndex,
      poktanNo,
    });
  };

  const portfolioRows = useMemo(() => {
    return projects.map((project, index) => {
      const workTypeDef = resolveProjectWorkType(project.jenisPekerjaan);
      const badge = formatWorkTypeBadge(project.jenisPekerjaan);
      const actualProgress = Math.min(
        100,
        Math.max(0, Number.isFinite(project.progress) ? project.progress : 0),
      );
      const plannedProgress = calculatePlannedSCurveProgress(
        project.startDate,
        project.endDate,
        referenceNowMs,
      );
      const deviation =
        plannedProgress !== null
          ? Math.round((actualProgress - plannedProgress) * 10) / 10
          : null;
      const paguValue = parseAmountSafe(project.pagu);
      const realizedValue = parseAmountSafe(project.realized);
      const reports = project.reports ?? project.dailyReports ?? [];
      const sortedReportDates = reports
        .map((report) => toJakartaDateKey(report.reportDate))
        .filter((dateKey): dateKey is string => Boolean(dateKey))
        .sort()
        .reverse();
      const latestReportDate = sortedReportDates[0] ?? null;
      const clientLabel =
        project.clientName?.trim() ||
        project.kelompokTani?.trim() ||
        project.vendor?.trim() ||
        "-";
      const locationLabel =
        project.location?.trim() || project.address?.trim() || "-";
      const statusKey = (project.status || "RUNNING").toUpperCase();

      return {
        key: project.id || `${project.code || project.name}-${index}`,
        id: project.id,
        code: project.code || `PRJ-${index + 1}`,
        title: project.title || project.name,
        name: project.name,
        rawJenisPekerjaan: project.jenisPekerjaan || "",
        workTypeId: workTypeDef.id,
        workTypeBadge: badge,
        statusKey,
        statusLabel: STATUS_LABEL_MAP[statusKey] || statusKey,
        actualProgress,
        plannedProgress,
        deviation,
        paguValue,
        realizedValue,
        reportsCount: reports.length,
        latestReportDate,
        workPointsCount: project.workPoints?.length ?? 0,
        submissionsCount: project.progressSubmissions?.length ?? 0,
        fieldPicName:
          project.fieldPic?.name?.trim() || project.fieldPicName?.trim() || "-",
        clientLabel,
        locationLabel,
      };
    });
  }, [projects, referenceNowMs]);

  const filteredPortfolioRows = useMemo(() => {
    const query = portfolioSearch.trim().toLowerCase();
    return portfolioRows.filter((row) => {
      const matchWorkType =
        portfolioWorkTypeFilter === "ALL" ||
        (portfolioWorkTypeFilter === "CONSULTANCY" &&
          row.workTypeBadge.group === "CONSULTANCY") ||
        (portfolioWorkTypeFilter === "PHYSICAL" &&
          row.workTypeBadge.group === "PHYSICAL") ||
        row.workTypeId === portfolioWorkTypeFilter ||
        row.rawJenisPekerjaan.toLowerCase() ===
          portfolioWorkTypeFilter.toLowerCase();
      const matchStatus =
        portfolioStatusFilter === "ALL" ||
        row.statusKey === portfolioStatusFilter;
      const matchSearch =
        !query ||
        row.code.toLowerCase().includes(query) ||
        row.title.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.workTypeBadge.label.toLowerCase().includes(query) ||
        row.clientLabel.toLowerCase().includes(query) ||
        row.fieldPicName.toLowerCase().includes(query) ||
        row.locationLabel.toLowerCase().includes(query);

      return matchWorkType && matchStatus && matchSearch;
    });
  }, [
    portfolioRows,
    portfolioSearch,
    portfolioWorkTypeFilter,
    portfolioStatusFilter,
  ]);

  const portfolioSummary = useMemo(() => {
    const count = filteredPortfolioRows.length;
    const totalProgress = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.actualProgress,
      0,
    );
    const plannedList = filteredPortfolioRows.filter(
      (row) => row.plannedProgress !== null,
    );
    const totalPlanned = plannedList.reduce(
      (sum, row) => sum + (row.plannedProgress ?? 0),
      0,
    );
    const consultancyCount = filteredPortfolioRows.filter(
      (row) => row.workTypeBadge.group === "CONSULTANCY",
    ).length;
    const physicalCount = count - consultancyCount;
    const totalPagu = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.paguValue,
      0,
    );
    const totalRealized = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.realizedValue,
      0,
    );
    const totalReports = filteredPortfolioRows.reduce(
      (sum, row) => sum + row.reportsCount,
      0,
    );
    const behindScheduleCount = filteredPortfolioRows.filter(
      (row) => row.deviation !== null && row.deviation < -5,
    ).length;

    const breakdownMap = new Map<
      string,
      {
        workTypeId: string;
        label: string;
        group: "CONSULTANCY" | "PHYSICAL";
        tone: WorkTypeBadgeTone;
        count: number;
        totalProgress: number;
        totalPagu: number;
      }
    >();

    for (const row of portfolioRows) {
      const existing = breakdownMap.get(row.workTypeId);
      if (existing) {
        existing.count += 1;
        existing.totalProgress += row.actualProgress;
        existing.totalPagu += row.paguValue;
      } else {
        breakdownMap.set(row.workTypeId, {
          workTypeId: row.workTypeId,
          label: row.workTypeBadge.shortLabel,
          group: row.workTypeBadge.group,
          tone: row.workTypeBadge.tone,
          count: 1,
          totalProgress: row.actualProgress,
          totalPagu: row.paguValue,
        });
      }
    }

    const workTypeBreakdown = Array.from(breakdownMap.values())
      .map((item) => ({
        ...item,
        avgProgress:
          item.count > 0
            ? Math.round((item.totalProgress / item.count) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      count,
      avgProgress:
        count > 0 ? Math.round((totalProgress / count) * 10) / 10 : 0,
      avgPlanned:
        plannedList.length > 0
          ? Math.round((totalPlanned / plannedList.length) * 10) / 10
          : null,
      consultancyCount,
      physicalCount,
      totalPagu,
      totalRealized,
      realizationPercent:
        totalPagu > 0 ? Math.round((totalRealized / totalPagu) * 1000) / 10 : 0,
      totalReports,
      behindScheduleCount,
      workTypeBreakdown,
    };
  }, [filteredPortfolioRows, portfolioRows]);

  const handleDownloadPortfolio = async (format: "xlsx" | "pdf") => {
    const key = `portfolio-${format}`;
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const params = new URLSearchParams({ format });
      if (portfolioSearch.trim()) {
        params.set("search", portfolioSearch.trim());
      }
      if (portfolioWorkTypeFilter !== "ALL") {
        params.set("jenisPekerjaan", portfolioWorkTypeFilter);
      }
      if (portfolioStatusFilter !== "ALL") {
        params.set("status", portfolioStatusFilter);
      }
      const url = `/api/projects/export?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        let message = `Gagal mengekspor portofolio (${res.status})`;
        try {
          const payload = (await res.json()) as {
            message?: string;
            error?: string;
          };
          message = payload?.message || payload?.error || message;
        } catch {
          // ignore non-json error body
        }
        if (res.status === 503 && format === "pdf") {
          const htmlUrl = url.replace(/([?&])format=pdf\b/i, "$1format=html");
          window.open(htmlUrl, "_blank", "noopener,noreferrer");
          toast.error(`${message} Pratinjau cetak HTML dibuka di tab baru.`);
          return;
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const fallbackName = `Rekap_Portofolio_Proyek_${new Date().toISOString().slice(0, 10)}.${format}`;
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );
      const objUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
      toast.success(`Unduhan ${filename} dimulai`);
    } catch {
      toast.error("Gagal mengunduh rekap portofolio.");
    } finally {
      setExportingKey(null);
    }
  };

  const handleDownloadProjectReport = async (
    projectId: string,
    projectCode: string,
    type: "progress" | "financial",
    format: "pdf" | "xlsx",
  ) => {
    const key = `${projectId}-${type}-${format}`;
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const url = `/api/projects/${encodeURIComponent(projectId)}/reports?type=${type}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        let message = `Gagal membuat laporan ${type} (${res.status})`;
        try {
          const payload = (await res.json()) as {
            message?: string;
            error?: string;
          };
          message = payload?.message || payload?.error || message;
        } catch {
          // ignore non-json error body
        }
        if (res.status === 503 && format === "pdf") {
          const htmlUrl = url.replace(/([?&])format=pdf\b/i, "$1format=html");
          window.open(htmlUrl, "_blank", "noopener,noreferrer");
          toast.error(`${message} Pratinjau cetak HTML dibuka di tab baru.`);
          return;
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const fallbackName = `Laporan_${type}_${projectCode}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );
      const objUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
      toast.success(`Unduhan ${filename} dimulai`);
    } catch {
      toast.error("Gagal mengunduh laporan proyek.");
    } finally {
      setExportingKey(null);
    }
  };

  const projectReportData = useMemo(
    () =>
      DINAS_PROJECTS_DATA.map((record) => {
        const autoLinkedProject = autoLinkedProjectByNo.get(record.no);
        const adjustment = resolveAdjustmentForRecord(record, autoLinkedProject);
        const manualProject = adjustment?.linkedProjectId
          ? projectByIdMap.get(adjustment.linkedProjectId)
          : undefined;
        const validManualProject =
          manualProject && isProjectPoktanCompatible(manualProject, record)
            ? manualProject
            : undefined;
        const linkedProject = validManualProject ?? autoLinkedProject;

        const sourceProgress =
          linkedProject && Number.isFinite(linkedProject.progress)
            ? linkedProject.progress
            : record.progresFisikKonstruksiPercent;
        const progress = Math.min(100, Math.max(0, sourceProgress));
        const realizedArea = calculateRealizedArea(
          record.luasLahanHa,
          progress,
        );

        const photoClassification = classifyProjectPhotos(
          record,
          linkedProject,
          adjustment,
          autoAdaptMode,
        );

        const totalBiayaKonstruksi = record.totalBiayaKonstruksi;
        const pekerjaanListWithBobot = record.pekerjaanList.map((item) => {
          const bobotPercent =
            totalBiayaKonstruksi > 0
              ? (item.biaya / totalBiayaKonstruksi) * 100
              : 0;
          const realisasiBiaya = Math.round((progress / 100) * item.biaya);
          const realisasiVolumeCalc =
            typeof item.volume === "number" && item.volume > 0
              ? Math.round(((progress / 100) * item.volume) * 100) / 100
              : item.realisasiVolume ?? "-";

          return {
            ...item,
            bobotPercent,
            realisasiBiaya,
            realisasiVolumeCalc,
          };
        });

        const totalRealisasiBiaya = Math.round(
          (progress / 100) * totalBiayaKonstruksi,
        );

        return {
          ...record,
          progresFisikKonstruksiPercent: progress,
          realisasiHaKonstruksi: realizedArea,
          biayaDigunakanKonstruksi: totalRealisasiBiaya,
          pekerjaanListWithBobot,
          photoClassification,
          linkedProject,
          linkedProjectId: linkedProject?.id,
          autoLinkedProjectId: autoLinkedProject?.id,
          adjustment,
        };
      }),
    [
      autoLinkedProjectByNo,
      resolveAdjustmentForRecord,
      projectByIdMap,
      autoAdaptMode,
    ],
  );

  const kecamatanList = useMemo(() => {
    const set = new Set<string>();
    projectReportData.forEach((p) => set.add(p.kecamatan));
    return Array.from(set).sort();
  }, [projectReportData]);

  const filteredData = useMemo(() => {
    return projectReportData.filter((item) => {
      const matchKecamatan =
        selectedKecamatan === "ALL" ||
        item.kecamatan.toLowerCase() === selectedKecamatan.toLowerCase();
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.poktan.toLowerCase().includes(query) ||
        item.desa.toLowerCase().includes(query) ||
        item.kecamatan.toLowerCase().includes(query) ||
        item.nomorSpk.toLowerCase().includes(query) ||
        item.ketuaPoktan.toLowerCase().includes(query) ||
        item.ketuaUpkk.toLowerCase().includes(query);

      if (activeTab === "rincian_sid") {
        if (
          photoFilter === "WITH_PHOTOS" &&
          item.photoClassification.totalPhotosCount === 0
        ) {
          return false;
        }
        if (
          photoFilter === "FULL_4_STAGES" &&
          (item.photoClassification.photos0.length === 0 ||
            item.photoClassification.photos50.length === 0 ||
            item.photoClassification.photos100.length === 0 ||
            item.photoClassification.photosPrasasti.length === 0)
        ) {
          return false;
        }
        if (
          photoFilter === "NO_PHOTOS" &&
          item.photoClassification.totalPhotosCount > 0
        ) {
          return false;
        }

        if (
          reportFilter === "HAS_DAILY" &&
          item.photoClassification.dailyReportsCount === 0
        ) {
          return false;
        }
        if (
          reportFilter === "HAS_WEEKLY" &&
          !item.photoClassification.latestWeeklySubmission
        ) {
          return false;
        }
      }

      return matchKecamatan && matchSearch;
    });
  }, [
    projectReportData,
    selectedKecamatan,
    searchQuery,
    activeTab,
    photoFilter,
    reportFilter,
  ]);

  const aggregates = useMemo(() => {
    let totalLuas = 0;
    let totalBiayaKonstruksi = 0;
    let totalBiayaDigunakanKonstruksi = 0;
    let totalRealisasiHaKonstruksi = 0;
    let totalBiayaOlahLahan = 0;
    let totalBiayaDigunakanOlahLahan = 0;
    let totalSp2d1 = 0;
    let totalSp2d2 = 0;
    let totalPhotosCount = 0;
    let poktanWithPhotosCount = 0;
    let totalDailyReportsCount = 0;

    filteredData.forEach((d) => {
      totalLuas += d.luasLahanHa;
      totalBiayaKonstruksi += d.totalBiayaKonstruksi;
      totalBiayaDigunakanKonstruksi += d.biayaDigunakanKonstruksi;
      totalRealisasiHaKonstruksi += d.realisasiHaKonstruksi;
      totalBiayaOlahLahan += d.totalBiayaOlahLahan;
      totalBiayaDigunakanOlahLahan += d.biayaDigunakanOlahLahan;
      totalSp2d1 += d.sp2d1Jumlah;
      totalSp2d2 += d.sp2d2Jumlah;
      totalPhotosCount += d.photoClassification.totalPhotosCount;
      if (d.photoClassification.totalPhotosCount > 0) {
        poktanWithPhotosCount += 1;
      }
      totalDailyReportsCount += d.photoClassification.dailyReportsCount;
    });

    return {
      totalLuas,
      totalBiayaKonstruksi,
      totalBiayaDigunakanKonstruksi,
      totalRealisasiHaKonstruksi,
      totalBiayaOlahLahan,
      totalBiayaDigunakanOlahLahan,
      totalSp2d1,
      totalSp2d2,
      totalPenyaluran: totalSp2d1 + totalSp2d2,
      totalPhotosCount,
      poktanWithPhotosCount,
      totalDailyReportsCount,
      avgProgressPercent:
        totalBiayaKonstruksi > 0
          ? Math.round(
              (totalBiayaDigunakanKonstruksi / totalBiayaKonstruksi) * 1000,
            ) / 10
          : 0,
    };
  }, [filteredData]);

  const handleExportCsv = () => {
    let csvHeader = "";
    let csvRows: string[] = [];

    if (activeTab === "rekapitulasi") {
      csvHeader =
        "No,Kabupaten,Kecamatan,Desa,Nama Poktan,Luas (Ha),Total Biaya Konstruksi,Biaya Digunakan Konstruksi,Realisasi Konstruksi (Ha),Progres Fisik Konstruksi (%),BAST Teknis UPKK,BAST UPKK ke PPK,BAST PPK ke KPA,BAST KPA ke Poktan,Total Biaya Olah Lahan,Biaya Digunakan Olah Lahan,Progres Fisik Olah Lahan (%),Realisasi Olah Lahan (Ha)";
      csvRows = filteredData.map((d) =>
        [
          d.no,
          `"${d.kabupaten}"`,
          `"${d.kecamatan}"`,
          `"${d.desa}"`,
          `"${d.poktan}"`,
          d.luasLahanHa,
          d.totalBiayaKonstruksi,
          d.biayaDigunakanKonstruksi,
          d.realisasiHaKonstruksi,
          `${d.progresFisikKonstruksiPercent}%`,
          `"${d.bastTeknisUpkk || ""}"`,
          `"${d.bastUpkkPpk || ""}"`,
          `"${d.bastPpkKpa || ""}"`,
          `"${d.bastKpaPoktan || ""}"`,
          d.totalBiayaOlahLahan,
          d.biayaDigunakanOlahLahan,
          `${d.progresFisikOlahLahanPercent}%`,
          d.realisasiHaOlahLahan,
        ].join(","),
      );
    } else if (activeTab === "database_spk") {
      csvHeader =
        "No,Kecamatan,Desa,Nama Poktan,SK CPCL,Nomor SPK,Tanggal SPK,Mulai,Selesai,Nama Bank,No Rekening,Ketua Poktan,NIK Ketua,Anggota,Ketua UPKK,NIK UPKK,SP2D 1,Jumlah SP2D 1,SP2D 2,Jumlah SP2D 2";
      csvRows = filteredData.map((d) =>
        [
          d.no,
          `"${d.kecamatan}"`,
          `"${d.desa}"`,
          `"${d.poktan}"`,
          `"${d.noTglSkCpcl}"`,
          `"${d.nomorSpk}"`,
          `"${d.tglSpk}"`,
          `"${d.tglMulai}"`,
          `"${d.tglSelesai}"`,
          `"${d.namaBank}"`,
          `'${d.noRekening}`,
          `"${d.ketuaPoktan}"`,
          `'${d.nikKetua}`,
          d.jumlahAnggota,
          `"${d.ketuaUpkk}"`,
          `'${d.nikUpkk}`,
          `"${d.sp2d1NoTgl}"`,
          d.sp2d1Jumlah,
          `"${d.sp2d2NoTgl || ""}"`,
          d.sp2d2Jumlah,
        ].join(","),
      );
    } else {
      csvHeader =
        "No,Kabupaten,Kecamatan,Desa,Nama Poktan,Luas Desain (Ha),Item Pekerjaan,Volume SID,Satuan,Biaya Rencana (Rp),Bobot Pekerjaan (%),Realisasi Volume,Satuan Realisasi,Realisasi Biaya (Rp),Progres Fisik (%),Jumlah Lap. Harian,Progres Mingguan Terkini,Tanggal Update Terakhir,URL Foto 0%,URL Foto 50%,URL Foto 100%,URL Foto Prasasti";
      csvRows = filteredData.flatMap((d) => {
        const photo0Url = d.photoClassification.photos0
          .map((x) => x.url)
          .join(" | ");
        const photo50Url = d.photoClassification.photos50
          .map((x) => x.url)
          .join(" | ");
        const photo100Url = d.photoClassification.photos100
          .map((x) => x.url)
          .join(" | ");
        const prasastiUrl = d.photoClassification.photosPrasasti
          .map((x) => x.url)
          .join(" | ");
        const weeklyText = d.photoClassification.latestWeeklySubmission
          ? `${d.photoClassification.latestWeeklySubmission.periodLabel} (${d.photoClassification.latestWeeklySubmission.actualProgress}%)`
          : "-";

        return d.pekerjaanListWithBobot.map((p) =>
          [
            d.no,
            `"${d.kabupaten}"`,
            `"${d.kecamatan}"`,
            `"${d.desa}"`,
            `"${d.poktan}"`,
            d.luasLahanHa,
            `"${p.namaPekerjaan}"`,
            `"${p.volume || ""}"`,
            `"${p.satuan || ""}"`,
            p.biaya,
            `"${p.bobotPercent.toFixed(2)}%"`,
            `"${p.realisasiVolumeCalc || ""}"`,
            `"${p.realisasiSatuan || p.satuan || ""}"`,
            p.realisasiBiaya,
            `"${d.progresFisikKonstruksiPercent.toFixed(1)}%"`,
            d.photoClassification.dailyReportsCount,
            `"${weeklyText}"`,
            `"${d.photoClassification.latestReportDate || "-"}"`,
            `"${photo0Url}"`,
            `"${photo50Url}"`,
            `"${photo100Url}"`,
            `"${prasastiUrl}"`,
          ].join(","),
        );
      });
    }

    const csvString = "\uFEFF" + [csvHeader, ...csvRows].join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const filename = `Laporan_Dinas_${activeTab}_Aceh_Tengah_${new Date().toISOString().slice(0, 10)}.csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success(`Unduhan ${filename} dimulai`);
  };

  const getBaselineStageMap = (
    poktanItem: (typeof projectReportData)[number],
  ): Record<string, PhotoStageKey[]> => {
    const existing = poktanItem.adjustment?.photoStageMap;
    if (existing && Object.keys(existing).length > 0) {
      return { ...existing };
    }
    const map: Record<string, PhotoStageKey[]> = {};
    const addStage = (
      list: ClassifiedPhotoItem[],
      stage: PhotoStageKey,
    ) => {
      for (const item of list) {
        const cur = map[item.photoKey] ?? [];
        if (!cur.includes(stage)) {
          map[item.photoKey] = [...cur, stage];
        }
      }
    };
    addStage(poktanItem.photoClassification.photos0, "0%");
    addStage(poktanItem.photoClassification.photos50, "50%");
    addStage(poktanItem.photoClassification.photos100, "100%");
    addStage(poktanItem.photoClassification.photosPrasasti, "Prasasti");
    return map;
  };

  const handleTogglePhotoStage = (
    poktanNo: number,
    photoKey: string,
    stage: PhotoStageKey,
  ) => {
    const poktanItem = projectReportData.find((p) => p.no === poktanNo);
    if (!poktanItem) return;
    const baseMap = getBaselineStageMap(poktanItem);
    const currentStages = baseMap[photoKey] ?? [];
    const nextStages = currentStages.includes(stage)
      ? currentStages.filter((s) => s !== stage)
      : [...currentStages, stage];
    baseMap[photoKey] = nextStages;

    updatePoktanAdjustment(poktanNo, (prev) => ({
      ...prev,
      stageOverrides: undefined,
      photoStageMap: baseMap,
    }));
  };

  const handleSetPhotoWorkItem = (
    poktanNo: number,
    photoKey: string,
    itemName: string,
  ) => {
    updatePoktanAdjustment(poktanNo, (prev) => {
      const nextWorkMap = { ...(prev.photoWorkItemMap ?? {}) };
      if (!itemName || itemName === "__ALL__") {
        delete nextWorkMap[photoKey];
      } else {
        nextWorkMap[photoKey] = itemName;
      }
      return { ...prev, photoWorkItemMap: nextWorkMap };
    });
  };

  const handleRotatePhoto = (poktanNo: number, photoKey: string) => {
    updatePoktanAdjustment(poktanNo, (prev) => {
      const nextVisual = { ...(prev.photoVisualMap ?? {}) };
      const cur = nextVisual[photoKey] ?? {};
      nextVisual[photoKey] = {
        ...cur,
        rotation: ((cur.rotation ?? 0) + 90) % 360,
      };
      return { ...prev, photoVisualMap: nextVisual };
    });
  };

  const handleTogglePhotoFit = (poktanNo: number, photoKey: string) => {
    updatePoktanAdjustment(poktanNo, (prev) => {
      const nextVisual = { ...(prev.photoVisualMap ?? {}) };
      const cur = nextVisual[photoKey] ?? {};
      nextVisual[photoKey] = {
        ...cur,
        fit: cur.fit === "contain" ? "cover" : "contain",
      };
      return { ...prev, photoVisualMap: nextVisual };
    });
  };

  const handleApplyPresetToPoktan = (
    poktanNo: number,
    mode: PhotoAutoAdaptMode,
  ) => {
    const poktanItem = projectReportData.find((p) => p.no === poktanNo);
    if (!poktanItem) return;
    const computedMap = computeAutoStageMap(
      poktanItem.photoClassification.rawPhotos,
      poktanItem.progresFisikKonstruksiPercent,
      mode,
    );
    updatePoktanAdjustment(poktanNo, (prev) => ({
      ...prev,
      stageOverrides: undefined,
      photoStageMap: computedMap,
    }));
    toast.success(
      mode === "distribute_all_4"
        ? `Foto Poktan ${poktanItem.poktan} disebar merata ke 4 tahap.`
        : `Foto Poktan ${poktanItem.poktan} disesuaikan otomatis secara kronologis.`,
    );
  };

  const handleLinkProjectToPoktan = (poktanNo: number, projectId: string) => {
    const targetRecord = DINAS_PROJECTS_DATA.find((r) => r.no === poktanNo);
    if (!targetRecord) return;

    if (projectId !== "__AUTO__") {
      const selectedProject = projectByIdMap.get(projectId);
      if (
        !selectedProject ||
        !isProjectPoktanCompatible(selectedProject, targetRecord)
      ) {
        toast.error(
          `Proyek tidak cocok dengan Poktan ${targetRecord.poktan} dan tidak dapat ditautkan lintas proyek.`,
        );
        return;
      }
      updatePoktanAdjustment(
        poktanNo,
        (prev) => ({
          ...prev,
          linkedProjectId: selectedProject.id,
        }),
        selectedProject.id,
      );
    } else {
      const autoLinked = autoLinkedProjectByNo.get(poktanNo);
      updatePoktanAdjustment(
        poktanNo,
        (prev) => ({
          ...prev,
          linkedProjectId: undefined,
        }),
        autoLinked?.id ?? null,
      );
    }
    toast.success("Sumber proyek Laporan Harian diperbarui.");
  };

  const activeAssistantPoktan = useMemo(() => {
    if (!photoAssistantTarget) return null;
    return (
      projectReportData.find((p) => p.no === photoAssistantTarget.poktanNo) ??
      null
    );
  }, [photoAssistantTarget, projectReportData]);

  const filterSummaryText = useMemo(() => {
    if (reportMode === "portfolio_live") {
      return [
        portfolioSearch.trim() ? `Cari "${portfolioSearch.trim()}"` : "",
        portfolioWorkTypeFilter !== "ALL"
          ? `Jenis: ${portfolioWorkTypeFilter}`
          : "",
        portfolioStatusFilter !== "ALL"
          ? `Status: ${portfolioStatusFilter}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return [
      selectedKecamatan !== "ALL" ? `Kec. ${selectedKecamatan}` : "",
      searchQuery.trim() ? `Cari "${searchQuery.trim()}"` : "",
      activeTab === "rincian_sid" && photoFilter !== "ALL"
        ? `Foto: ${photoFilter}`
        : "",
      activeTab === "rincian_sid" && reportFilter !== "ALL"
        ? `Laporan: ${reportFilter}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [
    reportMode,
    portfolioSearch,
    portfolioWorkTypeFilter,
    portfolioStatusFilter,
    selectedKecamatan,
    searchQuery,
    activeTab,
    photoFilter,
    reportFilter,
  ]);

  return (
    <div className="space-y-6">
      {isA4PrintViewOpen ? (
        <div className="space-y-4">
          {/* Clean A4 Preview Top Control Bar (hidden on print) */}
          <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-md backdrop-blur print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsA4PrintViewOpen(false)}
                className="gap-1.5"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                <span>Kembali ke Dashboard</span>
              </Button>
              {reportMode === "dinas_preset" && activeTab === "rincian_sid" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintShowSubItems((v) => !v)}
                  className="gap-1.5"
                >
                  <Layers className="size-3.5 text-primary" aria-hidden="true" />
                  <span>
                    {printShowSubItems
                      ? "Rincian Sub-Item SID: Ditampilkan"
                      : "Rincian Sub-Item SID: Dirangkum"}
                  </span>
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {reportMode === "dinas_preset" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="gap-1.5"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  <span>Ekspor CSV</span>
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 font-semibold"
              >
                <Printer className="size-3.5" aria-hidden="true" />
                <span>Cetak Dokumen A4</span>
              </Button>
            </div>
          </div>

          {/* Centered A4 Paper Sheet Backdrop */}
          <div className="overflow-x-auto rounded-xl border border-border bg-slate-200/80 p-3 sm:p-6 dark:bg-slate-900/70 print:overflow-visible print:border-0 print:bg-white print:p-0">
            <DinasA4CleanDocumentSheet
              isPreviewVisible
              reportMode={reportMode}
              activeTab={activeTab}
              filteredData={filteredData}
              aggregates={aggregates}
              filteredPortfolioRows={filteredPortfolioRows}
              portfolioSummary={portfolioSummary}
              canViewFinancials={canViewFinancials}
              printShowSubItems={printShowSubItems}
              filterSummaryText={filterSummaryText}
              printedDateLabel={printedDateLabel}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Hidden clean A4 document for direct Ctrl+P printing */}
          <DinasA4CleanDocumentSheet
            isPreviewVisible={false}
            reportMode={reportMode}
            activeTab={activeTab}
            filteredData={filteredData}
            aggregates={aggregates}
            filteredPortfolioRows={filteredPortfolioRows}
            portfolioSummary={portfolioSummary}
            canViewFinancials={canViewFinancials}
            printShowSubItems={showAllItems}
            filterSummaryText={filterSummaryText}
            printedDateLabel={printedDateLabel}
          />

          {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={reportMode === "portfolio_live" ? "default" : "outline"}
            onClick={() => setReportMode("portfolio_live")}
            className="gap-1.5"
          >
            <Building2 className="size-3.5" aria-hidden="true" />
            <span>Rekap Portofolio Live DB</span>
            <Badge
              variant={
                reportMode === "portfolio_live" ? "secondary" : "outline"
              }
              className="ml-0.5 tabular-nums"
            >
              {portfolioRows.length}
            </Badge>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              reportMode === "dinas_preset" && activeTab !== "rincian_sid"
                ? "default"
                : "outline"
            }
            onClick={() => setReportMode("dinas_preset")}
            className="gap-1.5"
          >
            <Landmark className="size-3.5" aria-hidden="true" />
            <span>Preset Dinas Aceh Tengah</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              reportMode === "dinas_preset" && activeTab === "rincian_sid"
                ? "default"
                : "outline"
            }
            onClick={() => {
              setReportMode("dinas_preset");
              setActiveTab("rincian_sid");
            }}
            className="gap-1.5"
          >
            <ImageIcon className="size-3.5" aria-hidden="true" />
            <span>Hasil SID &amp; Foto</span>
          </Button>
        </div>
        <span className="type-p3 text-muted-foreground">
          {reportMode === "portfolio_live"
            ? hasLiveDbMetadata
              ? "Tersinkron langsung dengan progres Kurva-S & proyek aktif di database"
              : "Data ringkas dari database proyek (akses Master Proyek untuk kolom lengkap)"
            : "Template resmi Dinas Aceh Tengah (38 Poktan / 754 Ha) terintegrasi progres live"}
        </span>
      </div>

      {reportMode === "portfolio_live" ? (
        <div className="space-y-6">
          {/* Portfolio Live DB Header */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-xs">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex items-start gap-3.5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Briefcase className="size-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Rekap Otomatis Live DB</Badge>
                    <span className="type-p3 text-muted-foreground">
                      Konsultansi &amp; Konstruksi Fisik
                    </span>
                  </div>
                  <h2 className="type-h2 mt-1 text-foreground">
                    Rekapitulasi Portofolio Proyek &amp; Jenis Pekerjaan
                  </h2>
                  <p className="type-p2 text-muted-foreground">
                    Rekap otomatis seluruh proyek aktif di database (DED,
                    Konsultan Pengawas, Gedung, Jalan &amp; Jembatan, Irigasi,
                    MEP, dan spesialisasi lainnya) beserta Kurva-S rencana.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingKey !== null}
                  onClick={() => void handleDownloadPortfolio("xlsx")}
                  className="gap-1.5"
                >
                  {exportingKey === "portfolio-xlsx" ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileSpreadsheet
                      className="size-3.5 text-emerald-600"
                      aria-hidden="true"
                    />
                  )}
                  <span>Ekspor Excel (.xlsx)</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingKey !== null}
                  onClick={() => void handleDownloadPortfolio("pdf")}
                  className="gap-1.5"
                >
                  {exportingKey === "portfolio-pdf" ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText
                      className="size-3.5 text-rose-600"
                      aria-hidden="true"
                    />
                  )}
                  <span>Ekspor PDF</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleOpenA4PrintView}
                  className="gap-1.5"
                >
                  <Printer className="size-3.5" aria-hidden="true" />
                  <span>Cetak</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Portfolio KPI Summary */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="type-p3 text-muted-foreground">
                Total Proyek Ditampilkan
              </p>
              <p className="type-kpi mt-1 text-foreground tabular-nums">
                {portfolioSummary.count}{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  dari {portfolioRows.length} proyek
                </span>
              </p>
              <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
                Deviasi tertinggal (&lt;-5%):{" "}
                {portfolioSummary.behindScheduleCount} proyek
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="type-p3 text-muted-foreground">
                Rata-rata Progres Aktual
              </p>
              <p className="type-kpi mt-1 text-foreground tabular-nums">
                {portfolioSummary.avgProgress.toFixed(1)}%
              </p>
              <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
                {portfolioSummary.avgPlanned !== null
                  ? `Rata-rata Rencana Kurva-S: ${portfolioSummary.avgPlanned.toFixed(1)}%`
                  : "Jadwal Kurva-S belum lengkap"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <p className="type-p3 text-muted-foreground">
                Komposisi Jenis Pekerjaan
              </p>
              <p className="type-kpi mt-1 text-foreground tabular-nums">
                {portfolioSummary.consultancyCount}{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  Konsultansi · {portfolioSummary.physicalCount} Fisik
                </span>
              </p>
              <p className="type-p3 mt-1 text-muted-foreground">
                {portfolioSummary.workTypeBreakdown.length} kategori aktif
              </p>
            </div>

            {canViewFinancials ? (
              <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
                <p className="type-p3 text-muted-foreground">
                  Total Pagu &amp; Realisasi Biaya
                </p>
                <p className="type-kpi mt-1 text-foreground tabular-nums">
                  {formatCompactRupiah(portfolioSummary.totalPagu)}
                </p>
                <p className="type-p3 mt-1 font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                  Realisasi:{" "}
                  {formatCompactRupiah(portfolioSummary.totalRealized)} (
                  {portfolioSummary.realizationPercent.toFixed(1)}%)
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
                <p className="type-p3 text-muted-foreground">
                  Total Laporan Harian
                </p>
                <p className="type-kpi mt-1 text-foreground tabular-nums">
                  {portfolioSummary.totalReports}
                </p>
                <p className="type-p3 mt-1 text-muted-foreground">
                  Dokumentasi lapangan terekam
                </p>
              </div>
            )}
          </div>

          {/* Interactive Work Type Breakdown Pills */}
          {portfolioSummary.workTypeBreakdown.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="type-p3 font-semibold text-foreground">
                  Ringkasan per Jenis Pekerjaan (Klik untuk filter)
                </p>
                {portfolioWorkTypeFilter !== "ALL" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPortfolioWorkTypeFilter("ALL")}
                    className="h-7 px-2 text-xs"
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {portfolioSummary.workTypeBreakdown.map((item) => {
                  const isActive = portfolioWorkTypeFilter === item.workTypeId;
                  return (
                    <button
                      key={item.workTypeId}
                      type="button"
                      onClick={() =>
                        setPortfolioWorkTypeFilter(
                          isActive ? "ALL" : item.workTypeId,
                        )
                      }
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors",
                        isActive
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-background hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
                          WORK_TYPE_TONE_CLASSES[item.tone],
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="type-p3 font-semibold text-foreground tabular-nums">
                        {item.count} proyek
                      </span>
                      <span className="type-p3 text-muted-foreground tabular-nums">
                        · {item.avgProgress.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Portfolio Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={portfolioSearch}
                  onChange={(event) => setPortfolioSearch(event.target.value)}
                  placeholder="Cari kode, nama proyek, klien, PIC..."
                  className="pl-8"
                />
              </div>

              <Select
                value={portfolioWorkTypeFilter}
                onValueChange={setPortfolioWorkTypeFilter}
              >
                <SelectTrigger className="w-60">
                  <Filter
                    className="mr-1.5 size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <SelectValue placeholder="Semua Jenis Pekerjaan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">
                    Semua Jenis Pekerjaan ({portfolioRows.length})
                  </SelectItem>
                  <SelectItem value="CONSULTANCY">
                    Semua Jasa Konsultansi
                  </SelectItem>
                  <SelectItem value="PHYSICAL">
                    Semua Konstruksi Fisik
                  </SelectItem>
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
                value={portfolioStatusFilter}
                onValueChange={setPortfolioStatusFilter}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  <SelectItem value="RUNNING">Berjalan</SelectItem>
                  <SelectItem value="PENDING_SETUP">Persiapan</SelectItem>
                  <SelectItem value="HOLD">Tertahan</SelectItem>
                  <SelectItem value="DONE">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="type-p3 text-muted-foreground tabular-nums">
              Menampilkan{" "}
              <strong className="font-semibold text-foreground">
                {filteredPortfolioRows.length}
              </strong>{" "}
              proyek
            </p>
          </div>

          {filteredPortfolioRows.length === 0 ? (
            <EmptyState
              title="Tidak ada proyek yang sesuai filter"
              description="Ubah kata kunci pencarian, kategori jenis pekerjaan, atau status proyek."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
              <Table pagination={false}>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12 text-center">No</TableHead>
                    <TableHead className="min-w-[230px]">
                      Kode &amp; Nama Proyek
                    </TableHead>
                    <TableHead className="min-w-[170px]">
                      Jenis Pekerjaan
                    </TableHead>
                    <TableHead className="min-w-[160px]">
                      Mitra / Klien &amp; PIC
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aktual</TableHead>
                    <TableHead className="text-right">Rencana</TableHead>
                    <TableHead className="text-right">Deviasi</TableHead>
                    <TableHead className="text-center">
                      Laporan Harian
                    </TableHead>
                    {canViewFinancials && (
                      <>
                        <TableHead className="text-right">
                          Pagu Anggaran
                        </TableHead>
                        <TableHead className="text-right">Realisasi</TableHead>
                      </>
                    )}
                    <TableHead className="text-right print:hidden">
                      Laporan Proyek
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPortfolioRows.map((row, idx) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-center text-muted-foreground tabular-nums">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground">
                              {row.code}
                            </span>
                          </div>
                          <p className="font-medium text-foreground">
                            {row.title}
                          </p>
                          {row.locationLabel !== "-" && (
                            <p className="type-p3 text-muted-foreground">
                              {row.locationLabel}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                              WORK_TYPE_TONE_CLASSES[row.workTypeBadge.tone],
                            )}
                          >
                            {row.workTypeBadge.shortLabel}
                          </span>
                          <p className="type-p3 text-muted-foreground">
                            {row.workTypeBadge.groupShortLabel}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs">
                          <p className="font-medium text-foreground">
                            {row.clientLabel}
                          </p>
                          <p className="text-muted-foreground">
                            PIC: {row.fieldPicName}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{row.statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.actualProgress.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {row.plannedProgress !== null
                          ? `${row.plannedProgress.toFixed(1)}%`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.deviation !== null ? (
                          <span
                            className={cn(
                              "font-semibold",
                              row.deviation >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : row.deviation < -10
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            {row.deviation >= 0 ? "+" : ""}
                            {row.deviation.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs tabular-nums">
                        <span className="font-medium text-foreground">
                          {row.reportsCount}x
                        </span>
                        {row.latestReportDate && (
                          <p className="text-muted-foreground">
                            {row.latestReportDate}
                          </p>
                        )}
                      </TableCell>
                      {canViewFinancials && (
                        <>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatCompactRupiah(row.paguValue)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                            {formatCompactRupiah(row.realizedValue)}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right print:hidden">
                        {row.id ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={exportingKey !== null}
                              onClick={() =>
                                void handleDownloadProjectReport(
                                  row.id!,
                                  row.code,
                                  "progress",
                                  "pdf",
                                )
                              }
                              className="h-7 px-2 text-xs"
                              title="Unduh PDF Progres & Kurva-S"
                            >
                              PDF
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={exportingKey !== null}
                              onClick={() =>
                                void handleDownloadProjectReport(
                                  row.id!,
                                  row.code,
                                  "progress",
                                  "xlsx",
                                )
                              }
                              className="h-7 px-2 text-xs"
                              title="Unduh Excel Progres"
                            >
                              XLSX
                            </Button>
                            {canViewFinancials && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={exportingKey !== null}
                                onClick={() =>
                                  void handleDownloadProjectReport(
                                    row.id!,
                                    row.code,
                                    "financial",
                                    "xlsx",
                                  )
                                }
                                className="h-7 px-2 text-xs"
                                title="Unduh Excel Keuangan RAB/RAP"
                              >
                                RAB
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={5}>
                      Total / Rata-rata ({filteredPortfolioRows.length} proyek)
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {portfolioSummary.avgProgress.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {portfolioSummary.avgPlanned !== null
                        ? `${portfolioSummary.avgPlanned.toFixed(1)}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {portfolioSummary.avgPlanned !== null
                        ? `${(portfolioSummary.avgProgress - portfolioSummary.avgPlanned) >= 0 ? "+" : ""}${(portfolioSummary.avgProgress - portfolioSummary.avgPlanned).toFixed(1)}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {portfolioSummary.totalReports}x
                    </TableCell>
                    {canViewFinancials && (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {formatCompactRupiah(portfolioSummary.totalPagu)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 tabular-nums dark:text-emerald-400">
                          {formatCompactRupiah(portfolioSummary.totalRealized)}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="print:hidden" />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Official Dinas Report Header */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 shadow-xs">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Landmark className="size-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Format Laporan Resmi Dinas</Badge>
                <span className="type-p3 text-muted-foreground">
                  Tahun Anggaran 2026
                </span>
              </div>
              <h2 className="type-h2 mt-1 text-foreground">
                {DINAS_REPORT_METADATA.kegiatan}
              </h2>
              <p className="type-p2 text-muted-foreground">
                {DINAS_REPORT_METADATA.satker} · Kabupaten Aceh Tengah (Pagu: Rp
                10.179.000.000 · 754 Ha · 38 Poktan)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-1.5"
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>Ekspor CSV</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenA4PrintView}
              className="gap-1.5"
            >
              <Printer className="size-3.5" aria-hidden="true" />
              <span>Cetak Laporan</span>
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "rekapitulasi" ? "default" : "outline"}
            onClick={() => setActiveTab("rekapitulasi")}
            className="gap-1.5"
          >
            <Layers className="size-3.5" aria-hidden="true" />
            <span>Rekapitulasi Fisik</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "rincian_sid" ? "default" : "outline"}
            onClick={() => setActiveTab("rincian_sid")}
            className="gap-1.5"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            <span>Hasil SID &amp; Foto</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "database_spk" ? "default" : "outline"}
            onClick={() => setActiveTab("database_spk")}
            className="gap-1.5"
          >
            <UserCheck className="size-3.5" aria-hidden="true" />
            <span>Database SPK &amp; SP2D</span>
          </Button>
        </div>
      </div>

            {/* Metric Summaries */}
      {activeTab === "rincian_sid" ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Total Poktan</p>
            <p className="type-kpi mt-1 text-foreground">
              {filteredData.length}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                / {projectReportData.length}
              </span>
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              {aggregates.totalLuas.toFixed(2)} Ha Desain
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Pagu Konstruksi</p>
            <p className="type-p2 mt-1 font-mono font-bold text-primary tabular-nums">
              Rp {(aggregates.totalBiayaKonstruksi / 1000000).toLocaleString("id-ID")} Jt
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Pagu Fisik 38 Poktan
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Realisasi Biaya</p>
            <p className="type-p2 mt-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              Rp {(aggregates.totalBiayaDigunakanKonstruksi / 1000000).toLocaleString("id-ID")} Jt
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              {aggregates.avgProgressPercent}% dari Pagu
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Rata-rata Progres</p>
            <p className="type-kpi mt-1 text-emerald-600 dark:text-emerald-400">
              {aggregates.avgProgressPercent}%
            </p>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, aggregates.avgProgressPercent)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Foto Lapangan</p>
            <p className="type-kpi mt-1 text-foreground">
              {aggregates.totalPhotosCount}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                Foto
              </span>
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              {aggregates.poktanWithPhotosCount} Poktan Terdata
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Laporan Masuk</p>
            <p className="type-kpi mt-1 text-foreground">
              {aggregates.totalDailyReportsCount}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                Lap. Harian
              </span>
            </p>
            <p className="type-p3 mt-0.5 text-muted-foreground">
              Sinkronisasi Live DB
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
            <p className="type-p3 text-muted-foreground">Total Poktan Terdaftar</p>
            <p className="type-kpi mt-1 text-foreground">
              {filteredData.length}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                dari 38 Poktan
              </span>
            </p>
            <p className="type-p3 mt-1 text-muted-foreground">
              9 Kecamatan se-Aceh Tengah
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
            <p className="type-p3 text-muted-foreground">
              Total Luas Lahan (CPCL)
            </p>
            <p className="type-kpi mt-1 text-foreground">
              {aggregates.totalLuas.toLocaleString("id-ID")}{" "}
              <span className="type-p3 font-normal text-muted-foreground">
                Hektar
              </span>
            </p>
            <p className="type-p3 mt-1 font-medium text-success tabular-nums">
              Realisasi:{" "}
              {aggregates.totalRealisasiHaKonstruksi.toLocaleString("id-ID")} Ha
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
            <p className="type-p3 text-muted-foreground">
              Pagu Konstruksi &amp; Olah Lahan
            </p>
            <p className="type-kpi mt-1 text-foreground">
              Rp{" "}
              {(
                aggregates.totalBiayaKonstruksi + aggregates.totalBiayaOlahLahan
              ).toLocaleString("id-ID")}
            </p>
            <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
              Digunakan: Rp{" "}
              {(
                aggregates.totalBiayaDigunakanKonstruksi +
                aggregates.totalBiayaDigunakanOlahLahan
              ).toLocaleString("id-ID")}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
            <p className="type-p3 text-muted-foreground">
              Tersalurkan SP2D (Bank)
            </p>
            <p className="type-kpi mt-1 text-success">
              Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
            </p>
            <p className="type-p3 mt-1 text-muted-foreground tabular-nums">
              T1: Rp {aggregates.totalSp2d1.toLocaleString("id-ID")} · T2: Rp{" "}
              {aggregates.totalSp2d2.toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari Poktan, Desa, SPK, Ketua..."
              className="pl-8"
            />
          </div>

          <Select
            value={selectedKecamatan}
            onValueChange={setSelectedKecamatan}
          >
            <SelectTrigger className="w-52">
              <Filter
                className="mr-1.5 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <SelectValue placeholder="Semua Kecamatan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">
                Semua Kecamatan ({projectReportData.length})
              </SelectItem>
              {kecamatanList.map((kec) => (
                <SelectItem key={kec} value={kec}>
                  Kec. {kec}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="type-p3 text-muted-foreground tabular-nums">
          Menampilkan{" "}
          <strong className="font-semibold text-foreground">
            {filteredData.length}
          </strong>{" "}
          baris data
        </p>
      </div>

      {filteredData.length === 0 ? (
        <EmptyState
          title="Data laporan dinas tidak ditemukan"
          description="Coba ubah filter kecamatan atau kata kunci pencarian."
        />
      ) : (
        <>
          {/* TAB 1: Rekapitulasi */}
          {activeTab === "rekapitulasi" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div>
                <h3 className="type-h3 text-foreground">
                  Tabel 1: Rekapitulasi Realisasi Fisik Konstruksi &amp; Olah
                  Lahan
                </h3>
                <p className="type-p3 mt-0.5 text-muted-foreground">
                  Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026
                </p>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="text-center">
                      No
                    </TableHead>
                    <TableHead rowSpan={2}>Kecamatan</TableHead>
                    <TableHead rowSpan={2}>Desa / Kampung</TableHead>
                    <TableHead rowSpan={2}>Nama Poktan</TableHead>
                    <TableHead rowSpan={2} className="text-right">
                      Luas (Ha)
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      Konstruksi
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      BAST Fisik
                    </TableHead>
                    <TableHead colSpan={4} className="text-center">
                      Olah Lahan
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right">Biaya (Rp)</TableHead>
                    <TableHead className="text-right">Digunakan (Rp)</TableHead>
                    <TableHead className="text-right">Realisasi (Ha)</TableHead>
                    <TableHead className="text-center">% Fisik</TableHead>
                    <TableHead className="text-center">UPKK</TableHead>
                    <TableHead className="text-center">UPKK-PPK</TableHead>
                    <TableHead className="text-center">PPK-KPA</TableHead>
                    <TableHead className="text-center">KPA-Poktan</TableHead>
                    <TableHead className="text-right">Biaya (Rp)</TableHead>
                    <TableHead className="text-right">Digunakan (Rp)</TableHead>
                    <TableHead className="text-center">% Fisik</TableHead>
                    <TableHead className="text-right">Realisasi (Ha)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((d) => (
                    <TableRow key={d.no}>
                      <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                        {d.no}
                      </TableCell>
                      <TableCell className="type-p2 font-medium text-foreground">
                        {d.kecamatan}
                      </TableCell>
                      <TableCell className="type-p3 text-muted-foreground">
                        {d.desa}
                      </TableCell>
                      <TableCell className="type-p2 font-semibold text-foreground">
                        {d.poktan}
                      </TableCell>
                      <TableCell className="type-p2 text-right font-medium tabular-nums">
                        {d.luasLahanHa}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                        {d.totalBiayaKonstruksi.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-foreground tabular-nums">
                        {d.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-medium tabular-nums">
                        {d.realisasiHaKonstruksi.toLocaleString("id-ID", {
                          maximumFractionDigits: 5,
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {d.progresFisikKonstruksiPercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastTeknisUpkk || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastUpkkPpk || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastPpkKpa || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-center text-muted-foreground">
                        {d.bastKpaPoktan || "—"}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-muted-foreground tabular-nums">
                        {d.totalBiayaOlahLahan.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="type-p3 text-right font-mono text-foreground tabular-nums">
                        {d.biayaDigunakanOlahLahan.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="tabular-nums">
                          {d.progresFisikOlahLahanPercent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="type-p3 text-right font-medium tabular-nums">
                        {d.realisasiHaOlahLahan}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="type-p2 text-center font-bold">
                      Total Keseluruhan ({filteredData.length} Poktan)
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalLuas.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalRealisasiHaKonstruksi.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-center font-bold">
                      100%
                    </TableCell>
                    <TableCell
                      colSpan={4}
                      className="type-p3 text-center text-muted-foreground"
                    >
                      Selesai &amp; BAST Lengkap
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaOlahLahan.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalBiayaDigunakanOlahLahan.toLocaleString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell className="type-p3 text-center font-bold">
                      100%
                    </TableCell>
                    <TableCell className="type-p3 text-right font-mono font-bold tabular-nums">
                      {aggregates.totalLuas.toLocaleString("id-ID")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

                    {/* TAB 2: Hasil SID & Dokumentasi Foto (Master Table 38 Poktan & Lightbox) */}
          {activeTab === "rincian_sid" && (
            <div className="space-y-4">
              {/* Toolbar & Filters for Hasil SID & Foto */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1">
                    <Button
                      type="button"
                      variant={
                        sidViewMode === "excel_table" ? "secondary" : "ghost"
                      }
                      size="xs"
                      onClick={() => setSidViewMode("excel_table")}
                      className="gap-1.5 font-medium"
                    >
                      <FileSpreadsheet className="size-3.5 text-primary" />
                      <span className="hidden sm:inline">
                        Tabel Master (Excel)
                      </span>
                      <span className="sm:hidden">Tabel Excel</span>
                    </Button>
                    <Button
                      type="button"
                      variant={
                        sidViewMode === "mobile_cards" ? "secondary" : "ghost"
                      }
                      size="xs"
                      onClick={() => setSidViewMode("mobile_cards")}
                      className="gap-1.5 font-medium"
                    >
                      <Layers className="size-3.5 text-primary" />
                      <span className="hidden sm:inline">Tampilan Kartu</span>
                      <span className="sm:hidden">Kartu</span>
                    </Button>
                  </div>

                  {sidViewMode === "excel_table" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowAllItems((v) => !v)}
                      className="gap-1.5 text-xs"
                    >
                      {showAllItems ? (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {showAllItems
                          ? "Ringkas (Sembunyikan Sub-Item)"
                          : "Buka Semua Rincian Item SID"}
                      </span>
                    </Button>
                  )}

                  {/* System Bantu Sesuaikan Foto Button */}
                  <Button
                    type="button"
                    variant="default"
                    size="xs"
                    onClick={() => {
                      const preferred =
                        filteredData.find(
                          (item) => item.photoClassification.totalPhotosCount > 0,
                        ) ??
                        filteredData[0] ??
                        null;
                      if (preferred) {
                        setPhotoAssistantTarget({ poktanNo: preferred.no });
                      } else {
                        toast.info(
                          "Tidak ada Poktan pada filter saat ini untuk disesuaikan.",
                        );
                      }
                    }}
                    className="gap-1.5 text-xs font-semibold shadow-2xs"
                  >
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    <span>Sistem Bantu Sesuaikan Foto</span>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Auto Adapt Mode Dropdown */}
                  <Select
                    value={autoAdaptMode}
                    onValueChange={(val) =>
                      handleChangeAutoAdaptMode(val as PhotoAutoAdaptMode)
                    }
                  >
                    <SelectTrigger
                      className="h-8 w-[205px] text-xs"
                      title="Mode Otomatis Penyesuaian Foto Laporan Harian"
                    >
                      <Sparkles className="mr-1 size-3.5 text-primary" />
                      <SelectValue placeholder="Mode Otomatis Foto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smart_chronological">
                        Otomatis Cerdas (Lap. Harian)
                      </SelectItem>
                      <SelectItem value="distribute_all_4">
                        Sebar Merata 4 Tahap (0-100%)
                      </SelectItem>
                      <SelectItem value="strict_threshold">
                        Ketat Sesuai % Laporan Harian
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Photo Filter Dropdown */}
                  <Select
                    value={photoFilter}
                    onValueChange={(val) =>
                      setPhotoFilter(
                        val as
                          | "ALL"
                          | "WITH_PHOTOS"
                          | "FULL_4_STAGES"
                          | "NO_PHOTOS",
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-[165px] text-xs">
                      <ImageIcon className="mr-1 size-3.5 text-muted-foreground" />
                      <SelectValue placeholder="Status Foto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Foto (38 Poktan)</SelectItem>
                      <SelectItem value="WITH_PHOTOS">Ada Foto Terunggah</SelectItem>
                      <SelectItem value="FULL_4_STAGES">Lengkap 4 Tahap</SelectItem>
                      <SelectItem value="NO_PHOTOS">Belum Ada Foto</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Report Filter Dropdown */}
                  <Select
                    value={reportFilter}
                    onValueChange={(val) =>
                      setReportFilter(val as "ALL" | "HAS_DAILY" | "HAS_WEEKLY")
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <FileText className="mr-1 size-3.5 text-muted-foreground" />
                      <SelectValue placeholder="Status Laporan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Laporan</SelectItem>
                      <SelectItem value="HAS_DAILY">Ada Lap. Harian</SelectItem>
                      <SelectItem value="HAS_WEEKLY">Ada SP Mingguan</SelectItem>
                    </SelectContent>
                  </Select>

                  <Badge variant="outline" className="hidden text-xs sm:inline-flex">
                    {filteredData.length} Poktan · {aggregates.totalPhotosCount} Foto
                  </Badge>
                </div>
              </div>

              {/* TABLE VIEW (EXCEL FORMAT) */}
              {sidViewMode === "excel_table" && (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
                  <div className="overflow-x-auto">
                    <Table pagination={false} className="min-w-[1550px]">
                      <TableHeader className="sticky top-0 z-10 bg-muted/70 text-xs">
                        {/* Tier 1 Header */}
                        <TableRow className="border-b border-border/80">
                          <TableHead
                            rowSpan={2}
                            className="w-12 border-r border-border/60 text-center font-bold text-foreground"
                          >
                            No
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="min-w-[130px] border-r border-border/60 font-bold text-foreground"
                          >
                            Kecamatan &amp; Desa
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="min-w-[170px] border-r border-border/60 font-bold text-foreground"
                          >
                            Kelompok Tani (Poktan)
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="w-24 border-r border-border/60 text-right font-bold text-foreground"
                          >
                            Luas Desain (Ha)
                          </TableHead>
                          <TableHead
                            colSpan={5}
                            className="border-r border-border/60 bg-primary/10 py-2 text-center font-bold text-primary"
                          >
                            HASIL SID (RENCANA DESAIN)
                          </TableHead>
                          <TableHead
                            colSpan={5}
                            className="border-r border-border/60 bg-emerald-500/10 py-2 text-center font-bold text-emerald-600 dark:text-emerald-400"
                          >
                            HASIL FISIK KONSTRUKSI &amp; LAPORAN
                          </TableHead>
                          <TableHead
                            colSpan={4}
                            className="bg-amber-500/10 py-2 text-center font-bold text-amber-600 dark:text-amber-400"
                          >
                            DOKUMENTASI FOTO LAPANGAN (4 TAHAP)
                          </TableHead>
                        </TableRow>

                        {/* Tier 2 Header */}
                        <TableRow className="border-b border-border/80 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {/* HASIL SID */}
                          <TableHead className="min-w-[160px] bg-primary/5">
                            Pekerjaan
                          </TableHead>
                          <TableHead className="w-20 bg-primary/5 text-right">
                            Vol SID
                          </TableHead>
                          <TableHead className="w-14 bg-primary/5 text-center">
                            Sat
                          </TableHead>
                          <TableHead className="w-28 bg-primary/5 text-right">
                            Biaya (Rp)
                          </TableHead>
                          <TableHead className="w-20 border-r border-border/60 bg-primary/5 text-right font-semibold text-primary">
                            Bobot (%)
                          </TableHead>

                          {/* HASIL FISIK KONSTRUKSI */}
                          <TableHead className="w-24 bg-emerald-500/5 text-right">
                            Realisasi Vol
                          </TableHead>
                          <TableHead className="w-14 bg-emerald-500/5 text-center">
                            Sat
                          </TableHead>
                          <TableHead className="w-28 bg-emerald-500/5 text-right">
                            Realisasi (Rp)
                          </TableHead>
                          <TableHead className="w-24 bg-emerald-500/5 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                            Progres Fisik
                          </TableHead>
                          <TableHead className="min-w-[140px] border-r border-border/60 bg-emerald-500/5">
                            Laporan Lapangan
                          </TableHead>

                          {/* FOTO DOKUMENTASI */}
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Foto 0%
                          </TableHead>
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Foto 50%
                          </TableHead>
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Foto 100%
                          </TableHead>
                          <TableHead className="w-24 bg-amber-500/5 text-center">
                            Prasasti
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {filteredData.map((p) => {
                          const isExpanded =
                            showAllItems || expandedPoktanNos.has(p.no);
                          const photos = p.photoClassification;

                          return (
                            <Fragment key={`poktan-row-${p.no}`}>
                              {/* Main Poktan Summary Row */}
                              <TableRow
                                key={`poktan-summary-${p.no}`}
                                className="border-t-2 border-border/80 bg-muted/20 font-medium transition hover:bg-muted/30"
                              >
                                <TableCell className="border-r border-border/60 text-center font-mono text-xs font-bold text-foreground">
                                  {p.no}
                                </TableCell>
                                <TableCell className="border-r border-border/60">
                                  <span className="block text-xs font-bold text-foreground">
                                    {p.kecamatan}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    Desa {p.desa}
                                  </span>
                                </TableCell>
                                <TableCell className="border-r border-border/60">
                                  <div className="flex items-start gap-1.5">
                                    {!showAllItems && (
                                      <button
                                        type="button"
                                        onClick={() => togglePoktan(p.no)}
                                        className="mt-0.5 rounded-sm p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                        aria-label={
                                          isExpanded
                                            ? "Tutup rincian item"
                                            : "Buka rincian item"
                                        }
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="size-3.5" />
                                        ) : (
                                          <ChevronRight className="size-3.5" />
                                        )}
                                      </button>
                                    )}
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <div className="flex flex-wrap items-center gap-1">
                                        <span className="text-xs font-bold text-foreground">
                                          {p.poktan}
                                        </span>
                                        {photos.isManuallyAdjusted && (
                                          <Badge
                                            variant="secondary"
                                            className="px-1 py-0 text-[9px]"
                                          >
                                            Disesuaikan
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="block font-mono text-[10px] text-muted-foreground">
                                        SPK: {p.nomorSpk || "-"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPhotoAssistantTarget({
                                            poktanNo: p.no,
                                          })
                                        }
                                        className="mt-0.5 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/15 print:hidden"
                                      >
                                        <SlidersHorizontal className="size-2.5" />
                                        <span>Sesuaikan Foto</span>
                                      </button>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="border-r border-border/60 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                                  {p.luasLahanHa.toFixed(2)} Ha
                                </TableCell>

                                {/* HASIL SID Summary */}
                                <TableCell className="bg-primary/5 text-xs font-semibold text-primary">
                                  Total Konstruksi ({p.pekerjaanListWithBobot.length} Item)
                                </TableCell>
                                <TableCell className="bg-primary/5 text-right font-mono text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-primary/5 text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-primary/5 text-right font-mono text-xs font-bold tabular-nums text-primary">
                                  Rp {p.totalBiayaKonstruksi.toLocaleString("id-ID")}
                                </TableCell>
                                <TableCell className="border-r border-border/60 bg-primary/5 text-right font-mono text-xs font-bold tabular-nums text-primary">
                                  100.0%
                                </TableCell>

                                {/* HASIL FISIK KONSTRUKSI Summary */}
                                <TableCell className="bg-emerald-500/5 text-right font-mono text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-emerald-500/5 text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="bg-emerald-500/5 text-right font-mono text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                  Rp {p.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                                </TableCell>
                                <TableCell className="bg-emerald-500/5 text-center">
                                  <Badge
                                    variant={
                                      p.progresFisikKonstruksiPercent >= 100
                                        ? "success"
                                        : p.progresFisikKonstruksiPercent > 0
                                          ? "default"
                                          : "secondary"
                                    }
                                    className="font-mono text-[11px] font-bold"
                                  >
                                    {p.progresFisikKonstruksiPercent.toFixed(1)}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="border-r border-border/60 bg-emerald-500/5 text-xs">
                                  <div className="space-y-0.5">
                                    <Badge
                                      variant={
                                        photos.dailyReportsCount > 0
                                          ? "outline"
                                          : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {photos.dailyReportsCount > 0
                                        ? `${photos.dailyReportsCount} Lap. Harian`
                                        : "Belum Ada Lap."}
                                    </Badge>
                                    {photos.latestWeeklySubmission && (
                                      <div className="text-[10px] font-medium text-muted-foreground">
                                        {photos.latestWeeklySubmission.periodLabel}:{" "}
                                        <span className="font-mono font-bold text-foreground">
                                          {photos.latestWeeklySubmission.actualProgress}%
                                        </span>
                                      </div>
                                    )}
                                    {photos.latestReportDate && (
                                      <div className="text-[9px] text-muted-foreground">
                                        Update: {photos.latestReportDate}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>

                                {/* 4 FOTO CELLS */}
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photos0}
                                    stageName="0%"
                                    stageTitle="Foto Kondisi 0%"
                                    onOpenLightbox={(photo, list, idx) =>
                                      handleOpenLightbox(photo, list, idx, p.no)
                                    }
                                    onAdjustEmpty={() =>
                                      setPhotoAssistantTarget({
                                        poktanNo: p.no,
                                        focusStage: "0%",
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photos50}
                                    stageName="50%"
                                    stageTitle="Foto Kondisi 50%"
                                    onOpenLightbox={(photo, list, idx) =>
                                      handleOpenLightbox(photo, list, idx, p.no)
                                    }
                                    onAdjustEmpty={() =>
                                      setPhotoAssistantTarget({
                                        poktanNo: p.no,
                                        focusStage: "50%",
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photos100}
                                    stageName="100%"
                                    stageTitle="Foto Kondisi 100%"
                                    onOpenLightbox={(photo, list, idx) =>
                                      handleOpenLightbox(photo, list, idx, p.no)
                                    }
                                    onAdjustEmpty={() =>
                                      setPhotoAssistantTarget({
                                        poktanNo: p.no,
                                        focusStage: "100%",
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="bg-amber-500/5 p-1 text-center">
                                  <PhotoThumbnailSlot
                                    photos={photos.photosPrasasti}
                                    stageName="Prasasti"
                                    stageTitle="Foto Batu Prasasti"
                                    onOpenLightbox={(photo, list, idx) =>
                                      handleOpenLightbox(photo, list, idx, p.no)
                                    }
                                    onAdjustEmpty={() =>
                                      setPhotoAssistantTarget({
                                        poktanNo: p.no,
                                        focusStage: "Prasasti",
                                      })
                                    }
                                  />
                                </TableCell>
                              </TableRow>

                              {/* Sub-Rows for each Pekerjaan Item */}
                              {isExpanded &&
                                p.pekerjaanListWithBobot.map((item, idx) => {
                                  const item0 = getWorkItemStagePhotos(
                                    photos.photos0,
                                    item.namaPekerjaan,
                                    p.linkedProjectId,
                                  );
                                  const item50 = getWorkItemStagePhotos(
                                    photos.photos50,
                                    item.namaPekerjaan,
                                    p.linkedProjectId,
                                  );
                                  const item100 = getWorkItemStagePhotos(
                                    photos.photos100,
                                    item.namaPekerjaan,
                                    p.linkedProjectId,
                                  );
                                  const itemPrasasti = getWorkItemStagePhotos(
                                    photos.photosPrasasti,
                                    item.namaPekerjaan,
                                    p.linkedProjectId,
                                  );
                                  const hasAnyItemPhoto =
                                    item0.length > 0 ||
                                    item50.length > 0 ||
                                    item100.length > 0 ||
                                    itemPrasasti.length > 0;

                                  return (
                                    <TableRow
                                      key={`item-${p.no}-${item.namaPekerjaan}-${idx}`}
                                      className="border-b border-border/40 text-xs transition hover:bg-muted/10"
                                    >
                                      <TableCell className="border-r border-border/60 text-center font-mono text-[10px] text-muted-foreground/60">
                                        {p.no}.{idx + 1}
                                      </TableCell>
                                      <TableCell
                                        colSpan={2}
                                        className="border-r border-border/60 pl-6"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono text-muted-foreground/60">
                                            ↳
                                          </span>
                                          <span className="font-medium text-foreground">
                                            {item.namaPekerjaan}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="border-r border-border/60 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                        —
                                      </TableCell>

                                      {/* HASIL SID Item Columns */}
                                      <TableCell className="bg-primary/2 text-xs text-muted-foreground">
                                        {item.namaPekerjaan}
                                      </TableCell>
                                      <TableCell className="bg-primary/2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                        {item.volume !== null &&
                                        item.volume !== undefined
                                          ? String(item.volume)
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="bg-primary/2 text-center text-xs text-muted-foreground">
                                        {item.satuan || "—"}
                                      </TableCell>
                                      <TableCell className="bg-primary/2 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                                        {item.biaya > 0
                                          ? item.biaya.toLocaleString("id-ID")
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="border-r border-border/60 bg-primary/2 text-right font-mono text-xs font-bold tabular-nums text-primary">
                                        {item.bobotPercent.toFixed(2)}%
                                      </TableCell>

                                      {/* HASIL FISIK KONSTRUKSI Item Columns */}
                                      <TableCell className="bg-emerald-500/2 text-right font-mono text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                                        {item.realisasiVolumeCalc !== null &&
                                        item.realisasiVolumeCalc !== undefined
                                          ? String(item.realisasiVolumeCalc)
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="bg-emerald-500/2 text-center text-xs text-muted-foreground">
                                        {item.realisasiSatuan ||
                                          item.satuan ||
                                          "—"}
                                      </TableCell>
                                      <TableCell className="bg-emerald-500/2 text-right font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                        {item.realisasiBiaya > 0
                                          ? item.realisasiBiaya.toLocaleString(
                                              "id-ID",
                                            )
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="bg-emerald-500/2 text-center text-xs font-medium text-emerald-600">
                                        {p.progresFisikKonstruksiPercent.toFixed(
                                          1,
                                        )}
                                        %
                                      </TableCell>
                                      <TableCell className="border-r border-border/60 bg-emerald-500/2 text-[11px] text-muted-foreground">
                                        {item.biaya > 0
                                          ? p.progresFisikKonstruksiPercent >=
                                            100
                                            ? "100% Selesai"
                                            : p.progresFisikKonstruksiPercent >
                                                0
                                              ? "Pelaksanaan"
                                              : "Belum Mulai"
                                          : "Opsional"}
                                      </TableCell>

                                      {/* Item-level Matched Photos */}
                                      {hasAnyItemPhoto ? (
                                        <>
                                          <TableCell className="bg-muted/5 p-1 text-center">
                                            <PhotoThumbnailSlot
                                              photos={item0}
                                              stageName="0%"
                                              stageTitle={`${item.namaPekerjaan} · 0%`}
                                              onOpenLightbox={(
                                                photo,
                                                list,
                                                i,
                                              ) =>
                                                handleOpenLightbox(
                                                  photo,
                                                  list,
                                                  i,
                                                  p.no,
                                                )
                                              }
                                              compact
                                            />
                                          </TableCell>
                                          <TableCell className="bg-muted/5 p-1 text-center">
                                            <PhotoThumbnailSlot
                                              photos={item50}
                                              stageName="50%"
                                              stageTitle={`${item.namaPekerjaan} · 50%`}
                                              onOpenLightbox={(
                                                photo,
                                                list,
                                                i,
                                              ) =>
                                                handleOpenLightbox(
                                                  photo,
                                                  list,
                                                  i,
                                                  p.no,
                                                )
                                              }
                                              compact
                                            />
                                          </TableCell>
                                          <TableCell className="bg-muted/5 p-1 text-center">
                                            <PhotoThumbnailSlot
                                              photos={item100}
                                              stageName="100%"
                                              stageTitle={`${item.namaPekerjaan} · 100%`}
                                              onOpenLightbox={(
                                                photo,
                                                list,
                                                i,
                                              ) =>
                                                handleOpenLightbox(
                                                  photo,
                                                  list,
                                                  i,
                                                  p.no,
                                                )
                                              }
                                              compact
                                            />
                                          </TableCell>
                                          <TableCell className="bg-muted/5 p-1 text-center">
                                            <PhotoThumbnailSlot
                                              photos={itemPrasasti}
                                              stageName="Prasasti"
                                              stageTitle={`${item.namaPekerjaan} · Prasasti`}
                                              onOpenLightbox={(
                                                photo,
                                                list,
                                                i,
                                              ) =>
                                                handleOpenLightbox(
                                                  photo,
                                                  list,
                                                  i,
                                                  p.no,
                                                )
                                              }
                                              compact
                                            />
                                          </TableCell>
                                        </>
                                      ) : (
                                        <TableCell
                                          colSpan={4}
                                          className="bg-muted/5 py-1 text-center text-[10px] text-muted-foreground/60"
                                        >
                                          {item.biaya > 0 &&
                                          photos.rawPhotos.length > 0 ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPhotoAssistantTarget({
                                                  poktanNo: p.no,
                                                })
                                              }
                                              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary/80 transition hover:bg-primary/10 hover:text-primary"
                                            >
                                              <Link2 className="size-3" />
                                              <span>
                                                Kaitkan Foto ke {item.namaPekerjaan}
                                              </span>
                                            </button>
                                          ) : (
                                            <span className="italic opacity-60">
                                              ↳ Foto di baris Poktan
                                            </span>
                                          )}
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                      </TableBody>

                      <TableFooter className="bg-muted/80 text-xs font-bold">
                        <TableRow>
                          <TableCell colSpan={3} className="text-center font-bold">
                            TOTAL KESELURUHAN ({filteredData.length} KELOMPOK TANI)
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-foreground">
                            {aggregates.totalLuas.toFixed(2)} Ha
                          </TableCell>
                          <TableCell colSpan={3} className="text-right text-primary">
                            Total Anggaran SID:
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums text-primary">
                            Rp {aggregates.totalBiayaKonstruksi.toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell className="border-r border-border/60 text-right font-mono font-bold tabular-nums text-primary">
                            100.0%
                          </TableCell>
                          <TableCell colSpan={2} className="text-right text-emerald-600">
                            Total Realisasi Fisik:
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                            Rp{" "}
                            {aggregates.totalBiayaDigunakanKonstruksi.toLocaleString(
                              "id-ID",
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-emerald-600">
                            {aggregates.avgProgressPercent}%
                          </TableCell>
                          <TableCell className="border-r border-border/60 text-xs text-muted-foreground">
                            {aggregates.totalDailyReportsCount} Lap. Harian
                          </TableCell>
                          <TableCell
                            colSpan={4}
                            className="text-center font-bold text-amber-600"
                          >
                            {aggregates.totalPhotosCount} Foto ({aggregates.poktanWithPhotosCount} Poktan)
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
              )}

              {/* MOBILE CARDS VIEW */}
              {sidViewMode === "mobile_cards" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {filteredData.map((p) => {
                      const photos = p.photoClassification;
                      const isExpanded = expandedPoktanNos.has(p.no);

                      return (
                        <div
                          key={`card-poktan-${p.no}`}
                          className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px]">
                                  #{p.no} · {p.kecamatan}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                  Desa {p.desa}
                                </span>
                              </div>
                              <h4 className="type-h3 mt-1 font-bold text-foreground">
                                {p.poktan}
                              </h4>
                              <p className="font-mono text-[11px] text-muted-foreground">
                                SPK: {p.nomorSpk || "-"}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge
                                variant={
                                  p.progresFisikKonstruksiPercent >= 100
                                    ? "success"
                                    : p.progresFisikKonstruksiPercent > 0
                                      ? "default"
                                      : "secondary"
                                }
                                className="font-mono text-xs font-bold"
                              >
                                {p.progresFisikKonstruksiPercent.toFixed(1)}% Fisik
                              </Badge>
                              <span className="mt-1 block text-xs font-medium text-foreground">
                                {p.luasLahanHa.toFixed(2)} Ha Desain
                              </span>
                            </div>
                          </div>

                          {/* Financial & Progress Info */}
                          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
                            <div>
                              <span className="block text-[10px] text-muted-foreground">
                                Pagu Konstruksi
                              </span>
                              <span className="font-mono font-bold text-primary">
                                Rp {p.totalBiayaKonstruksi.toLocaleString("id-ID")}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground">
                                Realisasi Biaya
                              </span>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                Rp {p.biayaDigunakanKonstruksi.toLocaleString("id-ID")}
                              </span>
                            </div>
                          </div>

                          {/* Photo Documentation Grid (4 Stages) */}
                          <div>
                            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                              <span className="flex items-center gap-1 font-semibold text-foreground">
                                <ImageIcon className="size-3.5 text-amber-500" />
                                Foto Lapangan (4 Tahap)
                                {photos.isManuallyAdjusted && (
                                  <Badge
                                    variant="secondary"
                                    className="ml-1 px-1 py-0 text-[9px]"
                                  >
                                    Disesuaikan
                                  </Badge>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {photos.totalPhotosCount} Foto
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() =>
                                    setPhotoAssistantTarget({ poktanNo: p.no })
                                  }
                                  className="h-6 gap-1 px-2 text-[10px]"
                                >
                                  <SlidersHorizontal className="size-3" />
                                  <span>Sesuaikan</span>
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              <PhotoThumbnailSlot
                                photos={photos.photos0}
                                stageName="0%"
                                stageTitle="Foto 0%"
                                onOpenLightbox={(photo, list, idx) =>
                                  handleOpenLightbox(photo, list, idx, p.no)
                                }
                                onAdjustEmpty={() =>
                                  setPhotoAssistantTarget({
                                    poktanNo: p.no,
                                    focusStage: "0%",
                                  })
                                }
                              />
                              <PhotoThumbnailSlot
                                photos={photos.photos50}
                                stageName="50%"
                                stageTitle="Foto 50%"
                                onOpenLightbox={(photo, list, idx) =>
                                  handleOpenLightbox(photo, list, idx, p.no)
                                }
                                onAdjustEmpty={() =>
                                  setPhotoAssistantTarget({
                                    poktanNo: p.no,
                                    focusStage: "50%",
                                  })
                                }
                              />
                              <PhotoThumbnailSlot
                                photos={photos.photos100}
                                stageName="100%"
                                stageTitle="Foto 100%"
                                onOpenLightbox={(photo, list, idx) =>
                                  handleOpenLightbox(photo, list, idx, p.no)
                                }
                                onAdjustEmpty={() =>
                                  setPhotoAssistantTarget({
                                    poktanNo: p.no,
                                    focusStage: "100%",
                                  })
                                }
                              />
                              <PhotoThumbnailSlot
                                photos={photos.photosPrasasti}
                                stageName="Prasasti"
                                stageTitle="Prasasti"
                                onOpenLightbox={(photo, list, idx) =>
                                  handleOpenLightbox(photo, list, idx, p.no)
                                }
                                onAdjustEmpty={() =>
                                  setPhotoAssistantTarget({
                                    poktanNo: p.no,
                                    focusStage: "Prasasti",
                                  })
                                }
                              />
                            </div>
                          </div>

                          {/* Collapsible Work Items Accordion */}
                          <div className="border-t border-border/60 pt-2">
                            <button
                              type="button"
                              onClick={() => togglePoktan(p.no)}
                              className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline"
                            >
                              <span>
                                {isExpanded ? "Tutup" : "Lihat"} Rincian {p.pekerjaanListWithBobot.length} Item SID &amp; Bobot (%)
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-2.5 text-xs">
                                {p.pekerjaanListWithBobot.map((item, idx) => (
                                  <div
                                    key={`card-item-${p.no}-${idx}`}
                                    className="flex items-center justify-between border-b border-border/40 pb-1.5 last:border-0 last:pb-0"
                                  >
                                    <div>
                                      <span className="block font-medium text-foreground">
                                        {item.namaPekerjaan}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        Vol: {item.volume ?? "-"} {item.satuan} · Real:{" "}
                                        {item.realisasiVolumeCalc}{" "}
                                        {item.realisasiSatuan || item.satuan}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="block font-mono font-bold text-primary">
                                        {item.bobotPercent.toFixed(2)}%
                                      </span>
                                      <span className="font-mono text-[10px] text-muted-foreground">
                                        Rp{" "}
                                        {item.biaya > 0
                                          ? item.biaya.toLocaleString("id-ID")
                                          : "-"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Database SPK & SP2D */}
          {activeTab === "database_spk" && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="type-h3 text-foreground">
                    Tabel 3: Database SPK, Pengurus Poktan/UPKK &amp; SP2D
                  </h3>
                  <p className="type-p3 mt-0.5 text-muted-foreground">
                    Penyaluran Dana Hibah Rehabilitasi Lahan Sawah Aceh Tengah
                    T.A. 2026
                  </p>
                </div>
                <Badge variant="outline">
                  Bank Syariah Indonesia (BSI)
                </Badge>
              </div>

              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">No</TableHead>
                    <TableHead>Kecamatan / Desa</TableHead>
                    <TableHead>Nama Poktan &amp; Luas</TableHead>
                    <TableHead>Nomor &amp; Tanggal SPK</TableHead>
                    <TableHead>Jangka Waktu</TableHead>
                    <TableHead>Bank &amp; Rekening</TableHead>
                    <TableHead>Pengurus</TableHead>
                    <TableHead className="text-right">SP2D Tahap 1</TableHead>
                    <TableHead className="text-right">SP2D Tahap 2</TableHead>
                    <TableHead className="text-right">Total Tersalur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((d) => {
                    const totalTersalur = d.sp2d1Jumlah + d.sp2d2Jumlah;
                    return (
                      <TableRow key={d.no}>
                        <TableCell className="type-p3 text-center font-mono text-muted-foreground tabular-nums">
                          {d.no}
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-semibold text-foreground">
                            Kec. {d.kecamatan}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Desa {d.desa}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-bold text-foreground">
                            {d.poktan}
                          </p>
                          <p className="type-p3 text-muted-foreground tabular-nums">
                            {d.luasLahanHa} Ha ({d.jumlahAnggota} Anggota)
                          </p>
                        </TableCell>
                        <TableCell className="font-mono">
                          <p className="type-p3 font-semibold text-foreground">
                            {d.nomorSpk}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            Tgl: {d.tglSpk}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3 tabular-nums">
                          <p>{d.tglMulai} s/d</p>
                          <p className="text-muted-foreground">{d.tglSelesai}</p>
                        </TableCell>
                        <TableCell>
                          <p className="type-p2 font-medium text-foreground">
                            {d.namaBank}
                          </p>
                          <p className="type-p3 font-mono text-muted-foreground">
                            {d.noRekening}
                          </p>
                        </TableCell>
                        <TableCell className="type-p3">
                          <p>
                            <span className="text-muted-foreground">
                              Ketua:{" "}
                            </span>
                            <span className="font-medium text-foreground">
                              {d.ketuaPoktan}
                            </span>
                          </p>
                          <p className="font-mono text-muted-foreground">
                            NIK: {d.nikKetua}
                          </p>
                          <p>
                            <span className="text-muted-foreground">UPKK: </span>
                            <span className="font-medium text-foreground">
                              {d.ketuaUpkk}
                            </span>
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <p className="type-p2 font-semibold text-foreground">
                            Rp {d.sp2d1Jumlah.toLocaleString("id-ID")}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {d.sp2d1NoTgl}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          <p className="type-p2 font-semibold text-foreground">
                            Rp {d.sp2d2Jumlah.toLocaleString("id-ID")}
                          </p>
                          <p className="type-p3 text-muted-foreground">
                            {d.sp2d2NoTgl || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="type-p2 text-right font-mono font-bold text-success tabular-nums">
                          Rp {totalTersalur.toLocaleString("id-ID")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={7} className="type-p2 text-center font-bold">
                      Total Penyaluran SP2D ({filteredData.length} Poktan)
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      Rp {aggregates.totalSp2d1.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold tabular-nums">
                      Rp {aggregates.totalSp2d2.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="type-p2 text-right font-mono font-bold text-success tabular-nums">
                      Rp {aggregates.totalPenyaluran.toLocaleString("id-ID")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </>
      )}
        </>
      )}
        </>
      )}

      {/* In-App Interactive Lightbox Modal */}
      {lightboxData && (() => {
        const lightboxPoktanItem = lightboxData.poktanNo
          ? projectReportData.find((p) => p.no === lightboxData.poktanNo)
          : undefined;
        const liveVisual =
          lightboxPoktanItem?.adjustment?.photoVisualMap?.[
            lightboxData.photo.photoKey
          ];
        const activeRotation =
          liveVisual?.rotation ?? lightboxData.photo.rotation ?? 0;
        const activeDownloadUrl = photoDownloadHref(
          lightboxData.photo.rawUrl || lightboxData.photo.url,
        );
        const activeAssetCode = resolvePhotoAssetCode(lightboxData.photo);

        return (
          <GlobalModal
            isOpen={Boolean(lightboxData)}
            onClose={() => setLightboxData(null)}
            title={
              <div className="flex flex-wrap items-center gap-2">
                <ImageIcon className="size-4 text-primary" />
                <span className="type-h3">{lightboxData.photo.stageLabel}</span>
                {activeAssetCode && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {activeAssetCode}
                  </Badge>
                )}
              </div>
            }
            description={`${lightboxData.photo.poktan} · Desa ${lightboxData.photo.desa}, Kec. ${lightboxData.photo.kecamatan} · Progres ${lightboxData.photo.progress.toFixed(1)}%`}
            className="max-w-3xl"
            footer={
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={activeDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Download className="size-3.5" />
                    Unduh Foto Asli
                  </a>
                  {lightboxData.poktanNo && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        const targetNo = lightboxData.poktanNo!;
                        const targetKey = lightboxData.photo.photoKey;
                        const targetStage = lightboxData.photo.stage;
                        setLightboxData(null);
                        setPhotoAssistantTarget({
                          poktanNo: targetNo,
                          focusStage: targetStage,
                          focusPhotoKey: targetKey,
                        });
                      }}
                      className="gap-1.5 text-xs"
                    >
                      <SlidersHorizontal className="size-3.5" />
                      <span>Sesuaikan Tahap / Rotasi</span>
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLightboxData(null)}
                >
                  Tutup
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Main Photo Frame */}
              <div className="relative flex max-h-[60vh] min-h-[260px] w-full items-center justify-center overflow-hidden rounded-xl bg-black/90 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxData.photo.url}
                  alt={`${lightboxData.photo.stageLabel} - ${lightboxData.photo.poktan}${activeAssetCode ? ` (${activeAssetCode})` : ""}`}
                  style={
                    activeRotation
                      ? { transform: `rotate(${activeRotation}deg)` }
                      : undefined
                  }
                  className="max-h-[56vh] max-w-full rounded-lg object-contain shadow-2xl transition-all"
                />
                {lightboxData.photoList.length > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={lightboxData.currentIndex <= 0}
                      onClick={() => {
                        const newIdx = lightboxData.currentIndex - 1;
                        if (newIdx >= 0) {
                          setLightboxData({
                            ...lightboxData,
                            currentIndex: newIdx,
                            photo: lightboxData.photoList[newIdx],
                          });
                        }
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white transition hover:bg-black disabled:opacity-20"
                      aria-label="Foto Sebelumnya"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      disabled={
                        lightboxData.currentIndex >=
                        lightboxData.photoList.length - 1
                      }
                      onClick={() => {
                        const newIdx = lightboxData.currentIndex + 1;
                        if (newIdx < lightboxData.photoList.length) {
                          setLightboxData({
                            ...lightboxData,
                            currentIndex: newIdx,
                            photo: lightboxData.photoList[newIdx],
                          });
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/70 p-2 text-white transition hover:bg-black disabled:opacity-20"
                      aria-label="Foto Selanjutnya"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                )}
                <div className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {lightboxData.currentIndex + 1} /{" "}
                  {lightboxData.photoList.length}
                </div>
              </div>

              {/* Detailed Metadata Card */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="block text-[10px] text-muted-foreground">
                    Kelompok Tani &amp; Wilayah
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {lightboxData.photo.poktan}
                  </span>
                  <p className="mt-0.5 text-muted-foreground">
                    Kec. {lightboxData.photo.kecamatan}, Desa{" "}
                    {lightboxData.photo.desa}
                  </p>
                  {lightboxData.photo.sourceLabel && (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      Sumber: {lightboxData.photo.sourceLabel}
                    </Badge>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] text-muted-foreground">
                    Tahapan Dokumentasi
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="text-xs">
                      {lightboxData.photo.stageLabel}
                    </Badge>
                    <span className="font-mono font-bold text-emerald-600">
                      {lightboxData.photo.progress.toFixed(1)}% Fisik
                    </span>
                    {activeAssetCode && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        Kode: {activeAssetCode}
                      </Badge>
                    )}
                    {lightboxData.photo.workItemName && (
                      <Badge variant="secondary" className="text-[10px]">
                        Item: {lightboxData.photo.workItemName}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Laporan Tanggal: {lightboxData.photo.reportDate}
                  </p>
                </div>
                {(lightboxData.photo.workSummary || lightboxData.photo.notes) && (
                  <div className="border-t border-border/60 pt-2 sm:col-span-2">
                    <span className="block text-[10px] font-medium text-muted-foreground">
                      Uraian Pekerjaan / Catatan Lapangan:
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap font-medium text-foreground">
                      {lightboxData.photo.workSummary ||
                        lightboxData.photo.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Thumbnail carousel strip */}
              {lightboxData.photoList.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
                  {lightboxData.photoList.map((item, idx) => {
                    const itemAssetCode = resolvePhotoAssetCode(item);
                    return (
                      <button
                        key={`modal-thumb-${item.url}-${idx}`}
                        type="button"
                        title={
                          itemAssetCode
                            ? `${itemAssetCode} (${item.stage})`
                            : item.stage
                        }
                        onClick={() =>
                          setLightboxData({
                            ...lightboxData,
                            currentIndex: idx,
                            photo: item,
                          })
                        }
                        className={cn(
                          "relative size-14 shrink-0 overflow-hidden rounded-md border transition-all",
                          idx === lightboxData.currentIndex
                            ? "scale-105 border-primary ring-2 ring-primary"
                            : "border-border/60 opacity-60 hover:opacity-100",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={`Thumb ${idx + 1}${itemAssetCode ? ` (${itemAssetCode})` : ""}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[8px] font-bold text-white">
                          {item.stage}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </GlobalModal>
        );
      })()}

      {/* Sistem Bantu Sesuaikan Foto Laporan Harian Modal */}
      {photoAssistantTarget && activeAssistantPoktan && (
        <GlobalModal
          isOpen={Boolean(photoAssistantTarget)}
          onClose={() => setPhotoAssistantTarget(null)}
          title={
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="type-h3">
                Sistem Bantu Sesuaikan Foto Laporan Harian
              </span>
            </div>
          }
          description={`Atur penempatan tahap (0%, 50%, 100%, Prasasti), tautan item pekerjaan SID, dan orientasi foto dari Laporan Harian untuk ${activeAssistantPoktan.poktan}.`}
          className="max-w-5xl"
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Perubahan otomatis tersimpan &amp; langsung memperbarui Tabel
                Hasil SID &amp; Foto.
              </span>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setPhotoAssistantTarget(null)}
              >
                Selesai &amp; Terapkan
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Poktan & Source Project Selectors */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  1. Pilih Kelompok Tani (38 Poktan)
                </label>
                <Select
                  value={String(activeAssistantPoktan.no)}
                  onValueChange={(val) =>
                    setPhotoAssistantTarget({
                      poktanNo: Number(val),
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pilih Poktan" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectReportData.map((item) => (
                      <SelectItem
                        key={`assist-opt-${item.no}`}
                        value={String(item.no)}
                      >
                        #{item.no} · {item.poktan} ({item.kecamatan}) —{" "}
                        {item.photoClassification.rawPhotos.length} Foto
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  2. Sumber Proyek Laporan Harian di DB
                </label>
                <Select
                  value={
                    activeAssistantPoktan.adjustment?.linkedProjectId ||
                    "__AUTO__"
                  }
                  onValueChange={(val) =>
                    handleLinkProjectToPoktan(activeAssistantPoktan.no, val)
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <Link2 className="mr-1.5 size-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Pilih sumber proyek" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__AUTO__">
                      Otomatis{" "}
                      {activeAssistantPoktan.autoLinkedProjectId
                        ? `(Tertaut: ${
                            projectByIdMap.get(
                              activeAssistantPoktan.autoLinkedProjectId,
                            )?.name ?? "DB Proyek"
                          })`
                        : "(Belum ada proyek cocok otomatis)"}
                    </SelectItem>
                    {projects
                      .filter(
                        (proj) =>
                          Boolean(proj.id) &&
                          isProjectPoktanCompatible(proj, activeAssistantPoktan),
                      )
                      .map((proj) => {
                        const info = extractRawDailyReportPhotos(
                          activeAssistantPoktan,
                          proj,
                        );
                        return (
                          <SelectItem key={proj.id!} value={proj.id!}>
                            {proj.name} ({proj.kelompokTani}) ·{" "}
                            {info.dailyReportsCount} Lap ·{" "}
                            {info.rawPhotos.length} Foto
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 1-Click Auto-Assist Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="default"
                  disabled={
                    activeAssistantPoktan.photoClassification.rawPhotos.length ===
                    0
                  }
                  onClick={() =>
                    handleApplyPresetToPoktan(
                      activeAssistantPoktan.no,
                      "smart_chronological",
                    )
                  }
                  className="gap-1.5 text-xs"
                >
                  <Sparkles className="size-3.5" />
                  <span>Otomatis Kronologis (0% → 50% → 100%)</span>
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={
                    activeAssistantPoktan.photoClassification.rawPhotos.length ===
                    0
                  }
                  onClick={() =>
                    handleApplyPresetToPoktan(
                      activeAssistantPoktan.no,
                      "distribute_all_4",
                    )
                  }
                  className="gap-1.5 text-xs"
                >
                  <Layers className="size-3.5" />
                  <span>Isi 4 Tahap Merata</span>
                </Button>
                {activeAssistantPoktan.photoClassification
                  .isManuallyAdjusted && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      resetPoktanAdjustment(activeAssistantPoktan.no)
                    }
                    className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>Reset Otomatis</span>
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeAssistantPoktan.photoClassification
                  .filteredForeignPhotosCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                  >
                    {
                      activeAssistantPoktan.photoClassification
                        .filteredForeignPhotosCount
                    }{" "}
                    foto lintas proyek disaring
                  </Badge>
                )}
                <Badge variant="outline" className="font-mono text-xs">
                  Progres Fisik:{" "}
                  {activeAssistantPoktan.progresFisikKonstruksiPercent.toFixed(1)}
                  % · {activeAssistantPoktan.photoClassification.dailyReportsCount}{" "}
                  Lap. Harian
                </Badge>
              </div>
            </div>

            {/* Preview 4 Stage Slots */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                  Pratinjau 4 Tahap Dokumentasi ({activeAssistantPoktan.poktan})
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  Klik × pada foto untuk melepas dari tahap terkait
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {PHOTO_STAGE_META.map((stageMeta) => {
                  const stagePhotos =
                    stageMeta.key === "0%"
                      ? activeAssistantPoktan.photoClassification.photos0
                      : stageMeta.key === "50%"
                        ? activeAssistantPoktan.photoClassification.photos50
                        : stageMeta.key === "100%"
                          ? activeAssistantPoktan.photoClassification.photos100
                          : activeAssistantPoktan.photoClassification
                              .photosPrasasti;
                  const isFocused =
                    photoAssistantTarget.focusStage === stageMeta.key;

                  return (
                    <div
                      key={`stage-box-${stageMeta.key}`}
                      className={cn(
                        "rounded-lg border p-2.5 transition",
                        isFocused
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-foreground">
                          Foto {stageMeta.shortLabel}
                        </span>
                        <Badge
                          variant={
                            stagePhotos.length > 0 ? "default" : "secondary"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {stagePhotos.length}
                        </Badge>
                      </div>
                      {stagePhotos.length === 0 ? (
                        <div className="flex h-16 items-center justify-center rounded border border-dashed border-border/70 bg-muted/15 px-2 text-center text-[10px] text-muted-foreground">
                          Pilih foto di bawah untuk mengisi tahap{" "}
                          {stageMeta.shortLabel}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {stagePhotos.map((sp, sIdx) => {
                            const spAssetCode = resolvePhotoAssetCode(sp);
                            return (
                              <div
                                key={`stage-thumb-${stageMeta.key}-${sp.photoKey}-${sIdx}`}
                                title={
                                  spAssetCode
                                    ? `${spAssetCode} (${stageMeta.shortLabel})`
                                    : `${stageMeta.shortLabel} #${sIdx + 1}`
                                }
                                className="group relative size-14 overflow-hidden rounded border border-border bg-muted/20"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={sp.url}
                                  alt={`${stageMeta.shortLabel} #${sIdx + 1}${spAssetCode ? ` (${spAssetCode})` : ""}`}
                                  style={
                                    sp.rotation
                                      ? {
                                          transform: `rotate(${sp.rotation}deg)`,
                                        }
                                      : undefined
                                  }
                                  className={cn(
                                    "h-full w-full cursor-pointer",
                                    sp.fit === "contain"
                                      ? "bg-black/80 object-contain"
                                      : "object-cover",
                                  )}
                                  onClick={() =>
                                    handleOpenLightbox(
                                      sp,
                                      stagePhotos,
                                      sIdx,
                                      activeAssistantPoktan.no,
                                    )
                                  }
                                />
                                {spAssetCode && (
                                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/75 px-0.5 text-center font-mono text-[6.5px] font-semibold text-amber-200">
                                    {spAssetCode}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleTogglePhotoStage(
                                      activeAssistantPoktan.no,
                                      sp.photoKey,
                                      stageMeta.key,
                                    )
                                  }
                                  title={`Lepas foto dari tahap ${stageMeta.shortLabel}`}
                                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/75 text-white opacity-90 transition hover:bg-destructive"
                                >
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gallery of Source Photos from Daily Reports (Strictly Scoped to Matched Project) */}
            <div className="space-y-2.5 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                    Daftar Foto Laporan Harian (
                    {activeAssistantPoktan.photoClassification.rawPhotos.length}{" "}
                    Foto Proyek Ini)
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Klik tombol tahap (0%, 50%, 100%, Prasasti) untuk memasang
                    atau melepas foto milik Poktan {activeAssistantPoktan.poktan}.
                  </p>
                </div>
              </div>

              {(() => {
                const candidatePhotos =
                  activeAssistantPoktan.photoClassification.rawPhotos;

                if (candidatePhotos.length === 0) {
                  return (
                    <div className="rounded-xl border border-dashed border-border bg-muted/15 p-6 text-center">
                      <ImageIcon className="mx-auto mb-2 size-7 text-muted-foreground/40" />
                      <p className="text-xs font-semibold text-foreground">
                        Belum ada foto pada Laporan Harian proyek ini
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Unggah foto melalui Laporan Harian pada proyek{" "}
                        <strong>{activeAssistantPoktan.poktan}</strong> agar
                        otomatis tampil di sini.
                      </p>
                    </div>
                  );
                }

                const stageMapSnapshot = getBaselineStageMap(
                  activeAssistantPoktan,
                );

                return (
                  <div className="grid max-h-[42vh] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {candidatePhotos.map((photo, idx) => {
                      const activeStages =
                        stageMapSnapshot[photo.photoKey] ?? [];
                      const isHighlighted =
                        photoAssistantTarget.focusPhotoKey === photo.photoKey;
                      const photoAssetCode = resolvePhotoAssetCode(photo);

                      return (
                        <div
                          key={`assist-photo-${photo.photoKey}-${idx}`}
                          className={cn(
                            "flex gap-3 rounded-xl border p-2.5 transition",
                            isHighlighted
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border bg-card",
                          )}
                        >
                          {/* Photo Thumb */}
                          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.url}
                              alt={`Foto Lap. Harian ${idx + 1}${photoAssetCode ? ` (${photoAssetCode})` : ""}`}
                              style={
                                photo.rotation
                                  ? { transform: `rotate(${photo.rotation}deg)` }
                                  : undefined
                              }
                              className={cn(
                                "h-full w-full cursor-pointer transition-transform",
                                photo.fit === "contain"
                                  ? "bg-black/80 object-contain"
                                  : "object-cover",
                              )}
                              onClick={() =>
                                handleOpenLightbox(
                                  photo,
                                  candidatePhotos,
                                  idx,
                                  activeAssistantPoktan.no,
                                )
                              }
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center font-mono text-[9px] font-bold text-white">
                              {photo.progress.toFixed(1)}%
                            </span>
                          </div>

                          {/* Controls */}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                                <Badge variant="outline" className="px-1 py-0">
                                  {photo.reportDate}
                                </Badge>
                                {photoAssetCode && (
                                  <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 font-mono text-[10px]"
                                  >
                                    {photoAssetCode}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                {photo.workSummary ||
                                  photo.sourceLabel ||
                                  "Foto progres Laporan Harian"}
                              </p>
                            </div>

                            {/* 4 Stage Toggle Pills */}
                            <div className="flex flex-wrap gap-1">
                              {PHOTO_STAGE_META.map((st) => {
                                const isActive = activeStages.includes(st.key);
                                return (
                                  <button
                                    key={`btn-${photo.photoKey}-${st.key}`}
                                    type="button"
                                    onClick={() =>
                                      handleTogglePhotoStage(
                                        activeAssistantPoktan.no,
                                        photo.photoKey,
                                        st.key,
                                      )
                                    }
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition",
                                      isActive
                                        ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                                        : "border-border bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                                    )}
                                  >
                                    {isActive && <Check className="size-2.5" />}
                                    <span>{st.shortLabel}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* SID Work Item & Visual Adjust Controls */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Select
                                value={
                                  activeAssistantPoktan.adjustment
                                    ?.photoWorkItemMap?.[photo.photoKey] ||
                                  "__ALL__"
                                }
                                onValueChange={(val) =>
                                  handleSetPhotoWorkItem(
                                    activeAssistantPoktan.no,
                                    photo.photoKey,
                                    val,
                                  )
                                }
                              >
                                <SelectTrigger className="h-6 min-w-[130px] flex-1 px-2 text-[10px]">
                                  <SelectValue placeholder="Tautkan Item SID" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__ALL__">
                                    Umum (Semua Item Poktan)
                                  </SelectItem>
                                  {activeAssistantPoktan.pekerjaanList.map(
                                    (workItem, wIdx) => (
                                      <SelectItem
                                        key={`wi-${wIdx}`}
                                        value={workItem.namaPekerjaan}
                                      >
                                        {workItem.namaPekerjaan}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRotatePhoto(
                                    activeAssistantPoktan.no,
                                    photo.photoKey,
                                  )
                                }
                                title="Putar foto 90 derajat"
                                className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 text-[10px] font-medium text-foreground transition hover:bg-muted"
                              >
                                <RotateCw className="size-3" />
                                <span>
                                  {photo.rotation ? `${photo.rotation}°` : "Putar"}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleTogglePhotoFit(
                                    activeAssistantPoktan.no,
                                    photo.photoKey,
                                  )
                                }
                                title="Ubah penyesuaian bingkai (Cover / Utuh)"
                                className="inline-flex h-6 items-center rounded border border-border bg-muted/40 px-1.5 text-[10px] font-medium text-foreground transition hover:bg-muted"
                              >
                                {photo.fit === "contain" ? "Utuh" : "Penuh"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </GlobalModal>
      )}
    </div>
  );
}
