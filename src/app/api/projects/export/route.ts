import ExcelJS from "exceljs";
import { UserRole } from "@prisma/client";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";

const exportHeaders = [
  "Kode Proyek",
  "Nama Proyek",
  "Pagu Anggaran",
  "Realisasi",
  "Jenis Pekerjaan",
  "Desa",
  "Kecamatan",
  "Kabupaten",
  "Status",
] as const;

const projectRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
];

function splitAddress(address: string) {
  const kecamatan =
    address.match(
      /\bKec(?:amatan)?\.?\s+(.+?)(?=,\s*Kab(?:upaten)?\.?\s+|$)/i,
    )?.[1] ?? "";
  const kabupaten =
    address.match(/\bKab(?:upaten)?\.?\s+(.+)$/i)?.[1] ?? "";
  const desa = address
    .replace(/\s*,?\s*Kec(?:amatan)?\.?\s+.+?(?=,\s*Kab(?:upaten)?\.?\s+|$)/i, "")
    .replace(/\s*,?\s*Kab(?:upaten)?\.?\s+.+$/i, "")
    .trim();
  return { desa, kecamatan, kabupaten };
}

function csvCell(value: string | number) {
  const safeValue =
    typeof value === "string" && /^[\s]*[=+\-@]/.test(value)
      ? `'${value}`
      : String(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ message: "Silakan masuk untuk mengekspor proyek." }, { status: 401 });
  }
  if (!projectRoles.includes(session.user.role)) {
    return Response.json({ message: "Anda tidak berhak mengekspor proyek." }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const format = requestUrl.searchParams.get("format");
  if (format !== "csv" && format !== "xlsx") {
    return Response.json({ message: "Format ekspor tidak valid." }, { status: 400 });
  }
  const search = requestUrl.searchParams.get("search")?.trim().slice(0, 120) ?? "";
  const where = {
    isDeleted: false,
    ...(session.user.role === UserRole.FIELD_TEAM ||
    session.user.role === UserRole.KOORDINATOR
      ? { fieldPicId: session.user.id }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { code: { contains: search, mode: "insensitive" as const } },
            { address: { contains: search, mode: "insensitive" as const } },
            { location: { contains: search, mode: "insensitive" as const } },
            {
              fieldPic: {
                is: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  try {
    const isDirector = session.user.role === UserRole.DIRECTOR;
    const visibleHeaders = isDirector
      ? exportHeaders
      : exportHeaders.filter(
          (header) =>
            header !== "Pagu Anggaran" && header !== "Realisasi",
        );
    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        title: true,
        pagu: true,
        jenisPekerjaan: true,
        kelompokTani: true,
        address: true,
        status: true,
      },
    });
    const projectIds = projects.map((project) => project.id);
    const realizedMap = isDirector
      ? await getPaidProjectTicketRealization(projectIds)
      : null;
    const rows = projects.map((project) => {
      const address = splitAddress(project.address);
      return {
        "Kode Proyek": project.code,
        "Nama Proyek": project.title,
        "Pagu Anggaran": isDirector
          ? decimalNumberFromScaledInteger(project.pagu)
          : "",
        Realisasi: realizedMap?.get(project.id)?.total.toNumber() ?? "",
        "Jenis Pekerjaan": project.jenisPekerjaan ?? "",
        Desa: address.desa || project.kelompokTani,
        Kecamatan: address.kecamatan,
        Kabupaten: address.kabupaten,
        Status: project.status,
      };
    });

    if (format === "csv") {
      const csv = [
        visibleHeaders.map(csvCell).join(","),
        ...rows.map((row) =>
          visibleHeaders.map((header) => csvCell(row[header])).join(","),
        ),
      ].join("\r\n");
      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="projects-export.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Proyek");
    worksheet.columns = visibleHeaders.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length + 4, 18),
    }));
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: visibleHeaders.length },
    };
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="projects-export.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Exporting projects failed:", error);
    return Response.json(
      { message: "Ekspor proyek gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
