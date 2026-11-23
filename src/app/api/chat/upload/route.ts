import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { ASSET_KIND_META, parseAssetCode } from "@/lib/asset-codes";
import {
  CloudinaryConfigurationError,
  CloudinaryPhotoValidationError,
  uploadCloudinaryPhoto,
} from "@/lib/cloudinary-photos";
import {
  CloudinaryRawFileValidationError,
  uploadCloudinaryRawFile,
} from "@/lib/cloudinary-raw-files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_CHAT_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_CHAT_KINDS = ["BON", "KWT", "BKT", "FTO", "DRW"] as const;
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx"] as const;

type ChatUploadKind = (typeof ALLOWED_CHAT_KINDS)[number];

function isValidChatKind(value: string): value is ChatUploadKind {
  return (ALLOWED_CHAT_KINDS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk terlebih dahulu untuk mengunggah lampiran." },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Format unggahan harus menggunakan multipart/form-data." },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File) || fileEntry.size < 1) {
    return NextResponse.json(
      { message: "File lampiran wajib dipilih dan tidak boleh kosong." },
      { status: 400 },
    );
  }

  if (fileEntry.size > MAX_CHAT_UPLOAD_BYTES) {
    return NextResponse.json(
      { message: "Ukuran file maksimal adalah 10 MB." },
      { status: 400 },
    );
  }

  const rawProjectId = formData.get("projectId");
  const projectId =
    typeof rawProjectId === "string" && rawProjectId.trim()
      ? rawProjectId.trim()
      : null;

  const rawKind = formData.get("kind");
  const normalizedKind =
    typeof rawKind === "string" ? rawKind.trim().toUpperCase() : "";

  if (normalizedKind && !isValidChatKind(normalizedKind)) {
    return NextResponse.json(
      {
        message:
          "Jenis lampiran tidak valid. Gunakan BON, KWT, BKT, FTO, atau DRW.",
      },
      { status: 400 },
    );
  }

  const declaredMime = (fileEntry.type || "").split(";")[0].trim().toLowerCase();
  const extension = fileEntry.name.split(".").pop()?.toLowerCase() ?? "";

  const isDocument = (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension);
  const isImage =
    !isDocument &&
    (IMAGE_MIME_TYPES.has(declaredMime) || IMAGE_EXTENSIONS.has(extension));

  if (!isImage && !isDocument) {
    return NextResponse.json(
      {
        message:
          "Format file tidak didukung. Unggah gambar (JPG, PNG, WEBP) atau dokumen (PDF, DOC, DOCX, XLS, XLSX).",
      },
      { status: 400 },
    );
  }

  const validKind: ChatUploadKind =
    normalizedKind && isValidChatKind(normalizedKind)
      ? normalizedKind
      : isImage
        ? "FTO"
        : "DRW";

  try {
    const project = projectId
      ? await prisma.project.findFirst({
          where: { id: projectId, isDeleted: false },
          select: { id: true, name: true, title: true, code: true },
        })
      : null;

    const projectName = project?.name ?? project?.title ?? null;
    const projectCode = project?.code ?? null;
    const resolvedProjectId = project?.id ?? null;

    if (isImage) {
      const res = await uploadCloudinaryPhoto(
        fileEntry,
        "skala_chat_attachments",
        MAX_CHAT_UPLOAD_BYTES,
        {
          projectId: resolvedProjectId,
          projectName,
          projectCode,
          fallbackScope: "CHAT",
          kind: validKind,
          entityType: "CHAT_ATTACHMENT",
          uploadedById: session.user.id,
        },
      );

      const kindLabel = ASSET_KIND_META[validKind]?.label ?? validKind;
      const summaryParts = [kindLabel];
      if (projectCode) summaryParts.push(projectCode);
      if (res.assetCode) summaryParts.push(res.assetCode);

      return NextResponse.json({
        attachment: {
          id: randomUUID(),
          title: fileEntry.name,
          kind: "IMAGE" as const,
          docType: validKind,
          assetCode: res.assetCode ?? null,
          url: res.secureUrl,
          downloadUrl: res.secureUrl,
          mimeType: fileEntry.type || "image/jpeg",
          sizeBytes: fileEntry.size,
          summary: summaryParts.join(" · "),
        },
      });
    }

    const rawKindForUpload = validKind === "FTO" ? "DRW" : validKind;
    const url = await uploadCloudinaryRawFile(
      fileEntry,
      "skala_chat_documents",
      DOCUMENT_EXTENSIONS,
      MAX_CHAT_UPLOAD_BYTES,
      {
        projectId: resolvedProjectId,
        projectName,
        projectCode,
        fallbackScope: "CHAT",
        kind: rawKindForUpload,
        entityType: "CHAT_ATTACHMENT",
        uploadedById: session.user.id,
      },
    );

    const parsedAsset = parseAssetCode(url);

    return NextResponse.json({
      attachment: {
        id: randomUUID(),
        title: fileEntry.name,
        kind: "FILE" as const,
        docType: validKind,
        assetCode: parsedAsset?.assetCode ?? null,
        url,
        downloadUrl: url,
        mimeType: fileEntry.type || "application/octet-stream",
        sizeBytes: fileEntry.size,
      },
    });
  } catch (error) {
    if (
      error instanceof CloudinaryPhotoValidationError ||
      error instanceof CloudinaryRawFileValidationError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CloudinaryConfigurationError) {
      console.error("[Chat Upload] Konfigurasi storage belum lengkap:", error);
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    console.error("[Chat Upload] Gagal mengunggah lampiran chat:", error);
    return NextResponse.json(
      { message: "Gagal mengunggah lampiran ke server. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
