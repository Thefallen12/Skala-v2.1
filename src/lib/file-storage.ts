import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  allocateNextAssetCode,
  type AllocatedAssetCode,
  type AssetKind,
  buildProjectAssetFolder,
  markAssetDeleted,
  parseAssetCode,
  registerUploadedAsset,
  resolveProjectAssetScope,
} from "@/lib/asset-codes";
import {
  type AssetReferenceIgnoreTarget,
  isAssetUrlReferencedInDb,
} from "@/lib/asset-references";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  deleteGoogleDriveFile,
  extractGoogleDriveFileId,
  isGoogleDriveConfigured,
  uploadGoogleDriveFile,
} from "@/lib/google-drive-storage";

export type StorageProviderPreference = "auto" | "cloudinary" | "gdrive";

export interface AssetUploadContext {
  projectId?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  fallbackScope?: string | null;
  kind?: AssetKind;
  docType?: string | null;
  assetCode?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ticketId?: string | null;
  uploadedById?: string | null;
}

export interface StoredAssetResult {
  url: string;
  secureUrl: string;
  publicId: string;
  driveFileId: string | null;
  assetCode: string;
  projectId: string | null;
  projectSlug: string;
  kind: AssetKind;
  docType: string;
  sequenceNumber: number;
  provider: "cloudinary" | "gdrive" | "local_private";
  folder: string;
}

function readEnv(key: string): string {
  const raw = process.env[key];
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function getStorageProviderPreference(): StorageProviderPreference {
  const raw = readEnv("STORAGE_PROVIDER").toLowerCase();
  if (raw === "gdrive" || raw === "google_drive" || raw === "google-drive") {
    return "gdrive";
  }
  if (raw === "cloudinary") {
    return "cloudinary";
  }
  return "auto";
}

export function isLocalPrivateStorageAllowed(): boolean {
  return readEnv("ALLOW_LOCAL_DISK_STORAGE").toLowerCase() === "true";
}

function getPrivateDataRoot(): string {
  return path.join(process.cwd(), ".private-data", "assets");
}

function buildSafePrivatePath(relativeFilePath: string): string {
  const clean = relativeFilePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(clean);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Path file lokal tidak valid.");
  }
  return path.join(getPrivateDataRoot(), normalized);
}

export async function writePrivateLocalAsset(
  relativeFilePath: string,
  bytes: Buffer,
): Promise<string> {
  const fullPath = buildSafePrivatePath(relativeFilePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
  return fullPath;
}

export async function readPrivateLocalAsset(
  relativeFilePath: string,
): Promise<Buffer | null> {
  try {
    const fullPath = buildSafePrivatePath(relativeFilePath);
    return await readFile(fullPath);
  } catch {
    return null;
  }
}

export async function removePrivateLocalAsset(
  relativeFilePath: string,
): Promise<void> {
  try {
    const fullPath = buildSafePrivatePath(relativeFilePath);
    await rm(fullPath, { force: true });
  } catch {
    // Ignore missing local file during cleanup.
  }
}

async function resolveOrAllocateAsset(
  defaultKind: AssetKind,
  context?: AssetUploadContext,
): Promise<AllocatedAssetCode> {
  const kind = context?.kind ?? defaultKind;
  if (context?.assetCode) {
    const parsed = parseAssetCode(context.assetCode);
    if (parsed) {
      const scope = await resolveProjectAssetScope({
        projectId: context.projectId,
        projectName: context.projectName,
        projectCode: context.projectCode,
        fallbackScope: context.fallbackScope,
      });
      return {
        assetCode: parsed.assetCode,
        projectId: scope.projectId,
        projectName: scope.projectName,
        projectCode: scope.projectCode,
        projectSlug: parsed.projectSlug,
        kind: parsed.kind,
        docType: context.docType ?? scope.scopeKey,
        sequenceNumber: parsed.sequenceNumber,
        scopeKey: scope.scopeKey,
      };
    }
  }

  return allocateNextAssetCode({
    kind,
    projectId: context?.projectId,
    projectName: context?.projectName,
    projectCode: context?.projectCode,
    fallbackScope: context?.fallbackScope,
    docType: context?.docType,
  });
}

export async function uploadManagedAsset(params: {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  originalFilename?: string | null;
  baseFolder: string;
  defaultKind: AssetKind;
  context?: AssetUploadContext;
  localRouteUrlBuilder?: (assetFileName: string) => string;
  cloudinaryUploader: (args: {
    folder: string;
    publicId: string;
    assetCode: string;
  }) => Promise<{ secureUrl: string; publicId: string }>;
}): Promise<StoredAssetResult> {
  const allocated = await resolveOrAllocateAsset(params.defaultKind, params.context);
  const projectFolder = buildProjectAssetFolder(
    params.baseFolder,
    allocated.projectSlug,
    allocated.kind,
  );
  const cleanExt = params.extension.replace(/^\.+/, "").toLowerCase() || "bin";
  const assetFileName = `${allocated.assetCode}.${cleanExt}`;

  const preference = getStorageProviderPreference();
  const hasCloudinary = Boolean(getCloudinaryCredentials());
  const hasGoogleDrive = isGoogleDriveConfigured();

  const tryCloudinary = async (): Promise<StoredAssetResult> => {
    if (!hasCloudinary) {
      throw new Error("Kredensial Cloudinary belum dikonfigurasi.");
    }
    const uploaded = await params.cloudinaryUploader({
      folder: projectFolder,
      publicId: allocated.assetCode,
      assetCode: allocated.assetCode,
    });
    await registerUploadedAsset({
      assetCode: allocated.assetCode,
      projectId: allocated.projectId,
      projectName: allocated.projectName,
      projectCode: allocated.projectCode,
      projectSlug: allocated.projectSlug,
      kind: allocated.kind,
      sequenceNumber: allocated.sequenceNumber,
      docType: allocated.docType,
      provider: "cloudinary",
      publicId: uploaded.publicId,
      driveFileId: null,
      url: uploaded.secureUrl,
      fileUrl: uploaded.secureUrl,
      folder: projectFolder,
      mimeType: params.mimeType,
      originalFilename: params.originalFilename ?? assetFileName,
      sizeBytes: params.bytes.byteLength,
      entityType: params.context?.entityType ?? null,
      entityId: params.context?.entityId ?? null,
      ticketId: params.context?.ticketId ?? null,
      uploadedById: params.context?.uploadedById ?? null,
    });
    return {
      url: uploaded.secureUrl,
      secureUrl: uploaded.secureUrl,
      publicId: uploaded.publicId,
      driveFileId: null,
      assetCode: allocated.assetCode,
      projectId: allocated.projectId,
      projectSlug: allocated.projectSlug,
      kind: allocated.kind,
      docType: allocated.docType,
      sequenceNumber: allocated.sequenceNumber,
      provider: "cloudinary",
      folder: projectFolder,
    };
  };

  const tryGoogleDrive = async (): Promise<StoredAssetResult> => {
    if (!hasGoogleDrive) {
      throw new Error("Kredensial Google Drive belum dikonfigurasi.");
    }
    const uploaded = await uploadGoogleDriveFile({
      bytes: params.bytes,
      mimeType: params.mimeType,
      fileName: assetFileName,
      folderSegments: ["SKALA-ASSETS", allocated.projectSlug, allocated.kind],
    });
    await registerUploadedAsset({
      assetCode: allocated.assetCode,
      projectId: allocated.projectId,
      projectName: allocated.projectName,
      projectCode: allocated.projectCode,
      projectSlug: allocated.projectSlug,
      kind: allocated.kind,
      sequenceNumber: allocated.sequenceNumber,
      docType: allocated.docType,
      provider: "gdrive",
      publicId: uploaded.fileId,
      driveFileId: uploaded.fileId,
      url: uploaded.proxyUrl,
      fileUrl: uploaded.proxyUrl,
      folder: `SKALA-ASSETS/${allocated.projectSlug}/${allocated.kind}`,
      mimeType: params.mimeType,
      originalFilename: params.originalFilename ?? assetFileName,
      sizeBytes: params.bytes.byteLength,
      entityType: params.context?.entityType ?? null,
      entityId: params.context?.entityId ?? null,
      ticketId: params.context?.ticketId ?? null,
      uploadedById: params.context?.uploadedById ?? null,
    });
    return {
      url: uploaded.proxyUrl,
      secureUrl: uploaded.proxyUrl,
      publicId: uploaded.fileId,
      driveFileId: uploaded.fileId,
      assetCode: allocated.assetCode,
      projectId: allocated.projectId,
      projectSlug: allocated.projectSlug,
      kind: allocated.kind,
      docType: allocated.docType,
      sequenceNumber: allocated.sequenceNumber,
      provider: "gdrive",
      folder: `SKALA-ASSETS/${allocated.projectSlug}/${allocated.kind}`,
    };
  };

  let lastError: unknown = null;

  if (preference === "gdrive") {
    try {
      return await tryGoogleDrive();
    } catch (err) {
      lastError = err;
      if (hasCloudinary && readEnv("STORAGE_ALLOW_FALLBACK").toLowerCase() !== "false") {
        try {
          return await tryCloudinary();
        } catch (fallbackErr) {
          lastError = fallbackErr;
        }
      }
    }
  } else if (preference === "cloudinary") {
    return await tryCloudinary();
  } else {
    // Auto mode: Cloudinary primary -> Google Drive automatic fallback.
    if (hasCloudinary) {
      try {
        return await tryCloudinary();
      } catch (err) {
        lastError = err;
        if (hasGoogleDrive) {
          try {
            return await tryGoogleDrive();
          } catch (driveErr) {
            lastError = driveErr;
          }
        }
      }
    } else if (hasGoogleDrive) {
      try {
        return await tryGoogleDrive();
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (isLocalPrivateStorageAllowed() && params.localRouteUrlBuilder) {
    const relativePath = `${projectFolder}/${assetFileName}`;
    await writePrivateLocalAsset(relativePath, params.bytes);
    const localUrl = params.localRouteUrlBuilder(assetFileName);
    await registerUploadedAsset({
      assetCode: allocated.assetCode,
      projectId: allocated.projectId,
      projectName: allocated.projectName,
      projectCode: allocated.projectCode,
      projectSlug: allocated.projectSlug,
      kind: allocated.kind,
      sequenceNumber: allocated.sequenceNumber,
      docType: allocated.docType,
      provider: "local_private",
      publicId: relativePath,
      driveFileId: null,
      url: localUrl,
      fileUrl: localUrl,
      folder: projectFolder,
      mimeType: params.mimeType,
      originalFilename: params.originalFilename ?? assetFileName,
      sizeBytes: params.bytes.byteLength,
      entityType: params.context?.entityType ?? null,
      entityId: params.context?.entityId ?? null,
      ticketId: params.context?.ticketId ?? null,
      uploadedById: params.context?.uploadedById ?? null,
    });
    return {
      url: localUrl,
      secureUrl: localUrl,
      publicId: relativePath,
      driveFileId: null,
      assetCode: allocated.assetCode,
      projectId: allocated.projectId,
      projectSlug: allocated.projectSlug,
      kind: allocated.kind,
      docType: allocated.docType,
      sequenceNumber: allocated.sequenceNumber,
      provider: "local_private",
      folder: projectFolder,
    };
  }

  const reason =
    lastError instanceof Error ? lastError.message : "Konfigurasi storage Cloudinary / Google Drive tidak tersedia.";
  throw new Error(`Upload aset gagal (${allocated.assetCode}): ${reason}`);
}

export async function removeManagedAssetIfUnreferenced(params: {
  url?: string | null;
  publicId?: string | null;
  ignore?: AssetReferenceIgnoreTarget;
  cloudinaryRemover?: (url: string, publicId?: string | null) => Promise<void>;
}): Promise<{ deleted: boolean; skippedReason?: string }> {
  const url = params.url?.trim();
  const publicId = params.publicId?.trim();
  if (!url && !publicId) {
    return { deleted: false, skippedReason: "empty" };
  }

  if (url) {
    const stillReferenced = await isAssetUrlReferencedInDb(url, {
      ignore: params.ignore,
      publicId,
    });
    if (stillReferenced) {
      return { deleted: false, skippedReason: "referenced_elsewhere" };
    }
  }

  const driveFileId = extractGoogleDriveFileId(url);
  if (driveFileId) {
    await deleteGoogleDriveFile(driveFileId);
    await markAssetDeleted({ url, assetCode: url });
    return { deleted: true };
  }

  if (publicId && !url?.startsWith("http") && publicId.includes("/") && publicId.includes(".")) {
    await removePrivateLocalAsset(publicId);
  }

  if (url && params.cloudinaryRemover) {
    await params.cloudinaryRemover(url, publicId);
  }

  await markAssetDeleted({ url, publicId });
  return { deleted: true };
}
