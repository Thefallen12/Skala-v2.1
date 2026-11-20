import ExcelJS from "exceljs";
import { ProjectStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getJakartaDateKey, getJakartaDayRange, isValidDateKey } from "@/lib/habit-date";
import {
  buildProjectSCurveSeries,
  calculatePlannedSCurveProgress,
  calculateWeightedProjectProgress,
  clampProjectProgress,
  toJakartaDateKey,
  toJakartaDayStartDate,
} from "@/lib/project-progress";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import {
  createBrandedQrDataUrl,
  getDocumentHeaderLogoDataUrl,
} from "@/lib/documents/qr-code";
import { readProjectProgressPhoto } from "@/lib/project-progress-photos";
import { doesAssetMatchProject, parseAssetCode } from "@/lib/asset-codes";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";
import {
  formatWorkTypeBadge,
  formatWorkTypeLabel,
  isConsultancyWorkType,
  resolveProjectWorkType,
} from "@/lib/project-work-types";

export type ProjectReportType = "daily" | "progress" | "financial";
export type ProjectReportFormat = "pdf" | "xlsx";

export const PROJECT_FINANCIAL_REPORT_ROLES: UserRole[] = [
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.ADMINISTRATIONS,
  UserRole.FINANCE,
  UserRole.LOGISTICS,
];

export const PROJECT_NON_FINANCIAL_REPORT_ROLES: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
  UserRole.FINANCE,
  UserRole.LOGISTICS,
];

export function canViewProjectFinancialReports(role: UserRole): boolean {
  return PROJECT_FINANCIAL_REPORT_ROLES.includes(role);
}

export function canAccessProjectReportData(
  role: UserRole,
  userId: string,
  fieldPicId: string | null,
): boolean {
  if (!PROJECT_NON_FINANCIAL_REPORT_ROLES.includes(role)) return false;
  if (role === UserRole.FIELD_TEAM || role === UserRole.KOORDINATOR) {
    return fieldPicId === userId;
  }
  return true;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatNumberId(value: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: maxFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatWibDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function formatWibLongDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function formatProjectStatusLabel(status: string): string {
  switch (status) {
    case "RUNNING":
    case "ON_PROGRESS":
    case "ACTIVE":
      return "Berjalan";
    case "PENDING_SETUP":
    case "PENDING":
    case "PLANNED":
      return "Persiapan";
    case "TERHAMBAT":
    case "ON_HOLD":
      return "Terhambat / Ditunda";
    case "DONE":
    case "COMPLETED":
      return "Selesai";
    default:
      return status.replaceAll("_", " ");
  }
}

export function formatDailyEquipmentList(equipment: unknown): string[] {
  if (!equipment) return [];
  if (Array.isArray(equipment)) {
    return equipment
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "name" in item) {
          const obj = item as { name?: unknown; qty?: unknown };
          const name = typeof obj.name === "string" ? obj.name.trim() : "";
          const qty =
            obj.qty !== undefined && obj.qty !== null
              ? String(obj.qty).trim()
              : "";
          return name ? (qty ? `${name} (${qty})` : name) : "";
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof equipment === "string") {
    return equipment
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function resolveBrandAssets(portalUrl: string): Promise<{
  logoDataUrl: string;
  qrDataUrl: string;
}> {
  const [logoResult, qrResult] = await Promise.allSettled([
    getDocumentHeaderLogoDataUrl(),
    createBrandedQrDataUrl(portalUrl, 220),
  ]);
  return {
    logoDataUrl: logoResult.status === "fulfilled" ? logoResult.value : "",
    qrDataUrl: qrResult.status === "fulfilled" ? qrResult.value : "",
  };
}

async function resolvePhotoForPdf(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  const progressMatch = trimmed.match(
    /^\/api\/projects\/progress-photos\/([^/?#]+)/,
  );
  const workPointMatch = trimmed.match(
    /^\/api\/projects\/work-point-photos\/([^/?#]+)/,
  );
  const fileName = progressMatch?.[1] ?? workPointMatch?.[1];
  if (fileName) {
    try {
      const localPhoto = await readProjectProgressPhoto(
        decodeURIComponent(fileName),
      );
      if (localPhoto) {
        return `data:${localPhoto.contentType};base64,${Buffer.from(localPhoto.bytes).toString("base64")}`;
      }
    } catch {
      return "";
    }
  }
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return "";
}

function buildReportDocumentShell(input: {
  title: string;
  subtitle: string;
  codePill: string;
  logoDataUrl: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      font: 9.5pt "Segoe UI", Arial, sans-serif;
      line-height: 1.45;
      background: #ffffff;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 2.5px solid #102a4d;
    }
    .header-logo {
      max-width: 240px;
      max-height: 56px;
      object-fit: contain;
    }
    .header-brand-fallback {
      font-size: 13pt;
      font-weight: 800;
      color: #102a4d;
    }
    .header-meta {
      text-align: right;
    }
    .header-meta h1 {
      margin: 0;
      font-size: 13pt;
      font-weight: 800;
      color: #102a4d;
      letter-spacing: 0.3px;
    }
    .header-meta p {
      margin: 3px 0 0;
      font-size: 8.5pt;
      font-weight: 700;
      color: #d97706;
    }
    .pill {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 10px;
      border: 1.5px solid #102a4d;
      border-radius: 999px;
      font-size: 8.5pt;
      font-weight: 700;
      color: #102a4d;
      font-family: Consolas, monospace;
    }
    .section-title {
      margin: 14px 0 6px;
      font-size: 10pt;
      font-weight: 800;
      color: #102a4d;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-left: 3.5px solid #0d9488;
      padding-left: 8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 18px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 10px;
    }
    .info-row {
      display: flex;
      gap: 6px;
      font-size: 8.8pt;
    }
    .info-label {
      width: 120px;
      flex-shrink: 0;
      color: #475569;
      font-weight: 600;
    }
    .info-value {
      color: #0f172a;
      font-weight: 600;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 10px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      background: #ffffff;
    }
    .kpi-label {
      font-size: 7.8pt;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
    }
    .kpi-value {
      margin-top: 2px;
      font-size: 11.5pt;
      font-weight: 800;
      color: #0f172a;
    }
    .kpi-sub {
      margin-top: 2px;
      font-size: 7.8pt;
      color: #475569;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 8.4pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .mono { font-family: Consolas, monospace; }
    .box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 9px 11px;
      background: #ffffff;
      margin-top: 6px;
      font-size: 8.8pt;
    }
    .box-warn {
      border-color: #fbbf24;
      background: #fffbeb;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 6px;
    }
    .photo-item {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      background: #f8fafc;
      page-break-inside: avoid;
    }
    .photo-item img {
      width: 100%;
      height: 120px;
      object-fit: cover;
      display: block;
    }
    .photo-cap {
      padding: 4px 6px;
      font-size: 7.5pt;
      color: #475569;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 20px;
      text-align: center;
      font-size: 8.5pt;
      page-break-inside: avoid;
    }
    .sig-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px;
      min-height: 118px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sig-qr {
      width: 68px;
      height: 68px;
      object-fit: contain;
      margin: 4px auto;
    }
    .footer-note {
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 7.6pt;
      color: #64748b;
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      ${
        input.logoDataUrl
          ? `<img class="header-logo" src="${input.logoDataUrl}" alt="PT Skala Prioritas Engineering" />`
          : `<div class="header-brand-fallback">PT SKALA PRIORITAS ENGINEERING</div>`
      }
    </div>
    <div class="header-meta">
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.subtitle)}</p>
      <span class="pill">${escapeHtml(input.codePill)}</span>
    </div>
  </header>
  ${input.bodyHtml}
  <div class="footer-note">
    <span>PT Skala Prioritas Engineering · Sistem Manajemen Proyek Terpadu</span>
    <span>${escapeHtml(input.footerNote ?? `Dicetak ${formatWibDate(new Date())}`)}</span>
  </div>
</body>
</html>`;
}

/**
 * Generates an inline dynamic SVG S-Curve directly from `buildProjectSCurveSeries`.
 */
export function buildSCurveSvgMarkup(input: {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  currentProgress: number;
  dailyReports?: Array<{ reportDate: string | Date; progress: number }>;
  width?: number;
  height?: number;
}): string {
  const width = input.width ?? 760;
  const height = input.height ?? 230;
  const padLeft = 48;
  const padRight = 24;
  const padTop = 18;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const series = buildProjectSCurveSeries({
    startDate: input.startDate,
    endDate: input.endDate,
    currentProgress: input.currentProgress,
    dailyReports: input.dailyReports,
  });

  const allX = [
    ...series.planned.map((p) => p.x),
    ...series.actual.map((p) => p.x),
  ];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX, minX + 24 * 60 * 60 * 1000);

  const mapX = (x: number) =>
    padLeft + ((x - minX) / Math.max(1, maxX - minX)) * plotW;
  const mapY = (y: number) =>
    padTop + ((100 - clampProjectProgress(y)) / 100) * plotH;

  const plannedPath = series.planned
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
    .join(" ");

  const actualPath = series.actual
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
    .join(" ");

  const firstActual = series.actual[0];
  const lastActual = series.actual[series.actual.length - 1];
  const actualArea =
    firstActual && lastActual
      ? `${actualPath} L ${mapX(lastActual.x).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${mapX(firstActual.x).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : "";

  const yTicks = [0, 25, 50, 75, 100];
  const xTickFractions = [0, 0.25, 0.5, 0.75, 1];
  const nowMs = Date.now();
  const nowInRange = nowMs >= minX && nowMs <= maxX;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="display:block;overflow:visible;">
  <defs>
    <linearGradient id="skalaActualFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d9488" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#0d9488" stop-opacity="0.02" />
    </linearGradient>
  </defs>
  ${yTicks
    .map((pct) => {
      const y = mapY(pct).toFixed(1);
      return `<g>
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
        <text x="${padLeft - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9" fill="#64748b" font-family="Consolas, monospace">${pct}%</text>
      </g>`;
    })
    .join("")}
  ${xTickFractions
    .map((frac) => {
      const tickMs = Math.round(minX + (maxX - minX) * frac);
      const x = mapX(tickMs).toFixed(1);
      const anchor = frac === 0 ? "start" : frac === 1 ? "end" : "middle";
      return `<g>
        <line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + plotH}" stroke="#f1f5f9" stroke-width="1" />
        <text x="${x}" y="${height - 10}" text-anchor="${anchor}" font-size="8.5" fill="#64748b">${escapeHtml(formatWibDate(new Date(tickMs)))}</text>
      </g>`;
    })
    .join("")}
  ${
    nowInRange
      ? `<g>
          <line x1="${mapX(nowMs).toFixed(1)}" y1="${padTop}" x2="${mapX(nowMs).toFixed(1)}" y2="${padTop + plotH}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,3" />
          <text x="${mapX(nowMs).toFixed(1)}" y="${padTop - 4}" text-anchor="middle" font-size="8" font-weight="700" fill="#d97706">Hari Ini</text>
        </g>`
      : ""
  }
  ${actualArea ? `<path d="${actualArea}" fill="url(#skalaActualFill)" />` : ""}
  ${plannedPath ? `<path d="${plannedPath}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="5,4" />` : ""}
  ${actualPath ? `<path d="${actualPath}" fill="none" stroke="#0f766e" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />` : ""}
  ${series.actual
    .map(
      (pt) =>
        `<circle cx="${mapX(pt.x).toFixed(1)}" cy="${mapY(pt.y).toFixed(1)}" r="3" fill="#0f766e" stroke="#ffffff" stroke-width="1.2" />`,
    )
    .join("")}
</svg>`;
}

// ============================================================================
// 1. DAILY REPORT (PDF HTML + XLSX)
// ============================================================================

export async function generateProjectDailyReport(input: {
  projectId: string;
  date?: string | null;
  portalOrigin: string;
}): Promise<{ html: string; workbookBuffer: Uint8Array; fileNameBase: string }> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, isDeleted: false },
    select: {
      id: true,
      code: true,
      title: true,
      name: true,
      jenisPekerjaan: true,
      kelompokTani: true,
      address: true,
      location: true,
      clientName: true,
      status: true,
      progress: true,
      fieldPic: { select: { name: true, phone: true } },
      workPoints: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          location: true,
          proposedVolume: true,
          proposedUnit: true,
          completedVolume: true,
          progress: true,
        },
      },
      dailyReports: {
        orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
        take: 120,
        select: {
          id: true,
          reportDate: true,
          weather: true,
          workersCount: true,
          progress: true,
          dailyVolume: true,
          equipment: true,
          workSummary: true,
          notes: true,
          k3SafetyLog: true,
          workPoint: { select: { id: true, title: true } },
          progressPhotos: {
            orderBy: { createdAt: "asc" },
            select: {
              url: true,
              fileUrl: true,
              assetCode: true,
              projectId: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const requestedDateKey =
    input.date && isValidDateKey(input.date) ? input.date : null;
  const targetReport = requestedDateKey
    ? project.dailyReports.find(
        (r) => toJakartaDateKey(r.reportDate) === requestedDateKey,
      ) ?? null
    : project.dailyReports[0] ?? null;

  const effectiveDateKey =
    requestedDateKey ??
    (targetReport ? toJakartaDateKey(targetReport.reportDate) : null) ??
    getJakartaDateKey();

  const { start: dayStart, endExclusive: dayEnd } =
    getJakartaDayRange(effectiveDateKey);

  const workPointIds = project.workPoints.map((wp) => wp.id);
  const [pointProgressRows, equipmentLogs] = await Promise.all([
    workPointIds.length > 0
      ? prisma.projectWorkPointProgress.findMany({
          where: {
            workPointId: { in: workPointIds },
            reportDate: { gte: dayStart, lt: dayEnd },
          },
          orderBy: { createdAt: "desc" },
          select: {
            workPointId: true,
            progress: true,
            workSummary: true,
          },
        })
      : Promise.resolve([]),
    prisma.equipmentLog.findMany({
      where: {
        projectId: project.id,
        date: { gte: dayStart, lt: dayEnd },
      },
      select: {
        equipmentName: true,
        operatorName: true,
        effectiveHours: true,
      },
    }),
  ]);

  const pointDailyMap = new Map<
    string,
    { progress: number; workSummary: string | null }
  >();
  for (const row of pointProgressRows) {
    if (!pointDailyMap.has(row.workPointId)) {
      pointDailyMap.set(row.workPointId, {
        progress: row.progress,
        workSummary: row.workSummary,
      });
    }
  }

  const equipmentItems = [
    ...formatDailyEquipmentList(targetReport?.equipment),
    ...equipmentLogs.map((log) => {
      const hrs = decimalNumberFromScaledInteger(log.effectiveHours);
      return `${log.equipmentName}${log.operatorName ? ` (${log.operatorName})` : ""}${hrs > 0 ? ` · ${hrs} jam` : ""}`;
    }),
  ];
  const uniqueEquipment = [...new Set(equipmentItems)];

  const workTypeBadge = formatWorkTypeBadge(project.jenisPekerjaan);
  const portalUrl = new URL(
    `/portal/projects/${encodeURIComponent(project.code)}`,
    input.portalOrigin,
  ).toString();
  const { logoDataUrl, qrDataUrl } = await resolveBrandAssets(portalUrl);

  const projectAssetTarget = {
    projectId: project.id,
    projectName: project.title || project.name || project.kelompokTani,
    projectCode: project.code,
  };
  const photoSources = (targetReport?.progressPhotos ?? [])
    .filter((photo) =>
      doesAssetMatchProject(
        {
          projectId: photo.projectId,
          assetCode: photo.assetCode,
          url: photo.fileUrl ?? photo.url,
        },
        projectAssetTarget,
      ),
    )
    .slice(0, 6);
  const resolvedPhotos = await Promise.all(
    photoSources.map(async (photo, idx) => {
      const resolvedUrl = photo.fileUrl ?? photo.url;
      const assetCode =
        photo.assetCode ?? parseAssetCode(resolvedUrl)?.assetCode ?? null;
      return {
        src: await resolvePhotoForPdf(resolvedUrl),
        caption: `${assetCode ? `[${assetCode}] ` : ""}Dokumentasi #${idx + 1} (${formatWibDate(photo.createdAt)})`,
      };
    }),
  );
  const visiblePhotos = resolvedPhotos.filter((p) => Boolean(p.src));

  const cumulativeProgress = clampProjectProgress(
    targetReport?.progress ?? project.progress,
  );

  const workPointRowsHtml =
    project.workPoints.length > 0
      ? project.workPoints
          .map((wp, idx) => {
            const daily = pointDailyMap.get(wp.id);
            const targetVol = wp.proposedVolume
              ? decimalNumberFromScaledInteger(wp.proposedVolume)
              : 0;
            const completedVol = wp.completedVolume ?? 0;
            const unit = wp.proposedUnit || "paket";
            return `<tr>
              <td class="text-center mono">${idx + 1}</td>
              <td><strong>${escapeHtml(wp.title)}</strong>${wp.location ? `<br><span style="color:#64748b;font-size:7.8pt;">${escapeHtml(wp.location)}</span>` : ""}</td>
              <td class="text-right mono">${targetVol > 0 ? `${formatNumberId(targetVol, 3)} ${escapeHtml(unit)}` : "—"}</td>
              <td>${daily?.workSummary ? escapeHtml(daily.workSummary) : `<span style="color:#94a3b8;">Tidak ada update harian</span>`}</td>
              <td class="text-right mono">${targetVol > 0 ? `${formatNumberId(completedVol, 3)} ${escapeHtml(unit)}` : "—"}</td>
              <td class="text-right mono"><strong>${formatNumberId(wp.progress, 1)}%</strong></td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="text-center" style="color:#64748b;padding:12px;">Belum ada rincian titik/deliverable WBS; progres dicatat secara kumulatif (${cumulativeProgress}%).</td></tr>`;

  const bodyHtml = `
    <div class="info-grid">
      <div>
        <div class="info-row"><span class="info-label">Nama Proyek</span><span class="info-value">: ${escapeHtml(project.title)}</span></div>
        <div class="info-row"><span class="info-label">Jenis Pekerjaan</span><span class="info-value">: ${escapeHtml(formatWorkTypeLabel(project.jenisPekerjaan))} (${escapeHtml(workTypeBadge.groupShortLabel)})</span></div>
        <div class="info-row"><span class="info-label">Klien / Owner</span><span class="info-value">: ${escapeHtml(project.clientName || project.kelompokTani)}</span></div>
        <div class="info-row"><span class="info-label">Lokasi</span><span class="info-value">: ${escapeHtml(project.location || project.address)}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="info-label">Tanggal Laporan</span><span class="info-value">: ${escapeHtml(formatWibLongDate(dayStart))}</span></div>
        <div class="info-row"><span class="info-label">PIC Lapangan</span><span class="info-value">: ${escapeHtml(project.fieldPic?.name || "Belum ditetapkan")}</span></div>
        <div class="info-row"><span class="info-label">Status Proyek</span><span class="info-value">: ${escapeHtml(formatProjectStatusLabel(project.status))}</span></div>
        <div class="info-row"><span class="info-label">Progres Kumulatif</span><span class="info-value">: ${formatNumberId(cumulativeProgress, 1)}%</span></div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Kondisi Cuaca</div>
        <div class="kpi-value" style="font-size:10.5pt;">${escapeHtml(targetReport?.weather || "Belum dicatat")}</div>
        <div class="kpi-sub">Tanggal ${escapeHtml(effectiveDateKey)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tenaga Kerja / Tim</div>
        <div class="kpi-value">${targetReport ? targetReport.workersCount : 0} Orang</div>
        <div class="kpi-sub">${workTypeBadge.group === "CONSULTANCY" ? "Personel konsultansi/survey" : "Pekerja hadir di lokasi"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Peralatan Aktif</div>
        <div class="kpi-value">${uniqueEquipment.length} Item</div>
        <div class="kpi-sub">${escapeHtml(uniqueEquipment.slice(0, 2).join(", ") || "Tidak ada catatan alat")}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Status K3 &amp; Safety</div>
        <div class="kpi-value" style="font-size:9.5pt;">${targetReport?.k3SafetyLog ? "Tercatat" : "Standar"}</div>
        <div class="kpi-sub">${escapeHtml((targetReport?.k3SafetyLog || "APD & keselamatan standar").slice(0, 48))}</div>
      </div>
    </div>

    <h2 class="section-title">Ringkasan Pelaksanaan &amp; Kendala Lapangan</h2>
    <div class="box">
      <p style="margin:0 0 6px;"><strong>Uraian Aktivitas Harian:</strong><br>${escapeHtml(targetReport?.workSummary || "Belum ada catatan laporan harian pada tanggal ini.").replaceAll("\n", "<br>")}</p>
      ${
        uniqueEquipment.length > 0
          ? `<p style="margin:6px 0 0;"><strong>Daftar Peralatan / Perangkat:</strong> ${escapeHtml(uniqueEquipment.join(" · "))}</p>`
          : ""
      }
      ${
        targetReport?.k3SafetyLog
          ? `<p style="margin:6px 0 0;"><strong>Catatan K3 / Safety:</strong> ${escapeHtml(targetReport.k3SafetyLog)}</p>`
          : ""
      }
    </div>
    ${
      targetReport?.notes
        ? `<div class="box box-warn"><strong>Kendala / Catatan Tambahan:</strong><br>${escapeHtml(targetReport.notes).replaceAll("\n", "<br>")}</div>`
        : ""
    }

    <h2 class="section-title">Rincian Item Pekerjaan &amp; Progres Harian</h2>
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width:32px;">No</th>
          <th>Uraian Pekerjaan / Deliverable</th>
          <th class="text-right" style="width:92px;">Target</th>
          <th>Catatan / Volume Hari Ini</th>
          <th class="text-right" style="width:96px;">Kumulatif</th>
          <th class="text-right" style="width:60px;">Progres</th>
        </tr>
      </thead>
      <tbody>${workPointRowsHtml}</tbody>
    </table>

    ${
      visiblePhotos.length > 0
        ? `<h2 class="section-title">Dokumentasi Foto Lapangan (${visiblePhotos.length})</h2>
           <div class="photo-grid">
             ${visiblePhotos
               .map(
                 (photo) => `<div class="photo-item">
                   <img src="${photo.src}" alt="${escapeHtml(photo.caption)}" />
                   <div class="photo-cap">${escapeHtml(photo.caption)}</div>
                 </div>`,
               )
               .join("")}
           </div>`
        : ""
    }

    <section class="signatures">
      <div class="sig-box">
        <strong>DIBUAT OLEH<br>PIC Lapangan / Pelaksana</strong>
        <div></div>
        <div><strong>${escapeHtml(project.fieldPic?.name || "........................")}</strong><br>Penanggung Jawab Lapangan</div>
      </div>
      <div class="sig-box">
        <strong>DIPERIKSA OLEH<br>Koordinator / Pengawas</strong>
        <div></div>
        <div><strong>........................</strong><br>Koordinator Proyek / MK</div>
      </div>
      <div class="sig-box">
        <strong>PORTAL VERIFIKASI<br>Direksi / Owner</strong>
        ${qrDataUrl ? `<img class="sig-qr" src="${qrDataUrl}" alt="QR Portal Proyek" />` : "<div></div>"}
        <div><strong>${escapeHtml(project.code)}</strong><br>Scan QR untuk Portal Progres</div>
      </div>
    </section>
  `;

  const html = buildReportDocumentShell({
    title: "LAPORAN HARIAN PROYEK",
    subtitle: `${project.title} · ${effectiveDateKey}`,
    codePill: `${project.code} · DAILY`,
    logoDataUrl,
    bodyHtml,
    footerNote: `Laporan Harian ${effectiveDateKey} · ${project.code}`,
  });

  // Build Excel workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Laporan Harian");
  sheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Nilai", key: "value", width: 64 },
  ];
  sheet.addRows([
    { field: "Kode Proyek", value: project.code },
    { field: "Nama Proyek", value: project.title },
    {
      field: "Jenis Pekerjaan",
      value: `${formatWorkTypeLabel(project.jenisPekerjaan)} (${workTypeBadge.groupShortLabel})`,
    },
    { field: "Klien / Mitra", value: project.clientName || project.kelompokTani },
    { field: "Lokasi", value: project.location || project.address },
    { field: "PIC Lapangan", value: project.fieldPic?.name || "-" },
    { field: "Tanggal Laporan", value: effectiveDateKey },
    { field: "Cuaca", value: targetReport?.weather || "-" },
    { field: "Jumlah Tenaga Kerja", value: targetReport?.workersCount ?? 0 },
    { field: "Peralatan", value: uniqueEquipment.join(", ") || "-" },
    { field: "K3 / Safety", value: targetReport?.k3SafetyLog || "-" },
    { field: "Progres Kumulatif (%)", value: cumulativeProgress },
    { field: "Ringkasan Pekerjaan", value: targetReport?.workSummary || "-" },
    { field: "Kendala / Catatan", value: targetReport?.notes || "-" },
  ]);
  sheet.getRow(1).font = { bold: true };

  const itemsSheet = workbook.addWorksheet("Rincian Item");
  itemsSheet.columns = [
    { header: "No", key: "no", width: 8 },
    { header: "Bagian", key: "section", width: 24 },
    { header: "Uraian Pekerjaan", key: "title", width: 42 },
    { header: "Target Volume", key: "target", width: 16 },
    { header: "Satuan", key: "unit", width: 12 },
    { header: "Update Hari Ini", key: "daily", width: 38 },
    { header: "Kumulatif Terpasang", key: "completed", width: 18 },
    { header: "Progres (%)", key: "progress", width: 14 },
  ];
  itemsSheet.addRows(
    project.workPoints.map((wp, idx) => {
      const daily = pointDailyMap.get(wp.id);
      return {
        no: idx + 1,
        section: wp.location || "Umum",
        title: wp.title,
        target: wp.proposedVolume
          ? decimalNumberFromScaledInteger(wp.proposedVolume)
          : 0,
        unit: wp.proposedUnit || "paket",
        daily: daily?.workSummary || "-",
        completed: wp.completedVolume ?? 0,
        progress: wp.progress,
      };
    }),
  );
  itemsSheet.getRow(1).font = { bold: true };

  const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());
  return {
    html,
    workbookBuffer: buffer,
    fileNameBase: `Laporan-Harian-${project.code}-${effectiveDateKey}`,
  };
}

// ============================================================================
// 2. WEEKLY / MONTHLY / CUMULATIVE PROGRESS REPORT + DYNAMIC S-CURVE
// ============================================================================

export async function generateProjectProgressReport(input: {
  projectId: string;
  from?: string | null;
  to?: string | null;
  portalOrigin: string;
}): Promise<{ html: string; workbookBuffer: Uint8Array; fileNameBase: string }> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, isDeleted: false },
    select: {
      id: true,
      code: true,
      title: true,
      name: true,
      jenisPekerjaan: true,
      kelompokTani: true,
      address: true,
      location: true,
      clientName: true,
      status: true,
      progress: true,
      startDate: true,
      endDate: true,
      fieldPic: { select: { name: true } },
      workPoints: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          location: true,
          plannedStartDate: true,
          targetDate: true,
          proposedVolume: true,
          proposedUnit: true,
          proposedTotalWage: true,
          approvedTotalWage: true,
          completedVolume: true,
          progress: true,
        },
      },
      dailyReports: {
        orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          reportDate: true,
          weather: true,
          workersCount: true,
          progress: true,
          equipment: true,
          workSummary: true,
          notes: true,
          k3SafetyLog: true,
          progressPhotos: {
            orderBy: { createdAt: "asc" },
            select: {
              url: true,
              fileUrl: true,
              assetCode: true,
              projectId: true,
              createdAt: true,
            },
          },
        },
      },
      calendarEvents: {
        where: { description: "MILESTONE" },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true, startsAt: true },
      },
    },
  });

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const fromKey = input.from && isValidDateKey(input.from) ? input.from : null;
  const toKey = input.to && isValidDateKey(input.to) ? input.to : null;

  const filteredReports = project.dailyReports.filter((report) => {
    const key = toJakartaDateKey(report.reportDate);
    if (!key) return true;
    if (fromKey && key < fromKey) return false;
    if (toKey && key > toKey) return false;
    return true;
  });

  const actualProgress = clampProjectProgress(
    project.progress > 0 || project.workPoints.length === 0
      ? project.progress
      : calculateWeightedProjectProgress(project.workPoints),
  );
  const sCurveReports = project.dailyReports.flatMap((r) =>
    typeof r.progress === "number"
      ? [{ reportDate: r.reportDate, progress: r.progress }]
      : [],
  );
  const sCurve = buildProjectSCurveSeries({
    startDate: project.startDate,
    endDate: project.endDate,
    currentProgress: actualProgress,
    dailyReports: sCurveReports,
  });
  const plannedToday = sCurve.plannedToday ?? 0;
  const deviation = Math.round((actualProgress - plannedToday) * 10) / 10;

  const latestReport =
    project.dailyReports[project.dailyReports.length - 1] ?? null;
  const lastOpnameLabel = latestReport
    ? formatWibDate(latestReport.reportDate)
    : "Belum ada laporan";

  let estimateCompletionText = "Mengikuti jadwal kontrak";
  if (actualProgress >= 100) {
    estimateCompletionText = "100% Selesai";
  } else if (project.dailyReports.length >= 2) {
    const firstDate = project.startDate ?? project.dailyReports[0]!.reportDate;
    const elapsedDays = Math.max(
      1,
      (Date.now() - firstDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    const ratePerDay = actualProgress / elapsedDays;
    if (ratePerDay > 0.05) {
      const remainingDays = Math.ceil((100 - actualProgress) / ratePerDay);
      const projectedEnd = new Date(
        Date.now() + remainingDays * 24 * 60 * 60 * 1000,
      );
      estimateCompletionText = `${formatWibDate(projectedEnd)} (~${remainingDays} hari)`;
    } else {
      estimateCompletionText = "Laju progres terlalu rendah untuk proyeksi";
    }
  } else if (project.endDate) {
    estimateCompletionText = `Target kontrak ${formatWibDate(project.endDate)}`;
  } else {
    estimateCompletionText = "Belum ada jadwal selesai";
  }

  // Compute work point weights matching calculateWeightedProjectProgress
  const pointWeights = project.workPoints.map((wp) => {
    const approved = wp.approvedTotalWage ? Number(wp.approvedTotalWage) : 0;
    const proposed = Number(wp.proposedTotalWage || 0);
    return approved > 0 ? approved : Math.max(0, proposed);
  });
  const totalWeightBase = pointWeights.reduce((sum, w) => sum + w, 0);

  const groupedSections = new Map<
    string,
    Array<{
      title: string;
      targetText: string;
      completedText: string;
      weightPct: number;
      progress: number;
      achievedWeightPct: number;
    }>
  >();

  project.workPoints.forEach((wp, idx) => {
    const section = wp.location?.trim() || "Pekerjaan Utama";
    const list = groupedSections.get(section) ?? [];
    const targetVol = wp.proposedVolume
      ? decimalNumberFromScaledInteger(wp.proposedVolume)
      : 0;
    const completedVol = wp.completedVolume ?? 0;
    const unit = wp.proposedUnit || "paket";
    const weightPct =
      totalWeightBase > 0
        ? (pointWeights[idx]! / totalWeightBase) * 100
        : project.workPoints.length > 0
          ? 100 / project.workPoints.length
          : 0;
    const achievedWeightPct = (weightPct * clampProjectProgress(wp.progress)) / 100;
    list.push({
      title: wp.title,
      targetText: targetVol > 0 ? `${formatNumberId(targetVol, 3)} ${unit}` : "—",
      completedText:
        targetVol > 0 ? `${formatNumberId(completedVol, 3)} ${unit}` : "—",
      weightPct,
      progress: clampProjectProgress(wp.progress),
      achievedWeightPct,
    });
    groupedSections.set(section, list);
  });

  const sCurveSvg = buildSCurveSvgMarkup({
    startDate: project.startDate,
    endDate: project.endDate,
    currentProgress: actualProgress,
    dailyReports: sCurveReports,
  });

  const workTypeBadge = formatWorkTypeBadge(project.jenisPekerjaan);
  const portalUrl = new URL(
    `/portal/projects/${encodeURIComponent(project.code)}`,
    input.portalOrigin,
  ).toString();
  const { logoDataUrl, qrDataUrl } = await resolveBrandAssets(portalUrl);

  const progressAssetTarget = {
    projectId: project.id,
    projectName: project.title || project.name || project.kelompokTani,
    projectCode: project.code,
  };
  const periodPhotosRaw = [...filteredReports]
    .reverse()
    .flatMap((rep) =>
      rep.progressPhotos
        .filter((p) =>
          doesAssetMatchProject(
            {
              projectId: p.projectId,
              assetCode: p.assetCode,
              url: p.fileUrl ?? p.url,
            },
            progressAssetTarget,
          ),
        )
        .map((p) => {
          const resolvedUrl = p.fileUrl ?? p.url;
          return {
            url: resolvedUrl,
            assetCode:
              p.assetCode ?? parseAssetCode(resolvedUrl)?.assetCode ?? null,
            date: rep.reportDate,
          };
        }),
    )
    .slice(0, 6);
  const periodPhotos = (
    await Promise.all(
      periodPhotosRaw.map(async (p) => ({
        src: await resolvePhotoForPdf(p.url),
        caption: `${p.assetCode ? `[${p.assetCode}] ` : ""}Dokumentasi ${formatWibDate(p.date)}`,
      })),
    )
  ).filter((p) => Boolean(p.src));

  const wbsRowsHtml =
    groupedSections.size > 0
      ? Array.from(groupedSections.entries())
          .map(([sectionName, items]) => {
            const subWeight = items.reduce((s, i) => s + i.weightPct, 0);
            const subAchieved = items.reduce(
              (s, i) => s + i.achievedWeightPct,
              0,
            );
            return `<tr style="background:#f8fafc;font-weight:700;">
                <td colspan="6">${escapeHtml(sectionName)}</td>
              </tr>
              ${items
                .map(
                  (it, i) => `<tr>
                    <td class="text-center mono">${i + 1}</td>
                    <td>${escapeHtml(it.title)}</td>
                    <td class="text-right mono">${escapeHtml(it.targetText)}</td>
                    <td class="text-right mono">${formatNumberId(it.weightPct, 2)}%</td>
                    <td class="text-right mono">${escapeHtml(it.completedText)} (${formatNumberId(it.progress, 1)}%)</td>
                    <td class="text-right mono"><strong>${formatNumberId(it.achievedWeightPct, 2)}%</strong></td>
                  </tr>`,
                )
                .join("")}
              <tr style="background:#f1f5f9;font-weight:700;">
                <td colspan="3" class="text-right">Subtotal ${escapeHtml(sectionName)}</td>
                <td class="text-right mono">${formatNumberId(subWeight, 2)}%</td>
                <td></td>
                <td class="text-right mono">${formatNumberId(subAchieved, 2)}%</td>
              </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="text-center" style="color:#64748b;padding:12px;">Belum ada rincian WBS/RAB; progres kumulatif proyek: ${formatNumberId(actualProgress, 1)}%.</td></tr>`;

  const periodRangeText =
    fromKey || toKey
      ? `${fromKey ?? "Awal"} s/d ${toKey ?? "Sekarang"}`
      : "Kumulatif Proyek";

  const bodyHtml = `
    <div class="info-grid">
      <div>
        <div class="info-row"><span class="info-label">Proyek</span><span class="info-value">: ${escapeHtml(project.title)}</span></div>
        <div class="info-row"><span class="info-label">Jenis Pekerjaan</span><span class="info-value">: ${escapeHtml(formatWorkTypeLabel(project.jenisPekerjaan))} (${escapeHtml(workTypeBadge.groupShortLabel)})</span></div>
        <div class="info-row"><span class="info-label">Klien / Owner</span><span class="info-value">: ${escapeHtml(project.clientName || project.kelompokTani)}</span></div>
        <div class="info-row"><span class="info-label">PIC Lapangan</span><span class="info-value">: ${escapeHtml(project.fieldPic?.name || "Belum ditetapkan")}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="info-label">Periode Laporan</span><span class="info-value">: ${escapeHtml(periodRangeText)}</span></div>
        <div class="info-row"><span class="info-label">Jadwal Kontrak</span><span class="info-value">: ${escapeHtml(formatWibDate(project.startDate))} — ${escapeHtml(formatWibDate(project.endDate))}</span></div>
        <div class="info-row"><span class="info-label">Opname Terakhir</span><span class="info-value">: ${escapeHtml(lastOpnameLabel)}</span></div>
        <div class="info-row"><span class="info-label">Estimasi Selesai</span><span class="info-value">: ${escapeHtml(estimateCompletionText)}</span></div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Progres Aktual</div>
        <div class="kpi-value" style="color:#0f766e;">${formatNumberId(actualProgress, 1)}%</div>
        <div class="kpi-sub">Status: ${escapeHtml(formatProjectStatusLabel(project.status))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rencana Kurva-S</div>
        <div class="kpi-value">${formatNumberId(plannedToday, 1)}%</div>
        <div class="kpi-sub">Target kumulatif hari ini</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Deviasi Jadwal</div>
        <div class="kpi-value" style="color:${deviation < -5 ? "#dc2626" : deviation >= 0 ? "#059669" : "#d97706"};">${deviation >= 0 ? "+" : ""}${formatNumberId(deviation, 1)}%</div>
        <div class="kpi-sub">${deviation < -5 ? "Perlu percepatan" : deviation >= 0 ? "Sesuai / lebih cepat" : "Deviasi ringan"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Laporan Harian</div>
        <div class="kpi-value">${filteredReports.length}</div>
        <div class="kpi-sub">Dari ${project.dailyReports.length} total log DB</div>
      </div>
    </div>

    <h2 class="section-title">Kurva-S Progres Rencana vs Aktual (Live DB)</h2>
    <div class="box">
      <div style="display:flex;justify-content:space-between;font-size:8pt;color:#475569;margin-bottom:6px;">
        <span><strong>Legenda:</strong> <span style="color:#0f766e;">━━</span> Aktual Terpasang &nbsp;&nbsp; <span style="color:#64748b;">╌╌</span> Rencana Kurva-S</span>
        <span>${project.workPoints.length} item pekerjaan · ${project.calendarEvents.length} milestone</span>
      </div>
      ${sCurveSvg}
    </div>

    <h2 class="section-title">Rekapitulasi Bobot &amp; Realisasi Item Pekerjaan</h2>
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width:32px;">No</th>
          <th>Uraian Pekerjaan</th>
          <th class="text-right" style="width:92px;">Target</th>
          <th class="text-right" style="width:68px;">Bobot</th>
          <th class="text-right" style="width:120px;">Terpasang (%)</th>
          <th class="text-right" style="width:82px;">Bobot Capai</th>
        </tr>
      </thead>
      <tbody>
        ${wbsRowsHtml}
        <tr style="background:#0f172a;color:#ffffff;font-weight:800;">
          <td colspan="3">TOTAL PROGRES TERTIMBANG</td>
          <td class="text-right mono">${project.workPoints.length > 0 ? "100,00%" : "—"}</td>
          <td></td>
          <td class="text-right mono">${formatNumberId(actualProgress, 1)}%</td>
        </tr>
      </tbody>
    </table>

    ${
      project.calendarEvents.length > 0
        ? `<h2 class="section-title">Milestone Jadwal Proyek</h2>
           <table>
             <thead><tr><th style="width:36px;" class="text-center">No</th><th>Milestone</th><th style="width:130px;">Tanggal Target</th></tr></thead>
             <tbody>
               ${project.calendarEvents
                 .map(
                   (m, idx) =>
                     `<tr><td class="text-center mono">${idx + 1}</td><td>${escapeHtml(m.title)}</td><td>${escapeHtml(formatWibDate(m.startsAt))}</td></tr>`,
                 )
                 .join("")}
             </tbody>
           </table>`
        : ""
    }

    ${
      filteredReports.length > 0
        ? `<h2 class="section-title">Log Laporan Harian Terbaru (${Math.min(10, filteredReports.length)} Terakhir)</h2>
           <table>
             <thead>
               <tr>
                 <th style="width:86px;">Tanggal</th>
                 <th style="width:74px;">Cuaca</th>
                 <th class="text-right" style="width:54px;">Tim</th>
                 <th class="text-right" style="width:58px;">Progres</th>
                 <th>Ringkasan Pekerjaan &amp; Kendala</th>
               </tr>
             </thead>
             <tbody>
               ${[...filteredReports]
                 .reverse()
                 .slice(0, 10)
                 .map(
                   (rep) => `<tr>
                     <td>${escapeHtml(formatWibDate(rep.reportDate))}</td>
                     <td>${escapeHtml(rep.weather || "—")}</td>
                     <td class="text-right mono">${rep.workersCount}</td>
                     <td class="text-right mono">${rep.progress !== null ? `${formatNumberId(rep.progress, 1)}%` : "—"}</td>
                     <td>${escapeHtml(rep.workSummary || "—")}${rep.notes ? `<br><span style="color:#b45309;font-size:7.8pt;">Kendala: ${escapeHtml(rep.notes)}</span>` : ""}</td>
                   </tr>`,
                 )
                 .join("")}
             </tbody>
           </table>`
        : ""
    }

    ${
      periodPhotos.length > 0
        ? `<h2 class="section-title">Galeri Dokumentasi Periode (${periodPhotos.length})</h2>
           <div class="photo-grid">
             ${periodPhotos
               .map(
                 (p) => `<div class="photo-item">
                   <img src="${p.src}" alt="${escapeHtml(p.caption)}" />
                   <div class="photo-cap">${escapeHtml(p.caption)}</div>
                 </div>`,
               )
               .join("")}
           </div>`
        : ""
    }

    <section class="signatures">
      <div class="sig-box">
        <strong>DIBUAT OLEH<br>Tim Proyek / PIC</strong>
        <div></div>
        <div><strong>${escapeHtml(project.fieldPic?.name || "Skala Prioritas")}</strong><br>Pelaksana Lapangan</div>
      </div>
      <div class="sig-box">
        <strong>DISETUJUI OLEH<br>Klien / Owner</strong>
        <div></div>
        <div><strong>${escapeHtml(project.clientName || project.kelompokTani)}</strong><br>Penerima / Pemilik Proyek</div>
      </div>
      <div class="sig-box">
        <strong>VERIFIKASI &amp; PORTAL<br>PT Skala Prioritas</strong>
        ${qrDataUrl ? `<img class="sig-qr" src="${qrDataUrl}" alt="QR Portal Proyek" />` : "<div></div>"}
        <div><strong>${escapeHtml(project.code)}</strong><br>Scan QR untuk Data Live</div>
      </div>
    </section>
  `;

  const html = buildReportDocumentShell({
    title: "LAPORAN PROGRES PEKERJAAN & KURVA-S",
    subtitle: `${project.title} · ${periodRangeText}`,
    codePill: `${project.code} · PROGRES`,
    logoDataUrl,
    bodyHtml,
    footerNote: `Opname Terakhir: ${lastOpnameLabel} · ${project.code}`,
  });

  // Build Multi-Sheet Excel Workbook
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("Ringkasan Progres");
  summarySheet.columns = [
    { header: "Parameter", key: "label", width: 28 },
    { header: "Nilai", key: "value", width: 52 },
  ];
  summarySheet.addRows([
    { label: "Kode Proyek", value: project.code },
    { label: "Nama Proyek", value: project.title },
    {
      label: "Jenis Pekerjaan",
      value: `${formatWorkTypeLabel(project.jenisPekerjaan)} (${workTypeBadge.groupShortLabel})`,
    },
    { label: "Klien / Mitra", value: project.clientName || project.kelompokTani },
    { label: "Periode Laporan", value: periodRangeText },
    { label: "Tanggal Mulai", value: formatWibDate(project.startDate) },
    { label: "Tanggal Selesai", value: formatWibDate(project.endDate) },
    { label: "Opname Terakhir", value: lastOpnameLabel },
    { label: "Estimasi Selesai", value: estimateCompletionText },
    { label: "Progres Aktual (%)", value: actualProgress },
    { label: "Rencana Kurva-S (%)", value: plannedToday },
    { label: "Deviasi (%)", value: deviation },
    { label: "Jumlah Laporan Harian", value: filteredReports.length },
  ]);
  summarySheet.getRow(1).font = { bold: true };

  const wbsSheet = workbook.addWorksheet("Rincian WBS & Bobot");
  wbsSheet.columns = [
    { header: "Bagian", key: "section", width: 26 },
    { header: "Uraian Pekerjaan", key: "title", width: 42 },
    { header: "Target", key: "target", width: 16 },
    { header: "Bobot (%)", key: "weight", width: 14 },
    { header: "Terpasang", key: "completed", width: 16 },
    { header: "Progres (%)", key: "progress", width: 14 },
    { header: "Bobot Tercapai (%)", key: "achieved", width: 18 },
  ];
  for (const [sectionName, items] of groupedSections.entries()) {
    for (const item of items) {
      wbsSheet.addRow({
        section: sectionName,
        title: item.title,
        target: item.targetText,
        weight: Number(item.weightPct.toFixed(2)),
        completed: item.completedText,
        progress: Number(item.progress.toFixed(1)),
        achieved: Number(item.achievedWeightPct.toFixed(2)),
      });
    }
  }
  wbsSheet.getRow(1).font = { bold: true };

  const logsSheet = workbook.addWorksheet("Riwayat Laporan Harian");
  logsSheet.columns = [
    { header: "Tanggal", key: "date", width: 16 },
    { header: "Cuaca", key: "weather", width: 16 },
    { header: "Tenaga Kerja", key: "workers", width: 14 },
    { header: "Peralatan", key: "equipment", width: 32 },
    { header: "Progres (%)", key: "progress", width: 14 },
    { header: "Ringkasan Pekerjaan", key: "summary", width: 52 },
    { header: "Kendala / Catatan", key: "notes", width: 36 },
    { header: "Log K3", key: "k3", width: 28 },
  ];
  logsSheet.addRows(
    filteredReports.map((rep) => ({
      date: toJakartaDateKey(rep.reportDate) ?? formatWibDate(rep.reportDate),
      weather: rep.weather || "-",
      workers: rep.workersCount,
      equipment: formatDailyEquipmentList(rep.equipment).join(", ") || "-",
      progress: rep.progress ?? actualProgress,
      summary: rep.workSummary || "-",
      notes: rep.notes || "-",
      k3: rep.k3SafetyLog || "-",
    })),
  );
  logsSheet.getRow(1).font = { bold: true };

  const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());
  return {
    html,
    workbookBuffer: buffer,
    fileNameBase: `Laporan-Progres-${project.code}`,
  };
}

// ============================================================================
// 3. FINANCIAL REALIZATION VS RAB & RAP (RBAC STRICT)
// ============================================================================

export async function generateProjectFinancialReport(input: {
  projectId: string;
  portalOrigin: string;
}): Promise<{ html: string; workbookBuffer: Uint8Array; fileNameBase: string }> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, isDeleted: false },
    select: {
      id: true,
      code: true,
      title: true,
      name: true,
      jenisPekerjaan: true,
      kelompokTani: true,
      address: true,
      location: true,
      clientName: true,
      vendor: true,
      pagu: true,
      budget: true,
      progress: true,
      status: true,
      startDate: true,
      endDate: true,
      workPoints: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          location: true,
          proposedVolume: true,
          proposedUnit: true,
          proposedUnitPrice: true,
          proposedTotalWage: true,
          approvedTotalWage: true,
          progress: true,
        },
      },
      materialPlans: {
        orderBy: { createdAt: "asc" },
        select: {
          materialName: true,
          unit: true,
          plannedQuantity: true,
          actualQuantity: true,
          unitPrice: true,
          totalPrice: true,
          scope: true,
        },
      },
      laborPlans: {
        orderBy: { createdAt: "asc" },
        select: {
          jobName: true,
          volume: true,
          unit: true,
          boronganRate: true,
          totalBorongan: true,
          subkonName: true,
        },
      },
      subkonContracts: {
        orderBy: { createdAt: "desc" },
        select: {
          contractNumber: true,
          subkonName: true,
          contractValue: true,
          status: true,
          termyns: {
            select: {
              termynNumber: true,
              grossAmount: true,
              netAmount: true,
              status: true,
              paidAt: true,
            },
          },
        },
      },
      bastDocuments: {
        orderBy: { date: "desc" },
        select: {
          bastNumber: true,
          type: true,
          date: true,
          isApproved: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const realizationMap = await getPaidProjectTicketRealization([project.id]);
  const realization = realizationMap.get(project.id);

  const paguAmount = decimalNumberFromScaledInteger(project.pagu);
  const totalRab = project.workPoints.reduce(
    (sum, wp) => sum + decimalNumberFromScaledInteger(wp.proposedTotalWage),
    0,
  );
  const totalApprovedWage = project.workPoints.reduce(
    (sum, wp) =>
      sum +
      (wp.approvedTotalWage
        ? decimalNumberFromScaledInteger(wp.approvedTotalWage)
        : 0),
    0,
  );
  const totalRapMaterial = project.materialPlans.reduce(
    (sum, m) => sum + decimalNumberFromScaledInteger(m.totalPrice),
    0,
  );
  const totalRapLabor = project.laborPlans.reduce(
    (sum, l) => sum + decimalNumberFromScaledInteger(l.totalBorongan),
    0,
  );
  const computedRap = totalRapMaterial + totalRapLabor;
  const projectBudget = project.budget
    ? decimalNumberFromScaledInteger(project.budget)
    : 0;
  const effectiveRap = computedRap > 0 ? computedRap : projectBudget;

  const paidTotal = realization?.total.toNumber() ?? 0;
  const paidMaterial = realization?.material.toNumber() ?? 0;
  const paidLabor = realization?.labor.toNumber() ?? 0;
  const paidRental = realization?.rental.toNumber() ?? 0;
  const paidOperational =
    (realization?.operational.toNumber() ?? 0) +
    (realization?.transport.toNumber() ?? 0);
  const requestedTotal = realization?.requestedTotal.toNumber() ?? 0;

  const subkonContractTotal = project.subkonContracts.reduce(
    (sum, spk) => sum + decimalNumberFromScaledInteger(spk.contractValue),
    0,
  );
  const subkonPaidTotal = project.subkonContracts.reduce(
    (sum, spk) =>
      sum +
      spk.termyns
        .filter((t) => t.status === "PAID" || Boolean(t.paidAt))
        .reduce((s, t) => s + decimalNumberFromScaledInteger(t.netAmount), 0),
    0,
  );

  const effectiveCeiling = paguAmount > 0 ? paguAmount : totalRab;
  const totalOutflowPaid = paidTotal + subkonPaidTotal;
  const remainingFromPagu = effectiveCeiling - totalOutflowPaid;
  const absorptionPct =
    effectiveCeiling > 0 ? (totalOutflowPaid / effectiveCeiling) * 100 : 0;
  const estimatedMarginVsRap =
    effectiveCeiling > 0 && effectiveRap > 0
      ? effectiveCeiling - effectiveRap
      : null;

  const portalUrl = new URL(
    `/portal/projects/${encodeURIComponent(project.code)}`,
    input.portalOrigin,
  ).toString();
  const { logoDataUrl, qrDataUrl } = await resolveBrandAssets(portalUrl);

  const categoryRows = [
    {
      label: "Bahan / Material",
      paid: paidMaterial,
      requested: realization?.requestedMaterial.toNumber() ?? 0,
    },
    {
      label: "Upah Tukang / Tenaga",
      paid: paidLabor,
      requested: realization?.requestedLabor.toNumber() ?? 0,
    },
    {
      label: "Sewa Alat / Mess / Kendaraan",
      paid: paidRental,
      requested: realization?.requestedRental.toNumber() ?? 0,
    },
    {
      label: "Operasional & Langsir Lapangan",
      paid: paidOperational,
      requested: realization?.requestedOperational.toNumber() ?? 0,
    },
    {
      label: "Termin Subkontraktor (SPK)",
      paid: subkonPaidTotal,
      requested: 0,
    },
  ];

  const tickets = (realization?.tickets ?? []).slice(0, 25);

  const bodyHtml = `
    <div class="info-grid">
      <div>
        <div class="info-row"><span class="info-label">Proyek</span><span class="info-value">: ${escapeHtml(project.title)}</span></div>
        <div class="info-row"><span class="info-label">Jenis Pekerjaan</span><span class="info-value">: ${escapeHtml(formatWorkTypeLabel(project.jenisPekerjaan))}</span></div>
        <div class="info-row"><span class="info-label">Klien / Owner</span><span class="info-value">: ${escapeHtml(project.clientName || project.kelompokTani)}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="info-label">Progres Fisik</span><span class="info-value">: ${formatNumberId(project.progress, 1)}% (${escapeHtml(formatProjectStatusLabel(project.status))})</span></div>
        <div class="info-row"><span class="info-label">Serapan Dana</span><span class="info-value">: ${formatNumberId(absorptionPct, 1)}% dari Pagu/RAB</span></div>
        <div class="info-row"><span class="info-label">Dokumen BAST</span><span class="info-value">: ${project.bastDocuments.length > 0 ? escapeHtml(project.bastDocuments.map((b) => `${b.bastNumber} (${b.type})`).join(", ")) : "Belum ada"}</span></div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Pagu Kontrak</div>
        <div class="kpi-value" style="font-size:10.5pt;">${escapeHtml(formatIdr(effectiveCeiling))}</div>
        <div class="kpi-sub">Total RAB Item: ${escapeHtml(formatIdr(totalRab))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rencana RAP / Budget</div>
        <div class="kpi-value" style="font-size:10.5pt;">${escapeHtml(formatIdr(effectiveRap))}</div>
        <div class="kpi-sub">${estimatedMarginVsRap !== null ? `Est. Margin RAP: ${escapeHtml(formatIdr(estimatedMarginVsRap))}` : "Belum disusun"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Realisasi Cair (Paid)</div>
        <div class="kpi-value" style="font-size:10.5pt;color:#0f766e;">${escapeHtml(formatIdr(totalOutflowPaid))}</div>
        <div class="kpi-sub">Diajukan (Pending): ${escapeHtml(formatIdr(requestedTotal))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sisa Anggaran Pagu</div>
        <div class="kpi-value" style="font-size:10.5pt;color:${remainingFromPagu < 0 ? "#dc2626" : "#0f172a"};">${escapeHtml(formatIdr(remainingFromPagu))}</div>
        <div class="kpi-sub">Disetujui Upah Titik: ${escapeHtml(formatIdr(totalApprovedWage))}</div>
      </div>
    </div>

    <h2 class="section-title">Realisasi Pengeluaran per Kategori Dana</h2>
    <table>
      <thead>
        <tr>
          <th>Kategori Pengeluaran</th>
          <th class="text-right" style="width:150px;">Realisasi Cair (Paid)</th>
          <th class="text-right" style="width:150px;">Pengajuan Berjalan</th>
          <th class="text-right" style="width:90px;">Porsi (%)</th>
        </tr>
      </thead>
      <tbody>
        ${categoryRows
          .map((cat) => {
            const share =
              totalOutflowPaid > 0 ? (cat.paid / totalOutflowPaid) * 100 : 0;
            return `<tr>
              <td>${escapeHtml(cat.label)}</td>
              <td class="text-right mono">${escapeHtml(formatIdr(cat.paid))}</td>
              <td class="text-right mono">${escapeHtml(formatIdr(cat.requested))}</td>
              <td class="text-right mono">${formatNumberId(share, 1)}%</td>
            </tr>`;
          })
          .join("")}
        <tr style="background:#0f172a;color:#ffffff;font-weight:800;">
          <td>TOTAL REALISASI KELUAR</td>
          <td class="text-right mono">${escapeHtml(formatIdr(totalOutflowPaid))}</td>
          <td class="text-right mono">${escapeHtml(formatIdr(requestedTotal))}</td>
          <td class="text-right mono">100,0%</td>
        </tr>
      </tbody>
    </table>

    <h2 class="section-title">Ringkasan RAB Titik Kerja vs RAP (Material &amp; Jasa Borongan)</h2>
    <table>
      <thead>
        <tr>
          <th>Komponen Anggaran</th>
          <th class="text-right" style="width:90px;">Jumlah Item</th>
          <th class="text-right" style="width:170px;">Nilai Anggaran</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>RAB Pekerjaan (Proposed)</td><td class="text-right mono">${project.workPoints.length}</td><td class="text-right mono">${escapeHtml(formatIdr(totalRab))}</td></tr>
        <tr><td>Upah Titik Kerja Disetujui</td><td class="text-right mono">${project.workPoints.filter((w) => (w.approvedTotalWage ?? BigInt(0)) > BigInt(0)).length}</td><td class="text-right mono">${escapeHtml(formatIdr(totalApprovedWage))}</td></tr>
        <tr><td>RAP Bahan / Material</td><td class="text-right mono">${project.materialPlans.length}</td><td class="text-right mono">${escapeHtml(formatIdr(totalRapMaterial))}</td></tr>
        <tr><td>RAP Jasa Borongan</td><td class="text-right mono">${project.laborPlans.length}</td><td class="text-right mono">${escapeHtml(formatIdr(totalRapLabor))}</td></tr>
        <tr><td>Kontrak Subkontraktor (SPK)</td><td class="text-right mono">${project.subkonContracts.length}</td><td class="text-right mono">${escapeHtml(formatIdr(subkonContractTotal))}</td></tr>
      </tbody>
    </table>

    ${
      tickets.length > 0
        ? `<h2 class="section-title">Riwayat Tiket &amp; Transaksi Realisasi (${tickets.length} Terbaru)</h2>
           <table>
             <thead>
               <tr>
                 <th style="width:100px;">No. Tiket</th>
                 <th>Uraian / Permintaan</th>
                 <th style="width:90px;">Kategori</th>
                 <th style="width:90px;">Status</th>
                 <th class="text-right" style="width:120px;">Nominal</th>
               </tr>
             </thead>
             <tbody>
               ${tickets
                 .map(
                   (t) => `<tr>
                     <td class="mono">${escapeHtml(t.ticketNumber)}</td>
                     <td>${escapeHtml(t.title)}<br><span style="color:#64748b;font-size:7.6pt;">Pemohon: ${escapeHtml(t.requesterName)} · ${escapeHtml(formatWibDate(t.paidAt ?? t.createdAt))}</span></td>
                     <td>${escapeHtml(t.fundCategory)}</td>
                     <td>${t.paid ? '<strong style="color:#059669;">CAIR</strong>' : escapeHtml(t.status)}</td>
                     <td class="text-right mono">${t.amount ? escapeHtml(formatIdr(Number(t.amount))) : "—"}</td>
                   </tr>`,
                 )
                 .join("")}
             </tbody>
           </table>`
        : ""
    }

    <section class="signatures">
      <div class="sig-box">
        <strong>DISUSUN OLEH<br>Keuangan / Administrasi</strong>
        <div></div>
        <div><strong>Tim Keuangan Proyek</strong><br>PT Skala Prioritas</div>
      </div>
      <div class="sig-box">
        <strong>DISETUJUI OLEH<br>Direktur / Wakil Direktur</strong>
        <div></div>
        <div><strong>Manajemen Eksekutif</strong><br>Otorisasi Keuangan</div>
      </div>
      <div class="sig-box">
        <strong>VERIFIKASI DOKUMEN<br>INTERNAL</strong>
        ${qrDataUrl ? `<img class="sig-qr" src="${qrDataUrl}" alt="QR Verifikasi" />` : "<div></div>"}
        <div><strong>${escapeHtml(project.code)}</strong><br>Dokumen Keuangan Internal</div>
      </div>
    </section>
  `;

  const html = buildReportDocumentShell({
    title: "LAPORAN REALISASI KEUANGAN PROYEK",
    subtitle: `${project.title} · Pagu vs RAB vs RAP vs Realisasi`,
    codePill: `${project.code} · KEUANGAN`,
    logoDataUrl,
    bodyHtml,
    footerNote: `Dokumen Internal Keuangan · ${project.code}`,
  });

  // Build Excel workbook
  const workbook = new ExcelJS.Workbook();
  const sheet1 = workbook.addWorksheet("Ringkasan Keuangan");
  sheet1.columns = [
    { header: "Komponen", key: "label", width: 34 },
    { header: "Nominal (IDR) / Nilai", key: "value", width: 26 },
  ];
  sheet1.addRows([
    { label: "Kode Proyek", value: project.code },
    { label: "Nama Proyek", value: project.title },
    { label: "Jenis Pekerjaan", value: formatWorkTypeLabel(project.jenisPekerjaan) },
    { label: "Pagu Kontrak", value: effectiveCeiling },
    { label: "Total RAB Pekerjaan", value: totalRab },
    { label: "Total Upah Titik Disetujui", value: totalApprovedWage },
    { label: "Total RAP (Bahan + Jasa)", value: effectiveRap },
    { label: "Realisasi Cair - Material", value: paidMaterial },
    { label: "Realisasi Cair - Upah Tukang", value: paidLabor },
    { label: "Realisasi Cair - Sewa", value: paidRental },
    { label: "Realisasi Cair - Operasional & Langsir", value: paidOperational },
    { label: "Realisasi Cair - Termin Subkon", value: subkonPaidTotal },
    { label: "Total Realisasi Cair", value: totalOutflowPaid },
    { label: "Total Pengajuan Berjalan", value: requestedTotal },
    { label: "Sisa Anggaran Pagu", value: remainingFromPagu },
    { label: "Serapan Anggaran (%)", value: Number(absorptionPct.toFixed(2)) },
  ]);
  sheet1.getRow(1).font = { bold: true };

  const sheet2 = workbook.addWorksheet("RAB Titik Pekerjaan");
  sheet2.columns = [
    { header: "Bagian", key: "section", width: 24 },
    { header: "Uraian Pekerjaan", key: "title", width: 42 },
    { header: "Volume", key: "volume", width: 14 },
    { header: "Satuan", key: "unit", width: 12 },
    { header: "Harga Satuan", key: "unitPrice", width: 18 },
    { header: "Total RAB", key: "totalRab", width: 20 },
    { header: "Upah Disetujui", key: "approvedWage", width: 20 },
    { header: "Progres (%)", key: "progress", width: 14 },
  ];
  sheet2.addRows(
    project.workPoints.map((wp) => ({
      section: wp.location || "Umum",
      title: wp.title,
      volume: wp.proposedVolume
        ? decimalNumberFromScaledInteger(wp.proposedVolume)
        : 0,
      unit: wp.proposedUnit || "paket",
      unitPrice: wp.proposedUnitPrice
        ? decimalNumberFromScaledInteger(wp.proposedUnitPrice)
        : 0,
      totalRab: decimalNumberFromScaledInteger(wp.proposedTotalWage),
      approvedWage: wp.approvedTotalWage
        ? decimalNumberFromScaledInteger(wp.approvedTotalWage)
        : 0,
      progress: wp.progress,
    })),
  );
  sheet2.getRow(1).font = { bold: true };

  const sheet3 = workbook.addWorksheet("RAP Bahan & Borongan");
  sheet3.columns = [
    { header: "Tipe", key: "type", width: 16 },
    { header: "Uraian / Material", key: "name", width: 38 },
    { header: "Volume", key: "qty", width: 14 },
    { header: "Satuan", key: "unit", width: 12 },
    { header: "Harga Satuan", key: "unitPrice", width: 18 },
    { header: "Total RAP", key: "total", width: 20 },
    { header: "Keterangan / Subkon", key: "note", width: 26 },
  ];
  sheet3.addRows([
    ...project.materialPlans.map((m) => ({
      type: "Bahan RAP",
      name: m.materialName,
      qty: m.actualQuantity,
      unit: m.unit,
      unitPrice: decimalNumberFromScaledInteger(m.unitPrice),
      total: decimalNumberFromScaledInteger(m.totalPrice),
      note: m.scope,
    })),
    ...project.laborPlans.map((l) => ({
      type: "Jasa Borongan",
      name: l.jobName,
      qty: l.volume,
      unit: l.unit,
      unitPrice: decimalNumberFromScaledInteger(l.boronganRate),
      total: decimalNumberFromScaledInteger(l.totalBorongan),
      note: l.subkonName || "-",
    })),
  ]);
  sheet3.getRow(1).font = { bold: true };

  const sheet4 = workbook.addWorksheet("Transaksi & Tiket");
  sheet4.columns = [
    { header: "No. Tiket", key: "ticketNumber", width: 18 },
    { header: "Judul", key: "title", width: 40 },
    { header: "Kategori Dana", key: "fundCategory", width: 16 },
    { header: "Status Tiket", key: "status", width: 20 },
    { header: "Sudah Cair", key: "paid", width: 12 },
    { header: "Nominal", key: "amount", width: 18 },
    { header: "Pemohon", key: "requester", width: 22 },
    { header: "Tanggal", key: "date", width: 18 },
  ];
  sheet4.addRows(
    (realization?.tickets ?? []).map((t) => ({
      ticketNumber: t.ticketNumber,
      title: t.title,
      fundCategory: t.fundCategory,
      status: t.status,
      paid: t.paid ? "YA" : "BELUM",
      amount: t.amount ? Number(t.amount) : 0,
      requester: t.requesterName,
      date: formatWibDate(t.paidAt ?? t.createdAt),
    })),
  );
  sheet4.getRow(1).font = { bold: true };

  const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());
  return {
    html,
    workbookBuffer: buffer,
    fileNameBase: `Laporan-Keuangan-${project.code}`,
  };
}

// ============================================================================
// 4. MASTER PORTFOLIO LIVE-DB SUMMARY (FOR EXPORT & DINAS LIVE RECAP)
// ============================================================================

export type PortfolioProjectSummaryRow = {
  id: string;
  code: string;
  title: string;
  jenisPekerjaan: string;
  workTypeCategory: "KONSULTANSI" | "FISIK";
  kelompokTani: string;
  clientName: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  status: string;
  actualProgress: number;
  plannedProgress: number | null;
  deviation: number | null;
  dailyReportCount: number;
  lastReportDate: string | null;
  pagu: number | null;
  realized: number | null;
  fieldPicName: string | null;
};

export type LivePortfolioSummary = {
  totalProjects: number;
  consultancyCount: number;
  physicalCount: number;
  averageActualProgress: number;
  totalDailyReports: number;
  totalPagu: number | null;
  totalRealized: number | null;
  byWorkType: Array<{
    workType: string;
    category: "KONSULTANSI" | "FISIK";
    count: number;
    avgProgress: number;
  }>;
  rows: PortfolioProjectSummaryRow[];
};

function splitProjectAddress(address: string) {
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

function resolvePortfolioStatusFilter(
  statusFilter: string,
): ProjectStatus[] | null {
  const normalized = statusFilter.trim().toUpperCase();
  if (!normalized || normalized === "ALL") return null;
  switch (normalized) {
    case "RUNNING":
    case "ON_PROGRESS":
    case "ACTIVE":
      return [
        ProjectStatus.RUNNING,
        ProjectStatus.ON_PROGRESS,
        ProjectStatus.ACTIVE,
      ];
    case "PENDING_SETUP":
    case "PENDING":
    case "PLANNED":
      return [
        ProjectStatus.PENDING_SETUP,
        ProjectStatus.PENDING,
        ProjectStatus.PLANNED,
      ];
    case "HOLD":
    case "TERHAMBAT":
    case "ON_HOLD":
      return [ProjectStatus.TERHAMBAT, ProjectStatus.ON_HOLD];
    case "DONE":
    case "COMPLETED":
      return [ProjectStatus.DONE, ProjectStatus.COMPLETED];
    default: {
      const valid = Object.values(ProjectStatus) as string[];
      return valid.includes(normalized) ? [normalized as ProjectStatus] : null;
    }
  }
}

export async function buildLivePortfolioSummary(input: {
  userRole: UserRole;
  userId: string;
  search?: string;
  jenisPekerjaan?: string;
  status?: string;
}): Promise<LivePortfolioSummary> {
  const search = input.search?.trim().slice(0, 120) ?? "";
  const jenisFilter = input.jenisPekerjaan?.trim() ?? "";
  const statusFilterList = input.status
    ? resolvePortfolioStatusFilter(input.status)
    : null;

  const isFieldRestricted =
    input.userRole === UserRole.FIELD_TEAM ||
    input.userRole === UserRole.KOORDINATOR;

  const projects = await prisma.project.findMany({
    where: {
      isDeleted: false,
      ...(isFieldRestricted ? { fieldPicId: input.userId } : {}),
      ...(statusFilterList ? { status: { in: statusFilterList } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
              { address: { contains: search, mode: "insensitive" } },
              { location: { contains: search, mode: "insensitive" } },
              { jenisPekerjaan: { contains: search, mode: "insensitive" } },
              {
                fieldPic: {
                  is: { name: { contains: search, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      title: true,
      pagu: true,
      progress: true,
      jenisPekerjaan: true,
      kelompokTani: true,
      clientName: true,
      address: true,
      status: true,
      startDate: true,
      endDate: true,
      fieldPic: { select: { name: true } },
      dailyReports: {
        orderBy: { reportDate: "desc" },
        take: 1,
        select: { reportDate: true },
      },
      _count: { select: { dailyReports: true } },
    },
  });

  const filteredProjects = projects.filter((project) => {
    if (!jenisFilter || jenisFilter === "ALL") return true;
    if (jenisFilter === "CONSULTANCY") {
      return isConsultancyWorkType(project.jenisPekerjaan);
    }
    if (jenisFilter === "PHYSICAL") {
      return !isConsultancyWorkType(project.jenisPekerjaan);
    }
    const resolved = resolveProjectWorkType(project.jenisPekerjaan);
    const raw = (project.jenisPekerjaan ?? "").trim().toLowerCase();
    return (
      resolved.id === jenisFilter.toLowerCase() ||
      resolved.label.toLowerCase() === jenisFilter.toLowerCase() ||
      raw === jenisFilter.toLowerCase()
    );
  });

  const includeFinancials = canViewProjectFinancialReports(input.userRole);
  const realizedMap = includeFinancials
    ? await getPaidProjectTicketRealization(filteredProjects.map((p) => p.id))
    : null;
  const nowMs = Date.now();

  const rows: PortfolioProjectSummaryRow[] = filteredProjects.map((project) => {
    const addr = splitProjectAddress(project.address);
    const actualProgress = clampProjectProgress(project.progress);
    const plannedProgress = calculatePlannedSCurveProgress(
      project.startDate,
      project.endDate,
      nowMs,
    );
    const deviation =
      plannedProgress !== null
        ? Math.round((actualProgress - plannedProgress) * 10) / 10
        : null;
    const isConsultancy = isConsultancyWorkType(project.jenisPekerjaan);
    const lastReport = project.dailyReports[0];

    return {
      id: project.id,
      code: project.code,
      title: project.title,
      jenisPekerjaan: formatWorkTypeLabel(project.jenisPekerjaan),
      workTypeCategory: isConsultancy ? "KONSULTANSI" : "FISIK",
      kelompokTani: project.kelompokTani,
      clientName: project.clientName || project.kelompokTani,
      desa: addr.desa || project.kelompokTani,
      kecamatan: addr.kecamatan,
      kabupaten: addr.kabupaten,
      status: project.status,
      actualProgress,
      plannedProgress,
      deviation,
      dailyReportCount: project._count.dailyReports,
      lastReportDate: lastReport ? toJakartaDateKey(lastReport.reportDate) : null,
      pagu: includeFinancials
        ? decimalNumberFromScaledInteger(project.pagu)
        : null,
      realized: includeFinancials
        ? (realizedMap?.get(project.id)?.total.toNumber() ?? 0)
        : null,
      fieldPicName: project.fieldPic?.name ?? null,
    };
  });

  const workTypeAgg = new Map<
    string,
    {
      workType: string;
      category: "KONSULTANSI" | "FISIK";
      count: number;
      sumProgress: number;
    }
  >();
  for (const row of rows) {
    const existing = workTypeAgg.get(row.jenisPekerjaan) ?? {
      workType: row.jenisPekerjaan,
      category: row.workTypeCategory,
      count: 0,
      sumProgress: 0,
    };
    existing.count += 1;
    existing.sumProgress += row.actualProgress;
    workTypeAgg.set(row.jenisPekerjaan, existing);
  }

  return {
    totalProjects: rows.length,
    consultancyCount: rows.filter((r) => r.workTypeCategory === "KONSULTANSI")
      .length,
    physicalCount: rows.filter((r) => r.workTypeCategory === "FISIK").length,
    averageActualProgress:
      rows.length > 0
        ? Math.round(
            (rows.reduce((s, r) => s + r.actualProgress, 0) / rows.length) * 10,
          ) / 10
        : 0,
    totalDailyReports: rows.reduce((s, r) => s + r.dailyReportCount, 0),
    totalPagu: includeFinancials
      ? rows.reduce((s, r) => s + (r.pagu ?? 0), 0)
      : null,
    totalRealized: includeFinancials
      ? rows.reduce((s, r) => s + (r.realized ?? 0), 0)
      : null,
    byWorkType: Array.from(workTypeAgg.values()).map((entry) => ({
      workType: entry.workType,
      category: entry.category,
      count: entry.count,
      avgProgress: Math.round((entry.sumProgress / entry.count) * 10) / 10,
    })),
    rows,
  };
}

export async function generatePortfolioRecapHtml(input: {
  summary: LivePortfolioSummary;
  includeFinancials: boolean;
  portalOrigin: string;
}): Promise<string> {
  const { logoDataUrl } = await resolveBrandAssets(input.portalOrigin);

  const tableRows =
    input.summary.rows.length > 0
      ? input.summary.rows
          .map(
            (row, idx) => `<tr>
              <td class="text-center mono">${idx + 1}</td>
              <td class="mono">${escapeHtml(row.code)}</td>
              <td><strong>${escapeHtml(row.title)}</strong><br><span style="color:#64748b;font-size:7.6pt;">${escapeHtml(row.desa)}${row.kecamatan ? `, Kec. ${escapeHtml(row.kecamatan)}` : ""}</span></td>
              <td>${escapeHtml(row.jenisPekerjaan)}<br><span style="color:#475569;font-size:7.5pt;">${row.workTypeCategory}</span></td>
              <td class="text-right mono">${formatNumberId(row.actualProgress, 1)}%</td>
              <td class="text-right mono">${row.plannedProgress !== null ? `${formatNumberId(row.plannedProgress, 1)}%` : "—"}</td>
              <td class="text-right mono">${row.deviation !== null ? `${row.deviation >= 0 ? "+" : ""}${formatNumberId(row.deviation, 1)}%` : "—"}</td>
              <td class="text-right mono">${row.dailyReportCount}</td>
              ${
                input.includeFinancials
                  ? `<td class="text-right mono">${escapeHtml(formatIdr(row.pagu ?? 0))}</td>
                     <td class="text-right mono">${escapeHtml(formatIdr(row.realized ?? 0))}</td>`
                  : ""
              }
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="${input.includeFinancials ? 10 : 8}" class="text-center" style="color:#64748b;padding:12px;">Tidak ada proyek sesuai filter.</td></tr>`;

  const bodyHtml = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Paket Proyek</div>
        <div class="kpi-value">${input.summary.totalProjects}</div>
        <div class="kpi-sub">${input.summary.consultancyCount} Konsultansi · ${input.summary.physicalCount} Fisik</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rata-rata Progres</div>
        <div class="kpi-value" style="color:#0f766e;">${formatNumberId(input.summary.averageActualProgress, 1)}%</div>
        <div class="kpi-sub">Portofolio aktif DB</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Laporan Harian</div>
        <div class="kpi-value">${input.summary.totalDailyReports}</div>
        <div class="kpi-sub">Akumulasi laporan lapangan</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${input.includeFinancials ? "Total Pagu Kontrak" : "Kategori Jenis"}</div>
        <div class="kpi-value" style="font-size:${input.includeFinancials ? "10pt" : "11.5pt"};">${input.includeFinancials ? escapeHtml(formatIdr(input.summary.totalPagu ?? 0)) : `${input.summary.byWorkType.length} Jenis`}</div>
        <div class="kpi-sub">${input.includeFinancials ? `Realisasi: ${escapeHtml(formatIdr(input.summary.totalRealized ?? 0))}` : "Aktif pada portofolio"}</div>
      </div>
    </div>

    <h2 class="section-title">Rekapitulasi Portofolio Proyek Live Database</h2>
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width:28px;">No</th>
          <th style="width:80px;">Kode</th>
          <th>Nama Proyek &amp; Lokasi</th>
          <th style="width:120px;">Jenis &amp; Kategori</th>
          <th class="text-right" style="width:52px;">Aktual</th>
          <th class="text-right" style="width:56px;">Rencana</th>
          <th class="text-right" style="width:52px;">Deviasi</th>
          <th class="text-right" style="width:44px;">Lap.</th>
          ${
            input.includeFinancials
              ? `<th class="text-right" style="width:94px;">Pagu</th>
                 <th class="text-right" style="width:94px;">Realisasi</th>`
              : ""
          }
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  return buildReportDocumentShell({
    title: "REKAPITULASI PORTOFOLIO PROYEK",
    subtitle: "Laporan Otomatis Lintas Jenis Pekerjaan (Live DB)",
    codePill: "MASTER PORTOFOLIO",
    logoDataUrl,
    bodyHtml,
    footerNote: `Total ${input.summary.totalProjects} proyek`,
  });
}
