import { UserRole } from "@prisma/client";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import { readDeliveryOrderArrivalPhoto } from "@/lib/delivery-order-arrival-photos";

const allowedRoles = new Set<UserRole>([
  UserRole.LOGISTICS,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.MOVER,
  UserRole.FIELD_TEAM,
  UserRole.KOORDINATOR,
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!allowedRoles.has(session.user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { fileName } = await params;
  const photoUrl = `/api/documents/do/arrival-photo/${fileName}`;
  const record = await prisma.deliveryOrder.findFirst({
    where: { arrivalPhotoUrl: photoUrl },
    select: { id: true },
  });
  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  const photo = await readDeliveryOrderArrivalPhoto(fileName);
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
