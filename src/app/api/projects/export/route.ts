import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { renderPdf } from "@/lib/documents/render-pdf";
import {
  buildLivePortfolioSummary,
  canViewProjectFinancialReports,
  generatePortfolioRecapHtml,
  PROJECT_NON_FINANCIAL_REPORT_ROLES,
} from "@/lib/project-reports";

export const runtime = "nodejs";

const exportHeaders = [
  "Kode Proyek",
  "Nama Proyek",
  "Pagu Anggaran",
  "Realisasi",
  "Jenis Pekerjaan",
  "Kategori (Konsultansi/Fisik)",
  "Progres Aktual (%)",
  "Rencana Kurva-S (%)",
  "Deviasi (%)",
  "Jumlah Laporan Harian",
  "Desa",
  "Kecamatan",
  "Kabupaten",
  "Status",
] as const;

function csvCell(value: string | number) {
  const safeValue =
    typeof value === "string" && /^[\s]*[=+\-@]/.test(value)
      ? `'${value}`
      : String(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { message: "Silakan masuk untuk mengekspor proyek." },
      { status: 401 },
    );
  }
  if (!PROJECT_NON_FINANCIAL_REPORT_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { message: "Anda tidak berhak mengekspor proyek." },
      { status: 403 },
    );
  }

  const requestUrl = request.nextUrl;
  const format = requestUrl.searchParams.get("format");
  if (
    format !== "csv" &&
    format !== "xlsx" &&
    format !== "pdf" &&
    format !== "html"
  ) {
    return NextResponse.json(
      { message: "Format ekspor tidak valid." },
      { status: 400 },
    );
  }

  const search = requestUrl.searchParams.get("search")?.trim().slice(0, 120) ?? "";
  const jenisPekerjaan =
    requestUrl.searchParams.get("jenisPekerjaan")?.trim().slice(0, 180) ?? "";
  const status =
    requestUrl.searchParams.get("status")?.trim().slice(0, 40) ?? "";

  try {
    const canViewFinancials = canViewProjectFinancialReports(session.user.role);
    const summary = await buildLivePortfolioSummary({
      userRole: session.user.role,
      userId: session.user.id,
      search,
      jenisPekerjaan,
      status,
    });

    if (format === "html" || format === "pdf") {
      const html = await generatePortfolioRecapHtml({
        summary,
        includeFinancials: canViewFinancials,
        portalOrigin: requestUrl.origin,
      });

      if (format === "html") {
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      try {
        const pdf = await renderPdf(html);
        return new NextResponse(pdf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="projects-portfolio.pdf"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (pdfError) {
        const detail =
          pdfError instanceof Error ? pdfError.message : "PDF rendering unavailable";
        console.error("Exporting portfolio PDF failed:", pdfError);
        return NextResponse.json(
          {
            message:
              "Browser PDF (Chromium/Chrome/Edge) tidak tersedia untuk membuat PDF portofolio. Gunakan format Excel (.xlsx) atau ?format=html.",
            detail,
          },
          { status: 503 },
        );
      }
    }

    const visibleHeaders = canViewFinancials
      ? exportHeaders
      : exportHeaders.filter(
          (header) => header !== "Pagu Anggaran" && header !== "Realisasi",
        );

    const rows = summary.rows.map((row) => ({
      "Kode Proyek": row.code,
      "Nama Proyek": row.title,
      "Pagu Anggaran": canViewFinancials ? (row.pagu ?? 0) : "",
      Realisasi: canViewFinancials ? (row.realized ?? 0) : "",
      "Jenis Pekerjaan": row.jenisPekerjaan,
      "Kategori (Konsultansi/Fisik)":
        row.workTypeCategory === "KONSULTANSI" ? "Konsultansi" : "Fisik",
      "Progres Aktual (%)": row.actualProgress,
      "Rencana Kurva-S (%)": row.plannedProgress ?? "-",
      "Deviasi (%)": row.deviation ?? "-",
      "Jumlah Laporan Harian": row.dailyReportCount,
      Desa: row.desa,
      Kecamatan: row.kecamatan,
      Kabupaten: row.kabupaten,
      Status: row.status,
    }));

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

    const recapSheet = workbook.addWorksheet("Rekap Jenis Pekerjaan");
    recapSheet.columns = [
      { header: "Jenis Pekerjaan", key: "workType", width: 36 },
      { header: "Kategori", key: "category", width: 16 },
      { header: "Jumlah Proyek", key: "count", width: 16 },
      { header: "Rata-rata Progres (%)", key: "avgProgress", width: 22 },
    ];
    recapSheet.addRows(
      summary.byWorkType.map((entry) => ({
        workType: entry.workType,
        category: entry.category === "KONSULTANSI" ? "Konsultansi" : "Fisik",
        count: entry.count,
        avgProgress: entry.avgProgress,
      })),
    );
    recapSheet.getRow(1).font = { bold: true };

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
    return NextResponse.json(
      { message: "Ekspor proyek gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
