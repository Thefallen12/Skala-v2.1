import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  allocateNextAssetCode,
  buildProjectAssetFolder,
  markAssetDeleted,
  registerUploadedAsset,
} from "@/lib/asset-codes";
import type { AssetReferenceIgnoreTarget } from "@/lib/asset-references";
import { getCloudinaryCredentials } from "@/lib/cloudinary-config";
import {
  removeCloudinaryRawFile,
  uploadCloudinaryRawFile,
} from "@/lib/cloudinary-raw-files";
import { DRAWING_DOCUMENT_CLOUDINARY_FOLDER } from "@/lib/drawing-document-config";
import {
  type AssetUploadContext,
  getStorageProviderPreference,
  removeManagedAssetIfUnreferenced,
} from "@/lib/file-storage";
import {
  extractGoogleDriveFileId,
  isGoogleDriveConfigured,
  uploadGoogleDriveFile,
} from "@/lib/google-drive-storage";

const MAX_BLUEPRINT_BYTES = 25 * 1024 * 1024;
const blueprintDirectory = process.env.BLUEPRINT_UPLOAD_DIR
  ? resolve(process.env.BLUEPRINT_UPLOAD_DIR)
  : join(process.cwd(), ".private-data", "blueprints");

const mimeExtensions = {
  "application/pdf": "pdf",
  "application/acad": "dwg",
  "application/x-acad": "dwg",
  "application/autocad_dwg": "dwg",
  "image/vnd.dxf": "dxf",
  "application/dxf": "dxf",
  "application/x-dxf": "dxf",
  "application/octet-stream": "unknown",
} as const;

type BlueprintExtension = "pdf" | "dwg" | "dxf";

export class BlueprintFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintFileValidationError";
  }
}

function hasValidSignature(bytes: Uint8Array, extension: BlueprintExtension) {
  if (extension === "pdf") {
    return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  }
  if (extension === "dwg") {
    return /^AC10[0-9]{2}$/.test(new TextDecoder().decode(bytes.subarray(0, 6)));
  }
  const header = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
  return /^0\s*\r?\nSECTION\b/i.test(header) || /^AutoCAD DXF/i.test(header);
}

function filePath(fileName: string) {
  return /^(?:[0-9a-f-]{36}|[A-Za-z0-9]{2,28}-[A-Z]{2,5}-\d+X)\.(pdf|dwg|dxf)$/i.test(
    fileName,
  )
    ? join(blueprintDirectory, fileName)
    : null;
}

export async function saveBlueprintFile(
  file: File,
  context?: AssetUploadContext,
): Promise<string> {
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > MAX_BLUEPRINT_BYTES
  ) {
    throw new BlueprintFileValidationError(
      "Ukuran gambar kerja harus lebih dari 0 dan maksimal 25 MB.",
    );
  }
  const extensionFromName = file.name.split(".").at(-1)?.toLowerCase();
  if (
    extensionFromName !== "pdf" &&
    extensionFromName !== "dwg" &&
    extensionFromName !== "dxf"
  ) {
    throw new BlueprintFileValidationError(
      "Format gambar kerja harus PDF, DWG, atau DXF.",
    );
  }
  const declaredExtension = mimeExtensions[file.type as keyof typeof mimeExtensions];
  if (
    declaredExtension &&
    declaredExtension !== "unknown" &&
    declaredExtension !== extensionFromName
  ) {
    throw new BlueprintFileValidationError(
      "Ekstensi file tidak sesuai dengan format yang dipilih.",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasValidSignature(bytes, extensionFromName)) {
    throw new BlueprintFileValidationError(
      "Isi file tidak sesuai dengan format gambar kerja yang dipilih.",
    );
  }

  const assetContext: AssetUploadContext = {
    ...context,
    kind: context?.kind ?? "DRW",
  };
  const preference = getStorageProviderPreference();
  const hasCloudinary = Boolean(getCloudinaryCredentials());
  const hasGoogleDrive = isGoogleDriveConfigured();

  if (preference === "gdrive" && hasGoogleDrive) {
    const allocated = await allocateNextAssetCode({
      kind: assetContext.kind ?? "DRW",
      projectId: assetContext.projectId,
      projectName: assetContext.projectName,
      projectCode: assetContext.projectCode,
      fallbackScope: assetContext.fallbackScope,
      docType: assetContext.docType,
    });
    const uploaded = await uploadGoogleDriveFile({
      bytes,
      mimeType: file.type || "application/octet-stream",
      fileName: `${allocated.assetCode}.${extensionFromName}`,
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
      mimeType: file.type || "application/octet-stream",
      originalFilename: file.name,
      sizeBytes: bytes.byteLength,
      entityType: assetContext.entityType ?? "Blueprint",
      entityId: assetContext.entityId ?? null,
      uploadedById: assetContext.uploadedById ?? null,
    });
    return uploaded.proxyUrl;
  }

  if (hasCloudinary || hasGoogleDrive) {
    return uploadCloudinaryRawFile(
      file,
      DRAWING_DOCUMENT_CLOUDINARY_FOLDER,
      ["pdf", "dwg", "dxf"],
      MAX_BLUEPRINT_BYTES,
      { ...assetContext, entityType: assetContext.entityType ?? "Blueprint" },
    );
  }

  const allocated = await allocateNextAssetCode({
    kind: assetContext.kind ?? "DRW",
    projectId: assetContext.projectId,
    projectName: assetContext.projectName,
    projectCode: assetContext.projectCode,
    fallbackScope: assetContext.fallbackScope,
    docType: assetContext.docType,
  });
  const fileName = `${allocated.assetCode}.${extensionFromName}`;
  await mkdir(blueprintDirectory, { recursive: true });
  await writeFile(
    join(/* turbopackIgnore: true */ blueprintDirectory, fileName),
    bytes,
    { flag: "wx" },
  );
  const localUrl = `/api/projects/blueprints/${fileName}`;
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
    publicId: buildProjectAssetFolder(DRAWING_DOCUMENT_CLOUDINARY_FOLDER, allocated.projectSlug, allocated.kind),
    url: localUrl,
    fileUrl: localUrl,
    mimeType: file.type || "application/octet-stream",
    originalFilename: file.name,
    sizeBytes: bytes.byteLength,
    entityType: assetContext.entityType ?? "Blueprint",
    entityId: assetContext.entityId ?? null,
    uploadedById: assetContext.uploadedById ?? null,
  });
  return localUrl;
}

export async function removeBlueprintFile(
  url: string,
  options?: { ignore?: AssetReferenceIgnoreTarget },
): Promise<void> {
  if (extractGoogleDriveFileId(url)) {
    await removeManagedAssetIfUnreferenced({ url, ignore: options?.ignore });
    return;
  }
  if (await removeCloudinaryRawFile(url, options)) return;
  const fileName = url.split("/").at(-1) ?? "";
  const path = filePath(fileName);
  if (!path) return;
  await rm(path, { force: true });
  await markAssetDeleted({ url });
}

export async function readBlueprintFile(fileName: string) {
  const path = filePath(fileName);
  if (!path) return null;
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  const contentType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "dwg"
        ? "application/acad"
        : "image/vnd.dxf";
  try {
    return {
      bytes: new Uint8Array(await readFile(/* turbopackIgnore: true */ path)),
      contentType,
      extension,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}
