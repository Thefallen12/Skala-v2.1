import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { auth } from "../../../../auth";
import { prisma } from "@/lib/prisma";

const vendorRoles = new Set<UserRole>([
  UserRole.LOGISTICS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.FINANCE,
  UserRole.ADMINISTRATIONS,
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }
  if (!vendorRoles.has(session.user.role)) {
    return NextResponse.json({ message: "Akses vendor tidak diizinkan." }, { status: 403 });
  }

  const vendors = await prisma.vendor.findMany({
    where: { isApproved: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      bankName: true,
      bankAccount: true,
      bankHolder: true,
      bankAccounts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          label: true,
          bankName: true,
          bankAccount: true,
          bankHolder: true,
          isPrimary: true,
        },
      },
    },
  });
  return NextResponse.json(vendors);
}
