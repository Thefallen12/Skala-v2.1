"use client";

export type OfflineDailyReportWorkEntry = {
  workPointId: string;
  dailyVolume: number;
};

export type OfflineDailyReportPhotoInput =
  | File
  | {
      name: string;
      type: string;
      lastModified?: number;
      size?: number;
      dataUrl?: string;
      blob?: Blob;
    };

export type StoredOfflineDailyReportPhoto = {
  name: string;
  type: string;
  lastModified: number;
  size: number;
  /** Stored as Blob in IndexedDB or base64 data URL in localStorage fallback. */
  blob?: Blob;
  dataUrl?: string;
};

export type OfflineDailyReportInput = {
  userId?: string;
  clientRequestId?: string;
  projectId: string;
  reportDate: string;
  weather: string;
  workersCount: number;
  workSummary?: string;
  workPointId?: string;
  dailyVolume?: number;
  progress?: number;
  entries?: OfflineDailyReportWorkEntry[];
  equipment?: string[];
  issueNotes?: string;
  k3SafetyLog?: string;
  noWorkReason?: string;
  photos?: OfflineDailyReportPhotoInput[];
};

export type OfflineDailyReportRecord = {
  id: string;
  userId: string;
  clientRequestId: string;
  projectId: string;
  reportDate: string;
  weather: string;
  workersCount: number;
  workSummary: string;
  workPointId?: string;
  dailyVolume?: number;
  progress?: number;
  entries?: OfflineDailyReportWorkEntry[];
  equipment?: string[];
  issueNotes?: string;
  k3SafetyLog?: string;
  noWorkReason?: string;
  photos: StoredOfflineDailyReportPhoto[];
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineDailyReportScope = {
  projectId?: string;
  userId?: string;
};

export type OfflineDailyReportSubmitResult = {
  success: boolean;
  message?: string;
};

export type OfflineDailyReportSubmitFn = (
  report: OfflineDailyReportRecord,
  formData: FormData,
) => Promise<OfflineDailyReportSubmitResult>;

export type FlushOfflineDailyReportsResult = {
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
  skippedOffline: boolean;
  results: Array<{
    id: string;
    projectId: string;
    reportDate: string;
    success: boolean;
    message?: string;
  }>;
};

const IDB_NAME = "skala_offline_daily_reports_v1";
const IDB_VERSION = 1;
const IDB_STORE_NAME = "reports";
const LOCAL_STORAGE_KEY = "skala_offline_daily_reports_queue_v1";
const LOCAL_FLUSH_LOCK_KEY = "skala_offline_daily_reports_flush_lock_v1";
const WEB_LOCK_NAME = "skala_offline_daily_reports_flush_v1";
const FLUSH_LOCK_TTL_MS = 30_000;

let activeFlushPromise: Promise<FlushOfflineDailyReportsResult> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function generateRequestUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateQueueId(): string {
  return `odr_${generateRequestUuid()}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Gagal membaca file foto untuk penyimpanan offline."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Gagal mengonversi foto untuk antrean offline."));
    };
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, fallbackType = "image/jpeg"): Blob {
  const [header, base64Data] = dataUrl.split(",");
  if (!base64Data) {
    throw new Error("Format data foto offline tidak valid.");
  }
  const mimeMatch = header.match(/data:([^;]+);base64/i);
  const mimeType = mimeMatch?.[1] || fallbackType;
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function normalizePhotoForStorage(
  photo: OfflineDailyReportPhotoInput,
  preferDataUrl: boolean,
): Promise<StoredOfflineDailyReportPhoto> {
  if (photo instanceof File) {
    const type = photo.type || "image/jpeg";
    if (preferDataUrl) {
      return {
        name: photo.name || "photo.jpg",
        type,
        lastModified: photo.lastModified || Date.now(),
        size: photo.size,
        dataUrl: await blobToDataUrl(photo),
      };
    }
    return {
      name: photo.name || "photo.jpg",
      type,
      lastModified: photo.lastModified || Date.now(),
      size: photo.size,
      blob: photo,
    };
  }

  const type = photo.type || "image/jpeg";
  const lastModified = photo.lastModified ?? Date.now();
  const name = photo.name || "photo.jpg";

  if (preferDataUrl) {
    if (photo.dataUrl) {
      return {
        name,
        type,
        lastModified,
        size: photo.size ?? 0,
        dataUrl: photo.dataUrl,
      };
    }
    if (photo.blob) {
      return {
        name,
        type,
        lastModified,
        size: photo.size ?? photo.blob.size,
        dataUrl: await blobToDataUrl(photo.blob),
      };
    }
  }

  if (photo.blob) {
    return {
      name,
      type,
      lastModified,
      size: photo.size ?? photo.blob.size,
      blob: photo.blob,
    };
  }
  if (photo.dataUrl) {
    const blob = dataUrlToBlob(photo.dataUrl, type);
    return {
      name,
      type,
      lastModified,
      size: photo.size ?? blob.size,
      blob,
      dataUrl: photo.dataUrl,
    };
  }

  throw new Error("Lampiran foto antrean offline tidak valid.");
}

function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser() || typeof window.indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia."));
      return;
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Gagal membuka database IndexedDB."));
  });
}

function readLocalStorageQueue(): OfflineDailyReportRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineDailyReportRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalStorageQueue(items: OfflineDailyReportRecord[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Gagal menyimpan antrean offline ke penyimpanan lokal: ${error.message}`
        : "Penyimpanan lokal penuh untuk antrean laporan offline.",
    );
  }
}

async function putRecordInIdb(record: OfflineDailyReportRecord): Promise<void> {
  const db = await openOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Gagal menyimpan laporan ke IndexedDB."));
    });
  } finally {
    db.close();
  }
}

async function getAllRecordsFromIdb(): Promise<OfflineDailyReportRecord[]> {
  const db = await openOfflineDatabase();
  try {
    return await new Promise<OfflineDailyReportRecord[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const req = tx.objectStore(IDB_STORE_NAME).getAll();
      req.onsuccess = () => {
        const list = Array.isArray(req.result)
          ? (req.result as OfflineDailyReportRecord[])
          : [];
        resolve(list);
      };
      req.onerror = () =>
        reject(req.error ?? new Error("Gagal membaca antrean IndexedDB."));
    });
  } finally {
    db.close();
  }
}

async function deleteRecordFromIdb(id: string): Promise<void> {
  const db = await openOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Gagal menghapus item antrean IndexedDB."));
    });
  } finally {
    db.close();
  }
}

function normalizeScope(
  projectIdOrScope?: string | OfflineDailyReportScope,
): OfflineDailyReportScope {
  if (typeof projectIdOrScope === "string") {
    return { projectId: projectIdOrScope };
  }
  return projectIdOrScope ?? {};
}

function normalizeEquipmentList(equipment?: string[]): string[] | undefined {
  if (!Array.isArray(equipment) || equipment.length === 0) return undefined;
  const cleaned = equipment
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function buildRecordBase(
  input: OfflineDailyReportInput,
  photos: StoredOfflineDailyReportPhoto[],
): OfflineDailyReportRecord {
  const equipment = normalizeEquipmentList(input.equipment);
  const clientRequestId =
    typeof input.clientRequestId === "string" && input.clientRequestId.trim().length > 0
      ? input.clientRequestId.trim()
      : generateRequestUuid();
  const userId =
    typeof input.userId === "string" && input.userId.trim().length > 0
      ? input.userId.trim()
      : "anonymous";

  return {
    id: generateQueueId(),
    userId,
    clientRequestId,
    projectId: input.projectId,
    reportDate: input.reportDate,
    weather: input.weather,
    workersCount: input.workersCount,
    workSummary: input.workSummary ?? "",
    ...(input.workPointId ? { workPointId: input.workPointId } : {}),
    ...(input.dailyVolume !== undefined ? { dailyVolume: input.dailyVolume } : {}),
    ...(input.progress !== undefined ? { progress: input.progress } : {}),
    ...(input.entries && input.entries.length > 0 ? { entries: input.entries } : {}),
    ...(equipment ? { equipment } : {}),
    ...(input.issueNotes ? { issueNotes: input.issueNotes } : {}),
    ...(input.k3SafetyLog ? { k3SafetyLog: input.k3SafetyLog } : {}),
    ...(input.noWorkReason ? { noWorkReason: input.noWorkReason } : {}),
    photos,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
}

/**
 * Saves a daily progress report (including compressed photo blobs/data URLs)
 * into IndexedDB with automatic localStorage fallback when IndexedDB is unavailable.
 */
export async function enqueueOfflineDailyReport(
  input: OfflineDailyReportInput,
): Promise<OfflineDailyReportRecord> {
  if (!isBrowser()) {
    throw new Error("Antrean laporan offline hanya dapat digunakan di sisi klien.");
  }

  const rawPhotos = (input.photos ?? []).slice(0, 5);

  try {
    const storedPhotos = await Promise.all(
      rawPhotos.map((photo) => normalizePhotoForStorage(photo, false)),
    );
    const record = buildRecordBase(input, storedPhotos);
    await putRecordInIdb(record);
    return record;
  } catch {
    const serializedPhotos = await Promise.all(
      rawPhotos.map((photo) => normalizePhotoForStorage(photo, true)),
    );
    const record = buildRecordBase(input, serializedPhotos);
    const queue = readLocalStorageQueue();
    queue.push(record);
    writeLocalStorageQueue(queue);
    return record;
  }
}

/**
 * Lists queued offline daily reports sorted FIFO by creation timestamp.
 */
export async function listOfflineDailyReports(
  projectIdOrScope?: string | OfflineDailyReportScope,
): Promise<OfflineDailyReportRecord[]> {
  if (!isBrowser()) return [];

  const scope = normalizeScope(projectIdOrScope);
  if (scope.userId !== undefined && !scope.userId.trim()) {
    return [];
  }

  const localItems = readLocalStorageQueue();
  let idbItems: OfflineDailyReportRecord[] = [];
  try {
    idbItems = await getAllRecordsFromIdb();
  } catch {
    idbItems = [];
  }

  const mergedById = new Map<string, OfflineDailyReportRecord>();
  for (const item of [...idbItems, ...localItems]) {
    if (item && item.id) {
      mergedById.set(item.id, item);
    }
  }

  return Array.from(mergedById.values())
    .filter((item) => (!scope.projectId ? true : item.projectId === scope.projectId))
    .filter((item) =>
      scope.userId !== undefined ? item.userId === scope.userId.trim() : true,
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Removes a queued offline daily report from both IndexedDB and localStorage.
 */
export async function removeOfflineDailyReport(id: string): Promise<void> {
  if (!isBrowser() || !id) return;

  try {
    await deleteRecordFromIdb(id);
  } catch {
    // Ignore IDB failure and ensure localStorage fallback is also cleaned up.
  }

  const localItems = readLocalStorageQueue();
  const nextLocal = localItems.filter((item) => item.id !== id);
  if (nextLocal.length !== localItems.length) {
    writeLocalStorageQueue(nextLocal);
  }
}

/**
 * Counts queued offline daily reports, optionally scoped to a project and/or user.
 */
export async function countOfflineDailyReports(
  projectIdOrScope?: string | OfflineDailyReportScope,
): Promise<number> {
  const items = await listOfflineDailyReports(projectIdOrScope);
  return items.length;
}

async function updateQueuedReportFailure(
  record: OfflineDailyReportRecord,
  errorMessage: string,
): Promise<void> {
  const updated: OfflineDailyReportRecord = {
    ...record,
    attempts: record.attempts + 1,
    lastError: errorMessage,
  };

  try {
    await putRecordInIdb(updated);
    return;
  } catch {
    const localItems = readLocalStorageQueue();
    const idx = localItems.findIndex((item) => item.id === record.id);
    if (idx >= 0) {
      localItems[idx] = updated;
      writeLocalStorageQueue(localItems);
    }
  }
}

/**
 * Reconstructs a FormData payload compatible with `addProjectProgress` from a queued record.
 */
export function buildOfflineDailyReportFormData(
  record: OfflineDailyReportRecord,
): FormData {
  const formData = new FormData();
  formData.set("reportDate", record.reportDate);
  formData.set("weather", record.weather);
  formData.set("workersCount", String(record.workersCount));
  formData.set("workSummary", record.workSummary);
  formData.set("clientRequestId", record.clientRequestId || record.id);

  const equipment = normalizeEquipmentList(record.equipment);
  if (equipment) {
    formData.set("equipment", JSON.stringify(equipment));
  }

  if (record.entries && record.entries.length > 0) {
    formData.set("entries", JSON.stringify(record.entries));
  } else if (record.workPointId) {
    formData.set("workPointId", record.workPointId);
    if (record.dailyVolume !== undefined) {
      formData.set("dailyVolume", String(record.dailyVolume));
    }
  } else if (record.progress !== undefined) {
    formData.set("progress", String(record.progress));
  }

  if (record.issueNotes) {
    formData.set("issueNotes", record.issueNotes);
  }
  if (record.k3SafetyLog) {
    formData.set("k3SafetyLog", record.k3SafetyLog);
  }
  if (record.noWorkReason) {
    formData.set("noWorkReason", record.noWorkReason);
  }

  for (const photo of record.photos) {
    const blob =
      photo.blob instanceof Blob
        ? photo.blob
        : photo.dataUrl
          ? dataUrlToBlob(photo.dataUrl, photo.type)
          : null;
    if (!blob) continue;
    const file = new File([blob], photo.name || "photo.jpg", {
      type: photo.type || blob.type || "image/jpeg",
      lastModified: photo.lastModified || Date.now(),
    });
    formData.append("photos", file);
  }

  return formData;
}

function tryAcquireLocalFlushLock(ownerToken: string): boolean {
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(LOCAL_FLUSH_LOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { owner?: string; expiresAt?: number };
      if (
        parsed.owner &&
        parsed.owner !== ownerToken &&
        typeof parsed.expiresAt === "number" &&
        parsed.expiresAt > now
      ) {
        return false;
      }
    }
    window.localStorage.setItem(
      LOCAL_FLUSH_LOCK_KEY,
      JSON.stringify({ owner: ownerToken, expiresAt: now + FLUSH_LOCK_TTL_MS }),
    );
    const verified = window.localStorage.getItem(LOCAL_FLUSH_LOCK_KEY);
    if (!verified) return true;
    const parsedVerified = JSON.parse(verified) as { owner?: string };
    return parsedVerified.owner === ownerToken;
  } catch {
    return true;
  }
}

function refreshLocalFlushLock(ownerToken: string): void {
  try {
    const raw = window.localStorage.getItem(LOCAL_FLUSH_LOCK_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { owner?: string };
    if (parsed.owner === ownerToken) {
      window.localStorage.setItem(
        LOCAL_FLUSH_LOCK_KEY,
        JSON.stringify({ owner: ownerToken, expiresAt: Date.now() + FLUSH_LOCK_TTL_MS }),
      );
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function releaseLocalFlushLock(ownerToken: string): void {
  try {
    const raw = window.localStorage.getItem(LOCAL_FLUSH_LOCK_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { owner?: string };
    if (parsed.owner === ownerToken) {
      window.localStorage.removeItem(LOCAL_FLUSH_LOCK_KEY);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

async function runWithCrossTabFlushLock<T>(
  work: () => Promise<T>,
  onBusy: () => Promise<T>,
): Promise<T> {
  const executeWithLocalLease = async (): Promise<T> => {
    const ownerToken = generateRequestUuid();
    if (!tryAcquireLocalFlushLock(ownerToken)) {
      return onBusy();
    }
    const heartbeat = window.setInterval(() => {
      refreshLocalFlushLock(ownerToken);
    }, Math.floor(FLUSH_LOCK_TTL_MS / 3));

    try {
      return await work();
    } finally {
      window.clearInterval(heartbeat);
      releaseLocalFlushLock(ownerToken);
    }
  };

  if (
    typeof navigator !== "undefined" &&
    navigator.locks &&
    typeof navigator.locks.request === "function"
  ) {
    return navigator.locks.request(WEB_LOCK_NAME, async () =>
      executeWithLocalLease(),
    );
  }

  return executeWithLocalLease();
}

/**
 * Flushes queued offline daily reports in FIFO order when online.
 * Deduplicates concurrent flushes across hooks and browser tabs.
 */
export async function flushOfflineDailyReports(
  submitFn: OfflineDailyReportSubmitFn,
  options?: OfflineDailyReportScope,
): Promise<FlushOfflineDailyReportsResult> {
  if (!isBrowser()) {
    return {
      syncedCount: 0,
      failedCount: 0,
      remainingCount: 0,
      skippedOffline: true,
      results: [],
    };
  }

  const scope: OfflineDailyReportScope = {
    projectId: options?.projectId,
    ...(options?.userId !== undefined ? { userId: options.userId } : {}),
  };

  if (scope.userId !== undefined && !scope.userId.trim()) {
    return {
      syncedCount: 0,
      failedCount: 0,
      remainingCount: 0,
      skippedOffline: false,
      results: [],
    };
  }

  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  const runFlush = async (): Promise<FlushOfflineDailyReportsResult> =>
    runWithCrossTabFlushLock(
      async () => {
        const queue = await listOfflineDailyReports(scope);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          return {
            syncedCount: 0,
            failedCount: 0,
            remainingCount: queue.length,
            skippedOffline: true,
            results: [],
          };
        }

        let syncedCount = 0;
        let failedCount = 0;
        const results: FlushOfflineDailyReportsResult["results"] = [];

        for (const item of queue) {
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            break;
          }

          try {
            const formData = buildOfflineDailyReportFormData(item);
            const outcome = await submitFn(item, formData);
            if (outcome.success) {
              await removeOfflineDailyReport(item.id);
              syncedCount += 1;
              results.push({
                id: item.id,
                projectId: item.projectId,
                reportDate: item.reportDate,
                success: true,
                message: outcome.message,
              });
            } else {
              const message =
                outcome.message || "Gagal menyinkronkan laporan harian.";
              await updateQueuedReportFailure(item, message);
              failedCount += 1;
              results.push({
                id: item.id,
                projectId: item.projectId,
                reportDate: item.reportDate,
                success: false,
                message,
              });
            }
          } catch (error) {
            const message =
              error instanceof Error && error.message
                ? error.message
                : "Koneksi gagal saat sinkronisasi laporan.";
            await updateQueuedReportFailure(item, message);
            failedCount += 1;
            results.push({
              id: item.id,
              projectId: item.projectId,
              reportDate: item.reportDate,
              success: false,
              message,
            });
          }
        }

        const remainingCount = await countOfflineDailyReports(scope);
        return {
          syncedCount,
          failedCount,
          remainingCount,
          skippedOffline: false,
          results,
        };
      },
      async () => {
        const remainingCount = await countOfflineDailyReports(scope);
        return {
          syncedCount: 0,
          failedCount: 0,
          remainingCount,
          skippedOffline: false,
          results: [],
        };
      },
    );

  activeFlushPromise = runFlush().finally(() => {
    activeFlushPromise = null;
  });

  return activeFlushPromise;
}

/**
 * Registers an `online` window listener that automatically flushes queued reports.
 * Returns a cleanup callback suitable for React `useEffect`.
 */
export function registerOfflineDailyReportAutoSync(
  submitFn: OfflineDailyReportSubmitFn,
  options?: OfflineDailyReportScope & {
    onSynced?: (result: FlushOfflineDailyReportsResult) => void;
  },
): () => void {
  if (!isBrowser()) return () => {};

  const handleOnline = () => {
    void flushOfflineDailyReports(submitFn, {
      projectId: options?.projectId,
      ...(options?.userId !== undefined ? { userId: options.userId } : {}),
    }).then((result) => {
      options?.onSynced?.(result);
    });
  };

  window.addEventListener("online", handleOnline);
  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
