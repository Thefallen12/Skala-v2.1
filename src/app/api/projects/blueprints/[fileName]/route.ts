import { auth } from "@/../auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readBlueprintFile } from "@/lib/blueprint-files";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { fileName } = await params;
  const fileUrl = `/api/projects/blueprints/${fileName}`;
  const blueprint = await prisma.blueprint.findFirst({
    where: { fileUrl },
    select: { id: true, project: { select: { fieldPicId: true } } },
  });
  if (!blueprint) return new Response("Not found", { status: 404 });
  const broadAccessRoles: UserRole[] = [
    UserRole.DRAFTER,
    UserRole.KOORDINATOR,
    UserRole.DIRECTOR,
    UserRole.DEPUTY_DIRECTOR,
    UserRole.ADMINISTRATIONS,
  ];
  if (
    !broadAccessRoles.includes(session.user.role) &&
    blueprint.project.fieldPicId !== session.user.id
  ) {
    return new Response("Not found", { status: 404 });
  }

  const file = await readBlueprintFile(fileName);
  if (!file) return new Response("Not found", { status: 404 });

  const inline = new URL(request.url).searchParams.get("preview") === "1";
  return new Response(Uint8Array.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${inline && file.extension === "pdf" ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
