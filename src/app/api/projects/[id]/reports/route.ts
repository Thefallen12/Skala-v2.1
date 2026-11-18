import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/documents/render-pdf";
import {
  canAccessProjectReportData,
  canViewProjectFinancialReports,
  generateProjectDailyReport,
  generateProjectFinancialReport,
  generateProjectProgressReport,
  type ProjectReportType,
} from "@/lib/project-reports";

export const runtime = "nodejs";

type ReportFormatParam = "pdf" | "xlsx" | "html";

const VALID_TYPES = new Set<ProjectReportType>(["daily", "progress", "financial"]);
const VALID_FORMATS = new Set<ReportFormatParam>(["pdf", "xlsx", "html"]);

async function handleProjectReport(
  request: NextRequest,
  projectId: string,
  params: {
    type?: string | null;
    format?: string | null;
    date?: string | null;
    from?: string | null;
    to?: string | null;
    download?: boolean;
  },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: "Silakan masuk untuk mengunduh laporan proyek." },
      { status: 401 },
    );
  }

  const rawType = (params.type ?? "progress").toLowerCase();
  if (!VALID_TYPES.has(rawType as ProjectReportType)) {
    return NextResponse.json(
      { message: "Jenis laporan tidak valid. Gunakan daily, progress, atau financial." },
      { status: 400 },
    );
  }
  const reportType = rawType as ProjectReportType;

  const rawFormat = (params.format ?? "pdf").toLowerCase();
  if (!VALID_FORMATS.has(rawFormat as ReportFormatParam)) {
    return NextResponse.json(
      { message: "Format laporan tidak valid. Gunakan pdf, xlsx, atau html." },
      { status: 400 },
    );
  }
  const reportFormat = rawFormat as ReportFormatParam;

  // Strict RBAC for financial reports
  if (
    reportType === "financial" &&
    !canViewProjectFinancialReports(session.user.role)
  ) {
    return NextResponse.json(
      { message: "Role Anda tidak berhak mengakses laporan keuangan proyek." },
      { status: 403 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, isDeleted: false },
    select: { id: true, fieldPicId: true },
  });
  if (!project) {
    return NextResponse.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  if (
    !canAccessProjectReportData(
      session.user.role,
      session.user.id,
      project.fieldPicId,
    )
  ) {
    return NextResponse.json(
      { message: "Anda tidak memiliki akses ke laporan proyek ini." },
      { status: 403 },
    );
  }

  try {
    const portalOrigin = request.nextUrl.origin;
    const built =
      reportType === "daily"
        ? await generateProjectDailyReport({
            projectId: project.id,
            date: params.date,
            portalOrigin,
          })
        : reportType === "financial"
          ? await generateProjectFinancialReport({
              projectId: project.id,
              portalOrigin,
            })
          : await generateProjectProgressReport({
              projectId: project.id,
              from: params.from,
              to: params.to,
              portalOrigin,
            });

    if (reportFormat === "xlsx") {
      return new NextResponse(new Uint8Array(built.workbookBuffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(built.fileNameBase)}.xlsx"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (reportFormat === "html") {
      return new NextResponse(built.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    try {
      const pdf = await renderPdf(built.html);
      const disposition = params.download ? "attachment" : "inline";
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(built.fileNameBase)}.pdf"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (pdfError) {
      const detail =
        pdfError instanceof Error ? pdfError.message : "PDF rendering unavailable";
      console.error("Project report PDF rendering failed:", pdfError);
      return NextResponse.json(
        {
          message:
            "Browser PDF (Chromium/Chrome/Edge) tidak tersedia di server untuk membuat PDF. Silakan unduh versi Excel (.xlsx) atau buka pratinjau cetak (?format=html).",
          detail,
        },
        { status: 503 },
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json(
        { message: "Proyek tidak ditemukan." },
        { status: 404 },
      );
    }
    console.error("Generating project report failed:", error);
    return NextResponse.json(
      { message: "Laporan proyek gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  return handleProjectReport(request, id, {
    type: searchParams.get("type"),
    format: searchParams.get("format"),
    date: searchParams.get("date"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    download: searchParams.get("download") !== "0",
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return handleProjectReport(request, id, {
    type: typeof body.type === "string" ? body.type : null,
    format: typeof body.format === "string" ? body.format : null,
    date: typeof body.date === "string" ? body.date : null,
    from: typeof body.from === "string" ? body.from : null,
    to: typeof body.to === "string" ? body.to : null,
    download: body.download !== false,
  });
}
