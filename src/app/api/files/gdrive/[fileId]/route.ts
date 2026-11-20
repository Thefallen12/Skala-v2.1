import { auth } from "@/../auth";
import { connectToMongoDB } from "@/lib/mongoose";
import { canAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canAccessFinanceDashboard, canOperateLogisticsActions } from "@/lib/user-access";
import { AssetRecordModel } from "@/models/asset-record";
import { readGoogleDriveFile } from "@/lib/google-drive-storage";
import { UserRole } from "@prisma/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { fileId } = await params;
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) {
    return new Response("Not found", { status: 404 });
  }

  await connectToMongoDB();
  const asset = await AssetRecordModel.findOne({
    driveFileId: fileId,
    deletedAt: null,
  })
    .select("projectId kind assetCode uploadedById")
    .lean<{
      projectId?: string | null;
      kind?: string | null;
      assetCode?: string | null;
      uploadedById?: string | null;
    } | null>();

  if (asset) {
    const role = session.user.role as UserRole;
    const isUploader = asset.uploadedById && asset.uploadedById === session.user.id;
    let allowed = Boolean(isUploader);

    if (!allowed && asset.kind && ["BKT", "BON", "KWT", "INV"].includes(asset.kind)) {
      allowed = canAccessFinanceDashboard(role) || canOperateLogisticsActions(role);
    }
    if (!allowed && asset.kind && ["SJN", "BLJ", "BBM"].includes(asset.kind)) {
      allowed =
        canOperateLogisticsActions(role) ||
        canAccessFinanceDashboard(role) ||
        role === UserRole.MOVER;
    }
    if (!allowed && asset.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: asset.projectId },
        select: { fieldPicId: true, isDeleted: true },
      });
      if (project && !project.isDeleted) {
        allowed = canAccessProject(role, session.user.id, project.fieldPicId);
      }
    }
    if (!allowed && (asset.kind === "USR" || asset.kind === "TPL")) {
      allowed = true;
    }

    if (!allowed) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const file = await readGoogleDriveFile(fileId);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  const preview = new URL(request.url).searchParams.get("preview") === "1";
  const safeName = (asset?.assetCode
    ? `${asset.assetCode}.${file.fileName.split(".").pop() || "bin"}`
    : file.fileName
  ).replace(/["\r\n]/g, "_");

  return new Response(Uint8Array.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
