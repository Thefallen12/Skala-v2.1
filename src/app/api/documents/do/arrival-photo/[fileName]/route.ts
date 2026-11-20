import { UserRole } from "@prisma/client";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import { readDeliveryOrderArrivalPhoto } from "@/lib/delivery-order-arrival-photos";

const allowedRoles = new Set<UserRole>([
  UserRole.LOGISTICS,
  UserRole.FINANCE,
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
  if (!fileName || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    return new Response("Bad Request", { status: 400 });
  }
  const photoUrl = `/api/documents/do/arrival-photo/${fileName}`;
  const [record, directPurchaseRecord] = await Promise.all([
    prisma.deliveryOrder.findFirst({
      where: { arrivalPhotoUrl: photoUrl },
      select: {
        id: true,
        driverName: true,
        receivedById: true,
        ticket: { select: { moverAssigneeId: true } },
      },
    }),
    prisma.directStockPurchase.findFirst({
      where: { arrivalPhotoUrl: photoUrl },
      select: { id: true },
    }),
  ]);
  if (!record && !directPurchaseRecord) {
    return new Response("Not found", { status: 404 });
  }
  if (session.user.role === UserRole.MOVER) {
    const moverAssigned =
      Boolean(record) &&
      (record?.ticket?.moverAssigneeId === session.user.id ||
        record?.receivedById === session.user.id ||
        (!record?.ticket?.moverAssigneeId &&
          Boolean(session.user.name) &&
          record?.driverName === session.user.name));
    if (!moverAssigned) {
      return new Response("Forbidden", { status: 403 });
    }
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
