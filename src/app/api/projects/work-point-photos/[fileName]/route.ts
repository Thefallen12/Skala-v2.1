import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import { canAccessProject } from "@/lib/project-access";
import { readProjectProgressPhoto } from "@/lib/project-progress-photos";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { fileName } = await params;
  const photoUrl = `/api/projects/work-point-photos/${fileName}`;
  const photoRecord = await prisma.projectWorkPointProgressPhoto.findUnique({
    where: { url: photoUrl },
    select: {
      progressReport: {
        select: {
          workPoint: {
            select: {
              project: { select: { fieldPicId: true, isDeleted: true } },
            },
          },
        },
      },
    },
  });
  if (
    !photoRecord ||
    photoRecord.progressReport.workPoint.project.isDeleted ||
    !canAccessProject(
      session.user.role,
      session.user.id,
      photoRecord.progressReport.workPoint.project.fieldPicId,
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const photo = await readProjectProgressPhoto(fileName);
  if (!photo) {
    return new Response("Not found", { status: 404 });
  }

  const preview = new URL(request.url).searchParams.get("preview") === "1";
  return new Response(Uint8Array.from(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
