import { randomUUID } from "node:crypto";
import { connectToMongoDB } from "@/lib/mongoose";
import { prisma } from "@/lib/prisma";
import { AssetRecordModel } from "@/models/asset-record";
import DocumentNumberSequence from "@/models/document-number-sequence";

export const ASSET_KIND_VALUES = [
  "FTO",
  "TTK",
  "SRV",
  "SJN",
  "BLJ",
  "BBM",
  "DRW",
  "BKT",
  "BON",
  "KWT",
  "INV",
  "USR",
  "TPL",
] as const;

export type AssetKind = (typeof ASSET_KIND_VALUES)[number];

export const FINANCE_DOC_KINDS = ["BKT", "BON", "KWT", "INV"] as const;
export type FinanceDocKind = (typeof FINANCE_DOC_KINDS)[number];

export const ASSET_KIND_META: Record<
  AssetKind,
  { label: string; docType: string; subfolder: string }
> = {
  FTO: { label: "Foto Progres Harian", docType: "FOTO_PROGRES", subfolder: "foto-progres" },
  TTK: { label: "Foto Titik Kerja", docType: "FOTO_TITIK", subfolder: "foto-titik" },
  SRV: { label: "Foto Survey GIS", docType: "SURVEY", subfolder: "survey-gis" },
  SJN: { label: "Foto Kedatangan / Surat Jalan", docType: "SURAT_JALAN", subfolder: "surat-jalan" },
  BLJ: { label: "Lampiran Belanja Stok", docType: "BELANJA", subfolder: "belanja-stok" },
  BBM: { label: "Foto & Bon BBM", docType: "BBM", subfolder: "bbm-kendaraan" },
  DRW: { label: "Blueprint / Drawing", docType: "DRAWING", subfolder: "blueprint-drawing" },
  BKT: { label: "Bukti Transfer", docType: "BUKTI_TRANSFER", subfolder: "bukti-transfer" },
  BON: { label: "Bon / Nota / Struk", docType: "BON", subfolder: "bon-nota" },
  KWT: { label: "Kwitansi", docType: "KWITANSI", subfolder: "kwitansi" },
  INV: { label: "Invoice / Faktur", docType: "INVOICE", subfolder: "invoice" },
  USR: { label: "Foto Profil", docType: "PROFIL", subfolder: "profil" },
  TPL: { label: "Gambar Template", docType: "TEMPLATE", subfolder: "template" },
};

const ASSET_CODE_REGEX = new RegExp(
  `([A-Z0-9]{2,28})-(${ASSET_KIND_VALUES.join("|")})-(\\d+)X`,
  "i",
);

export function isFinanceDocKind(kind?: string | null): kind is FinanceDocKind {
  if (!kind) return false;
  return (FINANCE_DOC_KINDS as readonly string[]).includes(kind.toUpperCase());
}

export function normalizeFinanceAssetKind(
  input?: string | null,
  fallback: FinanceDocKind = "BKT",
): FinanceDocKind {
  const upper = (input ?? "").trim().toUpperCase();
  if (upper === "BKT" || upper === "BUKTI_TRANSFER" || upper === "TRANSFER") return "BKT";
  if (upper === "BON" || upper === "NOTA" || upper === "STRUK" || upper === "RESI") return "BON";
  if (upper === "KWT" || upper === "KWITANSI" || upper === "RECEIPT") return "KWT";
  if (upper === "INV" || upper === "INVOICE" || upper === "FAKTUR") return "INV";
  return fallback;
}

export function normalizeProjectSlugBase(value?: string | null): string {
  if (!value) return "UMUM";
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /^(rehab(ilitasi)?(\s+lahan)?(\s+sawah)?|poktan|kelompok\s*tani|kth|kel\.?\s*tani)\s*[-–:]\s*/i,
      "",
    )
    .trim();
  const compact = cleaned.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
  if (compact.length < 2) return "UMUM";
  return compact.slice(0, 20);
}

export interface ProjectAssetScope {
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  projectSlug: string;
  scopeKey: string;
}

async function disambiguateProjectSlug(
  baseSlug: string,
  projectId: string | null,
  projectCode: string | null,
): Promise<string> {
  if (baseSlug === "UMUM" || !projectId) return baseSlug;

  await connectToMongoDB();
  const ownRecord = await AssetRecordModel.findOne({
    projectId,
    projectSlug: { $ne: "UMUM" },
  })
    .select("projectSlug")
    .lean<{ projectSlug?: string } | null>();
  if (ownRecord?.projectSlug) {
    return ownRecord.projectSlug.toUpperCase();
  }

  const conflict = await AssetRecordModel.findOne({
    projectSlug: baseSlug,
    $and: [{ projectId: { $ne: null } }, { projectId: { $ne: projectId } }],
  })
    .select("projectId")
    .lean<{ projectId?: string } | null>();
  if (!conflict) {
    return baseSlug;
  }

  const codeDigits = (projectCode ?? "").replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase();
  const idSuffix = projectId.replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase();
  const suffix = codeDigits || idSuffix || "PRJ";
  return `${baseSlug.slice(0, Math.max(4, 20 - suffix.length))}${suffix}`;
}

export async function resolveProjectAssetScope(params?: {
  projectId?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  fallbackScope?: string | null;
}): Promise<ProjectAssetScope> {
  let resolvedId = params?.projectId?.trim() || null;
  let resolvedName = params?.projectName?.trim() || null;
  let resolvedCode = params?.projectCode?.trim() || null;

  if (resolvedId) {
    const project = await prisma.project.findUnique({
      where: { id: resolvedId },
      select: { id: true, name: true, title: true, kelompokTani: true, code: true },
    });
    if (project) {
      resolvedId = project.id;
      resolvedName = project.name || project.title || project.kelompokTani || resolvedName;
      resolvedCode = project.code || resolvedCode;
    } else {
      resolvedId = null;
    }
  } else if (resolvedCode) {
    const project = await prisma.project.findUnique({
      where: { code: resolvedCode },
      select: { id: true, name: true, title: true, kelompokTani: true, code: true },
    });
    if (project) {
      resolvedId = project.id;
      resolvedName = project.name || project.title || project.kelompokTani || resolvedName;
      resolvedCode = project.code;
    }
  }

  if (resolvedId) {
    const baseSlug = normalizeProjectSlugBase(resolvedName || resolvedCode);
    const projectSlug = await disambiguateProjectSlug(baseSlug, resolvedId, resolvedCode);
    return {
      projectId: resolvedId,
      projectName: resolvedName,
      projectCode: resolvedCode,
      projectSlug,
      scopeKey: `PRJ:${resolvedId}`,
    };
  }

  const fallbackName = resolvedName || params?.fallbackScope?.trim() || null;
  const fallbackSlug = fallbackName ? normalizeProjectSlugBase(fallbackName) : "UMUM";
  const scopeKey =
    fallbackSlug === "UMUM" ? "GLOBAL:UMUM" : `SCOPE:${fallbackSlug}`;

  return {
    projectId: null,
    projectName: fallbackName,
    projectCode: resolvedCode,
    projectSlug: fallbackSlug,
    scopeKey,
  };
}

export interface AllocatedAssetCode {
  assetCode: string;
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  projectSlug: string;
  kind: AssetKind;
  docType: string;
  sequenceNumber: number;
  scopeKey: string;
}

export async function allocateNextAssetCode(params: {
  kind: AssetKind;
  projectId?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  fallbackScope?: string | null;
  docType?: string | null;
}): Promise<AllocatedAssetCode> {
  await connectToMongoDB();
  const scope = await resolveProjectAssetScope({
    projectId: params.projectId,
    projectName: params.projectName,
    projectCode: params.projectCode,
    fallbackScope: params.fallbackScope,
  });

  const counterKind = `ASSET:${scope.scopeKey}:${params.kind}`;
  const docType = params.docType?.trim() || ASSET_KIND_META[params.kind].docType;

  for (let collisionGuard = 0; collisionGuard < 50; collisionGuard += 1) {
    let seqDoc: { value: number } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        seqDoc = await DocumentNumberSequence.findOneAndUpdate(
          { kind: counterKind, year: 0 },
          {
            $inc: { value: 1 },
            $setOnInsert: { _id: randomUUID(), kind: counterKind, year: 0 },
          },
          { upsert: true, new: true },
        ).lean<{ value: number } | null>();
        if (seqDoc && typeof seqDoc.value === "number") break;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("E11000") || attempt === 4) {
          throw err;
        }
      }
    }

    const sequenceNumber = seqDoc?.value ?? 1;
    const assetCode = `${scope.projectSlug}-${params.kind}-${sequenceNumber}X`;
    const exists = await AssetRecordModel.exists({ assetCode });
    if (!exists) {
      return {
        assetCode,
        projectId: scope.projectId,
        projectName: scope.projectName,
        projectCode: scope.projectCode,
        projectSlug: scope.projectSlug,
        kind: params.kind,
        docType,
        sequenceNumber,
        scopeKey: scope.scopeKey,
      };
    }
  }

  throw new Error(`Gagal mengalokasikan kode aset unik untuk ${scope.projectSlug}-${params.kind}.`);
}

export async function registerUploadedAsset(params: {
  assetCode: string;
  projectId?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  projectSlug: string;
  kind: AssetKind;
  sequenceNumber: number;
  docType?: string | null;
  provider: "cloudinary" | "gdrive" | "local_private" | "legacy";
  publicId?: string | null;
  driveFileId?: string | null;
  url: string;
  fileUrl?: string | null;
  folder?: string | null;
  mimeType?: string | null;
  originalFilename?: string | null;
  sizeBytes?: number | null;
  entityType?: string | null;
  entityId?: string | null;
  ticketId?: string | null;
  uploadedById?: string | null;
}): Promise<void> {
  await connectToMongoDB();
  const normalizedCode = params.assetCode.trim().toUpperCase();
  await AssetRecordModel.findOneAndUpdate(
    { assetCode: normalizedCode },
    {
      $set: {
        projectId: params.projectId ?? null,
        projectName: params.projectName ?? null,
        projectCode: params.projectCode ?? null,
        projectSlug: params.projectSlug.toUpperCase(),
        kind: params.kind,
        sequenceNumber: params.sequenceNumber,
        docType: params.docType ?? ASSET_KIND_META[params.kind].docType,
        provider: params.provider,
        publicId: params.publicId ?? null,
        driveFileId: params.driveFileId ?? null,
        url: params.url,
        fileUrl: params.fileUrl ?? params.url,
        folder: params.folder ?? null,
        mimeType: params.mimeType ?? null,
        originalFilename: params.originalFilename ?? null,
        sizeBytes: params.sizeBytes ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        ticketId: params.ticketId ?? null,
        uploadedById: params.uploadedById ?? null,
        deletedAt: null,
      },
      $setOnInsert: {
        _id: randomUUID(),
        assetCode: normalizedCode,
      },
    },
    { upsert: true },
  );
}

export async function markAssetDeleted(params: {
  url?: string | null;
  assetCode?: string | null;
  publicId?: string | null;
}): Promise<void> {
  const filters: Record<string, unknown>[] = [];
  if (params.assetCode) {
    filters.push({ assetCode: params.assetCode.trim().toUpperCase() });
  }
  if (params.url) {
    filters.push({ url: params.url.trim() });
    const parsed = parseAssetCode(params.url);
    if (parsed) {
      filters.push({ assetCode: parsed.assetCode });
    }
  }
  if (params.publicId) {
    filters.push({ publicId: params.publicId.trim() });
  }
  if (filters.length === 0) return;

  await connectToMongoDB();
  await AssetRecordModel.updateMany(
    { $or: filters, deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );
}

export interface ParsedAssetCode {
  assetCode: string;
  projectSlug: string;
  kind: AssetKind;
  sequenceNumber: number;
}

export function parseAssetCode(value?: string | null): ParsedAssetCode | null {
  if (!value) return null;
  const match = value.match(ASSET_CODE_REGEX);
  if (!match) return null;
  const projectSlug = match[1].toUpperCase();
  const kind = match[2].toUpperCase() as AssetKind;
  const sequenceNumber = Number.parseInt(match[3], 10);
  if (!Number.isFinite(sequenceNumber) || sequenceNumber <= 0) return null;
  return {
    assetCode: `${projectSlug}-${kind}-${sequenceNumber}X`,
    projectSlug,
    kind,
    sequenceNumber,
  };
}

export function extractAssetDisplayLabel(value?: string | null): {
  assetCode: string | null;
  kindLabel: string | null;
  kind: AssetKind | null;
  sequenceNumber: number | null;
} {
  const parsed = parseAssetCode(value);
  if (!parsed) {
    return { assetCode: null, kindLabel: null, kind: null, sequenceNumber: null };
  }
  return {
    assetCode: parsed.assetCode,
    kindLabel: ASSET_KIND_META[parsed.kind]?.label ?? parsed.kind,
    kind: parsed.kind,
    sequenceNumber: parsed.sequenceNumber,
  };
}

export function doesAssetMatchProject(
  asset: {
    assetCode?: string | null;
    url?: string | null;
    publicId?: string | null;
    projectId?: string | null;
  },
  target: {
    projectId?: string | null;
    projectName?: string | null;
    projectTitle?: string | null;
    poktanName?: string | null;
    projectCode?: string | null;
  },
): boolean {
  if (asset.projectId && target.projectId && asset.projectId !== target.projectId) {
    return false;
  }

  const parsed =
    parseAssetCode(asset.assetCode) ||
    parseAssetCode(asset.publicId) ||
    parseAssetCode(asset.url);
  if (!parsed) {
    // Legacy URL without assetCode: allow if projectId doesn't mismatch.
    return true;
  }

  if (parsed.projectSlug === "UMUM") {
    return true;
  }

  const candidateBases = [
    target.projectName,
    target.projectTitle,
    target.poktanName,
  ]
    .map((candidate) => normalizeProjectSlugBase(candidate))
    .filter((slug) => slug !== "UMUM");

  if (candidateBases.length === 0) {
    return true;
  }

  const codeSuffix = (target.projectCode ?? "").replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase();
  const idSuffix = (target.projectId ?? "").replace(/[^A-Za-z0-9]+/g, "").slice(-4).toUpperCase();

  return candidateBases.some((base) => {
    if (parsed.projectSlug === base) return true;
    if (codeSuffix && parsed.projectSlug === `${base.slice(0, Math.max(4, 20 - codeSuffix.length))}${codeSuffix}`) {
      return true;
    }
    if (idSuffix && parsed.projectSlug === `${base.slice(0, Math.max(4, 20 - idSuffix.length))}${idSuffix}`) {
      return true;
    }
    return false;
  });
}

export function buildProjectAssetFolder(baseFolder: string, projectSlug: string, kind: AssetKind): string {
  const cleanBase = baseFolder.replace(/^\/+|\/+$/g, "");
  return `${cleanBase}/${projectSlug.toLowerCase()}/${ASSET_KIND_META[kind].subfolder}`;
}
