import { NextRequest, NextResponse } from "next/server";
import { SPKStatus, UserRole } from "@prisma/client";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import {
  createBrandedQrDataUrl,
  getDocumentHeaderLogoDataUrl,
} from "@/lib/documents/qr-code";
import {
  getRequestOrigin,
  resolvePublicAppUrl,
} from "@/lib/documents/public-app-url";
import { projectSiteName } from "@/lib/documents/project-site-name";
import { renderPdf } from "@/lib/documents/render-pdf";
import { documentVerificationPath } from "@/lib/documents/verification-url";
import { decimalStringFromScaledInteger } from "@/lib/scaled-decimal";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function currency(value: string): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const allowedRoles = new Set<UserRole>([
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
  UserRole.FINANCE,
  UserRole.LOGISTICS,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
]);

export async function GET(request: NextRequest) {
  const publicCode = (request.nextUrl.searchParams.get("publicCode") ?? "").trim();
  if (!publicCode || publicCode.length > 128) {
    return NextResponse.json({ message: "Kode dokumen tidak valid." }, { status: 400 });
  }

  const session = await auth();
  if (session?.user?.id && !allowedRoles.has(session.user.role)) {
    return NextResponse.json({ message: "Anda tidak memiliki akses ke dokumen ini." }, { status: 403 });
  }
  const whereClauseContract = session?.user?.id
    ? {
        OR: [
          { publicCode },
          { contractNumber: publicCode },
          { id: publicCode },
        ],
      }
    : { publicCode };
  const whereClauseBast = session?.user?.id
    ? { OR: [{ publicCode }, { bastNumber: publicCode }, { id: publicCode }] }
    : { publicCode };

  const [contract, bast] = await Promise.all([
    prisma.subkonContract.findFirst({
      where: whereClauseContract,
      select: {
        publicCode: true,
        contractNumber: true,
        subkonName: true,
        workScope: true,
        contractValue: true,
        status: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        approvedAt: true,
        project: { select: { kelompokTani: true, location: true } },
      },
    }),
    prisma.bASTDocument.findFirst({
      where: whereClauseBast,
      select: {
        publicCode: true,
        bastNumber: true,
        type: true,
        date: true,
        maintenanceEndsAt: true,
        notes: true,
        isApproved: true,
        approvedBy: { select: { name: true } },
        project: { select: { kelompokTani: true, location: true } },
      },
    }),
  ]);

  if (!contract && !bast) {
    return NextResponse.json(
      { message: session?.user?.id ? "Dokumen tidak tersedia." : "Silakan masuk untuk mengakses dokumen ini." },
      { status: session?.user?.id ? 404 : 401 },
    );
  }
  if (
    !session?.user?.id &&
    ((contract && contract.status !== SPKStatus.ACTIVE) ||
      (bast && !bast.isApproved))
  ) {
    return NextResponse.json(
      { message: "Dokumen belum disetujui. Silakan masuk untuk melihat pratinjau." },
      { status: 401 },
    );
  }

  try {
    const title = contract
      ? contract.contractNumber
      : bast!.bastNumber;
    const recordPublicCode = contract ? contract.publicCode : bast!.publicCode;
    const isApproved = contract ? contract.status === SPKStatus.ACTIVE : bast!.isApproved;
    const projectName = contract
      ? projectSiteName(contract.project.kelompokTani, contract.project.location)
      : projectSiteName(bast!.project.kelompokTani, bast!.project.location);
    const verificationBaseUrl =
      resolvePublicAppUrl(getRequestOrigin(request.headers)) ??
      new URL(request.nextUrl.origin);
    const qrUrl = new URL(
      documentVerificationPath(contract ? "spk" : "bast", recordPublicCode),
      verificationBaseUrl,
    ).toString();
    const [qrDataUrl, headerLogoDataUrl] = await Promise.all([
      createBrandedQrDataUrl(qrUrl, 300),
      getDocumentHeaderLogoDataUrl(),
    ]);
    const documentTitle = contract
      ? "SURAT PERINTAH KERJA SUBKONTRAKTOR"
      : `BERITA ACARA SERAH TERIMA ${bast!.type}`;
    const documentDate = contract
      ? contract.createdAt.toLocaleDateString("id-ID")
      : bast!.date.toLocaleDateString("id-ID");
    const body = contract
      ? `
        <section class="details">
          <p><strong>Nomor SPK:</strong> ${escapeHtml(contract.contractNumber)}</p>
          <p><strong>Proyek / Lokasi:</strong> ${escapeHtml(projectName)}</p>
          <p><strong>Subkontraktor:</strong> ${escapeHtml(contract.subkonName)}</p>
          <p><strong>Tanggal:</strong> ${escapeHtml(documentDate)}</p>
          <p><strong>Nilai kontrak:</strong> ${escapeHtml(currency(decimalStringFromScaledInteger(contract.contractValue)))}</p>
          <p><strong>Status:</strong> ${escapeHtml(contract.status.replaceAll("_", " "))}</p>
        </section>
        <h3>Lingkup Pekerjaan</h3>
        <p class="scope">${escapeHtml(contract.workScope).replaceAll("\n", "<br>")}</p>`
      : `
        <section class="details">
          <p><strong>Nomor BAST:</strong> ${escapeHtml(bast!.bastNumber)}</p>
          <p><strong>Proyek / Lokasi:</strong> ${escapeHtml(projectName)}</p>
          <p><strong>Jenis:</strong> ${escapeHtml(bast!.type)}</p>
          <p><strong>Tanggal serah terima:</strong> ${escapeHtml(documentDate)}</p>
          <p><strong>Akhir masa pemeliharaan:</strong> ${escapeHtml(bast!.maintenanceEndsAt?.toLocaleDateString("id-ID") ?? "-")}</p>
          <p><strong>Status:</strong> ${isApproved ? "Disetujui" : "Menunggu Persetujuan"}</p>
        </section>
        <h3>Catatan Serah Terima</h3>
        <p class="scope">${escapeHtml(bast!.notes ?? "-").replaceAll("\n", "<br>")}</p>`;
    const html = `<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body { color: #1e293b; font: 10pt Arial, sans-serif; }
            header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 16px; border-bottom: 3px solid #102a4d; }
            .logo { display: block; width: 48%; max-width: 300px; height: auto; object-fit: contain; object-position: left top; }
            .heading { width: 48%; text-align: right; color: #102a4d; }
            .heading h1 { font-size: 16pt; margin: 0; }
            .heading p { color: #e67e22; font-weight: bold; margin: 8px 0 0; }
            .number { border: 2px solid #102a4d; border-radius: 18px; display: inline-block; margin-top: 12px; padding: 6px 12px; }
            .details { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin: 24px 0; padding: 14px; }
            .details p { margin: 4px 0; }
            h3 { color: #102a4d; margin-bottom: 8px; }
            .scope { line-height: 1.6; min-height: 90px; white-space: normal; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 44px; text-align: center; }
            .signature { min-height: 150px; display: flex; flex-direction: column; justify-content: space-between; }
            .qr { height: 84px; width: 84px; object-fit: contain; margin: 4px auto; }
            .footer { color: #e67e22; font-weight: 900; letter-spacing: 2px; margin-top: 34px; text-align: center; }
          </style>
        </head>
        <body>
          <header>
            <img class="logo" src="${headerLogoDataUrl}" alt="Skala Prioritas Engineering">
            <div class="heading">
              <h1>${documentTitle}</h1>
              <p>SKALA PRIORITAS ENGINEERING · TAKENGON</p>
              <span class="number">${escapeHtml(title)}</span>
            </div>
          </header>
          ${body}
          <section class="signatures">
            <div class="signature">
              <strong>PIHAK PERTAMA<br>SKALA PRIORITAS ENGINEERING</strong>
              <div></div>
              <div><strong>${escapeHtml(contract?.approvedBy?.name ?? bast?.approvedBy?.name ?? "Direktur")}</strong><br>Direktur / Wakil Direktur</div>
            </div>
            <div class="signature">
              <strong>PELAKSANA / PENERIMA</strong>
              <div></div>
              <div><strong>${escapeHtml(contract?.subkonName ?? "........................")}</strong><br>${contract ? "Subkontraktor" : "Perwakilan Pelaksana"}</div>
            </div>
            <div class="signature">
              <strong>VERIFIKASI DOKUMEN</strong>
              <img class="qr" src="${qrDataUrl}" alt="QR verifikasi dokumen">
              <div><strong>${escapeHtml(contract?.approvedAt?.toLocaleDateString("id-ID") ?? bast?.approvedBy?.name ?? (isApproved ? "Disetujui" : "Menunggu Persetujuan"))}</strong><br>${isApproved ? "QR Tanda Tangan Direktur" : "QR Verifikasi Dokumen"}</div>
            </div>
          </section>
          <p class="footer">ADAPT, IMPROVISE AND FINISH</p>
        </body>
      </html>`;

    const htmlPreview = request.nextUrl.searchParams.get("format") === "html";
    const wantDownload = request.nextUrl.searchParams.get("download") === "1";
    const printableHtml = wantDownload
      ? html.replace(
          /<\/body>/i,
          `<script>window.addEventListener("load",function(){try{window.print();}catch(_e){}});</script></body>`,
        )
      : html;

    if (htmlPreview) {
      return new NextResponse(printableHtml, {
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
          "Content-Disposition": `${wantDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(title)}.pdf"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (pdfError) {
      console.error("Construction document PDF rendering failed, falling back to HTML:", pdfError);
      return new NextResponse(printableHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch (error) {
    console.error("Construction document preview failed:", error);
    return NextResponse.json(
      { message: "Dokumen gagal dibuat. Silakan coba kembali." },
      { status: 500 },
    );
  }
}
