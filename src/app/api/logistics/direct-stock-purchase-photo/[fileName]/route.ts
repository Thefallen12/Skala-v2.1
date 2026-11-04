import { UserRole } from "@prisma/client";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import { readDirectStockPurchasePhoto } from "@/lib/direct-stock-purchase-photos";

const allowedRoles = new Set<UserRole>([
  UserRole.LOGISTICS,
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
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
  const photoUrl = `/api/logistics/direct-stock-purchase-photo/${fileName}`;
  const purchase = await prisma.directStockPurchase.findFirst({
    where: { arrivalPhotoUrl: photoUrl },
    select: { id: true },
  });
  if (!purchase) {
    return new Response("Not found", { status: 404 });
  }

  const photo = await readDirectStockPurchasePhoto(fileName);
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
