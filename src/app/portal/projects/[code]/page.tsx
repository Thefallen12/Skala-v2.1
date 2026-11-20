import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cloud,
  HardHat,
  MapPin,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { doesAssetMatchProject, parseAssetCode } from "@/lib/asset-codes";
import {
  buildProjectSCurveSeries,
  clampProjectProgress,
  toJakartaDateKey,
} from "@/lib/project-progress";
import { readProjectProgressPhoto } from "@/lib/project-progress-photos";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import { formatDailyEquipmentList } from "@/lib/project-reports";
import {
  formatWorkTypeBadge,
  formatWorkTypeLabel,
} from "@/lib/project-work-types";
import { decimalNumberFromScaledInteger } from "@/lib/scaled-decimal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal Progres Proyek | PT Skala Prioritas Engineering",
  robots: { index: false, follow: false },
};

function formatDateId(value: Date | string | null | undefined): string {
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

function formatDateTimeId(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatNumber(value: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: maxFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "RUNNING":
    case "ON_PROGRESS":
    case "ACTIVE":
      return "Sedang Berjalan";
    case "PENDING_SETUP":
    case "PENDING":
    case "PLANNED":
      return "Tahap Persiapan";
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

async function resolvePublicPhotoSrc(rawUrl: string): Promise<string | null> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

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
      return null;
    }
    return null;
  }

  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return null;
}

export default async function ProjectPortalPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const trimmedCode = decodeURIComponent(code).trim();
  if (!trimmedCode || trimmedCode.length > 128) {
    notFound();
  }

  // 1. Try finding a specific Progress Submission by portalCode first
  const submission = await prisma.projectProgressSubmission.findUnique({
    where: { portalCode: trimmedCode },
    select: {
      id: true,
      projectId: true,
      periodType: true,
      periodLabel: true,
      summary: true,
      actualProgress: true,
      plannedProgress: true,
      deviation: true,
      includeFinancials: true,
      portalCode: true,
      notes: true,
      submittedAt: true,
      submittedBy: { select: { name: true } },
    },
  });

  // 2. Load the associated Project (either from submission.projectId or directly by Project.code)
  const project = await prisma.project.findFirst({
    where: submission
      ? { id: submission.projectId, isDeleted: false }
      : { code: trimmedCode, isDeleted: false },
    select: {
      id: true,
      code: true,
      title: true,
      name: true,
      jenisPekerjaan: true,
      kelompokTani: true,
      clientName: true,
      address: true,
      location: true,
      status: true,
      progress: true,
      startDate: true,
      endDate: true,
      pagu: true,
      budget: true,
      fieldPic: { select: { name: true } },
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
          plannedStartDate: true,
          targetDate: true,
        },
      },
      dailyReports: {
        orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
        take: 60,
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
    notFound();
  }

  // Strictly hide RAB / financial numbers unless explicitly authorized by submission.includeFinancials === true
  const showFinancials = submission?.includeFinancials === true;
  let financialSnapshot: {
    pagu: number;
    realized: number;
    absorptionPct: number;
  } | null = null;

  if (showFinancials) {
    const realizationMap = await getPaidProjectTicketRealization([project.id]);
    const realized = realizationMap.get(project.id)?.total.toNumber() ?? 0;
    const pagu = decimalNumberFromScaledInteger(project.pagu);
    financialSnapshot = {
      pagu,
      realized,
      absorptionPct: pagu > 0 ? Math.round((realized / pagu) * 1000) / 10 : 0,
    };
  }

  const actualProgress = clampProjectProgress(project.progress);
  const chronologicalReports = [...project.dailyReports]
    .reverse()
    .flatMap((r) =>
      typeof r.progress === "number"
        ? [{ reportDate: r.reportDate, progress: r.progress }]
        : [],
    );
  const sCurve = buildProjectSCurveSeries({
    startDate: project.startDate,
    endDate: project.endDate,
    currentProgress: actualProgress,
    dailyReports: chronologicalReports,
  });

  const plannedToday =
    submission?.plannedProgress ?? sCurve.plannedToday ?? 0;
  const deviation =
    submission !== null
      ? submission.deviation
      : Math.round((actualProgress - plannedToday) * 10) / 10;

  const workTypeBadge = formatWorkTypeBadge(project.jenisPekerjaan);
  const recentReports = project.dailyReports.slice(0, 8);

  const recentPhotosRaw = project.dailyReports
    .flatMap((rep) =>
      rep.progressPhotos
        .filter((p) =>
          doesAssetMatchProject(
            {
              projectId: p.projectId,
              assetCode: p.assetCode,
              url: p.fileUrl ?? p.url,
            },
            {
              projectId: project.id,
              projectName: project.title || project.name || project.kelompokTani,
              projectCode: project.code,
            },
          ),
        )
        .map((p) => ({
          url: p.fileUrl ?? p.url,
          assetCode:
            p.assetCode ?? parseAssetCode(p.fileUrl ?? p.url)?.assetCode ?? null,
          reportDate: rep.reportDate,
        })),
    )
    .slice(0, 9);

  const resolvedPhotos = (
    await Promise.all(
      recentPhotosRaw.map(async (item, idx) => {
        const src = await resolvePublicPhotoSrc(item.url);
        if (!src) return null;
        return {
          key: `${idx}-${item.url}`,
          src,
          assetCode: item.assetCode,
          dateLabel: formatDateId(item.reportDate),
        };
      }),
    )
  ).filter(
    (
      p,
    ): p is {
      key: string;
      src: string;
      assetCode: string | null;
      dateLabel: string;
    } => p !== null,
  );

  // S-Curve SVG geometry
  const svgW = 760;
  const svgH = 230;
  const padL = 48;
  const padR = 24;
  const padT = 18;
  const padB = 34;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const allX = [...sCurve.planned.map((p) => p.x), ...sCurve.actual.map((p) => p.x)];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX, minX + 24 * 60 * 60 * 1000);
  const mapX = (x: number) =>
    padL + ((x - minX) / Math.max(1, maxX - minX)) * plotW;
  const mapY = (y: number) =>
    padT + ((100 - clampProjectProgress(y)) / 100) * plotH;

  const plannedPath = sCurve.planned
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
    .join(" ");
  const actualPath = sCurve.actual
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`)
    .join(" ");

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Official Branded Portal Header */}
      <header className="border-b border-slate-200 bg-[#10264a] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-white px-3.5 py-2 shadow-sm">
              <Image
                src="/images/logos/cop-surat.png"
                alt="PT Skala Prioritas Engineering"
                width={260}
                height={48}
                priority
                className="h-8 w-auto object-contain"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
                Portal Progres Klien &amp; Pemilik Proyek
              </p>
              <h1 className="text-base font-bold tracking-tight sm:text-lg">
                {project.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {formatStatusLabel(project.status)}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 font-mono text-xs text-slate-100">
              {project.code}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Progress Submission Packet Highlight (when opened via /portal/projects/[portalCode]) */}
        {submission && (
          <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600/10 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Paket Laporan Resmi · {submission.periodLabel}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed pt-1">
                  {submission.summary}
                </p>
                {submission.notes && (
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold">Catatan Pengirim:</span>{" "}
                    {submission.notes}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>
                  Dikirim oleh{" "}
                  <span className="font-semibold text-slate-800">
                    {submission.submittedBy.name}
                  </span>
                </p>
                <p>{formatDateTimeId(submission.submittedAt)}</p>
              </div>
            </div>
          </section>
        )}

        {/* Project Identity & KPI Summary */}
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {workTypeBadge.groupShortLabel} · {formatWorkTypeLabel(project.jenisPekerjaan)}
                </span>
                <h2 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900">
                  {project.title}
                </h2>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <Users className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-slate-500">Klien / Penerima Manfaat</dt>
                  <dd className="font-semibold text-slate-900">
                    {project.clientName || project.kelompokTani}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <HardHat className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-slate-500">Penanggung Jawab Lapangan</dt>
                  <dd className="font-semibold text-slate-900">
                    {project.fieldPic?.name || "Tim PT Skala Prioritas"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-slate-500">Lokasi Pekerjaan</dt>
                  <dd className="font-medium text-slate-800">
                    {project.location || project.address}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-slate-500">Periode Kontrak</dt>
                  <dd className="font-medium text-slate-800">
                    {formatDateId(project.startDate)} — {formatDateId(project.endDate)}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs">
            <div className="col-span-2 rounded-xl bg-teal-50/70 p-3.5 border border-teal-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                  Progres Aktual
                </span>
                <TrendingUp className="size-4 text-teal-700" aria-hidden="true" />
              </div>
              <p className="mt-1 text-3xl font-extrabold text-teal-900 tabular-nums">
                {formatNumber(actualProgress, 1)}%
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-teal-200/70">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${actualProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-[11px] font-semibold uppercase text-slate-500">
                Rencana Kurva-S
              </span>
              <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                {formatNumber(plannedToday, 1)}%
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-[11px] font-semibold uppercase text-slate-500">
                Deviasi
              </span>
              <p
                className={`mt-1 text-lg font-bold tabular-nums ${
                  deviation < -5
                    ? "text-rose-600"
                    : deviation >= 0
                      ? "text-emerald-600"
                      : "text-amber-600"
                }`}
              >
                {deviation >= 0 ? "+" : ""}
                {formatNumber(deviation, 1)}%
              </p>
            </div>

            {financialSnapshot && (
              <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Nilai Pagu Kontrak</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatIdr(financialSnapshot.pagu)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-slate-600">
                  <span>Realisasi Terserap ({financialSnapshot.absorptionPct}%)</span>
                  <span className="font-mono font-bold text-teal-800">
                    {formatIdr(financialSnapshot.realized)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Live S-Curve Visualization */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Kurva-S Progres Pelaksanaan (Live)
              </h2>
              <p className="text-xs text-slate-500">
                Garis hijau solid menunjukkan capaian aktual; garis putus-putus menunjukkan target rencana.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {project.dailyReports.length} laporan harian tercatat
            </span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-56 w-full overflow-visible">
              {[0, 25, 50, 75, 100].map((pct) => {
                const y = mapY(pct);
                return (
                  <g key={pct}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={svgW - padR}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="#64748b"
                      fontFamily="monospace"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const tickMs = Math.round(minX + (maxX - minX) * frac);
                const x = mapX(tickMs);
                const anchor = frac === 0 ? "start" : frac === 1 ? "end" : "middle";
                return (
                  <text
                    key={frac}
                    x={x}
                    y={svgH - 8}
                    textAnchor={anchor}
                    fontSize="10"
                    fill="#64748b"
                  >
                    {formatDateId(new Date(tickMs))}
                  </text>
                );
              })}

              <path
                d={plannedPath}
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeDasharray="6,4"
              />
              <path
                d={actualPath}
                fill="none"
                stroke="#0d9488"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {sCurve.actual.map((pt, idx) => (
                <circle
                  key={`${pt.x}-${idx}`}
                  cx={mapX(pt.x)}
                  cy={mapY(pt.y)}
                  r="3.5"
                  fill="#0d9488"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              ))}
            </svg>
          </div>
        </section>

        {/* Physical WBS / Deliverable Progress + Milestones */}
        <section className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardCheck className="size-4 text-teal-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Rincian Item Pekerjaan &amp; Progres Fisik
              </h2>
            </div>

            {project.workPoints.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Progres proyek dipantau secara kumulatif ({formatNumber(actualProgress, 1)}%).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Item / Deliverable</th>
                      <th className="py-2 px-2 text-right font-semibold">Target</th>
                      <th className="py-2 px-2 text-right font-semibold">Realisasi</th>
                      <th className="py-2 pl-2 text-right font-semibold">Progres</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {project.workPoints.map((wp) => {
                      const target = wp.proposedVolume
                        ? decimalNumberFromScaledInteger(wp.proposedVolume)
                        : 0;
                      const unit = wp.proposedUnit || "paket";
                      const completed = wp.completedVolume ?? 0;
                      return (
                        <tr key={wp.id}>
                          <td className="py-2.5 pr-3">
                            <p className="font-semibold text-slate-900">{wp.title}</p>
                            {wp.location && (
                              <p className="text-xs text-slate-500">{wp.location}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                            {target > 0 ? `${formatNumber(target, 2)} ${unit}` : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-700">
                            {target > 0 ? `${formatNumber(completed, 2)} ${unit}` : "—"}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 font-mono text-xs font-bold text-teal-800">
                              {formatNumber(wp.progress, 1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="size-4 text-amber-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Milestone Jadwal
              </h2>
            </div>

            {project.calendarEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                Belum ada milestone khusus yang dicatat.
              </p>
            ) : (
              <ol className="space-y-3">
                {project.calendarEvents.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{m.title}</span>
                    <span className="shrink-0 font-mono text-slate-500">
                      {formatDateId(m.startsAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* Recent Daily Reports */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs">
          <h2 className="mb-3 text-base font-bold text-slate-900">
            Riwayat Laporan Harian Terbaru
          </h2>
          {recentReports.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Belum ada laporan harian yang dipublikasikan.
            </p>
          ) : (
            <div className="space-y-3">
              {recentReports.map((rep) => {
                const equip = formatDailyEquipmentList(rep.equipment);
                return (
                  <article
                    key={rep.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono font-semibold text-white">
                          {toJakartaDateKey(rep.reportDate) ?? formatDateId(rep.reportDate)}
                        </span>
                        {rep.weather && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-slate-700 border border-slate-200">
                            <Cloud className="size-3 text-sky-600" aria-hidden="true" />
                            {rep.weather}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-slate-700 border border-slate-200">
                          <Users className="size-3 text-slate-500" aria-hidden="true" />
                          {rep.workersCount} personel
                        </span>
                        {equip.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-slate-700 border border-slate-200">
                            <Wrench className="size-3 text-amber-600" aria-hidden="true" />
                            {equip.join(", ")}
                          </span>
                        )}
                      </div>
                      {rep.progress !== null && (
                        <span className="font-mono text-xs font-bold text-teal-700">
                          Progres: {formatNumber(rep.progress, 1)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-800">
                      {rep.workSummary || "Tidak ada ringkasan tertulis."}
                    </p>
                    {rep.notes && (
                      <p className="mt-1.5 text-xs text-amber-800">
                        <span className="font-semibold">Catatan/Kendala:</span>{" "}
                        {rep.notes}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Field Photo Gallery */}
        {resolvedPhotos.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs">
            <h2 className="mb-3 text-base font-bold text-slate-900">
              Dokumentasi Foto Lapangan ({resolvedPhotos.length})
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
              {resolvedPhotos.map((photo) => (
                <figure
                  key={photo.key}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    alt={`Dokumentasi lapangan ${photo.dateLabel}`}
                    className="h-48 w-full object-cover"
                  />
                  <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-600">
                    <span>Dokumentasi · {photo.dateLabel}</span>
                    {photo.assetCode && (
                      <span className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-800">
                        {photo.assetCode}
                      </span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          PT Skala Prioritas Engineering · Portal Pemantauan Progres Resmi
        </footer>
      </div>
    </main>
  );
}
